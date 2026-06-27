import { TICK_MS } from "@shared/constants";
import { RACE_NETCODE, RACE_VIEW } from "@shared/raceConstants";
import { RACE_LEVEL } from "@shared/raceLevel";
import { stepRacer, racerInHazard, type RacerBody } from "@shared/racePhysics";
import type { PlayerInput, RacePositionPayload, RaceRacerState, RaceWorldSnapshot } from "@shared/types";
import { clamp } from "./vector";

export interface RaceRenderState {
  world: RaceWorldSnapshot;
  localId: string;
  localDisplay: { x: number; y: number };
  remoteDisplay: Map<string, { x: number; y: number }>;
  camera: { x: number; y: number };
  showDebug: boolean;
  localPred: RacerBody;
}

interface BufferedSnapshot {
  world: RaceWorldSnapshot;
  receivedAt: number;
}

interface StoredInput {
  seq: number;
  dx: number;
  jump: boolean;
}

interface DisplaySample {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
}

interface RemoteRenderState {
  x: number;
  y: number;
  respawnCount: number;
}

/**
 * Race client networking — see docs/race-netcode-lessons.md
 *
 * LOCAL:  client-side prediction from inputs; resync only on respawn / hazard / vertical / large error.
 * REMOTE: interpolate relayed display positions between snapshots, then smooth render layer at 60fps.
 */
export class RaceClientGame {
  private localId = "";
  private keys = { left: false, right: false, jump: false };
  private touch = { enabled: false, moveX: 0, jump: false };
  private inputSeq = 0;

  private pred: RacerBody = { x: 0, y: 0, vx: 0, vy: 0, grounded: false };
  private predAccumulator = 0;
  private lastServerRespawnCount = 0;
  private inputHistory: StoredInput[] = [];

  private snapshotBuffer: BufferedSnapshot[] = [];
  private lastSnapshot: RaceWorldSnapshot | null = null;
  private lastAppliedTick = -1;

  private smoothCam = { x: 0, y: 0 };
  private camReady = false;
  private remoteRender = new Map<string, RemoteRenderState>();

  private static readonly TICK_S = TICK_MS / 1000;
  private static readonly CAMERA_SMOOTH_Y = 14;

  setLocalId(id: string) {
    this.localId = id;
  }

  enableTouchControls(enabled: boolean) {
    this.touch.enabled = enabled;
  }

  setTouchMove(moveX: number, _moveY: number) {
    this.touch.moveX = moveX;
  }

  setJumpPressed(jump: boolean) {
    this.touch.jump = jump;
  }

