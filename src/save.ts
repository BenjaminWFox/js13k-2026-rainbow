import { scrap, setScrap } from './pickups';
import { SHOP_RANK_CAP, SHOP_ROWS, shopRanks } from './stats';

const KEY = 'sr';

/** Load scrap + shop ranks. Missing or corrupt saves are ignored. */
export function loadSave(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return;
    }
    const data = JSON.parse(raw) as { s?: number; r?: number[] };
    setScrap((data.s as number) | 0);
    const ranks = data.r;
    if (Array.isArray(ranks) && ranks.length === SHOP_ROWS) {
      for (let i = 0; i < SHOP_ROWS; i++) {
        shopRanks[i] = Math.max(0, Math.min(SHOP_RANK_CAP, ranks[i] | 0));
      }
    }
  } catch {
    // Private-mode / corrupt JSON — start fresh.
  }
}

export function saveGame(): void {
  localStorage.setItem(KEY, JSON.stringify({ s: scrap, r: shopRanks }));
}
