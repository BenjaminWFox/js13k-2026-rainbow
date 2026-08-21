/**
 * Director's cut — occupancy-grid snake pipe walker (S/C shapes, random run
 * lengths, self-avoidance, jittered portal insets).
 *
 * Not imported by the competition build. Tree-shaking keeps it out of the zip.
 *
 * The competition layout is straight stubs + capped debris only; curve sprites
 * and `curvePreview` / `pushCurve` were removed from `src/pipes.ts`. Restoring
 * this walker means bringing those helpers (and the inner/outer elbow art)
 * back, then calling `buildPipeSnake(...)` from `generatePipes` instead of the
 * stub run. See SPEC.md §1 Director's Cut.
 *
 * The last working walker lived in git history on this file (curve previews,
 * occupancy `blocked` grid, turn policy). `portalFromCellRandom` below is
 * still the jittered-inset portal placer for that restore.
 */

import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from '../constants';

const WORLD_W = MAP_WIDTH * TILE_SIZE;
const WORLD_H = MAP_HEIGHT * TILE_SIZE;
const CENTER_X = WORLD_W / 2;
const PORTAL_W = 12;
const PORTAL_H = 23;
const SLOT = WORLD_W / 10;

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
