import { useEffect, useRef, useState } from "react";
import { SNAKE_ARENA } from "@shared/snakeConstants";
import { isSnakeWorld } from "@shared/types";
import type { RoomStatePublic } from "@shared/types";
import { MobileControls } from "../components/MobileControls";
import { isTouchDevice } from "../utils/touchDevice";
import { SnakeClientGame } from "./snakeClientGame";
import { drawSnakeGame } from "./snakeRenderer";

interface SnakeCanvasProps {
  roomState: RoomStatePublic;
  onInput: (input: ReturnType<SnakeClientGame["buildInput"]>) => void;
}

export function SnakeCanvas({ roomState, onInput }: SnakeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(new SnakeClientGame());
  const rafRef = useRef(0);
  const roomStateRef = useRef(roomState);
  roomStateRef.current = roomState;
  const [touchControls] = useState(isTouchDevice);

  const localSnake =
    roomState.world && isSnakeWorld(roomState.world)
      ? roomState.world.snakes.find((s) => s.id === roomState.youId)
      : undefined;
  const eliminated = localSnake ? !localSnake.alive : false;

  useEffect(() => {
    const game = gameRef.current;
    game.bindInput();
    game.setLocalId(roomState.youId);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = () => {
      const state = roomStateRef.current;
      if (state.phase === "playing" && state.world && isSnakeWorld(state.world)) {
        const input = game.buildInput();
        onInput(input);
        drawSnakeGame(ctx, state.world, state.youId);
      } else {
        const snap = game.getSnapshot();
        if (snap) drawSnakeGame(ctx, snap, state.youId);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [roomState.youId, onInput]);

  useEffect(() => {
    if (roomState.world && isSnakeWorld(roomState.world)) {
      gameRef.current.onServerSnapshot(roomState.world);
    }
  }, [roomState.world?.tick]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="game-canvas game-canvas--snake"
        width={SNAKE_ARENA.width}
        height={SNAKE_ARENA.height}
      />
      {touchControls && (
        <MobileControls game={gameRef.current} disabled={eliminated} showTapHint={false} />
      )}
    </>
  );
}
