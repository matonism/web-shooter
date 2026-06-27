import { useEffect, useRef, useState } from "react";
import { ARENA, TICK_MS } from "@shared/constants";
import type { RoomStatePublic } from "@shared/types";
import { isShooterWorld } from "@shared/types";
import { ShooterMobileControls } from "../components/ShooterMobileControls";
import { isTouchDevice } from "../utils/touchDevice";
import { ClientGame } from "./clientGame";
import { drawGame } from "./renderer";

interface GameCanvasProps {
  roomState: RoomStatePublic;
  onInput: (input: ReturnType<ClientGame["buildInput"]>) => void;
}

export function GameCanvas({ roomState, onInput }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(new ClientGame());
  const rafRef = useRef(0);
  const roomStateRef = useRef(roomState);
  const onInputRef = useRef(onInput);
  const lastInputSendRef = useRef(0);
  roomStateRef.current = roomState;
  onInputRef.current = onInput;
  const [touchControls] = useState(isTouchDevice);

  const localPlayer =
    roomState.world && isShooterWorld(roomState.world)
      ? roomState.world.players.find((p) => p.id === roomState.youId)
      : undefined;
  const eliminated = localPlayer?.eliminated ?? false;

  const aimMode =
    roomState.world && isShooterWorld(roomState.world)
      ? roomState.world.settings.aimMode
      : "free";
  const bombPlaced = localPlayer?.bombPlaced ?? false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameRef.current.bindInput(canvas);
    gameRef.current.setLocalId(roomState.youId);
    gameRef.current.setInputFlush((input) => {
      if (roomStateRef.current.phase === "playing") onInputRef.current(input);
    });

    const state = roomStateRef.current;
    if (state.world && isShooterWorld(state.world)) {
      const lp = state.world.players.find((p) => p.id === state.youId);
      if (lp) gameRef.current.resetFromPlayer(lp);
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastFrame = performance.now();

    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;

      const state = roomStateRef.current;
      if (state.phase === "playing" && state.world && isShooterWorld(state.world)) {
        gameRef.current.applyServerSnapshot(state.world);

        const input = gameRef.current.buildInput();
        gameRef.current.applyLocalPrediction(input, dt);

        if (now - lastInputSendRef.current >= TICK_MS) {
          lastInputSendRef.current = now;
          onInputRef.current(input);
        }
      }

      const renderState = gameRef.current.getRenderState();
      if (renderState) drawGame(ctx, renderState);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      gameRef.current.setInputFlush(null);
      cancelAnimationFrame(rafRef.current);
    };
  }, [roomState.youId]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="game-canvas"
        width={ARENA.width}
        height={ARENA.height}
      />
      {touchControls && (
        <ShooterMobileControls
          game={gameRef.current}
          disabled={eliminated}
          aimMode={aimMode}
          bombPlaced={bombPlaced}
        />
      )}
    </>
  );
}

