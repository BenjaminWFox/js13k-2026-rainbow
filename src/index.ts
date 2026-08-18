import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SPRITE_H,
  PLAYER_SPRITE_W,
  PLAYER_SPRITE_X,
  PLAYER_SPRITE_Y,
  PLAYER_WIDTH,
  TARGET_VIEW_HEIGHT,
  TILE_SIZE,
} from './constants';
import { clearPressedKeys, initInput } from './input';
import { bakeTiles, generateMap, getTile, tileCanvases } from './map';
import { generatePipes, pipePieces, portalBacks, portalFronts } from './pipes';
import { player, updatePlayer } from './player';
import { createSprite, loadSpriteSheet } from './sprites';

const canvas = document.querySelector('#c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

// Loaded only when import.meta.env.DEV — dropped from production entry
let debug: typeof import('./debug') | undefined;

// The visible slice of the world, in world pixels; recomputed on resize
let viewWidth = 1;
let viewHeight = 1;

// Fill the whole viewport: pick the integer pixel scale that gets the view
// height closest to TARGET_VIEW_HEIGHT, then size the canvas to cover the
// window at that scale (it may overhang by up to scale-1 px; overflow hidden).
function resize(): void {
  const scale = Math.max(1, Math.round(window.innerHeight / TARGET_VIEW_HEIGHT));
  viewWidth = Math.ceil(window.innerWidth / scale);
  viewHeight = Math.ceil(window.innerHeight / scale);
  canvas.width = viewWidth;
  canvas.height = viewHeight;
  canvas.style.width = viewWidth * scale + 'px';
  canvas.style.height = viewHeight * scale + 'px';
  // Resizing the canvas resets this; keep nearest-neighbor so scaled sprites stay crisp
  ctx.imageSmoothingEnabled = false;
}

let playerSprite: HTMLCanvasElement;

async function main(): Promise<void> {
  await loadSpriteSheet('sprites.png');

  // Single 11x19 frame, drawn 1:1 with no facing flips (behavior TBD)
  playerSprite = createSprite(PLAYER_SPRITE_X, PLAYER_SPRITE_Y, PLAYER_SPRITE_W, PLAYER_SPRITE_H);

  generateMap();
  bakeTiles();
  generatePipes(1);
  initInput();
  if (import.meta.env.DEV) {
    debug = await import('./debug');
    debug.initDebugProps();
  }
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(gameLoop);
}

let lastTime = 0;

function gameLoop(time: number): void {
  requestAnimationFrame(gameLoop);
  const dt = Math.min(time - lastTime, 1000 / 30);
  lastTime = time;

  if (debug) {
    debug.handleDebugKeys();
  }
  updatePlayer(dt);
  render();
  clearPressedKeys();
}

function render(): void {
  // The camera stays fractional; every draw position is rounded exactly once
  // via floor(worldX - cameraX). This keeps the player's screen position
  // perfectly stable while the camera follows (no 1px jitter from double
  // rounding), regardless of view size parity.
  const cameraX = clamp(
    player.x + PLAYER_WIDTH / 2 - viewWidth / 2,
    0,
    MAP_WIDTH * TILE_SIZE - viewWidth
  );
  const cameraY = clamp(
    player.y + PLAYER_HEIGHT / 2 - viewHeight / 2,
    0,
    MAP_HEIGHT * TILE_SIZE - viewHeight
  );

  // Tiles: draw only the visible range
  const firstTileX = Math.floor(cameraX / TILE_SIZE);
  const firstTileY = Math.floor(cameraY / TILE_SIZE);
  const lastTileX = Math.floor((cameraX + viewWidth) / TILE_SIZE);
  const lastTileY = Math.floor((cameraY + viewHeight) / TILE_SIZE);
  for (let ty = firstTileY; ty <= lastTileY; ty++) {
    for (let tx = firstTileX; tx <= lastTileX; tx++) {
      ctx.drawImage(
        tileCanvases[getTile(tx, ty)],
        Math.floor(tx * TILE_SIZE - cameraX),
        Math.floor(ty * TILE_SIZE - cameraY)
      );
    }
  }

  for (const piece of portalBacks) {
    ctx.drawImage(piece.canvas, Math.floor(piece.x - cameraX), Math.floor(piece.y - cameraY));
  }

  for (const piece of pipePieces) {
    ctx.drawImage(piece.canvas, Math.floor(piece.x - cameraX), Math.floor(piece.y - cameraY));
  }

  for (const piece of portalFronts) {
    ctx.drawImage(piece.canvas, Math.floor(piece.x - cameraX), Math.floor(piece.y - cameraY));
  }

  ctx.drawImage(playerSprite, Math.floor(player.x - cameraX), Math.floor(player.y - cameraY));

  if (debug) {
    debug.drawDebugOverlay(
      ctx,
      cameraX,
      cameraY,
      firstTileX,
      firstTileY,
      lastTileX,
      lastTileY,
      viewHeight
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

main();
