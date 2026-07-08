# COSMIC CUT — Game Design Document (Draft 6)

A modern, neon, space-themed take on the classic BBC Micro game *Kix* (itself a clone of the arcade game *Qix*). Carve out territory by cutting areas of the play field while dodging enemies, hit the percentage target to clear the level, and chain bold risky cuts — SPLITS, BLOCK OUTS, MEGA-CUTS and LONG cuts — for big scores.

**Status:** Draft 6 — **Phases 0–6 built and live, plus two feel passes and an enemy/visual overhaul.** Done through Phase 5: ride-the-rail movement, grid + flood-fill claim (auto-network vs seam), the SPLIT claim/kill, a data-driven campaign (zones 1-1…5-5, start screen + zone unlocks, per-zone themes, lives, death beat), full cut scoring (BLOCK OUT / MEGA-CUT / LONG / SPLIT / MULTI STACK with a central read-out), and the feel layer (procedural + MP3 audio via the **AudioDirector**, screen shake + particles, danger telegraphing, near-miss, starfield, persistent high score, pause, title screen, bigger 800×680 field). **Phase 6 (power-ups) is built** — Freeze, Solar Wind, Boost, Shield, ZOOM (`powerups.js`). The **enemy roster + visuals have been overhauled**: the star **Qix** is now the classic Kix **line-sheaf** (sticks surge to ~50% of screen then settle; collision tests the live line), alongside **polygon Blobs**, **Hunter Blobs** (drift at the player), and **Sparx + Fast Sparx** (`sparx.js` — BFS perimeter chase, kill on the perimeter too, Fast Sparx latch onto the cut trail). The **player is now a rocket ship** pointing along its heading. A **slow-cut + visual/feel pass** then added **slow-draw on SPACE** (darker glass, ×2), **glossy shimmering glass** claimed areas, a **nebula/galaxy starscape**, and fixed **Solar Wind** into a sustained wall-pin. **Next: Phase 7** (touch controls). The as-built specifics live in §14 (locked decisions) and §16 (movement/perimeter); this remains the source of truth.
**Repo:** `c:\Users\markw_v611rg3\Documents\GitHub\cosmic_cut` (PC; GitHub + local). Build continues in Claude Code.
**Live:** https://markwpirie.github.io/cosmic_cut/ (GitHub Pages, deploys on push to `main`).
**Target platform:** Web first (desktop + mobile browser), structured for later iPhone port.
**Builder:** First game, non-coder. Scoped to be learnable step by step.

---

## 1. Design Principles (for a first build)

These keep the project achievable without killing the ambition:

1. **Build in vertical slices.** Get one ugly playable level working end-to-end before adding polish. A grey box that plays correctly beats a beautiful menu with no game.
2. **Separate logic from looks.** The rules of the game (movement, fill %, collisions) are plain maths and don't care what the graphics look like. We build and test that core first, then bolt the neon on top. This is also what makes a later Godot/native port realistic.
3. **One new concept at a time.** Each build phase introduces a single new idea so the learning compounds instead of overwhelming.
4. **Data-driven levels.** Levels are defined in a simple table/config, not hard-coded. Tuning the difficulty curve becomes editing numbers, not rewriting code.

---

## 2. Core Gameplay Loop

