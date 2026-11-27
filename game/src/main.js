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
  musicVol: typeof saved.musicVol === 'number' ? saved.musicVol : 1,
  sfxVol: typeof saved.sfxVol === 'number' ? saved.sfxVol : 1,
  // Antialiasing: 'auto' (on for HIGH only, as before), 'on' or 'off'.
  // WebGL fixes antialias at context creation, so this applies when the
  // game next loads — see createScene.
  aa: ['auto', 'on', 'off'].includes(saved.aa) ? saved.aa : 'auto',
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
audio.setMusicVolume(settings.musicVol);
audio.setSfxVolume(settings.sfxVol);
// The mute controls show the *setting*, not the suspended context:
// sound is ON by default. Before the first tap the browser will not
// let any page play sound yet, so the lobby is silent until then —
// but the setting is on, and the first tap anywhere starts the BGM.
audio.onStateChange(updateMuteUI);
// First tap / keypress anywhere unlocks audio — including taps on the
// lobby, so the background music starts on the title screen instead of
// only when the sortie begins. unlock() is idempotent.
// The listeners stay live until audio is actually audible: a single
// { once: true } pointerdown is not enough on Android Chrome, where
// the first touch is often a scroll drag to reach the Settings panel
// and that gesture does not resume the AudioContext. A later tap
// (or a click on any control) must get another chance to unlock —
// otherwise the BGM stays silent until FLY, whose click handler
// calls audio.unlock() directly. So unlock on pointerdown, click and
// keydown, every time, until it works.
// If that very first gesture lands on a mute control (or is KeyM),
// remember it: the gesture's click must turn sound ON, not toggle it
// off. (Chrome auto-resumes the AudioContext on the tap's pointerdown,
// so by click time the context is already running and a blind toggle
// would mute — that was the "press twice to turn sound on" bug. No
// timing window can fix it reliably — on a slow device the
// pointerdown-to-click gap alone exceeds half a second — so the
// decision is recorded at the gesture itself, not at click time.)
let seenGesture = false, firstMuteGesture = false;
const unlockAudio = (e) => {
  if (!seenGesture) {
    seenGesture = true;
    const onMute = (e && e.target && e.target.closest
        && e.target.closest('#btn-mute, #mute-setting'))
      || (e && e.code === 'KeyM');
    if (onMute) firstMuteGesture = true;
  }
  audio.unlock();
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('click', unlockAudio);
window.addEventListener('keydown', unlockAudio);
// Touch needs its own listeners: on Android a touch that becomes a
// scroll drag fires pointerdown but Chrome does not count it as the
// gesture that resumes audio — touchstart / touchend / pointerup give
// the same tap extra chances to unlock, so the lobby music no longer
// waits for a tap on the SOUND ON button specifically.
window.addEventListener('touchstart', unlockAudio, { passive: true });
window.addEventListener('touchend', unlockAudio, { passive: true });
window.addEventListener('pointerup', unlockAudio);

let scene;
try {
  scene = createScene(container, settings.quality, settings.aa);
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
// The one settings panel lives on the title screen, but while paused it
// moves into the pause screen so the same sound / camera / resolution
// controls are reachable mid-sortie — no duplicate controls, no second
// set of IDs, and the sliders keep working because they are looked up by
// ID wherever the panel sits. It stays closed on pause (tap ⚙ SETTINGS
// to open it) and moves back, reset to visible, on any other screen.
const settingsPanel = $('settings-panel');
function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) el.style.display = k === name ? 'flex' : 'none';
  $('hud').style.display = name === null ? 'block' : 'none';
  $('touch-controls').style.display = (name === null && isTouch) ? 'block' : 'none';
  document.body.classList.toggle('on-title', name === 'title');
  if (name === 'pause') {
    screens.pause.appendChild(settingsPanel);
    settingsPanel.style.display = 'none';
    $('btn-pause-settings').textContent = '⚙ SETTINGS';
  } else if (settingsPanel.parentElement !== screens.title) {
    screens.title.appendChild(settingsPanel);
    settingsPanel.style.display = '';
  }
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
  // If the setting already says SOUND ON but nothing is audible yet
  // (the AudioContext is still suspended, waiting for the browser to
  // allow sound), this tap means "turn sound on" — unlock and stay ON.
  // The old code toggled here, so pressing the SOUND ON button when
  // the lobby was silent actually muted the game, and the music only
  // started on the *next* press. That was the "BGM won't play unless
  // you press sound on" bug: the button said ON while silent, and the
  // press that should have started the music turned it off instead.
  if (!settings.muted && !audio.audible) {
    firstMuteGesture = false;
    settings.muted = false;
    audio.unlock();
    audio.setMuted(false);
  } else if (firstMuteGesture) {
    // The user's very first gesture was on a mute control — this tap
    // means "turn sound on". Consumed once; every later tap toggles.
    firstMuteGesture = false;
    settings.muted = false;
    audio.unlock();
    audio.setMuted(false);
  } else {
    settings.muted = !settings.muted;
    audio.setMuted(settings.muted);
    // Unmuting is itself a gesture: resume immediately so the music
    // starts on this tap, not on the next one.
    if (!settings.muted) audio.unlock();
  }
  saveSettings();
  updateMuteUI();
}

