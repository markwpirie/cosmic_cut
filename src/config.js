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

// Blob enemy tuning (Phase 3). One bouncing orb; slower than the marker so it's
// dodgeable. The expanding/contracting line-shape (§9) is a Phase 9 visual.
export const BLOB = {
  speed: 120,  // px/sec — under MARKER.speed so the player can outrun it
  radius: 10,  // base radius; pulses ±pulse
  pulse: 2,    // breathing amount (cheap nod to "expanding/contracting")
};

// Neon palette (§10). Glass blocks / slow-cut shading arrive in Phase 9.
export const COLORS = {
  bg: "#05030f",
  claimedFill: "rgba(25, 230, 255, 0.16)",
  seam: "rgba(125, 249, 255, 0.4)",
  arena: "#1f8fa3",
  frontier: "#7df9ff",
  trail: "#5ad6ff",
  marker: "#ff3df0",
  blob: "#ff5a3c",       // red-orange — reads as danger vs cyan rails / magenta marker
  hud: "#ffffff",
  hudAccent: "#ff3df0",
};
