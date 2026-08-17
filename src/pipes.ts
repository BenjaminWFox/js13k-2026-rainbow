import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants';
import { createSprite } from './sprites';

export interface PipePiece {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

const DIR_E = 0;
const DIR_N = 1;
const DIR_W = 2;
const DIR_S = 3;

const DX = [1, 0, -1, 0];
const DY = [0, -1, 0, 1];

const WORLD_W = MAP_WIDTH * TILE_SIZE;
const WORLD_H = MAP_HEIGHT * TILE_SIZE;
const CENTER_X = WORLD_W / 2;
const CENTER_Y = WORLD_H / 2;

// Atlas
const CAP = { x: 33, y: 9, w: 5, h: 8 };
const STRAIGHT = { x: 38, y: 9, w: 9, h: 6 };
/** SE elbow — dark accent on outer (south/east) edges */
const CURVE_OUTER = { x: 47, y: 9, w: 9, h: 9 };
/** SE-shaped elbow — dark accent on inner edges */
const CURVE_INNER = { x: 56, y: 9, w: 9, h: 9 };

// Horizontal straight end-to-end with 1px outline overlap
const ADVANCE = 8;
// Cross-section center of metal port (rows/cols 1–4)
const PORT = 2.5;

export const pipePieces: PipePiece[] = [];

interface CurveOrient {
  canvas: HTMLCanvasElement;
  /** Port center in local sprite pixels, keyed by DIR_* */
  ports: Partial<Record<number, { x: number; y: number }>>;
  /**
   * Per-port accent flip: false = canonical (H bottom / V right),
   * true = flipped (H top / V left). Straights on that axis must match.
   */
  portFlip: Partial<Record<number, boolean>>;
}

// [0] canonical accent, [1] flipped accent
let straightH: HTMLCanvasElement[];
let straightV: HTMLCanvasElement[];
let curves: CurveOrient[];
/** caps[dir][0|1] — long border against pipe; [1] = flipped accent */
let caps: HTMLCanvasElement[][];

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function opposite(dir: number): number {
  return (dir + 2) % 4;
}

function isHorizontal(dir: number): boolean {
  return dir === DIR_E || dir === DIR_W;
}

/** Flip then rot90 CCW a point from source (w×h) space into dest local space. */
function mapPort(
  x: number,
  y: number,
  w: number,
  h: number,
  flipH: boolean,
  flipV: boolean,
  rot90: number
): { x: number; y: number; w: number; h: number } {
  if (flipH) {
    x = w - 1 - x;
  }
  if (flipV) {
    y = h - 1 - y;
  }
  let dw = w;
  let dh = h;
  for (let i = 0; i < rot90; i++) {
    const nx = y;
    const ny = dw - 1 - x;
    x = nx;
    y = ny;
    const t = dw;
    dw = dh;
    dh = t;
  }
  return { x, y, w: dw, h: dh };
}

function bakePieces(): void {
  // H: flipV moves accent bottom → top. V: flipV then rot90 CCW moves accent right → left.
  straightH = [
    createSprite(STRAIGHT.x, STRAIGHT.y, STRAIGHT.w, STRAIGHT.h),
    createSprite(STRAIGHT.x, STRAIGHT.y, STRAIGHT.w, STRAIGHT.h, false, true, 0),
  ];
  straightV = [
    createSprite(STRAIGHT.x, STRAIGHT.y, STRAIGHT.w, STRAIGHT.h, false, false, 1),
    createSprite(STRAIGHT.x, STRAIGHT.y, STRAIGHT.w, STRAIGHT.h, false, true, 1),
  ];

  // Both elbows are SE-shaped. Outer vs inner accents, each with the four flip
  // orientations, cover every corner at both accent modes so seams can match
  // flipped straights.
  const baseS = { x: PORT, y: CURVE_OUTER.h - 1 };
  const baseE = { x: CURVE_OUTER.w - 1, y: PORT };

  const cornerDefs: {
    atlas: { x: number; y: number; w: number; h: number };
    flipH: boolean;
    flipV: boolean;
    portFlip: Partial<Record<number, boolean>>;
  }[] = [
    // SE
    {
      atlas: CURVE_OUTER,
      flipH: false,
      flipV: false,
      portFlip: { [DIR_S]: false, [DIR_E]: false },
    },
    { atlas: CURVE_INNER, flipH: false, flipV: false, portFlip: { [DIR_S]: true, [DIR_E]: true } },
    // NE
    { atlas: CURVE_OUTER, flipH: false, flipV: true, portFlip: { [DIR_N]: false, [DIR_E]: true } },
    { atlas: CURVE_INNER, flipH: false, flipV: true, portFlip: { [DIR_N]: true, [DIR_E]: false } },
    // SW
    { atlas: CURVE_OUTER, flipH: true, flipV: false, portFlip: { [DIR_S]: true, [DIR_W]: false } },
    { atlas: CURVE_INNER, flipH: true, flipV: false, portFlip: { [DIR_S]: false, [DIR_W]: true } },
    // NW
    { atlas: CURVE_OUTER, flipH: true, flipV: true, portFlip: { [DIR_N]: true, [DIR_W]: true } },
    { atlas: CURVE_INNER, flipH: true, flipV: true, portFlip: { [DIR_N]: false, [DIR_W]: false } },
  ];

  curves = cornerDefs.map(({ atlas, flipH, flipV, portFlip }) => {
    const canvas = createSprite(atlas.x, atlas.y, atlas.w, atlas.h, flipH, flipV, 0);
    const s = mapPort(baseS.x, baseS.y, atlas.w, atlas.h, flipH, flipV, 0);
    const e = mapPort(baseE.x, baseE.y, atlas.w, atlas.h, flipH, flipV, 0);
    const ports: CurveOrient['ports'] = {};
    if (!flipV) {
      ports[DIR_S] = { x: s.x, y: s.y };
    } else {
      ports[DIR_N] = { x: s.x, y: s.y };
    }
    if (!flipH) {
      ports[DIR_E] = { x: e.x, y: e.y };
    } else {
      ports[DIR_W] = { x: e.x, y: e.y };
    }
    return { canvas, ports, portFlip };
  });

  // Cap: long black border against the pipe; [1] variants flip the accent.
  caps = [];
  caps[DIR_E] = [
    createSprite(CAP.x, CAP.y, CAP.w, CAP.h, true, false, 0),
    createSprite(CAP.x, CAP.y, CAP.w, CAP.h, true, true, 0),
  ];
  caps[DIR_W] = [
    createSprite(CAP.x, CAP.y, CAP.w, CAP.h),
    createSprite(CAP.x, CAP.y, CAP.w, CAP.h, false, true, 0),
  ];
  caps[DIR_N] = [
    createSprite(CAP.x, CAP.y, CAP.w, CAP.h, true, false, 1),
    createSprite(CAP.x, CAP.y, CAP.w, CAP.h, true, true, 1),
  ];
  caps[DIR_S] = [
    createSprite(CAP.x, CAP.y, CAP.w, CAP.h, false, false, 1),
    createSprite(CAP.x, CAP.y, CAP.w, CAP.h, false, true, 1),
  ];
}

/** Pick curve with the right ports whose enter-port accent matches `enterFlip`. */
function findCurve(enterSide: number, exitSide: number, enterFlip: boolean): CurveOrient {
  for (const c of curves) {
    if (c.ports[enterSide] && c.ports[exitSide] && c.portFlip[enterSide] === enterFlip) {
      return c;
    }
  }
  return curves[0];
}

function pushStraight(
  cx: number,
  cy: number,
  dir: number,
  hFlip: boolean,
  vFlip: boolean
): { cx: number; cy: number } {
  const flip = isHorizontal(dir) ? hFlip : vFlip;
  if (dir === DIR_E) {
    pipePieces.push({ canvas: straightH[flip ? 1 : 0], x: cx, y: cy - PORT });
    return { cx: cx + ADVANCE, cy };
  }
  if (dir === DIR_W) {
    pipePieces.push({ canvas: straightH[flip ? 1 : 0], x: cx - ADVANCE, y: cy - PORT });
    return { cx: cx - ADVANCE, cy };
  }
  if (dir === DIR_S) {
    pipePieces.push({ canvas: straightV[flip ? 1 : 0], x: cx - PORT, y: cy });
    return { cx, cy: cy + ADVANCE };
  }
  pipePieces.push({ canvas: straightV[flip ? 1 : 0], x: cx - PORT, y: cy - ADVANCE });
  return { cx, cy: cy - ADVANCE };
}

function pushCurve(
  cx: number,
  cy: number,
  dirIn: number,
  dirOut: number,
  hFlip: boolean,
  vFlip: boolean
): { cx: number; cy: number; hFlip: boolean; vFlip: boolean } {
  const enterSide = opposite(dirIn);
  const exitSide = dirOut;
  const enterFlip = isHorizontal(dirIn) ? hFlip : vFlip;
  const curve = findCurve(enterSide, exitSide, enterFlip);
  const enter = curve.ports[enterSide];
  const exit = curve.ports[exitSide];
  if (!enter || !exit) {
    return { cx, cy, hFlip, vFlip };
  }
  const x = cx - enter.x;
  const y = cy - enter.y;
  pipePieces.push({ canvas: curve.canvas, x, y });

  const exitFlip = !!curve.portFlip[exitSide];
  if (isHorizontal(dirOut)) {
    hFlip = exitFlip;
  } else {
    vFlip = exitFlip;
  }
  return { cx: x + exit.x, cy: y + exit.y, hFlip, vFlip };
}

function pushCap(cx: number, cy: number, dir: number, hFlip: boolean, vFlip: boolean): void {
  const flip = isHorizontal(dir) ? hFlip : vFlip;
  const canvas = caps[dir][flip ? 1 : 0];
  // Long border faces the pipe; 1px overlap into the run.
  if (dir === DIR_E) {
    pipePieces.push({ canvas, x: cx - 1, y: cy - PORT - 1 });
  } else if (dir === DIR_W) {
    pipePieces.push({ canvas, x: cx - 3, y: cy - PORT - 1 });
  } else if (dir === DIR_N) {
    pipePieces.push({ canvas, x: cx - PORT - 1, y: cy - 3 });
  } else {
    pipePieces.push({ canvas, x: cx - PORT - 1, y: cy - 1 });
  }
}

/** Border point for a ray from center at angle (0 = east, CCW). */
function edgePoint(angle: number): { x: number; y: number; dir: number } {
  const dx = Math.cos(angle);
  const dy = -Math.sin(angle); // screen y grows down; CCW from east in math → adjust
  let tX = Infinity;
  let tY = Infinity;
  if (dx > 0) {
    tX = (WORLD_W - CENTER_X) / dx;
  } else if (dx < 0) {
    tX = (0 - CENTER_X) / dx;
  }
  if (dy > 0) {
    tY = (WORLD_H - CENTER_Y) / dy;
  } else if (dy < 0) {
    tY = (0 - CENTER_Y) / dy;
  }
  const t = Math.min(tX, tY);
  const x = CENTER_X + dx * t;
  const y = CENTER_Y + dy * t;

  let dir: number;
  if (tX < tY) {
    dir = dx > 0 ? DIR_W : DIR_E;
  } else {
    dir = dy > 0 ? DIR_N : DIR_S;
  }
  return { x, y, dir };
}

/**
 * Build one pipe: walk from the edge toward the center, mostly straight with
 * occasional 90° jogs, then cap the inward end.
 */
function buildPipe(
  startX: number,
  startY: number,
  startDir: number,
  targetDistFromCenter: number,
  random: () => number
): void {
  let cx = startX;
  let cy = startY;
  let dir = startDir;
  // Accent mode per axis — updated when elbows flip the highlight side
  let hFlip = false;
  let vFlip = false;

  cx += DX[dir] * ADVANCE;
  cy += DY[dir] * ADVANCE;

  let steps = 0;
  const maxSteps = 400;
  let sinceTurn = 0;

  while (steps < maxSteps) {
    const distCenter = Math.hypot(cx - CENTER_X, cy - CENTER_Y);
    if (distCenter <= targetDistFromCenter) {
      break;
    }

    const needX = CENTER_X - cx;
    const needY = CENTER_Y - cy;
    let prefer = dir;
    if (Math.abs(needX) > Math.abs(needY)) {
      prefer = needX > 0 ? DIR_E : DIR_W;
    } else if (Math.abs(needY) > 1) {
      prefer = needY > 0 ? DIR_S : DIR_N;
    }

    const shouldTurn = (prefer !== dir && sinceTurn > 2) || (sinceTurn > 6 && random() < 0.35);
    if (shouldTurn && prefer !== dir && (prefer + dir) % 2 === 1) {
      const next = pushCurve(cx, cy, dir, prefer, hFlip, vFlip);
      cx = next.cx;
      cy = next.cy;
      hFlip = next.hFlip;
      vFlip = next.vFlip;
      dir = prefer;
      sinceTurn = 0;
    } else {
      const next = pushStraight(cx, cy, dir, hFlip, vFlip);
      cx = next.cx;
      cy = next.cy;
      sinceTurn++;
    }
    steps++;
  }

  pushCap(cx, cy, dir, hFlip, vFlip);
}

/**
 * Place 7 pipes from the map edges toward the center.
 * Two snake to within 50px of center; the rest stop 200–400px from their edge.
 */
export function generatePipes(seed: number): void {
  pipePieces.length = 0;
  bakePieces();

  const random = mulberry32(seed);
  const phase = random() * Math.PI * 2;

  const longA = Math.floor(random() * 7);
  let longB = Math.floor(random() * 6);
  if (longB >= longA) {
    longB++;
  }

  for (let i = 0; i < 7; i++) {
    const angle = phase + (i * Math.PI * 2) / 7;
    const start = edgePoint(angle);
    const long = i === longA || i === longB;
    let target: number;
    if (long) {
      target = 50;
    } else {
      const inward = 200 + random() * 200;
      const startDist = Math.hypot(start.x - CENTER_X, start.y - CENTER_Y);
      target = Math.max(50, startDist - inward);
    }
    buildPipe(start.x, start.y, start.dir, target, random);
  }
}
