export const RACE_TILE = 32;

export const RACE_VIEW = {
  width: 640,
  height: 360,
} as const;

/**
 * Client networking tuning — see docs/race-netcode-lessons.md
 *
 * Local player: client-side prediction; resync only on hazard / vertical / large error.
 * Remote ghosts: interpolate snapshot display positions, then smooth render layer.
 */
export const RACE_NETCODE = {
  hardSnapPx: 96,
  verticalMismatchPx: 10,
  remoteSnapPx: 72,
  remoteSmoothRate: 16,
  remoteExtrapMs: 100,
  /** Short blend between last two snapshot display samples before smoothing. */
  remoteInterpMaxLead: 1.08,
} as const;

export const RACE_PHYSICS = {
  gravity: 1500,
  jumpSpeed: 520,
  runSpeed: 240,
  maxFall: 720,
  /** px/s² — ramp up to runSpeed on the ground */
  groundAccel: 800,
  /** px/s² — slow down when no input on the ground */
  groundFriction: 800,
  /** px/s² — weaker steering in the air */
  airAccel: 800,
  /** px/s² — light drag in the air */
  airFriction: 120,
  /** Seconds before the race starts */
  countdownSeconds: 3,
} as const;

/** Max vertical reach ≈ 2 tiles (see jumpSpeed + gravity). */
export const RACE_MAX_JUMP_TILES = 2;

export const RACE_RACER = {
  width: 22,
  height: 28,
} as const;

/** Tile ids */
export const TILE = {
  empty: 0,
  solid: 1,
  flag: 2,
  spawn: 3,
  hazard: 4,
  checkpoint: 5,
} as const;
