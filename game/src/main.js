// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. Sable Line: attackers plant the bomb at A or B or eliminate the Rust squad;
// defenders hold the sites. Rounds, money, a buy menu, grenades and bots that see,
// hear and shoot back.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponSet, damageAt } from './weapons.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createCombat } from './combat.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';
import { createEconomy } from './economy.js';
import { createState, ROUND_TIME, FREEZE_TIME, PLANT_TIME, FUSE_TIME, WIN_ROUNDS } from './state.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const nav = createNav(world.waypoints, world.shootables);
const fx = createFx(scene);
const audio = createAudio();
const economy = createEconomy();
const { state, reset: resetState, feedKill } = createState();
const hud = createHud();
const weaponSet = createWeaponSet(camera);
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const combat = createCombat(world.shootables);
const grenades = createGrenades(scene, combat, fx, audio, random);
const bots = createBots(scene, world, nav, combat, fx, audio, random);

const playerFighter = {
  name: 'You',
  team: 'sable',
  health: 100,
  armor: 0,
  alive: true,
  isPlayer: true,
  chest: new THREE.Vector3(),
  eye: new THREE.Vector3(),
};

// The player's body as bots see it: invisible meshes that still take rays, so a bot
// can hit the player without the player seeing their own body.
const hitbox = new THREE.Group();
{
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), new THREE.MeshBasicMaterial());
  torso.position.y = 1.0;
  torso.userData.fighter = playerFighter;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), new THREE.MeshBasicMaterial());
  head.position.y = 1.53;
  head.userData.fighter = playerFighter;
  head.userData.part = 'head';
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), new THREE.MeshBasicMaterial());
  legL.position.set(-0.11, 0.31, 0);
  legL.userData.fighter = playerFighter;
  legL.userData.part = 'torso';
  const legR = legL.clone();
  legR.position.x = 0.11;
  hitbox.add(torso, head, legL, legR);
  hitbox.visible = false;
  scene.add(hitbox);
}
const shootables = [];
// The ray list is built after the bots spawn: concat() snapshots the array, so
// bot hit meshes added later would otherwise never be shootable.
function rebuildShootables() {
  shootables.length = 0;
  shootables.push(...world.shootables, ...bots.hitMeshes, ...hitbox.children);
  combat.setShootables(shootables);
}

// Bot assignments for a round: two teammates walk the sites with the player, four
// defenders hold A, B and mid.
const ASSIGNMENTS = [
  { team: 'sable', index: 0, role: 'attack', weaponId: 'rifle', spawn: [-3, 15.5], hold: [-3, 15.5], holdYaw: 0, site: 'A' },
  { team: 'sable', index: 1, role: 'attack', weaponId: 'smg', spawn: [3, 15.5], hold: [3, 15.5], holdYaw: 0, site: 'B' },
  { team: 'rust', index: 0, role: 'defend', weaponId: 'rifle', spawn: [-17, -14], hold: [-17, -14], holdYaw: -2.6, site: 'A' },
  { team: 'rust', index: 1, role: 'defend', weaponId: 'rifle', spawn: [-13, -9], hold: [-13, -9], holdYaw: -2.2, site: 'A' },
  { team: 'rust', index: 2, role: 'defend', weaponId: 'smg', spawn: [17, -14], hold: [17, -14], holdYaw: 2.6, site: 'B' },
  { team: 'rust', index: 3, role: 'defend', weaponId: 'sniper', spawn: [3, -9], hold: [3, -9], holdYaw: Math.PI, site: 'B' },
];
for (const a of ASSIGNMENTS) {
  bots.spawn(a.team, a.index, a.role, a.weaponId, new THREE.Vector3(a.spawn[0], 0, a.spawn[1]), a.hold);
}
rebuildShootables();

const body = player.state;
const rayDirection = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const noises = [];
let fragCount = 0;
let smokeCount = 0;
let grenadeKind = 'frag';
let bombCarrier = playerFighter;
let spectateBot = null;
let roundEndTimer = 0;
let frozen = false;
let suppressPause = false;
let buyOpen = false;
let prevFiring = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let fov = 74;

