import {
  Tile, TileType, Player, Vehicle, Pedestrian, Bullet, Explosion, Pickup, Particle, Message, Mission, GameStats, GangId, Profession, TrafficNode
} from './types';
import {
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, BUILDINGS, MISSION_TEMPLATES, GANG_NAMES, GANG_COLORS
} from './constants';

export type Tool =
  | 'select' | 'bulldoze' | 'inspect'
  | 'residential' | 'commercial' | 'industrial' | 'road' | 'park'
  | 'policestation' | 'hospital' | 'firestation' | 'school'
  | 'stadium' | 'casino' | 'bank' | 'powerplant'
  | 'busdepot' | 'tramdepot' | 'trainstation' | 'airport' | 'gunshop';

export type GameMode = 'strategy' | 'action';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Input {
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
  rightDown: boolean;
  keys: Record<string, boolean>;
}

let nextId = 1;
export const uid = () => nextId++;

export class Game {
  tiles: Tile[][] = [];
  stats: GameStats;
  player: Player;
  vehicles: Vehicle[] = [];
  pedestrians: Pedestrian[] = [];
  bullets: Bullet[] = [];
  explosions: Explosion[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  messages: Message[] = [];
  missions: Mission[] = [];
  camera: Camera = { x: 0, y: 0, zoom: 1 };
  viewportWidth = 800;
  viewportHeight = 600;
  mode: GameMode = 'strategy';
  tool: Tool = 'residential';
  hoveredTile = { x: -1, y: -1 };
  selectedTile = { x: -1, y: -1 };
  showGrid = true;
  paused = false;
  gameOver = false;
  difficulty: 'easy' | 'normal' | 'hard' = 'normal';
  timeAccumulator = 0;
  cameraFollowPlayer = false;
  shootingCooldown = 0;
  playerInVehicleId: number | null = null;
  wantedDecayTimer = 0;
  messageIdCounter = 0;
  lastCrimeSpawn = 0;
  lastFireSpawn = 0;
  lastTaxTick = 0;
  dayNightCycle = 0;
  tickCount = 0;
  totalKills = 0;
  totalEarned = 0;
  policePatrolTimer = 0;
  publicTransportTimer = 0;
  gangWarTimer = 0;
  bossSpawned: Record<GangId, boolean> = { loons: false, yutes: false, russians: false, vultures: false, none: false };
  bossIds: number[] = [];
  superWeapon = false;
  superWeaponTimer = 0;
  mouseX = 0;
  mouseY = 0;
  simulationSpeed: 0 | 1 | 2 | 5 = 1;
  autopilotEnabled = false;
  autopilotTarget: { x: number; y: number; label: string } | null = null;
  private roadGraph = new Map<string, TrafficNode[]>();
  private roadGraphDirty = true;
  private roadNodes: TrafficNode[] = [];
  private buildingTargets = new Map<TileType, { x: number; y: number }[]>();
  private vehicleSpatial = new Map<string, Vehicle[]>();
  private pedestrianSpatial = new Map<string, Pedestrian[]>();
  private lastPopulationSimulationTick = 0;

  // ---------- ЭКОНОМИКА ----------
  deposit = 0; // сумма на депозите в банке
  bankInterestRate = 0.5; // % в час по депозиту (0-5)
  taxRateResidential = 100; // % от базовой ставки (0-300)
  taxRateCommercial = 100;
  taxRateIndustrial = 100;
  loanAmount = 0; // кредит банка
  loanInterestRate = 1.5; // % в час по кредиту

  /** Глобальный множитель дохода (день/ночь) */
  get taxMultiplier() {
    // Днём (8–20) множитель 1.0, ночью 0.4
    const h = this.stats.hour;
    return (h >= 8 && h < 20) ? 1.0 : 0.4;
  }

  constructor() {
    this.stats = {
      money: 5000,
      population: 0,
      day: 1,
      hour: 8,
      minute: 0,
      approval: 50,
      crime: 20,
      income: 0,
      expenses: 0,
      employment: 0,
      socialMood: 50,
    };
    this.player = {
      x: 80 * TILE_SIZE, y: 60 * TILE_SIZE, vx: 0, vy: 0, angle: 0,
      speed: 0, health: 100, maxHealth: 100, inVehicle: false, wanted: 0,
      ammo: 50, maxAmmo: 99, kills: 0, money: 0,
    };
    this.initMap();
    this.rebuildRoadGraph();
    this.initMissions();
    this.spawnStartingEntities();
  }

  initMap() {
    // Карта 160×120 — город в центральной части [40..120]×[30..90]
    this.tiles = [];
    const cityMinX = 40; const cityMaxX = 120;
    const cityMinY = 30; const cityMaxY = 90;

    for (let y = 0; y < MAP_HEIGHT; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        let type: TileType = 'grass';
        // Небольшие водоёмы по дальним углам
        if ((x < 4 && y < 4) || (x > MAP_WIDTH - 5 && y > MAP_HEIGHT - 5)) type = 'water';
        if ((x < 4 && y > MAP_HEIGHT - 5) || (x > MAP_WIDTH - 5 && y < 4)) type = 'water';

        if (x >= cityMinX && x < cityMaxX && y >= cityMinY && y < cityMaxY) {
          // Двухполосные магистрали только внутри города
          if (x === 60 || x === 61 || x === 80 || x === 81 || x === 100 || x === 101) type = 'road';
          if (y === 44 || y === 45 || y === 60 || y === 61 || y === 76 || y === 77) type = 'road';
        }
        row.push({ type, level: 0, population: 0, hasFire: false, hasCrime: false, gang: 'none', variant: Math.floor(Math.random() * 4) });
      }
      this.tiles.push(row);
    }
    this.roadGraphDirty = true;
  }

  initMissions() {
    this.missions = MISSION_TEMPLATES.map(m => ({ ...m, progress: 0, active: true, completed: false }));
  }

  spawnStartingEntities() {
    for (let i = 0; i < 8; i++) this.spawnRandomVehicle();
    for (let i = 0; i < 20; i++) this.spawnPedestrian('civilian');
  }

  spawnRandomVehicle() {
    const types: Vehicle['type'][] = ['car', 'car', 'car', 'sport', 'taxi'];
    const type = types[Math.floor(Math.random() * types.length)];
    const pos = this.getRandomRoadPosition();
    this.vehicles.push({
      id: uid(), x: pos.x, y: pos.y, vx: 0, vy: 0, angle: pos.angle ?? 0,
      speed: 0, health: 100, type, gang: 'none', driver: 'civilian', passengers: 0,
    });
  }

  spawnPedestrian(type: Pedestrian['type'], x?: number, y?: number, gang: GangId = 'none'): Pedestrian {
    const px = x ?? 5 * TILE_SIZE + Math.random() * (MAP_WIDTH - 10) * TILE_SIZE;
    const py = y ?? 5 * TILE_SIZE + Math.random() * (MAP_HEIGHT - 10) * TILE_SIZE;
    const profession = this.getProfessionForType(type);
    const work = this.findWorkTarget(profession, px, py);
    const ped: Pedestrian = {
      id: uid(), x: px, y: py, vx: 0, vy: 0, angle: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 0.25, type, gang,
      health: type === 'police' ? 80 : type.startsWith('gang') ? 60 : 40,
      state: 'walking', weaponCooldown: 0,
      profession,
      homeX: px,
      homeY: py,
      workX: work?.x,
      workY: work?.y,
      targetX: px,
      targetY: py,
      path: [],
      pathIndex: 0,
      nextDecisionTick: this.tickCount + 15 + Math.floor(Math.random() * 90),
      socialNeed: 25 + Math.floor(Math.random() * 50),
      socialScore: 45 + Math.floor(Math.random() * 25),
      mood: 45 + Math.floor(Math.random() * 25),
    };
    this.pedestrians.push(ped);
    return ped;
  }

  spawnGangMember(gang: GangId) {
    let sx = 0, sy = 0, found = 0;
    for (let a = 0; a < 20 && !found; a++) {
      const tx = Math.floor(Math.random() * MAP_WIDTH);
      const ty = Math.floor(Math.random() * MAP_HEIGHT);
      if (this.tiles[ty][tx].gang === gang) { sx = tx; sy = ty; found = 1; }
    }
    if (!found) { sx = 5 + Math.floor(Math.random() * (MAP_WIDTH - 10)); sy = 5 + Math.floor(Math.random() * (MAP_HEIGHT - 10)); }
    const type: Pedestrian['type'] = gang === 'loons' ? 'gang1' : gang === 'yutes' ? 'gang2' : gang === 'russians' ? 'gang3' : 'gang4';
    this.spawnPedestrian(type, sx * TILE_SIZE, sy * TILE_SIZE, gang);
  }

  addMessage(text: string, color: string = '#ffffff', x?: number, y?: number) {
    this.messages.push({
      id: this.messageIdCounter++,
      text, color, life: 180,
      x: x ?? this.player.x, y: y ?? this.player.y,
    });
  }

