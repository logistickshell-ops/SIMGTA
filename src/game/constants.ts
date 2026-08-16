import type { BuildingDef, GangId, TileType } from './types';

export const TILE_SIZE = 16;
export const MAP_WIDTH = 160;
export const MAP_HEIGHT = 120;
export const DAY_LENGTH_MS = 60_000;

export const COLORS = {
  grass: '#284936', grassAlt: '#31563e', road: '#202936', roadLine: '#eab85b', sidewalk: '#3d4754', water: '#173d58', river: '#1f5e78', bridge: '#b8874b', tramrail: '#b6c5c8', rail: '#8e9aa4',
  residential: '#6a9e75', commercial: '#398daf', industrial: '#b4794f', park: '#4ea36b',
  police: '#4f8cc9', hospital: '#d7e7ee', fire: '#dc5d4f', school: '#d4ad55', power: '#8a919b',
  stadium: '#60a97a', casino: '#df6471', bank: '#c7a465', bus: '#d7ac4c', tram: '#d26362', train: '#6b96b5', airport: '#3e6c86', gunshop: '#a26e9b',
  player: '#f4cf68', bullet: '#f8df9a',
};

export const GANGS: Record<Exclude<GangId, 'none'>, { name: string; color: string; vehicle: string; attitude: string }> = {
  loons: { name: 'Розовые Фантомы', color: '#ec6d9c', vehicle: '#d85685', attitude: 'хаос' },
  yutes: { name: 'Синие Ястребы', color: '#4a9ee7', vehicle: '#3674bf', attitude: 'контроль районов' },
  russians: { name: 'Зелёный Синдикат', color: '#69bd6e', vehicle: '#478e56', attitude: 'деньги' },
  ashdogs: { name: 'Пепельные Псы', color: '#d6a55b', vehicle: '#9f7445', attitude: 'давление' },
};

export const GANG_COLORS: Record<GangId, string> = { loons: GANGS.loons.color, yutes: GANGS.yutes.color, russians: GANGS.russians.color, ashdogs: GANGS.ashdogs.color, none: '#83909b' };
export const GANG_NAMES: Record<GangId, string> = { loons: GANGS.loons.name, yutes: GANGS.yutes.name, russians: GANGS.russians.name, ashdogs: GANGS.ashdogs.name, none: 'Нейтральный район' };

