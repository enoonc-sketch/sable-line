// The map: Yard 7, a dusk industrial yard, 48 x 36 m, flat so every fight is about
// angles, not height. Three lanes run north: A-long down the west wall, mid through
// a double door, B-link down the east wall. Site A sits in the warehouse corner,
// site B in the depot corner. Every box is a collider for bodies and a surface a
// bullet stops on. Plain geometry only, no models and no textures from disk: the
// ground markings are painted on a canvas at boot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SITE_RADIUS = 4.6;

function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3f47';
  ctx.fillRect(0, 0, 1024, 768);
  // Asphalt speckle.
  for (let i = 0; i < 9000; i += 1) {
    const shade = 52 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 8})`;
    ctx.fillRect(Math.random() * 1024, Math.random() * 768, 2, 2);
  }
  // Lane guides.
  ctx.strokeStyle = 'rgba(240,168,48,0.55)';
  ctx.lineWidth = 5;
  ctx.setLineDash([26, 20]);
  ctx.beginPath();
  ctx.moveTo(90, 740);
  ctx.lineTo(90, 60);
  ctx.moveTo(512, 740);
  ctx.lineTo(512, 60);
  ctx.moveTo(934, 740);
  ctx.lineTo(934, 60);
  ctx.stroke();
  ctx.setLineDash([]);
  // Site letters painted on the ground.
  ctx.fillStyle = 'rgba(240,168,48,0.75)';
  ctx.font = 'bold 150px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('A', 150, 120);
  ctx.fillText('B', 874, 120);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function letterSprite(letter) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f0a830';
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.2, 2.2, 1);
  return sprite;
}

// Waypoints: the graph bots walk. Nodes are open ground; edges are straight lines a
// bot can walk without crossing a wall. BFS over this graph gives every route.
const WAYPOINTS = {
  nodes: {
    spawnS: [0, 15], spawnW: [-4, 15.5], spawnE: [4, 15.5],
    aLong1: [-20, 11], aLong2: [-20, 3], aLong3: [-20, -5],
    mid1: [0, 10], mid2: [0, 4], mid3: [0, -9], midTop: [0, -12],
    bLink1: [20, 11], bLink2: [20, 3], bLink3: [20, -5],
    westCut: [-15, 9], eastCut: [15, 9], westMid: [-9, -3], eastMid: [9, -3],
    siteA: [-18, -13], siteA2: [-13, -14], siteA3: [-20, -9],
    siteB: [18, -13], siteB2: [13, -14], siteB3: [20, -9],
    holdA: [-17, -14], holdA2: [-13, -9], holdB: [17, -14], holdMid: [3, -9],
  },
  edges: {
    spawnS: ['spawnW', 'spawnE', 'mid1'],
    spawnW: ['spawnS', 'aLong1', 'westCut'],
    spawnE: ['spawnS', 'bLink1', 'eastCut'],
    aLong1: ['spawnW', 'aLong2', 'westCut'],
    aLong2: ['aLong1', 'aLong3', 'westMid'],
    aLong3: ['aLong2', 'siteA3', 'westMid'],
    mid1: ['spawnS', 'mid2', 'westCut', 'eastCut'],
    mid2: ['mid1', 'mid3'],
    mid3: ['mid2', 'midTop', 'westMid', 'eastMid'],
    midTop: ['mid3', 'siteA2', 'siteB2'],
    bLink1: ['spawnE', 'bLink2', 'eastCut'],
    bLink2: ['bLink1', 'bLink3', 'eastMid'],
    bLink3: ['bLink2', 'siteB3', 'eastMid'],
    westCut: ['spawnW', 'aLong1', 'mid1'],
    eastCut: ['spawnE', 'bLink1', 'mid1'],
    westMid: ['aLong2', 'aLong3', 'mid3', 'siteA3'],
    eastMid: ['bLink2', 'bLink3', 'mid3', 'siteB3'],
    siteA: ['siteA2', 'siteA3'],
    siteA2: ['siteA', 'midTop', 'siteA3'],
    siteA3: ['siteA', 'siteA2', 'aLong3', 'westMid'],
    siteB: ['siteB2', 'siteB3'],
    siteB2: ['siteB', 'midTop', 'siteB3'],
    siteB3: ['siteB', 'siteB2', 'bLink3', 'eastMid'],
    holdA: ['siteA', 'siteA2'],
    holdA2: ['siteA2', 'siteA3'],
    holdB: ['siteB', 'siteB2'],
    holdMid: ['midTop', 'mid3'],
  },
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0.02 });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function barrel(x, z, material = 'containerC') {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.15, 14), materials[material]);
    mesh.position.set(x, 0.575, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.42, 0, z - 0.42), new THREE.Vector3(x + 0.42, 1.15, z + 0.42)));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and the outer walls: 48 x 36 m, 4.6 m high, open to the dusk sky.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(48.4, 0.4, 36.4), groundMaterial);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3().setFromObject(floor));
  shootables.push(floor);
  box(0.4, 4.6, 36.4, -24.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 36.4, 24.2, 2.3, 0, 'surface');
  box(48.4, 4.6, 0.4, 0, 2.3, -18.2, 'surface');
  box(48.4, 4.6, 0.4, 0, 2.3, 18.2, 'surface');

  // Mid double door: two wall stubs leave a 4 m choke at the centre.
  box(10, 3.4, 0.8, -7, 1.7, 2, 'hairline');
  box(10, 3.4, 0.8, 7, 1.7, 2, 'hairline');
  box(7, 3.4, 0.8, -8.5, 1.7, -7, 'hairline');
  box(7, 3.4, 0.8, 8.5, 1.7, -7, 'hairline');

  // Shipping containers: the map's big cover, in three paint colours.
  box(6, 2.6, 2.4, -14, 1.3, 6.5, 'containerA');
  box(6, 2.6, 2.4, 14, 1.3, 6.5, 'containerB');
  box(2.4, 2.6, 6, -22, 1.3, -4, 'containerB');
  box(2.4, 2.6, 6, 22, 1.3, -4, 'containerC');
  box(5, 2.6, 2.4, -8, 1.3, -15.8, 'containerC');
  box(5, 2.6, 2.4, 8, 1.3, -15.8, 'containerA');

  // Crates to crouch behind, on every lane.
  box(1.4, 1.1, 1.4, -17, 0.55, 7, 'hairline');
  box(1.4, 1.1, 1.4, 17, 0.55, 7, 'hairline');
  box(1.4, 1.1, 1.4, -4.5, 0.55, -2.5, 'hairline');
  box(1.4, 1.1, 1.4, 4.5, 0.55, -2.5, 'hairline');
  box(2.2, 1.0, 1.2, -15, 0.5, 14, 'hairline');
  box(2.2, 1.0, 1.2, 15, 0.5, 14, 'hairline');

  // Barrels near the spawns and the sites.
  barrel(-8, 15.5);
  barrel(-7.2, 16.2, 'containerB');
  barrel(8, 15.5);
  barrel(7.2, 16.2, 'containerA');
  barrel(-21, -15.5, 'containerB');
  barrel(21, -15.5, 'containerA');
  barrel(-2.5, -15.5);
  barrel(2.5, -15.5, 'containerB');

  // Site frames: a low glowing border so each bombsite reads at a glance.
  const siteLetters = [];
  const siteMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 });
  for (const [cx, cz] of [[-18, -13], [18, -13]]) {
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(SITE_RADIUS * 2, SITE_RADIUS * 2), siteMaterial);
    frame.rotation.x = -Math.PI / 2;
    frame.position.set(cx, 0.02, cz);
    frame.material = siteMaterial.clone();
    frame.material.opacity = 0.12;
    group.add(frame);
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(SITE_RADIUS - 0.12, SITE_RADIUS, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(cx, 0.03, cz);
    group.add(edge);
    const letter = letterSprite(cx < 0 ? 'A' : 'B');
    letter.position.set(cx, 3.2, cz);
    group.add(letter);
    siteLetters.push(letter);
  }

  // Light: a low amber sun from the west, a cool dusk fill, and a sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8fa3c7'), new THREE.Color(PALETTE.canvas), 0.85);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color('#ffb35c'), 2.4);
  key.position.set(-18, 16, 12);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color('#7d92b8'), 0.5);
  fill.position.set(14, 10, 14);
  scene.add(fill);

  const siteGlowA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 16);
  siteGlowA.position.set(-18, 3.5, -13);
  scene.add(siteGlowA);
  const siteGlowB = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 16);
  siteGlowB.position.set(18, 3.5, -13);
  scene.add(siteGlowB);

  return {
    colliders,
    shootables,
    group,
    siteLetters,
    sites: {
      A: { center: new THREE.Vector3(-18, 0, -13), radius: SITE_RADIUS },
      B: { center: new THREE.Vector3(18, 0, -13), radius: SITE_RADIUS },
    },
    spawns: {
      attackers: [
        new THREE.Vector3(0, 0, 15),
        new THREE.Vector3(-3, 0, 15.5),
        new THREE.Vector3(3, 0, 15.5),
      ],
      defenders: [
        new THREE.Vector3(-17, 0, -14),
        new THREE.Vector3(-13, 0, -9),
        new THREE.Vector3(17, 0, -14),
        new THREE.Vector3(3, 0, -9),
      ],
    },
    waypoints: WAYPOINTS,
  };
}
