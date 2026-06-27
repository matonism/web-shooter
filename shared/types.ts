export type Team = "red" | "blue";
export type GamePhase = "lobby" | "playing" | "finished";

import type { GameId, GamePickMode } from "./games.ts";
import type { RaceSettings } from "./raceSettings.ts";
import { DEFAULT_RACE_SETTINGS } from "./raceSettings.ts";
import type { ShooterSettings } from "./shooterSettings.ts";
import { DEFAULT_SHOOTER_SETTINGS } from "./shooterSettings.ts";
import type { BulletKind } from "./constants.ts";
import type { PowerupKind } from "./powerups.ts";

export type { BulletKind, PowerupKind, GameId, GamePickMode, RaceSettings, ShooterSettings };

export interface Vec2 {
  x: number;
  y: number;
}

export interface BombState {
  id: string;
  x: number;
  y: number;
  ownerId: string;
  team: Team;
}

export interface BulletState {
  id: string;
  x: number;
  y: number;
  angle: number;
  team: Team;
  ownerId: string;
  kind: BulletKind;
}

export interface PowerupState {
  id: string;
  kind: PowerupKind;
  x: number;
  y: number;
}

export interface PlayerPowerup {
  kind: PowerupKind;
  until: number;
}

export interface PlayerState {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  eliminated: boolean;
  connected: boolean;
  activePowerups: PlayerPowerup[];
  shield: number;
  speedMultiplier: number;
  bombPlaced: boolean;
  ammo: number;
  maxAmmo: number;
  inResupplyZone: boolean;
}

export interface GridCell {
  x: number;
  y: number;
}

export interface SnakePlayerState {
  id: string;
  name: string;
  body: GridCell[];
  alive: boolean;
  score: number;
  color: string;
}

export interface SnakePelletState {
  id: string;
  x: number;
  y: number;
}

export interface BaseWorldSnapshot {
  tick: number;
  timestamp: number;
  gameId: GameId;
}

export interface ShooterWorldSnapshot extends BaseWorldSnapshot {
  gameId: "shooter";
  settings: ShooterSettings;
  players: PlayerState[];
  bullets: BulletState[];
  bombs: BombState[];
  powerups: PowerupState[];
}

export interface SnakeWorldSnapshot extends BaseWorldSnapshot {
  gameId: "snake";
  snakes: SnakePlayerState[];
  pellets: SnakePelletState[];
  /** Seconds left before movement starts (0 = playing) */
  countdownSeconds: number;
}

export interface RaceRacerState {
  id: string;
  name: string;
  team: Team | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  finished: boolean;
  finishTimeMs: number | null;
  hasCheckpoint: boolean;
  respawnCount: number;
  spawnSlot: number;
  color: string;
  /** Last input sequence applied by the server for this racer. */
  lastInputSeq: number;
  /** Client-predicted render position (for remote display only). */
  displayX: number | null;
  displayY: number | null;
  displayVx: number | null;
  displayVy: number | null;
  displayGrounded: boolean | null;
}

export interface RaceWorldSnapshot extends BaseWorldSnapshot {
  gameId: "race";
  racers: RaceRacerState[];
  countdownSeconds: number;
  settings: RaceSettings;
  levelWidth: number;
  levelHeight: number;
  flagX: number;
  checkpointX: number | null;
}

export type WorldSnapshot =
  | ShooterWorldSnapshot
  | SnakeWorldSnapshot
  | RaceWorldSnapshot;

export interface PlayerInput {
  seq: number;
  dx: number;
  dy: number;
  angle: number;
  fire: boolean;
  bomb: boolean;
}

/** Client render position — relayed to other players (not used for server physics). */
export interface RacePositionPayload {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  team: Team | null;
  connected: boolean;
}

export type MatchWinner =
  | { kind: "team"; team: Team }
  | { kind: "player"; playerId: string; name: string };

export interface RoomStatePublic {
  code: string;
  phase: GamePhase;
  hostId: string;
  players: LobbyPlayer[];
  maxPlayers: number;
  maxPerTeam: number;
  matchWinner: MatchWinner | null;
  /** Game chosen for the current / next match */
  selectedGameId: GameId;
  /** How the game is picked before start */
  gamePickMode: GamePickMode;
  /** Player id → voted game (vote mode) */
  gameVotes: Record<string, GameId>;
  /** Practice vs AI — host can start alone */
  soloMode: boolean;
  /** Platform race options (lobby + in-game) */
  raceSettings: RaceSettings;
  /** Arena shooter tuning (lobby + in-game) */
  shooterSettings: ShooterSettings;
  /** Set while playing or after finish */
  playingGameId: GameId | null;
  /** Present when phase is playing or finished */
  world?: WorldSnapshot;
  /** Socket id of the receiving client (for prediction) */
  youId: string;
  /** Stable rejoin token for this client */
  yourToken: string;
}

export interface CreateRoomPayload {
  name: string;
}

export interface JoinRoomPayload {
  code: string;
  name: string;
}

export interface RejoinRoomPayload {
  code: string;
  token: string;
}

export interface SelectTeamPayload {
  team: Team;
}

export interface SelectGamePayload {
  gameId: GameId;
}

export interface SetGamePickModePayload {
  mode: GamePickMode;
}

export interface VoteGamePayload {
  gameId: GameId;
}

export interface SetSoloModePayload {
  enabled: boolean;
}

export interface SetRaceSettingsPayload {
  settings: Partial<RaceSettings>;
}

export interface SetShooterSettingsPayload {
  settings: Partial<ShooterSettings>;
}

export interface ClientToServerEvents {
  createRoom: (payload: CreateRoomPayload) => void;
  joinRoom: (payload: JoinRoomPayload) => void;
  rejoinRoom: (payload: RejoinRoomPayload) => void;
  selectTeam: (payload: SelectTeamPayload) => void;
  selectGame: (payload: SelectGamePayload) => void;
  setGamePickMode: (payload: SetGamePickModePayload) => void;
  voteGame: (payload: VoteGamePayload) => void;
  setSoloMode: (payload: SetSoloModePayload) => void;
  setRaceSettings: (payload: SetRaceSettingsPayload) => void;
  setShooterSettings: (payload: SetShooterSettingsPayload) => void;
  startGame: () => void;
  backToLobby: () => void;
  restartRound: () => void;
  closeRoom: () => void;
  leaveRoom: () => void;
  input: (payload: PlayerInput) => void;
  racePosition: (payload: RacePositionPayload) => void;
}

export interface ServerToClientEvents {
  state: (state: RoomStatePublic) => void;
  errorMsg: (msg: string) => void;
  roomClosed: (reason: string) => void;
  leftRoom: () => void;
}

export interface RejoinSession {
  code: string;
  token: string;
}

export function isShooterWorld(world: WorldSnapshot): world is ShooterWorldSnapshot {
  return world.gameId === "shooter";
}

export function isSnakeWorld(world: WorldSnapshot): world is SnakeWorldSnapshot {
  return world.gameId === "snake";
}

export function isRaceWorld(world: WorldSnapshot): world is RaceWorldSnapshot {
  return world.gameId === "race";
}