1. Level starts. Zone/level shown (e.g. *"ZONE 1-1"*), target percentage **big and central**: *"CLAIM 50%"*, then *"LETS GO!!"*.
2. Player moves a marker along the safe border of unclaimed space.
3. Player pushes into open space to **cut** a line (the risky bit — you're exposed while cutting).
4. Closing a loop back to a safe edge **claims** the enclosed region.
5. Claimed area solidifies into a **shiny glass-like block of colour**, adding to your percentage.
6. Hit the target % → level complete, bonuses awarded, next level.
7. Get caught (enemy touches you or your in-progress cut) → lose a life.
8. Out of lives → game over, score recorded.

---

## 3. Draw Speed & The Tower Technique

**Standard speed is FAST.** Holding a button cuts SLOW (worth more, exposed longer). This is the inverse of some Qix clones and matches how you play.

**Tower play (a core skill the design rewards):** build up a structure with lots of small safe shapes to box an enemy into a tight space, then make one quick decisive cut to trigger a SPLIT, MEGA-CUT or a high-value MEGA SLOW CUT. The scoring is deliberately tuned so this kind of setup-then-strike play pays off far better than nibbling away at the edges.

Note the deliberate tension between two scoring philosophies: **tower play** (patient setup, big area) vs **LONG cuts** (§4 — long risky strokes through open space). Both are rewarded by different mechanics so the game supports two distinct high-skill styles.

*(**Built:** slow-cut-by-button-press is now in — **hold SPACE while cutting** to crawl at `MARKER.slowCutMult` speed. It's a deliberate commitment: you arm it by holding SPACE as you leave the boundary or within `MARKER.slowArmWindow` (1s) of the cut starting; after that SPACE is inert, and releasing mid-cut cancels it (must hold the whole line). The enclosed claim becomes **darker glass** and scores a **SLOW DRAW ×2** bonus. More exposed, double the reward — the tower-builder's tool.)*

---

## 4. Signature Mechanics — The Cuts

This is the heart of the feel. Area thresholds measured against the **total arena**. All multipliers **stack** unless noted.

| Mechanic | Condition | Reward |
|----------|-----------|--------|
| **BLOCK OUT** | Single cut claims **≥ 30%** | ×2 score on that claim, big expanding *"BLOCK OUT!"* text, particle burst |
| **MEGA-CUT** | Single cut claims **≥ 50%** | ×4 score, *"MEGA-CUT!!"*, screen shake + bright flourish |
| **SPLIT** | A single cut leaving an enemy on **each side** of the line. All enemies on the **smaller** side die (see §6 for the respawn floor). | ×2 level multiplier for the rest of the level |
| **MEGA-CUT SLOW** | A slow-drawn cut that also qualifies as a MEGA-CUT | Highest area-play value — stacks slow bonus with MEGA multiplier. Claimed fill is a darker shade to differentiate slow cuts |
| **SPLIT SLOW** | A slow-drawn SPLIT | Stacks slow bonus onto the SPLIT |
| **LONG / SUPER LONG / MEGA LONG** | Rewards the **length of the cut line** (the distance travelled through open space during the cut), not area. Pure risk for time exposed. | See LONG-cut detail below |
| **MULTI STACK** | Multiple bonus *types* landing on one single cut (e.g. SPLIT + MEGA-CUT + SLOW + LONG together) | All applicable multipliers stack into one combo on that cut — the scoring ceiling of the game |

### LONG-cut detail
The cut line changes colour as it gets longer, measured against **`l` = the vertical height of the play field**. Length here means **total line length drawn through open space** (the long-stroke distance), which is what rewards big sweeping risky cuts rather than tower nibbling.

| Line length | Colour | Multiplier |
|-------------|--------|------------|
| ≥ 1.0 `l` | Blue | (LONG — base) |
| ≥ 1.5 `l` | Yellow | building |
| ≥ 1.75 `l` | Red | building |
| ≥ 2.0 `l` | Flashing red/white | **×2**, then **+1 per additional 0.25 `l`** |

The LONG multiplier **stacks** with area bonuses (BLOCK OUT/MEGA-CUT) and with SLOW — a single long, slow, big-area split is the dream play.

### SPLIT detail
The showpiece move. Boxing an enemy and cutting so opponents end up separated either side of your line is the high-skill play. It grants a level-wide ×2 multiplier; all enemies trapped on the smaller side are destroyed. SPLIT + MEGA-CUT + SLOW + LONG in one stroke is the ceiling (a MULTI STACK). **Blobs only:** enclosing a Sparx (see §6) scores its own flat kill points but does **not** grant the SPLIT label or the level multiplier — that permanent, run-defining bonus stays reserved for trapping a primary enemy, not a perimeter tracer wandering into a cut.

*(All thresholds are starting guesses — tuned once playable.)*

---

## 5. The Play Field

- A rectangular arena, inset within a neon-bordered frame. **Looks attractive from the start** — not a grey box in the final game (though early dev phases will be plain while we build the logic).
- Unclaimed space: deep animated space backdrop, or a parallax cloudscape (think *Super Star Wars*).
- **Claimed areas:** solidify into shiny, glass-like blocks of colour — translucent, glossy, catching neon light. The arena visibly fills with jewel-like territory as you win. **Slow-cut claims use a darker shade** to differentiate them. Each claimed region keeps its own **internal perimeter** (the line of the cut that made it), so the border between a slow-cut darker region and a normal one stays visible and rideable — see the perimeter model in §16.
- HUD across the top: Score, Lives, Current %, Target %, active Power-up, level multiplier (if a SPLIT is active).

---

## 6. Enemies

| Type | Behaviour | Introduced | Notes |
|------|-----------|------------|-------|
| **The Blob (Qix)** | Free-floating expanding/contracting line shape bouncing around open area. Touches your in-progress cut or marker = death. | 1-1 | The classic threat. |
| **Sparx (Tracers)** | Travel *along the borders* — arena edge and edges of claimed areas. Chase the player. | 1-3 | Forces you to keep moving. |
| **Fast Sparx** | Faster tracer variant. | 2-1 | Speed ramp. |
| **Hunter Blob** | A Blob that drifts toward the player's marker. | 2-3 | Pressure on big cuts. |
| **Twin Blobs** | Two Blobs at once. | 3-1 | Crowded open area. |

**As built (enemy overhaul):** all five exist in code. The **Qix** renders as the classic Kix **line-sheaf** — two endpoints sweep inside a body box that normally stays compact but periodically **surges** to ~50% of the screen, drawing a twisting ribbon of straight "sticks"; collision tests the **live stick line** (not a disc), so a long stick only kills where the line is. The **Blob** and **Hunter Blob** render as **polygon** shapes (orbiting vertices + internal diagonals); the Hunter adds a soft drift toward the marker and a pulsing tendril. **Sparx** and **Fast Sparx** live in `sparx.js`: they BFS-chase along the auto-network and **kill on the safe perimeter as well as while cutting**; Fast Sparx can **latch onto the exposed cut trail** and rocket along it to catch the player mid-cut. Per-level enemy mix is data-driven in `levels.js` (`qix` / `blobs` / `hunters` / `sparx` / `fastSparx`). Enemy size + behaviour knobs are in `config.QIX`, `config.BLOB_POLY`, `config.SPARX`. **Twin Blobs** is just "≥2 of the bouncers in one level". The **50% enemy floor/respawn** (below) is now wired for both Blobs and Sparx.

**Sparx enclose-to-kill (2026-07-03), respawn rule updated (2026-07-07):** Sparx can also be killed the Qix way — enclose one in a claim (same flood-fill `grid.applyClaim()` call as Blobs, so a single cut can trap both kinds at once) and it dies. Unlike a Blob SPLIT this is **not** a level-multiplier event (see §9) — it scores its own flat kill points. It no longer respawns immediately; it now stays dead and is subject to the same **50% enemy floor** below as Blobs (its own family: live Sparx count vs. the level's starting Sparx count), respawning one at a time at the arena corner **farthest from the player** only once the family drops below floor.

**Enemy ↔ Target % relationship:** big/fast/multiple enemies = lower % target. Enforced by the level table so we never demand a high % with a screen full of fast hunters.

**Enemy floor & respawn rule (updated 2026-07-07 — killed enemies stay dead):** each enemy family — poly Blobs/Hunters, and Sparx, tracked separately — only respawns once its **live count drops below 50% of that level's starting count** for the family. Kills below the floor queue up and respawn one at a time, at a short delay, at an arena edge (away from the player), with a brief harmless telegraph before they're live. The sheaf **Qix** keeps its own separate, stricter rule: **always ≥1 alive** (not floor-based) — a Qix is needed to carve around. This keeps levels from becoming trivially safe after a big SPLIT, while genuinely rewarding thinning the board out, rather than the old 75%-floor design where kills were largely backfilled.

*Example:* a level starts with 4 poly Blobs (floor = 2). A SPLIT kills 2 → count is 2 — AT the floor, nothing respawns. A further kill drops it to 1 — BELOW the floor — one respawns after the delay, back to 2. It stays at 2 (not 4) until more kills push it below floor again.

---

## 7. Zones & Level Progression

Levels are grouped into **zones** of 5: **1-1 … 1-5**, then **2-1 … 2-5**, up to **5-5**. Each new zone steps up enemy variety and speed; within a zone difficulty rises gently.

**Every X-5 is a BOSS level (picture-reveal):** claimed areas uncover a hidden high-res image behind the field instead of glass blocks — the prettier picture is literally revealed as you clear it. A pacing beat every 5th level and a visual payoff. Boss levels use the **same enemy set** as the zone they cap (for now).

**As built (2026-07-07):** the picture shows THROUGH the glass, not instead of it — the flat claimed fill is scaled down (`config.REVEAL.glassMult`, default 0.75) rather than removed, so the shimmer/specular sweep and emissive rim stay full-strength on top. `src/reveal.js` bakes a procedural per-zone "hero scene" to an offscreen canvas once and caches it (`revealSource(zone, w, h)`), matching `assets/levels.png`'s zone scenes: **1** spiral galaxy, **2** green ringed planet, **3** gold black hole + jet, **4** purple ringed planet + moon, **5** red cracked planet. Image-source-agnostic by design — swapping in supplied art later is just drawing an `Image` into the same cached canvas, no renderer changes. Both renderers clip it to the claimed-cell union (canvas: `ctx.clip()`; Pixi: a `revealSprite` sharing the shimmer's `glassMask`) and only activate it when `currentLevel().boss` is true ✓

**The 5-5 boss is the campaign wall** — deliberately hard. Beating it unlocks **SUPER mode**:

- **S1-1 onward** replays the same level layouts with **double the enemy count** of their base versions.
- Targets and respawn floors recalculate against the doubled counts (the enemy↔% relationship still holds, so doubled enemies generally means lower % targets).

Starter table — just data, easy to tune:

| Level | Target % | Enemies | Blob Speed | Notes |
|-------|----------|---------|------------|-------|
| 1-1 | 50% | 1 Blob | 1.0 | Gentle intro |
| 1-2 | 55% | 1 Blob | 1.0 | More to claim |
| 1-3 | 55% | 1 Blob + 1 Sparx | 1.05 | Tracer introduced |
| 1-4 | 60% | 1 Blob + 1 Sparx | 1.1 | **Extra life on clear** |
| 1-5 | 50% | 1 Blob + 1 Sparx | 1.1 | **BOSS — picture reveal** |
| 2-1 | 60% | 1 Blob + 1 Fast Sparx | 1.15 | Speed step |
| 2-2 | 60% | 1 Blob + 2 Sparx | 1.15 | Edge pressure |
| 2-3 | 60% | 1 Hunter Blob + 1 Sparx | 1.2 | Blob stalks → lower % |
| 2-4 | 65% | 1 Hunter Blob + 2 Sparx | 1.2 | **Extra life on clear** |
| 2-5 | 55% | 1 Hunter Blob + 2 Sparx | 1.2 | **BOSS — picture reveal** |
| 3-1 | 55% | 2 Blobs + 1 Sparx | 1.25 | Crowded |
| 3-2 … 5-4 | scales | combos repeat, rising speed | +0.05/lvl | Escalation through zones 3–5 |
| 5-5 | tuned | zone-5 set, peak speed | peak | **CAMPAIGN BOSS — hard. Clears → unlocks SUPER mode** |
| S1-1+ | recalc | **2× base enemy count** | inherits | Same layouts, doubled enemies |

**Extra lives:** awarded on clearing every X-4 level (1-4, 2-4, 3-4…). **No lives cap** — extra-life pickups stack unlimited.

---

## 8. Power-Ups

Spawn occasionally in unclaimed space; grab by claiming the area they sit in (encourages cutting toward them). Exception: ZOOM floats and is grabbed by touch.

| Power-up | Effect | Duration |
|----------|--------|----------|
| **Freeze** | All enemies stop dead. | 5s |
| **Solar Wind** | A sustained gust pins every enemy hard against one wall, clearing the board to carve. | 3.5s |
| **Boost** | Player marker moves faster. | 8s |
| **Shield** | Invincibility — enemies pass through harmlessly. | 6s |
| **ZOOM** | Floats around the arena. Touch it and the player rockets in a straight line to the nearest edge, **destroying any enemy in the path** and scoring big all the way. Subject to the §6 enemy floor — respawns trigger once a family drops below 50%. | Instant |

*(Build Freeze first — simplest to implement and test. ZOOM is the most complex (pathing + multi-kill + respawn) so it comes later in the power-up work.)*

**As built (Phase 6):** all five are in `powerups.js`, tuned via `config.POWERUPS`. Freeze/Boost/Shield/**Solar Wind** are timed (each with a HUD countdown pill). **Solar Wind** is a *sustained* gust: for `SOLARWIND.duration` it forces every enemy's velocity toward one random wall each frame (it runs before `enemy.update`, so the push always wins) and draws light streaks blowing across the field — pinning the board clear so you can carve. Pickups spawn occasionally in open cells and are collected by **claiming the region** around them; collecting one plays a bright rising arpeggio that cuts through the claim sounds. **ZOOM** floats and is grabbed by **marker touch** → the game pauses and shows four direction arrows → pressing a direction **rockets the marker to that wall**, killing any enemy on the line and scoring per kill + distance. ZOOM kills feed the same 50% enemy floor as SPLIT (§6) — a dash that clears the board still respawns enemies once a family drops below floor.

**Special Blobs (built 2026-07-07):** rare poly-Blob variants placed by level data (`levels.js` `special: ["life"|"slow"]` — landed on 2-2, 3-2, 3-4, 4-3, 5-2, 5-4), colours (`config.SPECIAL_BLOBS`) kept clear of the violet→red danger band, Sparx yellow/orange, and BOOST green — mint for **LIFE**, ice-blue for **SLOW**. Still lethal to touch like any Blob (they're Blobs, not power-ups drifting freely) — the reward only fires on **SPLIT-enclosure**: **EXTRA LIFE** grants +1 life (no cap, §7); **SLOW-DOWN** halves every enemy's speed for `SPECIAL_BLOBS.SLOW.duration` (HUD pill, same machinery as the timed power-ups). A ZOOM dash still destroys one in its path but grants **no reward** — only enclosure counts. Excluded from: the SPLIT label/×2 level multiplier, the §6 respawn floor (one-shot, no `startCount`/`deadPool` entry), and — **the region-fill precedence rule** — a Special Blob doesn't vote to keep its region open in `grid.applyClaim()` (`holdsOpen: false`), so when it's the only thing in a split region, that side takes precedence for being **filled/captured**, not kept open.

---

## 9. Scoring

- **Base:** points per 1% claimed.
- **Slow-cut bonus:** **built** — a SLOW DRAW (SPACE held during the cut) ×2 on that cut's area (`POINTS.slowCutMult`), shown as a **SLOW DRAW** label in the read-out; stacks with everything.
- **BLOCK OUT / MEGA-CUT:** ×2 / ×4 on that claim.
- **SPLIT:** ×2 level multiplier (persists for the level); smaller-side enemies destroyed.
- **SPLIT SLOW:** slow bonus stacked onto the SPLIT.
- **MEGA SLOW CUT:** slow bonus × MEGA multiplier — top area-play.
- **LONG / SUPER LONG / MEGA LONG:** length-based multiplier (see §4), stacks with everything.
- **MULTI STACK:** all applicable bonuses on one cut stack into a single combo.
- **ZOOM:** points per enemy destroyed + distance travelled.
- **Level clear bonus:** points for every % claimed *over* target (rewards overshooting).
- **No-death streak:** small escalating bonus for clearing levels without dying.

High score saved locally (browser storage) for now; online leaderboard is a much later, optional stretch.

---

## 10. Look & Feel

- **Style:** Super Space Invaders-ish — crisp animated sprites, high-res nebula/galaxy backgrounds, heavy neon, glow.
- **Palette:** deep space darks with electric neon accents (cyan, magenta, lime, hot orange).
- **Claimed territory:** shiny glass-like translucent colour blocks; slow-cut claims a darker shade; boss levels reveal a hidden image instead. **Built:** claimed mass now renders as glossy glass — a clipped specular glint sweeps across, a counter-sweep + breathing zone-tint sheen give the shimmer/ripple, and SLOW-DRAW cells use the darker `claimedFillSlow` tint.
- **Background (built):** a deep-space backdrop — a baked offscreen layer of coloured **nebula** clouds + two **galaxies** (bright core + flattened disc), with 150 twinkling, multi-tinted **parallax stars** on top, all breathing gently with the music beat.
- **Cut line colour:** blue → yellow → red → flashing red/white as it lengthens (the LONG-cut feedback, §4).
- **Text:** big, bold, expanding, punchy. *"LETS GO!!"*, *"BLOCK OUT"*, *"MEGA-CUT"* (then a beat) *"…SLOW"*, *"SPLIT!"*, *"ZONE 2-1"*, *"EXTRA LIFE!"*.
- **Juice:** screen shake, particle bursts, glow pulses, satisfying claim fills. Added in a dedicated polish phase.
- **Audio:** SFX for cut/claim/death/power-up/split; music optional. (A nod to the original's *Scarborough Fair* could be a fun easter egg.)

---

## 11. Recommended Build Order (Your Learning Path)

Each phase is a working, runnable thing. One concept per phase.

| Phase | Goal | New concept learned | Status |
|-------|------|---------------------|--------|
| **0** | Project skeleton on GitHub, blank canvas renders, deploys as a web page. | Repo, tooling, deploy pipeline | ✅ Done |
| **1** | A marker you can move around the arena border with keyboard. | Input, the game loop, drawing to canvas | ✅ Done (continuous "ride the rail" movement — see §16) |
| **2** | Cut a line into open space and claim the enclosed area. Show %. | The core algorithm — the heart of the game | ✅ Done (grid + flood fill; perimeter model in §16) |
| **3** | Add one Blob enemy + collision = lose a life. 3 lives, game over. | Enemies, collision, game state | ✅ Done (bouncing Blob; blob-aware claim; frontier-priority corners — see §14, §16) |
| **4** | Zones + level table + win condition + progression. | Data-driven design | ✅ Done (levels.js table; start screen + zone unlocks; level-complete wipe; blue→red Blob spectrum — see §14) |
| **5** | Cut mechanics: BLOCK OUT, MEGA-CUT, SPLIT, LONG, MULTI STACK + scoring. | Geometry checks, reward logic | ✅ Done (score + multipliers in `config.POINTS`; perimeter-safe collision — see §14) |
| **6** | First power-up (Freeze), then the rest, ZOOM last. | Timed effects/state | ✅ Done (all five in `powerups.js`; enemy roster overhaul — Qix line-sheaf, polygon Blobs, Hunter, Sparx/Fast Sparx — landed alongside; rocket-ship player. 50% enemy floor (§6) and Special Blobs (§8) now wired) |
| **7** | Touch controls for mobile. | Input abstraction (key step for iPhone) | ✅ Done (relative swipe joystick + on-screen SLOW button; touch listeners on `document` so swipes work anywhere; **mobile portrait mode** — auto-detected device branch reshapes the whole arena to 440×876 portrait, `config.MOBILE` — landed alongside) |
| **8** | Make it a PWA — installable on iPhone home screen. | Deployment/packaging | ✅ Built (2026-07-07) — `manifest.json` + `sw.js` (root, no build step). See below. |
| **9** | Swap in Pixi.js, real sprites, glass blocks, neon, particles, juice. | Graphics layer, polish | ✅ Shipped to `main`, opt-in via `?pixi` (canvas stays the default renderer) — bloom, rounded glass, energy enemies, Orbitron HUD, boss stages; full art-direction pass complete. **Zone palette recoloured 2026-07-07** (below) — the cyan-hero flattening read too subtle; superseded by a clear per-zone hue. See PHASE9.md. Boss picture-reveal ✅ built 2026-07-07 (§7). Sprite-based stars/particles + glass-block depth still open. |
| **10** | Boss/picture-reveal levels, SUPER mode, audio, scoring polish, final feel. | Special modes & reward | SUPER mode ✅ and boss picture-reveal ✅ built (2026-07-07, see §5/§7). Scoring polish still open. |

By Phase 3 you have something genuinely playable. Everything after is making it *good*.

**v1 build target stays minimal:** move, cut, claim, one enemy, lives, win condition. The rich scoring (LONG/SPLIT/MULTI STACK/slow) is all Phase 5+ — captured in this doc but deliberately *not* in the first playable, so Phase 2 doesn't balloon.

---

## 12. Tech Stack

- **Language:** JavaScript (plain JS, ES modules — no framework to fight while learning).
- **Rendering:** HTML5 Canvas for Phases 1–8 (simple, easy to reason about), then **Pixi.js** for the visual upgrade in Phase 9.
- **Arena model:** a grid of cells (currently 8px cells over a 720×600 field, in an 800×680 canvas). Each cell is empty or claimed; the marker travels the grid lines. Claim = flood fill (§13, §16). Logic is plain maths, separate from rendering (§1.2), and is unit-tested headlessly in Node before each deploy.
- **Hosting:** GitHub repo + GitHub Pages (free static hosting, deploys on push to `main`). Same workflow as the Pirie Smart Home repo.
- **Live URL:** https://markwpirie.github.io/cosmic_cut/
- **Editor:** VS Code with Claude Code.
- **Repo path:** `c:\Users\markw_v611rg3\Documents\GitHub\cosmic_cut`
- **iPhone path:** PWA first (free, no App Store). Capacitor wrap → App Store only if ever published.

Why not Godot now: the core logic is small, learning JS + Canvas teaches transferable web skills, keeps the iPhone path simple, and avoids an engine learning curve on top of game-design learning. Godot stays open as a future option once the game is understood inside-out.

---

## 13. The One Hard Part (honest flag)

Section 2's claim/fill algorithm — and the SPLIT detection in Phase 5 — are the genuinely tricky bits. Cutting the arena, working out which enclosed region to claim, and detecting which enemies ended up on which side of a cut (and which side is smaller) is real geometry/flood-fill work. LONG-cut length tracking is easier but needs the cut path recorded. Everything else is more forgiving. Phases 2 and 5 are where the real learning lands — walk through the logic rather than just pasting code.

**As built (Phase 2):** the arena is a grid; a cut records a trail of grid edges; closing the loop runs a flood fill that labels the open cells into regions. In Phase 2, with no enemy, it kept the **largest** open region and claimed the rest. The same flood fill is what Phase 5's SPLIT will reuse to decide which side enemies are on. See §16 for the rideable-perimeter model that fell out of this.

**As built (Phase 3):** the claim is now **enemy-aware** (the real Qix rule): it keeps open the region the Blob is in and claims the rest — you can never bury the enemy. (No enemy → falls back to keeping the largest region, e.g. in headless tests.) Cutting *around* the Blob to trap it on the small side therefore claims the large side — the seed of the Phase 5 SPLIT.

---

## 14. Locked Decisions

- Name: **COSMIC CUT** ✓
- BLOCK OUT ≥30%, MEGA-CUT ≥50% ✓
- SPLIT: enemy each side of cut → ×2 level multiplier; all enemies on smaller side die ✓
- Enemy floor: killed enemies stay dead; each family (Blobs/Hunters, Sparx) respawns one at a time, at an edge, only once its live count drops below 50% of that level's starting count. The sheaf Qix keeps its own separate always-≥1-alive rule ✓
- MEGA SLOW CUT / SPLIT SLOW as top-tier slow plays ✓
- LONG/SUPER LONG/MEGA LONG by line length vs `l` (play-field height); stacks with all ✓
- MULTI STACK: all bonus types on one cut stack into a combo ✓
- All multipliers stack (incl. slow) ✓
- Standard speed FAST, **slow on button press (SPACE) — built**: crawl while held mid-cut, darker glass, ×2 area (`MARKER.slowCutMult`, `POINTS.slowCutMult`). It's a commitment — armed only at boundary-leave or within `MARKER.slowArmWindow` (1s), then must be held the whole line (release cancels; no mid-cut re-arm) ✓
- **Phase 9 graphics started (branch `phase9-pixi`):** the presentation layer is being ported to **Pixi.js v8** (loaded as a CDN ES module via an importmap — *no build step*, keeping the serve-the-folder model and avoiding a Node/npm dependency). It's **opt-in via `?pixi`** while it matures; the canvas renderer (`render.js`) stays the default so the branch is always playable. `render-pixi.js` mirrors `render.js`'s `render(view)` contract and reuses every logic module untouched (design principle §1.2). Glow is currently a multi-pass-stroke fake; real glow filters, masked glass gloss, sprite particles and the boss picture-reveal are the roadmap (PHASE9.md). Phase 9 is being done **before** Phase 7 (touch) per the build order ✓
- ZOOM power-up (rocket to edge, destroy enemies, subject to enemy floor) ✓
- Claimed = shiny glass colour blocks (slow = darker); boss levels (X-5) reveal hidden picture ✓
- Levels: zones X-1 … X-5, campaign ends 5-5 (hard boss) ✓
- Clearing 5-5 unlocks SUPER mode: S1-1+ replays layouts with 2× enemies ✓
- Boss levels use the same enemy set as their zone (for now) ✓
- Extra life on X-4 clears; no lives cap, unlimited stacking ✓
- **Continuous movement:** marker travels continuously; never stops except at level begin; pressing the opposite direction reverses ✓ (§16)
- **Hold-to-turn:** holding a direction takes the next available turn at a junction; a fresh press into open space starts a cut ✓ (§16)
- **Two rideable line types:** the auto network (open frontier + arena wall, always rideable, auto-followed) vs internal seams (cut lines between claimed regions, rideable only when steered onto) ✓ (§16)
- **T-junction with no input:** carry prior heading (momentum); random left/right if none ✓ (§16)
- **Frontier beats buried wall (at every node):** auto-following ranks exits — the bright open frontier (BOUNDARY, rank 0) is preferred over a buried arena wall (claimed packed against it, rank 1), *even when the wall runs straight ahead*. So the marker hugs the bold line both rounding corners and while travelling along an edge, and never glides along the outer wall when a frontier is there to take. Momentum/random only break ties between *equal*-rank exits (a true frontier T-junction). Seams (rank 2) are never auto-taken ✓ (§16)
- **Blob enemy (Phase 3):** one free-floating orb bouncing through open space (reflects off wall + claimed cells); no chasing yet. Touching the marker or the in-progress cut = lose a life; 3 lives; game over → any key restarts. Claim keeps the Blob's region open; on death it respawns in open space farthest from the player (never inside claimed territory) ✓
- **Blob-aware claim / SPLIT core:** keep the **largest enemy-holding region** open (survivors); claim every other region. Blobs caught on a claimed (smaller) side **die** — the core SPLIT resolution. Largest-region overall is the no-enemy fallback. The ×2 level multiplier, scoring, and the 50% enemy-floor respawn are **Phase 5** ✓ (§13)
- **Data-driven levels (Phase 4):** `levels.js` is the single source of truth — 25 levels (zones 1-1…5-5), each with a claim **target %** and a list of Blobs. Difficulty = rising target + more Blobs + redder Blobs. Win = `percent ≥ target` ✓
- **Blob spectrum (Phase 4):** Blobs vary along **blue→red**: blue is BIG and SLOW, ramping to red SMALL and FAST (`config.BLOB_TYPES`). All speeds stay under the marker's so it's always outrunnable. Multiple Blobs supported; the claim keeps *every* Blob's region open ✓
- **Progression & start screen (Phase 4):** clear a level → "LEVEL COMPLETE" beat (marker returns to start & holds, claimed area clears with an expanding wipe, brief pause) → next level. Game over → **start screen** with selectable starting zones (1-1, 2-1, …); a zone unlocks once reached in normal play; unlocks persist (localStorage). Extra life on X-4; after 5-5 → CAMPAIGN COMPLETE ✓
- **Level start waits for input (Phase 4):** a level (and its Blobs) stays frozen on the "CLAIM N%" banner until the player presses a direction — that press also steers the first move ✓
- **Claim pop-up (Phase 4):** each successful claim floats a "+N%" at the marker (size/linger in `config.TIMING`) ✓
- **Per-zone themes (Phase 4, recoloured 2026-07-07):** each zone re-themes the play field (`config.THEMES`): zone 1 cyan → 2 green → 3 yellow/gold → 4 purple → 5 red (see the palette recolour note below — supersedes the original Phase 4 order and the Phase 9 cyan-hero flattening). Marker/HUD stay constant; Blob/Sparx colours are their own fixed magenta/hot-pink danger band, also below ✓
- **Random Blob spawns (Phase 4):** position and launch direction are randomised each level/respawn (kept away from the player and spread apart) ✓
- **Targets 70–90% (Phase 4):** levels start at 70% and climb to 90%; Blob counts ramp fast (2 by 1-2, 3 by 1-3). All in `levels.js` — tune freely ✓
- **SPLIT text + timed ripple (Phase 4):** a "SPLIT!" flash when a split kills a Blob; level-complete *holds* on the cleared board (`config.TIMING.completeHold`) so you feel the win, then the ripple ✓
- **Death beat (Phase 4):** a blob hit freezes the game in a `"dead"` state with the contact point pulsing ("CAUGHT!") and **waits for a key** before respawning (a fuller explosion is a later visual pass). Out of lives still → game over ✓
- **Readability (Phase 4):** the "+N%" pop-up is nudged toward the field centre so it isn't hidden by the cut line or border; the HUD/intro ZONE label uses the zone's frontier colour ✓
- **Perimeter-safe collision (Phase 5):** Blobs only kill while you're **cutting** in open space — riding the perimeter / claimed edges is safe even if a blob brushes the marker. The death also flashes the offending blob (the real kill point on a line contact) ✓
- **Scoring (Phase 5):** base points per % claimed × size bonus (**BLOCK OUT** ≥30% ×2, **MEGA-CUT** ≥50% ×4) × length bonus (**LONG/SUPER/MEGA** by cut length vs field height) × the per-level multiplier; **SPLIT** adds per-kill points and grants ×2 to the level multiplier. Clearing a level adds a flat bonus + per-remaining-life bonus. All values in `config.POINTS`. **Slow-cut bonus is now built** (SLOW DRAW ×2); **ZOOM scoring tuned (2026-07-07)** — `killPoints` 80→250 (still below the 500 SPLIT per-kill, so an invulnerable dash kill stays cheaper than trapping one) plus a new `distancePoints` (0.25/px) awarded once when the dash's cut closes, via `lastCutLength × CELL` ✓
- **Score read-out (Phase 5):** a scored cut shows a big central read-out where each part pops in with expanding text on its own beat (the planned "doof doof doof", ready for sound): bonus names → score → ×multiplier → total. The HUD score pulses when it jumps. LONG tiers start at **2×** field height (SUPER 3×, MEGA 4×). The small "+N%" pop-up only appears for a big single-cut claim (≥50%); everything else reads through the central total + HUD pulse. Tunables in `config.TIMING` / `config.POINTS` ✓
- **Game-Feel pass (procedural, no assets):** all in `audio.js` (Web-Audio) + `fx.js` (pure-maths particles/shake), wired from `main`:
  - **Audio:** every voice runs through an envelope + filter and a shared **convolver reverb** so it sounds produced, not beepy. Retro SFX (claim/kill/death/UI/level-clear/game-over/high-score), punchy **"doof doof doof"** bonus kicks timed to the read-out, a **soft danger-tied "cut" pulse** (a quiet bass hum + tremolo that swells and beats faster as a blob nears your line — replaced the old pitch-rising squeal), and a **layered generative synthwave loop** (sub-bass + detuned supersaw pad + delayed arp over an **Am–F–C–G** progression; filter opens with danger). **Optional `assets/music.mp3`** drops in as the track (looped, through the same mute/volume + **N** toggle); absent → the procedural loop. **M** mutes; both persist; context resumes on first keypress.
  - **Juice:** screen shake + particle bursts on claims, kills, death; scaled to the event.
  - **Danger telegraph:** marker flashes hot **while cutting** (you're vulnerable), the trail reddens/thickens toward the LONG threshold, and a red **edge vignette** rises as a blob nears your trail. A **NEAR MISS** grazes the trail without hitting → small bonus (`POINTS.nearMiss`). Fires on the **exit** from the danger band (the blob has actually pulled back to safe distance), not on entry — firing on entry meant the player could see "NEAR MISS" a frame before getting caught by that same still-closing blob, which read as broken rather than a genuine miss.
  - **Atmosphere & meta:** drifting **starfield** + faint nebula; persistent **high score** shown on the menu and end screens with **★ NEW HIGH SCORE ★**.
  - These deliberately pull cheap wins forward from the Phase 9 "juice" / Phase 10 "audio" buckets; richer sprites, the slow-cut visuals and full music production stay there ✓
- **SUPER mode: built (2026-07-07).** Clearing 5-5 for the first time (not already in SUPER mode) sets `game.superUnlocked` (persists in localStorage, same guarded pattern as the zone-unlock key) and flags that one campaign-complete screen as "SUPER MODE UNLOCKED" (`game.justUnlockedSuper`). A 6th menu chip ("SUPER") appears once unlocked, starting `game.startRun(1, true)`. `game.currentSpec()` is the single source every consumer reads through: qix/blobs/hunters arrays and sparx/fastSparx counts × `config.SUPER.enemyMult` (2), target recalculated (`+ SUPER.targetDelta`, floored at `SUPER.targetMin`) — labels read "S1-1" etc. via `game.levelLabel()`. The 50% enemy floor (§6) needs no separate wiring: it reads the live `startCount`, which `enemy.reset()`/`sparx.reset()` already compute from the (now doubled) spec passed in ✓
- **Claim rule (no enemies):** keep the largest open region, claim the rest ✓ (§13)
- **Audio + Feel pass 2 (drop-in soundtrack + director + beat visuals):** pulls more of the Phase 9/10 buckets forward. All feel knobs centralised in `config.AUDIO`.
  - **Soundtrack (`assets/*.mp3`, registry in `audio.js`):** a real MP3 per game moment — **title** (Opening Theme), **stage select**, **per-stage themes** (stage1…8; 6–8 already wired for when the campaign grows past 5 zones), plus **Stage Clear** and **Game Over** jingles. Each MP3 routes through the music bus (so **N**/mute apply); a missing *looping* track falls back to the procedural synth, a missing jingle to its SFX. Files stream, so on first load the synth briefly bridges until a track buffers.
  - **AudioDirector (`audio-director.js`):** a policy layer over the engine. Scene cues (title/stage-select/stage) and an event system of two stinger kinds — **layer** (plays over the music, e.g. the kill stinger) and **interrupt** (pauses the stage track, plays a short MP3, then the stage **resumes from where it left off**). Level complete → Stage Clear then resume into the next level; **every life lost → Game Over MP3** then resume the stage on respawn; out-of-lives → Game Over plays through to the menu.
  - **Exposure tension = a rising sonar ping (not a speed-up):** an early experiment scaled the track's `playbackRate` with tension — it felt off, so it's **off** (`tension.rateSpan 0`). Instead a reverberant **submarine sonar ping** sounds **only while cutting** (exposed): it fires the instant you push out, then repeats **~1s apart with the pitch climbing** the longer the line is drawn (base → ~+octave over `sonar.rampTime`), telegraphing the mounting danger of staying in open space; it resets the moment you reach safe ground.
  - **Beat-reactive visuals:** an **AnalyserNode** taps the music bus; `audio.musicPulse()` is a fixed-gain sub-bass *onset* detector (throb = how far the bass rises above its slow baseline, ×gain — robust to loud steady bass). The bright **frontier line and the cut trail throb** with it (glow + width + brightness). Works for the synth fallback too.
  - **Title screen:** a new `title` state before the stage-select menu (the first keypress wakes audio + the Opening Theme; the splash stays so you hear it).
  - **Pause:** **P / Esc** freezes play (also intro/death), dims the board with a PAUSED overlay, and ducks music + movement/cut tones; resume restores them.
  - **Respawn + death guard:** respawn now homes to the **lowest, most-central node still bordering open space** (a bottom block-out no longer strands you); the CAUGHT! screen holds for `TIMING.deathHold` and ignores held-key auto-repeat so a mashed key can't skip it; lingering "+N%"/NEAR MISS pop-ups clear on death.
  - **Blob explosions:** each split-killed blob bursts **at its own position in its own colour** (`enemy.lastKilled`), with a meatier explosion sound (crack + sub-boom + debris).
  - **Movement audio:** a soft band-passed **"schoo"** while moving (brighter when cutting) that resolves into a **"schooooofff"** whoosh when a cut closes and claims.
  - **Bigger field:** dropped the redundant page `<h1>`/tagline and grew the canvas to **800×680** (field 720×600, ROWS 75), reclaiming that strip as play area ✓