const sableFighters = [playerFighter, ...bots.bots.filter((b) => b.team === 'sable')];
const rustFighters = bots.bots.filter((b) => b.team === 'rust');
const allFighters = [...sableFighters, ...rustFighters];
// One context object for the bots, mutated in place each step: the hot loop makes
// no fresh object per step.
const botCtx = {
  time: 0,
  phase: 'menu',
  smokes: grenades.smokes,
  bomb: { status: 'carried', site: null, at: null, carrier: playerFighter },
  noises,
  playerPos: body.position,
  enemies: (bot) => (bot.team === 'sable' ? rustFighters : sableFighters),
};
let botPlanting = false;
let botDefusing = false;
let plantSite = null;

function aliveCount(fighters) {
  return fighters.filter((f) => f.alive).length;
}

function pushNoise(x, z, radius) {
  noises.push({ x, z, radius, at: elapsed });
}

function onKill(killer, victim, head) {
  feedKill(killer.name, victim.name, head, killer.team);
  if (killer === playerFighter) {
    economy.kill();
    audio.kill();
  }
  if (victim === playerFighter) {
    playerFighter.alive = false;
    spectateBot = bots.bots.find((b) => b.team === 'sable' && b.alive) || null;
    if (bombCarrier === playerFighter) dropBomb();
    hud.damageFlash();
  } else if (victim.carriesBomb) {
    victim.carriesBomb = false;
    dropBombAt(victim.position.x, victim.position.z);
  }
}

function dropBomb() {
  dropBombAt(body.position.x, body.position.z);
}

function dropBombAt(x, z) {
  state.bomb = 'dropped';
  state.bombAt = new THREE.Vector3(x, 0, z);
  bombCarrier = null;
}

function siteOf(point) {
  for (const [name, site] of Object.entries(world.sites)) {
    if (Math.hypot(point.x - site.center.x, point.z - site.center.z) <= site.radius) return name;
  }
  return null;
}

function startRound() {
  const spawn = world.spawns.attackers[0];
  const wasAlive = playerFighter.alive;
  body.position.set(spawn.x, 0, spawn.z);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  playerFighter.health = 100;
  playerFighter.alive = true;
  if (state.round === 1 || !wasAlive) playerFighter.armor = 0;
  spectateBot = null;
  weaponSet.refillAll();
  bots.resetRound(ASSIGNMENTS);
  state.bomb = 'carried';
  state.bombSite = null;
  state.bombAt = null;
  state.fuseLeft = 0;
  state.plantProgress = 0;
  state.defuseProgress = 0;
  plantSite = null;
  state.timer = ROUND_TIME;
  state.freezeLeft = FREEZE_TIME;
  state.phase = 'freeze';
  bombCarrier = playerFighter;
  noises.length = 0;
  hud.hideBuy();
  buyOpen = false;
  hud.showBanner(`Round ${state.round}`, 'Buy phase — press B for equipment', '');
  // A round that starts unlocked (the last one ended by exiting the lock) needs
  // a visible way back in: show the pause panel so a click re-locks the mouse.
  if (!shot && !input.state.locked) hud.showOverlay('paused');
  syncHud();
}

function startMatch() {
  resetState();
  economy.reset();
  fragCount = 0;
  smokeCount = 0;
  grenadeKind = 'frag';
  state.round = 1;
  startRound();
}

function endRound(winner, reason) {
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
  state.phase = 'roundEnd';
  state.roundWinner = winner;
  state.roundReason = reason;
  state.wins[winner] += 1;
  economy.roundEnd(winner === 'sable');
  roundEndTimer = 4.5;
  const won = winner === 'sable';
  hud.showBanner(
    won ? `Round ${state.round} — Sable takes it` : `Round ${state.round} — Rust takes it`,
    reason,
    won ? 'win' : 'lose',
  );
  if (won) audio.roundWin();
  else audio.roundLose();
  if (document.pointerLockElement) document.exitPointerLock();
  syncHud();
}

function endMatch() {
  state.phase = 'matchEnd';
  state.matchWinner = state.wins.sable > state.wins.rust ? 'sable' : 'rust';
  hud.showOverlay('matchEnd', { winner: state.matchWinner, sable: state.wins.sable, rust: state.wins.rust });
  if (document.pointerLockElement) document.exitPointerLock();
}

