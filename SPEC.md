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
   - Pause-card UI (level-up + pipe-unlock overlays) and the between-run scrap shop are
     new byte consumers. Shop rows are the first cut if the zip is tight.
7. **No external dependencies at runtime.** Everything is hand-rolled or vendored (ZzFX/ZzFXM
   already vendored in the sample).
8. **TypeScript strictness stays on.** Types are free — they're erased at build time.
9. **Dev tooling is isolated.** Debug keys/overlays live in `src/debug.ts` and are loaded
   only behind `import.meta.env.DEV`, so they are not part of the production entry.

---

## 2. Game Overview

### Premise

You are a **unicorn** living in a bright world painted with all seven colors of the rainbow.
An evil corporation has opened a **portal** into your world and is siphoning the color away
through seven **pipes**. When a run begins, the world is entirely **greyscale**.

### Structure

- **Genre:** top-down, pixel sprite-based **survivors-like** (Vampire Survivors-like).
  Movement is the only player control; all owned abilities auto-fire.
- **World:** one single open-world map, freely navigable, rendered with a smooth-scrolling
  camera that follows the player. Keep the current pipe layout and size as the starting
  point; distances are tuning TBD.
- **A run:** the player spawns at the **world center** with the starting kit. Colors,
  powers, XP, and in-run stats **reset** each run. Death ends the run after revives are
  spent. Scrap and shop ranks persist between runs (see Scrap).
- **Objective:** find all 7 pipes. Each pipe is guarded by a **miniboss**. Defeating a
  miniboss destroys its pipe, **releases one color**, and **grants that color's power
  immediately**. The power then starts auto-firing.
- **Order:** pipes can be tackled in **any order**. Every miniboss must be beatable with
  the starting kit (horn + stomp) alone.
- **Finale:** once all 7 colors are released, the **final boss** comes through the portal
  to investigate, triggering the end fight.
- **Win:** destroy all 7 pipes, then beat the final boss. No survival timer yet — revisit
  if runs feel too long or too short.
- **Pipe areas:** fully open — minibosses live at their pipes and can be fought or fled.
  The around-player swarm continues during the fight (no sealed arena).

### Run loop

1. **Start:** center spawn, greyscale world, horn + stomp owned, shop starting stats/HP/speed
   applied.
2. **Play:** move only. Enemies spawn around the player. Crystals and scrap magnet in.
3. **Level-up:** pause, pick 1 card, resume.
4. **Pipe:** walk to a miniboss, kill it. Pause overlay (same family as level-up cards):
   color unlocked, power name, what it does. Then that power auto-fires.
5. **Death:** if a revive remains, revive **in place** and continue. Otherwise the run ends.
6. **Win or death overlay**, then the **scrap shop**, then the next run.

If a level-up and a pipe-unlock would both pause at the same time, do not overlap the
overlays — queue them (order TBD).

### Color release

When a miniboss is defeated, its color returns to the world as a **wave radiating outward
from the pipe**, recoloring the world as it passes.

> Fallback (if the wave costs too many bytes): the color returns instantly everywhere with a
> brief celebratory flash.

The pause overlay still fires in either case.

### Player

- **Health:** standard health pool. CON (in-run and shop) increases max HP. Shop Start HP
  adds extra max HP at run start (amounts TBD).
- **No mana.** Abilities do not spend a resource; they auto-fire on independent cooldowns.
- **Starting kit** (owned at run start, always auto-firing):
  - **Horn** — melee damage in the direction the player is facing / last moved.
  - **Stomp** — self-centered area attack with a small knock-back to enemies.
- **Hitboxes:** 11×11 aligned to the **bottom** of the 11×19 player sprite (horn/head
  sticks out above). Same box for every facing; sprite facing art is TBD.
- Movement collision uses that hitbox only.

### Auto-combat

- Every owned ability fires on **its own cooldown**. Several can fire at once.
- **No ability keys.** The player never triggers attacks manually.
- Targeting:
  - Horn → facing / last-move direction (idle default facing TBD).
  - Fireball, frostball → **nearest enemy**.
  - Stomp, flame nova, frost nova, heal, shield → **self-centered**.
- **Heal** (green): auto-fires a small HP pulse; show a small green `+` when it ticks.
- **Shield** (violet): auto-fires a brief absorb; show a visible ring or half-circle
  around the player while active.
- **Yellow speed** is not a fireable ability (see Powers).
- Cooldown, damage, knock-back, heal amount, and shield duration/absorb: **TBD**.

### Powers (one per released color)

Destroying a pipe **grants that power immediately** (it does not go through the level-up
draft). Color damage powers scale with **WIS**. Heal, shield, and speed ignore STR/WIS.

