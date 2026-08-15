import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants';
import { BLUE, cssColor, GREEN, rainbowShade } from './palette';

export const TILE_GRASS = 0;
export const TILE_TREE = 1;
export const TILE_WATER = 2;

const SOLID = [false, true, true];

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
    return TILE_TREE;
  }
  return tiles[ty * MAP_WIDTH + tx];
}

/** Is the tile under this world-space pixel position solid? */
export function isSolidAt(px: number, py: number): boolean {
  return SOLID[getTile(Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE))];
}

/**
 * Placeholder test world: grass with a tree border, tree clusters, and lakes.
 * Real world gen will follow the hybrid skeleton + fill approach from the spec.
 */
export function generateMap(seed: number): void {
  const random = mulberry32(seed);
  tiles.fill(TILE_GRASS);

  // Solid tree border around the world edge
  for (let i = 0; i < MAP_WIDTH; i++) {
    setTile(i, 0, TILE_TREE);
    setTile(i, MAP_HEIGHT - 1, TILE_TREE);
    setTile(0, i, TILE_TREE);
    setTile(MAP_WIDTH - 1, i, TILE_TREE);
  }

  // Lakes: short random walks painting 2x2 blobs of water
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

  // Scattered tree clusters
  for (let cluster = 0; cluster < 200; cluster++) {
    const x = Math.floor(random() * MAP_WIDTH);
    const y = Math.floor(random() * MAP_HEIGHT);
    const size = 1 + Math.floor(random() * 3);
    for (let i = 0; i < size; i++) {
      setTile(x + Math.floor(random() * 3) - 1, y + Math.floor(random() * 3) - 1, TILE_TREE);
    }
  }

  // Keep the spawn area clear
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

// One pre-rendered canvas per tile type; repainted on palette changes.
export const tileCanvases: HTMLCanvasElement[] = [];

/** Paint (or repaint) every tile type with the current palette state. */
export function bakeTiles(): void {
  const painters = [paintGrass, paintTree, paintWater];
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

function paintTree(ctx: CanvasRenderingContext2D): void {
  paintGrass(ctx);
  // Canopy: a chunky diamond blob with a lighter crown
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.45));
  ctx.fillRect(4, 2, 12, 16);
  ctx.fillRect(2, 4, 16, 12);
  ctx.fillStyle = cssColor(rainbowShade(GREEN, 0.6));
  ctx.fillRect(6, 4, 8, 6);
}

function paintWater(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = cssColor(rainbowShade(BLUE, 0.9));
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = cssColor(rainbowShade(BLUE, 1.35));
  const random = mulberry32(13);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(Math.floor(random() * 14), Math.floor(random() * TILE_SIZE), 6, 1);
  }
}
