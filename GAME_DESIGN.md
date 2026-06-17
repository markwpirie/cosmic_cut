# COSMIC CUT — Game Design Document (Draft 4)

A modern, neon, space-themed take on the classic BBC Micro game *Kix* (itself a clone of the arcade game *Qix*). Carve out territory by cutting areas of the play field while dodging enemies, hit the percentage target to clear the level, and chain bold risky cuts — SPLITS, BLOCK OUTS, MEGA-CUTS and LONG cuts — for big scores.

**Status:** Draft 4 — Phases 0–2 built and live. Folds in the realised movement/control scheme and the perimeter (auto-network vs seam) model discovered while building the core cut/claim mechanic. Earlier drafts' scoring/mode design unchanged. Source of truth from here.
**Repo:** `/Users/marksMAC/Documents/GitHub/cosmic_cut` (GitHub + local). Build continues in Claude Code.
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

| Phase | Goal | New concept learned | Status |
|-------|------|---------------------|--------|
| **0** | Project skeleton on GitHub, blank canvas renders, deploys as a web page. | Repo, tooling, deploy pipeline | ✅ Done |
| **1** | A marker you can move around the arena border with keyboard. | Input, the game loop, drawing to canvas | ✅ Done (continuous "ride the rail" movement — see §16) |
| **2** | Cut a line into open space and claim the enclosed area. Show %. | The core algorithm — the heart of the game | ✅ Done (grid + flood fill; perimeter model in §16) |
| **3** | Add one Blob enemy + collision = lose a life. 3 lives, game over. | Enemies, collision, game state | ✅ Done (bouncing Blob; blob-aware claim; frontier-priority corners — see §14, §16) |
| **4** | Zones + level table + win condition + progression. | Data-driven design | ✅ Done (levels.js table; start screen + zone unlocks; level-complete wipe; blue→red Blob spectrum — see §14) |
| **5** | Cut mechanics: BLOCK OUT, MEGA-CUT, SPLIT, LONG, MULTI STACK + scoring. | Geometry checks, reward logic | ✅ Done (score + multipliers in `config.POINTS`; perimeter-safe collision — see §14) |
| **6** | First power-up (Freeze), then the rest, ZOOM last. | Timed effects/state | ◻ Next |
| **7** | Touch controls for mobile. | Input abstraction (key step for iPhone) |
| **8** | Make it a PWA — installable on iPhone home screen. | Deployment/packaging |
| **9** | Swap in Pixi.js, real sprites, glass blocks, neon, particles, juice. | Graphics layer, polish |
| **10** | Boss/picture-reveal levels, SUPER mode, audio, scoring polish, final feel. | Special modes & reward |

By Phase 3 you have something genuinely playable. Everything after is making it *good*.

**v1 build target stays minimal:** move, cut, claim, one enemy, lives, win condition. The rich scoring (LONG/SPLIT/MULTI STACK/slow) is all Phase 5+ — captured in this doc but deliberately *not* in the first playable, so Phase 2 doesn't balloon.

---

## 12. Tech Stack

