import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants';
import { getTile, TILE_WALL } from './map';
import { pipePieces } from './pipes';
import { damagePlayer, getPlayerHitbox } from './player';
import { createSprite, measureContentBox } from './sprites';

/**
 * Difficulty ladder (easiest → hardest) mapped to sheet cell index within the
 * 7×9 enemy strip at (33,0). Ladder order: paperclip, pencil, binder clip,
 * pen, USB stick, stapler, calculator, scissors.
 */
const TIER_SHEET_INDEX = [4, 1, 0, 2, 6, 3, 5, 7];

const ENEMY_CAP = 150;
// Baseline ~2 enemies/sec (surge spawns are a later phase)
const SPAWN_INTERVAL_MS = 500;
// Extra distance past the half view diagonal so spawns land just off-screen
const SPAWN_MARGIN = 16;
// Past this multiple of the spawn radius an enemy is recycled back to the ring
const TELEPORT_FACTOR = 1.75;
const CONTACT_TICK_MS = 500;
// px/ms — per-type speeds TBD; every type shares this for now (player is 0.05)
const ENEMY_SPEED = 0.03;
const BOB_PERIOD_MS = 900;

// Coarse separation grid over the whole map
const GRID_CELL = 22;
const GRID_W = Math.ceil((MAP_WIDTH * TILE_SIZE) / GRID_CELL);
const GRID_H = Math.ceil((MAP_HEIGHT * TILE_SIZE) / GRID_CELL);

interface EnemyType {
  canvas: HTMLCanvasElement;
  /** Content-sized hitbox, relative to the 7×9 cell origin. */
  hitX: number;
  hitY: number;
  hitW: number;
  hitH: number;
  /** Separation radius: half the larger hitbox dimension. */
  radius: number;
  contactDamage: number;
}

const enemyTypes: EnemyType[] = [];

export interface Enemy {
  /** Top-left of the 7×9 sprite cell, world px. */
  x: number;
  y: number;
  /** Index into the difficulty ladder (0 = paperclip). */
  type: number;
  bobTime: number;
  contactTimer: number;
}

export const enemies: Enemy[] = [];

// Tiers allowed to spawn; each destroyed pipe unlocks the next (phase 6)
const unlockedTiers = 1;

/** Bake one canvas + content hitbox per enemy type. Call once after the sheet loads. */
export function bakeEnemyTypes(): void {
  for (let tier = 0; tier < TIER_SHEET_INDEX.length; tier++) {
    const sheetX = 33 + TIER_SHEET_INDEX[tier] * 7;
    const box = measureContentBox(sheetX, 0, 7, 9);
    enemyTypes.push({
      canvas: createSprite(sheetX, 0, 7, 9),
      hitX: box.x,
      hitY: box.y,
      hitW: box.w,
      hitH: box.h,
      radius: Math.max(box.w, box.h) / 2,
      contactDamage: tier + 1,
    });
  }
}

let spawnTimer = 0;
let lastSpawnRadius = 200;

