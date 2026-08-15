import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_HIT,
  PLAYER_PIXEL_SCALE,
  PLAYER_SIZE,
  PLAYER_SPEED,
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

const OVERLAP_EPS = 1e-6;

// Axis-separated movement: slide along walls, snap flush to the tile edge
function moveWithCollision(dx: number, dy: number): void {
  moveAxis(dx, 0);
  moveAxis(0, dy);
}

function moveAxis(dx: number, dy: number): void {
  if (dx === 0 && dy === 0) {
    return;
  }
  const newX = player.x + dx;
  const newY = player.y + dy;
  if (!boxCollides(newX, newY)) {
    player.x = newX;
    player.y = newY;
    return;
  }

  const hit = getPlayerHitbox(newX, newY);
  if (dx > 0) {
    player.x = newX + (minOverlappingTileEdge(hit, 'left') - (hit.x + hit.w));
  } else if (dx < 0) {
    player.x = newX + (maxOverlappingTileEdge(hit, 'right') - hit.x);
  } else if (dy > 0) {
    player.y = newY + (minOverlappingTileEdge(hit, 'top') - (hit.y + hit.h));
  } else {
    player.y = newY + (maxOverlappingTileEdge(hit, 'bottom') - hit.y);
  }
}

function boxCollides(x: number, y: number): boolean {
  return forEachOverlappingSolid(getPlayerHitbox(x, y), () => true);
}

function forEachOverlappingSolid(
  hit: { x: number; y: number; w: number; h: number },
  visit: (tx: number, ty: number) => boolean | undefined
): boolean {
  const x0 = Math.floor(hit.x / TILE_SIZE);
  const y0 = Math.floor(hit.y / TILE_SIZE);
  const x1 = Math.floor((hit.x + hit.w - OVERLAP_EPS) / TILE_SIZE);
  const y1 = Math.floor((hit.y + hit.h - OVERLAP_EPS) / TILE_SIZE);
  let found = false;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (isSolidAt(tx * TILE_SIZE, ty * TILE_SIZE)) {
        found = true;
        if (visit(tx, ty)) {
          return true;
        }
      }
    }
  }
  return found;
}

function minOverlappingTileEdge(
  hit: { x: number; y: number; w: number; h: number },
  edge: 'left' | 'top'
): number {
  let best = Infinity;
  forEachOverlappingSolid(hit, (tx, ty) => {
    const value = edge === 'left' ? tx * TILE_SIZE : ty * TILE_SIZE;
    if (value < best) {
      best = value;
    }
  });
  return best;
}

function maxOverlappingTileEdge(
  hit: { x: number; y: number; w: number; h: number },
  edge: 'right' | 'bottom'
): number {
  let best = -Infinity;
  forEachOverlappingSolid(hit, (tx, ty) => {
    const value = edge === 'right' ? (tx + 1) * TILE_SIZE : (ty + 1) * TILE_SIZE;
    if (value > best) {
      best = value;
    }
  });
  return best;
}

/** World-space hitbox: centered 12x12 on the 16x16 sprite, then pixel-scaled. */
export function getPlayerHitbox(
  x = player.x,
  y = player.y
): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const inset = ((PLAYER_SIZE - PLAYER_HIT) / 2) * PLAYER_PIXEL_SCALE;
  const size = PLAYER_HIT * PLAYER_PIXEL_SCALE;
  return { x: x + inset, y: y + inset, w: size, h: size };
}