// Mute controls show the setting as a SOUND ON / SOUND OFF pair: ON by
// default, OFF only when the user muted it. (They used to show SOUND OFF
// / 🔇 while the context was merely waiting for its first tap, which
// read as "sound is off" — and the muted state used to read MUTED.)
function updateMuteUI() {
  $('btn-mute').textContent = settings.muted ? '🔇' : '🔊';
  $('mute-setting').textContent = settings.muted ? 'SOUND OFF' : 'SOUND ON';
}

// ---- Doppler (enemy sources relative to the player) -------------------------
// Enemies steer by yaw/pitch/speed, so their velocity is rebuilt from
// heading. Radial velocity: positive = the gap is opening (receding,
// pitch falls), negative = closing in (pitch rises).
function radialVelOf(e) {
  const p = world.player;
  const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - p.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  const ex = -Math.sin(e.yaw) * Math.cos(e.pitch) * e.speed - p.vx;
  const ey = Math.sin(e.pitch) * e.speed - p.vy;
  const ez = -Math.cos(e.yaw) * Math.cos(e.pitch) * e.speed - p.vz;
  return (ex * dx + ey * dy + ez * dz) / dist;
}
function nearestEnemy() {
  const p = world.player;
  let best = null, bestD = Infinity;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best ? { enemy: best, dist: bestD } : null;
}
// Stereo pan of a world point relative to the player: -1 = hard left,
// +1 = hard right, 0 = dead ahead / behind. Right in the player's
// frame is (cos yaw, -sin yaw) in xz — facing north (yaw 0) that is
// +x (east), facing west (yaw PI/2) that is -z (north).
function panOf(x, y, z) {
  const p = world.player;
  const dx = x - p.x, dy = y - p.y, dz = z - p.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  return Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist));
}
// The shooter's position rides on the enemyGun event; match the live
// bandit nearest that spot (it is the shooter) for its radial velocity.
function enemyNear(x, y, z) {
  let best = null, bestD = 80;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y, e.z - z);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
