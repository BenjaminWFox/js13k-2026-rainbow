import { resetCombat } from './combat';
import { resetEnemies } from './enemies';
import { resetExplosions } from './fx';
import { pauseIconContains } from './hud';
import { mouse, wasPressed } from './input';
import { bakeTiles } from './map';
import { unlockedColors } from './palette';
import { consumeLevelUp, resetPickups } from './pickups';
import { player, resetPlayer } from './player';
import { rebakeAllSprites } from './sprites';
import {
  applyPick,
  CON_HP_PER_RANK,
  type DraftCard,
  dealLevelUpCards,
  KIND_STAT,
  resetRunStats,
  STAT_CON,
} from './stats';
import { closeUi, drawUi, isUiOpen, openCards, openMenu, updateUi } from './ui';

export const SCENE_TITLE = 0;
export const SCENE_RUN = 1;

export let scene = SCENE_TITLE;

let pauseOpen = false;
let hand: DraftCard[] = [];

/** Later overlays (pipe-unlock, death, win) push here so they never overlap. */
const overlayQueue: (() => void)[] = [];

export function enqueueOverlay(open: () => void): void {
  overlayQueue.push(open);
}

export function isWorldFrozen(): boolean {
  return scene !== SCENE_RUN || isUiOpen();
}

function openTitle(): void {
  pauseOpen = false;
  scene = SCENE_TITLE;
  openMenu('STOLEN RAINBOWS', ['START'], () => startRun(), 2, true);
}

function startRun(): void {
  closeUi();
  overlayQueue.length = 0;
  resetRun();
  scene = SCENE_RUN;
}

function quitToTitle(): void {
  closeUi();
  overlayQueue.length = 0;
  openTitle();
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
  }
}

function wantsPause(): boolean {
  return (
    wasPressed('Escape') ||
    wasPressed('KeyP') ||
    (mouse.clicked && pauseIconContains(mouse.x, mouse.y))
  );
}

export function initOverlays(): void {
  openTitle();
}

export function resetRun(): void {
  resetRunStats();
  resetPlayer();
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
  pumpOverlays();
}

export function drawOverlays(
  ctx: CanvasRenderingContext2D,
  viewWidth: number,
  viewHeight: number
): void {
  drawUi(ctx, viewWidth, viewHeight);
}