- **Power-ups (Phase 6):** all five built in `powerups.js`, tuned in `config.POWERUPS`. Freeze/Boost/Shield timed with HUD countdown; Solar Wind instant; pickups collected by claiming around them; **ZOOM** floats, grabbed by touch → aim a direction → rocket to that wall killing enemies on the line. Sonar ping disabled (`AUDIO.sonar.enabled = false`) — may be re-imagined ✓
- **Enemy roster + visual overhaul (Phase 6):** two enemy shapes in `enemy.js`: the star **Qix** as the Kix **line-sheaf** (endpoints sweep a body box that periodically **surges** to ~50% screen then settles; collision tests the **live stick line**), and **polygon Blobs** + **Hunter Blobs** (drift toward the player). **Sparx/Fast Sparx** in `sparx.js` — BFS perimeter chase, **kill on the safe perimeter too**, Fast Sparx **latch onto the cut trail**. Per-level mix is data-driven in `levels.js` (`qix`/`blobs`/`hunters`/`sparx`/`fastSparx`; positional array auto-splits first→Qix, rest→Blobs). Enemies are 1.5× and power-ups 3× larger than the first cut. Knobs in `config.QIX` / `config.BLOB_POLY` / `config.SPARX`. **Player is now a rocket ship** pointing along its heading (engine flame; hot while cutting). **Enemy floor/respawn updated (2026-07-07):** killed enemies stay dead; each family (Blobs/Hunters, Sparx) respawns one at a time at an edge only once below **50%** of its starting count — the sheaf Qix keeps its own always-≥1-alive rule. **Special Blobs built (2026-07-07)** — see §8 ✓
- **Slow-cut + visual/feel pass 3:** four things landed together. (1) **Slow cut on SPACE** — hold while cutting to crawl at `MARKER.slowCutMult` (0.42×); the cut is tagged slow (`grid.slowFill`), its claim is darker glass, and it scores **SLOW DRAW ×2** (`POINTS.slowCutMult`); the live trail turns glass-blue while slow. (2) **Glossy glass** claimed areas — a clipped specular sweep + counter-sweep + breathing zone-tint sheen (shimmer/ripple). (3) **High-fidelity starscape** — a baked offscreen nebula+galaxy layer with twinkling parallax stars. (4) **Solar Wind fixed** into a sustained, visible gust (was a one-frame velocity nudge), plus a louder rising-arpeggio pickup sound. Knobs in `config` (`MARKER`, `POINTS`, `THEMES.claimedFillSlow`, `POWERUPS.SOLARWIND`) ✓
- **PWA — installable + offline (Phase 8, built 2026-07-07):** `manifest.json` (name/icons/`start_url: "."`/`scope: "."` — relative, so it works from GitHub Pages' `/cosmic_cut/` subpath) + `sw.js`, both at the repo root, no build step. Icons in `assets/icons/` (procedurally generated: the arena-ring-with-a-cut-notch + ship glyph). Three cache strategies in `sw.js`: **core** (index/styles/manifest/`src/*.js`/icons) is stale-while-revalidate and versioned (`CACHE_VERSION`, bump on a real deploy); **media** (`assets/*.mp3`, ~39MB) is cache-on-demand and *never* precached, serving **Range requests as 206 Partial Content** sliced from a cached full file (required — `HTMLAudioElement`/iOS streams via Range, not a plain GET); **CDN** (Pixi CDN + Google Fonts) is cache-first, explicitly warmed on install (the Pixi bundle is loaded via a dynamic `import()` through the importmap, which doesn't reliably hit the SW's `fetch` event like a plain resource fetch does — found via headless testing, fixed by an explicit `fetch()`+cache in the install handler) so offline `?pixi` works after a single online visit. Registered in `main.js` immediately (not gated on the window `load` event — `?pixi`'s own top-level `await` can make main.js one of the things `load` is waiting on, so a `load`-gated registration can silently race past the event and never fire — another headless-testing catch). Verified headless: SW reaches `active`, core cache populated, offline reload boots and plays, offline `?pixi` works after priming, Range fetch returns 206 ✓
- **Zone palette recolour (2026-07-07):** the Phase 9 cyan-hero flattening (all 5 `THEMES` in the cyan/teal family, zone identity only in `accent`) read too subtle, especially on the claimed glass. Replaced with a clear per-zone hue matching `assets/levels.png` — **1 cyan → 2 green → 3 yellow/gold → 4 purple → 5 red** — every `THEMES` field (frontier/claimedFill/claimedFillSlow/trail/seam/arena/accent) now carries the zone's hue, plus a new `glassTint` that retints the Pixi glass shimmer layer per zone (`render-pixi.js drawGlassSweep`, previously a fixed constant) and the holo-grid lattice (previously a fixed cyan). Both renderers read `theme()` per-frame already, so this applied with no other renderer changes. **Enemies recoloured alongside it**: `BLOB_TYPES` and `SPARX` moved into a fixed magenta/hot-pink "danger" band, clear of every zone's own hue (previously the violet→red Blob spectrum and yellow/orange Sparx collided with the new zone 3 gold, 4 purple, and 5 red) ✓