- **Language:** JavaScript (plain JS, ES modules — no framework to fight while learning).
- **Rendering:** HTML5 Canvas for Phases 1–8 (simple, easy to reason about), then **Pixi.js** for the visual upgrade in Phase 9.
- **Arena model:** a grid of cells (currently 8px cells over a 720×520 field). Each cell is empty or claimed; the marker travels the grid lines. Claim = flood fill (§13, §16). Logic is plain maths, separate from rendering (§1.2), and is unit-tested headlessly in Node before each deploy.
- **Hosting:** GitHub repo + GitHub Pages (free static hosting, deploys on push to `main`). Same workflow as the Pirie Smart Home repo.
- **Live URL:** https://markwpirie.github.io/cosmic_cut/
- **Editor:** VS Code with Claude Code.
- **Repo path:** `/Users/marksMAC/Documents/GitHub/cosmic_cut`
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
- **Continuous movement:** marker travels continuously; never stops except at level begin; pressing the opposite direction reverses ✓ (§16)
- **Hold-to-turn:** holding a direction takes the next available turn at a junction; a fresh press into open space starts a cut ✓ (§16)
- **Two rideable line types:** the auto network (open frontier + arena wall, always rideable, auto-followed) vs internal seams (cut lines between claimed regions, rideable only when steered onto) ✓ (§16)
- **T-junction with no input:** carry prior heading (momentum); random left/right if none ✓ (§16)
- **Frontier beats buried wall (at every node):** auto-following ranks exits — the bright open frontier (BOUNDARY, rank 0) is preferred over a buried arena wall (claimed packed against it, rank 1), *even when the wall runs straight ahead*. So the marker hugs the bold line both rounding corners and while travelling along an edge, and never glides along the outer wall when a frontier is there to take. Momentum/random only break ties between *equal*-rank exits (a true frontier T-junction). Seams (rank 2) are never auto-taken ✓ (§16)
- **Blob enemy (Phase 3):** one free-floating orb bouncing through open space (reflects off wall + claimed cells); no chasing yet. Touching the marker or the in-progress cut = lose a life; 3 lives; game over → any key restarts. Claim keeps the Blob's region open; on death it respawns in open space farthest from the player (never inside claimed territory) ✓
- **Blob-aware claim / SPLIT core:** keep the **largest enemy-holding region** open (survivors); claim every other region. Blobs caught on a claimed (smaller) side **die** — the core SPLIT resolution. Largest-region overall is the no-enemy fallback. The ×2 level multiplier, scoring, and the 75% enemy-floor respawn are **Phase 5** ✓ (§13)
- **Data-driven levels (Phase 4):** `levels.js` is the single source of truth — 25 levels (zones 1-1…5-5), each with a claim **target %** and a list of Blobs. Difficulty = rising target + more Blobs + redder Blobs. Win = `percent ≥ target` ✓
- **Blob spectrum (Phase 4):** Blobs vary along **blue→red**: blue is BIG and SLOW, ramping to red SMALL and FAST (`config.BLOB_TYPES`). All speeds stay under the marker's so it's always outrunnable. Multiple Blobs supported; the claim keeps *every* Blob's region open ✓
- **Progression & start screen (Phase 4):** clear a level → "LEVEL COMPLETE" beat (marker returns to start & holds, claimed area clears with an expanding wipe, brief pause) → next level. Game over → **start screen** with selectable starting zones (1-1, 2-1, …); a zone unlocks once reached in normal play; unlocks persist (localStorage). Extra life on X-4; after 5-5 → CAMPAIGN COMPLETE ✓
- **Level start waits for input (Phase 4):** a level (and its Blobs) stays frozen on the "CLAIM N%" banner until the player presses a direction — that press also steers the first move ✓
- **Claim pop-up (Phase 4):** each successful claim floats a "+N%" at the marker (size/linger in `config.TIMING`) ✓
- **Per-zone themes (Phase 4):** each zone re-themes the play field (`config.THEMES`): zone 1 cyan → 2 orange → 3 green → 4 violet → 5 gold. Marker, HUD and Blob colours stay constant ✓
- **Random Blob spawns (Phase 4):** position and launch direction are randomised each level/respawn (kept away from the player and spread apart) ✓
- **Targets 70–90% (Phase 4):** levels start at 70% and climb to 90%; Blob counts ramp fast (2 by 1-2, 3 by 1-3). All in `levels.js` — tune freely ✓
- **SPLIT text + timed ripple (Phase 4):** a "SPLIT!" flash when a split kills a Blob; level-complete *holds* on the cleared board (`config.TIMING.completeHold`) so you feel the win, then the ripple ✓
- **Death beat (Phase 4):** a blob hit freezes the game in a `"dead"` state with the contact point pulsing ("CAUGHT!") and **waits for a key** before respawning (a fuller explosion is a later visual pass). Out of lives still → game over ✓
- **Readability (Phase 4):** the "+N%" pop-up is nudged toward the field centre so it isn't hidden by the cut line or border; the HUD/intro ZONE label uses the zone's frontier colour ✓
- **Perimeter-safe collision (Phase 5):** Blobs only kill while you're **cutting** in open space — riding the perimeter / claimed edges is safe even if a blob brushes the marker. The death also flashes the offending blob (the real kill point on a line contact) ✓
- **Scoring (Phase 5):** base points per % claimed × size bonus (**BLOCK OUT** ≥30% ×2, **MEGA-CUT** ≥50% ×4) × length bonus (**LONG/SUPER/MEGA** by cut length vs field height) × the per-level multiplier; **SPLIT** adds per-kill points and grants ×2 to the level multiplier. Clearing a level adds a flat bonus + per-remaining-life bonus. All values in `config.POINTS`. Slow-cut bonus and ZOOM scoring stay deferred ✓
- **Score read-out (Phase 5):** a scored cut shows a big central read-out — the bonus names pop in one-by-one (the planned "doof doof doof" beat, ready for sound), then `base × mult [+kills] = +total`. The HUD score pulses when it jumps. `config.TIMING` holds `rewardLife`/`rewardStep`/`scorePulse` ✓
- **SUPER mode: deferred** — wired conceptually (clear 5-5 → 2× enemies) but not built in Phase 4; for now 5-5 ends at the campaign-complete screen ✓
- **Claim rule (no enemies):** keep the largest open region, claim the rest ✓ (§13)

## 15. Still Open (deferred, none block the build)

1. Exact point values per mechanic — tuned once playable.
2. SUPER mode beyond S5-5 — wrap to SS mode (4× enemies)? Or procedural? Decide after SUPER is built.
3. Whether LONG-cut multiplier has an upper cap or scales unbounded.
4. Solar Wind vs ZOOM overlap — both move enemies; may merge or differentiate later.
5. Marker control feel at the current grid resolution (8px) — revisit speed/granularity once enemies and dodging exist (Phase 3).

---

## 16. As-Built: Movement, Controls & the Perimeter Model (Phases 0–2)

How the marker actually moves and what it can ride, as realised while building the core. This is the source of truth for the control feel; it refines §2–§3.

### Movement & controls
- **Continuous travel.** Press a direction and the marker keeps going on its own — it does **not** stop. The only time it's stationary is at the very start of a level, before the first press.
- **Opposite reverses.** Pressing the direction opposite to current travel turns the marker around.
- **Hold a turn in anticipation.** Approaching a junction, hold the direction you want; the marker takes that line the instant it becomes available, so turns don't need frame-perfect taps.
- **Cutting vs riding.** A **fresh** press that points into open space starts a **cut**. A **held** key only ever rides existing lines — it never surprise-cuts you into the open.
- Keyboard: arrow keys or WASD. Touch controls are Phase 7.

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
