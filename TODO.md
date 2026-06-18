# COSMIC CUT — TODO

Running task list. Roadmap phases live in [GAME_DESIGN.md](GAME_DESIGN.md) §11;
as-built decisions in §14/§16. Tick items off as they land.

## Next up
- [ ] **Phase 6 — power-ups & special Blobs.** Freeze first, then the rest, **ZOOM** last
      (rocket to edge, destroy enemies, subject to the 75% enemy floor). Special Blobs:
      extra-life and slow-down. Timed effects/state — see §11.

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
- [ ] **Phase 7** — touch controls for mobile (input abstraction).
- [ ] **Phase 8** — PWA, installable on iPhone home screen.
- [ ] **Phase 9** — Pixi.js, real sprites, glass blocks, richer neon/particles.
- [ ] **Phase 10** — boss / picture-reveal levels (X-5), **SUPER mode** (clear 5-5 → 2×
      enemies), scoring polish, final feel.

## Deferred (captured, not blocking — §15)
- [ ] Slow-cut bonus + its darker-shade visuals; **ZOOM** scoring.
- [ ] SUPER-mode build-out (wired conceptually; 5-5 currently ends at campaign-complete).
- [ ] LONG-cut multiplier cap vs. unbounded; Solar Wind vs ZOOM overlap.
