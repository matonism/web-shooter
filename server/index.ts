import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server, type Socket } from "socket.io";
import { MAX_PLAYERS, MAX_PER_TEAM, TICK_MS } from "../shared/constants.ts";
import type {
  ClientToServerEvents,
  GamePhase,
  LobbyPlayer,
  RoomStatePublic,
  ServerToClientEvents,
  Team,
} from "../shared/types.ts";
import { GameSimulation } from "./gameSimulation.ts";

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
  phase: GamePhase;
  players: Map<string, InternalPlayer>;
  simulation: GameSimulation;
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
    winner: room.simulation.winner,
    youId,
    yourToken: you?.token ?? "",
  };
  if (room.phase === "playing" || room.phase === "finished") {
    state.world = room.simulation.snapshot();
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
    if (room.phase !== "playing") return;
    room.simulation.step();
    if (room.simulation.winner) {
      room.phase = "finished";
      if (room.gameLoop) {
        clearInterval(room.gameLoop);
        room.gameLoop = undefined;
      }
    }
    broadcastRoom(room);
  }, TICK_MS);
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
    player.id = socket.id;
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      delete player.disconnectTimer;
    }
    if (oldId !== socket.id) {
      room.simulation.remapPlayerId(oldId, socket.id);
    }
  } else {
    room.simulation.addPlayer(socket.id, player.name);
  }

  room.players.set(socket.id, player);
  socketRoom.set(socket.id, room.code);
  socket.join(room.code);
  room.simulation.setConnected(socket.id, true);
  touchRoom(room);
  return player;
}

function schedulePlayerDisconnect(room: Room, playerId: string) {
  const p = room.players.get(playerId);
  if (!p || p.disconnectTimer) return;
  room.simulation.setConnected(playerId, false);
  p.disconnectTimer = setTimeout(() => {
    const r = getRoom(room.code);
    if (!r) return;
    r.players.delete(playerId);
    r.simulation.removePlayer(playerId);
    socketRoom.delete(playerId);
    if (r.players.size === 0) {
      destroyRoom(r.code, "All players left.");
    } else {
      if (r.hostId === playerId) {
        const next = r.players.keys().next().value;
        if (next) r.hostId = next;
      }
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
      phase: "lobby",
      players: new Map(),
      simulation: new GameSimulation(),
      lastActivityAt: Date.now(),
    };
    rooms.set(code, room);
    addPlayerToRoom(room, socket, name);
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
    if (room.players.size >= MAX_PLAYERS) {
      socket.emit("errorMsg", "Room is full (6 players max).");
      return;
    }
    addPlayerToRoom(room, socket, name);
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
    if (!room.simulation.assignTeam(socket.id, team)) {
      socket.emit("errorMsg", `${team} team is full.`);
      return;
    }
    p.team = team;
    touchRoom(room);
    broadcastRoom(room);
  });

  socket.on("startGame", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== "lobby") return;
    if (!room.simulation.canStart()) {
      socket.emit("errorMsg", "Need at least 2 players on different teams.");
      return;
    }
    room.phase = "playing";
    room.simulation.reset();
    for (const [id, p] of room.players) {
      if (p.team) room.simulation.assignTeam(id, p.team);
    }
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
    room.simulation = new GameSimulation();
    for (const [id, p] of room.players) {
      room.simulation.addPlayer(id, p.name);
      if (p.team) {
        room.simulation.assignTeam(id, p.team);
        p.team = p.team;
      }
    }
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

  socket.on("input", (payload) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.phase !== "playing") return;
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
  console.log(`Neon Blasters server on :${PORT} (${isProd ? "prod" : "dev"})`);
});
