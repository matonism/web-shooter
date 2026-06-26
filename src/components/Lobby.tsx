import { teamSize } from "@shared/constants";
import type { RoomStatePublic, Team } from "@shared/types";

interface LobbyProps {
  roomState: RoomStatePublic;
  onSelectTeam: (team: Team) => void;
  onStart: () => void;
  onBackToLobby: () => void;
  onCloseRoom: () => void;
}

export function Lobby({
  roomState,
  onSelectTeam,
  onStart,
  onBackToLobby,
  onCloseRoom,
}: LobbyProps) {
  const isHost = roomState.hostId === roomState.youId;
  const me = roomState.players.find((p) => p.id === roomState.youId);
  const redCount = teamSize(roomState.players, "red");
  const blueCount = teamSize(roomState.players, "blue");
  const canStart =
    roomState.players.filter((p) => p.team).length >= 2 &&
    redCount >= 1 &&
    blueCount >= 1;

  if (roomState.phase === "finished") {
    const winner = roomState.winner;
    return (
      <div className="lobby">
        <div className="lobby-card overlay-card">
          <h2>Match Over</h2>
          <p className={winner === "red" ? "winner-red" : "winner-blue"}>
            {winner?.toUpperCase()} TEAM WINS
          </p>
          {isHost ? (
            <button type="button" className="btn btn-primary" onClick={onBackToLobby}>
              Back to Lobby
            </button>
          ) : (
            <p className="hint">Waiting for host…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h2>Room {roomState.code}</h2>
        <p className="room-code">{roomState.code}</p>

        <ul className="player-list">
          {roomState.players.map((p) => (
            <li key={p.id}>
              <span>
                {p.name}
                {p.id === roomState.hostId ? " ★" : ""}
                {!p.connected ? " (away)" : ""}
              </span>
              <span
                className={`team-badge ${p.team ?? "none"}`}
              >
                {p.team ?? "—"}
              </span>
            </li>
          ))}
        </ul>

        <div className="team-picker">
          <button
            type="button"
            className={`team-btn red ${me?.team === "red" ? "selected" : ""}`}
            onClick={() => onSelectTeam("red")}
            disabled={redCount >= roomState.maxPerTeam && me?.team !== "red"}
          >
            Red ({redCount}/{roomState.maxPerTeam})
          </button>
          <button
            type="button"
            className={`team-btn blue ${me?.team === "blue" ? "selected" : ""}`}
            onClick={() => onSelectTeam("blue")}
            disabled={blueCount >= roomState.maxPerTeam && me?.team !== "blue"}
          >
            Blue ({blueCount}/{roomState.maxPerTeam})
          </button>
        </div>

        {isHost ? (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onStart}
              disabled={!canStart}
            >
              Start Match
            </button>
            <button type="button" className="btn btn-danger" onClick={onCloseRoom}>
              Close Room
            </button>
          </div>
        ) : (
          <p className="hint">Pick a team. Waiting for host to start…</p>
        )}

        {!canStart && isHost && (
          <p className="hint">Need at least 1 player per team to start.</p>
        )}
      </div>
    </div>
  );
}
