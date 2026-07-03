// COSMIC CUT — config
// Tunable constants: the "numbers" of the game. No state, no DOM. Tweak feel
// here (grid resolution, speed, palette) without touching the logic.

// Device branch — decided ONCE at game start (per design: no runtime switching).
// A coarse-pointer device with a phone-sized screen gets the PORTRAIT layout:
// portrait canvas + play-field, roomier HUD strip up top, and a bottom control
// strip for the touch UI (SLOW button). Desktop/iPad keep the classic landscape
// arena. Everything downstream (grid, marker, enemies, renderers) derives from
// these numbers, so the branch lives here and nowhere else. Guarded so headless
// imports (tests, tools) fall back to desktop.
export const MOBILE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches &&
  Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) <= 500;

export const WIDTH = MOBILE ? 440 : 800;
export const HEIGHT = MOBILE ? 876 : 680;
export const MARGIN = 40;

// The play field rectangle, inset within the canvas. Mobile: 64px top strip for
// the HUD, 100px bottom strip for touch controls; field is 400×712 → 50×89 cells.
// Desktop: the classic 40px ring; field is 720×600 → 90×75 cells.
export const field = MOBILE
  ? { x: 20, y: 64, w: 400, h: 712 }
  : { x: MARGIN, y: MARGIN, w: WIDTH - MARGIN * 2, h: HEIGHT - MARGIN * 2 };

// Grid of cells over the field. CELL must divide field.w and field.h evenly.
export const CELL = 8;
export const COLS = field.w / CELL; // 90
export const ROWS = field.h / CELL; // 65

// Lattice point (col,row) -> pixel position. col: 0..COLS, row: 0..ROWS.
export function nodeX(col) { return field.x + col * CELL; }
export function nodeY(row) { return field.y + row * CELL; }

// Marker tuning.
export const MARKER = {
  speed: 200, // px/sec — "standard speed is FAST" (§3)
  slowCutMult: 0.42,  // speed multiplier while SPACE is held mid-cut (the "slow draw")
  slowArmWindow: 1.0, // SPACE must be held within this many seconds of a cut starting to
                      //   arm a slow draw; after that the key has no effect (and once armed
                      //   it must stay held for the whole line — release cancels it)
  radius: 7,
  startCol: COLS / 2, // bottom-centre (classic Qix spot)
  startRow: ROWS,
};

// Blob enemy tuning. Each level (levels.js) spawns Blobs by index into this
// spectrum: blue is BIG and SLOW, ramping to red SMALL and FAST. All speeds stay
// under MARKER.speed (200) so the player can always outrun them. The pulse is a
// cheap nod to the design's "expanding/contracting" Blob (full shape in Phase 9).
export const BLOB = { pulse: 2 };
// Art pass: enemies OWN the warm/pink end of the palette (cyan is the world's hero
// colour, magenta/pink/violet = danger) — a heat spectrum from slow violet to fast red.
export const BLOB_TYPES = [
  { name: "violet",  color: "#a06bff", radius: 13, speed: 85 },
  { name: "magenta", color: "#ff3df0", radius: 11, speed: 105 },
  { name: "pink",    color: "#ff5ca8", radius: 10, speed: 130 },
  { name: "orange",  color: "#ff8a3c", radius: 8,  speed: 155 },
  { name: "red",     color: "#ff4d3c", radius: 7,  speed: 182 },
];

// Neon palette (§10). Glass blocks / slow-cut shading arrive in Phase 9.
// COLORS holds the constants that DON'T change per zone (player, HUD, menu);
// the play-field palette is themed per zone (THEMES below).
export const COLORS = {
  bg: "#05030f",
  marker: "#eaffff",      // hot white-cyan — pink/magenta is reserved for danger now
  hud: "#ffffff",
  hudAccent: "#ff3df0",   // magenta = danger/bonus accents only
  locked: "#3a3550",      // dimmed zone chip on the start screen
  // defaults (zone-1 cyan) used by menu/fallback
  frontier: "#7df9ff",
  claimedFill: "rgba(25, 230, 255, 0.16)",
  claimedFillSlow: "rgba(4, 30, 44, 0.62)", // deep smoked "slow draw" glass
  seam: "rgba(125, 249, 255, 0.4)",
  arena: "#1f8fa3",
  trail: "#5ad6ff",
};

