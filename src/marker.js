// COSMIC CUT — marker (the player)
// The marker's state and movement: riding the perimeter, starting and steering
// cuts, and the per-frame update. The "how it moves" rules of §16 live here.
// No DOM — depends only on config, grid (the world), and control (intents), so
// it's drivable headlessly in tests.

import { MARKER, POWERUPS, nodeX, nodeY } from "./config.js";
import { boostMult } from "./powerups.js";
import { classifyEdge, rideTypeOf, rideRank, canCut, nodeIsSafe, applyClaim } from "./grid.js";
import { peekPending, clearPending, currentDesired, slowHeld } from "./control.js";
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
export let slowActive = false; // a valid slow draw is in force right now (drives the visual)
export let lastCutSlow = false; // was the just-finished cut a SLOW DRAW? (for scoring)
export let zoomDash = false;  // a ZOOM dash is driving this cut (2× speed, invulnerable, kills on contact)
export let selfHit = false;   // the cut just crossed its own trail this frame → death (main.js reads it)
let cutClock = 0;             // seconds since this cut began
let slowArmed = false;       // committed to a slow draw (SPACE held early enough)
let slowBroken = false;      // SPACE released after arming → can't be a slow draw any more
let zoomDir = null;          // locked heading of the active ZOOM dash
let trailSet = new Set();    // "col,row" keys of every trail node, for O(1) self-cross checks
const key = (c, r) => c + "," + r;

// Place the marker at a lattice node and clear its motion/cut state.
export function home(col, row) {
  marker.col = col;
  marker.row = row;
  marker.x = nodeX(col);
  marker.y = nodeY(row);
  dir = null;
  prevDir = null;
  mode = "riding";
  rideType = "auto";
  trail = [];
  trailSet.clear();
  zoomDash = false;
  zoomDir = null;
  selfHit = false;
}

// Snap to the current lattice node WITHOUT resetting cut state — used when a ZOOM
// is collected so a dash can begin cleanly from a node (home() would forfeit the
// in-progress cut, which we want to keep and finish via the dash).
export function snapToNode() {
  marker.x = nodeX(marker.col);
  marker.y = nodeY(marker.row);
}

// Reset to the start position (level start / restart): bottom-centre.
export function reset() {
  home(MARKER.startCol, MARKER.startRow);
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
  trailSet = new Set([key(marker.col, marker.row)]);
  cutClock = 0;
  slowArmed = slowHeld(); // holding SPACE as you leave the boundary arms it immediately
  slowBroken = false;
  slowActive = slowArmed;
  setDir(dx, dy);
}

// Begin (or convert into) a ZOOM dash heading (dx,dy): a forced straight cut at
// 2× speed that the player can't steer, is invulnerable during, and kills any
// enemy it flies through (handled in main.js). Returns false if the heading can't
// start/continue a cut from here (e.g. pressing along the wall while riding), so
// the caller can keep aiming. Snap to a node first (snapToNode) before calling.
export function startZoomDash(dx, dy) {
  if (mode === "riding") {
    if (classifyEdge(marker.col, marker.row, dx, dy) !== "OPEN") return false; // must enter open space
    startCut(dx, dy);
  } else { // already cutting: keep the trail, just commit to the dash heading
    if (dir && dx === -dir.dx && dy === -dir.dy) return false; // no dashing back into our own line
    if (!canCut(marker.col, marker.row, dx, dy)) return false;
    setDir(dx, dy);
  }
  // A dash is never a slow draw, whatever SPACE is doing.
  slowArmed = false; slowBroken = true; slowActive = false;
  zoomDash = true;
  zoomDir = { dx, dy };
  return true;
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
  // ZOOM dash: ignore player steering and bore straight ahead while we can. When
  // the dash heading is finally blocked (a wall / claimed interior) we fall through
  // to the normal logic so the cut can still turn and close cleanly.
  if (zoomDash && canCut(marker.col, marker.row, zoomDir.dx, zoomDir.dy)) {
    setDir(zoomDir.dx, zoomDir.dy);
    return;
  }
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
  lastCutSlow = slowArmed && !slowBroken; // armed early AND held continuously to the end
  const killed = applyClaim(trail, blobCells(), lastCutSlow);
  if (killed.length) removeBlobs(killed);
  trail = [];
  trailSet.clear();
  mode = "riding";
  zoomDash = false; // the dash ends when its cut closes
  zoomDir = null;
}

// Called the instant the marker lands on a grid intersection.
function onArrive() {
  if (mode === "cutting") {
    // Self-cross: we stepped onto a node already in our own trail. On the 4-connected
    // lattice the line can only ever touch itself at a shared node, so this is the
    // exact test for "rode over your own cut" — fatal (and it's what used to let you
    // wall off un-claimable islands). main.js reads selfHit and kills the player.
    if (trailSet.has(key(marker.col, marker.row))) { selfHit = true; return; }
    trail.push({ col: marker.col, row: marker.row });
    trailSet.add(key(marker.col, marker.row));
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
  // Slow draw: a deliberate, committed crawl. You arm it by holding SPACE as you
  // leave the boundary or within slowArmWindow of the cut starting; after that the
  // key does nothing. Once armed it must stay held for the whole line — releasing
  // breaks it for good (you can't re-arm mid-cut). A valid slow draw crawls at
  // slowCutMult and tags the claim as darker glass worth double.
  if (mode === "cutting") {
    cutClock += dt;
    if (!slowBroken) {
      if (slowHeld()) {
        if (cutClock <= MARKER.slowArmWindow) slowArmed = true; // arm only in the window
      } else if (slowArmed) {
        slowBroken = true; // released after arming → no longer a slow draw
      }
    }
    slowActive = slowArmed && !slowBroken && slowHeld();
  } else {
    slowActive = false;
  }
  const speedMult = boostMult()
    * (zoomDash ? POWERUPS.ZOOM.dashSpeedMult : (slowActive ? MARKER.slowCutMult : 1));
  let remaining = MARKER.speed * speedMult * dt;
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
      if (selfHit) return; // crossed our own line — stop here, main.js handles death
    } else {
      marker.x += dir.dx * remaining;
      marker.y += dir.dy * remaining;
      remaining = 0;
    }
  }
}
