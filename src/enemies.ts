import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_HIT,
  PLAYER_SPEED,
  TILE_SIZE,
  WALK_FRAME_MS,
} from './constants';
import { playHit } from './audio';
import { spawnDamageNumber, spawnExplosion } from './fx';
import { getTile, TILE_WALL } from './map';
import { RAINBOW_COLORS } from './palette';
import { dropBossLoot, dropLoot } from './pickups';
import { pipeHomes, pipePieces } from './pipes';
import { damagePlayer, getPlayerHitbox } from './player';
import { afterRebake, createSprite, createWalkSprites, measureContentBox } from './sprites';

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
const MINI_SPEED = 0.04;
const MINI_SPEED_YELLOW = 0.06;
const FINAL_HP = 200;
/** `color` on the final boss; minibosses use 0–6, regulars use -1. */
export const FINAL_BOSS = -2;
const CHASE_IN = 75;
const CHASE_OUT = 250;
const RESET_RANGE = 500;
const MINI_CONTACT = 5;
const BOB_PERIOD_MS = 900;
const MINI_HIT_Y = PLAYER_HEIGHT - PLAYER_HIT;

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
  /** Per-type HP is TBD; paperclip=8, +4 per tier. */
  hp: number;
}

const enemyTypes: EnemyType[] = [];

export interface Enemy {
  /** Top-left of the 7×9 sprite cell, world px. */
  x: number;
  y: number;
  /** Index into the difficulty ladder (0 = paperclip). */
  type: number;
  hp: number;
  /** Knockback velocity, px/ms. */
  kbX: number;
  kbY: number;
  bobTime: number;
  contactTimer: number;
  /** Remaining freeze (ms). Frozen entities take +25% damage. */
  frozen: number;
  /** Remaining slow (ms). Minibosses/boss get this instead of freeze. */
  slowed: number;
  /** True for minibosses and the final boss: CC slows instead of freezing. */
  boss: boolean;
  /** -1 = regular enemy; 0–6 = the miniboss that guards that color. */
  color: number;
  maxHp: number;
  homeX: number;
  homeY: number;
  /** Attack cooldown remaining (ms). */
  cd: number;
  shield: number;
  chasing: boolean;
  /** Bosses only: walked this frame — drives the leg-cut walk cycle. */
  moving: boolean;
}

export const enemies: Enemy[] = [];

// Tiers allowed to spawn; each destroyed pipe unlocks the next type
let unlockedTiers = 1;

/**
 * Shared Business Man bakes, eyes tinted per color — also cutscene actors.
 * Each entry is [idle, left leg-cut, right leg-cut] (§3 Animation).
 */
export const minibossSprites: HTMLCanvasElement[][] = [];
export let finalBossSprites: HTMLCanvasElement[] | undefined;

const miniHit = {
  hitX: 0,
  hitY: MINI_HIT_Y,
  hitW: PLAYER_HIT,
  hitH: PLAYER_HIT,
  radius: PLAYER_HIT / 2,
  contactDamage: MINI_CONTACT,
};

/** Set when a miniboss dies; consumed the same frame to start the death sequence. */
let slainMiniboss: { color: number; x: number; y: number } | null = null;
let slainFinalBoss = false;

export function takeSlainMiniboss(): { color: number; x: number; y: number } | null {
  const slain = slainMiniboss;
  slainMiniboss = null;
  return slain;
}

export function takeSlainFinalBoss(): boolean {
  const slain = slainFinalBoss;
  slainFinalBoss = false;
  return slain;
}

function hitOf(enemy: Enemy): {
  hitX: number;
  hitY: number;
  hitW: number;
  hitH: number;
  radius: number;
  contactDamage: number;
} {
  return enemy.boss ? miniHit : enemyTypes[enemy.type];
}

function tintEyes(canvas: HTMLCanvasElement, rgb: number): void {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#' + rgb.toString(16).padStart(6, '0');
  ctx.fillRect(4, 6, 1, 1);
  ctx.fillRect(6, 6, 1, 1);
}

