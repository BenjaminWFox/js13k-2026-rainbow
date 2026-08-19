import { unlockedColors } from './palette';

export const STAT_STR = 0;
export const STAT_DEX = 1;
export const STAT_CON = 2;
export const STAT_WIS = 3;

export const KIND_STAT = 0;
export const KIND_POWER = 1;

export const POWER_HORN = 0;
export const POWER_STOMP = 1;
export const POWER_FIREBALL = 2;
export const POWER_FLAME_NOVA = 3;
export const POWER_SPEED = 4;
export const POWER_HEAL = 5;
export const POWER_FROST_NOVA = 6;
export const POWER_FROSTBALL = 7;
export const POWER_SHIELD = 8;

/** Color index (red→violet) → the power that color grants. */
export const COLOR_POWERS = [
  POWER_FIREBALL,
  POWER_FLAME_NOVA,
  POWER_SPEED,
  POWER_HEAL,
  POWER_FROST_NOVA,
  POWER_FROSTBALL,
  POWER_SHIELD,
];

export const STAT_CAP = 5;

// Per-rank amounts are TBD; placeholders until the tuning phase.
export const STR_PER_RANK = 0.2;
export const CON_HP_PER_RANK = 20;
export const WIS_PER_RANK = 0.2;
export const POWER_DMG_PER_EVEN = 0.25;
export const POWER_CD_PER_ODD = 0.15;
/** Yellow speed: every rank raises move speed (no cooldown). */
export const SPEED_PER_RANK = 0.15;

const STAT_TITLE = ['STR', 'DEX', 'CON', 'WIS'];
const STAT_BODY = ['KIT DMG', 'LESS HITS', 'MAX HP', 'COLOR DMG'];
export const POWER_TITLE = [
  'HORN',
  'STOMP',
  'FIREBALL',
  'FLAME NOVA',
  'SPEED',
  'HEAL',
  'FROST NOVA',
  'FROSTBALL',
  'SHIELD',
];
export const COLOR_NAMES = ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE', 'INDIGO', 'VIOLET'];
export const POWER_UNLOCK_BODY = [
  'RANGED DAMAGE',
  'AREA DAMAGE',
  'MOVE SPEED',
  'HEAL PULSE',
  'AREA FREEZE',
  'RANGED FREEZE',
  'DAMAGE SHIELD',
];

const LUCK_FOURTH = [0, 0.25, 0.5, 0.75];
const LUCK_FIFTH = [0, 0.2, 0.4, 0.6];

/** In-run ranks. Shop ranks stack on top and are filled in the meta phase. */
export const inRunStats = [0, 0, 0, 0];
export const shopStats = [0, 0, 0, 0];
/** Shop luck 0–3. Extra draft cards are chanced, not guaranteed. */
export const shopLuck = 0;

/** Rank 0 = not owned. Horn and stomp start at 1. */
export const powerRanks = [1, 1, 0, 0, 0, 0, 0, 0, 0];

export interface DraftCard {
  kind: number;
  id: number;
  title: string;
  body: string;
}

export function totalStat(id: number): number {
  return Math.min(STAT_CAP, inRunStats[id] + shopStats[id]);
}

/** Even-rank damage/amount bonus (heal absorb, shield, color+kit dmg). */
export function powerAmount(base: number, powerId: number): number {
  return base * (1 + POWER_DMG_PER_EVEN * (powerRanks[powerId] >> 1));
}

export function kitDamage(base: number, powerId: number): number {
  return powerAmount(base, powerId) * (1 + STR_PER_RANK * totalStat(STAT_STR));
}

/** Fireball and flame nova — WIS + even-rank stacks. Frost is freeze-only. */
export function colorDamage(base: number, powerId: number): number {
  return powerAmount(base, powerId) * (1 + WIS_PER_RANK * totalStat(STAT_WIS));
}

export function powerCooldown(base: number, powerId: number): number {
  const cdRanks = (powerRanks[powerId] - 1) >> 1;
  return base * (1 - POWER_CD_PER_ODD * cdRanks);
}

/** Rank 0 = 1×; each owned yellow rank adds SPEED_PER_RANK. */
export function speedMul(): number {
  return 1 + SPEED_PER_RANK * powerRanks[POWER_SPEED];
}

export function grantPower(id: number): void {
  if (powerRanks[id] < 1) {
    powerRanks[id] = 1;
  }
}

export function applyPick(card: DraftCard): void {
  if (card.kind === KIND_STAT) {
    if (totalStat(card.id) < STAT_CAP) {
      inRunStats[card.id]++;
    }
    return;
  }
  powerRanks[card.id]++;
}

export function resetRunStats(): void {
  inRunStats.fill(0);
  powerRanks.fill(0);
  powerRanks[POWER_HORN] = 1;
  powerRanks[POWER_STOMP] = 1;
}

function powerBody(id: number, nextRank: number): string {
  if (id === POWER_SPEED) {
    return 'SPEED UP';
  }
  if (id === POWER_HEAL) {
    return nextRank & 1 ? 'FASTER' : 'HEAL UP';
  }
  if (id === POWER_SHIELD) {
    return nextRank & 1 ? 'FASTER' : 'ABSORB UP';
  }
  if (id === POWER_FROST_NOVA || id === POWER_FROSTBALL) {
    return nextRank & 1 ? 'FASTER' : 'FREEZE UP';
  }
  return nextRank & 1 ? 'FASTER' : 'DMG UP';
}

function pushCard(out: DraftCard[], kind: number, id: number): void {
  const name = kind === KIND_STAT ? STAT_TITLE[id] : POWER_TITLE[id];
  const rank = kind === KIND_STAT ? totalStat(id) : powerRanks[id] - 1;
  out.push({
    kind,
    id,
    title: name + ' +' + rank,
    body: kind === KIND_STAT ? STAT_BODY[id] : powerBody(id, powerRanks[id] + 1),
  });
}

/** Deal 3 cards (luck may add a 4th/5th) from uncapped stats + owned powers. */
export function dealLevelUpCards(): DraftCard[] {
  const pool: DraftCard[] = [];
  for (let i = 0; i < 4; i++) {
    if (i === STAT_WIS && !unlockedColors.includes(true)) {
      continue;
    }
    if (totalStat(i) < STAT_CAP) {
      pushCard(pool, KIND_STAT, i);
    }
  }
  for (let i = 0; i < powerRanks.length; i++) {
    if (powerRanks[i] > 0) {
      pushCard(pool, KIND_POWER, i);
    }
  }

  let count = 3;
  const luck = Math.min(3, shopLuck);
  if (Math.random() < LUCK_FOURTH[luck]) {
    count++;
    if (Math.random() < LUCK_FIFTH[luck]) {
      count++;
    }
  }

  const hand: DraftCard[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = (Math.random() * pool.length) | 0;
    hand.push(pool.splice(idx, 1)[0]);
  }
  return hand;
}
