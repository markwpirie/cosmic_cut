# COSMIC CUT — TODO

Running task list. Roadmap phases live in [GAME_DESIGN.md](GAME_DESIGN.md) §11;
as-built decisions in §14/§16. Tick items off as they land.

## Done recently
- [x] **Phase 6 — power-ups.** Freeze, Solar Wind, Boost, Shield, **ZOOM** all built
      (`powerups.js`). **ZOOM is a DASH** (redesigned): touch the floating pickup → aim
      with a direction key → the ship **rockets across the field DRAWING A REAL CUT** at
      `ZOOM.dashSpeedMult`× speed, **invulnerable**, killing any enemy it flies through
      (`ZOOM.dashKillReach`); the cut claims normally when it lands. Logic in
      `marker.startZoomDash()` + the dash kill-sweep `enemy.killNear()`; wired in `main.js`.
      Config in `config.POWERUPS.ZOOM`. *(Dev: press **Z** in-play to spawn a ZOOM on the
      ship for testing — remove `devSpawnZoom` + its key before shipping.)*
- [x] **Self-trail death (Qix rule).** Riding over your own in-progress cut line now
      **kills you** (`marker.selfHit`, checked in `onArrive` via a trail-node Set) — fixes
      the bug where you could wall off un-claimable islands. Works for normal cuts and
      dashes alike; shared logic, so it fixes canvas + Pixi.
- [x] **Enemy roster overhaul.** Two enemy shapes in `enemy.js`: the **star Qix**
      (line-sheaf — sticks surge to ~50% screen then settle, line-segment collision)
      and **polygon Blobs** (+ **Hunter Blobs** that drift at the player). **Sparx** +
      **Fast Sparx** in `sparx.js` (BFS perimeter chase, kill on perimeter too;
      Fast Sparx latch onto your cut trail and rocket along it). Per-level enemy mix
      via `qix`/`blobs`/`hunters`/`sparx`/`fastSparx` in `levels.js`.
- [x] **Player is a rocket ship** pointing along travel direction (engine flame,
      hot while cutting).
- [x] **Slow cut on SPACE** — hold while cutting to crawl (`MARKER.slowCutMult`); the
      claim is darker glass (`grid.slowFill` + `THEMES.claimedFillSlow`) worth **×2**
      (SLOW DRAW, `POINTS.slowCutMult`); trail turns glass-blue while slow.
- [x] **Glossy glass claimed areas** — clipped specular sweep + counter-sweep + breathing
      sheen (shimmer/ripple) in `render.drawClaimed`.
- [x] **Starscape upgrade** — baked offscreen nebula + galaxies, twinkling parallax stars.
- [x] **Solar Wind fixed** — now a sustained gust pinning enemies to one wall (was a
      one-frame nudge), with wind streaks + a HUD pill; louder arpeggio pickup sound.
- [x] **Feel fixes (round 2):**
      - **Slow draw is now a commitment** — armed only by holding SPACE as you leave
        the boundary or within `MARKER.slowArmWindow` (1s); after that SPACE is inert,
        and releasing mid-cut cancels it (must hold the whole line).
      - **Tighter blob hitbox** — collision uses `enemy.hitRadius` (`BLOB_POLY.hitScale`),
        not the full bounding radius, so blobs only kill near their actual body.
      - **Qix stays inside the arena** — sheaf bounce margin = current span + endpoints
        clamped to the field in `liveSeg` (used by both render and collision).
      - **Dark glass actually reads now** — deeper/opaque `claimedFillSlow`; the bright
        zone sheen is clipped to normal cells so slow glass stays dark.

## Phase 9 — Pixi.js (in progress, `phase9-pixi` branch — see PHASE9.md)
- [x] **Pixi v8 via CDN importmap, no build step**; opt-in with `?pixi` (canvas stays
      the default so the branch is always playable).
