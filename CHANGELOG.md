# TALON STRIKE — Changelog

## v5.14 — 27 November 2026

### Smaller reticle, smooth coastline, antialiasing setting
- The aim reticle (cursor) is smaller again: ring 20 → 12 px
  (16 px when locked), shorter ticks, smaller centre dot and lock
  arc; the hit marker shrank with it. This is the v5.12 size, but
  without the v5.12 performance changes — those stay revoked.
- Smooth coastline: the high-frequency hills used to make the
  shoreline a jagged staircase on the 80 m terrain mesh, and the
  shallow waterline crawled and shimmered — "vibrated" — as the
  plane flew. The hills now fade out where the smooth terrain is
  near sea level, but only near water (the coast strip and the
  river banks), so inland valleys keep their hills. The shoreline
  now follows the smooth low-frequency field: measured roughness
  of the traced shore halved (100 m → 53 m), and the inland hills
  are unchanged.
- Antialiasing setting: the settings panel has a new
  ANTIALIASING button — AUTO (on for HIGH only, as before), ON or
  OFF. It smooths jagged edges on the coastline, runway and jet.
  It is saved like the other settings, and it takes effect when
  you reopen the game (WebGL fixes it when the game loads). If ON
  feels slow on a phone, set it back to AUTO.

## v5.13 — 27 November 2026

### Reverted v5.12
- The v5.12 performance pass (object pooling, shared jet geometry,
  compass offscreen cache) and the smaller reticle are revoked at
  the user's request. The game is back to v5.11's code exactly:
  per-spawn jet geometries are back, the compass draws its ticks
  and labels every frame again, and the aim reticle is back to its
  20 px ring. No gameplay change either way.

## v5.12 — 27 November 2026

### Performance pass (try it — revert if it's bad) + smaller reticle
- Object pooling and zero loop allocation: bullets, missiles and
  enemies are now reused from free lists instead of being created
  and thrown away every shot and wave; the sim reuses scratch
  vectors instead of allocating a fresh {x, y, z} on every nose,
  missile-steering and enemy step; the per-frame enemies.filter()
  array is replaced by in-place compaction; missile trails use a
  ring buffer instead of push/shift arrays; the HUD project()
  result, the drawHud options, the tracer colours and the reticle
  tick directions are all hoisted out of the loop.
- Shared jet geometry (the InstancedMesh / .dispose() fix): every
  jet used to build its own geometries, materials and glow texture,
  and enemy jets were removed from the scene without .dispose() —
  each wave leaked ~15 GPU buffers per bandit. All jets now share
  one set of geometries, materials are cached per colour set, and
  the glow texture is built once, so spawning a bandit allocates no
  GPU state and removing one needs no dispose. True InstancedMesh
  was skipped: each jet's flame scales and glow opacity are per-jet
  and the glow is a Sprite — instancing would need a custom shader
  for no measurable gain at ~6 jets. Rings pulse opacity per ring
  and clouds are Sprites, so neither can instance either.
- Canvas 2D offscreen cache: the compass ticks and heading labels
  are drawn once onto an offscreen strip and blitted each frame
  instead of ~25 strokes and 8 fillText calls per frame.
- Already in the game, so not changed here: pixel-ratio caps per
  quality preset (Low 0.75 / Medium 1.0 / High 2.0) applied
  immediately by the quality menu with no reload and no progress
  reset; frame time clamped at 0.05 s; no shadow maps exist to
  disable (the game runs on two lights); the spatial grid was
  skipped — at most ~6 enemies and ~20 bullets, the linear
  distance-squared checks are already cheaper than maintaining a
  grid.
- The aim reticle (cursor) is smaller: ring 20 → 12 px (16 px when
  locked), shorter ticks, smaller centre dot and lock arc; the hit
  marker shrank with it.
- Gameplay is unchanged: same flight model, same waves, same
  scoring. If this build feels worse in any way, say so and it
  will be reverted.

## v5.11 — 27 November 2026

### THR buttons deleted, jet a little lower
- The THR ▲ / ▼ touch buttons are deleted, at the user's request.
  Touch has no throttle control again, so on a phone the throttle
  stays at its cruise default and the IAS tape sits at 377 kt —
  the keyboard (Shift/Ctrl) and mouse wheel still change the
  throttle on desktop.
- The jet sits a little lower in the frame: the chase camera rides
  higher above the jet's line (4.5 m instead of 3.5 m), so the
  look-down angle steepens from ~14° to ~18°. Distance (14 m) and
  the left shift (~12% of frame width) are unchanged.

## v5.10 — 27 November 2026

### Chase camera closer again, jet further left
- The v5.9 framing (16 m behind, jet a little left) wasn't close or
  left enough, so it is replaced: the chase camera is now 14 m
  behind the jet, at the same look-down angle, and the jet sits
  further left of centre — about 12% of the frame width left of
  centre on every screen. The jet now spans about half the frame
  width at 16:9. The cockpit camera and the title-screen orbit are
  unchanged.

## v5.9 — 27 November 2026

### Touch throttle, closer chase camera, pause settings closed
- Touch throttle: new THR ▲ / ▼ hold buttons beside the IAS tape, so
  the speed can finally be changed on a phone — hold ▲ to speed up,
  ▼ to slow down (same rate as Shift/Ctrl on a keyboard). Touch had
  no throttle control at all, so the throttle sat at its 0.62 cruise
  default and the IAS tape never moved — it read 377 kt for the whole
  sortie. The tape itself was fine; the speed just never changed.
