import { currentColor } from './palette';

interface BakedSprite {
  canvas: HTMLCanvasElement;
  sourceX: number;
  sourceY: number;
  width: number;
  height: number;
  flipH: boolean;
  flipV: boolean;
  /** Quarter-turns counter-clockwise: 0–3 */
  rot90: number;
  pixelScale: number;
  /** If set, sheet pixels of this rgb are treated as `recolorTo` before palette bake. */
  recolorFrom: number;
  recolorTo: number;
}

let sheet: ImageData;
const bakedSprites: BakedSprite[] = [];

/** Load the sprite sheet once and keep its raw pixels for baking. */
export async function loadSpriteSheet(url: string): Promise<void> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(image, 0, 0);
  sheet = ctx.getImageData(0, 0, image.width, image.height);
}

/**
 * Bake a region of the sheet into its own canvas, applying the current palette
 * state (locked rainbow colors render as grey) and optional flips / rotation.
 * The returned canvas is stable: rebakes redraw into it in place.
 *
 * Transform order: flip in source space, then rotate 90° CCW `rot90` times.
 * Odd rotations swap width/height.
 *
 * `recolorFrom`/`recolorTo` swap an authored rgb (e.g. the pipe stripe) to a
 * rainbow color and skip the locked-palette remap, so the stripe stays colored
 * even while the rest of the world is grey.
 */
export function createSprite(
  sourceX: number,
  sourceY: number,
  width: number,
  height: number,
  flipH = false,
  flipV = false,
  rot90 = 0,
  pixelScale = 1,
  recolorFrom = 0,
  recolorTo = 0
): HTMLCanvasElement {
  const rot = ((rot90 % 4) + 4) % 4;
  const outW = (rot % 2 === 0 ? width : height) * pixelScale;
  const outH = (rot % 2 === 0 ? height : width) * pixelScale;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const sprite: BakedSprite = {
    canvas,
    sourceX,
    sourceY,
    width,
    height,
    flipH,
    flipV,
    rot90: rot,
    pixelScale,
    recolorFrom,
    recolorTo,
  };
  bake(sprite);
  bakedSprites.push(sprite);
  return canvas;
}

function bake(sprite: BakedSprite): void {
  const {
    sourceX,
    sourceY,
    width,
    height,
    flipH,
    flipV,
    rot90,
    pixelScale,
    recolorFrom,
    recolorTo,
  } = sprite;
  const swapped = rot90 % 2 === 1;
  const outWidth = (swapped ? height : width) * pixelScale;
  const outHeight = (swapped ? width : height) * pixelScale;
  // Canvas size can change on rebake if rot were mutable; keep in sync
  if (sprite.canvas.width !== outWidth || sprite.canvas.height !== outHeight) {
    sprite.canvas.width = outWidth;
    sprite.canvas.height = outHeight;
  }
  const output = new ImageData(outWidth, outHeight);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = sourceX + (flipH ? width - 1 - x : x);
      const srcY = sourceY + (flipV ? height - 1 - y : y);
      const srcIndex = (srcY * sheet.width + srcX) * 4;
      const alpha = sheet.data[srcIndex + 3];
      if (alpha === 0) {
        continue;
      }
      let rgb =
        (sheet.data[srcIndex] << 16) | (sheet.data[srcIndex + 1] << 8) | sheet.data[srcIndex + 2];
      if (recolorTo && rgb === recolorFrom) {
        rgb = recolorTo;
      } else {
        rgb = currentColor(rgb);
      }
      const r = (rgb >> 16) & 255;
      const g = (rgb >> 8) & 255;
      const b = rgb & 255;

      let dx = x;
      let dy = y;
      let dw = width;
      let dh = height;
      for (let i = 0; i < rot90; i++) {
        const ndx = dy;
        const ndy = dw - 1 - dx;
        dx = ndx;
        dy = ndy;
        const tmp = dw;
        dw = dh;
        dh = tmp;
      }

      for (let py = 0; py < pixelScale; py++) {
        for (let px = 0; px < pixelScale; px++) {
          const outIndex = ((dy * pixelScale + py) * outWidth + (dx * pixelScale + px)) * 4;
          output.data[outIndex] = r;
          output.data[outIndex + 1] = g;
          output.data[outIndex + 2] = b;
          output.data[outIndex + 3] = alpha;
        }
      }
    }
  }
  const ctx = sprite.canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.putImageData(output, 0, 0);
}

/** Re-render every baked sprite after the palette unlock state changes. */
export function rebakeAllSprites(): void {
  for (const sprite of bakedSprites) {
    bake(sprite);
  }
}
