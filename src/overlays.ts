import { primeFinalePowers, resetCombat } from './combat';
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants';
import { startCutscene } from './cutscene';
import {
  killOnScreenRegulars,
  resetEnemies,
  spawnFinalBoss,
  takeSlainFinalBoss,
  takeSlainMiniboss,
  unlockNextTier,
} from './enemies';
import { resetExplosions, spawnExplosion } from './fx';
import { formatScrap, pauseIconContains } from './hud';
import { mouse, wasPressed } from './input';
import { bakeTiles, snapshotTiles } from './map';
import { RAINBOW_COLORS, unlockedColors } from './palette';
import { consumeLevelUp, resetPickups, scrap, spendScrap } from './pickups';
import { generatePipes, spawnPlazaPortal, takePipeSegment } from './pipes';
import { player, resetPlayer, tryRevive } from './player';
import { loadSave, saveGame } from './save';
import { rebakeAllSprites } from './sprites';
import {
  applyPick,
  COLOR_NAMES,
  COLOR_POWERS,
  CON_HP_PER_RANK,
  type DraftCard,
  dealLevelUpCards,
  grantPower,
  KIND_STAT,
  POWER_TITLE,
  POWER_UNLOCK_BODY,
  resetRunStats,
  SHOP_RANK_CAP,
  SHOP_ROWS,
  STAT_CON,
  shopLine,
  shopPrice,
  shopRanks,
} from './stats';
import { closeUi, drawUi, isUiOpen, openCards, openMenu, updateUi } from './ui';

export const SCENE_TITLE = 0;
export const SCENE_RUN = 1;
export const SCENE_CUTSCENE = 2;

export let scene = SCENE_TITLE;

const PHASE_PIPE = 0;
const PHASE_WAVE = 1;
const PIPE_GAP_MS = 45;
const WAVE_SPEED = 0.38;

let pauseOpen = false;
let hand: DraftCard[] = [];
let seq: {
  phase: number;
  color: number;
  x: number;
  y: number;
  wait: number;
} | null = null;
let finaleStarted = false;

export const colorWave = { active: false, x: 0, y: 0, r: 0 };

/** Later overlays (pipe-unlock, death, win) push here so they never overlap. */
const overlayQueue: (() => void)[] = [];

export function enqueueOverlay(open: () => void): void {
  overlayQueue.push(open);
}

export function isWorldFrozen(): boolean {
  return scene !== SCENE_RUN || isUiOpen();
}

export function isSequenceActive(): boolean {
  return seq !== null;
}

function openTitle(): void {
  pauseOpen = false;
  scene = SCENE_TITLE;
  openMenu(
    'STOLEN RAINBOWS',
    ['START', 'UPGRADES'],
    (index) => {
      if (index === 0) {
        startRun();
      } else {
        openShop(true);
      }
    },
    2,
    true
  );
}

function startRun(): void {
  closeUi();
  overlayQueue.length = 0;
  resetRun();
  scene = SCENE_CUTSCENE;
  startCutscene(() => {
    scene = SCENE_RUN;
  });
}

function quitToTitle(): void {
  closeUi();
  overlayQueue.length = 0;
  saveGame();
  resetRun();
  openTitle();
}

function openDeath(): void {
  saveGame();
  openMenu('YOU DIED', ['CONTINUE'], () => openShop(false));
}

function openWin(): void {
  saveGame();
  openMenu('YOU WIN', ['CONTINUE'], () => openShop(false));
}

function openShop(fromTitle: boolean): void {
  const items: string[] = [];
  for (let i = 0; i < SHOP_ROWS; i++) {
    items.push(shopLine(i));
  }
  items.push('DONE');
  openMenu(
    'SHOP',
    items,
    (index) => {
      if (index >= SHOP_ROWS) {
        closeUi();
        saveGame();
        if (fromTitle) {
          openTitle();
        } else {
          startRun();
        }
        return;
      }
      if (shopRanks[index] < SHOP_RANK_CAP && spendScrap(shopPrice(index))) {
        shopRanks[index]++;
        saveGame();
        openShop(fromTitle);
      }
    },
    1,
    false,
    'SCRAP ' + formatScrap(scrap)
  );
}

function openPause(): void {
  pauseOpen = true;
  openMenu('PAUSED', ['RESUME', 'QUIT TO MENU'], (index) => {
    closeUi();
    pauseOpen = false;
    if (index === 1) {
      quitToTitle();
    }
  });
}

function closePause(): void {
  closeUi();
  pauseOpen = false;
}

function openLevelUp(): void {
  hand = dealLevelUpCards();
  if (hand.length === 0) {
    return;
  }
  openCards('LEVEL UP', hand, (index) => {
    const card = hand[index];
    applyPick(card);
    if (card.kind === KIND_STAT && card.id === STAT_CON) {
      player.maxHp += CON_HP_PER_RANK;
      player.hp += CON_HP_PER_RANK;
    }
    closeUi();
  });
}

