import { PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE } from './constants';
import {
  applyKnockback,
  crowdControl,
  crowdControlAt,
  type Enemy,
  enemies,
  enemyHitbox,
  FINAL_BOSS,
  hurtEnemyAt,
} from './enemies';
import { getTile, TILE_WALL } from './map';
import { RAINBOW_COLORS, unlockedColors } from './palette';
import { damagePlayer, freezePlayer, getPlayerHitbox, player } from './player';
import { hornPwr, novaPwr } from './stats';

const HORN_COOLDOWN_MS = 650;
const HORN_DAMAGE = 10;
const HORN_FORWARD = 35;
const HORN_WIDTH = 13 * 1.5;
const HORN_FLASH_MS = 150;

const STOMP_DAMAGE = 5;
const NOVA_RADIUS = 66;
const STOMP_KNOCKBACK = 0.36;

const FIREBALL_DAMAGE = 8;
const BOLT_SPEED = 0.18;
const BOLT_SIZE = 4;

const FLAME_NOVA_DAMAGE = 6;
const NOVA_PERIOD = 2000;
const NOVA_LIFE = 500;
const YELLOW_PERIOD = 500;
const SPEED_BURST_MS = 1000;
const FREEZE_MS = 500;
/** 2× the 7px enemy sprite cell — "small impact radius". */
const FROSTBALL_RADIUS = 14;

const HEAL_AMOUNT = 8;

const BOLT_FIRE = 0;
const BOLT_FROST = 1;

const N_WHITE = 1;
const N_RED = 2;
const N_ORANGE = 4;
const N_YELLOW = 8;
const N_GREEN = 16;
const N_BLUE = 32;
const N_INDIGO = 64;
const N_VIOLET = 128;
const N_FINALE = N_RED | N_ORANGE | N_GREEN | N_BLUE | N_INDIGO | N_VIOLET;

let hornCd = 0;
let novaCd = 0;
let hornFlash = 0;

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

interface Nova {
  owner: Enemy | null;
  bits: number;
  pwr: number;
  life: number;
  lastR: number;
  seen: Enemy[];
  hitP: boolean;
}

const bolts: Bolt[] = [];
const novas: Nova[] = [];

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

