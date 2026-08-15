const downKeys = new Set<string>();
const pressedKeys = new Set<string>();

export function initInput(): void {
  window.addEventListener('keydown', (event) => {
    if (!event.repeat) {
      pressedKeys.add(event.code);
    }
    downKeys.add(event.code);
    if (event.code.startsWith('Arrow')) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    downKeys.delete(event.code);
  });
}

export function isDown(code: string): boolean {
  return downKeys.has(code);
}

/** True only on the first frame after the key went down. */
export function wasPressed(code: string): boolean {
  return pressedKeys.has(code);
}

/** Call once at the end of every frame. */
export function clearPressedKeys(): void {
  pressedKeys.clear();
}