- [x] **Full renderer ported** (`render-pixi.js`): nebula/galaxy bg + stars, glass
      field, perimeter/trail, enemies (sheaf + poly + sparx), power-ups, rocket marker,
      particles, HUD + all overlays. Renderer switch + async init in `main.js`.
- [x] **Glisten confined to claimed cells** (was leaking a grey band over the whole field).
- [x] **Real glow** via `pixi-filters` `AdvancedBloomFilter` (replaces the multi-pass
      stroke fake — the strokes now feed the bloom instead of faking it). Anti-pixelation
      knobs exposed in `config.BLOOM` (`blur`/`quality`/`pixelSize`/`resolution`).
- [x] **Cell-masked specular gradient** for glass — the sweep is now smooth diagonal
      light-bars masked to the glass union (`glassMask` → `G.sweep`), not a per-cell white
      alpha (which staircased into 8px squares).
- [x] **Rounded territory edges (signature look)** — perimeter, glass rim, and the live
      cut line are traced as continuous loops/polylines (`traceLoops`) and stroked with
      rounded corners (`roundedPath` via `arcTo`). Corner radius in `config.CORNERS.radius`
      (clamped per-corner; ~4 smooths the 8px staircases into scallops). Fixed the
      separate "beaded/pixely perimeter" bug (was round caps on per-cell segments).
- [ ] Sprite-based stars/particles (ParticleContainer); glass-block depth; boss reveal.
- [ ] *Perf note:* `traceLoops` runs every frame (cheap at 90×65); cache on claim if needed.
- [ ] *Watch:* rounded-edge tracer pinch-points (diagonal cell touches) use a turn
      preference — eyeball diagonal cuts for any stray connecting line.
- [ ] Verify in-browser (written blind — watch the DevTools console for v8 API mismatches).

### Phase 9 — the "beautiful" art-direction pass (reference board in `assets/`)
Reference: `assets/Qix Jun 19, 2026, 08_30_18 PM.png` — a "QIX: NEXUS — Reclaim the
Void" visual storyboard. **This is the target look.** Visual DNA to hit:
- **Palette discipline:** deep near-black void; **cyan/teal** the hero colour;
  **magenta/violet** reserved for boss energy. Few colours, used with restraint.
- **Bloom on everything** (the biggest single upgrade vs the current fake glow).
- **Claimed area = luminous glass:** translucent blue fills with crisp emissive borders.
- **Enemies as energy** (bright glowing cores + trails), not flat shapes.
- **Atmospheric depth:** faint grid in the void, drifting motes, edge vignette.
- **Thin, wide sci-fi typography**; calm data-viz HUD.

Sequenced implementation (each step is visible, tune as we go — Mark is the eyes):
- [x] **1. Bloom** — `AdvancedBloomFilter` (`pixi-filters@6` via importmap) on a
      bloom-group container holding bg+world; HUD/overlays excluded so text stays
      crisp. Knobs in `config.BLOOM` (threshold/bloomScale/brightness/blur/quality).
- [~] **2. Palette pass** — *first pass:* retinted the Pixi void bake to restrained
      cyan/teal-blue and reserved magenta for boss energy. **Open decision (Mark):**
      keep the 5-zone `THEMES` colour journey or flatten all zones to cyan-hero?
      (Left `THEMES` untouched pending that call — tune under bloom.)
- [~] **3. Glass treatment** — *in progress.* Emissive hero-colour rim traced around
      claimed glass (rounded), plus a masked specular sweep. **Current sweep (segmented
      soft light-bars) is INTERIM — not the desired look.** Next, agreed direction:
      **`TilingSprite` (seamless diagonal streak/noise texture) + additive blend, clipped
      by the Graphics `glassMask`**, scrolling `tilePosition` for organic drifting
      reflections that let the starfield show through. Likely round the glass *fill* too
      so the body curves with the rim. See PHASE9.md "GORGEOUS GLASS".
