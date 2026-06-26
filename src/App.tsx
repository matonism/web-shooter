import { useState } from "react";
import { Lobby } from "./components/Lobby";
import { Hud } from "./components/Hud";
import { GameCanvas } from "./game/GameCanvas";
import { useSocket } from "./hooks/useSocket";

export default function App() {
  const {
    connected,
    roomState,
    error,
    roomClosed,
    createRoom,
    joinRoom,
    selectTeam,
    startGame,
    backToLobby,
    closeRoom,
    sendInput,
  } = useSocket();

  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const inGame = roomState?.phase === "playing";

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Neon Blasters</h1>
        <span className={`status-badge ${connected ? "online" : ""}`}>
          {connected ? "● Online" : "○ Connecting…"}
        </span>
      </header>

      {!connected && (
        <div className="connect-overlay">
          <p>{roomState ? "Reconnecting…" : "Connecting…"}</p>
        </div>
      )}

      {error && <div className="toast">{error}</div>}

      {!roomState && (
        <div className="lobby">
          {roomClosed && (
            <p className="hint" style={{ color: "var(--danger)" }}>
              {roomClosed}
            </p>
          )}
          <div className="lobby-card">
            <h2>Play</h2>
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Operator"
                maxLength={20}
              />
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!name.trim() || !connected}
                onClick={() => createRoom(name.trim())}
              >
                Create Room
              </button>
            </div>
          </div>

          <div className="lobby-card">
            <h2>Join</h2>
            <div className="field">
              <label htmlFor="code">Room code</label>
              <input
                id="code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!name.trim() || joinCode.length < 4 || !connected}
              onClick={() => joinRoom(joinCode.trim(), name.trim())}
              style={{ width: "100%" }}
            >
              Join Room
            </button>
          </div>

          <p className="hint">WASD move · Mouse aim · Click to fire · Up to 6 players</p>
        </div>
      )}

      {roomState && !inGame && (
        <Lobby
          roomState={roomState}
          onSelectTeam={selectTeam}
          onStart={startGame}
          onBackToLobby={backToLobby}
          onCloseRoom={closeRoom}
        />
      )}

      {roomState && inGame && (
        <div className="game-shell">
          <div className="game-canvas-wrap">
            <GameCanvas roomState={roomState} onInput={sendInput} />
            <Hud roomState={roomState} />
          </div>
        </div>
      )}
    </div>
  );
}