// Per-zone field palette — ART PASS (cyan-hero discipline, per the NEXUS reference
// board): every zone's playfield stays in the cyan/teal family (identity = subtle
// temperature shifts only), while the zone's OLD hue lives on as a restrained
// `accent` (seam tint, arena border, ZONE labels). Pink/magenta now MEANS danger.
export const THEMES = [
  { frontier: "#7df9ff", claimedFill: "rgba(25, 230, 255, 0.16)",  claimedFillSlow: "rgba(4, 30, 44, 0.62)",  trail: "#5ad6ff", seam: "rgba(125, 249, 255, 0.35)", arena: "#1f8fa3", accent: "#19e6ff" }, // 1 pure teal-cyan (the hero look)
  { frontier: "#8fc9ff", claimedFill: "rgba(90, 180, 255, 0.16)",  claimedFillSlow: "rgba(6, 22, 44, 0.62)",  trail: "#6fb4ff", seam: "rgba(255, 185, 110, 0.28)", arena: "#a3631f", accent: "#ffb24d" }, // 2 ice-blue, ember accents
  { frontier: "#7dffd4", claimedFill: "rgba(40, 255, 200, 0.15)",  claimedFillSlow: "rgba(5, 36, 30, 0.62)",  trail: "#5affc9", seam: "rgba(130, 255, 180, 0.28)", arena: "#1fa35a", accent: "#79ff9e" }, // 3 sea-green cyan
  { frontier: "#a8c4ff", claimedFill: "rgba(140, 170, 255, 0.15)", claimedFillSlow: "rgba(16, 18, 46, 0.64)", trail: "#8fb0ff", seam: "rgba(190, 160, 255, 0.28)", arena: "#5a2fa3", accent: "#bb8cff" }, // 4 steel-blue, violet whisper
  { frontier: "#eaffff", claimedFill: "rgba(200, 245, 255, 0.14)", claimedFillSlow: "rgba(20, 34, 44, 0.62)", trail: "#c8f6ff", seam: "rgba(255, 220, 120, 0.28)", arena: "#a3851f", accent: "#ffd24d" }, // 5 white-hot electric cyan, gold accents
];

// Phase 9 art-direction §1: BLOOM (Pixi-only, AdvancedBloomFilter from pixi-filters).
// The single biggest upgrade toward the reference look — only bright neon things
// (perimeter, trail, enemies, stars, marker) glow; the dark void/glass stays dark
// thanks to the brightness `threshold`. Applied to the world layers only, so HUD
// text stays crisp. Mark tunes these by eye — all live knobs in one place.
// Mobile perf: bloom is the single biggest GPU cost (a full-screen blur pass,
// `quality` times, at `resolution`× the device pixel ratio) and the two
// DisplacementFilters (NEBULA.warp, GLASS.refraction below) each add a further
// full-screen sample pass. Phones burn battery on all three every frame with no
// visible benefit over a lighter setting on a small screen — so mobile gets bloom
// kept (it's the game's signature look) but cheaper: fewer blur passes, capped
// resolution instead of full DPR, and the two displacement filters OFF entirely
// (their DisplacementFilter objects are simply never constructed — see render-pixi.js).
export const BLOOM = {
  enabled: true,
  threshold: 0.55,   // 0..1 — only pixels brighter than this bloom (raise = less glow)
  bloomScale: 1.5,     // intensity of the added glow
  brightness: 2.0,   // overall brightness multiplier of the result
  // --- smoothness / anti-pixelation (the "glossy not blocky" knobs) ---
  blur: 8,          // glow SPREAD radius. Low values keep the hard 8px cell edges →
                     //   blocky halos; raise it to melt them into a soft glossy haze.
  quality: MOBILE ? 3 : 5,  // # of blur passes. Too few = visible stepping/banding. Higher = smoother (costlier).
  pixelSize: 0.5,      // Kawase-blur sample spacing. 1 = smooth; >1 = deliberately retro/blocky; <1 = supersampled (smoothest, costliest).
  resolution: MOBILE ? 1 : 0, // bloom render resolution. 0 = match device pixel ratio (crisp on retina,
                     //   but 2-3x the pixels on a Retina phone — expensive); mobile pins it to 1.
};

