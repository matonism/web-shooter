import { TICK_RATE } from "../shared/constants.ts";
import { RACE_PHYSICS } from "../shared/raceConstants.ts";
import { RACE_LEVEL } from "../shared/raceLevel.ts";
import { getRaceRespawnPosition } from "../shared/raceRespawn.ts";
import {
  racerOverlapsCheckpoint,
  racerOverlapsFlag,
  racerInHazard,
  stepRacer,
  type RacerBody,
} from "../shared/racePhysics.ts";
import {
  DEFAULT_RACE_SETTINGS,
  type RaceSettings,
} from "../shared/raceSettings.ts";
import type {
  LobbyPlayer,
  MatchWinner,
  PlayerInput,
  RacePositionPayload,
  RaceRacerState,
  RaceWorldSnapshot,
  Team,
} from "../shared/types.ts";
import type { RoomSimulation } from "./roomSimulation.ts";
import { computeRaceBotInput } from "./raceAi.ts";

const RACER_COLORS = ["#ff3366", "#33ccff", "#ffd700", "#bb66ff", "#44ffcc", "#ff9933"];

interface InternalRacer {
  id: string;
  name: string;
  team: Team | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  finished: boolean;
  finishTimeMs: number | null;
  hasCheckpoint: boolean;
  isBot: boolean;
  color: string;
  slotIndex: number;
  respawnCount: number;
  lastInputSeq: number;
  displayX: number | null;
  displayY: number | null;
  displayVx: number | null;
  displayVy: number | null;
  displayGrounded: boolean | null;
  pendingInputs: PlayerInput[];
  lastInput: PlayerInput | null;
}

export class RaceSimulation implements RoomSimulation {
  readonly gameId = "race" as const;
  tick = 0;
  matchWinner: MatchWinner | null = null;
  racers = new Map<string, InternalRacer>();
  settings: RaceSettings = { ...DEFAULT_RACE_SETTINGS };
  private countdownUntilTick = 0;
  private raceStartedAt = 0;

  setRaceSettings(settings: RaceSettings) {
    this.settings = { ...settings };
  }

  reset() {
    this.tick = 0;
    this.matchWinner = null;
    this.countdownUntilTick = RACE_PHYSICS.countdownSeconds * TICK_RATE;
    this.raceStartedAt = 0;
    let i = 0;
    for (const racer of this.racers.values()) {
      this.respawnRacer(racer, i++, false);
    }
  }

  addPlayer(id: string, name: string, isBot = false) {
    const color = RACER_COLORS[this.racers.size % RACER_COLORS.length]!;
    const slotIndex = this.racers.size;
    this.racers.set(id, {
      id,
      name,
      team: null,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      grounded: false,
      finished: false,
      finishTimeMs: null,
      hasCheckpoint: false,
      isBot,
      color,
      slotIndex,
      respawnCount: 0,
      lastInputSeq: 0,
      displayX: null,
      displayY: null,
      displayVx: null,
      displayVy: null,
      displayGrounded: null,
      pendingInputs: [],
      lastInput: null,
    });
    this.respawnRacer(this.racers.get(id)!, slotIndex, false);
  }

  removePlayer(id: string) {
    this.racers.delete(id);
  }

  setConnected(_id: string, _connected: boolean) {}

  remapPlayerId(oldId: string, newId: string) {
    const r = this.racers.get(oldId);
    if (!r) return;
    r.id = newId;
    this.racers.delete(oldId);
    this.racers.set(newId, r);
  }

  assignTeam(id: string, team: Team): boolean {
    const r = this.racers.get(id);
    if (!r) return false;
    r.team = team;
    return true;
  }

  queueInput(id: string, input: PlayerInput) {
    const r = this.racers.get(id);
    if (!r || r.finished) return;
    r.pendingInputs.push(input);
    if (r.pendingInputs.length > 12) r.pendingInputs.shift();
    r.lastInput = input;
  }

  /** Relay client render position to other players (display only — not sim authority). */
  setDisplayPosition(id: string, pos: RacePositionPayload) {
    const r = this.racers.get(id);
    if (!r || r.finished) return;
    r.displayX = pos.x;
    r.displayY = pos.y;
    r.displayVx = pos.vx;
    r.displayVy = pos.vy;
    r.displayGrounded = pos.grounded;
  }

