# Stolen Rainbows — Game Spec

A js13kgames compo entry. Total zipped package (code, graphics, audio) must be **under 13,312 bytes**.

---

## 1. Development Rules

These rules govern how code is written for this project.

1. **Readable first, golfed later.** The build pipeline (Terser → Roadroller → advzip/ECT via
   `js13k-vite-plugins`) does heavy minification and compression. Write clear, human-readable
   TypeScript with descriptive variable and function names. Hyper-golfing is a deliberate,
   late-stage activity once the game is mature — never a default style.
2. **Efficient, not clever.** Prefer simple data structures and straightforward algorithms.
   Avoid abstractions, classes, and indirection that don't pay for themselves. The sample game
   in `src/_sample-game/` shows the preferred idioms (plain modules, const enums as numbers,
   flat entity arrays).
3. **Repetition compresses well.** Roadroller and zip both reward self-similar code. Don't
   contort code to deduplicate a few lines; consistent, repetitive patterns often produce a
   smaller final package than "DRY" cleverness.
4. **One asset, derived variants.** Ship a single sprite sheet; derive all palette variants at
   runtime. Never ship two images that differ only by palette.
5. **Measure, don't guess.** Run `npm run build` regularly and track the zipped size. Byte
   costs are unintuitive post-compression; decisions between approaches should be settled by
   building both when practical.
6. **Budget awareness.** Rough working budget (revise as the project matures):
   - Sprite sheet PNG: ~1 KB
   - Engine (canvas/bake/input/loop): ~2–3 KB
   - World data + gameplay logic: ~5–6 KB
   - Audio (ZzFX/ZzFXM, deferred): ~1.5–2 KB
   - Headroom: ~1–2 KB
7. **No external dependencies at runtime.** Everything is hand-rolled or vendored (ZzFX/ZzFXM
   already vendored in the sample).
8. **TypeScript strictness stays on.** Types are free — they're erased at build time.

---

## 2. Game Overview

### Premise

You are a **unicorn** living in a bright world painted with all seven colors of the rainbow.
An evil corporation has opened a **portal** into your world and is siphoning the color away
through seven **pipes**. When the game begins, the world is entirely **greyscale**.

### Structure

- **Genre:** top-down, pixel sprite-based adventure (old-school Legend of Zelda feel).
- **World:** one single open-world level, freely navigable, rendered with a smooth-scrolling
  camera that follows the player.
- **Objective:** find all 7 pipes scattered across the world. Each pipe is guarded by a
  **miniboss**. Defeating a miniboss destroys its pipe and **releases one color** back into
  the world.
- **Order:** pipes can be tackled in **any order**. Every miniboss must be beatable with the
  base kit (headbutt) alone. Difficulty can scale with the number of pipes already destroyed.
- **Finale:** once all 7 colors are released, the **final boss** comes through the portal to
  investigate, triggering the end fight.
- **Pipe areas:** fully open for the initial pass — minibosses live in the open world and can
  be fought or fled freely.
  - *Potential later:* gated arenas that seal when entered until the miniboss dies, to keep
    fights focused and prevent kiting bosses across the map.

### Color release

When a miniboss is defeated, its color returns to the world as a **wave radiating outward
from the pipe**, recoloring the world as it passes.

> Fallback (if the wave costs too many bytes): the color returns instantly everywhere with a
> brief celebratory flash.

### Player

- **Health:** standard health pool. On death, respawn at a home/checkpoint with world
  progress kept (released colors stay released).
  - *Stretch:* "hardcore" mode — one life, full restart on death.
- **Mana:** a mana bar that replenishes over time.
  - Starts at **0 maximum mana** (no abilities usable) until the first pipe is destroyed.
  - Maximum mana **grows with each pipe destroyed**.
  - Exact max-mana curve, regen rate, and per-ability costs: **TBD** (tune during development).
- **Base attack:** headbutt (melee, always available, costs no mana).

### Powers (one per released color)

