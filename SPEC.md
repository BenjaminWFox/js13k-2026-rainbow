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
   - World + pipes: ~1.5 KB
   - Swarm / combat / powers: ~1.5–2 KB
   - UI (packed font, HUD, menus, cards, shop): ~1.5 KB
   - Cutscene + dialogue: ~0.8–1.2 KB
   - Audio (ZzFX/ZzFXM, deferred): ~1.5–2 KB
   - This sums close to (or over) the 13 KB cap — expect to spend from the **fallback
     ladder**, cheapest pain first:
     1. Opening cutscene becomes static dialogue panels (no choreographed movement).
     2. Cut surge spawns and the stretch difficulty modes.
     3. Drop scrap-shop rows (never the whole shop).
     4. Straighten the procedural pipes (saves code, not data — a few hundred bytes).
     5. Shrink the audio reservation.
7. **No external dependencies at runtime.** Everything is hand-rolled or vendored (ZzFX/ZzFXM
   already vendored in the sample).
8. **TypeScript strictness stays on.** Types are free — they're erased at build time.
9. **Dev tooling is isolated.** Debug keys/overlays live in `src/debug.ts` and are loaded
   only behind `import.meta.env.DEV`, so they are not part of the production entry.

All timing in this spec is expressed in **real time** (seconds/minutes), never frames.

---

## 2. Game Overview

### Premise

You are a **unicorn** living in a bright world painted with all seven colors of the rainbow.
An evil corporation, led by the **Business Boss**, opens a **portal in the central plaza**
and dispatches seven **Business Men**, who build seven **pipes** (each fed by its own small
portal at the world's edge) and siphon the color away. When a run begins, the world is
entirely **greyscale**. The **Prismatic Shard**, hovering at the world center, sends you to
destroy the pipes.

### Structure

- **Genre:** top-down, pixel sprite-based **survivors-like** (Vampire Survivors-like).
  Movement is the only in-run player control; all owned abilities auto-fire.
- **World:** one single open-world map, freely navigable, rendered with a smooth-scrolling
  camera that follows the player. Seven colored ground **slices** radiate from a central
  **white plaza** (see §3 World).
- **A run:** the player spawns at the **world center** with the starting kit. Colors,
  powers, XP, and in-run stats **reset** each run. Death ends the run after revives are
  spent. Scrap and shop ranks persist between runs (see Scrap).
- **Objective:** find all 7 pipes. Each pipe is guarded by a **miniboss**. Defeating a
  miniboss destroys its pipe, **releases one color**, and **grants that color's power
  immediately**. The power then starts auto-firing.
- **Order:** pipes can be tackled in **any order**. Every miniboss must be beatable with
  the starting kit (horn + stomp) alone.
- **Finale:** once all 7 colors are released, the **final boss** re-opens the plaza portal
  and comes through, triggering the end fight.
- **Win:** destroy all 7 pipes, then beat the final boss. No survival timer — revisit
  if runs feel too long or too short.
- **Pipe areas:** fully open — minibosses live at their pipes and can be fought or fled.
  The around-player swarm continues during the fight (no sealed arena).

### Title screen and flow

- **Title screen:** game title (**"Stolen Rainbows"**, working title) at the top, with a
  **Start** button and an **Upgrades** button (opens the scrap shop). Settings / audio
  toggles are TBD.
- **Start** plays the opening cutscene (below), then the run begins.
- **Full loop:** title → Start → cutscene → run → win/death overlay → scrap shop → next
  run (cutscene again) … Pause menu's "Quit to Menu" returns to the title (treated as a
  death: magneted scrap is kept).

### Opening cutscene

Plays on **every** Start press. **Skippable with any key** (skip jumps straight to the
greyscale run-start state).

1. Opens on the map: the **Prismatic Shard** hovers at world center, the unicorn just below.
   The world is fully colored.
2. The final boss opens a **portal on the right side of the plaza** and emerges.
   Dialogue panel: *"Ahh we finally made it! These colors are going to make me RICH!!"*
3. Next panel: *"Alright business men, get to work!"*
4. The seven **minibosses emerge** from the portal and walk off-screen toward their
   respective color slices. The boss exits back through the portal, which fades out.
