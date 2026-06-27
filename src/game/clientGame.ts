import { ARENA, INTERP_DELAY_MS, PLAYER, TICK_MS } from "@shared/constants";
import { stepMovement } from "@shared/movement";
import type {
  BulletKind,
  BulletState,
  PlayerInput,
  PlayerState,
  PowerupKind,
  ShooterWorldSnapshot,
} from "@shared/types";
import { clamp, lerpAngle, Vec2 } from "./vector";

export interface RenderPlayer {
  id: string;
  name: string;
  team: "red" | "blue";
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  eliminated: boolean;
  isLocal: boolean;
  shield: number;
  activePowerups: PowerupKind[];
}

export interface RenderBullet {
  id: string;
  x: number;
  y: number;
  angle: number;
  team: "red" | "blue";
  kind: BulletKind;
}

export interface RenderPowerup {
  id: string;
  kind: PowerupKind;
  x: number;
  y: number;
}

export interface RenderState {
  players: RenderPlayer[];
  bullets: RenderBullet[];
  powerups: RenderPowerup[];
}

interface BufferedSnapshot {
  world: ShooterWorldSnapshot;
  receivedAt: number;
}

interface InterpFrame {
  from: ShooterWorldSnapshot;
  to: ShooterWorldSnapshot;
  t: number;
}

export class ClientGame {
  private localId = "";
  private inputSeq = 0;
  private keys = { up: false, down: false, left: false, right: false };
  private mouseWorld = new Vec2(0, 0);
  private firing = false;

  private touch = {
    enabled: false,
    moveX: 0,
    moveY: 0,
    firing: false,
  };

  private fireTouchId: number | null = null;
  private touchAimAngle = 0;
  private fireUntil = 0;
  private inputFlush: ((input: PlayerInput) => void) | null = null;

  private predX = 0;
  private predY = 0;
  private predAngle = 0;
  private localSpeedMult = 1;
  private predAccumulator = 0;
  private lastMoveDx = 0;
  private lastMoveDy = 0;

  private static readonly TICK_S = TICK_MS / 1000;
  private static readonly HARD_SNAP_PX = 72;
  private static readonly SOFT_CORRECT = 0.18;

  private snapshotBuffer: BufferedSnapshot[] = [];
  private lastSnapshot: ShooterWorldSnapshot | null = null;
  private lastAppliedTick = -1;

  setLocalId(id: string) {
    this.localId = id;
  }

  enableTouchControls(enabled: boolean) {
    this.touch.enabled = enabled;
  }

  setTouchControls(partial: {
    moveX?: number;
    moveY?: number;
    firing?: boolean;
  }) {
    Object.assign(this.touch, partial);
  }

  setTouchMove(moveX: number, moveY: number) {
    this.touch.moveX = moveX;
    this.touch.moveY = moveY;
  }

  setInputFlush(fn: ((input: PlayerInput) => void) | null) {
    this.inputFlush = fn;
  }

  private flushInput() {
    this.inputFlush?.(this.buildInput());
  }

  private updateTouchAim(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const world = this.clientToWorld(canvas, clientX, clientY);
    this.mouseWorld.x = world.x;
    this.mouseWorld.y = world.y;
    this.touchAimAngle = Math.atan2(world.y - this.predY, world.x - this.predX);
    this.predAngle = this.touchAimAngle;
  }

  private beginTouchFire(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    this.updateTouchAim(canvas, clientX, clientY);
    this.touch.firing = true;
    this.fireUntil = performance.now() + 120;
    this.flushInput();
  }

