import { PLAYER_HEIGHT, PLAYER_WIDTH } from './constants';
import { finalBossSprite, minibossSprites } from './enemies';
import { bakeText, FONT_H, measureText } from './font';
import { anyKeyPressed, mouse } from './input';
import { bakeTiles } from './map';
import { unlockedColors } from './palette';
import {
  greyPipeCanvas,
  type PipePiece,
  pipeHomes,
  pipeRuns,
  plazaPortalParts,
  portalBacks,
  portalFronts,
} from './pipes';
import { player } from './player';
import { createSprite, rebakeAllSprites } from './sprites';

// Opening cutscene (§2): the world starts fully colored; the Business Boss
// steps out of the plaza portal, dispatches the seven Business Men, the
// pipes appear colorless and then activate one after another (each draining
// its color), and the Shard sends the unicorn off. Any key/click advances a
// dialogue panel; during choreography it skips straight to the greyscale
// run-start state.

const PH_ENTER = 0; // portal fades in, boss walks out
const PH_TALK = 1; // two boss dialogue panels
const PH_MARCH = 2; // minibosses leave, pipes appear, then activate/drain
const PH_SHARD = 3; // closing shard panel

const SCRIPT = [
  'AHH WE FINALLY MADE IT! THESE COLORS ARE GOING TO MAKE ME RICH!!',
  'ALRIGHT BUSINESS MEN, GET TO WORK!',
  "OH NO! UNICORN, IT'S UP TO YOU TO FIND WHERE THOSE PIPES GO, AND DESTROY THEM!",
];

const PORTAL_FADE_MS = 500;
const BOSS_SPEED = 0.04;
const MINI_SPEED = 0.06;
const MINI_GAP_MS = 300;
// March timeline (ms from the march start)
const BOSS_EXIT_AT = 2400;
const REVEAL_AT = 1500;
const REVEAL_GAP_MS = 220;
const DRAIN_AT = 3600;
const DRAIN_GAP_MS = 400;
const MARCH_END = DRAIN_AT + 7 * DRAIN_GAP_MS + 500;

let onDone: (() => void) | null = null;
let phase = PH_ENTER;
/** Time within the current phase (ms). */
let t = 0;
/** Total cutscene time (ms), for bobbing/blinking. */
let time = 0;
/** Swallow the input that confirmed START on the same frame. */
let skipGuard = false;

let portalBack: PipePiece;
let portalFront: PipePiece;
let portalAlpha = 0;

const boss = { x: 0, y: 0, shown: false };
let bossStandX = 0;
let bossPortalX = 0;

interface Walker {
  x: number;
  y: number;
  dx: number;
  dy: number;
  launched: boolean;
}
const minis: Walker[] = [];

/** Pipes revealed so far (colorless until activated). */
let revealed = 0;
/** Pipes activated so far: stripe colored, world color drained. */
let drained = 0;

let dlgIndex = 0;
let dlgLines: HTMLCanvasElement[] = [];
let dlgBakedW = -1;

let shardSprite: HTMLCanvasElement | undefined;

export function startCutscene(done: () => void): void {
  onDone = done;
  phase = PH_ENTER;
  t = 0;
  time = 0;
  skipGuard = true;
  portalAlpha = 0;
  revealed = 0;
  drained = 0;
  dlgIndex = 0;
  dlgBakedW = -1;

  // Open on the pre-theft world: everything colored
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
  bossPortalX = portalBack.x;
  bossStandX = portalBack.x - PLAYER_WIDTH - 4;
  boss.x = bossPortalX;
  boss.y = portalBack.y + portalBack.canvas.height - PLAYER_HEIGHT;
  boss.shown = false;

  minis.length = 0;
  for (const home of pipeHomes) {
    const dx = home.x - bossPortalX;
    const dy = home.y - boss.y;
    const dist = Math.hypot(dx, dy) || 1;
    minis.push({ x: bossPortalX, y: boss.y, dx: dx / dist, dy: dy / dist, launched: false });
  }
}

