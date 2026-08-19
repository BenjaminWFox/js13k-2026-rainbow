interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const particles: Particle[] = [];

const LIFE_MS = 320;
const SPEED_MIN = 0.04;
const SPEED_MAX = 0.14;

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

export function resetExplosions(): void {
  particles.length = 0;
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
  ctx.globalAlpha = 1;
}
