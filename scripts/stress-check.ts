import { performance } from 'node:perf_hooks';
import { Game } from '../src/game/Game';
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from '../src/game/constants';

const input = { mouseX: -1000, mouseY: -1000, mouseDown: false, rightDown: false, keys: {} as Record<string, boolean> };
const game = new Game();
for (let i = 0; i < 180; i++) game.spawnPedestrian('civilian');
for (let i = 0; i < 72; i++) game.spawnRandomVehicle();
for (const gang of ['loons', 'yutes', 'russians', 'vultures'] as const) {
  for (let i = 0; i < 10; i++) game.spawnGangMember(gang);
}

const started = performance.now();
for (let tick = 0; tick < 600; tick++) game.update(16.67, input);
const elapsedMs = performance.now() - started;

const invalidVehicles = game.vehicles.filter(vehicle => {
  if (vehicle.type === 'airplane') return false;
  const tx = Math.floor(vehicle.x / TILE_SIZE);
  const ty = Math.floor(vehicle.y / TILE_SIZE);
  return tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT || game.tiles[ty][tx].type !== 'road';
});
const invalidPedestrians = game.pedestrians.filter(pedestrian => !Number.isFinite(pedestrian.x) || !Number.isFinite(pedestrian.y) || !Number.isFinite(pedestrian.mood));
const stablePathCount = game.pedestrians.filter(pedestrian => pedestrian.state !== 'dead' && (pedestrian.path?.length ?? 0) > 0).length;

const report = {
  updateTicks: 600,
  elapsedMs: Math.round(elapsedMs * 100) / 100,
  averageMsPerTick: Math.round(elapsedMs / 6) / 100,
  pedestrians: game.pedestrians.length,
  vehicles: game.vehicles.length,
  vehiclesOffRoad: invalidVehicles.length,
  invalidPedestrians: invalidPedestrians.length,
  pedestriansWithStablePath: stablePathCount,
};
console.log(JSON.stringify(report, null, 2));
if (invalidVehicles.length > 0) throw new Error(`Машины вне дороги: ${invalidVehicles.length}`);
if (invalidPedestrians.length > 0) throw new Error(`Некорректные координаты/настроения NPC: ${invalidPedestrians.length}`);
if (stablePathCount === 0) throw new Error('У NPC не сформировались устойчивые пути.');
