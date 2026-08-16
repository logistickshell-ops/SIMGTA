import { performance } from 'node:perf_hooks';
import { Game } from '../src/game/Game';
const input = { mouseX: -1000, mouseY: -1000, mouseDown: false, rightDown: false, keys: {} as Record<string, boolean> };
for (const count of [0, 8, 80]) {
  const game = new Game();
  for (let i = 0; i < Math.max(0, count - 8); i++) game.spawnRandomVehicle();
  const started = performance.now();
  for (let tick = 0; tick < 180; tick++) game.update(16.67, input);
  const elapsed = performance.now() - started;
  console.log(JSON.stringify({ vehicles: game.vehicles.length, elapsedMs: Math.round(elapsed * 100) / 100, avgMsPerTick: Math.round(elapsed / 1.8) / 100 }));
}
