import { useEffect, useRef, useState } from 'react';
import { Game, GameMode, Tool } from './game/Game';
import { Renderer } from './game/Renderer';
import { UI } from './components/UI';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputRef = useRef({
    mouseX: 0, mouseY: 0, mouseDown: false, rightDown: false,
    keys: {} as Record<string, boolean>,
  });
  const lastTimeRef = useRef(performance.now());
  const lastUiUpdateRef = useRef(0);
  const rafRef = useRef<number>(0);
  const [, setRerender] = useState(0);

  const centerCameraOnPlayer = (game: Game) => {
    game.camera.x = game.player.x - window.innerWidth / (2 * game.camera.zoom);
    game.camera.y = game.player.y - window.innerHeight / (2 * game.camera.zoom);
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const game = new Game();
    gameRef.current = game;
    const renderer = new Renderer(canvas, game);
    rendererRef.current = renderer;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      renderer.resize(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    // helper to verify input is strictly on the game canvas and not on any UI panels, buttons or inputs
    const isGameSurface = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      // Если кликнули по элементу UI (кнопка, панель, инпут) или его потомкам — это не игровой холст
      if (el.closest('.panel-pixel, .btn-pixel, button, input, [data-ui-element="true"]')) {
        return false;
      }
      return el.tagName === 'CANVAS';
    };

    // input handlers
    const onMouseMove = (e: MouseEvent) => {
      inputRef.current.mouseX = e.clientX;
      inputRef.current.mouseY = e.clientY;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!isGameSurface(e.target)) return;
      if (e.button === 0) inputRef.current.mouseDown = true;
      if (e.button === 2) inputRef.current.rightDown = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) inputRef.current.mouseDown = false;
      if (e.button === 2) inputRef.current.rightDown = false;
    };
    const onContextMenu = (e: MouseEvent) => {
      if (isGameSurface(e.target)) e.preventDefault();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !isGameSurface(e.target)) return;
      e.preventDefault();
      inputRef.current.mouseX = e.clientX;
      inputRef.current.mouseY = e.clientY;
      inputRef.current.mouseDown = true;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !isGameSurface(e.target)) return;
      e.preventDefault();
      inputRef.current.mouseX = e.clientX;
      inputRef.current.mouseY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      inputRef.current.mouseDown = false;
      inputRef.current.rightDown = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      inputRef.current.keys[e.code] = true;
      if (e.code === 'Tab') {
        e.preventDefault();
        game.mode = game.mode === 'strategy' ? 'action' : 'strategy';
        if (game.mode === 'action') {
          centerCameraOnPlayer(game);
        }
        setRerender(x => x + 1);
      }
      if (e.code === 'KeyP') {
        game.setSimulationSpeed(game.simulationSpeed === 0 ? 1 : 0);
        setRerender(x => x + 1);
      }
      if (e.code === 'KeyO') {
        game.toggleAutopilot();
        setRerender(x => x + 1);
      }
      if (e.code === 'KeyR') {
        if (game.gameOver) game.restart();
        else game.respawnHero();
        setRerender(x => x + 1);
      }
      // hotkeys 1-9 for buildings
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        const tools: Tool[] = ['residential', 'commercial', 'industrial', 'road', 'park', 'policestation', 'hospital', 'firestation', 'school'];
        game.tool = tools[num - 1];
        setRerender(x => x + 1);
      }
      if (e.code === 'KeyB') {
        game.tool = 'bulldoze';
        setRerender(x => x + 1);
      }
      if (e.code === 'KeyI') {
        game.tool = 'inspect';
        setRerender(x => x + 1);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      inputRef.current.keys[e.code] = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('pointerdown', onPointerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);


    // game loop
    const loop = (time: number) => {
      const dt = Math.min(50, time - lastTimeRef.current);
      lastTimeRef.current = time;
      game.update(dt, inputRef.current);
      renderer.draw();
      if (time - lastUiUpdateRef.current > 100) {
        lastUiUpdateRef.current = time;
        setRerender(x => (x + 1) % 1000000);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);

    };
  }, []);

  const handleToolChange = (t: Tool) => {
    if (gameRef.current) gameRef.current.tool = t;
  };
  const handleModeChange = (m: GameMode) => {
    if (gameRef.current) {
      gameRef.current.mode = m;
      if (m === 'action') {
        centerCameraOnPlayer(gameRef.current);
      }
    }
  };
  const handleSimulationSpeed = (speed: 0 | 1 | 2 | 5) => {
    gameRef.current?.setSimulationSpeed(speed);
    setRerender(x => x + 1);
  };
  const handleAutopilot = () => {
    gameRef.current?.toggleAutopilot();
    setRerender(x => x + 1);
  };

  const setKey = (code: string, value: boolean) => {
    inputRef.current.keys[code] = value;
  };
  const aimFromVector = (dx: number, dy: number) => {
    const game = gameRef.current;
    if (!game) return;
    inputRef.current.mouseX = game.player.x - game.camera.x + dx * 120;
    inputRef.current.mouseY = game.player.y - game.camera.y + dy * 120;
  };
  const pulseVehicleKey = () => {
    setKey('KeyF', true);
    window.setTimeout(() => setKey('KeyF', false), 80);
  };
  const setShooting = (value: boolean) => {
    inputRef.current.mouseDown = value;
  };

  return (
    <div className="w-full h-full relative bg-black overflow-hidden touch-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'pixelated', touchAction: 'none' }}
      />
      {gameRef.current && (
        <>
          <UI
            game={gameRef.current}
            onToolChange={handleToolChange}
            onModeChange={handleModeChange}
            onSimulationSpeed={handleSimulationSpeed}
            onToggleAutopilot={handleAutopilot}
          />
          <MobileControls
            game={gameRef.current}
            setKey={setKey}
            aimFromVector={aimFromVector}
            pulseVehicleKey={pulseVehicleKey}
            setShooting={setShooting}
            onModeChange={handleModeChange}
          />
        </>
      )}
      {/* Title overlay - top center small */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 pointer-events-none pt-1">
        <div className="pixel-font neon-pink text-xs" style={{ textShadow: '0 0 6px #ff2d8a, 2px 2px 0 #000' }}>
          URBAN FLUX — CRIMINAL CITY BUILDER
        </div>
      </div>
    </div>
  );
}

