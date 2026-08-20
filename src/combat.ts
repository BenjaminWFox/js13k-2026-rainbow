import { playExplosion, playHorn } from './audio';
import { PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE } from './constants';
import {
  applyKnockback,
  crowdControl,
  crowdControlAt,
  enemies,
  enemyHitbox,
  FINAL_BOSS,
  hurtEnemyAt,
} from './enemies';
import { drawText } from './font';
import { getTile, TILE_WALL } from './map';
import { RAINBOW_COLORS } from './palette';
import { damagePlayer, freezePlayer, getPlayerHitbox, player } from './player';
import {
  colorDamage,
  kitDamage,
  POWER_FIREBALL,
  POWER_FLAME_NOVA,
  POWER_FROST_NOVA,
  POWER_FROSTBALL,
  POWER_HEAL,
  POWER_HORN,
  POWER_SHIELD,
  POWER_STOMP,
  powerAmount,
  powerCooldown,
  powerRanks,
} from './stats';

// Combat numbers are TBD; placeholders until the tuning phase.
const HORN_COOLDOWN_MS = 650;
const HORN_DAMAGE = 10;
const HORN_FORWARD = 35;
const HORN_WIDTH = 13 * 1.5;
const HORN_FLASH_MS = 150;

const STOMP_COOLDOWN_MS = 1800;
const STOMP_DAMAGE = 5;
const STOMP_RADIUS = 66;
const STOMP_KNOCKBACK = 0.36;
const STOMP_FLASH_MS = 200;

const FIREBALL_COOLDOWN_MS = 800;
const FIREBALL_DAMAGE = 8;
const FROSTBALL_COOLDOWN_MS = 3000;
const BOLT_SPEED = 0.18;
const BOLT_SIZE = 4;

const FLAME_NOVA_COOLDOWN_MS = 2200;
const FLAME_NOVA_DAMAGE = 6;
const FROST_NOVA_COOLDOWN_MS = 5000;
const NOVA_RADIUS = 56;
const NOVA_FLASH_MS = 280;
const FREEZE_MS = 500;
/** 2× the 7px enemy sprite cell — "small impact radius". */
const FROSTBALL_RADIUS = 14;

const HEAL_COOLDOWN_MS = 4000;
const HEAL_AMOUNT = 8;
const HEAL_FX_MS = 450;

const SHIELD_COOLDOWN_MS = 6000;
const SHIELD_ABSORB = 15;
const SHIELD_RADIUS = 13;

export const BOLT_FIRE = 0;
export const BOLT_FROST = 1;

const cdTimer = [0, 0, 0, 0, 0, 0, 0, 0, 0];
/** Fireball, flame nova, heal, frost nova, frostball, shield. */
const finaleCd = [0, 0, 0, 0, 0, 0];
let hornFlash = 0;
let stompFlash = 0;

const hornBox = { x: 0, y: 0, w: 0, h: 0 };
let hornFaceX = 1;
let hornFaceY = 0;
const hornFrom = { x: 0, y: 0 };

interface Bolt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: number;
  damage: number;
  freezeMs: number;
  friendly: boolean;
}