| Color  | Hex      | Power                                    |
|--------|----------|------------------------------------------|
| Red    | `e40404` | Fireball — ranged damage (nearest enemy)  |
| Orange | `ff8200` | Flame nova — self-centered area damage    |
| Yellow | `f1e300` | Speed — passive move-speed increase       |
| Green  | `08ba00` | Heal — cooldown HP pulse                  |
| Blue   | `0030e2` | Frost nova — self-centered area freeze    |
| Indigo | `6e00ef` | Frostball — nearest-enemy freeze          |
| Violet | `a656ff` | Damage shield — absorbs incoming damage while active |

**Yellow speed:** not fireable. Unlocking yellow **immediately** raises move speed. Speed
then joins the level-up pool and can stack like other owned powers. Shop Start Speed
stacks with this.

Frost nova / frostball still freeze.

### Stats

In-run level-up picks and shop starting ranks **stack**.

| Stat | Effect |
|------|--------|
| STR | Increases starting-kit damage only (horn, stomp) |
| DEX | Decreases damage taken |
| CON | Increases player max HP |
| WIS | Increases color damage powers (fireball, frostball, flame nova, frost nova) |

Heal, shield, and speed ignore STR/WIS. Exact per-pick amounts: **TBD**.

### XP and level-up

- Kills may drop **crystals** (in-run XP). Crystals have an inherent drop chance (TBD);
  not every kill necessarily drops one.
- Crystals **magnet** toward the player from a generous radius (classic survivors-like).
  Magnet range is upgradeable in the scrap shop.
- Filling the XP bar **pauses** the game. Pick **1** card from a base of **3**, then resume.
  Luck can add a 4th and 5th card (see Scrap shop) — extras are chanced, not guaranteed.
- **Draft pool:** STR / DEX / CON / WIS + every owned attack/power (horn, stomp, and any
  color power already granted, including yellow speed). Repeat picks **stack**
  (survivors-style levels). Exact per-stack effects TBD.
- Duplicate cards in a single hand: TBD.

### Scrap (must-have)

Meta currency for between-run upgrades. Cut only if bytes force it; shop **rows** are
the first thing to drop, not the whole system.

- Drops in-run like crystals and is **magneted** the same way. Regular enemies drop a
  small amount; minibosses and the final boss drop a chunk. Amounts and inherent chances
  TBD.
- Scrap magneted during the run is **kept on death or win**. Uncollected scrap on the
  ground is lost.
- Spent in a **between-run shop** (after the death or victory overlay), then the next
  run starts.
- Persist scrap + purchased ranks in **localStorage**. World progress, powers, XP, and
  in-run stats are **not** saved.

#### Scrap shop

Each row can be bought **3 ranks**. Prices TBD. Not in the shop: starting horn/stomp
levels, global cooldown/damage.

| Row | 3 ranks |
|-----|---------|
| Luck | Extra draft cards are chanced. Start 0%. Ranks: **25/50/75%** for a 4th card; **20/40/60%** for a 5th, rolled **only if** the 4th was granted. |
| STR, DEX, CON, WIS | Four separate starting-stat rows. Amounts per rank TBD. |
| Start HP | Extra max HP at run start (beyond CON). Amounts TBD. |
| Start Speed | Extra move speed at run start (beyond yellow). Amounts TBD. |
| Magnet | Pull radius **+25%** per rank. |
| XP gain | Relative crystal drop-chance **+33/66/100%** vs each enemy's inherent chance. |
| Scrap gain | Relative scrap drop-chance **+33/66/100%** vs each enemy's inherent chance. |
| Revive | **1/2/3** extra lives per run. Revive **in place**. HP restored and i-frames TBD. |

### Enemies

- **Swarm:** regular enemies **constantly spawn around the player** (off-screen), wherever
  the player is on the map. The map is never empty.
- **Default scaling:** swarm pressure ramps with **pipes destroyed** (spawn rate, HP,
  types — knobs TBD).
- **Stretch difficulty modes:** Easy = no swarm scaling; Normal = pipes (default);
  Hard = time in the run **and** pipes.
- **Minibosses (7):** one per pipe. All share the **Business Man** sprite (intentional
  corporate facelessness). The only color on each is the **eyes**, tinted to the rainbow
  color that miniboss guards/steals. Each also has:
  - a basic attack (melee or ranged), and
  - the **power associated with its color** (e.g. the red miniboss shoots fireballs).
- **Final boss:** **Business Boss** sprite — visually almost identical to Business Man on
  purpose; distinct stats/behavior.