  step() {
    if (this.matchWinner) return;
    this.tick += 1;

    const dt = 1 / TICK_RATE;
    const inCountdown = this.tick < this.countdownUntilTick;

    if (inCountdown) {
      for (const racer of this.racers.values()) {
        if (racer.finished) continue;
        const body: RacerBody = {
          x: racer.x,
          y: racer.y,
          vx: 0,
          vy: racer.vy,
          grounded: racer.grounded,
        };
        const next = stepRacer(body, { dx: 0, jump: false }, RACE_LEVEL, dt);
        racer.x = next.x;
        racer.y = next.y;
        racer.vx = 0;
        racer.vy = next.vy;
        racer.grounded = next.grounded;
      }
      return;
    }

    if (this.raceStartedAt === 0) {
      this.raceStartedAt = Date.now();
    }

    for (const racer of this.racers.values()) {
      if (racer.finished) continue;

      if (racer.isBot) {
        const input = computeRaceBotInput(racer, RACE_LEVEL);
        racer.pendingInputs.push(input);
        racer.lastInput = input;
      }

      const input = racer.pendingInputs.shift() ?? racer.lastInput;

      const moveDx = input?.dx ?? 0;
      const jump = Boolean(input?.fire);
      if (input) {
        racer.lastInputSeq = input.seq;
      }

      const body: RacerBody = {
        x: racer.x,
        y: racer.y,
        vx: racer.vx,
        vy: racer.vy,
        grounded: racer.grounded,
      };

      const next = stepRacer(body, { dx: moveDx, jump }, RACE_LEVEL, dt);
      racer.x = next.x;
      racer.y = next.y;
      racer.vx = next.vx;
      racer.vy = next.vy;
      racer.grounded = next.grounded;

      if (racerOverlapsCheckpoint(racer.x, racer.y, RACE_LEVEL)) {
        racer.hasCheckpoint = true;
      }

      if (
        racer.y > RACE_LEVEL.killY ||
        racerInHazard(racer.x, racer.y, RACE_LEVEL)
      ) {
        this.respawnRacer(racer, racer.slotIndex, true);
        continue;
      }

      if (racerOverlapsFlag(racer.x, racer.y, RACE_LEVEL)) {
        racer.finished = true;
        racer.finishTimeMs = Date.now() - this.raceStartedAt;
        this.onRacerFinished(racer);
      }
    }
  }

  canStart(lobby: LobbyPlayer[]): boolean {
    if (lobby.length === 1) return true;
    if (this.settings.scoringMode === "team") {
      const teams = new Set(lobby.filter((p) => p.team).map((p) => p.team));
      return lobby.length >= 2 && teams.size >= 2;
    }
    return lobby.length >= 2;
  }

  snapshot(): RaceWorldSnapshot {
    const racers: RaceRacerState[] = [...this.racers.values()].map((r) => ({
      id: r.id,
      name: r.name,
      team: r.team,
      x: r.x,
      y: r.y,
      vx: r.vx,
      vy: r.vy,
      grounded: r.grounded,
      finished: r.finished,
      finishTimeMs: r.finishTimeMs,
      hasCheckpoint: r.hasCheckpoint,
      respawnCount: r.respawnCount,
      spawnSlot: r.slotIndex,
      color: r.color,
      lastInputSeq: r.lastInputSeq,
      displayX: r.displayX,
      displayY: r.displayY,
      displayVx: r.displayVx,
      displayVy: r.displayVy,
      displayGrounded: r.displayGrounded,
    }));

    const ticksLeft = Math.max(0, this.countdownUntilTick - this.tick);
    const countdownSeconds =
      ticksLeft > 0 ? Math.ceil(ticksLeft / TICK_RATE) : 0;

    return {
      tick: this.tick,
      timestamp: Date.now(),
      gameId: "race",
      racers,
      countdownSeconds,
      settings: this.settings,
      levelWidth: RACE_LEVEL.widthPx,
      levelHeight: RACE_LEVEL.heightPx,
      flagX: RACE_LEVEL.flagX,
      checkpointX: RACE_LEVEL.checkpoint?.x ?? null,
    };
  }

  private respawnRacer(racer: InternalRacer, slotIndex: number, fromDeath: boolean) {
    if (fromDeath) {
      racer.respawnCount += 1;
      const pos = getRaceRespawnPosition(
        RACE_LEVEL,
        slotIndex,
        racer.hasCheckpoint,
      );
      racer.x = pos.x;
      racer.y = pos.y;
    } else {
      const slot =
        RACE_LEVEL.startSlots[slotIndex % RACE_LEVEL.startSlots.length] ??
        RACE_LEVEL.startSlots[0]!;
      racer.x = slot.x;
      racer.y = slot.y;
      racer.respawnCount = 0;
      racer.finished = false;
      racer.finishTimeMs = null;
      racer.hasCheckpoint = false;
    }

    racer.vx = 0;
    racer.vy = 0;
    racer.grounded = false;
    racer.slotIndex = slotIndex;
    racer.pendingInputs = [];
    racer.displayX = racer.x;
    racer.displayY = racer.y;
    racer.displayVx = 0;
    racer.displayVy = 0;
    racer.displayGrounded = false;
  }

  private onRacerFinished(racer: InternalRacer) {
    if (this.matchWinner) return;

    const finished = [...this.racers.values()].filter((r) => r.finished);

    // Race ends when everyone has finished except one (last place still running)
    if (finished.length < this.racers.size - 1) return;

    if (this.settings.scoringMode === "team") {
      const first = finished.sort(
        (a, b) => (a.finishTimeMs ?? 999999) - (b.finishTimeMs ?? 999999),
      )[0];
      if (first?.team) {
        this.matchWinner = { kind: "team", team: first.team };
        return;
      }
    }

    const first = finished.sort(
      (a, b) => (a.finishTimeMs ?? 999999) - (b.finishTimeMs ?? 999999),
    )[0];
    if (!first) return;

    this.matchWinner = {
      kind: "player",
      playerId: first.id,
      name: first.name,
    };
  }
}
