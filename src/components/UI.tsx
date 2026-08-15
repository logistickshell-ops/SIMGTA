import { Game, Tool } from '../game/Game';
import { BUILDINGS, GANG_NAMES, GANG_COLORS } from '../game/constants';
import { useEffect, useState } from 'react';

interface UIProps {
  game: Game;
  onToolChange: (tool: Tool) => void;
  onModeChange: (mode: 'strategy' | 'action') => void;
}

function getBuildingDef(t: Tool) {
  // Safe lookup; non-building tools return undefined.
  return (BUILDINGS as any)[t];
}

export function UI({ game, onToolChange, onModeChange }: UIProps) {
  const [, setTick] = useState(0);
  const [buildCollapsed, setBuildCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(interval);
  }, []);

  const s = game.stats;
  const time = `${s.hour.toString().padStart(2, '0')}:${s.minute.toString().padStart(2, '0')}`;
  const dayNames = ['Пон', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const dayName = dayNames[(s.day - 1) % 7];

  // tool groups
  const zones: Tool[] = ['residential', 'commercial', 'industrial', 'road', 'park'];
  const services: Tool[] = ['policestation', 'hospital', 'firestation', 'school', 'powerplant'];
  const transport: Tool[] = ['busdepot', 'tramdepot', 'trainstation', 'airport'];
  const special: Tool[] = ['stadium', 'casino', 'bank', 'gunshop'];

  const toolIcons: Record<Tool, string> = {
    select: '👆', bulldoze: '🚜', inspect: '🔍',
    residential: '🏠', commercial: '🏪', industrial: '🏭', road: '🛣️', park: '🌳',
    policestation: '👮', hospital: '🏥', firestation: '🚒', school: '🎓', powerplant: '⚡',
    busdepot: '🚌', tramdepot: '🚋', trainstation: '🚆', airport: '✈️',
    stadium: '🏟️', casino: '🎰', bank: '🏦', gunshop: '🔫',
  };

  const toolLabels: Record<Tool, string> = {
    select: 'Выбор', bulldoze: 'Снос', inspect: 'Справка',
    residential: 'Жилье', commercial: 'Торговля', industrial: 'Заводы', road: 'Дорога', park: 'Парк',
    policestation: 'Полиция', hospital: 'Больница', firestation: 'Пожарные', school: 'Школа', powerplant: 'Энергия',
    busdepot: 'Автобус', tramdepot: 'Трамвай', trainstation: 'Поезд', airport: 'Самолет',
    stadium: 'Стадион', casino: 'Казино', bank: 'Банк', gunshop: 'Оружие',
  };

  const currentBuilding = getBuildingDef(game.tool);

  // Класс для функциональных кнопок — строгая одинаковая высота
  const gridBtnClass = (t: Tool) =>
    `btn-pixel flex flex-col items-center justify-center h-12 w-full px-1 py-0.5 text-center ${
      game.tool === t ? 'active' : ''
    }`;

  return (
    <>
      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="flex items-start sm:items-center justify-between p-2 sm:p-3 gap-2 flex-wrap">
          {/* Money / date */}
          <div className="panel-pixel px-2 py-1 sm:px-4 sm:py-2 pointer-events-auto" data-ui-element="true">
            <div className="flex items-center gap-2 sm:gap-4 pixel-font text-[10px] sm:text-sm">
              <div>
                <div className="neon-green text-sm sm:text-lg">${s.money.toLocaleString()}</div>
                <div className="text-xs opacity-70">Казна</div>
              </div>
              <div className="border-l-2 border-cyan-400/40 pl-2 sm:pl-4">
                <div className="neon-cyan">{time}</div>
                <div className="text-[10px] sm:text-xs opacity-70">{dayName}, день {s.day}</div>
              </div>
              <div className="border-l-2 border-cyan-400/40 pl-2 sm:pl-4">
                <div className="neon-yellow">👥 {s.population.toLocaleString()}</div>
                <div className="text-[10px] sm:text-xs opacity-70">Население</div>
              </div>
            </div>
          </div>

          {/* Approval + Crime */}
          <div className="panel-pixel px-2 py-1 sm:px-4 sm:py-2 pointer-events-auto hidden min-[560px]:block" data-ui-element="true">
            <div className="pixel-font text-[10px] sm:text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs">Одобрение:</span>
                <div className="w-20 sm:w-32 h-3 bg-black border border-white">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${s.approval}%`,
                      background: s.approval > 60 ? '#39ff14' : s.approval > 30 ? '#ffea00' : '#ff4444',
                    }}
                  />
                </div>
                <span className="text-xs">{Math.floor(s.approval)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">Преступность:</span>
                <div className="w-20 sm:w-32 h-3 bg-black border border-white">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${s.crime}%`,
                      background: s.crime > 60 ? '#ff4444' : s.crime > 30 ? '#ff8c00' : '#00f0ff',
                    }}
                  />
                </div>
                <span className="text-xs">{Math.floor(s.crime)}%</span>
              </div>
            </div>
          </div>

          {/* Mode switch & Settings */}
          <div className="panel-pixel p-1 pointer-events-auto flex items-center gap-1" data-ui-element="true">
            {game.mode === 'strategy' && (
              <button
                className="btn-pixel text-[10px] sm:text-xs px-2 sm:px-3 h-9 sm:h-10 flex items-center"
                onClick={() => setSettingsOpen(v => !v)}
                aria-label="Открыть настройки и экономику"
                title="Экономика и настройки"
              >
                ⚙️ <span className="hidden md:inline ml-1">Настройки</span>
              </button>
            )}
            <button
              className={`btn-pixel text-[10px] sm:text-xs px-2 sm:px-3 h-9 sm:h-10 flex items-center ${game.mode === 'strategy' ? 'active' : ''}`}
              onClick={() => onModeChange('strategy')}
              aria-label="Перейти в режим строительства"
            >
              🏙️ СТРАТЕГИЯ
            </button>
            <button
              className={`btn-pixel text-[10px] sm:text-xs px-2 sm:px-3 h-9 sm:h-10 flex items-center ${game.mode === 'action' ? 'active' : ''}`}
              onClick={() => onModeChange('action')}
              aria-label="Перейти в боевой режим"
            >
              🔫 БОЙ<span className="hidden sm:inline ml-1">[Tab]</span>
            </button>
          </div>
        </div>
      </div>

      {/* Build panel — фиксированная высота кнопок, не скачет */}
      {game.mode === 'strategy' && (
        <div
          className="absolute left-2 right-2 top-[76px] sm:left-3 sm:right-auto sm:top-24 z-10 panel-pixel p-2 pointer-events-auto w-auto sm:w-[240px] transition-[max-height] duration-200 shadow-xl"
          style={{ maxHeight: buildCollapsed ? '38px' : '420px' }}
          data-ui-element="true"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="pixel-font neon-cyan text-xs sm:text-sm truncate">═══ СТРОИТЕЛЬСТВО ═══</div>
            <button
              className="btn-pixel px-2 py-0.5 text-xs shrink-0 h-6 flex items-center"
              onClick={() => setBuildCollapsed(value => !value)}
              aria-label={buildCollapsed ? 'Развернуть окно строительства' : 'Свернуть окно строительства'}
              title={buildCollapsed ? 'Развернуть' : 'Свернуть'}
            >
              {buildCollapsed ? '▼' : '▲'}
            </button>
          </div>

          {!buildCollapsed && (
            <div className="overflow-y-auto pr-1 mt-2" style={{ maxHeight: '360px' }}>
              <div className="text-[10px] pixel-font opacity-80 mb-1">⚙️ ИНСТРУМЕНТЫ</div>
              <div className="grid grid-cols-3 gap-1">
                {(['select', 'inspect', 'bulldoze'] as Tool[]).map(t => (
                  <button
                    key={t}
                    onClick={() => onToolChange(t)}
                    className={gridBtnClass(t)}
                    title={toolLabels[t]}
                    aria-label={toolLabels[t]}
                  >
                    <span className="text-base">{toolIcons[t]}</span>
                    <span className="text-[9px] block truncate w-full">{toolLabels[t]}</span>
                  </button>
                ))}
              </div>

              <div className="text-[10px] pixel-font opacity-80 mt-2 mb-1">🏗️ ЗОНЫ</div>
              <div className="grid grid-cols-3 gap-1">
                {zones.map(t => {
                  const b = getBuildingDef(t);
                  return (
                    <button
                      key={t}
                      onClick={() => onToolChange(t)}
                      className={gridBtnClass(t)}
                      title={`${b?.name} - $${b?.cost}`}
                      aria-label={`${toolLabels[t]}, цена ${b?.cost}`}
                    >
                      <span className="text-base">{toolIcons[t]}</span>
                      <span className="text-[9px] block truncate w-full">{toolLabels[t]}</span>
                    </button>
                  );
                })}
              </div>

              <div className="text-[10px] pixel-font opacity-80 mt-2 mb-1">🏛️ СЕРВИСЫ</div>
              <div className="grid grid-cols-3 gap-1">
                {services.map(t => {
                  const b = getBuildingDef(t);
                  return (
                    <button
                      key={t}
                      onClick={() => onToolChange(t)}
                      className={gridBtnClass(t)}
                      title={`${b?.name} - $${b?.cost}`}
                      aria-label={`${toolLabels[t]}, цена ${b?.cost}`}
                    >
                      <span className="text-base">{toolIcons[t]}</span>
                      <span className="text-[9px] block truncate w-full">{toolLabels[t]}</span>
                    </button>
                  );
                })}
              </div>

              <div className="text-[10px] pixel-font opacity-80 mt-2 mb-1">🚍 ТРАНСПОРТ</div>
              <div className="grid grid-cols-3 gap-1">
                {transport.map(t => {
                  const b = getBuildingDef(t);
                  return (
                    <button
                      key={t}
                      onClick={() => onToolChange(t)}
                      className={gridBtnClass(t)}
                      title={`${b?.name} - $${b?.cost}`}
                      aria-label={`${toolLabels[t]}, цена ${b?.cost}`}
                    >
                      <span className="text-base">{toolIcons[t]}</span>
                      <span className="text-[9px] block truncate w-full">{toolLabels[t]}</span>
                    </button>
                  );
                })}
              </div>

              <div className="text-[10px] pixel-font opacity-80 mt-2 mb-1">💎 ОСОБОЕ</div>
              <div className="grid grid-cols-3 gap-1">
                {special.map(t => {
                  const b = getBuildingDef(t);
                  return (
                    <button
                      key={t}
                      onClick={() => onToolChange(t)}
                      className={gridBtnClass(t)}
                      title={`${b?.name} - $${b?.cost}`}
                      aria-label={`${toolLabels[t]}, цена ${b?.cost}`}
                    >
                      <span className="text-base">{toolIcons[t]}</span>
                      <span className="text-[9px] block truncate w-full">{toolLabels[t]}</span>
                    </button>
                  );
                })}
              </div>

              {/* Selected tool info */}
              {currentBuilding && game.tool !== 'select' && game.tool !== 'inspect' && game.tool !== 'bulldoze' && (
                <div className="mt-3 p-2 border border-cyan-400/40 bg-black/60 text-xs rounded">
                  <div className="pixel-font neon-yellow text-xs">{currentBuilding.name}</div>
                  <div className="opacity-80 text-[10px] mt-1">{currentBuilding.desc}</div>
                  <div className="mt-1 text-[10px] space-y-0.5">
                    <div>💰 Цена: <span className="neon-green">${currentBuilding.cost}</span></div>
                    {currentBuilding.upkeep > 0 && (
                      <div>📉 Содержание: <span className="neon-orange">${currentBuilding.upkeep}/ч</span></div>
                    )}
                    {currentBuilding.income > 0 && (
                      <div>📈 Баз. доход: <span className="neon-green">+${currentBuilding.income}/ч</span></div>
                    )}
                    {currentBuilding.population > 0 && (
                      <div>👥 +{currentBuilding.population} жителей</div>
                    )}
                    {currentBuilding.size > 1 && (
                      <div className="neon-pink text-[9px]">⚠️ Размер 2x2</div>
                    )}
                  </div>
                </div>
              )}

              {/* Hovered tile info */}
              {game.hoveredTile.x >= 0 && game.hoveredTile.x < 80 && game.hoveredTile.y >= 0 && game.hoveredTile.y < 60 && (
                <div className="mt-2 p-2 border border-white/20 bg-black/60 text-[10px] rounded">
                  <div className="pixel-font text-cyan-300">Клетка [{game.hoveredTile.x},{game.hoveredTile.y}]</div>
                  <div className="opacity-80 mt-0.5">
                    Тип: {game.tiles[game.hoveredTile.y][game.hoveredTile.x].type}
                    {game.tiles[game.hoveredTile.y][game.hoveredTile.x].level > 0 && ` (ур.${game.tiles[game.hoveredTile.y][game.hoveredTile.x].level})`}
                  </div>
                  {game.tiles[game.hoveredTile.y][game.hoveredTile.x].hasCrime && <div className="text-red-400">⚠️ Преступность</div>}
                  {game.tiles[game.hoveredTile.y][game.hoveredTile.x].hasFire && <div className="text-orange-400">🔥 Пожар</div>}
                  {game.tiles[game.hoveredTile.y][game.hoveredTile.x].gang !== 'none' && (
                    <div style={{ color: GANG_COLORS[game.tiles[game.hoveredTile.y][game.hoveredTile.x].gang] }}>
                      🏴 Контроль: {GANG_NAMES[game.tiles[game.hoveredTile.y][game.hoveredTile.x].gang]}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Missions and action status */}
      <div
        className="absolute right-2 sm:right-3 top-[76px] sm:top-24 z-10 panel-pixel p-3 pointer-events-auto max-w-[220px] sm:max-w-[240px] max-h-[45vh] overflow-y-auto hidden md:block shadow-xl"
        data-ui-element="true"
      >
        <div className="pixel-font neon-yellow text-xs sm:text-sm mb-2 text-center truncate">═══ МИССИИ ═══</div>
        <div className="space-y-1">
          {game.missions.map(m => (
            <div key={m.id} className={`text-xs p-1 border rounded ${m.completed ? 'border-green-400 bg-green-900/30' : 'border-white/20'}`}>
              <div className={`pixel-font text-[10px] sm:text-xs ${m.completed ? 'neon-green' : 'neon-cyan'}`}>
                {m.completed ? '✓ ' : '🎯 '}{m.title}
              </div>
              <div className="opacity-70 text-[9px] mt-0.5">{m.description}</div>
              <div className="flex justify-between items-center mt-1">
                <div className="w-full mr-2 h-1.5 bg-black border border-white/40 rounded overflow-hidden">
                  <div className="h-full bg-yellow-400" style={{ width: `${Math.min(100, (m.progress / m.target) * 100)}%` }} />
                </div>
                <span className="text-[9px] opacity-70 shrink-0">{m.progress}/{m.target}</span>
              </div>
            </div>
          ))}
        </div>

        {game.mode === 'action' && (
          <>
            <div className="pixel-font neon-pink text-xs sm:text-sm mt-3 mb-1 text-center truncate">═══ СТАТУС ═══</div>
            <div className="text-[11px] space-y-1">
              <div className="flex justify-between items-center gap-2">
                <span>❤️ Здоровье</span>
                <div className="w-20 h-2 bg-black border border-white/40 rounded overflow-hidden shrink-0">
                  <div className="h-full" style={{ width: `${game.player.health}%`, background: game.player.health > 50 ? '#39ff14' : '#ff4444' }} />
                </div>
              </div>
              <div className="flex justify-between">
                <span>🔫 Патроны</span>
                <span className="neon-yellow">{game.player.ammo}/{game.player.maxAmmo}</span>
              </div>
              <div className="flex justify-between">
                <span>⭐ Розыск</span>
                <span className="neon-orange">{'★'.repeat(game.player.wanted) || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>💀 Убийств</span>
                <span className="neon-pink">{game.totalKills}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Панель настроек / банк */}
      {settingsOpen && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 panel-pixel p-4 pointer-events-auto max-w-[90vw] shadow-2xl overflow-y-auto max-h-[90vh]"
          style={{ width: '320px' }}
          data-ui-element="true"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="pixel-font neon-cyan text-sm">⚙️ НАСТРОЙКИ И БАНК</div>
            <button className="btn-pixel px-2 py-0.5 text-xs" onClick={() => setSettingsOpen(false)}>✕</button>
          </div>

          {/* Налоговые ставки */}
          <div className="pixel-font text-xs neon-yellow mb-1 border-b border-white/20 pb-0.5">💰 НАЛОГОВЫЕ СТАВКИ</div>
          <div className="text-xs space-y-2 mb-3 mt-2">
            <div>
              <div className="flex justify-between opacity-80 text-[11px]"><span>🏠 Жилье</span><span className="neon-green">{game.taxRateResidential}%</span></div>
              <input type="range" min={0} max={300} value={game.taxRateResidential}
                onChange={(e) => game.taxRateResidential = +e.target.value}
                className="w-full accent-cyan-400" />
            </div>
            <div>
              <div className="flex justify-between opacity-80 text-[11px]"><span>🏪 Торговля</span><span className="neon-green">{game.taxRateCommercial}%</span></div>
              <input type="range" min={0} max={300} value={game.taxRateCommercial}
                onChange={(e) => game.taxRateCommercial = +e.target.value}
                className="w-full accent-cyan-400" />
            </div>
            <div>
              <div className="flex justify-between opacity-80 text-[11px]"><span>🏭 Заводы</span><span className="neon-green">{game.taxRateIndustrial}%</span></div>
              <input type="range" min={0} max={300} value={game.taxRateIndustrial}
                onChange={(e) => game.taxRateIndustrial = +e.target.value}
                className="w-full accent-cyan-400" />
            </div>
            <div className="text-[9px] opacity-60 leading-tight">Выше налоги — больше прибыль в час, но ниже одобрение граждан.</div>
          </div>

          {/* Банк */}
          <div className="pixel-font text-xs neon-yellow mb-1 border-b border-white/20 pb-0.5">🏦 БАНКОВСКИЙ СЧЕТ</div>
          <div className="text-xs space-y-1 mb-2 mt-2 font-mono">
            <div className="flex justify-between border-b border-white/10 pb-1"><span>💵 Доступная казна:</span><span className="neon-green">${game.stats.money.toLocaleString()}</span></div>
            <div className="flex justify-between border-b border-white/10 py-1"><span>🔒 Депозит в банке:</span><span className="neon-cyan">${game.deposit.toLocaleString()}</span></div>
            <div className="flex justify-between pt-1"><span>💳 Кредитный долг:</span><span className="neon-orange">${game.loanAmount.toLocaleString()}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3 text-[10px] bg-black/40 p-1.5 rounded">
            <div>
              <div className="opacity-80 text-[10px]">Вклад: <span className="neon-cyan">+{game.bankInterestRate}%</span>/ч</div>
              <input type="range" min={0} max={5} step={0.1} value={game.bankInterestRate}
                onChange={(e) => game.bankInterestRate = +e.target.value}
                className="w-full" />
            </div>
            <div>
              <div className="opacity-80 text-[10px]">Кредит: <span className="neon-orange">-{game.loanInterestRate}%</span>/ч</div>
              <input type="range" min={0.5} max={4} step={0.1} value={game.loanInterestRate}
                onChange={(e) => game.loanInterestRate = +e.target.value}
                className="w-full" />
            </div>
          </div>

          {/* Ввод суммы */}
          <BankControls game={game} />
        </div>
      )}

      {/* Desktop control hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 panel-pixel px-4 py-2 pointer-events-none hidden sm:block" data-ui-element="true">
        <div className="pixel-font text-xs flex gap-4 flex-wrap justify-center">
          {game.mode === 'strategy' ? (
            <>
              <span><span className="neon-cyan">WASD/Стрелки</span> - камера</span>
              <span><span className="neon-cyan">ЛКМ</span> - строить</span>
              <span><span className="neon-cyan">ПКМ</span> - инфо</span>
              <span><span className="neon-cyan">Tab</span> - боевой режим</span>
              <span><span className="neon-cyan">P</span> - пауза</span>
            </>
          ) : (
            <>
              <span><span className="neon-cyan">WASD</span> - идти/ехать</span>
              <span><span className="neon-cyan">Мышь</span> - прицел</span>
              <span><span className="neon-cyan">ЛКМ</span> - стрелять</span>
              <span><span className="neon-cyan">F</span> - машина</span>
              <span><span className="neon-cyan">Tab</span> - стратегия</span>
            </>
          )}
        </div>
      </div>

      {/* Game over */}
      {game.gameOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 pointer-events-auto" data-ui-element="true">
          <div className="panel-pixel p-8 text-center max-w-[90vw]">
            <div className="pixel-font neon-pink text-3xl sm:text-4xl mb-4 blink">💀 ВЫ ПОГИБЛИ 💀</div>
            <div className="pixel-font text-xs sm:text-sm mb-2">Дней прожито: {game.stats.day}</div>
            <div className="pixel-font text-xs sm:text-sm mb-2">Убийств: {game.totalKills}</div>
            <div className="pixel-font text-xs sm:text-sm mb-4">Заработано денег: ${game.totalEarned.toLocaleString()}</div>
            <button
              className="btn-pixel py-3 px-6 text-sm"
              onClick={() => game.restart()}
            >
              🔄 НАЧАТЬ ЗАНОВО [R]
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Компонент управления банковскими операциями */
function BankControls({ game }: { game: Game }) {
  const [amount, setAmount] = useState(100);
  const presets = [100, 500, 1000, 5000];

  return (
    <div className="text-xs space-y-2 border-t border-cyan-400/30 pt-2 font-mono">
      <div className="flex gap-2 items-center justify-between">
        <span className="opacity-80 shrink-0 text-xs">Операция на:</span>
        <input
          type="number"
          value={amount}
          min={1}
          onChange={(e) => setAmount(Math.max(1, +e.target.value))}
          className="bg-black border border-cyan-400/50 text-cyan-300 px-2 py-1 w-24 pixel-font text-xs text-center rounded shrink-0"
        />
      </div>
      <div className="grid grid-cols-4 gap-1">
        {presets.map(p => (
          <button key={p} className="btn-pixel px-1 py-1 text-[10px]" onClick={() => setAmount(p)}>${p}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        <button
          className="btn-pixel text-[10px] py-2 flex items-center justify-center gap-1"
          onClick={() => game.depositToBank(amount)}
          aria-label="Внести на депозит"
        >
          <span>🔒</span> Внести вклад
        </button>
        <button
          className="btn-pixel text-[10px] py-2 flex items-center justify-center gap-1"
          onClick={() => game.withdrawFromBank(amount)}
          aria-label="Снять с депозита"
        >
          <span>🔓</span> Снять вклад
        </button>
        <button
          className="btn-pixel text-[10px] py-2 flex items-center justify-center gap-1"
          onClick={() => game.takeLoan(amount)}
          aria-label="Взять кредит"
        >
          <span>💳</span> Взять кредит
        </button>
        <button
          className="btn-pixel text-[10px] py-2 flex items-center justify-center gap-1"
          onClick={() => game.repayLoan(amount)}
          aria-label="Погасить кредит"
        >
          <span>💵</span> Вернуть долг
        </button>
      </div>
    </div>
  );
}
