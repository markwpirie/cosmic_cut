# COSMIC CUT

A modern, neon, space-themed take on the classic *Qix* / *Kix* territory-cutting
arcade game. Carve out the play field, dodge enemies, hit the percentage target,
and chain risky cuts for big scores.

See [GAME_DESIGN.md](GAME_DESIGN.md) for the full design.

## Status

**Phase 4 complete** — a playable campaign. A start screen lets you pick an
unlocked starting zone; each level has a claim **target %** to hit, then a
**level-complete** beat (wipe + pause) and on to the next, harder level through
zones 1-1 … 5-5. Difficulty is data-driven (see [`levels.js`](src/levels.js)):
rising targets and **Blobs** that escalate along a blue→red spectrum (big/slow →
small/fast). Lives, extra life on X-4, game over → back to the start screen with
your reached zone unlocked (persisted). Built on Phases 0–3: continuous "ride the
rail" movement, grid + flood-fill claim, the two-tier perimeter model, and the
bouncing Blob. **Next: Phase 5** — cut scoring (BLOCK OUT, MEGA-CUT, SPLIT, LONG)
and the Sparx/Hunter enemy types. See §11 and §16 of [GAME_DESIGN.md](GAME_DESIGN.md).

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
| [`enemy.js`](src/enemy.js) | The Blobs: bouncing, spawn, collision | enemy behaviour |
| [`game.js`](src/game.js) | State machine: lives, level/zone, win/advance, unlocks | progression flow / screens |
| [`render.js`](src/render.js) | All drawing (incl. menu, intro, level-complete) | anything visual |
| [`main.js`](src/main.js) | Wiring + the game loop / state routing | rarely |

Everything except `render.js` and `main.js` is DOM-free (no canvas), so the pure
game logic stays separate from the rendering (design principle §1.2) — `game.js`
guards its `localStorage` use so it still imports headlessly. This keeps a future
native/Godot port realistic and lets tests import the real engine.

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
