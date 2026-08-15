import { currentColor } from './palette';

interface BakedSprite {
  canvas: HTMLCanvasElement;
  sourceX: number;
  sourceY: number;
  width: number;
  height: number;
  flipH: boolean;
  flipV: boolean;
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
 * state (locked rainbow colors render as grey) and optional flips.
 * The returned canvas is stable: rebakes redraw into it in place.
 */
export function createSprite(
  sourceX: number,
  sourceY: number,
  width: number,
  height: number,
  flipH = false,
  flipV = false
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const sprite: BakedSprite = { canvas, sourceX, sourceY, width, height, flipH, flipV };
  bake(sprite);
  bakedSprites.push(sprite);
  return canvas;
}

function bake(sprite: BakedSprite): void {
  const { sourceX, sourceY, width, height, flipH, flipV } = sprite;
  const output = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = sourceX + (flipH ? width - 1 - x : x);
      const srcY = sourceY + (flipV ? height - 1 - y : y);
      const srcIndex = (srcY * sheet.width + srcX) * 4;
      const alpha = sheet.data[srcIndex + 3];
      if (alpha === 0) {
        continue;
      }
      const rgb =
        (sheet.data[srcIndex] << 16) | (sheet.data[srcIndex + 1] << 8) | sheet.data[srcIndex + 2];
      const mapped = currentColor(rgb);
      const outIndex = (y * width + x) * 4;
      output.data[outIndex] = (mapped >> 16) & 255;
      output.data[outIndex + 1] = (mapped >> 8) & 255;
      output.data[outIndex + 2] = mapped & 255;
      output.data[outIndex + 3] = alpha;
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
