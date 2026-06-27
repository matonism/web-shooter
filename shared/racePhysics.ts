import { RACE_PHYSICS, RACE_RACER, RACE_TILE, TILE } from "./raceConstants.ts";
import { isSolidTile, tileAt, type RaceLevelData } from "./raceLevel.ts";

export { racerInHazard, racerOverlapsHazard, racerTouchesHazardTile } from "./raceRespawn.ts";

export interface RacerBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
}

export interface RaceInput {
  dx: number;
  jump: boolean;
}

export function stepRacer(
  body: RacerBody,
  input: RaceInput,
  level: RaceLevelData,
  dt: number,
): RacerBody {
  let { x, y, vx, vy, grounded } = body;
  const move = Math.abs(input.dx) > 0.15 ? (input.dx > 0 ? 1 : -1) : 0;
  const targetVx = move * RACE_PHYSICS.runSpeed;
  const accel = grounded ? RACE_PHYSICS.groundAccel : RACE_PHYSICS.airAccel;
  const friction = grounded ? RACE_PHYSICS.groundFriction : RACE_PHYSICS.airFriction;

  if (move !== 0) {
    if (vx < targetVx) vx = Math.min(targetVx, vx + accel * dt);
    else if (vx > targetVx) vx = Math.max(targetVx, vx - accel * dt);
  } else if (Math.abs(vx) <= friction * dt) {
    vx = 0;
  } else {
    vx -= Math.sign(vx) * friction * dt;
  }

  if (input.jump && grounded) {
    vy = -RACE_PHYSICS.jumpSpeed;
    grounded = false;
  }

  vy += RACE_PHYSICS.gravity * dt;
  if (vy > RACE_PHYSICS.maxFall) vy = RACE_PHYSICS.maxFall;

  // Resolve Y before X so horizontal movement cannot walk off a ledge we just landed on.
  ({ x, y, vx, vy, grounded } = resolveAxis(x, y, vx, vy, grounded, level, dt, "y"));
  ({ x, y, vx, vy, grounded } = resolveAxis(x, y, vx, vy, grounded, level, dt, "x"));

  return { x, y, vx, vy, grounded };
}

function resolveAxis(
  x: number,
  y: number,
  vx: number,
  vy: number,
  grounded: boolean,
  level: RaceLevelData,
  dt: number,
  axis: "x" | "y",
): RacerBody {
  const w = RACE_RACER.width;
  const h = RACE_RACER.height;
  let nx = x;
  let ny = y;
  let nvx = vx;
  let nvy = vy;
  let ng = grounded;

  const delta = axis === "x" ? vx * dt : vy * dt;
  if (axis === "x") nx += delta;
  else ny += delta;

  const left = nx - w / 2;
  const right = nx + w / 2;
  const top = ny - h / 2;
  const bottom = ny + h / 2;

  const minTx = Math.floor(left / RACE_TILE);
  const maxTx = Math.floor(right / RACE_TILE);
  const minTy = Math.floor(top / RACE_TILE);
  const maxTy = Math.floor(bottom / RACE_TILE);

  const hits: { tx: number; ty: number }[] = [];
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isSolidTile(tileAt(level, tx, ty))) continue;
      const tileL = tx * RACE_TILE;
      const tileR = tileL + RACE_TILE;
      const tileT = ty * RACE_TILE;
      const tileB = tileT + RACE_TILE;
      if (right <= tileL || left >= tileR || bottom <= tileT || top >= tileB) continue;
      hits.push({ tx, ty });
    }
  }
  hits.sort((a, b) => a.ty - b.ty || a.tx - b.tx);

  // Standing flush on a tile top (bottom === tileT) fails strict AABB overlap — detect support explicitly.
  if (axis === "y" && delta > 0) {
    const support = findGroundSupport(nx, ny, w, h, level);
    if (support && !hits.some((h) => h.tx === support.tx && h.ty === support.ty)) {
      hits.push(support);
      hits.sort((a, b) => a.ty - b.ty || a.tx - b.tx);
    }
  }

  if (axis === "y" && delta > 0 && hits.length === 0) {
    ng = false;
  }

  let landingHit: { tx: number; ty: number } | null = null;
  if (axis === "y" && delta > 0 && hits.length > 0) {
    const topTy = hits[0]!.ty;
    const topHits = hits.filter((h) => h.ty === topTy);
    const footLeftTx = Math.floor(left / RACE_TILE);
    const footRightTx = Math.floor((right - 1) / RACE_TILE);
    landingHit =
      topHits.find((h) => h.tx >= footLeftTx && h.tx <= footRightTx) ?? topHits[0]!;
  }

  for (const { tx, ty } of hits) {
      if (landingHit && (tx !== landingHit.tx || ty !== landingHit.ty)) continue;
      const tileL = tx * RACE_TILE;
      const tileR = tileL + RACE_TILE;
      const tileT = ty * RACE_TILE;
      const tileB = tileT + RACE_TILE;

      if (axis === "x") {
        if (delta > 0) nx = tileL - w / 2;
        else if (delta < 0) nx = tileR + w / 2;
        nvx = 0;
        break;
      } else {
        if (delta > 0) {
          ny = tileT - h / 2;
          nvy = 0;
          ng = true;
          break;
        } else if (delta < 0) {
          ny = tileB + h / 2;
          nvy = 0;
          break;
        }
      }
  }

  return { x: nx, y: ny, vx: nvx, vy: nvy, grounded: ng };
}

