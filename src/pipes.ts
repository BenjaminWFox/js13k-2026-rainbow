import { MAP_HEIGHT, MAP_WIDTH, PLAYER_HIT, TILE_SIZE } from './constants';
import { hubRadiusTiles, PORTAL_CELLS } from './map';
import { RAINBOW_COLORS } from './palette';
import { createSprite } from './sprites';

export interface HitBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PipePiece {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  /** Collision boxes. Straights/caps use the sprite; elbows use two 6×5 arms. */
  hits?: HitBox[];
}

export const pipePieces: PipePiece[] = [];
export const portalBacks: PipePiece[] = [];
export const portalFronts: PipePiece[] = [];

const DIR_E = 0;
const DIR_N = 1;
const DIR_W = 2;
const DIR_S = 3;

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
/** Two 6×23 halves. Default (east): left slab covers the pipe, right slab sits behind it. */
const PORTAL_LEFT = { x: 0, y: 19, w: 6, h: 23 };
const PORTAL_RIGHT = { x: 6, y: 19, w: 6, h: 23 };
const PORTAL_W = 12;
const PORTAL_H = 23;
const PIPE_H = 6;

// Horizontal straight end-to-end with 1px outline overlap
const ADVANCE = 8;
// Cross-section center of metal port (rows/cols 1–4)
const PORT = 2.5;

// Occupancy grid: keep a player-sized gap between pipe solids
const CELL = 4;
const CLEAR = PLAYER_HIT + 1;
const GRID_W = Math.ceil(WORLD_W / CELL);
const GRID_H = Math.ceil(WORLD_H / CELL);
let blocked: Uint8Array;

/** Authored stripe / cap-dot on the sheet; remapped per pipe to a rainbow color. */
const PIPE_STRIPE = 0xb1b1b1;

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

interface PipeKit {
  straightH: HTMLCanvasElement[];
  straightV: HTMLCanvasElement[];
  curves: CurveOrient[];
  caps: HTMLCanvasElement[][];
}

const kits: PipeKit[] = [];

let portalLeft: HTMLCanvasElement;
let portalRight: HTMLCanvasElement;
let portalLeftFlip: HTMLCanvasElement;
let portalRightFlip: HTMLCanvasElement;

// Active kit while assembling one colored run
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

function resetBlocked(): void {
  blocked = new Uint8Array(GRID_W * GRID_H);
}

function boxBlocked(x: number, y: number, w: number, h: number): boolean {
  if (
    x < TILE_SIZE ||
    y < TILE_SIZE ||
    x + w > WORLD_W - TILE_SIZE ||
    y + h > WORLD_H - TILE_SIZE
  ) {
    return true;
  }
  const x0 = Math.max(0, Math.floor(x / CELL));
  const y0 = Math.max(0, Math.floor(y / CELL));
  const x1 = Math.min(GRID_W - 1, Math.floor((x + w - 1) / CELL));
  const y1 = Math.min(GRID_H - 1, Math.floor((y + h - 1) / CELL));
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      if (blocked[gy * GRID_W + gx]) {
        return true;
      }
    }
  }
  return false;
}

function stampBox(x: number, y: number, w: number, h: number): void {
  const x0 = Math.max(0, Math.floor((x - CLEAR) / CELL));
  const y0 = Math.max(0, Math.floor((y - CLEAR) / CELL));
  const x1 = Math.min(GRID_W - 1, Math.floor((x + w - 1 + CLEAR) / CELL));
  const y1 = Math.min(GRID_H - 1, Math.floor((y + h - 1 + CLEAR) / CELL));
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      blocked[gy * GRID_W + gx] = 1;
    }
  }
}

