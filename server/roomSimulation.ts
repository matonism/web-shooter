import type { GameId, LobbyPlayer, MatchWinner, PlayerInput, Team, WorldSnapshot } from "../shared/types.ts";

export interface RoomSimulation {
  readonly gameId: GameId;
  matchWinner: MatchWinner | null;
  reset(): void;
  addPlayer(id: string, name: string, isBot?: boolean): void;
  removePlayer(id: string): void;
  setConnected(id: string, connected: boolean): void;
  remapPlayerId(oldId: string, newId: string): void;
  assignTeam(id: string, team: Team): boolean;
  queueInput(id: string, input: PlayerInput): void;
  step(): void;
  snapshot(): WorldSnapshot;
  canStart(lobby: LobbyPlayer[]): boolean;
}