// Phase 9 — GLASS shimmer (Pixi-only). The claimed-glass reflection is two additive,
// diagonally-scrolling TilingSprites of a baked streak/noise texture, clipped to the
// glass shape — organic drifting light that lets the starfield show through (instead of
// a flat white band). `opacity` scales both layers; layer B is the slower, larger
// parallax. `speed` is px/sec of tile drift; `tint` colours the reflection.
export const GLASS = {
  opacity: 0.4,        // overall reflection strength (0 = off). Additive + bloom, so keep low.
  tint: "#7fd4ff",     // cyan-leaning glass tint (less "bold white")
  speed: 14,           // diagonal scroll speed (px/sec) of the near layer
  scaleA: 1.0,         // near layer tile scale
  scaleB: 1.7,         // far/parallax layer tile scale (bigger, slower → depth)
  // px the nebula BEHIND the glass is displaced (0 = off, and skips building the
  // DisplacementFilter entirely) — the "looking through glass" bend. Higher =
  // thicker/wavier glass. Off on mobile: a whole extra full-screen filter pass.
  refraction: MOBILE ? 0 : 34,
};

// Phase 9 — NEBULA smoke-warp (Pixi-only). A DisplacementFilter driven by a slowly
// scrolling noise map churns the baked nebula so it curls like volumetric smoke
// (local turbulence, not just a sliding image). `warp` = displacement strength in px
// (0 = off, static drift only, and skips building the DisplacementFilter/noise bake
// entirely — mobile's other big filter-pass saving); `evolve` scales how fast it churns.
export const NEBULA = {
  warp: MOBILE ? 0 : 40,
  evolve: 1,
  // Slow whole-nebula motion so the gas clouds aren't pinned to fixed screen spots:
  // an oversized sprite (scale) drifts in a lissajous (drift px) and gently rocks
  // (rotate rad). Kept within the oversize margin so a screen edge never shows.
  scale: 1.32,   // base oversize (room to wander/rotate without exposing an edge)
  drift: 46,     // px amplitude of the slow positional wander
  rotate: 0.06,  // radians amplitude of the slow rotation rock
};

// Phase 9 — STARFIELD drift (Pixi-only). The parallax stars used to always fall
// straight down (N→S); now they scroll along a heading that slowly rotates, so the
// field's direction keeps changing. `windTurn` = rad/sec the heading rotates;
// `baseAngle` = starting heading (π/2 = downward, the classic look).
export const STARFIELD = {
  windTurn: 0.05,
  baseAngle: Math.PI / 2,
};

// Phase 9 — our signature look: ROUNDED territory edges. The perimeter frontier, the
// claimed-glass rim, and the live cut line are traced as continuous loops/polylines and
// stroked with rounded corners (Pixi-only). `radius` is the corner radius in px, clamped
// per-corner to half the shortest adjacent edge — so on the 8px grid, ~4 fully rounds the
// staircases into smooth scallops, while lower values just soften the corners "slightly".
export const CORNERS = { radius: 4 };

// Art pass — SHIP TRAIL (Pixi-only). The rocket leaves a glowing ribbon that fades
// behind it (per-segment tapered strokes; bloom supplies the glow) plus a stream of
// thruster embers from the renderer-local ambient particle system. Emission rates
// are particles/second — they scale with the state (riding / cutting / ZOOM dash).
export const SHIP_TRAIL = {
  life: 0.45,          // seconds a ribbon point lives
  minDist: 2.5,        // px moved before a new ribbon point is recorded
  width: 5,            // ribbon stroke width at the ship (tapers to 0)
  alpha: 0.55,         // ribbon alpha at the ship (fades quadratically)
  colorCut: "#ffd24d", // ribbon while cutting (hot); riding uses theme().trail
  colorSlow: "#9fd8ff",// ribbon during a SLOW DRAW (glass blue)
  colorDash: "#ff5ca8",// ribbon during a ZOOM dash (danger pink — earned exception)
  emitRide: 100,       // thruster embers/sec while riding the perimeter
  emitCut: 280,        // …while cutting (engine runs hot)
  emitDash: 520,       // …during a ZOOM dash (rocketing)
};

