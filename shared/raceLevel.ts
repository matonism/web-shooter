import { MAX_PLAYERS } from "./constants.ts";
import { RACE_RACER, RACE_TILE, TILE } from "./raceConstants.ts";

/**
 * Side-scrolling race course — 312×15 tiles (3× original length).
 * `#` solid · `.` air · `!` hazard pit · `C` checkpoint · `F` flag · `S` start line
 *
 * Jump reach ≈ 2 tiles vertical. Hazards are ground pits (not solid platforms).
 * Bridges at row 12 bypass hazard pits.
 */
const COLS = 104 * 3;
const ROWS = 15;
const GROUND = ROWS - 1;

type Grid = string[][];

function makeGrid(): Grid {
  return Array.from({ length: ROWS }, () => Array(COLS).fill("."));
}

function fillRect(g: Grid, x: number, y: number, w: number, h: number, ch: string) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS) g[ty]![tx] = ch;
    }
  }
}

function carveGroundGap(g: Grid, x: number, len: number) {
  for (let i = 0; i < len; i++) {
    const tx = x + i;
    if (tx >= 0 && tx < COLS) g[GROUND]![tx] = ".";
  }
}

/** Ground pit with spike floor — carves solid so it reads as deadly, not a platform. */
function placeHazardPit(g: Grid, x: number, len: number) {
  carveGroundGap(g, x, len);
  for (let i = 0; i < len; i++) {
    const tx = x + i;
    if (tx >= 0 && tx < COLS) g[GROUND]![tx] = "!";
  }
}

/** Row-12 bridge spanning a hazard pit (cols x..x+len-1). */
function placeBridge(g: Grid, x: number, len: number) {
  fillRect(g, x, 12, len, 1, "#");
}

function buildCourseGrid(): Grid {
  const g = makeGrid();

  fillRect(g, 0, GROUND, COLS, 1, "#");

  // --- Start lane ---
  fillRect(g, 0, GROUND, 28, 1, "#");
  fillRect(g, 0, 12, 1, 2, "#");
  g[13]![6] = "S";

  // --- Section 1 (cols 28–104) ---
  // Hazard pit + bridge OR low platform route
  placeHazardPit(g, 26, 3);
  placeBridge(g, 24, 7);

  carveGroundGap(g, 44, 3);
  placeBridge(g, 40, 11);

  placeHazardPit(g, 58, 4);
  placeBridge(g, 56, 8);

  // Two-tile step ramp (within jump limit)
  fillRect(g, 76, 12, 5, 1, "#");
  fillRect(g, 84, 10, 5, 1, "#");
  fillRect(g, 92, 12, 6, 1, "#");

  placeHazardPit(g, 68, 2);
  fillRect(g, 66, 12, 6, 1, "#");

  // --- Section 2 (cols 104–208) ---
  carveGroundGap(g, 116, 3);
  placeBridge(g, 112, 9);

  placeHazardPit(g, 128, 4);
  placeBridge(g, 126, 8);

  fillRect(g, 138, 12, 5, 1, "#");
  fillRect(g, 146, 12, 5, 1, "#");
  fillRect(g, 154, 10, 5, 1, "#");

  g[13]![156] = "C";
  fillRect(g, 152, 13, 10, 1, "#");
  fillRect(g, 152, GROUND, 10, 1, "#");

  placeHazardPit(g, 166, 3);
  placeBridge(g, 162, 9);

  fillRect(g, 178, 12, 6, 1, "#");
  fillRect(g, 188, 10, 6, 1, "#");
  fillRect(g, 198, 12, 5, 1, "#");

  placeHazardPit(g, 184, 3);
  fillRect(g, 180, 12, 8, 1, "#");

  // --- Section 3 (cols 208–312) ---
  carveGroundGap(g, 220, 3);
  placeBridge(g, 216, 9);

  placeHazardPit(g, 234, 4);
  placeBridge(g, 230, 10);

  fillRect(g, 248, 12, 6, 1, "#");
  fillRect(g, 258, 10, 6, 1, "#");

  carveGroundGap(g, 270, 3);
  placeBridge(g, 266, 9);

  placeHazardPit(g, 282, 3);
  fillRect(g, 278, 12, 9, 1, "#");

  // --- Finish: step up one tile, flag platform at row 13 (reachable) ---
  fillRect(g, 288, GROUND, 24, 1, "#");
  fillRect(g, 294, 12, 4, 1, "#");
  fillRect(g, 298, 13, 8, 1, "#");
  g[13]![305] = "F";
  g[13]![306] = "F";

  return g;
}

