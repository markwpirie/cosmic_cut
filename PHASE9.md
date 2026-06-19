# Phase 9 — Pixi.js graphics layer

Branch: **`phase9-pixi`** (cut from `main`). Goal: swap the presentation layer for
**Pixi.js** for richer neon/glass/particles, **without touching game logic**. The
canvas renderer (`render.js`) stays the default; Pixi is opt-in while it matures.

## How to run / test
```
python -m http.server 8000
```
- Canvas (current game, unchanged):  http://localhost:8000
- **Pixi renderer:**                 http://localhost:8000/?pixi

Both run the exact same game — only the drawing differs. If `?pixi` shows a blank
or errors, open DevTools (F12) → Console; Pixi API mistakes show up there.

## Decisions (made on the `phase9-pixi` branch)

1. **Pixi v8 via CDN ES module — no build step.** An `importmap` in `index.html`
   maps `pixi.js` → `https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs`.
   - *Why not Vite/npm?* This PC has no Node/npm installed, and the project's
     whole identity is "serve the folder, no build." Pixi v8 is ESM-first and
     imports straight from a CDN, so GitHub Pages stays a plain static deploy.
   - Trade-off: needs network on first load (CDN fetch); the file is cached after.
     If we ever want offline/local Pixi, drop `pixi.min.mjs` into `vendor/` and
     point the importmap at it — no other change.

2. **Opt-in via `?pixi`, canvas stays default.** `main.js` reads the flag, and in
   Pixi mode dynamically `import()`s `render-pixi.js` and `await`s its `init()`
   before the loop runs. A `draw(view)` helper routes each frame to whichever
   renderer is active. So the branch is **always playable** (canvas) while the
   Pixi path is built and verified incrementally.

3. **Same render contract.** `render-pixi.js` exposes `init(canvas)` + `render(view)`
   matching `render.js`, and reads the identical world modules (grid/marker/enemy/
   sparx/powerups/game/levels/fx). No game-logic change — pure presentation (§1.2).

4. **Immediate-mode draw for now.** Each frame clears + rebuilds Graphics, mirroring
   `render.js` for an easy, low-risk port. Pixi's own ticker is stopped; our loop
   calls `app.render()` once per frame. Glow is faked with widening, fading stroke
   passes (Pixi has no `shadowBlur`).

## What's ported so far
- Pixi `Application` bootstrap (manual render; retina via `resolution`/`autoDensity`).
- Background: baked nebula+galaxy **texture** (reuses the proven 2D-canvas bake) +
  live twinkling parallax stars.
- Play field: claimed glass (normal + dark slow), seams, arena border, frontier
  perimeter (beat-reactive), cut trail (heat + slow tint), solar-wind streaks.
- Enemies: Qix line-sheaf, polygon Blobs/Hunters, Sparx/Fast Sparx.
- Power-up icons (+ floating ZOOM), the rocket-ship marker, ZOOM aim arrows.
- Particles, danger vignette (approximated as an edge frame).
- HUD, popups, score read-out, and all overlays (title/menu/intro/dead/gameover/
  campaign-complete/paused/level-complete).
- Screen shake (offsets world layers; UI stays steady).

## Roadmap / next (polish that earns Pixi its keep)
- [ ] **Real glow** via `pixi-filters` (`GlowFilter`/`AdvancedBloomFilter`) or an
      additive-blend glow layer, replacing the multi-pass stroke fake.
- [ ] **Cell-accurate glass gloss** — mask a moving specular gradient to the claimed
      cells (Pixi mask + `FillGradient`), matching/*beating* the canvas gloss.
- [ ] **Sprite-based stars/particles** (ParticleContainer) for cheaper, denser FX.
- [ ] **Glass blocks with depth** — bevel/refraction look for claimed territory.
- [ ] **Boss picture-reveal** (X-5): claimed cells reveal a hidden image (Pixi mask
      over a Sprite) — Phase 10 hook, but Pixi makes it easy.
- [ ] Verify text crispness at devicePixelRatio; tune font sizes if needed.
- [ ] Once Pixi reaches parity + looks better, consider making it the default and
      retiring/keeping `render.js` as a fallback.

## Files
- `index.html` — Pixi importmap.
- `src/render-pixi.js` — the Pixi renderer (new; mirrors `render.js`).
- `src/main.js` — renderer switch (`USE_PIXI`, dynamic import, `draw()` helper).
- Everything else is shared, untouched logic.
