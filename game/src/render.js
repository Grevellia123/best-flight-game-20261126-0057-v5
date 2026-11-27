// TALON STRIKE — 2D HUD: speed/altitude tapes, compass, radar, reticle overlay,
// bars and kill feed. Drawn over the 3D canvas; the centre stays clear except
// for the reticle and the locked target.
import { CFG } from './config.js';
import { clamp } from './random.js';

// Per-frame DOM churn is a real jank source on low-end phones: assigning
// innerHTML / textContent / style every frame forces style recalculation
// even when the string is unchanged. Only write when the value changed.
function setText(el, s) { if (el._txt !== s) { el._txt = s; el.textContent = s; } }
function setHtml(el, s) { if (el._html !== s) { el._html = s; el.innerHTML = s; } }
function setBar(el, pct) {
  const w = `${clamp(pct, 0, 100)}%`;
  if (el._w !== w) { el._w = w; el.style.width = w; }
}
function setOp(el, v) { if (el._op !== v) { el._op = v; el.style.opacity = v; } }

// Reticle lag state: the gunsight follows the plane's tilt, but slightly
// behind it (see drawHud). Kept here so it survives across frames.
let reticleLag = { x: 0, y: 0 };

function setupCanvas(el, maxDpr = 1.5) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = el.clientWidth, h = el.clientHeight;
  if (w < 10 || h < 10) return null; // hidden (display:none) — nothing to draw
  if (el.width !== w * dpr || el.height !== h * dpr) {
    el.width = w * dpr; el.height = h * dpr;
  }
  const g = el.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h };
}

// Vertical tape: numbers scroll past a fixed centre box. v5.8 minimal:
// no panel behind the tape — hairline ticks and a faint centre box float
// over the scene, with a soft text shadow so the numbers stay readable.
// The tape is 44px wide (same as the square top-right buttons above it),
// so ticks and type are sized to fit: major ticks 10px, centre value 13px
// (11px if it ever reaches 5 digits).
function drawTape(el, value, step, unit, label) {
  const s = setupCanvas(el);
  if (!s) return;
  const { g, w, h } = s;
  g.clearRect(0, 0, w, h);
  const cy = h / 2;
  const pxPerUnit = 34 / step;
  const top = value + (h / 2) / pxPerUnit;
  const bottom = value - (h / 2) / pxPerUnit;
  g.shadowBlur = 0;
  g.font = '600 10px ui-monospace, monospace';
  g.textAlign = 'left';
  const start = Math.ceil(bottom / step) * step;
  for (let v = start; v <= top; v += step) {
    const y = cy - (v - value) * pxPerUnit;
    const major = v % (step * 5) === 0;
    g.strokeStyle = major ? 'rgba(180, 230, 255, 0.8)' : 'rgba(140, 220, 255, 0.35)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(w - (major ? 10 : 5), y); g.lineTo(w, y); g.stroke();
    if (major) {
      g.fillStyle = 'rgba(200, 235, 255, 0.9)';
      g.shadowColor = 'rgba(0, 0, 0, 0.6)'; g.shadowBlur = 3;
      g.fillText(String(Math.round(v)), 4, y + 3);
      g.shadowBlur = 0;
    }
  }
  // Centre value box: faint fill, hairline outline. It spans the full
  // tape width (edge to edge) so the dark box reads exactly as wide as
  // the square button above the tape — a 2px inset on each side left it
  // 4px narrower than the button and the mismatch was visible.
  const val = String(Math.round(value));
  g.fillStyle = 'rgba(8, 18, 26, 0.30)';
  g.strokeStyle = 'rgba(127, 212, 255, 0.7)';
  g.lineWidth = 1;
  const bw = w - 1, bh = 26;
  g.beginPath(); g.rect(0.5, cy - bh / 2, bw, bh); g.fill(); g.stroke();
  g.fillStyle = '#aee6ff';
  g.font = val.length > 4 ? '700 11px ui-monospace, monospace' : '700 13px ui-monospace, monospace';
  g.textAlign = 'center';
  g.shadowColor = 'rgba(0, 0, 0, 0.6)'; g.shadowBlur = 3;
  g.fillText(val, w / 2, cy + 5);
  g.fillStyle = 'rgba(160, 210, 235, 0.85)';
  g.font = '600 8px ui-monospace, monospace';
  g.textAlign = 'left';
  g.fillText(label, 4, 12);
  g.textAlign = 'right';
  g.fillText(unit, w - 4, 12);
  g.shadowBlur = 0;
}

