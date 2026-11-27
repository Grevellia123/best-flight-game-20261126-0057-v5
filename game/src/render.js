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

// Vertical tape: numbers scroll past a fixed centre box.
function drawTape(el, value, step, unit, label) {
  const s = setupCanvas(el);
  if (!s) return;
  const { g, w, h } = s;
  g.clearRect(0, 0, w, h);
  const cy = h / 2;
  g.fillStyle = 'rgba(8, 18, 26, 0.55)';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(140, 220, 255, 0.35)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, w - 1, h - 1);
  const pxPerUnit = 34 / step;
  const top = value + (h / 2) / pxPerUnit;
  const bottom = value - (h / 2) / pxPerUnit;
  g.font = '600 11px ui-monospace, monospace';
  g.textAlign = 'left';
  const start = Math.ceil(bottom / step) * step;
  for (let v = start; v <= top; v += step) {
    const y = cy - (v - value) * pxPerUnit;
    const major = v % (step * 5) === 0;
    g.strokeStyle = major ? 'rgba(180, 230, 255, 0.8)' : 'rgba(140, 220, 255, 0.35)';
    g.beginPath(); g.moveTo(w - (major ? 16 : 9), y); g.lineTo(w, y); g.stroke();
    if (major) {
      g.fillStyle = 'rgba(200, 235, 255, 0.9)';
      g.fillText(String(Math.round(v)), 6, y + 4);
    }
  }
  // Centre value box.
  g.fillStyle = '#0e2a3a';
  g.strokeStyle = '#7fd4ff';
  g.lineWidth = 1.5;
  const bw = w - 6, bh = 26;
  g.beginPath(); g.rect(3, cy - bh / 2, bw, bh); g.fill(); g.stroke();
  g.fillStyle = '#aee6ff';
  g.font = '700 15px ui-monospace, monospace';
  g.textAlign = 'center';
  g.fillText(String(Math.round(value)), w / 2, cy + 5);
  g.fillStyle = 'rgba(160, 210, 235, 0.85)';
  g.font = '600 9px ui-monospace, monospace';
  g.textAlign = 'left';
  g.fillText(label, 6, 14);
  g.textAlign = 'right';
  g.fillText(unit, w - 6, 14);
}

function drawCompass(el, yaw) {
  const s = setupCanvas(el);
  if (!s) return;
  const { g, w, h } = s;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(8, 18, 26, 0.55)';
  g.fillRect(0, 0, w, h);
  // Heading: 0 = north (-z). yaw 0 faces north.
  let deg = ((-yaw * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  const pxPerDeg = 2.2;
  const cx = w / 2;
  g.font = '600 11px ui-monospace, monospace';
  g.textAlign = 'center';
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
  g.fillStyle = '#ffb020';
  g.beginPath(); g.moveTo(cx - 6, 34); g.lineTo(cx + 6, 34); g.lineTo(cx, 42); g.fill();
  g.fillStyle = '#aee6ff';
  g.font = '700 13px ui-monospace, monospace';
  g.fillText(String(Math.round(deg)).padStart(3, '0') + '°', cx, h - 8);
}

function drawRadar(el, world) {
  const s = setupCanvas(el);
  if (!s) return;
  const { g, w, h } = s;
  const cx = w / 2, cy = h / 2, R = w / 2 - 6;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(6, 20, 14, 0.78)';
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
      g.strokeStyle = '#ffd040';
      g.beginPath(); g.arc(cx + sx, cy + sy, 7, 0, Math.PI * 2); g.stroke();
    }
  }
  // Rings.
  g.fillStyle = 'rgba(255, 176, 32, 0.9)';
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
    `WAVE ${Math.max(1, world.wave)} / ${CFG.waves.length} &nbsp;·&nbsp; <span class="hide-narrow">KILLS ${world.kills} &nbsp;·&nbsp; </span><span class="gold">${world.score} CR</span>`);
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
    // Reticle.
    const locked = world.lockTarget && world.lockProgress >= 1;
    g.strokeStyle = locked ? '#ff4030' : 'rgba(140, 230, 255, 0.9)';
    g.lineWidth = locked ? 2.5 : 1.8;
    const rr = locked ? 26 : 20;
    g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      g.moveTo(cx + dx * (rr + 4), cy + dy * (rr + 4));
      g.lineTo(cx + dx * (rr + 12), cy + dy * (rr + 12));
    }
    g.stroke();
    g.fillStyle = locked ? '#ff4030' : 'rgba(140, 230, 255, 0.9)';
    g.beginPath(); g.arc(cx, cy, 2.2, 0, Math.PI * 2); g.fill();
    // Lock progress arc.
    if (world.lockTarget && world.lockProgress > 0 && world.lockProgress < 1) {
      g.strokeStyle = '#ffc020';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, rr + 8, -Math.PI / 2, -Math.PI / 2 + world.lockProgress * Math.PI * 2);
      g.stroke();
    }
    // Target boxes.
    g.font = '600 11px ui-monospace, monospace';
    for (const e of world.enemies) {
      const pr = opts.project(e.x, e.y, e.z);
      if (!pr || !pr.visible) continue;
      const s = clamp(900 / pr.dist, 0.5, 1.6) * 16;
      const isLock = world.lockTarget === e;
      g.strokeStyle = e.ace ? '#ff5040' : (isLock ? '#ffc020' : 'rgba(255, 120, 90, 0.85)');
      g.lineWidth = isLock ? 2.2 : 1.4;
      g.strokeRect(pr.x - s, pr.y - s, s * 2, s * 2);
      g.fillStyle = isLock ? '#ffd040' : 'rgba(255, 190, 170, 0.95)';
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
      g.lineWidth = 2.5;
      const m = 10;
      g.beginPath();
      g.moveTo(cx - m, cy - m); g.lineTo(cx - m * 0.4, cy - m * 0.4);
      g.moveTo(cx + m, cy - m); g.lineTo(cx + m * 0.4, cy - m * 0.4);
      g.moveTo(cx - m, cy + m); g.lineTo(cx - m * 0.4, cy + m * 0.4);
      g.moveTo(cx + m, cy + m); g.lineTo(cx + m * 0.4, cy + m * 0.4);
      g.stroke();
    }
  }
}