export function updateEnemies(dt: number, viewWidth: number, viewHeight: number): void {
  const spawnRadius = Math.hypot(viewWidth, viewHeight) / 2 + SPAWN_MARGIN;
  lastSpawnRadius = spawnRadius;
  const playerHit = getPlayerHitbox();
  const playerCenterX = playerHit.x + playerHit.w / 2;
  const playerCenterY = playerHit.y + playerHit.h / 2;

  spawnTimer += dt;
  while (spawnTimer >= SPAWN_INTERVAL_MS) {
    spawnTimer -= SPAWN_INTERVAL_MS;
    trySpawn(playerCenterX, playerCenterY, spawnRadius);
  }

  const teleportRadius = spawnRadius * TELEPORT_FACTOR;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const type = enemyTypes[enemy.type];
    enemy.bobTime += dt;
    enemy.contactTimer = Math.max(0, enemy.contactTimer - dt);

    const centerX = enemy.x + type.hitX + type.hitW / 2;
    const centerY = enemy.y + type.hitY + type.hitH / 2;
    const towardX = playerCenterX - centerX;
    const towardY = playerCenterY - centerY;
    const dist = Math.hypot(towardX, towardY);

    if (dist > teleportRadius) {
      // Too far: teleport back to the spawn ring — unless we're near the cap,
      // in which case despawn in favor of fresh spawns.
      if (enemies.length >= ENEMY_CAP - 5) {
        enemies.splice(i, 1);
      } else {
        const spot = findSpawnSpot(type, playerCenterX, playerCenterY, spawnRadius);
        if (spot) {
          enemy.x = spot.x;
          enemy.y = spot.y;
          enemy.contactTimer = 0;
        }
      }
      continue;
    }

    // Chase: straight toward the player; walls block, pipes don't
    if (dist > 1) {
      const step = ENEMY_SPEED * dt;
      const moveX = (towardX / dist) * step;
      const moveY = (towardY / dist) * step;
      if (!hitsWall(enemy.x + type.hitX + moveX, enemy.y + type.hitY, type.hitW, type.hitH)) {
        enemy.x += moveX;
      }
      if (!hitsWall(enemy.x + type.hitX, enemy.y + type.hitY + moveY, type.hitW, type.hitH)) {
        enemy.y += moveY;
      }
    }

    // Contact damage: only once the enemy hitbox is >25% inside the player
    // hitbox, then a tick every 0.5s while it stays there. No player knockback.
    const hitLeft = enemy.x + type.hitX;
    const hitTop = enemy.y + type.hitY;
    const overlapW =
      Math.min(hitLeft + type.hitW, playerHit.x + playerHit.w) - Math.max(hitLeft, playerHit.x);
    const overlapH =
      Math.min(hitTop + type.hitH, playerHit.y + playerHit.h) - Math.max(hitTop, playerHit.y);
    if (
      overlapW > 0 &&
      overlapH > 0 &&
      overlapW * overlapH > 0.25 * type.hitW * type.hitH &&
      enemy.contactTimer <= 0
    ) {
      damagePlayer(type.contactDamage);
      enemy.contactTimer = CONTACT_TICK_MS;
    }
  }

  separate();
}

function trySpawn(playerCenterX: number, playerCenterY: number, radius: number): void {
  if (enemies.length >= ENEMY_CAP) {
    return;
  }
  const tier = Math.floor(Math.random() * unlockedTiers);
  const type = enemyTypes[tier];
  const spot = findSpawnSpot(type, playerCenterX, playerCenterY, radius);
  if (spot) {
    enemies.push({
      x: spot.x,
      y: spot.y,
      type: tier,
      bobTime: Math.random() * BOB_PERIOD_MS,
      contactTimer: 0,
    });
  }
}

/** Dev helper: burst-spawn toward the cap (tree-shaken out of production). */
export function spawnBurst(count: number): void {
  const playerHit = getPlayerHitbox();
  for (let i = 0; i < count; i++) {
    trySpawn(playerHit.x + playerHit.w / 2, playerHit.y + playerHit.h / 2, lastSpawnRadius);
  }
}

/** A ring position whose hitbox avoids walls and pipes, or null after 10 tries. */
function findSpawnSpot(
  type: EnemyType,
  playerCenterX: number,
  playerCenterY: number,
  radius: number
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 10; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const hitLeft = playerCenterX + Math.cos(angle) * radius - type.hitW / 2;
    const hitTop = playerCenterY + Math.sin(angle) * radius - type.hitH / 2;
    if (
      !hitsWall(hitLeft, hitTop, type.hitW, type.hitH) &&
      !onPipe(hitLeft, hitTop, type.hitW, type.hitH)
    ) {
      return { x: hitLeft - type.hitX, y: hitTop - type.hitY };
    }
  }
  return null;
}

function hitsWall(x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x / TILE_SIZE);
  const y0 = Math.floor(y / TILE_SIZE);
  const x1 = Math.floor((x + w - 0.001) / TILE_SIZE);
  const y1 = Math.floor((y + h - 0.001) / TILE_SIZE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (getTile(tx, ty) === TILE_WALL) {
        return true;
      }
    }
  }
  return false;
}

function onPipe(x: number, y: number, w: number, h: number): boolean {
  for (const piece of pipePieces) {
    for (const solid of piece.hits ?? []) {
      if (x < solid.x + solid.w && x + w > solid.x && y < solid.y + solid.h && y + h > solid.y) {
        return true;
      }
    }
  }
  return false;
}