function drawCompass(el, yaw) {
  const s = setupCanvas(el);
  if (!s) return;
  const { g, w, h } = s;
  g.clearRect(0, 0, w, h);
  // v5.8 minimal: no panel behind the compass — ticks and numbers float
  // over the sky, with a soft shadow so they stay readable.
  // Heading: 0 = north (-z). yaw 0 faces north.
  let deg = ((-yaw * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  const pxPerDeg = 2.2;
  const cx = w / 2;
  g.font = '600 11px ui-monospace, monospace';
  g.textAlign = 'center';
  g.shadowColor = 'rgba(0, 0, 0, 0.6)'; g.shadowBlur = 3;
  const marks = [[0, 'N'], [45, '045'], [90, 'E'], [135, '135'], [180, 'S'], [225, '225'], [270, 'W'], [315, '315']];
  for (let d = -180; d <= 180; d += 15) {
    let hd = (deg + d + 360) % 360;
    const x = cx + d * pxPerDeg;
    if (x < -20 || x > w + 20) continue;
    const major = hd % 45 === 0;
    g.strokeStyle = major ? 'rgba(180,230,255,0.9)' : 'rgba(140,220,255,0.35)';
    g.beginPath(); g.moveTo(x, major ? 18 : 26); g.lineTo(x, 34); g.stroke();
    if (major) {
      const m = marks.find(([mv]) => mv === hd);
      g.fillStyle = 'rgba(200,235,255,0.95)';
      g.fillText(m ? m[1] : String(hd).padStart(3, '0'), x, 14);
    }
  }
  // Centre caret + readout.
  g.shadowBlur = 0;
  g.fillStyle = '#7fd4ff';
  g.beginPath(); g.moveTo(cx - 6, 34); g.lineTo(cx + 6, 34); g.lineTo(cx, 42); g.fill();
  g.fillStyle = '#aee6ff';
  g.font = '700 13px ui-monospace, monospace';
  g.shadowColor = 'rgba(0, 0, 0, 0.6)'; g.shadowBlur = 3;
  g.fillText(String(Math.round(deg)).padStart(3, '0') + '°', cx, h - 8);
  g.shadowBlur = 0;
}

function drawRadar(el, world) {
  const s = setupCanvas(el);
  if (!s) return;
  const { g, w, h } = s;
  const cx = w / 2, cy = h / 2, R = w / 2 - 6;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(6, 20, 14, 0.30)';
  g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(110, 230, 170, 0.6)';
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(110, 230, 170, 0.25)';
  g.beginPath(); g.arc(cx, cy, R * 0.55, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
  g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  const p = world.player;
  const range = 2600;
  // Sweep line.
  const sa = world.time * 1.4;
  g.strokeStyle = 'rgba(140, 255, 190, 0.5)';
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sa) * R, cy + Math.sin(sa) * R); g.stroke();
  // Enemies: rotate so up = player heading.
  const rot = p.yaw; // yaw 0 faces north (-z); screen up = forward
  for (const e of world.enemies) {
    const dx = e.x - p.x, dz = e.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range) continue;
    // Forward is -z rotated by yaw: screen x = right, screen y = up(forward).
    const fx = -Math.sin(rot), fz = -Math.cos(rot);
    const rx = -fz, rz = fx; // right vector
    const sx = (dx * rx + dz * rz) / range * R;
    const sy = -(dx * fx + dz * fz) / range * R;
    g.fillStyle = e.ace ? '#ff5040' : '#ff7040';
    g.beginPath();
    g.arc(cx + sx, cy + sy, e.ace ? 4.5 : 3.5, 0, Math.PI * 2);
    g.fill();
    if (world.lockTarget === e) {
      g.strokeStyle = '#7fd4ff';
      g.beginPath(); g.arc(cx + sx, cy + sy, 7, 0, Math.PI * 2); g.stroke();
    }
  }
  // Rings.
  g.fillStyle = 'rgba(127, 212, 255, 0.9)';
  for (const r of world.rings) {
    if (r.passed) continue;
    const dx = r.x - p.x, dz = r.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range) continue;
    const fx = -Math.sin(rot), fz = -Math.cos(rot);
    const rx = -fz, rz = fx;
    const sx = (dx * rx + dz * rz) / range * R;
    const sy = -(dx * fx + dz * fz) / range * R;
    g.fillRect(cx + sx - 2, cy + sy - 2, 4, 4);
  }
  // Player wedge.
  g.fillStyle = '#aee6ff';
  g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx - 5, cy + 5); g.lineTo(cx + 5, cy + 5); g.closePath(); g.fill();
}

