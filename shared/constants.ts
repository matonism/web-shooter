export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;

export const MAX_PLAYERS = 6;
export const MAX_PER_TEAM = 3;

export const ARENA = {
  width: 1200,
  height: 800,
} as const;

export const PLAYER = {
  radius: 30,
  speed: 270,
  maxHp: 200,
} as const;

export const BULLET = {
  radius: 4,
  speed: 250,
  damage: 25,
  lifetimeMs: 2000,
} as const;

export const FIRE_COOLDOWN_MS = 1000;

export const POWERUP = {
  radius: 14,
  spawnIntervalMs: 12_000,
  maxOnField: 2,
  lifetimeMs: 18_000,
  effectDurationMs: 8_000,
  shieldCapacity: 50,
  speedMultiplier: 1.55,
  rapidCooldownMult: 0.42,
} as const;

export type BulletKind = "normal" | "heavy" | "spread";

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