  emitParticles(x: number, y: number, color: string, count: number, speed: number = 2) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * speed;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 30 + Math.random() * 30, maxLife: 60, color, size: 1 + Math.floor(Math.random() * 3),
      });
    }
  }

  // ----------------------------------------------------------------
  //   БАЗОВЫЕ ПРОВЕРКИ ПРОХОДИМОСТИ
  // ----------------------------------------------------------------
  /** Можно ли пройти по тайлу (x,y) */
  isWalkableTile(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    const t = this.tiles[y][x];
    return t.type === 'grass' || t.type === 'road';
  }

  isRoadTile(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    return this.tiles[y][x].type === 'road';
  }

  isRoadPosition(worldX: number, worldY: number, margin = 8): boolean {
    void margin;
    return this.isRoadTile(Math.floor(worldX / TILE_SIZE), Math.floor(worldY / TILE_SIZE));
  }

  getRandomRoadPosition() {
    for (let i = 0; i < 200; i++) {
      const x = Math.floor(Math.random() * MAP_WIDTH);
      const y = Math.floor(Math.random() * MAP_HEIGHT);
      if (this.isRoadTile(x, y)) {
        const dirs = this.getRoadDirectionsFromTile(x, y);
        const dir = dirs[Math.floor(Math.random() * Math.max(1, dirs.length))] ?? { dx: 1, dy: 0, angle: 0 };
        return { ...this.getLaneCenter(x, y, dir.angle), angle: dir.angle };
      }
    }
    return { ...this.getLaneCenter(80, 60, 0), angle: 0 };
  }

  findNearestRoadPosition(worldX: number, worldY: number) {
    const sx = Math.floor(worldX / TILE_SIZE);
    const sy = Math.floor(worldY / TILE_SIZE);
    for (let r = 0; r < Math.max(MAP_WIDTH, MAP_HEIGHT); r++) {
      for (let y = sy - r; y <= sy + r; y++) {
        for (let x = sx - r; x <= sx + r; x++) {
          if (this.isRoadTile(x, y)) {
            const dirs = this.getRoadDirectionsFromTile(x, y);
            const dir = dirs[0] ?? { dx: 1, dy: 0, angle: 0 };
            return { ...this.getLaneCenter(x, y, dir.angle), angle: dir.angle };
          }
        }
      }
    }
    return this.getRandomRoadPosition();
  }

  getRoadDirections(worldX: number, worldY: number) {
    const tx = Math.floor(worldX / TILE_SIZE);
    const ty = Math.floor(worldY / TILE_SIZE);
    return this.getRobustRoadDirections(tx, ty);
  }

  getRobustRoadDirections(tx: number, ty: number) {
    const isEvenX = tx % 2 === 0;
    const isEvenY = ty % 2 === 0;
    const legalDirs: { dx: number; dy: number; angle: number }[] = [];

    // Горизонтальные полосы
    if (isEvenY) {
      // Верхняя полоса горизонтальной дороги -> едем на Запад (влево, angle PI)
      legalDirs.push({ dx: -1, dy: 0, angle: Math.PI });
    } else {
      // Нижняя полоса горизонтальной дороги -> едем на Восток (вправо, angle 0)
      legalDirs.push({ dx: 1, dy: 0, angle: 0 });
    }

    // Вертикальные полосы
    if (isEvenX) {
      // Левая полоса вертикальной дороги -> едем на Юг (вниз, angle PI/2)
      legalDirs.push({ dx: 0, dy: 1, angle: Math.PI / 2 });
    } else {
      // Правая полоса вертикальной дороги -> едем на Север (вверх, angle -PI/2)
      legalDirs.push({ dx: 0, dy: -1, angle: -Math.PI / 2 });
    }

    // Оставляем только те направления, где действительно построена дорога
    const filtered = legalDirs.filter(d => this.isRoadTile(tx + d.dx, ty + d.dy));
    if (filtered.length > 0) return filtered;

    // Если тупик — разрешаем любое дорожное направление
    const allDirs = [
      { dx: 1, dy: 0, angle: 0 },
      { dx: -1, dy: 0, angle: Math.PI },
      { dx: 0, dy: 1, angle: Math.PI / 2 },
      { dx: 0, dy: -1, angle: -Math.PI / 2 },
    ];
    return allDirs.filter(d => this.isRoadTile(tx + d.dx, ty + d.dy));
  }

  getRoadDirectionsFromTile(tx: number, ty: number) {
    return this.getRobustRoadDirections(tx, ty);
  }

  cardinalDirection(angle: number) {
    const dirs = [
      { dx: 1, dy: 0, angle: 0 },
      { dx: -1, dy: 0, angle: Math.PI },
      { dx: 0, dy: 1, angle: Math.PI / 2 },
      { dx: 0, dy: -1, angle: -Math.PI / 2 },
    ];
    return dirs.reduce((best, dir) => {
      const delta = Math.abs(Math.atan2(Math.sin(dir.angle - angle), Math.cos(dir.angle - angle)));
      const bestDelta = Math.abs(Math.atan2(Math.sin(best.angle - angle), Math.cos(best.angle - angle)));
      return delta < bestDelta ? dir : best;
    }, dirs[0]);
  }

  getLaneCenter(tx: number, ty: number, angle: number) {
    // Безупречное 100% строгое правостороннее движение для 2x2 дорожной сетки:
    // На горизонтальных дорогах: Запад (←) = чётный ряд (by), Восток (→) = нечётный ряд (by + 1).
    // На вертикальных дорогах: Юг (↓) = чётная колонка (bx), Север (↑) = нечётная колонка (bx + 1).
    const dir = this.cardinalDirection(angle);
    const bx = tx - (tx % 2);
    const by = ty - (ty % 2);

    let bestTx = tx;
    let bestTy = ty;

    if (dir.dx > 0) {
      // Восток (вправо) -> нечётный ряд
      bestTy = by + 1;
    } else if (dir.dx < 0) {
      // Запад (влево) -> чётный ряд
      bestTy = by;
    } else if (dir.dy > 0) {
      // Юг (вниз) -> чётная колонка
      bestTx = bx;
    } else if (dir.dy < 0) {
      // Север (вверх) -> нечётная колонка
      bestTx = bx + 1;
    }

    return {
      x: bestTx * TILE_SIZE + TILE_SIZE / 2,
      y: bestTy * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  private nodeKey(node: TrafficNode) {
    return `${node.tx}:${node.ty}:${node.angle}`;
  }

  private spatialKey(x: number, y: number) {
    return `${Math.floor(x / 48)}:${Math.floor(y / 48)}`;
  }

  private rebuildRoadGraph() {
    if (!this.roadGraphDirty) return;
    this.roadGraph.clear();
    this.roadNodes = [];
    this.buildingTargets.clear();

    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const tile = this.tiles[ty][tx];
        if (tile.type !== 'grass' && tile.type !== 'road' && tile.type !== 'water') {
          const list = this.buildingTargets.get(tile.type) ?? [];
          list.push({ x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 });
          this.buildingTargets.set(tile.type, list);
        }
        if (!this.isRoadTile(tx, ty)) continue;
        for (const dir of this.getRobustRoadDirections(tx, ty)) {
          this.roadNodes.push({ tx, ty, angle: dir.angle });
        }
      }
    }

    for (const node of this.roadNodes) {
      const next: TrafficNode[] = [];
      const dir = this.cardinalDirection(node.angle);
      // Поворот допускается только на существующем перекрёстке и никогда не является разворотом.
      for (const candidate of this.getRobustRoadDirections(node.tx, node.ty)) {
        if (candidate.dx === -dir.dx && candidate.dy === -dir.dy) continue;
        if (candidate.angle !== node.angle) next.push({ tx: node.tx, ty: node.ty, angle: candidate.angle });
      }
      const forwardTx = node.tx + dir.dx;
      const forwardTy = node.ty + dir.dy;
      if (this.isRoadTile(forwardTx, forwardTy)) {
        const forward = this.getRobustRoadDirections(forwardTx, forwardTy)
          .find(candidate => candidate.angle === node.angle);
        if (forward) next.push({ tx: forwardTx, ty: forwardTy, angle: node.angle });
      }
      this.roadGraph.set(this.nodeKey(node), next);
    }
    this.roadGraphDirty = false;
  }

  private rebuildSpatialIndex() {
    this.vehicleSpatial.clear();
    this.pedestrianSpatial.clear();
    for (const vehicle of this.vehicles) {
      if (vehicle.health <= 0 || vehicle.type === 'airplane') continue;
      const key = this.spatialKey(vehicle.x, vehicle.y);
      const list = this.vehicleSpatial.get(key) ?? [];
      list.push(vehicle);
      this.vehicleSpatial.set(key, list);
    }
    for (const pedestrian of this.pedestrians) {
      if (pedestrian.state === 'dead') continue;
      const key = this.spatialKey(pedestrian.x, pedestrian.y);
      const list = this.pedestrianSpatial.get(key) ?? [];
      list.push(pedestrian);
      this.pedestrianSpatial.set(key, list);
    }
  }

  private nearbyVehicles(x: number, y: number) {
    const result: Vehicle[] = [];
    const cellX = Math.floor(x / 48);
    const cellY = Math.floor(y / 48);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      result.push(...(this.vehicleSpatial.get(`${cellX + ox}:${cellY + oy}`) ?? []));
    }
    return result;
  }

  private nearbyPedestrians(x: number, y: number) {
    const result: Pedestrian[] = [];
    const cellX = Math.floor(x / 48);
    const cellY = Math.floor(y / 48);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      result.push(...(this.pedestrianSpatial.get(`${cellX + ox}:${cellY + oy}`) ?? []));
    }
    return result;
  }

  private getNodeWorldPosition(node: TrafficNode) {
    return this.getLaneCenter(node.tx, node.ty, node.angle);
  }

  private findNearestTrafficNode(x: number, y: number, preferredAngle?: number) {
    this.rebuildRoadGraph();
    let best: TrafficNode | undefined;
    let bestDistance = Infinity;
    for (const node of this.roadNodes) {
      const world = this.getNodeWorldPosition(node);
      const directionPenalty = preferredAngle === undefined ? 0 : Math.abs(Math.atan2(Math.sin(node.angle - preferredAngle), Math.cos(node.angle - preferredAngle))) * 18;
      const distance = Math.hypot(world.x - x, world.y - y) + directionPenalty;
      if (distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }

  private buildTrafficRoute(fromX: number, fromY: number, fromAngle: number, targetX: number, targetY: number): TrafficNode[] {
    const start = this.findNearestTrafficNode(fromX, fromY, fromAngle);
    const goal = this.findNearestTrafficNode(targetX, targetY);
    if (!start || !goal) return [];
    const startKey = this.nodeKey(start);
    const goalKey = this.nodeKey(goal);
    const queue: { node: TrafficNode; cost: number; priority: number }[] = [{ node: start, cost: 0, priority: 0 }];
    const cameFrom = new Map<string, TrafficNode>();
    const costSoFar = new Map<string, number>([[startKey, 0]]);
    let reached = false;

    for (let iterations = 0; queue.length > 0 && iterations < 900; iterations++) {
      queue.sort((a, b) => a.priority - b.priority);
      const current = queue.shift()!;
      const currentKey = this.nodeKey(current.node);
      if (currentKey === goalKey) {
        reached = true;
        break;
      }
      for (const next of this.roadGraph.get(currentKey) ?? []) {
        const nextKey = this.nodeKey(next);
        const turnCost = next.tx === current.node.tx && next.ty === current.node.ty ? 0.25 : 1;
        const newCost = current.cost + turnCost;
        if (newCost >= (costSoFar.get(nextKey) ?? Infinity)) continue;
        costSoFar.set(nextKey, newCost);
        cameFrom.set(nextKey, current.node);
        const heuristic = Math.abs(next.tx - goal.tx) + Math.abs(next.ty - goal.ty);
        queue.push({ node: next, cost: newCost, priority: newCost + heuristic });
      }
    }
    if (!reached) return [start];

    const route: TrafficNode[] = [];
    let cursor = goal;
    route.push(cursor);
    while (this.nodeKey(cursor) !== startKey) {
      const previous = cameFrom.get(this.nodeKey(cursor));
      if (!previous) break;
      cursor = previous;
      route.push(cursor);
    }
    route.reverse();
    return route;
  }

  private getProfessionForType(type: Pedestrian['type']): Profession {
    if (type === 'police') return 'officer';
    if (type === 'firefighter') return 'firefighter';
    if (type === 'medic') return 'medic';
    if (type.startsWith('gang')) return 'gang';
    const professions: Profession[] = ['worker', 'shopkeeper', 'industrial', 'teacher', 'driver', 'unemployed'];
    return professions[Math.floor(Math.random() * professions.length)];
  }

  private findClosestBuilding(types: TileType[], x: number, y: number) {
    this.rebuildRoadGraph();
    let best: { x: number; y: number } | undefined;
    let bestDistance = Infinity;
    for (const type of types) {
      for (const target of this.buildingTargets.get(type) ?? []) {
        const distance = Math.hypot(target.x - x, target.y - y);
        if (distance < bestDistance) {
          best = target;
          bestDistance = distance;
        }
      }
    }
    return best;
  }

  private findWorkTarget(profession: Profession, x: number, y: number) {
    const types: Record<Profession, TileType[]> = {
      worker: ['commercial'], shopkeeper: ['commercial'], industrial: ['industrial'], teacher: ['school'],
      officer: ['policestation'], medic: ['hospital'], firefighter: ['firestation'], driver: ['busdepot', 'tramdepot', 'trainstation'],
      unemployed: ['park', 'commercial'], gang: ['casino', 'gunshop'],
    };
    return this.findClosestBuilding(types[profession], x, y);
  }

  private setPedestrianTarget(p: Pedestrian, x: number, y: number, state: Pedestrian['state']) {
    p.targetX = x;
    p.targetY = y;
    p.state = state;
    p.path = this.buildPedestrianPath(p.x, p.y, x, y);
    p.pathIndex = 0;
  }

  private buildPedestrianPath(_fromX: number, fromY: number, toX: number, toY: number) {
    // Простая ортогональная траектория с проверкой коллизии, переиспользуемая до смены цели.
    const points: { x: number; y: number }[] = [];
    const midX = toX;
    if (!this.isBlockedByBuilding(midX, fromY, 3)) points.push({ x: midX, y: fromY });
    if (!this.isBlockedByBuilding(midX, toY, 3)) points.push({ x: midX, y: toY });
    if (points.length === 0 || Math.hypot(points[points.length - 1].x - toX, points[points.length - 1].y - toY) > 2) points.push({ x: toX, y: toY });
    return points;
  }

  hasVehicleAhead(v: Vehicle, angle: number, distance = 24) {
    const dir = this.cardinalDirection(angle);
    // Проверка только объектов из соседних пространственных ячеек.
    for (const other of this.nearbyVehicles(v.x, v.y)) {
      if (other === v || other.health <= 0) continue;
      const dx = other.x - v.x;
      const dy = other.y - v.y;
      const forward = dx * dir.dx + dy * dir.dy;
      const side = Math.abs(dir.dx !== 0 ? dy : dx);
      if (forward > 0 && forward < distance && side < 11) return true;
    }
    // Проверка пешеходов в радиусе дорожной ячейки.
    for (const p of this.nearbyPedestrians(v.x, v.y)) {
      if (p.state === 'dead') continue;
      const dx = p.x - v.x;
      const dy = p.y - v.y;
      const forward = dx * dir.dx + dy * dir.dy;
      const side = Math.abs(dir.dx !== 0 ? dy : dx);
      if (forward > 0 && forward < distance && side < 8) return true;
    }
    // Проверка игрока (если он пешком)
    if (this.playerInVehicleId !== v.id) {
      const dx = this.player.x - v.x;
      const dy = this.player.y - v.y;
      const forward = dx * dir.dx + dy * dir.dy;
      const side = Math.abs(dir.dx !== 0 ? dy : dx);
      if (forward > 0 && forward < distance && side < 8) return true;
    }
    return false;
  }

  /** Проверка коллизии точки с прямоугольниками (здания, машины-препятствия) */
  isBlockedByBuilding(worldX: number, worldY: number, margin = 4): boolean {
    // Проверяем несколько точек объекта на непроходимость
    const offsets = [
      [0, 0], [margin, 0], [0, margin], [-margin, 0], [0, -margin],
      [margin, margin], [-margin, -margin],
    ];
    for (const [ox, oy] of offsets) {
      const xx = Math.floor((worldX + ox) / TILE_SIZE);
      const yy = Math.floor((worldY + oy) / TILE_SIZE);
      if (xx < 0 || yy < 0 || xx >= MAP_WIDTH || yy >= MAP_HEIGHT) return true;
      if (!this.isWalkableTile(xx, yy)) return true;
    }
    return false;
  }

  /** Не даём объекту въехать в стену */
  clampToWalkable(obj: { x: number; y: number }, margin = 4) {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (!this.isBlockedByBuilding(obj.x, obj.y, margin)) return;
      // отталкиваем назад от центра ближайшего непроходимого тайла
      const tx = Math.floor(obj.x / TILE_SIZE);
      const ty = Math.floor(obj.y / TILE_SIZE);
      const cx = tx * TILE_SIZE + TILE_SIZE / 2;
      const cy = ty * TILE_SIZE + TILE_SIZE / 2;
      const dx = obj.x - cx;
      const dy = obj.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      obj.x += (dx / d) * 2;
      obj.y += (dy / d) * 2;
    }
  }

  /** Проверка столкновения игрока/машины с другими машинами */
  resolveVehicleCollision(a: { x: number; y: number; vx: number; vy: number }, margin = 12) {
    for (const other of this.nearbyVehicles(a.x, a.y)) {
      if (other === a || other.health <= 0) continue;
      if (Math.hypot(other.x - a.x, other.y - a.y) < margin) {
        const dx = a.x - other.x || 0.01;
        const dy = a.y - other.y || 0.01;
        const d = Math.hypot(dx, dy);
        const push = (margin - d) * 0.3;
        (a as any).x += (dx / d) * push;
        (a as any).y += (dy / d) * push;
      }
    }
  }

  // ----------------------------------------------------------------
  //   СТРОИТЕЛЬСТВО
  // ----------------------------------------------------------------
  canPlace(x: number, y: number, tool: Tool): boolean {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    const t = this.tiles[y][x];
    const def = BUILDINGS[tool as TileType];
    if (!def) return false;
    if (def.size === 2) {
      if (x % 2 !== 0 || y % 2 !== 0) return false;
      if (x + 1 >= MAP_WIDTH || y + 1 >= MAP_HEIGHT) return false;
      const r1 = this.tiles[y][x + 1];
      const r2 = this.tiles[y + 1][x];
      const r3 = this.tiles[y + 1][x + 1];
      return (t.type === 'grass' || t.type === 'road') &&
             (r1.type === 'grass' || r1.type === 'road') &&
             (r2.type === 'grass' || r2.type === 'road') &&
             (r3.type === 'grass' || r3.type === 'road');
    }
    return t.type === 'grass' || tool === 'bulldoze';
  }

  placeTool(x: number, y: number) {
    if (this.stats.money < BUILDINGS[this.tool as TileType].cost) {
      this.addMessage('Нет денег!', '#ff4444');
      return;
    }
    if (!this.canPlace(x, y, this.tool)) return;
    const def = BUILDINGS[this.tool as TileType];
    this.stats.money -= def.cost;
    if (def.size === 2) {
      this.tiles[y][x] = { type: this.tool as TileType, level: 1, population: 0, hasFire: false, hasCrime: false, gang: 'none', variant: Math.floor(Math.random() * 4) };
      this.tiles[y][x + 1] = { type: this.tool as TileType, level: 1, population: 0, hasFire: false, hasCrime: false, gang: 'none', variant: Math.floor(Math.random() * 4) };
      this.tiles[y + 1][x] = { type: this.tool as TileType, level: 1, population: 0, hasFire: false, hasCrime: false, gang: 'none', variant: Math.floor(Math.random() * 4) };
      this.tiles[y + 1][x + 1] = { type: this.tool as TileType, level: 1, population: 0, hasFire: false, hasCrime: false, gang: 'none', variant: Math.floor(Math.random() * 4) };
    } else {
      this.tiles[y][x] = { type: this.tool as TileType, level: 1, population: 0, hasFire: false, hasCrime: false, gang: 'none', variant: Math.floor(Math.random() * 4) };
    }
    this.roadGraphDirty = true;
    this.emitParticles(x * TILE_SIZE, y * TILE_SIZE, '#ffea00', 8);
    this.addMessage(`Построено: ${def.name}`, '#39ff14');
  }

  bulldozeTile(x: number, y: number) {
    const t = this.tiles[y][x];
    if (t.type === 'grass' || t.type === 'water') return;
    this.stats.money += 5;
    this.tiles[y][x] = { type: 'grass', level: 0, population: 0, hasFire: false, hasCrime: false, gang: 'none', variant: 0 };
    this.roadGraphDirty = true;
    this.emitParticles(x * TILE_SIZE, y * TILE_SIZE, '#888888', 10);
  }

  // ----------------------------------------------------------------
  //   ГЛАВНЫЙ ЦИКЛ ОБНОВЛЕНИЯ
  // ----------------------------------------------------------------
  update(dt: number, input: Input) {
    if (this.simulationSpeed === 0 || this.gameOver) return;
    this.paused = false;
    this.tickCount += this.simulationSpeed;
    // Сохраняем координаты мыши для отрисовки прицела
    this.mouseX = input.mouseX;
    this.mouseY = input.mouseY;
    this.updateTime(dt * this.simulationSpeed);
    this.updateDayNight();
    this.updateCamera(input);
    if (this.mode === 'action') {
      this.updateAction(input, dt);
    } else {
      this.updateStrategy(input);
    }
    if (this.autopilotEnabled && this.tickCount % 30 === 0) this.updateWorldAutopilot();
    this.rebuildSpatialIndex();
    this.updateVehicles(dt);
    this.rebuildSpatialIndex();
    this.updatePedestrians(dt);
    this.updateBullets();
    this.updateExplosions();
    this.updatePickups();
    this.updateParticles();
    this.updateMessages();
    this.updateMissions();
    this.updateCity(dt);
    this.checkCollisions();
    this.maybeSpawnCrime();
    this.maybeSpawnFire();
    this.maybePolicePatrol();
    this.maybePublicTransport();
    this.maybeGangWar();
    this.maybeSpawnBoss();
    if (this.shootingCooldown > 0) this.shootingCooldown -= this.simulationSpeed;
    if (this.superWeaponTimer > 0) { this.superWeaponTimer -= this.simulationSpeed; if (this.superWeaponTimer <= 0) this.superWeapon = false; }
  }

  setSimulationSpeed(speed: 0 | 1 | 2 | 5) {
    this.simulationSpeed = speed;
    this.paused = speed === 0;
  }

  toggleAutopilot() {
    this.autopilotEnabled = !this.autopilotEnabled;
    this.autopilotTarget = this.autopilotEnabled ? { x: 0, y: 0, label: 'МИР: ТРАФИК И NPC' } : null;
    this.addMessage(this.autopilotEnabled ? 'Автосимуляция мира включена' : 'Автосимуляция мира выключена', '#00f0ff');
  }

  private updateWorldAutopilot() {
    this.rebuildRoadGraph();
    for (const vehicle of this.vehicles) {
      if (vehicle.type === 'airplane' || !vehicle.driver || vehicle.driver === 'player') continue;
      vehicle.routeAge = (vehicle.routeAge ?? 0) + 30;
      if (!vehicle.route || vehicle.route.length < 2 || vehicle.routeAge > 420 || (vehicle.stalledTicks ?? 0) > 18) {
        this.assignVehicleRoute(vehicle, true);
      }
    }
    for (const pedestrian of this.pedestrians) {
      if (pedestrian.state !== 'dead' && this.tickCount >= pedestrian.nextDecisionTick) this.choosePedestrianGoal(pedestrian);
    }
  }

  // ----------------------------------------------------------------
  //   ЭКОНОМИКА — НАЛОГИ КАЖДЫЙ ЧАС
  // ----------------------------------------------------------------
  updateTime(dt: number) {
    this.timeAccumulator += dt;
    while (this.timeAccumulator >= 1000) {
      this.timeAccumulator -= 1000;
      this.stats.minute++;
      if (this.stats.minute >= 60) {
        this.stats.minute = 0;
        this.stats.hour++;
        if (this.stats.hour >= 24) {
          this.stats.hour = 0;
          this.stats.day++;
        }
        // Каждый игровой час собираем налоги
        this.collectHourlyTaxes();
      }
    }
  }

  updateDayNight() {
    this.dayNightCycle = this.stats.hour / 24 + this.stats.minute / (24 * 60);
  }

  collectHourlyTaxes() {
    let income = 0;
    let expenses = 0;
    // Сборы по зонам
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const t = this.tiles[y][x];
        if (t.level > 0) {
          const def = BUILDINGS[t.type];
          const levelBonus = 1 + (t.level - 1) * 0.25;
          let zoneMultiplier = 1;
          if (t.type === 'residential') zoneMultiplier = this.taxRateResidential / 100;
          else if (t.type === 'commercial') zoneMultiplier = this.taxRateCommercial / 100;
          else if (t.type === 'industrial') zoneMultiplier = this.taxRateIndustrial / 100;
          const baseIncome = def.income * this.taxMultiplier * levelBonus * zoneMultiplier;
          const penalty = (t.hasCrime ? 0.5 : 1) * (t.hasFire ? 0.3 : 1);
          income += Math.round(baseIncome * penalty);
          expenses += def.upkeep;
        }
      }
    }
    // Проценты по депозиту
    const depositInterest = Math.round(this.deposit * (this.bankInterestRate / 100));
    income += depositInterest;
    // Проценты по кредиту
    const loanInterest = Math.round(this.loanAmount * (this.loanInterestRate / 100));
    expenses += loanInterest;

    this.stats.income = income;
    this.stats.expenses = expenses;
    const net = income - expenses;
    this.stats.money += net;
    this.totalEarned += Math.max(0, net);
    if (this.tickCount % 60 === 0) {
      this.addMessage(
        `Час ${this.stats.hour}: ${net >= 0 ? '+' : ''}$${net}`,
        net >= 0 ? '#39ff14' : '#ff4444',
      );
    }
  }

  /** Внести деньги на депозит в банк */
  depositToBank(amount: number): boolean {
    if (amount <= 0 || this.stats.money < amount) return false;
    this.stats.money -= amount;
    this.deposit += amount;
    this.addMessage(`+Депозит: +$${amount}`, '#00f0ff');
    return true;
  }

  /** Снять деньги с депозита */
  withdrawFromBank(amount: number): boolean {
    if (amount <= 0 || this.deposit < amount) return false;
    this.deposit -= amount;
    this.stats.money += amount;
    this.addMessage(`-Снятие: +$${amount}`, '#ffea00');
    return true;
  }

  /** Взять кредит в банке */
  takeLoan(amount: number): boolean {
    const maxLoan = Math.max(1000, this.deposit * 3 + this.stats.income * 24);
    if (amount <= 0 || amount > maxLoan) return false;
    this.stats.money += amount;
    this.loanAmount += amount;
    this.addMessage(`Кредит: +$${amount}`, '#ff8c00');
    return true;
  }

  /** Погасить кредит */
  repayLoan(amount: number): boolean {
    if (amount <= 0 || this.stats.money < amount) return false;
    const toRepay = Math.min(amount, this.loanAmount);
    this.stats.money -= toRepay;
    this.loanAmount -= toRepay;
    this.addMessage(`Погашение кредита: -$${toRepay}`, '#39ff14');
    return true;
  }

  // ----------------------------------------------------------------
  //   КАМЕРА
  // ----------------------------------------------------------------
  updateCamera(input: Input) {
    if (this.mode === 'strategy') {
      const cs = 8;
      if (input.keys['ArrowLeft'] || input.keys['KeyA']) this.camera.x -= cs;
      if (input.keys['ArrowRight'] || input.keys['KeyD']) this.camera.x += cs;
      if (input.keys['ArrowUp'] || input.keys['KeyW']) this.camera.y -= cs;
      if (input.keys['ArrowDown'] || input.keys['KeyS']) this.camera.y += cs;
    } else {
      this.camera.x = this.player.x - this.viewportWidth / (2 * this.camera.zoom);
      this.camera.y = this.player.y - this.viewportHeight / (2 * this.camera.zoom);
    }
    this.camera.x = Math.max(0, Math.min(MAP_WIDTH * TILE_SIZE - this.viewportWidth / this.camera.zoom, this.camera.x));
    this.camera.y = Math.max(0, Math.min(MAP_HEIGHT * TILE_SIZE - this.viewportHeight / this.camera.zoom, this.camera.y));
  }

  /** Масштабирование камеры (ближе/дальше) */
  zoomCamera(factor: number, originX = this.viewportWidth / 2, originY = this.viewportHeight / 2) {
    const oldZoom = this.camera.zoom;
    const newZoom = Math.max(0.4, Math.min(4.0, oldZoom * factor));
    if (oldZoom === newZoom) return;

    // Мировая точка под фокусом зума
    const worldX = this.camera.x + originX / oldZoom;
    const worldY = this.camera.y + originY / oldZoom;

    this.camera.zoom = newZoom;

    if (this.mode === 'strategy') {
      this.camera.x = worldX - originX / newZoom;
      this.camera.y = worldY - originY / newZoom;
      this.camera.x = Math.max(0, Math.min(MAP_WIDTH * TILE_SIZE - this.viewportWidth / this.camera.zoom, this.camera.x));
      this.camera.y = Math.max(0, Math.min(MAP_HEIGHT * TILE_SIZE - this.viewportHeight / this.camera.zoom, this.camera.y));
    }
  }

  updateStrategy(input: Input) {
    let tx = Math.floor((input.mouseX + this.camera.x) / TILE_SIZE);
    let ty = Math.floor((input.mouseY + this.camera.y) / TILE_SIZE);

    // Если инструмент размера 2x2 — привязываем к чётным координатам
    const def = BUILDINGS[this.tool as keyof typeof BUILDINGS];
    if (def?.size === 2) {
      tx -= tx % 2;
      ty -= ty % 2;
    }

    this.hoveredTile = { x: tx, y: ty };
    if (tx >= 0 && ty >= 0 && tx < MAP_WIDTH && ty < MAP_HEIGHT) {
      if (input.mouseDown) {
        if (this.tool === 'bulldoze') this.bulldozeTile(tx, ty);
        else if (this.tool === 'select' || this.tool === 'inspect') this.selectedTile = { x: tx, y: ty };
        else this.placeTool(tx, ty);
      }
      if (input.rightDown) {
        this.selectedTile = { x: tx, y: ty };
        this.tool = 'inspect';
      }
    }
  }

  // ----------------------------------------------------------------
  //   ЭКШЕН — ДВИЖЕНИЕ С ФИЗИКОЙ
  // ----------------------------------------------------------------
  updateAction(input: Input, _dt: number) {
    let dx = 0, dy = 0;
    if (input.keys['KeyW'] || input.keys['ArrowUp']) dy -= 1;
    if (input.keys['KeyS'] || input.keys['ArrowDown']) dy += 1;
    if (input.keys['KeyA'] || input.keys['ArrowLeft']) dx -= 1;
    if (input.keys['KeyD'] || input.keys['ArrowRight']) dx += 1;
    if (dx !== 0 || dy !== 0) { const l = Math.sqrt(dx * dx + dy * dy); dx /= l; dy /= l; }

    if (this.playerInVehicleId !== null) {
      const v = this.vehicles.find(v => v.id === this.playerInVehicleId);
      if (v) {
        if (!this.isRoadPosition(v.x, v.y, 6)) {
          const pos = this.findNearestRoadPosition(v.x, v.y);
          v.x = pos.x; v.y = pos.y; v.vx = 0; v.vy = 0;
        }
        const accel = 0.3;
        const friction = 0.04;
        v.vx += dx * accel;
        v.vy += dy * accel;
        v.vx *= (1 - friction);
        v.vy *= (1 - friction);
        const sp = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
        if (sp > 0.1) v.angle = Math.atan2(v.vy, v.vx);
        const newX = v.x + v.vx;
        const newY = v.y + v.vy;
        // В режиме боя машины едут только по дорогам.
        if (this.isRoadPosition(newX, v.y, 7)) v.x = newX; else v.vx = 0;
        if (this.isRoadPosition(v.x, newY, 7)) v.y = newY; else v.vy = 0;
        this.resolveVehicleCollision(v, 16);
        this.resolveVehicleCollision(v, 16);
        this.player.x = v.x;
        this.player.y = v.y;
        v.speed = sp;
      }
    } else {
      const speed = 2.2;
      const newX = this.player.x + dx * speed;
      const newY = this.player.y + dy * speed;
      // Коллизия со зданиями
      if (!this.isBlockedByBuilding(newX, this.player.y, 4)) this.player.x = newX;
      if (!this.isBlockedByBuilding(this.player.x, newY, 4)) this.player.y = newY;
      this.resolveVehicleCollision(this.player, 10);
      if (dx !== 0 || dy !== 0) this.player.angle = Math.atan2(dy, dx);
      this.player.speed = Math.sqrt(dx * dx + dy * dy) * speed;
    }

    this.player.x = Math.max(TILE_SIZE, Math.min(MAP_WIDTH * TILE_SIZE - TILE_SIZE, this.player.x));
    this.player.y = Math.max(TILE_SIZE, Math.min(MAP_HEIGHT * TILE_SIZE - TILE_SIZE, this.player.y));

    // Оружейный магазин: пополняет патроны и временно дает суперпушку.
    if (this.playerInVehicleId === null) {
      const px = Math.floor(this.player.x / TILE_SIZE);
      const py = Math.floor(this.player.y / TILE_SIZE);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const tx = px + ox;
          const ty = py + oy;
          if (tx >= 0 && ty >= 0 && tx < MAP_WIDTH && ty < MAP_HEIGHT && this.tiles[ty][tx].type === 'gunshop') {
            if (this.player.ammo < this.player.maxAmmo || !this.superWeapon) {
              this.player.ammo = this.player.maxAmmo;
              this.superWeapon = true;
              this.superWeaponTimer = 900;
              this.addMessage('🔫 Оружейный магазин: полный боекомплект!', '#ff2d8a');
              this.emitParticles(this.player.x, this.player.y, '#ff2d8a', 14, 2);
            }
          }
        }
      }
    }

    const worldX = input.mouseX + this.camera.x;
    const worldY = input.mouseY + this.camera.y;
    this.player.angle = Math.atan2(worldY - this.player.y, worldX - this.player.x);

    if (input.mouseDown && this.shootingCooldown === 0) this.shoot();

    if (input.keys['KeyF']) {
      if (this.playerInVehicleId === null) {
        const near = this.vehicles.find(v => Math.hypot(v.x - this.player.x, v.y - this.player.y) < 30);
        if (near) {
          this.playerInVehicleId = near.id;
          near.driver = 'player';
          this.player.inVehicle = true;
          this.addMessage('В машине! [F] чтобы выйти', '#00f0ff');
        }
      } else {
        const v = this.vehicles.find(v => v.id === this.playerInVehicleId);
        if (v) v.driver = 'civilian';
        this.playerInVehicleId = null;
        this.player.inVehicle = false;
        this.addMessage('Вышел из машины', '#00f0ff');
      }
      input.keys['KeyF'] = false;
    }

    if (this.player.wanted > 0) {
      this.wantedDecayTimer++;
      if (this.wantedDecayTimer > 600) {
        this.player.wanted = Math.max(0, this.player.wanted - 1);
        this.wantedDecayTimer = 0;
      }
    }
  }

  shoot() {
    if (this.player.ammo <= 0) {
      this.addMessage('Нет патронов!', '#ff4444');
      this.shootingCooldown = 30;
      return;
    }
    this.player.ammo--;
    this.shootingCooldown = this.superWeapon ? 3 : 12;
    this.bullets.push({
      id: uid(),
      x: this.player.x, y: this.player.y,
      vx: Math.cos(this.player.angle) * (this.superWeapon ? 12 : 8),
      vy: Math.sin(this.player.angle) * (this.superWeapon ? 12 : 8),
      damage: this.superWeapon ? 80 : 25, owner: 'player', life: 60,
    });
    this.emitParticles(
      this.player.x + Math.cos(this.player.angle) * 12,
      this.player.y + Math.sin(this.player.angle) * 12,
      '#ffea00', 3, 1.5,
    );
  }

  // ----------------------------------------------------------------
  //   ПЕШЕХОДЫ И МАШИНЫ
  // ----------------------------------------------------------------
  updateVehicles(_dt: number) {
    for (const v of this.vehicles) {
      if (v.id === this.playerInVehicleId) continue;
      if (v.type === 'airplane') {
        this.driveAirplane(v);
      } else if (v.driver === 'civilian' || v.driver === 'gang' || v.driver === 'police' || v.driver === 'transit') {
        this.driveVehicleOnRoad(v);
      }
    }
  }

  // ----------------------------------------------------------------
  //   САМОЛЁТЫ — полёт аэропорт→аэропорт, без дорог
  // ----------------------------------------------------------------
  findAllAirportPositions(): { x: number; y: number }[] {
    const results: { x: number; y: number }[] = [];
    for (let ty = 0; ty < MAP_HEIGHT - 1; ty++) {
      for (let tx = 0; tx < MAP_WIDTH - 1; tx++) {
        // Ищем левый-верхний угол 2×2 аэропорта
        if (
          this.tiles[ty][tx].type === 'airport' &&
          this.tiles[ty][tx + 1]?.type === 'airport' &&
          this.tiles[ty + 1]?.[tx]?.type === 'airport' &&
          this.tiles[ty + 1]?.[tx + 1]?.type === 'airport'
        ) {
          results.push({
            x: (tx + 1) * TILE_SIZE,
            y: (ty + 1) * TILE_SIZE,
          });
          tx++; // Пропускаем правую половину, чтобы не дублировать
        }
      }
    }
    return results;
  }

  driveAirplane(v: Vehicle) {
    const airports = this.findAllAirportPositions();

    // Если аэропортов нет — самолёт просто не летает
    if (airports.length === 0) {
      v.vx = 0; v.vy = 0; v.speed = 0;
      return;
    }

    // Назначаем цель, если её нет или самолёт уже прилетел
    if (v.targetX === undefined || v.targetY === undefined || v.phase === undefined) {
      v.altitude = 0;
      v.phase = 'taxiing';
      // Выбираем другой аэропорт как цель
      const others = airports.filter(a => Math.hypot(a.x - v.x, a.y - v.y) > TILE_SIZE * 4);
      const target = others.length > 0
        ? others[Math.floor(Math.random() * others.length)]
        : airports[Math.floor(Math.random() * airports.length)];
      v.targetX = target.x;
      v.targetY = target.y;
    }

    const tx = v.targetX!;
    const ty = v.targetY!;
    const dist = Math.hypot(tx - v.x, ty - v.y);

    if (v.phase === 'taxiing') {
      // Короткая «рулёжка» перед взлётом — самолёт чуть смещается
      v.altitude = 0;
      v.speed = 0.5;
      const ang = Math.atan2(ty - v.y, tx - v.x);
      v.angle = ang;
      v.vx = Math.cos(ang) * v.speed;
      v.vy = Math.sin(ang) * v.speed;
      v.x += v.vx;
      v.y += v.vy;
      if (this.tickCount % 60 === 0) v.phase = 'takeoff';

    } else if (v.phase === 'takeoff') {
      // Набор высоты
      v.altitude = Math.min(1, (v.altitude ?? 0) + 0.012);
      const ang = Math.atan2(ty - v.y, tx - v.x);
      v.angle += (ang - v.angle) * 0.06;
      v.speed = 1.2 + (v.altitude ?? 0) * 1.8;
      v.vx = Math.cos(v.angle) * v.speed;
      v.vy = Math.sin(v.angle) * v.speed;
      v.x += v.vx;
      v.y += v.vy;
      if ((v.altitude ?? 0) >= 1) v.phase = 'cruise';

    } else if (v.phase === 'cruise') {
      v.altitude = 1;
      v.speed = 3.0;
      const ang = Math.atan2(ty - v.y, tx - v.x);
      // Плавный разворот
      const diff = Math.atan2(Math.sin(ang - v.angle), Math.cos(ang - v.angle));
      v.angle += diff * 0.04;
      v.vx = Math.cos(v.angle) * v.speed;
      v.vy = Math.sin(v.angle) * v.speed;
      v.x += v.vx;
      v.y += v.vy;
      if (dist < TILE_SIZE * 12) v.phase = 'landing';

    } else if (v.phase === 'landing') {
      // Снижение
      v.altitude = Math.max(0, (v.altitude ?? 1) - 0.018);
      const ang = Math.atan2(ty - v.y, tx - v.x);
      v.angle += (ang - v.angle) * 0.08;
      v.speed = Math.max(0.4, 3.0 * (v.altitude ?? 0) + 0.4);
      v.vx = Math.cos(v.angle) * v.speed;
      v.vy = Math.sin(v.angle) * v.speed;
      v.x += v.vx;
      v.y += v.vy;

      if (dist < TILE_SIZE * 2) {
        // Прилетели — паркуемся в аэропорту
        v.x = tx; v.y = ty;
        v.vx = 0; v.vy = 0;
        v.altitude = 0;
        // Выбираем следующий аэропорт назначения
        const others = airports.filter(a => Math.hypot(a.x - v.x, a.y - v.y) > TILE_SIZE * 4);
        if (others.length > 0) {
          const next = others[Math.floor(Math.random() * others.length)];
          v.targetX = next.x;
          v.targetY = next.y;
        }
        v.phase = 'taxiing';
        this.emitParticles(v.x, v.y, '#00f0ff', 12, 1.5);
      }
    }

    // Оборачиваем по краям карты (если карта не дошла до аэропорта)
    if (v.x < 0) v.x = MAP_WIDTH * TILE_SIZE;
    if (v.x > MAP_WIDTH * TILE_SIZE) v.x = 0;
    if (v.y < 0) v.y = MAP_HEIGHT * TILE_SIZE;
    if (v.y > MAP_HEIGHT * TILE_SIZE) v.y = 0;
    v.speed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
  }

  private assignVehicleRoute(v: Vehicle, avoidCurrentTarget = false) {
    this.rebuildRoadGraph();
    if (this.roadNodes.length < 2) return false;
    const current = this.findNearestTrafficNode(v.x, v.y, v.angle);
    const candidates = this.roadNodes.filter(node => {
      if (!current) return true;
      const distance = Math.abs(node.tx - current.tx) + Math.abs(node.ty - current.ty);
      return distance > (avoidCurrentTarget ? 12 : 4);
    });
    const destination = candidates[Math.floor(Math.random() * Math.max(1, candidates.length))] ?? this.roadNodes[0];
    const target = this.getNodeWorldPosition(destination);
    const route = this.buildTrafficRoute(v.x, v.y, v.angle, target.x, target.y);
    if (route.length < 2) {
      const alternate = this.roadNodes.find(node => node.tx !== current?.tx || node.ty !== current?.ty);
      if (!alternate) return false;
      const alternateTarget = this.getNodeWorldPosition(alternate);
      v.route = this.buildTrafficRoute(v.x, v.y, v.angle, alternateTarget.x, alternateTarget.y);
    } else {
      v.route = route;
    }
    v.routeIndex = 0;
    v.routeAge = 0;
    v.routeReplanTick = this.tickCount + 1200;
    v.stalledTicks = 0;
    v.yieldTicks = -30;
    v.lastX = v.x;
    v.lastY = v.y;
    v.targetNodeKey = this.nodeKey(destination);
    return (v.route?.length ?? 0) > 1;
  }

  driveVehicleOnRoad(v: Vehicle): void {
    this.rebuildRoadGraph();
    if (!this.isRoadPosition(v.x, v.y, 6)) {
      const pos = this.findNearestRoadPosition(v.x, v.y);
      v.x = pos.x;
      v.y = pos.y;
      v.angle = pos.angle;
      v.route = [];
      v.routeIndex = 0;
    }

    const distanceSinceCheck = v.lastX === undefined || v.lastY === undefined ? Infinity : Math.hypot(v.x - v.lastX, v.y - v.lastY);
    if (distanceSinceCheck < 0.05 && (v.routeAge ?? 0) > 12) v.stalledTicks = (v.stalledTicks ?? 0) + this.simulationSpeed;
    else v.stalledTicks = Math.max(0, (v.stalledTicks ?? 0) - this.simulationSpeed * 0.5);
    v.lastX = v.x;
    v.lastY = v.y;
    const needsRoute = !v.route || v.route.length < 2 || (v.routeIndex ?? 0) >= v.route.length || (v.stalledTicks ?? 0) > 18 || this.tickCount >= (v.routeReplanTick ?? Infinity);
    if (needsRoute && !this.assignVehicleRoute(v, (v.stalledTicks ?? 0) > 18)) {
      v.vx = 0;
      v.vy = 0;
      v.speed = 0;
      return;
    }

    const route = v.route ?? [];
    let index = v.routeIndex ?? 0;
    while (index < route.length) {
      const point = this.getNodeWorldPosition(route[index]);
      if (Math.hypot(point.x - v.x, point.y - v.y) >= 2.5) break;
      index++;
    }
    v.routeIndex = index;
    if (index >= route.length) {
      if (this.assignVehicleRoute(v, true)) return this.driveVehicleOnRoad(v);
      v.route = [];
      v.speed = 0;
      return;
    }

    const next = route[index];
    const target = this.getNodeWorldPosition(next);
    const dx = target.x - v.x;
    const dy = target.y - v.y;
    const distance = Math.hypot(dx, dy) || 1;
    const desiredAngle = Math.atan2(dy, dx);
    const targetSpeed = (v.type === 'sport' ? 1.7 : v.type === 'bus' ? 1.0 : v.type === 'tram' ? 1.1 : v.type === 'train' ? 1.35 : 1.2) * this.simulationSpeed;
    const blocked = this.hasVehicleAhead(v, desiredAngle, v.type === 'train' ? 34 : 26);
    if (blocked) {
      v.yieldTicks = (v.yieldTicks ?? 0) + this.simulationSpeed;
      if ((v.yieldTicks ?? 0) > 14) this.assignVehicleRoute(v, true);
    } else {
      v.yieldTicks = Math.max(0, (v.yieldTicks ?? 0) - this.simulationSpeed);
    }
    const speed = blocked ? Math.min(0.32 * this.simulationSpeed, distance) : Math.min(targetSpeed, distance);

    if (speed < 0.05) {
      v.vx = 0;
      v.vy = 0;
      v.speed = 0;
      return;
    }
    v.stalledTicks = 0;
    v.angle = desiredAngle;
    v.vx = (dx / distance) * speed;
    v.vy = (dy / distance) * speed;
    const nextX = v.x + v.vx;
    const nextY = v.y + v.vy;
    if (this.isRoadPosition(nextX, nextY, 3)) {
      v.x = nextX;
      v.y = nextY;
      v.speed = speed;
    } else {
      const pos = this.findNearestRoadPosition(v.x, v.y);
      v.x = pos.x;
      v.y = pos.y;
      v.angle = pos.angle;
      v.route = [];
      v.routeIndex = 0;
      v.stalledTicks = 20;
      v.vx = 0;
      v.vy = 0;
      v.speed = 0;
    }
  }

  private findIncident(type: 'fire' | 'crime', x: number, y: number) {
    let best: { x: number; y: number; distance: number } | undefined;
    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const tile = this.tiles[ty][tx];
        const active = type === 'fire' ? tile.hasFire : tile.hasCrime;
        if (!active) continue;
        const targetX = tx * TILE_SIZE + TILE_SIZE / 2;
        const targetY = ty * TILE_SIZE + TILE_SIZE / 2;
        const distance = Math.hypot(targetX - x, targetY - y);
        if (!best || distance < best.distance) best = { x: targetX, y: targetY, distance };
      }
    }
    return best;
  }

  private findRoamingTarget(x: number, y: number) {
    for (let attempt = 0; attempt < 18; attempt++) {
      const tx = Math.max(1, Math.min(MAP_WIDTH - 2, Math.floor(x / TILE_SIZE) + Math.floor(Math.random() * 25) - 12));
      const ty = Math.max(1, Math.min(MAP_HEIGHT - 2, Math.floor(y / TILE_SIZE) + Math.floor(Math.random() * 25) - 12));
      const target = { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
      if (!this.isBlockedByBuilding(target.x, target.y, 3) && Math.hypot(target.x - x, target.y - y) > TILE_SIZE * 3) return target;
    }
    return { x, y };
  }

  private choosePedestrianGoal(p: Pedestrian) {
    const workingHours = this.stats.hour >= 8 && this.stats.hour < 18;
    p.activityUntil = undefined;
    p.targetId = undefined;
    const emergencyFire = p.profession === 'firefighter' ? this.findIncident('fire', p.x, p.y) : undefined;
    if (emergencyFire) {
      this.setPedestrianTarget(p, emergencyFire.x, emergencyFire.y, 'responding');
      p.nextDecisionTick = this.tickCount + 18;
      return;
    }
    const emergencyCrime = p.profession === 'officer' ? this.findIncident('crime', p.x, p.y) : undefined;
    if (emergencyCrime) {
      this.setPedestrianTarget(p, emergencyCrime.x, emergencyCrime.y, 'responding');
      p.nextDecisionTick = this.tickCount + 22;
      return;
    }
    if (p.type === 'police' && this.player.wanted > 0 && Math.hypot(this.player.x - p.x, this.player.y - p.y) < 320) {
      this.setPedestrianTarget(p, this.player.x, this.player.y, 'attacking');
      p.nextDecisionTick = this.tickCount + 15;
      return;
    }
    if (p.profession === 'medic') {
      const wounded = this.nearbyPedestrians(p.x, p.y).find(other => other !== p && other.health < 35);
      if (wounded) {
        this.setPedestrianTarget(p, wounded.x, wounded.y, 'responding');
        p.targetId = wounded.id;
        p.nextDecisionTick = this.tickCount + 18;
        return;
      }
    }
    if (p.profession === 'gang') {
      const opponent = this.nearbyPedestrians(p.x, p.y).find(other => other !== p && other.state !== 'dead' && other.profession === 'gang' && other.gang !== p.gang);
      if (opponent) {
        this.setPedestrianTarget(p, opponent.x, opponent.y, 'attacking');
        p.targetId = opponent.id;
        p.nextDecisionTick = this.tickCount + 18;
        return;
      }
    }
    if (workingHours && p.workX !== undefined && p.workY !== undefined && p.profession !== 'unemployed' && p.profession !== 'gang') {
      p.activity = `Работа: ${p.profession}`;
      this.setPedestrianTarget(p, p.workX, p.workY, 'working');
    } else if (p.socialNeed > 42 && this.stats.hour >= 16 && this.stats.hour < 23) {
      const social = this.findClosestBuilding(['park', 'commercial', 'stadium', 'casino'], p.x, p.y);
      if (social) {
        p.activity = 'Общение';
        this.setPedestrianTarget(p, social.x, social.y, 'socializing');
      } else {
        const stroll = this.findRoamingTarget(p.x, p.y);
        p.activity = 'Прогулка';
        this.setPedestrianTarget(p, stroll.x, stroll.y, 'roaming');
      }
    } else if (p.profession === 'unemployed' || p.profession === 'gang' || Math.random() < 0.42) {
      const stroll = this.findRoamingTarget(p.x, p.y);
      p.activity = 'Прогулка';
      this.setPedestrianTarget(p, stroll.x, stroll.y, 'roaming');
    } else {
      p.activity = 'Отдых дома';
      this.setPedestrianTarget(p, p.homeX, p.homeY, 'resting');
    }
    p.activityUntil = this.tickCount + (p.state === 'resting' ? 70 : 10);
    p.nextDecisionTick = this.tickCount + 45 + Math.floor(Math.random() * 55);
  }

  private movePedestrianToGoal(p: Pedestrian) {
    const path = p.path ?? [];
    let index = p.pathIndex ?? 0;
    while (index < path.length && Math.hypot(path[index].x - p.x, path[index].y - p.y) < 3) index++;
    p.pathIndex = index;
    if (index >= path.length) {
      p.vx = 0;
      p.vy = 0;
      p.speed = 0;
      if (p.activityUntil === undefined) p.activityUntil = this.tickCount + 45;
      if (this.tickCount >= p.activityUntil) p.nextDecisionTick = this.tickCount;
      return;
    }
    const target = path[index];
    let dx = target.x - p.x;
    let dy = target.y - p.y;
    const distance = Math.hypot(dx, dy) || 1;
    dx /= distance;
    dy /= distance;

    // Лёгкое локальное расхождение: только для соседей, без изменения главной цели.
    for (const other of this.nearbyPedestrians(p.x, p.y)) {
      if (other === p || other.state === 'dead') continue;
      const ox = p.x - other.x;
      const oy = p.y - other.y;
      const od = Math.hypot(ox, oy) || 1;
      if (od < 12) {
        dx += (ox / od) * (12 - od) * 0.06;
        dy += (oy / od) * (12 - od) * 0.06;
      }
    }
    const directionLength = Math.hypot(dx, dy) || 1;
    dx /= directionLength;
    dy /= directionLength;
    const speed = (p.state === 'responding' || p.state === 'attacking' ? 1.35 : 0.72) * this.simulationSpeed;
    p.angle = Math.atan2(dy, dx);
    p.speed = speed;
    p.vx = dx * speed;
    p.vy = dy * speed;
    if (!this.isBlockedByBuilding(p.x + p.vx, p.y, 3)) p.x += p.vx;
    if (!this.isBlockedByBuilding(p.x, p.y + p.vy, 3)) p.y += p.vy;
  }

  private updatePedestrianSocialState(p: Pedestrian) {
    const nearby = this.nearbyPedestrians(p.x, p.y).filter(other => other !== p && other.state !== 'dead' && Math.hypot(other.x - p.x, other.y - p.y) < 26);
    if (p.state === 'socializing' && nearby.length > 0) {
      p.socialNeed = Math.max(0, p.socialNeed - 0.5 * this.simulationSpeed);
      p.socialScore = Math.min(100, p.socialScore + 0.18 * this.simulationSpeed);
      p.mood = Math.min(100, p.mood + 0.1 * this.simulationSpeed);
    } else {
      p.socialNeed = Math.min(100, p.socialNeed + 0.05 * this.simulationSpeed);
      p.mood += (p.socialScore - p.mood) * 0.004;
    }
  }

  updatePedestrians(_dt: number) {
    for (const p of this.pedestrians) {
      if (p.state === 'dead') continue;
      if (p.weaponCooldown > 0) p.weaponCooldown -= this.simulationSpeed;
      if (this.tickCount >= p.nextDecisionTick) this.choosePedestrianGoal(p);
      this.movePedestrianToGoal(p);
      this.updatePedestrianSocialState(p);

      const targetDistance = p.targetX === undefined || p.targetY === undefined ? Infinity : Math.hypot(p.targetX - p.x, p.targetY - p.y);
      if (targetDistance < 18 && p.state === 'responding' && p.profession === 'firefighter') {
        const tile = this.tiles[Math.floor(p.y / TILE_SIZE)]?.[Math.floor(p.x / TILE_SIZE)];
        if (tile?.hasFire) {
          tile.hasFire = false;
          this.emitParticles(p.x, p.y, '#00f0ff', 12);
          p.nextDecisionTick = this.tickCount;
        }
      }
      if (targetDistance < 24 && p.state === 'responding' && p.profession === 'medic' && p.targetId !== undefined) {
        const wounded = this.pedestrians.find(other => other.id === p.targetId);
        if (wounded) wounded.health = Math.min(80, wounded.health + 15);
      }
      if (p.state === 'attacking' && targetDistance < 210 && p.weaponCooldown <= 0) {
        const owner = p.type === 'police' ? 'police' : p.type === 'gang1' ? 'gang1' : p.type === 'gang2' ? 'gang2' : p.type === 'gang3' ? 'gang3' : 'gang4';
        this.bullets.push({ id: uid(), x: p.x, y: p.y, vx: Math.cos(p.angle) * 6, vy: Math.sin(p.angle) * 6, damage: p.type === 'police' ? 10 : 15, owner, life: 50 });
        p.weaponCooldown = p.type === 'police' ? 30 : 42;
      }
      if (p.x < 0) p.x = MAP_WIDTH * TILE_SIZE;
      if (p.x > MAP_WIDTH * TILE_SIZE) p.x = 0;
      if (p.y < 0) p.y = MAP_HEIGHT * TILE_SIZE;
      if (p.y > MAP_HEIGHT * TILE_SIZE) p.y = 0;
    }
  }

  updateBullets() {
    for (const b of this.bullets) { b.x += b.vx; b.y += b.vy; b.life--; }
    this.bullets = this.bullets.filter(b => b.life > 0 && b.x > 0 && b.x < MAP_WIDTH * TILE_SIZE && b.y > 0 && b.y < MAP_HEIGHT * TILE_SIZE);
  }

  updateExplosions() {
    for (const e of this.explosions) {
      e.life--;
      e.radius = e.maxRadius * (1 - e.life / e.maxLife);
      if (e.life === e.maxLife - 1) {
        for (const p of this.pedestrians) {
          if (p.state === 'dead') continue;
          if (Math.hypot(p.x - e.x, p.y - e.y) < e.maxRadius) {
            p.health -= 50;
            if (p.health <= 0) { p.state = 'dead'; if (p.type.startsWith('gang')) this.totalKills++; }
          }
        }
        for (const v of this.vehicles) { if (Math.hypot(v.x - e.x, v.y - e.y) < e.maxRadius) v.health -= 60; }
        if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < e.maxRadius) { this.player.health -= 30; if (this.player.health <= 0) this.playerDeath(); }
      }
    }
    this.explosions = this.explosions.filter(e => e.life > 0);
  }

  updatePickups() {
    for (const p of this.pickups) p.life--;
    for (const p of this.pickups) {
      if (Math.hypot(p.x - this.player.x, p.y - this.player.y) < 20) {
        if (p.type === 'money') { this.stats.money += p.amount; this.player.money += p.amount; this.addMessage(`+$${p.amount}`, '#39ff14', p.x, p.y); }
        else if (p.type === 'health') { this.player.health = Math.min(this.player.maxHealth, this.player.health + p.amount); }
        else if (p.type === 'ammo') { this.player.ammo = Math.min(this.player.maxAmmo, this.player.ammo + p.amount); }
        else if (p.type === 'weapon') { this.player.ammo = this.player.maxAmmo; this.superWeapon = true; this.superWeaponTimer = 600; this.addMessage('🔥 СУПЕРПУШКА! 🔥', '#ff2d8a', p.x, p.y); }
        p.life = 0;
      }
    }
    this.pickups = this.pickups.filter(p => p.life > 0);
  }

  updateParticles() {
    for (const pa of this.particles) { pa.x += pa.vx; pa.y += pa.vy; pa.vx *= 0.9; pa.vy *= 0.9; pa.life--; }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  updateMessages() {
    for (const m of this.messages) { m.life--; m.y -= 0.5; }
    this.messages = this.messages.filter(m => m.life > 0);
  }

  updateMissions() {
    for (const m of this.missions) {
      if (m.completed) continue;
      if (m.id === 'm1') m.progress = this.totalKills % 5 === 0 ? 5 : this.totalKills % 5;
      if (m.id === 'm2') m.progress = Math.min(m.target, this.totalEarned);
      if (m.id === 'm3') { let c = 0; for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) if (this.tiles[y][x].type === 'park') c++; m.progress = c; }
      if (m.id === 'm4') m.progress = this.stats.approval;
      if (m.id === 'm5') m.progress = this.stats.population;
      if (m.progress >= m.target && !m.completed) { m.completed = true; this.stats.money += m.reward; this.addMessage(`🎯 Миссия выполнена: ${m.title} +$${m.reward}`, '#ffea00'); }
    }
  }

  updateCity(_dt: number) {
    // Карта не пересчитывается на каждом кадре: городской tick выполняется раз в 30 единиц симуляции.
    if (this.tickCount - this.lastPopulationSimulationTick < 30) return;
    this.lastPopulationSimulationTick = this.tickCount;
    let pop = 0;
    let crime = 0;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const t = this.tiles[y][x];
        if (t.type === 'residential') {
          if (this.tickCount % 60 === 0) {
            t.population = Math.min(100, t.population + 5);
            t.level = Math.min(3, Math.floor(t.population / 35) + 1);
          }
          pop += t.population;
        }
        if (t.hasCrime) crime += 5;
        if (t.hasFire) this.stats.approval = Math.max(0, this.stats.approval - 0.35);
        if ((t.type === 'residential' || t.type === 'commercial' || t.type === 'industrial') && this.tickCount % 300 === 0) {
          const rand = Math.random();
          if (rand < 0.05) {
            t.gang = rand < 0.0125 ? 'loons' : rand < 0.025 ? 'yutes' : rand < 0.0375 ? 'russians' : 'vultures';
          } else if (rand > 0.95) {
            t.gang = 'none';
          }
        }
      }
    }

    const active = this.pedestrians.filter(p => p.state !== 'dead');
    const employed = active.filter(p => p.profession !== 'unemployed' && p.profession !== 'gang').length;
    const socialMood = active.length === 0 ? 50 : active.reduce((sum, p) => sum + p.mood, 0) / active.length;
    this.stats.population = pop;
    this.stats.crime = Math.min(100, crime);
    this.stats.employment = active.length === 0 ? 0 : Math.round((employed / active.length) * 100);
    this.stats.socialMood = Math.round(socialMood);
    const target = 38 + pop / 55 - crime * 0.7 + this.stats.employment * 0.13 + (this.stats.socialMood - 50) * 0.22;
    this.stats.approval += (Math.max(0, Math.min(100, target)) - this.stats.approval) * 0.035;
  }

  checkCollisions() {
    for (const b of this.bullets) {
      for (const p of this.pedestrians) {
        if (p.state === 'dead') continue;
        if (Math.hypot(p.x - b.x, p.y - b.y) < 8) {
          p.health -= b.damage;
          b.life = 0;
          this.emitParticles(p.x, p.y, '#c82020', 5);
          if (p.health <= 0) { p.state = 'dead'; if (b.owner === 'player') { this.totalKills++; if (p.type.startsWith('gang')) this.player.wanted = Math.min(5, this.player.wanted + 1); if (Math.random() < 0.3) this.pickups.push({ id: uid(), x: p.x, y: p.y, type: 'money', amount: 20 + Math.floor(Math.random() * 50), life: 600 }); } }
          break;
        }
      }
    }
    for (const b of this.bullets) {
      if (b.owner === 'player') continue;
      if (Math.hypot(this.player.x - b.x, this.player.y - b.y) < 8) { this.player.health -= b.damage; b.life = 0; if (this.player.health <= 0) this.playerDeath(); }
    }
    for (const b of this.bullets) {
      for (const v of this.vehicles) {
        if (Math.hypot(v.x - b.x, v.y - b.y) < 14) {
          v.health -= b.damage; b.life = 0;
          if (v.health <= 0) { this.explosions.push({ id: uid(), x: v.x, y: v.y, radius: 0, maxRadius: 40, life: 30, maxLife: 30 }); this.vehicles = this.vehicles.filter(x => x.id !== v.id); if (this.playerInVehicleId === v.id) { this.playerInVehicleId = null; this.player.inVehicle = false; } }
          break;
        }
      }
    }
    this.resolveAllPhysicalCollisions();
  }

  resolveAllPhysicalCollisions() {
    this.rebuildSpatialIndex();
    for (const a of this.vehicles) {
      if (a.health <= 0 || a.type === 'airplane') continue;
      // Каждая пара машин обрабатывается один раз и только в соседних ячейках.
      for (const b of this.nearbyVehicles(a.x, a.y)) {
        if (b === a || b.id < a.id || b.health <= 0 || b.type === 'airplane') continue;
        const margin = (a.type === 'bus' || a.type === 'train' || b.type === 'bus' || b.type === 'train') ? 22 : 16;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < margin) {
          const push = (margin - d) * 0.5;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
      for (const p of this.nearbyPedestrians(a.x, a.y)) {
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < 14) {
          const push = 14 - d;
          p.x += (dx / d) * push;
          p.y += (dy / d) * push;
        }
      }
      if (!this.autopilotEnabled && this.playerInVehicleId !== a.id) {
        const dx = this.player.x - a.x;
        const dy = this.player.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < 14) {
          const push = 14 - d;
          this.player.x += (dx / d) * push;
          this.player.y += (dy / d) * push;
        }
      }
    }
  }

  maybeSpawnCrime() {
    if (this.tickCount - this.lastCrimeSpawn < 600) return;
    this.lastCrimeSpawn = this.tickCount;
    for (let a = 0; a < 10; a++) {
      const x = Math.floor(Math.random() * MAP_WIDTH);
      const y = Math.floor(Math.random() * MAP_HEIGHT);
      const t = this.tiles[y][x];
      if ((t.type === 'commercial' || t.type === 'industrial' || t.type === 'residential') && !t.hasCrime) {
        let nearPolice = false;
        for (let dy = -5; dy <= 5 && !nearPolice; dy++) for (let dx = -5; dx <= 5 && !nearPolice; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < MAP_WIDTH && ny < MAP_HEIGHT && this.tiles[ny][nx].type === 'policestation') nearPolice = true;
        }
        if (!nearPolice && Math.random() < 0.3) {
          const gangs: Exclude<GangId, 'none'>[] = ['loons', 'yutes', 'russians', 'vultures'];
          const gang = gangs[Math.floor(Math.random() * gangs.length)];
          t.hasCrime = true;
          t.gang = gang;
          this.spawnGangMember(gang);
          if (Math.random() < 0.45) this.spawnGangVehicle(gang);
          break;
        }
      }
    }
  }

  maybeSpawnFire() {
    if (this.tickCount - this.lastFireSpawn < 1200) return;
    this.lastFireSpawn = this.tickCount;
    for (let a = 0; a < 5; a++) {
      const x = Math.floor(Math.random() * MAP_WIDTH);
      const y = Math.floor(Math.random() * MAP_HEIGHT);
      const t = this.tiles[y][x];
      if ((t.type === 'residential' || t.type === 'commercial' || t.type === 'industrial') && !t.hasFire && Math.random() < 0.05) { t.hasFire = true; this.addMessage('🔥 Пожар в городе!', '#ff8c00'); break; }
    }
  }

  maybePolicePatrol() {
    if (this.tickCount - this.policePatrolTimer < 200) return;
    this.policePatrolTimer = this.tickCount;
    let stations = 0;
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) if (this.tiles[y][x].type === 'policestation') stations++;
    const curPolice = this.pedestrians.filter(p => p.type === 'police' && p.state !== 'dead').length;
    if (curPolice < Math.min(20, stations * 3)) this.spawnPedestrian('police');
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
      if (this.tiles[y][x].hasCrime) {
        let near = false;
        for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3 && !near; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < MAP_WIDTH && ny < MAP_HEIGHT && this.tiles[ny][nx].type === 'policestation') near = true;
        }
        if (near && Math.random() < 0.05) this.tiles[y][x].hasCrime = false;
      }
    }
    if (this.pedestrians.filter(p => p.type === 'firefighter' && p.state !== 'dead').length < this.countBuildings('firestation') * 2) this.spawnPedestrian('firefighter');
    if (this.pedestrians.filter(p => p.type === 'medic' && p.state !== 'dead').length < this.countBuildings('hospital') * 2) this.spawnPedestrian('medic');
  }

  countPlacedBuildings(type: TileType): number {
    return Math.ceil(this.countBuildings(type) / 4);
  }

  maybePublicTransport() {
    if (this.tickCount - this.publicTransportTimer < 180) return;
    this.publicTransportTimer = this.tickCount;

    const airportTiles = this.findAllAirportPositions();
    const desired = {
      bus: this.countPlacedBuildings('busdepot') * 2,
      tram: this.countPlacedBuildings('tramdepot') * 2,
      train: this.countPlacedBuildings('trainstation'),
      // Самолётов нужно на 1 меньше числа аэропортов: летают по маршрутам
      airplane: airportTiles.length >= 2 ? airportTiles.length - 1 : 0,
    };

    for (const type of ['bus', 'tram', 'train', 'airplane'] as Vehicle['type'][]) {
      const current = this.vehicles.filter(v => v.type === type && v.health > 0).length;
      const limit = desired[type as keyof typeof desired] ?? 0;
      if (current < limit) this.spawnTransitVehicle(type);
    }
  }

  spawnTransitVehicle(type: Vehicle['type']) {
    if (type === 'airplane') {
      const airports = this.findAllAirportPositions();
      if (airports.length < 2) return; // Для самолёта нужно минимум 2 аэропорта
      const src = airports[Math.floor(Math.random() * airports.length)];
      const others = airports.filter(a => a !== src);
      const dest = others[Math.floor(Math.random() * others.length)];
      this.vehicles.push({
        id: uid(), x: src.x, y: src.y, vx: 0, vy: 0,
        angle: Math.atan2(dest.y - src.y, dest.x - src.x),
        speed: 0, health: 200, type: 'airplane',
        gang: 'none', driver: 'transit', passengers: 120,
        targetX: dest.x, targetY: dest.y, altitude: 0, phase: 'taxiing',
      });
      this.addMessage('✈️ Рейс запущен!', '#60d0ff', src.x, src.y);
    } else {
      const pos = this.getRandomRoadPosition();
      this.vehicles.push({
        id: uid(), x: pos.x, y: pos.y, vx: 0, vy: 0, angle: pos.angle ?? 0,
        speed: 0, health: type === 'train' ? 180 : 130,
        type, gang: 'none', driver: 'transit',
        passengers: type === 'bus' ? 20 : type === 'tram' ? 35 : 80,
      });
      this.addMessage(`🚌 Транспорт запущен: ${type}`, '#00f0ff', pos.x, pos.y);
    }
  }

  countBuildings(type: TileType): number { let n = 0; for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) if (this.tiles[y][x].type === type) n++; return n; }

  private spawnGangVehicle(gang: Exclude<GangId, 'none'>) {
    const pos = this.getRandomRoadPosition();
    this.vehicles.push({
      id: uid(), x: pos.x, y: pos.y, vx: 0, vy: 0, angle: pos.angle ?? 0,
      speed: 0, health: 110, type: 'gang', gang, driver: 'gang', passengers: 2,
    });
  }

  maybeGangWar() {
    if (this.tickCount - this.gangWarTimer < 1000) return;
    this.gangWarTimer = this.tickCount;
    if (Math.random() < 0.3) {
      const gangs: Exclude<GangId, 'none'>[] = ['loons', 'yutes', 'russians', 'vultures'];
      const g1 = gangs[Math.floor(Math.random() * gangs.length)];
      const rivals = gangs.filter(g => g !== g1);
      const g2 = rivals[Math.floor(Math.random() * rivals.length)];
      this.addMessage(`⚔️ Война банд: ${GANG_NAMES[g1]} vs ${GANG_NAMES[g2]}!`, '#ff2d8a');
      for (let i = 0; i < 3; i++) { this.spawnGangMember(g1); this.spawnGangMember(g2); }
      this.spawnGangVehicle(g1);
      this.spawnGangVehicle(g2);
    }
  }

  maybeSpawnBoss() {
    if (this.totalKills < 30) return;
    for (const g of ['loons', 'yutes', 'russians', 'vultures'] as Exclude<GangId, 'none'>[]) {
      if (this.bossSpawned[g]) continue;
      if (Math.random() < 0.001) {
        const type: Pedestrian['type'] = g === 'loons' ? 'gang1' : g === 'yutes' ? 'gang2' : g === 'russians' ? 'gang3' : 'gang4';
        const boss = this.spawnPedestrian(type, undefined, undefined, g);
        boss.health = 200;
        this.bossSpawned[g] = true;
        this.bossIds.push(boss.id);
        this.addMessage(`👑 БОСС банды ${GANG_NAMES[g]} появился!`, GANG_COLORS[g]);
      }
    }
  }

  playerDeath() {
    this.gameOver = true;
    this.addMessage('💀 ВЫ ПОГИБЛИ! [R] - рестарт', '#ff4444');
    this.explosions.push({ id: uid(), x: this.player.x, y: this.player.y, radius: 0, maxRadius: 30, life: 30, maxLife: 30 });
  }

  respawnHero() {
    this.player.x = 80 * TILE_SIZE + TILE_SIZE / 2;
    this.player.y = 60 * TILE_SIZE + TILE_SIZE / 2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.health = this.player.maxHealth;
    this.player.wanted = 0;
    if (this.playerInVehicleId !== null) {
      const v = this.vehicles.find(x => x.id === this.playerInVehicleId);
      if (v) v.driver = 'civilian';
      this.playerInVehicleId = null;
      this.player.inVehicle = false;
    }
    this.camera.x = this.player.x - this.viewportWidth / (2 * this.camera.zoom);
    this.camera.y = this.player.y - this.viewportHeight / (2 * this.camera.zoom);
    this.addMessage('🔄 Герой мгновенно респаунился в центре!', '#39ff14');
    this.emitParticles(this.player.x, this.player.y, '#39ff14', 20, 3);
  }

  restart() {
    this.tiles = []; this.vehicles = []; this.pedestrians = []; this.bullets = []; this.explosions = []; this.pickups = []; this.particles = []; this.messages = [];
    this.stats = { money: 5000, population: 0, day: 1, hour: 8, minute: 0, approval: 50, crime: 20, income: 0, expenses: 0, employment: 0, socialMood: 50 };
    this.player = { x: 80 * TILE_SIZE + TILE_SIZE / 2, y: 60 * TILE_SIZE + TILE_SIZE / 2, vx: 0, vy: 0, angle: 0, speed: 0, health: 100, maxHealth: 100, inVehicle: false, wanted: 0, ammo: 50, maxAmmo: 99, kills: 0, money: 0 };
    this.playerInVehicleId = null; this.gameOver = false; this.tickCount = 0; this.totalKills = 0;
    this.bossSpawned = { loons: false, yutes: false, russians: false, vultures: false, none: false }; this.bossIds = [];
    this.deposit = 0; this.loanAmount = 0;
    this.bankInterestRate = 0.5; this.loanInterestRate = 1.5;
    this.taxRateResidential = 100; this.taxRateCommercial = 100; this.taxRateIndustrial = 100;
    this.initMap(); this.rebuildRoadGraph(); this.initMissions(); this.spawnStartingEntities();
  }
}