// Cockpit MFD radar: the same enemy picture as the main radar, in
// cyan — same projection (up = player heading, range 2600), same
// sweep, but drawn on the dashboard screen instead of the
// bottom-right corner. The enemy dots keep the main radar's colours
// (existing target symbology, not new UI).
function drawMfdRadar(el, world) {
  const s = setupCanvas(el);
  if (!s) return;
  const { g, w, h } = s;
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 4;
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(127, 212, 255, 0.55)';
  g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(127, 212, 255, 0.25)';
  g.beginPath(); g.arc(cx, cy, R * 0.55, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
  g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  const p = world.player;
  const range = 2600;
  // Sweep line.
  const sa = world.time * 1.4;
  g.strokeStyle = 'rgba(127, 212, 255, 0.5)';
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sa) * R, cy + Math.sin(sa) * R); g.stroke();
  // Enemies: rotate so up = player heading (same math as drawRadar).
  const rot = p.yaw;
  const fx = -Math.sin(rot), fz = -Math.cos(rot);
  const rx = -fz, rz = fx;
  for (const e of world.enemies) {
    const dx = e.x - p.x, dz = e.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range) continue;
    const sx = (dx * rx + dz * rz) / range * R;
    const sy = -(dx * fx + dz * fz) / range * R;
    g.fillStyle = e.ace ? '#ff5040' : '#ff7040';
    g.beginPath();
    g.arc(cx + sx, cy + sy, e.ace ? 4.5 : 3.5, 0, Math.PI * 2);
    g.fill();
    if (world.lockTarget === e) {
      g.strokeStyle = '#7fd4ff';
      g.beginPath(); g.arc(cx + sx, cy + sy, 7, 0, Math.PI * 2); g.stroke();
    }
  }
  // Player wedge.
  g.fillStyle = '#aee6ff';
  g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx - 5, cy + 5); g.lineTo(cx + 5, cy + 5); g.closePath(); g.fill();
}

// Cockpit ADI: an attitude ball — blue sky over brown ground, the
// horizon tilting with the real roll and sliding with the real pitch.
// The ball is clipped to a circle; a fixed white aircraft symbol sits
// in the centre (the ball moves, the symbol doesn't).
function drawMfdAdi(el, p) {
  const s = setupCanvas(el);
  if (!s) return;
  const { g, w, h } = s;
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 4;
  g.clearRect(0, 0, w, h);
  const pxPerRad = R * 0.9; // 1.1 rad of pitch ≈ the ball's radius
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.translate(cx, cy);
  // Aircraft rolls right → the horizon tilts the other way; nose up →
  // the horizon slides down.
  g.rotate(-p.roll);
  g.translate(0, clamp(p.pitch, -1.1, 1.1) * pxPerRad);
  g.fillStyle = '#2f7fc9';
  g.fillRect(-R - 10, -R - 10, 2 * R + 20, R + 10);
  g.fillStyle = '#8a5a2e';
  g.fillRect(-R - 10, 0, 2 * R + 20, R + 10);
  // Pitch ladder: every 10°, out to ±30°. The +10° line sits above the
  // horizon in ball space (canvas y is down, hence the minus).
  g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  g.lineWidth = 1.5;
  for (const deg of [-30, -20, -10, 10, 20, 30]) {
    const y = -(deg * Math.PI / 180) * pxPerRad;
    const lw = R * (deg % 20 === 0 ? 0.7 : 0.45);
    g.beginPath(); g.moveTo(-lw, y); g.lineTo(lw, y); g.stroke();
  }
  // Horizon line.
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-R - 10, 0); g.lineTo(R + 10, 0); g.stroke();
  g.restore();
  // Ball outline + fixed aircraft symbol.
  g.strokeStyle = 'rgba(174, 230, 255, 0.6)';
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - R * 0.35, cy); g.lineTo(cx - R * 0.12, cy);
  g.moveTo(cx + R * 0.12, cy); g.lineTo(cx + R * 0.35, cy);
  g.moveTo(cx, cy); g.lineTo(cx, cy - R * 0.08);
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(cx, cy, 2, 0, Math.PI * 2); g.fill();
}

