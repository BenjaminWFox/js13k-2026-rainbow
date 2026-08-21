import { MAP_HEIGHT, MAP_WIDTH, PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE } from './constants';
import { hubRadiusTiles, PORTAL_CELLS } from './map';
import { BLUE, GREEN, ORANGE, RAINBOW_COLORS, VIOLET } from './palette';
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
/** Bit i set = edge portal i is gone (removed when that color's restore wave starts). */
export let portalsGone = 0;

export function hidePipePortal(color: number): void {
  portalsGone |= 1 << color;
}
/** Pieces per pipe, portal → cap. Same objects as `pipePieces`. */
export const pipeRuns: PipePiece[][] = [];
/** Miniboss stand positions, just inward of each portal. */
export const pipeHomes: { x: number; y: number }[] = [];

let currentRun: PipePiece[] = [];

export const DIR_E = 0;
export const DIR_N = 1;
export const DIR_W = 2;
export const DIR_S = 3;

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

/** Horizontal straight end-to-end with 1px outline overlap. */
export const ADVANCE = 8;
// Cross-section center of metal port (rows/cols 1–4)
const PORT = 2.5;

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

/** Colorless twin (stripe left `b1b1b1`) of every colored kit canvas. */
const greyTwin = new Map<HTMLCanvasElement, HTMLCanvasElement>();

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

export function opposite(dir: number): number {
  return (dir + 2) % 4;
}

export function isHorizontal(dir: number): boolean {
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

/** Every canvas in a kit, in a stable order shared by all kits. */
function kitCanvasList(kit: PipeKit): HTMLCanvasElement[] {
  return [
    ...kit.straightH,
    ...kit.straightV,
    ...kit.curves.map((c) => c.canvas),
    ...kit.caps[DIR_E],
    ...kit.caps[DIR_N],
    ...kit.caps[DIR_W],
    ...kit.caps[DIR_S],
  ];
}

/** The colorless twin of a pipe canvas (cutscene pipes before they activate). */
export function greyPipeCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  return greyTwin.get(canvas) ?? canvas;
}

