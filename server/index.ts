import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server, type Socket } from "socket.io";
import { MAX_PER_TEAM, MAX_PLAYERS, TICK_MS } from "../shared/constants.ts";
import type { GameId } from "../shared/games.ts";
import type {
  ClientToServerEvents,
  GamePhase,
  GamePickMode,
  LobbyPlayer,
  RoomStatePublic,
  ServerToClientEvents,
  Team,
} from "../shared/types.ts";
import { createSimulation } from "./createSimulation.ts";
import {
  canStartRoom,
  gameVotesRecord,
  previewGameId,
  resolveGameId,
} from "./gamePick.ts";
import { addSoloBots } from "./soloBots.ts";
import type { RoomSimulation } from "./roomSimulation.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 3001;

const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const DISCONNECT_GRACE_MS = 30 * 60 * 1000;
const ROOM_IDLE_DESTROY_MS = 10 * 60 * 1000;

function randomCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!;
  }
  return s;
}

interface InternalPlayer {
  id: string;
  name: string;
  team: Team | null;
  token: string;
  disconnectTimer?: ReturnType<typeof setTimeout>;
}

interface Room {
  code: string;
  hostId: string;
  hostToken: string;
  phase: GamePhase;
  players: Map<string, InternalPlayer>;
  selectedGameId: GameId;
  gamePickMode: GamePickMode;
  gameVotes: Map<string, GameId>;
  soloMode: boolean;
  playingGameId: GameId | null;
  simulation: RoomSimulation | null;
  gameLoop?: ReturnType<typeof setInterval>;
  lastActivityAt: number;
  idleDestroyTimer?: ReturnType<typeof setTimeout>;
}

const rooms = new Map<string, Room>();
const socketRoom = new Map<string, string>();

function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

function touchRoom(room: Room) {
  room.lastActivityAt = Date.now();
  if (room.idleDestroyTimer) clearTimeout(room.idleDestroyTimer);
  room.idleDestroyTimer = setTimeout(() => {
    if (Date.now() - room.lastActivityAt >= ROOM_IDLE_DESTROY_MS) {
      destroyRoom(room.code, "Room closed due to inactivity.");
    }
  }, ROOM_IDLE_DESTROY_MS);
}

function pickNextHost(room: Room, excludeId?: string): string | undefined {
  for (const [id, p] of room.players) {
    if (id !== excludeId && !p.disconnectTimer) return id;
  }
  for (const [id] of room.players) {
    if (id !== excludeId) return id;
  }
  return undefined;
}

function transferHost(room: Room, excludeId?: string) {
  const next = pickNextHost(room, excludeId);
  if (!next) return;
  room.hostId = next;
  room.hostToken = room.players.get(next)!.token;
}

function removePlayerNow(room: Room, playerId: string) {
  const p = room.players.get(playerId);
  if (!p) return;
  if (p.disconnectTimer) {
    clearTimeout(p.disconnectTimer);
    delete p.disconnectTimer;
  }
  const wasHost = room.hostId === playerId;
  room.players.delete(playerId);
  room.gameVotes.delete(playerId);
  room.simulation?.removePlayer(playerId);
  socketRoom.delete(playerId);
  if (wasHost) transferHost(room, playerId);
}

function lobbyPlayers(room: Room): LobbyPlayer[] {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    connected: !p.disconnectTimer,
  }));
}

function publicState(room: Room, youId: string): RoomStatePublic {
  const you = room.players.get(youId);
  const state: RoomStatePublic = {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    players: lobbyPlayers(room),
    maxPlayers: MAX_PLAYERS,
    maxPerTeam: MAX_PER_TEAM,
    matchWinner: room.simulation?.matchWinner ?? null,
    selectedGameId: room.selectedGameId,
    gamePickMode: room.gamePickMode,
    gameVotes: gameVotesRecord(room.gameVotes),
    soloMode: room.soloMode,
    playingGameId: room.playingGameId,
    youId,
    yourToken: you?.token ?? "",
  };
  if (room.phase === "playing" || room.phase === "finished") {
    state.world = room.simulation?.snapshot();
  }
  return state;
}

function broadcastRoom(room: Room) {
  for (const [socketId] of room.players) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock) sock.emit("state", publicState(room, socketId));
  }
}

function destroyRoom(code: string, reason: string) {
  const room = getRoom(code);
  if (!room) return;
  if (room.gameLoop) clearInterval(room.gameLoop);
  if (room.idleDestroyTimer) clearTimeout(room.idleDestroyTimer);
  for (const p of room.players.values()) {
    if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
  }
  rooms.delete(code.toUpperCase());
  for (const [sid, c] of socketRoom) {
    if (c === code.toUpperCase()) socketRoom.delete(sid);
  }
  io.to(code.toUpperCase()).emit("roomClosed", reason);
}

