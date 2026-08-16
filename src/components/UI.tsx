import { useState } from 'react';
import { Game, Tool } from '../game/Game';
import { BUILDINGS, GANG_COLORS, GANG_NAMES } from '../game/constants';

interface UIProps {
  game: Game;
  onToolChange: (tool: Tool) => void;
  onModeChange: (mode: 'strategy' | 'action') => void;
  onSimulationSpeed: (speed: 0 | 1 | 2 | 5) => void;
  onToggleAutopilot: () => void;
}

type BuildCategory = 'tools' | 'zones' | 'services' | 'transport' | 'special';

const BUILD_CATEGORIES: { id: BuildCategory; label: string; short: string; icon: string; tools: Tool[] }[] = [
  { id: 'tools', label: 'Инструменты', short: 'ИНСТР.', icon: '⚙', tools: ['select', 'inspect', 'bulldoze'] },
  { id: 'zones', label: 'Зоны', short: 'ЗОНЫ', icon: '▦', tools: ['residential', 'commercial', 'industrial', 'road', 'park'] },
  { id: 'services', label: 'Сервисы', short: 'СЕРВИС', icon: '✚', tools: ['policestation', 'hospital', 'firestation', 'school', 'powerplant'] },
  { id: 'transport', label: 'Транспорт', short: 'ТРАНСП.', icon: '↔', tools: ['busdepot', 'tramdepot', 'trainstation', 'airport'] },
  { id: 'special', label: 'Особое', short: 'ОСОБОЕ', icon: '◆', tools: ['stadium', 'casino', 'bank', 'gunshop'] },
];

const TOOL_META: Record<Tool, { icon: string; label: string }> = {
  select: { icon: '◉', label: 'Выбор' }, bulldoze: { icon: '▨', label: 'Снос' }, inspect: { icon: 'i', label: 'Инфо' },
  residential: { icon: '⌂', label: 'Жильё' }, commercial: { icon: '▣', label: 'Торговля' }, industrial: { icon: '▥', label: 'Заводы' }, road: { icon: '═', label: 'Дорога' }, park: { icon: '♣', label: 'Парк' },
  policestation: { icon: '★', label: 'Полиция' }, hospital: { icon: '+', label: 'Больница' }, firestation: { icon: '▲', label: 'Пожарные' }, school: { icon: 'A', label: 'Школа' }, powerplant: { icon: 'ϟ', label: 'Энергия' },
  busdepot: { icon: '▰', label: 'Автобус' }, tramdepot: { icon: '≋', label: 'Трамвай' }, trainstation: { icon: '▰', label: 'Поезд' }, airport: { icon: '✈', label: 'Аэропорт' },
  stadium: { icon: '◌', label: 'Стадион' }, casino: { icon: '◇', label: 'Казино' }, bank: { icon: '$', label: 'Банк' }, gunshop: { icon: '›', label: 'Оружие' },
};

function SpeedControl({ game, onSimulationSpeed }: Pick<UIProps, 'game' | 'onSimulationSpeed'>) {
  const options: { speed: 0 | 1 | 2 | 5; label: string; title: string }[] = [
    { speed: 0, label: 'Ⅱ', title: 'Пауза' },
    { speed: 1, label: '▶', title: 'Обычная скорость' },
    { speed: 2, label: '×2', title: 'Двойная скорость' },
    { speed: 5, label: '×5', title: 'Пятикратная скорость' },
  ];
  return (
    <div className="panel-pixel p-1 pointer-events-auto flex items-center gap-1" data-ui-element="true" aria-label="Управление временем">
      {options.map(option => (
        <button
          key={option.speed}
          className={`btn-pixel h-8 min-w-8 px-1 text-[10px] sm:text-xs ${game.simulationSpeed === option.speed ? 'active' : ''}`}
          onClick={() => onSimulationSpeed(option.speed)}
          title={option.title}
          aria-label={option.title}
        >
          {option.label}
        </button>
      ))}
      <span className="hidden md:inline px-1 text-[9px] pixel-font neon-cyan">{game.simulationSpeed === 0 ? 'ПАУЗА' : `СКОР. ×${game.simulationSpeed}`}</span>
    </div>
  );
}

