// TALON STRIKE — game state and simulation. No rendering here: pure logic so the
// autopilot and the verifier can drive it headless.
import { CFG, ENEMY_NAMES, ACE_NAME } from './config.js';
import { mulberry32, fbm2, clamp, lerp, angleDiff, angleLerp } from './random.js';

const SEED = 20261127;

// ---- terrain ---------------------------------------------------------------
export function riverZ(x) {
  return 900 + 1200 * Math.sin(x / 2200 + 1.3);
}

// Terrain height in metres at (x, z). Sea floor is negative, hills up to ~280.
export function terrainHeight(x, z) {
  const S = CFG.world.size / 2;
  const cx = clamp(x, -S, S), cz = clamp(z, -S, S);
  let h = 40 + fbm2(cx * 0.00045 + 3.1, cz * 0.00045 + 8.7, SEED) * 110;
  h += Math.max(0, fbm2(cx * 0.0016, cz * 0.0016, SEED + 5)) * 130;
  // River channel carves down to the water.
  const rz = riverZ(cx);
  const rd = Math.abs(cz - rz);
  if (rd < 160) h = Math.min(h, lerp(-2, h, rd / 160));
  // Coast: terrain sinks to the sea south of seaStartZ.
  if (cz > CFG.world.seaStartZ) {
    const t = clamp((cz - CFG.world.seaStartZ) / 900, 0, 1);
    h = lerp(h, -14, t * t * (3 - 2 * t));
  }
  // Home runway plateau around the origin so the strip sits flat.
  const hd = Math.hypot(cx, cz);
  if (hd < 700) h = lerp(6, h, Math.max(0, (hd - 250) / 450));
  // A few islands in the sea.
  for (const [ix, iz, ir, ih] of [[-2600, 4800, 700, 90], [1800, 5100, 900, 130], [4200, 4600, 600, 70]]) {
    const d = Math.hypot(cx - ix, cz - iz);
    if (d < ir) h = Math.max(h, ih * (1 - d / ir) * (1 - d / ir));
  }
  return h;
}

// ---- state -----------------------------------------------------------------
export function createWorld() {
  const rng = mulberry32(SEED);
  const w = {
    time: 0,
    screen: 'title', // title | play | over | win
    paused: false,
    over: false,
    win: false,
    wave: 0,           // 1-based while playing
    waveState: 'idle', // idle | active | clear | done
    waveTimer: 0,
    player: newPlayer(),
    enemies: [],
    bullets: [],
    missiles: [],
    rings: CFG.rings.map((r) => ({ ...r, passed: false })),
    score: 0,
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    lockTarget: null,
    lockProgress: 0,
    events: [],        // {type, ...} drained by main.js each frame
    msg: '',
    msgTimer: 0,
    rng,
    stats: { startTime: 0, endTime: 0 },
  };
  return w;
}

function newPlayer() {
  const h = CFG.world.home;
  return {
    x: h.x, y: h.y, z: h.z,
    yaw: 0,           // facing north (-z); nose = (-sin yaw, -cos yaw)
    pitch: 0, roll: 0, trim: 0,
    speed: 150, throttle: CFG.player.cruiseThrottle,
    hull: CFG.player.hull, fuel: CFG.player.fuel,
    heat: 0, overheated: false,
    missiles: CFG.player.missiles,
    gunCd: 0, invuln: 0,
    stall: false, flameout: false,
    vx: 0, vy: 0, vz: 0,
  };
}

export function startSortie(w) {
  const p = newPlayer();
  w.player = p;
  w.enemies = []; w.bullets = []; w.missiles = [];
  w.rings = CFG.rings.map((r) => ({ ...r, passed: false }));
  w.score = 0; w.kills = 0; w.shotsFired = 0; w.shotsHit = 0;
  w.wave = 0; w.waveState = 'idle'; w.waveTimer = 1.2;
  w.lockTarget = null; w.lockProgress = 0;
  w.over = false; w.win = false;
  w.screen = 'play';
  w.stats.startTime = w.time;
  w.events.push({ type: 'sortie' });
  setMsg(w, 'TALON-1, CLEARED FOR TAKEOFF — HOSTILES INBOUND');
}

function setMsg(w, text, dur = 3.2) {
  w.msg = text; w.msgTimer = dur;
}

