import { SNAKE_GRID } from "../shared/snakeConstants.ts";
import type { GridCell } from "../shared/types.ts";

type Direction = "up" | "down" | "left" | "right";

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

function stepCell(head: GridCell, dir: Direction): GridCell {
  switch (dir) {
    case "up":
      return { x: head.x, y: head.y - 1 };
    case "down":
      return { x: head.x, y: head.y + 1 };
    case "left":
      return { x: head.x - 1, y: head.y };
    case "right":
      return { x: head.x + 1, y: head.y };
  }
}

function hitsWall(cell: GridCell): boolean {
  return (
    cell.x < 0 ||
    cell.y < 0 ||
    cell.x >= SNAKE_GRID.cols ||
    cell.y >= SNAKE_GRID.rows
  );
}

interface SnakeBody {
  id: string;
  body: GridCell[];
  direction: Direction;
  alive: boolean;
}

export function pickSnakeBotDirection(
  self: SnakeBody,
  all: SnakeBody[],
  pellets: GridCell[],
): Direction {
  const head = self.body[0];
  if (!head || !self.alive) return self.direction;

  const safe = DIRECTIONS.filter((dir) => {
    if (OPPOSITE[dir] === self.direction) return false;
    const next = stepCell(head, dir);
    if (hitsWall(next)) return false;
    for (const snake of all) {
      if (!snake.alive) continue;
      const start = snake.id === self.id ? 1 : 0;
      for (let i = start; i < snake.body.length; i++) {
        const seg = snake.body[i]!;
        if (seg.x === next.x && seg.y === next.y) return false;
      }
    }
    return true;
  });

  if (safe.length === 0) return self.direction;

  let nearestPellet: GridCell | null = null;
  let bestPelletDist = Infinity;
  for (const p of pellets) {
    const d = Math.abs(p.x - head.x) + Math.abs(p.y - head.y);
    if (d < bestPelletDist) {
      bestPelletDist = d;
      nearestPellet = p;
    }
  }

  const scoreDir = (dir: Direction): number => {
    const next = stepCell(head, dir);
    let score = Math.random() * 0.4;
    if (nearestPellet) {
      const dist =
        Math.abs(nearestPellet.x - next.x) + Math.abs(nearestPellet.y - next.y);
      score += (bestPelletDist - dist) * 2;
    }
    for (const snake of all) {
      if (!snake.alive || snake.id === self.id) continue;
      const eHead = snake.body[0];
      if (!eHead) continue;
      const d = Math.abs(eHead.x - next.x) + Math.abs(eHead.y - next.y);
      if (d < 3) score -= 4;
    }
    return score;
  };

  safe.sort((a, b) => scoreDir(b) - scoreDir(a));
  return safe[0] ?? self.direction;
}

export function directionToInput(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case "up":
      return { dx: 0, dy: -1 };
    case "down":
      return { dx: 0, dy: 1 };
    case "left":
      return { dx: -1, dy: 0 };
    case "right":
      return { dx: 1, dy: 0 };
  }
}
