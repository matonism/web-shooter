import { randomUUID } from "node:crypto";
import {
  ARENA,
  MAX_PER_TEAM,
  PLAYER,
  POWERUP,
  SPAWN_POINTS,
  TICK_MS,
} from "../shared/constants.ts";
import { stepMovement } from "../shared/movement.ts";
import { ALL_POWERUP_KINDS } from "../shared/powerups.ts";
import { isInResupplyZone } from "../shared/shooterResupply.ts";
import {
  DEFAULT_SHOOTER_SETTINGS,
  type ShooterSettings,
} from "../shared/shooterSettings.ts";
import type {
  BombState,
  BulletKind,
  BulletState,
  LobbyPlayer,
  MatchWinner,
  PlayerInput,
  PlayerState,
  PowerupKind,
  PowerupState,
  ShooterWorldSnapshot,
  Team,
} from "../shared/types.ts";
import type { RoomSimulation } from "./roomSimulation.ts";
import { computeShooterBotInput } from "./shooterAi.ts";

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
  isBot: boolean;
  lastFireAt: number;
  ammo: number;
  bombPlaced: boolean;
  pendingInput: PlayerInput | null;
  lastInput: PlayerInput | null;
  activePowerups: { kind: PowerupKind; until: number }[];
  shield: number;
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
  kind: BulletKind;
  damage: number;
  radius: number;
  lifetimeMs: number;
}

interface InternalBomb {
  id: string;
  x: number;
  y: number;
  ownerId: string;
  team: Team;
}

interface InternalPowerup {
  id: string;
  kind: PowerupKind;
  x: number;
  y: number;
  spawnedAt: number;
}

export class GameSimulation implements RoomSimulation {
  readonly gameId = "shooter" as const;
  tick = 0;
  players = new Map<string, InternalPlayer>();
  bullets: InternalBullet[] = [];
  bombs: InternalBomb[] = [];
  powerups: InternalPowerup[] = [];
  winner: Team | null = null;
  settings: ShooterSettings = { ...DEFAULT_SHOOTER_SETTINGS };
  private lastPowerupSpawnAt = 0;

  get matchWinner(): MatchWinner | null {
    if (!this.winner) return null;
    return { kind: "team", team: this.winner };
  }

  setShooterSettings(settings: ShooterSettings) {
    this.settings = { ...settings };
  }

  reset() {
    this.tick = 0;
    this.bullets = [];
    this.bombs = [];
    this.powerups = [];
    this.winner = null;
    this.lastPowerupSpawnAt = Date.now();
    for (const p of this.players.values()) {
      this.clearPowerups(p);
      p.bombPlaced = false;
      this.respawnPlayer(p);
    }
  }

  addPlayer(id: string, name: string, isBot = false) {
    this.players.set(id, {
      id,
      name,
      team: null,
      x: ARENA.width / 2,
      y: ARENA.height / 2,
      angle: 0,
      hp: this.settings.playerMaxHp,
      eliminated: false,
      connected: true,
      isBot,
      lastFireAt: 0,
      ammo: this.settings.magazineSize,
      bombPlaced: false,
      pendingInput: null,
      lastInput: null,
      activePowerups: [],
      shield: 0,
    });
  }

