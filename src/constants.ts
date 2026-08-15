// The canvas fills the whole viewport at an integer pixel scale chosen so the
// visible world height is as close to this as possible.
export const TARGET_VIEW_HEIGHT = 250;

export const TILE_SIZE = 20;

// Native unicorn frame size in sprites-squared.png (all directions are 16x16)
export const PLAYER_SIZE = 16;
export const PLAYER_HIT = 12;
export const PLAYER_PIXEL_SCALE = 2;

export const PLAYER_WIDTH = PLAYER_SIZE * PLAYER_PIXEL_SCALE;
export const PLAYER_HEIGHT = PLAYER_WIDTH;
export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 100;

// Pixels per millisecond
export const PLAYER_SPEED = 0.11;

// Milliseconds per walk animation frame
export const WALK_FRAME_DURATION = 130;
