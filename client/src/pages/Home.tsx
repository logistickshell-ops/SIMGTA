// Ночной картограф: страница отдаёт центр Canvas миру, а интерфейс располагает по картографическим краям.
import { useEffect, useRef, useState } from 'react';
import { Game, type GameMode, type Tool } from '@/game/Game';
import { Renderer } from '@/game/Renderer';
import { GameUI } from '@/components/GameUI';

type InputState = { mouseX: number; mouseY: number; mouseDown: boolean; rightDown: boolean; keys: Record<string, boolean> };

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const inputRef = useRef<InputState>({ mouseX: 0, mouseY: 0, mouseDown: false, rightDown: false, keys: {} });
  const rafRef = useRef(0);
  const previousRef = useRef(performance.now());
  const [, setFrame] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game();
    const renderer = new Renderer(canvas, game);
    gameRef.current = game;
    setReady(true);
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; renderer.resize(canvas.width, canvas.height); };
    const updatePointer = (event: PointerEvent | MouseEvent) => { inputRef.current.mouseX = event.clientX; inputRef.current.mouseY = event.clientY; };
    const onPointerDown = (event: PointerEvent) => { if (event.target !== canvas) return; event.preventDefault(); updatePointer(event); if (event.button === 0) inputRef.current.mouseDown = true; if (event.button === 2) inputRef.current.rightDown = true; };
    const onPointerUp = () => { inputRef.current.mouseDown = false; inputRef.current.rightDown = false; };
    const onKeyDown = (event: KeyboardEvent) => {
      inputRef.current.keys[event.code] = true;
      if (event.code === 'Tab') { event.preventDefault(); game.mode = game.mode === 'strategy' ? 'action' : 'strategy'; }
      if (event.code === 'KeyP') game.togglePause();
      if (event.code === 'KeyR') game.gameOver ? game.restart() : game.respawnHero();
      if (event.code === 'KeyG') game.toggleAutopilot();
      const tools: Tool[] = ['residential', 'commercial', 'industrial', 'road', 'park', 'policestation', 'hospital', 'firestation', 'school'];
      const index = Number(event.key) - 1;
      if (index >= 0 && index < tools.length) game.tool = tools[index];
    };
    const onKeyUp = (event: KeyboardEvent) => { inputRef.current.keys[event.code] = false; };
    const onWheel = (event: WheelEvent) => { if (event.target !== canvas) return; event.preventDefault(); game.zoomCamera(event.deltaY < 0 ? 1.13 : 0.88, event.clientX, event.clientY); };
    const loop = (time: number) => {
      const dt = time - previousRef.current; previousRef.current = time;
      game.update(dt, inputRef.current);
      renderer.draw();
      if (Math.floor(time / 100) !== Math.floor((time - dt) / 100)) setFrame(value => (value + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(loop);
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', updatePointer);
    window.addEventListener('pointerdown', onPointerDown, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('contextmenu', event => { if (event.target === canvas) event.preventDefault(); });
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize); window.removeEventListener('pointermove', updatePointer);
      window.removeEventListener('pointerdown', onPointerDown); window.removeEventListener('pointerup', onPointerUp); window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('wheel', onWheel);
    };
  }, []);

  const game = gameRef.current;
  const setMode = (mode: GameMode) => { if (game) game.mode = mode; };
  const setTool = (tool: Tool) => { if (game) game.tool = tool; };

  return (
    <main className="urban-game-shell" aria-label="Urban Flux — Criminal City Builder">
      <canvas ref={canvasRef} className="urban-canvas" aria-label="Игровая карта Urban Flux" />
      {ready && game && <GameUI game={game} onModeChange={setMode} onToolChange={setTool} />}
      <div className="corner-grain" aria-hidden="true" />
    </main>
  );
}

