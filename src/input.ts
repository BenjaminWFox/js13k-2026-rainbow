import { unlockAudio } from './audio';

const downKeys = new Set<string>();
const pressedKeys = new Set<string>();

export const mouse = {
  x: 0,
  y: 0,
  clicked: false,
};

export function initInput(canvas: HTMLCanvasElement): void {
  window.addEventListener('keydown', (event) => {
    unlockAudio();
    if (!event.repeat) {
      pressedKeys.add(event.code);
    }
    downKeys.add(event.code);
    if (event.code.startsWith('Arrow') || event.code === 'Space') {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    downKeys.delete(event.code);
  });

  const syncMouse = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  };
  canvas.addEventListener('mousemove', syncMouse);
  canvas.addEventListener('mousedown', (event) => {
    unlockAudio();
    if (event.button === 0) {
      syncMouse(event);
      mouse.clicked = true;
    }
  });
}

export function isDown(code: string): boolean {
  return downKeys.has(code);
}

/** True only on the first frame after the key went down. */
export function wasPressed(code: string): boolean {
  return pressedKeys.has(code);
}

/** True if any key went down this frame (cutscene advance/skip). */
export function anyKeyPressed(): boolean {
  return pressedKeys.size > 0;
}

/** Call once at the end of every frame. */
export function clearPressedKeys(): void {
  pressedKeys.clear();
  mouse.clicked = false;
}
