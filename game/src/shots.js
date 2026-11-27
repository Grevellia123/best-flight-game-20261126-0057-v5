// TALON STRIKE — staged screenshot poses (?shot=cover|combat|lock|victory) and the
// autopilot hook the verifier uses. Poses are built from the game's own state;
// nothing here draws a fake scene.
import { CFG } from './config.js';
import { createWorld, startSortie, stepWorld, autopilotInput } from './world.js';

// Sun-facing yaw: the golden-hour sun sits south-east (sunDir 0.55, 0.42,
// 0.72), so the staged poses face it — the sun, its bloom and the god
// rays are in frame. Gameplay is unaffected (staging only).
const SUN_YAW = -2.49;

// Rotate a player-relative offset (dx lateral, dz ahead-negative) into
// world space for a player yaw, so staged poses keep the same composition
// relative to the jet while facing the sun.
function relToWorld(px, pz, yaw, dx, dz) {
  const a = -dz, l = dx;
  return [px + (-Math.sin(yaw) * a + Math.cos(yaw) * l),
    pz + (-Math.cos(yaw) * a - Math.sin(yaw) * l)];
}

export function stageShot(world, name) {
  // NOTE: startSortie() replaces world.player with a fresh object, so the
  // player reference must be re-fetched after each startSortie call.
  let p = world.player;
  if (name === 'cover') {
    // Title screen: jet cruising low over the river valley at golden hour.
    world.screen = 'title';
    p.x = -200; p.y = 480; p.z = 600;
    p.yaw = 0.35; p.pitch = 0.02; p.roll = 0.12;
    p.speed = 170; p.throttle = 0.62;
    // Frozen title orbit angle a = time * 0.12: 184.2 keeps a ≈ 3.25 rad
    // (camera south-east of the jet, looking north-west at the sun) while
    // sin(time * 0.3) ≈ -0.96 drops the orbit camera to its lowest height,
    // tilting the view up just enough to bring the sun in-frame (a plain
    // 27.1 has the same azimuth but the camera 3m higher, and the sun
    // sits 7% above the top edge).
    world.time = 184.2;
    return { camMode: 'chase', freeze: true, steps: 0 };
  }
  if (name === 'combat') {
    startSortie(world);
    p = world.player;
    // Jump straight into wave 1 with hostiles ahead and guns firing.
    world.waveState = 'active';
    world.wave = 1;
    // Player pose FIRST — the bandits are placed relative to it.
    p.x = 0; p.y = 520; p.z = 400; p.yaw = SUN_YAW; p.pitch = 0.02; p.speed = 210;
    const mk = (dx, dy, dz, name) => {
      const [ex, ez] = relToWorld(p.x, p.z, SUN_YAW, dx, dz);
      return {
        id: 900 + Math.random() * 100, name, ace: false,
        x: ex, y: p.y + dy, z: ez,
        yaw: SUN_YAW, pitch: 0, roll: 0.15, speed: 190, hp: 100,
      // 'extend' keeps them flying straight away from the player so they
      // stay ahead in frame (hunt mode turns them back towards the camera).
      mode: 'extend', modeT: 5, fireCd: 3, burstLeft: 0, burstT: 0, evadeT: 0, dead: false,
      };
    };
    world.enemies = [
      mk(-140, 50, -520, 'VULTURE-1'),
      mk(90, -30, -480, 'COBRA-1'),
      mk(260, 70, -700, 'RAVEN-1'),
    ];
    // A short straight run with the guns firing, so tracers are in the air
    // and the bandits stay ahead in frame.
    for (let i = 0; i < 40; i++) {
      stepWorld(world, { pitch: 0, roll: 0, throttle: 0.7, gun: i > 15, missile: false }, 1 / 60);
    }
    return { camMode: 'chase', freeze: true, steps: 0 };
  }
  if (name === 'lock') {
    startSortie(world);
    p = world.player;
    world.waveState = 'active';
    world.wave = 1;
    p.x = 0; p.y = 540; p.z = 400; p.yaw = SUN_YAW; p.pitch = 0.02; p.speed = 200;
    const [ex, ez] = relToWorld(p.x, p.z, SUN_YAW, 40, -520);
    const e = {
      id: 901, name: 'VULTURE-1', ace: false,
      x: ex, y: 560, z: ez,
      yaw: Math.PI, pitch: 0, roll: -0.2, speed: 190, hp: 100,
      mode: 'hunt', modeT: 0, fireCd: 3, burstLeft: 0, burstT: 0, evadeT: 0, dead: false,
    };
    world.enemies = [e];
    // NOTE: set the lock only AFTER the settle steps — a lock in place during
    // the steps makes the bandit evade away from the player (it ended 893m
    // out on the first staging pass).
    for (let i = 0; i < 30; i++) stepWorld(world, { pitch: 0, roll: 0, throttle: 0.7, gun: false, missile: false }, 1 / 60);
    world.lockTarget = e;
    world.lockProgress = 1;
    return { camMode: 'cockpit', freeze: true, steps: 0 };
  }
  if (name === 'victory') {
    startSortie(world);
    p = world.player;
    world.wave = 5;
    world.waveState = 'done';
    world.score = 2840;
    world.kills = 25;
    world.shotsFired = 410;
    world.shotsHit = 233;
    world.screen = 'win';
    world.win = true;
    world.stats.startTime = 0;
    world.stats.endTime = 263;
    p.x = 0; p.y = 620; p.z = 200; p.yaw = SUN_YAW; p.speed = 180;
    return { camMode: 'chase', freeze: true, steps: 0 };
  }
  return { camMode: 'chase', freeze: false, steps: 0 };
}

export { createWorld, startSortie, autopilotInput, CFG };