  removePlayer(id: string) {
    this.players.delete(id);
    this.bullets = this.bullets.filter((b) => b.ownerId !== id);
    this.bombs = this.bombs.filter((b) => b.ownerId !== id);
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
    for (const b of this.bombs) {
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
    p.lastInput = input;
  }

  step(): void {
    this.tick += 1;
    const now = Date.now();
    const dt = TICK_MS / 1000;

    this.tickPowerups(now);

    for (const p of this.players.values()) {
      if (p.isBot && !p.eliminated && p.team) {
        const input = this.computeBotInput(p);
        p.pendingInput = input;
        p.lastInput = input;
      }
    }

    for (const p of this.players.values()) {
      this.refreshPowerups(p, now);
      this.clampAmmo(p, now);
      const input = p.pendingInput ?? p.lastInput;
      if (p.eliminated || !input) continue;
      const { dx, dy, fire, bomb } = input;
      p.angle = this.resolveAimAngle(p, dx, dy, input.angle);

      const speed = this.settings.playerSpeed * this.speedMultiplier(p);
      const next = stepMovement(p.x, p.y, dx, dy, speed, dt);
      p.x = next.x;
      p.y = next.y;

      if (p.team && isInResupplyZone(p.x, p.y, p.team)) {
        p.ammo = this.maxAmmo(p, now);
      }

      if (bomb && p.team && !p.bombPlaced) {
        p.bombPlaced = true;
        this.bombs.push({
          id: randomUUID(),
          x: p.x,
          y: p.y,
          ownerId: p.id,
          team: p.team,
        });
      }

      if (fire && p.team && p.ammo > 0) {
        const cooldown = this.fireCooldown(p);
        if (now - p.lastFireAt >= cooldown) {
          p.lastFireAt = now;
          p.ammo -= 1;
          this.spawnBulletsForPlayer(p);
        }
      }
      p.pendingInput = null;
    }

    this.checkPowerupPickups();
    this.checkBombCollisions();
    this.updateBullets(dt);
    this.checkWinCondition();
  }

  private resolveAimAngle(p: InternalPlayer, dx: number, dy: number, inputAngle: number): number {
    if (this.settings.aimMode !== "movement") return inputAngle;
    const len = Math.hypot(dx, dy);
    if (len < 0.2) return p.angle;
    return Math.atan2(dy, dx);
  }

  private tickPowerups(now: number) {
    this.powerups = this.powerups.filter(
      (pu) => now - pu.spawnedAt < POWERUP.lifetimeMs,
    );

    if (
      this.powerups.length < POWERUP.maxOnField &&
      now - this.lastPowerupSpawnAt >= POWERUP.spawnIntervalMs
    ) {
      this.spawnPowerup();
      this.lastPowerupSpawnAt = now;
    }
  }

  private spawnPowerup() {
    const pad = 80;
    const kind = ALL_POWERUP_KINDS[Math.floor(Math.random() * ALL_POWERUP_KINDS.length)]!;
    this.powerups.push({
      id: randomUUID(),
      kind,
      x: pad + Math.random() * (ARENA.width - pad * 2),
      y: pad + Math.random() * (ARENA.height - pad * 2),
      spawnedAt: Date.now(),
    });
  }

  private checkPowerupPickups() {
    for (const p of this.players.values()) {
      if (p.eliminated || !p.team) continue;
      let picked = -1;
      for (let i = 0; i < this.powerups.length; i++) {
        const pu = this.powerups[i]!;
        const dist = Math.hypot(pu.x - p.x, pu.y - p.y);
        if (dist < PLAYER.radius + POWERUP.radius) {
          this.applyPowerup(p, pu.kind);
          picked = i;
          break;
        }
      }
      if (picked >= 0) this.powerups.splice(picked, 1);
    }
  }

  private checkBombCollisions() {
    const survivors: InternalBomb[] = [];
    for (const bomb of this.bombs) {
      let triggered = false;
      for (const p of this.players.values()) {
        if (p.eliminated || !p.team || p.team === bomb.team || p.id === bomb.ownerId) continue;
        const dist = Math.hypot(bomb.x - p.x, bomb.y - p.y);
        if (dist < PLAYER.radius + this.settings.bombRadius) {
          this.applyDamage(p, this.settings.bombDamage);
          triggered = true;
          break;
        }
      }
      if (!triggered) survivors.push(bomb);
    }
    this.bombs = survivors;
  }

  private applyPowerup(p: InternalPlayer, kind: PowerupKind) {
    const now = Date.now();
    if (kind === "shield") {
      p.shield += POWERUP.shieldCapacity;
      return;
    }
    const existing = p.activePowerups.find((e) => e.kind === kind);
    if (existing) {
      existing.until = Math.max(existing.until, now) + POWERUP.effectDurationMs;
    } else {
      p.activePowerups.push({ kind, until: now + POWERUP.effectDurationMs });
    }
    if (kind === "extendedMag") {
      const bonus = Math.floor(this.settings.magazineSize * 0.5);
      p.ammo = Math.min(this.maxAmmo(p, now), p.ammo + bonus);
    }
  }

  private maxAmmo(p: InternalPlayer, now: number): number {
    let cap = this.settings.magazineSize;
    if (this.hasEffect(p, "extendedMag", now)) {
      cap = Math.round(cap * POWERUP.extendedMagMultiplier);
    }
    return cap;
  }

  private clampAmmo(p: InternalPlayer, now: number) {
    const cap = this.maxAmmo(p, now);
    if (p.ammo > cap) p.ammo = cap;
  }

  private refillAmmo(p: InternalPlayer, now: number) {
    p.ammo = this.maxAmmo(p, now);
  }

  private clearPowerups(p: InternalPlayer) {
    p.activePowerups = [];
    p.shield = 0;
  }

  private refreshPowerups(p: InternalPlayer, now: number) {
    p.activePowerups = p.activePowerups.filter((e) => e.until > now);
  }

  private hasEffect(p: InternalPlayer, kind: PowerupKind, now: number): boolean {
    return p.activePowerups.some((e) => e.kind === kind && e.until > now);
  }

  private speedMultiplier(p: InternalPlayer): number {
    const now = Date.now();
    if (this.hasEffect(p, "speed", now)) return POWERUP.speedMultiplier;
    return 1;
  }

  private fireCooldown(p: InternalPlayer): number {
    const now = Date.now();
    const base = this.settings.fireCooldownMs;
    if (this.hasEffect(p, "rapid", now)) {
      return base * POWERUP.rapidCooldownMult;
    }
    return base;
  }

  private bulletKind(p: InternalPlayer): BulletKind {
    const now = Date.now();
    if (this.hasEffect(p, "heavy", now)) return "heavy";
    if (this.hasEffect(p, "spread", now)) return "spread";
    return "normal";
  }

  private spawnBulletsForPlayer(p: InternalPlayer) {
    if (!p.team) return;
    const mode = this.bulletKind(p);
    const spread = this.hasEffect(p, "spread", Date.now());
    const muzzleDist = PLAYER.radius + 6;
    const bx = p.x + Math.cos(p.angle) * muzzleDist;
    const by = p.y + Math.sin(p.angle) * muzzleDist;

    if (spread) {
      for (const offset of [-0.22, 0, 0.22]) {
        this.pushBullet(p, bx, by, p.angle + offset, mode);
      }
      return;
    }

    this.pushBullet(p, bx, by, p.angle, mode);
  }

  private pushBullet(
    p: InternalPlayer,
    x: number,
    y: number,
    angle: number,
    kind: BulletKind,
  ) {
    const heavy = kind === "heavy";
    const speed = this.settings.bulletSpeed * (heavy ? 0.75 : 1);
    this.bullets.push({
      id: randomUUID(),
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle,
      team: p.team!,
      ownerId: p.id,
      spawnedAt: Date.now(),
      kind,
      damage: heavy ? Math.round(this.settings.bulletDamage * 1.6) : kind === "spread" ? Math.round(this.settings.bulletDamage * 0.72) : this.settings.bulletDamage,
      radius: heavy ? this.settings.bulletRadius + 1 : kind === "spread" ? Math.max(3, this.settings.bulletRadius - 3) : this.settings.bulletRadius,
      lifetimeMs: this.settings.bulletLifetimeMs,
    });
  }

  private applyDamage(p: InternalPlayer, amount: number) {
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, amount);
      p.shield -= absorbed;
      amount -= absorbed;
    }
    if (amount <= 0) return;
    p.hp = Math.max(0, p.hp - amount);
    if (p.hp <= 0) {
      p.eliminated = true;
      p.hp = 0;
      this.clearPowerups(p);
    }
  }

  private updateBullets(dt: number) {
    const now = Date.now();
    const survivors: InternalBullet[] = [];

    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (
        b.x < -b.radius ||
        b.x > ARENA.width + b.radius ||
        b.y < -b.radius ||
        b.y > ARENA.height + b.radius ||
        now - b.spawnedAt > b.lifetimeMs
      ) {
        continue;
      }

      let hit = false;
      for (const p of this.players.values()) {
        if (p.eliminated || !p.team || p.team === b.team || p.id === b.ownerId) continue;
        const dist = Math.hypot(b.x - p.x, b.y - p.y);
        if (dist < PLAYER.radius + b.radius) {
          this.applyDamage(p, b.damage);
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
    p.hp = this.settings.playerMaxHp;
    p.eliminated = false;
    p.bombPlaced = false;
    p.angle = p.team === "red" ? 0 : Math.PI;
    this.clearPowerups(p);
    this.refillAmmo(p, Date.now());
  }

  canStart(lobby: LobbyPlayer[]): boolean {
    if (lobby.length === 1) return true;
    const assigned = lobby.filter((p) => p.team);
    if (assigned.length < 2) return false;
    const teams = new Set(assigned.map((p) => p.team));
    return teams.size >= 2;
  }

  private computeBotInput(p: InternalPlayer): PlayerInput {
    const enemies = [...this.players.values()]
      .filter((o) => o.team && o.team !== p.team && !o.eliminated)
      .map((o) => ({
        id: o.id,
        team: o.team!,
        x: o.x,
        y: o.y,
        angle: o.angle,
        eliminated: o.eliminated,
      }));

    return computeShooterBotInput({
      self: {
        id: p.id,
        team: p.team!,
        x: p.x,
        y: p.y,
        angle: p.angle,
        eliminated: p.eliminated,
        bombPlaced: p.bombPlaced,
        ammo: p.ammo,
        maxAmmo: this.maxAmmo(p, Date.now()),
      },
      enemies,
      powerups: this.powerups.map((pu) => ({
        x: pu.x,
        y: pu.y,
        kind: pu.kind,
      })),
      aimMode: this.settings.aimMode,
    });
  }

  snapshot(): ShooterWorldSnapshot {
    const now = Date.now();
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
        maxHp: this.settings.playerMaxHp,
        eliminated: p.eliminated,
        connected: p.connected,
        activePowerups: p.activePowerups.filter((e) => e.until > now),
        shield: p.shield,
        speedMultiplier: this.speedMultiplier(p),
        bombPlaced: p.bombPlaced,
        ammo: p.ammo,
        maxAmmo: this.maxAmmo(p, now),
        inResupplyZone: p.team ? isInResupplyZone(p.x, p.y, p.team) : false,
      }));

    const bullets: BulletState[] = this.bullets.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      angle: b.angle,
      team: b.team,
      ownerId: b.ownerId,
      kind: b.kind,
    }));

    const bombs: BombState[] = this.bombs.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      ownerId: b.ownerId,
      team: b.team,
    }));

    const powerups: PowerupState[] = this.powerups.map((pu) => ({
      id: pu.id,
      kind: pu.kind,
      x: pu.x,
      y: pu.y,
    }));

    return {
      tick: this.tick,
      timestamp: now,
      gameId: "shooter",
      settings: { ...this.settings },
      players,
      bullets,
      bombs,
      powerups,
    };
  }
}
