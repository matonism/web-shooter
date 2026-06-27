import { ARENA, PLAYER, TICK_MS } from "@shared/constants";
import { stepMovement } from "@shared/movement";
import type {
  BulletKind,
  PlayerInput,
  PlayerState,
  PowerupKind,
  WorldSnapshot,
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

interface InterpTarget {
  from: WorldSnapshot;
  to: WorldSnapshot;
  receivedAt: number;
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
  /** Keeps fire=true briefly so quick taps reach the 30Hz input send */
  private fireUntil = 0;
  private inputFlush: ((input: PlayerInput) => void) | null = null;

  /** Authoritative local prediction (input-driven) */
  private predX = 0;
  private predY = 0;
  private predAngle = 0;
  private localSpeedMult = 1;
  private predAccumulator = 0;
  private lastMoveDx = 0;
  private lastMoveDy = 0;

  private static readonly TICK_S = TICK_MS / 1000;

  private interp: InterpTarget | null = null;
  private lastSnapshot: WorldSnapshot | null = null;

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

  /** Smooth sub-tick position for rendering (matches server tick + visual interpolation). */
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

  onServerSnapshot(world: WorldSnapshot) {
    const local = world.players.find((p) => p.id === this.localId);
    if (local) {
      this.localSpeedMult = local.speedMultiplier;
      const errX = local.x - this.predX;
      const errY = local.y - this.predY;
      const dist = Math.hypot(errX, errY);

      // Only hard-snap on large desync — small drift is normal between 30Hz ticks
      if (dist > 90) {
        this.predX = local.x;
        this.predY = local.y;
        this.predAccumulator = 0;
      }
    }

    if (this.lastSnapshot) {
      this.interp = {
        from: this.lastSnapshot,
        to: world,
        receivedAt: performance.now(),
      };
    }
    this.lastSnapshot = world;
  }

  getRenderState(): RenderState | null {
    if (!this.lastSnapshot) return null;

    const players: RenderPlayer[] = [];
    const bullets: RenderBullet[] = this.lastSnapshot.bullets.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      angle: b.angle,
      team: b.team,
      kind: b.kind,
    }));

    const powerups: RenderPowerup[] = (this.lastSnapshot.powerups ?? []).map((pu) => ({
      id: pu.id,
      kind: pu.kind,
      x: pu.x,
      y: pu.y,
    }));

    const t = this.interp
      ? clamp((performance.now() - this.interp.receivedAt) / TICK_MS, 0, 1)
      : 1;

    for (const p of this.lastSnapshot.players) {
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
        const interpPos = this.interpolatePlayer(p.id, t);
        players.push({
          id: p.id,
          name: p.name,
          team: p.team,
          x: interpPos?.x ?? p.x,
          y: interpPos?.y ?? p.y,
          angle: interpPos?.angle ?? p.angle,
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
    t: number,
  ): { x: number; y: number; angle: number } | null {
    if (!this.interp) return null;
    const fromP = this.interp.from.players.find((p) => p.id === id);
    const toP = this.interp.to.players.find((p) => p.id === id);
    if (!fromP || !toP) return null;
    return {
      x: fromP.x + (toP.x - fromP.x) * t,
      y: fromP.y + (toP.y - fromP.y) * t,
      angle: lerpAngle(fromP.angle, toP.angle, t),
    };
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
  }
}