function syncHud() {
  hud.setHealth(playerFighter.health, playerFighter.armor);
  hud.setAmmo(weaponSet.state.mag, weaponSet.state.reserve, weaponSet.def.name, weaponSet.state.reloadLeft > 0);
  hud.setGrenades(fragCount, smokeCount);
  hud.setMoney(economy.money);
  hud.setScore(state.wins.sable, state.wins.rust, state.round, aliveCount(sableFighters), aliveCount(rustFighters));
  hud.setFeed(state.feed);
  if (botPlanting || (state.phase === 'live' && state.plantProgress > 0 && bombCarrier === playerFighter)) {
    hud.setBomb('planting', plantSite, state.fuseLeft, bombCarrier === playerFighter, state.plantProgress);
  } else {
    hud.setBomb(state.bomb, state.bombSite, state.fuseLeft, bombCarrier === playerFighter);
  }
  hud.setTimer(state.phase === 'freeze' ? state.freezeLeft : Math.max(0, state.timer), state.phase);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (!suppressPause && (state.phase === 'live' || state.phase === 'freeze') && !buyOpen) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === 'menu' || state.phase === 'matchEnd') startMatch();
  input.requestLock();
});

hud.onCloseBuy(() => closeBuy());

// Clicking the canvas re-locks the mouse mid-round, so a lost lock never strands
// the player without a way back in.
renderer.domElement.addEventListener('click', () => {
  if (!shot && !input.state.locked && (state.phase === 'live' || state.phase === 'freeze') && !buyOpen) {
    input.requestLock();
  }
});

function openBuy() {
  if (state.phase !== 'freeze' || buyOpen) return;
  buyOpen = true;
  suppressPause = true;
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showBuy(buyItems(), economy.money);
}

function closeBuy() {
  if (!buyOpen) return;
  buyOpen = false;
  suppressPause = false;
  hud.hideBuy();
  input.requestLock();
}

function buyItems() {
  const items = economy.buyList(weaponSet.owned).map((item) => ({ ...item }));
  for (const item of items) {
    if (item.id === 'frag') item.owned = fragCount >= 2;
    if (item.id === 'smoke') item.owned = smokeCount >= 2;
    if (item.id === 'armor') item.owned = playerFighter.armor >= 100;
  }
  return items;
}

hud.onBuyItem = (id) => {
  const item = buyItems().find((entry) => entry.id === id);
  if (!item || item.owned) return;
  if (!economy.spend(item.price)) {
    audio.denied();
    return;
  }
  if (item.kind === 'weapon') weaponSet.buy(id);
  else if (id === 'frag') fragCount += 1;
  else if (id === 'smoke') smokeCount += 1;
  else if (id === 'armor') playerFighter.armor = Math.min(100, playerFighter.armor + 50);
  audio.buy();
  hud.showBuy(buyItems(), economy.money);
  syncHud();
};

function syncCamera() {
  if (playerFighter.alive) {
    camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
    camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  } else if (spectateBot) {
    camera.position.set(spectateBot.position.x, 1.55, spectateBot.position.z);
    camera.rotation.set(0, spectateBot.yaw, 0, 'YXZ');
  }
}

