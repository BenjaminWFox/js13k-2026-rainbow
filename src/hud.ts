import { bakeText } from './font';
import { RAINBOW_COLORS, unlockedColors } from './palette';
import { level, scrap, scrapSprite, xp, xpNeeded } from './pickups';

const PAD = 4;
const PAUSE_W = 7;
const PAUSE_H = 6;
const PAUSE_PAD = 3;
const XP_W = 60;
const XP_INNER_H = 2;
const SQ = 6;
const SQ_GAP = 1;
const SQ_INNER = 4;

let levelPrefix: HTMLCanvasElement;
let levelNumber: HTMLCanvasElement;
let scrapLabel: HTMLCanvasElement;
let lastLevel = -1;
let lastScrap = -1;

export function bakeHud(): void {
  levelPrefix = bakeText('LEVEL');
}

function formatScrap(n: number): string {
  let s = String(n | 0);
  let out = '';
  while (s.length > 3) {
    out = ',' + s.slice(-3) + out;
    s = s.slice(0, -3);
  }
  return s + out;
}

function outlinedBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  innerW: number,
  innerH: number,
  fill: number
): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, innerW + 2, innerH + 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 1, y + 1, Math.round(innerW * fill), innerH);
}

/** Pause icon plus a little extra pad so the tiny glyph is clickable. */
export function pauseIconContains(x: number, y: number): boolean {
  return (
    x >= PAD - PAUSE_PAD &&
    x < PAD + PAUSE_W + PAUSE_PAD &&
    y >= PAD - PAUSE_PAD &&
    y < PAD + PAUSE_H + PAUSE_PAD
  );
}

/** Screen-space HUD. */
export function drawHud(ctx: CanvasRenderingContext2D, viewWidth: number): void {
  if (level !== lastLevel) {
    lastLevel = level;
    levelNumber = bakeText(String(level), '#fff', 1, levelNumber);
  }
  if (scrap !== lastScrap) {
    lastScrap = scrap;
    scrapLabel = bakeText(formatScrap(scrap), '#fff', 1, scrapLabel);
  }

  // Pause icon: two white 1×4 bars, 1px black outline, 1px gap
  for (const ox of [0, 4]) {
    ctx.fillStyle = '#000';
    ctx.fillRect(PAD + ox, PAD, 3, 6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(PAD + ox + 1, PAD + 1, 1, 4);
  }

  const barX = Math.floor((viewWidth - XP_W) / 2);
  const barY = PAD;
  const need = xpNeeded();
  outlinedBar(ctx, barX, barY, XP_W - 2, XP_INNER_H, need > 0 ? Math.min(1, xp / need) : 1);

  const levelX = barX + XP_W + 2;
  const levelW = levelPrefix.width + 2 + levelNumber.width;
  ctx.fillStyle = '#000';
  ctx.fillRect(levelX - 1, barY - 1, levelW + 2, levelPrefix.height + 2);
  ctx.drawImage(levelPrefix, levelX, barY);
  ctx.drawImage(levelNumber, levelX + levelPrefix.width + 2, barY);

  const rowW = 7 * SQ + 6 * SQ_GAP;
  let sqX = barX + Math.floor((XP_W - rowW) / 2);
  const sqY = barY + XP_INNER_H + 4;
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = '#000';
    ctx.fillRect(sqX, sqY, SQ, SQ);
    ctx.fillStyle = unlockedColors[i]
      ? '#' + RAINBOW_COLORS[i].toString(16).padStart(6, '0')
      : '#747474';
    ctx.fillRect(sqX + 1, sqY + 1, SQ_INNER, SQ_INNER);
    sqX += SQ + SQ_GAP;
  }

  const iconX = viewWidth - PAD - scrapSprite.width;
  const scrapX = iconX - 2 - scrapLabel.width;
  const scrapY = PAD + 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(scrapX - 1, scrapY - 1, scrapLabel.width + 2, scrapLabel.height + 2);
  ctx.drawImage(scrapSprite, iconX, PAD);
  ctx.drawImage(scrapLabel, scrapX, scrapY);
}
