import type { RoomStatePublic } from "@shared/types";
import { isSnakeWorld } from "@shared/types";

interface SnakeHudProps {
  roomState: RoomStatePublic;
}

export function SnakeHud({ roomState }: SnakeHudProps) {
  if (!roomState.world || !isSnakeWorld(roomState.world)) return null;

  const world = roomState.world;
  const me = world.snakes.find((s) => s.id === roomState.youId);
  const ranked = [...world.snakes].sort((a, b) => b.score - a.score);

  return (
    <div className="hud">
      <div className="hud-top">
        {me && (
          <div className="hud-panel">
            <div className="hud-snake-status" style={{ color: me.color }}>
              {world.countdownSeconds > 0
                ? `Starting in ${world.countdownSeconds}…`
                : me.alive
                  ? `Score ${me.score}`
                  : "Eliminated"}
            </div>
          </div>
        )}

        <div className="hud-panel scoreboard">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>SNAKES</div>
          {ranked.map((s) => (
            <div
              key={s.id}
              className={`scoreboard-row ${!s.alive ? "eliminated" : ""}`}
            >
              <span style={{ color: s.color }}>
                {s.name}
                {s.id === roomState.youId ? " (you)" : ""}
                {!s.alive ? " 💀" : " 🐍"}
              </span>
              <span>{s.score}</span>
            </div>
          ))}
        </div>
      </div>

      {me && !me.alive && <div className="eliminated-banner">ELIMINATED</div>}
    </div>
  );
}
