import { ARENA, PLAYER } from "../shared/constants.ts";
import type { PlayerInput, PowerupKind, Team } from "../shared/types.ts";

interface ShooterBotContext {
  id: string;
  team: Team;
  x: number;
  y: number;
  angle: number;
  eliminated: boolean;
}

interface ShooterBotWorld {
  self: ShooterBotContext;
  enemies: ShooterBotContext[];
  powerups: { x: number; y: number; kind: PowerupKind }[];
}

export function computeShooterBotInput(world: ShooterBotWorld): PlayerInput {
  const { self, enemies, powerups } = world;
  let target = enemies[0];
  let bestDist = Infinity;
  for (const e of enemies) {
    if (e.eliminated) continue;
    const d = Math.hypot(e.x - self.x, e.y - self.y);
    if (d < bestDist) {
      bestDist = d;
      target = e;
    }
  }

  let aimX = self.x + Math.cos(self.angle) * 120;
  let aimY = self.y + Math.sin(self.angle) * 120;
  let moveDx = 0;
  let moveDy = 0;
  let fire = false;

  if (target && !target.eliminated) {
    aimX = target.x;
    aimY = target.y;
    const toX = target.x - self.x;
    const toY = target.y - self.y;
    const dist = Math.hypot(toX, toY) || 1;
    const nx = toX / dist;
    const ny = toY / dist;

    if (dist > 420) {
      moveDx = nx;
      moveDy = ny;
    } else if (dist < 180) {
      moveDx = -nx * 0.85 + ny * 0.35 * (Math.random() > 0.5 ? 1 : -1);
      moveDy = -ny * 0.85 - nx * 0.35 * (Math.random() > 0.5 ? 1 : -1);
    } else {
      moveDx = nx * 0.35 + ny * 0.65 * (Math.random() > 0.5 ? 1 : -1);
      moveDy = ny * 0.35 - nx * 0.65 * (Math.random() > 0.5 ? 1 : -1);
    }

    fire = dist < 520 && Math.random() > 0.08;
  }

  let nearestPu: { x: number; y: number } | null = null;
  let puDist = Infinity;
  for (const pu of powerups) {
    const d = Math.hypot(pu.x - self.x, pu.y - self.y);
    if (d < puDist && d < 220) {
      puDist = d;
      nearestPu = pu;
    }
  }
  if (nearestPu && (!target || bestDist > 280) && Math.random() > 0.35) {
    const toX = nearestPu.x - self.x;
    const toY = nearestPu.y - self.y;
    const d = Math.hypot(toX, toY) || 1;
    moveDx = toX / d;
    moveDy = toY / d;
    fire = false;
  }

  const len = Math.hypot(moveDx, moveDy);
  if (len > 1) {
    moveDx /= len;
    moveDy /= len;
  }

  const angle = Math.atan2(aimY - self.y, aimX - self.x);
  return { seq: 0, dx: moveDx, dy: moveDy, angle, fire };
}

export function isBotId(id: string): boolean {
  return id.startsWith("bot:");
}

export function clampArena(x: number, y: number): { x: number; y: number } {
  const r = PLAYER.radius;
  return {
    x: Math.max(r, Math.min(ARENA.width - r, x)),
    y: Math.max(r, Math.min(ARENA.height - r, y)),
  };
}
