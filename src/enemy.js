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

const DIAGS = [
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
];

// Launch a blob on a diagonal at its own speed. Only the sign of each component
// ever changes after this (on a bounce), so |v| stays constant.
function launch(b, i) {
  const [ux, uy] = DIAGS[i % DIAGS.length];
  b.vx = b.speed * ux;
  b.vy = b.speed * uy;
}

// Every currently-open cell.
function openCells() {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!cellSolid(r, c)) out.push([r, c]);
  return out;
}

// Pick n open spawn cells: far from the player's start (so a death-respawn never
// drops onto them) and spread apart from each other. Never inside claimed area.
function spawnCells(n) {
  const open = openCells();
  const chosen = [];
  for (let i = 0; i < n; i++) {
    let best = null;
    let bestScore = -1;
    for (const [r, c] of open) {
      const dr = r - MARKER.startRow;
      const dc = c - MARKER.startCol;
      let score = dr * dr + dc * dc; // distance² from the player
      for (const ch of chosen) {
        const d = (r - ch[0]) ** 2 + (c - ch[1]) ** 2;
        if (d * 3 < score) score = d * 3; // keep clear of already-placed blobs
      }
      if (score > bestScore) { bestScore = score; best = [r, c]; }
    }
    chosen.push(best || [Math.floor(ROWS / 2), Math.floor(COLS / 2)]);
  }
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
    launch(b, i);
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

// Does any blob touch the marker, or (while cutting) the exposed cut trail?
export function collides(marker, mode, trail) {
  for (const b of blobs) {
    if (Math.hypot(b.x - marker.x, b.y - marker.y) < b.radius + MARKER.radius) return true;
    if (mode === "cutting" && trail.length) {
      const thr = b.radius + 2;
      for (let i = 0; i < trail.length - 1; i++) {
        const a = trail[i];
        const c = trail[i + 1];
        if (distToSeg(b.x, b.y, nodeX(a.col), nodeY(a.row), nodeX(c.col), nodeY(c.row)) < thr) return true;
      }
      const last = trail[trail.length - 1];
      if (distToSeg(b.x, b.y, nodeX(last.col), nodeY(last.row), marker.x, marker.y) < thr) return true;
    }
  }
  return false;
}
