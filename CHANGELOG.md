# TALON STRIKE — Changelog

## v5.4 — 27 November 2026

### Tighter missile launch
- The missile whoosh no longer lingers: same 0.35 peak level, but it
  now holds full level for 0.15 s, fades out by 1.4 s, and is stopped
  at 1.5 s instead of playing the full 2.9 s clip. The pitch fall is
  faster too (0.30 s, was 0.45 s), so the launch sounds short and
  punchy, not washy. The synth fallback is shortened to match.

### Enemy M4 with panning
- Enemy gunfire is now the same M4 recording as your own gun — a
  short 0.3 s crack per shot — instead of the old synth tick.
- It is panned hard to the shooter's side and re-panned every shot,
  so a bandit crossing in front of you sweeps its fire from one ear
  to the other. Pitch still follows the shooter's Doppler, and the
  level now falls with distance: loud on one side up close, a faint
  pop on that side from far away.

## v5.3 — 27 November 2026

### Doppler on the M4 gun and the missile
- The M4 burst now has Doppler, like the enemy gun: its pitch follows
  the bandit you're shooting at — higher while the bandit closes in,
  lower while it pulls away — and it is panned to the target's side.
  Even with no lock, each burst sweeps down as it flies downrange.
- The missile launch now has true Doppler too, not just a fixed fall:
  it starts near the target's Doppler pitch (higher at a closing
  bandit, lower at one running away), is panned to the target's side,
  then falls to the receding pitch as it pulls away from you.

### Quieter missiles — again
- The missile launch is lowered again, from 0.5 gain to 0.35 (about
  −9 dB, roughly −3 dB quieter than v5.2). The synth fallback is
  lowered to match (0.25 → 0.18).

### Lobby music no longer needs SOUND ON
- Background music now starts on your first tap anywhere — scrolling
  to Settings, tapping the title, dragging a volume slider. It used
  to stay silent until you pressed SOUND ON, because on Android the
  first touch is often a scroll drag and Chrome swallows that resume.
  The unlock now retries for 3 seconds after a gesture, listens for
  touchstart / touchend / pointerup as well, and (re)starts the track
  the moment audio actually starts running.
- Pressing SOUND ON when it already says SOUND ON no longer mutes the
  game. If the lobby is silent but the setting is ON, that tap now
  just turns the sound on. It only toggles OFF once the music is
  actually playing.
- The Settings panel now says so: "Music starts on your first tap
  anywhere — you don't need to press SOUND ON."

## v5.2 — 27 November 2026

### Quieter missiles
- The missile launch whoosh now plays at half volume (0.5 gain, about
  −6 dB), and the synth fallback is lowered to match. It was the loudest
  launch sound in the game; it now sits under the engine like the gun
  does.

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
