// The arsenal: one table owns every weapon's numbers, so the player, the bots and
// the buy menu all price and shoot the same guns. Damage falls off past 20 m;
// a head shot always pays headMult times the body damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P250 Sidearm', kind: 'pistol', price: 0,
    damage: 26, headMult: 4, mag: 15, reserve: 60, gap: 0.17, auto: false,
    reload: 1.6, spreadStill: 0.004, spreadMove: 0.03, zoom: 1, range: 60,
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Rifle', kind: 'rifle', price: 2700,
    damage: 36, headMult: 4, mag: 30, reserve: 90, gap: 0.096, auto: true,
    reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, zoom: 1, range: 80,
  },
  smg: {
    id: 'smg', name: 'MP9 SMG', kind: 'smg', price: 1250,
    damage: 22, headMult: 4, mag: 32, reserve: 96, gap: 0.07, auto: true,
    reload: 1.7, spreadStill: 0.004, spreadMove: 0.034, zoom: 1, range: 50,
  },
  sniper: {
    id: 'sniper', name: 'Longshot DMR', kind: 'sniper', price: 4750,
    damage: 88, headMult: 4, mag: 5, reserve: 15, gap: 0.9, auto: false,
    reload: 2.6, spreadStill: 0.0008, spreadMove: 0.05, zoom: 2.2, range: 100,
  },
};

export const GRENADE_PRICES = { frag: 300, smoke: 300 };
export const ARMOR_PRICE = 650;

export function damageAt(def, distance, head) {
  const falloff = 1 - 0.25 * Math.max(0, Math.min(1, (distance - 20) / 40));
  return def.damage * falloff * (head ? def.headMult : 1);
}

// One view model per weapon, built once and shown on switch; a shared muzzle flash
// and light. The model is cosmetic: bots use the same table without a view model.
export function createWeaponSet(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.6, metalness: 0.4 });

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
  }

  const models = {};
  const pistolModel = new THREE.Group();
  pistolModel.add(box(0.05, 0.09, 0.16, 0, 0, -0.1, body), box(0.045, 0.12, 0.05, 0, -0.09, 0.02, grip));
  models.pistol = pistolModel;

  const rifleModel = new THREE.Group();
  rifleModel.add(
    box(0.09, 0.1, 0.42, 0, 0, -0.05, body),
    box(0.045, 0.045, 0.4, 0, 0.025, -0.42, grip),
    box(0.075, 0.08, 0.22, 0, -0.02, 0.26, grip),
    box(0.03, 0.06, 0.1, 0, 0.07, -0.12, dark),
  );
  models.rifle = rifleModel;

  const smgModel = new THREE.Group();
  smgModel.add(
    box(0.08, 0.09, 0.3, 0, 0, -0.05, body),
    box(0.04, 0.04, 0.28, 0, 0.02, -0.3, grip),
    box(0.06, 0.14, 0.05, 0, -0.1, 0.06, grip),
  );
  models.smg = smgModel;

  const sniperModel = new THREE.Group();
  sniperModel.add(
    box(0.08, 0.09, 0.55, 0, 0, -0.1, body),
    box(0.04, 0.04, 0.45, 0, 0.03, -0.5, grip),
    box(0.05, 0.05, 0.16, 0, 0.08, -0.15, dark),
    box(0.07, 0.07, 0.2, 0, -0.02, 0.28, grip),
  );
  models.sniper = sniperModel;

  for (const model of Object.values(models)) {
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const def of Object.values(WEAPONS)) {
    ammo[def.id] = { mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };
  }
  const owned = { pistol: true };
  let current = 'pistol';
  models.pistol.visible = true;

  function currentState() {
    return ammo[current];
  }

  function step(dt) {
    const state = currentState();
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (WEAPONS[current].reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const def = WEAPONS[current];
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    get current() {
      return current;
    },
    get def() {
      return WEAPONS[current];
    },
    get state() {
      return currentState();
    },
    owned,
    ammo,
    step,
    ready() {
      const state = currentState();
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const state = currentState();
      state.cooldown = WEAPONS[current].gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      const state = currentState();
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const state = currentState();
      const def = WEAPONS[current];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false;
      state.reloadLeft = def.reload;
      return true;
    },
    spread(speed) {
      const def = WEAPONS[current];
      return def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove;
    },
    switchTo(id) {
      if (!owned[id] || id === current) return false;
      models[current].visible = false;
      current = id;
      models[current].visible = true;
      return true;
    },
    buy(id) {
      owned[id] = true;
      ammo[id].mag = WEAPONS[id].mag;
      ammo[id].reserve = WEAPONS[id].reserve;
      this.switchTo(id);
    },
    // A new round tops every owned weapon back up: ammo pressure lives inside a round.
    refillAll() {
      for (const id of Object.keys(owned)) {
        ammo[id].mag = WEAPONS[id].mag;
        ammo[id].reserve = WEAPONS[id].reserve;
        ammo[id].cooldown = 0;
        ammo[id].reloadLeft = 0;
        ammo[id].flash = 0;
        ammo[id].kick = 0;
      }
    },
  };
}
