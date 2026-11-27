// TALON STRIKE — background music is the user's MP3 track
// (game/assets/vector-locked.mp3, looped). Engine, gun and missile sounds
// are real recordings (game/assets/jet-engine.mp3 loop, machine-gun.mp3
// burst, missile.mp3 launch) with the old synthesized sounds as fallback
// if a file fails to load or decode, so the game is never silent.
// Explosions, lock tones and UI sounds are still synthesized. Moods
// (title / play / danger / win / over) only change the music level now —
// the track itself is one continuous loop.
export function createAudio() {
  let ctx = null;
  let master = null, musicGain = null, sfxGain = null, engineGain = null;
  let muted = false;
  let mood = 'title';
  let engineOsc1 = null, engineOsc2 = null, engineFilter = null;
  let seqTimer = null, nextNoteTime = 0, step = 0;
  let noiseBuf = null;
  // MP3 track state.
  let trackBuf = null, trackSrc = null, trackStarted = false;
  let trackFailed = false, trackStartCtx = 0;
  // Real SFX state (MP3 buffers; synth fallback if a file fails).
  let engineBuf = null, engineSrc = null, engineUseMp3 = false, engineFailed = false;
  let gunBuf = null, gunFailed = false, lastGunPlay = -1;
  let mslBuf = null, mslFailed = false;
  let gunPlays = 0, mslPlays = 0;

  const BPM = { title: 96, play: 126, danger: 148, win: 118, over: 62 };
  // Am – F – C – G, one bar each. Bass roots (Hz) + lead pentatonic (A C D E G).
  const BASS = [110, 87.31, 130.81, 98];
  const LEAD = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    // Title / game-over start quieter than gameplay; applyMusicLevel also
    // enforces this whenever the mood changes or the track starts.
    musicGain.gain.value = (mood === 'title' || mood === 'over') ? 0.22 : 0.34;
    musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    engineGain = ctx.createGain(); engineGain.gain.value = 0; engineGain.connect(master);
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 320;
    engineFilter.connect(engineGain);
    engineOsc1 = ctx.createOscillator(); engineOsc1.type = 'sawtooth'; engineOsc1.frequency.value = 55;
    engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'sawtooth'; engineOsc2.frequency.value = 82.5;
    engineOsc1.connect(engineFilter); engineOsc2.connect(engineFilter);
    engineOsc1.start(); engineOsc2.start();
    // White-noise buffer for hats / explosions / wind.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextNoteTime = ctx.currentTime + 0.1;
    seqTimer = setInterval(schedule, 25);
    loadTrack();
    loadSfx();
    return true;
  }

  // Load the MP3 BGM in the background. While it loads (or if it fails),
  // the synthesized sequencer keeps playing; once decoded, the track takes
  // over and the sequencer stops so the two never play together.
  function loadTrack() {
    if (trackBuf || trackFailed || !ctx) return;
    fetch('assets/vector-locked.mp3')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => { trackBuf = decoded; startTrack(); })
      .catch(() => { trackFailed = true; });
  }

  function startTrack() {
    if (!trackBuf || trackStarted || !ctx || !musicGain) return;
    trackSrc = ctx.createBufferSource();
    trackSrc.buffer = trackBuf;
    trackSrc.loop = true;
    trackSrc.connect(musicGain);
    trackSrc.start();
    trackStartCtx = ctx.currentTime;
    trackStarted = true;
    if (seqTimer) { clearInterval(seqTimer); seqTimer = null; }
    applyMusicLevel();
  }

  // Load the three real SFX recordings in the background. The engine loop
  // swaps in as soon as it decodes (the synth oscillators stop so the two
  // never double up); gun / missile play per event once their buffers are
  // ready. Any failure leaves that sound on its synth fallback.
  function loadSfx() {
    if (!ctx) return;
    fetch('assets/jet-engine.mp3')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => { engineBuf = decoded; startEngineLoop(); })
      .catch(() => { engineFailed = true; });
    fetch('assets/machine-gun.mp3')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => { gunBuf = decoded; })
      .catch(() => { gunFailed = true; });
    fetch('assets/missile.mp3')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => { mslBuf = decoded; })
      .catch(() => { mslFailed = true; });
  }

  function startEngineLoop() {
    if (!engineBuf || engineUseMp3 || !ctx || !engineFilter) return;
    try {
      engineSrc = ctx.createBufferSource();
      engineSrc.buffer = engineBuf;
      engineSrc.loop = true;
      engineSrc.connect(engineFilter);
      engineSrc.start();
      engineUseMp3 = true;
      // Synth oscillators are no longer needed — stop them so the roar
      // is the only engine sound. (They cannot be restarted, but the MP3
      // loop is the live path from here on.)
      try { engineOsc1.stop(); engineOsc2.stop(); } catch { /* already stopped */ }
      engineOsc1 = null; engineOsc2 = null;
    } catch {
      engineFailed = true;
    }
  }

  // Title / game-over play the track a little quieter; gameplay full level.
  function applyMusicLevel() {
    if (!musicGain || !ctx) return;
    const quiet = mood === 'title' || mood === 'over';
    musicGain.gain.setTargetAtTime(quiet ? 0.22 : 0.34, ctx.currentTime, 0.1);
  }

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / BPM[mood] / 2; // 8th notes
    while (nextNoteTime < ctx.currentTime + 0.12) {
      playStep(step, nextNoteTime, spb);
      step = (step + 1) % 32;
      nextNoteTime += spb;
    }
  }

  function tone(freq, t, dur, type, vol, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(t, dur, vol, filterFreq, type = 'bandpass') {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function playStep(s, t, spb) {
    const bar = Math.floor(s / 8) % 4;
    const inBar = s % 8;
    const root = BASS[bar];
    const danger = mood === 'danger';
    const quiet = mood === 'title' || mood === 'over';
    // Kick on quarters (skip on title/over).
    if (!quiet && inBar % 2 === 0) tone(danger ? 150 : 120, t, 0.12, 'sine', 0.5, musicGain);
    // Bass: root on 0 and 4, fifth on 6.
    if (inBar === 0 || inBar === 4) tone(root / 2, t, spb * 1.8, 'triangle', quiet ? 0.2 : 0.42, musicGain);
    if (inBar === 6) tone(root * 0.75, t, spb, 'triangle', 0.25, musicGain);
    // Hats: offbeats, denser when in danger.
    if ((inBar % 2 === 1) || (danger && inBar % 2 === 0)) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(danger ? 0.1 : 0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(f); f.connect(g); g.connect(musicGain);
      src.start(t); src.stop(t + 0.05);
    }
    // Lead: sparse pentatonic riff, pattern fixed per bar.
    const riff = [0, -1, 2, -1, 4, -1, 3, 5];
    const li = riff[inBar];
    if (li >= 0 && !quiet) {
      const f = LEAD[(li + bar * 2) % LEAD.length] * (danger ? 1 : 0.5);
      tone(f, t, spb * 0.9, 'square', danger ? 0.1 : 0.07, musicGain);
    }
    if (mood === 'win' && inBar === 0) tone(root * 2, t, spb * 3, 'sine', 0.22, musicGain);
  }

  const api = {
    // Prime on page load: create the (suspended) context and start the
    // MP3/SFX downloads immediately, so the track is usually decoded by
    // the time the user taps. No sound plays until a gesture resumes the
    // context — this is preloading, not autoplay.
    prime() { ensure(); },
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') void ctx.resume();
      startTrack(); // in case the track decoded while the context was suspended
    },
    setMood(m) { mood = m; applyMusicLevel(); },
    setMuted(b) {
      muted = b;
      if (master) master.gain.value = b ? 0 : 0.85;
    },
    get muted() { return muted; },
    engine(speed, throttle, active) {
      if (!ctx || !engineGain) return;
      const t = ctx.currentTime;
      // The MP3 roar is louder than the old synth hum, so its gain tops
      // out a little lower; the shape (idle → full throttle) is the same.
      const target = active ? (engineUseMp3 ? 0.045 + throttle * 0.07 : 0.05 + throttle * 0.075) : 0;
      engineGain.gain.setTargetAtTime(target, t, 0.1);
      if (engineUseMp3 && engineSrc) {
        // Throttle / speed drive the loop like a real turbine spooling:
        // playback rate rises with throttle, filter opens with throttle.
        const rate = Math.max(0.85, Math.min(1.35, 0.9 + throttle * 0.3 + speed * 0.0004));
        engineSrc.playbackRate.setTargetAtTime(rate, t, 0.08);
      } else if (engineOsc1 && engineOsc2) {
        const f = 42 + speed * 0.28 + throttle * 30;
        engineOsc1.frequency.setTargetAtTime(f, t, 0.08);
        engineOsc2.frequency.setTargetAtTime(f * 1.5, t, 0.08);
      }
      engineFilter.frequency.setTargetAtTime(240 + throttle * 900, t, 0.1);
    },
    gun() {
      if (!ctx) return;
      // The burst file is 2 s with 3 bursts inside, but the guns fire at
      // 16 shots/s — replaying it per shot would stack dozens of bursts.
      // Play at most one burst per 0.45 s; while it is sounding, extra
      // shots stay silent (the burst is still audible).
      if (gunBuf) {
        const t = ctx.currentTime;
        if (t - lastGunPlay >= 0.45) {
          lastGunPlay = t;
          const src = ctx.createBufferSource();
          src.buffer = gunBuf;
          src.connect(sfxGain);
          src.start(t);
          gunPlays++;
        }
        return;
      }
      // Still loading or failed: synth fallback so shots are never silent.
      noise(ctx.currentTime, 0.07, 0.22, 2400, 'highpass');
      tone(190, ctx.currentTime, 0.05, 'square', 0.08, sfxGain);
    },
    enemyGun() { if (ctx) noise(ctx.currentTime, 0.05, 0.05, 1800, 'highpass'); },
    missile() {
      if (!ctx) return;
      if (mslBuf) {
        const src = ctx.createBufferSource();
        src.buffer = mslBuf;
        src.connect(sfxGain);
        src.start(ctx.currentTime);
        mslPlays++;
        return;
      }
      // Still loading or failed: synth fallback.
      const t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      src.connect(f); f.connect(g); g.connect(sfxGain);
      src.start(t); src.stop(t + 0.6);
    },
    explosion(big) {
      if (!ctx) return;
      const t = ctx.currentTime;
      noise(t, big ? 1.1 : 0.7, big ? 0.7 : 0.45, 900, 'lowpass');
      tone(70, t, big ? 0.9 : 0.5, 'sine', 0.5, sfxGain);
      tone(48, t + 0.05, 0.7, 'sine', 0.4, sfxGain);
    },
    lock() {
      if (!ctx) return;
      tone(1320, ctx.currentTime, 0.09, 'sine', 0.16, sfxGain);
      tone(1320, ctx.currentTime + 0.12, 0.09, 'sine', 0.16, sfxGain);
    },
    lockTone() { if (ctx) tone(1760, ctx.currentTime, 0.12, 'sine', 0.14, sfxGain); },
    kill() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(660, t, 0.1, 'triangle', 0.2, sfxGain);
      tone(990, t + 0.09, 0.16, 'triangle', 0.2, sfxGain);
    },
    ring() {
      if (!ctx) return;
      tone(880, ctx.currentTime, 0.12, 'sine', 0.16, sfxGain);
      tone(1174, ctx.currentTime + 0.1, 0.18, 'sine', 0.16, sfxGain);
    },
    waveClear() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.1, 0.22, 'triangle', 0.2, sfxGain));
    },
    hit() { if (ctx) noise(ctx.currentTime, 0.08, 0.14, 1200, 'bandpass'); },
    click() { if (ctx) tone(740, ctx.currentTime, 0.06, 'sine', 0.12, sfxGain); },
    warn() { if (ctx) tone(440, ctx.currentTime, 0.18, 'square', 0.1, sfxGain); },
    // Read-only state for debugging / automated checks.
    get ctxState() { return ctx ? ctx.state : 'none'; },
    get trackState() {
      if (trackFailed) return 'fallback';
      if (trackStarted) return 'playing';
      if (trackBuf) return 'ready';
      return 'loading';
    },
    get trackActive() { return trackStarted; },
    get trackLoop() { return trackSrc ? trackSrc.loop : false; },
    get trackTime() {
      if (!trackStarted || !ctx || !trackBuf) return 0;
      return (ctx.currentTime - trackStartCtx) % trackBuf.duration;
    },
    get trackDuration() { return trackBuf ? trackBuf.duration : 0; },
    // True while the synthesized sequencer interval is running — i.e.
    // the fallback BGM is live (MP3 still loading, or failed to load).
    get seqActive() { return !!seqTimer; },
    get masterLevel() { return master ? master.gain.value : null; },
    // Real-SFX state for debugging / automated checks.
    get engineState() {
      if (engineUseMp3) return 'mp3';
      if (engineFailed) return 'fallback';
      return 'loading';
    },
    get gunState() {
      if (gunBuf) return 'mp3';
      if (gunFailed) return 'fallback';
      return 'loading';
    },
    get missileState() {
      if (mslBuf) return 'mp3';
      if (mslFailed) return 'fallback';
      return 'loading';
    },
    get engineRate() { return engineSrc ? engineSrc.playbackRate.value : null; },
    get engineLevel() { return engineGain ? engineGain.gain.value : null; },
    get enginePlaying() { return engineUseMp3 && !!engineSrc; },
    get gunPlays() { return gunPlays; },
    get missilePlays() { return mslPlays; },
  };
  if (typeof window !== 'undefined') window.__talonAudio = api;
  return api;
}
