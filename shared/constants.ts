export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;

export const MAX_PLAYERS = 6;
export const MAX_PER_TEAM = 3;

export const ARENA = {
  width: 1200,
  height: 800,
} as const;

export const PLAYER = {
  radius: 18,
  speed: 200,
  maxHp: 100,
} as const;

export const BULLET = {
  radius: 4,
  speed: 480,
  damage: 25,
  lifetimeMs: 2000,
} as const;

export const FIRE_COOLDOWN_MS = 280;

export const TEAM_COLORS = {
  red: {
    fill: "#ff3366",
    glow: "#ff6699",
    bullet: "#ff5588",
  },
  blue: {
    fill: "#33ccff",
    glow: "#66ddff",
    bullet: "#44bbee",
  },
} as const;

export const SPAWN_POINTS: Record<"red" | "blue", { x: number; y: number }[]> = {
  red: [
    { x: 120, y: 200 },
    { x: 120, y: 400 },
    { x: 120, y: 600 },
  ],
  blue: [
    { x: 1080, y: 200 },
    { x: 1080, y: 400 },
    { x: 1080, y: 600 },
  ],
};

import type { Team } from "./types.ts";

export function teamSize(players: { team: Team | null }[], team: Team): number {
  return players.filter((p) => p.team === team).length;
}
