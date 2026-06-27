import { randomUUID } from "node:crypto";
import type { GameId } from "../shared/games.ts";
import { SOLO } from "../shared/solo.ts";
import type { Team } from "../shared/types.ts";
import type { RoomSimulation } from "./roomSimulation.ts";

const SHOOTER_BOT_NAMES = ["Alpha", "Bravo", "Charlie"];

interface HumanPlayer {
  team: Team | null;
}

export function addSoloBots(
  sim: RoomSimulation,
  gameId: GameId,
  humans: HumanPlayer[],
): void {
  if (gameId === "shooter") {
    const humanTeam = humans.find((h) => h.team)?.team ?? "red";
    const botTeam: Team = humanTeam === "red" ? "blue" : "red";
    for (let i = 0; i < SOLO.shooterBots; i++) {
      const id = `bot:${randomUUID()}`;
      const name = `Bot ${SHOOTER_BOT_NAMES[i] ?? i + 1}`;
      sim.addPlayer(id, name, true);
      sim.assignTeam(id, botTeam);
    }
    return;
  }

  if (gameId === "snake") {
    for (let i = 0; i < SOLO.snakeBots; i++) {
      const id = `bot:${randomUUID()}`;
      sim.addPlayer(id, `Bot ${i + 1}`, true);
    }
  }
}
