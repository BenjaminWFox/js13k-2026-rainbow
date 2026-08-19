import { PLAYER_HEIGHT, PLAYER_WIDTH } from './constants';
import { applyKnockback, enemies, enemyHitbox, hurtEnemyAt } from './enemies';
import { getPlayerHitbox, player } from './player';

// Combat numbers are TBD; placeholders until the tuning phase.
const HORN_COOLDOWN_MS = 650;
const HORN_DAMAGE = 10;
// Old poke was a 13×13 box whose front sat 17.5px from the player center.
const HORN_FORWARD = 35;
const HORN_WIDTH = 13 * 1.5;
const HORN_FLASH_MS = 150;

const STOMP_COOLDOWN_MS = 1800;
const STOMP_DAMAGE = 5;
const STOMP_RADIUS = 66;
const STOMP_KNOCKBACK = 0.36;
const STOMP_FLASH_MS = 200;

let hornTimer = 0;
let stompTimer = 0;
let hornFlash = 0;
let stompFlash = 0;

const hornBox = { x: 0, y: 0, w: 0, h: 0 };
let hornFaceX = 1;
let hornFaceY = 0;
const hornFrom = { x: 0, y: 0 };

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

export function updateCombat(dt: number): void {
  hornTimer -= dt;
  stompTimer -= dt;
  hornFlash = Math.max(0, hornFlash - dt);
  stompFlash = Math.max(0, stompFlash - dt);

  if (hornTimer <= 0) {
    fireHorn();
    hornTimer += HORN_COOLDOWN_MS;
  }
  if (stompTimer <= 0) {
    fireStomp();
    stompTimer += STOMP_COOLDOWN_MS;
  }
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
  const boxBackX =
    player.faceX > 0 ? box.x : player.faceX < 0 ? box.x + box.w : box.x + box.w / 2;
  const boxBackY =
    player.faceY > 0 ? box.y : player.faceY < 0 ? box.y + box.h : box.y + box.h / 2;
  hornFrom.x = (boxBackX + spriteFrontX) / 2;
  hornFrom.y = (boxBackY + spriteFrontY) / 2;
  hornFlash = HORN_FLASH_MS;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemyHitbox(enemies[i]);
    if (overlaps(hornBox.x, hornBox.y, hornBox.w, hornBox.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
      hurtEnemyAt(i, HORN_DAMAGE);
    }
  }
}

function fireStomp(): void {
  const center = playerCenter();
  stompFlash = STOMP_FLASH_MS;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const box = enemyHitbox(enemies[i]);
    const ex = box.x + box.w / 2;
    const ey = box.y + box.h / 2;
    if (Math.hypot(ex - center.x, ey - center.y) > STOMP_RADIUS) {
      continue;
    }
    if (!hurtEnemyAt(i, STOMP_DAMAGE)) {
      applyKnockback(enemies[i], center.x, center.y, STOMP_KNOCKBACK);
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
