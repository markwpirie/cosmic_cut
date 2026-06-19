// COSMIC CUT — sparx (perimeter-chasing enemies)
// Sparx travel along the auto-network (frontier + arena wall) and BFS-chase the
// player. Unlike blobs, they kill on the SAFE perimeter too — not just while
// cutting. Fast Sparx are faster and can latch onto an exposed cut trail,
// rocketing along it toward the player mid-cut.

import { SPARX, MARKER, COLS, ROWS, nodeX, nodeY } from "./config.js";
import { rideRank } from "./grid.js";
import { isFrozen, isShielded } from "./powerups.js";

export const sparxList = []; // all active Sparx

const ALL_DIRS = [
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
  { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
];

// Arena corners — classic spawn points.
const CORNERS = [
  { col: 0, row: 0 }, { col: COLS, row: 0 },
  { col: 0, row: ROWS }, { col: COLS, row: ROWS },
];

// --- Lifecycle ---

export function reset(normalCount = 0, fastCount = 0) {
  sparxList.length = 0;
  let ci = 0;
  const add = (fast) => {
    const { col, row } = CORNERS[ci % CORNERS.length];
    ci++;
    sparxList.push({
      col, row,
      x: nodeX(col), y: nodeY(row),
      speed: fast ? SPARX.fastSpeed : SPARX.speed,
      fast,
      color: fast ? SPARX.fastColor : SPARX.normalColor,
      dir: null,          // current movement direction {dx,dy}
      nextCol: col, nextRow: row,
      t: 0,               // time for animation
      // Fast-Sparx trail latch
      latched: false,
      latchIdx: 0,
      // Recent positions for the visual tail
      tail: [],
    });
  };
  for (let i = 0; i < normalCount; i++) add(false);
  for (let i = 0; i < fastCount; i++) add(true);
}

// --- BFS shortest path on the auto-network ---
// Returns the first {dx,dy} to take from (startCol,startRow) toward (goalCol,goalRow).
// For Fast Sparx (canLatch=true), trail edges are also valid traversal.
function bfsNextDir(startCol, startRow, goalCol, goalRow, trail, canLatch) {
  if (startCol === goalCol && startRow === goalRow) return null;

  const key = (c, r) => c * 1000 + r;
  const visited = new Set();
  visited.add(key(startCol, startRow));

  // Queue entries: [col, row, firstDir] where firstDir is the step taken from start.
  const queue = [];

  for (const d of ALL_DIRS) {
    const nc = startCol + d.dx, nr = startRow + d.dy;
    if (!edgeValid(startCol, startRow, d.dx, d.dy, trail, canLatch)) continue;
    const k = key(nc, nr);
    if (visited.has(k)) continue;
    visited.add(k);
    if (nc === goalCol && nr === goalRow) return d;
    queue.push([nc, nr, d]);
  }

  let head = 0;
  while (head < queue.length) {
    const [col, row, firstDir] = queue[head++];
    for (const d of ALL_DIRS) {
      const nc = col + d.dx, nr = row + d.dy;
      if (!edgeValid(col, row, d.dx, d.dy, trail, canLatch)) continue;
      const k = key(nc, nr);
      if (visited.has(k)) continue;
      visited.add(k);
      if (nc === goalCol && nr === goalRow) return firstDir;
      queue.push([nc, nr, firstDir]);
    }
  }
  return null;
}

// Is the edge from (col,row) in direction (dx,dy) traversable by a Sparx?
function edgeValid(col, row, dx, dy, trail, canLatch) {
  const rank = rideRank(col, row, dx, dy);
  if (rank <= 1) return true;
  if (!canLatch || !trail.length) return false;
  // Trail edge: consecutive nodes in the trail array.
  const nc = col + dx, nr = row + dy;
  for (let i = 0; i < trail.length - 1; i++) {
    if (trail[i].col === col && trail[i].row === row &&
        trail[i + 1].col === nc && trail[i + 1].row === nr) return true;
    // Also reverse — so Sparx can approach the trail from either end.
    if (trail[i].col === nc && trail[i].row === nr &&
        trail[i + 1].col === col && trail[i + 1].row === row) return true;
  }
  return false;
}

// --- Per-frame update ---

export function update(dt, marker, trail) {
  if (isFrozen()) return;
  for (const s of sparxList) {
    s.t += dt;
    if (s.latched) {
      updateLatched(s, dt, marker, trail);
    } else {
      updatePerimeter(s, dt, marker, trail);
    }
    // Store recent positions for the visual trail (sampled every ~40ms).
    if (s.tail.length === 0 || Math.hypot(s.x - s.tail[0].x, s.y - s.tail[0].y) > 3) {
      s.tail.unshift({ x: s.x, y: s.y });
      if (s.tail.length > SPARX.trailLen) s.tail.length = SPARX.trailLen;
    }
  }
}

// Move a Sparx along the perimeter toward the player.
function updatePerimeter(s, dt, marker, trail) {
  let remaining = s.speed * dt;

  while (remaining > 0) {
    const tx = nodeX(s.nextCol);
    const ty = nodeY(s.nextRow);
    const dist = Math.hypot(tx - s.x, ty - s.y);

    if (dist <= remaining) {
      // Arrived at next node.
      s.x = tx; s.y = ty;
      s.col = s.nextCol; s.row = s.nextRow;
      remaining -= dist;

      // Check latch: Fast Sparx can enter the trail at any trail node.
      if (s.fast && trail.length > 1) {
        for (let i = 0; i < trail.length; i++) {
          if (trail[i].col === s.col && trail[i].row === s.row) {
            s.latched = true;
            s.latchIdx = i;
            remaining = 0;
            break;
          }
        }
        if (s.latched) break;
      }

      // BFS to choose the next node.
      const nextDir = bfsNextDir(s.col, s.row, marker.col, marker.row, trail, s.fast);
      if (nextDir) {
        s.dir = nextDir;
        s.nextCol = s.col + nextDir.dx;
        s.nextRow = s.row + nextDir.dy;
      } else {
        // No path found — stay put (rare, e.g. completely enclosed corner).
        s.nextCol = s.col; s.nextRow = s.row;
        remaining = 0;
      }
    } else {
      // Glide toward the next node.
      const dx = tx - s.x, dy = ty - s.y;
      const len = Math.hypot(dx, dy);
      s.x += (dx / len) * remaining;
      s.y += (dy / len) * remaining;
      remaining = 0;
    }
  }
}

// Move a latched Fast Sparx along the cut trail toward the player.
function updateLatched(s, dt, marker, trail) {
  // If trail has been cleared (cut closed or player died), eject back to perimeter.
  if (!trail.length) {
    s.latched = false;
    // Snap to nearest safe node to continue BFS normally.
    snapToNearestNode(s);
    return;
  }
  // Clamp latch index in case trail shrank.
  if (s.latchIdx >= trail.length) s.latchIdx = trail.length - 1;

  let remaining = SPARX.latchSpeed * dt;

  while (remaining > 0) {
    const targetIdx = Math.min(s.latchIdx + 1, trail.length - 1);
    const target = trail[targetIdx];
    const tx = nodeX(target.col);
    const ty = nodeY(target.row);
    const dist = Math.hypot(tx - s.x, ty - s.y);

    if (dist <= remaining) {
      s.x = tx; s.y = ty;
      s.col = target.col; s.row = target.row;
      remaining -= dist;

      if (targetIdx === s.latchIdx) {
        // Reached the end of the trail (player's last node) — stop.
        remaining = 0;
      } else {
        s.latchIdx = targetIdx;
        // If we've consumed the whole trail, we're at the player.
        if (s.latchIdx >= trail.length - 1) remaining = 0;
      }
    } else {
      const dx = tx - s.x, dy = ty - s.y;
      const len = Math.hypot(dx, dy);
      if (len > 0) { s.x += (dx / len) * remaining; s.y += (dy / len) * remaining; }
      remaining = 0;
    }
  }

  // If trail disappears mid-frame, unlatch.
  if (!trail.length) { s.latched = false; snapToNearestNode(s); }
}

// After ejecting from a trail, snap the Sparx to the nearest valid perimeter node
// so it can resume BFS normally.
function snapToNearestNode(s) {
  const candidates = [];
  const R = 5; // search radius in cells
  const cc = Math.round((s.x - nodeX(0)) / (nodeX(1) - nodeX(0)));
  const cr = Math.round((s.y - nodeY(0)) / (nodeY(1) - nodeY(0)));
  for (let dr = -R; dr <= R; dr++) {
    for (let dc = -R; dc <= R; dc++) {
      const c = cc + dc, r = cr + dr;
      if (c < 0 || c > COLS || r < 0 || r > ROWS) continue;
      // Check that at least one perimeter edge exists here.
      const onPerimeter = ALL_DIRS.some(d => rideRank(c, r, d.dx, d.dy) <= 1);
      if (onPerimeter) candidates.push({ c, r, d2: dr * dr + dc * dc });
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => a.d2 - b.d2);
    const best = candidates[0];
    s.col = best.c; s.row = best.r;
    s.x = nodeX(best.c); s.y = nodeY(best.r);
    s.nextCol = best.c; s.nextRow = best.r;
  }
}

// --- Collision ---
// Sparx kill on BOTH perimeter (mode === "riding") AND while cutting.
export function collides(marker) {
  if (isShielded()) return null;
  for (const s of sparxList) {
    if (Math.hypot(s.x - marker.x, s.y - marker.y) < SPARX.radius + MARKER.radius) return s;
  }
  return null;
}

// Expose Sparx positions so the claim system can note them (Sparx are never
// killed by claims, but their cells help avoid a bad flood-fill edge case).
export function cells() {
  return sparxList.map(s => ({
    col: Math.max(0, Math.min(COLS - 1, s.col)),
    row: Math.max(0, Math.min(ROWS - 1, s.row)),
  }));
}