function bakePieces(): void {
  if (!kits.length) {
    for (let i = 0; i < 7; i++) {
      kits.push(bakeKit(RAINBOW_COLORS[i]));
    }
    // Remapping the stripe to itself keeps it neutral grey: a colorless kit
    const greyList = kitCanvasList(bakeKit(PIPE_STRIPE));
    for (const kit of kits) {
      kitCanvasList(kit).forEach((canvas, i) => greyTwin.set(canvas, greyList[i]));
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

export function straightPreview(
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

export function curvePreview(
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
  const piece: PipePiece = {
    canvas,
    x,
    y,
    hits: hits ?? [{ x, y, w: canvas.width, h: canvas.height }],
  };
  pipePieces.push(piece);
  currentRun.push(piece);
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

export function pushStraight(
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

export function pushCurve(
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

export function pushCap(cx: number, cy: number, dir: number, hFlip: boolean, vFlip: boolean): void {
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

const SLOT = WORLD_W / 10;
const INSET = 75;
/** Portal Y so the pipe through the seam sits on `CENTER_Y`. */
const PORTAL_PIPE_OFF_Y = PORTAL_H - 1 - PIPE_H + PORT;

const MODE_STRAIGHT = 0;
const MODE_STRAIGHT_PORTAL_CURVE = 1;
const MODE_DIAGONAL = 2;

function pipeMode(color: number): number {
  if (color === GREEN || color === BLUE) {
    return MODE_STRAIGHT;
  }
  if (color === ORANGE || color === VIOLET) {
    return MODE_STRAIGHT_PORTAL_CURVE;
  }
  return MODE_DIAGONAL;
}

function alongRemaining(cx: number, cy: number, dir: number, tx: number, ty: number): number {
  if (dir === DIR_E) {
    return tx - cx;
  }
  if (dir === DIR_W) {
    return cx - tx;
  }
  if (dir === DIR_S) {
    return ty - cy;
  }
  return cy - ty;
}

function walkStraight(
  cx: number,
  cy: number,
  dir: number,
  hFlip: boolean,
  vFlip: boolean,
  targetX: number,
  targetY: number
): { cx: number; cy: number } {
  let steps = 0;
  while (steps++ < 400 && alongRemaining(cx, cy, dir, targetX, targetY) > ADVANCE) {
    const next = pushStraight(cx, cy, dir, hFlip, vFlip);
    cx = next.cx;
    cy = next.cy;
  }
  return { cx, cy };
}

/**
 * Competition layout: cardinals are a single heading (verticals elbow once
 * out of the east/west-facing portal); diagonals alternate straight / curve.
 * The occupancy-grid snake lives in `src/directors-cut/pipe-snake.ts`.
 */
function buildPipeSimple(
  color: number,
  startX: number,
  startY: number,
  startDir: number,
  targetX: number,
  targetY: number
): void {
  const mode = pipeMode(color);
  let cx = startX;
  let cy = startY;
  let dir = startDir;
  let hFlip = false;
  let vFlip = false;

  if (mode === MODE_STRAIGHT_PORTAL_CURVE) {
    const runDir = color === ORANGE ? DIR_S : DIR_N;
    const turned = pushCurve(cx, cy, dir, runDir, hFlip, vFlip);
    cx = turned.cx;
    cy = turned.cy;
    hFlip = turned.hFlip;
    vFlip = turned.vFlip;
    dir = runDir;
  }

  if (mode !== MODE_DIAGONAL) {
    const end = walkStraight(cx, cy, dir, hFlip, vFlip, targetX, targetY);
    pushCap(end.cx, end.cy, dir, hFlip, vFlip);
    return;
  }

  let steps = 0;
  while (steps++ < 400) {
    if (Math.abs(targetX - cx) <= ADVANCE && Math.abs(targetY - cy) <= ADVANCE) {
      break;
    }
    if (alongRemaining(cx, cy, dir, targetX, targetY) > ADVANCE) {
      const next = pushStraight(cx, cy, dir, hFlip, vFlip);
      cx = next.cx;
      cy = next.cy;
    }
    if (Math.abs(targetX - cx) <= ADVANCE && Math.abs(targetY - cy) <= ADVANCE) {
      break;
    }
    const turnTo = isHorizontal(dir)
      ? targetY > cy
        ? DIR_S
        : DIR_N
      : targetX > cx
        ? DIR_E
        : DIR_W;
    const cross = isHorizontal(dir) ? Math.abs(targetY - cy) : Math.abs(targetX - cx);
    if (cross <= ADVANCE || (turnTo + dir) % 2 !== 1) {
      const end = walkStraight(cx, cy, dir, hFlip, vFlip, targetX, targetY);
      cx = end.cx;
      cy = end.cy;
      break;
    }
    const next = pushCurve(cx, cy, dir, turnTo, hFlip, vFlip);
    cx = next.cx;
    cy = next.cy;
    hFlip = next.hFlip;
    vFlip = next.vFlip;
    dir = turnTo;
  }
  pushCap(cx, cy, dir, hFlip, vFlip);
}

function portalFromCell(
  gx: number,
  gy: number
): { portalX: number; portalY: number; emergeEast: boolean } {
  const cellX = (gx + 0.5) * SLOT;
  const cellY = (gy + 0.5) * SLOT;
  const yMin = TILE_SIZE + 4;
  const yMax = WORLD_H - PORTAL_H - TILE_SIZE - 4;
  const xMin = TILE_SIZE + 4;
  const xMax = WORLD_W - PORTAL_W - TILE_SIZE - 4;

  if (gx === 0) {
    return {
      portalX: INSET,
      portalY: Math.max(yMin, Math.min(yMax, cellY - PORTAL_H / 2)),
      emergeEast: true,
    };
  }
  if (gx === 9) {
    return {
      portalX: WORLD_W - PORTAL_W - INSET,
      portalY: Math.max(yMin, Math.min(yMax, cellY - PORTAL_H / 2)),
      emergeEast: false,
    };
  }
  if (gy === 0) {
    return {
      portalX: Math.max(xMin, Math.min(xMax, cellX - PORTAL_W / 2)),
      portalY: INSET,
      emergeEast: cellX < CENTER_X,
    };
  }
  return {
    portalX: Math.max(xMin, Math.min(xMax, cellX - PORTAL_W / 2)),
    portalY: WORLD_H - PORTAL_H - INSET,
    emergeEast: cellX < CENTER_X,
  };
}

function placePortal(
  color: number,
  gx: number,
  gy: number
): { portalX: number; portalY: number; emergeEast: boolean } {
  if (color === GREEN) {
    return { portalX: INSET, portalY: CENTER_Y - PORTAL_PIPE_OFF_Y, emergeEast: true };
  }
  if (color === BLUE) {
    return {
      portalX: WORLD_W - PORTAL_W - INSET,
      portalY: CENTER_Y - PORTAL_PIPE_OFF_Y,
      emergeEast: false,
    };
  }
  if (color === ORANGE) {
    return { portalX: CENTER_X - PORTAL_W / 2, portalY: INSET, emergeEast: true };
  }
  if (color === VIOLET) {
    return {
      portalX: CENTER_X - PORTAL_W / 2,
      portalY: WORLD_H - PORTAL_H - INSET,
      emergeEast: true,
    };
  }
  return portalFromCell(gx, gy);
}

/**
 * Place 7 portals and grow a pipe from each toward a cap just outside the
 * white hub. Competition build uses straight / diagonal layouts.
 *
 * Director's cut: swap `buildPipeSimple` for `buildPipeSnake` from
 * `src/directors-cut/pipe-snake.ts` (see SPEC.md §1 Director's Cut).
 */
export function generatePipes(_seed: number): void {
  pipePieces.length = 0;
  portalBacks.length = 0;
  portalFronts.length = 0;
  portalsGone = 0;
  pipeRuns.length = 0;
  pipeHomes.length = 0;
  bakePieces();

  for (let i = 0; i < 7; i++) {
    const [gx, gy] = PORTAL_CELLS[i];
    const { portalX, portalY, emergeEast } = placePortal(i, gx, gy);

    const seamX = portalX + PORTAL_LEFT.w;
    const cy = portalY + PORTAL_H - 1 - PIPE_H + PORT;
    const dir = emergeEast ? DIR_E : DIR_W;
    const startX = emergeEast ? seamX - 2 : seamX + 2;

    const dx = startX - CENTER_X;
    const dy = cy - CENTER_Y;
    const len = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    const capDist = (hubRadiusTiles(ang) + 1) * TILE_SIZE;
    const targetX = CENTER_X + (dx / len) * capDist;
    const targetY = CENTER_Y + (dy / len) * capDist;

    pushPortal(portalX, portalY, emergeEast);
    useKit(i);
    currentRun = [];
    pipeRuns.push(currentRun);
    pipeHomes.push({
      x: emergeEast ? portalX + PORTAL_W + 4 : portalX - PLAYER_WIDTH - 4,
      y: portalY + PORTAL_H - PLAYER_HEIGHT,
    });
    buildPipeSimple(i, startX, cy, dir, targetX, targetY);
  }
}

/**
 * The plaza portal's two slabs (right rim of the hub, facing west into the
 * plaza). The cutscene draws these itself so it can fade them and put actors
 * between the back and front slab.
 */
export function plazaPortalParts(): { back: PipePiece; front: PipePiece } {
  const hub = hubRadiusTiles(0) * TILE_SIZE;
  const portalX = CENTER_X + hub - PORTAL_W * 0.4;
  const portalY = CENTER_Y - PORTAL_H / 2;
  return {
    back: { canvas: portalRightFlip, x: portalX, y: portalY },
    front: { canvas: portalLeftFlip, x: portalX + PORTAL_LEFT.w, y: portalY },
  };
}

/**
 * Open the plaza portal permanently (finale). Returns the boss stand
 * position just inside the plaza.
 */
export function spawnPlazaPortal(): { x: number; y: number } {
  const { back, front } = plazaPortalParts();
  portalBacks.push(back);
  portalFronts.push(front);
  return {
    x: back.x - PLAYER_WIDTH - 4,
    y: back.y + PORTAL_H - PLAYER_HEIGHT,
  };
}

/** Pull the next portal-end segment off a pipe. Returns null when empty. */
export function takePipeSegment(color: number): PipePiece | null {
  const run = pipeRuns[color];
  if (!run || run.length === 0) {
    return null;
  }
  const piece = run.shift() as PipePiece;
  const index = pipePieces.indexOf(piece);
  if (index >= 0) {
    pipePieces.splice(index, 1);
  }
  return piece;
}
