import { RACE_RACER, RACE_TILE, TILE } from "./raceConstants.ts";
import { isSolidTile, tileAt, type RaceLevelData } from "./raceLevel.ts";

export function getRaceRespawnPosition(
  level: RaceLevelData,
  slotIndex: number,
  hasCheckpoint: boolean,
): { x: number; y: number } {
  const slot =
    level.startSlots[slotIndex % level.startSlots.length] ?? level.startSlots[0]!;

  if (hasCheckpoint && level.checkpoint) {
    return {
      x: level.checkpoint.x,
      y: level.checkpoint.y - (slotIndex % 3) * 6,
    };
  }

  return { x: slot.x, y: slot.y };
}

/** True if feet rest on the top surface of solid ground in column tx. */
function feetSupportedInColumn(tx: number, footY: number, level: RaceLevelData): boolean {
  const surfaceSlop = 8;
  for (let ty = level.rows - 1; ty >= 0; ty--) {
    if (!isSolidTile(tileAt(level, tx, ty))) continue;
    const tileTop = ty * RACE_TILE;
    if (footY >= tileTop - 4 && footY <= tileTop + surfaceSlop) return true;
    if (footY < tileTop - 4) return false;
  }
  return false;
}

export function racerOverlapsHazard(
  x: number,
  y: number,
  level: RaceLevelData,
): boolean {
  const w = RACE_RACER.width;
  const h = RACE_RACER.height;
  const footY = y + h / 2;
  const left = x - w / 2;
  const right = x + w / 2;
  const minTx = Math.floor(left / RACE_TILE);
  const maxTx = Math.floor(right / RACE_TILE);
  const groundRow = level.rows - 1;
  const pitEntryY = (groundRow - 1) * RACE_TILE;

  for (let tx = minTx; tx <= maxTx; tx++) {
    if (tileAt(level, tx, groundRow) !== TILE.hazard) continue;
    if (feetSupportedInColumn(tx, footY, level)) continue;
    if (footY >= pitEntryY) return true;
  }

  return false;
}

export function racerTouchesHazardTile(
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
      if (tileAt(level, tx, ty) === TILE.hazard) return true;
    }
  }
  return false;
}

export function racerInHazard(
  x: number,
  y: number,
  level: RaceLevelData,
): boolean {
  // Feet-in-pit only — body overlap with hazard tiles caused false deaths on bridges.
  return racerOverlapsHazard(x, y, level);
}