function gridToRows(g: Grid): string[] {
  return g.map((row) => row.join(""));
}

const LEVEL_ROWS = gridToRows(buildCourseGrid());

export interface RaceSpawnSlot {
  x: number;
  y: number;
}

export interface RaceLevelData {
  cols: number;
  rows: number;
  tiles: number[];
  /** Shared start line — all racers use the same X. */
  startLineX: number;
  startSlots: RaceSpawnSlot[];
  checkpoint: RaceSpawnSlot | null;
  checkpointTileX: number;
  flagX: number;
  killY: number;
  widthPx: number;
  heightPx: number;
}

function parseLevel(): RaceLevelData {
  const rows = LEVEL_ROWS.length;
  const cols = LEVEL_ROWS[0]!.length;
  const tiles: number[] = new Array(cols * rows).fill(TILE.empty);
  let startCol = 6;
  let checkpointTileX = -1;
  let flagX = (cols - 4) * RACE_TILE;

  for (let y = 0; y < rows; y++) {
    const row = LEVEL_ROWS[y]!;
    for (let x = 0; x < cols; x++) {
      const ch = row[x] ?? ".";
      const idx = y * cols + x;
      if (ch === "#") tiles[idx] = TILE.solid;
      else if (ch === "F") tiles[idx] = TILE.flag;
      else if (ch === "!") tiles[idx] = TILE.hazard;
      else if (ch === "C") tiles[idx] = TILE.checkpoint;
      else if (ch === "S") {
        tiles[idx] = TILE.empty;
        startCol = x;
      }
    }
  }

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (tiles[y * cols + x] === TILE.flag) {
        flagX = x * RACE_TILE;
        break;
      }
    }
    if (flagX < (cols - 8) * RACE_TILE) break;
  }

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (tiles[y * cols + x] === TILE.checkpoint) {
        checkpointTileX = x;
        break;
      }
    }
    if (checkpointTileX >= 0) break;
  }

  const startLineX = startCol * RACE_TILE + RACE_TILE / 2;
  const startFootY = (GROUND - 1) * RACE_TILE;
  const startSlots = raceStartSlots(MAX_PLAYERS, startLineX, startFootY);

  const checkpoint: RaceSpawnSlot | null =
    checkpointTileX >= 0
      ? {
          x: checkpointTileX * RACE_TILE + RACE_TILE / 2,
          y: (GROUND - 1) * RACE_TILE - RACE_RACER.height / 2,
        }
      : null;

  return {
    cols,
    rows,
    tiles,
    startLineX,
    startSlots,
    checkpoint,
    checkpointTileX,
    flagX,
    killY: rows * RACE_TILE + 80,
    widthPx: cols * RACE_TILE,
    heightPx: rows * RACE_TILE,
  };
}

/**
 * All racers share the same start X (fair distance). Small vertical offsets
 * keep sprites visible in the start pen without changing run distance.
 */
export function raceStartSlots(
  playerCount: number,
  startLineX: number,
  footRowY: number,
): RaceSpawnSlot[] {
  const count = Math.max(1, Math.min(playerCount, MAX_PLAYERS));
  const baseY = footRowY - RACE_RACER.height / 2;
  const slots: RaceSpawnSlot[] = [];

  for (let i = 0; i < count; i++) {
    slots.push({
      x: startLineX,
      y: baseY - (i % 3) * 6,
    });
  }

  return slots;
}

export const RACE_LEVEL = parseLevel();

export function tileAt(level: RaceLevelData, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= level.cols || ty >= level.rows) {
    return TILE.solid;
  }
  return level.tiles[ty * level.cols + tx] ?? TILE.empty;
}

export function isSolidTile(tile: number): boolean {
  return tile === TILE.solid;
}

export function isHazardTile(tile: number): boolean {
  return tile === TILE.hazard;
}

export function isCheckpointTile(tile: number): boolean {
  return tile === TILE.checkpoint;
}
