// Shared collision: one axis-separated AABB test against the world's colliders.
// The player (player.js) and the bots (bots.js) both move through this, so a wall
// behaves the same for everyone. Bots stay on the floor plane; only the horizontal
// axes are resolved here, which is all a waypoint walker needs.
import * as THREE from 'three';

const RADIUS = 0.34;

export function createColliderTester(colliders) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, height, lift = 0) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }
  // Move a standing body (feet at y, height tall) by vx/vz for dt, sliding along walls.
  // Returns the velocity actually achieved, so a blocked bot knows it is stuck.
  function moveHorizontal(position, height, vx, vz, dt) {
    const nextX = position.x + vx * dt;
    let outX = vx;
    if (!overlaps(nextX, position.y, position.z, height, 0.04)) position.x = nextX;
    else outX = 0;
    const nextZ = position.z + vz * dt;
    let outZ = vz;
    if (!overlaps(position.x, position.y, nextZ, height, 0.04)) position.z = nextZ;
    else outZ = 0;
    return { x: outX, z: outZ };
  }
  return { overlaps, moveHorizontal };
}
