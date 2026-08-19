import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_HIT,
  PLAYER_SPEED,
  TILE_SIZE,
} from './constants';
import { spawnExplosion } from './fx';
import { isDown } from './input';
import { getTileSolid } from './map';
import { pipePieces } from './pipes';

export const player = {
  // Top-left corner of the player sprite, world-space pixels
  x: (MAP_WIDTH / 2) * TILE_SIZE,
  y: (MAP_HEIGHT / 2) * TILE_SIZE,
  // Last-move facing, diagonals included. Initial facing is right.
  faceX: 1,
  faceY: 0,
  moving: false,
  // Baseline 100 HP; CON / shop Start HP raise the max in later phases
  hp: 100,
  maxHp: 100,
};

/** Death handling (revives, run-end overlay) lands with the run lifecycle phase. */
export function damagePlayer(amount: number): void {
  if (amount <= 0 || player.hp <= 0) {
    return;
  }
  const hit = getPlayerHitbox();
  const cx = hit.x + hit.w / 2;
  const cy = hit.y + hit.h / 2;
  spawnExplosion(cx, cy, 0x000000, 5);
  spawnExplosion(cx, cy, 0xffffff, 5);
  player.hp = Math.max(0, player.hp - amount);
}

const DIAGONAL_RELEASE_MS = 100;

let lastDiagX = 1;
let lastDiagY = 0;
/** -1 = no pending diagonal; 0 = currently diagonal; >0 = ms since leaving a diagonal. */
let diagGrace = -1;

export function updatePlayer(dt: number): void {
  let dx = 0;
  let dy = 0;
  if (isDown('ArrowLeft') || isDown('KeyA')) {
    dx -= 1;
  }
  if (isDown('ArrowRight') || isDown('KeyD')) {
    dx += 1;
  }
  if (isDown('ArrowUp') || isDown('KeyW')) {
    dy -= 1;
  }
  if (isDown('ArrowDown') || isDown('KeyS')) {
    dy += 1;
  }

  player.moving = dx !== 0 || dy !== 0;
  if (!player.moving) {
    if (diagGrace >= 0 && diagGrace <= DIAGONAL_RELEASE_MS) {
      player.faceX = lastDiagX;
      player.faceY = lastDiagY;
    }
    diagGrace = -1;
    return;
  }

  if (dx !== 0 && dy !== 0) {
    lastDiagX = dx;
    lastDiagY = dy;
    diagGrace = 0;
    player.faceX = dx;
    player.faceY = dy;
  } else if (diagGrace >= 0 && diagGrace <= DIAGONAL_RELEASE_MS) {
    diagGrace += dt;
    if (diagGrace > DIAGONAL_RELEASE_MS) {
      diagGrace = -1;
      player.faceX = dx;
      player.faceY = dy;
    }
  } else {
    player.faceX = dx;
    player.faceY = dy;
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

function hitsSolid(
  hit: { x: number; y: number; w: number; h: number },
  solid: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    hit.x < solid.x + solid.w - OVERLAP_EPS &&
    hit.x + hit.w > solid.x + OVERLAP_EPS &&
    hit.y < solid.y + solid.h - OVERLAP_EPS &&
    hit.y + hit.h > solid.y + OVERLAP_EPS
  );
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
      if (solid && hitsSolid(hit, solid)) {
        found = true;
        if (visit(solid)) {
          return true;
        }
      }
    }
  }
  for (const piece of pipePieces) {
    for (const solid of piece.hits ?? []) {
      if (hitsSolid(hit, solid)) {
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
