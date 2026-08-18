import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants';
import { cssColor, GREEN, rainbowShade } from './palette';

export const TILE_GRASS = 0;
export const TILE_WALL = 1;

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

/** Grass fill with a solid wall ring around the map edge. */
export function generateMap(): void {
  tiles.fill(TILE_GRASS);

  for (let i = 0; i < MAP_WIDTH; i++) {
    setTile(i, 0, TILE_WALL);
    setTile(i, MAP_HEIGHT - 1, TILE_WALL);
    setTile(0, i, TILE_WALL);
    setTile(MAP_WIDTH - 1, i, TILE_WALL);
  }
}

export const tileCanvases: HTMLCanvasElement[] = [];

export function bakeTiles(): void {
  const painters = [paintGrass, paintWall];
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
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.65));
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.55));
  const random = mulberry32(7);
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(Math.floor(random() * TILE_SIZE), Math.floor(random() * TILE_SIZE), 2, 1);
  }
}

function paintWall(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.4));
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.55));
  const inset = 2;
  ctx.fillRect(inset, inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
}
