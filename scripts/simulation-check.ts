import { Game } from '../src/game/Game';
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from '../src/game/constants';

const input = { mouseX: -1000, mouseY: -1000, mouseDown: false, rightDown: false, keys: {} as Record<string, boolean> };
const game = new Game();
game.mode = 'strategy';

for (const gang of ['loons', 'yutes', 'russians', 'vultures'] as const) game.spawnGangMember(gang);
for (let tick = 0; tick < 480; tick++) game.update(16.67, input);

const nonAirVehicles = game.vehicles.filter(vehicle => vehicle.type !== 'airplane');
const offRoadVehicles = nonAirVehicles.filter(vehicle => {
  const tx = Math.floor(vehicle.x / TILE_SIZE);
  const ty = Math.floor(vehicle.y / TILE_SIZE);
  return tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT || game.tiles[ty][tx].type !== 'road';
});
const routeVehicles = nonAirVehicles.filter(vehicle => (vehicle.route?.length ?? 0) > 0 || (vehicle.routeIndex ?? 0) > 0);
const gangTypes = new Set(game.pedestrians.filter(pedestrian => pedestrian.profession === 'gang').map(pedestrian => pedestrian.type));
const civilianWithProfession = game.pedestrians.some(pedestrian => pedestrian.type === 'civilian' && pedestrian.profession !== 'gang' && pedestrian.nextDecisionTick > 0);

const beforePause = game.stats.minute;
game.setSimulationSpeed(0);
for (let tick = 0; tick < 120; tick++) game.update(16.67, input);
const pauseStable = game.stats.minute === beforePause;
game.setSimulationSpeed(5);
for (let tick = 0; tick < 30; tick++) game.update(16.67, input);
const fastForwarded = game.stats.minute > beforePause || game.stats.hour !== 8;

const report = {
  vehicles: nonAirVehicles.length,
  vehiclesFollowingRoutes: routeVehicles.length,
  offRoadVehicles: offRoadVehicles.length,
  gangPedestrianTypes: [...gangTypes].sort(),
  civilianWithProfession,
  pauseStable,
  fastForwarded,
  employment: game.stats.employment,
  socialMood: game.stats.socialMood,
};

console.log(JSON.stringify(report, null, 2));
if (offRoadVehicles.length > 0) throw new Error(`Найдены машины вне дороги: ${offRoadVehicles.length}`);
if (routeVehicles.length === 0) throw new Error('Ни одна машина не получила маршрут.');
if (gangTypes.size !== 4) throw new Error(`Ожидались четыре типа бандитов, получено ${gangTypes.size}.`);
if (!civilianWithProfession) throw new Error('Не назначена профессия гражданскому NPC.');
if (!pauseStable) throw new Error('Пауза не остановила симуляцию.');
if (!fastForwarded) throw new Error('Ускоренная симуляция не продвинула игровое время.');
