export type TileType =
  | 'grass' | 'road' | 'water'
  | 'residential' | 'commercial' | 'industrial'
  | 'park' | 'policestation' | 'hospital' | 'firestation' | 'school'
  | 'stadium' | 'casino' | 'bank' | 'powerplant'
  | 'busdepot' | 'tramdepot' | 'trainstation' | 'airport' | 'gunshop';

export type GangId = 'loons' | 'yutes' | 'russians' | 'none';

export interface Tile { type: TileType; level: number; population: number; hasFire: boolean; hasCrime: boolean; gang: GangId; variant: number; }
export interface BuildingDef { type: TileType; name: string; cost: number; upkeep: number; income: number; population: number; desc: string; color: string; size: 1 | 2; category: 'zone' | 'service' | 'special'; }
export interface GameStats { money: number; population: number; day: number; hour: number; minute: number; approval: number; crime: number; income: number; expenses: number; }
export interface Player { x: number; y: number; vx: number; vy: number; angle: number; speed: number; health: number; maxHealth: number; inVehicle: boolean; wanted: number; ammo: number; maxAmmo: number; kills: number; money: number; }
export interface Vehicle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  health: number;
  type: 'car' | 'sport' | 'tank' | 'police' | 'gang' | 'taxi' | 'bus' | 'tram' | 'train' | 'airplane';
  gang: GangId;
  driver: 'player' | 'civilian' | 'police' | 'gang' | 'transit' | null;
  passengers: number;
  targetX?: number;
  targetY?: number;
  phase?: 'taxiing' | 'takeoff' | 'cruise' | 'landing';
  altitude?: number;
  lastDecisionBlock?: { x: number; y: number };
}
export interface Pedestrian { id: number; x: number; y: number; vx: number; vy: number; angle: number; speed: number; type: 'civilian' | 'police' | 'gang1' | 'gang2' | 'gang3' | 'firefighter' | 'medic'; gang: GangId; health: number; state: 'walking' | 'fleeing' | 'attacking' | 'dead'; weaponCooldown: number; targetId?: number; }
export interface Bullet { id: number; x: number; y: number; vx: number; vy: number; damage: number; owner: 'player' | 'police' | 'gang1' | 'gang2' | 'gang3' | 'civilian'; life: number; }
export interface Explosion { id: number; x: number; y: number; radius: number; maxRadius: number; life: number; maxLife: number; }
export interface Pickup { id: number; x: number; y: number; type: 'money' | 'health' | 'ammo' | 'weapon'; amount: number; life: number; }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }
export interface Mission { id: string; title: string; description: string; target: number; progress: number; reward: number; active: boolean; completed: boolean; type: 'kill' | 'collect' | 'destroy' | 'rescue'; }
export interface Message { id: number; text: string; color: string; life: number; y: number; x: number; }
