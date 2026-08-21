import { PLAYER_HEIGHT, PLAYER_WIDTH, SHARD_X, SHARD_Y, TILE_SIZE } from './constants';
import { finalBossSprites } from './enemies';
import { bakeText, FONT_H, measureText } from './font';
import { anyKeyPressed, mouse } from './input';
import { bakeTiles, getTile, tileCanvases } from './map';
import { colorWave, WAVE_SPEED } from './overlays';
import { unlockedColors } from './palette';
import {
  greyPipeCanvas,
  type PipePiece,
  pipeRuns,
  plazaPortalParts,
  portalBacks,
  portalFronts,
} from './pipes';
import { createSprite, rebakeAllSprites } from './sprites';

// Opening cutscene: boss + portal already in the plaza, one line, pipes drop,
// then all 7 reverse-waves run at once (portal → cap). Each color leaves the
// rest of the world when its wave hits the cap. Shard gets the last line.

const PH_TALK = 0;
const PH_PIPES = 1;
const PH_DRAIN = 2;
const PH_SHARD = 3;

const LINE_BOSS = 'ALRIGHT BOYS LAY THOSE PIPES! THESE COLORS WILL MAKE US RICH!';
const LINE_SHARD = 'UNICORN! FIND WHERE THOSE PIPES GO AND DESTROY THEM!';
const REVEAL_GAP_MS = 220;

let onDone: (() => void) | null = null;
let phase = PH_TALK;
/** Time within the current phase (ms). */
let t = 0;
/** Total cutscene time (ms), for shard bob and the dialogue blink. */
let time = 0;
/** Swallow the input that confirmed START on the same frame. */
let skipGuard = false;

let portalBack: PipePiece;
let portalFront: PipePiece;
let showBoss = true;

const boss = { x: 0, y: 0 };

/** Pipes revealed so far (colorless until that pipe's drain wave). */
let revealed = 0;
/** Drain waves started (also used to color that pipe's stripe). */
let drained = 0;

const drainWaves: { x: number; y: number; r: number; maxR: number; color: number; active: boolean }[] =
  [];
const greySlice: HTMLCanvasElement[] = [];

let dlgLines: HTMLCanvasElement[] = [];
let dlgBakedW = -1;

let shardSprite: HTMLCanvasElement | undefined;

export function startCutscene(done: () => void): void {
  onDone = done;
  phase = PH_TALK;
  t = 0;
  time = 0;
  skipGuard = true;
  revealed = 0;
  drained = 0;
  drainWaves.length = 0;
  showBoss = true;
  dlgBakedW = -1;

  for (let i = 0; i < 7; i++) {
    unlockedColors[i] = true;
  }
  bakeTiles();
  rebakeAllSprites();

  if (!shardSprite) {
    shardSprite = createSprite(99, 0, 7, 11);
  }

  const parts = plazaPortalParts();
  portalBack = parts.back;
  portalFront = parts.front;
  boss.x = portalBack.x - PLAYER_WIDTH - 4;
  boss.y = portalBack.y + portalBack.canvas.height - PLAYER_HEIGHT;
}

/** Jump to the run-start state: all colors locked, all pipes standing. */
function finish(): void {
  colorWave.active = false;
  for (let i = 0; i < 7; i++) {
    unlockedColors[i] = false;
  }
  bakeTiles();
  rebakeAllSprites();
  const done = onDone;
  onDone = null;
  if (done) {
    done();
  }
}

export function updateCutscene(dt: number): void {
  if (!onDone) {
    return;
  }
  const pressed = !skipGuard && (anyKeyPressed() || mouse.clicked);
  skipGuard = false;
  t += dt;
  time += dt;

  if (phase === PH_TALK) {
    if (pressed) {
      phase = PH_PIPES;
      t = 0;
    }
    return;
  }

  if (pressed) {
    finish();
    return;
  }

  if (phase === PH_PIPES) {
    while (revealed < 7 && t >= revealed * REVEAL_GAP_MS) {
      revealed++;
      showBoss = false;
    }
    if (revealed >= 7) {
      phase = PH_DRAIN;
      startDrainWaves();
    }
    return;
  }

  if (phase === PH_DRAIN) {
    let live = 0;
    let locked = false;
    for (const wave of drainWaves) {
      if (!wave.active) {
        continue;
      }
      wave.r += WAVE_SPEED * dt;
      if (wave.r >= wave.maxR) {
        wave.active = false;
        unlockedColors[wave.color] = false;
        locked = true;
      } else {
        live++;
      }
    }
    if (locked) {
      bakeTiles();
      rebakeAllSprites();
    }
    if (live === 0) {
      phase = PH_SHARD;
      dlgBakedW = -1;
    }
  }
}

function startDrainWaves(): void {
  drained = 7;
  drainWaves.length = 0;
  for (let i = 0; i < 7; i++) {
    const run = pipeRuns[i];
    const start = run[0];
    const cap = run[run.length - 1];
    const ox = start.x + start.canvas.width / 2;
    const oy = start.y + start.canvas.height / 2;
    const cx = cap.x + cap.canvas.width / 2;
    const cy = cap.y + cap.canvas.height / 2;
    drainWaves.push({
      x: ox,
      y: oy,
      r: 0,
      maxR: Math.hypot(cx - ox, cy - oy),
      color: i,
      active: true,
    });
    unlockedColors[i] = false;
    bakeTiles();
    let canvas = greySlice[i];
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      greySlice[i] = canvas;
    }
    (canvas.getContext('2d') as CanvasRenderingContext2D).drawImage(tileCanvases[i], 0, 0);
    unlockedColors[i] = true;
  }
  bakeTiles();
}

