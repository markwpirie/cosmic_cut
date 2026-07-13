# COSMIC CUT — TODO

Running task list. Roadmap phases live in [GAME_DESIGN.md](GAME_DESIGN.md) §11;
as-built decisions in §14/§16. Tick items off as they land.

## Done recently
- [x] **Pause menu: RESUME / SFX / MUSIC / QUIT TO MENU — done 2026-07-13.** P/Esc
      still toggles pause instantly either way; once paused it doubles as a small
      menu (`config.PAUSE_MENU`/`pauseRowY`, drawn in `render-pixi.js`'s `drawPaused`).
      Keyboard: ↑↓ or WASD move the selection, ←→ adjust the SFX/MUSIC sliders,
      Enter/Space activates RESUME or QUIT. Touch (phone — no Esc key exists there):
      a new on-screen pause button mirrors the SLOW button on the other side of the
      bottom control strip (`TOUCH.pauseBtn`); once paused, every touch hit-tests the
      menu rows (`hitPauseRow`/`handlePauseTouch` in `main.js`) — tap RESUME/QUIT,
      tap left/right of a slider to adjust. **Quitting commits the run's score to
      the high-score table first** (`game.quitToMenu()`) so bailing early doesn't
      forfeit a high score. `control.js` gained a `paused` guard (`setPaused()`) so
      the menu-nav keys/touch-joystick calls don't leak into movement intents and
      yank the marker on resume. Real-device (phone) check still wanted.
- [x] **Post-mobile-playtest follow-up (2026-07-03), confirmed fixed on Mark's phone:**
      - **ZOOM really was stuck on touch** — the previous fix only covered keyboard.
        `setTouchDir()` never called into the aiming logic at all, so a swipe while
        aiming did *nothing*, on any direction, always. Extracted a shared
        `attemptZoomDash(dx,dy)` used by both the keyboard handler and touch swipes
        (which now check `isAiming()` first and route the swipe direction through it
        instead of treating it as a movement intent).
      - **Sparx kills no longer trigger a SPLIT.** `game.scoreCut()`'s `kills` param
        drove both the "SPLIT" label and a **permanent ×2 level multiplier** — right
        for trapping a Blob, too big a reward for a Sparx wandering into a claim.
        `scoreCut` now only ever receives Blob kills; Sparx kills score their own flat
        points (`POINTS.perKill × levelMult`, same rate as a Blob kill) via a direct
        `game.addScore()` + "SPARX +N" popup, with no lasting multiplier change.
      - **Near miss no longer fires right before a death.** It was edge-triggered on
        *entering* the danger band — which just telegraphs a still-closing threat, so
        the player would see "NEAR MISS" and get caught by the same blob a beat later.
        Moved to the *exit* transition (`enemy.pollNearMiss`): fires only once the
        blob has actually recovered back to a safe distance without a hit occurring.
      - **SLOW button moved to the left** (`config.TOUCH.slowBtn.x`) — most players
        steer (swipe) with their right thumb, so the modifier button now sits under
        the left thumb instead of competing with the steering hand.
- [x] **Post-mobile-playtest bug-fix pass (2026-07-03).** Six issues from the first
      mobile playtest, all verified headless (Playwright + system Chrome — screenshots,
      live module-state probes, and isolated logic tests, not just static reading):
      - **Battery drain** — `config.MOBILE` now gates the expensive Pixi filters:
        both `DisplacementFilter`s off (`NEBULA.warp`/`GLASS.refraction` → 0), lower
        `BLOOM.quality`/`resolution`, `AMBIENT.max` halved. Bloom itself stays on
        (the signature look); desktop values untouched.
      - **Level-select clipped at the edges** — a real off-by-construction bug in the
        chip layout from the mobile pass: `half` was derived FROM `gap` with no bound,
        so on 440px-wide screens the outer chips spilled ~7.5px past both edges. Fixed
        by deriving `gap` from the space left over after reserving `half` + padding.
      - **Sparx freezing on internal lines** — NOT stale seams (seams only ever
        accumulate, and `sparx.edgeValid()` already excludes them from sparx pathing
        entirely). Real cause: a claim can bury a sparx's just-arrived-at node so all
        4 edges go non-rideable in one step; the old code just parked it there forever
        (every frame re-ran the same dead BFS). Now reuses the existing
        `snapToNearestNode()` escape hatch (previously only used for trail-latch
        ejection) to relocate and retry immediately.
      - **ZOOM softlock** ("arrows show, nothing happens") — reproduced live via the
        dev **Z** key: picking up ZOOM while **riding** (not cutting) means only the
        ONE direction leading into open field can ever dash — the other 3 are
        correctly rejected by design, but silently. Fixed with a reject cue
        (`audio.ui()` + a small shake) so input is acknowledged instead of feeling
        broken. Also fixed a separate real bug found while tracing this: `control.js`'s
        keydown listener had no aiming guard, so arrow presses during aim mode still
        polluted `heldKeys`/`pending`.
      - **Solar Wind** — `duration` 3.5s → 6.5s; visual strengthened (wider/brighter
        streaks) plus a new row of directional chevrons scrolling with the gust so
        the wind's heading reads at a glance.
      - **Sparx enclose-to-kill + opposite respawn** (new feature) — sparx are now
        killable by enclosure exactly like Blobs: `marker.finishCut()` feeds
        `sparx.cells()` into the SAME `grid.applyClaim()` call as blob cells (one
        flood-fill, "keep the largest enemy-holding region"), then splits the
        returned killed indices back by array position. Killed sparx respawn
        immediately at the arena corner farthest from the player (`spawnOpposite()`),
        same fast/normal kind, via a `sparx.totalKilled` running counter (a plain
        `sparxList.length` delta would be masked by the immediate respawn).
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

## Phase 9 — Pixi.js (shipped and merged to main — see PHASE9.md)
- [x] **Pixi v8 via CDN importmap, no build step.**
- [x] **Full renderer ported** (`render-pixi.js`): nebula/galaxy bg + stars, glass
      field, perimeter/trail, enemies (sheaf + poly + sparx), power-ups, rocket marker,
      particles, HUD + all overlays.
- [x] **Canvas renderer retired (2026-07-13)** — `render.js` deleted, `?pixi` flag and
      renderer switch removed from `main.js`; `render-pixi.js` is now the only
      renderer, loaded unconditionally. `phase9-pixi` branch is redundant (merged,
      identical to `main`) and safe to delete.
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
- [x] **Boss picture-reveal** (2026-07-07) — `src/reveal.js` procedural per-zone
      scene shown through the glass on every X-5 (see the Phase 10 entry below).
- [ ] Sprite-based stars/particles (ParticleContainer); glass-block depth.
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
- [x] **2. Palette pass — DONE (cyan-hero flattening).** Mark chose disciplined
      cyan-hero: all 5 `THEMES` zones now stay in the cyan/teal family (temperature
      shifts only) with the old zone hue kept as a restrained `accent` (seams, arena,
      ZONE labels). `COLORS.marker` → white-cyan; `BLOB_TYPES` recoloured to the warm
      violet→red band so **pink/magenta = danger**. Nebula daubs cooled.
- [x] **3. Glass treatment** — TilingSprite shimmer (2 additive parallax layers,
      glass-masked) + nebula refraction landed earlier; verified in-browser this pass.
      *Tune `GLASS.opacity/tint` under Mark's eye.*
- [x] **4. Grid + vignette + ambient particles** — faint breathing holo-lattice over
      EMPTY cells only (claiming swaps tech-void for glass — `drawHoloGrid`), 40
      twinkling wrap-around dust motes, baked corner vignette Sprite (no new filter).
      Knobs: `config.GRID_BG/MOTES/VIGNETTE`.
- [x] **5. Energy enemies** — breathing halo cores (`energyCore`), body-coloured
      particle wakes, Qix endpoint sparks, sparx perimeter spark dribble, latched
      Fast-Sparx red danger shower + mini-bolts, kill explosions leave lingering
      neon dust (`fx.explode` 3rd wave, `config.FX`). Knobs: `config.ENERGY`.
- [x] **6. Typography** — **Orbitron** (Google Fonts, offline fallback to system-ui,
      ≤1.5s wait in `init()`); full HUD redesign: bracket-framed ZONE chip, **eased
      claim-progress bar** with target tick + claim flash, lives as mini ship darts,
      SCORE underline flare, hairline separator. Knobs: `config.HUD`.

Also landed in the art super-upgrade pass (2026-07-02):
- [x] **Ship upgrade** — swept-dart vector hull + **glowing ribbon tail** (per-segment
      tapered strokes, state-coloured: ride cyan / cut hot / slow glass-blue / dash pink)
      + thruster embers from a new renderer-local **ambient particle system**
      (`config.SHIP_TRAIL`, `config.AMBIENT` cap — perf fallback knob #1).
- [x] **Player-death impact** — spark eruption + expanding shock ring + radial magenta
      arcs + white flash at the hit point (`config.IMPACT`).
- [x] **Boss multi-stage escalation** — presentation-only, keyed to claim %
      (`BOSS.stages` 25/50/75): core grows + rotating charge ring, more arcs, faster
      rainbow; stage 3 strobes double bolts + flare rings + rainbow motes.

Open decisions (Mark to decide):
- [ ] **Name** — *deferred.* Concern: **"Qix" is a Taito trademark** — using it in the
      product name risks infringement (the genre/mechanic itself isn't protected, just
      the name). Pick an original name (COSMIC CUT or new). Not legal advice — flagging.
- [x] **Enemy style** — decided: energy beings (glow cores + wakes), built above.
- [ ] **Procedural vs assets** — bring in art assets (logo, boss bursts, rich
      backgrounds; possibly AI-generated) while gameplay stays crisp procedural vectors.

## Next up
- [x] **Special Blobs** (the other half of §8) — extra-life Blob + slow-down Blob.
      Built 2026-07-07: `config.SPECIAL_BLOBS`, placed via `levels.js` `special:
      ["life"|"slow"]` on 2-2/3-2/3-4/4-3/5-2/5-4. Reward on SPLIT-enclosure only;
      excluded from the respawn floor and the region-fill-keeps-open vote (see
      GAME_DESIGN §8).
- [x] **Enemy floor / respawn rule (§6) — redesigned 2026-07-07.** Killed enemies
      now **stay dead**; each family (Blobs/Hunters, Sparx) respawns one at a time,
      at an edge, only once its live count drops below **50%** (was going to be a
      75%-floor-with-backfill design, changed before it shipped) of the level's
      starting count. Sparx's old "always respawn 1-for-1 immediately" behaviour is
      gone, replaced by the same floor rule. The sheaf Qix keeps its separate
      always-≥1-alive rule. `config.RESPAWN`.
- [ ] **Tune the new enemies by feel** — Qix surge (`QIX.spanMax`,
      `surgeIntervalMin/Max`, `endpointSpeed`); Sparx speeds + latch; Hunter drift;
      per-level counts in `levels.js`.

## Audio / feel follow-ups (from the Audio + Feel pass 2)
- [x] **Separate SFX vs music volume — done 2026-07-13.** Independent 0-100% sliders
      (`audio.getSfxVolume/setSfxVolume`, `getMusicVolume/setMusicVolume`, persisted
      in `localStorage`, `AUDIO.volumeStep` = 10%/press) live in the pause menu — see
      below. `sfxBus`/`musicBus` gains now scale by these on top of the existing M
      mute / N music-on-off toggles.
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
- [x] **Phase 7** — **touch controls done.** Relative virtual joystick (swipe = heading,
      two fingers = slow draw); taps advance menus; a swipe begins the level. In `main.js`,
      built on `control.press/release/setSlow`. Verify on a real iPhone.
- [x] **Mobile portrait mode (2026-07-03).** Auto-detected at load (`config.MOBILE`:
      coarse pointer + phone screen): **portrait canvas 440×876, field 400×712 (50×89
      cells)**, desktop untouched. Two-row HUD (big SCORE), visible **SLOW ×2 hold
      button** (`config.TOUCH.slowBtn`) in a 100px bottom control strip, touch
      listeners on the *document* (swipes work anywhere — dead-space swallowing fixed),
      menu swipe-select + tap-start, safe-area insets for the notch, VFX radii +
      overlay text scale to the canvas. `QIX.spanMax` now derives from the field short
      side. Verified on emulated iPhone 13 + desktop regression; **real-device feel
      pass still wanted.**
- [x] **Phase 8** — PWA, installable on iPhone home screen. Built 2026-07-07:
      `manifest.json` + `sw.js` (root, no build step), procedural icons in
      `assets/icons/`. Verified headless (offline reload, offline `?pixi` after
      priming, MP3 Range/206 support); **install + real-device check on Mark's
      iPhone still wanted.**
- [x] **Phase 9** — Pixi.js graphics layer: bloom, rounded edges, gorgeous glass
      (TilingSprite shimmer + refraction), churning nebula (DisplacementFilter), glowy
      particles, rainbow Qix, lightning storms + crackles. (See PHASE9.md; sprite-based
      stars + glass-block depth still open.)
- [x] **Phase 10** — **boss done for X-5** (big rainbow lightning Qix, `config.BOSS`).
      **Built 2026-07-07:** picture-reveal levels (`src/reveal.js`), **SUPER mode**
      (clear 5-5 → 2× enemies, `game.currentSpec()`/`superUnlocked`), ZOOM scoring
      polish (`killPoints`/`distancePoints`). Still open: final feel pass.

## Verify by eye (art super-upgrade pass — all steps WERE checked headless in
## Chrome: zero console errors, screenshots at each step; these need taste, not triage)
- [x] **Palette across zones 1–5, redone 2026-07-07** — the cyan-hero flattening
      (ice-blue/sea-green/steel-blue/white-hot) was superseded by a clear per-zone
      hue matching `assets/levels.png` (cyan/green/gold/purple/red); headless
      screenshots confirm all 5 zones read distinct in both renderers. **Still
      worth an eyeball pass:** zone 3 gold vs. anything else warm, zone 4 purple
      vs. the enemies' violet end, zone 5 red vs. the enemies' hot-pink end — the
      enemies were recoloured into a fixed magenta/hot-pink band specifically to
      clear these, but only Mark's eye can confirm it actually reads clean at
      speed, mid-fight, not just in a static screenshot.
- [ ] **Special Blob glyph readability** — the "+" (life) / clock (slow) glyph at
      the blob's centre is small under bloom; confirm it reads at a glance, or
      just lean on colour + the level's known `special` placement.
- [ ] **Reveal art per zone** — `src/reveal.js`'s procedural scenes (galaxy/ringed
      planet/black hole/cracked planet) are a first pass matching `assets/levels.png`'s
      *composition*, not its fidelity. Tune `REVEAL.dim`/`glassMult`, or swap in
      real art later (same `revealSource()` contract, see GAME_DESIGN §7).
- [ ] **6-chip SUPER menu at 440px mobile** — screenshotted clean at 390×844 in this
      session; worth a real-device check (the exact chip-gap math had a genuine
      off-by-construction bug once before).
- [ ] **PWA install on Mark's iPhone** — headless-verified (offline reload, offline
      `?pixi`, MP3 Range/206); needs the real "Add to Home Screen" + icon/splash
      check that only a device can give.
