import { useCallback, useEffect, useRef, useState } from "react";

const STICK_RADIUS = 52;

export interface TouchMoveGame {
  enableTouchControls(enabled: boolean): void;
  setTouchMove(moveX: number, moveY: number): void;
  setTouchControls?(partial: { firing?: boolean }): void;
}

interface MobileControlsProps {
  game: TouchMoveGame;
  disabled?: boolean;
  showTapHint?: boolean;
}

export function MobileControls({ game, disabled, showTapHint = true }: MobileControlsProps) {
  const moveRef = useRef<HTMLDivElement>(null);
  const moveTouchId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const pushMove = useCallback(
    (dx: number, dy: number) => {
      game.setTouchMove(dx / STICK_RADIUS, dy / STICK_RADIUS);
    },
    [game],
  );

  const resetMove = useCallback(() => {
    moveTouchId.current = null;
    setKnob({ x: 0, y: 0 });
    game.setTouchMove(0, 0);
  }, [game]);

  useEffect(() => {
    game.enableTouchControls(true);
    return () => {
      game.enableTouchControls(false);
      game.setTouchMove(0, 0);
      game.setTouchControls?.({ firing: false });
    };
  }, [game]);

  useEffect(() => {
    if (disabled) resetMove();
  }, [disabled, resetMove]);

  const updateStick = useCallback((clientX: number, clientY: number) => {
    const el = moveRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > STICK_RADIUS) {
      dx = (dx / dist) * STICK_RADIUS;
      dy = (dy / dist) * STICK_RADIUS;
    }
    return { x: dx, y: dy };
  }, []);

  const onMoveStart = (e: React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    moveTouchId.current = touch.identifier;
    const k = updateStick(touch.clientX, touch.clientY);
    setKnob(k);
    pushMove(k.x, k.y);
  };

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]!;
        if (t.identifier !== moveTouchId.current) continue;
        e.preventDefault();
        const k = updateStick(t.clientX, t.clientY);
        setKnob(k);
        pushMove(k.x, k.y);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i]!.identifier === moveTouchId.current) resetMove();
      }
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [pushMove, resetMove, updateStick]);

  return (
    <div className="mobile-controls" aria-hidden={disabled}>
      <div ref={moveRef} className="mobile-stick mobile-stick--move" onTouchStart={onMoveStart}>
        <div className="mobile-stick-ring" />
        <div
          className="mobile-stick-knob"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
        <span className="mobile-stick-label">MOVE</span>
      </div>
      {showTapHint && (
        <p className="mobile-tap-hint">Tap arena to aim &amp; shoot</p>
      )}
    </div>
  );
}
