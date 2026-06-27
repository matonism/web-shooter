import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  GameId,
  GamePickMode,
  RejoinSession,
  RoomStatePublic,
  ServerToClientEvents,
} from "@shared/types";

const REJOIN_KEY = "shooterSnipesRejoin";

const socketUrl = import.meta.env.PROD
  ? window.location.origin
  : (import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3001");

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnectionDelay: 400,
      reconnectionDelayMax: 2500,
      timeout: 8000,
    });
  }
  return socket;
}

function loadRejoin(): RejoinSession | null {
  try {
    const raw = localStorage.getItem(REJOIN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RejoinSession;
  } catch {
    return null;
  }
}

function saveRejoin(code: string, token: string) {
  localStorage.setItem(REJOIN_KEY, JSON.stringify({ code, token }));
}

function clearRejoin() {
  localStorage.removeItem(REJOIN_KEY);
}

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomStatePublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roomClosed, setRoomClosed] = useState<string | null>(null);

  useEffect(() => {
    const s = getSocket();

    const onConnect = () => {
      setConnected(true);
      const rejoin = loadRejoin();
      if (rejoin) s.emit("rejoinRoom", rejoin);
    };

    const onDisconnect = () => setConnected(false);

    const onState = (state: RoomStatePublic) => {
      setRoomState(state);
      setRoomClosed(null);
      if (state.yourToken) {
        saveRejoin(state.code, state.yourToken);
      }
    };

    const onError = (msg: string) => {
      if (msg.startsWith("Could not rejoin")) clearRejoin();
      setError(msg);
      setTimeout(() => setError(null), 4000);
    };

    const onClosed = (reason: string) => {
      clearRejoin();
      setRoomState(null);
      setRoomClosed(reason);
    };

    const onLeft = () => {
      clearRejoin();
      setRoomState(null);
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("state", onState);
    s.on("errorMsg", onError);
    s.on("roomClosed", onClosed);
    s.on("leftRoom", onLeft);

    if (s.connected) onConnect();

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("state", onState);
      s.off("errorMsg", onError);
      s.off("roomClosed", onClosed);
      s.off("leftRoom", onLeft);
    };
  }, []);

  const createRoom = (name: string) => {
    clearRejoin();
    getSocket().emit("createRoom", { name });
  };

  const joinRoom = (code: string, name: string) => {
    clearRejoin();
    getSocket().emit("joinRoom", { code, name });
  };

  const selectTeam = (team: "red" | "blue") => {
    getSocket().emit("selectTeam", { team });
  };

  const selectGame = (gameId: GameId) => {
    getSocket().emit("selectGame", { gameId });
  };

  const setGamePickMode = (mode: GamePickMode) => {
    getSocket().emit("setGamePickMode", { mode });
  };

  const voteGame = (gameId: GameId) => {
    getSocket().emit("voteGame", { gameId });
  };

  const setSoloMode = (enabled: boolean) => {
    getSocket().emit("setSoloMode", { enabled });
  };

  const startGame = () => getSocket().emit("startGame");
  const backToLobby = () => getSocket().emit("backToLobby");
  const closeRoom = () => getSocket().emit("closeRoom");
  const leaveRoom = () => {
    clearRejoin();
    setRoomState(null);
    getSocket().emit("leaveRoom");
  };
  const sendInput = (input: Parameters<ClientToServerEvents["input"]>[0]) => {
    getSocket().emit("input", input);
  };

  return {
    connected,
    roomState,
    error,
    roomClosed,
    createRoom,
    joinRoom,
    selectTeam,
    selectGame,
    setGamePickMode,
    voteGame,
    setSoloMode,
    startGame,
    backToLobby,
    closeRoom,
    leaveRoom,
    sendInput,
  };
}
