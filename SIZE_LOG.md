# Size log — Track 1 bulk golf (2026-08-20)

Limit: **13,312 B**. No UI / gameplay / visual changes. Reverted any cluster that grew the zip.

| Stage | advzip | Delta |
|------:|-------:|------:|
| Baseline (`main`) | 12596 | — |
| Cluster A: dead unique (`pixelScale`, unused glyphs `J.?\'-`, unused `generatePipes` boot/seed, `colorWave.maxR`, sprite consts, `lang`) | 12504 | **-92** |
| Cluster D packed (pickups helper, shop tuples, cam object, openEnd, map `#fff`) | 12530 | +26 — **reverted** |
| Spawn packing (`makeEnemy`) + map grey hex strings + save `??` | 12487 | **-17** |
| Pickup `add()` helper | 12522 | +35 — **reverted** |
| `openEnd`, `totalStat` cap, drop charset | 12467 | **-20** |
| Drop `toUpperCase`; unify nova heal/boost caster | 12465 | **-2** |
| Boss death near-miss; share STR/WIS rank mul | 12455 | **-10** |
| Merge `hornPwr`/`novaPwr` → `pwr(id)` | 12439 | **-16** |

**Final: 12,439 B (93.44% of 13 KB). Saved 157 B. Headroom 873 B.**

Not done (need live sign-off or Track 2): pipe dir tables, player snap, cutscene wrap, damage numbers, shop row cuts, instant wave.
