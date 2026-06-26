import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientGame } from "../game/clientGame";

const MOVE_RADIUS = 52;

interface MobileControlsProps {
  game: ClientGame;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  disabled?: boolean;
}

export function MobileControls({ game, canvasRef, disabled }: MobileControlsProps) {
  const moveRef = useRef<HTMLDivElement>(null);
  const moveTouchId = useRef<number | null>(null);
  const aimTouchId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [aiming, setAiming] = useState(false);

  const getAimAngle = useCallback(
    (clientX: number, clientY: number): number => {
      const anchor = game.getLocalScreenPosition(canvasRef.current);
      if (!anchor) return game.getTouchAimAngle();
      return Math.atan2(clientY - anchor.y, clientX - anchor.x);
    },
    [game, canvasRef],
  );

  const pushTouchState = useCallback(
    (moveX: number, moveY: number, aimAngle: number, firing: boolean) => {
      game.setTouchControls({ moveX, moveY, aimAngle, firing });
    },
    [game],
  );

  const resetMove = useCallback(() => {
    moveTouchId.current = null;
    setKnob({ x: 0, y: 0 });
    pushTouchState(0, 0, game.getTouchAimAngle(), aimTouchId.current !== null);
  }, [game, pushTouchState]);

  const resetAim = useCallback(() => {
    aimTouchId.current = null;
    setAiming(false);
    pushTouchState(
      knob.x / MOVE_RADIUS,
      knob.y / MOVE_RADIUS,
      game.getTouchAimAngle(),
      false,
    );
  }, [game, knob.x, knob.y, pushTouchState]);

  useEffect(() => {
    game.enableTouchControls(true);
    return () => {
      game.enableTouchControls(false);
      game.setTouchControls({ moveX: 0, moveY: 0, firing: false });
    };
  }, [game]);

  useEffect(() => {
    if (disabled) {
      resetMove();
      resetAim();
    }
  }, [disabled, resetMove, resetAim]);

  const updateMoveFromTouch = useCallback(
    (clientX: number, clientY: number) => {
      const el = moveRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > MOVE_RADIUS) {
        dx = (dx / dist) * MOVE_RADIUS;
        dy = (dy / dist) * MOVE_RADIUS;
      }
      setKnob({ x: dx, y: dy });
      pushTouchState(
        dx / MOVE_RADIUS,
        dy / MOVE_RADIUS,
        game.getTouchAimAngle(),
        aimTouchId.current !== null,
      );
    },
    [game, pushTouchState],
  );

  const onMoveStart = (e: React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    moveTouchId.current = touch.identifier;
    updateMoveFromTouch(touch.clientX, touch.clientY);
  };

  const onAimStart = (e: React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    aimTouchId.current = touch.identifier;
    setAiming(true);
    const angle = getAimAngle(touch.clientX, touch.clientY);
    pushTouchState(knob.x / MOVE_RADIUS, knob.y / MOVE_RADIUS, angle, true);
  };

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]!;
        if (t.identifier === moveTouchId.current) {
          e.preventDefault();
          updateMoveFromTouch(t.clientX, t.clientY);
        }
        if (t.identifier === aimTouchId.current) {
          e.preventDefault();
          const angle = getAimAngle(t.clientX, t.clientY);
          pushTouchState(knob.x / MOVE_RADIUS, knob.y / MOVE_RADIUS, angle, true);
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]!;
        if (t.identifier === moveTouchId.current) resetMove();
        if (t.identifier === aimTouchId.current) resetAim();
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
  }, [getAimAngle, knob.x, knob.y, pushTouchState, resetAim, resetMove, updateMoveFromTouch]);

  return (
    <div className="mobile-controls" aria-hidden={disabled}>
      <div
        ref={moveRef}
        className="mobile-stick mobile-stick--move"
        onTouchStart={onMoveStart}
      >
        <div className="mobile-stick-ring" />
        <div
          className="mobile-stick-knob"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
        <span className="mobile-stick-label">MOVE</span>
      </div>

      <div
        className={`mobile-aim-zone${aiming ? " mobile-aim-zone--active" : ""}`}
        onTouchStart={onAimStart}
      >
        <span className="mobile-aim-label">AIM &amp; FIRE</span>
        <span className="mobile-aim-hint">drag to aim · hold to shoot</span>
      </div>
    </div>
  );
}
