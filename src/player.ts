import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_HIT,
  PLAYER_SPEED,
  TILE_SIZE,
} from './constants';
import { isDown } from './input';
import { getTileSolid } from './map';

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
};

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
    return;
  }

  if (dx !== 0) {
    player.facing = dx < 0 ? DIR_LEFT : DIR_RIGHT;
  } else {
    player.facing = dy < 0 ? DIR_UP : DIR_DOWN;
  }

  const speed = PLAYER_SPEED * (dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1);
  moveWithCollision(dx * speed * dt, dy * speed * dt);
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
  visit: (solid: { x: number; y: number; w: number; h: number }) => boolean | undefined
): boolean {
  const x0 = Math.floor(hit.x / TILE_SIZE);
  const y0 = Math.floor(hit.y / TILE_SIZE);
  const x1 = Math.floor((hit.x + hit.w - OVERLAP_EPS) / TILE_SIZE);
  const y1 = Math.floor((hit.y + hit.h - OVERLAP_EPS) / TILE_SIZE);
  let found = false;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const solid = getTileSolid(tx, ty);
      if (
        solid &&
        hit.x < solid.x + solid.w - OVERLAP_EPS &&
        hit.x + hit.w > solid.x + OVERLAP_EPS &&
        hit.y < solid.y + solid.h - OVERLAP_EPS &&
        hit.y + hit.h > solid.y + OVERLAP_EPS
      ) {
        found = true;
        if (visit(solid)) {
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
  forEachOverlappingSolid(hit, (solid) => {
    const value = edge === 'left' ? solid.x : solid.y;
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
  forEachOverlappingSolid(hit, (solid) => {
    const value = edge === 'right' ? solid.x + solid.w : solid.y + solid.h;
    if (value > best) {
      best = value;
    }
  });
  return best;
}

/** 11x11 hitbox aligned to the bottom of the 11x19 sprite (head sticks out above). */
export function getPlayerHitbox(
  x = player.x,
  y = player.y
): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return {
    x,
    y: y + (PLAYER_HEIGHT - PLAYER_HIT),
    w: PLAYER_HIT,
    h: PLAYER_HIT,
  };
}
