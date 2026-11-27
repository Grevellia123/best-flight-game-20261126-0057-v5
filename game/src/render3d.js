// TALON STRIKE — Three.js scene. Builds the world once, then syncs it from the
// pure-logic state in world.js every frame. Original art, all procedural.
import * as THREE from 'three';
import { CFG } from './config.js';
import { terrainHeight, riverZ } from './world.js';
import { mulberry32, fbm2, clamp, lerp } from './random.js';
import { createPost } from './post.js';

const MAX_TRACERS = 96;
const MAX_MISSILES = 6;
const TRAIL_POINTS = 14;

// Scratch vectors for the per-frame sun projection and camera targets
// (no allocation in sync / project — per-frame Vector3 churn is a GC
// hitch source on low-end phones).
const _toSun = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _desiredPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _right = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _projMat = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 30 + Math.random() * 196, y = 45 + Math.random() * 38;
    const r = 18 + Math.random() * 34;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,200,120,1)');
  grad.addColorStop(0.4, 'rgba(255,140,60,0.55)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Moon glow: the same radial falloff as the sun's glow, but cool
// white-blue. The moon was reusing the sun's warm orange glowTexture,
// and the sprite colour only multiplies the texture — so even tinted
// blue the moon still glowed orange like a second sun. The moon gets
// its own texture, swapped in by setNightMode.
function moonTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(235,242,255,1)');
  grad.addColorStop(0.35, 'rgba(190,210,245,0.55)');
  grad.addColorStop(1, 'rgba(150,180,230,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// A fighter jet built from primitives, nose pointing along local -z.
function buildJet({ body, accent, canopy, scale = 1 }) {
  const g = new THREE.Group();
  const matBody = new THREE.MeshStandardMaterial({ color: body, metalness: 0.55, roughness: 0.4 });
  const matAccent = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.4, roughness: 0.45 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.6, roughness: 0.5 });
  const matGlass = new THREE.MeshStandardMaterial({ color: canopy, metalness: 0.9, roughness: 0.12 });

  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 7.2, 10), matBody);
  fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.15, 3.4, 10), matBody);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -5.3; g.add(nose);
  const noseTip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 8), matAccent);
  noseTip.rotation.x = -Math.PI / 2; noseTip.position.z = -7.4; g.add(noseTip);
  // Delta wing: one swept slab.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -4.6); wingShape.lineTo(5.6, 1.4); wingShape.lineTo(5.6, 2.6);
  wingShape.lineTo(1.2, 2.6); wingShape.lineTo(0, 1.2); wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.28, bevelEnabled: false });
  const wingR = new THREE.Mesh(wingGeo, matBody);
  wingR.rotation.x = -Math.PI / 2; wingR.position.y = -0.1; g.add(wingR);
  const wingL = new THREE.Mesh(wingGeo, matBody);
  wingL.rotation.x = -Math.PI / 2; wingL.scale.x = -1;
  wingL.position.y = -0.1; g.add(wingL);
  // Wing-tip accent.
  const tipGeo = new THREE.BoxGeometry(0.22, 0.2, 2.2);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(tipGeo, matAccent);
    tip.position.set(s * 5.5, -0.05, 1.6); tip.rotation.y = s * 0.35; g.add(tip);
  }
  // Twin tail fins, canted out.
  const finGeo = new THREE.BoxGeometry(0.22, 2.6, 2.4);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, matBody);
    fin.position.set(s * 1.5, 1.5, 3.4); fin.rotation.z = -s * 0.35; fin.rotation.y = s * 0.25; g.add(fin);
    const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 1.6), matAccent);
    finTip.position.set(s * 1.95, 2.6, 3.4); finTip.rotation.z = -s * 0.35; g.add(finTip);
  }
  // Bubble canopy.
  const can = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), matGlass);
  can.scale.set(0.85, 0.75, 1.9); can.position.set(0, 0.95, -1.6); g.add(can);
  // Belly intake + exhaust.
  const intake = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 2.6), matDark);
  intake.position.set(0, -1.0, 0.6); g.add(intake);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 1.2, 10), matDark);
  nozzle.rotation.x = Math.PI / 2; nozzle.position.z = 4.1; g.add(nozzle);
  // Cheatline stripe.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.22, 6.4), matAccent);
  stripe.position.set(0, 0.35, -0.6); g.add(stripe);
  // Afterburner flame (scaled by throttle in sync). Colour > 1 so the
  // flame is HDR and passes the bloom threshold (see post.js).
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9 });
  flameMat.color.multiplyScalar(1.6);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.85, 3.6, 10),
    flameMat,
  );
  flame.rotation.x = Math.PI / 2; flame.position.z = 6.2;
  flame.name = 'flame';
  g.add(flame);
  const glowTex = glowTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.7, depthWrite: false }));
  glow.material.color.setRGB(1.8, 1.3, 0.8); // HDR engine glow: blooms
  glow.scale.set(5, 5, 1); glow.position.z = 5.6; glow.name = 'glow';
  g.add(glow);
  g.scale.setScalar(scale);
  return g;
}

