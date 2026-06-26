export type Team = "red" | "blue";
export type GamePhase = "lobby" | "playing" | "finished";

export interface Vec2 {
  x: number;
  y: number;
}

export interface BulletState {
  id: string;
  x: number;
  y: number;
  angle: number;
  team: Team;
  ownerId: string;
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
}

export interface WorldSnapshot {
  tick: number;
  timestamp: number;
  players: PlayerState[];
  bullets: BulletState[];
}

export interface PlayerInput {
  seq: number;
  dx: number;
  dy: number;
  angle: number;
  fire: boolean;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  team: Team | null;
  connected: boolean;
}

export interface RoomStatePublic {
  code: string;
  phase: GamePhase;
  hostId: string;
  players: LobbyPlayer[];
  maxPlayers: number;
  maxPerTeam: number;
  winner: Team | null;
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

export interface ClientToServerEvents {
  createRoom: (payload: CreateRoomPayload) => void;
  joinRoom: (payload: JoinRoomPayload) => void;
  rejoinRoom: (payload: RejoinRoomPayload) => void;
  selectTeam: (payload: SelectTeamPayload) => void;
  startGame: () => void;
  backToLobby: () => void;
  closeRoom: () => void;
  input: (payload: PlayerInput) => void;
}

export interface ServerToClientEvents {
  state: (state: RoomStatePublic) => void;
  errorMsg: (msg: string) => void;
  roomClosed: (reason: string) => void;
}

export interface RejoinSession {
  code: string;
  token: string;
}