// Cockpit overlay: the DOM text / bars / MFD canvases inside
// #cockpit-frame, updated every frame from the live world state.
// Only called while camMode is 'cockpit' — in chase view the frame
// is hidden and none of this runs.
function drawCockpit(els, world) {
  const p = world.player;
  const waveName = world.wave > 0 ? CFG.waves[world.wave - 1].name : 'HOSTILES INBOUND';
  setText(els.cockpitObjTitle, `OBJ: WAVE ${Math.max(1, world.wave)} / ${CFG.waves.length} · ${waveName}`);
  setText(els.cockpitObjSub, `${world.enemies.length} HOSTILES · KILLS ${world.kills} · SCORE ${world.score} CR`);
  // Ring label: the locked bandit if there is one, else the nearest.
  let tgt = world.lockTarget, dist = 0;
  if (tgt) {
    dist = Math.hypot(tgt.x - p.x, tgt.y - p.y, tgt.z - p.z);
  } else {
    let best = Infinity;
    for (const e of world.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
      if (d < best) { best = d; tgt = e; }
    }
    dist = best;
  }
  setText(els.cockpitRingLbl, tgt
    ? (world.lockTarget === tgt && world.lockProgress >= 1
      ? `◉ ${tgt.name} · LOCK`
      : `${tgt.name} · ${Math.round(dist)}m`)
    : 'NO TARGET');
  setText(els.cockpitSpdVal, `${Math.round(p.speed * 1.944)} KT`);
  setText(els.cockpitSpdSub, `M ${(p.speed / 343).toFixed(2)}`);
  setText(els.cockpitAltVal, `${Math.round((p.y - 6) * 3.281)} FT`);
  setText(els.cockpitAltSub, `FUEL ${Math.round(p.fuel)}%`);
  setBar(els.cockpitThrBar, p.throttle * 100);
  setText(els.cockpitThrVal, `${Math.round(p.throttle * 100)}%`);
  setBar(els.cockpitFuelBar, p.fuel);
  setText(els.cockpitFuelVal, `${Math.round(p.fuel)}%`);
  setBar(els.cockpitHeatBar, p.heat);
  setText(els.cockpitHeatVal, `${Math.round(p.heat)}%`);
  setText(els.cockpitEngFoot, `MSL ${p.missiles} × · GEAR UP · FLAPS UP · A/B ${p.throttle > 0.7 ? 'ON' : 'OFF'}`);
  drawMfdRadar(els.mfdRadar, world);
  drawMfdAdi(els.mfdAdi, p);
  setText(els.mfdAdiFoot, `PITCH ${Math.round(p.pitch * 57.3)}° · ROLL ${Math.round(p.roll * 57.3)}°`);
}

