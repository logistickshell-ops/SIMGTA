import { Game } from './Game';
import { COLORS, TILE_SIZE, BUILDINGS, GANG_COLORS, MAP_WIDTH, MAP_HEIGHT } from './constants';

export class Renderer {
  ctx: CanvasRenderingContext2D;
  game: Game;
  width: number;
  height: number;

  constructor(canvas: HTMLCanvasElement, game: Game) {
    const ctx = canvas.getContext('2d')!;
    this.ctx = ctx;
    this.game = game;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.game.viewportWidth = w;
    this.game.viewportHeight = h;
  }

  draw() {
    const ctx = this.ctx;
    const g = this.game;
    const cam = g.camera;

    // sky color based on day/night
    const dayPhase = g.dayNightCycle; // 0..1
    const isNight = dayPhase < 0.2083 || dayPhase > 0.9583;

    // background sky
    const skyColor = this.getSkyColor(dayPhase);
    ctx.fillStyle = skyColor;
    ctx.fillRect(0, 0, this.width, this.height);

    // stars at night
    if (isNight) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 60; i++) {
        const sx = (i * 173) % this.width;
        const sy = (i * 89) % (this.height * 0.3);
        ctx.fillRect(sx, sy, 1, 1);
      }
    }

    // camera transform
    ctx.save();
    ctx.translate(-cam.x * cam.zoom, -cam.y * cam.zoom);
    ctx.scale(cam.zoom, cam.zoom);

    // visible tile range
    const startX = Math.max(0, Math.floor(cam.x / TILE_SIZE));
    const startY = Math.max(0, Math.floor(cam.y / TILE_SIZE));
    const endX = Math.min(MAP_WIDTH, Math.ceil((cam.x + this.width / cam.zoom) / TILE_SIZE) + 1);
    const endY = Math.min(MAP_HEIGHT, Math.ceil((cam.y + this.height / cam.zoom) / TILE_SIZE) + 1);

    // draw tiles
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const t = g.tiles[y][x];
        this.drawTile(t, x, y, dayPhase);
      }
    }

    // draw gang territory overlay
    if (g.mode === 'strategy') {
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const t = g.tiles[y][x];
          if (t.gang !== 'none' && t.type !== 'grass' && t.type !== 'road' && t.type !== 'water') {
            ctx.fillStyle = GANG_COLORS[t.gang] + '30';
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }

    // draw hovered tile highlight
    const previewBuilding = BUILDINGS[g.tool as keyof typeof BUILDINGS];
    if (previewBuilding && g.mode === 'strategy' && g.hoveredTile.x >= 0 && g.hoveredTile.x < MAP_WIDTH && g.hoveredTile.y >= 0 && g.hoveredTile.y < MAP_HEIGHT) {
      const hx = g.hoveredTile.x * TILE_SIZE;
      const hy = g.hoveredTile.y * TILE_SIZE;
      const can = g.canPlace(g.hoveredTile.x, g.hoveredTile.y, g.tool);
      ctx.strokeStyle = can ? '#39ff14' : '#ff4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 1, hy + 1, TILE_SIZE * previewBuilding.size - 2, TILE_SIZE * previewBuilding.size - 2);
      ctx.fillStyle = can ? 'rgba(57,255,20,0.15)' : 'rgba(255,68,68,0.15)';
      ctx.fillRect(hx, hy, TILE_SIZE * previewBuilding.size, TILE_SIZE * previewBuilding.size);
    }

    // draw selected tile
    if (g.selectedTile.x >= 0 && g.selectedTile.x < MAP_WIDTH && g.selectedTile.y >= 0 && g.selectedTile.y < MAP_HEIGHT) {
      const sx = g.selectedTile.x * TILE_SIZE;
      const sy = g.selectedTile.y * TILE_SIZE;
      ctx.strokeStyle = '#ffea00';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 1, sy - 1, TILE_SIZE + 2, TILE_SIZE + 2);
    }

    // Наземный транспорт
    for (const v of g.vehicles) {
      if (v.type !== 'airplane') this.drawVehicle(v, dayPhase);
    }
    // Тени самолётов (рисуем под ними)
    // тени самолётов не рисуются

    // draw pedestrians
    for (const p of g.pedestrians) {
      this.drawPedestrian(p, dayPhase);
    }

    // draw pickups
    for (const p of g.pickups) {
      this.drawPickup(p);
    }

    // draw bullets
    for (const b of g.bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = COLORS.bullet;
      ctx.fillRect(-3, -1, 6, 2);
      ctx.restore();
    }

    // draw explosions
    for (const e of g.explosions) {
      const progress = 1 - e.life / e.maxLife;
      const r = e.radius;
      ctx.fillStyle = `rgba(255, 140, 0, ${1 - progress})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 234, 0, ${1 - progress})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // draw particles
    for (const p of g.particles) {
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // draw player
    if (g.mode === 'action' || g.playerInVehicleId === null) {
      this.drawPlayer(dayPhase);
    }
    // Самолёты поверх всего остального
    for (const v of g.vehicles) {
      if (v.type === 'airplane') this.drawAirplane(v);
    }

    // draw floating messages
    for (const m of g.messages) {
      const alpha = Math.min(1, m.life / 60);
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 10px "Courier New", monospace';
      ctx.fillStyle = '#000';
      ctx.fillText(m.text, m.x - ctx.measureText(m.text).width / 2 + 1, m.y + 1);
      ctx.fillStyle = m.color;
      ctx.fillText(m.text, m.x - ctx.measureText(m.text).width / 2, m.y);
    }
    ctx.globalAlpha = 1;

    // night overlay — лёгкое затемнение всей карты
    if (isNight) {
      ctx.fillStyle = 'rgba(5, 5, 25, 0.25)';
      ctx.fillRect(cam.x, cam.y, this.width / cam.zoom, this.height / cam.zoom);
    }

    // Подсветка дорог — мягкая, одна клетка дороги даёт небольшой тёплый круг
    if (isNight) {
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          if (g.tiles[y][x].type === 'road') {
            const lx = x * TILE_SIZE + TILE_SIZE / 2;
            const ly = y * TILE_SIZE + TILE_SIZE / 2;
            const grd = ctx.createRadialGradient(lx, ly, 0, lx, ly, 18);
            grd.addColorStop(0, 'rgba(255, 220, 100, 0.15)');
            grd.addColorStop(1, 'rgba(255, 220, 100, 0)');
            ctx.fillStyle = grd;
            ctx.fillRect(lx - 18, ly - 18, 36, 36);
          }
        }
      }
    }

    ctx.restore();

    // Vice City style radar is useful in both modes.
    this.drawMinimap();

    // Прицел в экшен-режиме, когда игрок не в машине
    if (g.mode === 'action' && g.playerInVehicleId === null) {
      this.drawCrosshair();
    }

    // FPS / debug
    if (g.showGrid && g.mode === 'strategy') {
      // small grid overlay - just at hovered tile
    }
  }

  /** Неоновый прицел на позиции курсора (GTA-стиль) */
  drawCrosshair() {
    const ctx = this.ctx;
    const mx = this.game.mouseX;
    const my = this.game.mouseY;
    const size = 14;
    const tick = this.game.tickCount;
    const pulse = 1 + Math.sin(tick / 8) * 0.1;
    const s = size * pulse;

    ctx.save();
    // Внешнее свечение
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(mx, my, s, 0, Math.PI * 2);
    ctx.stroke();

    // Основной круг
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx, my, s * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    // Перекрестие (4 короткие линии с разрывом в центре)
    ctx.strokeStyle = '#ff2d8a';
    ctx.lineWidth = 1.5;
    const gap = 3;
    const len = s * 0.55;
    ctx.beginPath();
    ctx.moveTo(mx - len, my); ctx.lineTo(mx - gap, my);
    ctx.moveTo(mx + gap, my); ctx.lineTo(mx + len, my);
    ctx.moveTo(mx, my - len); ctx.lineTo(mx, my - gap);
    ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + len);
    ctx.stroke();

    // Точка в центре
    ctx.fillStyle = '#ffea00';
    ctx.fillRect(mx - 1, my - 1, 2, 2);
    ctx.restore();
  }

  getSkyColor(phase: number): string {
    // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    if (phase < 0.2 || phase > 0.8) return '#0a0a2a';
    if (phase < 0.3) return '#3a2050';
    if (phase < 0.4) return '#806060';
    if (phase < 0.6) return '#6090c0';
    if (phase < 0.7) return '#c08060';
    if (phase < 0.8) return '#503060';
    return '#0a0a2a';
  }

  drawTile(t: any, x: number, y: number, _dayPhase: number) {
    const ctx = this.ctx;
    const px = x * TILE_SIZE, py = y * TILE_SIZE;
    const variant = t.variant || 0;

    if (t.type === 'grass') {
      ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.grass : COLORS.grassAlt;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      // add some grass tufts
      if (variant === 1 && (x * 7 + y * 3) % 5 === 0) {
        ctx.fillStyle = COLORS.grassAlt;
        ctx.fillRect(px + 4, py + 6, 2, 2);
      }
    } else if (t.type === 'water') {
      ctx.fillStyle = COLORS.water;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#3a5ac8';
      const w = ((x * 13 + y * 7 + Math.floor(this.game.tickCount / 30)) % TILE_SIZE);
      ctx.fillRect(px + w, py + 4, 4, 1);
    } else if (t.type === 'road') {
      ctx.fillStyle = COLORS.sidewalk;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = COLORS.road;
      ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      const left = x > 0 && this.game.tiles[y][x - 1].type === 'road';
      const right = x < MAP_WIDTH - 1 && this.game.tiles[y][x + 1].type === 'road';
      const up = y > 0 && this.game.tiles[y - 1][x].type === 'road';
      const down = y < MAP_HEIGHT - 1 && this.game.tiles[y + 1][x].type === 'road';

      // Two-lane markings: upper/left lane goes one way, lower/right lane the opposite way.
      ctx.fillStyle = '#2a2a2a';
      if (left || right) {
        ctx.fillRect(px + 1, py + 4, TILE_SIZE - 2, 1);
        ctx.fillRect(px + 1, py + 11, TILE_SIZE - 2, 1);
      }
      if (up || down) {
        ctx.fillRect(px + 4, py + 1, 1, TILE_SIZE - 2);
        ctx.fillRect(px + 11, py + 1, 1, TILE_SIZE - 2);
      }
      // Tiny direction arrows for lane readability.
      if ((left || right) && (x + y) % 5 === 0) {
        ctx.fillStyle = '#88f8ff';
        ctx.fillRect(px + 11, py + 10, 2, 1); // eastbound lower lane
        ctx.fillRect(px + 3, py + 5, 2, 1); // westbound upper lane
      }
      if ((up || down) && (x + y) % 5 === 2) {
        ctx.fillStyle = '#88f8ff';
        ctx.fillRect(px + 5, py + 11, 1, 2); // southbound left lane
        ctx.fillRect(px + 10, py + 3, 1, 2); // northbound right lane
      }
    } else if (t.type === 'park') {
      ctx.fillStyle = COLORS.park;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#2d6a2d';
      ctx.fillRect(px + 3, py + 3, 3, 3);
      ctx.fillRect(px + 9, py + 8, 3, 3);
      ctx.fillStyle = '#7a3a3a';
      ctx.fillRect(px + 6, py + 11, 2, 2);
    } else if (t.type === 'residential') {
      const colors = [COLORS.residential1, COLORS.residential2, COLORS.residential3];
      ctx.fillStyle = colors[Math.min(2, t.level - 1)];
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      // building
      ctx.fillStyle = '#5a3a2a';
      const h = 6 + t.level * 2;
      ctx.fillRect(px + 2, py + TILE_SIZE - h - 2, 12, h);
      // roof
      ctx.fillStyle = '#8a3a2a';
      ctx.fillRect(px + 1, py + TILE_SIZE - h - 3, 14, 2);
      // window
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(px + 5, py + TILE_SIZE - 6, 2, 2);
      ctx.fillRect(px + 9, py + TILE_SIZE - 6, 2, 2);
    } else if (t.type === 'commercial') {
      const colors = [COLORS.commercial1, COLORS.commercial2, COLORS.commercial3];
      ctx.fillStyle = colors[Math.min(2, t.level - 1)];
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      // shop building
      ctx.fillStyle = '#a0a0c0';
      ctx.fillRect(px + 1, py + 4, 14, 11);
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(px + 2, py + 5, 3, 3); // sign
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(px + 7, py + 9, 4, 6); // door
    } else if (t.type === 'industrial') {
      const colors = [COLORS.industrial1, COLORS.industrial2, COLORS.industrial3];
      ctx.fillStyle = colors[Math.min(2, t.level - 1)];
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      // factory
      ctx.fillStyle = '#5a4020';
      ctx.fillRect(px + 1, py + 6, 14, 9);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(px + 3, py + 1, 2, 6); // chimney
      ctx.fillStyle = '#888888';
      ctx.fillRect(px + 6, py + 8, 3, 3);
    } else if (t.type === 'policestation') {
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      // draw on both tiles of 2x2
      if (x % 2 === 0 && y % 2 === 0) {
        // big building
        ctx.fillStyle = '#202040';
        ctx.fillRect(px, py, TILE_SIZE * 2, TILE_SIZE * 2);
        ctx.fillStyle = COLORS.police;
        ctx.fillRect(px + 4, py + 4, 24, 24);
        // badge
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(px + 14, py + 14, 4, 4);
        ctx.fillStyle = '#3060c8';
        ctx.fillRect(px + 15, py + 15, 2, 2);
      } else if (x % 2 === 1 && y % 2 === 0) {
        ctx.fillStyle = '#202040';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.fillStyle = '#202040';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      }
    } else if (t.type === 'hospital') {
      ctx.fillStyle = '#e0e8f0';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      // red cross
      ctx.fillStyle = '#ff2222';
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillRect(px + 12, py + 4, 8, 24);
        ctx.fillRect(px + 4, py + 12, 24, 8);
      }
    } else if (t.type === 'firestation') {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillStyle = COLORS.fire;
        ctx.fillRect(px + 4, py + 4, 24, 24);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(px + 14, py + 10, 4, 12);
        ctx.fillRect(px + 10, py + 14, 12, 4);
      }
    } else if (t.type === 'school') {
      ctx.fillStyle = COLORS.school;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillStyle = '#8a6030';
        ctx.fillRect(px + 4, py + 4, 24, 24);
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(px + 6, py + 6, 4, 4);
        ctx.fillRect(px + 14, py + 6, 4, 4);
        ctx.fillRect(px + 22, py + 6, 4, 4);
        ctx.fillRect(px + 10, py + 14, 4, 4);
        ctx.fillRect(px + 18, py + 14, 4, 4);
      }
    } else if (t.type === 'stadium') {
      ctx.fillStyle = COLORS.stadium;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillStyle = '#3a8a3a';
        ctx.fillRect(px + 4, py + 4, 24, 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 14, py + 14, 4, 4);
      }
    } else if (t.type === 'casino') {
      ctx.fillStyle = '#1a0a1a';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillStyle = COLORS.casino;
        ctx.fillRect(px + 4, py + 4, 24, 24);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(px + 8, py + 8, 16, 16);
        // dice
        ctx.fillStyle = '#000';
        ctx.fillRect(px + 12, py + 12, 2, 2);
        ctx.fillRect(px + 18, py + 18, 2, 2);
      }
    } else if (t.type === 'bank') {
      ctx.fillStyle = '#5a4a2a';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillStyle = COLORS.bank;
        ctx.fillRect(px + 4, py + 4, 24, 24);
        ctx.fillStyle = '#5a4a1a';
        ctx.fillRect(px + 6, py + 6, 4, 14);
        ctx.fillRect(px + 22, py + 6, 4, 14);
        ctx.fillRect(px + 10, py + 10, 12, 6);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(px + 14, py + 12, 4, 2);
      }
    } else if (t.type === 'powerplant') {
      ctx.fillStyle = COLORS.power;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillStyle = '#aaaaaa';
        ctx.fillRect(px + 4, py + 4, 24, 24);
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(px + 8, py + 2, 2, 6); // chimney
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(px + 14, py + 14, 4, 4);
      }
    } else if (t.type === 'busdepot') {
      ctx.fillStyle = '#503018';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillStyle = COLORS.bus;
        ctx.fillRect(px + 4, py + 5, 24, 22);
        ctx.fillStyle = '#111';
        ctx.fillRect(px + 7, py + 10, 18, 6);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(px + 8, py + 21, 16, 2);
      }
    } else if (t.type === 'tramdepot') {
      ctx.fillStyle = '#26143a';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillStyle = COLORS.tram;
        ctx.fillRect(px + 5, py + 6, 22, 20);
        ctx.strokeStyle = '#d8c0ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 7, py + 27); ctx.lineTo(px + 25, py + 27);
        ctx.moveTo(px + 7, py + 29); ctx.lineTo(px + 25, py + 29);
        ctx.stroke();
      }
    } else if (t.type === 'trainstation') {
      ctx.fillStyle = '#303030';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillStyle = COLORS.train;
        ctx.fillRect(px + 3, py + 5, 26, 20);
        ctx.fillStyle = '#202020';
        ctx.fillRect(px + 6, py + 10, 20, 4);
        ctx.fillRect(px + 6, py + 27, 20, 2);
      }
    } else if (t.type === 'airport') {
      ctx.fillStyle = '#204050';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillStyle = COLORS.airport;
        ctx.fillRect(px + 4, py + 4, 24, 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 14, py + 7, 4, 18);
        ctx.fillRect(px + 8, py + 15, 16, 3);
      }
    } else if (t.type === 'gunshop') {
      ctx.fillStyle = '#3a0f20';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (x % 2 === 0 && y % 2 === 0) {
        ctx.fillStyle = '#ff2d8a';
        ctx.fillRect(px + 4, py + 4, 24, 24);
        // Знак прицела/пистолета на крыше
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(px + 10, py + 12, 12, 4);
        ctx.fillRect(px + 10, py + 16, 4, 6);
      }
    }

    // fire effect
    if (t.hasFire) {
      const phase = (this.game.tickCount + x * 13 + y * 7) % 30;
      const fh = 4 + Math.sin(phase / 5) * 2;
      ctx.fillStyle = '#ff8c00';
      ctx.fillRect(px + 4, py + TILE_SIZE - fh - 2, 8, fh);
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(px + 6, py + TILE_SIZE - fh + 1, 4, fh - 3);
    }

    // crime effect
    if (t.hasCrime) {
      const phase = (this.game.tickCount + x * 11 + y * 17) % 60;
      if (phase < 30) {
        ctx.fillStyle = 'rgba(255, 45, 138, 0.4)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  drawVehicle(v: any, _dayPhase: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    let color = '#cccccc';
    if (v.type === 'police') color = COLORS.policeCar;
    else if (v.type === 'sport') color = '#ff2222';
    else if (v.type === 'taxi') color = '#ffea00';
    else if (v.type === 'bus') color = COLORS.bus;
    else if (v.type === 'tram') color = COLORS.tram;
    else if (v.type === 'train') color = COLORS.train;
    else if (v.type === 'gang' || v.gang !== 'none') color = v.gang !== 'none' ? GANG_COLORS[v.gang] : '#888888';
    else color = '#888899';
    // body
    ctx.fillStyle = color;
    const longBody = v.type === 'bus' || v.type === 'tram' || v.type === 'train' || v.type === 'airplane';
    ctx.fillRect(longBody ? -15 : -10, longBody ? -6 : -6, longBody ? 30 : 20, 12);
    if (v.type === 'airplane') {
      ctx.fillRect(-3, -13, 8, 26);
      ctx.fillRect(-13, -3, 26, 6);
    }
    // roof
    ctx.fillStyle = '#000';
    ctx.fillRect(longBody ? -10 : -6, -4, longBody ? 20 : 12, 8);
    // headlights
    ctx.fillStyle = '#ffea00';
    ctx.fillRect(longBody ? 14 : 9, -4, 2, 2);
    ctx.fillRect(longBody ? 14 : 9, 2, 2, 2);
    // taillights
    ctx.fillStyle = '#ff2222';
    ctx.fillRect(longBody ? -15 : -10, -4, 1, 2);
    ctx.fillRect(longBody ? -15 : -10, 2, 1, 2);
    // police light bar
    if (v.type === 'police') {
      const phase = (this.game.tickCount + v.id) % 20;
      ctx.fillStyle = phase < 10 ? '#ff2222' : '#3060c8';
      ctx.fillRect(-4, -7, 8, 2);
    }
    // damage smoke
    if (v.health < 30) {
      ctx.fillStyle = 'rgba(80,80,80,0.6)';
      ctx.fillRect(-8, -8 - (this.game.tickCount % 6), 3, 3);
    }
    ctx.restore();
  }

  drawPedestrian(p: any, _dayPhase: number) {
    if (p.state === 'dead') return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    let color = '#cccccc';
    if (p.type === 'police') color = COLORS.policeCar;
    else if (p.type === 'firefighter') color = '#ff2222';
    else if (p.type === 'medic') color = '#ffffff';
    else if (p.type === 'gang1') color = COLORS.gang1;
    else if (p.type === 'gang2') color = COLORS.gang2;
    else if (p.type === 'gang3') color = COLORS.gang3;
    else if (p.type === 'gang4') color = COLORS.gang4;
    // body
    ctx.fillStyle = color;
    ctx.fillRect(-2, -2, 4, 4);
    // head
    ctx.fillStyle = '#dda070';
    ctx.fillRect(-1, -4, 2, 2);
    // weapon indicator
    if (p.weaponCooldown > 0) {
      ctx.fillStyle = '#ff2222';
      ctx.fillRect(0, 0, 1, 1);
    }
    // health bar
    if (p.health < 80) {
      ctx.fillStyle = '#000';
      ctx.fillRect(-4, -7, 8, 1);
      ctx.fillStyle = p.health > 50 ? '#39ff14' : p.health > 25 ? '#ffea00' : '#ff2222';
      ctx.fillRect(-4, -7, 8 * (p.health / 80), 1);
    }
    // boss indicator
    if (p.health > 150) {
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(-3, -8, 6, 1);
      ctx.fillStyle = '#000';
      ctx.font = '6px "Courier New"';
      ctx.fillText('БОСС', -7, -9);
    }
    ctx.restore();
  }

  drawPickup(p: any) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    const bob = Math.sin(this.game.tickCount / 10) * 2;
    if (p.type === 'money') {
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(-3, -3 + bob, 6, 6);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 6px "Courier New"';
      ctx.fillText('$', -2, 2 + bob);
    } else if (p.type === 'health') {
      ctx.fillStyle = '#ff2222';
      ctx.fillRect(-2, -3 + bob, 4, 6);
      ctx.fillRect(-3, -1 + bob, 6, 2);
    } else if (p.type === 'ammo') {
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(-2, -3 + bob, 4, 6);
    } else if (p.type === 'weapon') {
      ctx.fillStyle = '#ff2d8a';
      ctx.fillRect(-3, -2 + bob, 6, 4);
      ctx.fillStyle = '#ffea00';
      ctx.fillRect(-2, -1 + bob, 4, 2);
    }
    ctx.restore();
  }

  drawPlayer(_dayPhase: number) {
    const ctx = this.ctx;
    const p = this.game.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // body
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(-3, -3, 6, 6);
    // head
    ctx.fillStyle = '#dda070';
    ctx.fillRect(-2, -5, 4, 3);
    // hat
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(-2, -6, 4, 1);
    // gun
    ctx.fillStyle = '#222';
    ctx.fillRect(2, -1, 4, 2);
    // health bar
    ctx.rotate(-p.angle); // un-rotate
    ctx.fillStyle = '#000';
    ctx.fillRect(-10, -12, 20, 2);
    ctx.fillStyle = p.health > 50 ? '#39ff14' : p.health > 25 ? '#ffea00' : '#ff2222';
    ctx.fillRect(-10, -12, 20 * (p.health / p.maxHealth), 2);
    // ammo
    ctx.fillStyle = '#000';
    ctx.fillRect(-10, 8, 20, 1);
    ctx.fillStyle = '#ffea00';
    ctx.fillRect(-10, 8, 20 * (p.ammo / p.maxAmmo), 1);
    // super weapon indicator
    if (this.game.superWeapon) {
      ctx.fillStyle = `rgba(255, 45, 138, ${0.5 + Math.sin(this.game.tickCount / 5) * 0.5})`;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawMinimap() {
    const ctx = this.ctx;
    const g = this.game;
    const isMobile = this.width < 640 || this.height < 520;
    const mmSize = isMobile ? 108 : 150;
    const mmX = isMobile ? 10 : 16;
    const mmY = this.height - mmSize - (isMobile ? 154 : 16);
    const cx = mmX + mmSize / 2;
    const cy = mmY + mmSize / 2;
    const radius = mmSize / 2;
    const focusX = g.mode === 'action' ? g.player.x : g.camera.x + this.width / (2 * g.camera.zoom);
    const focusY = g.mode === 'action' ? g.player.y : g.camera.y + this.height / (2 * g.camera.zoom);
    const viewWorld = isMobile ? 280 : 360;
    const scale = radius / viewWorld;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.76)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff8c00';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
    ctx.strokeStyle = '#00f0ff';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#13230f';
    ctx.fillRect(mmX, mmY, mmSize, mmSize);

    // Сверхбыстрый локальный круглый радар (проходим только по клеткам в радиусе обзора)
    const maxRadarTiles = Math.ceil(viewWorld / TILE_SIZE) + 1;
    const minRadarX = Math.max(0, Math.floor(focusX / TILE_SIZE) - maxRadarTiles);
    const maxRadarX = Math.min(MAP_WIDTH, Math.ceil(focusX / TILE_SIZE) + maxRadarTiles);
    const minRadarY = Math.max(0, Math.floor(focusY / TILE_SIZE) - maxRadarTiles);
    const maxRadarY = Math.min(MAP_HEIGHT, Math.ceil(focusY / TILE_SIZE) + maxRadarTiles);

    for (let y = minRadarY; y < maxRadarY; y++) {
      for (let x = minRadarX; x < maxRadarX; x++) {
        const t = g.tiles[y][x];
        let c: string | null = null;
        if (t.type === 'road') c = '#3a3a3a';
        else if (t.type === 'water') c = COLORS.water;
        else if (t.type === 'residential') c = COLORS.residential1;
        else if (t.type === 'commercial') c = COLORS.commercial1;
        else if (t.type === 'industrial') c = COLORS.industrial1;
        else if (t.type === 'park') c = COLORS.park;
        else if (t.type === 'policestation') c = COLORS.police;
        else if (t.type === 'hospital') c = COLORS.hospital;
        else if (t.type === 'firestation') c = COLORS.fire;
        else if (t.type === 'school') c = COLORS.school;
        else if (t.type === 'stadium') c = COLORS.stadium;
        else if (t.type === 'casino') c = COLORS.casino;
        else if (t.type === 'bank') c = COLORS.bank;
        else if (t.type === 'powerplant') c = COLORS.power;
        else if (t.type === 'busdepot') c = COLORS.bus;
        else if (t.type === 'tramdepot') c = COLORS.tram;
        else if (t.type === 'trainstation') c = COLORS.train;
        else if (t.type === 'airport') c = COLORS.airport;
        else if (t.type === 'gunshop') c = '#ff2d8a';
        if (c) {
          const worldX = x * TILE_SIZE + TILE_SIZE / 2;
          const worldY = y * TILE_SIZE + TILE_SIZE / 2;
          const rx = cx + (worldX - focusX) * scale;
          const ry = cy + (worldY - focusY) * scale;
          if (Math.hypot(rx - cx, ry - cy) > radius + 4) continue;
          ctx.fillStyle = c;
          ctx.fillRect(rx - 1.5, ry - 1.5, Math.max(2, TILE_SIZE * scale), Math.max(2, TILE_SIZE * scale));
        }
        if (t.gang !== 'none' && t.type !== 'grass') {
          const worldX = x * TILE_SIZE + TILE_SIZE / 2;
          const worldY = y * TILE_SIZE + TILE_SIZE / 2;
          const rx = cx + (worldX - focusX) * scale;
          const ry = cy + (worldY - focusY) * scale;
          if (Math.hypot(rx - cx, ry - cy) > radius + 4) continue;
          ctx.fillStyle = GANG_COLORS[t.gang] + '80';
          ctx.fillRect(rx - 2, ry - 2, 4, 4);
        }
      }
    }

    // Blips: gangs, police, vehicles and pickups.
    for (const ped of g.pedestrians) {
      if (ped.state === 'dead') continue;
      const rx = cx + (ped.x - focusX) * scale;
      const ry = cy + (ped.y - focusY) * scale;
      if (Math.hypot(rx - cx, ry - cy) > radius - 7) continue;
      if (ped.type === 'police') ctx.fillStyle = '#ffffff';
      else if (ped.type === 'gang1') ctx.fillStyle = COLORS.gang1;
      else if (ped.type === 'gang2') ctx.fillStyle = COLORS.gang2;
       else if (ped.type === 'gang3') ctx.fillStyle = COLORS.gang3;
       else if (ped.type === 'gang4') ctx.fillStyle = COLORS.gang4;
       else ctx.fillStyle = '#b8b8b8';
      ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
    }
    for (const pickup of g.pickups) {
      const rx = cx + (pickup.x - focusX) * scale;
      const ry = cy + (pickup.y - focusY) * scale;
      if (Math.hypot(rx - cx, ry - cy) > radius - 7) continue;
      ctx.fillStyle = pickup.type === 'money' ? '#39ff14' : pickup.type === 'health' ? '#ff2222' : '#ffea00';
      ctx.fillRect(rx - 2, ry - 2, 4, 4);
    }

    // Player arrow stays centered in action mode, Vice City style.
    const px = g.mode === 'action' ? cx : cx + (g.player.x - focusX) * scale;
    const py = g.mode === 'action' ? cy : cy + (g.player.y - focusY) * scale;
    ctx.fillStyle = COLORS.player;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(g.player.angle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();

    ctx.save();
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.fillStyle = '#000';
    ctx.fillText('РАДАР', mmX + 9, mmY + 14);
    ctx.fillStyle = '#ffea00';
    ctx.fillText('РАДАР', mmX + 8, mmY + 13);
    ctx.restore();
  }

  /** Тень самолёта на земле — смещена пропорционально высоте */
  drawAirplaneShadow(v: any) {
    const ctx = this.ctx;
    const cam = this.game.camera;
    const alt = v.altitude ?? 0;
    const shadowOffset = alt * 28;
    const sx = v.x + shadowOffset - cam.x * cam.zoom;
    const sy = v.y + shadowOffset * 0.5 - cam.y * cam.zoom;

    ctx.save();
    ctx.globalAlpha = 0.22 * alt;
    ctx.translate(sx / cam.zoom + cam.x, sy / cam.zoom + cam.y);
    ctx.rotate(v.angle);
    ctx.scale(0.9 + alt * 0.25, 0.85 + alt * 0.1);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Рисуем самолёт в мировых координатах поверх всего, с масштабом по высоте */
  drawAirplane(v: any) {
    const ctx = this.ctx;
    const cam = this.game.camera;
    const alt = v.altitude ?? 0;
    const scale = cam.zoom * (1 + alt * 0.55);
    const screenX = (v.x - cam.x) * cam.zoom;
    const screenY = (v.y - cam.y) * cam.zoom;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(v.angle);
    ctx.scale(scale, scale);

    // Фюзеляж
    ctx.fillStyle = COLORS.airport;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Крылья
    ctx.fillStyle = '#b0e8ff';
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.lineTo(2, -14); ctx.lineTo(6, -13); ctx.lineTo(3, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.lineTo(2, 14); ctx.lineTo(6, 13); ctx.lineTo(3, 0);
    ctx.closePath();
    ctx.fill();

    // Хвостовое оперение
    ctx.fillStyle = '#80c0e8';
    ctx.beginPath();
    ctx.moveTo(-11, 0); ctx.lineTo(-8, -6); ctx.lineTo(-6, -5); ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-11, 0); ctx.lineTo(-8, 6); ctx.lineTo(-6, 5); ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fill();

    // Иллюминаторы (только в крейсерском режиме)
    if (alt > 0.5) {
      ctx.fillStyle = '#ffea00';
      for (let i = -3; i <= 5; i += 3) {
        ctx.fillRect(i - 0.5, -2, 1, 1);
        ctx.fillRect(i - 0.5, 1, 1, 1);
      }
    }

    // Мигающий огонь (навигационный)
    const blink = Math.floor(this.game.tickCount / 15) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#ff2222';
      ctx.fillRect(12, -1, 2, 2);
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(-14, -1, 2, 2);
    }

    ctx.restore();

    // Полоса инея/выхлопа
    if (alt > 0.7) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 * cam.zoom;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      const tailX = screenX - Math.cos(v.angle) * 18 * scale;
      const tailY = screenY - Math.sin(v.angle) * 18 * scale;
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(tailX - Math.cos(v.angle) * 40 * cam.zoom, tailY - Math.sin(v.angle) * 40 * cam.zoom);
      ctx.stroke();
      ctx.restore();
    }
  }
}