function stampPieces(from: number, to: number): void {
  for (let i = from; i < to; i++) {
    const piece = pipePieces[i];
    stampBox(piece.x, piece.y, piece.canvas.width, piece.canvas.height);
  }
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

function pipeSprite(
  atlas: { x: number; y: number; w: number; h: number },
  flipH: boolean,
  flipV: boolean,
  rot90: number,
  color: number
): HTMLCanvasElement {
  return createSprite(
    atlas.x,
    atlas.y,
    atlas.w,
    atlas.h,
    flipH,
    flipV,
    rot90,
    1,
    PIPE_STRIPE,
    color
  );
}

function bakeKit(color: number): PipeKit {
  const straightH = [
    pipeSprite(STRAIGHT, false, false, 0, color),
    pipeSprite(STRAIGHT, false, true, 0, color),
  ];
  const straightV = [
    pipeSprite(STRAIGHT, false, false, 1, color),
    pipeSprite(STRAIGHT, false, true, 1, color),
  ];

  const baseS = { x: PORT, y: CURVE_OUTER.h - 1 };
  const baseE = { x: CURVE_OUTER.w - 1, y: PORT };

  const cornerDefs: {
    atlas: { x: number; y: number; w: number; h: number };
    flipH: boolean;
    flipV: boolean;
    portFlip: Partial<Record<number, boolean>>;
  }[] = [
    {
      atlas: CURVE_OUTER,
      flipH: false,
      flipV: false,
      portFlip: { [DIR_S]: false, [DIR_E]: false },
    },
    { atlas: CURVE_INNER, flipH: false, flipV: false, portFlip: { [DIR_S]: true, [DIR_E]: true } },
    { atlas: CURVE_OUTER, flipH: false, flipV: true, portFlip: { [DIR_N]: false, [DIR_E]: true } },
    { atlas: CURVE_INNER, flipH: false, flipV: true, portFlip: { [DIR_N]: true, [DIR_E]: false } },
    { atlas: CURVE_OUTER, flipH: true, flipV: false, portFlip: { [DIR_S]: true, [DIR_W]: false } },
    { atlas: CURVE_INNER, flipH: true, flipV: false, portFlip: { [DIR_S]: false, [DIR_W]: true } },
    { atlas: CURVE_OUTER, flipH: true, flipV: true, portFlip: { [DIR_N]: true, [DIR_W]: true } },
    { atlas: CURVE_INNER, flipH: true, flipV: true, portFlip: { [DIR_N]: false, [DIR_W]: false } },
  ];

  const curves = cornerDefs.map(({ atlas, flipH, flipV, portFlip }) => {
    const canvas = pipeSprite(atlas, flipH, flipV, 0, color);
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

  const caps: HTMLCanvasElement[][] = [];
  caps[DIR_E] = [pipeSprite(CAP, true, false, 0, color), pipeSprite(CAP, true, true, 0, color)];
  caps[DIR_W] = [pipeSprite(CAP, false, false, 0, color), pipeSprite(CAP, false, true, 0, color)];
  caps[DIR_N] = [pipeSprite(CAP, true, false, 1, color), pipeSprite(CAP, true, true, 1, color)];
  caps[DIR_S] = [pipeSprite(CAP, false, false, 1, color), pipeSprite(CAP, false, true, 1, color)];

  return { straightH, straightV, curves, caps };
}

function bakePieces(): void {
  if (!kits.length) {
    for (let i = 0; i < 7; i++) {
      kits.push(bakeKit(RAINBOW_COLORS[i]));
    }
  }
  if (!portalLeft) {
    portalLeft = createSprite(PORTAL_LEFT.x, PORTAL_LEFT.y, PORTAL_LEFT.w, PORTAL_LEFT.h);
    portalRight = createSprite(PORTAL_RIGHT.x, PORTAL_RIGHT.y, PORTAL_RIGHT.w, PORTAL_RIGHT.h);
    portalLeftFlip = createSprite(PORTAL_LEFT.x, PORTAL_LEFT.y, PORTAL_LEFT.w, PORTAL_LEFT.h, true);
    portalRightFlip = createSprite(
      PORTAL_RIGHT.x,
      PORTAL_RIGHT.y,
      PORTAL_RIGHT.w,
      PORTAL_RIGHT.h,
      true
    );
  }
}

function useKit(colorIndex: number): void {
  const kit = kits[colorIndex];
  straightH = kit.straightH;
  straightV = kit.straightV;
  curves = kit.curves;
  caps = kit.caps;
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

function straightPreview(
  cx: number,
  cy: number,
  dir: number
): { x: number; y: number; w: number; h: number; nx: number; ny: number } {
  if (dir === DIR_E) {
    return { x: cx, y: cy - PORT, w: STRAIGHT.w, h: STRAIGHT.h, nx: cx + ADVANCE, ny: cy };
  }
  if (dir === DIR_W) {
    return {
      x: cx - ADVANCE,
      y: cy - PORT,
      w: STRAIGHT.w,
      h: STRAIGHT.h,
      nx: cx - ADVANCE,
      ny: cy,
    };
  }
  if (dir === DIR_S) {
    return { x: cx - PORT, y: cy, w: STRAIGHT.h, h: STRAIGHT.w, nx: cx, ny: cy + ADVANCE };
  }
  return {
    x: cx - PORT,
    y: cy - ADVANCE,
    w: STRAIGHT.h,
    h: STRAIGHT.w,
    nx: cx,
    ny: cy - ADVANCE,
  };
}

function curvePreview(
  cx: number,
  cy: number,
  dirIn: number,
  dirOut: number,
  hFlip: boolean,
  vFlip: boolean
): {
  x: number;
  y: number;
  w: number;
  h: number;
  nx: number;
  ny: number;
  hFlip: boolean;
  vFlip: boolean;
} | null {
  const enterSide = opposite(dirIn);
  const exitSide = dirOut;
  const enterFlip = isHorizontal(dirIn) ? hFlip : vFlip;
  const curve = findCurve(enterSide, exitSide, enterFlip);
  const enter = curve.ports[enterSide];
  const exit = curve.ports[exitSide];
  if (!enter || !exit) {
    return null;
  }
  const x = cx - enter.x;
  const y = cy - enter.y;
  const nextH = isHorizontal(dirOut) ? !!curve.portFlip[exitSide] : hFlip;
  const nextV = isHorizontal(dirOut) ? vFlip : !!curve.portFlip[exitSide];
  return {
    x,
    y,
    w: CURVE_OUTER.w,
    h: CURVE_OUTER.h,
    nx: x + exit.x,
    ny: y + exit.y,
    hFlip: nextH,
    vFlip: nextV,
  };
}

function addPipePiece(canvas: HTMLCanvasElement, x: number, y: number, hits?: HitBox[]): void {
  pipePieces.push({
    canvas,
    x,
    y,
    hits: hits ?? [{ x, y, w: canvas.width, h: canvas.height }],
  });
}

/** Two 6×5 arms: 6px face matches the adjoining straight, 5px into the elbow. */
function curveArmHits(x: number, y: number, curve: CurveOrient): HitBox[] {
  const arm = 5;
  const hits: HitBox[] = [];
  const east = curve.ports[DIR_E];
  if (east) {
    hits.push({ x: x + CURVE_OUTER.w - arm, y: y + east.y - PORT, w: arm, h: PIPE_H });
  }
  const west = curve.ports[DIR_W];
  if (west) {
    hits.push({ x, y: y + west.y - PORT, w: arm, h: PIPE_H });
  }
  const south = curve.ports[DIR_S];
  if (south) {
    hits.push({ x: x + south.x - PORT, y: y + CURVE_OUTER.h - arm, w: PIPE_H, h: arm });
  }
  const north = curve.ports[DIR_N];
  if (north) {
    hits.push({ x: x + north.x - PORT, y, w: PIPE_H, h: arm });
  }
  return hits;
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
    addPipePiece(straightH[flip ? 1 : 0], cx, cy - PORT);
    return { cx: cx + ADVANCE, cy };
  }
  if (dir === DIR_W) {
    addPipePiece(straightH[flip ? 1 : 0], cx - ADVANCE, cy - PORT);
    return { cx: cx - ADVANCE, cy };
  }
  if (dir === DIR_S) {
    addPipePiece(straightV[flip ? 1 : 0], cx - PORT, cy);
    return { cx, cy: cy + ADVANCE };
  }
  addPipePiece(straightV[flip ? 1 : 0], cx - PORT, cy - ADVANCE);
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
  addPipePiece(curve.canvas, x, y, curveArmHits(x, y, curve));

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
    addPipePiece(canvas, cx - 1, cy - PORT - 1);
  } else if (dir === DIR_W) {
    addPipePiece(canvas, cx - 3, cy - PORT - 1);
  } else if (dir === DIR_N) {
    addPipePiece(canvas, cx - PORT - 1, cy - 3);
  } else {
    addPipePiece(canvas, cx - PORT - 1, cy - 1);
  }
}

function pushPortal(portalX: number, portalY: number, emergeEast: boolean): void {
  if (emergeEast) {
    // Pipe goes right: right slab behind, left slab covers
    portalBacks.push({ canvas: portalRight, x: portalX + PORTAL_LEFT.w, y: portalY });
    portalFronts.push({ canvas: portalLeft, x: portalX, y: portalY });
  } else {
    // Mirror: left slab behind, right slab covers
    portalBacks.push({ canvas: portalRightFlip, x: portalX, y: portalY });
    portalFronts.push({ canvas: portalLeftFlip, x: portalX + PORTAL_LEFT.w, y: portalY });
  }
}

/**
 * Build one pipe: walk from a portal toward a cap target near the player.
 * Run lengths between elbows are randomized, straights sometimes overshoot
 * the ideal turn point, and far from the target the pipe may detour away
 * before curling back — so runs read as S/C shapes rather than a fixed zigzag.
 * Placements keep a player-width gap from other pipes and from this pipe's
 * own earlier segments (the newest few are exempt so it can extend itself).
 */
function buildPipe(
  startX: number,
  startY: number,
  startDir: number,
  targetX: number,
  targetY: number,
  random: () => number
): void {
  let cx = startX;
  let cy = startY;
  let dir = startDir;
  let hFlip = false;
  let vFlip = false;

  const ownBoxes: { x: number; y: number; w: number; h: number }[] = [];
  // Exempt the newest pieces: CLEAR (12px) dilation reaches back past an
  // elbow, so the window must span ~3 pieces on each side of a corner.
  // The tightest possible loop is 8+ pieces, so 6 still catches crossings.
  const SELF_SKIP = 6;
  const selfHit = (x: number, y: number, w: number, h: number): boolean => {
    for (let i = 0; i < ownBoxes.length - SELF_SKIP; i++) {
      const b = ownBoxes[i];
      if (
        x < b.x + b.w + CLEAR &&
        x + w > b.x - CLEAR &&
        y < b.y + b.h + CLEAR &&
        y + h > b.y - CLEAR
      ) {
        return true;
      }
    }
    return false;
  };
  const isFree = (p: { x: number; y: number; w: number; h: number }): boolean =>
    !boxBlocked(p.x, p.y, p.w, p.h) && !selfHit(p.x, p.y, p.w, p.h);
  const tryCurve = (out: number) => {
    if ((out + dir) % 2 !== 1) {
      return null;
    }
    const p = curvePreview(cx, cy, dir, out, hFlip, vFlip);
    return p && isFree(p) ? p : null;
  };

  let steps = 0;
  const maxSteps = 600;
  let sinceTurn = 0;
  // Segments before the next optional turn; re-rolled after every elbow.
  let runLen = 2 + Math.floor(random() * 5);

  while (steps < maxSteps) {
    const needX = targetX - cx;
    const needY = targetY - cy;
    if (Math.abs(needX) <= ADVANCE && Math.abs(needY) <= ADVANCE) {
      break;
    }

    // Perpendicular turn that closes the cross-axis error, and its mirror.
    const toward = isHorizontal(dir) ? (needY > 0 ? DIR_S : DIR_N) : needX > 0 ? DIR_E : DIR_W;
    const away = opposite(toward);
    const crossErr = isHorizontal(dir) ? Math.abs(needY) : Math.abs(needX);
    const along = isHorizontal(dir) ? needX : needY;
    const forward = dir === DIR_E || dir === DIR_S ? along : -along;

    let turnTo = -1;
    if (sinceTurn >= runLen) {
      const roll = random();
      if (forward < 0 || (crossErr > ADVANCE && roll < 0.7)) {
        turnTo = toward;
      } else if (roll < 0.25 && Math.hypot(needX, needY) > 120) {
        turnTo = away;
      }
    }
    let curveP = turnTo >= 0 ? tryCurve(turnTo) : null;

    if (!curveP) {
      const sp = straightPreview(cx, cy, dir);
      if (isFree(sp)) {
        pushStraight(cx, cy, dir, hFlip, vFlip);
        ownBoxes.push({ x: sp.x, y: sp.y, w: sp.w, h: sp.h });
        cx = sp.nx;
        cy = sp.ny;
        sinceTurn++;
        steps++;
        continue;
      }
      // Straight blocked: forced turn, target side first.
      turnTo = toward;
      curveP = tryCurve(toward);
      if (!curveP) {
        turnTo = away;
        curveP = tryCurve(away);
      }
      if (!curveP) {
        break;
      }
    }

    const next = pushCurve(cx, cy, dir, turnTo, hFlip, vFlip);
    ownBoxes.push({ x: curveP.x, y: curveP.y, w: curveP.w, h: curveP.h });
    cx = next.cx;
    cy = next.cy;
    hFlip = next.hFlip;
    vFlip = next.vFlip;
    dir = turnTo;
    sinceTurn = 0;
    runLen = 1 + Math.floor(random() * 6);
    steps++;
  }

  pushCap(cx, cy, dir, hFlip, vFlip);
}

const SLOT = WORLD_W / 10;

function portalFromCell(
  gx: number,
  gy: number,
  random: () => number
): { portalX: number; portalY: number; emergeEast: boolean } {
  const inset = 60 + Math.floor(random() * 31);
  const cellX = (gx + 0.5) * SLOT;
  const cellY = (gy + 0.5) * SLOT;
  const yMin = TILE_SIZE + 4;
  const yMax = WORLD_H - PORTAL_H - TILE_SIZE - 4;
  const xMin = TILE_SIZE + 4;
  const xMax = WORLD_W - PORTAL_W - TILE_SIZE - 4;

  if (gx === 0) {
    return {
      portalX: inset,
      portalY: Math.max(yMin, Math.min(yMax, cellY - PORTAL_H / 2)),
      emergeEast: true,
    };
  }
  if (gx === 9) {
    return {
      portalX: WORLD_W - PORTAL_W - inset,
      portalY: Math.max(yMin, Math.min(yMax, cellY - PORTAL_H / 2)),
      emergeEast: false,
    };
  }
  if (gy === 0) {
    return {
      portalX: Math.max(xMin, Math.min(xMax, cellX - PORTAL_W / 2)),
      portalY: inset,
      emergeEast: cellX < CENTER_X,
    };
  }
  return {
    portalX: Math.max(xMin, Math.min(xMax, cellX - PORTAL_W / 2)),
    portalY: WORLD_H - PORTAL_H - inset,
    emergeEast: cellX < CENTER_X,
  };
}

/**
 * Place 7 portals from the 10×10 edge map and grow a pipe from each toward
 * a cap just outside the white hub (still on that pipe's color), keeping a
 * player-width gap from other pipes.
 */
export function generatePipes(seed: number): void {
  pipePieces.length = 0;
  portalBacks.length = 0;
  portalFronts.length = 0;
  bakePieces();
  resetBlocked();

  const random = mulberry32(seed);

  for (let i = 0; i < 7; i++) {
    const [gx, gy] = PORTAL_CELLS[i];
    const { portalX, portalY, emergeEast } = portalFromCell(gx, gy, random);

    const seamX = portalX + PORTAL_LEFT.w;
    const cy = portalY + PORTAL_H - 1 - PIPE_H + PORT;
    const dir = emergeEast ? DIR_E : DIR_W;
    const startX = emergeEast ? seamX - 2 : seamX + 2;

    const dx = startX - CENTER_X;
    const dy = cy - CENTER_Y;
    const len = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    // One tile past the hub edge so the cap sits on color, not white
    const capDist = (hubRadiusTiles(ang) + 1) * TILE_SIZE;
    const targetX = CENTER_X + (dx / len) * capDist;
    const targetY = CENTER_Y + (dy / len) * capDist;

    pushPortal(portalX, portalY, emergeEast);
    useKit(i);
    const from = pipePieces.length;
    buildPipe(startX, cy, dir, targetX, targetY, random);
    stampPieces(from, pipePieces.length);
    stampBox(portalX, portalY, PORTAL_W, PORTAL_H);
  }
}
