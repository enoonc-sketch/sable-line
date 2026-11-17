// The bots: two attacker teammates and four defenders, all on the same state machine.
// A bot holds a position, walks a route, investigates a noise, engages what it sees
// and reacts to the bomb. It aims with a reaction delay and an error that shrinks
// the longer it watches, fires in bursts, and hears gunfire — so holding an angle
// and stopping to aim beats running at it, for bots as for the player.
import * as THREE from 'three';
import { WEAPONS, damageAt } from './weapons.js';
import { createColliderTester } from './physics.js';
import { PLANT_TIME, DEFUSE_TIME } from './state.js';
import { range } from './rng.js';

const EYE_HEIGHT = 1.55;
const WALK_SPEED = 3.4;
const ADVANCE_SPEED = 4.1;
const SCAN_GAP = 0.12;
const SIGHT_RANGE = 48;

const NAMES = {
  sable: ['Vex', 'Hale'],
  rust: ['Rook', 'Bramble', 'Fenn', 'Slate'],
};

function buildBody(scene, team) {
  const group = new THREE.Group();
  const trim = team === 'sable' ? 0x30b0ff : 0xff453a;
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.85 });
  const vest = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.7 });
  const accent = new THREE.MeshBasicMaterial({ color: trim });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.4 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), cloth);
  legL.position.set(-0.11, 0.31, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), vest);
  torso.position.y = 1.0;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.06), new THREE.MeshStandardMaterial({ color: trim, roughness: 0.5 }));
  plate.position.set(0, 1.05, 0.17);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), skin);
  head.position.y = 1.53;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), vest);
  helmet.position.y = 1.55;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), gunMat);
  gun.position.set(0.18, 1.18, -0.28);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.05), accent);
  marker.position.y = 1.86;
  group.add(legL, legR, torso, plate, head, helmet, gun, marker);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
    }
  });
  scene.add(group);
  return { group, torso, head, legL, legR };
}