- [ ] **Glass shimmer strength** (`GLASS.opacity/tint`) under the new cyan palette.
- [ ] **Ribbon + thruster feel** — `SHIP_TRAIL` life/width/rates; ZOOM-dash colour.
- [ ] **Particle density** — `ENERGY` rates + `AMBIENT.max` (drop first if GPU strain).
- [ ] **HUD layout at devicePixelRatio** — Orbitron sizes, bar position (`config.HUD`),
      and the DevTools-offline fallback (system-ui) still laying out sanely.
- [ ] **Boss stages on a real X-5 run** — stage beats at 25/50/75% (headless test
      faked the thresholds; the real percent path needs a playthrough).

## Verify on the boss's return (written blind — needs real-device / in-browser eyes)
- [x] **Touch on a real iPhone** — swipe steering, level-select fits, ZOOM aiming,
      Solar Wind, Sparx kill/respawn, near-miss timing, SLOW button placement all
      **confirmed working by Mark on his own phone (2026-07-03)**. Emulated-device
      history: verified on an EMULATED iPhone 13 first (2026-07-02, Playwright touch
      events), which caught two real bugs — Pixi's `autoDensity` inline style
      distorting the arena (fixed via a contain-fit rule) and vertical swipes
      scrolling the page on iOS (fixed via a full page lock). The real-device pass
      then caught what emulation couldn't: touch never reaching ZOOM's aiming logic
      at all, and the three scoring/UX issues above — all now fixed too.