export function drawHud(els, world, opts) {
  const p = world.player;
  const speedKt = Math.round(p.speed * 1.944);
  const altFt = Math.round((p.y - 6) * 3.281);
  drawTape(els.ias, speedKt, 20, 'KT', 'IAS');
  drawTape(els.alt, altFt, 200, 'FT', 'ALT');
  drawCompass(els.compass, p.yaw);
  drawRadar(els.radar, world);

  // Top-left info.
  setHtml(els.waveInfo,
    `WAVE ${Math.max(1, world.wave)} / ${CFG.waves.length} &nbsp;·&nbsp; <span class="hide-narrow">KILLS ${world.kills} &nbsp;·&nbsp; </span><span class="accent">${world.score} CR</span>`);
  setText(els.waveSub, world.waveState === 'active' && world.wave > 0
    ? `${CFG.waves[world.wave - 1].name} — ${world.enemies.length} HOSTILES`
    : world.msg || '');
  setText(els.msg, world.msg || '');
  setOp(els.msg, world.msgTimer > 0 ? '1' : '0');

  // Bottom-left bars.
  setBar(els.fuelBar, p.fuel);
  els.fuelBar.classList.toggle('low', p.fuel < 25);
  setText(els.fuelText, `FUEL ${Math.round(p.fuel)}%`);
  setBar(els.hullBar, p.hull);
  els.hullBar.classList.toggle('low', p.hull < 30);
  setText(els.hullText, `HULL ${Math.round(p.hull)}%`);
  setBar(els.heatBar, p.heat);
  els.heatBar.classList.toggle('hot', p.overheated);
  setText(els.heatText, p.overheated ? 'GUNS OVERHEATED' : `GUN HEAT ${Math.round(p.heat)}%`);
  setText(els.mslText, `MSL ${p.missiles} ×`);
  els.mslText.classList.toggle('empty', p.missiles === 0);
  setOp(els.stallWarn, p.stall ? '1' : '0');
  setText(els.lockText, world.lockTarget
    ? (world.lockProgress >= 1 ? '◉ LOCK — FIRE!' : `LOCKING ${world.lockTarget.name} ${Math.round(world.lockProgress * 100)}%`)
    : '');

  // Cockpit overlay: objective box, systems box, HUD ring and the
  // three dashboard screens — only in cockpit mode.
  if (opts.cockpit) drawCockpit(els, world);

  // Overlay canvas: reticle, target boxes, streaks, hit marker.
  // Capped at DPR 1 — it is mostly lines, and a full-screen 2x backing
  // store is the single most expensive thing on software renderers.
  const ov = setupCanvas(els.overlay, 1);
  if (!ov) return;
  const { g, w, h } = ov;
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  if (world.screen === 'play') {
    // Speed streaks at high speed.
    if (opts.streaks && p.speed > 190) {
      const n = Math.round((p.speed - 190) / 8);
      g.strokeStyle = 'rgba(220, 240, 255, 0.28)';
      g.lineWidth = 1.5;
      for (let i = 0; i < n; i++) {
        const a = (i * 2.39996 + world.time * 0.4) % (Math.PI * 2);
        const r0 = Math.max(w, h) * 0.32, r1 = r0 + 30 + (p.speed - 190) * 0.35;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        g.stroke();
      }
    }
    // Reticle lag: the gunsight follows the plane's tilt, but well
    // behind it. It drifts toward the bank (right when banking right)
    // and toward a pitch-up, then catches up — about three quarters
    // of a second behind, so a turn or a tilt visibly drags the
    // cursor with it. The target boxes stay world-anchored; only the
    // cursor (ring, ticks, dot, lock arc, hit marker) moves.
    const lagK = 1 - Math.pow(0.25, opts.dt || 1 / 60);
    reticleLag.x += (clamp(p.roll * 30, -42, 42) - reticleLag.x) * lagK;
    reticleLag.y += (clamp(-p.pitch * 20, -28, 28) - reticleLag.y) * lagK;
    const rx = cx + reticleLag.x, ry = cy + reticleLag.y;
    // Reticle — v5.14: smaller again (the big 20 px ring from the v5.13
    // revert read too large; this is the v5.12 size, without the v5.12
    // performance changes).
    const locked = world.lockTarget && world.lockProgress >= 1;
    g.strokeStyle = locked ? '#ff4030' : 'rgba(140, 230, 255, 0.9)';
    g.lineWidth = locked ? 2 : 1.5;
    const rr = locked ? 16 : 12;
    g.beginPath(); g.arc(rx, ry, rr, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      g.moveTo(rx + dx * (rr + 3), ry + dy * (rr + 3));
      g.lineTo(rx + dx * (rr + 9), ry + dy * (rr + 9));
    }
    g.stroke();
    g.fillStyle = locked ? '#ff4030' : 'rgba(140, 230, 255, 0.9)';
    g.beginPath(); g.arc(rx, ry, 1.6, 0, Math.PI * 2); g.fill();
    // Lock progress arc.
    if (world.lockTarget && world.lockProgress > 0 && world.lockProgress < 1) {
      g.strokeStyle = '#7fd4ff';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(rx, ry, rr + 6, -Math.PI / 2, -Math.PI / 2 + world.lockProgress * Math.PI * 2);
      g.stroke();
    }
    // Target boxes.
    g.font = '600 11px ui-monospace, monospace';
    for (const e of world.enemies) {
      const pr = opts.project(e.x, e.y, e.z);
      if (!pr || !pr.visible) continue;
      const s = clamp(900 / pr.dist, 0.5, 1.6) * 16;
      const isLock = world.lockTarget === e;
      g.strokeStyle = e.ace ? '#ff5040' : (isLock ? '#7fd4ff' : 'rgba(255, 120, 90, 0.85)');
      g.lineWidth = isLock ? 2.2 : 1.4;
      g.strokeRect(pr.x - s, pr.y - s, s * 2, s * 2);
      g.fillStyle = isLock ? '#7fd4ff' : 'rgba(255, 190, 170, 0.95)';
      g.textAlign = 'left';
      const label = `${e.name} · ${Math.round(pr.dist)}m`;
      g.fillText(label, pr.x + s + 5, pr.y - s + 4);
      if (isLock && world.lockProgress >= 1) {
        g.fillStyle = '#ff4030';
        g.font = '700 12px ui-monospace, monospace';
        g.fillText('LOCK', pr.x + s + 5, pr.y - s + 18);
        g.font = '600 11px ui-monospace, monospace';
      }
    }
    // Hit marker flash.
    if (opts.hitFlash > 0) {
      g.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, opts.hitFlash * 3)})`;
      g.lineWidth = 2;
      const m = 7;
      g.beginPath();
      g.moveTo(rx - m, ry - m); g.lineTo(rx - m * 0.4, ry - m * 0.4);
      g.moveTo(rx + m, ry - m); g.lineTo(rx + m * 0.4, ry - m * 0.4);
      g.moveTo(rx - m, ry + m); g.lineTo(rx - m * 0.4, ry + m * 0.4);
      g.moveTo(rx + m, ry + m); g.lineTo(rx + m * 0.4, ry + m * 0.4);
      g.stroke();
    }
  }
}