// Linked-list spatial hash: gridHead per cell, gridNext per enemy index
const gridHead = new Int32Array(GRID_W * GRID_H);
const gridNext = new Int32Array(ENEMY_CAP);

function cellCoord(value: number, max: number): number {
  return Math.min(max - 1, Math.max(0, Math.floor(value / GRID_CELL)));
}

/**
 * Pairwise push-apart via the coarse grid: enemies may overlap up to 50%,
 * never fully — centers stay at least half the combined radii apart.
 */
function separate(): void {
  gridHead.fill(-1);
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    const type = enemyTypes[enemy.type];
    const cell =
      cellCoord(enemy.y + type.hitY + type.hitH / 2, GRID_H) * GRID_W +
      cellCoord(enemy.x + type.hitX + type.hitW / 2, GRID_W);
    gridNext[i] = gridHead[cell];
    gridHead[cell] = i;
  }

  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    const typeA = enemyTypes[a.type];
    const ax = a.x + typeA.hitX + typeA.hitW / 2;
    const ay = a.y + typeA.hitY + typeA.hitH / 2;
    const cellX = cellCoord(ax, GRID_W);
    const cellY = cellCoord(ay, GRID_H);
    for (let gy = Math.max(0, cellY - 1); gy <= Math.min(GRID_H - 1, cellY + 1); gy++) {
      for (let gx = Math.max(0, cellX - 1); gx <= Math.min(GRID_W - 1, cellX + 1); gx++) {
        for (let j = gridHead[gy * GRID_W + gx]; j !== -1; j = gridNext[j]) {
          if (j <= i) {
            continue;
          }
          const b = enemies[j];
          const typeB = enemyTypes[b.type];
          const minDist = (typeA.radius + typeB.radius) * 0.5;
          let dx = b.x + typeB.hitX + typeB.hitW / 2 - ax;
          let dy = b.y + typeB.hitY + typeB.hitH / 2 - ay;
          let dist = Math.hypot(dx, dy);
          if (dist >= minDist) {
            continue;
          }
          if (dist < 0.01) {
            // Fully stacked: pick an arbitrary axis to split along
            dx = 1;
            dy = 0;
            dist = 1;
          }
          const push = (minDist - dist) / 2 / dist;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
  }

  // Separation ignores walls; keep hitboxes inside the wall ring
  const maxRight = (MAP_WIDTH - 1) * TILE_SIZE;
  const maxBottom = (MAP_HEIGHT - 1) * TILE_SIZE;
  for (const enemy of enemies) {
    const type = enemyTypes[enemy.type];
    enemy.x = Math.min(maxRight - type.hitW - type.hitX, Math.max(TILE_SIZE - type.hitX, enemy.x));
    enemy.y = Math.min(maxBottom - type.hitH - type.hitY, Math.max(TILE_SIZE - type.hitY, enemy.y));
  }
}

export function drawEnemies(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  viewWidth: number,
  viewHeight: number
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (const enemy of enemies) {
    const type = enemyTypes[enemy.type];
    const screenX = Math.floor(enemy.x - cameraX);
    const screenY = Math.floor(enemy.y - cameraY);
    if (screenX + 7 < 0 || screenY + 10 < 0 || screenX > viewWidth || screenY > viewHeight) {
      continue;
    }
    // 1px float bob; the shadow hugs the ground and grows on the "down" frame
    const down = enemy.bobTime % BOB_PERIOD_MS < BOB_PERIOD_MS / 2;
    const shadowW = down ? 5 : 3;
    ctx.fillRect(
      screenX + type.hitX + ((type.hitW - shadowW) >> 1),
      screenY + type.hitY + type.hitH,
      shadowW,
      1
    );
    ctx.drawImage(type.canvas, screenX, screenY - (down ? 0 : 1));
  }
}

/** World-space content hitbox (also used by the debug overlay). */
export function enemyHitbox(enemy: Enemy): { x: number; y: number; w: number; h: number } {
  const type = enemyTypes[enemy.type];
  return { x: enemy.x + type.hitX, y: enemy.y + type.hitY, w: type.hitW, h: type.hitH };
}
