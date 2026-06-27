import { ARENA } from "./constants.ts";
import type { Team } from "./types.ts";

export interface ResupplyZone {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Team-colored rear zones — stand here to refill ammo. */
export const RESUPPLY_ZONES: Record<Team, ResupplyZone> = {
  red: { xMin: 0, xMax: 240, yMin: 60, yMax: ARENA.height - 60 },
  blue: { xMin: ARENA.width - 240, xMax: ARENA.width, yMin: 60, yMax: ARENA.height - 60 },
};

export function isInResupplyZone(x: number, y: number, team: Team): boolean {
  const z = RESUPPLY_ZONES[team];
  return x >= z.xMin && x <= z.xMax && y >= z.yMin && y <= z.yMax;
}

export function resupplyZoneCenter(team: Team): { x: number; y: number } {
  const z = RESUPPLY_ZONES[team];
  return { x: (z.xMin + z.xMax) / 2, y: (z.yMin + z.yMax) / 2 };
}
