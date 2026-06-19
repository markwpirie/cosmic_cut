# COSMIC CUT

A modern, neon, space-themed take on the classic *Qix* / *Kix* territory-cutting
arcade game. Carve out the play field, dodge enemies, hit the percentage target,
and chain risky cuts for big scores.

See [GAME_DESIGN.md](GAME_DESIGN.md) for the full design.

## Status

**Phases 0–6 + two Game-Feel passes + an enemy/visual overhaul.** The Phase 4 campaign
(zone select, data-driven levels in [`levels.js`](src/levels.js), per-zone themes,
target %, lives) and Phase 5 scoring are done: a finished cut scores base points per %
claimed × **BLOCK OUT** / **MEGA-CUT** / **LONG** tiers × a per-level multiplier, and a
**SPLIT** adds kill points + ×2 for the rest of the level (**MULTI STACK!** when bonuses
stack). Phase 6 adds **power-ups** and a full **enemy roster** (see below). You're only
vulnerable to Blobs/Qix while *cutting* — but **Sparx kill on the safe perimeter too**.
All values live in [`config.js`](src/config.js).

On top sits the **feel layer**: **juice** (screen shake + colour-coded particle
bursts; blobs explode where they're caught), **danger telegraphing**, a **NEAR MISS**
bonus, a **starfield**, and a persistent **high score**.

**Phase 6 + an enemy/visual overhaul** is the latest work:
- **Power-ups** ([`powerups.js`](src/powerups.js)) — **Freeze**, **Solar Wind**,
  **Boost**, **Shield**, and **ZOOM**. Most spawn in open space and are grabbed by
  *claiming* the area around them; **ZOOM** floats and is grabbed by *touch*, then you
  aim a direction and rocket to that wall, destroying any enemy in the path.
- **New enemy roster** — the star **Qix** is the classic Kix **line-sheaf** (a twisting
  ribbon of sticks that occasionally surges to ~half the screen), plus **polygon Blobs**,
  **Hunter Blobs** (drift toward you), and **Sparx** + **Fast Sparx**
  ([`sparx.js`](src/sparx.js)) that chase along the borders, kill you on the safe
  perimeter too, and — for Fast Sparx — latch onto your cut line to chase you mid-draw.
- The **player is now a rocket ship** that points the way it's travelling.
- **Slow cut on SPACE** — hold SPACE while cutting to crawl: more exposed, but the claim
  is **darker glass** worth **double** (the tower-builder's tool).
- **Glossy glass + cosmic backdrop** — claimed areas shimmer like wet glass; the
  background is a nebula/galaxy starscape with twinkling parallax stars.
- **Solar Wind** now actually blows — a sustained gust pins every enemy to one wall for a
  few seconds, clearing the board to carve.

Earlier passes (still in) added the **MP3 soundtrack + AudioDirector**, a **beat-reactive
throb**, **pause**, a **title screen**, and a **bigger play field** (800×680). All feel
knobs are centralised in [`config.js`](src/config.js) (`AUDIO`, `POWERUPS`, `QIX`,
`BLOB_POLY`, `SPARX`). See [TODO.md](TODO.md) for the running list and §14/§16 of
[GAME_DESIGN.md](GAME_DESIGN.md).

**Now in progress — Phase 9 (graphics):** the rendering layer is being ported to
**Pixi.js v8** on the `phase9-pixi` branch. Pixi loads as a CDN ES module via an
importmap — **no build step** — and it's **opt-in via `?pixi`** (e.g.
`http://localhost:8000/?pixi`) so the canvas version stays the default while it
matures. All game logic is shared and untouched. See [PHASE9.md](PHASE9.md). Phase 7
(touch controls) follows once Phase 9 lands.

## How to play

Play it at <https://markwpirie.github.io/cosmic_cut/>.

- **Goal:** carve out the play field. Each level has a **target %** — claim that much of the arena to clear it and move on, through zones 1-1 … 5-5.
- **Controls:** **Arrow keys** or **WASD**. Movement is continuous "ride the rail" — press a direction and you keep going until you turn or reverse (press the opposite). Hold a direction approaching a junction to take that turn. Push **into open space** to start a **cut**. **Hold SPACE while cutting for a SLOW DRAW** — you crawl (more exposed) but the claim is darker glass worth **double**.
- **Cutting & risk:** while riding the bright perimeter (or a claimed edge) you're **safe**. The moment you cut into open space you're exposed — a Blob touching your **marker or your trail** costs a life. Close the loop back to safe ground to **claim** the enclosed area.
- **Scoring:** bigger, bolder cuts pay off — **BLOCK OUT** (≥30%), **MEGA-CUT** (≥50%), **LONG** tiers (long cuts), and **SPLIT** (trap a Blob on the smaller side: it dies, you score, and the level multiplier ×2). Stacked bonuses → **MULTI STACK**.
- **Flow:** a **title** screen → **stage-select** (pick any zone you've reached) → play. The level starts when you press a direction; on a hit you freeze on the spot (brief beat) — press any key to respawn; out of lives → start screen (beat the **high score**).
- **Enemies:** the **Qix** (big twisting line-creature) and **Blobs** bounce through open
  space — deadly only while you're cutting. **Hunter Blobs** drift toward you. **Sparx**
  patrol the borders and are deadly *even while you ride safely*, so keep moving; **Fast
  Sparx** will jump onto your cut line to chase you mid-draw.
- **Power-ups:** grab **Freeze / Solar Wind / Boost / Shield** by claiming the area they
  sit in. **Solar Wind** blows every enemy hard against one wall for a few seconds.
  **ZOOM** floats — touch it, pick a direction, and rocket across the board destroying
  everything in your path.
- **Pause:** **P** or **Esc** freezes the game (music + tones duck); press again to resume.
- **Audio:** **M** mutes all sound, **N** toggles the music (both remembered).

## Code layout

The engine is split into focused ES modules under [`src/`](src/), each with one
job, so a given fix lands in one place:

| File | Owns | Edit it when… |
|------|------|---------------|
| [`config.js`](src/config.js) | The numbers — field/grid, marker speed, blob spectrum, colours | tuning feel or theming |
| [`levels.js`](src/levels.js) | The campaign data table — target % + Blobs per level | tuning progression / difficulty |
| [`control.js`](src/control.js) | Keyboard input → movement intents | changing controls (Phase 7 touch) |
| [`grid.js`](src/grid.js) | The world: cells, what's rideable, flood-fill claim | claim logic / geometry (§13, §16) |
| [`marker.js`](src/marker.js) | The player: movement, cutting, the update step | movement feel, cut behaviour |
| [`enemy.js`](src/enemy.js) | The Qix (line-sheaf) + Blobs/Hunters (polygon): bouncing, spawn, collision | enemy behaviour / shapes |
| [`sparx.js`](src/sparx.js) | Sparx + Fast Sparx: BFS perimeter chase, trail-latch, perimeter-kill | tracer enemy behaviour |
| [`powerups.js`](src/powerups.js) | Power-ups: spawn, pickups, timed effects, ZOOM aim/rocket | power-up behaviour |
| [`game.js`](src/game.js) | State machine: lives, level/zone, score, high score, win/advance, unlocks | progression flow / screens |
| [`audio.js`](src/audio.js) | Low-level Web-Audio engine: SFX, synth, MP3 track registry, beat analyser | sound design |
| [`audio-director.js`](src/audio-director.js) | Music policy: scene cues, interrupt/resume jingles, sonar tension, stingers | when/how music reacts to play |
| [`fx.js`](src/fx.js) | Particle bursts + screen shake (pure maths) | juice / feedback |
| [`render.js`](src/render.js) | All drawing — canvas (starfield, menu, HUD, read-out, overlays) | anything visual |
| [`render-pixi.js`](src/render-pixi.js) | Phase 9 Pixi.js renderer — same `render(view)` contract, opt-in via `?pixi` | the graphics upgrade |
| [`main.js`](src/main.js) | Wiring + the game loop / state routing / event→audio+fx / renderer switch | rarely |

The pure game logic (`grid`, `marker`, `enemy`, `game`, `levels`, `fx`) is
browser-API-free, so it stays separate from presentation (design principle §1.2)
and imports cleanly in Node for tests. The modules that *do* touch the browser
(`render`/canvas, `main`/DOM, `audio`/Web-Audio, plus `game`'s `localStorage`)
guard every access so they still import headlessly. This keeps a future
native/Godot port realistic and lets tests drive the real engine.

## Run locally

It's plain HTML/CSS/JS — no build step. Because the code uses ES modules, serve
the folder rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tests

The pure logic (`grid.js`, `marker.js`) imports cleanly in Node, so it's checked
headlessly before each deploy — e.g.:

```bash
cd src && node --input-type=module -e '
import * as grid from "./grid.js";
import * as ctrl from "./control.js";
import * as player from "./marker.js";
ctrl.press("ArrowUp");
for (let i = 0; i < 400; i++) player.update(0.034);
console.log("claimed", grid.percent.toFixed(1) + "%"); // ~50
'
```

## Live site

Hosted on GitHub Pages: <https://markwpirie.github.io/cosmic_cut/> (deploys on
push to `main`).

## Tech

Plain JavaScript (ES modules) + HTML5 Canvas; Pixi.js arrives in Phase 9. See
§12 of [GAME_DESIGN.md](GAME_DESIGN.md).
