import { BULLET, FIRE_COOLDOWN_MS, PLAYER } from "./constants.ts";

export type ShooterAimMode = "free" | "movement";

export interface ShooterSettings {
  playerSpeed: number;
  playerMaxHp: number;
  bulletSpeed: number;
  bulletRadius: number;
  bulletDamage: number;
  fireCooldownMs: number;
  bulletLifetimeMs: number;
  magazineSize: number;
  aimMode: ShooterAimMode;
  bombDamage: number;
  bombRadius: number;
}

export const DEFAULT_SHOOTER_SETTINGS: ShooterSettings = {
  playerSpeed: PLAYER.speed,
  playerMaxHp: PLAYER.maxHp,
  bulletSpeed: BULLET.speed,
  bulletRadius: BULLET.radius,
  bulletDamage: BULLET.damage,
  fireCooldownMs: FIRE_COOLDOWN_MS,
  bulletLifetimeMs: BULLET.lifetimeMs,
  magazineSize: 24,
  aimMode: "free",
  bombDamage: 50,
  bombRadius: 48,
};

export const SHOOTER_AIM_OPTIONS: { id: ShooterAimMode; label: string; desc: string }[] = [
  { id: "free", label: "Free aim", desc: "Shoot toward cursor / tap location." },
  {
    id: "movement",
    label: "Move to aim",
    desc: "Bullets fire in the direction you are moving.",
  },
];

export interface ShooterSettingDef {
  key: keyof Omit<ShooterSettings, "aimMode">;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

export const SHOOTER_BULLET_SPEED = { min: 150, max: 1800, step: 10 } as const;

export const SHOOTER_NUMERIC_SETTINGS: ShooterSettingDef[] = [
  { key: "playerSpeed", label: "Move speed", min: 120, max: 420, step: 10, unit: "px/s" },
  { key: "playerMaxHp", label: "Max health", min: 50, max: 400, step: 10, unit: "HP" },
  {
    key: "bulletSpeed",
    label: "Bullet speed",
    min: SHOOTER_BULLET_SPEED.min,
    max: SHOOTER_BULLET_SPEED.max,
    step: SHOOTER_BULLET_SPEED.step,
    unit: "px/s",
  },
  { key: "bulletRadius", label: "Bullet size", min: 3, max: 12, step: 1, unit: "px" },
  { key: "bulletDamage", label: "Bullet damage", min: 10, max: 80, step: 5, unit: "" },
  { key: "magazineSize", label: "Magazine size", min: 1, max: 60, step: 1, unit: "rds" },
  { key: "bulletLifetimeMs", label: "Bullet lifetime", min: 500, max: 4000, step: 100, unit: "ms" },
  { key: "bombDamage", label: "Bomb damage", min: 20, max: 400, step: 10, unit: "" },
  { key: "bombRadius", label: "Bomb trigger size", min: 28, max: 80, step: 4, unit: "px" },
];

/** Fire rate shown in lobby as bullets/s; stored as fireCooldownMs on settings. */
export const SHOOTER_FIRE_RATE_BPS = { min: 0.4, max: 5, step: 0.1 } as const;

export function bulletsPerSecondFromCooldownMs(ms: number): number {
  return Math.round((1000 / ms) * 10) / 10;
}

export function fireCooldownMsFromBps(bps: number): number {
  const clamped = Math.min(
    SHOOTER_FIRE_RATE_BPS.max,
    Math.max(SHOOTER_FIRE_RATE_BPS.min, bps),
  );
  return Math.round(1000 / clamped);
}

export function clampShooterSettings(s: ShooterSettings): ShooterSettings {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  return {
    playerSpeed: clamp(s.playerSpeed, 120, 420),
    playerMaxHp: clamp(s.playerMaxHp, 50, 400),
    bulletSpeed: clamp(s.bulletSpeed, SHOOTER_BULLET_SPEED.min, SHOOTER_BULLET_SPEED.max),
    bulletRadius: clamp(s.bulletRadius, 3, 12),
    bulletDamage: clamp(s.bulletDamage, 10, 80),
    fireCooldownMs: clamp(s.fireCooldownMs, 200, 2500),
    bulletLifetimeMs: clamp(s.bulletLifetimeMs, 500, 4000),
    magazineSize: clamp(s.magazineSize, 1, 60),
    aimMode: s.aimMode === "movement" ? "movement" : "free",
    bombDamage: clamp(s.bombDamage, 20, 400),
    bombRadius: clamp(s.bombRadius, 28, 80),
  };
}

export function mergeShooterSettings(
  base: ShooterSettings,
  patch: Partial<ShooterSettings>,
): ShooterSettings {
  return clampShooterSettings({ ...base, ...patch });
}