| Color  | Hex      | Power                                    |
|--------|----------|------------------------------------------|
| Red    | `e40404` | Fireball — ranged damage                  |
| Orange | `ff8200` | Flame nova — melee area damage            |
| Yellow | `f1e500` | Dash                                      |
| Green  | `08ba00` | Heal                                      |
| Blue   | `0030e2` | Frost nova — melee area freeze            |
| Indigo | `6e00ef` | Frostball — ranged single-target freeze   |
| Violet | `a656ff` | Damage shield — absorbs incoming damage while active |

### Enemies

- **Minibosses (7):** one per pipe. Each miniboss has:
  - a basic attack (melee or ranged), and
  - the **power associated with its color** (e.g. the red miniboss shoots fireballs).
- **Regular enemies:** roster **TBD** — likely a small set of corporation drones/creatures
  roaming the world.

### Controls

- **Arrow keys:** movement.
- **One key per ability** (headbutt + each unlocked power).
- **Settings screen:** simple key-remapping UI so players can bind abilities to keys of their
  choosing (supports non-QWERTY/non-English layouts).
- Default ability bindings: **TBD**.

### Persistence

- Progress saved to **localStorage**: released colors, destroyed pipes, player position/state.

### Audio

- **Deferred.** ZzFX (SFX) and ZzFXM (music) are vendored and available; audio design decided
  once core gameplay is working.
  - *Idea to explore:* a music track that gains instruments/richness as colors return.

---

## 3. Technical Design

### Rendering: bake-once canvas engine

The core visual mechanic — the world transitioning from greyscale to color — must not cost
anything per frame. The engine pre-renders ("bakes") sprites into offscreen canvases and the
render loop does nothing but `drawImage`:

1. **Load** `sprites.png` once; draw it to an offscreen canvas and read it with
   `getImageData` to get raw pixels.
2. **Bake:** for each sprite frame, write pixels into a dedicated offscreen canvas, applying
   the current palette state. Baking also handles the flips (vertical for up-facing, horizontal
   for right-facing) so the render loop never uses `ctx.scale`.
3. **Render loop:** pure `drawImage(bakedCanvas, x, y)` calls. Zero per-pixel work per frame.
4. **On color unlock:** re-bake affected sprites **once**, then resume pure `drawImage`.

### Palette state: color is the source of truth

`sprites.png` is authored in **full color** (the "all colors released" end state). While a
color is locked, the bake step remaps that color's pixels **down to its grey** — the reverse
of colorizing grey art.

Why this direction:

- The color→grey mapping is many-to-one, which is harmless: red (`e40404`) and the neutral
  mid-grey both render as `747474` while red is locked. The reverse (grey→color) is
  **ambiguous**: a `747474` pixel could be "locked red" or "permanently neutral grey", and
  several desaturated greys are within a few shades of each other (see §4 palette table).
- Only one PNG ships. `sprites-grey.png` is a **dev-only reference** and must be excluded
  from the build.

### Radiating color wave

For the wave effect (color returning outward from a destroyed pipe), the working approach:

- Maintain both a "current palette" baked set and a "next palette" baked set during a wave.
- Render the world twice clipped by an expanding circle (`ctx.clip` with an arc), or render
  the recolored version masked on top of the grey version. The wave is transient (a few
  seconds), so a temporary double-render is acceptable.
- If byte cost or performance is a problem, fall back to instant recolor + flash.

### Animation

- Sprites are frame-animated (3 frames per direction for the player). The baked canvases are
  per-frame; an entity tracks a `frame` accumulator advanced by delta time (as in the sample
  game) and the renderer picks the baked canvas for the current frame.
- Frame roles: **frame 0 is the standing/idle pose; walking alternates frames 1 and 2.**

### Resolution & display

- **The canvas fills the entire browser viewport** — no letterboxing or border.
- The internal resolution is dynamic: an integer pixel scale is chosen as
  `round(innerHeight / TARGET_VIEW_HEIGHT)` (currently **200**), then the canvas is sized to
  cover the window at that scale with `image-rendering: pixelated`. Pixels stay crisp at any
  window size; the visible world area varies slightly with window shape.