interface RingFx {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

interface HealFx {
  x: number;
  y: number;
  life: number;
}

const bolts: Bolt[] = [];
const novas: RingFx[] = [];
const heals: HealFx[] = [];

let viewX = 0;
let viewY = 0;
let viewW = 1;
let viewH = 1;

function hornHitbox(): { x: number; y: number; w: number; h: number } {
  const center = playerCenter();
  const sl = player.x;
  const st = player.y;
  const sr = player.x + PLAYER_WIDTH;
  const sb = player.y + PLAYER_HEIGHT;
  let x0 = sl;
  let y0 = st;
  let x1 = sr;
  let y1 = sb;

  // Expand only in facing directions so the trailing sprite corner stays flush
  // (e.g. down-left starts at the sprite's top-right, not past it).
  if (player.faceX < 0) {
    x0 = center.x - HORN_FORWARD;
  } else if (player.faceX > 0) {
    x1 = center.x + HORN_FORWARD;
  }
  if (player.faceY < 0) {
    y0 = center.y - HORN_FORWARD;
  } else if (player.faceY > 0) {
    y1 = center.y + HORN_FORWARD;
  }

  // 50% wider than the original 13px poke, on the axis perpendicular to facing
  if (player.faceY === 0) {
    y0 = Math.min(y0, center.y - HORN_WIDTH / 2);
    y1 = Math.max(y1, center.y + HORN_WIDTH / 2);
  } else if (player.faceX === 0) {
    x0 = Math.min(x0, center.x - HORN_WIDTH / 2);
    x1 = Math.max(x1, center.x + HORN_WIDTH / 2);
  }

  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function playerCenter(): { x: number; y: number } {
  const hit = getPlayerHitbox();
  return { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 };
}

function overlaps(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function wallBox(x: number, y: number, w: number, h: number): boolean {
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

function nearestEnemyCenter(fromX: number, fromY: number): { x: number; y: number } | null {
  let bestX = 0;
  let bestY = 0;
  let bestD = Infinity;
  for (const enemy of enemies) {
    const box = enemyHitbox(enemy);
    const ex = box.x + box.w / 2;
    const ey = box.y + box.h / 2;
    const d = Math.hypot(ex - fromX, ey - fromY);
    if (d < bestD) {
      bestD = d;
      bestX = ex;
      bestY = ey;
    }
  }
  return bestD === Infinity ? null : { x: bestX, y: bestY };
}

function tickFire(id: number, dt: number, baseCd: number, fire: () => boolean): void {
  if (powerRanks[id] < 1) {
    return;
  }
  cdTimer[id] -= dt;
  if (cdTimer[id] > 0) {
    return;
  }
  if (fire()) {
    cdTimer[id] += powerCooldown(baseCd, id);
  } else {
    cdTimer[id] = 0;
  }
}

export function updateCombat(
  dt: number,
  cameraX: number,
  cameraY: number,
  viewWidth: number,
  viewHeight: number
): void {
  viewX = cameraX;
  viewY = cameraY;
  viewW = viewWidth;
  viewH = viewHeight;

  hornFlash = Math.max(0, hornFlash - dt);
  stompFlash = Math.max(0, stompFlash - dt);

  tickFire(POWER_HORN, dt, HORN_COOLDOWN_MS, () => {
    fireHorn();
    return true;
  });
  tickFire(POWER_STOMP, dt, STOMP_COOLDOWN_MS, () => {
    fireStomp();
    return true;
  });
  tickFire(POWER_FIREBALL, dt, FIREBALL_COOLDOWN_MS, tryFireball);
  tickFire(POWER_FROSTBALL, dt, FROSTBALL_COOLDOWN_MS, tryFrostball);
  tickFire(POWER_FLAME_NOVA, dt, FLAME_NOVA_COOLDOWN_MS, () => {
    const c = playerCenter();
    fireNova(
      c.x,
      c.y,
      NOVA_RADIUS,
      colorDamage(FLAME_NOVA_DAMAGE, POWER_FLAME_NOVA),
      0,
      '#ff8200',
      true
    );
    return true;
  });
  tickFire(POWER_FROST_NOVA, dt, FROST_NOVA_COOLDOWN_MS, () => {
    const c = playerCenter();
    fireNova(c.x, c.y, NOVA_RADIUS, 0, powerAmount(FREEZE_MS, POWER_FROST_NOVA), '#0030e2', true);
    return true;
  });
  tickFire(POWER_HEAL, dt, HEAL_COOLDOWN_MS, () => {
    player.hp = Math.min(player.maxHp, player.hp + powerAmount(HEAL_AMOUNT, POWER_HEAL));
    heals.push({ x: player.x + PLAYER_WIDTH / 2, y: player.y - 2, life: HEAL_FX_MS });
    return true;
  });
  tickFire(POWER_SHIELD, dt, SHIELD_COOLDOWN_MS, () => {
    if (player.shield > 0) {
      return false;
    }
    player.shield = powerAmount(SHIELD_ABSORB, POWER_SHIELD);
    return true;
  });

  updateMinibossPowers(dt);
  updateFinalePowers(dt);

  updateBolts(dt);
  for (let i = novas.length - 1; i >= 0; i--) {
    novas[i].life -= dt;
    if (novas[i].life <= 0) {
      novas.splice(i, 1);
    }
  }
  for (let i = heals.length - 1; i >= 0; i--) {
    heals[i].life -= dt;
    if (heals[i].life <= 0) {
      heals.splice(i, 1);
    }
  }
}

export function resetCombat(): void {
  cdTimer.fill(0);
  finaleCd.fill(0);
  hornFlash = 0;
  stompFlash = 0;
  bolts.length = 0;
  novas.length = 0;
  heals.length = 0;
}

/** Stagger the final boss's first volley so it doesn't dump every power on spawn. */
export function primeFinalePowers(): void {
  finaleCd[0] = 500;
  finaleCd[1] = 1100;
  finaleCd[2] = 2200;
  finaleCd[3] = 1400;
  finaleCd[4] = 800;
  finaleCd[5] = 200;
}

function fireHorn(): void {
  const box = hornHitbox();
  hornBox.x = box.x;
  hornBox.y = box.y;
  hornBox.w = box.w;
  hornBox.h = box.h;
  hornFaceX = player.faceX;
  hornFaceY = player.faceY;
  const spriteFrontX =
    player.faceX > 0
      ? player.x + PLAYER_WIDTH
      : player.faceX < 0
        ? player.x
        : player.x + PLAYER_WIDTH / 2;
  const spriteFrontY =
    player.faceY > 0
      ? player.y + PLAYER_HEIGHT
      : player.faceY < 0
        ? player.y
        : player.y + PLAYER_HEIGHT / 2;
  const boxBackX = player.faceX > 0 ? box.x : player.faceX < 0 ? box.x + box.w : box.x + box.w / 2;
  const boxBackY = player.faceY > 0 ? box.y : player.faceY < 0 ? box.y + box.h : box.y + box.h / 2;
  hornFrom.x = (boxBackX + spriteFrontX) / 2;
  hornFrom.y = (boxBackY + spriteFrontY) / 2;
  hornFlash = HORN_FLASH_MS;
  playHorn();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemyHitbox(enemies[i]);
    if (overlaps(hornBox.x, hornBox.y, hornBox.w, hornBox.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
      hurtEnemyAt(i, kitDamage(HORN_DAMAGE, POWER_HORN));
    }
  }
}

function fireStomp(): void {
  const center = playerCenter();
  stompFlash = STOMP_FLASH_MS;
  playExplosion();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const box = enemyHitbox(enemies[i]);
    const ex = box.x + box.w / 2;
    const ey = box.y + box.h / 2;
    if (Math.hypot(ex - center.x, ey - center.y) > STOMP_RADIUS) {
      continue;
    }
    if (!hurtEnemyAt(i, kitDamage(STOMP_DAMAGE, POWER_STOMP))) {
      applyKnockback(enemies[i], center.x, center.y, STOMP_KNOCKBACK);
    }
  }
}

function tryFireball(): boolean {
  const c = playerCenter();
  const t = nearestEnemyCenter(c.x, c.y);
  if (!t) {
    return false;
  }
  return spawnBolt(
    c.x,
    c.y,
    t.x,
    t.y,
    BOLT_FIRE,
    colorDamage(FIREBALL_DAMAGE, POWER_FIREBALL),
    true
  );
}

function tryFrostball(): boolean {
  const c = playerCenter();
  const t = nearestEnemyCenter(c.x, c.y);
  if (!t) {
    return false;
  }
  return spawnBolt(
    c.x,
    c.y,
    t.x,
    t.y,
    BOLT_FROST,
    0,
    true,
    powerAmount(FREEZE_MS, POWER_FROSTBALL)
  );
}

function updateMinibossPowers(dt: number): void {
  const target = playerCenter();
  for (const enemy of enemies) {
    if (enemy.color < 0 || enemy.color === 2 || !enemy.chasing) {
      continue;
    }
    enemy.cd -= dt;
    if (enemy.cd > 0) {
      continue;
    }
    const box = enemyHitbox(enemy);
    const x = box.x + box.w / 2;
    const y = box.y + box.h / 2;
    const color = enemy.color;
    if (color === 0) {
      spawnBolt(x, y, target.x, target.y, BOLT_FIRE, FIREBALL_DAMAGE, false);
      enemy.cd = FIREBALL_COOLDOWN_MS;
    } else if (color === 1) {
      fireNova(x, y, NOVA_RADIUS, FLAME_NOVA_DAMAGE, 0, '#ff8200', false);
      enemy.cd = FLAME_NOVA_COOLDOWN_MS;
    } else if (color === 3) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + HEAL_AMOUNT);
      enemy.cd = HEAL_COOLDOWN_MS;
    } else if (color === 4) {
      fireNova(x, y, NOVA_RADIUS, 0, FREEZE_MS, '#0030e2', false);
      enemy.cd = FROST_NOVA_COOLDOWN_MS;
    } else if (color === 5) {
      spawnBolt(x, y, target.x, target.y, BOLT_FROST, 0, false, FREEZE_MS);
      enemy.cd = FROSTBALL_COOLDOWN_MS;
    } else if (color === 6) {
      if (enemy.shield > 0) {
        enemy.cd = 0;
        continue;
      }
      enemy.shield = SHIELD_ABSORB;
      enemy.cd = SHIELD_COOLDOWN_MS;
    }
  }
}

function tickFinale(i: number, dt: number, baseCd: number, fire: () => boolean): void {
  finaleCd[i] -= dt;
  if (finaleCd[i] > 0) {
    return;
  }
  if (fire()) {
    finaleCd[i] += baseCd;
  } else {
    finaleCd[i] = 0;
  }
}

function updateFinalePowers(dt: number): void {
  let found = null;
  for (const enemy of enemies) {
    if (enemy.color === FINAL_BOSS) {
      found = enemy;
      break;
    }
  }
  if (!found) {
    return;
  }
  const boss = found;
  const target = playerCenter();
  const box = enemyHitbox(boss);
  const x = box.x + box.w / 2;
  const y = box.y + box.h / 2;
  tickFinale(0, dt, FIREBALL_COOLDOWN_MS, () =>
    spawnBolt(x, y, target.x, target.y, BOLT_FIRE, FIREBALL_DAMAGE, false)
  );
  tickFinale(1, dt, FLAME_NOVA_COOLDOWN_MS, () => {
    fireNova(x, y, NOVA_RADIUS, FLAME_NOVA_DAMAGE, 0, '#ff8200', false);
    return true;
  });
  tickFinale(2, dt, HEAL_COOLDOWN_MS, () => {
    if (boss.hp >= boss.maxHp) {
      return false;
    }
    boss.hp = Math.min(boss.maxHp, boss.hp + HEAL_AMOUNT);
    return true;
  });
  tickFinale(3, dt, FROST_NOVA_COOLDOWN_MS, () => {
    fireNova(x, y, NOVA_RADIUS, 0, FREEZE_MS, '#0030e2', false);
    return true;
  });
  tickFinale(4, dt, FROSTBALL_COOLDOWN_MS, () =>
    spawnBolt(x, y, target.x, target.y, BOLT_FROST, 0, false, FREEZE_MS)
  );
  tickFinale(5, dt, SHIELD_COOLDOWN_MS, () => {
    if (boss.shield > 0) {
      return false;
    }
    boss.shield = SHIELD_ABSORB;
    return true;
  });
}

/**
 * Straight-line bolt toward a point at fire-time (no tracking).
 * `friendly` hits enemies; otherwise it hits the player. Minibosses reuse this.
 */
export function spawnBolt(
  x: number,
  y: number,
  tx: number,
  ty: number,
  kind: number,
  damage: number,
  friendly: boolean,
  freezeMs = 0
): boolean {
  const dx = tx - x;
  const dy = ty - y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.01) {
    return false;
  }
  bolts.push({
    x,
    y,
    vx: (dx / dist) * BOLT_SPEED,
    vy: (dy / dist) * BOLT_SPEED,
    kind,
    damage,
    freezeMs,
    friendly,
  });
  return true;
}