- [ ] **4. Grid + vignette + ambient particles** — the atmospheric depth.
- [ ] **5. Energy enemies** — glow cores + particle trails (keep our shapes, make them radiate).
- [ ] **6. Typography** — sci-fi web font for HUD + titles.

Open decisions (Mark to decide):
- [ ] **Name** — *deferred.* Concern: **"Qix" is a Taito trademark** — using it in the
      product name risks infringement (the genre/mechanic itself isn't protected, just
      the name). Pick an original name (COSMIC CUT or new). Not legal advice — flagging.
- [ ] **Enemy style** — evolve current shapes to glow like energy (preferred) vs move
      to the simpler abstract points in the board.
- [ ] **Procedural vs assets** — bring in art assets (logo, boss bursts, rich
      backgrounds; possibly AI-generated) while gameplay stays crisp procedural vectors.

## Next up
- [ ] **Special Blobs** (the other half of §8) — extra-life Blob + slow-down Blob.
- [ ] **Enemy floor / respawn rule (§6)** — keep ≥75% of starting enemy count;
      respawn at the edge when SPLIT/ZOOM drop below it. Not yet wired.
- [ ] **Tune the new enemies by feel** — Qix surge (`QIX.spanMax`,
      `surgeIntervalMin/Max`, `endpointSpeed`); Sparx speeds + latch; Hunter drift;
      per-level counts in `levels.js`.

## Audio / feel follow-ups (from the Audio + Feel pass 2)
- [ ] **Separate SFX vs music volume** controls (in-game keys or a small menu). The
      buses already exist (`sfxBus` / `musicBus` in `audio.js`); add independent gains.
- [ ] **Sonar vs cut-tension hum** — both now play while cutting; decide whether to dial
      back or remove the older `cutStart`/`cutTension` hum now the sonar carries the
      exposed-tension feel.
- [ ] **Tune by feel** (all in `config.AUDIO`): sonar `slowInterval`/`fastInterval`/
      `level`/`freq`; throb `glowBoost`/`widthBoost`/`devGain`; `moveLevel`; `tension`
      weights (how fast the ping rate builds over a level vs. on danger).
- [ ] **Re-check level targets** — the field grew (720×600) and `%`-scoring was reduced;
      confirm the per-level target %s in `levels.js` still feel right, or retune.
- [ ] (Optional) **A non-speed tension layer** later — e.g. a filter sweep or an extra
      music layer that rises with tension. The music `playbackRate` speed-up stays OFF
      (`AUDIO.tension.rateSpan = 0`) — it felt bad.

## Tech / housekeeping
- [ ] **Stages 6–8 themes** are wired in the track registry but unused (only 5 zones).
      They auto-activate when the campaign grows past zone 5 — no audio change needed.
- [ ] **MP3 payload (~39 MB in git)** — fine for now and within limits; if the repo size
      becomes a concern, compress the tracks or move them to Git LFS.
- [ ] Re-enable the on-screen beat readout only if needed (`config.AUDIO.debugBeat`).

## Roadmap (later phases — see §11)
- [ ] **Phase 7** — touch controls for mobile (input abstraction). **Next major phase.**
- [ ] **Phase 8** — PWA, installable on iPhone home screen.
- [x] **Phase 9** — Pixi.js graphics layer **started** (see the in-progress section
      above + PHASE9.md). Real sprites / glass blocks / richer particles still to come.
- [ ] **Phase 10** — boss / picture-reveal levels (X-5), **SUPER mode** (clear 5-5 → 2×
      enemies), scoring polish, final feel.

## Deferred (captured, not blocking — §15)
- [ ] **ZOOM** scoring tuning (kill + distance values). *(Slow-cut bonus + darker glass: done.)*
- [ ] SUPER-mode build-out (wired conceptually; 5-5 currently ends at campaign-complete).
- [ ] LONG-cut multiplier cap vs. unbounded; Solar Wind vs ZOOM overlap.