function syncFighterVectors() {
  const crouchScale = body.crouching ? 0.65 : 1;
  playerFighter.eye.set(body.position.x, body.position.y + body.eye, body.position.z);
  playerFighter.chest.set(body.position.x, body.position.y + 1.15 * crouchScale, body.position.z);
  hitbox.position.copy(body.position);
  hitbox.rotation.y = body.yaw;
  hitbox.scale.y = crouchScale;
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shootPlayer(spread) {
  if (!weaponSet.takeRound()) {
    audio.dryFire();
    weaponSet.reload();
    return false;
  }
  camera.getWorldDirection(rayDirection);
  rayDirection.x += (random() * 2 - 1) * spread;
  rayDirection.y += (random() * 2 - 1) * spread;
  rayDirection.z += (random() * 2 - 1) * spread;
  rayDirection.normalize();
  scene.updateMatrixWorld(true);
  const hit = combat.fire(camera.position, rayDirection, weaponSet.def.range);
  muzzle.set(0.24, -0.18, -0.9);
  camera.localToWorld(muzzle);
  const end = hit ? hit.point : camera.position.clone().addScaledVector(rayDirection, weaponSet.def.range);
  fx.tracer(muzzle, end);
  if (hit) {
    if (hit.fighter && hit.fighter.team !== 'sable') {
      const amount = damageAt(weaponSet.def, hit.distance, hit.part === 'head');
      const result = combat.damage(hit.fighter, amount);
      hud.hitMarker(result.killed, shot ? 4000 : 90);
      audio.hit();
      if (result.killed) onKill(playerFighter, hit.fighter, hit.part === 'head');
    } else if (!hit.fighter) {
      fx.spark(hit.point, hit.normal);
    }
  }
  weaponSet.pullTrigger();
  audio.shot(weaponSet.def.kind);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  pushNoise(body.position.x, body.position.z, 26);
  hud.setAmmo(weaponSet.state.mag, weaponSet.state.reserve, weaponSet.def.name, false);
  return true;
}

function throwSelectedGrenade() {
  if (state.phase !== 'live') return;
  if (grenadeKind === 'frag' && fragCount <= 0) return;
  if (grenadeKind === 'smoke' && smokeCount <= 0) return;
  camera.getWorldDirection(rayDirection);
  const from = camera.position.clone().addScaledVector(rayDirection, 0.5);
  grenades.throwGrenade(from, rayDirection, grenadeKind);
  if (grenadeKind === 'frag') fragCount -= 1;
  else smokeCount -= 1;
  hud.setGrenades(fragCount, smokeCount);
}

function botContext() {
  botCtx.time = elapsed;
  botCtx.phase = state.phase;
  botCtx.bomb.status = state.bomb;
  botCtx.bomb.site = state.bombSite;
  botCtx.bomb.at = state.bombAt;
  botCtx.bomb.carrier = bombCarrier;
  return botCtx;
}

function drainBotEvents() {
  botPlanting = false;
  botDefusing = false;
  for (const event of bots.drainEvents()) {
    if (event.type === 'kill') {
      onKill(event.killer, event.victim, event.head);
    } else if (event.type === 'noise') {
      pushNoise(event.x, event.z, event.radius);
    } else if (event.type === 'playerHit') {
      hud.damageFlash();
      audio.hurt();
    } else if (event.type === 'plant') {
      botPlanting = true;
      plantSite = event.bot.site;
      state.plantProgress = event.progress;
      hud.setBomb('planting', event.bot.site, state.fuseLeft, false, event.progress);
    } else if (event.type === 'planted') {
      plantSite = null;
      state.bomb = 'planted';
      state.bombSite = event.site;
      state.fuseLeft = FUSE_TIME;
      hud.showBanner('Bomb planted', `Rust has ${FUSE_TIME} seconds to defuse`, 'lose');
      audio.plantDone();
    } else if (event.type === 'defuse') {
      botDefusing = true;
      state.defuseProgress = event.progress;
    } else if (event.type === 'defused') {
      state.bomb = 'defused';
      endRound('rust', 'The bomb was defused.');
    } else if (event.type === 'pickup') {
      bombCarrier = event.bot;
      state.bomb = 'carried';
    }
  }
  if (!botDefusing) state.defuseProgress = 0;
  for (const victim of grenades.drainKills()) {
    onKill(playerFighter, victim, false);
  }
}

function checkRoundEnd() {
  if (state.phase !== 'live') return;
  if (aliveCount(rustFighters) === 0) {
    endRound('sable', state.bomb === 'planted' ? 'The Rust squad is down.' : 'The Rust squad is eliminated.');
  } else if (aliveCount(sableFighters) === 0) {
    endRound('rust', 'The Sable squad is eliminated.');
  } else if (state.timer <= 0 && state.bomb !== 'planted') {
    endRound('rust', 'Time expired before the bomb was planted.');
  }
}

function step(dt) {
  elapsed += dt;
  const phase = state.phase;

  if (phase === 'freeze') {
    state.freezeLeft -= dt;
    if (state.freezeLeft <= 0) {
      state.phase = 'live';
      if (buyOpen) {
        buyOpen = false;
        suppressPause = false;
        hud.hideBuy();
      }
      hud.showBanner(`Round ${state.round}`, 'Plant the bomb at A or B', '');
    }
  } else if (phase === 'live') {
    state.timer -= dt;
    if (state.bomb === 'planted') {
      state.fuseLeft -= dt;
      if (state.fuseLeft <= 0) {
        state.bomb = 'exploded';
        audio.explosion();
        endRound('sable', 'The bomb detonated.');
      }
    }
  } else if (phase === 'roundEnd') {
    roundEndTimer -= dt;
    if (roundEndTimer <= 0) {
      if (state.wins.sable >= WIN_ROUNDS || state.wins.rust >= WIN_ROUNDS) {
        endMatch();
      } else {
        state.round += 1;
        startRound();
      }
    }
  }

  if (phase === 'live' || phase === 'freeze' || phase === 'roundEnd') {
    player.step(dt, input.state.keys);
    weaponSet.step(dt);
    bots.step(dt, botContext());
    grenades.step(dt, elapsed, allFighters);
    fx.step(dt);
    drainBotEvents();
    // Planting: hold E inside a site while carrying the bomb.
    if (phase === 'live' && playerFighter.alive && bombCarrier === playerFighter && input.state.keys.has('KeyE')) {
      const site = siteOf(body.position);
      if (site) {
        plantSite = site;
        state.plantProgress += dt / PLANT_TIME;
        hud.setBomb('planting', site, state.fuseLeft, true, state.plantProgress);
        if (state.plantProgress >= 1) {
          state.bomb = 'planted';
          state.bombSite = site;
          state.fuseLeft = FUSE_TIME;
          state.plantProgress = 0;
          plantSite = null;
          economy.plant();
          audio.plantDone();
          hud.showBanner('Bomb planted', `Rust has ${FUSE_TIME} seconds to defuse`, 'lose');
        }
      } else {
        state.plantProgress = 0;
      }
    } else if (phase === 'live' && !botPlanting) {
      state.plantProgress = 0;
    }
    syncFighterVectors();
    checkRoundEnd();
    for (let i = noises.length - 1; i >= 0; i -= 1) {
      if (elapsed - noises[i].at > 4) noises.splice(i, 1);
    }
  }
  syncHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    const sensitivity = input.state.aiming && weaponSet.def.id === 'sniper' ? 0.0011 : 0.0022;
    player.look(look.x, look.y, sensitivity);
    const pressed = input.takePressed();
    for (const code of pressed) {
      if (buyOpen) {
        const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].indexOf(code);
        if (index >= 0) {
          const items = buyItems();
          if (items[index]) hud.onBuyItem(items[index].id);
        }
        if (code === 'KeyB' || code === 'Escape') closeBuy();
        continue;
      }
      if (code === 'KeyB' && state.phase === 'freeze') openBuy();
      else if (code === 'KeyR') {
        if (weaponSet.reload()) audio.reload();
      } else if (code === 'KeyG') throwSelectedGrenade();
      else if (code === 'KeyQ') grenadeKind = grenadeKind === 'frag' ? 'smoke' : 'frag';
      else if (code === 'Digit1') weaponSet.switchTo('pistol');
      else if (code === 'Digit2') weaponSet.switchTo('rifle');
      else if (code === 'Digit3') weaponSet.switchTo('smg');
      else if (code === 'Digit4') weaponSet.switchTo('sniper');
    }
    const firing = input.state.firing && playerFighter.alive && state.phase === 'live';
    const trigger = firing && (weaponSet.def.auto || !prevFiring);
    prevFiring = input.state.firing;
    if (trigger && weaponSet.ready()) shootPlayer(shot ? 0 : weaponSet.spread(player.groundSpeed()));
    else if (trigger && weaponSet.state.mag === 0 && weaponSet.state.reloadLeft === 0) {
      audio.dryFire();
      weaponSet.reload();
    }
    // Aim-down-sights on the DMR narrows the view.
    const targetFov = input.state.aiming && weaponSet.def.id === 'sniper' ? 34 : 74;
    if (Math.abs(targetFov - fov) > 0.05) {
      fov += (targetFov - fov) * Math.min(1, dt * 10);
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    hud.setCrosshair(6 + weaponSet.spread(player.groundSpeed()) * 900);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  startMatch();
  state.phase = 'live';
  state.timer = 85;
  economy.money = name === 'buy' ? 5200 : 3200;
  weaponSet.buy('rifle');
  weaponSet.refillAll();
  state.wins.sable = 2;
  state.wins.rust = 1;
  if (name === 'start') {
    body.position.set(0.6, 0, 14.5);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -8));
    hud.showOverlay('start');
    state.phase = 'menu';
  } else if (name === 'play') {
    const target = bots.bots.find((b) => b.team === 'rust' && b.name === 'Rook');
    target.position.set(0, 0, -8);
    target.group.position.copy(target.position);
    target.yaw = Math.PI;
    const mate = bots.bots.find((b) => b.team === 'sable' && b.name === 'Vex');
    mate.position.set(-2.5, 0, 5);
    mate.group.position.copy(mate.position);
    body.position.set(0, 0, 9);
    settle(20);
    aimAt(new THREE.Vector3(target.position.x, 1.2, target.position.z));
    shootPlayer(0);
    settle(8);
    shootPlayer(0);
    settle(12);
    aimAt(new THREE.Vector3(target.position.x, 1.2, target.position.z));
  } else if (name === 'buy') {
    state.phase = 'freeze';
    state.freezeLeft = 8;
    body.position.set(0, 0, 15);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -8));
    openBuy();
    suppressPause = true;
  } else if (name === 'end') {
    const target = bots.bots.find((b) => b.team === 'rust' && b.name === 'Fenn');
    target.position.set(-16, 0, -11);
    target.group.position.copy(target.position);
    target.alive = false;
    target.health = 0;
    target.fall = 1;
    target.group.rotation.x = -1.45;
    state.round = 3;
    state.wins.sable = 3;
    state.wins.rust = 1;
    state.bomb = 'exploded';
    state.bombSite = 'A';
    body.position.set(-13, 0, -6);
    settle(20);
    // The floating site letter would sit behind the victory banner from this
    // angle, so the staged end shot hides it; the ground frame and the banner
    // still say site A. Live play is unaffected.
    for (const letter of world.siteLetters) letter.visible = false;
    aimAt(new THREE.Vector3(-16, 0.6, -11));
    // A screenshot page paints slowly under SwiftShader, so the banner holds
    // for a minute instead of hiding after a few seconds.
    hud.showBanner('Round 3 — Sable takes it', 'The bomb detonated at site A.', 'win', 60000);
  }
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Test hooks for automated playtests (and nothing else): the live game never calls them.
window.__game = {
  state,
  player: player.state,
  playerFighter,
  bots: bots.bots,
  economy,
  weaponSet,
  version: 'sable-line-1.0',
  startMatch,
  look(dx, dy) {
    player.look(dx, dy);
    syncCamera();
  },
  // Hold or release the trigger without pointer lock (headless playtests).
  fire(on) {
    input.state.firing = on;
  },
  keys() {
    return [...input.state.keys];
  },
  // Aim the camera at a point and fire the current weapon's ray once, reporting
  // what it struck. Headless playtests only; the live game never calls it.
  probeShot(x, y, z) {
    aimAt(new THREE.Vector3(x, y, z));
    scene.updateMatrixWorld(true);
    camera.getWorldDirection(rayDirection);
    const hit = combat.fire(camera.position, rayDirection, weaponSet.def.range);
    if (!hit) return { hit: false };
    return {
      hit: true,
      part: hit.part,
      distance: hit.distance,
      fighter: hit.fighter ? hit.fighter.name : null,
      point: hit.point.toArray(),
    };
  },
  colliders: world.colliders.map((b) => [b.min.toArray(), b.max.toArray()]),
  waypoints: world.waypoints,
};

syncCamera();
syncFighterVectors();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
