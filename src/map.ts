import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants';
import { cssColor, RAINBOW_COLORS, rainbowShade } from './palette';

/** 10×10 map of portal cells (red pixels); (0,0) is top-left. Cardinals on midlines. */
export const PORTAL_CELLS: [number, number][] = [
  [0, 0],
  [5, 0],
  [9, 0],
  [0, 5],
  [9, 5],
  [0, 9],
  [5, 9],
];

/** Ground tiles 0–6 match RAINBOW_COLORS / pipe kits. */
export const TILE_WHITE = 7;
export const TILE_WALL = 8;

const tiles = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);

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

function setTile(tx: number, ty: number, tile: number): void {
  if (tx >= 0 && ty >= 0 && tx < MAP_WIDTH && ty < MAP_HEIGHT) {
    tiles[ty * MAP_WIDTH + tx] = tile;
  }
}

export function getTile(tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) {
    return TILE_WALL;
  }
  return tiles[ty * MAP_WIDTH + tx];
}

/** Centered solid box for this tile, or null if walkable. */
export function getTileSolid(
  tx: number,
  ty: number
): { x: number; y: number; w: number; h: number } | null {
  if (getTile(tx, ty) !== TILE_WALL) {
    return null;
  }
  return {
    x: tx * TILE_SIZE,
    y: ty * TILE_SIZE,
    w: TILE_SIZE,
    h: TILE_SIZE,
  };
}

/** Lumpy plaza radius in tiles — 3- and 5-lobe wobble, not a clean circle. */
export function hubRadiusTiles(ang: number): number {
  return 9 * (1 + 0.14 * Math.sin(ang * 3) + 0.09 * Math.sin(ang * 5 + 0.8));
}

function nearestPipeColor(angle: number, portalAngles: number[]): number {
  let best = 0;
  let bestDiff = Math.PI * 2;
  for (let i = 0; i < portalAngles.length; i++) {
    let diff = Math.abs(angle - portalAngles[i]);
    if (diff > Math.PI) {
      diff = Math.PI * 2 - diff;
    }
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

/**
 * Seven pizza slices aimed at the portals, meeting a lumpy white hub.
 * Edge ring is a solid wall.
 */
export function generateMap(): void {
  const midX = MAP_WIDTH / 2;
  const midY = MAP_HEIGHT / 2;
  const portalAngles = PORTAL_CELLS.map(([gx, gy]) => {
    const px = (gx + 0.5) * (MAP_WIDTH / 10) - midX;
    const py = (gy + 0.5) * (MAP_HEIGHT / 10) - midY;
    return Math.atan2(py, px);
  });

  for (let ty = 0; ty < MAP_HEIGHT; ty++) {
    for (let tx = 0; tx < MAP_WIDTH; tx++) {
      const dx = tx + 0.5 - midX;
      const dy = ty + 0.5 - midY;
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      if (dist < hubRadiusTiles(ang)) {
        setTile(tx, ty, TILE_WHITE);
      } else {
        setTile(tx, ty, nearestPipeColor(ang, portalAngles));
      }
    }
  }

  for (let i = 0; i < MAP_WIDTH; i++) {
    setTile(i, 0, TILE_WALL);
    setTile(i, MAP_HEIGHT - 1, TILE_WALL);
    setTile(0, i, TILE_WALL);
    setTile(MAP_WIDTH - 1, i, TILE_WALL);
  }
}

export const tileCanvases: HTMLCanvasElement[] = [];
/** Palette state from before the current color wave. */
export const tileCanvasesPrev: HTMLCanvasElement[] = [];

/** Copy the live tile bakes so a wave can draw old + new palettes. */
export function snapshotTiles(): void {
  for (let tile = 0; tile < tileCanvases.length; tile++) {
    let canvas = tileCanvasesPrev[tile];
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      tileCanvasesPrev[tile] = canvas;
    }
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(tileCanvases[tile], 0, 0);
  }
}

export function bakeTiles(): void {
  for (let tile = 0; tile <= TILE_WALL; tile++) {
    let canvas = tileCanvases[tile];
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      tileCanvases[tile] = canvas;
    }
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (tile === TILE_WALL) {
      paintWall(ctx);
    } else if (tile === TILE_WHITE) {
      paintGround(ctx, '#ffffff', '#cecece');
    } else {
      paintGround(ctx, cssColor(rainbowShade(tile, 0.8)), cssColor(RAINBOW_COLORS[tile]));
    }
  }
}

function paintGround(ctx: CanvasRenderingContext2D, fill: string, highlight: string): void {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = highlight;
  const random = mulberry32(7);
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(Math.floor(random() * TILE_SIZE), Math.floor(random() * TILE_SIZE), 2, 1);
  }
}

function paintWall(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#747474';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = '#cecece';
  const inset = 2;
  ctx.fillRect(inset, inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
}
