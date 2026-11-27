// TALON STRIKE — main loop, screens, settings, verification hooks.
import { CFG } from './config.js';
import { createWorld, startSortie, stepWorld, autopilotInput, terrainHeight } from './world.js';
import { createScene } from './render3d.js';
import { drawHud } from './render.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { stageShot } from './shots.js';
import { clamp } from './random.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const AUTOPILOT = params.get('autopilot') === '1';

// ---- settings (safe storage) -----------------------------------------------
const SETTINGS_KEY = 'talon-strike-settings-v1';
const store = {
  get() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
  },
  set(v) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(v)); } catch { /* in-memory only */ }
  },
};
const saved = store.get();
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
// Low-end phones (POCO M3 class: <= 4 GB RAM, very high DPR, or <= 4
// cores) cannot hold a smooth frame rate on Medium-with-post, and the
// step-down takes seconds to react — so they start on Low. The user can
// still raise quality manually; the auto step-down then protects them.
const lowEnd = isTouch && (
  (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4) ||
  (window.devicePixelRatio || 1) >= 2.5 ||
  (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)
);
const settings = {
  quality: saved.quality || (lowEnd ? 'low' : (isTouch ? 'medium' : 'high')),
  camMode: saved.camMode || 'chase',
  muted: saved.muted === true,
};
// A saved High from an earlier session is capped to Medium on low-end
// hardware — starting on High there is exactly the jerk the user reported.
if (lowEnd && settings.quality === 'high') settings.quality = 'medium';
function saveSettings() { store.set(settings); }

// ---- world + scene -----------------------------------------------------------
const world = createWorld();
const container = $('game');
const audio = createAudio();
if (settings.muted) audio.setMuted(true);
// Prime audio on load: the (suspended) AudioContext is created and the
// MP3/SFX downloads start immediately, so the track is usually decoded
// by the time the user taps. No sound plays until a gesture resumes it.
audio.prime();
// First tap / keypress anywhere unlocks audio — including taps on the
// lobby, so the background music starts on the title screen instead of
// only when the sortie begins. unlock() is idempotent.
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

let scene;
try {
  scene = createScene(container, settings.quality);
} catch (err) {
  $('webgl-error').style.display = 'flex';
  $('webgl-error').textContent = 'WebGL is not available in this browser — TALON STRIKE needs it to fly.';
  throw err;
}

const els = {
  ias: $('ias-tape'), alt: $('alt-tape'), compass: $('compass'), radar: $('radar'),
  overlay: $('overlay'),
  waveInfo: $('wave-info'), waveSub: $('wave-sub'), msg: $('msg'),
  fuelBar: $('fuel-bar'), fuelText: $('fuel-text'),
  hullBar: $('hull-bar'), hullText: $('hull-text'),
  heatBar: $('heat-bar'), heatText: $('heat-text'),
  mslText: $('msl-text'), stallWarn: $('stall-warn'), lockText: $('lock-text'),
  btnFire: $('btn-fire'), btnMsl: $('btn-msl'),
  btnCam: $('btn-cam'), btnPause: $('btn-pause'), btnMute: $('btn-mute'),
};
const input = createInput(container, els);
if (isTouch) document.body.classList.add('touch');

let hitFlash = 0;
let frozen = false;
let shotInfo = null;

// ---- screens -----------------------------------------------------------------
const screens = { title: $('title-screen'), over: $('over-screen'), win: $('win-screen'), pause: $('pause-screen') };
function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) el.style.display = k === name ? 'flex' : 'none';
  $('hud').style.display = name === null ? 'block' : 'none';
  $('touch-controls').style.display = (name === null && isTouch) ? 'block' : 'none';
  document.body.classList.toggle('on-title', name === 'title');
}