- With the 20px player and a ~200px view height: player ≈ 1/10 of screen height,
  visibility ≈ ±90px vertical from the player.
- *Tunable:* `TARGET_VIEW_HEIGHT` is the single zoom knob. Play-tested at 270 (too small to
  see the player) and 135 (too tight for ranged combat) before settling on 200.

### World / tilemap

- **Tile size: 20px** (player sprite = exactly 1 tile).
- **World: 100×100 tiles (2000×2000px)** to start ≈ 4.2×7.4 screens ≈ 31 screenfuls of area.
  Tunable; the authoring approach is not sensitive to dimensions.
- **Authoring: hybrid** — a hand-placed skeleton (pipes, checkpoints, biome regions,
  major walls) with seeded procedural decoration/fill.
  - *Fallback:* fully procedural from a seed with constraints guaranteeing 7 reachable pipes,
    if the hybrid approach has issues.

### Game state

- Flat entity array + plain module-level state, following the sample game's structure.
- Save/load via a single small JSON blob in localStorage.

---

## 4. Sprites

### Sheet: `public/sprites.png` (799×384, ~0.9 KB)

Authored in full color. Current contents:

| Region | Coordinates | Description |
|--------|-------------|-------------|
| Player up/down | (0,0)–(59,19) | 3 frames, 20×20 each. Authored facing **down** (top-down view); flip **vertically** for up. |
| Player left/right | (0,20)–(59,39) | 3 frames, 20×20 each. Authored facing **left**; flip **horizontally** for right. |
| Pipe | ~(0,41)–(27,54) | Siphon pipe segments (exact frame boxes TBD). |
| Bitmap font | right of pipe, ~y41–54 | `0123456789ABC…` glyphs (exact glyph size/coverage TBD). |
| Palette legend | y57 (spaced), y59 (packed) | Reference strip of the 11 palette colors. Not drawn in-game. |

The player sprite is the **first implementation focus**.

### Palette (11 colors)

Seven rainbow colors plus four neutrals. Greys below are the straight-desaturation values
measured from `sprites-grey.png` — used by the bake step when a color is locked.

All seven measured greys are exactly **HSL lightness**: `grey = (max(r,g,b) + min(r,g,b)) / 2`
(floored). The bake step uses this formula rather than a lookup table; it also leaves the four
neutral greys unchanged for free, and correctly desaturates any shaded placeholder variants of
the rainbow colors.

| Role    | Color    | Locked grey | Note |
|---------|----------|-------------|------|
| Red     | `e40404` | `747474`    | **Collides with neutral mid-grey** — harmless in the color→grey direction. |
| Orange  | `ff8200` | `7f7f7f`    | |
| Yellow  | `f1e500` | `787878`    | Within 4 shades of red/indigo greys. |
| Green   | `08ba00` | `5d5d5d`    | |
| Blue    | `0030e2` | `717171`    | |
| Indigo  | `6e00ef` | `777777`    | |
| Violet  | `a656ff` | `aaaaaa`    | |
| Neutral | `000000` | unchanged   | Outlines. |
| Neutral | `747474` | unchanged   | Mid-grey shading. |
| Neutral | `cecece` | unchanged   | Light grey (unicorn body). |
| Neutral | `ffffff` | unchanged   | White. |

### Asset rules

- `sprites-grey.png` is a **dev-only desaturation reference**; never ship it.
- New sprites (minibosses, enemies, tiles, final boss, portal) are added to `sprites.png`
  using only the 11 palette colors, so the bake system colors them for free.

---

## 5. Open Questions / TBD

- Mana curve: max per pipe destroyed, regen rate, per-ability costs.
- Regular enemy roster and behaviors.
- Default ability key bindings; settings screen layout.
- Font glyph metrics and character coverage.
- Audio design (deferred).
