import { useEffect, useRef, useState } from "react";
import { ARENA } from "@shared/constants";
import type { RoomStatePublic } from "@shared/types";
import { MobileControls } from "../components/MobileControls";
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
  roomStateRef.current = roomState;
  const [touchControls] = useState(isTouchDevice);

  const localPlayer = roomState.world?.players.find((p) => p.id === roomState.youId);
  const eliminated = localPlayer?.eliminated ?? false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameRef.current.bindInput(canvas);
    gameRef.current.setLocalId(roomState.youId);
    gameRef.current.setInputFlush((input) => {
      if (roomStateRef.current.phase === "playing") onInput(input);
    });

    const localPlayer = roomState.world?.players.find((p) => p.id === roomState.youId);
    if (localPlayer) gameRef.current.resetFromPlayer(localPlayer);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastFrame = performance.now();

    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;

      const state = roomStateRef.current;
      if (state.phase === "playing" && state.world) {
        const input = gameRef.current.buildInput();
        gameRef.current.applyLocalPrediction(input, dt);
        onInput(input);
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
  }, [roomState.youId, onInput]);

  useEffect(() => {
    if (roomState.world) {
      gameRef.current.onServerSnapshot(roomState.world);
    }
  }, [roomState.world?.tick]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="game-canvas"
        width={ARENA.width}
        height={ARENA.height}
      />
      {touchControls && (
        <MobileControls
          game={gameRef.current}
          disabled={eliminated}
        />
      )}
    </>
  );
}
