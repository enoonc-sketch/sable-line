// Grenades: a frag that arcs, bounces once and bursts, and a smoke that blooms
// into a cloud bots cannot see through. One small sphere mesh per live grenade,
// one sprite cluster per smoke; everything is pooled by reuse, never per frame.
import * as THREE from 'three';

const GRAVITY = 12;
const FRAG_RADIUS = 6;
const FRAG_MAX_DAMAGE = 95;
const SMOKE_RADIUS = 3.4;
const SMOKE_SECONDS = 15;

function smokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(235,238,242,0.92)');
  gradient.addColorStop(0.6, 'rgba(210,214,220,0.6)');
  gradient.addColorStop(1, 'rgba(210,214,220,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGrenades(scene, combat, fx, audio, random) {
  const texture = smokeTexture();
  const live = [];
  const smokes = [];
  const pendingKills = [];
  const ballGeometry = new THREE.SphereGeometry(0.09, 10, 8);
  const ballMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.5 });

  function throwGrenade(from, dir, kind) {
    const mesh = new THREE.Mesh(ballGeometry, ballMaterial);
    mesh.position.copy(from);
    scene.add(mesh);
    live.push({
      kind,
      mesh,
      position: mesh.position,
      velocity: new THREE.Vector3(dir.x * 13, dir.y * 13 + 4.5, dir.z * 13),
      fuse: kind === 'frag' ? 1.6 : 1.1,
      bounced: false,
    });
    audio.throwPin();
  }

  function explode(grenade, fighters) {
    const at = grenade.position;
    audio.explosion();
    fx.spark(at, new THREE.Vector3(0, 1, 0));
    fx.spark(at, new THREE.Vector3(0, 1, 0));
    for (const fighter of fighters) {
      if (!fighter.alive) continue;
      const dx = fighter.chest.x - at.x;
      const dy = fighter.chest.y - at.y;
      const dz = fighter.chest.z - at.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > FRAG_RADIUS) continue;
      const dir = new THREE.Vector3(dx / dist, dy / dist, dz / dist);
      const hit = combat.fire(at, dir, dist);
      if (hit && hit.fighter !== fighter) continue;
      const amount = FRAG_MAX_DAMAGE * (1 - dist / FRAG_RADIUS) + 10;
      const result = combat.damage(fighter, amount);
      if (result.killed) {
        // The thrower is credited by main through the pending-kill event below.
        grenade.kills = grenade.kills || [];
        grenade.kills.push(fighter);
      }
    }
  }

  function deploySmoke(at) {
    const group = new THREE.Group();
    for (let i = 0; i < 9; i += 1) {
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.8, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      const angle = random() * Math.PI * 2;
      const radius = random() * 2.2;
      sprite.position.set(Math.cos(angle) * radius, 0.6 + random() * 1.8, Math.sin(angle) * radius);
      const scale = 2.6 + random() * 2.2;
      sprite.scale.set(scale, scale, 1);
      group.add(sprite);
    }
    group.position.copy(at);
    group.position.y = 0;
    scene.add(group);
    smokes.push({ x: at.x, y: 1.2, z: at.z, radius: SMOKE_RADIUS, until: 0, group });
    return smokes[smokes.length - 1];
  }

  function step(dt, time, fighters) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const grenade = live[i];
      grenade.velocity.y -= GRAVITY * dt;
      grenade.position.addScaledVector(grenade.velocity, dt);
      if (grenade.position.y < 0.1) {
        grenade.position.y = 0.1;
        if (!grenade.bounced) {
          grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.35;
          grenade.velocity.x *= 0.7;
          grenade.velocity.z *= 0.7;
          grenade.bounced = true;
        } else {
          grenade.velocity.y = 0;
          grenade.velocity.x *= 0.85;
          grenade.velocity.z *= 0.85;
        }
      }
      grenade.fuse -= dt;
      if (grenade.fuse <= 0) {
        if (grenade.kind === 'frag') explode(grenade, fighters);
        else {
          const smoke = deploySmoke(grenade.position);
          smoke.until = time + SMOKE_SECONDS;
        }
        scene.remove(grenade.mesh);
        live.splice(i, 1);
        if (grenade.kills) {
          for (const victim of grenade.kills) {
            // Carried out of step() so main can credit the thrower.
            pendingKills.push(victim);
          }
        }
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const smoke = smokes[i];
      if (time >= smoke.until) {
        scene.remove(smoke.group);
        smokes.splice(i, 1);
      }
    }
  }

  return {
    smokes,
    throwGrenade,
    step,
    // Fighters a frag killed since the last drain; main credits the thrower.
    drainKills() {
      return pendingKills.splice(0, pendingKills.length);
    },
  };
}
