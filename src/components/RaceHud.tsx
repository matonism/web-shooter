import type { RoomStatePublic } from "@shared/types";
import { isRaceWorld } from "@shared/types";

interface RaceHudProps {
  roomState: RoomStatePublic;
}

function formatMs(ms: number): string {
  const sec = ms / 1000;
  return sec.toFixed(2) + "s";
}

export function RaceHud({ roomState }: RaceHudProps) {
  if (!roomState.world || !isRaceWorld(roomState.world)) return null;

  const world = roomState.world;
  const me = world.racers.find((r) => r.id === roomState.youId);
  const ranked = [...world.racers].sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishTimeMs ?? 999999) - (b.finishTimeMs ?? 999999);
    }
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.x - a.x;
  });
  const myPlace = ranked.findIndex((r) => r.id === roomState.youId) + 1;

  return (
    <div className="hud">
      <div className="hud-top">
        {me && (
          <div className="hud-panel">
            <div className="hud-race-status" style={{ color: me.color }}>
              {world.countdownSeconds > 0
                ? `Starting in ${world.countdownSeconds}…`
                : me.finished
                  ? roomState.matchWinner
                    ? `Finished · ${formatMs(me.finishTimeMs ?? 0)}`
                    : `Finished · ${formatMs(me.finishTimeMs ?? 0)} · waiting for others`
                  : `Position ${myPlace}/${world.racers.length}`}
            </div>
            <div className="hud-race-mode hint">
              {world.settings.scoringMode === "team" ? "Team race" : "Free-for-all"} ·{" "}
              {world.settings.visibility === "full"
                ? "Full view"
                : world.settings.visibility === "ghost"
                  ? "Ghosts"
                  : world.settings.visibility === "minimap"
                    ? "Minimap"
                    : "Solo view"}
              {!me.finished && world.countdownSeconds === 0 && (
                <> · {me.hasCheckpoint ? "Checkpoint ✓" : "No checkpoint"}</>
              )}
            </div>
          </div>
        )}

        <div className="hud-panel scoreboard">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>RACE</div>
          {ranked.map((r, i) => (
            <div
              key={r.id}
              className={`scoreboard-row ${r.finished ? "" : ""}`}
            >
              <span style={{ color: r.color }}>
                {i + 1}. {r.name}
                {r.id === roomState.youId ? " (you)" : ""}
                {r.finished ? " 🏁" : ""}
              </span>
              <span>{r.finished ? formatMs(r.finishTimeMs ?? 0) : "…"}</span>
            </div>
          ))}
        </div>
      </div>

      {me?.finished && world.countdownSeconds === 0 && (
        <div className="eliminated-banner race-finish-banner">FINISHED</div>
      )}
    </div>
  );
}
