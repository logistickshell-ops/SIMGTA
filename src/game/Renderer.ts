// Ночной картограф: canvas показывает только видимые тайлы и акцентирует реальные городские сигналы.
import type { Pedestrian, Tile, Vehicle } from './types';
import { BUILDINGS, COLORS, GANGS, MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants';
import { Game } from './Game';

export class Renderer {
  ctx: CanvasRenderingContext2D;
  game: Game;
  width: number;
  height: number;

  constructor(canvas: HTMLCanvasElement, game: Game) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    this.game = game;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.game.viewportWidth = width;
    this.game.viewportHeight = height;
  }

  draw() {
    const { ctx, game: g } = this;
    const cam = g.camera;
    const phase = g.dayNightCycle;
    const night = phase < 0.24 || phase > 0.9;
    ctx.fillStyle = night ? '#07131a' : '#132b2b';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(-cam.x * cam.zoom, -cam.y * cam.zoom);
    ctx.scale(cam.zoom, cam.zoom);
    const startX = Math.max(0, Math.floor(cam.x / TILE_SIZE) - 1);
    const startY = Math.max(0, Math.floor(cam.y / TILE_SIZE) - 1);
    const endX = Math.min(MAP_WIDTH, Math.ceil((cam.x + this.width / cam.zoom) / TILE_SIZE) + 2);
    const endY = Math.min(MAP_HEIGHT, Math.ceil((cam.y + this.height / cam.zoom) / TILE_SIZE) + 2);

    for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) this.drawGround(g.tiles[y][x], x, y, night);
    this.drawCartography(startX, startY, endX, endY);
    for (const building of g.buildings) {
      if (building.x + building.size < startX || building.x > endX || building.y + building.size < startY || building.y > endY) continue;
      this.drawBuilding(building.x, building.y, building.type, building.size, night, g.tiles[building.y][building.x].gang);
    }
    this.drawSystemOverlays(startX, startY, endX, endY);
    this.drawHover();
    this.drawAutopilotRoute();
    for (const vehicle of g.vehicles) this.drawVehicle(vehicle);
    for (const pedestrian of g.pedestrians) this.drawPedestrian(pedestrian);
    for (const bullet of g.bullets) { ctx.fillStyle = COLORS.bullet; ctx.fillRect(bullet.x - 2, bullet.y - 1, 4, 2); }
    for (const pickup of g.pickups) { ctx.fillStyle = '#f4cf68'; ctx.fillRect(pickup.x - 3, pickup.y - 3, 6, 6); }
    for (const particle of g.particles) { ctx.globalAlpha = particle.life / particle.maxLife; ctx.fillStyle = particle.color; ctx.fillRect(particle.x, particle.y, particle.size, particle.size); }
    ctx.globalAlpha = 1;
    if (g.mode === 'action' || g.playerInVehicleId === null) this.drawPlayer();
    for (const message of g.messages) this.drawMessage(message.text, message.x, message.y, message.color, message.life);
    if (night) this.drawNightLights(startX, startY, endX, endY);
    ctx.restore();
    this.drawRadar();
    if (g.mode === 'action' && g.playerInVehicleId === null) this.drawCrosshair();
  }

  private drawGround(tile: Tile, x: number, y: number, night: boolean) {
    const { ctx } = this;
    const px = x * TILE_SIZE, py = y * TILE_SIZE;
    if (tile.type === 'water') {
      ctx.fillStyle = COLORS.water; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = 'rgba(124,204,225,.18)'; ctx.beginPath(); ctx.moveTo(px + 3, py + 8); ctx.lineTo(px + 12, py + 8); ctx.stroke(); return;
    }
    if (tile.type === 'road') {
      ctx.fillStyle = COLORS.road; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#34424e'; ctx.lineWidth = .5; ctx.strokeRect(px + .5, py + .5, TILE_SIZE - 1, TILE_SIZE - 1);
      if (x % 2 === 0 || y % 2 === 0) { ctx.fillStyle = 'rgba(234,184,91,.55)'; ctx.fillRect(px + 7, py + 7, 2, 2); }
      return;
    }
    const terrainBand = (Math.floor(x / 9) + Math.floor(y / 11)) % 3;
    ctx.fillStyle = terrainBand === 0 ? '#203b34' : terrainBand === 1 ? '#234038' : '#25433a';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    if (tile.gang !== 'none') {
      ctx.fillStyle = `${this.game.getGangColor(tile.gang)}2a`;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = this.game.getGangColor(tile.gang);
      ctx.fillRect(px + 2, py + 2, 2, 2);
    }
    if (night) { ctx.fillStyle = 'rgba(4,13,22,.2)'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); }
  }

  private drawCartography(startX: number, startY: number, endX: number, endY: number) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(173, 206, 195, .08)'; ctx.lineWidth = .5;
    for (let x = Math.ceil(startX / 16) * 16; x < endX; x += 16) { ctx.beginPath(); ctx.moveTo(x * TILE_SIZE, startY * TILE_SIZE); ctx.lineTo(x * TILE_SIZE, endY * TILE_SIZE); ctx.stroke(); }
    for (let y = Math.ceil(startY / 16) * 16; y < endY; y += 16) { ctx.beginPath(); ctx.moveTo(startX * TILE_SIZE, y * TILE_SIZE); ctx.lineTo(endX * TILE_SIZE, y * TILE_SIZE); ctx.stroke(); }
    const districts = [{ x: 41, y: 31, label: 'NORTH SECTOR' }, { x: 92, y: 47, label: 'MIDTOWN FLOW' }, { x: 42, y: 82, label: 'WEST WARDS' }, { x: 102, y: 82, label: 'EAST GATE' }];
    ctx.font = '600 8px "IBM Plex Mono", monospace'; ctx.fillStyle = 'rgba(213, 231, 222, .33)'; ctx.textAlign = 'left';
    for (const district of districts) if (district.x >= startX && district.x <= endX && district.y >= startY && district.y <= endY) ctx.fillText(district.label, district.x * TILE_SIZE, district.y * TILE_SIZE);
    ctx.restore();
  }

  private drawSystemOverlays(startX: number, startY: number, endX: number, endY: number) {
    const { ctx, game: g } = this;
    for (const building of g.buildings) {
      if (building.x < startX - 9 || building.x > endX + 9 || building.y < startY - 9 || building.y > endY + 9) continue;
      const rule = building.type === 'policestation' ? { color: '#4f8cc9', radius: 72 } : building.type === 'hospital' ? { color: '#d7e7ee', radius: 54 } : building.type === 'park' ? { color: '#4ea36b', radius: 48 } : building.type === 'school' ? { color: '#d4ad55', radius: 55 } : null;
      if (!rule) continue;
      const x = (building.x + building.size / 2) * TILE_SIZE, y = (building.y + building.size / 2) * TILE_SIZE;
      ctx.save(); ctx.globalAlpha = .075; ctx.fillStyle = rule.color; ctx.beginPath(); ctx.arc(x, y, rule.radius, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .38; ctx.strokeStyle = rule.color; ctx.setLineDash([2, 4]); ctx.lineWidth = .65; ctx.beginPath(); ctx.arc(x, y, rule.radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  private drawBuilding(x: number, y: number, type: Tile['type'], size: 1 | 2, night: boolean, gang: Tile['gang']) {
    const { ctx } = this;
    const def = BUILDINGS[type];
    const px = x * TILE_SIZE, py = y * TILE_SIZE, width = TILE_SIZE * size;
    ctx.fillStyle = def.color; ctx.fillRect(px + 1, py + 1, width - 2, width - 2);
    ctx.fillStyle = 'rgba(4,11,17,.28)'; ctx.fillRect(px + 3, py + 3, width - 6, width - 6);
    ctx.strokeStyle = gang === 'none' ? 'rgba(234,241,244,.22)' : this.game.getGangColor(gang);
    ctx.lineWidth = gang === 'none' ? .6 : 1.4; ctx.strokeRect(px + 1.5, py + 1.5, width - 3, width - 3);
    ctx.font = `${size === 2 ? 15 : 10}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#eef6f4'; ctx.fillText(def.icon, px + width / 2, py + width / 2 + .5);
    if (night && ['commercial', 'park', 'stadium', 'bank', 'hospital'].includes(type)) { ctx.fillStyle = 'rgba(49,215,200,.16)'; ctx.fillRect(px - 1, py - 1, width + 2, width + 2); }
    const tile = this.game.tiles[y][x];
    if (tile.hasCrime || tile.hasFire) { ctx.fillStyle = tile.hasFire ? '#f47067' : '#f4cf68'; ctx.beginPath(); ctx.arc(px + width - 3, py + 3, 3, 0, Math.PI * 2); ctx.fill(); }
  }

  private drawHover() {
    const { ctx, game: g } = this;
    const { x, y } = g.hoveredTile;
    if (g.mode !== 'strategy' || x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return;
    const def = g.tool in BUILDINGS ? BUILDINGS[g.tool as Tile['type']] : undefined;
    const size = def?.size ?? 1;
    const valid = g.canPlace(x, y, g.tool);
    ctx.strokeStyle = valid ? '#31d7c8' : '#f47067'; ctx.lineWidth = 1.4;
    ctx.strokeRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, size * TILE_SIZE - 2, size * TILE_SIZE - 2);
    ctx.fillStyle = valid ? 'rgba(49,215,200,.12)' : 'rgba(244,112,103,.12)'; ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, size * TILE_SIZE, size * TILE_SIZE);
    if (valid) {
      const px = x * TILE_SIZE, py = y * TILE_SIZE, w = size * TILE_SIZE;
      ctx.strokeStyle = '#31d7c8'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px + 4, py + 4); ctx.lineTo(px + 4, py + w - 5); ctx.lineTo(px + w - 6, py + w - 5); ctx.stroke();
    }
  }

  private drawAutopilotRoute() {
    const { ctx, game: g } = this;
    if (!g.autopilot || !g.autopilotTarget || g.mode !== 'action' || !g.autopilotPath.length) return;
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#31d7c8'; ctx.lineWidth = 1.5; ctx.globalAlpha = .8;
    ctx.beginPath(); ctx.moveTo(g.player.x, g.player.y);
    for (const waypoint of g.autopilotPath) ctx.lineTo(waypoint.x, waypoint.y);
    ctx.lineTo(g.autopilotTarget.x, g.autopilotTarget.y); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = '#31d7c8'; ctx.beginPath(); ctx.arc(g.autopilotPath[0].x, g.autopilotPath[0].y, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  private drawVehicle(vehicle: Vehicle) {
    const { ctx } = this;
    ctx.save(); ctx.translate(vehicle.x, vehicle.y); ctx.rotate(vehicle.angle);
    const color = vehicle.gang !== 'none' ? GANGS[vehicle.gang].vehicle : vehicle.type === 'police' ? COLORS.police : vehicle.type === 'taxi' ? '#d7ac4c' : vehicle.type === 'bus' ? COLORS.bus : '#c6d2d5';
    ctx.fillStyle = color; ctx.fillRect(-7, -4, 14, 8);
    ctx.fillStyle = '#10212a'; ctx.fillRect(1, -2.5, 4, 5); ctx.fillRect(-5, -2.5, 3, 5);
    if (vehicle.gang !== 'none') { ctx.fillStyle = '#ffffff'; ctx.fillRect(-7, -4, 2, 8); }
    ctx.restore();
  }

  private drawPedestrian(ped: Pedestrian) {
    if (ped.state === 'dead') return;
    const { ctx } = this;
    const color = ped.type === 'enforcer' ? this.game.getGangColor(ped.gang) : ped.type === 'officer' ? COLORS.police : ped.type === 'firefighter' ? COLORS.fire : ped.type === 'medic' ? COLORS.hospital : ped.profession === 'worker' ? '#c9905e' : ped.profession === 'shopkeeper' ? '#49a2b8' : '#c6d2d5';
    ctx.save(); ctx.translate(ped.x, ped.y);
    ctx.fillStyle = color; ctx.fillRect(-3, -4, 6, 8);
    ctx.fillStyle = '#f0d4bc'; ctx.fillRect(-2, -6, 4, 3);
    if (ped.type === 'enforcer') { ctx.fillStyle = '#17212b'; ctx.fillRect(-4, 2, 8, 2); }
    ctx.restore();
  }

  private drawPlayer() {
    const { ctx, game: g } = this;
    ctx.save(); ctx.translate(g.player.x, g.player.y); ctx.rotate(g.player.angle);
    ctx.fillStyle = COLORS.player; ctx.fillRect(-4, -5, 8, 10); ctx.fillStyle = '#17212b'; ctx.fillRect(2, -1, 7, 2); ctx.restore();
  }

  private drawMessage(text: string, x: number, y: number, color: string, life: number) {
    const { ctx } = this;
    ctx.save(); ctx.globalAlpha = Math.min(1, life / 45); ctx.font = '600 9px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#061018'; ctx.fillText(text, x + 1, y + 1); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
  }

  private drawNightLights(startX: number, startY: number, endX: number, endY: number) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(4,10,18,.25)'; ctx.fillRect(this.game.camera.x, this.game.camera.y, this.width / this.game.camera.zoom, this.height / this.game.camera.zoom);
    ctx.fillStyle = 'rgba(234,184,91,.2)';
    for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) if (this.game.tiles[y][x].type === 'road' && (x + y) % 4 === 0) ctx.fillRect(x * TILE_SIZE + 7, y * TILE_SIZE + 7, 2, 2);
  }

  private drawRadar() {
    const { ctx, game: g } = this;
    const size = 102, x = 18, y = this.height - size - 18, scaleX = size / MAP_WIDTH, scaleY = size / MAP_HEIGHT;
    ctx.save(); ctx.fillStyle = 'rgba(6,18,24,.84)'; ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#31d7c8'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.clip();
    for (const b of g.buildings) { ctx.fillStyle = BUILDINGS[b.type].color; ctx.fillRect(x + b.x * scaleX, y + b.y * scaleY, Math.max(2, b.size * scaleX), Math.max(2, b.size * scaleY)); }
    for (const ped of g.pedestrians) if (ped.type === 'enforcer') { ctx.fillStyle = g.getGangColor(ped.gang); ctx.fillRect(x + ped.x / TILE_SIZE * scaleX, y + ped.y / TILE_SIZE * scaleY, 2, 2); }
    ctx.fillStyle = COLORS.player; ctx.beginPath(); ctx.arc(x + g.player.x / TILE_SIZE * scaleX, y + g.player.y / TILE_SIZE * scaleY, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(49,215,200,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 14, y + 16); ctx.lineTo(x + 14, y + 25); ctx.lineTo(x + 23, y + 25); ctx.stroke();
    ctx.fillStyle = '#afc6c8'; ctx.font = '600 8px "IBM Plex Mono", monospace'; ctx.fillText('РАДАР', x + 30, y + 12);
  }

  private drawCrosshair() {
    const { ctx, game: g } = this; const x = g.mouseX, y = g.mouseY;
    ctx.save(); ctx.strokeStyle = '#31d7c8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = '#f4cf68'; ctx.beginPath(); ctx.moveTo(x - 15, y); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, y); ctx.lineTo(x + 15, y); ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 4); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 15); ctx.stroke(); ctx.restore();
  }
}
