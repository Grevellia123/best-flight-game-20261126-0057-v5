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

## v5.0 — 27 November 2026
- The make.fun bounty entry: T-7 Talon vs the Crimson Wing, 5 waves ending
  in the Crimson Ace duel, guns + lock-on missiles, full HUD + radar,
  chase/cockpit cameras, Low/Medium/High graphics with auto step-down,
  touch controls, and real jet/gun/missile/flyby recordings with Doppler
  pitch.
- Lobby BGM on first tap, audio primed at load, settings panel with
  sound/resolution, one-tap mute.