// Art pass — SHIP VISIBILITY (Pixi-only). The white-cyan hull can vanish against the
// bright cyan perimeter (both bloom to white), worst right after a level (re)start
// when the ship sits still on the border. Three fixes, all tunable:
//   backplate — a soft dark disc under the hull silhouettes it against bright lines
//   beacon    — expanding "you are here" rings for a moment on level start / respawn
//   locator   — a faint periodic pulse ring while riding (cutting needs no help —
//               the hot trail already points at you)
export const SHIP_VIS = {
  backplateAlpha: 0.55,  // darkness of the silhouette disc (0 = off)
  backplateR: 2.6,       // disc radius, ×MARKER.radius
  beaconTime: 1.4,       // seconds the spawn beacon plays
  beaconR: 80,           // px the beacon rings expand to
  locatorPeriod: 1.6,    // seconds between riding locator pulses (0 = off)
  locatorR: 26,          // px the locator ring expands to
  locatorAlpha: 0.35,    // peak alpha of the locator ring
};

// Art pass — renderer-local AMBIENT particles (Pixi-only). Continuous, presentation-
// only emission (thruster embers, enemy wakes, sparx sparks, dust motes) lives in
// render-pixi.js, NOT fx.js — fx stays the gameplay-event system main.js talks to.
// `max` is a hard cap; when full the oldest die first (perf fallback knob #1). Each
// "glow" particle draws 3 stacked circles (halo/body/highlight), so 500 of them is
// up to 1500 fill ops/frame — halved on mobile where GPU headroom is much tighter.
export const AMBIENT = { max: MOBILE ? 250 : 500 };

// Art pass — ENERGY enemies (Pixi-only). Enemies read as beings of light: pulsing
// halo cores, drifting particle wakes, spark dribbles. Rates are per second.
export const ENERGY = {
  corePulse: 3,        // rad/sec of the core halo breathing
  coreHalo: 0.16,      // peak alpha of the outer halo (bloom amplifies it)
  wakeRate: 60,        // wake motes/sec shed by each blob body
  endpointSparkRate: 9,// sparks/sec shed by each live Qix stick endpoint
  sparxRate: 25,       // sparks/sec dribbled by a sparx on the perimeter
  sparxLatchRate: 200, // sparks/sec while a Fast Sparx is latched to your cut (danger shower)
};

// Art pass — FX enrichment knobs read by fx.js (pure data, keeps fx browser-API-free).
// The kill explosion now leaves a hanging cloud of slow neon dust after the fast spray.
export const FX = {
  dustCount: 18,       // dust motes per 1.0 power
  dustLifeMin: 1.2, dustLifeMax: 1.8,
  dustSpeedMin: 20, dustSpeedMax: 70,
};

// Art pass — atmospheric depth (Pixi-only, NEXUS board "faint grid in the void").
// A barely-there holographic lattice over UNCLAIMED cells only — claiming visibly
// replaces tech-void with glass. Alpha sits below BLOOM.threshold: pure depth, no glow.
export const GRID_BG = {
  spacing: 4,          // lattice line every N cells (4 × 8px = 32px squares)
  alpha: 0.05,         // peak line alpha (breathes gently around this)
  color: "#7df9ff",
};

// Drifting dust motes — persistent, twinkling, wrapping the field. Cheap depth cue.
export const MOTES = {
  count: 40,
  speedMin: 4, speedMax: 10,     // px/sec drift
  alphaMin: 0.08, alphaMax: 0.2, // twinkle range
};

// Corner fall-off vignette — baked once to a texture (zero per-frame cost, no filter).
export const VIGNETTE = {
  alpha: 0.5,          // darkness at the extreme corners
  inner: 0.55,         // radius (0..1 of half-diagonal) where the fall-off begins
};

// Art pass — HUD (Pixi-only). Sci-fi data-viz top bar: Orbitron face (falls back to
// system-ui offline), bracket-framed zone label, an eased claim-progress bar with a
// target tick, mini ship-glyph lives, score underline. All sizes/colours here.
// Device-branched: mobile gets a TWO-ROW layout with a big readable score
// (row 1: ZONE · SCORE, row 2: claim bar · % · lives) inside the 64px top strip.
export const HUD = {
  font: '"Orbitron", system-ui, sans-serif',
  trackColor: "#123340",
  fillColor: "#19e6ff",
  tickColor: "#ffffff",
  lineAlpha: 0.15,      // 1px separator under the whole top bar
  ease: 0.12,           // per-frame easing of the displayed % toward the real %
  ...(MOBILE
    ? {
        textSize: 16, scoreSize: 22, smallSize: 13,
        barX: 16, barY: 42, barW: 190, barH: 10,   // row 2, left
        sepY: 58,                                  // hairline separator
        fxY: 66,                                   // power-up timers (top of field edge)
      }
    : {
        textSize: 15, scoreSize: 15, smallSize: 12,
        barX: 150, barY: 16, barW: 180, barH: 8,
        sepY: 38,
        fxY: 44,
      }),
};

