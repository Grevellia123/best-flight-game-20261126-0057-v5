# TALON STRIKE — Changelog

## v5.1 — 27 November 2026

### Sound on by default, music in the lobby
- The settings button now says **SOUND ON** from the start. It used to read
  SOUND OFF before your first tap, even though nothing was muted — it was
  showing the browser's suspended audio, not the setting.
- Background music now starts in the lobby on your first tap. The old unlock
  only listened once, and on Android that first touch is often a scroll,
  which never resumed the audio — so the music only started when you hit
  FLY. The unlock now retries on every tap, click, or keypress until the
  music is actually playing.
- When muted, the same button reads SOUND OFF — not MUTED — so the pair is
  SOUND ON / SOUND OFF.

### Stereo Doppler
- Doppler is no longer just pitch — it's directional. A bandit passing on
  your right now sounds dominant in your right ear, and the roar sweeps
  across as it crosses in front of you.
- Enemy gunfire is panned to the shooter's side, and the flyby whoosh stays
  on the side the jet passes on.
- Your own engine, guns, and the music stay centred, as they should.

### New gun sound
- The cannon now fires the M4 carbine from https://youtu.be/Vpi2EBTAOjc
  (Sound Effects Factory, CC0).
- Kept deliberately quiet: the clip is normalized to −20 LUFS with a 0.7
  in-game gain — about 17 dB below the old 50-cal burst — so it sits under
  the engine and music instead of drowning them out.

## 27 November 2026 — Sound, visuals, and mute

- Bloom and god rays; Vector Locked BGM; real engine, gun, and missile
  recordings; mute fix.
- Audio assets added (BGM + engine/gun/missile).
- Lobby BGM on first tap, audio primed at load; low-end performance — no
  MSAA below High, capability-based default quality, faster step-down on
  the title screen.
- One-tap mute; settings panel with sound and resolution; Doppler on the
  enemy engine, gun, missile, and flyby.
- Jet flyby sound added for enemy close passes.

## 27 November 2026 — Phone HUD fixes

- Fixed HUD overlaps in phone landscape (top bar, tapes, THR/FIRE/MSL,
  radar).
- Fixed title screen clipping and remaining phone HUD overlaps (dvh tapes,
  narrow wave banner, smaller bars).
- Deleted the THR buttons, moved the bars bottom-left, added a fullscreen
  button.
- Screenshots re-rendered with the fixed HUD, then again with the bloom
  version.

## 26 November 2026 — v5.0

- TALON STRIKE v5 lands: 3D air-combat game for the make.fun
  best-flight-game bounty — T-7 Talon vs the Crimson Wing, 5 waves ending
  in the Crimson Ace duel, guns + lock-on missiles, full HUD + radar,
  chase/cockpit cameras, Low/Medium/High graphics with auto step-down,
  touch controls.
- Screenshots added; main.ts header authored (kit check fix).