function retintBossEyes(): void {
  for (let i = 0; i < minibossSprites.length; i++) {
    for (const frame of minibossSprites[i]) {
      tintEyes(frame, RAINBOW_COLORS[i]);
    }
  }
}

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
      hp: 8 + tier * 4,
    });
  }
  if (minibossSprites.length === 0) {
    for (let i = 0; i < 7; i++) {
      minibossSprites.push(createWalkSprites(11, 0, 11, 19));
    }
    afterRebake(retintBossEyes);
  }
  if (!finalBossSprites) {
    finalBossSprites = createWalkSprites(22, 0, 11, 19);
  }
  retintBossEyes();
}

let spawnTimer = 0;
let lastSpawnRadius = 200;

export function resetEnemies(): void {
  enemies.length = 0;
  spawnTimer = 0;
  unlockedTiers = 1;
  slainMiniboss = null;
  slainFinalBoss = false;
  spawnMinibosses();
}

function spawnMinibosses(): void {
  for (let i = 0; i < pipeHomes.length; i++) {
    const home = pipeHomes[i];
    enemies.push({
      x: home.x,
      y: home.y,
      type: 0,
      hp: 100,
      kbX: 0,
      kbY: 0,
      bobTime: 0,
      contactTimer: 0,
      frozen: 0,
      slowed: 0,
      boss: true,
      color: i,
      maxHp: 100,
      homeX: home.x,
      homeY: home.y,
      cd: 0,
      shield: 0,
      chasing: false,
      moving: false,
    });
  }
}

