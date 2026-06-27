import { randomUUID } from "node:crypto";
import type { GameId } from "../shared/games.ts";
import type { RaceSettings } from "../shared/raceSettings.ts";
import { computeShooterBotCounts, type ShooterBotSettings } from "../shared/shooterBots.ts";
import { clampSoloBotCount } from "../shared/solo.ts";
import type { Team } from "../shared/types.ts";
import type { RoomSimulation } from "./roomSimulation.ts";

const SHOOTER_BOT_NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];

interface HumanPlayer {
  team: Team | null;
}

export function addShooterFillBots(
  sim: RoomSimulation,
  humans: HumanPlayer[],
  settings: ShooterBotSettings,
): void {
  const lobby = humans.map((h, i) => ({
    id: String(i),
    name: "",
    team: h.team,
    connected: true,
  }));
  const counts = computeShooterBotCounts(lobby, settings);
  let nameIdx = 0;

  const spawn = (team: Team, count: number) => {
    for (let i = 0; i < count; i++) {
      const id = `bot:${randomUUID()}`;
      const name = `Bot ${SHOOTER_BOT_NAMES[nameIdx] ?? nameIdx + 1}`;
      nameIdx += 1;
      sim.addPlayer(id, name, true);
      sim.assignTeam(id, team);
    }
  };

  spawn("red", counts.red);
  spawn("blue", counts.blue);
}

export function addSoloBots(  sim: RoomSimulation,
  gameId: GameId,
  humans: HumanPlayer[],
  botCount: number,
  raceSettings?: RaceSettings,
): void {
  const count = clampSoloBotCount(gameId, botCount);

  if (gameId === "shooter") {
    const humanTeam = humans.find((h) => h.team)?.team ?? "red";
    const botTeam: Team = humanTeam === "red" ? "blue" : "red";
    for (let i = 0; i < count; i++) {
      const id = `bot:${randomUUID()}`;
      const name = `Bot ${SHOOTER_BOT_NAMES[i] ?? i + 1}`;
      sim.addPlayer(id, name, true);
      sim.assignTeam(id, botTeam);
    }
    return;
  }

  if (gameId === "snake") {
    for (let i = 0; i < count; i++) {
      const id = `bot:${randomUUID()}`;
      sim.addPlayer(id, `Bot ${i + 1}`, true);
    }
    return;
  }

  if (gameId === "race") {
    const teamMode = raceSettings?.scoringMode === "team";
    const humanTeam = humans.find((h) => h.team)?.team ?? "red";
    for (let i = 0; i < count; i++) {
      const id = `bot:${randomUUID()}`;
      sim.addPlayer(id, `Bot ${i + 1}`, true);
      if (teamMode) {
        sim.assignTeam(id, humanTeam === "red" ? "blue" : "red");
      }
    }
  }
}
