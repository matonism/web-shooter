export type GameId = "shooter" | "snake";

export type GamePickMode = "host" | "random" | "vote";

export interface GameDef {
  id: GameId;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  requiresTeams: boolean;
}

export const GAME_CATALOG: GameDef[] = [
  {
    id: "shooter",
    name: "Arena Shooter",
    description: "3v3 top-down blaster with powerups.",
    minPlayers: 2,
    maxPlayers: 6,
    requiresTeams: true,
  },
  {
    id: "snake",
    name: "Multiplayer Snake",
    description: "Grow your snake — last one slithering wins.",
    minPlayers: 2,
    maxPlayers: 6,
    requiresTeams: false,
  },
];

export function getGameDef(id: GameId): GameDef {
  return GAME_CATALOG.find((g) => g.id === id) ?? GAME_CATALOG[0]!;
}
