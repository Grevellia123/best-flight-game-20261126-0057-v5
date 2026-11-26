# best-flight-game-20261126-0057-v5

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?ref=xaximy)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Grevellia123/best-flight-game-20261126-0057-v5/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?ref=xaximy)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Grevellia123/best-flight-game-20261126-0057-v5/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?ref=xaximy)

TALON STRIKE — a 3D air-combat flight game. Fly the T-7 Talon interceptor for Talon Squadron and defend the northern coast against the Crimson Wing across 5 waves of hostile fighters, ending in a duel with the Crimson Ace. Entry for make.fun bounty `best-flight-game-20261126-0057` — "Make the best flight game".

## The game

- **Real flight feel** — throttle, pitch, roll, bank-to-turn, stall, trim, terrain strikes. Keyboard + mouse + touch.
- **Air combat** — guns with heat limits, heat-seeking missiles with a lock-on reticle and lock time, enemy AI that hunts, fires back in bursts, and evades when you lock on.
- **5 waves** — First Contact, River Ambush, Storm Front, Crimson Tide, Ace Hunt. Waves get harder; clear them all to win.
- **A living world** — green rolling hills, a winding river, a coastline with islands, golden-hour sun, drifting clouds, a home runway, and glowing rings worth +50 CR.
- **Full HUD** — airspeed and altitude tapes, compass, radar, fuel / hull / gun-heat bars, missile count, wave and kill feed, lock indicator, stall warning.
- **Two cameras** — chase and cockpit (C key or the COCKPIT button).
- **Adaptive music** — original Web Audio soundtrack that shifts between title, combat, danger, win and game over, plus synthesized SFX and an engine hum tied to speed. Mute any time.
- **Graphics settings** — Low / Medium / High with FPS auto step-down, persisted locally.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests — everything (including Three.js r160, vendored under `game/vendor/`) is served from `game/`.

## Controls

- **Steer** — drag / arrow keys / WASD
- **Throttle** — mouse wheel / Shift / Ctrl (or R / V)
- **Guns** — Space (hold) / FIRE button
- **Missile** — F / MSL button (hold the bandit in the reticle to lock first)
- **Camera** — C · **Pause** — P · **Mute** — M · **Trim** — T / G

## Screenshots

- `0-cover.jpg` — title screen, chase view over the river valley
- `1-combat.jpg` — wave combat, tracers in the air
- `2-lock.jpg` — cockpit view, missile lock on a bandit
- `3-victory.jpg` — victory debrief after clearing all 5 waves
