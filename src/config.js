// COSMIC CUT — config
// Tunable constants: the "numbers" of the game. No state, no DOM. Tweak feel
// here (grid resolution, speed, palette) without touching the logic.

export const WIDTH = 800;
export const HEIGHT = 680; // reclaimed the page's title/tagline strip for play area
export const MARGIN = 40;

// The play field rectangle, inset within the canvas.
export const field = {
  x: MARGIN,
  y: MARGIN,
  w: WIDTH - MARGIN * 2,  // 720
  h: HEIGHT - MARGIN * 2, // 600
};

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
export const BLOB_TYPES = [
  { name: "blue",  color: "#3c6cff", radius: 13, speed: 85 },
  { name: "cyan",  color: "#3cf0ff", radius: 11, speed: 105 },
  { name: "green", color: "#57ff8f", radius: 10, speed: 130 },
  { name: "amber", color: "#ffb83c", radius: 8,  speed: 155 },
  { name: "red",   color: "#ff4d3c", radius: 7,  speed: 182 },
];

// Neon palette (§10). Glass blocks / slow-cut shading arrive in Phase 9.
// COLORS holds the constants that DON'T change per zone (player, HUD, menu);
// the play-field palette is themed per zone (THEMES below).
export const COLORS = {
  bg: "#05030f",
  marker: "#ff3df0",
  hud: "#ffffff",
  hudAccent: "#ff3df0",
  locked: "#3a3550",      // dimmed zone chip on the start screen
  // defaults (zone-1 cyan) used by menu/fallback
  frontier: "#7df9ff",
  claimedFill: "rgba(25, 230, 255, 0.16)",
  claimedFillSlow: "rgba(4, 30, 44, 0.62)", // deep smoked "slow draw" glass
  seam: "rgba(125, 249, 255, 0.4)",
  arena: "#1f8fa3",
  trail: "#5ad6ff",
};

// Per-zone field palette — each zone re-themes the frontier/claim/trail/seam/
// arena so the world's mood shifts as you climb (zone 1 cyan → 2 orange → …).
export const THEMES = [
  { frontier: "#7df9ff", claimedFill: "rgba(25, 230, 255, 0.16)", claimedFillSlow: "rgba(4, 30, 44, 0.62)",  trail: "#5ad6ff", seam: "rgba(125, 249, 255, 0.4)", arena: "#1f8fa3" }, // 1 cyan
  { frontier: "#ffb24d", claimedFill: "rgba(255, 150, 40, 0.16)", claimedFillSlow: "rgba(44, 22, 4, 0.62)",  trail: "#ffc266", seam: "rgba(255, 185, 110, 0.4)", arena: "#a3631f" }, // 2 orange
  { frontier: "#79ff9e", claimedFill: "rgba(60, 255, 140, 0.15)", claimedFillSlow: "rgba(6, 38, 20, 0.62)",  trail: "#7affb0", seam: "rgba(130, 255, 180, 0.4)", arena: "#1fa35a" }, // 3 green
  { frontier: "#bb8cff", claimedFill: "rgba(165, 120, 255, 0.16)", claimedFillSlow: "rgba(24, 14, 46, 0.64)", trail: "#c9a6ff", seam: "rgba(190, 160, 255, 0.4)", arena: "#5a2fa3" }, // 4 violet
  { frontier: "#ffd24d", claimedFill: "rgba(255, 205, 60, 0.15)", claimedFillSlow: "rgba(44, 32, 4, 0.62)",  trail: "#ffdf80", seam: "rgba(255, 220, 120, 0.4)", arena: "#a3851f" }, // 5 gold
];

// Phase 9 art-direction §1: BLOOM (Pixi-only, AdvancedBloomFilter from pixi-filters).
// The single biggest upgrade toward the reference look — only bright neon things
// (perimeter, trail, enemies, stars, marker) glow; the dark void/glass stays dark
// thanks to the brightness `threshold`. Applied to the world layers only, so HUD
// text stays crisp. Mark tunes these by eye — all live knobs in one place.
export const BLOOM = {
  enabled: true,
  threshold: 0.55,   // 0..1 — only pixels brighter than this bloom (raise = less glow)
  bloomScale: 1.5,     // intensity of the added glow
  brightness: 2.0,   // overall brightness multiplier of the result
  // --- smoothness / anti-pixelation (the "glossy not blocky" knobs) ---
  blur: 8,          // glow SPREAD radius. Low values keep the hard 8px cell edges →
                     //   blocky halos; raise it to melt them into a soft glossy haze.
  quality: 5,       // # of blur passes. Too few = visible stepping/banding. Higher = smoother (costlier).
  pixelSize: 0.5,      // Kawase-blur sample spacing. 1 = smooth; >1 = deliberately retro/blocky; <1 = supersampled (smoothest, costliest).
  resolution: 0,     // bloom render resolution. 0 = match device pixel ratio (crisp on retina);
                     //   set 2+ to force a sharper-than-screen bloom buffer (less pixelated upscale).
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
  refraction: 34,      // px the nebula BEHIND the glass is displaced (0 = off) — the
                       //   "looking through glass" bend. Higher = thicker/wavier glass.
};

// Phase 9 — NEBULA smoke-warp (Pixi-only). A DisplacementFilter driven by a slowly
// scrolling noise map churns the baked nebula so it curls like volumetric smoke
// (local turbulence, not just a sliding image). `warp` = displacement strength in px
// (0 = off, static drift only); `evolve` scales how fast it churns.
export const NEBULA = {
  warp: 22,
  evolve: 1,
};

// Phase 9 — our signature look: ROUNDED territory edges. The perimeter frontier, the
// claimed-glass rim, and the live cut line are traced as continuous loops/polylines and
// stroked with rounded corners (Pixi-only). `radius` is the corner radius in px, clamped
// per-corner to half the shortest adjacent edge — so on the 8px grid, ~4 fully rounds the
// staircases into smooth scallops, while lower values just soften the corners "slightly".
export const CORNERS = { radius: 4 };

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
  spanMax:          250,  // half-length at full surge (≈ stick spanning 50% screen)
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

// Polygon Blob visual tuning — the alternative enemy shape: a ring of orbiting
// vertices with internal diagonals, oscillating radius and slow rotation. Used
// for regular Blobs and Hunter Blobs. Collision uses a bounding radius.
export const BLOB_POLY = {
  segments:       8,    // vertices in the body polygon
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
  // `duration` seconds, leaving the rest of the board clear to carve.
  SOLARWIND: { duration: 3.5, color: "#ffaa00", label: "SOLAR WIND", gustMult: 1.6   },
  BOOST:     { duration: 8, color: "#39ff14", label: "BOOST",     speedMult:    1.5  },
  SHIELD:    { duration: 6, color: "#ff80ff", label: "SHIELD"                        },
  // ZOOM is a DASH: pick a direction, then rocket across the field DRAWING A CUT at
  // dashSpeedMult× speed — invulnerable, killing any enemy the ship flies through
  // (within dashKillReach px of its body). The cut claims normally when it lands.
  ZOOM:      { duration: 0, color: "#ff4400", label: "ZOOM",      killPoints:   80,
               dashSpeedMult: 2, dashKillReach: 9 },
};