- **Regular enemies:** office-supply creatures from the sheet (binder clip, pencil, pen,
  stapler, paperclip, calculator, USB stick, scissors). Hitboxes are **smaller than the
  crop cell**, following opaque content (e.g. skinny pencil/pen, short stapler) rather than
  the full 7×9 pad.

### Controls

- **WASD + arrow keys:** movement only.
- No ability keys. No settings key-remap UI.

### Persistence

- **localStorage** holds scrap + scrap-shop ranks only (plus any future non-gameplay
  settings if they exist).
- A run does **not** save position, released colors, destroyed pipes, XP, or loadout.

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
   the current palette state. Optional flips, 90° CCW rotation (`rot90`), and an
   rgb swap (`recolorFrom` → `recolorTo`) are supported (used for pipe orientations
   and the per-pipe stripe color; not used for the player yet — facing art TBD).
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

- **Player (current):** single static frame — no walk cycle, no facing flips.
- **Future:** when multi-frame art lands, prefer frame 0 = idle and frames 1–2 = walk
  alternating, baked per direction (or derived by flip if the art supports it).

### Resolution & display

- **The canvas fills the entire browser viewport** — no letterboxing or border.
- The internal resolution is dynamic: an integer pixel scale is chosen as
  `round(innerHeight / TARGET_VIEW_HEIGHT)` (currently **250**), then the canvas is sized to
  cover the window at that scale with `image-rendering: pixelated`. Pixels stay crisp at any
  window size; the visible world area varies slightly with window shape.
- Target visibility is **±125px** from the player (`TARGET_VIEW_HEIGHT / 2`). Horizontal
  reach depends on window aspect ratio. Sprites and tiles are drawn **1:1** in world
  pixels; only the whole canvas is integer-upscaled to the window.
- *Tunable:* `TARGET_VIEW_HEIGHT` is the single camera zoom knob.

### World / tilemap

- **Tile size: 11px** — matches the player's hitbox, so a one-tile gap is walkable.
  - 11×11 solid (large bush), fills the cell
  - 6×6 solid (small bush), centered in the cell
  - Water and map-edge walls fill the full 11×11 cell
- **World: 100×100 tiles (1100×1100px)** to start. Tunable; the authoring approach is not
  sensitive to dimensions.
- **Pipes (procedural):** 7 portals follow a 10×10 edge map (cells `(0,0)`,
  `(5,0)`, `(9,1)`, `(0,5)`, `(9,6)`, `(1,9)`, `(6,9)`), inset ~75px (±15) from
  that edge. Default portal faces east (horizontal straight through the seam);
  west-side portals are flipH. Each pipe snakes to a cap **80px** from the player
  along its own spoke, keeping a player-width (**11px**) gap from other pipes.
  Built from straight + curve + cap only. Caps seal inward ends; portal origin
  has no cap. Each run is assigned one rainbow color; the authored `b1b1b1`
  center stripe (dot on caps) is remapped to that color at bake and **stays
  colored** even while the world is greyscale (exempt from desaturation). Dark accents stay continuous by flipping straights (and caps)
  when an elbow's port has the highlight on the opposite side — H uses flipV
  (accent top), V uses flipV+rot90 (accent left). Outer + inner elbows cover all
  four corners at both accent modes.
- **Authoring: hybrid** — pipes are seeded procedural for now; map landmarks / biome
  regions / major walls remain hand-placed later, with seeded decoration/fill.
  (Landmarks are world dressing, not player respawn points — a run ends on death.)
  - *Fallback:* fully procedural world from a seed if the hybrid approach has issues.

### Game state

- Flat entity array + plain module-level state, following the sample game's structure.
- Save/load via a single small JSON blob in localStorage (scrap + shop ranks only;
  see §2 Persistence).

---

## 4. Sprites

### Sheet: `public/sprites.png` (220×50)

All game art is drawn **1:1** (no pixel doubling). No walk/facing animation frames yet.

#### Characters (11×19), top-left

| Sprite | Origin | Size | Notes |
|--------|--------|------|-------|
| Unicorn (player) | (0,0) | 11×19 | Facing art TBD; no flips for now. Hitbox 11×11 bottom-aligned. |
| Portal | (0,19) | 12×23 | Two 6×23 halves. Default (east): left slab in front of the pipe, right slab behind. flipH for west. Pipe bottom is 1px above the portal base. |
| Business Man (miniboss) | (11,0) | 11×19 | Shared by all 7 minibosses; eyes recolored per guarded color. |
| Business Boss (finale) | (22,0) | 11×19 | Near-identical to Business Man on purpose. |

#### Common enemies (7×9 cells), from (33,0) left → right

