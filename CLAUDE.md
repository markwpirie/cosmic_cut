# CLAUDE.md — Cosmic Cut

Neon space-themed Qix clone. Plain JS (ES modules) + Pixi.js v8 (WebGL) rendering
onto an HTML5 canvas element. No build step.
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
- **Slow-cut + visual/feel pass: done** — **hold SPACE while cutting** for a SLOW DRAW (slower via `MARKER.slowCutMult`; cut tagged in `grid.slowFill`; darker glass `THEMES.claimedFillSlow`; **×2** area via `POINTS.slowCutMult` + "SLOW DRAW" label in `game.scoreCut`). Claimed areas render as **glossy shimmering glass** and the background is a baked **nebula/galaxy starscape** with twinkling parallax stars (both in `render-pixi.js`). Pickup sound is a louder rising arpeggio (`audio.powerupPickup`).
- **Enemy overhaul: done** — two enemy shapes in `enemy.js`: `"sheaf"` (the star Qix — classic Kix line-sheaf, sticks surge up to ~50% screen then settle, collides on the live line; bounce margin = current span + endpoints clamped to the field in `liveSeg`, so it never leaves the arena) and `"poly"` (polygon Blobs + Hunter Blobs). Poly collision uses `hitRadius` (`BLOB_POLY.hitScale`, tighter than the visual bounding radius). Per-level mix via `qix`/`blobs`/`hunters` in `levels.js` (positional array auto-splits: first = Qix, rest = poly Blobs). Sparx + Fast Sparx in `sparx.js` (BFS chase, trail-latch, perimeter-kill). Player is a rocket ship pointing along travel dir.
- **Phase 9 (Pixi.js): art super-upgrade — done, and the only renderer** — see `PHASE9.md`. Pixi v8 loads via CDN importmap (no build step); the old canvas renderer (`render.js`) was removed 2026-07-13 once Pixi covered every visual case, so there's no `?pixi` flag or renderer switch left — `src/render-pixi.js` is loaded and `init()`'d unconditionally in `main.js`. Includes: **bloom** (`config.BLOOM`), **rounded territory edges** (`config.CORNERS`), **gorgeous glass** (additive `TilingSprite` shimmer + masked nebula **refraction**, `config.GLASS`), **churning nebula** (`config.NEBULA`), **per-zone palette** (recoloured 2026-07-07 — see below; **pink/magenta = danger**), **swept-dart ship + ribbon tail + thruster embers** (`config.SHIP_TRAIL`, renderer-local ambient particles capped by `config.AMBIENT`), **energy enemies** (halo cores, wakes, sparx sparks — `config.ENERGY`; kill dust in `fx.explode`, `config.FX`), **death-impact FX** (`config.IMPACT`), **holo-grid void + motes + baked vignette** (`config.GRID_BG/MOTES/VIGNETTE`), **Orbitron HUD** with eased claim bar (`config.HUD`), **boss stage escalation** keyed to claim % (`BOSS.stages`). **Browser-verified headless** (Playwright + system Chrome; console clean); taste-level eyeball checks listed in `TODO.md`.
- **Phase 7 (touch controls): done** — relative virtual joystick (swipe = heading, two fingers = slow draw), taps advance menus; in `main.js`, built on `control.press/release/setSlow`. Keyboard still works. Listeners are on the **document** (swipes work anywhere, incl. letterbox). CSS: page fully locked (`position:fixed` body, `touch-action:none`), no pinch-zoom.
- **Mobile portrait mode: done** — `config.MOBILE` (decided once at load: coarse pointer + phone screen) switches the whole geometry: **portrait canvas 440×876, field 400×712 → 50×89 cells**, 64px HUD strip, 100px bottom touch strip with a visible **SLOW ×2 hold button** (`config.TOUCH.slowBtn`, drawn in render-pixi, state via `view.slowBtn`). Desktop stays 800×680/90×75. Canvas attrs + contain-fit style are set from config in `main.js` (don't hardcode the ratio in CSS). `QIX.spanMax` derives from the field short side. HUD/overlay/menu/VFX scale via `config.HUD` branch + `TXT_SCALE`/`BGS` in render-pixi. Touch listeners live on `document` (not the canvas) so swipes work from anywhere on screen, including the letterbox. Perf on mobile: both `DisplacementFilter`s off (`NEBULA.warp`/`GLASS.refraction` → 0), lower `BLOOM.quality`/`resolution`, `AMBIENT.max` halved — bloom itself stays on.
- **Boss (X-5 levels): done** — the first Qix of a boss level becomes a **big rainbow lightning boss** (per-enemy sheaf params in `enemy.js`, scaled by `config.BOSS`; render-pixi draws rainbow + lashing arcs + pulsing core). Surge span kept at normal size on purpose (bigger would exceed the wall-bounce margin and pin it). **Every X-5 also reveals a per-zone procedural scene through the glass** (`src/reveal.js`, `config.REVEAL`) instead of a flat block — the shimmer/rim stay full-strength on top, so it still reads as glass.
- **Enemy floor: redesigned 2026-07-07 — killed enemies stay dead.** Each family (poly Blobs/Hunters, Sparx) only respawns, one at a time at an arena edge with a brief telegraph, once its live count drops below **50%** of that level's starting count (`config.RESPAWN`, `enemy.js`/`sparx.js` `startCount`/`deadPool`, timers in `main.js`). The sheaf Qix keeps its own separate, stricter "always ≥1 alive" rule (unchanged). Sparx no longer respawn instantly 1-for-1.
- **SUPER mode: done** — clearing 5-5 for the first time unlocks a 6th "SUPER" menu chip that replays all 25 levels as S1-1+ with 2× enemy counts and a recalculated target (`game.currentSpec()`, `config.SUPER`, `game.superUnlocked`/`levelLabel()`).
- **Special Blobs: done** — rare `config.SPECIAL_BLOBS` variants ("life"/"slow") placed via `levels.js` `special: [...]`; reward only on SPLIT-enclosure (extra life / slow every enemy), excluded from the respawn floor and from the region-fill "keep open" vote in `grid.applyClaim()` (a lone special's region gets **filled**, not kept open).
- **Zone palette: recoloured 2026-07-07** — each zone has a clear, distinct hue (1 cyan → 2 green → 3 gold → 4 purple → 5 red, matching `assets/levels.png`), superseding the earlier cyan-hero flattening. Enemies (`BLOB_TYPES`, `SPARX`) recoloured into a fixed magenta/hot-pink danger band clear of every zone's hue.
- **PWA: done** — `manifest.json` + `sw.js` at the repo root (no build step); installable + offline-capable. Three cache strategies: core (stale-while-revalidate, versioned), media/MP3s (cache-on-demand, Range/206 support), CDN (Pixi + fonts, cache-first, warmed on install).
- **Pause menu + independent volume: done 2026-07-13** — P/Esc pauses (unchanged shortcut), and while paused it doubles as a small menu: RESUME / SFX / MUSIC / QUIT TO MENU (`config.PAUSE_MENU`/`pauseRowY`, drawn in `render-pixi.js`'s `drawPaused`). SFX and music now have independent persisted volume sliders (`audio.get/setSfxVolume`, `get/setMusicVolume`, step = `AUDIO.volumeStep`) on top of the existing M-mute/N-music-toggle. Phone has no Esc key, so there's a dedicated on-screen pause button (`TOUCH.pauseBtn`, mirrors `TOUCH.slowBtn` on the other side of the bottom control strip) plus touch hit-testing for the menu rows themselves (`main.js`'s `hitPauseRow`/`handlePauseTouch`). Quitting calls `game.quitToMenu()`, which commits the run's score to the high-score table first. `control.js` gained a `paused` flag (`setPaused()`) so pause-menu nav (keyboard or the touch joystick) never leaks into movement intents.
- **Candy Mode: done 2026-07-18** — a selectable cosmetic "Candy Cosmos" skin (start-menu chip; `C` key, `V` for music choice; taps on mobile), persisted via `game.candyTheme`/`candyMusic`. Purely visual + music — zero gameplay/balance changes. While ON: one pink theme replaces every zone's `THEMES` entry (`config.CANDY.theme`), the baked background becomes a candy scene (`bakeCandyTexture()` in render-pixi — clouds, swirl galaxy, candy canes, castle, sprinkles; swapped at runtime via the `syncCandy()` latch), poly Blobs draw as **angry cupcakes** (`drawCupcake`), and enemy colors remap through `ecol()` (`CANDY.enemyMap` — frosting hues + peppermint Sparx, since pink stops meaning danger when the whole field is pink). Music: `Pink Mode 1.mp3` plays as the stage track (default ON, `V`/tap flips back to normal zone themes; flag pushed into `audio-director.setCandyMusic` — the director stays game-module-free). Death in candy mode plays `17 - Lose a Life.mp3` (`caught()` branches on the candy-music flag); normal mode keeps the Game Over sting. **Mid-game toggle: done 2026-07-18** — the pause menu (P/Esc, or the mobile pause button) gained two rows, CANDY MODE and (while it's on) CANDY MUSIC, so the skin/music can be flipped without quitting the level (`game.pauseMenuRows()` is the single source of row order/kind, read by both `main.js` input and `render-pixi.js`'s `drawPaused`). Toggling while paused doesn't touch live audio (already silenced by `enterPause()`); it sets a `candyMusicDirty` flag that `resumeFromPause()` checks to re-cue the correct track (`director.stage()`) the instant play resumes — otherwise a plain resume just un-pauses whatever was already playing, unchanged. Cupcakes tilt their cherry into the travel direction (eased heading in a renderer-side `WeakMap` — render never writes to world objects).
- **Level target rebalance: done 2026-07-18** — clear-% targets in `levels.js` lowered across zones 2–5 (zone 1 left ~unchanged) after Mark reported zone 3 too hard: the old table shrank the unclaimed area (70→90%) at the same time enemy count/speed rose, compounding both knobs against the player. Now targets rise gently (low-70s → high-70s, boss levels still dip) so enemy count/speed carries the difficulty curve instead of also racing the finish line toward it. First-pass tuning — revisit after playtesting.
- **In-game help screen: done 2026-07-18** — a new `game.state === "help"`, reached from the zone-select screen via a top-right "?" button (`config.HELP_BTN`) or the `H`/`?` key, closed with Enter/Space/Esc/P or a tap. Paginated (← → keys or swipe): CONTROLS / SCORING / ENEMIES / POWER-UPS, drawn by `render-pixi.js`'s `drawHelp()` from a `HELP_PAGES` copy array local to the renderer (display text isn't a config-tunable). `game.pauseMenuRows()`-style page-count export (`HELP_PAGE_COUNT`) keeps main.js's clamping in sync. Row spacing needed real-world tuning — Orbitron's line height runs well past its nominal font-size, so the first pass (spacing derived from font-size) visibly overlapped rows; fixed with generously oversized fixed pixel gaps, verified via headless screenshots on both breakpoints. README's "How to play" section was rewritten alongside it into proper Controls/Scoring/Enemies/Power-ups tables (same content, doc form) — also fixed two stale numbers in the old prose (BLOCK OUT/MEGA-CUT said ≥30%/≥50%, the live `config.POINTS` values are ≥75%/≥85%).
- **Per-zone backgrounds: done 2026-07-18** — the baked starscape is no longer one fixed cyan scene: each zone bakes its own from `config.ZONE_BG` (cloud + nebula palettes keyed to the zone hue, zone 1 unchanged), lazily cached and swapped by `syncBackground()` in render-pixi (the same latch Candy Mode uses — candy wins when ON). Entering a new zone now flips the whole background palette, not just the field colors.
- Full roadmap in `GAME_DESIGN.md §11`. Locked decisions in `§14`.

## Branches
- `main` — the only active branch (deploys live on push). `phase9-pixi` is merged
  and now redundant — its content is identical to `main`; safe to delete.

## Requirements
- Pixi.js v8 requires **WebGL** (it dropped v7's canvas-renderer fallback) — a
  browser/device with WebGL disabled has no graceful degradation. Accepted
  trade-off for a hobby project on modern browsers; revisit only if that's
  ever reported as a real blocker.

## File map

| File | Owns |
|------|------|
| `config.js` | All tunable numbers — grid, speeds, colours (zone THEMES, BLOB_TYPES/SPARX danger band), scoring, audio, POWERUPS, SPECIAL_BLOBS, BOSS, RESPAWN, SUPER, REVEAL; Pixi-look knobs BLOOM/CORNERS/GLASS/NEBULA |
| `levels.js` | Campaign data — 25 levels (zones 1-1…5-5), target %, blob types, `special` (Special Blobs), `boss` flag |
| `control.js` | Keyboard input → movement intents (touch lives in `main.js`, reusing these); `setPaused()` guard stops pause-menu nav from being recorded as movement |
| `grid.js` | Arena cells, flood-fill claim, seams, `applyClaim()` (Special Blobs don't vote to keep their region open) |
| `marker.js` | Player movement, cutting, perimeter logic |
| `enemy.js` | Blobs + Special Blobs: bounce, spawn, collision, respawn floor (`startCount`/`deadPool`/`respawnOne`), `isFrozen`/`isShielded` guards |
| `powerups.js` | All power-up state: pickups, ZOOM float, timed effects (incl. Special Blob slowdown), spawn, ZOOM aiming |
| `sparx.js` | Sparx enemies: BFS perimeter-chase, trail-latch (Fast Sparx), kill-on-perimeter, respawn floor (`startCount`/`deadPool`/`respawnOne`) |
| `game.js` | State machine: lives, score, level/zone, SUPER mode (`currentSpec()`/`superUnlocked`), `scoreCut()`/`addLife()`, `quitToMenu()` (pause-menu quit, commits score first) |
| `reveal.js` | Boss picture-reveal (§7): procedural per-zone scene baked to an offscreen canvas, cached; renderer-only |
| `audio.js` | Low-level Web-Audio: SFX, synth, MP3 registry, beat analyser, independent persisted SFX/music volume (`get/setSfxVolume`, `get/setMusicVolume`) |
| `audio-director.js` | Music policy: scene cues, interrupt/resume jingles, sonar (currently off) |
| `fx.js` | Particles (embers/explosions, glow/grav) + screen shake |
| `render-pixi.js` | All drawing (Pixi.js v8/WebGL): field, blobs, power-up icons, HUD, overlays, boss reveal art, bloom/glass/nebula/particles |
| `main.js` | Game loop + state routing + event wiring + touch controls + SW registration |
| `sw.js` / `manifest.json` | PWA: service worker (root, three cache strategies) + web app manifest |

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
- **Enemy floor (§6):** killed enemies **stay dead**. Each family (poly Blobs/Hunters,
  Sparx — tracked separately) only respawns, one at a time with a short delay + a
  harmless telegraph, once its live count drops below `RESPAWN.floorPct` (50%) of
  the level's starting count for that family. The sheaf Qix is a separate, stricter
  rule: **always ≥1 alive**, independent of the floor.
- **Special Blobs (§8):** still lethal to touch like any Blob. Reward fires only on
  **SPLIT-enclosure** (a ZOOM dash kill gives nothing). Excluded from the respawn
  floor, the SPLIT label/×2 multiplier, and the region-keep vote in
  `grid.applyClaim()` — a Special Blob alone in a split region gets that side
  **filled**, not kept open (`holdsOpen: false` on its `cells()` entry).
- **SUPER mode (§5):** everything that spawns enemies or checks the win % reads
  through `game.currentSpec()`, never `game.currentLevel()` directly — it's the
  single place SUPER's ×2 counts / recalculated target apply.

## Conventions
- No build step, no framework. Pure ES modules, `import` paths use `./`.
- All feel knobs in `config.js` — don't hard-code numbers in logic files.
- Pure logic (`grid`, `marker`, `enemy`, `game`, `levels`, `fx`) is browser-API-free.
- `powerups.js` ↔ `enemy.js` have a circular ES module dependency — safe because both sides only call imports inside functions, never at evaluation time.
- Developer is learning — keep explanations clear and changes focused.