function NavigationStatus({ game }: { game: Game }) {
  const inVehicle = game.playerInVehicleId !== null;
  const target = game.autopilotTarget;
  return (
    <div className="panel-pixel px-2 py-1.5 text-[9px] pixel-font pointer-events-auto min-w-[190px] max-w-[min(92vw,280px)]" aria-label="Навигация игрока">
      <div className="flex items-center justify-between gap-3">
        <span className="neon-yellow">НАВИГАЦИЯ</span>
        <span className={game.mode === 'action' ? 'neon-pink' : 'neon-cyan'}>{game.mode === 'action' ? 'БОЙ' : 'СТРОЙ'}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 opacity-85">
        <span>{inVehicle ? 'МАШИНА' : 'ПЕШКОМ'}</span>
        <span className={game.autopilotEnabled ? 'neon-green' : 'opacity-60'}>{game.autopilotEnabled ? 'АВТО ON' : 'РУЧНОЙ'}</span>
      </div>
      <div className="mt-1 truncate opacity-70">ЦЕЛЬ: {game.autopilotEnabled ? (target?.label ?? 'ПОИСК...') : '—'}</div>
    </div>
  );
}

function ToolCard({ tool, game, onToolChange }: { tool: Tool; game: Game; onToolChange: (tool: Tool) => void }) {
  const building = BUILDINGS[tool as keyof typeof BUILDINGS];
  const meta = TOOL_META[tool];
  const active = game.tool === tool;
  const accent = building?.color ?? '#00f0ff';
  return (
    <button
      className={`btn-pixel relative h-[54px] px-1 py-1 text-center flex flex-col justify-center items-center overflow-hidden ${active ? 'active' : ''}`}
      onClick={() => onToolChange(tool)}
      title={building ? `${building.name} — $${building.cost}` : meta.label}
      aria-label={building ? `${building.name}, цена ${building.cost}` : meta.label}
    >
      <span className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: accent }} />
      <span className="text-base leading-none" style={{ color: accent }}>{meta.icon}</span>
      <span className="mt-1 w-full truncate text-[8px] leading-none">{meta.label}</span>
      {building && building.cost > 0 && <span className="mt-0.5 text-[8px] leading-none text-green-300">${building.cost}</span>}
    </button>
  );
}

