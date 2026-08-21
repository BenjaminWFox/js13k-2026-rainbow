// The canvas fills the whole viewport at an integer pixel scale chosen so the
// visible world height is as close to this as possible.
export const TARGET_VIEW_HEIGHT = 300;

export const TILE_SIZE = 11;

export const PLAYER_HIT = 11;
export const PLAYER_WIDTH = 11;
export const PLAYER_HEIGHT = 19;
export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 100;

/** Plaza spawn; y is 5px above tile-center so it matches the title tableau. */
export const PLAYER_SPAWN_X = (MAP_WIDTH / 2) * TILE_SIZE;
export const PLAYER_SPAWN_Y = (MAP_HEIGHT / 2) * TILE_SIZE - 5;
export const SHARD_X = PLAYER_SPAWN_X + 2;
export const SHARD_Y = PLAYER_SPAWN_Y - 25;

// Pixels per millisecond
export const PLAYER_SPEED = 0.05;

// Walk-cycle cadence (§3 Animation): ms per leg-cut frame while moving
export const WALK_FRAME_MS = 150;
