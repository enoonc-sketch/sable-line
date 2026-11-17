// Navigation: BFS routes over the waypoint graph, and line-of-sight tests.
// One Raycaster is reused for every sight check; the temporary vectors are module
// level, so a sight check allocates nothing.
import * as THREE from 'three';

const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();
const direction = new THREE.Vector3();
const target = new THREE.Vector3();
const segmentPoint = new THREE.Vector3();

export function createNav(waypoints, shootables) {
  const nodes = waypoints.nodes;
  const edges = waypoints.edges;

  function nearestNode(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const [id, [nx, nz]] of Object.entries(nodes)) {
      const d = (nx - x) * (nx - x) + (nz - z) * (nz - z);
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    return best;
  }

  // BFS route from (x, z) to the node nearest (tx, tz); returns world points.
  function route(x, z, tx, tz) {
    const start = nearestNode(x, z);
    const goal = nearestNode(tx, tz);
    if (start === goal) return [[tx, tz]];
    const previous = { [start]: null };
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === goal) break;
      for (const next of edges[current] || []) {
        if (!(next in previous)) {
          previous[next] = current;
          queue.push(next);
        }
      }
    }
    if (!(goal in previous)) return [[tx, tz]];
    const path = [];
    let node = goal;
    while (node !== null) {
      path.unshift(node);
      node = previous[node];
    }
    const points = path.slice(1).map((id) => nodes[id]);
    points.push([tx, tz]);
    return points;
  }

  // True when nothing solid stands between two eye points.
  function hasSight(ax, ay, az, bx, by, bz) {
    origin.set(ax, ay, az);
    target.set(bx, by, bz);
    direction.subVectors(target, origin);
    const distance = direction.length();
    if (distance < 0.01) return true;
    direction.multiplyScalar(1 / distance);
    raycaster.set(origin, direction);
    raycaster.far = distance;
    return raycaster.intersectObjects(shootables, false).length === 0;
  }

  // True when the segment from a to b passes through any smoke sphere.
  function blockedBySmoke(ax, ay, az, bx, by, bz, smokes) {
    for (const smoke of smokes) {
      // Closest point on the segment to the smoke centre, in 3D.
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const lenSq = abx * abx + aby * aby + abz * abz;
      if (lenSq === 0) continue;
      let t = ((smoke.x - ax) * abx + (smoke.y - ay) * aby + (smoke.z - az) * abz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      segmentPoint.set(ax + abx * t, ay + aby * t, az + abz * t);
      const dx = segmentPoint.x - smoke.x;
      const dy = segmentPoint.y - smoke.y;
      const dz = segmentPoint.z - smoke.z;
      if (dx * dx + dy * dy + dz * dz < smoke.radius * smoke.radius) return true;
    }
    return false;
  }

  return { nearestNode, route, hasSight, blockedBySmoke };
}
