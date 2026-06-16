# COSMIC CUT

A modern, neon, space-themed take on the classic *Qix* / *Kix* territory-cutting
arcade game. Carve out the play field, dodge enemies, hit the percentage target,
and chain risky cuts for big scores.

See [GAME_DESIGN.md](GAME_DESIGN.md) for the full design.

## Status

**Phase 2 complete** — cut into open space and claim territory with a live %.
Continuous "ride the rail" movement (arrow keys / WASD), grid + flood-fill
claim, and a two-tier perimeter model (auto frontier/wall vs rideable internal
seams). Built in vertical slices, one new concept per phase (see §11 and §16 of
[GAME_DESIGN.md](GAME_DESIGN.md)). **Next: Phase 3** — enemies, collision, lives.

## Code layout

The engine is split into focused ES modules under [`src/`](src/), each with one
job, so a given fix lands in one place:

| File | Owns | Edit it when… |
|------|------|---------------|
| [`config.js`](src/config.js) | The numbers — field size, grid resolution, marker speed, colours | tuning feel or theming |
| [`control.js`](src/control.js) | Keyboard input → movement intents | changing controls (Phase 7 touch) |
| [`grid.js`](src/grid.js) | The world: cells, what's rideable, flood-fill claim | claim logic / geometry (§13, §16) |
| [`marker.js`](src/marker.js) | The player: movement, cutting, the update step | movement feel, cut behaviour |
| [`render.js`](src/render.js) | All drawing | anything visual |
| [`main.js`](src/main.js) | Wiring + the game loop | rarely |

`grid.js` and `marker.js` are DOM-free (no canvas), so they hold the pure game
logic separate from the rendering (design principle §1.2). This keeps a future
native/Godot port realistic — and lets tests import the real engine.

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