// Touch UI (mobile only). The SLOW button sits in the bottom control strip —
// hold it for a SLOW DRAW (same as a second finger / SPACE). `hitR` is the
// generous touch radius; `r` is the drawn radius.
export const TOUCH = {
  slowBtn: { x: WIDTH - 64, y: HEIGHT - 52, r: 34, hitR: 54 },
};

// Art pass — player-death IMPACT (Pixi-only). The hit point erupts: one-shot spark
// burst, an expanding shock ring, radial magenta arcs (magenta = danger, earned here)
// and a brief white flash. All drawn during the first `window` seconds of the death.
export const IMPACT = {
  sparks: 30,          // one-shot sparks at the hit point
  ringSpeed: 260,      // px/sec the shock ring expands
  bolts: 3,            // radial arcs per flash frame
  window: 0.5,         // seconds of shock ring / bolts / flash
};

// Scoring (Phase 5, §9). Point values are deliberately gathered here so they're
// easy to balance once the game is played. A cut scores base points per % it
// claims, multiplied by any bonuses it triggers (BLOCK OUT / MEGA-CUT by size,
// LONG tiers by length), times the level multiplier (SPLITs grant ×2 each).
export const POINTS = {
  perPercent: 10,     // base points per 1% of the arena claimed in a cut
  blockOutPct: 75, blockOutMult: 2,   // single cut ≥30% → ×2 (§4)
  megaCutPct: 85,  megaCutMult: 4,    // single cut ≥50% → ×4 (§4)
  // LONG tiers by cut length, measured in field-heights (×ROWS). LONG starts at 2×.
  longHeights: 2, superLongHeights: 3, megaLongHeights: 4,
  longMult: 1.5, superLongMult: 2, megaLongMult: 3,
  slowCutMult: 10,      // a SLOW DRAW (SPACE held) 10x the cut's area points (§"Stix")
  splitMult: 2,        // each SPLIT grants ×2 to the level multiplier (§14)
  perKill: 500,        // points per Blob destroyed (juicy, §"nice points on kill")
  nearMiss: 150,       // points when a blob grazes your trail without hitting
  levelClear: 1000,    // bonus for clearing a level
  lifeBonus: 250,      // per remaining life at clear
};

// Animation / feel timings (seconds), gathered so feel is tunable in one place.
export const TIMING = {
  popupLife: 1.6,      // how long a "+N%" claim pop-up lingers
  rewardLife: 2.2,     // how long the central score read-out (labels + total) shows
  rewardStep: 0.15,    // delay between each bonus label popping in (the "doof doof doof")
  scorePulse: 0.35,    // how long the HUD score stays enlarged after it jumps
  deathHold: 0.9,      // forced pause on the CAUGHT! screen before a key can respawn (stops accidental skips)
  completeScore: 1.8,  // read out the final cut's score + bonuses (under the Stage Clear jingle) before the banner
  completeHold: 1.2,   // hold the LEVEL COMPLETE banner over the full board *before* the ripple (§7)
  completeWipe: 0.9,   // the expanding-ripple (circle close-out) duration
  completeTail: 0.6,   // pause after the ripple before the next level loads
};

