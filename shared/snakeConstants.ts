export const SNAKE_GRID = {
  cols: 40,
  rows: 26,
  cell: 30,
} as const;

export const SNAKE = {
  /** Server ticks between each snake step */
  moveEveryTicks: 5,
  initialLength: 3,
  maxPellets: 4,
  /** Seconds of countdown before snakes move */
  countdownSeconds: 3,
  colors: ["#ff3366", "#33ccff", "#ffd700", "#bb66ff", "#44ffcc", "#ff9933"],
} as const;

export type SnakeDirection = "up" | "down" | "left" | "right";

export interface SnakeSpawnSlot {
  x: number;
  y: number;
  direction: SnakeDirection;
}

/** Evenly space snakes vertically; alternate left/right sides. */
export function snakeSpawnSlots(playerCount: number): SnakeSpawnSlot[] {
  const count = Math.max(1, Math.min(playerCount, 6));
  const marginY = 4;
  const marginX = 3;
  const slots: SnakeSpawnSlot[] = [];

  for (let i = 0; i < count; i++) {
    const y =
      marginY +
      Math.floor(((SNAKE_GRID.rows - marginY * 2) * (i + 0.5)) / count);
    const onLeft = i % 2 === 0;
    slots.push({
      x: onLeft ? marginX : SNAKE_GRID.cols - marginX - 1,
      y,
      direction: onLeft ? "right" : "left",
    });
  }

  return slots;
}

export const SNAKE_ARENA = {
  width: SNAKE_GRID.cols * SNAKE_GRID.cell,
  height: SNAKE_GRID.rows * SNAKE_GRID.cell,
} as const;
