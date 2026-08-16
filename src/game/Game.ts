// Ночной картограф: ядро симуляции держит город читаемым — решения NPC редкие, локальные и видимы на карте.
import type { BuildingInstance, GameStats, GangId, Message, Mission, Particle, Pedestrian, Player, Profession, Tile, TileType, Vehicle, Bullet, Explosion, Pickup } from './types';
import { BUILDINGS, DAY_LENGTH_MS, GANG_COLORS, GANGS, MAP_HEIGHT, MAP_WIDTH, MISSION_TEMPLATES, TILE_SIZE } from './constants';

export type Tool = 'select' | 'bulldoze' | 'inspect' | Exclude<TileType, 'grass' | 'water'>;
export type GameMode = 'strategy' | 'action';
export type SimulationSpeed = 1 | 2 | 5;

export interface Camera { x: number; y: number; zoom: number; }
export interface Input { mouseX: number; mouseY: number; mouseDown: boolean; rightDown: boolean; keys: Record<string, boolean>; }

const GANG_IDS: Exclude<GangId, 'none'>[] = ['loons', 'yutes', 'russians', 'ashdogs'];
const PROFESSION_FOR_BUILDING: Partial<Record<TileType, Profession>> = {
  commercial: 'shopkeeper', industrial: 'worker', school: 'teacher', policestation: 'officer',
  hospital: 'medic', firestation: 'firefighter', busdepot: 'driver', tramdepot: 'driver', trainstation: 'driver', airport: 'driver',
};
let nextId = 1;
const uid = () => nextId++;

export class Game {
  tiles: Tile[][] = [];
  buildings: BuildingInstance[] = [];
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
  paused = false;
  speed: SimulationSpeed = 1;
  autopilot = false;
  autopilotTarget: { x: number; y: number; label: string } | null = null;
  autopilotPath: { x: number; y: number }[] = [];
  gameOver = false;
  dayNightCycle = 0;
  mouseX = 0;
  mouseY = 0;
  tickCount = 0;
  totalKills = 0;
  totalEarned = 0;
  timeAccumulator = 0;
  shootingCooldown = 0;
  playerInVehicleId: number | null = null;
  messageIdCounter = 0;
  superWeapon = false;
  superWeaponTimer = 0;
  deposit = 0;
  loanAmount = 0;
  bankInterestRate = 0.5;
  loanInterestRate = 1.5;
  taxRateResidential = 100;
  taxRateCommercial = 100;
  taxRateIndustrial = 100;
  private npcStride = 3;
  private spatialGrid = new Map<string, Pedestrian[]>();
  private lastGridTick = -1;
  private lastIncidentTick = 0;
  private lastGangTick = 0;
  private lastAssignmentTick = 0;
  private lastCityTick = 0;
  private roadGraph = new Map<string, { x: number; y: number; neighbors: { x: number; y: number; cost: number }[] }>();
  private roadGraphDirty = true;
  private tramGraph = new Map<string, { x: number; y: number; neighbors: { x: number; y: number; cost: number }[] }>();
  private railGraph = new Map<string, { x: number; y: number; neighbors: { x: number; y: number; cost: number }[] }>();
  private transitGraphDirty = true;
  private routePlanBudget = 0;
  private junctionReservations = new Map<string, { vehicleId: number; expires: number }>();
  private lastSaveTick = 0;
  private readonly saveKey = 'urban-flux-city-v2';

  constructor() {
    this.stats = { money: 5000, population: 0, day: 1, hour: 8, minute: 0, approval: 55, crime: 12, income: 0, expenses: 0, community: 34, employment: 0, activeWorkers: 0, zoneDemand: { residential: 58, commercial: 46, industrial: 40 }, energy: { produced: 0, consumed: 0, coverage: 0, overload: 0, outage: true }, lastSavedAt: 0 };
    this.player = { x: 80 * TILE_SIZE, y: 60 * TILE_SIZE, vx: 0, vy: 0, angle: 0, speed: 0, health: 100, maxHealth: 100, inVehicle: false, wanted: 0, ammo: 50, maxAmmo: 99, kills: 0, money: 0 };
    this.initMap();
    this.seedCivicCore();
    this.initMissions();
    this.spawnStartingEntities();
    this.centerCameraOnPlayer();
    this.loadGame();
  }

  get taxMultiplier() { return this.stats.hour >= 7 && this.stats.hour < 21 ? 1 : 0.45; }
  get speedLabel() { return this.paused ? 'ПАУЗА' : `×${this.speed}`; }

  saveGame(quiet = false) {
    if (typeof localStorage === 'undefined') return false;
    const payload = {
      version: 2,
      savedAt: Date.now(),
      stats: this.stats,
      player: this.player,
      tiles: this.tiles,
      buildings: this.buildings,
      vehicles: this.vehicles,
      pedestrians: this.pedestrians,
      missions: this.missions,
      camera: this.camera,
      mode: this.mode,
      tool: this.tool,
      speed: this.speed,
      deposit: this.deposit,
      loanAmount: this.loanAmount,
      taxRateResidential: this.taxRateResidential,
      taxRateCommercial: this.taxRateCommercial,
      taxRateIndustrial: this.taxRateIndustrial,
      totalKills: this.totalKills,
      totalEarned: this.totalEarned,
    };
    try {
      localStorage.setItem(this.saveKey, JSON.stringify(payload));
      this.stats.lastSavedAt = payload.savedAt;
      if (!quiet) this.addMessage('Город сохранён локально', '#31d7c8');
      return true;
    } catch {
      if (!quiet) this.addMessage('Не удалось сохранить город', '#f47067');
      return false;
    }
  }

