import { drawCombat, updateCombat } from './combat';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TARGET_VIEW_HEIGHT,
  TILE_SIZE,
  WALK_FRAME_MS,
} from './constants';
import { drawCutsceneDrain, drawCutsceneUi, drawCutsceneWorld, updateCutscene } from './cutscene';
import { bakeEnemyTypes, drawEnemies, updateEnemies } from './enemies';
import { drawExplosions, updateExplosions } from './fx';
import { bakeHud, drawHud } from './hud';
import { clearPressedKeys, initInput } from './input';
import { bakeTiles, generateMap, getTile, tileCanvases, tileCanvasesPrev } from './map';
import {
  colorWave,
  drawOverlays,
  initOverlays,
  isSequenceActive,
  isWorldFrozen,
  SCENE_CUTSCENE,
  SCENE_RUN,
  scene,
  startPendingDeathSequence,
  tickColorWave,
  updateOverlays,
  updateSequence,
} from './overlays';
import { bakePickups, drawPickups, updatePickups } from './pickups';
import { pipePieces, portals, portalHitbox, portalHp, portalsGone, PORTAL_MAX_HP } from './pipes';
import { player, updatePlayer } from './player';
import { createWalkSprites, loadSpriteSheet } from './sprites';

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

// [idle, left leg-cut, right leg-cut] — the cut frames alternate while moving
let playerSprites: HTMLCanvasElement[];

async function main(): Promise<void> {
  await loadSpriteSheet('sprites.png');

  // Single 11x19 sheet frame, drawn 1:1 with no facing flips (facing art TBD);
  // the two walk frames are derived at bake time (§3 leg-cut)
  playerSprites = createWalkSprites(0, 0, PLAYER_WIDTH, PLAYER_HEIGHT);
  bakeEnemyTypes();
  bakePickups();
  bakeHud();

  generateMap();
  bakeTiles();
  initInput(canvas);
  initOverlays();
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
  updateOverlays(viewWidth, viewHeight);
  if (scene === SCENE_CUTSCENE) {
    tickColorWave(dt);
    updateCutscene(dt);
  } else if (!isWorldFrozen()) {
    if (isSequenceActive()) {
      updateSequence(dt);
    } else {
      updatePlayer(dt);
      const cam = cameraOrigin();
      updateCombat(dt, cam.x, cam.y, viewWidth, viewHeight);
      startPendingDeathSequence();
      if (isSequenceActive()) {
        updateSequence(dt);
      } else {
        updateEnemies(dt, viewWidth, viewHeight);
      }
    }
    updatePickups(dt);
    updateExplosions(dt);
  }
  render();
  clearPressedKeys();
}

function render(): void {
  // The camera stays fractional; every draw position is rounded exactly once
  // via floor(worldX - cameraX). This keeps the player's screen position
  // perfectly stable while the camera follows (no 1px jitter from double
  // rounding), regardless of view size parity.
  const { x: cameraX, y: cameraY } = cameraOrigin();

  // Tiles: draw only the visible range
  const firstTileX = Math.floor(cameraX / TILE_SIZE);
  const firstTileY = Math.floor(cameraY / TILE_SIZE);
  const lastTileX = Math.floor((cameraX + viewWidth) / TILE_SIZE);
  const lastTileY = Math.floor((cameraY + viewHeight) / TILE_SIZE);
  drawTiles(
    colorWave.active ? tileCanvasesPrev : tileCanvases,
    cameraX,
    cameraY,
    firstTileX,
    firstTileY,
    lastTileX,
    lastTileY
  );
  if (colorWave.active) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(colorWave.x - cameraX, colorWave.y - cameraY, colorWave.r, 0, Math.PI * 2);
    ctx.clip();
    drawTiles(tileCanvases, cameraX, cameraY, firstTileX, firstTileY, lastTileX, lastTileY);
    ctx.restore();
  }
  if (scene === SCENE_CUTSCENE) {
    drawCutsceneDrain(ctx, cameraX, cameraY, firstTileX, firstTileY, lastTileX, lastTileY);
  }

  drawPickups(ctx, cameraX, cameraY, viewWidth, viewHeight);

  if (scene === SCENE_CUTSCENE) {
    drawCutsceneWorld(ctx, cameraX, cameraY);
  } else if (scene === SCENE_RUN) {
    for (let i = 0; i < portals.length; i++) {
      if (portalsGone & (1 << i)) {
        continue;
      }
      const piece = portals[i];
      ctx.drawImage(piece.canvas, Math.floor(piece.x - cameraX), Math.floor(piece.y - cameraY));
    }

    for (const piece of pipePieces) {
      ctx.drawImage(piece.canvas, Math.floor(piece.x - cameraX), Math.floor(piece.y - cameraY));
    }

    drawEnemies(ctx, cameraX, cameraY, viewWidth, viewHeight);

    for (let i = 0; i < 7; i++) {
      const box = portalHitbox(i);
      if (!box) {
        continue;
      }
      const sx = Math.floor(box.x - cameraX);
      const sy = Math.floor(box.y - cameraY);
      ctx.fillStyle = '#000';
      ctx.fillRect(sx, sy + box.h + 1, box.w, 3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(
        sx + 1,
        sy + box.h + 2,
        Math.round((box.w - 2) * (portalHp[i] / PORTAL_MAX_HP)),
        1
      );
    }
  }

  const playerScreenX = Math.floor(player.x - cameraX);
  const playerScreenY = Math.floor(player.y - cameraY);
  if (player.iframes <= 0 || ((player.iframes / 80) | 0) % 2 === 0) {
    const frame = player.moving ? 1 + (((player.walkTime / WALK_FRAME_MS) | 0) % 2) : 0;
    ctx.drawImage(playerSprites[frame], playerScreenX, playerScreenY);
  }
  drawCombat(ctx, cameraX, cameraY);
  drawExplosions(ctx, cameraX, cameraY, viewWidth, viewHeight);

  if (scene === SCENE_RUN) {
    // HP bar: white 1px inner bar in a 1px black outline, outline top 1px below
    // the sprite; inner width = % of HP
    ctx.fillStyle = '#000';
    ctx.fillRect(playerScreenX, playerScreenY + PLAYER_HEIGHT + 1, PLAYER_WIDTH, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(
      playerScreenX + 1,
      playerScreenY + PLAYER_HEIGHT + 2,
      Math.round((PLAYER_WIDTH - 2) * (player.hp / player.maxHp)),
      1
    );
    drawHud(ctx, viewWidth);
  }
  if (scene === SCENE_CUTSCENE) {
    drawCutsceneUi(ctx, viewWidth, viewHeight);
  }
  drawOverlays(ctx, viewWidth, viewHeight);

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

function drawTiles(
  canvases: HTMLCanvasElement[],
  cameraX: number,
  cameraY: number,
  firstTileX: number,
  firstTileY: number,
  lastTileX: number,
  lastTileY: number
): void {
  for (let ty = firstTileY; ty <= lastTileY; ty++) {
    for (let tx = firstTileX; tx <= lastTileX; tx++) {
      ctx.drawImage(
        canvases[getTile(tx, ty)],
        Math.floor(tx * TILE_SIZE - cameraX),
        Math.floor(ty * TILE_SIZE - cameraY)
      );
    }
  }
}

function cameraOrigin(): { x: number; y: number } {
  return {
    x: clamp(player.x + PLAYER_WIDTH / 2 - viewWidth / 2, 0, MAP_WIDTH * TILE_SIZE - viewWidth),
    y: clamp(player.y + PLAYER_HEIGHT / 2 - viewHeight / 2, 0, MAP_HEIGHT * TILE_SIZE - viewHeight),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

main();
