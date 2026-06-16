# COSMIC CUT — Game Design Document (Draft 3)

A modern, neon, space-themed take on the classic BBC Micro game *Kix* (itself a clone of the arcade game *Qix*). Carve out territory by cutting areas of the play field while dodging enemies, hit the percentage target to clear the level, and chain bold risky cuts — SPLITS, BLOCK OUTS, MEGA-CUTS and LONG cuts — for big scores.

**Status:** Draft 3 — folds in markup edits, LONG-cut scoring, MULTI STACK, super-zone progression. Source of truth from here.
**Repo:** `/Users/marksMAC/Documents/GitHub/cosmic_cut` (GitHub + local). Build continues in Claude Code.
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

*(v1 ships with a single draw speed to keep the first build simple. Slow-cut-by-button-press is added back in once the core works — flagged so we don't forget.)*

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
The showpiece move. Boxing an enemy and cutting so opponents end up separated either side of your line is the high-skill play. It grants a level-wide ×2 multiplier; all enemies trapped on the smaller side are destroyed. SPLIT + MEGA-CUT + SLOW + LONG in one stroke is the ceiling (a MULTI STACK).

*(All thresholds are starting guesses — tuned once playable.)*

---

## 5. The Play Field

- A rectangular arena, inset within a neon-bordered frame. **Looks attractive from the start** — not a grey box in the final game (though early dev phases will be plain while we build the logic).
- Unclaimed space: deep animated space backdrop, or a parallax cloudscape (think *Super Star Wars*).
- **Claimed areas:** solidify into shiny, glass-like blocks of colour — translucent, glossy, catching neon light. The arena visibly fills with jewel-like territory as you win. **Slow-cut claims use a darker shade** to differentiate them.
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

**Enemy ↔ Target % relationship:** big/fast/multiple enemies = lower % target. Enforced by the level table so we never demand a high % with a screen full of fast hunters.

**Enemy floor & respawn rule:** each level maintains a minimum of **75% of its starting enemy count**. If SPLIT kills or ZOOM drop the count below that floor, fresh enemies respawn at the arena edge (away from the player) to restore it. This keeps levels from becoming trivially safe after a big SPLIT, and is what makes the SPLIT a tactical reset rather than a clear-the-board win.

*Example:* level starts with 4 enemies (floor = 3). A SPLIT kills 2 → count is 2, below floor → 1 respawns → back to 3.

---

## 7. Zones & Level Progression

Levels are grouped into **zones** of 5: **1-1 … 1-5**, then **2-1 … 2-5**, up to **5-5**. Each new zone steps up enemy variety and speed; within a zone difficulty rises gently.

**Every X-5 is a BOSS level (picture-reveal):** claimed areas uncover a hidden high-res image behind the field instead of glass blocks — the prettier picture is literally revealed as you clear it. A pacing beat every 5th level and a visual payoff. Boss levels use the **same enemy set** as the zone they cap (for now).

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
| **Solar Wind** | A wave sweeps enemies to one side of the arena. | Instant |
| **Boost** | Player marker moves faster. | 8s |
| **Shield** | Invincibility — enemies pass through harmlessly. | 6s |
| **ZOOM** | Floats around the arena. Touch it and the player rockets in a straight line to the nearest edge, **destroying any enemy in the path** and scoring big all the way. Subject to the §6 enemy floor — respawns trigger if it drops below 75%. | Instant |

*(Build Freeze first — simplest to implement and test. ZOOM is the most complex (pathing + multi-kill + respawn) so it comes later in the power-up work.)*

---

## 9. Scoring

- **Base:** points per 1% claimed.
- **Slow-cut bonus:** multiplier while slow-cutting (post-v1).
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
- **Claimed territory:** shiny glass-like translucent colour blocks; slow-cut claims a darker shade; boss levels reveal a hidden image instead.
- **Cut line colour:** blue → yellow → red → flashing red/white as it lengthens (the LONG-cut feedback, §4).
- **Text:** big, bold, expanding, punchy. *"LETS GO!!"*, *"BLOCK OUT"*, *"MEGA-CUT"* (then a beat) *"…SLOW"*, *"SPLIT!"*, *"ZONE 2-1"*, *"EXTRA LIFE!"*.
- **Juice:** screen shake, particle bursts, glow pulses, satisfying claim fills. Added in a dedicated polish phase.
- **Audio:** SFX for cut/claim/death/power-up/split; music optional. (A nod to the original's *Scarborough Fair* could be a fun easter egg.)

---

## 11. Recommended Build Order (Your Learning Path)

Each phase is a working, runnable thing. One concept per phase.

| Phase | Goal | New concept learned |
|-------|------|---------------------|
| **0** | Project skeleton on GitHub, blank canvas renders, deploys as a web page. | Repo, tooling, deploy pipeline |
| **1** | A marker you can move around the arena border with keyboard. | Input, the game loop, drawing to canvas |
| **2** | Cut a line into open space and claim the enclosed area. Show %. | The core algorithm — the heart of the game |
| **3** | Add one Blob enemy + collision = lose a life. 3 lives, game over. | Enemies, collision, game state |
| **4** | Zones + level table + win condition + progression. | Data-driven design |
| **5** | Cut mechanics: BLOCK OUT, MEGA-CUT, SPLIT, LONG, MULTI STACK + scoring. | Geometry checks, reward logic |
| **6** | First power-up (Freeze), then the rest, ZOOM last. | Timed effects/state |
| **7** | Touch controls for mobile. | Input abstraction (key step for iPhone) |
| **8** | Make it a PWA — installable on iPhone home screen. | Deployment/packaging |
| **9** | Swap in Pixi.js, real sprites, glass blocks, neon, particles, juice. | Graphics layer, polish |
| **10** | Boss/picture-reveal levels, SUPER mode, audio, scoring polish, final feel. | Special modes & reward |

By Phase 3 you have something genuinely playable. Everything after is making it *good*.

**v1 build target stays minimal:** move, cut, claim, one enemy, lives, win condition. The rich scoring (LONG/SPLIT/MULTI STACK/slow) is all Phase 5+ — captured in this doc but deliberately *not* in the first playable, so Phase 2 doesn't balloon.

---

## 12. Tech Stack

- **Language:** JavaScript (plain JS to start — no framework to fight while learning).
- **Rendering:** HTML5 Canvas for Phases 1–8 (simple, easy to reason about), then **Pixi.js** for the visual upgrade in Phase 9.
- **Hosting:** GitHub repo + GitHub Pages (free static hosting, deploys on push). Same workflow as the Pirie Smart Home repo.
- **Editor:** VS Code with Claude Code.
- **Repo path:** `/Users/marksMAC/Documents/GitHub/cosmic_cut`
- **iPhone path:** PWA first (free, no App Store). Capacitor wrap → App Store only if ever published.

Why not Godot now: the core logic is small, learning JS + Canvas teaches transferable web skills, keeps the iPhone path simple, and avoids an engine learning curve on top of game-design learning. Godot stays open as a future option once the game is understood inside-out.

---

## 13. The One Hard Part (honest flag)

Section 2's claim/fill algorithm — and the SPLIT detection in Phase 5 — are the genuinely tricky bits. Cutting the arena, working out which enclosed region to claim, and detecting which enemies ended up on which side of a cut (and which side is smaller) is real geometry/flood-fill work. LONG-cut length tracking is easier but needs the cut path recorded. Everything else is more forgiving. Phases 2 and 5 are where the real learning lands — walk through the logic rather than just pasting code.

---

## 14. Locked Decisions

- Name: **COSMIC CUT** ✓
- BLOCK OUT ≥30%, MEGA-CUT ≥50% ✓
- SPLIT: enemy each side of cut → ×2 level multiplier; all enemies on smaller side die ✓
- Enemy floor: 75% of starting count, respawn at edge to maintain ✓
- MEGA SLOW CUT / SPLIT SLOW as top-tier slow plays ✓
- LONG/SUPER LONG/MEGA LONG by line length vs `l` (play-field height); stacks with all ✓
- MULTI STACK: all bonus types on one cut stack into a combo ✓
- All multipliers stack (incl. slow) ✓
- Standard speed FAST, slow on button press (slow deferred to post-v1) ✓
- Single draw speed for v1 ✓
- ZOOM power-up (rocket to edge, destroy enemies, subject to enemy floor) ✓
- Claimed = shiny glass colour blocks (slow = darker); boss levels (X-5) reveal hidden picture ✓
- Levels: zones X-1 … X-5, campaign ends 5-5 (hard boss) ✓
- Clearing 5-5 unlocks SUPER mode: S1-1+ replays layouts with 2× enemies ✓
- Boss levels use the same enemy set as their zone (for now) ✓
- Extra life on X-4 clears; no lives cap, unlimited stacking ✓

## 15. Still Open (deferred, none block the build)

1. Exact point values per mechanic — tuned once playable.
2. SUPER mode beyond S5-5 — wrap to SS mode (4× enemies)? Or procedural? Decide after SUPER is built.
3. Whether LONG-cut multiplier has an upper cap or scales unbounded.
4. Solar Wind vs ZOOM overlap — both move enemies; may merge or differentiate later.
