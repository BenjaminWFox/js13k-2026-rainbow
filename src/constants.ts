// The canvas fills the whole viewport at an integer pixel scale chosen so the
// visible world height is as close to this as possible.
export const TARGET_VIEW_HEIGHT = 250;

export const TILE_SIZE = 11;

// Single-frame unicorn in sprites.png (bottom-left), drawn 1:1
export const PLAYER_SPRITE_X = 0;
export const PLAYER_SPRITE_Y = 0;
export const PLAYER_SPRITE_W = 11;
export const PLAYER_SPRITE_H = 19;
export const PLAYER_HIT = 11;

export const PLAYER_WIDTH = PLAYER_SPRITE_W;
export const PLAYER_HEIGHT = PLAYER_SPRITE_H;
export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 100;

// Pixels per millisecond
export const PLAYER_SPEED = 0.05;

// Walk-cycle cadence (§3 Animation): ms per leg-cut frame while moving
export const WALK_FRAME_MS = 150;
