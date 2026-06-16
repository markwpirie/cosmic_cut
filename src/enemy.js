// COSMIC CUT — enemy (the Blob)
// One free-floating orb that drifts through the OPEN space and bounces off the
// arena wall and any claimed territory. No targeting, no AI — a pure bouncer
// (the Hunter that chases you is a later level). Touching the marker or the
// in-progress cut trail is death; main.js owns that consequence. No DOM, so the
// bounce and collision are unit-testable in Node.

import { field, CELL, COLS, ROWS, BLOB, MARKER, nodeX, nodeY } from "./config.js";
import { cellSolid } from "./grid.js";

export const blob = {
  x: field.x + field.w / 2,
  y: field.y + field.h / 2,
  vx: 0,
  vy: 0,
  t: 0, // pulse clock (seconds)
};

// Launch on a fixed diagonal (up-right). Constant speed; only the sign of each
// component ever changes, when it bounces.
function launch() {
  const k = Math.SQRT1_2; // 1/√2 — equal x/y so |v| === BLOB.speed
  blob.vx = BLOB.speed * k;
  blob.vy = -BLOB.speed * k;
}

// A safe spawn: an OPEN cell, never inside claimed territory (or the blob would
// be stuck). Prefer the field centre; otherwise the open cell farthest from the
// player's start, so we don't drop on top of them after a death-respawn.
function spawnPoint() {
  const cc = Math.floor(COLS / 2);
  const cr = Math.floor(ROWS / 2);
  if (!cellSolid(cr, cc)) {
    return { x: field.x + (cc + 0.5) * CELL, y: field.y + (cr + 0.5) * CELL };
  }
  let bestD = -1;
  let bx = field.x + field.w / 2;
  let by = field.y + field.h / 2;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (cellSolid(r, c)) continue;
      const dr = r - MARKER.startRow;
      const dc = c - MARKER.startCol;
      const d = dr * dr + dc * dc;
      if (d > bestD) {
        bestD = d;
        bx = field.x + (c + 0.5) * CELL;
        by = field.y + (r + 0.5) * CELL;
      }
    }
  }
  return { x: bx, y: by };
}

export function reset() {
  const p = spawnPoint();
  blob.x = p.x;
  blob.y = p.y;
  blob.t = 0;
  launch();
}
reset();

// The pulsing on-screen radius. Collision uses the steady BLOB.radius (fairer);
// the pulse is purely visual.
export function radius() {
  return BLOB.radius + Math.sin(blob.t * 4) * BLOB.pulse;
}

// The grid cell the blob currently sits in — the region the claim must keep
// open (you can't claim the side the enemy is on, §13).
export function cell() {
  return {
    col: Math.floor((blob.x - field.x) / CELL),
    row: Math.floor((blob.y - field.y) / CELL),
  };
}

// Is the pixel point inside a solid cell? Off-field maps to off-grid cells,
// which cellSolid() already treats as the arena wall.
function solidAt(px, py) {
  const c = Math.floor((px - field.x) / CELL);
  const r = Math.floor((py - field.y) / CELL);
  return cellSolid(r, c);
}

// Advance the blob, reflecting off solids. X and Y are tested separately (with
// the radius as a margin) so corners and walls both bounce cleanly.
export function update(dt) {
  blob.t += dt;
  const r = BLOB.radius;

  let nx = blob.x + blob.vx * dt;
  if (solidAt(nx + Math.sign(blob.vx) * r, blob.y)) {
    blob.vx = -blob.vx; // reflect; stay put this axis so we never sink into the wall
  } else {
    blob.x = nx;
  }

  let ny = blob.y + blob.vy * dt;
  if (solidAt(blob.x, ny + Math.sign(blob.vy) * r)) {
    blob.vy = -blob.vy;
  } else {
    blob.y = ny;
  }
}

// Distance from point (px,py) to the segment (ax,ay)-(bx,by).
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Does the blob touch the marker, or (while cutting) the exposed cut trail?
export function collides(marker, mode, trail) {
  if (Math.hypot(blob.x - marker.x, blob.y - marker.y) < BLOB.radius + MARKER.radius) {
    return true;
  }
  if (mode === "cutting" && trail.length) {
    const thr = BLOB.radius + 2;
    for (let i = 0; i < trail.length - 1; i++) {
      const a = trail[i];
      const b = trail[i + 1];
      if (distToSeg(blob.x, blob.y, nodeX(a.col), nodeY(a.row), nodeX(b.col), nodeY(b.row)) < thr) return true;
    }
    // The live segment from the last laid node to the marker's current position.
    const last = trail[trail.length - 1];
    if (distToSeg(blob.x, blob.y, nodeX(last.col), nodeY(last.row), marker.x, marker.y) < thr) return true;
  }
  return false;
}