// F-35 Lightning II, same builder style as buildJet: nose along local -z,
// same overall size (~11 m long, 11.2 m span, scale 1.35) so the chase
// camera, the hitboxes and the flame/glow the sync loop looks up by name
// all work unchanged. What makes it an F-35: a wider faceted fuselage
// (8-segment cylinder, stealth flat panels), a trapezoidal wing with a
// straight trailing edge instead of the Talon's delta, tails canted
// further out, a flush canopy and side DSI intake bumps instead of a
// belly intake.
function buildF35({ body, accent, canopy, scale = 1 }) {
  const g = new THREE.Group();
  const matBody = new THREE.MeshStandardMaterial({ color: body, metalness: 0.55, roughness: 0.45 });
  const matAccent = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.4, roughness: 0.5 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.6, roughness: 0.5 });
  const matGlass = new THREE.MeshStandardMaterial({ color: canopy, metalness: 0.9, roughness: 0.12 });

  // Faceted fuselage: 8 segments read as stealth flat panels.
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 7.2, 8), matBody);
  fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3.4, 8), matBody);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -5.3; g.add(nose);
  // Trapezoidal wing: swept leading edge, straight trailing edge.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 2.2); wingShape.lineTo(5.6, -0.6); wingShape.lineTo(5.6, -2.0);
  wingShape.lineTo(0, -2.0); wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.28, bevelEnabled: false });
  const wingR = new THREE.Mesh(wingGeo, matBody);
  wingR.rotation.x = -Math.PI / 2; wingR.position.y = -0.1; g.add(wingR);
  const wingL = new THREE.Mesh(wingGeo, matBody);
  wingL.rotation.x = -Math.PI / 2; wingL.scale.x = -1;
  wingL.position.y = -0.1; g.add(wingL);
  // Twin tails, canted further out than the Talon's (~35 deg).
  const finGeo = new THREE.BoxGeometry(0.22, 2.2, 2.0);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, matBody);
    fin.position.set(s * 1.6, 1.4, 3.6); fin.rotation.z = -s * 0.6; fin.rotation.y = s * 0.25; g.add(fin);
    const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.6, 1.4), matAccent);
    finTip.position.set(s * 2.05, 2.3, 3.6); finTip.rotation.z = -s * 0.6; g.add(finTip);
  }
  // Flush canopy, lower than the Talon's bubble.
  const can = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), matGlass);
  can.scale.set(0.9, 0.55, 1.8); can.position.set(0, 0.8, -1.4); g.add(can);
  // DSI intake bumps on the fuselage sides (no belly intake on an F-35).
  const bumpGeo = new THREE.SphereGeometry(0.85, 10, 8);
  for (const s of [-1, 1]) {
    const bump = new THREE.Mesh(bumpGeo, matDark);
    bump.scale.set(0.5, 0.9, 1.5); bump.position.set(s * 1.25, -0.2, -0.6); g.add(bump);
  }
  // Single big engine nozzle.
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 1.2, 10), matDark);
  nozzle.rotation.x = Math.PI / 2; nozzle.position.z = 4.1; g.add(nozzle);
  // Afterburner flame + engine glow: same names and positions as the
  // Talon, so the sync loop's getObjectByName('flame'/'glow') just works.
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9 });
  flameMat.color.multiplyScalar(1.6);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.6, 10), flameMat);
  flame.rotation.x = Math.PI / 2; flame.position.z = 6.2;
  flame.name = 'flame';
  g.add(flame);
  const glowTex = glowTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.7, depthWrite: false }));
  glow.material.color.setRGB(1.8, 1.3, 0.8);
  glow.scale.set(5, 5, 1); glow.position.z = 5.6; glow.name = 'glow';
  g.add(glow);
  g.scale.setScalar(scale);
  return g;
}

// The player's jet: the T-7 Talon or the F-35 Lightning II.
function buildPlayerJet(model) {
  if (model === 'f35') return buildF35({ body: 0x8f979e, accent: 0x3d4450, canopy: 0x2e3d4a, scale: 1.35 });
  return buildJet({ body: 0xd8dde2, accent: 0xe8622a, canopy: 0x2f6f8f, scale: 1.35 });
}

