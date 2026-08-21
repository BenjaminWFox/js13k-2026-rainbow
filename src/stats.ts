export const STAT_STR = 0;
export const STAT_DEX = 1;
export const STAT_CON = 2;
export const STAT_WIS = 3;

export const STAT_CAP = 5;
export const SHOP_RANK_CAP = 3;

export const SHOP_LUCK = 0;
export const SHOP_STR = 1;
export const SHOP_DEX = 2;
export const SHOP_CON = 3;
export const SHOP_WIS = 4;
export const SHOP_START_HP = 5;
export const SHOP_START_SPD = 6;
export const SHOP_MAGNET = 7;
export const SHOP_XP = 8;
export const SHOP_SCRAP = 9;
export const SHOP_REVIVE = 10;
export const SHOP_ROWS = 11;

// Per-rank amounts are TBD; placeholders until the tuning phase.
export const STR_PER_RANK = 0.2;
export const CON_HP_PER_RANK = 20;
export const WIS_PER_RANK = 0.2;
/** Yellow nova burst: added to move speed while the boost timer is up. */
export const SPEED_PER_RANK = 0.15;
export const START_HP_PER_RANK = 15;
export const START_SPD_PER_RANK = 0.1;

const STAT_TITLE = ['STR', 'DEX', 'CON', 'WIS'];
const STAT_BODY = ['HORN DMG', 'LESS HITS', 'MAX HP', 'NOVA PWR'];
export const COLOR_NAMES = ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE', 'INDIGO', 'VIOLET'];
export const POWER_TITLE = ['FIREBALL', 'FLAME', 'SPEED', 'HEAL', 'FROST', 'FROSTBALL', 'WARD'];
export const POWER_UNLOCK_BODY = [
  'RANGED DAMAGE',
  'AREA DAMAGE',
  'SPEED BURST',
  'HEAL PULSE',
  'AREA FREEZE',
  'RANGED FREEZE',
  'EATS SHOTS',
];

const LUCK_FOURTH = [0, 0.25, 0.5, 0.75];
const LUCK_FIFTH = [0, 0.2, 0.4, 0.6];

/** In-run ranks. Shop ranks stack on top (max 3) toward the 5-rank stat cap. */
export const inRunStats = [0, 0, 0, 0];
/** Luck, STR, DEX, CON, WIS, Start HP, Start Speed, Magnet, XP, Scrap, Revive. */
export const shopRanks = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const SHOP_NAME = [
  'LUCK',
  'STR',
  'DEX',
  'CON',
  'WIS',
  'START HP',
  'START SPD',
  'MAGNET',
  'XP GAIN',
  'SCRAP GAIN',
  'REVIVE',
];
/** Base cost; actual price is this times next rank. Placeholders until tuning. */
const SHOP_COST = [12, 10, 10, 10, 10, 12, 12, 10, 15, 15, 25];

export interface DraftCard {
  id: number;
  title: string;
  body: string;
}

export function totalStat(id: number): number {
  return Math.min(STAT_CAP, inRunStats[id] + shopRanks[SHOP_STR + id]);
}

export function shopPrice(row: number): number {
  return SHOP_COST[row] * (shopRanks[row] + 1);
}

export function shopLine(row: number): string {
  const rank = shopRanks[row];
  if (rank >= SHOP_RANK_CAP) {
    return SHOP_NAME[row] + '  MAX';
  }
  return SHOP_NAME[row] + '  ' + rank + '/3  ' + shopPrice(row);
}

export function hornPwr(): number {
  return 1 + STR_PER_RANK * totalStat(STAT_STR);
}

/** WIS scales nova damage, heal, freeze, and the yellow speed burst. */
export function novaPwr(): number {
  return 1 + WIS_PER_RANK * totalStat(STAT_WIS);
}

/** Shop Start Speed is always-on; yellow nova burst stacks while `boost` > 0. */
export function speedMul(boost = 0): number {
  return (
    1 +
    START_SPD_PER_RANK * shopRanks[SHOP_START_SPD] +
    (boost > 0 ? SPEED_PER_RANK * novaPwr() : 0)
  );
}

export function applyPick(card: DraftCard): void {
  if (totalStat(card.id) < STAT_CAP) {
    inRunStats[card.id]++;
  }
}

export function resetRunStats(): void {
  inRunStats.fill(0);
}

/** Deal 3 cards (luck may add a 4th/5th) from uncapped stats. */
export function dealLevelUpCards(): DraftCard[] {
  const pool: DraftCard[] = [];
  for (let i = 0; i < 4; i++) {
    if (totalStat(i) < STAT_CAP) {
      pool.push({
        id: i,
        title: STAT_TITLE[i] + ' +' + totalStat(i),
        body: STAT_BODY[i],
      });
    }
  }

  let count = 3;
  const luck = Math.min(SHOP_RANK_CAP, shopRanks[SHOP_LUCK]);
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
