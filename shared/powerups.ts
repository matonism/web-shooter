export type PowerupKind = "speed" | "rapid" | "spread" | "heavy" | "shield";

export const POWERUP_DEFS: Record<
  PowerupKind,
  { label: string; color: string; glow: string; letter: string; durationMs: number | null }
> = {
  speed: { label: "Speed Boost", color: "#ffd700", glow: "#ffe566", letter: "S", durationMs: 8000 },
  rapid: { label: "Rapid Fire", color: "#ff9933", glow: "#ffbb66", letter: "R", durationMs: 8000 },
  spread: { label: "Spread Shot", color: "#bb66ff", glow: "#dd99ff", letter: "W", durationMs: 8000 },
  heavy: { label: "Heavy Slug", color: "#ff4466", glow: "#ff7799", letter: "H", durationMs: 8000 },
  shield: { label: "Energy Shield", color: "#44ffcc", glow: "#88ffdd", letter: "⛨", durationMs: null },
};

export const ALL_POWERUP_KINDS: PowerupKind[] = [
  "speed",
  "rapid",
  "spread",
  "heavy",
  "shield",
];