  bindInput() {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      switch (e.code) {
        case "KeyA":
        case "ArrowLeft":
          this.keys.left = down;
          break;
        case "KeyD":
        case "ArrowRight":
          this.keys.right = down;
          break;
        case "KeyW":
        case "ArrowUp":
        case "Space":
          this.keys.jump = down;
          break;
        default:
          return;
      }
      if (down) e.preventDefault();
    };
    window.addEventListener("keydown", (e) => onKey(e, true));
    window.addEventListener("keyup", (e) => onKey(e, false));
  }

  readInput(): { dx: number; jump: boolean } {
    let dx = 0;
    if (this.keys.left) dx -= 1;
    if (this.keys.right) dx += 1;
    let jump = this.keys.jump;
    if (this.touch.enabled) {
      dx += this.touch.moveX;
      if (Math.abs(dx) > 1) dx = dx > 0 ? 1 : -1;
      jump = jump || this.touch.jump;
    }
    return { dx, jump };
  }

  /** One physics tick — advances input sequence once (not per render frame). */
  commitInput(): PlayerInput {
    const { dx, jump } = this.readInput();
    this.inputSeq += 1;
    const input: PlayerInput = { seq: this.inputSeq, dx, dy: 0, angle: 0, fire: jump, bomb: false };
    this.inputHistory.push({ seq: input.seq, dx, jump });
    if (this.inputHistory.length > 96) this.inputHistory.shift();
    return input;
  }

  applyServerSnapshot(world: RaceWorldSnapshot) {
    if (world.tick === this.lastAppliedTick) return;
    this.lastAppliedTick = world.tick;

    this.snapshotBuffer.push({ world, receivedAt: performance.now() });
    if (this.snapshotBuffer.length > 24) this.snapshotBuffer.shift();

    const local = world.racers.find((r) => r.id === this.localId);
    if (local) this.reconcileLocalPlayer(local, world);

    this.lastSnapshot = world;
  }

  applyLocalPrediction(dt: number, onInput: (input: PlayerInput) => void): number {
    if ((this.lastSnapshot?.countdownSeconds ?? 0) > 0) return 0;

    this.predAccumulator += dt;
    let steps = 0;

    while (this.predAccumulator >= RaceClientGame.TICK_S) {
      this.predAccumulator -= RaceClientGame.TICK_S;
      const input = this.commitInput();
      this.pred = stepRacer(
        this.pred,
        { dx: input.dx, jump: input.fire },
        RACE_LEVEL,
        RaceClientGame.TICK_S,
      );
      onInput(input);
      steps += 1;
    }

    return steps;
  }

  /** Relay predicted render position — display only, not sim authority. */
  sendDisplayPosition(onSend: (pos: RacePositionPayload) => void) {
    if ((this.lastSnapshot?.countdownSeconds ?? 0) > 0) return;

    const display = this.getLocalDisplayPos();
    onSend({
      x: display.x,
      y: display.y,
      vx: this.pred.vx,
      vy: this.pred.vy,
      grounded: this.pred.grounded,
    });
  }

  getRenderState(dt: number, showDebug = false): RaceRenderState | null {
    if (!this.lastSnapshot) return null;

    const world = this.lastSnapshot;
    const localDisplay = this.getLocalDisplayPos();
    return {
      world,
      localId: this.localId,
      localDisplay,
      remoteDisplay: this.getRemoteDisplayPositions(dt),
      camera: this.updateCamera(
        localDisplay.x,
        localDisplay.y,
        world.levelWidth,
        world.levelHeight,
        dt,
      ),
      showDebug,
      localPred: { ...this.pred },
    };
  }

  getSnapshot(): RaceWorldSnapshot | null {
    return this.lastSnapshot;
  }

  getLocalId() {
    return this.localId;
  }

  resetFromRacer(x: number, y: number) {
    this.pred = { x, y, vx: 0, vy: 0, grounded: false };
    this.predAccumulator = 0;
    this.lastServerRespawnCount = 0;
    this.inputHistory = [];
    this.inputSeq = 0;
    this.snapshotBuffer = [];
    this.lastSnapshot = null;
    this.lastAppliedTick = -1;
    this.camReady = false;
    this.remoteRender.clear();
  }

  // ─── Local player ─────────────────────────────────────────────────────────

  private reconcileLocalPlayer(local: RaceRacerState, world: RaceWorldSnapshot) {
    this.trimInputHistory(local.lastInputSeq);

    if (world.countdownSeconds > 0) {
      this.hardResyncLocal(local);
      this.lastServerRespawnCount = local.respawnCount;
      return;
    }

    if (local.respawnCount !== this.lastServerRespawnCount) {
      this.lastServerRespawnCount = local.respawnCount;
      this.inputHistory = [];
      this.hardResyncLocal(local);
      return;
    }

    const replayed = this.simulateUnackedFrom(this.bodyFromRacer(local), local.lastInputSeq);
    const errY = replayed.y - this.pred.y;
    if (!this.shouldHardResyncLocal(local, replayed, errY)) return;

    this.pred = replayed;
    if (Math.abs(errY) > 2) this.predAccumulator = 0;
  }

  /**
   * Resync only for large total error, meaningful vertical error, or server hazard.
   * Ignore one-tick grounded flag differences — they flicker at platform edges.
   */
  private shouldHardResyncLocal(
    local: RaceRacerState,
    replayed: RacerBody,
    errY: number,
  ): boolean {
    const dist = Math.hypot(replayed.x - this.pred.x, errY);

    if (dist > RACE_NETCODE.hardSnapPx) return true;
    if (Math.abs(errY) > RACE_NETCODE.verticalMismatchPx) return true;
    if (racerInHazard(local.x, local.y, RACE_LEVEL)) return true;

    return false;
  }

  private hardResyncLocal(local: RaceRacerState) {
    this.pred = {
      x: local.x,
      y: local.y,
      vx: local.vx,
      vy: local.vy,
      grounded: local.grounded,
    };
    this.predAccumulator = 0;
  }

  private bodyFromRacer(r: RaceRacerState): RacerBody {
    return { x: r.x, y: r.y, vx: r.vx, vy: r.vy, grounded: r.grounded };
  }

  private simulateUnackedFrom(body: RacerBody, ackSeq: number): RacerBody {
    let next = body;
    for (const stored of this.inputHistory) {
      if (stored.seq <= ackSeq) continue;
      next = stepRacer(
        next,
        { dx: stored.dx, jump: stored.jump },
        RACE_LEVEL,
        RaceClientGame.TICK_S,
      );
    }
    return next;
  }

  private trimInputHistory(ackSeq: number) {
    while (this.inputHistory.length > 0 && this.inputHistory[0]!.seq <= ackSeq) {
      this.inputHistory.shift();
    }
  }

  private getLocalDisplayPos(): { x: number; y: number } {
    const t = this.predAccumulator;
    // Lock Y only when truly at rest vertically — avoids jitter from grounded flicker.
    const lockY = Math.abs(this.pred.vy) < 1;
    return {
      x: this.pred.x + this.pred.vx * t,
      y: lockY ? this.pred.y : this.pred.y + this.pred.vy * t,
    };
  }

  // ─── Remote ghosts: interpolate snapshots → smooth render ───────────────

  private getRemoteDisplayPositions(dt: number): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    const latest = this.snapshotBuffer[this.snapshotBuffer.length - 1];
    if (!latest) return out;

    const seen = new Set<string>();
    for (const r of latest.world.racers) {
      if (r.id === this.localId) continue;
      seen.add(r.id);
      const target = this.interpolateRemoteTarget(r.id);
      out.set(r.id, this.smoothRemoteRender(r, target, dt));
    }

    for (const id of this.remoteRender.keys()) {
      if (!seen.has(id)) this.remoteRender.delete(id);
    }

    return out;
  }

  /** Blend last two snapshot display samples, then lightly extrapolate to now. */
  private interpolateRemoteTarget(id: string): { x: number; y: number } {
    const buf = this.snapshotBuffer;
    const latest = buf[buf.length - 1]!;
    const racer = latest.world.racers.find((r) => r.id === id);
    if (!racer) return { x: 0, y: 0 };
    if (racer.finished) return this.displaySample(racer);

    if (buf.length < 2) {
      return this.extrapolateDisplaySample(this.displaySample(racer), latest.receivedAt);
    }

    const prev = buf[buf.length - 2]!;
    const prevRacer = prev.world.racers.find((r) => r.id === id);
    if (!prevRacer) {
      return this.extrapolateDisplaySample(this.displaySample(racer), latest.receivedAt);
    }

    const a = this.displaySample(prevRacer);
    const b = this.displaySample(racer);
    const span = Math.max(latest.receivedAt - prev.receivedAt, 1);
    const now = performance.now();
    const t = clamp((now - prev.receivedAt) / span, 0, RACE_NETCODE.remoteInterpMaxLead);

    let x = a.x + (b.x - a.x) * Math.min(t, 1);
    let y = a.y + (b.y - a.y) * Math.min(t, 1);

    if (t > 1) {
      const extraS = ((t - 1) * span) / 1000;
      x += b.vx * extraS;
      if (!b.grounded || Math.abs(b.vy) >= 8) y += b.vy * extraS;
    }

    return { x, y };
  }

  private displaySample(r: RaceRacerState): DisplaySample {
    if (r.displayX != null && r.displayY != null) {
      return {
        x: r.displayX,
        y: r.displayY,
        vx: r.displayVx ?? r.vx,
        vy: r.displayVy ?? r.vy,
        grounded: r.displayGrounded ?? r.grounded,
      };
    }
    return { x: r.x, y: r.y, vx: r.vx, vy: r.vy, grounded: r.grounded };
  }

  private extrapolateDisplaySample(
    sample: DisplaySample,
    receivedAt: number,
  ): { x: number; y: number } {
    const ageS = Math.min(
      (performance.now() - receivedAt) / 1000,
      RACE_NETCODE.remoteExtrapMs / 1000,
    );
    return {
      x: sample.x + sample.vx * ageS,
      y:
        sample.grounded && Math.abs(sample.vy) < 8
          ? sample.y
          : sample.y + sample.vy * ageS,
    };
  }

  /** Ease render position toward network target — never draw raw 30Hz network state. */
  private smoothRemoteRender(
    r: RaceRacerState,
    target: { x: number; y: number },
    dt: number,
  ): { x: number; y: number } {
    const prev = this.remoteRender.get(r.id);
    if (!prev || r.respawnCount !== prev.respawnCount) {
      this.remoteRender.set(r.id, { x: target.x, y: target.y, respawnCount: r.respawnCount });
      return target;
    }

    const dist = Math.hypot(target.x - prev.x, target.y - prev.y);
    if (dist > RACE_NETCODE.remoteSnapPx) {
      this.remoteRender.set(r.id, { x: target.x, y: target.y, respawnCount: r.respawnCount });
      return target;
    }

    const k = 1 - Math.exp(-RACE_NETCODE.remoteSmoothRate * dt);
    const next = {
      x: prev.x + (target.x - prev.x) * k,
      y: prev.y + (target.y - prev.y) * k,
    };
    this.remoteRender.set(r.id, { x: next.x, y: next.y, respawnCount: r.respawnCount });
    return next;
  }

  // ─── Camera ───────────────────────────────────────────────────────────────

  private updateCamera(
    focusX: number,
    focusY: number,
    levelWidth: number,
    levelHeight: number,
    dt: number,
  ): { x: number; y: number } {
    const target = {
      x: clamp(focusX - RACE_VIEW.width / 2, 0, Math.max(0, levelWidth - RACE_VIEW.width)),
      y: clamp(focusY - RACE_VIEW.height / 2, 0, Math.max(0, levelHeight - RACE_VIEW.height)),
    };

    if (!this.camReady) {
      this.smoothCam = { ...target };
      this.camReady = true;
      return this.smoothCam;
    }

    this.smoothCam.x = target.x;
    const k = 1 - Math.exp(-RaceClientGame.CAMERA_SMOOTH_Y * dt);
    this.smoothCam.y += (target.y - this.smoothCam.y) * k;
    return this.smoothCam;
  }
}
