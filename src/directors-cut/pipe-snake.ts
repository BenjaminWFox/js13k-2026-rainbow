/**
 * Director's cut — occupancy-grid snake pipe walker (S/C shapes, random run
 * lengths, self-avoidance, jittered portal insets).
 *
 * Not imported by the competition build. Tree-shaking keeps it out of the zip.
 *
 * To re-enable after the jam: in `generatePipes` (`src/pipes.ts`), after
 * placing each portal, call
 * `buildPipeSnake(startX, cy, dir, targetX, targetY, mulberry32(seed + i))`
 * instead of `buildPipeSimple`. Optionally swap `placePortal` for
 * `portalFromCellRandom` so insets jitter again. See SPEC.md §1 Director's Cut.
 */

import { MAP_HEIGHT, MAP_WIDTH, PLAYER_HIT, TILE_SIZE } from '../constants';
import {
  ADVANCE,
  curvePreview,
  DIR_E,
  DIR_N,
  DIR_S,
  DIR_W,
  isHorizontal,
  opposite,
  pushCap,
  pushCurve,
  pushStraight,
  straightPreview,
} from '../pipes';

const WORLD_W = MAP_WIDTH * TILE_SIZE;
const WORLD_H = MAP_HEIGHT * TILE_SIZE;
const CENTER_X = WORLD_W / 2;
const PORTAL_W = 12;
const PORTAL_H = 23;
const SLOT = WORLD_W / 10;

const CELL = 4;
const CLEAR = PLAYER_HIT + 1;
const GRID_W = Math.ceil(WORLD_W / CELL);
const GRID_H = Math.ceil(WORLD_H / CELL);
let blocked: Uint8Array;

export function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resetBlocked(): void {
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

export function stampBox(x: number, y: number, w: number, h: number): void {
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

/**
 * Jittered edge-cell portal (inset 60–90px). Competition `placePortal` is
 * deterministic; use this when restoring the snake layout.
 */
export function portalFromCellRandom(
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
 * Walk from a portal toward a cap with randomized run lengths so pipes read
 * as S/C snakes. Keeps a player-width gap from other pipes and from this
 * pipe's own earlier segments.
 */
export function buildPipeSnake(
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
  let runLen = 2 + Math.floor(random() * 5);

  while (steps < maxSteps) {
    const needX = targetX - cx;
    const needY = targetY - cy;
    if (Math.abs(needX) <= ADVANCE && Math.abs(needY) <= ADVANCE) {
      break;
    }

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
