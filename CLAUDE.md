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
- **Phase 9 (Pixi.js): in progress on branch `phase9-pixi`** — see `PHASE9.md`. Pixi v8 via CDN importmap (no build step), **opt-in with `?pixi`** (canvas stays default). Full renderer ported in `src/render-pixi.js` (mirrors `render.js`'s `render(view)`); renderer switch + async init in `main.js`. Written without a browser to test against — verify in-browser and watch the console for v8 API mismatches.
- **Phase 7: next** (after Phase 9 graphics) — touch controls for mobile.
- Full roadmap in `GAME_DESIGN.md §11`. Locked decisions in `§14`.

## Branches
- `main` — the canvas game (current, deploys live on push).
- `phase9-pixi` — Pixi.js graphics layer (active work). Reuses all logic untouched;
  only the presentation layer differs. Test with `http://localhost:8000/?pixi`.

## File map

| File | Owns |
|------|------|
| `config.js` | All tunable numbers — grid, speeds, colours, scoring, audio, POWERUPS |
| `levels.js` | Campaign data — 25 levels (zones 1-1…5-5), target %, blob types |
| `control.js` | Keyboard input → movement intents |
| `grid.js` | Arena cells, flood-fill claim, seams, `applyClaim()` |
| `marker.js` | Player movement, cutting, perimeter logic |
| `enemy.js` | Blobs: bounce, spawn, collision, `isFrozen`/`isShielded` guards |
| `powerups.js` | All power-up state: pickups, ZOOM float, timed effects, spawn, ZOOM aiming |
| `sparx.js` | Sparx enemies: BFS perimeter-chase, trail-latch (Fast Sparx), kill-on-perimeter |
| `game.js` | State machine: lives, score, level/zone, `scoreCut()` |
| `audio.js` | Low-level Web-Audio: SFX, synth, MP3 registry, beat analyser |
| `audio-director.js` | Music policy: scene cues, interrupt/resume jingles, sonar (currently off) |
| `fx.js` | Particles + screen shake |
| `render.js` | All drawing (canvas): field, blobs, power-up icons, HUD, overlays |
| `render-pixi.js` | Phase 9 Pixi.js renderer — same `render(view)` contract, opt-in via `?pixi` |
| `main.js` | Game loop + state routing + event wiring + renderer switch (`USE_PIXI`) |

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
