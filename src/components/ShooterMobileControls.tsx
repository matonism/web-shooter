import { useCallback, useEffect, useRef, useState } from "react";
import type { ShooterAimMode } from "@shared/shooterSettings";
import type { ClientGame } from "../game/clientGame";

const STICK_RADIUS = 52;

interface ShooterMobileControlsProps {
  game: ClientGame;
  disabled?: boolean;
  aimMode: ShooterAimMode;
  bombPlaced?: boolean;
}

function useVirtualStick(
  game: ClientGame,
  disabled: boolean,
  onMove: (x: number, y: number) => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  const touchId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const reset = useCallback(() => {
    touchId.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  }, [onMove]);

  const updateStick = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
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

  const push = useCallback(
    (dx: number, dy: number) => {
      onMove(dx / STICK_RADIUS, dy / STICK_RADIUS);
    },
    [onMove],
  );

  const onStart = (e: React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    touchId.current = touch.identifier;
    const k = updateStick(touch.clientX, touch.clientY);
    setKnob(k);
    push(k.x, k.y);
  };

  useEffect(() => {
    const id = touchId;
    const onTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]!;
        if (t.identifier !== id.current) continue;
        e.preventDefault();
        const k = updateStick(t.clientX, t.clientY);
        setKnob(k);
        push(k.x, k.y);
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i]!.identifier === id.current) reset();
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
  }, [push, reset, updateStick]);

  useEffect(() => {
    if (disabled) reset();
  }, [disabled, reset]);

  return { ref, knob, onStart };
}

export function ShooterMobileControls({
  game,
  disabled = false,
  aimMode,
  bombPlaced = false,
}: ShooterMobileControlsProps) {
  const moveStick = useVirtualStick(game, disabled, useCallback(
    (x, y) => game.setTouchMove(x, y),
    [game],
  ));

  const aimStick = useVirtualStick(game, disabled, useCallback(
    (x, y) => game.setTouchAim(x, y),
    [game],
  ));

  useEffect(() => {
    game.enableTouchControls(true);
    return () => {
      game.enableTouchControls(false);
      game.resetTouchInput();
    };
  }, [game]);

  const bindFire = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      game.setTouchFire(true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      game.setTouchFire(false);
    },
    onPointerCancel: () => game.setTouchFire(false),
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.buttons === 0) game.setTouchFire(false);
    },
  };

  const bindBomb = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      if (!disabled && !bombPlaced) game.triggerTouchBomb();
    },
  };

  return (
    <div className="shooter-mobile-controls" aria-hidden={disabled}>
      <div
        ref={moveStick.ref}
        className="mobile-stick mobile-stick--move"
        onTouchStart={moveStick.onStart}
      >
        <div className="mobile-stick-ring" />
        <div
          className="mobile-stick-knob"
          style={{ transform: `translate(${moveStick.knob.x}px, ${moveStick.knob.y}px)` }}
        />
        <span className="mobile-stick-label">MOVE</span>
      </div>

      <div className="shooter-mobile-actions">
        {aimMode === "free" && (
          <div
            ref={aimStick.ref}
            className="shooter-aim-stick"
            onTouchStart={aimStick.onStart}
          >
            <div className="mobile-stick-ring" />
            <div
              className="mobile-stick-knob"
              style={{ transform: `translate(${aimStick.knob.x}px, ${aimStick.knob.y}px)` }}
            />
            <span className="mobile-stick-label">AIM</span>
          </div>
        )}

        <button
          type="button"
          className="shooter-action-btn shooter-bomb-btn"
          disabled={disabled || bombPlaced}
          aria-label="Drop bomb"
          {...bindBomb}
        >
          BOMB
        </button>
        <button type="button" className="shooter-action-btn shooter-fire-btn" aria-label="Fire" {...bindFire}>
          FIRE
        </button>
      </div>

      <p className="shooter-mobile-hint">
        {aimMode === "free"
          ? "Move · Aim stick · Hold FIRE · Tap BOMB"
          : "Move to aim · Hold FIRE · Tap BOMB"}
      </p>
    </div>
  );
}
