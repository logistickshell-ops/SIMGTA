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
});
