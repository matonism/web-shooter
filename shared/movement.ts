import { ARENA, PLAYER } from "./constants.ts";

/** One movement step — shared by server simulation and client prediction. */
export function stepMovement(
  x: number,
  y: number,
  dx: number,
  dy: number,
  speed: number,
  dt: number,
): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len <= 0.01) return { x, y };
  const nx = dx / len;
  const ny = dy / len;
  const r = PLAYER.radius;
  return {
    x: Math.max(r, Math.min(ARENA.width - r, x + nx * speed * dt)),
    y: Math.max(r, Math.min(ARENA.height - r, y + ny * speed * dt)),
  };
}
