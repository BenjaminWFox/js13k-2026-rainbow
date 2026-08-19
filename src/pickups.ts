import { PLAYER_SPEED, PLAYER_WIDTH } from './constants';
import { getPlayerHitbox } from './player';
import { createSprite } from './sprites';

export const PICKUP_CRYSTAL = 0;
export const PICKUP_SCRAP = 1;

// Inherent drop chances are TBD; these are placeholders until the tuning phase.
const CRYSTAL_CHANCE = 0.5;
const SCRAP_CHANCE = 0.2;

const MAGNET_RADIUS = PLAYER_WIDTH * 2;
const PULL_SPEED = PLAYER_SPEED * 1.5;
const MAGNET_DELAY_MS = 500;
const CRYSTAL_W = 2;
const CRYSTAL_H = 4;
const SCRAP_W = 4;
const SCRAP_H = 4;

interface Pickup {
  x: number;
  y: number;
  kind: number;
  delay: number;
}

export const pickups: Pickup[] = [];

/** In-run XP; level-up UI lands in a later phase. */
export let xp = 0;
/** Magneted scrap this session; persistence lands with the shop. */
export let scrap = 0;

let crystalSprite: HTMLCanvasElement;
let scrapSprite: HTMLCanvasElement;

export function bakePickups(): void {
  crystalSprite = createSprite(89, 0, CRYSTAL_W, CRYSTAL_H);
  scrapSprite = createSprite(92, 0, SCRAP_W, SCRAP_H);
}

/** Independent crystal/scrap rolls at a world point (usually an enemy center). */
export function dropLoot(x: number, y: number): void {
  if (Math.random() < CRYSTAL_CHANCE) {
    pickups.push({
      x: x - CRYSTAL_W / 2 + (Math.random() - 0.5) * 4,
      y: y - CRYSTAL_H / 2 + (Math.random() - 0.5) * 4,
      kind: PICKUP_CRYSTAL,
      delay: MAGNET_DELAY_MS,
    });
  }
  if (Math.random() < SCRAP_CHANCE) {
    pickups.push({
      x: x - SCRAP_W / 2 + (Math.random() - 0.5) * 4,
      y: y - SCRAP_H / 2 + (Math.random() - 0.5) * 4,
      kind: PICKUP_SCRAP,
      delay: MAGNET_DELAY_MS,
    });
  }
}

export function updatePickups(dt: number): void {
  const hit = getPlayerHitbox();
  const cx = hit.x + hit.w / 2;
  const cy = hit.y + hit.h / 2;
  const pull = PULL_SPEED * dt;

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (p.delay > 0) {
      p.delay -= dt;
      continue;
    }
    const pw = p.kind === PICKUP_CRYSTAL ? CRYSTAL_W : SCRAP_W;
    const ph = p.kind === PICKUP_CRYSTAL ? CRYSTAL_H : SCRAP_H;
    const pcx = p.x + pw / 2;
    const pcy = p.y + ph / 2;
    const dx = cx - pcx;
    const dy = cy - pcy;
    const dist = Math.hypot(dx, dy);

    if (dist < MAGNET_RADIUS && dist > 0.01) {
      const step = Math.min(pull, dist);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
    }

    if (p.x < hit.x + hit.w && p.x + pw > hit.x && p.y < hit.y + hit.h && p.y + ph > hit.y) {
      if (p.kind === PICKUP_CRYSTAL) {
        xp += 1;
      } else {
        scrap += 1;
      }
      pickups.splice(i, 1);
    }
  }
}

export function drawPickups(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  viewWidth: number,
  viewHeight: number
): void {
  for (const p of pickups) {
    const canvas = p.kind === PICKUP_CRYSTAL ? crystalSprite : scrapSprite;
    const screenX = Math.floor(p.x - cameraX);
    const screenY = Math.floor(p.y - cameraY);
    if (
      screenX + canvas.width < 0 ||
      screenY + canvas.height < 0 ||
      screenX > viewWidth ||
      screenY > viewHeight
    ) {
      continue;
    }
    ctx.drawImage(canvas, screenX, screenY);
  }
}