export function UI({ game, onToolChange, onModeChange, onSimulationSpeed, onToggleAutopilot }: UIProps) {
  const [buildCollapsed, setBuildCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState<BuildCategory>('zones');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const s = game.stats;
  const dayNames = ['Пон', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const time = `${s.hour.toString().padStart(2, '0')}:${s.minute.toString().padStart(2, '0')}`;
  const selectedBuilding = BUILDINGS[game.tool as keyof typeof BUILDINGS];
  const selectedCategory = BUILD_CATEGORIES.find(category => category.id === activeCategory)!;
  const hovered = game.hoveredTile;
  const hoveredTile = hovered.y >= 0 && hovered.y < game.tiles.length && hovered.x >= 0 && hovered.x < game.tiles[0]?.length ? game.tiles[hovered.y][hovered.x] : undefined;

  return (
    <>
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="flex items-start justify-between p-2 gap-2 flex-wrap">
          <div className="panel-pixel px-2 py-1 sm:px-3 sm:py-2 pointer-events-auto" data-ui-element="true">
            <div className="flex items-center gap-2 sm:gap-3 pixel-font text-[10px] sm:text-sm">
              <div>
                <div className="neon-green text-sm sm:text-lg">${s.money.toLocaleString()}</div>
                <div className="text-[9px] opacity-70">КАЗНА</div>
              </div>
              <div className="border-l border-cyan-400/40 pl-2">
                <div className="neon-cyan">{time}</div>
                <div className="text-[9px] opacity-70">{dayNames[(s.day - 1) % 7]}, д. {s.day}</div>
              </div>
              <div className="hidden min-[520px]:block border-l border-cyan-400/40 pl-2">
                <div className="neon-yellow">{s.population.toLocaleString()}</div>
                <div className="text-[9px] opacity-70">ЖИТЕЛИ</div>
              </div>
            </div>
          </div>

          <div className="flex gap-1 pointer-events-auto" data-ui-element="true">
            <SpeedControl game={game} onSimulationSpeed={onSimulationSpeed} />
            <div className="panel-pixel p-1 flex items-center gap-1">
              <button className={`btn-pixel h-8 px-2 text-[10px] ${game.autopilotEnabled ? 'active' : ''}`} onClick={onToggleAutopilot} title="Автопилот [O]" aria-label="Включить или выключить автопилот" aria-pressed={game.autopilotEnabled}>
                ◌ <span className="hidden sm:inline">АВТО</span>
              </button>
              <button className={`btn-pixel h-8 px-2 text-[10px] ${game.mode === 'strategy' ? 'active' : ''}`} onClick={() => onModeChange('strategy')} aria-pressed={game.mode === 'strategy'}>СТРОЙ</button>
              <button className={`btn-pixel h-8 px-2 text-[10px] ${game.mode === 'action' ? 'active' : ''}`} onClick={() => onModeChange('action')} aria-pressed={game.mode === 'action'}>БОЙ</button>
              {game.mode === 'strategy' && <button className="btn-pixel h-8 px-2 text-[10px]" onClick={() => setSettingsOpen(value => !value)} aria-label="Настройки экономики">⚙</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute left-2 top-[52px] z-20 pointer-events-none flex gap-2 text-[9px] pixel-font">
        <div className="panel-pixel px-2 py-1">ОДОБР. <span className="neon-green">{Math.floor(s.approval)}%</span></div>
        <div className="panel-pixel px-2 py-1">КРИМ. <span className="neon-pink">{Math.floor(s.crime)}%</span></div>
        <div className="panel-pixel px-2 py-1 hidden sm:block">РАБОТА <span className="neon-cyan">{s.employment}%</span></div>
        <div className="panel-pixel px-2 py-1 hidden md:block">СОЦ. <span className="neon-yellow">{s.socialMood}%</span></div>
      </div>

      {game.autopilotEnabled && (
        <div className="absolute top-[76px] left-1/2 -translate-x-1/2 z-20 panel-pixel px-3 py-1 pointer-events-none text-[10px] pixel-font neon-cyan">
          АВТОПИЛОТ: {game.autopilotTarget?.label ?? 'ПОИСК МАРШРУТА'}
        </div>
      )}

      <div className="absolute top-[112px] left-1/2 -translate-x-1/2 z-10 hidden sm:block">
        <NavigationStatus game={game} />
      </div>

      {game.mode === 'strategy' && (
        <section className="absolute left-2 top-[84px] sm:left-3 sm:top-24 z-10 panel-pixel p-2 pointer-events-auto w-[calc(100vw-1rem)] max-w-[272px] max-h-[calc(100vh-7rem)] overflow-y-auto shadow-xl" data-ui-element="true">
          <header className="flex items-center justify-between gap-2">
            <div className="pixel-font neon-cyan text-xs">СТРОИТЕЛЬСТВО</div>
            <button className="btn-pixel h-6 px-2 text-[10px]" onClick={() => setBuildCollapsed(value => !value)} aria-label="Свернуть или развернуть панель">
              {buildCollapsed ? 'РАЗВ.' : 'СВЕРН.'}
            </button>
          </header>
          {!buildCollapsed && (
            <>
              <nav className="mt-2 grid grid-cols-5 gap-1" aria-label="Категории строительства">
                {BUILD_CATEGORIES.map(category => (
                  <button
                    key={category.id}
                    className={`btn-pixel h-10 px-0.5 text-[8px] flex flex-col items-center justify-center ${activeCategory === category.id ? 'active' : ''}`}
                    onClick={() => setActiveCategory(category.id)}
                    title={category.label}
                    aria-label={category.label}
                    aria-pressed={activeCategory === category.id}
                  >
                    <span className="text-sm leading-none">{category.icon}</span><span className="mt-1 leading-none">{category.short}</span>
                  </button>
                ))}
              </nav>
              <div className="mt-2 flex items-center justify-between border-b border-cyan-400/25 pb-1">
                <span className="pixel-font text-[10px] neon-yellow">{selectedCategory.label.toUpperCase()}</span>
                <span className="text-[8px] opacity-65">{selectedCategory.tools.length} поз.</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {selectedCategory.tools.map(tool => <ToolCard key={tool} tool={tool} game={game} onToolChange={onToolChange} />)}
              </div>
              {selectedBuilding && game.tool !== 'select' && game.tool !== 'inspect' && game.tool !== 'bulldoze' && (
                <div className="mt-2 border border-cyan-400/30 bg-black/40 px-2 py-1.5 text-[9px]">
                  <div className="flex justify-between gap-2"><span className="pixel-font neon-yellow truncate">{selectedBuilding.name}</span><span className="neon-green shrink-0">${selectedBuilding.cost}</span></div>
                  <div className="mt-1 opacity-70 leading-tight">{selectedBuilding.desc}</div>
                  <div className="mt-1 flex gap-2 opacity-80">
                    {selectedBuilding.upkeep > 0 && <span>−${selectedBuilding.upkeep}/ч</span>}
                    {selectedBuilding.income > 0 && <span className="text-green-300">+${selectedBuilding.income}/ч</span>}
                    {selectedBuilding.size > 1 && <span className="neon-pink">2×2</span>}
                  </div>
                </div>
              )}
              {hoveredTile && (
                <div className="mt-2 flex items-center justify-between text-[9px] opacity-80">
                  <span>[{hovered.x},{hovered.y}] · {hoveredTile.type}</span>
                  {hoveredTile.gang !== 'none' && <span style={{ color: GANG_COLORS[hoveredTile.gang] }}>{GANG_NAMES[hoveredTile.gang]}</span>}
                  {hoveredTile.hasFire && <span className="neon-orange">ПОЖАР</span>}
                </div>
              )}
            </>
          )}
        </section>
      )}

      <aside className="absolute right-2 top-[76px] sm:right-3 sm:top-24 z-10 panel-pixel p-2 pointer-events-auto hidden md:block w-[214px] max-h-[58vh] overflow-y-auto shadow-xl" data-ui-element="true">
        <div className="pixel-font neon-yellow text-xs text-center mb-2">МИССИИ</div>
        <div className="space-y-1">
          {game.missions.map(mission => (
            <div key={mission.id} className={`border px-1.5 py-1 text-[9px] ${mission.completed ? 'border-green-400 bg-green-900/30' : 'border-white/20'}`}>
              <div className={mission.completed ? 'neon-green' : 'neon-cyan'}>{mission.completed ? '✓ ' : '› '}{mission.title}</div>
              <div className="mt-1 flex items-center gap-1"><div className="h-1 flex-1 bg-black"><div className="h-full bg-yellow-400" style={{ width: `${Math.min(100, mission.progress / mission.target * 100)}%` }} /></div><span>{mission.progress}/{mission.target}</span></div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-cyan-400/25 pt-2 text-[9px] space-y-1">
          <div className="pixel-font neon-pink">ГОРОД</div>
          <div className="flex justify-between"><span>Занятость</span><span className="neon-cyan">{s.employment}%</span></div>
          <div className="flex justify-between"><span>Соц. настроение</span><span className="neon-yellow">{s.socialMood}%</span></div>
          <div className="grid grid-cols-2 gap-1 pt-1 text-[8px]">
            {(['loons', 'yutes', 'russians', 'vultures'] as const).map(gang => <span key={gang} style={{ color: GANG_COLORS[gang] }}>■ {GANG_NAMES[gang]}</span>)}
          </div>
        </div>
      </aside>

      {settingsOpen && <SettingsModal game={game} onClose={() => setSettingsOpen(false)} />}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 panel-pixel px-3 py-1.5 pointer-events-none hidden sm:block" data-ui-element="true">
        <div className="pixel-font text-[9px] flex gap-3 flex-wrap justify-center">
          {game.mode === 'strategy' ? <><span><span className="neon-cyan">WASD</span> камера</span><span><span className="neon-cyan">ЛКМ</span> строить</span><span><span className="neon-cyan">P</span> пауза</span><span><span className="neon-cyan">O</span> автопилот</span></> : <><span><span className="neon-cyan">WASD</span> идти/ехать</span><span><span className="neon-cyan">F</span> машина</span><span><span className="neon-cyan">O</span> автопилот</span></>}
        </div>
      </div>

      {game.gameOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 pointer-events-auto" data-ui-element="true">
          <div className="panel-pixel p-8 text-center max-w-[90vw]">
            <div className="pixel-font neon-pink text-3xl mb-4">ВЫ ПОГИБЛИ</div>
            <div className="pixel-font text-xs mb-2">Дней: {game.stats.day} · Убийств: {game.totalKills}</div>
            <button className="btn-pixel py-3 px-6 text-sm" onClick={() => game.restart()}>НАЧАТЬ ЗАНОВО [R]</button>
          </div>
        </div>
      )}
    </>
  );
}

function SettingsModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const [amount, setAmount] = useState(500);
  const slider = (label: string, value: number, setValue: (value: number) => void) => (
    <label className="block text-[10px] mt-2"><span className="flex justify-between opacity-80"><span>{label}</span><span className="neon-green">{value}%</span></span><input className="w-full accent-cyan-400" type="range" min="0" max="300" value={value} onChange={event => setValue(+event.target.value)} /></label>
  );
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 panel-pixel p-4 pointer-events-auto w-[320px] max-w-[90vw]" data-ui-element="true">
      <div className="flex justify-between items-center"><div className="pixel-font neon-cyan text-sm">ЭКОНОМИКА</div><button className="btn-pixel px-2 text-xs" onClick={onClose}>×</button></div>
      <div className="mt-3 text-[10px] border-t border-cyan-400/25 pt-2">
        <div className="pixel-font neon-yellow">НАЛОГИ</div>
        {slider('Жильё', game.taxRateResidential, value => game.taxRateResidential = value)}
        {slider('Торговля', game.taxRateCommercial, value => game.taxRateCommercial = value)}
        {slider('Заводы', game.taxRateIndustrial, value => game.taxRateIndustrial = value)}
      </div>
      <div className="mt-3 text-[10px] border-t border-cyan-400/25 pt-2">
        <div className="pixel-font neon-yellow">БАНК</div>
        <div className="flex justify-between mt-1"><span>Казна</span><span className="neon-green">${game.stats.money.toLocaleString()}</span></div>
        <div className="flex justify-between"><span>Депозит</span><span className="neon-cyan">${game.deposit.toLocaleString()}</span></div>
        <div className="flex justify-between"><span>Долг</span><span className="neon-orange">${game.loanAmount.toLocaleString()}</span></div>
        <div className="flex gap-2 mt-2"><input type="number" min="1" value={amount} onChange={event => setAmount(Math.max(1, +event.target.value))} className="bg-black border border-cyan-400/50 px-2 py-1 w-24 text-center" /><button className="btn-pixel flex-1 text-[9px]" onClick={() => game.depositToBank(amount)}>ВКЛАД</button><button className="btn-pixel flex-1 text-[9px]" onClick={() => game.takeLoan(amount)}>КРЕДИТ</button></div>
        <div className="grid grid-cols-2 gap-2 mt-2"><button className="btn-pixel text-[9px] py-1" onClick={() => game.withdrawFromBank(amount)}>СНЯТЬ</button><button className="btn-pixel text-[9px] py-1" onClick={() => game.repayLoan(amount)}>ПОГАСИТЬ</button></div>
      </div>
    </div>
  );
}