function fillDebrief(prefix) {
  const p = world.player;
  const acc = world.shotsFired ? Math.round((world.shotsHit / world.shotsFired) * 100) : 0;
  const secs = Math.max(0, Math.round(world.stats.endTime - world.stats.startTime));
  const mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0');
  $(`${prefix}-stats`).innerHTML = [
    ['SCORE', `${world.score} CR`],
    ['KILLS', `${world.kills}`],
    ['GUN ACCURACY', `${acc}%`],
    ['WAVE REACHED', `${Math.max(1, world.wave)} / ${CFG.waves.length}`],
    ['SORTIE TIME', `${mm}:${ss}`],
    ['MISSILES LEFT', `${p.missiles}`],
  ].map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
}

function startGame() {
  audio.unlock();
  audio.click();
  startSortie(world);
  world.paused = false;
  showScreen(null);
  audio.setMood('play');
}

function toTitle() {
  audio.click();
  const w2 = createWorld();
  Object.assign(world, w2);
  world.screen = 'title';
  showScreen('title');
  audio.setMood('title');
}

function togglePause() {
  if (world.screen !== 'play') return;
  world.paused = !world.paused;
  showScreen(world.paused ? 'pause' : null);
  audio.click();
}

function toggleCam() {
  settings.camMode = settings.camMode === 'chase' ? 'cockpit' : 'chase';
  saveSettings();
  $('cockpit-frame').style.display = settings.camMode === 'cockpit' ? 'block' : 'none';
  $('btn-cam').textContent = settings.camMode === 'cockpit' ? 'CHASE' : 'COCKPIT';
  audio.click();
}

function toggleMute() {
  settings.muted = !settings.muted;
  audio.setMuted(settings.muted);
  saveSettings();
  $('btn-mute').textContent = settings.muted ? '🔇' : '🔊';
  $('mute-setting').textContent = settings.muted ? 'MUTED' : 'SOUND ON';
}

// Fullscreen: true fullscreen needs a user tap on mobile Chrome (the
// address bar cannot be hidden from code alone), so the ⛶ button in the
// top bar is the way in and out. Prefixed fallbacks for older Safari.
function toggleFullscreen() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const p = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen();
      if (p && p.catch) p.catch(() => {});
    } else {
      const el = document.documentElement;
      const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) { /* fullscreen unavailable here — ignore */ }
}
document.addEventListener('fullscreenchange', () => {
  $('btn-full').textContent = document.fullscreenElement ? '✕' : '⛶';
});

// Buttons.
$('btn-fly').addEventListener('click', startGame);
$('btn-again').addEventListener('click', startGame);
$('btn-again-win').addEventListener('click', startGame);
$('btn-title-over').addEventListener('click', toTitle);
$('btn-title-win').addEventListener('click', toTitle);
$('btn-resume').addEventListener('click', togglePause);
$('btn-restart').addEventListener('click', () => { world.paused = false; startGame(); });
$('btn-quit-title').addEventListener('click', () => { world.paused = false; toTitle(); });
$('btn-mute').addEventListener('click', () => { audio.unlock(); toggleMute(); });
$('btn-full').addEventListener('click', toggleFullscreen);
$('quality-setting').addEventListener('click', () => {
  const order = ['low', 'medium', 'high'];
  const next = order[(order.indexOf(settings.quality) + 1) % 3];
  settings.quality = next;
  saveSettings();
  scene.setQuality(next);
  $('quality-setting').textContent = `QUALITY: ${next.toUpperCase()}`;
  audio.click();
});
$('mute-setting').addEventListener('click', () => { audio.unlock(); toggleMute(); });
$('cam-setting').addEventListener('click', toggleCam);
if (settings.muted) { $('btn-mute').textContent = '🔇'; $('mute-setting').textContent = 'MUTED'; }
$('quality-setting').textContent = `QUALITY: ${settings.quality.toUpperCase()}`;
$('cam-setting').textContent = `CAMERA: ${settings.camMode.toUpperCase()}`;
$('btn-cam').textContent = settings.camMode === 'cockpit' ? 'CHASE' : 'COCKPIT';
if (settings.camMode === 'cockpit') $('cockpit-frame').style.display = 'block';

document.addEventListener('visibilitychange', () => {
  if (document.hidden && world.screen === 'play' && !world.paused) togglePause();
});
window.addEventListener('resize', () => scene.resize());

