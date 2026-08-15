import { MAP_HEIGHT, MAP_WIDTH, PLAYER_SPEED, TILE_SIZE, WALK_FRAME_DURATION } from './constants';
import { isDown } from './input';
import { isSolidAt } from './map';

export const DIR_DOWN = 0;
export const DIR_UP = 1;
export const DIR_LEFT = 2;
export const DIR_RIGHT = 3;

export const player = {
  // Top-left corner of the 20x20 sprite, world-space pixels
  x: (MAP_WIDTH / 2) * TILE_SIZE,
  y: (MAP_HEIGHT / 2) * TILE_SIZE,
  facing: DIR_DOWN,
  moving: false,
  walkTime: 0,
};

// Collision box within the 20x20 sprite, biased toward the feet (Zelda-style)
const BOX_LEFT = 3;
const BOX_RIGHT = 17;
const BOX_TOP = 8;
const BOX_BOTTOM = 20;

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

// The box is smaller than a tile in both dimensions, so corner checks suffice
function boxCollides(x: number, y: number): boolean {
  return (
    isSolidAt(x + BOX_LEFT, y + BOX_TOP) ||
    isSolidAt(x + BOX_RIGHT - 1, y + BOX_TOP) ||
    isSolidAt(x + BOX_LEFT, y + BOX_BOTTOM - 1) ||
    isSolidAt(x + BOX_RIGHT - 1, y + BOX_BOTTOM - 1)
  );
}