export const BUILDINGS: Record<TileType, BuildingDef> = {
  grass: { type: 'grass', name: 'Свободный участок', icon: '◇', cost: 0, upkeep: 0, income: 0, population: 0, workSlots: 0, socialValue: 0, desc: 'Свободная земля', color: COLORS.grass, size: 1, category: 'zone' },
  road: { type: 'road', name: 'Магистраль', icon: '╋', cost: 80, upkeep: 2, income: 0, population: 0, workSlots: 0, socialValue: 0, desc: 'Двухполосная городская дорога', color: COLORS.road, size: 2, category: 'zone' },
  water: { type: 'water', name: 'Вода', icon: '≈', cost: 0, upkeep: 0, income: 0, population: 0, workSlots: 0, socialValue: 0, desc: 'Непроходимая зона', color: COLORS.water, size: 1, category: 'zone' },
  river: { type: 'river', name: 'Река', icon: '≋', cost: 40, upkeep: 0, income: 0, population: 0, workSlots: 0, socialValue: 2, desc: 'Водный коридор, который требует мостов для пересечения', color: COLORS.river, size: 1, category: 'zone' },
  bridge: { type: 'bridge', name: 'Мост', icon: '▤', cost: 260, upkeep: 5, income: 0, population: 0, workSlots: 0, socialValue: 3, desc: 'Пересекает реку и соединяет дорожный граф', color: COLORS.bridge, size: 2, category: 'transport' },
  tramrail: { type: 'tramrail', name: 'Трамвайные рельсы', icon: '═', cost: 95, upkeep: 3, income: 0, population: 0, workSlots: 0, socialValue: 1, desc: 'Полотно для городского трамвая', color: COLORS.tramrail, size: 1, category: 'transport' },
  rail: { type: 'rail', name: 'Железная дорога', icon: '▥', cost: 125, upkeep: 4, income: 0, population: 0, workSlots: 0, socialValue: 1, desc: 'Магистраль для поездов', color: COLORS.rail, size: 1, category: 'transport' },
  residential: { type: 'residential', name: 'Жилой квартал', icon: '⌂', cost: 100, upkeep: 2, income: 30, population: 100, workSlots: 0, socialValue: 1, desc: 'Дом, связи и городской спрос', color: COLORS.residential, size: 1, category: 'zone' },
  commercial: { type: 'commercial', name: 'Торговый блок', icon: '▣', cost: 120, upkeep: 3, income: 50, population: 0, workSlots: 6, socialValue: 2, desc: 'Работа, покупки и социальные встречи', color: COLORS.commercial, size: 1, category: 'zone' },
  industrial: { type: 'industrial', name: 'Промышленный блок', icon: '▥', cost: 150, upkeep: 4, income: 80, population: 0, workSlots: 10, socialValue: -1, desc: 'Работа и стабильный доход', color: COLORS.industrial, size: 1, category: 'zone' },
  park: { type: 'park', name: 'Парк', icon: '✦', cost: 80, upkeep: 2, income: 0, population: 0, workSlots: 1, socialValue: 8, desc: 'Точка встреч и роста доверия', color: COLORS.park, size: 1, category: 'service' },
  policestation: { type: 'policestation', name: 'Участок', icon: '◈', cost: 800, upkeep: 30, income: 0, population: 0, workSlots: 4, socialValue: 2, desc: 'Патрули, безопасность и реакция', color: COLORS.police, size: 2, category: 'service' },
  hospital: { type: 'hospital', name: 'Клиника', icon: '✚', cost: 700, upkeep: 25, income: 0, population: 0, workSlots: 4, socialValue: 3, desc: 'Медики и восстановление жителей', color: COLORS.hospital, size: 2, category: 'service' },
  firestation: { type: 'firestation', name: 'Пожарная служба', icon: '△', cost: 600, upkeep: 20, income: 0, population: 0, workSlots: 4, socialValue: 2, desc: 'Пожары под контролем', color: COLORS.fire, size: 2, category: 'service' },
  school: { type: 'school', name: 'Школа', icon: '▤', cost: 500, upkeep: 15, income: 0, population: 0, workSlots: 5, socialValue: 4, desc: 'Учителя развивают доверие районов', color: COLORS.school, size: 2, category: 'service' },
  stadium: { type: 'stadium', name: 'Стадион', icon: '◉', cost: 2000, upkeep: 50, income: 100, population: 0, workSlots: 12, socialValue: 10, desc: 'Крупные события и притяжение жителей', color: COLORS.stadium, size: 2, category: 'special' },
  casino: { type: 'casino', name: 'Казино', icon: '◆', cost: 1500, upkeep: 40, income: 200, population: 0, workSlots: 10, socialValue: 2, desc: 'Доходно, но привлекает банды', color: COLORS.casino, size: 2, category: 'special' },
  bank: { type: 'bank', name: 'Городской банк', icon: '▰', cost: 1200, upkeep: 30, income: 150, population: 0, workSlots: 8, socialValue: 1, desc: 'Финансовый узел города', color: COLORS.bank, size: 2, category: 'special' },
  powerplant: { type: 'powerplant', name: 'Энергостанция', icon: 'ϟ', cost: 900, upkeep: 25, income: 0, population: 0, workSlots: 8, socialValue: 0, desc: 'Поддерживает инфраструктуру', color: COLORS.power, size: 2, category: 'service' },
  busdepot: { type: 'busdepot', name: 'Автопарк', icon: '▱', cost: 650, upkeep: 18, income: 45, population: 0, workSlots: 5, socialValue: 1, desc: 'Запускает автобусы', color: COLORS.bus, size: 2, category: 'transport' },
  tramdepot: { type: 'tramdepot', name: 'Трамвайное депо', icon: '═', cost: 950, upkeep: 28, income: 75, population: 0, workSlots: 6, socialValue: 1, desc: 'Запускает трамваи', color: COLORS.tram, size: 2, category: 'transport' },
  trainstation: { type: 'trainstation', name: 'Вокзал', icon: '╤', cost: 1400, upkeep: 40, income: 120, population: 0, workSlots: 8, socialValue: 2, desc: 'Поезда и городская связанность', color: COLORS.train, size: 2, category: 'transport' },
  airport: { type: 'airport', name: 'Аэропорт', icon: '⌁', cost: 2600, upkeep: 85, income: 260, population: 0, workSlots: 16, socialValue: 3, desc: 'Связывает город с внешним потоком', color: COLORS.airport, size: 2, category: 'transport' },
  gunshop: { type: 'gunshop', name: 'Оружейная', icon: '✳', cost: 1100, upkeep: 25, income: 180, population: 0, workSlots: 4, socialValue: -1, desc: 'Боезапас и риск в одном квартале', color: COLORS.gunshop, size: 2, category: 'special' },
};

export const BUILDING_CATEGORIES = [
  { id: 'zone', label: 'Районы', icon: '▦' },
  { id: 'service', label: 'Службы', icon: '✣' },
  { id: 'transport', label: 'Транспорт', icon: '↠' },
  { id: 'special', label: 'Узлы', icon: '◇' },
] as const;

export const MISSION_TEMPLATES = [
  { id: 'm1', title: 'Безопасный поток', description: 'Нейтрализуйте 5 бандитов', target: 5, reward: 500, type: 'kill' as const },
  { id: 'm2', title: 'Бюджет района', description: 'Соберите $1 000 чистого дохода', target: 1000, reward: 300, type: 'collect' as const },
  { id: 'm3', title: 'Городские связи', description: 'Доведите общность до 65%', target: 65, reward: 650, type: 'social' as const },
];