- [ ] **Boss at 1-5** (and every X-5) — looms bigger, rainbow + lightning + pulsing core;
      confirm it doesn't jitter (surge span capped for that reason). Tune `config.BOSS`.
- [ ] **Lightning intensity** — ambient storm cadence (`stormTimer` 5–13s), cut crackle
      threshold (danger ≥ 0.32). Dial back in render-pixi if too busy.
- [ ] **GPU budget** — the scene now runs bloom + 2 displacement filters + masked additive
      sprites. If context-loss/blank, drop `GLASS.refraction`/`NEBULA.warp` to 0 or lower
      `BLOOM.resolution`/`pixelSize`.

## Deferred (captured, not blocking — §15)
- [x] **ZOOM** scoring tuning (kill + distance values) — done 2026-07-07:
      `killPoints` 80→250, new `distancePoints` (0.25/px). *(Slow-cut bonus + darker glass: done.)*
- [x] SUPER-mode build-out — done 2026-07-07 (`game.currentSpec()`/`superUnlocked`,
      see GAME_DESIGN §5). Beyond S5-5 (wrap to SS mode? procedural?) is still open.
- [ ] LONG-cut multiplier cap vs. unbounded; Solar Wind vs ZOOM overlap.

## SUPER mode target table (for the eventual tuning pass)
Every level's SUPER target = `max(SUPER.targetMin=50, target + SUPER.targetDelta=-4)`,
enemy counts (qix/blobs/hunters/sparx/fastSparx) × `SUPER.enemyMult=2`. Since every
base target in `levels.js` is ≥70%, the floor never actually bites yet — every
SUPER target today is simply `target - 4` (66% for 1-1's 70%, up to 86% for the
90% levels). `targetMin` only matters if a future zone's base target drops below 54%.
