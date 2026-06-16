// COSMIC CUT — marker (the player)
// The marker's state and movement: riding the perimeter, starting and steering
// cuts, and the per-frame update. The "how it moves" rules of §16 live here.
// No DOM — depends only on config, grid (the world), and control (intents), so
// it's drivable headlessly in tests.

import { MARKER, nodeX, nodeY } from "./config.js";
import { classifyEdge, rideTypeOf, canCut, nodeIsSafe, applyClaim } from "./grid.js";
import { peekPending, clearPending, currentDesired } from "./control.js";

export const marker = {
  col: MARKER.startCol,
  row: MARKER.startRow,
  x: nodeX(MARKER.startCol),
  y: nodeY(MARKER.startRow),
};

export let dir = null;       // {dx,dy}; null only at level begin (§ "never stop")
export let prevDir = null;   // previous (different) heading, for T-junction momentum
export let mode = "riding";  // "riding" | "cutting"
export let rideType = "auto"; // "auto" (frontier/wall) | "seam"
export let trail = [];       // nodes of the in-progress cut

// Reset to the start position (level start / restart).
export function reset() {
  marker.col = MARKER.startCol;
  marker.row = MARKER.startRow;
  marker.x = nodeX(marker.col);
  marker.y = nodeY(marker.row);
  dir = null;
  prevDir = null;
  mode = "riding";
  rideType = "auto";
  trail = [];
}

const ALL_DIRS = [
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
];

function setDir(dx, dy) {
  // Remember the last DIFFERENT heading so we can carry momentum through a
  // T-junction (e.g. keep going east after a stretch heading south).
  if (dir && (dir.dx !== dx || dir.dy !== dy)) prevDir = dir;
  dir = { dx, dy };
}

function startCut(dx, dy) {
  mode = "cutting";
  trail = [{ col: marker.col, row: marker.row }];
  setDir(dx, dy);
}

function decideRiding() {
  // 1. A FRESH press acts immediately if it can: push into open space to start
  //    a cut, or turn straight onto a line that's available right now.
  const p = peekPending();
  if (p) {
    clearPending();
    if (classifyEdge(marker.col, marker.row, p.dx, p.dy) === "OPEN") {
      startCut(p.dx, p.dy);
      return;
    }
    const t = rideTypeOf(marker.col, marker.row, p.dx, p.dy);
    if (t) { setDir(p.dx, p.dy); rideType = t; return; }
    // not actionable here — the held intent below applies it at the junction
  }
  // 2. A HELD direction turns onto its line as soon as one is reachable — the
  //    "hold the turn in anticipation" behaviour. Held keys only ride lines;
  //    they never start a cut.
  const want = currentDesired();
  if (want) {
    const t = rideTypeOf(marker.col, marker.row, want.dx, want.dy);
    if (t) { setDir(want.dx, want.dy); rideType = t; return; }
  }
  // Stopped with no usable input → stay put (only ever at level begin).
  if (!dir) return;
  // 3. Keep going straight if the line carries on. Riding the auto network we
  //    only continue along auto edges (so we follow the outer perimeter round
  //    corners rather than drifting onto a seam); riding a seam we continue
  //    along whatever rideable edge lies straight ahead.
  const straight = rideTypeOf(marker.col, marker.row, dir.dx, dir.dy);
  if (straight && (rideType !== "auto" || straight === "auto")) {
    rideType = straight;
    return;
  }
  // 4. Forced turn (corner or T-junction). Gather rideable non-reverse exits,
  //    preferring the auto network over seams.
  const rev = { dx: -dir.dx, dy: -dir.dy };
  const opts = [];
  for (const d of ALL_DIRS) {
    if (d.dx === rev.dx && d.dy === rev.dy) continue;
    const t = rideTypeOf(marker.col, marker.row, d.dx, d.dy);
    if (t) opts.push({ d, t });
  }
  if (opts.length) {
    const autos = opts.filter((o) => o.t === "auto");
    const pool = autos.length ? autos : opts;
    // Carry momentum through the junction; random left/right if there's none.
    let pick = prevDir
      ? pool.find((o) => o.d.dx === prevDir.dx && o.d.dy === prevDir.dy)
      : null;
    if (!pick) pick = pool[Math.floor(Math.random() * pool.length)];
    setDir(pick.d.dx, pick.d.dy);
    rideType = pick.t;
    return;
  }
  // Only the way we came is rideable — ride back (never stop).
  const rt = rideTypeOf(marker.col, marker.row, rev.dx, rev.dy);
  if (rt) { setDir(rev.dx, rev.dy); rideType = rt; return; }
  dir = null; // only reachable at level begin with no input yet
}

function decideCutting() {
  const rev = { dx: -dir.dx, dy: -dir.dy };
  // A perpendicular/forward press steers the cut; reversing into our own trail
  // is disallowed.
  const p = peekPending();
  if (p && !(p.dx === rev.dx && p.dy === rev.dy)) {
    clearPending();
    if (canCut(marker.col, marker.row, p.dx, p.dy)) { setDir(p.dx, p.dy); return; }
  }
  // Otherwise carry straight on.
  if (canCut(marker.col, marker.row, dir.dx, dir.dy)) return;
  // Forward is blocked (arena edge or claimed interior): turn to any non-reverse
  // direction we can still cut along.
  for (const d of ALL_DIRS) {
    if (d.dx === rev.dx && d.dy === rev.dy) continue;
    if (canCut(marker.col, marker.row, d.dx, d.dy)) { setDir(d.dx, d.dy); return; }
  }
  setDir(rev.dx, rev.dy);
}

function finishCut() {
  applyClaim(trail);
  trail = [];
  mode = "riding";
}

// Called the instant the marker lands on a grid intersection.
function onArrive() {
  if (mode === "cutting") {
    trail.push({ col: marker.col, row: marker.row });
    if (nodeIsSafe(marker.col, marker.row)) {
      finishCut();      // claim, back to riding
      decideRiding();   // choose how to carry on
      return;
    }
    decideCutting();
    return;
  }
  decideRiding();
}

// Advance the marker by dt seconds. Moves node-by-node, carrying leftover
// distance across turns so speed is constant regardless of frame rate.
export function update(dt) {
  if (!dir) { decideRiding(); if (!dir) return; } // start on first input
  let remaining = MARKER.speed * dt;
  while (remaining > 0 && dir) {
    const tx = nodeX(marker.col + dir.dx);
    const ty = nodeY(marker.row + dir.dy);
    const distToNode = Math.hypot(tx - marker.x, ty - marker.y);
    if (remaining >= distToNode) {
      marker.x = tx;
      marker.y = ty;
      marker.col += dir.dx;
      marker.row += dir.dy;
      remaining -= distToNode;
      onArrive();
    } else {
      marker.x += dir.dx * remaining;
      marker.y += dir.dy * remaining;
      remaining = 0;
    }
  }
}
