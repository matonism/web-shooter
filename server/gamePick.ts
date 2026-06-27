import type { GameId, GamePickMode } from "../shared/games.ts";
import { GAME_CATALOG, getGameDef } from "../shared/games.ts";
import { teamSize } from "../shared/constants.ts";
import type { RaceSettings } from "../shared/raceSettings.ts";
import type { ShooterBotSettings } from "../shared/shooterBots.ts";
import { canStartShooterWithBots } from "../shared/shooterBots.ts";
import type { LobbyPlayer } from "../shared/types.ts";

export interface GamePickState {
  selectedGameId: GameId;
  gamePickMode: GamePickMode;
  gameVotes: Map<string, GameId>;
  soloMode: boolean;
  raceSettings: RaceSettings;
  shooterBotSettings: ShooterBotSettings;
}

export function resolveGameId(state: GamePickState): GameId {
  if (state.gamePickMode === "host") {
    return state.selectedGameId;
  }
  if (state.gamePickMode === "random") {
    const ids = GAME_CATALOG.map((g) => g.id);
    return ids[Math.floor(Math.random() * ids.length)]!;
  }

  const counts = new Map<GameId, number>();
  for (const vote of state.gameVotes.values()) {
    counts.set(vote, (counts.get(vote) ?? 0) + 1);
  }
  if (counts.size === 0) return state.selectedGameId;

  let bestCount = 0;
  for (const count of counts.values()) {
    if (count > bestCount) bestCount = count;
  }
  const tied = [...counts.entries()]
    .filter(([, count]) => count === bestCount)
    .map(([id]) => id);
  return tied[Math.floor(Math.random() * tied.length)]!;
}

export function previewGameId(state: GamePickState): GameId | null {
  if (state.gamePickMode === "host") return state.selectedGameId;
  if (state.gamePickMode === "random") return null;

  const counts = new Map<GameId, number>();
  for (const vote of state.gameVotes.values()) {
    counts.set(vote, (counts.get(vote) ?? 0) + 1);
  }
  if (counts.size === 0) return state.selectedGameId;

  let best: GameId = state.selectedGameId;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = id;
    }
  }
  return best;
}

export function canStartRoom(state: GamePickState, lobby: LobbyPlayer[]): boolean {
  if (lobby.length === 0) return false;

  if (state.soloMode) {
    if (lobby.length !== 1) return false;
    const gameId =
      state.gamePickMode === "random"
        ? null
        : (previewGameId(state) ?? state.selectedGameId);
    if (!gameId) return true;
    const def = getGameDef(gameId);
    if (!def.supportsSolo) return false;
    if (def.requiresTeams) {
      return lobby[0]!.team !== null;
    }
    return true;
  }

  const minPlayers = 2;
  if (lobby.length < minPlayers) return false;

  if (state.gamePickMode === "random") {
    return lobby.length >= minPlayers;
  }

  const gameId = previewGameId(state) ?? state.selectedGameId;
  const def = getGameDef(gameId);

  if (gameId === "race" && state.raceSettings.scoringMode === "team") {
    const red = teamSize(lobby, "red");
    const blue = teamSize(lobby, "blue");
    return red >= 1 && blue >= 1 && lobby.filter((p) => p.team).length >= 2;
  }

  if (def.requiresTeams) {
    if (gameId === "shooter") {
      return canStartShooterWithBots(lobby, state.shooterBotSettings);
    }
    const red = teamSize(lobby, "red");
    const blue = teamSize(lobby, "blue");
    return red >= 1 && blue >= 1 && lobby.filter((p) => p.team).length >= 2;
  }
  return lobby.length >= 2;
}

export function gameVotesRecord(votes: Map<string, GameId>): Record<string, GameId> {
  return Object.fromEntries(votes);
}