/** Feet resting on a tile top under a foot column. */
function columnSupportsFoot(
  tx: number,
  footY: number,
  level: RaceLevelData,
): { tx: number; ty: number } | null {
  for (let ty = 0; ty < level.rows; ty++) {
    if (!isSolidTile(tileAt(level, tx, ty))) continue;
    const tileTop = ty * RACE_TILE;
    if (footY >= tileTop - 2 && footY <= tileTop + 4) {
      return { tx, ty };
    }
  }
  return null;
}

/** Any foot column under the hitbox resting on a tile top. */
function findGroundSupport(
  nx: number,
  ny: number,
  w: number,
  h: number,
  level: RaceLevelData,
): { tx: number; ty: number } | null {
  const footY = ny + h / 2;
  const leftTx = Math.floor((nx - w / 2) / RACE_TILE);
  const rightTx = Math.floor((nx + w / 2 - 1) / RACE_TILE);
  let best: { tx: number; ty: number } | null = null;

  for (let tx = leftTx; tx <= rightTx; tx++) {
    const hit = columnSupportsFoot(tx, footY, level);
    if (hit && (!best || hit.ty < best.ty)) best = hit;
  }

  return best;
}

export interface RacerColliderDebug {
  left: number;
  right: number;
  top: number;
  bottom: number;
  footY: number;
  probes: { tx: number; supported: boolean }[];
  grounded: boolean;
  vx: number;
  vy: number;
}

/** Hitbox + foot-column probes for debug overlay (press ` in race). */
export function getRacerColliderDebug(
  body: RacerBody,
  level: RaceLevelData,
): RacerColliderDebug {
  const w = RACE_RACER.width;
  const h = RACE_RACER.height;
  const { x, y, grounded, vx, vy } = body;
  const footY = y + h / 2;
  const leftTx = Math.floor((x - w / 2) / RACE_TILE);
  const rightTx = Math.floor((x + w / 2 - 1) / RACE_TILE);
  const probes: { tx: number; supported: boolean }[] = [];
  for (let tx = leftTx; tx <= rightTx; tx++) {
    probes.push({ tx, supported: columnSupportsFoot(tx, footY, level) !== null });
  }
  return {
    left: x - w / 2,
    right: x + w / 2,
    top: y - h / 2,
    bottom: y + h / 2,
    footY,
    probes,
    grounded,
    vx,
    vy,
  };
}

export function racerOverlapsFlag(
  x: number,
  y: number,
  level: RaceLevelData,
): boolean {
  const cx = Math.floor(x / RACE_TILE);
  const cy = Math.floor(y / RACE_TILE);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (tileAt(level, cx + dx, cy + dy) === TILE.flag) return true;
    }
  }
  return x >= level.flagX;
}

export function racerOverlapsCheckpoint(
  x: number,
  y: number,
  level: RaceLevelData,
): boolean {
  const w = RACE_RACER.width;
  const h = RACE_RACER.height;
  const left = x - w / 2;
  const right = x + w / 2;
  const top = y - h / 2;
  const bottom = y + h / 2;
  const minTx = Math.floor(left / RACE_TILE);
  const maxTx = Math.floor(right / RACE_TILE);
  const minTy = Math.floor(top / RACE_TILE);
  const maxTy = Math.floor(bottom / RACE_TILE);

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (tileAt(level, tx, ty) === TILE.checkpoint) return true;
    }
  }
  return false;
}