5. As they leave, the **pipes appear one after another** (colorless; world still colored).
6. The pipes then **activate one after another**, each draining its color from the world.
7. Shard panel: *"Oh no! Unicorn, it's up to you to find where those pipes go, and destroy
   them!"*
8. The run starts.

### Run loop

1. **Start:** center spawn, greyscale world, horn + stomp owned, shop starting
   stats/HP/speed applied.
2. **Play:** move only. Enemies spawn around the player. Crystals and scrap magnet in.
3. **Level-up:** pause, pick 1 card, resume.
4. **Pipe:** walk to a miniboss, kill it → miniboss death sequence (see Enemies), ending
   in the pipe-unlock overlay. Then that power auto-fires.
5. **Death:** if a revive remains, revive **in place** and continue. Otherwise the run ends.
6. **Win or death overlay**, then the **scrap shop**, then the next run.

**Overlay queue:** if the XP bar fills during a miniboss death sequence, the level-up card
shows **after** the pipe-unlock overlay, before resuming. Overlays never overlap.

**Pause semantics:** any pause (level-up, pipe overlay, pause menu) freezes **everything** —
spawns, cooldowns, projectiles, the color wave, and magnet motion.

### Color release

When a miniboss is defeated, its color returns to the world as a **wave radiating outward
from the pipe**, recoloring the world as it passes.

> Fallback (if the wave costs too many bytes): the color returns instantly everywhere with a
> brief celebratory flash.

The pipe-unlock overlay still fires in either case (see the miniboss death sequence).

### Player

- **Health:** baseline **100 HP**. CON (in-run and shop) increases max HP. Shop Start HP
  adds extra max HP at run start (amounts TBD).
- **No mana.** Abilities do not spend a resource; they auto-fire on independent cooldowns.
- **Starting kit** (owned at run start, always auto-firing):
  - **Horn** — melee damage in the facing direction. Facing = **last-move direction**
    (diagonals included); initial facing before any movement is **right**.
  - **Stomp** — self-centered area attack with a small knock-back to enemies.
- **Hitboxes:** 11×11 aligned to the **bottom** of the 11×19 player sprite (horn/head
  sticks out above). Same box for every facing; sprite facing art is TBD.
- Movement collision uses that hitbox only.
- The player **can be frozen** (by blue/indigo miniboss powers) and, like all frozen
  entities, takes **+25% damage** while frozen.

### Auto-combat

- Every owned ability fires on **its own cooldown**. Several can fire at once.
- **No ability keys.** The player never triggers attacks manually.
- Targeting:
  - Horn → facing (last-move direction; initial = right).
  - Fireball, frostball → **nearest enemy**.
  - Stomp, flame nova, frost nova, heal, shield → **self-centered**.
- **Projectiles** (player *and* boss): fly in a **straight line** toward the target's
  position **at the time of firing** — no tracking. They impact the **first enemy hit**,
  even if it wasn't the original target. They pass **over pipes**, are **blocked by
  walls**, and **despawn off-screen** on a miss.
- **Freeze:**
  - **Frost nova** — freeze only (no damage); fires every **5s**; freezes regular
    enemies in its area for **0.5s**.
  - **Frostball** — freeze only (no damage); fires every **3s**; freezes regular
    enemies within a radius of **2× sprite size from the impact point** for **0.5s**.
  - Frozen entities (enemies *and* player) take **+25% damage**.
  - Minibosses and the final boss **cannot be frozen** — they are **slowed** instead, for
    **2× the freeze duration**.
- **Heal** (green): auto-fires a small HP pulse; show a small green `+` when it ticks.
- **Shield** (violet): auto-fires an absorb that **stays until used up**; show a
  visible ring around the player sprite while active.
- **Yellow speed** is not a fireable ability (see Powers).
- Remaining numbers TBD: horn/stomp/fireball/flame-nova cooldowns and damage, stomp
  knock-back, heal amount, shield absorb.

### Powers (one per released color)

Destroying a pipe **grants that power immediately** (it does not go through the level-up
draft). Color damage powers (fireball, flame nova) scale with **WIS**. Heal, shield,
speed, frost nova, and frostball ignore STR/WIS.

