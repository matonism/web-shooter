import type { GameId, GamePickMode } from "../shared/games.ts";
import { GAME_CATALOG, getGameDef } from "../shared/games.ts";
import { teamSize } from "../shared/constants.ts";
import type { LobbyPlayer } from "../shared/types.ts";

export interface GamePickState {
  selectedGameId: GameId;
  gamePickMode: GamePickMode;
  gameVotes: Map<string, GameId>;
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

/** Game shown in lobby before start (random shows default until roll). */
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
  const minPlayers = Math.min(...GAME_CATALOG.map((g) => g.minPlayers));
  if (lobby.length < minPlayers) return false;

  if (state.gamePickMode === "random") {
    return lobby.length >= minPlayers;
  }

  const gameId = previewGameId(state) ?? state.selectedGameId;
  const def = getGameDef(gameId);
  if (lobby.length < def.minPlayers) return false;

  if (def.requiresTeams) {
    const red = teamSize(lobby, "red");
    const blue = teamSize(lobby, "blue");
    return red >= 1 && blue >= 1 && lobby.filter((p) => p.team).length >= 2;
  }
  return true;
}

export function gameVotesRecord(votes: Map<string, GameId>): Record<string, GameId> {
  return Object.fromEntries(votes);
}