// Terrain as 5x5 tiles instead of one 12000m mesh. One mesh's bounding
// sphere covered the whole world, so it always intersected the camera
// frustum and all 45,000 triangles were drawn every frame, even the
// hills behind the player. Tiles each get their own bounding sphere, so
// off-screen tiles are skipped — by the renderer and by the explicit
// culling pass in sync(). Same total triangles, same heights and colours
// (both are pure functions of x,z, so shared edges match exactly).
// Normals come from finite differences of terrainHeight instead of
// computeVertexNormals: a tile's edge vertices would otherwise miss
// their neighbours across the tile border and shade with a visible seam.
function buildTerrainTiles(seed) {
  const S = CFG.world.size;
  // SEG 60: 40 m between terrain vertices (was 80 m at SEG 30). The shoreline
  // and river banks are drawn by the mesh itself — each waterline segment is
  // one straight triangle edge — so at 80 m the waterline read as a sawtooth
  // that shimmered in flight. 40 m halves the tooth size. The extra 135k
  // triangles are static, vertex-coloured and mostly culled off-screen, so
  // the fill-rate cost (the real bottleneck on a phone) does not change.
  const TILES = 5, SEG = 60, TS = S / TILES;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const cGrass = new THREE.Color(0x5f9150), cGrass2 = new THREE.Color(0x7fae5e);
  const cForest = new THREE.Color(0x3f6b3a), cRock = new THREE.Color(0x8a8578);
  const cSand = new THREE.Color(0xc9b183), cSeaFloor = new THREE.Color(0x3d6b5a);
  const tmp = new THREE.Color();
  const tiles = [];
  for (let ti = 0; ti < TILES; ti++) for (let tj = 0; tj < TILES; tj++) {
    const cx = -S / 2 + (ti + 0.5) * TS, cz = -S / 2 + (tj + 0.5) * TS;
    const geo = new THREE.PlaneGeometry(TS, TS, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx, 0, cz);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const normals = new Float32Array(pos.count * 3);
    const e = 10; // finite-difference step for the normal
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const n = fbm2(x * 0.004, z * 0.004, seed + 31) * 0.5 + 0.5;
      // Sand fades into grass over h 6–14 m (smoothstep) instead of a hard
      // cut at h = 8: the beach's outer edge was a sharp colour line that
      // followed the mesh and zigzagged with it, just like the waterline.
      const sg = clamp((h - 6) / 8, 0, 1), sgs = sg * sg * (3 - 2 * sg);
      if (h < 1) tmp.copy(cSeaFloor).lerp(cSand, clamp((h + 14) / 15, 0, 1));
      else if (h < 130) tmp.copy(cSand).lerp(cGrass, sgs).lerp(cGrass2, n * sgs);
      else if (h < 210) tmp.copy(cGrass2).lerp(cForest, (h - 130) / 80);
      else tmp.copy(cForest).lerp(cRock, (h - 210) / 70);
      // River banks stay sandy — mixed in smoothly, fading with distance
      // from the channel (170–230 m) and with height (h 10–16 m), so the
      // sand stripe has no hard edge to zigzag with the mesh. The old line
      // set pure sand inside a hard 170 m / h < 12 cutoff, which drew a
      // sharp tan stripe along the river — one of the vibrating edges.
      const riverD = Math.abs(z - riverZ(x));
      const riverFade = clamp(1 - (riverD - 170) / 60, 0, 1) * (1 - clamp((h - 10) / 6, 0, 1));
      if (riverFade > 0) tmp.lerp(cSand, 0.6 * riverFade);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      // Heightfield normal: normalize(-dh/dx, 1, -dh/dz).
      const dx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
      const dz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
      const inv = 1 / Math.hypot(dx, 1, dz);
      normals[i * 3] = -dx * inv; normals[i * 3 + 1] = inv; normals[i * 3 + 2] = -dz * inv;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.computeBoundingSphere();
    tiles.push(new THREE.Mesh(geo, mat));
  }
  return tiles;
}

