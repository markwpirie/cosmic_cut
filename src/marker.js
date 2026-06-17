// COSMIC CUT — marker (the player)
// The marker's state and movement: riding the perimeter, starting and steering
// cuts, and the per-frame update. The "how it moves" rules of §16 live here.
// No DOM — depends only on config, grid (the world), and control (intents), so
// it's drivable headlessly in tests.

import { MARKER, nodeX, nodeY } from "./config.js";
import { classifyEdge, rideTypeOf, rideRank, canCut, nodeIsSafe, applyClaim } from "./grid.js";
import { peekPending, clearPending, currentDesired } from "./control.js";
import { cells as blobCells, removeBlobs } from "./enemy.js";

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
export let lastCutLength = 0; // node count of the just-finished cut (for LONG scoring)

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
  const rev = { dx: -dir.dx, dy: -dir.dy };

  // 3. On a SEAM, just flow along it — never auto-divert onto the frontier (the
  //    player steers on and off seams deliberately). Carry straight while we can.
  if (rideType === "seam") {
    const sr = rideRank(marker.col, marker.row, dir.dx, dir.dy);
    if (sr !== Infinity) { rideType = sr === 2 ? "seam" : "auto"; return; }
    // seam ran out — fall through and turn onto whatever's rideable.
  }

  // 4. On the AUTO network, at EVERY node pick the most-preferred non-reverse
  //    exit: the bright frontier (rank 0) beats a buried arena wall (rank 1)
  //    even when the wall runs straight ahead — so the marker hugs the bold line
  //    and never glides along the outer wall when a frontier is there to take.
  //    Tie-break within a rank: keep straight, then momentum, then a coin-flip.
  //    Seams (rank 2) are never auto-taken while on the auto network.
  const onSeam = rideType === "seam";
  const cands = [];
  let best = Infinity;
  for (const d of ALL_DIRS) {
    if (d.dx === rev.dx && d.dy === rev.dy) continue;
    const rank = rideRank(marker.col, marker.row, d.dx, d.dy);
    if (rank === Infinity) continue;
    if (!onSeam && rank === 2) continue; // auto network ignores seams
    if (rank < best) { best = rank; cands.length = 0; cands.push(d); }
    else if (rank === best) cands.push(d);
  }
  if (cands.length) {
    let pick = cands.find((d) => d.dx === dir.dx && d.dy === dir.dy);          // keep straight
    if (!pick && prevDir) pick = cands.find((d) => d.dx === prevDir.dx && d.dy === prevDir.dy); // momentum
    if (!pick) pick = cands[Math.floor(Math.random() * cands.length)];        // coin-flip
    setDir(pick.dx, pick.dy);
    rideType = rideRank(marker.col, marker.row, pick.dx, pick.dy) === 2 ? "seam" : "auto";
    return;
  }
  // Only the way we came is rideable — ride back (never stop).
  const rr = rideRank(marker.col, marker.row, rev.dx, rev.dy);
  if (rr !== Infinity) { setDir(rev.dx, rev.dy); rideType = rr === 2 ? "seam" : "auto"; return; }
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
  // Keep the survivors' region open, claim the rest; blobs trapped on a claimed
  // (smaller) side die — the SPLIT.
  lastCutLength = trail.length;
  const killed = applyClaim(trail, blobCells());
  if (killed.length) removeBlobs(killed);
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
