import { SNAKE_GRID } from "@shared/snakeConstants";
import type { SnakeWorldSnapshot } from "@shared/types";

export function drawSnakeGame(ctx: CanvasRenderingContext2D, world: SnakeWorldSnapshot, localId: string) {
  const { cell } = SNAKE_GRID;
  const w = SNAKE_GRID.cols * cell;
  const h = SNAKE_GRID.rows * cell;

  ctx.fillStyle = "#0a0e18";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= SNAKE_GRID.cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cell, 0);
    ctx.lineTo(x * cell, h);
    ctx.stroke();
  }
  for (let y = 0; y <= SNAKE_GRID.rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cell);
    ctx.lineTo(w, y * cell);
    ctx.stroke();
  }

  for (const pellet of world.pellets) {
    const px = pellet.x * cell + cell / 2;
    const py = pellet.y * cell + cell / 2;
    ctx.fillStyle = "#ffd700";
    ctx.shadowColor = "#ffe566";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(px, py, cell * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  for (const snake of world.snakes) {
    if (!snake.alive) continue;
    const isLocal = snake.id === localId;
    for (let i = snake.body.length - 1; i >= 0; i--) {
      const seg = snake.body[i]!;
      const isHead = i === 0;
      const inset = isHead ? 2 : 4;
      ctx.fillStyle = snake.color;
      if (isLocal) {
        ctx.shadowColor = snake.color;
        ctx.shadowBlur = isHead ? 12 : 4;
      }
      ctx.fillRect(
        seg.x * cell + inset,
        seg.y * cell + inset,
        cell - inset * 2,
        cell - inset * 2,
      );
      ctx.shadowBlur = 0;

      if (isHead) {
        ctx.fillStyle = "#fff";
        const eye = cell * 0.12;
        ctx.fillRect(seg.x * cell + cell * 0.28, seg.y * cell + cell * 0.3, eye, eye);
        ctx.fillRect(seg.x * cell + cell * 0.58, seg.y * cell + cell * 0.3, eye, eye);
      }
    }
  }

  for (const snake of world.snakes) {
    if (snake.alive) continue;
    const head = snake.body[0];
    if (!head) continue;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "bold 11px Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("OUT", head.x * cell + cell / 2, head.y * cell + cell / 2 + 4);
  }

  if (world.countdownSeconds > 0) {
    ctx.fillStyle = "rgba(6, 8, 16, 0.55)";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#44ffcc";
    ctx.font = "bold 72px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#44ffcc";
    ctx.shadowBlur = 24;
    ctx.fillText(String(world.countdownSeconds), w / 2, h / 2 - 12);
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "600 16px Nunito, sans-serif";
    ctx.fillText("Get ready…", w / 2, h / 2 + 44);
    ctx.textBaseline = "alphabetic";
  }
}
