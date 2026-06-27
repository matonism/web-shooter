import type { PlayerInput, SnakeWorldSnapshot } from "@shared/types";

export class SnakeClientGame {
  private localId = "";
  private keys = { up: false, down: false, left: false, right: false };
  private inputSeq = 0;
  private touch = { enabled: false, moveX: 0, moveY: 0 };
  private pulse = { moveX: 0, moveY: 0, framesLeft: 0 };
  private lastSnapshot: SnakeWorldSnapshot | null = null;

  setLocalId(id: string) {
    this.localId = id;
  }

  enableTouchControls(enabled: boolean) {
    this.touch.enabled = enabled;
  }

  setTouchMove(moveX: number, moveY: number) {
    this.touch.moveX = moveX;
    this.touch.moveY = moveY;
  }

  pulseDirection(moveX: number, moveY: number, frames = 5) {
    this.pulse = { moveX, moveY, framesLeft: frames };
  }

  bindInput() {
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
  }

  buildInput(): PlayerInput {
    let dx = 0;
    let dy = 0;
    if (this.keys.up) dy -= 1;
    if (this.keys.down) dy += 1;
    if (this.keys.left) dx -= 1;
    if (this.keys.right) dx += 1;

    if (this.pulse.framesLeft > 0) {
      dx = this.pulse.moveX;
      dy = this.pulse.moveY;
      this.pulse.framesLeft -= 1;
    } else if (this.touch.enabled) {
      dx += this.touch.moveX;
      dy += this.touch.moveY;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
    }

    this.inputSeq += 1;
    return { seq: this.inputSeq, dx, dy, angle: 0, fire: false, bomb: false };
  }

  onServerSnapshot(world: SnakeWorldSnapshot) {
    this.lastSnapshot = world;
  }

  getSnapshot(): SnakeWorldSnapshot | null {
    return this.lastSnapshot;
  }

  getLocalId() {
    return this.localId;
  }
}
