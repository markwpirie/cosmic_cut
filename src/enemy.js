// COSMIC CUT — enemy (the Blobs)
// One or more free-floating orbs bouncing through OPEN space, reflecting off the
// arena wall and claimed territory. Each Blob has its own size/speed/colour from
// config.BLOB_TYPES (blue big/slow → red small/fast). No targeting yet — pure
// bouncers. Touching the marker or the in-progress cut is death (main.js owns
// the consequence). No DOM, so bounce + collision are unit-testable in Node.

import { field, CELL, COLS, ROWS, BLOB, BLOB_TYPES, MARKER, nodeX, nodeY } from "./config.js";
import { cellSolid } from "./grid.js";

// Live list of active blobs. Each: {x,y,vx,vy,t,radius,speed,color}.
export const blobs = [];

const MIN_PLAYER = 18; // cells a spawn must be from the player's start
const MIN_OTHER = 14;  // cells a spawn must be from other blobs

// Launch a blob on a RANDOM 45° diagonal (random quadrant) at its own speed.
// Axis-aligned components keep the bounce clean; only their signs change later.
function launch(b) {
  const k = Math.SQRT1_2;
  b.vx = b.speed * k * (Math.random() < 0.5 ? -1 : 1);
  b.vy = b.speed * k * (Math.random() < 0.5 ? -1 : 1);
}

// Every currently-open cell.
function openCells() {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!cellSolid(r, c)) out.push([r, c]);
  return out;
}