// ---- staged shots / autopilot -----------------------------------------------
if (SHOT) {
  shotInfo = stageShot(world, SHOT);
  settings.camMode = shotInfo.camMode;
  $('cockpit-frame').style.display = settings.camMode === 'cockpit' ? 'block' : 'none';
  $('btn-cam').textContent = settings.camMode === 'cockpit' ? 'CHASE' : 'COCKPIT';
  if (SHOT === 'cover') { showScreen('title'); audio.setMood('title'); }
  else if (SHOT === 'victory') { fillDebrief('win'); showScreen('win'); audio.setMood('win'); }
  else showScreen(null);
  frozen = shotInfo.freeze;
  scene.sync(world, 0, settings.camMode, world.time, true);
  scene.resize();
}
if (AUTOPILOT && !SHOT) {
  // Attract-mode autopilot for the verifier: start a sortie and fly it.
  startGame();
}

// ---- FPS meter + auto step-down ----------------------------------------------
// NOTE: fps is measured from the REAL frame delta, not the clamped dt.
let fpsAcc = 0, fpsN = 0, fpsAvg = 60, lowTime = 0;
const QUALITY_ORDER = ['low', 'medium', 'high'];
function fpsTick(realDt) {
  if (realDt <= 0) return;
  fpsAcc += 1 / realDt; fpsN++;
  if (fpsN >= 20) {
    fpsAvg = fpsAcc / fpsN;
    fpsAcc = 0; fpsN = 0;
    // Step down on the title screen too: the same 3D scene renders there,
    // so a jerky title means the device is already over budget before play.
    // Two consecutive low batches (40 frames) react in ~2-3 s instead of
    // the old 90 frames, so the user stops seeing the jerk quickly.
    if (fpsAvg < 28 && (world.screen === 'play' || world.screen === 'title')) {
      lowTime += 1;
      if (lowTime >= 2) {
        if (scene.postLevel > 0) {
          // Shed the expensive post effects (bloom / god rays) first —
          // the frame rate usually recovers without dropping resolution.
          scene.setPostLevel(scene.postLevel - 1);
        } else if (settings.quality !== 'low') {
          const idx = QUALITY_ORDER.indexOf(settings.quality);
          settings.quality = QUALITY_ORDER[idx - 1];
          saveSettings();
          scene.setQuality(settings.quality, false); // keep post off
          $('quality-setting').textContent = `QUALITY: ${settings.quality.toUpperCase()}`;
        }
        lowTime = 0;
      }
    } else lowTime = 0;
  }
}

// ---- events -------------------------------------------------------------------
function drainEvents() {
  for (const ev of world.events) {
    switch (ev.type) {
      case 'gun': audio.gun(); break;
      case 'enemyGun': audio.enemyGun(); break;
      case 'missile': audio.missile(); break;
      case 'missileHit': case 'hit': audio.hit(); hitFlash = 0.35; break;
      case 'kill':
        audio.kill();
        audio.explosion(ev.ace);
        scene.triggerExplosion(ev.x, ev.y, ev.z, ev.ace);
        addKillFeed(`${ev.ace ? '★ ' : ''}SPLASHED ${ev.name} · +${ev.points} CR`);
        break;
      case 'missileMiss': scene.triggerExplosion(ev.x, ev.y, ev.z, false); break;
      case 'terrainHit':
        audio.explosion(false);
        scene.triggerExplosion(ev.x, ev.y, ev.z, false);
        break;
      case 'playerHit': audio.warn(); break;
      case 'lockTone': audio.lockTone(); break;
      case 'lock': audio.lock(); break;
      case 'ring': audio.ring(); addKillFeed(`RING +${ev.points} CR`); break;
      case 'waveClear': audio.waveClear(); break;
      case 'wave': addKillFeed(`WAVE ${ev.wave} — ${ev.name}`); break;
      case 'over': audio.setMood('over'); fillDebrief('over'); showScreen('over'); break;
      case 'win': audio.setMood('win'); fillDebrief('win'); showScreen('win'); break;
      default: break;
    }
  }
  world.events.length = 0;
}

