import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from './Game';
import { TILE_SIZE } from './constants';

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
};

describe('Urban Flux city systems', () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock });
  });

  it('persists and restores the city using a versioned save payload', () => {
    const source = new Game();
    source.stats.money = 3210;
    source.stats.zoneDemand.commercial = 77;
    expect(source.saveGame(true)).toBe(true);

    const restored = new Game();
    expect(restored.stats.money).toBe(3210);
    expect(restored.stats.zoneDemand.commercial).toBe(77);
    expect(restored.buildings.length).toBe(source.buildings.length);
  });

  it('returns a multi-node route across the road graph', () => {
    const game = new Game();
    const route = game.findRoadPath(48 * TILE_SIZE, 38 * TILE_SIZE, 108 * TILE_SIZE, 38 * TILE_SIZE);
    expect(route.length).toBeGreaterThan(8);
    expect(route.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });

  it('calculates energy and demand after the city simulation tick', () => {
    const game = new Game();
    for (let tick = 0; tick < 62; tick++) game.update(16, { mouseX: 0, mouseY: 0, mouseDown: false, rightDown: false, keys: {} });
    expect(game.stats.energy.produced).toBeGreaterThan(0);
    expect(game.stats.energy.consumed).toBeGreaterThan(0);
    expect(game.stats.zoneDemand.residential).toBeGreaterThanOrEqual(0);
    expect(game.stats.zoneDemand.residential).toBeLessThanOrEqual(100);
  });

  it('switches between strategy and action without stale autopilot state', () => {
    const game = new Game();
    game.autopilot = true;
    game.setMode('action');
    expect(game.mode).toBe('action');
    expect(game.autopilot).toBe(false);
    game.setMode('strategy');
    expect(game.mode).toBe('strategy');
    expect(game.playerInVehicleId).toBeNull();
  });

  it('gives civilians stable daily destinations instead of random frame-to-frame turns', () => {
    const game = new Game();
    const input = { mouseX: 0, mouseY: 0, mouseDown: false, rightDown: false, keys: {} };
    for (let tick = 0; tick < 90; tick++) game.update(16, input);
    expect(game.pedestrians.filter(ped => ped.type === 'civilian').some(ped => ped.targetX !== undefined && ped.targetY !== undefined)).toBe(true);
  });

  it('keeps the city-action loop responsive while routes are planned incrementally', () => {
    const game = new Game();
    game.setMode('action');
    const input = { mouseX: 420, mouseY: 320, mouseDown: false, rightDown: false, keys: {} };
    for (let tick = 0; tick < 120; tick++) game.update(16, input);
    expect(game.mode).toBe('action');
    expect(game.tickCount).toBe(120);
  });

  it('keeps the world tile under the cursor fixed while zooming around that cursor', () => {
    const game = new Game();
    game.viewportWidth = 1280;
    game.viewportHeight = 720;
    game.camera.x = 320;
    game.camera.y = 180;
    const cursor = { x: 640, y: 360 };
    const before = game.screenToWorld(cursor.x, cursor.y);
    game.zoomCamera(0.5, cursor.x, cursor.y);
    const atHalf = game.screenToWorld(cursor.x, cursor.y);
    game.zoomCamera(6, cursor.x, cursor.y);
    const atThree = game.screenToWorld(cursor.x, cursor.y);
    expect(atHalf.x).toBeCloseTo(before.x, 8);
    expect(atHalf.y).toBeCloseTo(before.y, 8);
    expect(atThree.x).toBeCloseTo(before.x, 8);
    expect(atThree.y).toBeCloseTo(before.y, 8);
  });

  it('supports river cells, bridges over a river, and separate rail construction', () => {
    const game = new Game();
    game.tool = 'river';
    for (const [x, y] of [[60, 20], [61, 20], [60, 21], [61, 21]] as const) game.placeTool(x, y);
    expect(game.tiles[20][60]?.type).toBe('river');
    game.tool = 'bridge';
    game.placeTool(60, 20);
    expect(game.tiles[20][60]?.type).toBe('bridge');
    game.tool = 'tramrail';
    game.placeTool(50, 20);
    game.tool = 'rail';
    game.placeTool(50, 22);
    expect(game.tiles[20][50]?.type).toBe('tramrail');
    expect(game.tiles[22][50]?.type).toBe('rail');
  });
});
