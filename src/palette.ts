export const RED = 0;
export const ORANGE = 1;
export const YELLOW = 2;
export const GREEN = 3;
export const BLUE = 4;
export const INDIGO = 5;
export const VIOLET = 6;

export const RAINBOW_COLORS = [
  0xe40404, 0xff8200, 0xf1e300, 0x08ba00, 0x0030e2, 0x6c00ef, 0xa656ff,
];

// Which of the 7 rainbow colors have been released back into the world.
export const unlockedColors = [false, false, false, false, false, false, false];

// Maps every rgb value used in art to the rainbow color it belongs to, so shaded
// variants grey out and return together with their base color. Neutral greys
// (000000 / 747474 / cecece / ffffff) are deliberately absent: they never change.
const colorFamily = new Map<number, number>();
RAINBOW_COLORS.forEach((color, index) => {
  colorFamily.set(color, index);
});
// Sheet exports sometimes quantize a channel by 1; treat as the same family
colorFamily.set(0xff8300, ORANGE);
colorFamily.set(0xff8100, ORANGE);
colorFamily.set(0xff8000, ORANGE);
colorFamily.set(0xf1e500, YELLOW);
colorFamily.set(0xf1e600, YELLOW);
colorFamily.set(0xf1e400, YELLOW);
colorFamily.set(0x6e00ef, INDIGO);
colorFamily.set(0x6d00ef, INDIGO);
colorFamily.set(0x6b00ef, INDIGO);
colorFamily.set(0x6f00ef, INDIGO);

/**
 * Desaturate a color to its locked grey using HSL lightness.
 * This exactly reproduces the reference greys in sprites-grey.png for all 7
 * rainbow colors, and is a no-op for colors that are already grey.
 */
export function greyOf(rgb: number): number {
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) >> 1;
  return (lightness << 16) | (lightness << 8) | lightness;
}

/** The color a pixel should render as right now, given the unlock state. */
export function currentColor(rgb: number): number {
  const family = colorFamily.get(rgb);
  if (family === undefined || unlockedColors[family]) {
    return rgb;
  }
  return greyOf(rgb);
}

/** CSS string for the current render color of an authored rgb value. */
export function cssColor(rgb: number): string {
  return '#' + currentColor(rgb).toString(16).padStart(6, '0');
}

/**
 * A darker (factor < 1) or lighter (factor > 1, toward white) variant of a
 * rainbow color, registered so it greys out with its base color.
 * Used for placeholder tile art until real tiles land in sprites.png.
 */
export function rainbowShade(colorIndex: number, factor: number): number {
  const base = RAINBOW_COLORS[colorIndex];
  let rgb = 0;
  for (const shift of [16, 8, 0]) {
    const channel = (base >> shift) & 255;
    const shaded = factor <= 1 ? channel * factor : channel + (255 - channel) * (factor - 1);
    rgb |= Math.min(255, Math.round(shaded)) << shift;
  }
  colorFamily.set(rgb, colorIndex);
  return rgb;
}