/** Jump to the run-start state: all colors locked, all pipes standing. */
function finish(): void {
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

function drainNextColor(): void {
  unlockedColors[drained] = false;
  drained++;
  bakeTiles();
  rebakeAllSprites();
}

export function updateCutscene(dt: number): void {
  if (!onDone) {
    return;
  }
  const pressed = !skipGuard && (anyKeyPressed() || mouse.clicked);
  skipGuard = false;
  t += dt;
  time += dt;

  if (phase === PH_ENTER) {
    if (pressed) {
      finish();
      return;
    }
    portalAlpha = Math.min(1, t / PORTAL_FADE_MS);
    if (t > PORTAL_FADE_MS) {
      boss.shown = true;
      boss.x = Math.max(bossStandX, boss.x - BOSS_SPEED * dt);
      if (boss.x <= bossStandX) {
        phase = PH_TALK;
        t = 0;
      }
    }
    return;
  }

  if (phase === PH_TALK) {
    if (pressed) {
      dlgIndex++;
      dlgBakedW = -1;
      if (dlgIndex >= 2) {
        phase = PH_MARCH;
        t = 0;
      }
    }
    return;
  }

  if (phase === PH_MARCH) {
    if (pressed) {
      finish();
      return;
    }
    for (let i = 0; i < minis.length; i++) {
      const mini = minis[i];
      if (!mini.launched) {
        if (t < i * MINI_GAP_MS) {
          continue;
        }
        mini.launched = true;
      }
      mini.x += mini.dx * MINI_SPEED * dt;
      mini.y += mini.dy * MINI_SPEED * dt;
    }
    if (boss.shown && t >= BOSS_EXIT_AT) {
      boss.x += BOSS_SPEED * dt;
      if (boss.x >= bossPortalX) {
        boss.shown = false;
      }
    }
    if (!boss.shown && portalAlpha > 0) {
      portalAlpha = Math.max(0, portalAlpha - dt / PORTAL_FADE_MS);
    }
    if (t >= REVEAL_AT) {
      revealed = Math.min(7, 1 + Math.floor((t - REVEAL_AT) / REVEAL_GAP_MS));
    }
    while (drained < 7 && t >= DRAIN_AT + drained * DRAIN_GAP_MS) {
      drainNextColor();
    }
    if (t >= MARCH_END) {
      phase = PH_SHARD;
      dlgIndex = 2;
      dlgBakedW = -1;
      t = 0;
    }
    return;
  }

  if (pressed) {
    finish();
  }
}

/** World-space cutscene layer: revealed pipes, plaza portal, actors, shard. */
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

  if (portalAlpha > 0) {
    ctx.globalAlpha = portalAlpha;
    ctx.drawImage(
      portalBack.canvas,
      Math.floor(portalBack.x - cameraX),
      Math.floor(portalBack.y - cameraY)
    );
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < minis.length; i++) {
    const mini = minis[i];
    if (mini.launched) {
      ctx.drawImage(minibossSprites[i], Math.floor(mini.x - cameraX), Math.floor(mini.y - cameraY));
    }
  }
  if (boss.shown && finalBossSprite) {
    ctx.drawImage(finalBossSprite, Math.floor(boss.x - cameraX), Math.floor(boss.y - cameraY));
  }
  if (portalAlpha > 0) {
    ctx.globalAlpha = portalAlpha;
    ctx.drawImage(
      portalFront.canvas,
      Math.floor(portalFront.x - cameraX),
      Math.floor(portalFront.y - cameraY)
    );
    ctx.globalAlpha = 1;
  }

  if (shardSprite) {
    const bob = Math.round(Math.sin(time / 300));
    ctx.drawImage(
      shardSprite,
      Math.floor(player.x + 2 - cameraX),
      Math.floor(player.y - 15 - cameraY) + bob
    );
  }
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
    dlgLines = wrap(SCRIPT[dlgIndex], textW).map((line) => bakeText(line));
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
  const portrait = phase === PH_SHARD ? shardSprite : finalBossSprite;
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

  // Blinking advance marker
  if (time % 800 < 400) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(px + panelW - 4, py + panelH - 4, 2, 2);
  }
}
