import { PLAYER_HEIGHT } from './constants';
import { bakeText, drawText, FONT_GAP, FONT_H, FONT_W, measureText } from './font';
import { mouse, wasPressed } from './input';
import { RAINBOW_COLORS } from './palette';

const LAYOUT_LIST = 0;
const LAYOUT_CARDS = 1;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

let layout = LAYOUT_LIST;
let heading: HTMLCanvasElement | null = null;
let subheading: HTMLCanvasElement | null = null;
let headingTop = false;
let labels: HTMLCanvasElement[] = [];
let bodies: HTMLCanvasElement[] = [];
let selected = 0;
let onPick: ((index: number) => void) | null = null;
const rects: Rect[] = [];
let headingX = 0;
let headingY = 0;
let subX = 0;
let subY = 0;

export function isUiOpen(): boolean {
  return onPick !== null;
}

export function closeUi(): void {
  onPick = null;
  heading = null;
  subheading = null;
  labels = [];
  bodies = [];
  rects.length = 0;
}

/** ROYGBIV per letter; 1px black outline for contrast on the plaza. */
function bakeRainbowTitle(text: string, scale: number): HTMLCanvasElement {
  const { w, h } = measureText(text, scale);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w + 2);
  canvas.height = Math.max(1, h + 2);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  let colorIndex = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') {
      continue;
    }
    const ox = 1 + i * (FONT_W + FONT_GAP) * scale;
    drawText(ctx, ch, ox - 1, 1, '#000', scale);
    drawText(ctx, ch, ox + 1, 1, '#000', scale);
    drawText(ctx, ch, ox, 0, '#000', scale);
    drawText(ctx, ch, ox, 2, '#000', scale);
    drawText(
      ctx,
      ch,
      ox,
      1,
      '#' + RAINBOW_COLORS[colorIndex % 7].toString(16).padStart(6, '0'),
      scale
    );
    colorIndex++;
  }
  return canvas;
}

export function openMenu(
  title: string | null,
  items: string[],
  pick: (index: number) => void,
  titleScale = 1,
  titleAtTop = false,
  subtitle?: string
): void {
  layout = LAYOUT_LIST;
  heading = title
    ? titleAtTop
      ? bakeRainbowTitle(title, titleScale)
      : bakeText(title, '#fff', titleScale)
    : null;
  subheading = subtitle ? bakeText(subtitle) : null;
  headingTop = titleAtTop;
  labels = items.map((item) => bakeText(item));
  bodies = [];
  selected = 0;
  onPick = pick;
}

export function openCards(
  title: string | null,
  items: { title: string; body: string }[],
  pick: (index: number) => void,
  titleColor = '#fff'
): void {
  layout = LAYOUT_CARDS;
  heading = title ? bakeText(title, titleColor) : null;
  subheading = null;
  headingTop = false;
  labels = items.map((item) => bakeText(item.title));
  bodies = items.map((item) => bakeText(item.body));
  selected = 0;
  onPick = pick;
}