## 15. Still Open (deferred, none block the build)

1. Exact point values per mechanic — tuned once playable.
2. SUPER mode beyond S5-5 — wrap to SS mode (4× enemies)? Or procedural? Decide after SUPER is built.
3. Whether LONG-cut multiplier has an upper cap or scales unbounded.
4. Solar Wind vs ZOOM overlap — now differentiated (Solar Wind = sustained wall-pin; ZOOM = player rocket + kills). Revisit only if they feel redundant.
5. Marker control feel at the current grid resolution (8px) — revisit speed/granularity once enemies and dodging exist (Phase 3).

---

## 16. As-Built: Movement, Controls & the Perimeter Model (Phases 0–2)

How the marker actually moves and what it can ride, as realised while building the core. This is the source of truth for the control feel; it refines §2–§3.

### Movement & controls
- **Continuous travel.** Press a direction and the marker keeps going on its own — it does **not** stop. The only time it's stationary is at the very start of a level, before the first press.
- **Opposite reverses.** Pressing the direction opposite to current travel turns the marker around.
- **Hold a turn in anticipation.** Approaching a junction, hold the direction you want; the marker takes that line the instant it becomes available, so turns don't need frame-perfect taps.
- **Cutting vs riding.** A **fresh** press that points into open space starts a **cut**. A **held** key only ever rides existing lines — it never surprise-cuts you into the open.
- Keyboard: arrow keys or WASD. **Touch (Phase 7, done):** a relative swipe joystick — the displacement direction from where a finger first touched is the held heading, same "hold to turn" and "fresh press starts a cut" rules as keyboard. A second finger (or an on-screen SLOW button, bottom-left of the touch strip) holds the slow draw. Listeners live on `document`, not the canvas, so a swipe works from anywhere on screen. **Aiming a ZOOM dash also works by swipe** — same direction choice as an arrow key, sharing one `attemptZoomDash()` path so touch and keyboard behave identically.