| # | Name | Origin |
|---|------|--------|
| 0 | Binder clip | (33,0) |
| 1 | Pencil | (40,0) |
| 2 | Pen | (47,0) |
| 3 | Stapler | (54,0) |
| 4 | Paperclip | (61,0) |
| 5 | Calculator | (68,0) |
| 6 | USB stick | (75,0) |
| 7 | Scissors | (82,0) |

Hitboxes: **content-sized** (not the full padded cell).

#### Pipes + flowers (lower strip from y=9)

Pipes start at (33,9), packed with no gaps; then a **2px gap**; then flowers.

| Sprite | Origin | Size | Hitbox |
|--------|--------|------|--------|
| Pipe cap | (33,9) | 5×8 | Opaque metal; `b1b1b1` center dot; long black border against the pipe |
| Pipe straight | (38,9) | 9×6 | Opaque metal; `b1b1b1` center stripe |
| Pipe curve (outer accent) | (47,9) | 9×9 | SE ports; outer accent; `b1b1b1` center stripe |
| Pipe curve (inner accent) | (56,9) | 9×9 | SE ports; inner accent; `b1b1b1` center stripe |
| Flower 0–3 | (68,9), (75,9), (82,9), (89,9) | 7×10 cells | Decsheets; non-solid (or TBD) |

`createSprite` supports flipH/flipV, `rot90` (CCW), and an optional rgb swap used to
recolor the pipe stripe. Vertical straights use `rot90=1` so the dark accent lands
on the right. No diagonal pipe piece.

#### Font

A bitmap font row exists near the bottom of the sheet — **ignore for now**; may be replaced.
Do not wire gameplay UI to it yet.

#### Not on the sheet yet

Placeholder grass / bush / water / wall tiles remain **code-painted**.

Dev-only / not shipped: `reference/sprites-grey.png`, `public/sprites-unicorn.png`,
`public/sprites-squared.png` (superseded experiments).

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
| Yellow  | `f1e300` | `787878`    | Near-aliases `f1e400`/`f1e500`/`f1e600` mapped in code. |
| Green   | `08ba00` | `5d5d5d`    | |
| Blue    | `0030e2` | `717171`    | |
| Indigo  | `6e00ef` | `777777`    | |
| Violet  | `a656ff` | `aaaaaa`    | |
| Neutral | `000000` | unchanged   | Outlines. |
| Neutral | `747474` | unchanged   | Mid-grey shading. |
| Neutral | `b1b1b1` | unchanged | Pipe stripe placeholder; remapped per-pipe and exempt from desaturation. |
| Neutral | `cecece` | unchanged   | Light grey. |
| Neutral | `ffffff` | unchanged   | White (current unicorn body). |

### Asset rules

- `sprites-grey.png` is a **dev-only desaturation reference**; never ship it.
- Do not ship superseded player sheets (`sprites-unicorn.png`, `sprites-squared.png`) in the
  final package — keep at most one active `sprites.png`.
- New sprites (minibosses, enemies, tiles, final boss, portal) should be added to
  `sprites.png` using only the 11 palette colors (plus near-quantized variants mapped in
  `palette.ts`), so the bake system colors them for free.
- Placeholder world tiles may stay code-painted until real tile art lands on the sheet.

---

## 5. Open Questions / TBD

- Player facing / walk animation behavior (art + code). Horn idle default facing when
  the player has not moved yet.
- XP curve (crystals per level) and inherent crystal/scrap drop chances per enemy type.
- Auto-combat numbers: cooldowns, damage, stomp knock-back, heal amount, shield
  duration/absorb, yellow speed per stack.
- Per-pick stat amounts (STR/DEX/CON/WIS) and whether CON heals current HP when max
  HP grows.
- Draft: can the same hand contain duplicate cards? Overlay queue order if level-up
  and pipe-unlock coincide.
- Revive: HP restored and i-frames (likely needed so a swarm does not instantly re-kill).
- Scrap shop prices; Start HP / Start Speed / starting-stat amounts per rank.
- World size / pipe distances (keep current layout; tune if a run is too long to walk).
- Survival timer: none for now; add later if runs feel too long or too short.
- Easy / Normal / Hard swarm scaling as a stretch (Easy = none; Normal = pipes; Hard =
  time + pipes).
- Regular enemy behaviors (HP, damage, movement patterns per office-supply type).
- Exact per-enemy content hitbox rectangles (measure when wiring combat).
- Pipe metal-pixel collision: per-pixel mask vs. tight AABB of opaque pixels (byte cost).
- Flower collision: decorative only vs. soft blockers.
- Font choice and glyph metrics (current sheet font deferred).
- Audio design (deferred).
- Real tile art on the sheet vs. keeping code-painted placeholders.
