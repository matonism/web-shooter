import type { GameId } from "../shared/games.ts";
import { GameSimulation } from "./gameSimulation.ts";
import type { RoomSimulation } from "./roomSimulation.ts";
import { SnakeSimulation } from "./snakeSimulation.ts";

export function createSimulation(gameId: GameId): RoomSimulation {
  switch (gameId) {
    case "snake":
      return new SnakeSimulation();
    case "shooter":
    default:
      return new GameSimulation();
  }
}
