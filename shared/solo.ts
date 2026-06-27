import type { GameId } from "./games.ts";

export const SOLO_BOT_LIMITS: Record<GameId, { min: number; max: number; default: number }> = {
  shooter: { min: 1, max: 3, default: 3 },
  snake: { min: 1, max: 5, default: 2 },
  race: { min: 1, max: 5, default: 2 },
};

export const BOT_NAME_PREFIX = "Bot";

export function defaultSoloBotCount(gameId: GameId): number {
  return SOLO_BOT_LIMITS[gameId].default;
}

export function clampSoloBotCount(gameId: GameId, count: number): number {
  const { min, max } = SOLO_BOT_LIMITS[gameId];
  return Math.min(max, Math.max(min, Math.round(count)));
}
