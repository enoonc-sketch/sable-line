// Shared hitscan: one Raycaster and preallocated vectors serve the player's shots,
// the bots' shots and the grenade line-of-sight check, so a hit means the same thing
// no matter who fired. Damage is armour-aware: armour absorbs half of a hit until
// it breaks, then health takes it all.
import * as THREE from 'three';

const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();
const direction = new THREE.Vector3();

export function createCombat(shootables) {
  let targets = shootables;

  function setShootables(list) {
    targets = list;
  }
  // Fire one hitscan ray. Returns null, or the first hit with the fighter it struck.
  function fire(from, dir, range) {
    origin.copy(from);
    direction.copy(dir).normalize();
    raycaster.set(origin, direction);
    raycaster.far = range;
    const hits = raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return null;
    const hit = hits[0];
    const fighter = hit.object.userData.fighter || null;
    // A shot is rare (never every frame), so the hit copies its vectors out: the
    // caller keeps them as long as it likes.
    return {
      point: hit.point.clone(),
      normal: hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0),
      distance: hit.distance,
      part: hit.object.userData.part || 'world',
      fighter,
    };
  }

  // Apply damage to a fighter ({ health, armor, alive }). Returns the damage dealt
  // and whether the hit killed.
  function damage(fighter, amount) {
    if (!fighter || !fighter.alive) return { dealt: 0, killed: false };
    let remaining = amount;
    if (fighter.armor > 0) {
      const absorbed = Math.min(fighter.armor, remaining * 0.5);
      fighter.armor -= absorbed;
      remaining -= absorbed;
    }
    fighter.health -= remaining;
    const killed = fighter.health <= 0;
    if (killed) {
      fighter.health = 0;
      fighter.alive = false;
    }
    return { dealt: amount, killed };
  }

  return { fire, damage, setShootables };
}
