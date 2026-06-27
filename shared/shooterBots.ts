import { MAX_PER_TEAM, teamSize } from "./constants.ts";
import type { LobbyPlayer, Team } from "./types.ts";

export type ShooterBotFillMode = "off" | "balance" | "custom";

export interface ShooterBotSettings {
  fillMode: ShooterBotFillMode;
  /** Extra AI per team when fillMode is "custom". */
  customBots: { red: number; blue: number };
}

export const SHOOTER_BOT_FILL_OPTIONS: {
  id: ShooterBotFillMode;
  label: string;
  desc: string;
}[] = [
  { id: "off", label: "Off", desc: "Humans only — need even teams to start." },
  {
    id: "balance",
    label: "Balance",
    desc: "AI fills the smaller team so both sides match.",
  },
  {
    id: "custom",
    label: "Custom",
    desc: "Pick extra AI per team — handy for handicaps.",
  },
];

export const DEFAULT_SHOOTER_BOT_SETTINGS: ShooterBotSettings = {
  fillMode: "off",
  customBots: { red: 0, blue: 0 },
};

export function mergeShooterBotSettings(
  base: ShooterBotSettings,
  patch: Partial<ShooterBotSettings>,
): ShooterBotSettings {
  const next = { ...base, customBots: { ...base.customBots } };
  if (patch.fillMode) next.fillMode = patch.fillMode;
  if (patch.customBots) {
    if (patch.customBots.red !== undefined) {
      next.customBots.red = clampTeamBotCount(patch.customBots.red);
    }
    if (patch.customBots.blue !== undefined) {
      next.customBots.blue = clampTeamBotCount(patch.customBots.blue);
    }
  }
  return next;
}

export function clampTeamBotCount(count: number): number {
  return Math.min(MAX_PER_TEAM, Math.max(0, Math.round(count)));
}

export interface ShooterTeamCounts {
  red: number;
  blue: number;
}

export function computeShooterBotCounts(
  lobby: LobbyPlayer[],
  settings: ShooterBotSettings,
): ShooterTeamCounts {
  if (settings.fillMode === "off") return { red: 0, blue: 0 };

  const redHumans = teamSize(lobby, "red");
  const blueHumans = teamSize(lobby, "blue");

  if (settings.fillMode === "balance") {
    const diff = redHumans - blueHumans;
    if (diff > 0) return { red: 0, blue: clampTeamBotCount(diff) };
    if (diff < 0) return { red: clampTeamBotCount(-diff), blue: 0 };
    return { red: 0, blue: 0 };
  }

  const redBots = clampTeamBotCount(settings.customBots.red);
  const blueBots = clampTeamBotCount(settings.customBots.blue);
  return {
    red: Math.min(redBots, MAX_PER_TEAM - redHumans),
    blue: Math.min(blueBots, MAX_PER_TEAM - blueHumans),
  };
}

export function maxHumansOnTeam(
  team: Team,
  settings: ShooterBotSettings,
): number {
  if (settings.fillMode !== "custom") return MAX_PER_TEAM;
  return MAX_PER_TEAM - clampTeamBotCount(settings.customBots[team]);
}

export function canStartShooterWithBots(
  lobby: LobbyPlayer[],
  settings: ShooterBotSettings,
): boolean {
  if (lobby.length < 1) return false;
  const assigned = lobby.filter((p) => p.team);
  if (assigned.length < 1) return false;

  if (settings.fillMode === "off") {
    if (lobby.length < 2) return false;
    const red = teamSize(lobby, "red");
    const blue = teamSize(lobby, "blue");
    return red >= 1 && blue >= 1 && assigned.length >= 2;
  }

  if (assigned.length < lobby.length) return false;
  if (lobby.length < 2 && settings.fillMode === "balance") return false;

  const bots = computeShooterBotCounts(lobby, settings);
  const totalRed = teamSize(lobby, "red") + bots.red;
  const totalBlue = teamSize(lobby, "blue") + bots.blue;
  if (totalRed < 1 || totalBlue < 1) return false;
  if (totalRed > MAX_PER_TEAM || totalBlue > MAX_PER_TEAM) return false;
  return totalRed + totalBlue >= 2;
}

export function describeShooterTeams(
  lobby: LobbyPlayer[],
  settings: ShooterBotSettings,
): { red: string; blue: string } {
  const bots = computeShooterBotCounts(lobby, settings);
  const redHumans = teamSize(lobby, "red");
  const blueHumans = teamSize(lobby, "blue");

  const fmt = (humans: number, ai: number) => {
    const parts: string[] = [];
    if (humans > 0) parts.push(`${humans} human${humans === 1 ? "" : "s"}`);
    if (ai > 0) parts.push(`${ai} AI`);
    return parts.length > 0 ? parts.join(" + ") : "—";
  };

  return {
    red: fmt(redHumans, bots.red),
    blue: fmt(blueHumans, bots.blue),
  };
}
