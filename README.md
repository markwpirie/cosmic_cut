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

## Run locally

It's plain HTML/CSS/JS — no build step. Either open `index.html` directly, or
serve the folder (needed because `main.js` is an ES module):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Live site

Hosted on GitHub Pages (deploys on push to `main`).

## Tech

Plain JavaScript + HTML5 Canvas (Pixi.js comes in Phase 9). See §12.
