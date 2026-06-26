import { randomUUID } from "node:crypto";
import {
  ARENA,
  BULLET,
  FIRE_COOLDOWN_MS,
  MAX_PER_TEAM,
  PLAYER,
  SPAWN_POINTS,
  TICK_MS,
} from "../shared/constants.ts";
import type {
  BulletState,
  PlayerInput,
  PlayerState,
  Team,
  WorldSnapshot,
} from "../shared/types.ts";

interface InternalPlayer {
  id: string;
  name: string;
  team: Team | null;
  x: number;
  y: number;
  angle: number;
  hp: number;
  eliminated: boolean;
  connected: boolean;
  lastFireAt: number;
  pendingInput: PlayerInput | null;
}

interface InternalBullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  team: Team;
  ownerId: string;
  spawnedAt: number;
}

export class GameSimulation {
  tick = 0;
  players = new Map<string, InternalPlayer>();
  bullets: InternalBullet[] = [];
  winner: Team | null = null;

  reset() {
    this.tick = 0;
    this.bullets = [];
    this.winner = null;
    for (const p of this.players.values()) {
      this.respawnPlayer(p);
    }
  }

  addPlayer(id: string, name: string) {
    this.players.set(id, {
      id,
      name,
      team: null,
      x: ARENA.width / 2,
      y: ARENA.height / 2,
      angle: 0,
      hp: PLAYER.maxHp,
      eliminated: false,
      connected: true,
      lastFireAt: 0,
      pendingInput: null,
    });
  }

  removePlayer(id: string) {
    this.players.delete(id);
    this.bullets = this.bullets.filter((b) => b.ownerId !== id);
  }

  setConnected(id: string, connected: boolean) {
    const p = this.players.get(id);
    if (p) p.connected = connected;
  }

  remapPlayerId(oldId: string, newId: string) {
    const p = this.players.get(oldId);
    if (!p) return;
    p.id = newId;
    this.players.delete(oldId);
    this.players.set(newId, p);
    for (const b of this.bullets) {
      if (b.ownerId === oldId) b.ownerId = newId;
    }
  }

  assignTeam(id: string, team: Team): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    const teamCount = [...this.players.values()].filter(
      (pl) => pl.team === team && pl.id !== id,
    ).length;
    if (teamCount >= MAX_PER_TEAM) return false;
    p.team = team;
    this.respawnPlayer(p);
    return true;
  }

  queueInput(id: string, input: PlayerInput) {
    const p = this.players.get(id);
    if (!p || p.eliminated) return;
    p.pendingInput = input;
  }

  step(): WorldSnapshot {
    this.tick += 1;
    const dt = TICK_MS / 1000;

    for (const p of this.players.values()) {
      if (p.eliminated || !p.pendingInput) continue;
      const { dx, dy, angle, fire } = p.pendingInput;
      p.angle = angle;

      const len = Math.hypot(dx, dy);
      if (len > 0.01) {
        const nx = dx / len;
        const ny = dy / len;
        p.x = clamp(p.x + nx * PLAYER.speed * dt, PLAYER.radius, ARENA.width - PLAYER.radius);
        p.y = clamp(p.y + ny * PLAYER.speed * dt, PLAYER.radius, ARENA.height - PLAYER.radius);
      }

      if (fire && p.team) {
        const now = Date.now();
        if (now - p.lastFireAt >= FIRE_COOLDOWN_MS) {
          p.lastFireAt = now;
          this.spawnBullet(p);
        }
      }
      p.pendingInput = null;
    }

    this.updateBullets(dt);
    this.checkWinCondition();

    return this.snapshot();
  }

  private spawnBullet(p: InternalPlayer) {
    if (!p.team) return;
    const muzzleDist = PLAYER.radius + 6;
    const bx = p.x + Math.cos(p.angle) * muzzleDist;
    const by = p.y + Math.sin(p.angle) * muzzleDist;
    this.bullets.push({
      id: randomUUID(),
      x: bx,
      y: by,
      vx: Math.cos(p.angle) * BULLET.speed,
      vy: Math.sin(p.angle) * BULLET.speed,
      angle: p.angle,
      team: p.team,
      ownerId: p.id,
      spawnedAt: Date.now(),
    });
  }

  private updateBullets(dt: number) {
    const now = Date.now();
    const survivors: InternalBullet[] = [];

    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (
        b.x < -BULLET.radius ||
        b.x > ARENA.width + BULLET.radius ||
        b.y < -BULLET.radius ||
        b.y > ARENA.height + BULLET.radius ||
        now - b.spawnedAt > BULLET.lifetimeMs
      ) {
        continue;
      }

      let hit = false;
      for (const p of this.players.values()) {
        if (p.eliminated || !p.team || p.team === b.team || p.id === b.ownerId) continue;
        const dist = Math.hypot(b.x - p.x, b.y - p.y);
        if (dist < PLAYER.radius + BULLET.radius) {
          p.hp = Math.max(0, p.hp - BULLET.damage);
          if (p.hp <= 0) {
            p.eliminated = true;
            p.hp = 0;
          }
          hit = true;
          break;
        }
      }
      if (!hit) survivors.push(b);
    }
    this.bullets = survivors;
  }

  private checkWinCondition() {
    if (this.winner) return;
    const redAlive = [...this.players.values()].filter(
      (p) => p.team === "red" && !p.eliminated,
    ).length;
    const blueAlive = [...this.players.values()].filter(
      (p) => p.team === "blue" && !p.eliminated,
    ).length;
    const redTotal = [...this.players.values()].filter((p) => p.team === "red").length;
    const blueTotal = [...this.players.values()].filter((p) => p.team === "blue").length;

    if (redTotal > 0 && redAlive === 0) this.winner = "blue";
    else if (blueTotal > 0 && blueAlive === 0) this.winner = "red";
  }

  private respawnPlayer(p: InternalPlayer) {
    if (!p.team) return;
    const spawns = SPAWN_POINTS[p.team];
    const idx = [...this.players.values()]
      .filter((pl) => pl.team === p.team)
      .findIndex((pl) => pl.id === p.id);
    const spawn = spawns[idx % spawns.length] ?? spawns[0]!;
    p.x = spawn.x;
    p.y = spawn.y;
    p.hp = PLAYER.maxHp;
    p.eliminated = false;
    p.angle = p.team === "red" ? 0 : Math.PI;
  }

  canStart(): boolean {
    const assigned = [...this.players.values()].filter((p) => p.team);
    if (assigned.length < 2) return false;
    const teams = new Set(assigned.map((p) => p.team));
    return teams.size >= 2;
  }

  snapshot(): WorldSnapshot {
    const players: PlayerState[] = [...this.players.values()]
      .filter((p) => p.team !== null)
      .map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team!,
        x: p.x,
        y: p.y,
        angle: p.angle,
        hp: p.hp,
        maxHp: PLAYER.maxHp,
        eliminated: p.eliminated,
        connected: p.connected,
      }));

    const bullets: BulletState[] = this.bullets.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      angle: b.angle,
      team: b.team,
      ownerId: b.ownerId,
    }));

    return {
      tick: this.tick,
      timestamp: Date.now(),
      players,
      bullets,
    };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
