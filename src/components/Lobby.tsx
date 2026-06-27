import { teamSize } from "@shared/constants";
import { GAME_CATALOG, getGameDef } from "@shared/games";
import {
  RACE_SCORING_OPTIONS,
  RACE_VISIBILITY_OPTIONS,
} from "@shared/raceSettings";
import type { GameId, GamePickMode, RaceSettings, RoomStatePublic, Team } from "@shared/types";

interface LobbyProps {
  roomState: RoomStatePublic;
  onSelectTeam: (team: Team) => void;
  onSelectGame: (gameId: GameId) => void;
  onSetGamePickMode: (mode: GamePickMode) => void;
  onVoteGame: (gameId: GameId) => void;
  onSetSoloMode: (enabled: boolean) => void;
  onSetRaceSettings: (settings: Partial<RaceSettings>) => void;
  onStart: () => void;
  onBackToLobby: () => void;
  onRestartRound: () => void;
  onCloseRoom: () => void;
  onLeaveRoom: () => void;
}

function previewGameId(roomState: RoomStatePublic): GameId | null {
  if (roomState.gamePickMode === "random") return null;
  if (roomState.gamePickMode === "host") return roomState.selectedGameId;

  const counts = new Map<GameId, number>();
  for (const vote of Object.values(roomState.gameVotes)) {
    counts.set(vote, (counts.get(vote) ?? 0) + 1);
  }
  if (counts.size === 0) return roomState.selectedGameId;

  let best = roomState.selectedGameId;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = id;
    }
  }
  return best;
}

function voteCount(roomState: RoomStatePublic, gameId: GameId): number {
  return Object.values(roomState.gameVotes).filter((v) => v === gameId).length;
}

function canStart(roomState: RoomStatePublic): boolean {
  if (roomState.players.length === 0) return false;

  if (roomState.soloMode) {
    if (roomState.players.length !== 1) return false;
    const gameId =
      roomState.gamePickMode === "random"
        ? null
        : (previewGameId(roomState) ?? roomState.selectedGameId);
    if (!gameId) return true;
    const def = getGameDef(gameId);
    if (!def.supportsSolo) return false;
    if (def.requiresTeams) {
      return roomState.players[0]!.team !== null;
    }
    return true;
  }

  if (roomState.players.length < 2) return false;

  if (roomState.gamePickMode === "random") {
    return roomState.players.length >= 2;
  }

  const gameId = previewGameId(roomState) ?? roomState.selectedGameId;
  const def = getGameDef(gameId);

  if (gameId === "race" && roomState.raceSettings.scoringMode === "team") {
    const red = teamSize(roomState.players, "red");
    const blue = teamSize(roomState.players, "blue");
    return red >= 1 && blue >= 1 && roomState.players.filter((p) => p.team).length >= 2;
  }

  if (def.requiresTeams) {
    const red = teamSize(roomState.players, "red");
    const blue = teamSize(roomState.players, "blue");
    return red >= 1 && blue >= 1 && roomState.players.filter((p) => p.team).length >= 2;
  }
  return roomState.players.length >= 2;
}

