# COSMIC CUT

A modern, neon, space-themed take on the classic *Qix* / *Kix* territory-cutting
arcade game. Carve out the play field, dodge enemies, hit the percentage target,
and chain risky cuts for big scores.

See [GAME_DESIGN.md](GAME_DESIGN.md) for the full design.

## Status

**Phase 5 complete** — scoring & cut rewards on top of the Phase 4 campaign.
A finished cut scores base points per % claimed, multiplied by **BLOCK OUT**
(≥30%), **MEGA-CUT** (≥50%), **LONG** tiers (by cut length) and a per-level
multiplier; a **SPLIT** (trapping/killing a blob on the smaller side) adds kill
points and grants ×2 for the rest of the level; stacking bonuses flash
**MULTI STACK!**. You're only vulnerable while *cutting* — riding the perimeter
is safe. All point values live in [`config.js`](src/config.js) `POINTS`.
Underneath: the Phase 4 campaign (start screen + zone select, data-driven levels
in [`levels.js`](src/levels.js), per-zone themes, target %, level-complete beat,
lives) and Phases 0–3 (ride-the-rail movement, flood-fill claim, perimeter model,
bouncing Blobs). **Next: Phase 6** — power-ups (Freeze first, ZOOM last) plus the
special extra-life and slow-down Blobs. See §11/§16 of [GAME_DESIGN.md](GAME_DESIGN.md).

## How to play

Play it at <https://markwpirie.github.io/cosmic_cut/>.

- **Goal:** carve out the play field. Each level has a **target %** — claim that much of the arena to clear it and move on, through zones 1-1 … 5-5.
- **Controls:** **Arrow keys** or **WASD**. Movement is continuous "ride the rail" — press a direction and you keep going until you turn or reverse (press the opposite). Hold a direction approaching a junction to take that turn. Push **into open space** to start a **cut**.
- **Cutting & risk:** while riding the bright perimeter (or a claimed edge) you're **safe**. The moment you cut into open space you're exposed — a Blob touching your **marker or your trail** costs a life. Close the loop back to safe ground to **claim** the enclosed area.
- **Scoring:** bigger, bolder cuts pay off — **BLOCK OUT** (≥30%), **MEGA-CUT** (≥50%), **LONG** tiers (long cuts), and **SPLIT** (trap a Blob on the smaller side: it dies, you score, and the level multiplier ×2). Stacked bonuses → **MULTI STACK**.
- **Flow:** the level starts when you press a direction; on a hit you freeze on the spot — press any key to respawn; out of lives → start screen (pick any zone you've reached).

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
