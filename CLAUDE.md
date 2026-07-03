# CLAUDE.md — Cosmic Cut

Neon space-themed Qix clone. Plain JS (ES modules) + HTML5 Canvas. No build step.
Live at https://markwpirie.github.io/cosmic_cut/ (GitHub Pages, deploys on push to `main`).

## Run locally
```
python -m http.server 8000
# then visit http://localhost:8000
```
On Windows use `python` not `python3`.

## Phase status
- **Phases 0–5 + 2 feel passes: done and live.**
- **Phase 6 (power-ups): done** — Freeze, Solar Wind, Boost, Shield, ZOOM all implemented in `src/powerups.js`. **Solar Wind** is a *sustained* timed gust (pins all enemies to one wall for `SOLARWIND.duration`), applied each frame in `powerups.update()` before `enemy.update()`.
- **Slow-cut + visual/feel pass: done** — **hold SPACE while cutting** for a SLOW DRAW (slower via `MARKER.slowCutMult`; cut tagged in `grid.slowFill`; darker glass `THEMES.claimedFillSlow`; **×2** area via `POINTS.slowCutMult` + "SLOW DRAW" label in `game.scoreCut`). Claimed areas render as **glossy shimmering glass** and the background is a baked **nebula/galaxy starscape** with twinkling parallax stars (both in `render.js`). Pickup sound is a louder rising arpeggio (`audio.powerupPickup`).
- **Enemy overhaul: done** — two enemy shapes in `enemy.js`: `"sheaf"` (the star Qix — classic Kix line-sheaf, sticks surge up to ~50% screen then settle, collides on the live line; bounce margin = current span + endpoints clamped to the field in `liveSeg`, so it never leaves the arena) and `"poly"` (polygon Blobs + Hunter Blobs). Poly collision uses `hitRadius` (`BLOB_POLY.hitScale`, tighter than the visual bounding radius). Per-level mix via `qix`/`blobs`/`hunters` in `levels.js` (positional array auto-splits: first = Qix, rest = poly Blobs). Sparx + Fast Sparx in `sparx.js` (BFS chase, trail-latch, perimeter-kill). Player is a rocket ship pointing along travel dir.
- **Phase 9 (Pixi.js): art super-upgrade landed on branch `phase9-pixi`** — see `PHASE9.md`. Pixi v8 via CDN importmap (no build step), **opt-in with `?pixi`** (canvas stays default). Full renderer in `src/render-pixi.js` (mirrors `render.js`'s `render(view)`); renderer switch + async init in `main.js`. Includes: **bloom** (`config.BLOOM`), **rounded territory edges** (`config.CORNERS`), **gorgeous glass** (additive `TilingSprite` shimmer + masked nebula **refraction**, `config.GLASS`), **churning nebula** (`config.NEBULA`), **cyan-hero palette** (zone identity → `THEMES[].accent`; **pink/magenta = danger**), **swept-dart ship + ribbon tail + thruster embers** (`config.SHIP_TRAIL`, renderer-local ambient particles capped by `config.AMBIENT`), **energy enemies** (halo cores, wakes, sparx sparks — `config.ENERGY`; kill dust in `fx.explode`, `config.FX`), **death-impact FX** (`config.IMPACT`), **holo-grid void + motes + baked vignette** (`config.GRID_BG/MOTES/VIGNETTE`), **Orbitron HUD** with eased claim bar (`config.HUD`), **boss stage escalation** keyed to claim % (`BOSS.stages`). **Browser-verified headless** (Playwright + system Chrome; console clean); taste-level eyeball checks listed in `TODO.md`.
- **Phase 7 (touch controls): done** — relative virtual joystick (swipe = heading, two fingers = slow draw), taps advance menus; in `main.js`, built on `control.press/release/setSlow`. Keyboard still works. Listeners are on the **document** (swipes work anywhere, incl. letterbox). CSS: page fully locked (`position:fixed` body, `touch-action:none`), no pinch-zoom.
- **Mobile portrait mode: done** — `config.MOBILE` (decided once at load: coarse pointer + phone screen) switches the whole geometry: **portrait canvas 440×876, field 400×712 → 50×89 cells**, 64px HUD strip, 100px bottom touch strip with a visible **SLOW ×2 hold button** (`config.TOUCH.slowBtn`, drawn in render-pixi, state via `view.slowBtn`). Desktop stays 800×680/90×75. Canvas attrs + contain-fit style are set from config in `main.js` (don't hardcode the ratio in CSS). `QIX.spanMax` derives from the field short side. HUD/overlay/menu/VFX scale via `config.HUD` branch + `TXT_SCALE`/`BGS` in render-pixi. Touch listeners live on `document` (not the canvas) so swipes work from anywhere on screen, including the letterbox. Perf on mobile: both `DisplacementFilter`s off (`NEBULA.warp`/`GLASS.refraction` → 0), lower `BLOOM.quality`/`resolution`, `AMBIENT.max` halved — bloom itself stays on.
- **Boss (X-5 levels): done** — the first Qix of a boss level becomes a **big rainbow lightning boss** (per-enemy sheaf params in `enemy.js`, scaled by `config.BOSS`; render-pixi draws rainbow + lashing arcs + pulsing core). Surge span kept at normal size on purpose (bigger would exceed the wall-bounce margin and pin it).
- Full roadmap in `GAME_DESIGN.md §11`. Locked decisions in `§14`.

## Branches
- `main` — the canvas game (current, deploys live on push).
- `phase9-pixi` — Pixi.js graphics layer (active work). Reuses all logic untouched;
  only the presentation layer differs. Test with `http://localhost:8000/?pixi`.

## File map

| File | Owns |
|------|------|
| `config.js` | All tunable numbers — grid, speeds, colours, scoring, audio, POWERUPS, BOSS; Pixi-look knobs BLOOM/CORNERS/GLASS/NEBULA |
| `levels.js` | Campaign data — 25 levels (zones 1-1…5-5), target %, blob types, `boss` flag |
| `control.js` | Keyboard input → movement intents (touch lives in `main.js`, reusing these) |
| `grid.js` | Arena cells, flood-fill claim, seams, `applyClaim()` |
| `marker.js` | Player movement, cutting, perimeter logic |
| `enemy.js` | Blobs: bounce, spawn, collision, `isFrozen`/`isShielded` guards |
| `powerups.js` | All power-up state: pickups, ZOOM float, timed effects, spawn, ZOOM aiming |
| `sparx.js` | Sparx enemies: BFS perimeter-chase, trail-latch (Fast Sparx), kill-on-perimeter, enclosure-kill + opposite-side respawn |
| `game.js` | State machine: lives, score, level/zone, `scoreCut()` |
| `audio.js` | Low-level Web-Audio: SFX, synth, MP3 registry, beat analyser |
| `audio-director.js` | Music policy: scene cues, interrupt/resume jingles, sonar (currently off) |
| `fx.js` | Particles (embers/explosions, glow/grav) + screen shake |
| `render.js` | All drawing (canvas): field, blobs, power-up icons, HUD, overlays |
| `render-pixi.js` | Phase 9 Pixi.js renderer — same `render(view)` contract, opt-in via `?pixi` |
| `main.js` | Game loop + state routing + event wiring + renderer switch (`USE_PIXI`) + touch controls |

## Key design rules (§14)
- Player is **only vulnerable while cutting** — riding the perimeter is always safe.
- **Self-trail death (Qix rule):** touching your own in-progress cut line kills you
  (`marker.selfHit`, set in `onArrive` when the marker lands on a node already in the
  trail). Prevents walling off un-claimable islands. The marker is also **invulnerable
  while aiming a ZOOM and during a ZOOM dash** (handled by the `invuln` gate in `main.js`).
- Claim keeps the blob's region open; blobs trapped on the smaller side die (SPLIT).
- Power-ups spawn in open cells; collected by claiming the region containing them.
- **Slow cut:** holding SPACE while cutting crawls the marker, tags the cut slow (`grid.slowFill`), renders darker glass, and scores ×2 area. It's a *commitment* — armed only by holding SPACE as you leave the boundary or within `MARKER.slowArmWindow` (1s); after that SPACE is inert, and releasing mid-cut cancels it (must hold the whole line). Slow state flows control.js → marker.js (`slowActive`/`lastCutSlow`) → grid/game/render.
- **ZOOM is a dash:** floats freely, collected by marker touch → aim with a direction key →
  the ship rockets across the field **drawing a real cut** at `ZOOM.dashSpeedMult`× speed,
  invulnerable, killing any enemy it flies through (`enemy.killNear`); the cut claims on
  landing. Started via `marker.startZoomDash()`. (No longer a teleport.)
- Sonar ping is currently **off** (`AUDIO.sonar.enabled: false` in `config.js`) — may be redesigned.

## Conventions
- No build step, no framework. Pure ES modules, `import` paths use `./`.
- All feel knobs in `config.js` — don't hard-code numbers in logic files.
- Pure logic (`grid`, `marker`, `enemy`, `game`, `levels`, `fx`) is browser-API-free.
- `powerups.js` ↔ `enemy.js` have a circular ES module dependency — safe because both sides only call imports inside functions, never at evaluation time.
- Developer is learning — keep explanations clear and changes focused.
