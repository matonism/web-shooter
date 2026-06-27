import { ARENA, BULLET, PLAYER, POWERUP, TEAM_COLORS } from "@shared/constants";
import { POWERUP_DEFS } from "@shared/powerups";
import { RESUPPLY_ZONES } from "@shared/shooterResupply";
import type { RenderBomb, RenderBullet, RenderPlayer, RenderPowerup, RenderState } from "./clientGame";

export function drawGame(ctx: CanvasRenderingContext2D, state: RenderState) {
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);
  drawArena(ctx);
  for (const pu of state.powerups) drawPowerup(ctx, pu);
  for (const bomb of state.bombs) drawBomb(ctx, bomb, state.bombRadius);
  for (const b of state.bullets) drawBullet(ctx, b);
  for (const p of state.players) {
    if (p.isLocal && state.aimMode === "free") drawLocalAimLine(ctx, p);
    drawPlayer(ctx, p);
  }
}

function drawBomb(ctx: CanvasRenderingContext2D, bomb: RenderBomb, radius: number) {
  const colors = TEAM_COLORS[bomb.team];
  const pulse = 0.85 + Math.sin(Date.now() / 180) * 0.15;

  ctx.save();
  ctx.translate(bomb.x, bomb.y);
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 14 * pulse;
  ctx.strokeStyle = colors.bullet;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `${colors.fill}44`;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px Orbitron, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", 0, 1);
  ctx.restore();
}

function drawPowerup(ctx: CanvasRenderingContext2D, pu: RenderPowerup) {
  const def = POWERUP_DEFS[pu.kind];
  const pulse = 0.85 + Math.sin(Date.now() / 200) * 0.15;

  ctx.save();
  ctx.translate(pu.x, pu.y);
  ctx.shadowColor = def.glow;
  ctx.shadowBlur = 16 * pulse;
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, POWERUP.radius * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `${def.color}33`;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = def.color;
  ctx.font = "bold 12px Orbitron, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(def.letter, 0, 1);
  ctx.restore();
}

function drawLocalAimLine(ctx: CanvasRenderingContext2D, p: RenderPlayer) {
  if (p.eliminated) return;
  const colors = TEAM_COLORS[p.team];
  const len = 72;
  const x2 = p.x + Math.cos(p.angle) * len;
  const y2 = p.y + Math.sin(p.angle) * len;

  ctx.save();
  ctx.strokeStyle = colors.glow;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(
    p.x + Math.cos(p.angle) * (PLAYER.radius + 4),
    p.y + Math.sin(p.angle) * (PLAYER.radius + 4),
  );
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x2, y2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawArena(ctx: CanvasRenderingContext2D) {
  const { width, height } = ARENA;

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0c1018");
  bg.addColorStop(1, "#101828");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  for (const team of ["red", "blue"] as const) {
    const z = RESUPPLY_ZONES[team];
    const colors = TEAM_COLORS[team];
    ctx.fillStyle = `${colors.fill}12`;
    ctx.fillRect(z.xMin, z.yMin, z.xMax - z.xMin, z.yMax - z.yMin);
    ctx.strokeStyle = `${colors.glow}44`;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(z.xMin + 1, z.yMin + 1, z.xMax - z.xMin - 2, z.yMax - z.yMin - 2);
    ctx.setLineDash([]);
  }

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
}

function drawPlayerHealthBar(ctx: CanvasRenderingContext2D, p: RenderPlayer) {
  if (p.eliminated) return;

  const colors = TEAM_COLORS[p.team];
  const r = PLAYER.radius;
  const barW = 40;
  const barH = 6;
  const bx = p.x - barW / 2;
  const by = p.y - r - 14;
  const pct = Math.max(0, Math.min(1, p.hp / p.maxHp));

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(bx, by, barW, barH);
  ctx.strokeStyle = p.isLocal ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, barW - 1, barH - 1);

  if (pct > 0) {
    ctx.fillStyle = colors.fill;
    ctx.fillRect(bx + 1, by + 1, (barW - 2) * pct, barH - 2);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: RenderPlayer) {
  if (p.eliminated) {
    ctx.globalAlpha = 0.35;
  }

  const colors = TEAM_COLORS[p.team];
  const r = PLAYER.radius;

  if (p.shield > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(68, 255, 204, 0.7)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#44ffcc";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

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

  drawPlayerHealthBar(ctx, p);

  if (p.isLocal) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBullet(ctx: CanvasRenderingContext2D, b: RenderBullet) {
  const colors = TEAM_COLORS[b.team];
  let fill = colors.bullet;
  let rx = BULLET.radius * 2;
  let ry = BULLET.radius;

  if (b.kind === "heavy") {
    fill = "#ffaa44";
    rx = 10;
    ry = 6;
  } else if (b.kind === "spread") {
    fill = "#cc88ff";
    rx = 5;
    ry = 3;
  }

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.shadowColor = fill;
  ctx.shadowBlur = b.kind === "heavy" ? 12 : 8;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