function enemyCenter(enemy: Enemy): { x: number; y: number } {
  const box = enemyHitbox(enemy);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function novaCenter(n: Nova): { x: number; y: number } {
  return n.owner ? enemyCenter(n.owner) : playerCenter();
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

function playerBits(): number {
  let bits = N_WHITE;
  for (let i = 0; i < 7; i++) {
    if (unlockedColors[i]) {
      bits |= 2 << i;
    }
  }
  return bits;
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

  hornCd -= dt;
  if (hornCd <= 0) {
    fireHorn();
    hornCd += HORN_COOLDOWN_MS;
  }

  novaCd -= dt;
  if (novaCd <= 0) {
    fireNova(null, playerBits());
    novaCd += NOVA_PERIOD;
  }

  for (const enemy of enemies) {
    if (!enemy.boss || !enemy.chasing) {
      continue;
    }
    enemy.cd -= dt;
    if (enemy.cd > 0) {
      continue;
    }
    fireNova(enemy, enemy.color === FINAL_BOSS ? N_FINALE : 2 << enemy.color);
    enemy.cd += enemy.color === 2 ? YELLOW_PERIOD : NOVA_PERIOD;
  }

  updateNovas(dt);
  updateBolts(dt);
}

export function resetCombat(): void {
  hornCd = 0;
  novaCd = 0;
  hornFlash = 0;
  bolts.length = 0;
  novas.length = 0;
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
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemyHitbox(enemies[i]);
    if (overlaps(hornBox.x, hornBox.y, hornBox.w, hornBox.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
      hurtEnemyAt(i, HORN_DAMAGE * hornPwr());
    }
  }
}

function fireNova(owner: Enemy | null, bits: number): void {
  const pwr = owner ? 1 : novaPwr();
  const c = owner ? enemyCenter(owner) : playerCenter();
  if (bits & N_GREEN) {
    if (owner) {
      owner.hp = Math.min(owner.maxHp, owner.hp + HEAL_AMOUNT);
    } else {
      player.hp = Math.min(player.maxHp, player.hp + HEAL_AMOUNT * pwr);
    }
  }
  if (bits & N_YELLOW) {
    if (owner) {
      owner.boost = SPEED_BURST_MS;
    } else {
      player.boost = SPEED_BURST_MS;
    }
  }
  if (bits & (N_RED | N_INDIGO)) {
    const t = owner ? playerCenter() : nearestEnemyCenter(c.x, c.y);
    if (t) {
      if (bits & N_RED) {
        spawnBolt(c.x, c.y, t.x, t.y, BOLT_FIRE, FIREBALL_DAMAGE * pwr, !owner);
      }
      if (bits & N_INDIGO) {
        spawnBolt(c.x, c.y, t.x, t.y, BOLT_FROST, 0, !owner, FREEZE_MS * pwr);
      }
    }
  }
  novas.push({ owner, bits, pwr, life: NOVA_LIFE, lastR: -1, seen: [], hitP: false });
}

function spawnBolt(
  x: number,
  y: number,
  tx: number,
  ty: number,
  kind: number,
  damage: number,
  friendly: boolean,
  freezeMs = 0
): void {
  const dx = tx - x;
  const dy = ty - y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.01) {
    return;
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
}

function updateNovas(dt: number): void {
  for (let i = novas.length - 1; i >= 0; i--) {
    const n = novas[i];
    n.life -= dt;
    const r = (1 - n.life / NOVA_LIFE) * NOVA_RADIUS;
    const c = novaCenter(n);
    const freeze = n.bits & N_BLUE ? FREEZE_MS * n.pwr : 0;
    const dmg =
      ((n.bits & N_WHITE ? STOMP_DAMAGE : 0) + (n.bits & N_ORANGE ? FLAME_NOVA_DAMAGE : 0)) * n.pwr;

    if (n.bits & N_VIOLET) {
      for (let b = bolts.length - 1; b >= 0; b--) {
        const p = bolts[b];
        if (n.owner ? !p.friendly : p.friendly) {
          continue;
        }
        const dist = Math.hypot(p.x - c.x, p.y - c.y);
        if (n.lastR < dist && dist <= r) {
          bolts.splice(b, 1);
        }
      }
    }

    if (!n.owner) {
      for (let e = enemies.length - 1; e >= 0; e--) {
        const enemy = enemies[e];
        if (n.seen.indexOf(enemy) >= 0) {
          continue;
        }
        const box = enemyHitbox(enemy);
        const dist = Math.hypot(box.x + box.w / 2 - c.x, box.y + box.h / 2 - c.y);
        if (n.lastR >= dist || dist > r) {
          continue;
        }
        n.seen.push(enemy);
        if (freeze) {
          crowdControl(enemy, freeze);
        }
        let alive = true;
        if (dmg) {
          alive = !hurtEnemyAt(e, dmg);
        }
        if (alive && n.bits & N_WHITE) {
          applyKnockback(enemy, c.x, c.y, STOMP_KNOCKBACK);
        }
      }
    } else if (!n.hitP) {
      const hit = getPlayerHitbox();
      const dist = Math.hypot(hit.x + hit.w / 2 - c.x, hit.y + hit.h / 2 - c.y);
      if (n.lastR < dist && dist <= r) {
        n.hitP = true;
        if (freeze) {
          freezePlayer(freeze);
        }
        if (dmg) {
          damagePlayer(dmg);
        }
      }
    }

    n.lastR = r;
    if (n.life <= 0) {
      novas.splice(i, 1);
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

  ctx.lineWidth = 1;
  for (const n of novas) {
    const c = novaCenter(n);
    const r = (1 - n.life / NOVA_LIFE) * NOVA_RADIUS;
    const cols: string[] = [];
    if (n.bits & N_WHITE) {
      cols.push('#fff');
    }
    for (let i = 0; i < 7; i++) {
      if (n.bits & (2 << i)) {
        cols.push('#' + RAINBOW_COLORS[i].toString(16).padStart(6, '0'));
      }
    }
    const cx = Math.floor(c.x - cameraX) + 0.5;
    const cy = Math.floor(c.y - cameraY) + 0.5;
    for (let i = 0; i < cols.length; i++) {
      const band = r - (cols.length - 1 - i);
      if (band < 1) {
        continue;
      }
      ctx.strokeStyle = cols[i];
      ctx.beginPath();
      ctx.arc(cx, cy, band, 0, Math.PI * 2);
      ctx.stroke();
    }
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

/** Debug: live horn AABB (follows facing) and nova radius. */
export function combatDebug(): {
  horn: { x: number; y: number; w: number; h: number };
  radius: number;
} {
  return { horn: hornHitbox(), radius: NOVA_RADIUS };
}