/** Clip each live drain so that color's slice greys from portal toward the cap. */
export function drawCutsceneDrain(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  firstTileX: number,
  firstTileY: number,
  lastTileX: number,
  lastTileY: number
): void {
  if (phase !== PH_DRAIN) {
    return;
  }
  for (const wave of drainWaves) {
    if (!wave.active) {
      continue;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(wave.x - cameraX, wave.y - cameraY, wave.r, 0, Math.PI * 2);
    ctx.clip();
    const canvas = greySlice[wave.color];
    for (let ty = firstTileY; ty <= lastTileY; ty++) {
      for (let tx = firstTileX; tx <= lastTileX; tx++) {
        if (getTile(tx, ty) === wave.color) {
          ctx.drawImage(
            canvas,
            Math.floor(tx * TILE_SIZE - cameraX),
            Math.floor(ty * TILE_SIZE - cameraY)
          );
        }
      }
    }
    ctx.restore();
  }
}

/** World-space cutscene layer: revealed pipes, plaza portal, boss, shard. */
export function drawCutsceneWorld(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number
): void {
  if (!onDone) {
    return;
  }
  for (let i = 0; i < revealed; i++) {
    const back = portalBacks[i];
    ctx.drawImage(back.canvas, Math.floor(back.x - cameraX), Math.floor(back.y - cameraY));
    for (const piece of pipeRuns[i]) {
      const canvas = i < drained ? piece.canvas : greyPipeCanvas(piece.canvas);
      ctx.drawImage(canvas, Math.floor(piece.x - cameraX), Math.floor(piece.y - cameraY));
    }
    const front = portalFronts[i];
    ctx.drawImage(front.canvas, Math.floor(front.x - cameraX), Math.floor(front.y - cameraY));
  }

  if (showBoss) {
    ctx.drawImage(
      portalBack.canvas,
      Math.floor(portalBack.x - cameraX),
      Math.floor(portalBack.y - cameraY)
    );
    if (finalBossSprites) {
      ctx.drawImage(finalBossSprites[0], Math.floor(boss.x - cameraX), Math.floor(boss.y - cameraY));
    }
    ctx.drawImage(
      portalFront.canvas,
      Math.floor(portalFront.x - cameraX),
      Math.floor(portalFront.y - cameraY)
    );
  }

  drawPlazaShard(ctx, cameraX, cameraY, time);
}

/** Shard hovering at the plaza. Title, cutscene, and run all use this position. */
export function drawPlazaShard(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  t: number
): void {
  if (!shardSprite) {
    shardSprite = createSprite(99, 0, 7, 11);
  }
  ctx.drawImage(
    shardSprite,
    Math.floor(SHARD_X - cameraX),
    Math.floor(SHARD_Y - cameraY) + Math.round(Math.sin(t / 300))
  );
}

function wrap(text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && measureText(next).w > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

/** Zelda-like dialogue panel: framed speaker portrait left, text right. */
export function drawCutsceneUi(
  ctx: CanvasRenderingContext2D,
  viewWidth: number,
  viewHeight: number
): void {
  if (!onDone || (phase !== PH_TALK && phase !== PH_SHARD)) {
    return;
  }

  const pad = 3;
  const frameW = 15;
  const frameH = 23;
  const panelW = Math.min(viewWidth - 8, 240);
  const panelH = frameH + pad * 2;
  const px = (viewWidth - panelW) >> 1;
  const py = viewHeight - panelH - 5;
  const textX = px + pad + frameW + 4;
  const textW = px + panelW - pad - textX;

  if (dlgBakedW !== textW) {
    dlgBakedW = textW;
    dlgLines = wrap(phase === PH_SHARD ? LINE_SHARD : LINE_BOSS, textW).map((line) =>
      bakeText(line)
    );
  }

  ctx.fillStyle = '#fff';
  ctx.fillRect(px - 1, py - 1, panelW + 2, panelH + 2);
  ctx.fillStyle = '#000';
  ctx.fillRect(px, py, panelW, panelH);

  const fx = px + pad;
  const fy = py + pad;
  ctx.fillStyle = '#747474';
  ctx.fillRect(fx, fy, frameW, frameH);
  ctx.fillStyle = '#000';
  ctx.fillRect(fx + 1, fy + 1, frameW - 2, frameH - 2);
  const portrait = phase === PH_SHARD ? shardSprite : finalBossSprites?.[0];
  if (portrait) {
    ctx.drawImage(
      portrait,
      fx + ((frameW - portrait.width) >> 1),
      fy + ((frameH - portrait.height) >> 1)
    );
  }

  const lineH = FONT_H + 2;
  const textY = py + ((panelH - (dlgLines.length * lineH - 2)) >> 1);
  for (let i = 0; i < dlgLines.length; i++) {
    ctx.drawImage(dlgLines[i], textX, textY + i * lineH);
  }

  if (time % 800 < 400) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(px + panelW - 4, py + panelH - 4, 2, 2);
  }
}
