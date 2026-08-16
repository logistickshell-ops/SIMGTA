export type TileType =
  | 'grass' | 'road' | 'water'
  | 'residential' | 'commercial' | 'industrial'
  | 'park' | 'policestation' | 'hospital' | 'firestation' | 'school'
  | 'stadium' | 'casino' | 'bank' | 'powerplant'
  | 'busdepot' | 'tramdepot' | 'trainstation' | 'airport' | 'gunshop';

export type GangId = 'loons' | 'yutes' | 'russians' | 'ashdogs' | 'none';
export type Profession = 'resident' | 'shopkeeper' | 'worker' | 'teacher' | 'officer' | 'medic' | 'firefighter' | 'driver' | 'gang';
export type PedestrianRole = 'civilian' | 'officer' | 'enforcer' | 'firefighter' | 'medic';

export interface Tile {
  type: TileType;
  level: number;
  population: number;
  hasFire: boolean;
  hasCrime: boolean;
  gang: GangId;
  variant: number;
  buildingId?: number;
  powered?: boolean;
}

export interface BuildingDef {
  type: TileType;
  name: string;
  icon: string;
  cost: number;
  upkeep: number;
  income: number;
  population: number;
  workSlots: number;
  socialValue: number;
  desc: string;
  color: string;
  size: 1 | 2;
  category: 'zone' | 'service' | 'transport' | 'special';
}

export interface BuildingInstance {
  id: number;
  type: TileType;
  x: number;
  y: number;
  size: 1 | 2;
}

export interface GameStats {
  money: number;
  population: number;
  day: number;
  hour: number;
  minute: number;
  approval: number;
  crime: number;
  income: number;
  expenses: number;
  community: number;
  employment: number;
  activeWorkers: number;
  zoneDemand: { residential: number; commercial: number; industrial: number };
  energy: { produced: number; consumed: number; coverage: number; overload: number; outage: boolean };
  lastSavedAt: number;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  health: number;
  maxHealth: number;
  inVehicle: boolean;
  wanted: number;
  ammo: number;
  maxAmmo: number;
  kills: number;
  money: number;
}

export interface Vehicle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  health: number;
  type: 'car' | 'sport' | 'police' | 'gang' | 'taxi' | 'bus' | 'tram' | 'train' | 'airplane';
  gang: GangId;
  driver: 'player' | 'civilian' | 'police' | 'gang' | 'transit' | null;
  passengers: number;
  targetX?: number;
  targetY?: number;
  phase?: 'taxiing' | 'takeoff' | 'cruise' | 'landing';
  altitude?: number;
  lastDecisionBlock?: { x: number; y: number };
  route?: { x: number; y: number }[];
}

export interface Pedestrian {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  type: PedestrianRole;
  profession: Profession;
  gang: GangId;
  health: number;
  state: 'walking' | 'working' | 'socializing' | 'responding' | 'fleeing' | 'attacking' | 'dead';
  weaponCooldown: number;
  targetId?: number;
  homeBuildingId?: number;
  workBuildingId?: number;
  targetX?: number;
  targetY?: number;
  socialMeter: number;
  mood: number;
  decisionTick: number;
  path?: { x: number; y: number }[];
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  owner: 'player' | 'police' | 'gang';
  life: number;
}

export interface Explosion { id: number; x: number; y: number; radius: number; maxRadius: number; life: number; maxLife: number; }
export interface Pickup { id: number; x: number; y: number; type: 'money' | 'health' | 'ammo' | 'weapon'; amount: number; life: number; }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }
export interface Mission { id: string; title: string; description: string; target: number; progress: number; reward: number; active: boolean; completed: boolean; type: 'kill' | 'collect' | 'social'; }
export interface RoadNode { x: number; y: number; neighbors: { x: number; y: number; cost: number }[]; }
export interface Message { id: number; text: string; color: string; life: number; y: number; x: number; }

