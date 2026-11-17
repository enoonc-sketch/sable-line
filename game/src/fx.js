// Pooled effects: tracers and impact sparks. Every mesh is allocated once at boot
// and reused, so a firefight makes no new objects in the hot loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 8;
const TRACER_LIFE = 0.09;
const SPARK_LIFE = 0.35;

export function createFx(scene) {
  const tracerMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(PALETTE.accent),
    transparent: true,
    opacity: 0.9,
  });
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, tracerMaterial);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  const sparkMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.accent),
    size: 0.09,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 10), 3));
    const points = new THREE.Points(geometry, sparkMaterial);
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, life: 0, velocity: new Float32Array(3 * 10) });
  }
  let sparkNext = 0;
  const tmp = new THREE.Vector3();

  function tracer(from, to) {
    const entry = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_COUNT;
    const attr = entry.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    entry.line.visible = true;
    entry.life = TRACER_LIFE;
  }

  function spark(at, normal) {
    const entry = sparks[sparkNext];
    sparkNext = (sparkNext + 1) % SPARK_COUNT;
    const attr = entry.points.geometry.getAttribute('position');
    for (let i = 0; i < 10; i += 1) {
      attr.setXYZ(i, at.x, at.y, at.z);
      const spread = 0.6 + Math.random() * 1.6;
      entry.velocity[i * 3] = normal.x * 1.4 + (Math.random() - 0.5) * spread;
      entry.velocity[i * 3 + 1] = Math.abs(normal.y) * 1.2 + Math.random() * 1.8;
      entry.velocity[i * 3 + 2] = normal.z * 1.4 + (Math.random() - 0.5) * spread;
    }
    attr.needsUpdate = true;
    entry.points.visible = true;
    entry.life = SPARK_LIFE;
  }

  function step(dt) {
    for (const entry of tracers) {
      if (entry.life <= 0) continue;
      entry.life -= dt;
      if (entry.life <= 0) entry.line.visible = false;
    }
    for (const entry of sparks) {
      if (entry.life <= 0) continue;
      entry.life -= dt;
      if (entry.life <= 0) {
        entry.points.visible = false;
        continue;
      }
      const attr = entry.points.geometry.getAttribute('position');
      for (let i = 0; i < 10; i += 1) {
        entry.velocity[i * 3 + 1] -= 9 * dt;
        attr.setXYZ(
          i,
          attr.getX(i) + entry.velocity[i * 3] * dt,
          Math.max(0.02, attr.getY(i) + entry.velocity[i * 3 + 1] * dt),
          attr.getZ(i) + entry.velocity[i * 3 + 2] * dt,
        );
      }
      attr.needsUpdate = true;
      tmp.set(0, 0, 0);
    }
  }

  return { tracer, spark, step };
}