export function spawnFinalBoss(x: number, y: number): void {
  enemies.push({
    x,
    y,
    type: 0,
    hp: FINAL_HP,
    kbX: 0,
    kbY: 0,
    bobTime: 0,
    contactTimer: 0,
    frozen: 0,
    slowed: 0,
    boss: true,
    color: FINAL_BOSS,
    maxHp: FINAL_HP,
    homeX: x,
    homeY: y,
    cd: 0,
    shield: 0,
    chasing: true,
    moving: false,
  });
}

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
    const type = hitOf(enemy);
    const isMini = enemy.color >= 0;
    if (enemy.frozen > 0) {
      enemy.frozen = Math.max(0, enemy.frozen - dt);
    } else if (!enemy.boss) {
      enemy.bobTime += dt;
    }
    if (enemy.slowed > 0) {
      enemy.slowed = Math.max(0, enemy.slowed - dt);
    }
    enemy.contactTimer = Math.max(0, enemy.contactTimer - dt);

    const centerX = enemy.x + type.hitX + type.hitW / 2;
    const centerY = enemy.y + type.hitY + type.hitH / 2;
    const towardX = playerCenterX - centerX;
    const towardY = playerCenterY - centerY;
    const dist = Math.hypot(towardX, towardY);

    if (!enemy.boss && dist > teleportRadius) {
      // Too far: teleport back to the spawn ring — unless we're near the cap,
      // in which case despawn in favor of fresh spawns.
      if (enemies.length >= ENEMY_CAP - 5) {
        enemies.splice(i, 1);
      } else {
        const spot = findSpawnSpot(
          enemyTypes[enemy.type],
          playerCenterX,
          playerCenterY,
          spawnRadius
        );
        if (spot) {
          enemy.x = spot.x;
          enemy.y = spot.y;
          enemy.contactTimer = 0;
          enemy.kbX = 0;
          enemy.kbY = 0;
        }
      }
      continue;
    }

    if (isMini) {
      if (dist > RESET_RANGE) {
        enemy.hp = enemy.maxHp;
        enemy.shield = 0;
        enemy.slowed = 0;
        enemy.chasing = false;
      } else if (dist > CHASE_OUT) {
        enemy.chasing = false;
      } else if (dist < CHASE_IN) {
        enemy.chasing = true;
      }
    } else if (enemy.boss) {
      enemy.chasing = true;
    }

    // Knockback from stomp, decaying independently of the chase
    if (enemy.kbX !== 0 || enemy.kbY !== 0) {
      const kbx = enemy.kbX * dt;
      const kby = enemy.kbY * dt;
      if (!hitsWall(enemy.x + type.hitX + kbx, enemy.y + type.hitY, type.hitW, type.hitH)) {
        enemy.x += kbx;
      }
      if (!hitsWall(enemy.x + type.hitX, enemy.y + type.hitY + kby, type.hitW, type.hitH)) {
        enemy.y += kby;
      }
      const decay = Math.exp(-dt / 80);
      enemy.kbX *= decay;
      enemy.kbY *= decay;
      if (Math.hypot(enemy.kbX, enemy.kbY) < 0.01) {
        enemy.kbX = 0;
        enemy.kbY = 0;
      }
    }

    let moveX = towardX;
    let moveY = towardY;
    let moveDist = dist;
    let speed = ENEMY_SPEED;
    if (enemy.color === FINAL_BOSS) {
      speed = PLAYER_SPEED;
    } else if (isMini) {
      speed = enemy.color === 2 ? MINI_SPEED_YELLOW : MINI_SPEED;
      if (!enemy.chasing) {
        moveX = enemy.homeX - enemy.x;
        moveY = enemy.homeY - enemy.y;
        moveDist = Math.hypot(moveX, moveY);
      }
    }

    // Chase: straight toward the player; walls block, pipes don't
    const preX = enemy.x;
    const preY = enemy.y;
    if (moveDist > 1 && enemy.frozen <= 0) {
      const step = speed * (enemy.slowed > 0 ? 0.5 : 1) * dt;
      const dx = (moveX / moveDist) * step;
      const dy = (moveY / moveDist) * step;
      if (!hitsWall(enemy.x + type.hitX + dx, enemy.y + type.hitY, type.hitW, type.hitH)) {
        enemy.x += dx;
      }
      if (!hitsWall(enemy.x + type.hitX, enemy.y + type.hitY + dy, type.hitW, type.hitH)) {
        enemy.y += dy;
      }
    }
    if (enemy.boss) {
      // Bosses reuse bobTime as the walk-cycle clock (regulars use it to bob)
      enemy.moving = enemy.x !== preX || enemy.y !== preY;
      if (enemy.moving) {
        enemy.bobTime += dt;
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
      hp: type.hp,
      kbX: 0,
      kbY: 0,
      bobTime: Math.random() * BOB_PERIOD_MS,
      contactTimer: 0,
      frozen: 0,
      slowed: 0,
      boss: false,
      color: -1,
      maxHp: type.hp,
      homeX: 0,
      homeY: 0,
      cd: 0,
      shield: 0,
      chasing: false,
      moving: false,
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
    const type = hitOf(enemy);
    const cell =
      cellCoord(enemy.y + type.hitY + type.hitH / 2, GRID_H) * GRID_W +
      cellCoord(enemy.x + type.hitX + type.hitW / 2, GRID_W);
    gridNext[i] = gridHead[cell];
    gridHead[cell] = i;
  }

  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    const typeA = hitOf(a);
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
          const typeB = hitOf(b);
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
    const type = hitOf(enemy);
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
    if (enemy.boss) {
      continue;
    }
    const type = hitOf(enemy);
    const canvas = enemyTypes[enemy.type].canvas;
    const screenX = Math.floor(enemy.x - cameraX);
    const screenY = Math.floor(enemy.y - cameraY);
    if (
      screenX + canvas.width < 0 ||
      screenY + canvas.height < 0 ||
      screenX > viewWidth ||
      screenY > viewHeight
    ) {
      continue;
    }
    const down = enemy.frozen > 0 || enemy.bobTime % BOB_PERIOD_MS < BOB_PERIOD_MS / 2;
    const shadowW = down ? 5 : 3;
    ctx.fillRect(
      screenX + type.hitX + ((type.hitW - shadowW) >> 1),
      screenY + type.hitY + type.hitH,
      shadowW,
      1
    );
    ctx.drawImage(canvas, screenX, screenY - (down ? 0 : 1));
    if (enemy.frozen > 0) {
      ctx.strokeStyle = '#8df';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        screenX + type.hitX + 0.5,
        screenY + type.hitY - (down ? 0 : 1) + 0.5,
        type.hitW - 1,
        type.hitH - 1
      );
    }
  }
  for (const enemy of enemies) {
    if (!enemy.boss) {
      continue;
    }
    const frames =
      enemy.color === FINAL_BOSS
        ? (finalBossSprites as HTMLCanvasElement[])
        : minibossSprites[enemy.color];
    const canvas =
      frames[enemy.moving ? 1 + (((enemy.bobTime / WALK_FRAME_MS) | 0) % 2) : 0];
    const screenX = Math.floor(enemy.x - cameraX);
    const screenY = Math.floor(enemy.y - cameraY);
    if (
      screenX + canvas.width < 0 ||
      screenY + canvas.height < 0 ||
      screenX > viewWidth ||
      screenY > viewHeight
    ) {
      continue;
    }
    ctx.drawImage(canvas, screenX, screenY);
    ctx.fillStyle = '#000';
    ctx.fillRect(screenX, screenY + canvas.height + 1, canvas.width, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(
      screenX + 1,
      screenY + canvas.height + 2,
      Math.round((canvas.width - 2) * (enemy.hp / enemy.maxHp)),
      1
    );
    if (enemy.shield > 0) {
      const cx = screenX + canvas.width / 2;
      const cy = screenY + canvas.height / 2;
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#a656ff';
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (enemy.slowed > 0) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#8df';
      ctx.fillRect(screenX, screenY, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
  }
}

/** World-space content hitbox (also used by the debug overlay). */
export function enemyHitbox(enemy: Enemy): { x: number; y: number; w: number; h: number } {
  const type = hitOf(enemy);
  return { x: enemy.x + type.hitX, y: enemy.y + type.hitY, w: type.hitW, h: type.hitH };
}

/** Freeze regulars; minibosses/boss are slowed for 2× the duration instead. */
export function crowdControl(enemy: Enemy, freezeMs: number): void {
  if (enemy.boss) {
    enemy.slowed = Math.max(enemy.slowed, freezeMs * 2);
  } else {
    enemy.frozen = Math.max(enemy.frozen, freezeMs);
  }
}

export function crowdControlAt(x: number, y: number, radius: number, freezeMs: number): void {
  for (const enemy of enemies) {
    const box = enemyHitbox(enemy);
    if (Math.hypot(box.x + box.w / 2 - x, box.y + box.h / 2 - y) <= radius) {
      crowdControl(enemy, freezeMs);
    }
  }
}

/** Returns true if the enemy died. Safe to call while reverse-iterating `enemies`. */
export function hurtEnemyAt(index: number, amount: number): boolean {
  const enemy = enemies[index];
  playHit();
  if (enemy.frozen > 0) {
    amount *= 1.25;
  }
  const box = enemyHitbox(enemy);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  spawnDamageNumber(cx, enemy.y - 6, amount);
  if (enemy.shield > 0) {
    const used = Math.min(enemy.shield, amount);
    enemy.shield -= used;
    amount -= used;
    spawnExplosion(cx, cy, 0xa656ff, 4);
    if (amount <= 0) {
      return false;
    }
  }
  enemy.hp -= amount;
  if (enemy.hp > 0) {
    return false;
  }
  if (enemy.color === FINAL_BOSS) {
    spawnExplosion(cx, cy, 0x000000, 22);
    spawnExplosion(cx, cy, 0xffffff, 14);
    dropBossLoot(cx, cy);
    slainFinalBoss = true;
    enemies.splice(index, 1);
    return true;
  }
  if (enemy.color >= 0) {
    spawnExplosion(cx, cy, RAINBOW_COLORS[enemy.color], 18);
    dropBossLoot(cx, cy);
    slainMiniboss = { color: enemy.color, x: cx, y: cy };
    enemies.splice(index, 1);
    return true;
  }
  killRegularAt(index);
  return true;
}

function killRegularAt(index: number): void {
  const box = enemyHitbox(enemies[index]);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  spawnExplosion(cx, cy, 0xb1b1b1, 12);
  dropLoot(cx, cy);
  enemies.splice(index, 1);
}

/** Kill visible regulars so they drop loot; minibosses are left alone. */
export function killOnScreenRegulars(
  camX: number,
  camY: number,
  viewW: number,
  viewH: number
): void {
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].boss) {
      continue;
    }
    const box = enemyHitbox(enemies[i]);
    if (
      box.x + box.w < camX ||
      box.x > camX + viewW ||
      box.y + box.h < camY ||
      box.y > camY + viewH
    ) {
      continue;
    }
    killRegularAt(i);
  }
}

export function unlockNextTier(): void {
  unlockedTiers = Math.min(8, unlockedTiers + 1);
}

export function applyKnockback(enemy: Enemy, fromX: number, fromY: number, speed: number): void {
  const box = enemyHitbox(enemy);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let dx = cx - fromX;
  let dy = cy - fromY;
  let dist = Math.hypot(dx, dy);
  if (dist < 0.01) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  if (enemy.boss) {
    speed *= 0.5;
  }
  enemy.kbX = (dx / dist) * speed;
  enemy.kbY = (dy / dist) * speed;
}