// Audio feel knobs, gathered so the mix, beat-throb and music tension are all
// tunable in one place (read by audio.js, render.js and audio-director.js).
export const AUDIO = {
  sfxLevel: 1.15,   // SFX submix gain (sits above the music)
  moveLevel: 0.09,  // base volume of the movement "schoo"
  beat: {           // beat-reactive throb on the frontier line
    bassBins: 6,      // # of lowest FFT bins summed for the sub-bass pulse
    smoothing: 0.3,   // analyser FFT smoothing (lower = punchier transients)
    baselineEase: 0.04, // how fast the steady-bass baseline tracks; the throb is the rise above it
    devGain: 7,       // gain on that rise → 0..1 throb (raise if the pulse is weak)
    release: 0.16,    // pulse ease-down per frame (attack is instant)
    glowBoost: 40,    // frontier shadowBlur added at full beat
    widthBoost: 3,    // frontier lineWidth (px) added at full beat
  },
  tension: {        // 0..1 tension from fill% + danger; drives the sonar ping rate
    progressWeight: 0.6, //   (the music speed-up is OFF — rateSpan 0 — it felt bad)
    dangerWeight: 0.8,   // weight of fill% / danger (0..1)
    ease: 0.05,        // smoothing toward the target tension per frame
    rateSpan: 0,       // playbackRate = 1 + tension*rateSpan  (0 → constant 1x, no speed-up)
    rateCap: 1.3,      // hard clamp on playbackRate
    synthBase: 0.2,    // synth-fallback intensity floor
    synthSpan: 0.7,    // synth-fallback intensity added at full tension
  },
  sonar: {          // submarine ping while cutting (exposed): fires as you push out,
    enabled: false,    //   set true to re-enable
    freq: 280,         //   then ~1s apart, pitch CLIMBING the longer the line is drawn
    level: 0.2,        // ping volume
    interval: 1.0,     // seconds between pings during a single cut
    rampTime: 5,       // seconds of continuous cutting to reach the top pitch
    pitchRange: 1.2,   // pitch climbs to base*(1+pitchRange) across rampTime (≈ +octave)
  },
  debugBeat: false, // flip to true to show the live beat detector readout (bottom-left)
};

// Qix body visual tuning — the classic Kix/Qix look: a SHEAF of straight lines.
// Two endpoints sweep erratically inside a body box; a short history of past line
// positions is drawn each frame → the twisting "ribbon of sticks". The box
// normally stays compact (spanBase) but occasionally SURGES toward spanMax
// (~50% of screen) for a short burst, then settles. The box centre bounces
// through open space. Collision tests the live stick LINE (not a disc), so a
// long stick only kills where the line actually is.
export const QIX = {
  sizeScale:        1.5,  // overall enemy size multiplier (applied to blob radius)
  lines:             26,  // sheaf depth — number of past line snapshots drawn
  endpointSpeed:     95,  // base px/sec the endpoints sweep within the box
  surgeSpeedMult:   2.4,  // endpoint speed multiplier at full surge
  spanBase:          26,  // typical half-length (compact, twisty)
  // Half-length at full surge (≈ stick spanning ~50% of the field's short side).
  // Derived, not literal: on the portrait mobile field (400 wide) the old 250
  // would exceed the wall-bounce margin and pin/jitter the Qix (see TODO note).
  // Desktop: min(720,600)·0.42 ≈ 252 — same feel as the old 250.
  spanMax: Math.round(Math.min(field.w, field.h) * 0.42),
  surgeIntervalMin:   3,  // min seconds between surges
  surgeIntervalMax:   7,  // max seconds between surges
  surgeHold:        0.6,  // seconds a surge stays expanded before settling
  surgeEase:        2.5,  // how fast span eases toward its target (per sec)
  twist:           0.18,  // constant span wobble (the twisty feel)
  twistFreq:        2.3,  // wobble frequency (rad/sec)
  lineHitPad:         4,  // collision padding around the live stick
  hunterDrift:       22,  // px/sec² acceleration toward player (Hunter Blob)
  glowWidth:    [5, 2.5, 1.2],      // stroke widths for each glow pass
  glowAlpha:   [0.10, 0.30, 0.95],  // alphas matching each pass
};

// BOSS Qix (the star of every X-5 level): a huge, faster, longer-ribboned sheaf that
// surges more often and lasts longer — rendered rainbow with constant lightning arcs +
// a pulsing core (render-pixi). Multipliers over the base QIX values. Marked on the
// FIRST qix of a boss level (levels.js sets `boss: sub === 5`).
export const BOSS = {
  sizeMult:          1.7,  // body radius
  spanBaseMult:      1.9,  // larger COMPACT span — it always looms bigger as it roams
  spanMaxMult:       1.0,  // keep the surge at the normal (already ~50%-screen) size: a
                           //   bigger surge would exceed half the field and the wall-bounce
                           //   margin (= span) would pin/jitter the boss. Big-when-compact
                           //   + size/lines/effects carry the "boss" feel instead.
  linesMult:         1.8,  // longer twisting ribbon
  endpointSpeedMult: 1.3,  // sweeps faster
  surgeIntervalMult: 0.55, // surges roughly twice as often
  surgeHoldMult:     1.7,  // and holds the surge longer
  // Art pass — multi-stage visual escalation (Pixi-only, presentation on top of the
  // unchanged boss logic). Crossing each claim-% threshold visibly angers the boss:
  // bigger hotter core + rotating ring, more/likelier arcs, faster rainbow spin;
  // at the final stage it strobes double bolts, sheds rainbow motes and pumps out
  // slow flare rings every `flarePeriod` seconds.
  stages: [25, 50, 75], // claim-% thresholds; stage = how many are crossed (0–3)
  stageCore: 0.35,      // core pulse radius grows ×(1 + stage·this)
  stageArcs: 1,         // extra lash arcs per stage
  flarePeriod: 2,       // seconds between stage-3 flare rings
};

