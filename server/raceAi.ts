import { RACE_RACER, RACE_TILE } from "../shared/raceConstants.ts";
import { isHazardTile, isSolidTile, tileAt, type RaceLevelData } from "../shared/raceLevel.ts";
import type { PlayerInput } from "../shared/types.ts";

interface BotRacer {
  x: number;
  y: number;
  grounded: boolean;
}

export function computeRaceBotInput(
  racer: BotRacer,
  level: RaceLevelData,
): PlayerInput {
  let dx = 1;
  let jump = false;

  if (racer.grounded) {
    const footY = racer.y + RACE_RACER.height / 2;
    const aheadTiles = [18, 34, 50];
    for (const offset of aheadTiles) {
      const ax = racer.x + offset;
      const tx = Math.floor(ax / RACE_TILE);
      const tyGround = Math.floor((footY + 4) / RACE_TILE);
      const tile = tileAt(level, tx, tyGround);
      if (isHazardTile(tile)) {
        jump = true;
        break;
      }
      const groundAhead = isSolidTile(tile);
      if (!groundAhead) {
        jump = true;
        break;
      }
      const tyHead = Math.floor((racer.y - RACE_RACER.height / 2) / RACE_TILE);
      if (isSolidTile(tileAt(level, tx, tyHead))) {
        jump = true;
        break;
      }
    }
    if (Math.random() < 0.015) jump = true;
  }

  if (Math.random() < 0.002) dx = -0.4;

  return { seq: 0, dx, dy: 0, angle: 0, fire: jump };
}
