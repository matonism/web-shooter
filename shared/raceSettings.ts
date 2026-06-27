export type RaceScoringMode = "ffa" | "team";
export type RaceVisibility = "full" | "ghost" | "minimap" | "hidden";

export interface RaceSettings {
  scoringMode: RaceScoringMode;
  visibility: RaceVisibility;
}

export const DEFAULT_RACE_SETTINGS: RaceSettings = {
  scoringMode: "ffa",
  visibility: "ghost",
};

export const RACE_SCORING_OPTIONS: { id: RaceScoringMode; label: string; desc: string }[] = [
  { id: "ffa", label: "Free-for-all", desc: "First racer across the line wins." },
  { id: "team", label: "Team race", desc: "First finisher wins for their team." },
];

export const RACE_VISIBILITY_OPTIONS: { id: RaceVisibility; label: string; desc: string }[] = [
  { id: "full", label: "Full sprites", desc: "See every racer on your screen." },
  { id: "ghost", label: "Ghosts", desc: "Other racers appear faded." },
  { id: "minimap", label: "Minimap", desc: "Others shown as dots on a mini map." },
  { id: "hidden", label: "Hidden", desc: "Only your racer is drawn." },
];