// Polygon Blob visual tuning — the alternative enemy shape: a ring of orbiting
// vertices with internal diagonals, oscillating radius and slow rotation. Used
// for regular Blobs and Hunter Blobs. Collision uses a bounding radius.
export const BLOB_POLY = {
  segments:       8,    // vertices in the body polygon
  sizeScale:     1.6,   // extra size multiplier for POLY blobs only (on top of QIX.sizeScale)
                        //   — bigger Blobs so their orbiting-vertex intricacy reads clearly
  hitScale:      0.95,  // collision radius = blob radius × this (tighter than the visual
                        //   bounding radius, which uses the full oscillation extent)
  oscillateAmp:  0.5,   // vertex radius swings ± this fraction of blob radius
  oscillateFreq: 1.1,   // base oscillation frequency (rad/sec)
  angularDrift:  0.25,  // max per-vertex angular drift (rad/sec)
  rotateSpeed:   0.18,  // whole-body rotation (rad/sec)
  glowWidth:    [9, 4, 1.6],
  glowAlpha:   [0.12, 0.30, 0.9],
};

// Sparx (perimeter-tracer) tuning. Normal Sparx BFS-chase the player along the
// auto-network. Fast Sparx do the same but can also latch onto an exposed cut
// trail and rocket along it at boosted speed, trying to catch the player mid-cut.
export const SPARX = {
  speed:          85,   // normal Sparx perimeter speed (px/sec)
  fastSpeed:     120,   // Fast Sparx perimeter speed
  latchSpeed:    240,   // Fast Sparx speed when latched to the cut trail
  radius:          9,   // collision + visual radius (1.5× the original 6)
  normalColor: "#ffee00", // normal Sparx neon yellow
  fastColor:   "#ff6200", // Fast Sparx hot orange
  latchColor:  "#ff2200", // Fast Sparx color when latched (danger red)
  trailLen:       12,   // number of recent positions kept for the visual trail
};

// Power-up tuning (Phase 6, §8). All durations in seconds; killPoints/distancePoints
// are ZOOM scoring per enemy killed and per pixel travelled respectively.
export const POWERUPS = {
  maxOnBoard:     2,     // max pickups + ZOOM floating simultaneously
  spawnChance:    0.35,  // probability of spawning after each successful claim
  spawnMinPct:    5,     // don't spawn until this % of the board is claimed
  zoomDriftSpeed: 40,    // px/sec — how fast the floating ZOOM marker drifts
  iconScale:      3,     // visual + touch size multiplier for pickups
  FREEZE:    { duration: 5, color: "#00d4ff", label: "FREEZE"                        },
  // SOLAR WIND blows every enemy hard against one wall and pins them there for
  // `duration` seconds, leaving the rest of the board clear to carve. Duration
  // sits between FREEZE (5s) and BOOST (8s) — was 3.5s, felt over before it
  // registered. streakAlpha/streakWidth/chevronCount are the render-pixi.js
  // drawSolarWind() visual knobs (was very subtle — thin, low-alpha streaks only).
  SOLARWIND: { duration: 6.5, color: "#ffaa00", label: "SOLAR WIND", gustMult: 1.6,
               streakAlpha: 0.34, streakWidth: 3, chevronCount: 5 },
  BOOST:     { duration: 8, color: "#39ff14", label: "BOOST",     speedMult:    1.5  },
  SHIELD:    { duration: 6, color: "#ff80ff", label: "SHIELD"                        },
  // ZOOM is a DASH: pick a direction, then rocket across the field DRAWING A CUT at
  // dashSpeedMult× speed — invulnerable, killing any enemy the ship flies through
  // (within dashKillReach px of its body). The cut claims normally when it lands.
  ZOOM:      { duration: 0, color: "#ff4400", label: "ZOOM",      killPoints:   80,
               dashSpeedMult: 2, dashKillReach: 9 },
};
