// COSMIC CUT — config
// Tunable constants: the "numbers" of the game. No state, no DOM. Tweak feel
// here (grid resolution, speed, palette) without touching the logic.

export const WIDTH = 800;
export const HEIGHT = 600;
export const MARGIN = 40;

// The play field rectangle, inset within the canvas.
export const field = {
  x: MARGIN,
  y: MARGIN,
  w: WIDTH - MARGIN * 2,  // 720
  h: HEIGHT - MARGIN * 2, // 520
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
  seam: "rgba(125, 249, 255, 0.4)",
  arena: "#1f8fa3",
  trail: "#5ad6ff",
};

// Per-zone field palette — each zone re-themes the frontier/claim/trail/seam/
// arena so the world's mood shifts as you climb (zone 1 cyan → 2 orange → …).
export const THEMES = [
  { frontier: "#7df9ff", claimedFill: "rgba(25, 230, 255, 0.16)", trail: "#5ad6ff", seam: "rgba(125, 249, 255, 0.4)", arena: "#1f8fa3" }, // 1 cyan
  { frontier: "#ffb24d", claimedFill: "rgba(255, 150, 40, 0.16)", trail: "#ffc266", seam: "rgba(255, 185, 110, 0.4)", arena: "#a3631f" }, // 2 orange
  { frontier: "#79ff9e", claimedFill: "rgba(60, 255, 140, 0.15)", trail: "#7affb0", seam: "rgba(130, 255, 180, 0.4)", arena: "#1fa35a" }, // 3 green
  { frontier: "#bb8cff", claimedFill: "rgba(165, 120, 255, 0.16)", trail: "#c9a6ff", seam: "rgba(190, 160, 255, 0.4)", arena: "#5a2fa3" }, // 4 violet
  { frontier: "#ffd24d", claimedFill: "rgba(255, 205, 60, 0.15)", trail: "#ffdf80", seam: "rgba(255, 220, 120, 0.4)", arena: "#a3851f" }, // 5 gold
];

// Scoring (Phase 5, §9). Point values are deliberately gathered here so they're
// easy to balance once the game is played. A cut scores base points per % it
// claims, multiplied by any bonuses it triggers (BLOCK OUT / MEGA-CUT by size,
// LONG tiers by length), times the level multiplier (SPLITs grant ×2 each).
export const POINTS = {
  perPercent: 100,     // base points per 1% of the arena claimed in a cut
  blockOutPct: 30, blockOutMult: 2,   // single cut ≥30% → ×2 (§4)
  megaCutPct: 50,  megaCutMult: 4,    // single cut ≥50% → ×4 (§4)
  // LONG tiers by cut length, measured in field-heights (×ROWS). LONG starts at 2×.
  longHeights: 2, superLongHeights: 3, megaLongHeights: 4,
  longMult: 1.5, superLongMult: 2, megaLongMult: 3,
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
  completeScore: 1.8,  // read out the final cut's score + bonuses (under the Stage Clear jingle) before the banner
  completeHold: 1.2,   // hold the LEVEL COMPLETE banner over the full board *before* the ripple (§7)
  completeWipe: 0.9,   // the expanding-ripple (circle close-out) duration
  completeTail: 0.6,   // pause after the ripple before the next level loads
};