| Color  | Hex      | Power                                    |
|--------|----------|------------------------------------------|
| Red    | `e40404` | Fireball — ranged damage (nearest enemy)  |
| Orange | `ff8200` | Flame nova — self-centered area damage    |
| Yellow | `f1e300` | Speed — passive move-speed increase       |
| Green  | `08ba00` | Heal — cooldown HP pulse                  |
| Blue   | `0030e2` | Frost nova — self-centered area freeze (5s cooldown, 0.5s freeze) |
| Indigo | `6c00ef` | Frostball — nearest-enemy freeze, small impact radius (3s cooldown, 0.5s freeze) |
| Violet | `a656ff` | Damage shield — absorbs incoming damage while active |

**Yellow speed:** not fireable. Unlocking yellow **immediately** raises move speed. Speed
then joins the level-up pool and can stack like other owned powers. Shop Start Speed
stacks with this.

### Stats

In-run level-up picks and shop starting ranks **stack**, but every stat caps at
**5 total ranks** (shop ranks — max 3 — plus in-run picks combined). A capped stat leaves
the draft pool.

| Stat | Effect |
|------|--------|
| STR | Increases starting-kit damage only (horn, stomp) |
| DEX | Reduces incoming damage by **10% per rank** (multiplied into damage taken; max 50% at cap) |
| CON | Increases player max HP |
| WIS | Increases color damage powers (fireball, flame nova) |

Heal, shield, speed, frost nova, and frostball ignore STR/WIS. Per-rank amounts for STR/CON/WIS: **TBD**.

### XP and level-up

- Kills may drop **crystals** (in-run XP). Crystals have an inherent drop chance (TBD);
  not every kill necessarily drops one.
- Crystals **magnet** toward the player (see Magnet below). Magnet range is upgradeable
  in the scrap shop.
- Filling the XP bar **pauses** the game. Pick **1** card from a base of **3**, then resume.
  Luck can add a 4th and 5th card (see Scrap shop) — extras are chanced, not guaranteed.
- **Draft pool:** STR / DEX / CON / WIS (until capped) + every owned attack/power (horn,
  stomp, and any color power already granted, including yellow speed).
- **Power stack rule:** rank 1 = base power. **Even ranks add damage** (or freeze
  duration for frost nova/frostball); **odd ranks (3, 5, …) reduce cooldown.** Exact
  per-rank amounts TBD. Stat picks simply add a rank.
- Duplicate cards in a single hand: TBD.

### Magnet and pickups

- **Attract radius:** a circle from the player's center, radius **2× player width**
  (22 px). The shop Magnet row grows this **+25% per rank**.
- **Pull speed:** attracted pickups move at **2× player move speed**.
- **Pickup (collection) radius:** the player hitbox itself.
- Crystals and scrap on the ground **never expire** and have **no cap**.

### Scrap (must-have)

Meta currency for between-run upgrades. Cut only if bytes force it; shop **rows** are
the first thing to drop, not the whole system.

- Drops in-run like crystals and is **magneted** the same way. Regular enemies drop a
  small amount; minibosses and the final boss drop a chunk. Amounts and inherent chances
  TBD.
- Scrap magneted during the run is **kept on death, win, or quit-to-menu**. Uncollected
  scrap on the ground is lost.
- Spent in a **between-run shop** (after the death or victory overlay), also reachable
  from the title screen via **Upgrades**.
- Persist scrap + purchased ranks in **localStorage**. World progress, powers, XP, and
  in-run stats are **not** saved.

#### Scrap shop

Each row can be bought **3 ranks**. Prices TBD. Not in the shop: starting horn/stomp
levels, global cooldown/damage.

| Row | 3 ranks |
|-----|---------|
| Luck | Extra draft cards are chanced. Start 0%. Ranks: **25/50/75%** for a 4th card; **20/40/60%** for a 5th, rolled **only if** the 4th was granted. |
| STR, DEX, CON, WIS | Four separate starting-stat rows (count toward the 5-rank stat cap). Amounts per rank TBD (DEX = 10%/rank). |
| Start HP | Extra max HP at run start (beyond CON). Amounts TBD. |
| Start Speed | Extra move speed at run start (beyond yellow). Amounts TBD. |
| Magnet | Attract radius **+25%** per rank. |
| XP gain | Relative crystal drop-chance **+33/66/100%** vs each enemy's inherent chance. |
| Scrap gain | Relative scrap drop-chance **+33/66/100%** vs each enemy's inherent chance. |
| Revive | **1/2/3** extra lives per run. Revive **in place**. HP restored and i-frames TBD. |