// ---- enemies ---------------------------------------------------------------
let enemySeq = 0;
function spawnEnemy(w, waveDef, isAce, idx) {
  const rng = w.rng;
  const squads = Object.keys(ENEMY_NAMES);
  const squad = squads[(w.wave + idx) % squads.length];
  const names = ENEMY_NAMES[squad];
  const name = isAce ? ACE_NAME : names[idx % names.length];
  const a = rng() * Math.PI * 2;
  const dist = 1400 + rng() * 1100;
  const px = w.player.x, pz = w.player.z;
  const x = px + Math.sin(a) * dist;
  const z = pz - Math.abs(Math.cos(a)) * dist - 400;
  const y = clamp(320 + rng() * 520, 260, 900);
  const e = {
    id: ++enemySeq,
    name, ace: isAce,
    x, y, z,
    yaw: Math.atan2(x - px, z - pz), // face the player: nose = (-sin yaw, -cos yaw)
    pitch: 0, roll: 0,
    speed: CFG.enemy.speedMin + rng() * (CFG.enemy.speedMax - CFG.enemy.speedMin),
    hp: isAce ? CFG.enemy.aceHp : CFG.enemy.hp,
    mode: 'hunt',
    modeT: 0,
    fireCd: 1 + rng() * 1.5,
    burstLeft: 0, burstT: 0,
    evadeT: 0,
    dead: false,
  };
  w.enemies.push(e);
  return e;
}

function startWave(w, n) {
  const def = CFG.waves[n - 1];
  w.wave = n;
  w.waveState = 'active';
  for (let i = 0; i < def.count; i++) spawnEnemy(w, def, false, i);
  if (def.ace) spawnEnemy(w, def, true, def.count);
  setMsg(w, `WAVE ${n} — ${def.name} · ${w.enemies.length} HOSTILES`, 3.6);
  w.events.push({ type: 'wave', wave: n, name: def.name, count: w.enemies.length });
}

// ---- combat ----------------------------------------------------------------
function noseDir(p) {
  // Forward vector from yaw/pitch. yaw=PI faces -z.
  return {
    x: -Math.sin(p.yaw) * Math.cos(p.pitch),
    y: Math.sin(p.pitch),
    z: -Math.cos(p.yaw) * Math.cos(p.pitch),
  };
}

function fireGuns(w) {
  const p = w.player;
  const d = noseDir(p);
  const spread = 0.011;
  for (let i = 0; i < 2; i++) {
    w.bullets.push({
      x: p.x + d.x * 14, y: p.y + d.y * 14, z: p.z + d.z * 14,
      vx: d.x * 1200 + (w.rng() - 0.5) * 22 + p.vx * 0.5,
      vy: d.y * 1200 + (w.rng() - 0.5) * 22 + p.vy * 0.5,
      vz: d.z * 1200 + (w.rng() - 0.5) * 22 + p.vz * 0.5,
      life: CFG.player.gunRange / 1200,
      from: 'player', damage: CFG.player.gunDamage,
    });
  }
  p.heat = Math.min(100, p.heat + CFG.player.gunHeatPerShot);
  if (p.heat >= 100) p.overheated = true;
  w.shotsFired += 2;
  w.events.push({ type: 'gun' });
}

function fireMissile(w) {
  const p = w.player;
  const t = w.lockTarget;
  if (!t || p.missiles <= 0) return;
  p.missiles--;
  const d = noseDir(p);
  w.missiles.push({
    x: p.x + d.x * 12, y: p.y - 2, z: p.z + d.z * 12,
    vx: d.x * 220 + p.vx, vy: d.y * 220 + p.vy, vz: d.z * 220 + p.vz,
    target: t, life: 7, from: 'player',
  });
  w.lockTarget = null; w.lockProgress = 0;
  w.events.push({ type: 'missile', target: t.name });
}

function killEnemy(w, e, byMissile) {
  if (e.dead) return;
  e.dead = true;
  w.kills++;
  const pts = e.ace ? CFG.score.aceKill : (byMissile ? CFG.score.missileKill : CFG.score.gunKill);
  w.score += pts;
  w.events.push({ type: 'kill', name: e.name, ace: e.ace, points: pts, x: e.x, y: e.y, z: e.z, byMissile });
  setMsg(w, e.ace ? `${ACE_NAME} DOWN — +${pts} CR` : `SPLASHED ${e.name} — +${pts} CR`, 2.4);
}

