// COSMIC CUT — grid (the arena world)
// The grid of claimed/empty cells, the geometry that decides what the marker
// can ride (§16), and the flood-fill claim (§13). No DOM — pure logic, so it's
// unit-testable in Node.

import { COLS, ROWS } from "./config.js";

export const EMPTY = 0;
export const FILLED = 1;

// The claimed territory. Cell (r,c) is EMPTY or FILLED. The arena wall is
// implicit: anything off the grid counts as solid (see cellSolid).
export const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));

// Every cut leaves a permanent line; once buried between two claimed cells it
// becomes an internal SEAM — rideable if steered onto, never auto-followed.
export const seams = new Set();

export let percent = 0;

// Reset to an empty arena (level start).
export function reset() {
  for (let r = 0; r < ROWS; r++) grid[r].fill(EMPTY);
  seams.clear();
  percent = 0;
}

// --- Geometry --------------------------------------------------------------
// Is cell (cr,cc) solid? Off-grid = the arena wall = solid.
export function cellSolid(cr, cc) {
  if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS) return true;
  return grid[cr][cc] === FILLED;
}

// A lattice point is "safe" if any of the four cells touching it is solid —
// i.e. it sits on the arena wall or against claimed territory.
export function nodeIsSafe(col, row) {
  return (
    cellSolid(row - 1, col - 1) ||
    cellSolid(row - 1, col) ||
    cellSolid(row, col - 1) ||
    cellSolid(row, col)
  );
}

// Best respawn point after a death: the lowest (largest row), most-central
// lattice node that sits on safe ground AND borders open space. So after a big
// block-out along the bottom you reappear right at the live frontier instead of
// stranded behind claimed turf having to ride all the way around the board.
export function respawnNode() {
  const mid = COLS / 2;
  let best = null;
  for (let row = ROWS; row >= 0; row--) {
    for (let col = 0; col <= COLS; col++) {
      if (!nodeIsSafe(col, row)) continue;
      const bordersOpen =
        (row - 1 >= 0 && col - 1 >= 0 && grid[row - 1][col - 1] === EMPTY) ||
        (row - 1 >= 0 && col < COLS && grid[row - 1][col] === EMPTY) ||
        (row < ROWS && col - 1 >= 0 && grid[row][col - 1] === EMPTY) ||
        (row < ROWS && col < COLS && grid[row][col] === EMPTY);
      if (!bordersOpen) continue;
      const d = Math.abs(col - mid);
      if (!best || row > best.row || (row === best.row && d < best.d)) best = { col, row, d };
    }
  }
  return best ? { col: best.col, row: best.row } : { col: Math.round(mid), row: ROWS };
}

// Classify the edge leaving (col,row) in (dx,dy) by its two flanking cells:
//   "INVALID"  — leaves the arena
//   "OPEN"     — empty on BOTH sides (open space; pushing here starts a cut)
//   "BOUNDARY" — empty one side, solid the other (the open frontier)
//   "INTERIOR" — solid on BOTH sides (buried wall or inside claimed territory)
export function classifyEdge(col, row, dx, dy) {
  const nc = col + dx;
  const nr = row + dy;
  if (nc < 0 || nc > COLS || nr < 0 || nr > ROWS) return "INVALID";
  let sa, sb;
  if (dx !== 0) {
    const c = Math.min(col, nc); // horizontal edge along grid-line row
    sa = cellSolid(row - 1, c);
    sb = cellSolid(row, c);
  } else {
    const r = Math.min(row, nr); // vertical edge along grid-line col
    sa = cellSolid(r, col - 1);
    sb = cellSolid(r, col);
  }
  if (sa && sb) return "INTERIOR";
  if (!sa && !sb) return "OPEN";
  return "BOUNDARY";
}

// Canonical key for the edge leaving (col,row) in (dx,dy), matching the wall
// keys recorded by applyClaim().
export function edgeKey(col, row, dx, dy) {
  if (dx !== 0) return `h:${row}:${Math.min(col, col + dx)}`;
  return `v:${col}:${Math.min(row, row + dy)}`;
}

// Is this edge part of the arena's outer wall (one flank is off-grid)?
export function isArenaBorder(col, row, dx, dy) {
  if (dx !== 0) return row === 0 || row === ROWS; // top / bottom wall
  return col === 0 || col === COLS;               // left / right wall
}

// Can the marker ride the edge leaving (col,row) in (dx,dy), and how?
//   "auto" — the default travel network: the open frontier AND the arena wall
//            (always rideable, even where claimed area is packed against it).
//   "seam" — an internal cut line between two claimed regions; ridden only when
//            the player deliberately steers onto it, never auto-followed.
//   null   — not rideable.
export function rideTypeOf(col, row, dx, dy) {
  const cls = classifyEdge(col, row, dx, dy);
  if (cls === "BOUNDARY") return "auto";
  if (cls === "INTERIOR") {
    if (isArenaBorder(col, row, dx, dy)) return "auto"; // buried wall, still rideable
    if (seams.has(edgeKey(col, row, dx, dy))) return "seam";
  }
  return null;
}

