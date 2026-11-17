# Sable Line

A round-based tactical FPS in three.js, Counter-Strike-style but entirely original:
attackers plant the bomb at site A or B (or eliminate the Rust squad), defenders
hold the sites. Money earned each round buys rifles, SMGs, a DMR, grenades and
kevlar between rounds. Bots walk routes, hold angles, investigate gunfire, plant
and defuse. First to 5 rounds takes the match.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network: static files only, three.js 0.187.0 vendored under
`game/vendor/three/`. Desktop Chrome (or any browser with WebGL 2).

## Controls

- **W A S D** move, **Shift** sprint, **Ctrl** crouch, **Space** jump
- **Mouse** look, **Click** fire, **Right-click** aim (DMR zoom)
- **R** reload, **1–4** weapons, **G** throw grenade, **Q** switch grenade
- **E** plant the bomb (hold, inside a site), **B** buy menu (freeze time)

## How it is built

- `game/src/main.js` — boot, the fixed 60 Hz loop, round flow, shooting
- `game/src/state.js` — the one state store (phase, rounds, bomb, feed)
- `game/src/world.js` — Yard 7: three lanes, two bombsites, waypoint graph
- `game/src/bots.js` — bot AI: hold, route, investigate, engage, plant, defuse
- `game/src/nav.js` — BFS routes and line-of-sight tests
- `game/src/combat.js` — shared hitscan and armour-aware damage
- `game/src/weapons.js` — the arsenal (one table for player, bots and shop)
- `game/src/economy.js` — money, rewards and the buy menu
- `game/src/grenades.js` — frag and smoke grenades
- `game/src/physics.js` — shared AABB collision for player and bots
- `game/src/player.js` — movement: acceleration, friction, crouch, jump
- `game/src/input.js`, `game/src/hud.js`, `game/src/fx.js`, `game/src/audio.js`,
  `game/src/palette.js`, `game/src/rng.js` — input, HUD, effects, procedural
  sound, the look plan and deterministic random numbers

## Screenshots

`screenshots/` holds four real renders of the game's own code
(`?shot=start|play|buy|end&seed=1`), taken in a headless browser; the first by
name is the cover.

---

