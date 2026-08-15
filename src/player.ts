import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SPEED,
  PLAYER_WIDTH,
  TILE_SIZE,
  WALK_FRAME_DURATION,
} from './constants';
import { isDown } from './input';
import { isSolidAt } from './map';

export const DIR_DOWN = 0;
export const DIR_UP = 1;
export const DIR_LEFT = 2;
export const DIR_RIGHT = 3;

export const player = {
  // Top-left corner of the player sprite, world-space pixels
  x: (MAP_WIDTH / 2) * TILE_SIZE,
  y: (MAP_HEIGHT / 2) * TILE_SIZE,
  facing: DIR_DOWN,
  moving: false,
  walkTime: 0,
};

// Collision box within the player sprite, biased toward the feet (Zelda-style)
const BOX_LEFT = 6;
const BOX_RIGHT = PLAYER_WIDTH - 6;
const BOX_TOP = 16;
const BOX_BOTTOM = PLAYER_HEIGHT;

// Frame 0 is the standing pose; walking alternates between frames 1 and 2
const WALK_SEQUENCE = [1, 2];

export function updatePlayer(dt: number): void {
  let dx = 0;
  let dy = 0;
  if (isDown('ArrowLeft')) {
    dx -= 1;
  }
  if (isDown('ArrowRight')) {
    dx += 1;
  }
  if (isDown('ArrowUp')) {
    dy -= 1;
  }
  if (isDown('ArrowDown')) {
    dy += 1;
  }

  player.moving = dx !== 0 || dy !== 0;
  if (!player.moving) {
    player.walkTime = 0;
    return;
  }

  if (dx !== 0) {
    player.facing = dx < 0 ? DIR_LEFT : DIR_RIGHT;
  } else {
    player.facing = dy < 0 ? DIR_UP : DIR_DOWN;
  }

  const speed = PLAYER_SPEED * (dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1);
  moveWithCollision(dx * speed * dt, dy * speed * dt);
  player.walkTime += dt;
}

export function currentPlayerFrame(): number {
  if (!player.moving) {
    return 0;
  }
  const step = Math.floor(player.walkTime / WALK_FRAME_DURATION);
  return WALK_SEQUENCE[step % WALK_SEQUENCE.length];
}

// Axis-separated movement so the player slides along walls
function moveWithCollision(dx: number, dy: number): void {
  const newX = player.x + dx;
  if (!boxCollides(newX, player.y)) {
    player.x = newX;
  }
  const newY = player.y + dy;
  if (!boxCollides(player.x, newY)) {
    player.y = newY;
  }
}

function boxCollides(x: number, y: number): boolean {
  const left = x + BOX_LEFT;
  const right = x + BOX_RIGHT - 1;
  const top = y + BOX_TOP;
  const bottom = y + BOX_BOTTOM - 1;
  const tileX0 = Math.floor(left / TILE_SIZE);
  const tileY0 = Math.floor(top / TILE_SIZE);
  const tileX1 = Math.floor(right / TILE_SIZE);
  const tileY1 = Math.floor(bottom / TILE_SIZE);
  for (let ty = tileY0; ty <= tileY1; ty++) {
    for (let tx = tileX0; tx <= tileX1; tx++) {
      if (isSolidAt(tx * TILE_SIZE, ty * TILE_SIZE)) {
        return true;
      }
    }
  }
  return false;
}