function addKillFeed(text) {
  const feed = $('killfeed');
  const div = document.createElement('div');
  div.className = 'feed-line';
  div.textContent = text;
  feed.prepend(div);
  while (feed.children.length > 3) feed.removeChild(feed.lastChild);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 4500);
}

// ---- main loop -----------------------------------------------------------------
let last = performance.now();
let titleAngle = 0;
// ?timescale=N (verification only): run N world substeps per rendered frame so
// a full sortie can be played through on slow software renderers. Absent = 1.
const TIMESCALE = Math.max(1, Math.min(8, Math.round(Number(params.get('timescale') || 1))));
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = (now - last) / 1000;
  let dt = Math.min(realDt, 0.05);
  last = now;
  fpsTick(realDt);
  hitFlash = Math.max(0, hitFlash - dt);

  // Title drift: slow cruise so the backdrop lives.
  if (world.screen === 'title' && !frozen) {
    const p = world.player;
    titleAngle += dt * 0.05;
    p.yaw = 0.3 * Math.sin(titleAngle * 2);
    p.pitch = 0.02;
    p.speed = 90;
    const nx = -Math.sin(p.yaw), nz = -Math.cos(p.yaw);
    p.x += nx * p.speed * dt;
    p.z += nz * p.speed * dt;
    if (Math.abs(p.x) > 1800 || p.z < -1800 || p.z > 1800) {
      p.x = clamp(p.x, -1200, 1200); p.z = clamp(p.z, -1200, 1200);
      p.yaw += Math.PI * 0.5;
    }
    world.time += dt;
  }

  if (!frozen && world.screen === 'play' && !world.paused) {
    input.tick(dt);
    // Trim keys.
    if (input.trimUp) world.player.trim = clamp(world.player.trim + 0.2 * dt, -0.2, 0.2);
    if (input.trimDown) world.player.trim = clamp(world.player.trim - 0.2 * dt, -0.2, 0.2);
    const inp = (AUTOPILOT || window.__autopilot)
      ? autopilotInput(world)
      : { pitch: input.pitch, roll: input.roll, throttle: input.throttle, gun: input.gun, missile: input.missile };
    if (input.missile) input.missile = false;
    if (input.camToggle) { input.camToggle = false; toggleCam(); }
    if (input.pauseToggle) { input.pauseToggle = false; togglePause(); }
    if (input.muteToggle) { input.muteToggle = false; toggleMute(); }
    for (let s = 0; s < TIMESCALE; s++) stepWorld(world, inp, dt);
    // Music mood follows danger.
    const danger = world.player.hull < 30 || (world.wave >= 4 && world.enemies.length > 0);
    audio.setMood(danger ? 'danger' : 'play');
    audio.engine(world.player.speed, world.player.throttle, true);
  } else if (world.screen === 'play') {
    audio.engine(0, 0, false);
  } else {
    audio.engine(world.player.speed * 0.4, 0.3, world.screen === 'title');
  }

  drainEvents();
  scene.sync(world, dt, settings.camMode, world.time);
  if (world.screen === 'play' || SHOT === 'combat' || SHOT === 'lock') {
    drawHud(els, world, {
      project: (x, y, z) => scene.project(x, y, z),
      streaks: CFG.quality[settings.quality].streaks,
      hitFlash,
    });
  }
}

// ---- verification hooks ---------------------------------------------------------
window.__talon = {
  world,
  scene,
  start: startGame,
  autopilot: (on) => { window.__autopilot = on; },
  get fps() { return Math.round(fpsAvg); },
  get settings() { return settings; },
  version: 'v5',
};
window.__autopilot = AUTOPILOT;

// The shot block above already showed the right screen for ?shot= runs, and
// an ?autopilot=1 run already started a sortie — only a plain load lands
// on the title screen. (Showing 'title' over a running sortie used to leave
// the HUD at 0px and throw in the radar arc every frame.)
if (world.screen === 'title' && !SHOT) showScreen('title');
if (!SHOT) audio.setMood('title');
requestAnimationFrame(frame);