// Pick n open spawn cells at RANDOM, kept away from the player's start (so a
// death-respawn never drops onto them) and spread apart. Never inside claimed
// area. Relaxes the spacing rules if a tight board can't satisfy them.
function spawnCells(n) {
  const open = openCells();
  for (let i = open.length - 1; i > 0; i--) { // shuffle
    const j = Math.floor(Math.random() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  const chosen = [];
  const tryFill = (minPlayer2, minOther2) => {
    for (const [r, c] of open) {
      if (chosen.length >= n) break;
      if ((r - MARKER.startRow) ** 2 + (c - MARKER.startCol) ** 2 < minPlayer2) continue;
      if (chosen.some(([cr, cc]) => (r - cr) ** 2 + (c - cc) ** 2 < minOther2)) continue;
      if (!chosen.some(([cr, cc]) => cr === r && cc === c)) chosen.push([r, c]);
    }
  };
  tryFill(MIN_PLAYER ** 2, MIN_OTHER ** 2);
  if (chosen.length < n) tryFill(0, 0); // relax: just need open + distinct
  while (chosen.length < n) chosen.push([Math.floor(ROWS / 2), Math.floor(COLS / 2)]);
  return chosen;
}

// (Re)spawn the blobs for a level. typeIndices is a list of BLOB_TYPES indices.
export function reset(typeIndices = [0]) {
  blobs.length = 0;
  const cells = spawnCells(typeIndices.length);
  typeIndices.forEach((ti, i) => {
    const type = BLOB_TYPES[ti] || BLOB_TYPES[0];
    const [r, c] = cells[i];
    const b = {
      x: field.x + (c + 0.5) * CELL,
      y: field.y + (r + 0.5) * CELL,
      vx: 0, vy: 0, t: 0,
      radius: type.radius, speed: type.speed, color: type.color,
    };
    launch(b);
    blobs.push(b);
  });
}
reset();

// Pulsing on-screen radius (visual only; collision uses the steady b.radius).
export function radius(b) {
  return b.radius + Math.sin(b.t * 4) * BLOB.pulse;
}

// Pixel point inside a solid cell? Off-field maps to off-grid cells, which
// cellSolid() already treats as the arena wall.
function solidAt(px, py) {
  return cellSolid(Math.floor((py - field.y) / CELL), Math.floor((px - field.x) / CELL));
}

// Advance every blob, reflecting off solids (X/Y tested separately, the blob's
// own radius as the margin, so corners and walls both bounce cleanly).
export function update(dt) {
  for (const b of blobs) {
    b.t += dt;
    const r = b.radius;
    const nx = b.x + b.vx * dt;
    if (solidAt(nx + Math.sign(b.vx) * r, b.y)) b.vx = -b.vx;
    else b.x = nx;
    const ny = b.y + b.vy * dt;
    if (solidAt(b.x, ny + Math.sign(b.vy) * r)) b.vy = -b.vy;
    else b.y = ny;
  }
}

// Remove blobs by index (those caught on the claimed side of a SPLIT). Indices
// refer to the current blobs order (the same order cells() reports).
export function removeBlobs(indices) {
  const kill = new Set(indices);
  for (let i = blobs.length - 1; i >= 0; i--) if (kill.has(i)) blobs.splice(i, 1);
}

// The grid cell each blob sits in — the regions the claim must keep open (you
// can't claim a side an enemy is on, §13).
export function cells() {
  return blobs.map((b) => ({
    col: Math.floor((b.x - field.x) / CELL),
    row: Math.floor((b.y - field.y) / CELL),
  }));
}

// Distance from point (px,py) to segment (ax,ay)-(bx,by).
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Gap (px) between one blob's surface and the exposed trail (incl. the live
// segment to the marker). Negative ≈ touching.
function blobGap(b, marker, trail) {
  let d = Math.hypot(b.x - marker.x, b.y - marker.y) - b.radius;
  for (let i = 0; i < trail.length - 1; i++) {
    const a = trail[i];
    const c = trail[i + 1];
    d = Math.min(d, distToSeg(b.x, b.y, nodeX(a.col), nodeY(a.row), nodeX(c.col), nodeY(c.row)) - b.radius);
  }
  if (trail.length) {
    const last = trail[trail.length - 1];
    d = Math.min(d, distToSeg(b.x, b.y, nodeX(last.col), nodeY(last.row), marker.x, marker.y) - b.radius);
  }
  return d;
}

// Smallest gap between any blob and the trail while cutting (Infinity if not) —
// drives the danger glow + music intensity.
export function threatGap(marker, mode, trail) {
  if (mode !== "cutting") return Infinity;
  let min = Infinity;
  for (const b of blobs) min = Math.min(min, blobGap(b, marker, trail));
  return min;
}

// Count blobs that just GRAZED the trail (entered the near band without hitting),
// debounced per blob so one fly-by scores once. Clears when not cutting.
export function pollNearMiss(marker, mode, trail, band = 14) {
  if (mode !== "cutting") { for (const b of blobs) b.near = false; return 0; }
  let n = 0;
  for (const b of blobs) {
    const gap = blobGap(b, marker, trail);
    if (gap < band && gap > 2) {
      if (!b.near) { n++; b.near = true; }
    } else if (gap > band + 8) {
      b.near = false;
    }
  }
  return n;
}

// You're only vulnerable while CUTTING out in open space — riding the perimeter
// (or a claimed edge) is safe, even if a blob brushes the marker there. While
// cutting, a blob touching the marker OR the exposed trail is fatal. Returns the
// offending blob (so the caller can flash it), or null.
export function collides(marker, mode, trail) {
  if (mode !== "cutting") return null; // safe on the perimeter
  for (const b of blobs) {
    if (Math.hypot(b.x - marker.x, b.y - marker.y) < b.radius + MARKER.radius) return b;
    if (trail.length) {
      const thr = b.radius + 2;
      for (let i = 0; i < trail.length - 1; i++) {
        const a = trail[i];
        const c = trail[i + 1];
        if (distToSeg(b.x, b.y, nodeX(a.col), nodeY(a.row), nodeX(c.col), nodeY(c.row)) < thr) return b;
      }
      const last = trail[trail.length - 1];
      if (distToSeg(b.x, b.y, nodeX(last.col), nodeY(last.row), marker.x, marker.y) < thr) return b;
    }
  }
  return null;
}
