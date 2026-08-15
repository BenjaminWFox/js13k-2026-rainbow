import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants';
import { BLUE, cssColor, GREEN, rainbowShade } from './palette';

export const TILE_GRASS = 0;
export const TILE_BUSH = 1;
export const TILE_WATER = 2;
export const TILE_BUSH_SMALL = 3;
export const TILE_WALL = 4;

// Centered solid size in world pixels; 0 = walkable
const TILE_HIT = [0, 12, TILE_SIZE, 6, TILE_SIZE];

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
  const size = TILE_HIT[getTile(tx, ty)];
  if (!size) {
    return null;
  }
  const inset = (TILE_SIZE - size) / 2;
  return {
    x: tx * TILE_SIZE + inset,
    y: ty * TILE_SIZE + inset,
    w: size,
    h: size,
  };
}

/**
 * Placeholder test world: grass with a tree border, tree clusters, and lakes.
 * Real world gen will follow the hybrid skeleton + fill approach from the spec.
 */
export function generateMap(seed: number): void {
  const random = mulberry32(seed);
  tiles.fill(TILE_GRASS);

  for (let i = 0; i < MAP_WIDTH; i++) {
    setTile(i, 0, TILE_WALL);
    setTile(i, MAP_HEIGHT - 1, TILE_WALL);
    setTile(0, i, TILE_WALL);
    setTile(MAP_WIDTH - 1, i, TILE_WALL);
  }

  for (let lake = 0; lake < 8; lake++) {
    let x = Math.floor(random() * MAP_WIDTH);
    let y = Math.floor(random() * MAP_HEIGHT);
    for (let step = 0; step < 40; step++) {
      setTile(x, y, TILE_WATER);
      setTile(x + 1, y, TILE_WATER);
      setTile(x, y + 1, TILE_WATER);
      setTile(x + 1, y + 1, TILE_WATER);
      x += Math.floor(random() * 3) - 1;
      y += Math.floor(random() * 3) - 1;
    }
  }

  for (let cluster = 0; cluster < 200; cluster++) {
    const x = Math.floor(random() * MAP_WIDTH);
    const y = Math.floor(random() * MAP_HEIGHT);
    const size = 1 + Math.floor(random() * 3);
    const bush = random() < 0.55 ? TILE_BUSH : TILE_BUSH_SMALL;
    for (let i = 0; i < size; i++) {
      setTile(x + Math.floor(random() * 3) - 1, y + Math.floor(random() * 3) - 1, bush);
    }
  }

  const centerX = MAP_WIDTH / 2;
  const centerY = MAP_HEIGHT / 2;
  for (let y = -5; y <= 5; y++) {
    for (let x = -5; x <= 5; x++) {
      if (x * x + y * y <= 25) {
        setTile(centerX + x, centerY + y, TILE_GRASS);
      }
    }
  }
}

export const tileCanvases: HTMLCanvasElement[] = [];

export function bakeTiles(): void {
  const painters = [paintGrass, paintBush12, paintWater, paintBush6, paintWall];
  painters.forEach((paint, tile) => {
    let canvas = tileCanvases[tile];
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      tileCanvases[tile] = canvas;
    }
    paint(canvas.getContext('2d') as CanvasRenderingContext2D);
  });
}

function paintGrass(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.85));
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.65));
  const random = mulberry32(7);
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(Math.floor(random() * TILE_SIZE), Math.floor(random() * TILE_SIZE), 2, 1);
  }
}

function paintBushBlob(ctx: CanvasRenderingContext2D, size: number): void {
  paintGrass(ctx);
  const inset = (TILE_SIZE - size) / 2;
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.45));
  ctx.fillRect(inset, inset + 1, size, size - 2);
  ctx.fillRect(inset + 1, inset, size - 2, size);
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.6));
  const highlight = Math.max(2, size - 4);
  ctx.fillRect(inset + 2, inset + 1, highlight, Math.max(2, size / 2 - 1));
}

function paintBush12(ctx: CanvasRenderingContext2D): void {
  paintBushBlob(ctx, 12);
}

function paintBush6(ctx: CanvasRenderingContext2D): void {
  paintBushBlob(ctx, 6);
}

function paintWall(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.4));
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.55));
  ctx.fillRect(4, 4, TILE_SIZE - 8, TILE_SIZE - 8);
}

function paintWater(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = cssColor(rainbowShade(BLUE, 0.9));
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = cssColor(rainbowShade(BLUE, 1.35));
  const random = mulberry32(13);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(Math.floor(random() * (TILE_SIZE - 6)), Math.floor(random() * TILE_SIZE), 6, 1);
  }
}