// Ride-preference rank for auto-following the perimeter (lower = preferred):
//   0  frontier   — a BOUNDARY edge: the bright, open-facing bold line
//   1  buried wall — the arena wall with claimed territory packed against it
//   2  seam        — an internal cut line between claimed regions
//   Infinity       — not rideable (open space or off-arena)
// Preferring 0 over 1 means a turning perimeter follows the frontier and never
// doubles back onto a wall; seams (2) are only taken when deliberately steered.
export function rideRank(col, row, dx, dy) {
  const cls = classifyEdge(col, row, dx, dy);
  if (cls === "BOUNDARY") return 0;
  if (cls === "INTERIOR") {
    if (isArenaBorder(col, row, dx, dy)) return 1;
    if (seams.has(edgeKey(col, row, dx, dy))) return 2;
  }
  return Infinity;
}

// A cut may travel through open space or hug a boundary, but never along an
// interior (both-solid) edge.
export function canCut(col, row, dx, dy) {
  const cls = classifyEdge(col, row, dx, dy);
  return cls === "OPEN" || cls === "BOUNDARY";
}

// --- The claim (flood fill) ------------------------------------------------
// Given a cut's trail (a list of lattice nodes from safe ground back to safe
// ground), fill the enclosed territory. You can never claim a region an enemy is
// in (real Qix rule, §13): keepCells is a list of blob {col,row} cells; we keep
// every region holding a blob and claim the rest. With no valid keepCells
// (enemy-free tests) we fall back to keeping the largest region. Also records the
// trail as a permanent seam line.
export function applyClaim(trail, keepCells) {
  // 1. Turn the trail into a set of "walls" between cells.
  const walls = new Set();
  for (let i = 0; i < trail.length - 1; i++) {
    const a = trail[i];
    const b = trail[i + 1];
    if (a.row === b.row) walls.add(`h:${a.row}:${Math.min(a.col, b.col)}`);
    else walls.add(`v:${a.col}:${Math.min(a.row, b.row)}`);
  }
  for (const w of walls) seams.add(w); // remember the line permanently

  // 2. Label every empty cell into connected regions; trail walls and claimed
  //    cells act as barriers, so the cut splits the open space.
  const comp = Array.from({ length: ROWS }, () => new Array(COLS).fill(-1));
  const sizes = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === FILLED || comp[r][c] !== -1) continue;
      const id = sizes.length;
      let size = 0;
      const stack = [[r, c]];
      comp[r][c] = id;
      while (stack.length) {
        const [cr, cc] = stack.pop();
        size++;
        if (cr - 1 >= 0 && grid[cr - 1][cc] === EMPTY && comp[cr - 1][cc] === -1 && !walls.has(`h:${cr}:${cc}`)) { comp[cr - 1][cc] = id; stack.push([cr - 1, cc]); }
        if (cr + 1 < ROWS && grid[cr + 1][cc] === EMPTY && comp[cr + 1][cc] === -1 && !walls.has(`h:${cr + 1}:${cc}`)) { comp[cr + 1][cc] = id; stack.push([cr + 1, cc]); }
        if (cc - 1 >= 0 && grid[cr][cc - 1] === EMPTY && comp[cr][cc - 1] === -1 && !walls.has(`v:${cc}:${cr}`)) { comp[cr][cc - 1] = id; stack.push([cr, cc - 1]); }
        if (cc + 1 < COLS && grid[cr][cc + 1] === EMPTY && comp[cr][cc + 1] === -1 && !walls.has(`v:${cc + 1}:${cr}`)) { comp[cr][cc + 1] = id; stack.push([cr, cc + 1]); }
      }
      sizes.push(size);
    }
  }

  // 3. Resolve which region stays OPEN vs gets CLAIMED, and which blobs die.
  //    You keep the enemies' side: the LARGEST region that holds a blob — that's
  //    where survivors stay. Every other region is claimed, and any blob caught
  //    in a claimed (smaller) region dies: that's the SPLIT (§14). With no blob
  //    info, fall back to keeping the largest region. Returns the indices (into
  //    keepCells) of blobs that were claimed, so the caller can remove them.
  const killed = [];
  if (sizes.length > 1) {
    const regionOf = [];            // region id under each keepCell, or -1
    const enemyRegion = new Map();  // blob-holding region id -> its size
    if (keepCells) {
      keepCells.forEach((kc, i) => {
        let rid = -1;
        const { col, row } = kc;
        if (row >= 0 && row < ROWS && col >= 0 && col < COLS && comp[row][col] !== -1) rid = comp[row][col];
        regionOf[i] = rid;
        if (rid !== -1) enemyRegion.set(rid, sizes[rid]);
      });
    }
    let keepId = 0;
    if (enemyRegion.size > 0) {
      let best = -1;
      for (const [rid, sz] of enemyRegion) if (sz > best) { best = sz; keepId = rid; }
    } else {
      for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[keepId]) keepId = i;
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (comp[r][c] !== -1 && comp[r][c] !== keepId) grid[r][c] = FILLED;
      }
    }
    if (keepCells) {
      keepCells.forEach((kc, i) => { if (regionOf[i] !== -1 && regionOf[i] !== keepId) killed.push(i); });
    }
  }

  recomputePercent();
  return killed;
}

export function recomputePercent() {
  let filled = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === FILLED) filled++;
  percent = (filled / (ROWS * COLS)) * 100;
}