### The perimeter model (two kinds of rideable line)
The arena is a grid; the boundary the marker rides is made of grid edges. Edges fall into:
- **Auto network — always rideable, auto-followed.** The **open frontier** (where unclaimed space meets claimed territory) *and* the **arena wall** (always rideable, even where claimed area is packed against it). When you're not steering, the marker follows this network around corners on its own. Drawn as the **bold** bright line.
- **Seams — rideable only when you steer onto them.** The internal line left by every cut. Once both sides of it are claimed it becomes a buried seam between two claimed regions. It stays visible (a **thin, dim** internal line) and you can ride it if you deliberately turn onto it, but the cursor never auto-wanders onto it. **This is the structure slow-cut darker regions border on (§5).**

### Junction behaviour
- At a **corner**, the marker follows the line round (never stops, never needs input).
- At a **T-junction** with no input, it **carries momentum** — e.g. if it was heading east before turning south, it continues east when the line forks — falling back to a **random** left/right when there's no prior heading to carry.
- Holding a direction always overrides the automatic choice.

### Rendering hierarchy (Phase 2, pre-polish)
Dim arena frame < thin dim seams < solid translucent claimed fill < **bold bright open frontier** < cut trail (blue) < marker (magenta). Glass blocks, slow-cut shading, and juice arrive in Phase 9.
