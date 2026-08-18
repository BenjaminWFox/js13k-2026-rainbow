import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants';
import { wasPressed } from './input';
import { bakeTiles, getTile, getTileSolid, TILE_GRASS } from './map';
import { unlockedColors } from './palette';
import { getPlayerHitbox } from './player';
import { createSprite, rebakeAllSprites } from './sprites';

let showHitboxes = false;

interface DebugProp {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

const props: DebugProp[] = [];

// Atlas regions for every non-player sprite on sprites.png (see SPEC.md)
const ATLAS: { x: number; y: number; w: number; h: number }[] = [
  { x: 11, y: 0, w: 11, h: 19 }, // Business Man
  { x: 22, y: 0, w: 11, h: 19 }, // Business Boss
  { x: 0, y: 19, w: 6, h: 23 }, // Portal left
  { x: 6, y: 19, w: 6, h: 23 }, // Portal right
  // Common enemies 7x9 from (33,0)
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: 33 + i * 7, y: 0, w: 7, h: 9 })),
  // Pipes from (33,9)
  { x: 33, y: 9, w: 5, h: 8 }, // cap
  { x: 38, y: 9, w: 9, h: 6 }, // straight
  { x: 47, y: 9, w: 9, h: 9 }, // curve outer accent (SE)
  { x: 56, y: 9, w: 9, h: 9 }, // curve inner accent (→ NW)
  // Flowers 7x10 from (68,9)
  ...[0, 1, 2, 3].map((i) => ({ x: 68 + i * 7, y: 9, w: 7, h: 10 })),
];

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

/**
 * Bake sheet sprites (except the player) and scatter copies across grass tiles
 * so we can visually check art/palette while exploring. Dev-only.
 */
export function initDebugProps(): void {
  props.length = 0;
  const canvases = ATLAS.map((r) => createSprite(r.x, r.y, r.w, r.h));
  const random = mulberry32(42);
  const copiesPerSprite = 3;

  for (let i = 0; i < canvases.length; i++) {
    for (let copy = 0; copy < copiesPerSprite; copy++) {
      let tx = 0;
      let ty = 0;
      for (let attempt = 0; attempt < 40; attempt++) {
        tx = 2 + Math.floor(random() * (MAP_WIDTH - 4));
        ty = 2 + Math.floor(random() * (MAP_HEIGHT - 4));
        // Keep clear of the spawn clearing roughly in the map center
        const cx = MAP_WIDTH / 2;
        const cy = MAP_HEIGHT / 2;
        if ((tx - cx) * (tx - cx) + (ty - cy) * (ty - cy) < 36) {
          continue;
        }
        if (getTile(tx, ty) === TILE_GRASS) {
          break;
        }
      }
      // Point at which random sprites are scattered around the map
      // props.push({
      //   canvas: canvases[i],
      //   x: tx * TILE_SIZE + Math.floor((TILE_SIZE - canvases[i].width) / 2),
      //   // Bottom-align to the tile so tall sprites (11x19) sit like the player
      //   y: ty * TILE_SIZE + TILE_SIZE - canvases[i].height,
      // });
    }
  }
}

/** Keys 1-7 toggle rainbow unlocks; 8 toggles hitbox outlines. Dev-only. */
export function handleDebugKeys(): void {
  for (let i = 0; i < 7; i++) {
    if (wasPressed('Digit' + (i + 1))) {
      unlockedColors[i] = !unlockedColors[i];
      rebakeAllSprites();
      bakeTiles();
    }
  }
  if (wasPressed('Digit8')) {
    showHitboxes = !showHitboxes;
  }
}

/** Scattered sheet props, hitbox outlines, and footer help. Dev-only. */
export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  firstTileX: number,
  firstTileY: number,
  lastTileX: number,
  lastTileY: number,
  viewHeight: number
): void {
  const viewLeft = cameraX;
  const viewTop = cameraY;
  // Approximate visible world bounds from the tile range already computed
  const viewRight = (lastTileX + 1) * TILE_SIZE;
  const viewBottom = (lastTileY + 1) * TILE_SIZE;

  for (const prop of props) {
    if (
      prop.x + prop.canvas.width < viewLeft ||
      prop.x > viewRight ||
      prop.y + prop.canvas.height < viewTop ||
      prop.y > viewBottom
    ) {
      continue;
    }
    ctx.drawImage(prop.canvas, Math.floor(prop.x - cameraX), Math.floor(prop.y - cameraY));
  }

  if (showHitboxes) {
    for (let ty = firstTileY; ty <= lastTileY; ty++) {
      for (let tx = firstTileX; tx <= lastTileX; tx++) {
        const solid = getTileSolid(tx, ty);
        if (solid) {
          debugRect(
            ctx,
            Math.floor(solid.x - cameraX),
            Math.floor(solid.y - cameraY),
            solid.w,
            solid.h,
            '#ff0'
          );
        }
      }
    }
    const hit = getPlayerHitbox();
    debugRect(ctx, Math.floor(hit.x - cameraX), Math.floor(hit.y - cameraY), hit.w, hit.h, '#f00');
  }

  ctx.fillStyle = '#fff';
  ctx.font = '5px monospace';
  ctx.fillText('arrows: move / 1-7: colors / 8: hitboxes', 3, viewHeight - 3);
}

function debugRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}