- The chase camera is closer still: 20 m behind the jet to 16 m, at
  the same look-down angle, and the jet sits a little left of centre
  — the camera dollies right of the jet's line, so the jet reads
  left of frame, by the same ~6% of the frame width on every screen
  (a fixed distance would be a little left on a wide screen but a
  quarter of the frame on a portrait phone). The jet now spans about
  half the frame width at 16:9. The cockpit camera and the
  title-screen orbit are unchanged.
- The pause screen's settings panel now starts closed — tap
  ⚙ SETTINGS to open it. It used to open on every pause.

## v5.8 — 27 November 2026

### Minimal HUD, jet up close
- The in-flight HUD is now minimal: the wave pill, the "FIRST CONTACT
  — 3 HOSTILES" line, the message banner, the kill feed and the
  fuel/hull/heat/missile bars no longer sit on dark panels — the text
  floats over the scene with a soft shadow, so you see more sky and
  ground. The compass, the speed and altitude tapes and the radar
  lost their panel backgrounds too; the radar is now a faint disc.
  Buttons (COCKPIT, mute, pause, fullscreen, FIRE, MSL) keep a faint
  fill so they still read as buttons over a bright sky. Menus and
  screens are unchanged.
- The ALT tape (and the IAS tape, to match) is now 44 px wide — the
  same width as the square top-right buttons above it — instead of
  62 px. The tapes were redrawn for the narrower width: shorter
  ticks, smaller type, and a hairline centre box. The three square
  icon buttons (mute, pause, fullscreen) are now fixed to exactly
  44 px wide too — without that, their emoji and side padding
  stretched them to ~65 px and the tape still looked narrower. The
  centre value box on the tapes now spans the full tape width too —
  its 2 px inset on each side had left the dark box 4 px narrower
  than the button above it.
- The chase camera moved in close: 30 m behind the jet to 20 m, at
  the same look-down angle, so the T-7 fills the frame like a close
  chase view instead of sitting small in the distance. The cockpit
  camera and the title-screen orbit are unchanged.

## v5.7 — 27 November 2026

### Settings on the pause screen, wave banner tucked under the wave pill
- The pause screen (HOLDING PATTERN) now has the settings menu: the
  same sound, camera and resolution panel from the title screen moves
  into the pause screen while paused, so MUSIC / SFX, SOUND ON and
  LOW / MEDIUM / HIGH can be changed mid-sortie without quitting to
  the title. There is only one panel and one set of controls — it
  moves back to the title screen when you resume, restart or quit —
  and a SETTINGS button on the pause screen hides it again if you
  want the clean pause screen back. RESUME stays above it.
- "FIRST CONTACT — 3 HOSTILES" now sits directly under the WAVE 1 / 5
  pill, on the same left edge and a few pixels below it, in every
  layout. On phone landscape it used to sit 72 px to the right and
  20 px below the pill, reading as a separate floating banner; on
  narrow screens it keeps the same left edge too. The timed centre
  banner ("WAVE 1 — FIRST CONTACT · 3 HOSTILES") is unchanged.

## v5.6 — 27 November 2026

### Off-screen objects are no longer rendered
- Objects outside the camera's field of view are now skipped instead
  of drawn. The terrain used to be a single 12,000 m mesh, so its
  bounding sphere always touched the frustum and all 45,000 triangles
  were drawn every frame — even the hills behind you. It is now 25
  tiles (5×5, same 45,000 triangles in total), each with its own
  bounding sphere, so only the tiles in view are drawn. Heights and
  colours are unchanged, and the tile normals are computed from the
  terrain function itself, so there are no seams where tiles meet.
- Every frame also hides whole enemy jets, bonus rings, clouds, the
  sun glow and the lock ring when their bounding sphere misses the
  frustum. The radii are deliberately generous, so nothing can vanish
  while it is still on screen. Tracers, missile trails and explosions
  are untouched: each is a single tiny draw, and their geometry is
  rewritten in world space every frame, so a cached bounding sphere
  would be wrong for them.
- You can watch it work in the browser console: `__talon.cull` shows
  how many terrain tiles, enemies, rings and clouds are drawn each
  frame.

## v5.5 — 27 November 2026

### FLY THE SORTIE button no longer clips on phones
- On a 360 px phone the button label wrapped to two lines — "FLY THE"
  on the first line, "SORTIE" on the second — and the second line was
  cut off at the button's bottom edge. Two causes, both fixed: the
  label at 18 px with 44 px side padding was wider than the 312 px
  column (Android monospace runs wider than the estimate), and the
  title screen's flex column then squashed the wrapped button back
  down to one line tall.
- The button now stays on one line at every width: its type shrinks
  fluidly to 15 px on phones (15 px, tighter spacing and 20 px side
  padding under 640 px), and it never wraps. Nothing on the title
  screen can be squashed any more either — the screen scrolls instead
  of clipping, which is what it was built to do.

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

- Bloom and god rays; Vector Locked BGM.
- Audio assets added (BGM + engine/gun/missile).
- Audio primed at load; low-end performance — no MSAA below High,
  capability-based default quality, faster step-down on the title screen.
- Settings panel with sound and resolution.
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