  loadGame() {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(this.saveKey);
      if (!raw) return false;
      const saved = JSON.parse(raw) as any;
      const version = saved.version ?? 1;
      if ((version !== 1 && version !== 2) || !saved.stats) return false;
      const defaults = this.stats;
      this.stats = { ...defaults, ...saved.stats, zoneDemand: { ...defaults.zoneDemand, ...(saved.stats.zoneDemand ?? {}) }, energy: { ...defaults.energy, ...(saved.stats.energy ?? {}) } };
      if (saved.player) this.player = saved.player;
      if (Array.isArray(saved.tiles) && Array.isArray(saved.buildings)) { this.tiles = saved.tiles; this.buildings = saved.buildings; }
      this.vehicles = saved.vehicles ?? this.vehicles;
      this.pedestrians = saved.pedestrians ?? this.pedestrians;
      this.missions = saved.missions ?? this.missions;
      if (saved.camera) this.camera = saved.camera;
      this.mode = saved.mode ?? this.mode;
      this.tool = saved.tool ?? this.tool;
      this.speed = saved.speed ?? this.speed;
      this.deposit = saved.deposit ?? 0;
      this.loanAmount = saved.loanAmount ?? 0;
      this.taxRateResidential = saved.taxRateResidential ?? 100;
      this.taxRateCommercial = saved.taxRateCommercial ?? 100;
      this.taxRateIndustrial = saved.taxRateIndustrial ?? 100;
      this.totalKills = saved.totalKills ?? 0;
      this.totalEarned = saved.totalEarned ?? 0;
      this.roadGraphDirty = true;
      this.transitGraphDirty = true;
      this.rebuildSpatialGrid();
      return true;
    } catch {
      localStorage.removeItem(this.saveKey);
      return false;
    }
  }

  clearSavedGame() { if (typeof localStorage !== 'undefined') localStorage.removeItem(this.saveKey); }

  setSpeed(speed: SimulationSpeed) { this.speed = speed; this.paused = false; }
  setMode(mode: GameMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.mouseX = this.viewportWidth / 2; this.mouseY = this.viewportHeight / 2;
    this.autopilot = false; this.autopilotTarget = null; this.autopilotPath = [];
    if (mode === 'strategy') { this.playerInVehicleId = null; this.player.inVehicle = false; }
    this.rebuildSpatialGrid();
    this.addMessage(mode === 'action' ? 'Городской режим активен' : 'Карта управления активна', '#31d7c8');
  }
  togglePause() { this.paused = !this.paused; }
  toggleAutopilot() {
    if (this.autopilot) { this.autopilot = false; this.autopilotTarget = null; this.autopilotPath = []; this.addMessage('Автопилот отключён', '#aeb9c4'); return; }
    const safeHub = this.getNearestBuilding(this.player.x, this.player.y, ['park', 'policestation', 'hospital', 'bank']) ?? this.getNearestBuilding(this.player.x, this.player.y);
    if (!safeHub) return;
    this.autopilotTarget = { x: (safeHub.x + safeHub.size / 2) * TILE_SIZE, y: (safeHub.y + safeHub.size / 2) * TILE_SIZE, label: BUILDINGS[safeHub.type].name };
    this.autopilotPath = this.findRoadPath(this.player.x, this.player.y, this.autopilotTarget.x, this.autopilotTarget.y);
    this.autopilot = this.autopilotPath.length > 0;
    if (this.autopilot) this.addMessage(`Автопилот: ${this.autopilotPath.length} узлов до ${this.autopilotTarget.label}`, '#31d7c8');
    else { this.autopilotTarget = null; this.addMessage('Нет связного дорожного маршрута', '#f47067'); }
  }

  initMap() {
    this.tiles = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        const water = (x < 4 && y < 4) || (x > MAP_WIDTH - 5 && y > MAP_HEIGHT - 5) || (x < 4 && y > MAP_HEIGHT - 5) || (x > MAP_WIDTH - 5 && y < 4);
        const inCity = x >= 34 && x <= 126 && y >= 24 && y <= 96;
        const road = inCity && ([48, 49, 68, 69, 88, 89, 108, 109].includes(x) || [38, 39, 54, 55, 70, 71, 86, 87].includes(y));
        row.push({ type: water ? 'water' : road ? 'road' : 'grass', level: 0, population: 0, hasFire: false, hasCrime: false, gang: 'none', variant: (x * 7 + y * 11) % 4 });
      }
      this.tiles.push(row);
    }
  }

  private seedCivicCore() {
    this.createBuilding('residential', 74, 58, false);
    this.createBuilding('residential', 76, 58, false);
    this.createBuilding('commercial', 74, 62, false);
    this.createBuilding('park', 78, 62, false);
    this.createBuilding('policestation', 82, 58, false);
    this.createBuilding('school', 72, 66, false);
    this.createBuilding('powerplant', 84, 66, false);
  }

  initMissions() { this.missions = MISSION_TEMPLATES.map(m => ({ ...m, progress: 0, active: true, completed: false })); }

  spawnStartingEntities() {
    for (let i = 0; i < 16; i++) this.spawnRandomVehicle();
    for (let i = 0; i < 54; i++) this.spawnPedestrian('civilian');
    for (const gang of GANG_IDS) {
      for (let i = 0; i < 3; i++) this.spawnGangMember(gang);
      this.spawnGangVehicle(gang);
    }
    this.refreshAssignments();
  }

  private makeTile(type: TileType, buildingId?: number): Tile {
    return { type, level: type === 'residential' ? 1 : 0, population: 0, hasFire: false, hasCrime: false, gang: 'none', variant: Math.floor(Math.random() * 4), buildingId, powered: type === 'powerplant' };
  }

  private createBuilding(type: TileType, x: number, y: number, charge = true) {
    const def = BUILDINGS[type];
    if (charge && this.stats.money < def.cost) { this.addMessage('Недостаточно бюджета', '#f47067'); return false; }
    if (!this.canPlace(x, y, type)) return false;
    const id = uid();
    if (charge) this.stats.money -= def.cost;
    this.buildings.push({ id, type, x, y, size: def.size });
    if (['road', 'bridge', 'tramrail', 'rail', 'river'].includes(type)) { this.roadGraphDirty = true; this.transitGraphDirty = true; }
    for (let oy = 0; oy < def.size; oy++) for (let ox = 0; ox < def.size; ox++) this.tiles[y + oy][x + ox] = this.makeTile(type, id);
    if (charge) {
      this.emitParticles((x + def.size / 2) * TILE_SIZE, (y + def.size / 2) * TILE_SIZE, '#31d7c8', 8);
      this.addMessage(`${def.name}: подключено`, '#69d9c8');
    }
    this.refreshAssignments();
    if (type === 'tramdepot') this.spawnTransitVehicle('tram', x, y);
    if (type === 'trainstation') this.spawnTransitVehicle('train', x, y);
    return true;
  }

  canPlace(x: number, y: number, type: Tool | TileType): boolean {
    if (type === 'select' || type === 'inspect' || type === 'bulldoze') return true;
    const def = BUILDINGS[type];
    if (!def || x < 0 || y < 0 || x + def.size > MAP_WIDTH || y + def.size > MAP_HEIGHT) return false;
    if (def.size === 2 && (x % 2 !== 0 || y % 2 !== 0)) return false;
    for (let oy = 0; oy < def.size; oy++) for (let ox = 0; ox < def.size; ox++) {
      const t = this.tiles[y + oy][x + ox];
      const allowed = type === 'river' ? t.type === 'grass'
        : type === 'bridge' ? (t.type === 'river' || t.type === 'water')
        : type === 'tramrail' || type === 'rail' ? (t.type === 'grass' || t.type === 'road' || t.type === type)
        : t.type === 'grass' || (type === 'road' && t.type === 'road');
      if (!allowed) return false;
    }
    return true;
  }

  placeTool(x: number, y: number) {
    if (this.tool === 'bulldoze') { this.bulldozeTile(x, y); return; }
    if (this.tool === 'select' || this.tool === 'inspect') { this.selectedTile = { x, y }; return; }
    this.createBuilding(this.tool, x, y);
  }

  bulldozeTile(x: number, y: number) {
    const tile = this.tiles[y]?.[x];
    if (!tile || tile.type === 'grass' || tile.type === 'water') return;
    const instance = this.buildings.find(b => b.id === tile.buildingId);
    if (instance) {
      this.buildings = this.buildings.filter(b => b.id !== instance.id);
      for (let oy = 0; oy < instance.size; oy++) for (let ox = 0; ox < instance.size; ox++) this.tiles[instance.y + oy][instance.x + ox] = this.makeTile('grass');
    } else this.tiles[y][x] = this.makeTile('grass');
    this.stats.money += 5;
    this.roadGraphDirty = true;
    this.refreshAssignments();
  }

  update(rawDt: number, input: Input) {
    if (this.paused || this.gameOver) return;
    const dt = Math.min(50, rawDt) * this.speed;
    this.tickCount++;
    this.mouseX = input.mouseX; this.mouseY = input.mouseY;
    this.updateTime(dt);
    this.routePlanBudget = this.mode === 'action' ? 2 : 4;
    this.ensureRoadGraph();
    this.updateCamera(input);
    if (this.mode === 'action') this.updateAction(input, dt); else this.updateStrategy(input);
    this.updateVehicles(dt);
    if (this.tickCount - this.lastGridTick >= this.npcStride) { this.lastGridTick = this.tickCount; this.rebuildSpatialGrid(); }
    this.updatePedestrians(dt);
    this.updateBullets();
    this.updateExplosions();
    this.updatePickups();
    this.updateParticles();
    this.updateMessages();
    this.updateMissions();
    if (this.tickCount - this.lastCityTick > 60) { this.lastCityTick = this.tickCount; this.updateCity(); }
    if (this.tickCount - this.lastAssignmentTick > 360) { this.lastAssignmentTick = this.tickCount; this.refreshAssignments(); }
    if (this.tickCount - this.lastSaveTick > 300) { this.lastSaveTick = this.tickCount; this.saveGame(true); }
    this.maybeSpawnIncident();
    this.maybeGangActivity();
    if (this.shootingCooldown > 0) this.shootingCooldown--;
    if (this.superWeaponTimer > 0 && --this.superWeaponTimer === 0) this.superWeapon = false;
    this.dayNightCycle = this.stats.hour / 24 + this.stats.minute / 1440;
  }

  private updateTime(dt: number) {
    this.timeAccumulator += dt;
    while (this.timeAccumulator >= 1000) {
      this.timeAccumulator -= 1000;
      this.stats.minute++;
      if (this.stats.minute >= 60) {
        this.stats.minute = 0;
        this.stats.hour = (this.stats.hour + 1) % 24;
        if (this.stats.hour === 0) this.stats.day++;
        this.collectHourlyTaxes();
      }
    }
  }

  private collectHourlyTaxes() {
    let income = 0; let expenses = 0;
    for (const b of this.buildings) {
      const def = BUILDINGS[b.type];
      let multiplier = 1;
      if (b.type === 'residential') multiplier = this.taxRateResidential / 100;
      if (b.type === 'commercial') multiplier = this.taxRateCommercial / 100;
      if (b.type === 'industrial') multiplier = this.taxRateIndustrial / 100;
      const tile = this.tiles[b.y][b.x];
      const demand = b.type === 'residential' || b.type === 'commercial' || b.type === 'industrial' ? this.stats.zoneDemand[b.type] : 100;
      const demandMultiplier = 0.55 + demand / 100 * 0.65;
      const powerMultiplier = tile.powered === false ? 0.35 : 1;
      income += Math.round(def.income * multiplier * this.taxMultiplier * demandMultiplier * powerMultiplier * (tile.hasCrime ? 0.65 : 1));
      expenses += def.upkeep;
    }
    income += Math.round(this.deposit * this.bankInterestRate / 100);
    expenses += Math.round(this.loanAmount * this.loanInterestRate / 100);
    this.stats.income = income; this.stats.expenses = expenses;
    const net = income - expenses;
    this.stats.money += net; this.totalEarned += Math.max(0, net);
    this.addMessage(`Поток бюджета: ${net >= 0 ? '+' : ''}$${net}`, net >= 0 ? '#69d9c8' : '#f47067');
  }

  private updateStrategy(input: Input) {
    const pointer = this.screenToWorld(input.mouseX, input.mouseY);
    let tx = Math.floor(pointer.x / TILE_SIZE);
    let ty = Math.floor(pointer.y / TILE_SIZE);
    const def = this.tool in BUILDINGS ? BUILDINGS[this.tool as TileType] : undefined;
    if (def?.size === 2) { tx -= tx % 2; ty -= ty % 2; }
    this.hoveredTile = { x: tx, y: ty };
    if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return;
    if (input.mouseDown) { this.placeTool(tx, ty); input.mouseDown = false; }
    if (input.rightDown) { this.selectedTile = { x: tx, y: ty }; this.tool = 'inspect'; input.rightDown = false; }
  }

  private updateAction(input: Input, _dt: number) {
    const right = input.keys.KeyD === true || input.keys.ArrowRight === true;
    const left = input.keys.KeyA === true || input.keys.ArrowLeft === true;
    const down = input.keys.KeyS === true || input.keys.ArrowDown === true;
    const up = input.keys.KeyW === true || input.keys.ArrowUp === true;
    let dx = Number(right) - Number(left);
    let dy = Number(down) - Number(up);
    if (!dx && !dy && this.autopilot && this.autopilotTarget) {
      const waypoint = this.autopilotPath[0];
      if (!waypoint) { this.addMessage(`Автопилот прибыл: ${this.autopilotTarget.label}`, '#69d9c8'); this.autopilot = false; this.autopilotTarget = null; }
      else {
        const deltaX = waypoint.x - this.player.x; const deltaY = waypoint.y - this.player.y; const dist = Math.hypot(deltaX, deltaY);
        if (dist < 11) this.autopilotPath.shift();
        else { dx = deltaX / dist; dy = deltaY / dist; }
      }
    } else if (dx || dy) { this.autopilot = false; this.autopilotPath = []; }
    if (dx || dy) { const length = Math.hypot(dx, dy); dx /= length; dy /= length; }
    const vehicle = this.playerInVehicleId === null ? undefined : this.vehicles.find(v => v.id === this.playerInVehicleId);
    if (vehicle) {
      const speed = 2.2;
      const nx = vehicle.x + dx * speed; const ny = vehicle.y + dy * speed;
      if (this.isRoadPosition(nx, vehicle.y)) vehicle.x = nx;
      if (this.isRoadPosition(vehicle.x, ny)) vehicle.y = ny;
      vehicle.angle = Math.atan2(dy || Math.sin(vehicle.angle), dx || Math.cos(vehicle.angle));
      vehicle.speed = Math.hypot(dx, dy) * speed;
      this.player.x = vehicle.x; this.player.y = vehicle.y;
    } else {
      const speed = 2.1; const nx = this.player.x + dx * speed; const ny = this.player.y + dy * speed;
      if (!this.isBlocked(nx, this.player.y)) this.player.x = nx;
      if (!this.isBlocked(this.player.x, ny)) this.player.y = ny;
      this.player.speed = Math.hypot(dx, dy) * speed;
    }
    const aim = this.screenToWorld(input.mouseX, input.mouseY);
    this.player.angle = Math.atan2(aim.y - this.player.y, aim.x - this.player.x);
    if (input.mouseDown && this.shootingCooldown === 0) this.shoot();
    if (input.keys.KeyF) { this.toggleVehicle(); input.keys.KeyF = false; }
    this.player.x = Math.max(TILE_SIZE, Math.min(MAP_WIDTH * TILE_SIZE - TILE_SIZE, this.player.x));
    this.player.y = Math.max(TILE_SIZE, Math.min(MAP_HEIGHT * TILE_SIZE - TILE_SIZE, this.player.y));
  }

  private toggleVehicle() {
    if (this.playerInVehicleId === null) {
      const near = this.vehicles.find(v => Math.hypot(v.x - this.player.x, v.y - this.player.y) < 28);
      if (!near) return;
      near.driver = 'player'; this.playerInVehicleId = near.id; this.player.inVehicle = true; this.addMessage('Транспорт под контролем', '#31d7c8');
    } else {
      const vehicle = this.vehicles.find(v => v.id === this.playerInVehicleId);
      if (vehicle) vehicle.driver = 'civilian';
      this.playerInVehicleId = null; this.player.inVehicle = false;
    }
  }

  private shoot() {
    if (this.player.ammo <= 0) { this.addMessage('Боезапас исчерпан', '#f47067'); this.shootingCooldown = 20; return; }
    this.player.ammo--; this.shootingCooldown = this.superWeapon ? 3 : 12;
    this.bullets.push({ id: uid(), x: this.player.x, y: this.player.y, vx: Math.cos(this.player.angle) * (this.superWeapon ? 11 : 8), vy: Math.sin(this.player.angle) * (this.superWeapon ? 11 : 8), damage: this.superWeapon ? 75 : 25, owner: 'player', life: 60 });
  }

  private rebuildSpatialGrid() {
    this.spatialGrid.clear();
    for (const ped of this.pedestrians) {
      if (ped.state === 'dead') continue;
      const key = this.cellKey(ped.x, ped.y);
      const list = this.spatialGrid.get(key); if (list) list.push(ped); else this.spatialGrid.set(key, [ped]);
    }
  }

  private cellKey(x: number, y: number) { return `${Math.floor(x / 96)}:${Math.floor(y / 96)}`; }
  private nearbyPeds(x: number, y: number) {
    const cx = Math.floor(x / 96), cy = Math.floor(y / 96); const result: Pedestrian[] = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) result.push(...(this.spatialGrid.get(`${cx + ox}:${cy + oy}`) ?? []));
    return result;
  }

  private updatePedestrians(_dt: number) {
    const slice = this.tickCount % this.npcStride;
    for (let i = 0; i < this.pedestrians.length; i++) {
      const ped = this.pedestrians[i];
      if (ped.state === 'dead' || i % this.npcStride !== slice) continue;
      if (ped.weaponCooldown > 0) ped.weaponCooldown -= this.npcStride;
      if (this.tickCount >= ped.decisionTick) this.decideNpc(ped);
      this.movePedestrian(ped, this.npcStride);
      this.resolveSocialMoment(ped);
    }
  }

  private decideNpc(ped: Pedestrian) {
    ped.decisionTick = this.tickCount + 60 + Math.floor(Math.random() * 45);
    if (ped.type === 'enforcer') { this.decideGangNpc(ped); return; }
    if (ped.type === 'officer') { this.decideOfficer(ped); return; }
    if (ped.type === 'firefighter') { this.decideFirefighter(ped); return; }
    if (ped.type === 'medic') { this.decideMedic(ped); return; }
    const workingHours = this.stats.hour >= 8 && this.stats.hour < 18;
    const socialHours = this.stats.hour >= 18 && this.stats.hour < 22;
    const home = this.getBuildingById(ped.homeBuildingId);
    const work = this.getBuildingById(ped.workBuildingId) ?? this.findWorkplace(ped.profession);
    const social = this.getNearestBuilding(ped.x, ped.y, ['park', 'commercial', 'stadium']);
    const destination = workingHours ? work : socialHours && social ? social : home ?? social ?? work;
    if (destination) {
      ped.targetX = (destination.x + destination.size / 2) * TILE_SIZE;
      ped.targetY = (destination.y + destination.size / 2) * TILE_SIZE;
      ped.intent = socialHours && destination === social ? 'social' : workingHours && destination === work ? 'work' : destination === home ? 'home' : 'work';
      ped.state = socialHours && destination === social ? 'socializing' : workingHours && destination === work ? 'working' : 'walking';
    } else {
      const fallback = this.getNearestBuilding(ped.x, ped.y, ['park', 'commercial', 'residential']);
      if (fallback) {
        ped.targetX = (fallback.x + fallback.size / 2) * TILE_SIZE;
        ped.targetY = (fallback.y + fallback.size / 2) * TILE_SIZE;
        ped.intent = fallback.type === 'park' || fallback.type === 'commercial' ? 'social' : 'home';
        ped.state = 'walking';
      } else {
        ped.targetX = ped.x; ped.targetY = ped.y; ped.intent = 'home'; ped.state = 'walking';
      }
    }
  }

  private decideGangNpc(ped: Pedestrian) {
    if ((ped.combatCooldown ?? 0) > 0) ped.combatCooldown = Math.max(0, (ped.combatCooldown ?? 0) - 60);
    const playerDistance = Math.hypot(this.player.x - ped.x, this.player.y - ped.y);
    if ((this.player.wanted > 0 || this.playerInVehicleId !== null) && playerDistance < 260) {
      ped.targetX = this.player.x; ped.targetY = this.player.y; ped.path = undefined; ped.state = 'attacking';
      if (playerDistance < 180 && ped.weaponCooldown <= 0 && (ped.combatCooldown ?? 0) <= 0) { this.fireNpcBullet(ped, this.player.x, this.player.y, 14); ped.combatCooldown = 180; }
      return;
    }
    const isAggressor = ped.id % 3 === 0;
    const rival = isAggressor ? this.nearbyPeds(ped.x, ped.y).find(other => other.type === 'enforcer' && other.gang !== ped.gang && other.gang !== 'none' && Math.hypot(other.x - ped.x, other.y - ped.y) < 120) : undefined;
    if (rival) {
      ped.targetX = rival.x; ped.targetY = rival.y; ped.path = undefined; ped.state = 'attacking';
      if (ped.weaponCooldown <= 0 && (ped.combatCooldown ?? 0) <= 0) { this.fireNpcBullet(ped, rival.x, rival.y, 12); ped.combatCooldown = 180; }
      return;
    }
    const territory = this.findGangTile(ped.gang);
    ped.targetX = (territory.x + ((ped.id % 5) - 2) * 2) * TILE_SIZE; ped.targetY = (territory.y + ((Math.floor(ped.id / 5) % 5) - 2) * 2) * TILE_SIZE; ped.path = undefined; ped.state = 'walking';
  }

  private decideOfficer(ped: Pedestrian) {
    const incident = this.findNearestIncident(ped.x, ped.y);
    if (this.player.wanted > 0 && Math.hypot(this.player.x - ped.x, this.player.y - ped.y) < 330) { ped.targetX = this.player.x; ped.targetY = this.player.y; ped.state = 'responding'; if (ped.weaponCooldown <= 0) this.fireNpcBullet(ped, this.player.x, this.player.y, 9); return; }
    if (incident) { ped.targetX = incident.x * TILE_SIZE; ped.targetY = incident.y * TILE_SIZE; ped.state = 'responding'; if (incident.distance < 24) this.tiles[incident.y][incident.x].hasCrime = false; return; }
    this.setNpcToWork(ped);
  }

  private decideFirefighter(ped: Pedestrian) {
    const incident = this.findNearestIncident(ped.x, ped.y, 'fire');
    if (incident) { ped.targetX = incident.x * TILE_SIZE; ped.targetY = incident.y * TILE_SIZE; ped.state = 'responding'; if (incident.distance < 24) this.tiles[incident.y][incident.x].hasFire = false; return; }
    this.setNpcToWork(ped);
  }

  private decideMedic(ped: Pedestrian) {
    const patient = this.nearbyPeds(ped.x, ped.y).find(other => other !== ped && other.health < 35 && other.state !== 'dead');
    if (patient) { ped.targetX = patient.x; ped.targetY = patient.y; ped.state = 'responding'; if (Math.hypot(patient.x - ped.x, patient.y - ped.y) < 20) patient.health = Math.min(70, patient.health + 18); return; }
    this.setNpcToWork(ped);
  }

  private setNpcToWork(ped: Pedestrian) {
    const work = this.getBuildingById(ped.workBuildingId) ?? this.findWorkplace(ped.profession);
    if (!work) { ped.state = 'walking'; return; }
    ped.targetX = (work.x + work.size / 2) * TILE_SIZE; ped.targetY = (work.y + work.size / 2) * TILE_SIZE; ped.intent = 'work'; ped.state = 'working';
  }

  private movePedestrian(ped: Pedestrian, factor: number) {
    let dx = Math.cos(ped.angle), dy = Math.sin(ped.angle);
    if (ped.targetX !== undefined && ped.targetY !== undefined) {
      const useRoadPath = ped.type !== 'enforcer';
      if (useRoadPath && !ped.path?.length && this.tickCount >= (ped.pathRetryTick ?? 0) && this.routePlanBudget > 0) {
        this.routePlanBudget--;
        ped.path = this.findRoadPath(ped.x, ped.y, ped.targetX, ped.targetY);
        ped.pathRetryTick = this.tickCount + 12;
      }
      const waypoint = ped.path?.[0];
      const tx = (waypoint?.x ?? ped.targetX) - ped.x, ty = (waypoint?.y ?? ped.targetY) - ped.y, distance = Math.hypot(tx, ty);
      if (distance > 8) { dx = tx / distance; dy = ty / distance; ped.angle = Math.atan2(dy, dx); if (waypoint && distance < 12) ped.path?.shift(); }
      else { ped.targetX = undefined; ped.targetY = undefined; ped.path = undefined; if (ped.state === 'socializing') ped.socialMeter = Math.min(100, ped.socialMeter + 8); }
    }
    let avoidX = 0, avoidY = 0;
    for (const other of this.nearbyPeds(ped.x, ped.y)) {
      if (other === ped || other.state === 'dead') continue;
      const ox = ped.x - other.x, oy = ped.y - other.y, distance = Math.hypot(ox, oy);
      if (distance > 0 && distance < 18) { const force = (18 - distance) / 18; avoidX += ox / distance * force; avoidY += oy / distance * force; }
    }
    for (const vehicle of this.vehicles) {
      const ox = ped.x - vehicle.x, oy = ped.y - vehicle.y, distance = Math.hypot(ox, oy);
      if (distance > 0 && distance < 22) { const force = (22 - distance) / 22; avoidX += ox / distance * force * 1.4; avoidY += oy / distance * force * 1.4; }
    }
    if (avoidX || avoidY) { dx += avoidX * 0.9; dy += avoidY * 0.9; const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length; }
    const speed = ped.type === 'enforcer' || ped.type === 'officer' ? 1.05 : 0.68;
    const nx = ped.x + dx * speed * factor, ny = ped.y + dy * speed * factor;
    if (!this.isBlocked(nx, ped.y, 3)) ped.x = nx;
    if (!this.isBlocked(ped.x, ny, 3)) ped.y = ny;
    ped.x = Math.max(8, Math.min(MAP_WIDTH * TILE_SIZE - 8, ped.x)); ped.y = Math.max(8, Math.min(MAP_HEIGHT * TILE_SIZE - 8, ped.y));
  }

  private resolveSocialMoment(ped: Pedestrian) {
    if (ped.type !== 'civilian') return;
    const neighbour = this.nearbyPeds(ped.x, ped.y).find(other => other !== ped && other.type === 'civilian' && other.state !== 'dead' && Math.hypot(other.x - ped.x, other.y - ped.y) < 18);
    if (!neighbour) { ped.socialMeter = Math.max(0, ped.socialMeter - 0.05); return; }
    const sharedWork = ped.profession === neighbour.profession;
    const boost = sharedWork ? 0.22 : 0.12;
    ped.socialMeter = Math.min(100, ped.socialMeter + boost);
    neighbour.socialMeter = Math.min(100, neighbour.socialMeter + boost * 0.5);
    ped.mood = Math.min(100, ped.mood + boost * 0.3);
  }

  private roadKey(x: number, y: number) { return `${x}:${y}`; }

  private ensureRoadGraph() {
    if (!this.roadGraphDirty) return;
    this.roadGraph.clear();
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
      if (!this.isRoadTile(x, y)) continue;
      const neighbors = [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]
        .filter(point => this.isRoadTile(point.x, point.y))
        .map(point => ({ ...point, cost: 1 }));
      this.roadGraph.set(this.roadKey(x, y), { x, y, neighbors });
    }
    this.roadGraphDirty = false;
  }

  private ensureTransitGraph() {
    if (!this.transitGraphDirty) return;
    this.tramGraph.clear(); this.railGraph.clear();
    const build = (target: Map<string, { x: number; y: number; neighbors: { x: number; y: number; cost: number }[] }>, type: 'tramrail' | 'rail') => {
      for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.tiles[y][x].type !== type) continue;
        const neighbors = [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]
          .filter(point => point.x >= 0 && point.y >= 0 && point.x < MAP_WIDTH && point.y < MAP_HEIGHT && this.tiles[point.y][point.x].type === type)
          .map(point => ({ ...point, cost: 1 }));
        target.set(this.roadKey(x, y), { x, y, neighbors });
      }
    };
    build(this.tramGraph, 'tramrail'); build(this.railGraph, 'rail'); this.transitGraphDirty = false;
  }

  private findTransitPath(startWorldX: number, startWorldY: number, endWorldX: number, endWorldY: number, kind: 'tram' | 'train') {
    this.ensureTransitGraph();
    const graph = kind === 'tram' ? this.tramGraph : this.railGraph;
    const type = kind === 'tram' ? 'tramrail' : 'rail';
    const nearest = (worldX: number, worldY: number) => {
      const sx = Math.floor(worldX / TILE_SIZE), sy = Math.floor(worldY / TILE_SIZE); let best: { x: number; y: number; d: number } | undefined;
      for (const node of graph.values()) { const d = Math.hypot(node.x - sx, node.y - sy); if (!best || d < best.d) best = { x: node.x, y: node.y, d }; }
      return best ? { x: best.x, y: best.y } : null;
    };
    const start = nearest(startWorldX, startWorldY), goal = nearest(endWorldX, endWorldY);
    if (!start || !goal) return [];
    const startKey = this.roadKey(start.x, start.y), goalKey = this.roadKey(goal.x, goal.y);
    const open = [startKey], cameFrom = new Map<string, string>(), score = new Map<string, number>([[startKey, 0]]), estimate = new Map<string, number>([[startKey, Math.hypot(goal.x - start.x, goal.y - start.y)]]);
    while (open.length) {
      open.sort((a, b) => (estimate.get(a) ?? Infinity) - (estimate.get(b) ?? Infinity)); const current = open.shift()!;
      if (current === goalKey) { const keys = [current]; while (cameFrom.has(keys[0])) keys.unshift(cameFrom.get(keys[0])!); return keys.slice(1).map(key => { const [x, y] = key.split(':').map(Number); return { x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 }; }); }
      const node = graph.get(current); if (!node) continue;
      for (const neighbor of node.neighbors) { const key = this.roadKey(neighbor.x, neighbor.y), next = (score.get(current) ?? Infinity) + neighbor.cost; if (next < (score.get(key) ?? Infinity)) { cameFrom.set(key, current); score.set(key, next); estimate.set(key, next + Math.hypot(goal.x - neighbor.x, goal.y - neighbor.y)); if (!open.includes(key)) open.push(key); } }
    }
    return [];
  }

  private nearestTransitPosition(worldX: number, worldY: number, kind: 'tram' | 'train') {
    this.ensureTransitGraph(); const graph = kind === 'tram' ? this.tramGraph : this.railGraph; let best: { x: number; y: number; d: number } | undefined;
    for (const node of graph.values()) { const d = Math.hypot(node.x * TILE_SIZE - worldX, node.y * TILE_SIZE - worldY); if (!best || d < best.d) best = { x: node.x, y: node.y, d }; }
    return best ? { x: best.x * TILE_SIZE + TILE_SIZE / 2, y: best.y * TILE_SIZE + TILE_SIZE / 2, angle: 0 } : null;
  }

  private nearestRoadTile(worldX: number, worldY: number) {
    const sx = Math.floor(worldX / TILE_SIZE), sy = Math.floor(worldY / TILE_SIZE);
    let best: { x: number; y: number; distance: number } | null = null;
    for (let radius = 0; radius < 48; radius++) {
      for (let y = sy - radius; y <= sy + radius; y++) for (let x = sx - radius; x <= sx + radius; x++) {
        if (!this.isRoadTile(x, y)) continue;
        const distance = Math.hypot(x - sx, y - sy);
        if (!best || distance < best.distance) best = { x, y, distance };
      }
      const candidate = best as { x: number; y: number; distance: number } | null;
      if (candidate) return { x: candidate.x, y: candidate.y };
    }
    return null;
  }

  findRoadPath(startWorldX: number, startWorldY: number, endWorldX: number, endWorldY: number) {
    this.ensureRoadGraph();
    const start = this.nearestRoadTile(startWorldX, startWorldY), goal = this.nearestRoadTile(endWorldX, endWorldY);
    if (!start || !goal) return [];
    const startKey = this.roadKey(start.x, start.y), goalKey = this.roadKey(goal.x, goal.y);
    const open = [startKey], cameFrom = new Map<string, string>(), gScore = new Map<string, number>([[startKey, 0]]), fScore = new Map<string, number>([[startKey, Math.hypot(goal.x - start.x, goal.y - start.y)]]);
    while (open.length) {
      open.sort((a, b) => (fScore.get(a) ?? Infinity) - (fScore.get(b) ?? Infinity));
      const current = open.shift()!;
      if (current === goalKey) {
        const keys: string[] = [current];
        while (cameFrom.has(keys[0])) keys.unshift(cameFrom.get(keys[0])!);
        return keys.slice(1).map(key => { const [x, y] = key.split(':').map(Number); return { x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 }; });
      }
      const node = this.roadGraph.get(current); if (!node) continue;
      for (const neighbor of node.neighbors) {
        const key = this.roadKey(neighbor.x, neighbor.y), tentative = (gScore.get(current) ?? Infinity) + neighbor.cost;
        if (tentative < (gScore.get(key) ?? Infinity)) {
          cameFrom.set(key, current); gScore.set(key, tentative); fScore.set(key, tentative + Math.hypot(goal.x - neighbor.x, goal.y - neighbor.y));
          if (!open.includes(key)) open.push(key);
        }
      }
    }
    return [];
  }

  private nextRoadDestination(worldX: number, worldY: number) {
    const target = this.getRandomRoadPosition();
    return this.findRoadPath(worldX, worldY, target.x, target.y);
  }

  private nextVehicleDestination(vehicle: Vehicle) {
    const candidates = vehicle.type === 'gang'
      ? this.buildings.filter(building => ['commercial', 'industrial', 'casino'].includes(building.type))
      : this.buildings.filter(building => ['residential', 'commercial', 'industrial', 'park', 'busdepot', 'tramdepot', 'trainstation'].includes(building.type));
    const occupiedTargets = new Set(this.vehicles.filter(other => other !== vehicle && other.targetX !== undefined && other.targetY !== undefined).map(other => `${Math.round(other.targetX! / TILE_SIZE)}:${Math.round(other.targetY! / TILE_SIZE)}`));
    let target: typeof candidates[number] | undefined;
    for (let offset = 0; offset < candidates.length; offset++) {
      const candidate = candidates[(vehicle.id * 7 + Math.floor(this.tickCount / 180) + offset) % candidates.length];
      const key = `${candidate.x + candidate.size / 2}:${candidate.y + candidate.size / 2}`;
      if (!occupiedTargets.has(key)) { target = candidate; break; }
    }
    if (!target) target = candidates[(vehicle.id * 7 + Math.floor(this.tickCount / 180)) % candidates.length];
    if (!target) return this.nextRoadDestination(vehicle.x, vehicle.y);
    vehicle.targetX = (target.x + target.size / 2) * TILE_SIZE;
    vehicle.targetY = (target.y + target.size / 2) * TILE_SIZE;
    return this.findRoadPath(vehicle.x, vehicle.y, vehicle.targetX, vehicle.targetY);
  }

  private updateVehicles(dt: number) {
    const frameScale = Math.min(3, Math.max(0.5, dt / 16.67));
    for (const [key, reservation] of this.junctionReservations) if (reservation.expires <= this.tickCount) this.junctionReservations.delete(key);
    for (const vehicle of this.vehicles) {
      if ((vehicle.escapeTicks ?? 0) > 0) vehicle.escapeTicks = Math.max(0, (vehicle.escapeTicks ?? 0) - frameScale);
      if (vehicle.id === this.playerInVehicleId || vehicle.type === 'airplane') continue;
      if (vehicle.type === 'tram' || vehicle.type === 'train') {
        const kind = vehicle.type === 'tram' ? 'tram' : 'train';
        if (!this.isTransitPosition(vehicle.x, vehicle.y, kind)) { const rail = this.nearestTransitPosition(vehicle.x, vehicle.y, kind); if (!rail) { vehicle.speed = 0; continue; } vehicle.x = rail.x; vehicle.y = rail.y; vehicle.angle = rail.angle; }
        if (vehicle.stopTimer && vehicle.stopTimer > 0) { vehicle.stopTimer -= frameScale; vehicle.speed = 0; continue; }
        if (!vehicle.route?.length && this.routePlanBudget > 0) { this.routePlanBudget--; const target = this.buildings.find(building => building.type === (kind === 'tram' ? 'tramdepot' : 'trainstation')); if (target) vehicle.route = this.findTransitPath(vehicle.x, vehicle.y, (target.x + target.size / 2) * TILE_SIZE, (target.y + target.size / 2) * TILE_SIZE, kind); }
        const transitWaypoint = vehicle.route?.[0]; if (!transitWaypoint) { vehicle.stopTimer = 40; vehicle.speed = 0; continue; }
        const distance = Math.hypot(transitWaypoint.x - vehicle.x, transitWaypoint.y - vehicle.y);
        if (distance < 10) { vehicle.route?.shift(); vehicle.stopTimer = vehicle.route?.length ? 0 : 40; continue; }
        vehicle.angle = Math.atan2(transitWaypoint.y - vehicle.y, transitWaypoint.x - vehicle.x);
        const transitSpeed = kind === 'tram' ? 0.9 : 1.2; vehicle.vx = Math.cos(vehicle.angle) * transitSpeed; vehicle.vy = Math.sin(vehicle.angle) * transitSpeed;
        const nx = vehicle.x + vehicle.vx * frameScale, ny = vehicle.y + vehicle.vy * frameScale; if (this.isTransitPosition(nx, ny, kind)) { vehicle.x = nx; vehicle.y = ny; } vehicle.speed = transitSpeed; continue;
      }
      if (!this.isRoadPosition(vehicle.x, vehicle.y)) { const road = this.findNearestRoadPosition(vehicle.x, vehicle.y); vehicle.x = road.x; vehicle.y = road.y; vehicle.angle = road.angle; }
      if (vehicle.stopTimer && vehicle.stopTimer > 0) { vehicle.stopTimer -= frameScale; vehicle.speed = 0; continue; }
      if ((vehicle.stuckTicks ?? 0) > 24) { vehicle.route = []; vehicle.routeRetryTick = this.tickCount; vehicle.stuckTicks = 0; vehicle.stopTimer = 0; vehicle.escapeTicks = 18; vehicle.angle += vehicle.id % 2 === 0 ? Math.PI / 2 : -Math.PI / 2; }
      if (!vehicle.route?.length && this.tickCount >= (vehicle.routeRetryTick ?? 0) && this.routePlanBudget > 0) {
        this.routePlanBudget--;
        vehicle.route = this.nextVehicleDestination(vehicle);
        vehicle.routeRetryTick = this.tickCount + 18;
      }
      const waypoint = vehicle.route?.[0];
      let atJunction = false;
      if (waypoint) {
        const distance = Math.hypot(waypoint.x - vehicle.x, waypoint.y - vehicle.y);
        if (distance < 10) {
          vehicle.route?.shift();
          if (!vehicle.route?.length) { vehicle.targetX = undefined; vehicle.targetY = undefined; vehicle.stopTimer = vehicle.type === 'taxi' || vehicle.type === 'bus' ? 4 : 2; vehicle.routeRetryTick = this.tickCount + 3; }
        } else {
          const desired = Math.atan2(waypoint.y - vehicle.y, waypoint.x - vehicle.x);
          // Правостороннее движение: в экранных координатах правая сторона — нормаль (-sin, cos).
          // Встречные машины получают противоположную нормаль из-за обратного направления сегмента.
          const laneOffset = 3.5;
          const targetX = waypoint.x - Math.sin(desired) * laneOffset, targetY = waypoint.y + Math.cos(desired) * laneOffset;
          const steer = Math.atan2(targetY - vehicle.y, targetX - vehicle.x);
          const delta = Math.atan2(Math.sin(steer - vehicle.angle), Math.cos(steer - vehicle.angle));
          vehicle.angle += delta * 0.18;
          const tile = this.nearestRoadTile(vehicle.x, vehicle.y);
          atJunction = !!tile && (this.roadGraph.get(this.roadKey(tile.x, tile.y))?.neighbors.length ?? 0) >= 3;
        }
      }
      const headOn = this.findHeadOnVehicle(vehicle);
      if (headOn && vehicle.id > headOn.id && (vehicle.stuckTicks ?? 0) > 4) {
        const backX = vehicle.x - Math.cos(vehicle.angle) * 8, backY = vehicle.y - Math.sin(vehicle.angle) * 8;
        if (this.isRoadPosition(backX, backY)) { vehicle.x = backX; vehicle.y = backY; }
        vehicle.route = []; vehicle.targetX = undefined; vehicle.targetY = undefined; vehicle.routeRetryTick = this.tickCount + 18; vehicle.stuckTicks = 0; vehicle.escapeTicks = 8;
      }
      let junctionBlocked = false;
      const upcomingTile = waypoint ? this.nearestRoadTile(waypoint.x, waypoint.y) : null;
      if (upcomingTile && (this.roadGraph.get(this.roadKey(upcomingTile.x, upcomingTile.y))?.neighbors.length ?? 0) >= 3 && waypoint && Math.hypot(waypoint.x - vehicle.x, waypoint.y - vehicle.y) < 42) {
        const junctionKey = this.roadKey(upcomingTile.x, upcomingTile.y);
        const reservation = this.junctionReservations.get(junctionKey);
        if (reservation && reservation.vehicleId !== vehicle.id) junctionBlocked = true;
        else this.junctionReservations.set(junctionKey, { vehicleId: vehicle.id, expires: this.tickCount + 24 });
      }
      const rawBlocked = this.hasVehicleAhead(vehicle) || junctionBlocked;
      const blocked = rawBlocked && (vehicle.escapeTicks ?? 0) <= 0;
      vehicle.stuckTicks = rawBlocked ? (vehicle.stuckTicks ?? 0) + frameScale : Math.max(0, (vehicle.stuckTicks ?? 0) - frameScale);
      const cruise = vehicle.type === 'sport' ? 1.5 : vehicle.type === 'gang' ? 1.3 : vehicle.type === 'taxi' ? 1.1 : 1.05;
      const speed = blocked ? 0 : atJunction ? cruise * 0.48 : cruise;
      vehicle.vx = Math.cos(vehicle.angle) * speed; vehicle.vy = Math.sin(vehicle.angle) * speed;
      const nx = vehicle.x + vehicle.vx * frameScale, ny = vehicle.y + vehicle.vy * frameScale;
      const collisionOnStep = speed > 0 && this.hasVehicleAtPosition(vehicle, nx, ny);
      if (speed > 0 && !collisionOnStep && this.isRoadPosition(nx, ny)) { vehicle.x = nx; vehicle.y = ny; }
      vehicle.speed = collisionOnStep ? 0 : speed;
      const overlap = this.vehicles.find(other => other.id < vehicle.id && other.id !== this.playerInVehicleId && (other.routeKind ?? 'road') === (vehicle.routeKind ?? 'road') && Math.hypot(other.x - vehicle.x, other.y - vehicle.y) < 14);
      if (overlap) {
        const candidates = [{ x: vehicle.x + 18, y: vehicle.y }, { x: vehicle.x - 18, y: vehicle.y }, { x: vehicle.x, y: vehicle.y + 18 }, { x: vehicle.x, y: vehicle.y - 18 }, { x: vehicle.x + 12, y: vehicle.y + 12 }, { x: vehicle.x - 12, y: vehicle.y - 12 }];
        const safe = candidates.find(candidate => this.isRoadPosition(candidate.x, candidate.y) && this.vehicles.filter(other => other !== vehicle && (other.routeKind ?? 'road') === (vehicle.routeKind ?? 'road')).every(other => Math.hypot(other.x - candidate.x, other.y - candidate.y) >= 14));
        if (safe) { vehicle.x = safe.x; vehicle.y = safe.y; }
        vehicle.route = []; vehicle.targetX = undefined; vehicle.targetY = undefined; vehicle.routeRetryTick = this.tickCount + 2; vehicle.stopTimer = 0; vehicle.escapeTicks = 8; vehicle.speed = 0;
      }
    }
  }

  private roadDirection(x: number, y: number, current: number) {
    const tx = Math.floor(x / TILE_SIZE), ty = Math.floor(y / TILE_SIZE);
    const directions = [{ dx: 1, dy: 0, angle: 0 }, { dx: -1, dy: 0, angle: Math.PI }, { dx: 0, dy: 1, angle: Math.PI / 2 }, { dx: 0, dy: -1, angle: -Math.PI / 2 }].filter(dir => this.isRoadTile(tx + dir.dx, ty + dir.dy));
    if (!directions.length) return { angle: current };
    const forward = directions.find(dir => Math.abs(Math.atan2(Math.sin(dir.angle - current), Math.cos(dir.angle - current))) < 0.2);
    return forward && Math.random() < 0.82 ? forward : directions[Math.floor(Math.random() * directions.length)];
  }

  private turnAngle(angle: number) { return angle + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2); }
  private hasVehicleAtPosition(vehicle: Vehicle, x: number, y: number) {
    return this.vehicles.some(other => {
      if (other === vehicle || other.id === this.playerInVehicleId || (other.routeKind ?? 'road') !== (vehicle.routeKind ?? 'road')) return false;
      return Math.hypot(other.x - x, other.y - y) < 18;
    });
  }

  private findHeadOnVehicle(vehicle: Vehicle) {
    return this.vehicles.find(other => {
      if (other === vehicle || other.id === this.playerInVehicleId || (other.routeKind ?? 'road') !== (vehicle.routeKind ?? 'road')) return false;
      const dx = other.x - vehicle.x, dy = other.y - vehicle.y;
      const distance = Math.hypot(dx, dy);
      const relativeHeading = Math.abs(Math.atan2(Math.sin(vehicle.angle - other.angle), Math.cos(vehicle.angle - other.angle)));
      return distance < 22 && relativeHeading > 0.95;
    });
  }

  private hasVehicleAhead(vehicle: Vehicle) { return this.vehicles.some(other => {
    if (other === vehicle || other.id === this.playerInVehicleId) return false;
    const sameNetwork = (other.routeKind ?? 'road') === (vehicle.routeKind ?? 'road'); if (!sameNetwork) return false;
    const dx = other.x - vehicle.x, dy = other.y - vehicle.y, distance = Math.hypot(dx, dy);
    const relativeHeading = Math.abs(Math.atan2(Math.sin(vehicle.angle - other.angle), Math.cos(vehicle.angle - other.angle)));
    const forward = dx * Math.cos(vehicle.angle) + dy * Math.sin(vehicle.angle);
    if (distance < 22) return relativeHeading > 0.95 || forward > 0;
    const lateral = Math.abs(-dx * Math.sin(vehicle.angle) + dy * Math.cos(vehicle.angle));
    return forward > 0 && forward < 30 && lateral < 7;
  }); }

  private updateBullets() {
    for (const bullet of this.bullets) { bullet.x += bullet.vx; bullet.y += bullet.vy; bullet.life--; }
    for (const bullet of this.bullets) {
      for (const ped of this.pedestrians) {
        if (ped.state === 'dead' || Math.hypot(ped.x - bullet.x, ped.y - bullet.y) > 8) continue;
        if (bullet.owner === 'gang' && ped.type === 'enforcer' && ped.gang !== 'none') continue;
        ped.health -= bullet.damage; bullet.life = 0;
        if (ped.health <= 0) { ped.state = 'dead'; if (bullet.owner === 'player') { this.totalKills++; this.player.wanted = Math.min(5, this.player.wanted + (ped.type === 'enforcer' ? 1 : 0)); this.pickups.push({ id: uid(), x: ped.x, y: ped.y, type: 'money', amount: 25, life: 500 }); } }
        break;
      }
      if (bullet.owner !== 'player' && Math.hypot(this.player.x - bullet.x, this.player.y - bullet.y) < 8) { this.player.health -= bullet.damage; bullet.life = 0; if (this.player.health <= 0) this.playerDeath(); }
    }
    this.bullets = this.bullets.filter(b => b.life > 0 && b.x > 0 && b.x < MAP_WIDTH * TILE_SIZE && b.y > 0 && b.y < MAP_HEIGHT * TILE_SIZE);
  }

  private updateExplosions() { for (const e of this.explosions) { e.life--; e.radius = e.maxRadius * (1 - e.life / e.maxLife); } this.explosions = this.explosions.filter(e => e.life > 0); }
  private updatePickups() { for (const p of this.pickups) { p.life--; if (Math.hypot(p.x - this.player.x, p.y - this.player.y) < 20) { if (p.type === 'money') { this.stats.money += p.amount; this.player.money += p.amount; } if (p.type === 'ammo') this.player.ammo = Math.min(this.player.maxAmmo, this.player.ammo + p.amount); p.life = 0; } } this.pickups = this.pickups.filter(p => p.life > 0); }
  private updateParticles() { for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.life--; } this.particles = this.particles.filter(p => p.life > 0); }
  private updateMessages() { for (const m of this.messages) { m.life--; m.y -= 0.5; } this.messages = this.messages.filter(m => m.life > 0); }

  private updateMissions() {
    for (const mission of this.missions) {
      if (mission.completed) continue;
      if (mission.type === 'kill') mission.progress = Math.min(mission.target, this.totalKills);
      if (mission.type === 'collect') mission.progress = Math.min(mission.target, this.totalEarned);
      if (mission.type === 'social') mission.progress = Math.floor(this.stats.community);
      if (mission.progress >= mission.target) { mission.completed = true; this.stats.money += mission.reward; this.addMessage(`Миссия: ${mission.title} +$${mission.reward}`, '#f4cf68'); }
    }
  }

  private updateCity() {
    let population = 0, socialValue = 0, jobs = 0, crimeTiles = 0;
    for (const building of this.buildings) {
      const def = BUILDINGS[building.type], tile = this.tiles[building.y][building.x];
      if (building.type === 'residential') { tile.population = Math.min(def.population, tile.population + 4); population += tile.population; }
      socialValue += def.socialValue; jobs += def.workSlots;
      if (tile.hasCrime) crimeTiles++;
    }
    this.updateEnergyNetwork();
    this.updateZoneDemand(population, jobs, socialValue);
    const civilians = this.pedestrians.filter(p => p.type === 'civilian' && p.state !== 'dead');
    const averageSocial = civilians.length ? civilians.reduce((sum, p) => sum + p.socialMeter, 0) / civilians.length : 0;
    const activeWorkers = civilians.filter(p => p.workBuildingId !== undefined).length;
    const communityTarget = Math.min(100, 22 + socialValue * 1.7 + averageSocial * 0.35 - crimeTiles * 4);
    this.stats.community += (communityTarget - this.stats.community) * 0.08;
    this.stats.population = population;
    this.stats.activeWorkers = activeWorkers;
    this.stats.employment = jobs ? Math.min(100, Math.round(activeWorkers / jobs * 100)) : 0;
    this.stats.crime = Math.min(100, crimeTiles * 8 + GANG_IDS.reduce((sum, gang) => sum + this.pedestrians.filter(p => p.gang === gang && p.state !== 'dead').length, 0) * 0.25);
    const taxPressure = (this.taxRateResidential + this.taxRateCommercial + this.taxRateIndustrial) / 300 - 1;
    const approvalTarget = Math.max(0, Math.min(100, 38 + this.stats.community * 0.55 + this.stats.employment * 0.2 - this.stats.crime * 0.4 - taxPressure * 18 - (this.stats.energy.outage ? 12 : 0)));
    this.stats.approval += (approvalTarget - this.stats.approval) * 0.06;
  }

  private updateEnergyNetwork() {
    const plants = this.buildings.filter(b => b.type === 'powerplant');
    const produced = plants.length * 420;
    const consumed = this.buildings.reduce((sum, b) => {
      const def = BUILDINGS[b.type];
      const base = b.type === 'residential' ? 28 : b.type === 'commercial' ? 42 : b.type === 'industrial' ? 72 : Math.max(8, def.workSlots * 4);
      return sum + base;
    }, 0);
    const coverage = consumed === 0 ? 100 : Math.min(100, Math.round(produced / consumed * 100));
    const overload = produced === 0 ? 100 : Math.max(0, Math.round((consumed - produced) / produced * 100));
    this.stats.energy = { produced, consumed, coverage, overload, outage: consumed > produced };
    for (const building of this.buildings) {
      const powered = building.type === 'powerplant' || plants.some(plant => Math.hypot(plant.x - building.x, plant.y - building.y) < 58);
      for (let oy = 0; oy < building.size; oy++) for (let ox = 0; ox < building.size; ox++) this.tiles[building.y + oy][building.x + ox].powered = powered && !this.stats.energy.outage;
    }
  }

  private updateZoneDemand(population: number, jobs: number, socialValue: number) {
    const counts = {
      residential: this.countPlacedBuildings('residential'),
      commercial: this.countPlacedBuildings('commercial'),
      industrial: this.countPlacedBuildings('industrial'),
    };
    const serviceBonus = Math.min(18, socialValue * 0.5);
    this.stats.zoneDemand = {
      residential: Math.max(0, Math.min(100, Math.round(58 + Math.max(0, jobs - population) * 0.16 + this.stats.community * 0.22 - counts.residential * 4 - (this.stats.energy.outage ? 12 : 0)))),
      commercial: Math.max(0, Math.min(100, Math.round(42 + population * 0.08 + this.stats.employment * 0.22 + serviceBonus - counts.commercial * 7 - this.stats.crime * 0.18))),
      industrial: Math.max(0, Math.min(100, Math.round(38 + Math.max(0, population - jobs) * 0.12 + this.stats.community * 0.08 - counts.industrial * 6 - (this.stats.energy.outage ? 18 : 0)))),
    };
  }

  private maybeSpawnIncident() {
    if (this.tickCount - this.lastIncidentTick < 480 || !this.buildings.length) return;
    this.lastIncidentTick = this.tickCount;
    const risky = this.buildings.filter(b => ['residential', 'commercial', 'industrial', 'casino'].includes(b.type));
    const target = risky[Math.floor(Math.random() * risky.length)]; if (!target) return;
    const tile = this.tiles[target.y][target.x];
    if (Math.random() < 0.72) { tile.hasCrime = true; this.addMessage('Сигнал: криминальная активность', '#f4cf68', target.x * TILE_SIZE, target.y * TILE_SIZE); }
    else { tile.hasFire = true; this.addMessage('Сигнал: пожар в квартале', '#f47067', target.x * TILE_SIZE, target.y * TILE_SIZE); }
  }

  private maybeGangActivity() {
    if (this.tickCount - this.lastGangTick < 720) return;
    this.lastGangTick = this.tickCount;
    const gang = GANG_IDS[Math.floor(Math.random() * GANG_IDS.length)];
    const target = this.buildings.filter(b => ['commercial', 'industrial', 'casino'].includes(b.type))[Math.floor(Math.random() * Math.max(1, this.buildings.filter(b => ['commercial', 'industrial', 'casino'].includes(b.type)).length))];
    if (target) { for (let oy = 0; oy < target.size; oy++) for (let ox = 0; ox < target.size; ox++) this.tiles[target.y + oy][target.x + ox].gang = gang; }
    this.spawnGangMember(gang);
    if (Math.random() < 0.55) this.spawnGangVehicle(gang);
  }

  private findNearestIncident(x: number, y: number, kind: 'crime' | 'fire' = 'crime') {
    let match: { x: number; y: number; distance: number } | null = null;
    for (const building of this.buildings) {
      const tile = this.tiles[building.y][building.x]; if (kind === 'crime' ? !tile.hasCrime : !tile.hasFire) continue;
      const distance = Math.hypot(building.x * TILE_SIZE - x, building.y * TILE_SIZE - y);
      if (!match || distance < match.distance) match = { x: building.x, y: building.y, distance };
    }
    return match;
  }

  private findGangTile(gang: GangId) {
    for (const building of this.buildings) if (this.tiles[building.y][building.x].gang === gang) return { x: building.x, y: building.y };
    const i = GANG_IDS.indexOf(gang as Exclude<GangId, 'none'>); return { x: 42 + i * 21, y: 30 + (i % 2) * 46 };
  }

  private getBuildingById(id?: number) { return this.buildings.find(b => b.id === id); }
  getNearestBuilding(x: number, y: number, types?: TileType[]) {
    const candidates = types ? this.buildings.filter(b => types.includes(b.type)) : this.buildings;
    return candidates.reduce<BuildingInstance | undefined>((best, candidate) => !best || Math.hypot(candidate.x * TILE_SIZE - x, candidate.y * TILE_SIZE - y) < Math.hypot(best.x * TILE_SIZE - x, best.y * TILE_SIZE - y) ? candidate : best, undefined);
  }
  private findWorkplace(profession: Profession) {
    const type = Object.entries(PROFESSION_FOR_BUILDING).find(([, value]) => value === profession)?.[0] as TileType | undefined;
    return type ? this.buildings.find(b => b.type === type) : undefined;
  }

  private refreshAssignments() {
    const homes = this.buildings.filter(b => b.type === 'residential');
    const workplaces = this.buildings.filter(b => BUILDINGS[b.type].workSlots > 0);
    let cursor = 0;
    for (const ped of this.pedestrians) {
      if (ped.type !== 'civilian') continue;
      ped.homeBuildingId = homes.length ? homes[ped.id % homes.length].id : undefined;
      const workplace = workplaces.length ? workplaces[cursor++ % workplaces.length] : undefined;
      ped.workBuildingId = workplace?.id;
      ped.profession = workplace ? PROFESSION_FOR_BUILDING[workplace.type] ?? 'resident' : 'resident';
    }
  }

  private getSeparatedRoadPosition(minDistance = 32) {
    let candidate = this.getRandomRoadPosition();
    for (let attempt = 0; attempt < 40; attempt++) {
      candidate = this.getRandomRoadPosition();
      if (this.vehicles.every(vehicle => Math.hypot(vehicle.x - candidate.x, vehicle.y - candidate.y) >= minDistance)) return candidate;
    }
    return candidate;
  }

  spawnRandomVehicle() {
    const types: Vehicle['type'][] = ['car', 'car', 'taxi', 'sport']; const type = types[Math.floor(Math.random() * types.length)]; const pos = this.getSeparatedRoadPosition();
    this.vehicles.push({ id: uid(), x: pos.x, y: pos.y, vx: 0, vy: 0, angle: pos.angle, speed: 0, health: 100, type, gang: 'none', driver: 'civilian', passengers: 0, routeKind: 'road', stuckTicks: 0 });
  }

  private spawnTransitVehicle(type: 'tram' | 'train', x: number, y: number) {
    const pos = this.nearestTransitPosition((x + 1) * TILE_SIZE, (y + 1) * TILE_SIZE, type);
    if (!pos) { this.addMessage(`${type === 'tram' ? 'Трамвай' : 'Поезд'} ждёт рельсов`, '#f4cf68'); return; }
    this.vehicles.push({ id: uid(), x: pos.x, y: pos.y, vx: 0, vy: 0, angle: pos.angle, speed: 0, health: 180, type, gang: 'none', driver: 'transit', passengers: 0, routeKind: type === 'train' ? 'rail' : 'tram', stopTimer: 18 });
    this.addMessage(`${type === 'tram' ? 'Трамвай' : 'Поезд'} вышел на линию`, '#69d9c8');
  }

  private spawnGangVehicle(gang: Exclude<GangId, 'none'>) {
    const pos = this.getSeparatedRoadPosition(48);
    this.vehicles.push({ id: uid(), x: pos.x, y: pos.y, vx: 0, vy: 0, angle: pos.angle, speed: 0, health: 120, type: 'gang', gang, driver: 'gang', passengers: 2, routeKind: 'road', stuckTicks: 0 });
  }

  spawnPedestrian(type: Pedestrian['type'], x?: number, y?: number, gang: GangId = 'none') {
    const civilianHome = type === 'civilian' ? this.buildings.filter(building => ['residential', 'commercial', 'park'].includes(building.type))[this.pedestrians.length % Math.max(1, this.buildings.filter(building => ['residential', 'commercial', 'park'].includes(building.type)).length)] : undefined;
    const pos = x === undefined || y === undefined
      ? civilianHome ? { x: (civilianHome.x + civilianHome.size / 2) * TILE_SIZE, y: (civilianHome.y + civilianHome.size / 2) * TILE_SIZE, angle: Math.random() * Math.PI * 2 } : this.getRandomRoadPosition()
      : { x, y, angle: Math.random() * Math.PI * 2 };
    const roleProfession: Record<Pedestrian['type'], Profession> = { civilian: 'resident', officer: 'officer', enforcer: 'gang', firefighter: 'firefighter', medic: 'medic' };
    const ped: Pedestrian = { id: uid(), x: pos.x, y: pos.y, vx: 0, vy: 0, angle: pos.angle, speed: 0.7, type, profession: roleProfession[type], gang, health: type === 'enforcer' ? 65 : type === 'officer' ? 85 : 45, state: 'walking', weaponCooldown: 0, socialMeter: 38 + Math.random() * 30, mood: 48 + Math.random() * 22, decisionTick: 0 };
    this.pedestrians.push(ped); return ped;
  }

  private spawnGangMember(gang: Exclude<GangId, 'none'>) {
    const territory = this.findGangTile(gang); const spread = this.pedestrians.filter(ped => ped.gang === gang && ped.type === 'enforcer').length; const ox = (spread % 3 - 1) * 28; const oy = (Math.floor(spread / 3) % 3 - 1) * 28; this.spawnPedestrian('enforcer', territory.x * TILE_SIZE + ox, territory.y * TILE_SIZE + oy, gang);
  }

  private fireNpcBullet(ped: Pedestrian, targetX: number, targetY: number, damage: number) {
    const angle = Math.atan2(targetY - ped.y, targetX - ped.x); this.bullets.push({ id: uid(), x: ped.x, y: ped.y, vx: Math.cos(angle) * 6, vy: Math.sin(angle) * 6, damage, owner: ped.type === 'officer' ? 'police' : 'gang', life: 48 }); ped.weaponCooldown = 42;
  }

  private getRandomRoadPosition() {
    for (let i = 0; i < 150; i++) { const x = 36 + Math.floor(Math.random() * 88), y = 26 + Math.floor(Math.random() * 70); if (this.isRoadTile(x, y)) return { x: x * TILE_SIZE + 8, y: y * TILE_SIZE + 8, angle: [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(Math.random() * 4)] }; }
    return { x: 80 * TILE_SIZE, y: 60 * TILE_SIZE, angle: 0 };
  }

  private findNearestRoadPosition(worldX: number, worldY: number) {
    const sx = Math.floor(worldX / TILE_SIZE), sy = Math.floor(worldY / TILE_SIZE); let best: { x: number; y: number; distance: number } | null = null;
    for (let radius = 0; radius < 50; radius++) {
      for (let y = sy - radius; y <= sy + radius; y++) for (let x = sx - radius; x <= sx + radius; x++) {
        if (!this.isRoadTile(x, y)) continue;
        const distance = Math.hypot(x - sx, y - sy);
        if (!best || distance < best.distance) best = { x, y, distance };
      }
      const selected = best as { x: number; y: number; distance: number } | null;
      if (selected !== null) return { x: selected.x * TILE_SIZE + 8, y: selected.y * TILE_SIZE + 8, angle: 0 };
    }
    return this.getRandomRoadPosition();
  }

  isRoadTile(x: number, y: number) {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    const type = this.tiles[y][x].type;
    return type === 'road' || type === 'bridge';
  }
  isRoadPosition(x: number, y: number) { return this.isRoadTile(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)); }
  private isTransitPosition(x: number, y: number, kind: 'tram' | 'train') {
    const tx = Math.floor(x / TILE_SIZE), ty = Math.floor(y / TILE_SIZE), type = kind === 'tram' ? 'tramrail' : 'rail';
    return tx >= 0 && ty >= 0 && tx < MAP_WIDTH && ty < MAP_HEIGHT && this.tiles[ty][tx].type === type;
  }
  private isBlocked(x: number, y: number, _margin = 4) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    const tx = Math.floor(x / TILE_SIZE), ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return true;
    const tile = this.tiles[ty]?.[tx];
    if (!tile) return true;
    return tile.type !== 'grass' && tile.type !== 'road' && tile.type !== 'bridge' && tile.type !== 'park';
  }

  private updateCamera(input: Input) {
    if (this.mode === 'strategy') { const speed = 8; if (input.keys.ArrowLeft || input.keys.KeyA) this.camera.x -= speed; if (input.keys.ArrowRight || input.keys.KeyD) this.camera.x += speed; if (input.keys.ArrowUp || input.keys.KeyW) this.camera.y -= speed; if (input.keys.ArrowDown || input.keys.KeyS) this.camera.y += speed; }
    else this.centerCameraOnPlayer();
    this.camera.x = Math.max(0, Math.min(MAP_WIDTH * TILE_SIZE - this.viewportWidth / this.camera.zoom, this.camera.x));
    this.camera.y = Math.max(0, Math.min(MAP_HEIGHT * TILE_SIZE - this.viewportHeight / this.camera.zoom, this.camera.y));
  }
  private centerCameraOnPlayer() { this.camera.x = this.player.x - this.viewportWidth / (2 * this.camera.zoom); this.camera.y = this.player.y - this.viewportHeight / (2 * this.camera.zoom); }
  screenToWorld(screenX: number, screenY: number) {
    return { x: this.camera.x + screenX / this.camera.zoom, y: this.camera.y + screenY / this.camera.zoom };
  }

  zoomCamera(factor: number, originX = this.viewportWidth / 2, originY = this.viewportHeight / 2) {
    const old = this.camera.zoom, next = Math.max(0.5, Math.min(3, old * factor));
    const world = this.screenToWorld(originX, originY);
    this.camera.zoom = next;
    this.camera.x = world.x - originX / next;
    this.camera.y = world.y - originY / next;
  }

  addMessage(text: string, color = '#eaf1f4', x = this.player.x, y = this.player.y) { this.messages.push({ id: this.messageIdCounter++, text, color, life: 150, x, y }); }
  emitParticles(x: number, y: number, color: string, count: number) { for (let i = 0; i < count; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 28 + Math.random() * 30, maxLife: 58, color, size: 1 + Math.floor(Math.random() * 2) }); }
  countPlacedBuildings(type: TileType) { return this.buildings.filter(b => b.type === type).length; }
  depositToBank(amount: number) { if (amount <= 0 || amount > this.stats.money) return false; this.stats.money -= amount; this.deposit += amount; return true; }
  withdrawFromBank(amount: number) { if (amount <= 0 || amount > this.deposit) return false; this.deposit -= amount; this.stats.money += amount; return true; }
  takeLoan(amount: number) { if (amount <= 0 || amount > Math.max(1000, this.stats.income * 24 + this.deposit * 2)) return false; this.loanAmount += amount; this.stats.money += amount; return true; }
  repayLoan(amount: number) { const value = Math.min(amount, this.loanAmount, this.stats.money); if (value <= 0) return false; this.loanAmount -= value; this.stats.money -= value; return true; }
  private playerDeath() { this.gameOver = true; this.autopilot = false; this.addMessage('Поток оборвался. Нажмите R для перезапуска.', '#f47067'); }
  respawnHero() { this.player.health = this.player.maxHealth; this.player.wanted = 0; this.player.x = 80 * TILE_SIZE; this.player.y = 60 * TILE_SIZE; this.autopilot = false; }
  restart() { this.clearSavedGame(); nextId = 1; Object.assign(this, new Game()); }
  getGangColor(gang: GangId) { return GANG_COLORS[gang]; }
  getGangMeta(gang: Exclude<GangId, 'none'>) { return GANGS[gang]; }
}