function damagePlayer(w, dmg, cause) {
  const p = w.player;
  if (p.invuln > 0 || w.screen !== 'play') return;
  p.hull -= dmg;
  p.invuln = 0.4;
  w.events.push({ type: 'playerHit', damage: dmg, cause, hull: p.hull });
  if (p.hull <= 0) {
    p.hull = 0;
    endGame(w, false, cause);
  }
}

function endGame(w, won, cause) {
  w.screen = won ? 'win' : 'over';
  w.over = !won; w.win = won;
  w.stats.endTime = w.time;
  w.events.push({ type: won ? 'win' : 'over', cause, score: w.score, kills: w.kills });
}

// ---- per-frame step ----------------------------------------------------------
export function stepWorld(w, input, dt) {
  const p = w.player;
  w.time += dt;
  if (w.msgTimer > 0) { w.msgTimer -= dt; if (w.msgTimer <= 0) w.msg = ''; }

  if (w.screen !== 'play' || w.paused) return;

  // --- wave flow
  if (w.waveState === 'idle') {
    w.waveTimer -= dt;
    if (w.waveTimer <= 0) startWave(w, w.wave + 1);
  } else if (w.waveState === 'active' && w.enemies.length === 0) {
    const bonus = CFG.score.waveBonus(w.wave);
    w.score += bonus;
    p.fuel = Math.min(100, p.fuel + 40);
    p.hull = Math.min(100, p.hull + 20);
    p.missiles = Math.min(12, p.missiles + 3);
    w.events.push({ type: 'waveClear', wave: w.wave, bonus });
    setMsg(w, `WAVE ${w.wave} CLEAR — BONUS +${bonus} CR · FUEL +40 · HULL +20 · MISSILES +3`, 3.4);
    if (w.wave >= CFG.waves.length) {
      w.waveState = 'done';
      endGame(w, true, 'all waves clear');
      return;
    }
    w.waveState = 'idle';
    w.waveTimer = 3.0;
  }

  // --- player flight model
  const targetSpeed = lerp(CFG.player.minSpeed, CFG.player.maxSpeed, p.throttle);
  p.speed += clamp(targetSpeed - p.speed, -CFG.player.accel * dt, CFG.player.accel * dt);
  p.stall = p.speed < CFG.player.minSpeed + 12;
  const authority = p.stall ? 0.35 : 1;
  const pitchIn = clamp(input.pitch, -1, 1) + p.trim;
  p.pitch = clamp(p.pitch + pitchIn * CFG.player.pitchRate * authority * dt, -1.1, 1.1);
  if (p.stall) p.pitch -= 0.25 * dt; // nose drops in a stall
  p.roll = clamp(p.roll + clamp(input.roll, -1, 1) * CFG.player.rollRate * authority * dt, -1.35, 1.35);
  // Bank-to-turn, plus gentle auto-level when the stick is centred.
  p.yaw += -Math.sin(p.roll) * CFG.player.turnRate * dt * (p.speed / 200);
  if (Math.abs(input.roll) < 0.05) p.roll = lerp(p.roll, 0, 1.6 * dt);
  if (Math.abs(input.pitch) < 0.05 && !p.stall) p.pitch = lerp(p.pitch, 0, 0.5 * dt);
  p.throttle = p.flameout
    ? Math.max(0, p.throttle - dt * 0.5)
    : clamp(input.throttle ?? p.throttle, 0, 1);

  const d = noseDir(p);
  p.vx = d.x * p.speed; p.vy = d.y * p.speed; p.vz = d.z * p.speed;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  // Arena bounds: soft turn-back at the edges.
  const S = CFG.world.size / 2 - 300;
  if (Math.abs(p.x) > S || Math.abs(p.z) > S) {
    p.yaw = angleLerp(p.yaw, Math.atan2(p.x, p.z), 1.2 * dt);
  }
  p.y = clamp(p.y, 40, 1600);
  if (p.invuln > 0) p.invuln -= dt;

  // Fuel.
  const drain = CFG.player.fuelDrain + (p.throttle > 0.7 ? CFG.player.fuelDrainBoost * (p.throttle - 0.7) / 0.3 : 0);
  p.fuel -= drain * dt;
  if (p.fuel <= 0) {
    p.fuel = 0;
    if (!p.flameout) { p.flameout = true; setMsg(w, 'OUT OF FUEL — GLIDE TO SAFETY', 3); }
    if (p.speed < 80) endGame(w, false, 'out of fuel');
  }

  // Terrain / sea strike.
  const ground = terrainHeight(p.x, p.z);
  if (p.y < ground + 14) {
    p.y = ground + 14;
    p.pitch = Math.abs(p.pitch) * 0.6 + 0.15;
    p.speed *= 0.82;
    damagePlayer(w, CFG.player.terrainHitDamage, 'terrain');
    w.events.push({ type: 'terrainHit', x: p.x, y: p.y, z: p.z });
  }

  // Rings (fly-through bonus).
  for (const r of w.rings) {
    if (r.passed) continue;
    const dx = p.x - r.x, dy = p.y - r.y, dz = p.z - r.z;
    if (dx * dx + dy * dy + dz * dz < 55 * 55) {
      r.passed = true;
      w.score += CFG.score.ring;
      w.events.push({ type: 'ring', points: CFG.score.ring, x: r.x, y: r.y, z: r.z });
      setMsg(w, `RING +${CFG.score.ring} CR`, 1.6);
    }
  }

  // --- guns
  p.gunCd -= dt;
  p.heat = Math.max(0, p.heat - CFG.player.gunCoolRate * dt);
  if (p.overheated && p.heat < 35) p.overheated = false;
  if (input.gun && !p.overheated && p.gunCd <= 0) {
    p.gunCd = 1 / CFG.player.gunFireRate;
    fireGuns(w);
  }

  // --- missile lock
  let best = null, bestScore = 0;
  for (const e of w.enemies) {
    const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - p.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > CFG.player.lockRange) continue;
    const dot = (dx * d.x + dy * d.y + dz * d.z) / dist;
    const ang = Math.acos(clamp(dot, -1, 1));
    if (ang < CFG.player.lockAngle) {
      const s = (1 - ang / CFG.player.lockAngle) * (1 - dist / (CFG.player.lockRange * 1.4));
      if (s > bestScore) { bestScore = s; best = e; }
    }
  }
  if (best && best === w.lockTarget) {
    w.lockProgress = Math.min(1, w.lockProgress + dt / CFG.player.lockTime);
    if (w.lockProgress >= 1 && !w._lockBeeped) { w._lockBeeped = true; w.events.push({ type: 'lockTone' }); }
  } else {
    w.lockTarget = best;
    w.lockProgress = best ? dt / CFG.player.lockTime : 0;
    w._lockBeeped = false;
  }
  if (input.missile && w.lockTarget && w.lockProgress >= 1) fireMissile(w);

  // --- bullets
  for (let i = w.bullets.length - 1; i >= 0; i--) {
    const b = w.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.life -= dt;
    let dead = b.life <= 0 || b.y < terrainHeight(b.x, b.z);
    if (!dead) {
      if (b.from === 'player') {
        for (const e of w.enemies) {
          if (e.dead) continue;
          const dx = e.x - b.x, dy = e.y - b.y, dz = e.z - b.z;
          if (dx * dx + dy * dy + dz * dz < 18 * 18) {
            e.hp -= b.damage;
            w.shotsHit++;
            w.events.push({ type: 'hit', x: e.x, y: e.y, z: e.z, hp: e.hp });
            if (e.hp <= 0) killEnemy(w, e, false);
            dead = true;
            break;
          }
        }
      } else {
        const dx = p.x - b.x, dy = p.y - b.y, dz = p.z - b.z;
        if (dx * dx + dy * dy + dz * dz < 13 * 13) {
          damagePlayer(w, b.damage, 'gunfire');
          dead = true;
        }
      }
    }
    if (dead) w.bullets.splice(i, 1);
  }

  // --- missiles
  for (let i = w.missiles.length - 1; i >= 0; i--) {
    const m = w.missiles[i];
    m.life -= dt;
    const t = m.target;
    if (t && !t.dead) {
      const dx = t.x - m.x, dy = t.y - m.y, dz = t.z - m.z;
      const dist = Math.hypot(dx, dy, dz);
      const sp = Math.hypot(m.vx, m.vy, m.vz) || 1;
      const want = { x: dx / dist, y: dy / dist, z: dz / dist };
      const cur = { x: m.vx / sp, y: m.vy / sp, z: m.vz / sp };
      const turn = Math.min(1, 2.4 * dt);
      const nx = lerp(cur.x, want.x, turn), ny = lerp(cur.y, want.y, turn), nz = lerp(cur.z, want.z, turn);
      const nl = Math.hypot(nx, ny, nz) || 1;
      const ns = Math.min(CFG.player.missileSpeed, sp + 260 * dt);
      m.vx = nx / nl * ns; m.vy = ny / nl * ns; m.vz = nz / nl * ns;
      if (dist < 18) {
        t.hp -= CFG.player.missileDamage;
        w.shotsHit++;
        w.events.push({ type: 'missileHit', x: t.x, y: t.y, z: t.z });
        if (t.hp <= 0) killEnemy(w, t, true);
        m.life = 0;
      }
    }
    m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    if (m.life <= 0 || m.y < terrainHeight(m.x, m.z)) {
      if (m.life <= 0 && m.target && !m.target.dead) w.events.push({ type: 'missileMiss', x: m.x, y: m.y, z: m.z });
      w.missiles.splice(i, 1);
    }
  }

  // --- enemies
  for (const e of w.enemies) {
    if (e.dead) continue;
    // Evade only once the player has a near-full lock — constant jinking
    // against a partial lock made the last bandit of a wave unkillable.
    if (w.lockTarget === e && w.lockProgress > 0.9) e.evadeT = CFG.enemy.evadeTime;
    if (e.evadeT > 0) {
      e.evadeT -= dt;
      e.mode = 'evade';
    } else if (e.mode === 'extend') {
      e.modeT -= dt;
      if (e.modeT <= 0) e.mode = 'hunt';
    } else {
      e.mode = 'hunt';
      // After a close pass, extend away from the player: this opens the
      // tail-chase window where guns and missiles can actually connect.
      const pdx = p.x - e.x, pdy = p.y - e.y, pdz = p.z - e.z;
      if (Math.hypot(pdx, pdy, pdz) < 350) {
        e.mode = 'extend';
        e.modeT = 3.2 + w.rng() * 1.2;
      }
    }
    // Desired heading: hunt the player, extend away, evade away from them.
    let tx, ty, tz;
    if (e.mode === 'extend') {
      const ax = e.x - p.x, ay = 0, az = e.z - p.z;
      const al = Math.hypot(ax, az) || 1;
      tx = e.x + (ax / al) * 1200; ty = e.y + 120; tz = e.z + (az / al) * 1200;
    } else if (e.mode === 'evade') {
      tx = e.x + (e.x - p.x); ty = e.y + 220; tz = e.z + (e.z - p.z);
    } else {
      const lead = 0.55;
      tx = p.x + p.vx * lead + (w.rng() - 0.5) * 120;
      ty = p.y + p.vy * lead;
      tz = p.z + p.vz * lead + (w.rng() - 0.5) * 120;
    }
    const dx = tx - e.x, dy = ty - e.y, dz = tz - e.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.5);
    e.yaw = angleLerp(e.yaw, wantYaw, (e.mode === 'evade' ? 1.5 : 0.65) * dt);
    e.pitch = lerp(e.pitch, wantPitch, 1.4 * dt);
    const wantRoll = clamp(angleDiff(e.yaw, wantYaw) * -1.4, -1.2, 1.2);
    e.roll = lerp(e.roll, wantRoll, 2 * dt);
    e.speed = clamp(e.speed + (e.mode === 'evade' ? 30 : -10) * dt, CFG.enemy.speedMin, CFG.enemy.speedMax);
    const ed = {
      x: -Math.sin(e.yaw) * Math.cos(e.pitch),
      y: Math.sin(e.pitch),
      z: -Math.cos(e.yaw) * Math.cos(e.pitch),
    };
    e.x += ed.x * e.speed * dt;
    e.y = clamp(e.y + ed.y * e.speed * dt, 120, 1100);
    e.z += ed.z * e.speed * dt;
    const g = terrainHeight(e.x, e.z);
    if (e.y < g + 40) { e.y = g + 40; e.pitch = Math.abs(e.pitch) + 0.1; }
    // Fire at the player.
    e.fireCd -= dt;
    if (e.burstLeft > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burstT = CFG.enemy.burstGap;
        e.burstLeft--;
        const pdx = p.x - e.x, pdy = p.y - e.y, pdz = p.z - e.z;
        const dist = Math.hypot(pdx, pdy, pdz) || 1;
        const leadT = dist / 800;
        const ax = (p.x + p.vx * leadT - e.x) / dist + (w.rng() - 0.5) * 0.22;
        const ay = (p.y + p.vy * leadT - e.y) / dist + (w.rng() - 0.5) * 0.22;
        const az = (p.z + p.vz * leadT - e.z) / dist + (w.rng() - 0.5) * 0.22;
        w.bullets.push({
          x: e.x + ax * 12, y: e.y + ay * 12, z: e.z + az * 12,
          vx: ax * 700, vy: ay * 700, vz: az * 700,
          life: 1.4, from: 'enemy', damage: CFG.enemy.bulletDamage,
        });
        w.events.push({ type: 'enemyGun', x: e.x, y: e.y, z: e.z });
      }
    } else if (e.fireCd <= 0 && e.mode === 'hunt') {
      const pdx = p.x - e.x, pdy = p.y - e.y, pdz = p.z - e.z;
      const dist = Math.hypot(pdx, pdy, pdz);
      if (dist < CFG.enemy.fireRange) {
        const fwd = { x: -Math.sin(e.yaw), y: 0, z: -Math.cos(e.yaw) };
        const dot = (pdx * fwd.x + pdz * fwd.z) / (dist || 1);
        if (dot > Math.cos(CFG.enemy.fireAngle)) {
          e.burstLeft = CFG.enemy.burstShots;
          e.burstT = 0;
          e.fireCd = CFG.enemy.burstCooldown + w.rng() * 1.5;
        }
      }
      if (e.fireCd <= 0) e.fireCd = 0.5;
    }
  }
  w.enemies = w.enemies.filter((e) => !e.dead);
}

