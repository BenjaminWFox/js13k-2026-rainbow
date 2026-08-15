// The canvas fills the whole viewport at an integer pixel scale chosen so the
// visible world height is as close to this as possible.
export const TARGET_VIEW_HEIGHT = 250;

export const TILE_SIZE = 20;

// Native unicorn frame sizes in the packed sheet (sprites-unicorn.png)
export const PLAYER_DOWN_WIDTH = 9;
export const PLAYER_DOWN_HEIGHT = 17;
export const PLAYER_SIDE_WIDTH = 16;
export const PLAYER_SIDE_HEIGHT = 14;
export const PLAYER_PIXEL_SCALE = 2;

// Logical size: widest/tallest baked frame, used for camera and collision
export const PLAYER_WIDTH = PLAYER_SIDE_WIDTH * PLAYER_PIXEL_SCALE;
export const PLAYER_HEIGHT = PLAYER_DOWN_HEIGHT * PLAYER_PIXEL_SCALE;
export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 100;

// Pixels per millisecond
export const PLAYER_SPEED = 0.11;

// Milliseconds per walk animation frame
export const WALK_FRAME_DURATION = 130;
