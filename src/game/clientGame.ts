import { ARENA, PLAYER, TICK_MS } from "@shared/constants";
import type { PlayerInput, PlayerState, WorldSnapshot } from "@shared/types";
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
}

export interface RenderBullet {
  id: string;
  x: number;
  y: number;
  angle: number;
  team: "red" | "blue";
}

export interface RenderState {
  players: RenderPlayer[];
  bullets: RenderBullet[];
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

  /** Predicted local position */
  private predX = 0;
  private predY = 0;
  private predAngle = 0;

  /** Soft correction toward server position (decays each frame) */
  private corrX = 0;
  private corrY = 0;

  private interp: InterpTarget | null = null;
  private lastSnapshot: WorldSnapshot | null = null;

  setLocalId(id: string) {
    this.localId = id;
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
      }
    };
    window.addEventListener("keydown", (e) => onKey(e, true));
    window.addEventListener("keyup", (e) => onKey(e, false));

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = ARENA.width / rect.width;
      const scaleY = ARENA.height / rect.height;
      this.mouseWorld.x = (e.clientX - rect.left) * scaleX;
      this.mouseWorld.y = (e.clientY - rect.top) * scaleY;
    });

    canvas.addEventListener("mousedown", () => {
      this.firing = true;
    });
    window.addEventListener("mouseup", () => {
      this.firing = false;
    });
  }

  buildInput(): PlayerInput {
    let dx = 0;
    let dy = 0;
    if (this.keys.up) dy -= 1;
    if (this.keys.down) dy += 1;
    if (this.keys.left) dx -= 1;
    if (this.keys.right) dx += 1;

    const angle = Math.atan2(
      this.mouseWorld.y - this.predY,
      this.mouseWorld.x - this.predX,
    );

    this.inputSeq += 1;
    return {
      seq: this.inputSeq,
      dx,
      dy,
      angle,
      fire: this.firing,
    };
  }

  applyLocalPrediction(input: PlayerInput, dt: number) {
    this.predAngle = input.angle;
    const len = Math.hypot(input.dx, input.dy);
    if (len > 0.01) {
      const nx = input.dx / len;
      const ny = input.dy / len;
      this.predX = clamp(
        this.predX + nx * PLAYER.speed * dt,
        PLAYER.radius,
        ARENA.width - PLAYER.radius,
      );
      this.predY = clamp(
        this.predY + ny * PLAYER.speed * dt,
        PLAYER.radius,
        ARENA.height - PLAYER.radius,
      );
    }

    // Decay server correction smoothly instead of snapping each tick
    const decay = 1 - Math.pow(0.001, dt);
    this.corrX *= 1 - decay;
    this.corrY *= 1 - decay;
  }

  /** Display position for local player (prediction + soft correction) */
  private localDisplayX(): number {
    return this.predX + this.corrX;
  }

  private localDisplayY(): number {
    return this.predY + this.corrY;
  }

  onServerSnapshot(world: WorldSnapshot) {
    const local = world.players.find((p) => p.id === this.localId);
    if (local) {
      const errX = local.x - this.predX;
      const errY = local.y - this.predY;
      const dist = Math.hypot(errX, errY);

      if (dist > 80) {
        // Large desync — snap (teleport, lag spike, etc.)
        this.predX = local.x;
        this.predY = local.y;
        this.corrX = 0;
        this.corrY = 0;
      } else if (dist > 0.5) {
        // Absorb error into correction buffer; render catches up smoothly
        this.corrX += errX * 0.35;
        this.corrY += errY * 0.35;
      }
      // Keep local aim from mouse input — don't overwrite predAngle from server
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
    }));

    const t = this.interp
      ? clamp((performance.now() - this.interp.receivedAt) / TICK_MS, 0, 1)
      : 1;

    for (const p of this.lastSnapshot.players) {
      if (p.id === this.localId) {
        players.push({
          id: p.id,
          name: p.name,
          team: p.team,
          x: this.localDisplayX(),
          y: this.localDisplayY(),
          angle: this.predAngle,
          hp: p.hp,
          maxHp: p.maxHp,
          eliminated: p.eliminated,
          isLocal: true,
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
        });
      }
    }

    return { players, bullets };
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
    this.corrX = 0;
    this.corrY = 0;
  }
}