/** Area burst. `friendly` damages enemies; otherwise it hits the player. */
export function fireNova(
  x: number,
  y: number,
  radius: number,
  damage: number,
  freezeMs: number,
  color: string,
  friendly: boolean
): void {
  novas.push({ x, y, radius, life: NOVA_FLASH_MS, maxLife: NOVA_FLASH_MS, color });
  playExplosion();
  if (friendly) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      const box = enemyHitbox(enemy);
      if (Math.hypot(box.x + box.w / 2 - x, box.y + box.h / 2 - y) > radius) {
        continue;
      }
      let alive = true;
      if (damage > 0) {
        alive = !hurtEnemyAt(i, damage);
      }
      if (alive && freezeMs > 0) {
        crowdControl(enemy, freezeMs);
      }
    }
    return;
  }
  const hit = getPlayerHitbox();
  if (Math.hypot(hit.x + hit.w / 2 - x, hit.y + hit.h / 2 - y) <= radius) {
    if (damage > 0) {
      damagePlayer(damage);
    }
    if (freezeMs > 0) {
      freezePlayer(freezeMs);
    }
  }
}

function updateBolts(dt: number): void {
  const hw = BOLT_SIZE / 2;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const p = bolts[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (wallBox(p.x - hw, p.y - hw, BOLT_SIZE, BOLT_SIZE)) {
      bolts.splice(i, 1);
      continue;
    }
    const sx = p.x - viewX;
    const sy = p.y - viewY;
    if (sx + hw < 0 || sy + hw < 0 || sx - hw > viewW || sy - hw > viewH) {
      bolts.splice(i, 1);
      continue;
    }
    if (p.friendly) {
      let hit = -1;
      for (let e = 0; e < enemies.length; e++) {
        const box = enemyHitbox(enemies[e]);
        if (overlaps(p.x - hw, p.y - hw, BOLT_SIZE, BOLT_SIZE, box.x, box.y, box.w, box.h)) {
          hit = e;
          break;
        }
      }
      if (hit < 0) {
        continue;
      }
      if (p.damage > 0) {
        hurtEnemyAt(hit, p.damage);
      }
      if (p.freezeMs > 0) {
        crowdControlAt(p.x, p.y, FROSTBALL_RADIUS, p.freezeMs);
      }
      bolts.splice(i, 1);
    } else {
      const box = getPlayerHitbox();
      if (!overlaps(p.x - hw, p.y - hw, BOLT_SIZE, BOLT_SIZE, box.x, box.y, box.w, box.h)) {
        continue;
      }
      if (p.damage > 0) {
        damagePlayer(p.damage);
      }
      if (p.freezeMs > 0) {
        freezePlayer(p.freezeMs);
        crowdControlAt(p.x, p.y, FROSTBALL_RADIUS, p.freezeMs);
      }
      bolts.splice(i, 1);
    }
  }
}

