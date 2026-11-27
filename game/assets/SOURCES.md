# Sound sources — TALON STRIKE real SFX

These files replace the game's synthesized engine / gun / missile sounds.
They are loaded by `game/src/audio.js` (wiring done separately by the main agent).
`vector-locked.mp3` is the user's own music track, not part of this set.

## 1. jet-engine.mp3 — fighter jet engine loop
- File: MP3, 44.1 kHz stereo, 192 kbps, 15.0 s, 361,787 bytes
- Source recording: "Jet Engine Full Thrust Roar" (deep steady roar with turbine whine)
  from https://www.casper.tw/sound-effects/jet-engine/
  (direct file: https://sound-effects.casper.tw/audio/jet-engine-full-thrust-roar.c7ddebd3.mp3)
- License: Casper Sound Effects License (https://www.casper.tw/sound-effects/license/) —
  free to use, including commercially in paid apps and games; no attribution required.
  The sound was generated with Stable Audio (Stability AI); do not use it to train AI models.
- Processing note: the source clip is only 4.0 s and its raw start/end levels differ by
  ~2 dB, so this file is a 15 s seamless loop built from it with ffmpeg: 7 copies joined
  with 1 s triangular crossfades, then trimmed to a 15 s window starting mid-crossfade.
  Verified: first 0.15 s mean −16.4 dB / max −6.8 dB vs last 0.15 s mean −17.2 dB /
  max −6.6 dB — the wrap-around seam is ~0.8 dB, effectively inaudible on a steady roar.
- Not used: SFXMint "Running Jet Engine 02" (17.3 s loop, CC0) — its download endpoint
  refuses non-browser/API downloads without a free SFXMint API key, and no account was
  created for this task.

## 2. machine-gun.mp3 — fighter cannon burst (M4 rifle sound)
- File: MP3, 44.1 kHz stereo, 128 kbps, 2.5 s, 41,004 bytes
- Source: "M4 Carbine Rifle Gun Shot Sound Effect Loud" — classic M4 gunshot
  sound effect, YouTube video https://youtu.be/Vpi2EBTAOjc
  (Sound Effects Factory), chosen by the user by link.
- License: per the video description, used under Creative Commons 0 (CC0) —
  free to use, no attribution required. A free download is also listed at
  https://soundeffectsfactory.com
- Processing: the 14.8 s video is 4 bursts (peaks ~0.9 s, 2.5 s, 3.8 s, 4.8 s)
  followed by ~8.5 s of silence. This file is the first two bursts,
  trimmed 0.85–3.35 s, 50 ms fades in/out, loudness-normalized to
  I=-20 LUFS, TP=-3.0 dB so it is not too loud (the source peaks at 0 dB).
  Verified: mean −24.6 dB / max −7.9 dB, vs the old file's mean −8.0 dB /
  max 0.0 dB — about 17 dB quieter. In-game the burst is played through a
  0.7 gain in audio.js gun(), so it sits under the engine and music.
- Replaces: "Machine Gun Burst 50 Cal" by Mike Koenig (SoundBible, CC-BY 3.0),
  2.0 s, 32,974 bytes — replaced 2026-11-27 at the user's request.
- Wiring: audio.js gun() plays it at most once per 0.45 s while the guns
  fire at 16 shots/s; the synth noise burst is the fallback if the file
  fails to load. Since v5.3 the burst has Doppler + stereo pan: its
  pitch follows the target bandit's radial velocity (closing = higher,
  receding = lower) and sweeps down ~8% as it flies downrange, panned
  to the target's bearing.

## 3. missile.mp3 — missile launch whoosh
- File: MP3, 44.1 kHz mono, ~105 kbps overall, 2.9 s, 38,260 bytes
- Source: "Powerful rocket launch sound" (3 s) from https://sounddino.com/en/effects/rocket/
  (direct file: https://sounddino.com/mp3/78/powerful-rocket-launch-sound.mp3)
- License: SoundDino free license — free, royalty-free, no sign-up, no attribution,
  commercial use allowed including indie games (see https://sounddino.com/).
- Shape check: ramps in (first 0.1 s mean −18.2 dB) and ends in silence (last 0.1 s
  mean −91.0 dB) — a clean launch whoosh.
- Caveat: the file is mono and carries an embedded ID3 cover image (a PNG stream);
  both decode fine in browsers, but if the game's decoder is strict, strip the image
  (`ffmpeg -i missile.mp3 -map 0:a -c copy missile-clean.mp3`) and/or upmix to stereo.
- Wiring: audio.js missile() plays it through a 0.35 gain (lowered
  2026-11-27 at the user's request — 0.5 in v5.2 was still too loud;
  the synth fallback is lowered to 0.18 to match). Since v5.3 the
  launch has Doppler + stereo pan: it starts near the target bandit's
  Doppler pitch, panned to the target's bearing, then falls to the
  receding pitch as the missile pulls away.

## 4. jet-flyby.mp3 — enemy jet close-pass whoosh
- File: MP3, 44.1 kHz stereo, 192 kbps, 3.4 s, 83,426 bytes
- Source: "Efek Suara Jet Tempur" (Fighter Jet Sound Effect), YouTube video
  https://youtu.be/_F9InUdTAqY (direct video: https://www.youtube.com/watch?v=_F9InUdTAqY),
  downloaded with yt-dlp (Android player client — the default client was
  refused with a "sign in to confirm you're not a bot" check; format 18,
  360p mp4, was the only format the Android client offered).
- License: no explicit license is stated on the video; it is a sound-effect
  clip the user asked for by link ("use the jet flyby sound from this
  video"). Used here as a game SFX per the user's request.
- Processing: the 8.4 s video holds TWO flyby passes (peaks ~1.5 s and
  ~5.5 s). This file is the second pass, trimmed 4.6–8.0 s, 50 ms fades
  in/out, loudness-normalized (I=-16, TP=-1.5). Shape check: starts quiet
  (first 0.15 s mean −44.4 dB), peaks mid-pass (max −8.4 dB), ends quiet
  (last 0.15 s mean −40.3 dB) — a clean approach–pass–recede whoosh.
- Wiring: `game/src/audio.js` `flyby()` plays it when an enemy jet sweeps
  past the player (main.js detects the closing-to-receding crossing under
  500 m), one voice at a time with a 2.5 s cooldown, pitch starting at the
  approach Doppler and falling to 0.85x through the pass. Synth falling
  whoosh is the fallback if the file fails to load.
