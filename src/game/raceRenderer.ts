import { TEAM_COLORS } from "@shared/constants";
import { RACE_RACER, RACE_TILE, RACE_VIEW, TILE } from "@shared/raceConstants";
import { getRacerColliderDebug } from "@shared/racePhysics";
import { RACE_LEVEL, tileAt } from "@shared/raceLevel";
import type { RaceRacerState } from "@shared/types";
import type { RaceRenderState } from "./raceClientGame";

function drawTiles(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number) {
  const startTx = Math.floor(cameraX / RACE_TILE);
  const endTx = Math.ceil((cameraX + RACE_VIEW.width) / RACE_TILE);
  const startTy = Math.floor(cameraY / RACE_TILE);
  const endTy = Math.ceil((cameraY + RACE_VIEW.height) / RACE_TILE);

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const tile = tileAt(RACE_LEVEL, tx, ty);
      const px = tx * RACE_TILE - cameraX;
      const py = ty * RACE_TILE - cameraY;

      if (tile === TILE.solid) {
        ctx.fillStyle = ty >= RACE_LEVEL.rows - 2 ? "#3d5a80" : "#5a7a9a";
        ctx.fillRect(px, py, RACE_TILE, RACE_TILE);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.strokeRect(px + 0.5, py + 0.5, RACE_TILE - 1, RACE_TILE - 1);
      } else if (tile === TILE.hazard) {
        ctx.fillStyle = "#4a1020";
        ctx.fillRect(px, py, RACE_TILE, RACE_TILE);
        ctx.fillStyle = "#ff4422";
        ctx.fillRect(px + 2, py + RACE_TILE - 10, RACE_TILE - 4, 8);
        ctx.fillStyle = "#ffaa44";
        for (let i = 0; i < 3; i++) {
          const sx = px + 5 + i * 9;
          ctx.beginPath();
          ctx.moveTo(sx, py + RACE_TILE - 4);
          ctx.lineTo(sx + 4, py + 10);
          ctx.lineTo(sx + 8, py + RACE_TILE - 4);
          ctx.closePath();
          ctx.fill();
        }
      } else if (tile === TILE.checkpoint) {
        ctx.fillStyle = "#3d5a80";
        ctx.fillRect(px, py, RACE_TILE, RACE_TILE);
        ctx.fillStyle = "#44ffcc";
        ctx.fillRect(px + 6, py + 2, 4, RACE_TILE - 4);
        ctx.fillStyle = "#ffd700";
        ctx.fillRect(px + 10, py + 4, RACE_TILE - 14, 10);
      } else if (tile === TILE.flag) {
        ctx.fillStyle = "#3d5a80";
        ctx.fillRect(px, py, RACE_TILE, RACE_TILE);
        ctx.fillStyle = "#ffd700";
        ctx.fillRect(px + 4, py + 4, RACE_TILE - 8, RACE_TILE - 8);
        ctx.fillStyle = "#ff3366";
        ctx.fillRect(px + 10, py + 6, 6, 18);
      }
    }
  }
}

