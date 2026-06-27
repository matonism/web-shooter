import { useCallback, useEffect, useRef } from "react";

interface TouchMoveGame {
  enableTouchControls: (enabled: boolean) => void;
  setTouchMove: (moveX: number, moveY: number) => void;
  pulseDirection: (moveX: number, moveY: number) => void;
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

const SWIPE_MIN_PX = 32;
const SWIPE_MAX_MS = 450;

function swipeToDir(dx: number, dy: number): Exclude<Dir, null> | null {
  if (Math.hypot(dx, dy) < SWIPE_MIN_PX) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export function SnakeMobileControls({ game, disabled = false }: SnakeMobileControlsProps) {
  const activeDir = useRef<Dir>(null);
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);

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

  const applySwipe = useCallback(
    (dir: Exclude<Dir, null>) => {
      if (disabled) return;
      const v = DIR_VEC[dir];
      game.pulseDirection(v.x, v.y);
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

  const bindSwipe = {
    onPointerDown: (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      swipeRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (disabled) return;
      const start = swipeRef.current;
      swipeRef.current = null;
      if (!start) return;
      if (e.timeStamp - start.t > SWIPE_MAX_MS) return;
      const dir = swipeToDir(e.clientX - start.x, e.clientY - start.y);
      if (dir) applySwipe(dir);
    },
    onPointerCancel: () => {
      swipeRef.current = null;
    },
  };

  return (
    <div className="snake-mobile-controls" aria-hidden={disabled}>
      <div className="snake-swipe-surface" aria-hidden {...bindSwipe} />
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