### Enemies

#### Swarm behavior

- Regular enemies **constantly spawn just off-screen around the player**, wherever the
  player is on the map. The map is never empty.
- **Baseline spawn rate: ~2 enemies/sec.** Every **3 minutes**, a **surge**: 10× the
  spawn rate for **5 seconds**.
- **Max live cap: 150** enemies.
- Enemies that get too far away **teleport back** to the off-screen spawn ring — unless
  the count is near the cap, in which case they **despawn** in favor of fresh spawns.
- **Spawn validity:** never on pipes, walls, or water (if water returns). Enemies **can
  pass over pipes and water**; walls block them.
- **Visuals:** office supplies **float** — a 1px vertical bob, with a small code-drawn
  pixel-circle **shadow** beneath (2 frames: larger shadow on the "down" bob frame,
  smaller on "up").
- **Separation:** enemies may overlap each other **up to 50%**, never fully (use a coarse
  spatial grid — pairwise checks don't scale to the cap).
- **Contact damage:** touch-based. Damage begins only once the enemy hitbox is **>25%
  inside** the player hitbox, then ticks every **0.5s** while overlapping. **No knockback
  on the player.**

#### Type progression

Easiest to hardest — contact damage is **1 for the paperclip, +1 per step**:

| # | Enemy | Damage |
|---|-------|--------|
| 1 | Paperclip | 1 |
| 2 | Pencil | 2 |
| 3 | Binder clip | 3 |
| 4 | Pen | 4 |
| 5 | USB stick | 5 |
| 6 | Stapler | 6 |
| 7 | Calculator | 7 |
| 8 | Scissors | 8 |

A run starts with **paperclips only**; **each destroyed pipe unlocks the next type**
(7 pipes → all 8 types in play before the finale). HP and movement per type: TBD.

- **Stretch difficulty modes:** Easy = only the type ladder, no rate scaling; Normal =
  default; Hard = spawn pressure also ramps with time in the run.

#### Minibosses (7)

One per pipe. All share the **Business Man** sprite (intentional corporate facelessness).
The only color on each is the **eyes**, tinted to the rainbow color that miniboss
guards/steals.

- **HP: 100** (same as the player's baseline).
- **Attacks:** touch-based like regular enemies, **plus the power associated with its
  color** (e.g. the red miniboss shoots fireballs; blue/indigo can freeze the player).
- **Engagement:** chases the player from within **75 px**; stops pursuing beyond
  **250 px**; **HP resets** if the player moves beyond **500 px**.
- **Speed: 0.04** px/ms (vs player 0.05) — except the **yellow** miniboss at **0.06**.
- Takes **50% of normal knockback** from the player's stomp. Cannot be frozen (slowed
  2× freeze duration instead).

#### Miniboss death sequence

1. Semi-pause: the **player is frozen**.
2. All on-screen regular enemies **die** — they **drop crystals/scrap normally**, and the
   magnet collects during the sequence.
3. The **pipe is destroyed** segment by segment (pixel-explosion effect per segment).
4. The **recolor wave** runs.
5. The **pipe-unlock overlay** shows: color unlocked, power name, what it does (same card
   family as level-up).
6. If the XP bar filled, the **level-up card** shows next. Then play resumes and the new
   power auto-fires.

#### Final boss

**Business Boss** sprite — visually almost identical to Business Man on purpose.

- Re-opens the **plaza portal** (right side of the central white plaza) and emerges once
  all 7 colors are released.
- **HP: 200.**
- Has **all the player's powers** — including heal and shield (revisit and drop those if
  the fight drags) — with speed capped at **0.05** (the player's base).
- **Unleashed:** pursues the player across the whole map; **HP never resets**.
- Cannot be frozen (slowed 2× freeze duration instead).

### HUD

- **Player HP bar:** beneath the player sprite — white inner bar 1px high, outlined on
  all sides by 1px black; top of the outline 1px below the sprite; inner width = % of HP.
- **XP bar:** top-center, **60px** wide, same style but **2px-high** white inner bar.
  Text **"Level #"** to its right, on a **solid black plate** (1px pad around the glyphs).
- **Color indicator:** beneath the XP bar, **7 squares** — 4×4 interior with a 1px black
  outline. Interior is **grey until that color is released**, then filled with its
  rainbow color.
- **Scrap counter:** top-right — the collected amount formatted `##,###` on a **solid
  black plate** (1px pad), followed by the scrap sprite.
- **Pause icon:** **top-left** — two white 1×4 vertical bars, each with a 1px black
  outline, 1px gap between them. Clicking it (or a pause key) opens a menu with
  **Resume** and **Quit to Menu**.

### UI framework

- **Menu input:** gameplay is move-only, but all menus/overlays (cards, shop, pause,
  title, dialogue) accept **mouse click** OR **move keys to navigate + Enter to select**.
- **Dialogue panels** (cutscene): Zelda-like — speaker sprite framed on the left, text to
  the right. Advance with any key/click.
- **Pixel explosion:** one reusable, **tintable** burst-of-pixels effect, instantiated
  for enemy deaths, the player taking a hit, and pipe-segment destruction.
- **Text** uses the bit-packed code font (see §3 Text rendering). No DOM UI — everything
  is canvas.

### Controls

- **WASD + arrow keys:** movement (gameplay); menu navigation (overlays).
- **Enter / mouse click:** menu select. **Any key:** skip cutscene / advance dialogue.
- No ability keys. No settings key-remap UI.

### Persistence

- **localStorage** holds scrap + scrap-shop ranks only (plus any future non-gameplay
  settings if they exist).
- A run does **not** save position, released colors, destroyed pipes, XP, or loadout.
- The cutscene plays every run, so no "seen it" flag is needed.

### Audio

- **Deferred.** ZzFX (SFX) and ZzFXM (music) are vendored and available; audio design decided
  once core gameplay is working.
  - *Idea to explore:* a music track that gains instruments/richness as colors return.
  - SFX:
    - Pipe laying and pipe destruction: zzfx(...[1.64,,150,,.08,.13,4,2.84,.1,.1,10,,.07,1.7,1,.1,.09,.8,.08]); // Hit 66
    - Success (beat a boss): zzfx(...[.6,,334,.07,1,.16,,.9,,,200,.06,.06,,,,,.64,.24,,297]); // Powerup 1077
    - Pickup (crystal/scrap) AND button move/click: zzfx(...[,,507,,.04,.11,1,,,,250,.04,,,,,,.74,.02,,-1380]); // Pickup 1044
    - Stomp & magic/nova attacks: zzfx(...[,,91,.04,.04,.51,5,.1,-2,5,,,,1.9,,.9,,.44,.15]); // Explosion 1071
    - Enemy is hit: zzfx(...[5,,266,.02,.05,.04,,3,-1,,,,,1.2,2.1,,,.88,.07,,1914]); // Hit 1046
    - Horn attack: zzfx(...[,,172,.01,.04,.16,4,.2,8,,,,,1.5,,.1,,.45,.06]); // Hit 1082

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

### Text rendering: bit-packed font

No font lives on the sprite sheet. Text uses a **bit-packed 3×5 pixel font**:

- Glyphs: A–Z, 0–9, and the punctuation the UI needs (`, . ! ? ' - +`). Each glyph is
  3×5 = **15 bits, one packed integer per glyph**, stored in a string/array. Roadroller
  compresses this data extremely well.
- A tiny renderer draws glyphs with per-pixel `fillRect` at any tint color and integer
  scale.
- **Bake once, like everything else:** static labels are rendered once to offscreen
  canvases and drawn with `drawImage`. Dynamic text (scrap counter, level number) re-bakes
  only when the value changes.

### Animation

- **Characters (Unicorn, Business Man, Business Boss):** a 2-frame walk cycle **derived at
  bake time** from the single 11×19 sheet frame — no extra sheet art. The "leg-cut" trick:
  - The sprite's vertical midline is column 5. For each walk frame, take the bottom 2 rows
    (rows 17–18) on one side of the midline — a **4-wide × 2-tall block** (columns 1–4 for
    the left frame, columns 6–9 for the right) — and **cut it off (transparent)**, so that
    leg reads as lifted.
  - Fill the **1×4 row directly above the cut** (row 16, same columns) **solid black** —
    the new bottom outline/foot of the shortened leg.
  - Bake both variants once per character (three canvases total: idle + left-cut +
    right-cut). Alternate the two cut frames while the entity is moving; show the
    unmodified frame when idle. Frame cadence TBD (start ~150ms). Hitboxes unchanged.
  - Exact cut columns/rows should be eyeballed against the art — treat the coordinates
    above as the starting point.
- **Enemies:** 1px float bob + 2-frame code-drawn shadow (see §2 Enemies) — no sheet
  animation frames.
- **Facing flips:** still none — facing art remains TBD.

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

- **Tile size: 11px** — matches the player's hitbox. **World: 100×100 tiles
  (1100×1100px)**; tunable.
- **Layout** (implemented in `src/map.ts`): seven **"pizza slice"** ground regions radiate
  from the center, one per pipe, each assigned by nearest portal angle and painted in a
  shaded variant of that pipe's rainbow color. They meet a **lumpy white plaza hub** at
  world center (`hubRadiusTiles`: ~9-tile radius with a 3- and 5-lobe sine wobble — not a
  clean circle). The map edge is a solid **wall ring**. Tiles 0–6 = slice colors,
  7 = white plaza, 8 = wall. Ground tiles are code-painted with seeded speckles.
- The plaza is plain walkable ground; the final-boss/cutscene **portal opens on its right
  side**. Water and bushes were removed; if water returns, it blocks the player but not
  enemies.
- **Pipes (procedural):** 7 portals follow a 10×10 edge map (cells `(0,0)`,
  `(5,0)`, `(9,1)`, `(0,5)`, `(9,6)`, `(1,9)`, `(6,9)`), inset ~75px (±15) from
  that edge. Default portal faces east (horizontal straight through the seam);
  west-side portals are flipH. Each pipe snakes inward along its own spoke and ends at a
  cap **near the inner edge of its color slice**, just outside the plaza hub, keeping a
  player-width (**11px**) gap from other pipes.
  Built from straight + curve + cap only. Caps seal inward ends; portal origin
  has no cap. Each run is assigned one rainbow color; the authored `b1b1b1`
  center stripe (dot on caps) is remapped to that color at bake and **stays
  colored** even while the world is greyscale (exempt from desaturation). Dark accents stay continuous by flipping straights (and caps)
  when an elbow's port has the highlight on the opposite side — H uses flipV
  (accent top), V uses flipV+rot90 (accent left). Outer + inner elbows cover all
  four corners at both accent modes.
- Pipes block **player movement** only: enemies walk over them, projectiles fly over them.
- **Authoring: hybrid** — pipes and slices are seeded procedural; any future landmarks /
  major walls would be hand-placed with seeded decoration/fill.

### Game state

- Flat entity array + plain module-level state, following the sample game's structure.
- Scene flag for title / cutscene / run / overlay / shop — keep it a simple variable, not
  a framework.
- Save/load via a single small JSON blob in localStorage (scrap + shop ranks only;
  see §2 Persistence).

---

## 4. Sprites

### Sheet: `public/sprites.png` (220×50)

All game art is drawn **1:1** (no pixel doubling). No walk/facing animation frames on the
sheet — character walk frames are derived at bake time (§3 Animation leg-cut).

#### Characters (11×19), top-left

| Sprite | Origin | Size | Notes |
|--------|--------|------|-------|
| Unicorn (player) | (0,0) | 11×19 | Facing art TBD; no flips for now. Hitbox 11×11 bottom-aligned. Walk frames derived at bake (§3 leg-cut). |
| Portal | (0,19) | 12×23 | Two 6×23 halves. Default (east): left slab in front of the pipe, right slab behind. flipH for west. Pipe bottom is 1px above the portal base. Also used for the plaza portal (cutscene/finale). |
| Business Man (miniboss) | (11,0) | 11×19 | Shared by all 7 minibosses; eyes recolored per guarded color. Walk frames derived at bake (§3 leg-cut). |
| Business Boss (finale) | (22,0) | 11×19 | Near-identical to Business Man on purpose. Walk frames derived at bake (§3 leg-cut). |

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

Hitboxes: **content-sized** (not the full padded cell). Sheet order differs from the
difficulty ladder in §2 — map sheet index → difficulty tier in code.

#### Pickups & shard, from (89,0)

| Sprite | Origin | Size | Notes |
|--------|--------|------|-------|
| Crystal | (89,0) | 4×6 | In-run XP pickup |
| Scrap | (93,0) | 6×6 | Meta-currency pickup; also drawn in the HUD counter |
| Prismatic Shard | (99,0) | 7×11 | Cutscene narrator; hovers at world center |

#### Pipes + flowers (lower strip from y=9)

Pipes start at (33,9), packed with no gaps; then a **2px gap**; then flowers.

| Sprite | Origin | Size | Hitbox |
|--------|--------|------|--------|
| Pipe cap | (33,9) | 5×8 | Opaque metal; `b1b1b1` center dot; long black border against the pipe |
| Pipe straight | (38,9) | 9×6 | Opaque metal; `b1b1b1` center stripe |
| Pipe curve (outer accent) | (47,9) | 9×9 | SE ports; outer accent; `b1b1b1` center stripe |
| Pipe curve (inner accent) | (56,9) | 9×9 | SE ports; inner accent; `b1b1b1` center stripe |
| Flower 0–3 | (68,9), (75,9), (82,9), (89,9) | 7×10 cells | Decorative; non-solid (or TBD) |

`createSprite` supports flipH/flipV, `rot90` (CCW), and an optional rgb swap used to
recolor the pipe stripe. Vertical straights use `rot90=1` so the dark accent lands
on the right. No diagonal pipe piece.

#### Not on the sheet — code-drawn primitives

These are deliberately **not** sheet art; draw them with rects/arcs at bake or in the UI
layer:

- Projectiles (fireball, frostball), flame/frost **nova rings**, **shield ring**,
  heal **`+`** tick.
- Enemy **shadows** (2-frame pixel circle) and the tintable **pixel explosion**.
- All HUD elements (bars, color squares, pause icon) and all **text** (bit-packed font,
  §3).
- Ground/wall tiles (seeded speckle painting in `map.ts`).

There is **no font row on the sheet** (removed — superseded by the packed code font).

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
| Indigo  | `6c00ef` | `777777`    | Near-aliases `6e00ef`/`6d00ef`/`6b00ef`/`6f00ef` mapped in code. |
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
- New sprites should be added to `sprites.png` using only the 11 palette colors (plus
  near-quantized variants mapped in `palette.ts`), so the bake system colors them for free.
- World tiles stay code-painted until real tile art lands on the sheet.

---

## 5. Open Questions / TBD

- Player facing **art** (behavior is decided: last-move facing, initial right). Walk
  animation is **implemented** (§3 leg-cut bake, 150ms cadence, spec cut coordinates —
  they match the art exactly); only visual tuning of the cadence remains if desired.
- XP curve (crystals per level) and inherent crystal/scrap drop chances per enemy type.
- Combat numbers: horn/stomp/fireball/flame-nova cooldowns and damage, stomp knock-back,
  heal amount, shield absorb, yellow speed per stack, per-rank power amounts.
- Per-rank stat amounts for STR/CON/WIS (DEX is decided: 10%/rank); whether CON heals
  current HP when max HP grows.
- Whether **power** stacks are capped (stats cap at 5 ranks; powers currently uncapped).
- Duplicate cards in a single hand: allowed or not.
- Revive: HP restored and i-frames (likely needed so the swarm doesn't instantly re-kill);
  whether the revive count appears on the HUD.
- Regular enemy HP and movement speed per type.
- Whether the Prismatic Shard remains visible at the plaza during runs (decoration only).
- Scrap shop prices; Start HP / Start Speed amounts per rank.
- Settings / audio toggles on the title screen.
- Exact per-enemy content hitbox rectangles (measure when wiring combat).
- Pipe metal-pixel collision: per-pixel mask vs. tight AABB of opaque pixels (byte cost).
- Flower collision: decorative only vs. soft blockers.
- Audio design (deferred).
- Real tile art on the sheet vs. keeping code-painted placeholders.

---

## 6. Build Guidance & Execution Order

A suggested phase order for building the remaining game, sequenced to minimize rework
(each phase only depends on the ones before it), with a model recommendation per phase.
"Flagship" = a best-in-class model is strongly recommended (interlocking systems, byte- or
performance-sensitive tradeoffs, or design judgment). "Capable" = well-specified,
self-contained work any competent model can execute from this spec.

Already built (no work needed): bake engine, palette/desaturation, pipes, world slices +
plaza, camera, player movement/collision (§3), swarm core, starting-kit combat, packed
font + HUD, menu/overlay framework (pause, level-up draft, stats), color powers +
projectiles + freeze, minibosses + pipe destruction + color wave.

| Phase | Work | Model | Why | Complete |
|-------|------|-------|-----|----------|
| 1 | **Swarm core:** spawn ring/rate/cap, teleport-back/despawn, chase movement, float bob + shadow, spatial-grid separation, contact damage, player HP + under-player HP bar | Flagship | Performance under a 150-enemy cap and the most interlocking rules in the game; everything else sits on top of it | ✅ |
| 2 | **Starting-kit combat:** horn, stomp + knockback, enemy HP/death, pixel explosion, crystal/scrap drops, magnet + pickup | Capable | Fully specified, self-contained math; makes the game playable end-to-end early | ✅ |
| 3 | **Packed font + HUD:** font renderer + label baking, XP bar, "Level #", scrap counter, color squares, pause icon | Capable | Well-bounded; unblocks every later text UI | ✅ |
| 4 | **Menu/overlay framework:** shared card/menu component, mouse + keyboard input, pause menu, level-up draft + XP curve, stat application | Flagship | One reusable UI system serving five screens under byte pressure — structure decisions here echo everywhere | ✅ |
| 5 | **Powers:** all 7 color powers, projectiles, freeze/slow, WIS scaling, stack rule | Flagship | Seven abilities sharing targeting/cooldown/freeze machinery; minibosses reuse these | ✅ |
| 6 | **Minibosses + pipe destruction:** engagement/leash/reset, color powers vs player, death sequence, segment explosions, **color wave**, unlock overlay | Flagship | The wave's double-bake clip rendering plus the choreographed sequence is the trickiest visual work in the project | ✅ |
| 7 | **Run lifecycle + meta:** death/win overlays, revives, localStorage, scrap shop, title screen | Capable | The shop table and persistence rules are precise; mostly wiring the phase-4 framework | ✅ |
| 8 | **Final boss + finale:** plaza portal, all-powers boss, map-wide pursuit, win state | Capable | Reuses phase-5 powers and phase-6 patterns; numbers are specified | ✅ |
| 9 | **Opening cutscene + dialogue UI:** panel component, scripted choreography, skip | Flagship | Scripted movement + sequenced pipe/color drain under tight bytes; first candidate on the fallback ladder, so cost judgment matters | ✅ |
| 10 | **Tuning + stretch + ship:** balance numbers (the §5 TBDs), surge spawns, difficulty modes, audio, final golfing | Flagship | Playtest judgment and byte-tradeoff calls per Rule 5 | |

Notes:

- Phase 10 is next. Cutscene (`src/cutscene.ts`) plays on every Start:
  colored world, plaza portal fade-in, boss walk-out, two boss panels,
  seven minibosses marching off, pipes appearing colorless (a spare
  grey-stripe pipe kit) then activating one-by-one with instant per-color
  drains (no reverse wave — cheaper), closing shard panel. Any key/click
  advances a panel; during choreography it skips to the greyscale run
  start. Dialogue panel = framed speaker sprite + word-wrapped packed-font
  lines.
- **Size:** 13,628 B zipped — 316 B over the cap (phase 9 cost 985 B, inside
  its §1 budget; the §3 leg-cut walk animation cost 168 B; audio still
  unreserved). Phase 10 must golf and spend from the §1 fallback ladder.
- Shop prices, Start HP / Start Speed amounts, revive HP/i-frames, and
  other combat numbers remain placeholders until the tuning phase.
  Debug: 1–7 toggle palette + powers without killing minibosses; F
  unlocks all colors and starts the finale; C grants scrap; K sets HP
  to 0.
- Audio (phase 10) stays deferred per §2; drop stretch items before shop rows per the
  §1 fallback ladder.