export function Lobby({
  roomState,
  onSelectTeam,
  onSelectGame,
  onSetGamePickMode,
  onVoteGame,
  onSetSoloMode,
  onSetRaceSettings,
  onStart,
  onBackToLobby,
  onRestartRound,
  onCloseRoom,
  onLeaveRoom,
}: LobbyProps) {
  const isHost = roomState.hostId === roomState.youId;
  const me = roomState.players.find((p) => p.id === roomState.youId);
  const redCount = teamSize(roomState.players, "red");
  const blueCount = teamSize(roomState.players, "blue");
  const effectiveGameId = previewGameId(roomState);
  const effectiveGame = effectiveGameId ? getGameDef(effectiveGameId) : null;
  const showTeams =
    !roomState.soloMode &&
    roomState.gamePickMode !== "random" &&
    (effectiveGame?.requiresTeams ?? false);
  const showTeamsSolo =
    roomState.soloMode &&
    roomState.gamePickMode !== "random" &&
    (effectiveGame?.requiresTeams ?? effectiveGameId === null);
  const showTeamsRace =
    !roomState.soloMode &&
    roomState.gamePickMode !== "random" &&
    effectiveGameId === "race" &&
    roomState.raceSettings.scoringMode === "team";
  const showRaceSettings =
    roomState.gamePickMode !== "random" &&
    (effectiveGameId === "race" || roomState.selectedGameId === "race");
  const startReady = canStart(roomState);
  const myVote = roomState.gameVotes[roomState.youId];

  if (roomState.phase === "finished") {
    const winner = roomState.matchWinner;
    const winnerText =
      winner?.kind === "team"
        ? `${winner.team.toUpperCase()} TEAM WINS`
        : winner?.kind === "player"
          ? `${winner.name.toUpperCase()} WINS`
          : "DRAW";

    return (
      <div className="lobby">
        <div className="lobby-card overlay-card">
          <h2>Match Over</h2>
          {roomState.playingGameId && (
            <p className="hint">{getGameDef(roomState.playingGameId).name}</p>
          )}
          <p
            className={
              winner?.kind === "team"
                ? winner.team === "red"
                  ? "winner-red"
                  : "winner-blue"
                : "winner-player"
            }
          >
            {winnerText}
          </p>
          {isHost ? (
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={onRestartRound}>
                Restart Round
              </button>
              <button type="button" className="btn btn-secondary" onClick={onBackToLobby}>
                Back to Lobby
              </button>
              <button type="button" className="btn btn-secondary" onClick={onLeaveRoom}>
                Leave Room
              </button>
            </div>
          ) : (
            <>
              <p className="hint">Waiting for host…</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onLeaveRoom}
                style={{ marginTop: "0.75rem", width: "100%" }}
              >
                Leave Room
              </button>
            </>
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

        <div className="game-pick-section">
          <div className="game-pick-header">
            <h3>Choose a game</h3>
            {isHost && (
              <div className="pick-mode-tabs">
                {(["host", "vote", "random"] as GamePickMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`pick-mode-tab ${roomState.gamePickMode === mode ? "active" : ""}`}
                    onClick={() => onSetGamePickMode(mode)}
                  >
                    {mode === "host" ? "Host picks" : mode === "vote" ? "Vote" : "Random"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {roomState.gamePickMode === "random" && (
            <p className="hint">A random game from the suite will be chosen when the host starts.</p>
          )}

          <div className="game-card-grid">
            {GAME_CATALOG.map((game) => {
              const selected =
                roomState.gamePickMode === "host"
                  ? roomState.selectedGameId === game.id
                  : roomState.gamePickMode === "vote"
                    ? myVote === game.id
                    : false;
              const votes = voteCount(roomState, game.id);
              const leading = effectiveGameId === game.id;

              return (
                <button
                  key={game.id}
                  type="button"
                  className={`game-card ${selected ? "selected" : ""} ${leading && roomState.gamePickMode === "vote" ? "leading" : ""}`}
                  disabled={
                    roomState.gamePickMode === "host"
                      ? !isHost
                      : roomState.gamePickMode === "vote"
                        ? false
                        : true
                  }
                  onClick={() => {
                    if (roomState.gamePickMode === "host" && isHost) onSelectGame(game.id);
                    if (roomState.gamePickMode === "vote") onVoteGame(game.id);
                  }}
                >
                  <span className="game-card-name">{game.name}</span>
                  <span className="game-card-desc">{game.description}</span>
                  {roomState.gamePickMode === "vote" && votes > 0 && (
                    <span className="game-card-votes">{votes} vote{votes !== 1 ? "s" : ""}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {showRaceSettings && (
          <div className="race-settings-section">
            <h3>Race options</h3>
            <div className="race-settings-group">
              <span className="race-settings-label">Scoring</span>
              <div className="pick-mode-tabs">
                {RACE_SCORING_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`pick-mode-tab ${roomState.raceSettings.scoringMode === opt.id ? "active" : ""}`}
                    disabled={!isHost}
                    onClick={() => onSetRaceSettings({ scoringMode: opt.id })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="hint">
                {
                  RACE_SCORING_OPTIONS.find(
                    (o) => o.id === roomState.raceSettings.scoringMode,
                  )?.desc
                }
              </p>
            </div>
            <div className="race-settings-group">
              <span className="race-settings-label">Other racers on your screen</span>
              <div className="race-visibility-grid">
                {RACE_VISIBILITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`game-card race-vis-card ${roomState.raceSettings.visibility === opt.id ? "selected" : ""}`}
                    disabled={!isHost}
                    onClick={() => onSetRaceSettings({ visibility: opt.id })}
                  >
                    <span className="game-card-name">{opt.label}</span>
                    <span className="game-card-desc">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {isHost && roomState.players.length === 1 && (
          <label className="solo-toggle">
            <input
              type="checkbox"
              checked={roomState.soloMode}
              onChange={(e) => onSetSoloMode(e.target.checked)}
            />
            <span>Practice vs AI (solo)</span>
          </label>
        )}

        {roomState.soloMode && (
          <p className="hint">
            Solo mode — AI opponents fill in when you start. Friends cannot join this room.
          </p>
        )}

        <ul className="player-list">
          {roomState.players.map((p) => (
            <li key={p.id}>
              <span>
                {p.name}
                {p.id === roomState.hostId ? " ★" : ""}
                {!p.connected ? " (away)" : ""}
              </span>
              {(showTeams || showTeamsSolo || showTeamsRace) && (
                <span className={`team-badge ${p.team ?? "none"}`}>{p.team ?? "—"}</span>
              )}
            </li>
          ))}
        </ul>

        {(showTeams || showTeamsSolo || showTeamsRace) && (
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
        )}

        {isHost ? (
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={onStart} disabled={!startReady}>
              Start Game
            </button>
            <button type="button" className="btn btn-danger" onClick={onCloseRoom}>
              Close Room
            </button>
          </div>
        ) : (
          <>
            <p className="hint">
              {roomState.gamePickMode === "vote"
                ? "Vote for a game. Waiting for host to start…"
                : "Waiting for host to start…"}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onLeaveRoom}
              style={{ width: "100%", marginTop: "0.75rem" }}
            >
              Leave Room
            </button>
          </>
        )}

        {!startReady && isHost && (
          <p className="hint">
            {roomState.soloMode
              ? showTeamsSolo && !me?.team
                ? "Pick your team, then start solo Arena Shooter."
                : "Ready when you are — AI opponents will join on start."
              : roomState.gamePickMode === "random"
                ? "Need at least 2 players to start."
                : showTeams
                  ? "Need at least 1 player per team to start Arena Shooter."
                  : "Need at least 2 players to start."}
          </p>
        )}
      </div>
    </div>
  );
}
