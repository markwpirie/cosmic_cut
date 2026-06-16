// COSMIC CUT — marker (the player)
// The marker's state and movement: riding the perimeter, starting and steering
// cuts, and the per-frame update. The "how it moves" rules of §16 live here.
// No DOM — depends only on config, grid (the world), and control (intents), so
// it's drivable headlessly in tests.

import { MARKER, nodeX, nodeY } from "./config.js";
import { classifyEdge, rideTypeOf, rideRank, canCut, nodeIsSafe, applyClaim } from "./grid.js";
import { peekPending, clearPending, currentDesired } from "./control.js";
import { cell as blobCell } from "./enemy.js";

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
  // 3. Keep going straight if the line carries on. On the AUTO network we only
  //    continue along auto edges (frontier rank 0 or buried wall rank 1), so we
  //    follow the perimeter round corners rather than drifting onto a seam;
  //    riding a SEAM we continue along whatever rideable edge lies ahead.
  const rev = { dx: -dir.dx, dy: -dir.dy };
  const straightRank = rideRank(marker.col, marker.row, dir.dx, dir.dy);
  const straightOk =
    rideType === "auto" ? straightRank === 0 || straightRank === 1 : straightRank !== Infinity;
  if (straightOk) {
    rideType = straightRank === 2 ? "seam" : "auto";
    return;
  }
  // 4. Forced turn (corner or T-junction). Gather non-reverse rideable exits and
  //    keep only the most-preferred rank: the bright frontier (0) beats a buried
  //    arena wall (1), so a turning perimeter never doubles back onto the wall.
  //    Among equal-rank exits, carry momentum through the junction, else random.
  //    (On a seam every rideable exit ranks equally — we just flow along it.)
  const cands = [];
  let best = Infinity;
  for (const d of ALL_DIRS) {
    if (d.dx === rev.dx && d.dy === rev.dy) continue;
    let rank = rideRank(marker.col, marker.row, d.dx, d.dy);
    if (rank === Infinity) continue;
    if (rideType === "auto" && rank === 2) continue; // auto network ignores seams
    if (rideType === "seam") rank = 0;               // on a seam, exits are equal
    if (rank < best) { best = rank; cands.length = 0; cands.push(d); }
    else if (rank === best) cands.push(d);
  }
  if (cands.length) {
    let pick = prevDir
      ? cands.find((d) => d.dx === prevDir.dx && d.dy === prevDir.dy)
      : null;
    if (!pick) pick = cands[Math.floor(Math.random() * cands.length)];
    setDir(pick.dx, pick.dy);
    rideType = rideRank(marker.col, marker.row, pick.dx, pick.dy) === 2 ? "seam" : "auto";
    return;
  }
  // Only the way we came is rideable — ride back (never stop).
  if (rideRank(marker.col, marker.row, rev.dx, rev.dy) !== Infinity) {
    setDir(rev.dx, rev.dy);
    rideType = rideRank(marker.col, marker.row, rev.dx, rev.dy) === 2 ? "seam" : "auto";
    return;
  }
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
  applyClaim(trail, blobCell()); // keep the blob's region open; claim the rest
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