export function createBots(scene, world, nav, combat, fx, audio, random) {
  const tester = createColliderTester(world.colliders);
  const events = [];
  const bots = [];
  const hitMeshes = [];
  const forward = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();
  const eyePos = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  function makeBot(team, index, role, weaponId, spawn, hold) {
    const body = buildBody(scene, team);
    const def = WEAPONS[weaponId];
    const bot = {
      name: NAMES[team][index],
      team,
      role,
      def,
      group: body.group,
      torso: body.torso,
      head: body.head,
      position: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: 0,
      health: 100,
      armor: team === 'rust' ? 50 : 0,
      alive: true,
      speed: 0,
      state: role === 'defend' ? 'hold' : 'advance',
      route: [],
      routeIndex: 0,
      destination: null,
      holdNode: hold,
      holdYaw: 0,
      site: null,
      target: null,
      lastKnown: new THREE.Vector3(),
      seenTime: 0,
      reactAt: 0,
      burstLeft: 0,
      burstPause: 0,
      cooldown: 0,
      scanTimer: random() * SCAN_GAP,
      investigateUntil: 0,
      stuckTimer: 0,
      lastCheckPos: new THREE.Vector3(spawn.x, 0, spawn.z),
      strafeDir: 1,
      strafeTimer: 0,
      plantProgress: 0,
      defuseProgress: 0,
      fall: 0,
      eye: new THREE.Vector3(spawn.x, EYE_HEIGHT, spawn.z),
      chest: new THREE.Vector3(spawn.x, 1.15, spawn.z),
      carriesBomb: false,
    };
    body.torso.userData.fighter = bot;
    body.torso.userData.part = 'torso';
    body.head.userData.fighter = bot;
    body.head.userData.part = 'head';
    body.legL.userData.fighter = bot;
    body.legL.userData.part = 'torso';
    body.legR.userData.fighter = bot;
    body.legR.userData.part = 'torso';
    hitMeshes.push(body.torso, body.head, body.legL, body.legR);
    bots.push(bot);
    return bot;
  }

  function resetRound(assignments) {
    for (let i = 0; i < bots.length && i < assignments.length; i += 1) {
      const bot = bots[i];
      const a = assignments[i];
      bot.position.set(a.spawn[0], 0, a.spawn[1]);
      bot.yaw = a.holdYaw ?? 0;
      bot.health = 100;
      bot.armor = bot.team === 'rust' ? 50 : 0;
      bot.alive = true;
      bot.speed = 0;
      bot.state = bot.role === 'defend' ? 'hold' : 'advance';
      bot.route = [];
      bot.routeIndex = 0;
      bot.destination = null;
      bot.holdNode = a.hold;
      bot.holdYaw = a.holdYaw ?? 0;
      bot.site = a.site ?? null;
      bot.target = null;
      bot.seenTime = 0;
      bot.reactAt = 0;
      bot.burstLeft = 0;
      bot.burstPause = 0;
      bot.cooldown = 0;
      bot.investigateUntil = 0;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.fall = 0;
      bot.carriesBomb = !!a.carriesBomb;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.copy(bot.position);
      bot.lastCheckPos.copy(bot.position);
    }
  }

  function spawn(team, index, role, weaponId, spawnPos, hold) {
    const bot = makeBot(team, index, role, weaponId, spawnPos, hold);
    bot.group.position.copy(bot.position);
    bot.group.rotation.y = bot.yaw;
    return bot;
  }

  function eyeOf(bot) {
    eyePos.set(bot.position.x, EYE_HEIGHT, bot.position.z);
    return eyePos;
  }

  function faceToward(bot, tx, tz, dt, rate = 6) {
    const desired = Math.atan2(-(tx - bot.position.x), -(tz - bot.position.z));
    let diff = desired - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function moveToward(bot, tx, tz, speed, dt) {
    const dx = tx - bot.position.x;
    const dz = tz - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return 0;
    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;
    const achieved = tester.moveHorizontal(bot.position, 1.72, vx, vz, dt);
    bot.speed = Math.hypot(achieved.x, achieved.z);
    faceToward(bot, tx, tz, dt, 8);
    return dist;
  }

  function setRoute(bot, tx, tz) {
    bot.route = nav.route(bot.position.x, bot.position.z, tx, tz);
    bot.routeIndex = 0;
    bot.destination = [tx, tz];
    bot.stuckTimer = 0;
  }

  function followRoute(bot, speed, dt) {
    if (bot.routeIndex >= bot.route.length) return true;
    const [tx, tz] = bot.route[bot.routeIndex];
    const dist = moveToward(bot, tx, tz, speed, dt);
    if (dist < 0.7) bot.routeIndex += 1;
    return bot.routeIndex >= bot.route.length;
  }

  function scan(bot, enemies, smokes, now, dt) {
    bot.scanTimer -= dt;
    if (bot.scanTimer > 0) return;
    bot.scanTimer = SCAN_GAP + bot.name.length * 0.013;
    const eye = eyeOf(bot);
    let best = null;
    let bestDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.chest.x - eye.x;
      const dy = enemy.chest.y - eye.y;
      const dz = enemy.chest.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > SIGHT_RANGE || dist >= bestDist) continue;
      if (!nav.hasSight(eye.x, eye.y, eye.z, enemy.chest.x, enemy.chest.y, enemy.chest.z)) continue;
      if (nav.blockedBySmoke(eye.x, eye.y, eye.z, enemy.chest.x, enemy.chest.y, enemy.chest.z, smokes)) continue;
      best = enemy;
      bestDist = dist;
    }
    if (best) {
      if (bot.target !== best) {
        bot.target = best;
        bot.reactAt = now + range(random, 0.35, 0.65);
        bot.burstLeft = 0;
        bot.burstPause = 0;
      }
      bot.lastKnown.copy(best.chest);
      bot.seenTime = now;
    } else if (bot.target && now - bot.seenTime > 2.5) {
      bot.target = null;
    }
  }

  function shoot(bot, now, dt, ctx) {
    const enemy = bot.target;
    if (!enemy) return;
    bot.cooldown -= dt;
    bot.burstPause -= dt;
    if (bot.burstLeft === 0 && bot.burstPause <= 0 && now >= bot.reactAt) {
      bot.burstLeft = 3 + Math.floor(random() * 3);
      events.push({ type: 'noise', x: bot.position.x, z: bot.position.z, radius: 26 });
    }
    if (bot.burstLeft <= 0 || bot.cooldown > 0) return;
    bot.cooldown = bot.def.gap * 1.15;
    bot.burstLeft -= 1;
    if (bot.burstLeft === 0) bot.burstPause = range(random, 0.7, 1.2);

    const eye = eyeOf(bot);
    const dist = eye.distanceTo(enemy.chest);
    // Aim at the chest, sometimes the head; error shrinks while the bot watches and
    // grows while it or its target moves.
    const headAim = random() < 0.12;
    aimPoint.copy(headAim ? enemy.eye : enemy.chest);
    let error = 0.035 + dist * 0.001;
    error *= 1 - Math.min(0.55, (now - bot.seenTime) * 0.12 + 0.1);
    if (bot.speed > 0.5) error *= 1.6;
    const spread = dist * error;
    aimPoint.x += (random() * 2 - 1) * spread;
    aimPoint.y += (random() * 2 - 1) * spread * 0.6;
    aimPoint.z += (random() * 2 - 1) * spread;
    toTarget.subVectors(aimPoint, eye).normalize();
    const muzzle = eye.clone().addScaledVector(toTarget, 0.6);
    muzzle.y -= 0.12;
    const hit = combat.fire(muzzle, toTarget, bot.def.range);
    const end = hit ? hit.point : eye.clone().addScaledVector(toTarget, bot.def.range);
    fx.tracer(muzzle, end);
    if (ctx.playerPos && bot.position.distanceTo(ctx.playerPos) < 30) audio.distantShot();
    if (hit && hit.fighter && hit.fighter.team !== bot.team) {
      const amount = damageAt(bot.def, hit.distance, hit.part === 'head');
      const result = combat.damage(hit.fighter, amount);
      if (hit.fighter.isPlayer) events.push({ type: 'playerHit', amount });
      if (result.killed) {
        events.push({ type: 'kill', killer: bot, victim: hit.fighter, head: hit.part === 'head' });
      }
    } else if (hit) {
      fx.spark(hit.point, hit.normal);
    }
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.08;
      }
      return;
    }
    const now = ctx.time;
    bot.eye.set(bot.position.x, EYE_HEIGHT, bot.position.z);
    bot.chest.set(bot.position.x, 1.15, bot.position.z);
    // Buy phase and round end are non-combat: bots hold at spawn and do not
    // acquire targets, so the freeze cannot decide the round and nobody walks
    // into a pre-aimed angle the moment the round goes live.
    if (ctx.phase !== 'live') {
      bot.target = null;
      return;
    }
    if (ctx.phase === 'live') scan(bot, ctx.enemies(bot), ctx.smokes, now, dt);
    if (bot.target && !bot.target.alive) bot.target = null;

    if (bot.target) {
      const enemy = bot.target;
      faceToward(bot, enemy.chest.x, enemy.chest.z, dt, 7);
      const dist = Math.hypot(enemy.chest.x - bot.position.x, enemy.chest.z - bot.position.z);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = range(random, 1.2, 2);
        bot.strafeDir = random() < 0.5 ? -1 : 1;
      }
      if (dist > 20) {
        moveToward(bot, enemy.chest.x, enemy.chest.z, WALK_SPEED * 0.7, dt);
      } else if (dist < 7) {
        moveToward(bot, bot.position.x * 2 - enemy.chest.x, bot.position.z * 2 - enemy.chest.z, WALK_SPEED * 0.6, dt);
      } else {
        // Strafe across the sightline while firing.
        const dx = enemy.chest.x - bot.position.x;
        const dz = enemy.chest.z - bot.position.z;
        const len = Math.hypot(dx, dz) || 1;
        moveToward(bot, bot.position.x + (-dz / len) * bot.strafeDir * 3, bot.position.z + (dx / len) * bot.strafeDir * 3, WALK_SPEED * 0.5, dt);
        faceToward(bot, enemy.chest.x, enemy.chest.z, dt, 7);
      }
      shoot(bot, now, dt, ctx);
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      return;
    }

    // No target: role behaviour.
    if (bot.team === 'rust' && ctx.bomb.status === 'planted') {
      const site = ctx.bomb.site;
      const bombAt = ctx.bomb.at;
      const dist = Math.hypot(bombAt.x - bot.position.x, bombAt.z - bot.position.z);
      if (dist > 1.6) {
        if (!bot.destination || bot.destination[0] !== bombAt.x || bot.destination[1] !== bombAt.z) setRoute(bot, bombAt.x, bombAt.z);
        followRoute(bot, ADVANCE_SPEED, dt);
      } else {
        faceToward(bot, bombAt.x, bombAt.z, dt, 6);
        bot.defuseProgress += dt / DEFUSE_TIME;
        events.push({ type: 'defuse', bot, progress: bot.defuseProgress });
        if (bot.defuseProgress >= 1) events.push({ type: 'defused', bot });
      }
      return;
    }

    if (bot.team === 'sable' && bot.carriesBomb && bot.site) {
      const site = world.sites[bot.site];
      const dist = Math.hypot(site.center.x - bot.position.x, site.center.z - bot.position.z);
      if (dist > site.radius * 0.7) {
        if (!bot.destination || bot.destination[0] !== site.center.x || bot.destination[1] !== site.center.z) {
          setRoute(bot, site.center.x, site.center.z);
        }
        followRoute(bot, ADVANCE_SPEED, dt);
      } else {
        bot.plantProgress += dt / PLANT_TIME;
        events.push({ type: 'plant', bot, progress: bot.plantProgress });
        if (bot.plantProgress >= 1) events.push({ type: 'planted', bot, site: bot.site });
      }
      return;
    }

    if (bot.team === 'sable' && ctx.bomb.status === 'dropped' && !ctx.bomb.carrier) {
      const bombAt = ctx.bomb.at;
      const dist = Math.hypot(bombAt.x - bot.position.x, bombAt.z - bot.position.z);
      if (dist < 1.2) {
        bot.carriesBomb = true;
        events.push({ type: 'pickup', bot });
      } else {
        if (!bot.destination || bot.destination[0] !== bombAt.x || bot.destination[1] !== bombAt.z) setRoute(bot, bombAt.x, bombAt.z);
        followRoute(bot, ADVANCE_SPEED, dt);
      }
      return;
    }

    // After the plant, every attacker converges on the planted site to defend it.
    if (bot.team === 'sable' && ctx.bomb.status === 'planted') {
      const site = world.sites[ctx.bomb.site];
      const dist = Math.hypot(site.center.x - bot.position.x, site.center.z - bot.position.z);
      if (dist > site.radius * 0.7) {
        if (!bot.destination || bot.destination[0] !== site.center.x || bot.destination[1] !== site.center.z) {
          setRoute(bot, site.center.x, site.center.z);
        }
        followRoute(bot, ADVANCE_SPEED, dt);
      } else {
        bot.yaw += dt * 0.7;
      }
      return;
    }

    // Attackers without the bomb escort the human bomb carrier: they stay beside
    // the player and push the site the player enters, so the player never fights
    // alone against two holders. (When the player is dead the bomb drops and the
    // pickup branch above takes over.)
    if (bot.team === 'sable' && !bot.carriesBomb) {
      const carrier = ctx.bomb.carrier;
      if (carrier && carrier.isPlayer && carrier.alive) {
        const ox = bot.name === 'Vex' ? -2.5 : 2.5;
        const tx = ctx.playerPos.x + ox;
        const tz = ctx.playerPos.z + 2;
        const dist = Math.hypot(tx - bot.position.x, tz - bot.position.z);
        if (dist > 1.2) {
          if (!bot.destination || Math.hypot(bot.destination[0] - tx, bot.destination[1] - tz) > 1.5) {
            setRoute(bot, tx, tz);
          }
          followRoute(bot, ADVANCE_SPEED, dt);
        } else {
          // In position beside the player: sweep for threats.
          bot.yaw += dt * 0.7;
        }
        return;
      }
    }

    if (bot.role === 'defend') {
      // Investigate a recent noise, then return to the hold.
      const noise = ctx.noises.find((n) => now - n.at < 3 && Math.hypot(n.x - bot.position.x, n.z - bot.position.z) < 26);
      if (noise && bot.state !== 'investigate') {
        bot.state = 'investigate';
        bot.investigateUntil = now + 3;
        setRoute(bot, noise.x, noise.z);
      }
      if (bot.state === 'investigate') {
        if (followRoute(bot, ADVANCE_SPEED, dt)) {
          bot.yaw += dt * 0.8;
          if (now > bot.investigateUntil) {
            bot.state = 'hold';
            setRoute(bot, bot.holdNode[0], bot.holdNode[1]);
          }
        }
        return;
      }
      const [hx, hz] = bot.holdNode;
      const dist = Math.hypot(hx - bot.position.x, hz - bot.position.z);
      if (dist > 0.8) {
        if (!bot.destination || bot.destination[0] !== hx || bot.destination[1] !== hz) setRoute(bot, hx, hz);
        followRoute(bot, WALK_SPEED, dt);
      } else {
        // Hold the angle, sweeping slowly across the likely entry.
        bot.yaw = bot.holdYaw + Math.sin(now * 0.5 + bot.name.length) * 0.45;
      }
      return;
    }

    // Attackers without the bomb walk their site route.
    if (bot.site) {
      const site = world.sites[bot.site];
      if (!bot.destination || bot.destination[0] !== site.center.x || bot.destination[1] !== site.center.z) {
        setRoute(bot, site.center.x, site.center.z);
      }
      if (!followRoute(bot, ADVANCE_SPEED, dt)) return;
      // At the site, sweep the corners.
      bot.yaw += dt * 0.7;
    }
  }

  function step(dt, ctx) {
    for (const bot of bots) stepBot(bot, dt, ctx);
    // Stuck watch: a bot that tried to move and got nowhere re-routes.
    for (const bot of bots) {
      if (!bot.alive || !bot.destination) continue;
      bot.stuckTimer += dt;
      if (bot.stuckTimer < 0.6) continue;
      bot.stuckTimer = 0;
      const moved = Math.hypot(bot.position.x - bot.lastCheckPos.x, bot.position.z - bot.lastCheckPos.z);
      bot.lastCheckPos.copy(bot.position);
      if (moved < 0.12 && bot.speed > 0.1) {
        bot.routeIndex += 1;
        if (bot.routeIndex >= bot.route.length) setRoute(bot, bot.destination[0], bot.destination[1]);
      }
    }
    for (const bot of bots) {
      if (bot.alive) {
        bot.group.position.copy(bot.position);
        bot.group.rotation.y = bot.yaw;
      } else {
        bot.group.position.set(bot.position.x, -bot.fall * 0.08, bot.position.z);
      }
    }
  }

  return {
    bots,
    hitMeshes,
    events,
    spawn,
    resetRound,
    step,
    drainEvents() {
      const out = events.splice(0, events.length);
      return out;
    },
  };
}
