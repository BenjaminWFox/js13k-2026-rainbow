import { bakeText, FONT_H } from './font';
import { mouse, wasPressed } from './input';

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
let headingTop = false;
let labels: HTMLCanvasElement[] = [];
let bodies: HTMLCanvasElement[] = [];
let selected = 0;
let onPick: ((index: number) => void) | null = null;
const rects: Rect[] = [];
let headingX = 0;
let headingY = 0;

export function isUiOpen(): boolean {
  return onPick !== null;
}

export function closeUi(): void {
  onPick = null;
  heading = null;
  labels = [];
  bodies = [];
  rects.length = 0;
}

export function openMenu(
  title: string | null,
  items: string[],
  pick: (index: number) => void,
  titleScale = 1,
  titleAtTop = false
): void {
  layout = LAYOUT_LIST;
  heading = title ? bakeText(title, '#fff', titleScale) : null;
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
  const n = labels.length;
  if (n === 0) {
    return;
  }

  if (layout === LAYOUT_LIST) {
    const padX = 4;
    const padY = 3;
    const boxH = FONT_H + padY * 2 + 2;
    const gap = 3;
    let inner = 40;
    for (const label of labels) {
      if (label.width > inner) {
        inner = label.width;
      }
    }
    const boxW = inner + padX * 2 + 2;
    const blockH = n * boxH + (n - 1) * gap;
    const x = (viewWidth - boxW) >> 1;
    let y: number;
    if (heading) {
      headingX = (viewWidth - heading.width) >> 1;
      if (headingTop) {
        headingY = 16;
        y = (viewHeight - blockH) >> 1;
      } else {
        const total = heading.height + 8 + blockH;
        headingY = (viewHeight - total) >> 1;
        y = headingY + heading.height + 8;
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

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  if (heading) {
    ctx.drawImage(heading, headingX, headingY);
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
    const titleY = r.y + 4;
    ctx.drawImage(labels[i], titleX, titleY);
    if (bodies[i]) {
      const bodyX = r.x + ((r.w - bodies[i].width) >> 1);
      ctx.drawImage(bodies[i], bodyX, titleY + FONT_H + 3);
    }
    ctx.restore();
  }
}