let prevRadialVel = null; // previous frame's nearest-enemy radial velocity
function updateEnemyDoppler() {
  const near = nearestEnemy();
  if (!near || world.screen !== 'play' || world.paused) {
    prevRadialVel = null;
    audio.enemyEngine(0, Infinity, false);
    return;
  }
  const rv = radialVelOf(near.enemy);
  const pan = panOf(near.enemy.x, near.enemy.y, near.enemy.z);
  audio.enemyEngine(rv, near.dist, true, pan);
  // Close pass: the bandit was closing in and has just started pulling
  // away while still near — that crossing is the flyby moment. One
  // whoosh per pass; audio.flyby itself enforces the cooldown. The
  // whoosh stays on the side it passes on (pan at the crossing).
  if (prevRadialVel !== null && prevRadialVel < 0 && rv >= 0 && near.dist < 500) {
    audio.flyby(prevRadialVel, near.dist, pan);
  }
  prevRadialVel = rv;
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
$('btn-pause-settings').addEventListener('click', () => {
  const open = settingsPanel.style.display === 'none';
  settingsPanel.style.display = open ? '' : 'none';
  $('btn-pause-settings').textContent = open ? '✕ SETTINGS' : '⚙ SETTINGS';
  audio.click();
});
$('btn-restart').addEventListener('click', () => { world.paused = false; startGame(); });
$('btn-quit-title').addEventListener('click', () => { world.paused = false; toTitle(); });
$('btn-mute').addEventListener('click', toggleMute);
$('btn-full').addEventListener('click', toggleFullscreen);
// Resolution: Low / Medium / High segmented control. Applies live via
// scene.setQuality (render scale + bloom/post + clouds) — no reload —
// and persists. The active tier is highlighted by updateQualityUI.
const QUALITY_NOTES = {
  low: 'LOW — fastest, no bloom. Best for low-end phones.',
  medium: 'MEDIUM — balanced, light bloom.',
  high: 'HIGH — full bloom + god rays. Smoothest on desktop.',
};
function updateQualityUI() {
  document.querySelectorAll('#quality-group .q-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.q === settings.quality);
  });
  const tierPost = CFG.quality[settings.quality].post;
  $('quality-note').textContent = QUALITY_NOTES[settings.quality]
    + (scene.postLevel < tierPost ? ' · Bloom reduced to hold frame rate.' : '');
}
document.querySelectorAll('#quality-group .q-btn').forEach((b) => {
  b.addEventListener('click', () => {
    settings.quality = b.dataset.q;
    saveSettings();
    scene.setQuality(settings.quality);
    updateQualityUI();
    audio.click();
  });
});
// Antialiasing: AUTO → ON → OFF. Applies at renderer creation, so it
// takes effect when the game next loads — the note in the panel says so.
// It persists like the other settings.
const AA_ORDER = ['auto', 'on', 'off'];
function updateAAUI() {
  $('aa-setting').textContent = `ANTIALIASING: ${settings.aa.toUpperCase()}`;
}
$('aa-setting').addEventListener('click', () => {
  settings.aa = AA_ORDER[(AA_ORDER.indexOf(settings.aa) + 1) % AA_ORDER.length];
  saveSettings();
  updateAAUI();
  audio.click();
});
// Sound sliders: live (musicGain / sfxGain) and persisted.
const musicVolEl = $('music-vol'), sfxVolEl = $('sfx-vol');
musicVolEl.value = Math.round(settings.musicVol * 100);
sfxVolEl.value = Math.round(settings.sfxVol * 100);
$('music-vol-val').textContent = `${musicVolEl.value}%`;
$('sfx-vol-val').textContent = `${sfxVolEl.value}%`;
musicVolEl.addEventListener('input', () => {
  // Dragging a volume slider is a gesture too — unlock here so the
  // music can start from the slider, not only from SOUND ON.
  audio.unlock();
  settings.musicVol = musicVolEl.value / 100;
  audio.setMusicVolume(settings.musicVol);
  $('music-vol-val').textContent = `${musicVolEl.value}%`;
  saveSettings();
});
sfxVolEl.addEventListener('input', () => {
  audio.unlock();
  settings.sfxVol = sfxVolEl.value / 100;
  audio.setSfxVolume(settings.sfxVol);
  $('sfx-vol-val').textContent = `${sfxVolEl.value}%`;
  saveSettings();
});
$('mute-setting').addEventListener('click', toggleMute);
$('cam-setting').addEventListener('click', toggleCam);
updateMuteUI();
updateQualityUI();
updateAAUI();
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
          updateQualityUI();
        }
        // The post shed also changes the quality note ("bloom reduced").
        updateQualityUI();
        lowTime = 0;
      }
    } else lowTime = 0;
  }
}

// ---- events -------------------------------------------------------------------
function drainEvents() {
  for (const ev of world.events) {
    switch (ev.type) {
      case 'gun': {
        // The M4's Doppler follows the bandit being shot at (its radial
        // velocity + bearing); with no lock it still sweeps downrange.
        const target = (ev.tx !== null && ev.tx !== undefined)
          ? enemyNear(ev.tx, ev.ty, ev.tz) : null;
        audio.gun(
          target ? radialVelOf(target) : 0,
          target ? panOf(target.x, target.y, target.z) : 0,
        );
        break;
      }
      case 'enemyGun': {
        // The shooter's pitch follows its own Doppler, not the nearest
        // bandit's — match the bandit at the event position. Its M4
        // crack is panned hard to the shooter's side, and its level
        // falls with distance, so a crossing bandit's fire sweeps
        // across from one ear to the other.
        const shooter = enemyNear(ev.x, ev.y, ev.z);
        const p = world.player;
        const dist = shooter
          ? Math.hypot(shooter.x - p.x, shooter.y - p.y, shooter.z - p.z)
          : 400;
        audio.enemyGun(
          shooter ? radialVelOf(shooter) : 0,
          shooter ? panOf(shooter.x, shooter.y, shooter.z) : 0,
          dist,
        );
        break;
      }
      case 'missile': {
        // The missile's Doppler follows its target bandit (radial
        // velocity + bearing), then falls as it flies away from you.
        const target = (ev.tx !== null && ev.tx !== undefined)
          ? enemyNear(ev.tx, ev.ty, ev.tz) : null;
        audio.missile(
          target ? radialVelOf(target) : 0,
          target ? panOf(target.x, target.y, target.z) : 0,
        );
        break;
      }
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

  // KeyM works on every screen — the old code only consumed muteToggle
  // inside the play branch, so the shortcut did nothing on the title.
  if (input.muteToggle) { input.muteToggle = false; toggleMute(); }

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

  // Nearest-enemy roar + Doppler runs every frame during play; off on
  // other screens (no bandits there) so the loop never drones on title.
  updateEnemyDoppler();
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
  get cull() { return scene.cullStats; },
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
