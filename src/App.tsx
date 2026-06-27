import { useState } from "react";
import { Lobby } from "./components/Lobby";
import { Hud } from "./components/Hud";
import { SnakeHud } from "./components/SnakeHud";
import { RaceHud } from "./components/RaceHud";
import { GameCanvas } from "./game/GameCanvas";
import { SnakeCanvas } from "./game/SnakeCanvas";
import { RaceCanvas } from "./game/RaceCanvas";
import { useSocket } from "./hooks/useSocket";
import { isTouchDevice } from "./utils/touchDevice";

export default function App() {
  const {
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
    setSoloBotCount,
    setRaceSettings,
    setShooterSettings,
    setShooterBotSettings,
    startGame,
    backToLobby,
    restartRound,
    closeRoom,
    leaveRoom,
    sendInput,
    sendRacePosition,
  } = useSocket();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const showLobby =
    roomState?.phase === "lobby" || roomState?.phase === "finished";
  const inMatch = roomState?.phase === "playing";
  const activeGame = roomState?.playingGameId ?? roomState?.world?.gameId ?? "shooter";
  const isHost = roomState?.hostId === roomState?.youId;

  const handleCreate = () => {
    const trimmed = createName.trim();
    if (!trimmed) return;
    createRoom(trimmed);
    setShowCreateModal(false);
    setCreateName("");
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Shooter Snipes</h1>
        <div className="app-header-actions">
          {roomState && inMatch && isHost && (
            <>
              <button type="button" className="btn-restart-round" onClick={restartRound}>
                Restart Round
              </button>
              <button type="button" className="btn-lobby-return" onClick={backToLobby}>
                Back to Lobby
              </button>
            </>
          )}
          {roomState && (
            <button type="button" className="btn-leave" onClick={leaveRoom}>
              Leave Room
            </button>
          )}
          <span className={`status-badge ${connected ? "online" : ""}`}>
            {connected ? "● Online" : "○ Connecting…"}
          </span>
        </div>
      </header>

      {!connected && (
        <div className="connect-overlay">
          <p>{roomState ? "Reconnecting…" : "Connecting…"}</p>
        </div>
      )}

      {error && <div className="toast">{error}</div>}

      {!roomState && (
        <div className="lobby home-lobby">
          {roomClosed && (
            <p className="hint hint--danger">{roomClosed}</p>
          )}

          <div className="lobby-card home-create-card">
            <h2>Host a match</h2>
            <p className="home-card-desc">Create a room and share the code with friends.</p>
            <button
              type="button"
              className="btn btn-primary home-create-btn"
              disabled={!connected}
              onClick={() => setShowCreateModal(true)}
            >
              Create Room
            </button>
          </div>

          <div className="lobby-card">
            <h2>Join a match</h2>
            <div className="field">
              <label htmlFor="join-name">Your name</label>
              <input
                id="join-name"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                placeholder="Operator"
                maxLength={20}
                autoComplete="nickname"
              />
            </div>
            <div className="field">
              <label htmlFor="join-code">Room code</label>
              <input
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!joinName.trim() || joinCode.length < 4 || !connected}
              onClick={() => joinRoom(joinCode.trim(), joinName.trim())}
              style={{ width: "100%" }}
            >
              Join Room
            </button>
          </div>

          <p className="hint">
            Create a room, pick a game, and play with up to 6 friends — or enable Practice vs AI when alone
            {isTouchDevice() && " · Mobile: left stick or WASD to move"}
          </p>
        </div>
      )}

      {showCreateModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowCreateModal(false)}
          role="presentation"
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="create-modal-title"
          >
            <h2 id="create-modal-title">Create Room</h2>
            <p className="modal-desc">Pick a name to show in the lobby.</p>
            <div className="field">
              <label htmlFor="create-name">Your name</label>
              <input
                id="create-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Operator"
                maxLength={20}
                autoComplete="nickname"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!createName.trim() || !connected}
                onClick={handleCreate}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {roomState && showLobby && (
        <Lobby
          roomState={roomState}
          onSelectTeam={selectTeam}
          onSelectGame={selectGame}
          onSetGamePickMode={setGamePickMode}
          onVoteGame={voteGame}
          onSetSoloMode={setSoloMode}
          onSetSoloBotCount={setSoloBotCount}
          onSetRaceSettings={setRaceSettings}
          onSetShooterSettings={setShooterSettings}
          onSetShooterBotSettings={setShooterBotSettings}
          onStart={startGame}
          onBackToLobby={backToLobby}
          onRestartRound={restartRound}
          onCloseRoom={closeRoom}
          onLeaveRoom={leaveRoom}
        />
      )}

      {roomState && inMatch && (
        <div className="game-shell">
          <div className="game-canvas-wrap">
            {activeGame === "snake" ? (
              <>
                <SnakeCanvas roomState={roomState} onInput={sendInput} />
                <SnakeHud roomState={roomState} />
              </>
            ) : activeGame === "race" ? (
              <>
                <RaceCanvas
                  roomState={roomState}
                  onInput={sendInput}
                  onPosition={sendRacePosition}
                />
                <RaceHud roomState={roomState} />
              </>
            ) : (
              <>
                <GameCanvas roomState={roomState} onInput={sendInput} />
                <Hud roomState={roomState} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