function drawRacer(
  ctx: CanvasRenderingContext2D,
  r: RaceRacerState,
  cameraX: number,
  cameraY: number,
  isLocal: boolean,
  alpha: number,
) {
  const px = r.x - cameraX;
  const py = r.y - cameraY;
  const w = RACE_RACER.width;
  const h = RACE_RACER.height;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = r.team ? TEAM_COLORS[r.team].fill : r.color;
  if (isLocal) {
    ctx.shadowColor = r.color;
    ctx.shadowBlur = 4;
  }
  ctx.fillRect(px - w / 2, py - h / 2, w, h);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#fff";
  ctx.fillRect(px - 5, py - 6, 4, 4);
  ctx.fillRect(px + 1, py - 6, 4, 4);
  ctx.globalAlpha = 1;
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  render: RaceRenderState,
) {
  const { world, localId, localDisplay, remoteDisplay } = render;
  const mw = 140;
  const mh = 36;
  const mx = RACE_VIEW.width - mw - 8;
  const my = 8;
  const scale = mw / world.levelWidth;

  ctx.fillStyle = "rgba(6,8,16,0.75)";
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = "rgba(68,255,204,0.4)";
  ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);

  for (const r of world.racers) {
    const pos =
      r.id === localId
        ? localDisplay
        : (remoteDisplay.get(r.id) ?? { x: r.x, y: r.y });
    const dotX = mx + pos.x * scale;
    const dotY = my + mh / 2;
    ctx.fillStyle = r.id === localId ? "#44ffcc" : r.color;
    ctx.beginPath();
    ctx.arc(dotX, dotY, r.id === localId ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const flagX = mx + world.flagX * scale;
  ctx.fillStyle = "#ffd700";
  ctx.fillRect(flagX, my + 4, 2, mh - 8);

  if (world.checkpointX != null) {
    const cpX = mx + world.checkpointX * scale;
    ctx.fillStyle = "#44ffcc";
    ctx.fillRect(cpX - 1, my + 6, 2, mh - 12);
  }
}

function drawDebugHitboxes(ctx: CanvasRenderingContext2D, render: RaceRenderState) {
  const { camera, localPred, localDisplay, world, localId } = render;
  const local = world.racers.find((r) => r.id === localId);
  const debug = getRacerColliderDebug(localPred, RACE_LEVEL);
  const sx = (wx: number) => wx - camera.x;
  const sy = (wy: number) => wy - camera.y;
  const rw = RACE_RACER.width;
  const rh = RACE_RACER.height;

  ctx.lineWidth = 2;

  // Predicted sim hitbox
  ctx.strokeStyle = "#44ff66";
  ctx.strokeRect(
    sx(debug.left) + 0.5,
    sy(debug.top) + 0.5,
    debug.right - debug.left - 1,
    debug.bottom - debug.top - 1,
  );

  // Render position (interpolated between ticks)
  ctx.strokeStyle = "#ffcc44";
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    sx(localDisplay.x - rw / 2) + 0.5,
    sy(localDisplay.y - rh / 2) + 0.5,
    rw - 1,
    rh - 1,
  );
  ctx.setLineDash([]);

  // Server authoritative position
  if (local) {
    ctx.strokeStyle = "#ff4466";
    ctx.strokeRect(
      sx(local.x - rw / 2) + 0.5,
      sy(local.y - rh / 2) + 0.5,
      rw - 1,
      rh - 1,
    );
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(sx(debug.left), sy(debug.footY));
  ctx.lineTo(sx(debug.right), sy(debug.footY));
  ctx.stroke();

  for (const probe of debug.probes) {
    const px = sx(probe.tx * RACE_TILE);
    ctx.fillStyle = probe.supported ? "rgba(68,255,102,0.45)" : "rgba(255,68,68,0.25)";
    ctx.fillRect(px, sy(debug.footY - 8), RACE_TILE, 16);
    ctx.strokeStyle = probe.supported ? "#44ff66" : "#ff4444";
    ctx.strokeRect(px + 0.5, sy(debug.footY - 8) + 0.5, RACE_TILE - 1, 15);
  }

  ctx.lineWidth = 1;
}

function drawDebugHud(ctx: CanvasRenderingContext2D, render: RaceRenderState) {
  const { localPred, localDisplay, world, localId } = render;
  const local = world.racers.find((r) => r.id === localId);
  const debug = getRacerColliderDebug(localPred, RACE_LEVEL);
  const supportedCols = debug.probes.filter((p) => p.supported).length;

  const lines = [
    "HITBOX DEBUG — H or button to hide",
    "Green = predicted   Gold = render   Red = server",
    `grounded=${debug.grounded}   vx=${debug.vx.toFixed(0)}   vy=${debug.vy.toFixed(0)}`,
    `Y  pred=${localPred.y.toFixed(1)}  render=${localDisplay.y.toFixed(1)}` +
      (local ? `  server=${local.y.toFixed(1)}` : ""),
    `Foot columns with support: ${supportedCols}/${debug.probes.length}`,
  ];

  const panelH = 12 + lines.length * 16;
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, 0, RACE_VIEW.width, panelH);
  ctx.strokeStyle = "#44ffcc";
  ctx.strokeRect(0.5, 0.5, RACE_VIEW.width - 1, panelH - 1);

  ctx.fillStyle = "#e8fff8";
  ctx.font = "12px monospace";
  ctx.textAlign = "left";
  lines.forEach((line, i) => ctx.fillText(line, 10, 18 + i * 16));
}

export function drawRaceGame(ctx: CanvasRenderingContext2D, render: RaceRenderState) {
  const { world, localId, localDisplay, remoteDisplay, camera } = render;
  const { width, height } = RACE_VIEW;
  const visibility = world.settings.visibility;

  ctx.fillStyle = "#87ceeb";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  drawTiles(ctx, camera.x, camera.y);

  const others = world.racers.filter((r) => r.id !== localId);
  const showOnCanvas = visibility === "full" || visibility === "ghost";

  if (showOnCanvas) {
    const alpha = visibility === "ghost" ? 0.35 : 1;
    for (const r of others) {
      const pos = remoteDisplay.get(r.id) ?? { x: r.x, y: r.y };
      drawRacer(ctx, { ...r, x: pos.x, y: pos.y }, camera.x, camera.y, false, alpha);
    }
  }

  const local = world.racers.find((r) => r.id === localId);
  const localState: RaceRacerState = local
    ? { ...local, x: localDisplay.x, y: localDisplay.y }
    : {
        id: localId,
        name: "You",
        team: null,
        x: localDisplay.x,
        y: localDisplay.y,
        vx: 0,
        vy: 0,
        grounded: false,
        finished: false,
        finishTimeMs: null,
        hasCheckpoint: false,
        respawnCount: 0,
        spawnSlot: 0,
        lastInputSeq: 0,
        displayX: null,
        displayY: null,
        displayVx: null,
        displayVy: null,
        displayGrounded: null,
        color: "#44ffcc",
      };
  drawRacer(ctx, localState, camera.x, camera.y, true, 1);

  if (render.showDebug) {
    drawDebugHitboxes(ctx, render);
  }

  ctx.restore();

  if (render.showDebug) {
    drawDebugHud(ctx, render);
  }

  if (visibility === "minimap") {
    drawMinimap(ctx, render);
  }

  if (world.countdownSeconds > 0) {
    ctx.fillStyle = "rgba(6, 8, 16, 0.55)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#44ffcc";
    ctx.font = "bold 64px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(world.countdownSeconds), width / 2, height / 2);
    ctx.textBaseline = "alphabetic";
  }
}

export { RACE_VIEW };