function startGameLoop(room: Room) {
  if (room.gameLoop) clearInterval(room.gameLoop);
  room.gameLoop = setInterval(() => {
    if (room.phase !== "playing" || !room.simulation) return;
    room.simulation.step();
    if (room.simulation.matchWinner) {
      room.phase = "finished";
      if (room.gameLoop) {
        clearInterval(room.gameLoop);
        room.gameLoop = undefined;
      }
    }
    broadcastRoom(room);
  }, TICK_MS);
}

function bootstrapSimulation(room: Room, gameId: GameId) {
  room.playingGameId = gameId;
  room.simulation = createSimulation(gameId);
  for (const [id, p] of room.players) {
    room.simulation.addPlayer(id, p.name);
    if (p.team) room.simulation.assignTeam(id, p.team);
  }
  if (room.soloMode) {
    addSoloBots(
      room.simulation,
      gameId,
      [...room.players.values()].map((p) => ({ team: p.team })),
    );
  }
  room.simulation.reset();
}

function addPlayerToRoom(
  room: Room,
  socket: Socket,
  name: string,
  existing?: InternalPlayer,
): InternalPlayer {
  const player: InternalPlayer = existing ?? {
    id: socket.id,
    name: name.trim().slice(0, 20) || "Player",
    team: null,
    token: randomUUID(),
  };

  if (existing) {
    const oldId = existing.id;
    room.players.delete(oldId);
    room.gameVotes.delete(oldId);
    player.id = socket.id;
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      delete player.disconnectTimer;
    }
    if (oldId !== socket.id) {
      room.simulation?.remapPlayerId(oldId, socket.id);
      const vote = room.gameVotes.get(oldId);
      if (vote) {
        room.gameVotes.delete(oldId);
        room.gameVotes.set(socket.id, vote);
      }
    }
  }

  room.players.set(socket.id, player);
  socketRoom.set(socket.id, room.code);
  socket.join(room.code);
  room.simulation?.setConnected(socket.id, true);

  if (existing && existing.token === room.hostToken) {
    room.hostId = socket.id;
  }

  touchRoom(room);
  return player;
}

function schedulePlayerDisconnect(room: Room, playerId: string) {
  const p = room.players.get(playerId);
  if (!p || p.disconnectTimer) return;
  room.simulation?.setConnected(playerId, false);

  if (room.hostId === playerId) {
    transferHost(room, playerId);
  }

  p.disconnectTimer = setTimeout(() => {
    const r = getRoom(room.code);
    if (!r) return;
    removePlayerNow(r, playerId);
    if (r.players.size === 0) {
      destroyRoom(r.code, "All players left.");
    } else {
      broadcastRoom(r);
    }
  }, DISCONNECT_GRACE_MS);
}

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: isProd
    ? undefined
    : {
        origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
        methods: ["GET", "POST"],
      },
});

