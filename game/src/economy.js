// The economy: money earned each round and spent in the buy menu. The numbers are
// Counter-Strike-shaped on purpose — a pistol round first, a rifle after two wins —
// but the prices and rewards are this game's own.
import { WEAPONS, GRENADE_PRICES, ARMOR_PRICE } from './weapons.js';

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500;
export const PLANT_REWARD = 300;

export function createEconomy() {
  let money = START_MONEY;
  let lossStreak = 0;

  function buyList(owned) {
    const items = [];
    for (const def of Object.values(WEAPONS)) {
      if (def.price === 0) continue;
      items.push({ id: def.id, kind: 'weapon', name: def.name, detail: `${def.damage} dmg · ${def.mag} rounds`, price: def.price, owned: !!owned[def.id] });
    }
    items.push({ id: 'frag', kind: 'grenade', name: 'Frag grenade', detail: 'Blast damage in a 6 m radius', price: GRENADE_PRICES.frag });
    items.push({ id: 'smoke', kind: 'grenade', name: 'Smoke grenade', detail: 'Blocks sight for 15 s', price: GRENADE_PRICES.smoke });
    items.push({ id: 'armor', kind: 'armor', name: 'Kevlar vest', detail: 'Halves damage until it breaks', price: ARMOR_PRICE });
    return items;
  }

  return {
    get money() {
      return money;
    },
    set money(value) {
      money = Math.max(0, Math.floor(value));
    },
    buyList,
    canAfford(price) {
      return money >= price;
    },
    spend(price) {
      if (money < price) return false;
      money -= price;
      return true;
    },
    roundEnd(won) {
      if (won) {
        money += WIN_REWARD;
        lossStreak = 0;
      } else {
        money += LOSS_REWARD + Math.min(2, lossStreak) * LOSS_STREAK_BONUS;
        lossStreak += 1;
      }
    },
    kill() {
      money += KILL_REWARD;
    },
    plant() {
      money += PLANT_REWARD;
    },
    reset() {
      money = START_MONEY;
      lossStreak = 0;
    },
  };
}