function pointIn(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function layoutUi(viewWidth: number, viewHeight: number): void {
  rects.length = 0;
  headingX = 0;
  headingY = 0;
  subX = 0;
  subY = 0;
  const n = labels.length;
  if (n === 0) {
    return;
  }

  if (layout === LAYOUT_LIST) {
    const padX = headingTop ? 6 : 4;
    const padY = headingTop ? 4 : 3;
    const boxH = labels[0].height + padY * 2 + 2;
    const gap = headingTop ? 4 : 3;
    let inner = 40;
    for (const label of labels) {
      if (label.width > inner) {
        inner = label.width;
      }
    }
    const boxW = inner + padX * 2 + 2;
    const blockH = n * boxH + (n - 1) * gap;
    const x = (viewWidth - boxW) >> 1;
    const subH = subheading ? subheading.height + 4 : 0;
    let y: number;
    if (heading) {
      headingX = (viewWidth - heading.width) >> 1;
      if (headingTop) {
        // Unicorn is camera-centered; shard sits 25px above its sprite top.
        const playerY = (viewHeight - PLAYER_HEIGHT) >> 1;
        headingY = playerY - 25 - 8 - heading.height;
        y = playerY + PLAYER_HEIGHT + 8;
      } else {
        const total = heading.height + 8 + subH + blockH;
        headingY = (viewHeight - total) >> 1;
        if (subheading) {
          subX = (viewWidth - subheading.width) >> 1;
          subY = headingY + heading.height + 4;
        }
        y = headingY + heading.height + 8 + subH;
      }
    } else {
      y = (viewHeight - blockH) >> 1;
    }
    for (let i = 0; i < n; i++) {
      rects.push({ x, y: y + i * (boxH + gap), w: boxW, h: boxH });
    }
    return;
  }

  const gap = 3;
  const outer = 6;
  const innerPad = 3;
  let cardH = innerPad * 2 + 2 + FONT_H;
  if (bodies.length) {
    cardH += 3 + FONT_H;
  }
  const cardW = Math.max(36, ((viewWidth - outer * 2 - gap * (n - 1)) / n) | 0);
  const totalW = n * cardW + (n - 1) * gap;
  const x0 = (viewWidth - totalW) >> 1;
  let y: number;
  if (heading) {
    headingX = (viewWidth - heading.width) >> 1;
    const total = heading.height + 6 + cardH;
    headingY = (viewHeight - total) >> 1;
    y = headingY + heading.height + 6;
  } else {
    y = (viewHeight - cardH) >> 1;
  }
  for (let i = 0; i < n; i++) {
    rects.push({ x: x0 + i * (cardW + gap), y, w: cardW, h: cardH });
  }
}

/** Navigate with move keys / mouse hover; Enter or click confirms. */
export function updateUi(viewWidth: number, viewHeight: number): void {
  if (!onPick) {
    return;
  }
  layoutUi(viewWidth, viewHeight);
  const n = labels.length;
  if (
    wasPressed('ArrowLeft') ||
    wasPressed('KeyA') ||
    wasPressed('ArrowUp') ||
    wasPressed('KeyW')
  ) {
    selected = (selected + n - 1) % n;
  }
  if (
    wasPressed('ArrowRight') ||
    wasPressed('KeyD') ||
    wasPressed('ArrowDown') ||
    wasPressed('KeyS')
  ) {
    selected = (selected + 1) % n;
  }
  for (let i = 0; i < rects.length; i++) {
    if (pointIn(mouse.x, mouse.y, rects[i])) {
      selected = i;
    }
  }
  const confirmKey = wasPressed('Enter') || wasPressed('NumpadEnter');
  const confirmClick = mouse.clicked && pointIn(mouse.x, mouse.y, rects[selected]);
  if (confirmKey || confirmClick) {
    onPick(selected);
  }
}

export function drawUi(ctx: CanvasRenderingContext2D, viewWidth: number, viewHeight: number): void {
  if (!onPick) {
    return;
  }
  layoutUi(viewWidth, viewHeight);

  if (!headingTop) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, viewWidth, viewHeight);
  }

  if (heading) {
    ctx.drawImage(heading, headingX, headingY);
  }
  if (subheading) {
    ctx.drawImage(subheading, subX, subY);
  }

  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    ctx.fillStyle = i === selected ? '#fff' : '#747474';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#000';
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    ctx.clip();
    const titleX = r.x + ((r.w - labels[i].width) >> 1);
    const titleY = r.y + ((r.h - labels[i].height - (bodies[i] ? FONT_H + 3 : 0)) >> 1);
    ctx.drawImage(labels[i], titleX, titleY);
    if (bodies[i]) {
      const bodyX = r.x + ((r.w - bodies[i].width) >> 1);
      ctx.drawImage(bodies[i], bodyX, titleY + FONT_H + 3);
    }
    ctx.restore();
  }
}
