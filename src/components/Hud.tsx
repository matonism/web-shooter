import { POWERUP_DEFS } from "@shared/powerups";
import type { RoomStatePublic } from "@shared/types";

interface HudProps {
  roomState: RoomStatePublic;
}

export function Hud({ roomState }: HudProps) {
  const me = roomState.world?.players.find((p) => p.id === roomState.youId);
  const redPlayers = roomState.world?.players.filter((p) => p.team === "red") ?? [];
  const bluePlayers = roomState.world?.players.filter((p) => p.team === "blue") ?? [];
  const now = Date.now();

  const hasBoost = (p: { activePowerups: { until: number }[]; shield: number }) =>
    p.shield > 0 || p.activePowerups.some((e) => e.until > now);

  return (
    <div className="hud">
      <div className="hud-top">
        {me && (
          <div className="hud-panel health-bar-wrap">
            <div className="health-bar-label">Health</div>
            <div className="health-bar">
              <div
                className={`health-bar-fill ${me.team}-team`}
                style={{ width: `${(me.hp / me.maxHp) * 100}%` }}
              />
            </div>
            {me.shield > 0 && (
              <div className="hud-shield">Shield {me.shield}</div>
            )}
            {me.activePowerups.map((effect) => {
              const def = POWERUP_DEFS[effect.kind];
              const seconds =
                effect.until > now ? Math.ceil((effect.until - now) / 1000) : null;
              return (
                <div
                  key={effect.kind}
                  className="hud-powerup"
                  style={{ color: def.color }}
                >
                  {def.label}
                  {seconds !== null ? ` · ${seconds}s` : ""}
                </div>
              );
            })}
          </div>
        )}

        <div className="hud-panel scoreboard">
          <div style={{ color: "var(--red-team)", fontWeight: 700, marginBottom: 4 }}>
            RED
          </div>
          {redPlayers.map((p) => (
            <div
              key={p.id}
              className={`scoreboard-row ${p.eliminated ? "eliminated" : ""}`}
            >
              <span>
                {p.name}
                {p.id === roomState.youId ? " (you)" : ""}
                {hasBoost(p) ? " ⚡" : ""}
              </span>
              <span>{p.hp}</span>
            </div>
          ))}
          <div
            style={{
              color: "var(--blue-team)",
              fontWeight: 700,
              marginTop: 8,
              marginBottom: 4,
            }}
          >
            BLUE
          </div>
          {bluePlayers.map((p) => (
            <div
              key={p.id}
              className={`scoreboard-row ${p.eliminated ? "eliminated" : ""}`}
            >
              <span>
                {p.name}
                {p.id === roomState.youId ? " (you)" : ""}
                {hasBoost(p) ? " ⚡" : ""}
              </span>
              <span>{p.hp}</span>
            </div>
          ))}
        </div>
      </div>

      {me?.eliminated && <div className="eliminated-banner">ELIMINATED</div>}
    </div>
  );
}
