import { randomUUID } from "node:crypto";
import { TICK_RATE } from "../shared/constants.ts";
import { SNAKE, SNAKE_GRID, snakeSpawnSlots, type SnakeSpawnSlot } from "../shared/snakeConstants.ts";
import type {
  GridCell,
  LobbyPlayer,
  MatchWinner,
  PlayerInput,
  SnakePelletState,
  SnakePlayerState,
  SnakeWorldSnapshot,
} from "../shared/types.ts";
import type { RoomSimulation } from "./roomSimulation.ts";
import { directionToInput, pickSnakeBotDirection } from "./snakeAi.ts";

type Direction = SnakeSpawnSlot["direction"];

interface InternalSnake {
  id: string;
  name: string;
  body: GridCell[];
  direction: Direction;
  queuedDirection: Direction | null;
  alive: boolean;
  score: number;
  color: string;
  isBot: boolean;
  pendingInput: PlayerInput | null;
  lastInput: PlayerInput | null;
}

interface InternalPellet {
  id: string;
  x: number;
  y: number;
}

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export class SnakeSimulation implements RoomSimulation {
  readonly gameId = "snake" as const;
  tick = 0;
  snakes = new Map<string, InternalSnake>();
  pellets: InternalPellet[] = [];
  matchWinner: MatchWinner | null = null;
  private spawnSlots: SnakeSpawnSlot[] = [];
  private countdownUntilTick = 0;

  reset() {
    this.tick = 0;
    this.pellets = [];
    this.matchWinner = null;
    this.countdownUntilTick = SNAKE.countdownSeconds * TICK_RATE;
    this.spawnSlots = snakeSpawnSlots(this.snakes.size);
    let slot = 0;
    for (const snake of this.snakes.values()) {
      this.respawnSnake(snake, slot++);
    }
    while (this.pellets.length < SNAKE.maxPellets) {
      this.spawnPellet();
    }
  }

  addPlayer(id: string, name: string, isBot = false) {
    const color = SNAKE.colors[this.snakes.size % SNAKE.colors.length]!;
    this.snakes.set(id, {
      id,
      name,
      body: [],
      direction: "right",
      queuedDirection: null,
      alive: true,
      score: 0,
      color,
      isBot,
      pendingInput: null,
      lastInput: null,
    });
    this.spawnSlots = snakeSpawnSlots(this.snakes.size);
    this.respawnSnake(this.snakes.get(id)!, this.snakes.size - 1);
  }

  removePlayer(id: string) {
    this.snakes.delete(id);
    this.spawnSlots = snakeSpawnSlots(this.snakes.size);
    this.checkWinCondition();
  }

  setConnected(_id: string, _connected: boolean) {}

  remapPlayerId(oldId: string, newId: string) {
    const snake = this.snakes.get(oldId);
    if (!snake) return;
    snake.id = newId;
    this.snakes.delete(oldId);
    this.snakes.set(newId, snake);
  }

  assignTeam(_id: string, _team: unknown): boolean {
    return true;
  }

  queueInput(id: string, input: PlayerInput) {
    const snake = this.snakes.get(id);
    if (!snake || !snake.alive) return;
    snake.pendingInput = input;
    snake.lastInput = input;
  }

  step() {
    if (this.matchWinner) return;
    this.tick += 1;

    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      if (snake.isBot) {
        const dir = pickSnakeBotDirection(
          snake,
          [...this.snakes.values()],
          this.pellets.map((p) => ({ x: p.x, y: p.y })),
        );
        const { dx, dy } = directionToInput(dir);
        snake.pendingInput = { seq: 0, dx, dy, angle: 0, fire: false, bomb: false };
        snake.lastInput = snake.pendingInput;
      }
      const input = snake.pendingInput ?? snake.lastInput;
      if (input) this.applyDirectionInput(snake, input);
      snake.pendingInput = null;
    }

    if (this.tick < this.countdownUntilTick) return;

    if (this.tick % SNAKE.moveEveryTicks !== 0) return;

    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      if (snake.queuedDirection && snake.queuedDirection !== OPPOSITE[snake.direction]) {
        snake.direction = snake.queuedDirection;
      }
      snake.queuedDirection = null;
      this.advanceSnake(snake);
    }

    this.checkWinCondition();
  }

  canStart(lobby: LobbyPlayer[]): boolean {
    return lobby.length >= 1;
  }

  snapshot(): SnakeWorldSnapshot {
    const snakes: SnakePlayerState[] = [...this.snakes.values()].map((s) => ({
      id: s.id,
      name: s.name,
      body: s.body.map((c) => ({ ...c })),
      alive: s.alive,
      score: s.score,
      color: s.color,
    }));

    const pellets: SnakePelletState[] = this.pellets.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
    }));

    const ticksLeft = Math.max(0, this.countdownUntilTick - this.tick);
    const countdownSeconds =
      ticksLeft > 0 ? Math.ceil(ticksLeft / TICK_RATE) : 0;

    return {
      tick: this.tick,
      timestamp: Date.now(),
      gameId: "snake",
      snakes,
      pellets,
      countdownSeconds,
    };
  }

  private applyDirectionInput(snake: InternalSnake, input: PlayerInput) {
    const { dx, dy } = input;
    if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) return;
    const next: Direction =
      Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    if (next === snake.direction) return;
    if (next === OPPOSITE[snake.direction]) return;
    snake.queuedDirection = next;
  }

  private advanceSnake(snake: InternalSnake) {
    const head = snake.body[0]!;
    let nx = head.x;
    let ny = head.y;
    switch (snake.direction) {
      case "up":
        ny -= 1;
        break;
      case "down":
        ny += 1;
        break;
      case "left":
        nx -= 1;
        break;
      case "right":
        nx += 1;
        break;
    }

    if (this.hitsWall(nx, ny) || this.hitsBody(nx, ny, snake.id)) {
      snake.alive = false;
      return;
    }

    const newHead = { x: nx, y: ny };
    snake.body.unshift(newHead);

    const pelletIdx = this.pellets.findIndex((p) => p.x === nx && p.y === ny);
    if (pelletIdx >= 0) {
      this.pellets.splice(pelletIdx, 1);
      snake.score += 1;
      this.spawnPellet();
    } else {
      snake.body.pop();
    }
  }

  private hitsWall(x: number, y: number): boolean {
    return x < 0 || y < 0 || x >= SNAKE_GRID.cols || y >= SNAKE_GRID.rows;
  }

  private hitsBody(x: number, y: number, selfId: string): boolean {
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      const start = snake.id === selfId ? 1 : 0;
      for (let i = start; i < snake.body.length; i++) {
        const seg = snake.body[i]!;
        if (seg.x === x && seg.y === y) return true;
      }
    }
    return false;
  }

  private respawnSnake(snake: InternalSnake, slotIndex: number) {
    const slot = this.spawnSlots[slotIndex] ?? snakeSpawnSlots(this.snakes.size)[0]!;
    snake.direction = slot.direction;
    snake.queuedDirection = null;
    snake.alive = true;
    snake.score = 0;
    snake.body = [];
    for (let i = 0; i < SNAKE.initialLength; i++) {
      const cell = { x: slot.x, y: slot.y };
      switch (slot.direction) {
        case "right":
          cell.x -= i;
          break;
        case "left":
          cell.x += i;
          break;
        case "down":
          cell.y -= i;
          break;
        case "up":
          cell.y += i;
          break;
      }
      snake.body.push(cell);
    }
  }

  private spawnPellet() {
    const occupied = new Set<string>();
    for (const snake of this.snakes.values()) {
      for (const seg of snake.body) {
        occupied.add(`${seg.x},${seg.y}`);
      }
    }
    for (const pellet of this.pellets) {
      occupied.add(`${pellet.x},${pellet.y}`);
    }

    const open: GridCell[] = [];
    for (let y = 0; y < SNAKE_GRID.rows; y++) {
      for (let x = 0; x < SNAKE_GRID.cols; x++) {
        if (!occupied.has(`${x},${y}`)) open.push({ x, y });
      }
    }
    if (open.length === 0) return;

    const cell = open[Math.floor(Math.random() * open.length)]!;
    this.pellets.push({ id: randomUUID(), x: cell.x, y: cell.y });
  }

  private checkWinCondition() {
    if (this.matchWinner) return;
    if (this.tick < this.countdownUntilTick) return;
    const alive = [...this.snakes.values()].filter((s) => s.alive);
    if (alive.length === 1 && this.snakes.size >= 2) {
      const winner = alive[0]!;
      this.matchWinner = { kind: "player", playerId: winner.id, name: winner.name };
      return;
    }
    if (alive.length === 0 && this.snakes.size >= 2) {
      const best = [...this.snakes.values()].sort((a, b) => b.score - a.score)[0];
      if (best) {
        this.matchWinner = { kind: "player", playerId: best.id, name: best.name };
      }
    }
  }
}
