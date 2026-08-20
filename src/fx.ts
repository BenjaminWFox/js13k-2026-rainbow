import { drawText, measureText } from './font';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface DamagePop {
  x: number;
  y: number;
  life: number;
  text: string;
}

const particles: Particle[] = [];
const pops: DamagePop[] = [];

const LIFE_MS = 320;
const SPEED_MIN = 0.04;
const SPEED_MAX = 0.14;
const POP_MS = 600;
const POP_RISE = 12;

/**
 * Tintable burst-of-pixels. Used for enemy deaths, the player taking a hit,
 * and (later) pipe-segment destruction.
 */
export function spawnExplosion(x: number, y: number, color: number, count = 10): void {
  const css = '#' + color.toString(16).padStart(6, '0');
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
    particles.push({
      x: x + Math.random() - 0.5,
      y: y + Math.random() - 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: LIFE_MS * (0.7 + Math.random() * 0.3),
      color: css,
    });
  }
}

/** White-on-black floating damage, same look as the scrap HUD counter. */
export function spawnDamageNumber(x: number, y: number, amount: number): void {
  const n = Math.round(amount);
  if (n <= 0) {
    return;
  }
  pops.push({
    x: x + (Math.random() - 0.5) * 6,
    y,
    life: POP_MS,
    text: String(n),
  });
}

export function resetExplosions(): void {
  particles.length = 0;
  pops.length = 0;
}

export function updateExplosions(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    pops[i].life -= dt;
    if (pops[i].life <= 0) {
      pops.splice(i, 1);
    }
  }
}

export function drawExplosions(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  viewWidth: number,
  viewHeight: number
): void {
  for (const p of particles) {
    const sx = Math.floor(p.x - cameraX);
    const sy = Math.floor(p.y - cameraY);
    if (sx < 0 || sy < 0 || sx >= viewWidth || sy >= viewHeight) {
      continue;
    }
    ctx.globalAlpha = Math.max(0, p.life / LIFE_MS);
    ctx.fillStyle = p.color;
    ctx.fillRect(sx, sy, 1, 1);
  }
  for (const pop of pops) {
    const t = 1 - pop.life / POP_MS;
    const { w, h } = measureText(pop.text);
    const sx = Math.floor(pop.x - cameraX - w / 2);
    const sy = Math.floor(pop.y - cameraY - t * POP_RISE);
    if (sx + w < 0 || sy + h < 0 || sx > viewWidth || sy > viewHeight) {
      continue;
    }
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = '#000';
    ctx.fillRect(sx - 1, sy - 1, w + 2, h + 2);
    drawText(ctx, pop.text, sx, sy);
  }
  ctx.globalAlpha = 1;
}
