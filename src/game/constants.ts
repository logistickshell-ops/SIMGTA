import { BuildingDef, TileType } from './types';

export const TILE_SIZE = 16;
export const MAP_WIDTH = 160;
export const MAP_HEIGHT = 120;
export const DAY_LENGTH_MS = 60000;

export const COLORS = {
  grass: '#2d5a2d', grassAlt: '#346634', road: '#1a1a1a', roadLine: '#ffea00', sidewalk: '#3a3a3a', water: '#1e3a8a',
  residential1: '#7a9d4a', residential2: '#8db85a', residential3: '#a0c870',
  commercial1: '#3a78c8', commercial2: '#5090e0', commercial3: '#70b0ff',
  industrial1: '#a06030', industrial2: '#c08040', industrial3: '#d8a060',
  park: '#3a8a3a', police: '#3060c8', hospital: '#e0e8f0', fire: '#c83030', school: '#d8b060',
  stadium: '#60a060', casino: '#ff2d8a', bank: '#d8c060', power: '#888888',
  bus: '#ffcc00', tram: '#e63946', train: '#457b9d', airport: '#204050',
  gang1: '#ff2d8a', gang2: '#00f0ff', gang3: '#39ff14',
  player: '#ffea00', policeCar: '#3060c8', civilian: '#cccccc', blood: '#c82020', bullet: '#ffea00',
  explosion1: '#ff8c00', explosion2: '#ffea00', explosion3: '#c82020',
};

export const BUILDINGS: Record<TileType, BuildingDef> = {
  grass: { type: 'grass', name: 'Пустошь', cost: 0, upkeep: 0, income: 0, population: 0, desc: 'Свободная земля', color: COLORS.grass, size: 1, category: 'zone' },
  road: { type: 'road', name: 'Дорога (2x2)', cost: 80, upkeep: 2, income: 0, population: 0, desc: 'Двухполосная магистраль', color: COLORS.road, size: 2, category: 'zone' },
  water: { type: 'water', name: 'Вода', cost: 0, upkeep: 0, income: 0, population: 0, desc: 'Непроходимо', color: COLORS.water, size: 1, category: 'zone' },
  residential: { type: 'residential', name: 'Жилой квартал', cost: 100, upkeep: 2, income: 30, population: 50, desc: 'Где живут люди. Платят налоги.', color: COLORS.residential1, size: 1, category: 'zone' },
  commercial: { type: 'commercial', name: 'Магазины/Офисы', cost: 120, upkeep: 3, income: 50, population: 0, desc: 'Приносят налог с продаж', color: COLORS.commercial1, size: 1, category: 'zone' },
  industrial: { type: 'industrial', name: 'Заводы', cost: 150, upkeep: 4, income: 80, population: 0, desc: 'Много денег, но грязный воздух', color: COLORS.industrial1, size: 1, category: 'zone' },
  park: { type: 'park', name: 'Парк', cost: 80, upkeep: 2, income: 0, population: 0, desc: '+5 к одобрению соседям', color: COLORS.park, size: 1, category: 'service' },
  policestation: { type: 'policestation', name: 'Полицейский участок', cost: 800, upkeep: 30, income: 0, population: 0, desc: 'Снижает преступность, создает полицию', color: COLORS.police, size: 2, category: 'service' },
  hospital: { type: 'hospital', name: 'Больница', cost: 700, upkeep: 25, income: 0, population: 0, desc: 'Лечит жителей и мэра', color: COLORS.hospital, size: 2, category: 'service' },
  firestation: { type: 'firestation', name: 'Пожарная станция', cost: 600, upkeep: 20, income: 0, population: 0, desc: 'Тушит пожары', color: COLORS.fire, size: 2, category: 'service' },
  school: { type: 'school', name: 'Школа', cost: 500, upkeep: 15, income: 0, population: 0, desc: '+образование, +одобрение', color: COLORS.school, size: 2, category: 'service' },
  stadium: { type: 'stadium', name: 'Стадион', cost: 2000, upkeep: 50, income: 100, population: 0, desc: 'Мега-доход и одобрение', color: COLORS.stadium, size: 2, category: 'special' },
  casino: { type: 'casino', name: 'Казино', cost: 1500, upkeep: 40, income: 200, population: 0, desc: 'Много денег, но притягивает бандитов', color: COLORS.casino, size: 2, category: 'special' },
  bank: { type: 'bank', name: 'Банк', cost: 1200, upkeep: 30, income: 150, population: 0, desc: 'Хранит деньги, +экономика', color: COLORS.bank, size: 2, category: 'special' },
  powerplant: { type: 'powerplant', name: 'Электростанция', cost: 900, upkeep: 25, income: 0, population: 0, desc: 'Питает город', color: COLORS.power, size: 2, category: 'service' },
  busdepot: { type: 'busdepot', name: 'Автобусный парк', cost: 650, upkeep: 18, income: 45, population: 0, desc: 'Запускает автобусы. +мобильность, стабильный доход с пассажиров.', color: COLORS.bus, size: 2, category: 'service' },
  tramdepot: { type: 'tramdepot', name: 'Трамвайное депо', cost: 950, upkeep: 28, income: 75, population: 0, desc: 'Запускает трамваи по дорогам. Хорошо разгружает районы.', color: COLORS.tram, size: 2, category: 'service' },
  trainstation: { type: 'trainstation', name: 'Железнодорожный вокзал', cost: 1400, upkeep: 40, income: 120, population: 0, desc: 'Запускает поезда и усиливает торговлю города.', color: COLORS.train, size: 2, category: 'service' },
  airport: { type: 'airport', name: 'Аэропорт', cost: 2600, upkeep: 85, income: 260, population: 0, desc: 'Запускает самолеты. Дорого, но мощно качает экономику.', color: COLORS.airport, size: 2, category: 'special' },
  gunshop: { type: 'gunshop', name: 'Оружейный магазин', cost: 1100, upkeep: 25, income: 180, population: 0, desc: 'Продает оружие. В режиме боя пополняет боекомплект и выдает суперпушку!', color: '#ff2d8a', size: 2, category: 'special' },
};

export const GANG_NAMES: Record<string, string> = { loons: 'Психи (розовые)', yutes: 'Южные (голубые)', russians: 'Братва (зеленые)', none: 'Нейтралы' };
export const GANG_COLORS: Record<string, string> = { loons: COLORS.gang1, yutes: COLORS.gang2, russians: COLORS.gang3, none: '#888888' };
export const MISSION_TEMPLATES = [
  { id: 'm1', title: 'Зачистка района', description: 'Убейте 5 бандитов', target: 5, reward: 500, type: 'kill' as const },
  { id: 'm2', title: 'Налог на богатство', description: 'Соберите $1000 с налогов', target: 1000, reward: 300, type: 'collect' as const },
  { id: 'm3', title: 'Озеленение', description: 'Постройте 3 парка', target: 3, reward: 400, type: 'collect' as const },
  { id: 'm4', title: 'Народный мэр', description: 'Достигните одобрения 80%', target: 80, reward: 1000, type: 'collect' as const },
  { id: 'm5', title: 'Мегаполис', description: 'Достигните населения 5000', target: 5000, reward: 1500, type: 'collect' as const },
];