if (isProd) {
  const distPath = path.join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    let code = randomCode();
    while (rooms.has(code)) code = randomCode();

    const room: Room = {
      code,
      hostId: socket.id,
      hostToken: "",
      phase: "lobby",
      players: new Map(),
      selectedGameId: "shooter",
      gamePickMode: "host",
      gameVotes: new Map(),
      soloMode: false,
      playingGameId: null,
      simulation: null,
      lastActivityAt: Date.now(),
    };
    rooms.set(code, room);
    const player = addPlayerToRoom(room, socket, name);
    room.hostToken = player.token;
    broadcastRoom(room);
  });

  socket.on("joinRoom", ({ code, name }) => {
    const room = getRoom(code);
    if (!room) {
      socket.emit("errorMsg", "Room not found.");
      return;
    }
    if (room.phase !== "lobby") {
      socket.emit("errorMsg", "Game already in progress.");
      return;
    }
    if (room.soloMode) {
      socket.emit("errorMsg", "Solo practice room — cannot join.");
      return;
    }
    if (room.players.size >= MAX_PLAYERS) {
      socket.emit("errorMsg", "Room is full (6 players max).");
      return;
    }
    addPlayerToRoom(room, socket, name);
    if (room.players.size > 1) room.soloMode = false;
    broadcastRoom(room);
  });

  socket.on("rejoinRoom", ({ code, token }) => {
    const room = getRoom(code);
    if (!room) {
      socket.emit("errorMsg", "Could not rejoin — room not found.");
      return;
    }
    let existing: InternalPlayer | undefined;
    for (const p of room.players.values()) {
      if (p.token === token) {
        existing = p;
        break;
      }
    }
    if (!existing) {
      socket.emit("errorMsg", "Could not rejoin — session expired.");
      return;
    }
    addPlayerToRoom(room, socket, existing.name, existing);
    broadcastRoom(room);
  });

  socket.on("selectTeam", ({ team }) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.phase !== "lobby") return;
    const p = room.players.get(socket.id);
    if (!p) return;

    const preview = previewGameId(room) ?? room.selectedGameId;
    if (preview === "snake") {
      socket.emit("errorMsg", "Team pick is only for Arena Shooter.");
      return;
    }

    const onOtherTeam = [...room.players.values()].filter(
      (pl) => pl.team === team && pl.id !== socket.id,
    ).length;
    if (onOtherTeam >= MAX_PER_TEAM) {
      socket.emit("errorMsg", `${team} team is full.`);
      return;
    }
    p.team = team;
    touchRoom(room);
    broadcastRoom(room);
  });

  socket.on("selectGame", ({ gameId }) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.hostId !== socket.id || room.phase !== "lobby") return;
    if (room.gamePickMode !== "host") return;
    room.selectedGameId = gameId;
    touchRoom(room);
    broadcastRoom(room);
  });

  socket.on("setGamePickMode", ({ mode }) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.hostId !== socket.id || room.phase !== "lobby") return;
    room.gamePickMode = mode;
    touchRoom(room);
    broadcastRoom(room);
  });

  socket.on("voteGame", ({ gameId }) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.phase !== "lobby") return;
    if (room.gamePickMode !== "vote") return;
    room.gameVotes.set(socket.id, gameId);
    touchRoom(room);
    broadcastRoom(room);
  });

  socket.on("setSoloMode", ({ enabled }) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.hostId !== socket.id || room.phase !== "lobby") return;
    if (enabled && room.players.size > 1) {
      socket.emit("errorMsg", "Solo mode is only available when you are alone in the room.");
      return;
    }
    room.soloMode = enabled;
    touchRoom(room);
    broadcastRoom(room);
  });

  socket.on("startGame", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== "lobby") return;

    const lobby = lobbyPlayers(room);
    if (!canStartRoom(room, lobby)) {
      socket.emit("errorMsg", "Not enough players (or teams) to start.");
      return;
    }

    const gameId = resolveGameId(room);

    if (room.soloMode && gameId === "shooter") {
      const host = room.players.get(room.hostId);
      if (host && !host.team) host.team = "red";
    }

    if (!room.soloMode) {
      const sim = createSimulation(gameId);
      if (!sim.canStart(lobby)) {
        socket.emit("errorMsg", "Not enough players (or teams) to start.");
        return;
      }
    } else if (gameId === "shooter") {
      const host = room.players.get(room.hostId);
      if (host && !host.team) {
        socket.emit("errorMsg", "Pick a team before starting solo Arena Shooter.");
        return;
      }
    }

    room.phase = "playing";
    bootstrapSimulation(room, gameId);
    startGameLoop(room);
    touchRoom(room);
    broadcastRoom(room);
  });

  socket.on("backToLobby", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.hostId !== socket.id) return;
    if (room.gameLoop) {
      clearInterval(room.gameLoop);
      room.gameLoop = undefined;
    }
    room.phase = "lobby";
    room.playingGameId = null;
    room.simulation = null;
    room.soloMode = false;
    touchRoom(room);
    broadcastRoom(room);
  });

  socket.on("closeRoom", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.hostId !== socket.id) return;
    destroyRoom(code, "Host closed the room.");
  });

  socket.on("leaveRoom", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;

    removePlayerNow(room, socket.id);
    socket.leave(room.code);

    if (room.players.size === 0) {
      destroyRoom(code, "All players left.");
    } else {
      touchRoom(room);
      broadcastRoom(room);
    }

    socket.emit("leftRoom");
  });

  socket.on("input", (payload) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.phase !== "playing" || !room.simulation) return;
    room.simulation.queueInput(socket.id, payload);
    touchRoom(room);
  });

  socket.on("disconnect", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;
    schedulePlayerDisconnect(room, socket.id);
    broadcastRoom(room);
  });
});

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the other process (e.g. a previous npm start) or set PORT to a different value.`,
    );
    process.exit(1);
  }
  throw err;
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Shooter Snipes server on :${PORT} (${isProd ? "prod" : "dev"})`);
});
