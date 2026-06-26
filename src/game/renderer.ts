import { ARENA, BULLET, PLAYER, TEAM_COLORS } from "@shared/constants";
import type { RenderBullet, RenderPlayer, RenderState } from "./clientGame";

export function drawGame(ctx: CanvasRenderingContext2D, state: RenderState) {
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);
  drawArena(ctx);
  for (const b of state.bullets) drawBullet(ctx, b);
  for (const p of state.players) drawPlayer(ctx, p);
}

function drawArena(ctx: CanvasRenderingContext2D) {
  const { width, height } = ARENA;

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0c1018");
  bg.addColorStop(1, "#101828");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(0, 229, 255, 0.08)";
  ctx.lineWidth = 1;
  const grid = 40;
  for (let x = 0; x <= width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  ctx.fillStyle = "rgba(255, 51, 102, 0.06)";
  ctx.fillRect(0, 0, width * 0.15, height);
  ctx.fillStyle = "rgba(51, 204, 255, 0.06)";
  ctx.fillRect(width * 0.85, 0, width * 0.15, height);
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: RenderPlayer) {
  if (p.eliminated) {
    ctx.globalAlpha = 0.35;
  }

  const colors = TEAM_COLORS[p.team];
  const r = PLAYER.radius;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = p.isLocal ? 16 : 10;
  ctx.fillStyle = colors.fill;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(r + 4, 0);
  ctx.lineTo(r - 6, -5);
  ctx.lineTo(r - 6, 5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;

  if (p.isLocal) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  const barW = 36;
  const barH = 4;
  const bx = p.x - barW / 2;
  const by = p.y - r - 12;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = colors.fill;
  ctx.fillRect(bx, by, barW * (p.hp / p.maxHp), barH);
}

function drawBullet(ctx: CanvasRenderingContext2D, b: RenderBullet) {
  const colors = TEAM_COLORS[b.team];
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.shadowColor = colors.bullet;
  ctx.shadowBlur = 8;
  ctx.fillStyle = colors.bullet;
  ctx.beginPath();
  ctx.ellipse(0, 0, BULLET.radius * 2, BULLET.radius, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
