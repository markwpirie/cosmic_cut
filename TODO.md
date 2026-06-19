# COSMIC CUT — TODO

Running task list. Roadmap phases live in [GAME_DESIGN.md](GAME_DESIGN.md) §11;
as-built decisions in §14/§16. Tick items off as they land.

## Done recently
- [x] **Phase 6 — power-ups.** Freeze, Solar Wind, Boost, Shield, **ZOOM** all built
      (`powerups.js`). ZOOM = touch the floating pickup → aim with a direction key →
      rocket to that wall, killing blobs in the path. Config in `config.POWERUPS`.
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
- [ ] **Phase 9** — Pixi.js, real sprites, glass blocks, richer neon/particles.
- [ ] **Phase 10** — boss / picture-reveal levels (X-5), **SUPER mode** (clear 5-5 → 2×
      enemies), scoring polish, final feel.

## Deferred (captured, not blocking — §15)
- [ ] **ZOOM** scoring tuning (kill + distance values). *(Slow-cut bonus + darker glass: done.)*
- [ ] SUPER-mode build-out (wired conceptually; 5-5 currently ends at campaign-complete).
- [ ] LONG-cut multiplier cap vs. unbounded; Solar Wind vs ZOOM overlap.
