import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerInput, RacePositionPayload, RoomStatePublic } from "@shared/types";
import { isRaceWorld } from "@shared/types";
import { MobileControls } from "../components/MobileControls";
import { isTouchDevice } from "../utils/touchDevice";
import { RaceClientGame } from "./raceClientGame";
import { drawRaceGame, RACE_VIEW } from "./raceRenderer";

interface RaceCanvasProps {
  roomState: RoomStatePublic;
  onInput: (input: PlayerInput) => void;
  onPosition: (position: RacePositionPayload) => void;
}

export function RaceCanvas({ roomState, onInput, onPosition }: RaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(new RaceClientGame());
  const rafRef = useRef(0);
  const roomStateRef = useRef(roomState);
  const onInputRef = useRef(onInput);
  const onPositionRef = useRef(onPosition);
  const jumpRef = useRef(false);
  roomStateRef.current = roomState;
  onInputRef.current = onInput;
  onPositionRef.current = onPosition;
  const [touchControls] = useState(isTouchDevice);
  const [showDebug, setShowDebug] = useState(
    () => new URLSearchParams(window.location.search).has("raceDebug"),
  );
  const showDebugRef = useRef(showDebug);
  showDebugRef.current = showDebug;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyH" && !e.repeat) {
        setShowDebug((on) => !on);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const game = gameRef.current;
    game.bindInput();
    game.setLocalId(roomState.youId);
    game.enableTouchControls(touchControls);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastFrame = performance.now();

    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;

      const state = roomStateRef.current;
      if (state.phase === "playing" && state.world && isRaceWorld(state.world)) {
        game.applyServerSnapshot(state.world);
        const racing = state.world.countdownSeconds <= 0;
        if (racing) {
          game.applyLocalPrediction(dt, (input) => onInputRef.current(input));
          game.sendDisplayPosition((pos) => onPositionRef.current(pos));
        }

        const render = game.getRenderState(dt, showDebugRef.current);
        if (render) {
          drawRaceGame(ctx, render);
        }
      } else {
        const render = game.getRenderState(dt, showDebugRef.current);
        if (render) {
          drawRaceGame(ctx, render);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [roomState.youId, touchControls]);

  const onJumpDown = useCallback(() => {
    jumpRef.current = true;
    gameRef.current.setJumpPressed(true);
  }, []);

  const onJumpUp = useCallback(() => {
    jumpRef.current = false;
    gameRef.current.setJumpPressed(false);
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="game-canvas game-canvas--race"
        width={RACE_VIEW.width}
        height={RACE_VIEW.height}
      />
      <button
        type="button"
        className="race-debug-btn"
        aria-pressed={showDebug}
        onClick={() => setShowDebug((on) => !on)}
      >
        {showDebug ? "Hide hitboxes" : "Show hitboxes (H)"}
      </button>
      {touchControls && (
        <>
          <MobileControls game={gameRef.current} showTapHint={false} />
          <button
            type="button"
            className="race-jump-btn"
            onTouchStart={(e) => {
              e.preventDefault();
              onJumpDown();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              onJumpUp();
            }}
            onMouseDown={onJumpDown}
            onMouseUp={onJumpUp}
            onMouseLeave={onJumpUp}
          >
            JUMP
          </button>
        </>
      )}
    </>
  );
}
