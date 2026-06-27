import { useCallback, useEffect, useRef } from "react";

interface TouchMoveGame {
  enableTouchControls: (enabled: boolean) => void;
  setTouchMove: (moveX: number, moveY: number) => void;
}

interface SnakeMobileControlsProps {
  game: TouchMoveGame;
  disabled?: boolean;
}

type Dir = "up" | "down" | "left" | "right" | null;

const DIR_VEC: Record<Exclude<Dir, null>, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function SnakeMobileControls({ game, disabled = false }: SnakeMobileControlsProps) {
  const activeDir = useRef<Dir>(null);

  const applyDir = useCallback(
    (dir: Dir) => {
      if (disabled) return;
      activeDir.current = dir;
      if (!dir) {
        game.setTouchMove(0, 0);
        return;
      }
      const v = DIR_VEC[dir];
      game.setTouchMove(v.x, v.y);
    },
    [game, disabled],
  );

  useEffect(() => {
    game.enableTouchControls(true);
    return () => {
      game.enableTouchControls(false);
      game.setTouchMove(0, 0);
    };
  }, [game]);

  useEffect(() => {
    if (disabled) applyDir(null);
  }, [disabled, applyDir]);

  const bind = (dir: Exclude<Dir, null>) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      applyDir(dir);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      if (activeDir.current === dir) applyDir(null);
    },
    onPointerCancel: () => {
      if (activeDir.current === dir) applyDir(null);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.buttons === 0 && activeDir.current === dir) applyDir(null);
    },
  });

  return (
    <div className="snake-mobile-controls" aria-hidden={disabled}>
      <div className="snake-dpad">
        <button type="button" className="snake-dpad-btn snake-dpad-up" aria-label="Up" {...bind("up")}>
          ▲
        </button>
        <button type="button" className="snake-dpad-btn snake-dpad-left" aria-label="Left" {...bind("left")}>
          ◀
        </button>
        <button type="button" className="snake-dpad-btn snake-dpad-center" tabIndex={-1} aria-hidden>
          ·
        </button>
        <button type="button" className="snake-dpad-btn snake-dpad-right" aria-label="Right" {...bind("right")}>
          ▶
        </button>
        <button type="button" className="snake-dpad-btn snake-dpad-down" aria-label="Down" {...bind("down")}>
          ▼
        </button>
      </div>
    </div>
  );
}