interface MobileControlsProps {
  game: Game;
  setKey: (code: string, value: boolean) => void;
  aimFromVector: (dx: number, dy: number) => void;
  pulseVehicleKey: () => void;
  setShooting: (value: boolean) => void;
  onModeChange: (mode: GameMode) => void;
}

function MobileControls({ game, setKey, aimFromVector, pulseVehicleKey, setShooting, onModeChange }: MobileControlsProps) {
  const setMove = (keys: string[], active: boolean, dx = 0, dy = 0) => {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) {
      setKey(code, false);
    }
    if (active) {
      for (const code of keys) setKey(code, true);
      if (dx !== 0 || dy !== 0) aimFromVector(dx, dy);
    }
  };

  const mobileButton = 'btn-pixel min-h-12 min-w-12 text-xs px-2 py-2 touch-none';

  return (
    <div className="sm:hidden pointer-events-none" data-ui-element="true">
      <div className="absolute left-3 bottom-4 z-30 pointer-events-auto grid grid-cols-3 gap-1 pb-[env(safe-area-inset-bottom)]">
        <div />
        <button
          className={mobileButton}
          aria-label="Двигаться вверх"
          onPointerDown={(e) => { e.preventDefault(); setMove(['KeyW'], true, 0, -1); }}
          onPointerUp={() => setMove(['KeyW'], false)}
          onPointerCancel={() => setMove(['KeyW'], false)}
        >↑</button>
        <div />
        <button
          className={mobileButton}
          aria-label="Двигаться влево"
          onPointerDown={(e) => { e.preventDefault(); setMove(['KeyA'], true, -1, 0); }}
          onPointerUp={() => setMove(['KeyA'], false)}
          onPointerCancel={() => setMove(['KeyA'], false)}
        >←</button>
        <button
          className={mobileButton}
          aria-label="Двигаться вниз"
          onPointerDown={(e) => { e.preventDefault(); setMove(['KeyS'], true, 0, 1); }}
          onPointerUp={() => setMove(['KeyS'], false)}
          onPointerCancel={() => setMove(['KeyS'], false)}
        >↓</button>
        <button
          className={mobileButton}
          aria-label="Двигаться вправо"
          onPointerDown={(e) => { e.preventDefault(); setMove(['KeyD'], true, 1, 0); }}
          onPointerUp={() => setMove(['KeyD'], false)}
          onPointerCancel={() => setMove(['KeyD'], false)}
        >→</button>
      </div>

      <div className="absolute right-3 bottom-4 z-30 pointer-events-auto flex flex-col gap-2 items-end pb-[env(safe-area-inset-bottom)]">
        <button
          className="btn-pixel text-xs min-h-12 px-3 touch-none"
          aria-label="Сменить режим"
          onClick={() => onModeChange(game.mode === 'strategy' ? 'action' : 'strategy')}
        >
          {game.mode === 'strategy' ? 'В бой' : 'Строить'}
        </button>
        {game.mode === 'action' && (
          <>
            <button
              className="btn-pixel text-xs min-h-12 px-3 touch-none"
              aria-label="Сесть в машину или выйти из машины"
              onClick={pulseVehicleKey}
            >
              Машина
            </button>
            <button
              className="btn-pixel active text-xs min-h-16 min-w-20 px-4 touch-none"
              aria-label="Стрелять"
              onPointerDown={(e) => { e.preventDefault(); aimFromVector(1, 0); setShooting(true); }}
              onPointerUp={() => setShooting(false)}
              onPointerCancel={() => setShooting(false)}
            >
              Огонь
            </button>
          </>
        )}
        {game.mode === 'strategy' && (
          <div className="panel-pixel px-2 py-1 text-[10px] pixel-font text-center max-w-[150px]">
            Тап по карте - строить. Джойстик - камера.
          </div>
        )}
      </div>
    </div>
  );
}