export function createScene(container, qualityName, aaSetting = 'auto', jetModel = 'talon') {
  // MSAA (antialias) is a big fill-rate cost on tiled mobile GPUs and the
  // bloom pass softens edges anyway — so by default (AUTO) only High
  // renders with it. The settings panel lets the player force it ON or
  // OFF on any quality. It is fixed at context creation, so a later
  // switch to High keeps the current antialias setting, and a changed
  // AA setting only takes effect when the game next loads; the step-down
  // never needs it.
  const wantAA = aaSetting === 'on' ? true : aaSetting === 'off' ? false : qualityName === 'high';
  const renderer = new THREE.WebGLRenderer({ antialias: wantAA, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.quality[qualityName].pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  // Golden-hour post: HDR bloom + god rays (post.js). Level 0 renders the
  // scene straight to screen, exactly like before.
  const post = createPost(renderer);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdcc49c, 1600, 8200);
  const camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.5, 20000);

  // Sky dome: golden-hour gradient.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3d6fb4) },
      mid: { value: new THREE.Color(0x9fc3dd) },
      low: { value: new THREE.Color(0xf6c98a) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){ float h = normalize(vP).y;
        vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(low, mid, smoothstep(-0.08, 0.12, h));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9500, 24, 16), skyMat);
  scene.add(sky);

  // Lights.
  const sunDir = new THREE.Vector3(0.55, 0.42, 0.72).normalize();
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.4);
  sun.position.copy(sunDir).multiplyScalar(100);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbcd7ff, 0x4a6741, 0.85);
  scene.add(hemi);
  // Sun disc + glow. Colour > 1: the sun is HDR so it blooms, and the
  // god-ray pass reads it out of the bloom texture.
  const glowTex = glowTexture();
  const moonTex = moonTexture();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
  sunSprite.material.color.setRGB(2.2, 1.7, 1.2);
  sunSprite.position.copy(sunDir).multiplyScalar(8800);
  sunSprite.scale.set(1400, 1400, 1);
  scene.add(sunSprite);

  // Stars for night mode: fixed points on the sky sphere, hidden by day.
  // They follow the player like the sky dome (see sync()).
  const starGeo = new THREE.BufferGeometry();
  {
    const N = 300, pos = new Float32Array(N * 3);
    const srng = mulberry32(1234);
    for (let i = 0; i < N; i++) {
      const a = srng() * Math.PI * 2, y = srng() * 0.95 + 0.05;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      pos[i * 3] = Math.cos(a) * r * 9000;
      pos[i * 3 + 1] = y * 9000;
      pos[i * 3 + 2] = Math.sin(a) * r * 9000;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe4ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
  stars.visible = false;
  scene.add(stars);

  // Terrain + water. Terrain is tiled (see buildTerrainTiles) so
  // off-screen tiles can be culled instead of drawing the whole world.
  const terrainTiles = buildTerrainTiles(7);
  terrainTiles.forEach((t) => scene.add(t));
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.world.size, CFG.world.size),
    new THREE.MeshStandardMaterial({ color: 0x2e6f8e, transparent: true, opacity: 0.88, roughness: 0.25, metalness: 0.35 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = CFG.world.seaLevel;
  scene.add(water);

  // Home runway: dark strip with edge lights, flat near the origin.
  const runway = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(46, 1, 420),
    new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.9 }),
  );
  strip.position.set(0, 7.5, 0);
  runway.add(strip);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  for (let z = -180; z <= 180; z += 60) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 26), lineMat);
    dash.position.set(0, 8.2, z);
    runway.add(dash);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x7fd4ff });
  for (const sx of [-24, 24]) for (let z = -200; z <= 200; z += 50) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 2), lightMat);
    l.position.set(sx, 8.4, z);
    runway.add(l);
  }
  scene.add(runway);

  // Clouds.
  const cloudTex = cloudTexture();
  const clouds = [];
  const rng = mulberry32(99);
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.75 + rng() * 0.2, depthWrite: false }));
    s.userData.baseOpacity = s.material.opacity; // night mode scales this down
    s.position.set((rng() - 0.5) * 11000, 950 + rng() * 500, (rng() - 0.5) * 11000);
    s.scale.set(500 + rng() * 700, 180 + rng() * 160, 1);
    s.userData.drift = 2 + rng() * 4;
    s.userData.enabled = true; // quality gate (see setQuality); sync() ANDs it with the frustum test
    scene.add(s);
    clouds.push(s);
  }

  // Player + enemy jets.
  let playerJet = buildPlayerJet(jetModel);
  scene.add(playerJet);
  const enemyJetGeo = { body: 0x70767e, accent: 0xc22a2a, canopy: 0x1c2a33, scale: 1.35 };
  const enemyMeshes = new Map();
  function enemyMesh(id) {
    let m = enemyMeshes.get(id);
    if (!m) { m = buildJet(enemyJetGeo); scene.add(m); enemyMeshes.set(id, m); }
    return m;
  }

  // Target rings (fly-through bonus).
  const rings = CFG.rings.map((r) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(48, 3.2, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.9 }),
    );
    ring.material.color.multiplyScalar(1.6); // HDR: rings glow in bloom
    ring.position.set(r.x, r.y, r.z);
    scene.add(ring);
    return ring;
  });

  // Tracers.
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(MAX_TRACERS * 2 * 3);
  const tracerCol = new Float32Array(MAX_TRACERS * 2 * 3);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  tracerGeo.setAttribute('color', new THREE.BufferAttribute(tracerCol, 3));
  const tracers = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, color: new THREE.Color(1.8, 1.8, 1.8) }));
  tracers.frustumCulled = false;
  scene.add(tracers);

  // Missiles + trails.
  const missileMeshes = [];
  for (let i = 0; i < MAX_MISSILES; i++) {
    const m = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.2, 8), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.6, roughness: 0.35 }));
    body.rotation.x = -Math.PI / 2;
    m.add(body);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(1.8, 1.35, 0.8), transparent: true, opacity: 0.8 }));
    trail.frustumCulled = false;
    m.add(trail);
    m.visible = false;
    scene.add(m);
    missileMeshes.push({ group: m, trail, history: [] });
  }

  // Explosions: pooled point bursts + flash sprites.
  const explosions = [];
  for (let i = 0; i < 10; i++) {
    const n = 42;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.0, 0.3), size: 14, transparent: true, opacity: 0, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, color: new THREE.Color(2.0, 1.4, 0.7) }));
    flash.scale.set(60, 60, 1);
    scene.add(flash);
    explosions.push({ pts, flash, t: 1e9, dirs: [] });
  }
  function triggerExplosion(x, y, z, big = false) {
    const ex = explosions.find((e) => e.t > 1) || explosions[0];
    ex.t = 0;
    ex.pts.position.set(x, y, z);
    ex.flash.position.set(x, y, z);
    ex.flash.scale.set(big ? 260 : 150, big ? 260 : 150, 1);
    ex.dirs = [];
    const r = mulberry32((Math.random() * 1e9) | 0);
    for (let i = 0; i < 42; i++) {
      const a = r() * Math.PI * 2, b = (r() - 0.5) * Math.PI;
      const sp = (big ? 90 : 55) * (0.4 + r() * 0.6);
      ex.dirs.push([Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp, Math.sin(a) * Math.cos(b) * sp]);
    }
    ex.pts.material.size = big ? 20 : 14;
  }

  // Lock ring around the locked target (a 3D torus that follows it).
  const lockRing = new THREE.Mesh(
    new THREE.TorusGeometry(22, 1.2, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.95 }),
  );
  lockRing.visible = false;
  scene.add(lockRing);

  const handle = {
    renderer, scene, camera, container,
    playerJet, enemyMeshes, enemyMesh, rings, clouds, sunSprite, lockRing,
    terrainTiles, cullStats: null,
    triggerExplosion,
    camPos: new THREE.Vector3(0, 560, 980),
    camLook: new THREE.Vector3(0, 520, 0),
    quality: qualityName,
    postLevel: CFG.quality[qualityName].post,
    post,
  };

  // Post level is separate from render quality so the FPS step-down can
  // shed the bloom/god-rays first, before dropping resolution.
  handle.setPostLevel = (l) => {
    handle.postLevel = Math.max(0, Math.min(2, l | 0));
    post.setLevel(handle.postLevel);
  };

  handle.setQuality = (q, resetPost = true) => {
    handle.quality = q;
    const cfg = CFG.quality[q];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatio));
    clouds.forEach((c, i) => { c.userData.enabled = i < cfg.clouds; c.visible = c.userData.enabled; });
    if (resetPost) handle.setPostLevel(cfg.post);
    handle.resize();
  };

  // Night mode: dark sky, stars, moonlight. Applied live — no reload.
  // The sun sprite becomes the moon (smaller, pale, dimmer); the
  // directional light drops to a cool moonlight and the hemisphere
  // light dims, so the terrain and sea go dark on their own. Clouds
  // go faint and dark. Day values are the ones set at creation above.
  const DAY = {
    sky: [0x3d6fb4, 0x9fc3dd, 0xf6c98a], fog: 0xdcc49c,
    sun: [0xffe2b0, 2.4], hemi: [0xbcd7ff, 0x4a6741, 0.85],
    moon: [2.2, 1.7, 1.2], moonScale: 1400, moonOpacity: 0.95,
    cloudOpacity: 1, cloudColor: 0xffffff,
  };
  const NIGHT = {
    sky: [0x050914, 0x0a1a33, 0x131c2e], fog: 0x070d1a,
    sun: [0x8fb4ff, 0.7], hemi: [0x2a3f5f, 0x0d1a12, 0.35],
    moon: [1.0, 1.1, 1.3], moonScale: 520, moonOpacity: 0.9,
    cloudOpacity: 0.3, cloudColor: 0x5a6f8a,
  };
  handle.night = false;
  handle.setNightMode = (on) => {
    handle.night = !!on;
    const m = on ? NIGHT : DAY;
    skyMat.uniforms.top.value.setHex(m.sky[0]);
    skyMat.uniforms.mid.value.setHex(m.sky[1]);
    skyMat.uniforms.low.value.setHex(m.sky[2]);
    scene.fog.color.setHex(m.fog);
    sun.color.setHex(m.sun[0]); sun.intensity = m.sun[1];
    hemi.color.setHex(m.hemi[0]); hemi.groundColor.setHex(m.hemi[1]); hemi.intensity = m.hemi[2];
    sunSprite.material.color.setRGB(m.moon[0], m.moon[1], m.moon[2]);
    // The moon gets its own cool texture — the sun's glow is warm orange
    // and tinting it could never make it look like a moon.
    sunSprite.material.map = on ? moonTex : glowTex;
    sunSprite.material.needsUpdate = true;
    sunSprite.scale.set(m.moonScale, m.moonScale, 1);
    sunSprite.material.opacity = m.moonOpacity;
    clouds.forEach((c) => { c.material.opacity = c.userData.baseOpacity * m.cloudOpacity; c.material.color.setHex(m.cloudColor); });
    stars.visible = on;
  };

  // Swap the player's jet live (title-screen JET button) — no reload.
  // The old group's geometries/materials are disposed: a swap that leaked
  // a few GPU objects each tap would add up over a session. sync() reads
  // playerJet from this closure, so it picks up the new group next frame.
  handle.setPlayerJet = (model) => {
    const next = buildPlayerJet(model);
    scene.remove(playerJet);
    playerJet.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    scene.add(next);
    playerJet = next;
    handle.playerJet = next;
  };

  // Project a world point to CSS pixels in the container (for the HUD overlay).
  handle.project = (x, y, z) => {
    const v = _proj.set(x, y, z);
    const dist = v.distanceTo(camera.position);
    v.project(camera);
    if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * container.clientWidth,
      y: (-v.y * 0.5 + 0.5) * container.clientHeight,
      dist, visible: true,
    };
  };

  handle.resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.resize();
  };

  // snap: staged screenshots (?shot=) jump the camera straight to the
  // posed position on the first sync instead of lerping in from the
  // initial view — at SwiftShader frame rates the lerp takes ~25 frames
  // to converge, so unsnapped shots catch the camera mid-swing. Real
  // play never passes snap, so the fly-in is unchanged.
  handle.sync = (world, dt, camMode, time, snap = false) => {
    const p = world.player;
    // Player jet pose.
    playerJet.position.set(p.x, p.y, p.z);
    playerJet.rotation.order = 'YXZ';
    playerJet.rotation.y = p.yaw;
    playerJet.rotation.x = p.pitch;
    playerJet.rotation.z = -p.roll;
    const flame = playerJet.getObjectByName('flame');
    const glow = playerJet.getObjectByName('glow');
    const burn = world.screen === 'play' ? 0.25 + p.throttle * 0.75 : 0.3;
    flame.scale.set(1, 1, burn * (0.9 + Math.random() * 0.25));
    flame.visible = world.screen !== 'over';
    glow.material.opacity = 0.35 + burn * 0.4;
    playerJet.visible = camMode !== 'cockpit' || world.screen === 'title';

    // Enemies.
    const seen = new Set();
    for (const e of world.enemies) {
      seen.add(e.id);
      const m = enemyMesh(e.id);
      m.position.set(e.x, e.y, e.z);
      m.rotation.order = 'YXZ';
      m.rotation.y = e.yaw;
      m.rotation.x = e.pitch;
      m.rotation.z = -e.roll;
      const f = m.getObjectByName('flame');
      if (f) { f.scale.set(1, 1, 0.5); f.visible = true; }
      const gl = m.getObjectByName('glow');
      if (gl) gl.material.opacity = 0.25;
    }
    for (const [id, m] of enemyMeshes) {
      if (!seen.has(id)) { scene.remove(m); enemyMeshes.delete(id); }
    }

    // Rings: pulse + hide once passed.
    world.rings.forEach((r, i) => {
      rings[i].visible = !r.passed;
      const s = 1 + Math.sin(time * 2.2 + i) * 0.06;
      rings[i].scale.setScalar(s);
      rings[i].material.opacity = 0.65 + Math.sin(time * 2.2 + i) * 0.25;
    });

    // Tracers.
    let ti = 0;
    for (const b of world.bullets) {
      if (ti >= MAX_TRACERS) break;
      const o = ti * 6;
      tracerPos[o] = b.x; tracerPos[o + 1] = b.y; tracerPos[o + 2] = b.z;
      tracerPos[o + 3] = b.x - b.vx * 0.035; tracerPos[o + 4] = b.y - b.vy * 0.035; tracerPos[o + 5] = b.z - b.vz * 0.035;
      const c = b.from === 'player' ? [1, 0.85, 0.3] : [1.3, 0.35, 0.28]; // x1.8 material: both pass the bloom threshold
      tracerCol[o] = c[0]; tracerCol[o + 1] = c[1]; tracerCol[o + 2] = c[2];
      tracerCol[o + 3] = c[0]; tracerCol[o + 4] = c[1]; tracerCol[o + 5] = c[2];
      ti++;
    }
    for (let i = ti; i < MAX_TRACERS; i++) {
      const o = i * 6;
      tracerPos[o] = tracerPos[o + 1] = tracerPos[o + 2] = 0;
      tracerPos[o + 3] = tracerPos[o + 4] = tracerPos[o + 5] = 0;
    }
    tracerGeo.attributes.position.needsUpdate = true;
    tracerGeo.attributes.color.needsUpdate = true;

    // Missiles.
    missileMeshes.forEach((mm, i) => {
      const m = world.missiles[i];
      if (!m) { mm.group.visible = false; mm.history = []; return; }
      mm.group.visible = true;
      mm.group.position.set(m.x, m.y, m.z);
      const sp = Math.hypot(m.vx, m.vy, m.vz) || 1;
      mm.group.lookAt(m.x + m.vx / sp, m.y + m.vy / sp, m.z + m.vz / sp);
      mm.history.push([m.x, m.y, m.z]);
      if (mm.history.length > TRAIL_POINTS) mm.history.shift();
      const posAttr = mm.trail.geometry.attributes.position;
      for (let j = 0; j < TRAIL_POINTS; j++) {
        const h = mm.history[Math.min(j, mm.history.length - 1)] || [m.x, m.y, m.z];
        posAttr.setXYZ(j, h[0], h[1], h[2]);
      }
      posAttr.needsUpdate = true;
    });

    // Explosions.
    for (const ex of explosions) {
      if (ex.t > 1) { ex.pts.material.opacity = 0; ex.flash.material.opacity = 0; continue; }
      ex.t += dt;
      const posAttr = ex.pts.geometry.attributes.position;
      for (let i = 0; i < 42; i++) {
        const d = ex.dirs[i] || [0, 0, 0];
        posAttr.setXYZ(i, d[0] * ex.t, d[1] * ex.t - 30 * ex.t * ex.t, d[2] * ex.t);
      }
      posAttr.needsUpdate = true;
      ex.pts.material.opacity = Math.max(0, 1 - ex.t);
      ex.flash.material.opacity = Math.max(0, 0.9 - ex.t * 1.4);
      ex.flash.scale.multiplyScalar(1 + dt * 1.5);
    }

    // Lock ring follows the locked target, facing the camera.
    if (world.lockTarget && !world.lockTarget.dead && world.screen === 'play') {
      lockRing.visible = true;
      lockRing.position.set(world.lockTarget.x, world.lockTarget.y, world.lockTarget.z);
      lockRing.lookAt(camera.position);
      const locked = world.lockProgress >= 1;
      // HDR ring colours so the lock ring blooms (setHex caps at 1.0).
      if (locked) lockRing.material.color.setRGB(1.8, 0.25, 0.25);
      else lockRing.material.color.setRGB(1.8, 1.3, 0.25);
      lockRing.scale.setScalar(1 + Math.sin(time * 6) * 0.08);
    } else lockRing.visible = false;

    // Clouds drift.
    for (const c of clouds) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 5800) c.position.x = -5800;
    }
    // Sun follows the player so it never leaves the sky.
    sunSprite.position.set(p.x + sunDir.x * 8800, p.y + sunDir.y * 8800, p.z + sunDir.z * 8800);
    sky.position.set(p.x, 0, p.z);
    stars.position.set(p.x, 0, p.z);

    // Camera.
    const nose = {
      x: -Math.sin(p.yaw) * Math.cos(p.pitch),
      y: Math.sin(p.pitch),
      z: -Math.cos(p.yaw) * Math.cos(p.pitch),
    };
    const desiredPos = _desiredPos;
    const desiredLook = _desiredLook;
    if (camMode === 'cockpit') {
      desiredPos.set(p.x + nose.x * 2.5, p.y + 1.4, p.z + nose.z * 2.5);
      desiredLook.set(p.x + nose.x * 200, p.y + nose.y * 200, p.z + nose.z * 200);
      handle.camPos.copy(desiredPos);
      handle.camLook.copy(desiredLook);
    } else if (world.screen === 'title') {
      // Slow orbit around the jet for the title screen, framed so the jet
      // sits in the right third of the frame, clear of the menu on the
      // left. The look shift is scaled by the camera aspect: a fixed 20 m
      // offset puts the jet at the same place on a wide screen, but on a
      // portrait phone the frame is only ~0.45 as wide, so the same 20 m
      // pushed the jet off the right edge entirely (only a wingtip
      // showed). Scaling by aspect holds the jet at ~75% across on
      // every screen: shift = 0.5 * 34 m * tan(31 deg) * aspect.
      // The orbit radius grows on narrow screens too: in portrait the
      // jet reads ~2x wider on screen, so at 34 m its wings ran off the
      // right edge and hid behind the menu buttons. Up to ~42 m in
      // portrait pulls it back just enough to fit.
      const a = time * 0.12;
      const orbitR = 34 * (1 + 0.25 * Math.max(0, 1 - camera.aspect));
      desiredPos.set(p.x + Math.sin(a) * orbitR, p.y + 8 + Math.sin(time * 0.3) * 3, p.z + Math.cos(a) * orbitR);
      _right.set(Math.cos(a), 0, -Math.sin(a));
      const lookShift = 10.2 * camera.aspect;
      desiredLook.set(p.x - _right.x * lookShift, p.y + 4, p.z - _right.z * lookShift);
      // No lerp here: the orbit path is already smooth, and lerping
      // behind a jet cruising at 90 m/s leaves the camera ~13 m behind
      // it — that lag shoved the jet to the right edge of the frame
      // (it sat at ~95% across instead of ~75%).
      handle.camPos.copy(desiredPos);
      handle.camLook.copy(desiredLook);
    } else {
      // v5.11: chase camera 14m behind, jet further left of centre and
      // a little lower in frame. The camera dollies right of the jet's
      // line and the look point moves with it, so the view direction is
      // unchanged and the jet reads left of frame. The dolly is scaled
      // by the camera aspect so the shift is the same ~12% of frame
      // width on every screen. The jet sits lower because the camera
      // rides higher above the jet's line (4.5m instead of 3.5m, so
      // the look-down angle steepens from ~14° to ~18°). 14m puts the
      // ~15m wingspan at ~50% of frame width at 16:9; the flame tip
      // sits ~11m behind the jet, so the camera stays ~3m clear of it.
      const halfW = 14 * Math.tan(31 * Math.PI / 180) * camera.aspect;
      const dolly = 0.24 * halfW; // 12% of frame width at the jet's depth
      _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      desiredPos.set(p.x - nose.x * 14 + _right.x * dolly, p.y - nose.y * 14 + 4.5, p.z - nose.z * 14 + _right.z * dolly);
      desiredLook.set(p.x + nose.x * 80 + _right.x * dolly, p.y + nose.y * 80, p.z + nose.z * 80 + _right.z * dolly);
      if (snap) { handle.camPos.copy(desiredPos); handle.camLook.copy(desiredLook); }
      else {
        handle.camPos.lerp(desiredPos, 1 - Math.pow(0.0001, dt));
        handle.camLook.lerp(desiredLook, 1 - Math.pow(0.0001, dt));
      }
    }
    camera.position.copy(handle.camPos);
    camera.lookAt(handle.camLook);
    // Speed shake at high speed.
    if (world.screen === 'play' && p.speed > 220) {
      const s = (p.speed - 220) / 120 * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
    // Sun screen position + visibility for the god-ray pass: fade the rays
    // out as the sun leaves the frame or swings behind the camera.
    _toSun.subVectors(sunSprite.position, camera.position).normalize();
    camera.getWorldDirection(_fwd);
    const facing = _toSun.dot(_fwd);
    _ndc.copy(sunSprite.position).project(camera);
    const sunUV = { x: _ndc.x * 0.5 + 0.5, y: _ndc.y * 0.5 + 0.5 };
    const off = Math.max(Math.abs(sunUV.x - 0.5), Math.abs(sunUV.y - 0.5)) * 2;
    const sunVis = sstep(0.05, 0.35, facing) * (1 - sstep(0.7, 1.25, off));
    // ---- Frustum culling: do not render what the camera cannot see ----
    // Three.js already culls single meshes, but whole objects were still
    // drawn when off-screen: the terrain used to be one mesh (fixed by
    // tiling above), and enemy jets, rings and clouds were only culled
    // mesh-by-mesh inside the renderer. This pass hides each object
    // whose bounding sphere misses the camera frustum, so its draw calls
    // never happen. Every radius is generous (a false positive only draws
    // something already visible), so nothing can vanish while on screen.
    // Tracers, missile trails and explosions keep frustumCulled = false:
    // their geometry is rewritten in world space every frame, so a
    // cached bounding sphere would be wrong — and each is one tiny draw.
    camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_projMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const cs = { tiles: 0, tilesTotal: terrainTiles.length, enemies: 0, rings: 0, clouds: 0, sun: 0 };
    for (const t of terrainTiles) {
      _sphere.center.copy(t.geometry.boundingSphere.center);
      _sphere.radius = t.geometry.boundingSphere.radius;
      t.visible = _frustum.intersectsSphere(_sphere);
      if (t.visible) cs.tiles++;
    }
    for (const m of enemyMeshes.values()) {
      _sphere.center.copy(m.position); _sphere.radius = 16; // jet ~21m long incl. flame, scaled 1.35
      m.visible = _frustum.intersectsSphere(_sphere);
      if (m.visible) cs.enemies++;
    }
    world.rings.forEach((r, i) => {
      if (r.passed) { rings[i].visible = false; return; }
      _sphere.center.copy(rings[i].position); _sphere.radius = 60; // torus 48 + tube, pulsing
      rings[i].visible = _frustum.intersectsSphere(_sphere);
      if (rings[i].visible) cs.rings++;
    });
    for (const c of clouds) {
      if (!c.userData.enabled) { c.visible = false; continue; }
      _sphere.center.copy(c.position);
      _sphere.radius = 0.5 * Math.hypot(c.scale.x, c.scale.y); // sprite half-diagonal
      c.visible = _frustum.intersectsSphere(_sphere);
      if (c.visible) cs.clouds++;
    }
    _sphere.center.copy(sunSprite.position); _sphere.radius = 1000; // 1400px sprite, half-diagonal
    sunSprite.visible = _frustum.intersectsSphere(_sphere);
    if (sunSprite.visible) cs.sun = 1;
    if (lockRing.visible) { // only when a lock is actually showing
      _sphere.center.copy(lockRing.position); _sphere.radius = 28;
      lockRing.visible = _frustum.intersectsSphere(_sphere);
    }
    handle.cullStats = cs;
    post.render(scene, camera, sunUV, sunVis);
  };

  handle.setQuality(qualityName);
  return handle;
}
