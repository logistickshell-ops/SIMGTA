// Ночной картограф: UI — это приборные слои по периметру Canvas, а не декоративные панели поверх карты.
import { useMemo, useState } from 'react';
import { Download, FastForward, Navigation, Pause, Play, Radio, Save, Settings2, ShieldAlert, Trash2, TrendingUp, UsersRound, X, Zap } from 'lucide-react';
import type { Game, GameMode, Tool } from '@/game/Game';
import { BUILDING_CATEGORIES, BUILDINGS, GANGS, MAP_HEIGHT, MAP_WIDTH } from '@/game/constants';
import type { TileType } from '@/game/types';

interface Props { game: Game; onToolChange: (tool: Tool) => void; onModeChange: (mode: GameMode) => void; }
const buildableTypes = Object.keys(BUILDINGS).filter(type => !['grass', 'water'].includes(type)) as TileType[];

function Metric({ label, value, tone = 'teal' }: { label: string; value: string | number; tone?: 'teal' | 'amber' | 'neutral' | 'danger' }) {
  return <div className="metric"><span>{label}</span><strong className={`tone-${tone}`}>{value}</strong></div>;
}

export function GameUI({ game, onToolChange, onModeChange }: Props) {
  const [catalogOpen, setCatalogOpen] = useState(() => window.innerWidth > 680);
  const [category, setCategory] = useState<(typeof BUILDING_CATEGORIES)[number]['id']>('zone');
  const [financeOpen, setFinanceOpen] = useState(false);
  const [amount, setAmount] = useState(500);
  const [, setRevision] = useState(0);
  const refreshGameUi = () => setRevision(value => value + 1);
  const activeBuildings = useMemo(() => buildableTypes.filter(type => BUILDINGS[type].category === category), [category]);
  const selected = game.tool in BUILDINGS ? BUILDINGS[game.tool as TileType] : undefined;
  const time = `${String(game.stats.hour).padStart(2, '0')}:${String(game.stats.minute).padStart(2, '0')}`;
  const selectedTile = game.selectedTile.x >= 0 && game.selectedTile.x < MAP_WIDTH && game.selectedTile.y >= 0 && game.selectedTile.y < MAP_HEIGHT ? game.tiles[game.selectedTile.y][game.selectedTile.x] : null;
  const taxLabel = `${game.taxRateResidential}/${game.taxRateCommercial}/${game.taxRateIndustrial}`;

  return (
    <div className="game-ui" data-ui-element="true">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/manus-storage/urban-flux-mark_64e1df46.png" alt="Urban Flux" className="brand-mark" />
          <div><p className="eyebrow">CITY OPERATIONS</p><h1>URBAN FLUX</h1><p className="brand-subtitle">Criminal City Builder</p></div>
        </div>
        <div className="topbar-metrics">
          <Metric label="Бюджет" value={`$${game.stats.money.toLocaleString()}`} tone="teal" />
          <Metric label="Время" value={time} tone="amber" />
          <Metric label="Одобрение" value={`${Math.round(game.stats.approval)}%`} tone={game.stats.approval < 40 ? 'danger' : 'neutral'} />
          <button className="icon-control" onClick={() => { game.saveGame(); refreshGameUi(); }} title="Сохранить город"><Save size={17} /></button><button className="icon-control" onClick={() => { game.loadGame(); refreshGameUi(); }} title="Загрузить город"><Download size={17} /></button><button className="icon-control" onClick={() => { if (window.confirm('Сбросить сохранённый город и начать заново?')) { game.restart(); refreshGameUi(); } }} title="Сбросить город"><Trash2 size={17} /></button><button className="icon-control" onClick={() => setFinanceOpen(true)} title="Финансы и налоги"><Settings2 size={17} /></button>
        </div>
      </header>

      <section className={`build-dock ${catalogOpen ? 'is-open' : ''}`}>
        <div className="dock-head"><div><span className="eyebrow">РАЗВИТИЕ КВАРТАЛА</span><strong>Построить</strong></div><button className="icon-control" onClick={() => setCatalogOpen(value => !value)} aria-label={catalogOpen ? 'Свернуть каталог' : 'Открыть каталог'}>{catalogOpen ? <X size={17} /> : <Settings2 size={17} />}</button></div>
        {catalogOpen && <>
          <div className="category-tabs">
            {BUILDING_CATEGORIES.map(item => <button key={item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}><span>{item.icon}</span>{item.label}</button>)}
          </div>
          <div className="building-grid">
            {activeBuildings.map(type => {
              const item = BUILDINGS[type]; const active = game.tool === type;
              return <button key={type} className={`building-card ${active ? 'active' : ''}`} onClick={() => onToolChange(type as Tool)} title={`${item.name}: $${item.cost}`}>
                <span className="building-icon" style={{ backgroundColor: item.color }}>{item.icon}</span>
                <span className="building-name">{item.name}</span><span className="building-cost">${item.cost}</span>
              </button>;
            })}
          </div>
          <div className="tool-row">
            {([['select', 'Выбрать'], ['inspect', 'Инфо'], ['bulldoze', 'Снос']] as [Tool, string][]).map(([tool, label]) => <button className={game.tool === tool ? 'active' : ''} key={tool} onClick={() => onToolChange(tool)}>{label}</button>)}
          </div>
          {selected && <div className="selection-card"><span className="selection-icon" style={{ color: selected.color }}>{selected.icon}</span><div><strong>{selected.name}</strong><p>{selected.desc}</p></div><span className="selection-stat">{selected.size}×{selected.size}</span></div>}
        </>}
      </section>

      <aside className="city-panel">
        <div className="panel-heading"><Radio size={15} /><span>ГОРОДСКОЙ ПУЛЬС</span></div>
        <div className="pulse-grid"><Metric label="Население" value={game.stats.population.toLocaleString()} /><Metric label="Работа" value={`${game.stats.employment}%`} /><Metric label="Связи" value={`${Math.round(game.stats.community)}%`} tone="amber" /><Metric label="Риск" value={`${Math.round(game.stats.crime)}%`} tone={game.stats.crime > 35 ? 'danger' : 'neutral'} /></div>
        <div className="social-strip"><UsersRound size={14} /><span>{game.stats.activeWorkers} жителей заняты в городской сети</span></div>
        <div className={`energy-strip ${game.stats.energy.outage ? 'outage' : ''}`}><Zap size={14} /><div><strong>ЭНЕРГОСЕТЬ</strong><span>{game.stats.energy.outage ? `ОТКЛЮЧЕНИЕ · дефицит ${game.stats.energy.overload}%` : `${game.stats.energy.coverage}% покрытия · ${game.stats.energy.produced}/${game.stats.energy.consumed} кВт`}</span></div></div>
        <div className="demand-strip"><div className="panel-heading compact"><TrendingUp size={14} /><span>СПРОС ЗОН</span></div><div className="demand-row"><span>Жильё <b>{game.stats.zoneDemand.residential}</b></span><i><em style={{ width: `${game.stats.zoneDemand.residential}%`, background: '#6a9e75' }} /></i><span>Торговля <b>{game.stats.zoneDemand.commercial}</b></span><i><em style={{ width: `${game.stats.zoneDemand.commercial}%`, background: '#398daf' }} /></i><span>Индустрия <b>{game.stats.zoneDemand.industrial}</b></span><i><em style={{ width: `${game.stats.zoneDemand.industrial}%`, background: '#b4794f' }} /></i></div></div>
        <div className="panel-heading compact"><ShieldAlert size={15} /><span>ГРУППИРОВКИ</span></div>
        <div className="gang-list">{Object.entries(GANGS).map(([id, gang]) => <div className="gang-row" key={id}><span className="gang-swatch" style={{ backgroundColor: gang.color }} /><span>{gang.name}</span><small>{gang.attitude}</small></div>)}</div>
        <div className="panel-heading compact"><span>ЦЕЛИ ПОТОКАМ</span></div>
        <div className="mission-list">{game.missions.map(mission => <div className="mission" key={mission.id}><div><span>{mission.completed ? '✓' : '○'}</span><strong>{mission.title}</strong></div><p>{mission.description}</p><div className="progress-track"><i style={{ width: `${Math.min(100, mission.progress / mission.target * 100)}%` }} /></div><small>{mission.progress}/{mission.target}</small></div>)}</div>
      </aside>

      {selectedTile && <div className="tile-chip"><span style={{ color: selectedTile.gang === 'none' ? '#9eb1b3' : game.getGangColor(selectedTile.gang) }}>СЕКТОР {game.selectedTile.x}:{game.selectedTile.y}</span><strong>{selectedTile.hasFire ? 'Пожар' : selectedTile.hasCrime ? 'Риск преступления' : selectedTile.type === 'grass' ? 'Свободен' : BUILDINGS[selectedTile.type].name}</strong><small>{selectedTile.powered === false ? 'Без питания' : 'Питание стабильно'}</small></div>}

      <div className="mode-switch"><button className={game.mode === 'strategy' ? 'active' : ''} onClick={() => onModeChange('strategy')}>КАРТА</button><button className={game.mode === 'action' ? 'active' : ''} onClick={() => onModeChange('action')}>ВЫХОД В ГОРОД</button></div>
      <div className="time-console">
        <button className={`play-state ${game.paused ? 'paused' : ''}`} onClick={() => { game.togglePause(); refreshGameUi(); }} title={game.paused ? 'Продолжить' : 'Пауза'}>{game.paused ? <Play size={17} /> : <Pause size={17} />}<span>{game.paused ? 'ПЛЕЙ' : 'ПАУЗА'}</span></button>
        <span className="console-divider" />
        {([1, 2, 5] as const).map(speed => <button key={speed} className={!game.paused && game.speed === speed ? 'active' : ''} onClick={() => { game.setSpeed(speed); refreshGameUi(); }}>{speed === 1 ? <Play size={14} /> : <FastForward size={14} />}×{speed}</button>)}
        <span className="console-divider" />
        <button className={`autopilot ${game.autopilot ? 'active' : ''}`} onClick={() => { game.toggleAutopilot(); refreshGameUi(); }}><Navigation size={15} />{game.autopilot ? `КУРС ${game.autopilotPath.length}` : 'АВТОПИЛОТ'}</button>
      </div>

      {game.mode === 'action' && <div className="action-readout"><span>HP {Math.ceil(game.player.health)}</span><span>AMMO {game.player.ammo}/{game.player.maxAmmo}</span><span>РОЗЫСК {'●'.repeat(game.player.wanted) || '—'}</span><small>WASD — движение · F — транспорт · G — автопилот</small></div>}
      {financeOpen && <div className="modal-wrap"><section className="finance-modal"><button className="modal-close" onClick={() => setFinanceOpen(false)}><X size={18} /></button><span className="eyebrow">ФИНАНСОВЫЙ КОНТУР</span><h2>Бюджет и налоговый поток</h2><div className="finance-summary"><Metric label="Доход" value={`$${game.stats.income}`} /><Metric label="Расход" value={`$${game.stats.expenses}`} tone="danger" /><Metric label="Депозит" value={`$${game.deposit}`} tone="amber" /></div><label>Жилой налог <output>{game.taxRateResidential}%</output><input type="range" min="0" max="300" value={game.taxRateResidential} onChange={event => { game.taxRateResidential = Number(event.target.value); }} /></label><label>Торговый налог <output>{game.taxRateCommercial}%</output><input type="range" min="0" max="300" value={game.taxRateCommercial} onChange={event => { game.taxRateCommercial = Number(event.target.value); }} /></label><label>Промышленный налог <output>{game.taxRateIndustrial}%</output><input type="range" min="0" max="300" value={game.taxRateIndustrial} onChange={event => { game.taxRateIndustrial = Number(event.target.value); }} /></label><div className="finance-actions"><input type="number" min="100" step="100" value={amount} onChange={event => setAmount(Math.max(100, Number(event.target.value)))} /><button onClick={() => game.depositToBank(amount)}>На депозит</button><button onClick={() => game.withdrawFromBank(amount)}>Снять</button><button onClick={() => game.takeLoan(amount)}>Кредит</button><button onClick={() => game.repayLoan(amount)}>Погасить</button></div><p className="finance-note">Ставки {taxLabel} влияют на бюджет и доверие населения. Слишком высокий поток налога снижает одобрение.</p></section></div>}
      {game.gameOver && <div className="modal-wrap"><section className="game-over"><span className="eyebrow">СИСТЕМА ОТКЛЮЧЕНА</span><h2>Город потерял мэра</h2><p>Дней: {game.stats.day} · Устранено угроз: {game.totalKills} · Доход: ${game.totalEarned}</p><button onClick={() => game.restart()}>Запустить новый поток</button></section></div>}
    </div>
  );
}