export function drawCombat(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
  if (hornFlash > 0) {
    const fx = hornFaceX;
    const fy = hornFaceY;
    const len = Math.hypot(fx, fy) || 1;
    const nx = fx / len;
    const ny = fy / len;
    const px = -ny;
    const py = nx;
    const tipX =
      (fx > 0 ? hornBox.x + hornBox.w : fx < 0 ? hornBox.x : hornBox.x + hornBox.w / 2) - cameraX;
    const tipY =
      (fy > 0 ? hornBox.y + hornBox.h : fy < 0 ? hornBox.y : hornBox.y + hornBox.h / 2) - cameraY;
    const fromX = hornFrom.x - cameraX;
    const fromY = hornFrom.y - cameraY;
    const chevronLen = 12;
    const spread = 8;
    const reach = Math.max(chevronLen, (tipX - fromX) * nx + (tipY - fromY) * ny);
    const t = 1 - hornFlash / HORN_FLASH_MS;
    const travel = chevronLen + t * (reach - chevronLen);
    const curTipX = fromX + nx * travel;
    const curTipY = fromY + ny * travel;
    const curBackX = curTipX - nx * chevronLen;
    const curBackY = curTipY - ny * chevronLen;
    const w1x = curBackX + px * spread;
    const w1y = curBackY + py * spread;
    const w2x = curBackX - px * spread;
    const w2y = curBackY - py * spread;

    ctx.lineWidth = 1;
    ctx.lineJoin = 'miter';
    strokeChevron(ctx, w1x, w1y, curTipX, curTipY, w2x, w2y, '#000');
    strokeChevron(
      ctx,
      w1x + nx - px,
      w1y + ny - py,
      curTipX - nx,
      curTipY - ny,
      w2x + nx + px,
      w2y + ny + py,
      '#fff'
    );
  }

  if (stompFlash > 0) {
    const center = playerCenter();
    const t = 1 - stompFlash / STOMP_FLASH_MS;
    const cx = Math.floor(center.x - cameraX) + 0.5;
    const cy = Math.floor(center.y - cameraY) + 0.5;
    const r = 4 + t * (STOMP_RADIUS - 4);
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, r - 1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.lineWidth = 1;
  for (const nova of novas) {
    const t = 1 - nova.life / nova.maxLife;
    const cx = Math.floor(nova.x - cameraX) + 0.5;
    const cy = Math.floor(nova.y - cameraY) + 0.5;
    const r = 4 + t * (nova.radius - 4);
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = nova.color;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, r - 1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const hw = (BOLT_SIZE / 2) | 0;
  for (const p of bolts) {
    const sx = Math.floor(p.x - cameraX) - hw;
    const sy = Math.floor(p.y - cameraY) - hw;
    ctx.fillStyle = '#000';
    ctx.fillRect(sx, sy, BOLT_SIZE + 1, BOLT_SIZE + 1);
    ctx.fillStyle =
      '#' + RAINBOW_COLORS[p.kind === BOLT_FROST ? 5 : 0].toString(16).padStart(6, '0');
    ctx.fillRect(sx + 1, sy + 1, BOLT_SIZE - 1, BOLT_SIZE - 1);
  }

  if (player.shield > 0) {
    const sx = Math.floor(player.x - cameraX);
    const sy = Math.floor(player.y - cameraY);
    const cx = sx + PLAYER_WIDTH / 2;
    const cy = sy + PLAYER_HEIGHT / 2;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx, cy, SHIELD_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#a656ff';
    ctx.beginPath();
    ctx.arc(cx, cy, SHIELD_RADIUS - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (player.frozen > 0) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#8df';
    ctx.fillRect(
      Math.floor(player.x - cameraX),
      Math.floor(player.y - cameraY),
      PLAYER_WIDTH,
      PLAYER_HEIGHT
    );
    ctx.globalAlpha = 1;
  }

  for (const fx of heals) {
    const t = 1 - fx.life / HEAL_FX_MS;
    ctx.globalAlpha = 1 - t;
    drawText(
      ctx,
      '+',
      Math.floor(fx.x - cameraX - 1),
      Math.floor(fx.y - cameraY - t * 10),
      '#08ba00'
    );
    ctx.globalAlpha = 1;
  }
}

function strokeChevron(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string
): void {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(Math.floor(x0) + 0.5, Math.floor(y0) + 0.5);
  ctx.lineTo(Math.floor(x1) + 0.5, Math.floor(y1) + 0.5);
  ctx.lineTo(Math.floor(x2) + 0.5, Math.floor(y2) + 0.5);
  ctx.stroke();
}

/** Debug: live horn AABB (follows facing) and stomp radius. */
export function combatDebug(): {
  horn: { x: number; y: number; w: number; h: number };
  radius: number;
} {
  return { horn: hornHitbox(), radius: STOMP_RADIUS };
}
