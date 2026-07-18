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

**Phase 9 (graphics):** the rendering layer runs on **Pixi.js v8**, loaded as a
CDN ES module via an importmap — **no build step**. All game logic is
untouched; only presentation changed. See [PHASE9.md](PHASE9.md).

## How to play

Play it at <https://markwpirie.github.io/cosmic_cut/>. New to the game? The **?**
button on the zone-select screen (or the **H** key) opens a paginated in-game
instructions screen — the same content as this section, on-device.

- **Goal:** carve out the play field. Each level has a **target %** — claim that much of the arena to clear it and move on, through zones 1-1 … 5-5.
- Movement is continuous "ride the rail" — press a direction and you keep going until you turn or reverse. Hold a direction approaching a junction to take that turn. Push **into open space** to start a **cut**.
- **Cutting & risk:** while riding the bright perimeter (or a claimed edge) you're **safe**. The moment you cut into open space you're exposed — an enemy touching your **marker or your trail** costs a life (Sparx are dangerous even on safe ground — see [Enemies](#enemies)). Close the loop back to safe ground to **claim** the enclosed area.
- **Flow:** a **title** screen → **zone-select** (pick any zone you've reached, or toggle **Candy Mode** — a cosmetic pink reskin, see below) → play. The level starts when you push a direction; on a hit you freeze on the spot (brief beat) — press any key/tap to respawn; out of lives → back to zone-select (beat the **high score**). Clear all 25 levels once to unlock **SUPER** — the same campaign replayed with 2× enemies and tighter targets.

### Controls

| Desktop | Action |
|---|---|
| **Arrow keys** / **WASD** | Steer — push into open space to cut |
| **Hold SPACE** while cutting | **SLOW DRAW** — crawl, more exposed, but the claim scores **×10** |
| **P** / **Esc** | Pause — also a menu: SFX/music volume, Candy Mode, quit to menu |
| **M** | Mute all sound |
| **N** | Toggle music |
| **C** | Toggle Candy Mode (zone-select screen) |
| **V** | Toggle Candy Mode's music, Pink Mode ↔ normal (while Candy Mode is on) |
| **H** / **?** | Open the in-game instructions (zone-select screen) |

| Touch (phone) | Action |
|---|---|
| **Swipe** | Aim your heading — the marker turns onto that line at the next junction |
| **Two fingers held**, or the **SLOW** button | **SLOW DRAW** (bottom-left of the control strip) |
| **⏸ button** | Pause (bottom-right of the control strip — there's no Esc key on a phone) |
| **Tap** | Advance menus / respawn after a hit / start the level |

### Scoring

| Bonus | Trigger | Multiplier / points |
|---|---|---|
| Base | any claim | 10 pts per 1% of the arena |
| **BLOCK OUT** | single cut claims ≥75% | ×2 |
| **MEGA-CUT** | single cut claims ≥85% | ×4 |
| **LONG** / **SUPER LONG** / **MEGA LONG** | cut ≥2× / 3× / 4× a field-height | ×1.5 / ×2 / ×3 |
| **SLOW DRAW** | held SPACE for the whole cut | ×10 on that cut |
| **SPLIT** | trap an enemy on the smaller side of a claim | it dies, +500, and ×2 to every cut for the rest of the level |
| **NEAR MISS** | an enemy grazes your trail without hitting | +150 |
| Level clear | reach the target % | +1000, plus +250 per life remaining |

Bonuses on a single cut **stack** ("MULTI STACK!"). All values live in
[`config.js`](src/config.js)'s `POINTS`.

### Enemies

- **Qix** — the twisting line-sheaf; only dangerous while you're cutting.
- **Blobs** bounce through open space; **Hunter Blobs** drift toward you.
- **Sparx** patrol the border *and* your cut trail — deadly even while you're riding
  safely, so keep moving. **Fast Sparx** will latch onto your cut line mid-draw.
- **Special Blobs** (rare, glowing) — trap one in a **SPLIT** for a reward: an extra
  life, or a slow-down on every enemy. Touching one any other way is still lethal.
- Killed enemies **stay dead** — each family only respawns (one at a time, telegraphed)
  once it drops below 50% of the level's starting count.

### Power-ups

Grabbed by claiming the area they float in, except **ZOOM**, which floats freely and
is grabbed by touch:

| Power-up | Effect |
|---|---|
| **Freeze** | stops every enemy for 5s |
| **Solar Wind** | blasts every enemy against one wall for 6.5s |
| **Boost** | your ship moves 1.5× faster for 8s |
| **Shield** | no death from enemy contact for 6s |
| **ZOOM** | pick a direction, then rocket to that wall drawing a real cut — invulnerable, destroying every enemy in your path |

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
| [`render-pixi.js`](src/render-pixi.js) | All drawing — Pixi.js v8 (starfield, menu, HUD, read-out, overlays, bloom/glass/particles) | anything visual |
| [`main.js`](src/main.js) | Wiring + the game loop / state routing / event→audio+fx | rarely |

The pure game logic (`grid`, `marker`, `enemy`, `game`, `levels`, `fx`) is
browser-API-free, so it stays separate from presentation (design principle §1.2)
and imports cleanly in Node for tests. The modules that *do* touch the browser
(`render-pixi`/WebGL, `main`/DOM, `audio`/Web-Audio, plus `game`'s `localStorage`)
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

Plain JavaScript (ES modules) + Pixi.js v8 (WebGL) rendering onto an HTML5
canvas element. See §12 of [GAME_DESIGN.md](GAME_DESIGN.md).