// ---- autopilot (verification + demo): flies, shoots, locks, wins --------------
export function autopilotInput(w) {
  const p = w.player;
  const input = { pitch: 0, roll: 0, throttle: 0.75, gun: false, missile: false };
  // Nearest live enemy, else fly towards the next ring / north.
  let target = null, best = 1e12;
  for (const e of w.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
    if (d < best) { best = d; target = e; }
  }
  let tx, ty, tz;
  if (target) {
    // Lead the target: aim where it will be when the bullets arrive.
    const evx = -Math.sin(target.yaw) * Math.cos(target.pitch) * target.speed;
    const evy = Math.sin(target.pitch) * target.speed;
    const evz = -Math.cos(target.yaw) * Math.cos(target.pitch) * target.speed;
    const tof = Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z) / 1000;
    tx = target.x + evx * tof; ty = target.y + evy * tof; tz = target.z + evz * tof;
  } else {
    const ring = w.rings.find((r) => !r.passed);
    if (ring) { tx = ring.x; ty = ring.y; tz = ring.z; }
    else { tx = p.x - Math.sin(p.yaw) * 500; ty = p.y; tz = p.z - Math.cos(p.yaw) * 500; }
  }
  const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z;
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.5);
  const dyaw = angleDiff(p.yaw, wantYaw);
  const dPitch = wantPitch - p.pitch;
  // Steer: roll into the turn (positive roll turns right, i.e. decreases yaw),
  // pitch towards the target.
  input.roll = clamp(-dyaw * 1.6, -1, 1);
  input.pitch = clamp(dPitch * 2.2, -1, 1);
  // Keep the nose up when slow, dive when the target is far below.
  if (p.speed < 130) input.pitch = Math.max(input.pitch, 0.15);
  // Guns when the target is roughly ahead and in range.
  if (target) {
    const d = {
      x: -Math.sin(p.yaw) * Math.cos(p.pitch),
      y: Math.sin(p.pitch),
      z: -Math.cos(p.yaw) * Math.cos(p.pitch),
    };
    const dist = Math.hypot(dx, dy, dz);
    const dot = (dx * d.x + dy * d.y + dz * d.z) / (dist || 1);
    // Hold the trigger only once the nose is settled on the lead point:
    // spraying while the nose is still swinging wastes the burst.
    if (dot > 0.985 && dist < 700) input.gun = true;
    if (w.lockTarget === target && w.lockProgress >= 1) input.missile = true;
    input.throttle = dist > 250 ? 0.95 : 0.55;
    // Gentle defensive weave while closing from far out (not while shooting):
    // it breaks the enemy's lead prediction.
    if (dot < 0.9 && dist > 900) input.roll = clamp(input.roll + Math.sin(w.time * 1.4) * 0.25, -1, 1);
  }
  // Terrain safety: pull up hard when low.
  const ground = terrainHeight(p.x, p.z);
  if (p.y < ground + 120) input.pitch = Math.max(input.pitch, 0.6);
  return input;
}