function openUnlock(color: number): void {
  const power = COLOR_POWERS[color];
  const hex = '#' + RAINBOW_COLORS[color].toString(16).padStart(6, '0');
  openCards(
    COLOR_NAMES[color],
    [{ title: POWER_TITLE[power], body: POWER_UNLOCK_BODY[color] }],
    () => closeUi(),
    hex
  );
}

function beginWave(color: number, x: number, y: number): void {
  snapshotTiles();
  unlockedColors[color] = true;
  bakeTiles();
  rebakeAllSprites();
  colorWave.active = true;
  colorWave.x = x;
  colorWave.y = y;
  colorWave.r = 0;
  if (seq) {
    seq.phase = PHASE_WAVE;
  }
}

function pumpOverlays(): void {
  if (isUiOpen() || scene !== SCENE_RUN) {
    return;
  }
  const next = overlayQueue.shift();
  if (next) {
    next();
    return;
  }
  if (consumeLevelUp()) {
    openLevelUp();
    return;
  }
  if (!seq && !finaleStarted && allColorsUnlocked()) {
    beginFinale();
  }
}

function allColorsUnlocked(): boolean {
  for (let i = 0; i < 7; i++) {
    if (!unlockedColors[i]) {
      return false;
    }
  }
  return true;
}

/** Plaza portal + Business Boss. Safe to call once per run. */
export function beginFinale(): void {
  if (finaleStarted || scene !== SCENE_RUN) {
    return;
  }
  finaleStarted = true;
  const home = spawnPlazaPortal();
  spawnFinalBoss(home.x, home.y);
  primeFinalePowers();
}

function wantsPause(): boolean {
  return (
    wasPressed('Escape') ||
    wasPressed('KeyP') ||
    (mouse.clicked && pauseIconContains(mouse.x, mouse.y))
  );
}

export function initOverlays(): void {
  loadSave();
  openTitle();
}

export function resetRun(): void {
  seq = null;
  finaleStarted = false;
  colorWave.active = false;
  resetRunStats();
  resetPlayer();
  generatePipes(1);
  resetEnemies();
  resetPickups();
  resetExplosions();
  resetCombat();
  for (let i = 0; i < 7; i++) {
    unlockedColors[i] = false;
  }
  rebakeAllSprites();
  bakeTiles();
}

/** Consume a slain miniboss and start the choreographed death sequence. */
export function startPendingDeathSequence(
  camX: number,
  camY: number,
  viewW: number,
  viewH: number
): void {
  const death = takeSlainMiniboss();
  if (!death) {
    return;
  }
  grantPower(COLOR_POWERS[death.color]);
  unlockNextTier();
  killOnScreenRegulars(camX, camY, viewW, viewH);
  seq = {
    phase: PHASE_PIPE,
    color: death.color,
    x: death.x,
    y: death.y,
    wait: 0,
  };
}

export function updateSequence(dt: number): void {
  if (!seq) {
    return;
  }
  if (seq.phase === PHASE_PIPE) {
    seq.wait += dt;
    while (seq.wait >= PIPE_GAP_MS) {
      seq.wait -= PIPE_GAP_MS;
      const piece = takePipeSegment(seq.color);
      if (!piece) {
        beginWave(seq.color, seq.x, seq.y);
        return;
      }
      const cx = piece.x + piece.canvas.width / 2;
      const cy = piece.y + piece.canvas.height / 2;
      spawnExplosion(cx, cy, RAINBOW_COLORS[seq.color], 10);
      spawnExplosion(cx, cy, 0xb1b1b1, 8);
    }
    return;
  }

  colorWave.r += WAVE_SPEED * dt;
  const worldW = MAP_WIDTH * TILE_SIZE;
  const worldH = MAP_HEIGHT * TILE_SIZE;
  const maxR = Math.max(
    Math.hypot(colorWave.x, colorWave.y),
    Math.hypot(worldW - colorWave.x, colorWave.y),
    Math.hypot(colorWave.x, worldH - colorWave.y),
    Math.hypot(worldW - colorWave.x, worldH - colorWave.y)
  );
  if (colorWave.r >= maxR) {
    colorWave.active = false;
    const color = seq.color;
    seq = null;
    openUnlock(color);
  }
}

export function updateOverlays(viewWidth: number, viewHeight: number): void {
  if (scene === SCENE_RUN && wantsPause()) {
    if (pauseOpen) {
      closePause();
      mouse.clicked = false;
    } else if (!isUiOpen()) {
      openPause();
      mouse.clicked = false;
    }
  }
  if (isUiOpen()) {
    updateUi(viewWidth, viewHeight);
  }
  if (takeSlainFinalBoss()) {
    enqueueOverlay(openWin);
  }
  if (scene === SCENE_RUN && !isUiOpen() && !seq && player.hp <= 0 && overlayQueue.length === 0) {
    if (!tryRevive()) {
      openDeath();
    }
  }
  pumpOverlays();
}

export function drawOverlays(
  ctx: CanvasRenderingContext2D,
  viewWidth: number,
  viewHeight: number
): void {
  drawUi(ctx, viewWidth, viewHeight);
}