  private clientToWorld(canvas: HTMLCanvasElement, clientX: number, clientY: number): Vec2 {
    const rect = canvas.getBoundingClientRect();
    const scaleX = ARENA.width / rect.width;
    const scaleY = ARENA.height / rect.height;
    return new Vec2((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
  }

  bindInput(canvas: HTMLCanvasElement) {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          this.keys.up = down;
          break;
        case "KeyS":
        case "ArrowDown":
          this.keys.down = down;
          break;
        case "KeyA":
        case "ArrowLeft":
          this.keys.left = down;
          break;
        case "KeyD":
        case "ArrowRight":
          this.keys.right = down;
          break;
        default:
          return;
      }
      if (down) e.preventDefault();
    };
    window.addEventListener("keydown", (e) => onKey(e, true));
    window.addEventListener("keyup", (e) => onKey(e, false));

    canvas.addEventListener("mousemove", (e) => {
      if (this.touch.enabled) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = ARENA.width / rect.width;
      const scaleY = ARENA.height / rect.height;
      this.mouseWorld.x = (e.clientX - rect.left) * scaleX;
      this.mouseWorld.y = (e.clientY - rect.top) * scaleY;
    });

    canvas.addEventListener("mousedown", (e) => {
      if (this.touch.enabled) return;
      e.preventDefault();
      this.firing = true;
    });
    window.addEventListener("mouseup", () => {
      if (this.touch.enabled) return;
      this.firing = false;
    });

    canvas.addEventListener(
      "touchstart",
      (e) => {
        if (!this.touch.enabled) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i]!;
          if (t.target !== canvas) continue;
          e.preventDefault();
          this.fireTouchId = t.identifier;
          this.beginTouchFire(canvas, t.clientX, t.clientY);
        }
      },
      { passive: false },
    );

    canvas.addEventListener(
      "touchmove",
      (e) => {
        if (!this.touch.enabled || this.fireTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i]!;
          if (t.identifier !== this.fireTouchId) continue;
          e.preventDefault();
          this.updateTouchAim(canvas, t.clientX, t.clientY);
          this.fireUntil = performance.now() + 120;
          this.flushInput();
        }
      },
      { passive: false },
    );

    const endFireTouch = (e: TouchEvent) => {
      if (!this.touch.enabled) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]!;
        if (t.identifier === this.fireTouchId) {
          e.preventDefault();
          this.fireTouchId = null;
          this.touch.firing = false;
        }
      }
    };
    canvas.addEventListener("touchend", endFireTouch);
    canvas.addEventListener("touchcancel", endFireTouch);
  }

  buildInput(): PlayerInput {
    let dx = 0;
    let dy = 0;
    let angle: number;
    let fire: boolean;

    if (this.keys.up) dy -= 1;
    if (this.keys.down) dy += 1;
    if (this.keys.left) dx -= 1;
    if (this.keys.right) dx += 1;

    if (this.touch.enabled) {
      dx += this.touch.moveX;
      dy += this.touch.moveY;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      angle = this.touchAimAngle;
      fire = this.touch.firing || performance.now() < this.fireUntil;
    } else {
      angle = Math.atan2(
        this.mouseWorld.y - this.predY,
        this.mouseWorld.x - this.predX,
      );
      fire = this.firing;
    }

    this.inputSeq += 1;
    return { seq: this.inputSeq, dx, dy, angle, fire };
  }

  applyLocalPrediction(input: PlayerInput, dt: number) {
    this.predAngle = input.angle;
    this.lastMoveDx = input.dx;
    this.lastMoveDy = input.dy;
    this.predAccumulator += dt;

    const speed = PLAYER.speed * this.localSpeedMult;
    while (this.predAccumulator >= ClientGame.TICK_S) {
      this.predAccumulator -= ClientGame.TICK_S;
      const next = stepMovement(
        this.predX,
        this.predY,
        input.dx,
        input.dy,
        speed,
        ClientGame.TICK_S,
      );
      this.predX = next.x;
      this.predY = next.y;
    }
  }

  private localDisplayPos(): { x: number; y: number } {
    const frac = this.predAccumulator / ClientGame.TICK_S;
    if (frac <= 0.001) return { x: this.predX, y: this.predY };
    const speed = PLAYER.speed * this.localSpeedMult;
    return stepMovement(
      this.predX,
      this.predY,
      this.lastMoveDx,
      this.lastMoveDy,
      speed,
      ClientGame.TICK_S * frac,
    );
  }

  /** Call from the render loop when a new server tick arrives. */
  applyServerSnapshot(world: ShooterWorldSnapshot) {
    if (world.tick === this.lastAppliedTick) return;
    this.lastAppliedTick = world.tick;
    this.reconcileLocalPlayer(world);
    this.snapshotBuffer.push({ world, receivedAt: performance.now() });
    if (this.snapshotBuffer.length > 24) this.snapshotBuffer.shift();
    this.lastSnapshot = world;
  }

  private reconcileLocalPlayer(world: ShooterWorldSnapshot) {
    const local = world.players.find((p) => p.id === this.localId);
    if (!local) return;

    const speedChanged = local.speedMultiplier !== this.localSpeedMult;
    this.localSpeedMult = local.speedMultiplier;

    const errX = local.x - this.predX;
    const errY = local.y - this.predY;
    const dist = Math.hypot(errX, errY);

    if (dist > ClientGame.HARD_SNAP_PX || speedChanged) {
      this.predX = local.x;
      this.predY = local.y;
      this.predAccumulator = 0;
      return;
    }

    if (dist > 1.5) {
      this.predX += errX * ClientGame.SOFT_CORRECT;
      this.predY += errY * ClientGame.SOFT_CORRECT;
    }
  }

  private resolveInterpFrame(): InterpFrame | null {
    if (this.snapshotBuffer.length === 0) return null;
    if (this.snapshotBuffer.length === 1) {
      const only = this.snapshotBuffer[0]!.world;
      return { from: only, to: only, t: 1 };
    }

    const renderTime = performance.now() - INTERP_DELAY_MS;
    const buf = this.snapshotBuffer;

    for (let i = 0; i < buf.length - 1; i++) {
      const a = buf[i]!;
      const b = buf[i + 1]!;
      if (a.receivedAt <= renderTime && b.receivedAt >= renderTime) {
        const span = b.receivedAt - a.receivedAt;
        const t = span > 1 ? (renderTime - a.receivedAt) / span : 1;
        return { from: a.world, to: b.world, t: clamp(t, 0, 1) };
      }
    }

    if (renderTime < buf[0]!.receivedAt) {
      return { from: buf[0]!.world, to: buf[1]!.world, t: 0 };
    }

    const a = buf[buf.length - 2]!;
    const b = buf[buf.length - 1]!;
    const span = Math.max(b.receivedAt - a.receivedAt, TICK_MS);
    const t = clamp((renderTime - a.receivedAt) / span, 0, 1.08);
    return { from: a.world, to: b.world, t };
  }

  getRenderState(): RenderState | null {
    if (!this.lastSnapshot) return null;

    const frame = this.resolveInterpFrame();
    const remoteWorld = frame?.to ?? this.lastSnapshot;
    const powerups: RenderPowerup[] = remoteWorld.powerups.map((pu) => ({
      id: pu.id,
      kind: pu.kind,
      x: pu.x,
      y: pu.y,
    }));

    const bullets = frame
      ? this.interpolateBullets(frame.from, frame.to, frame.t)
      : this.lastSnapshot.bullets.map((b) => ({
          id: b.id,
          x: b.x,
          y: b.y,
          angle: b.angle,
          team: b.team,
          kind: b.kind,
        }));

    const players: RenderPlayer[] = [];
    for (const p of remoteWorld.players) {
      if (p.id === this.localId) {
        const pos = this.localDisplayPos();
        players.push({
          id: p.id,
          name: p.name,
          team: p.team,
          x: pos.x,
          y: pos.y,
          angle: this.predAngle,
          hp: p.hp,
          maxHp: p.maxHp,
          eliminated: p.eliminated,
          isLocal: true,
          shield: p.shield,
          activePowerups: p.activePowerups.map((e) => e.kind),
        });
      } else {
        const pos = frame ? this.interpolatePlayer(p.id, frame) : { x: p.x, y: p.y, angle: p.angle };
        players.push({
          id: p.id,
          name: p.name,
          team: p.team,
          x: pos.x,
          y: pos.y,
          angle: pos.angle,
          hp: p.hp,
          maxHp: p.maxHp,
          eliminated: p.eliminated,
          isLocal: false,
          shield: p.shield,
          activePowerups: p.activePowerups.map((e) => e.kind),
        });
      }
    }

    return { players, bullets, powerups };
  }

  private interpolatePlayer(
    id: string,
    frame: InterpFrame,
  ): { x: number; y: number; angle: number } {
    const fromP = frame.from.players.find((p) => p.id === id);
    const toP = frame.to.players.find((p) => p.id === id);
    if (!fromP || !toP) {
      const fallback = toP ?? fromP;
      return fallback
        ? { x: fallback.x, y: fallback.y, angle: fallback.angle }
        : { x: 0, y: 0, angle: 0 };
    }
    const t = frame.t;
    return {
      x: fromP.x + (toP.x - fromP.x) * t,
      y: fromP.y + (toP.y - fromP.y) * t,
      angle: lerpAngle(fromP.angle, toP.angle, t),
    };
  }

  private interpolateBullets(
    from: ShooterWorldSnapshot,
    to: ShooterWorldSnapshot,
    t: number,
  ): RenderBullet[] {
    const fromMap = new Map(from.bullets.map((b) => [b.id, b]));
    return to.bullets.map((b) => {
      const prev = fromMap.get(b.id);
      if (!prev) {
        return {
          id: b.id,
          x: b.x,
          y: b.y,
          angle: b.angle,
          team: b.team,
          kind: b.kind,
        };
      }
      return {
        id: b.id,
        x: prev.x + (b.x - prev.x) * t,
        y: prev.y + (b.y - prev.y) * t,
        angle: lerpAngle(prev.angle, b.angle, t),
        team: b.team,
        kind: b.kind,
      };
    });
  }

  resetFromPlayer(p: PlayerState) {
    this.predX = p.x;
    this.predY = p.y;
    this.predAngle = p.angle;
    this.localSpeedMult = p.speedMultiplier;
    this.predAccumulator = 0;
    this.lastMoveDx = 0;
    this.lastMoveDy = 0;
    this.touchAimAngle = p.angle;
    this.mouseWorld.x = p.x + Math.cos(p.angle) * 80;
    this.mouseWorld.y = p.y + Math.sin(p.angle) * 80;
    this.fireTouchId = null;
    this.touch.firing = false;
    this.snapshotBuffer = [];
    this.lastSnapshot = null;
    this.lastAppliedTick = -1;
  }
}
