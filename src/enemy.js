// COSMIC CUT — enemy (Qix + Blobs + Hunter Blobs)
// Two enemy shapes share this module:
//  • "sheaf" — the star Qix: two endpoints sweep inside a body box that normally
//    stays compact but occasionally SURGES huge; a history of past lines draws
//    the twisting ribbon of sticks. Collision tests the live stick LINE.
//  • "poly"  — the Blob: a ring of orbiting vertices with internal diagonals.
//    Collision uses a bounding radius. Hunter Blobs are polys that drift toward
//    the player.
// All bouncers reflect off the arena wall and claimed territory. Touching the
// marker or in-progress cut while cutting is death (main.js owns the consequence).

import { field, CELL, COLS, ROWS, QIX, BOSS, BLOB_POLY, BLOB_TYPES, SPECIAL_BLOBS, MARKER, RESPAWN, nodeX, nodeY } from "./config.js";
import { cellSolid } from "./grid.js";
import { isFrozen, isShielded, enemySlowMult } from "./powerups.js";

// Live list of active enemies. Each: { x, y, vx, vy, t, radius, speed, color,
// hunter, shape, ... shape-specific fields }.
export const blobs = [];

const MIN_PLAYER = 18;
const MIN_OTHER  = 14;

// --- Spawn helpers ---

function openCells() {
  const out = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (!cellSolid(r, c)) out.push([r, c]);
  return out;
}

function spawnCells(n) {
  const open = openCells();
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  const chosen = [];
  const tryFill = (mp2, mo2) => {
    for (const [r, c] of open) {
      if (chosen.length >= n) break;
      if ((r - MARKER.startRow) ** 2 + (c - MARKER.startCol) ** 2 < mp2) continue;
      if (chosen.some(([cr, cc]) => (r - cr) ** 2 + (c - cc) ** 2 < mo2)) continue;
      if (!chosen.some(([cr, cc]) => cr === r && cc === c)) chosen.push([r, c]);
    }
  };
  tryFill(MIN_PLAYER ** 2, MIN_OTHER ** 2);
  if (chosen.length < n) tryFill(0, 0);
  while (chosen.length < n) chosen.push([Math.floor(ROWS / 2), Math.floor(COLS / 2)]);
  return chosen;
}

function launch(b) {
  const k = Math.SQRT1_2;
  b.vx = b.speed * k * (Math.random() < 0.5 ? -1 : 1);
  b.vy = b.speed * k * (Math.random() < 0.5 ? -1 : 1);
}

// One sweeping endpoint for the sheaf: offset from centre, with its own velocity.
function makeEndpoint(span, speed) {
  const a = Math.random() * Math.PI * 2;
  return {
    x: (Math.random() * 2 - 1) * span,
    y: (Math.random() * 2 - 1) * span,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
  };
}

// Per-vertex animation params for a poly Blob.
function makeVerts() {
  const N = BLOB_POLY.segments;
  return Array.from({ length: N }, (_, i) => ({
    baseAngle:   (i / N) * Math.PI * 2,
    angularDrift: (Math.random() - 0.5) * 2 * BLOB_POLY.angularDrift,
    freqMult:    0.6 + Math.random() * 0.8,
    phase:       Math.random() * Math.PI * 2,
  }));
}

function makeEnemy(ti, r, c, shape, hunter, boss = false) {
  const type = BLOB_TYPES[ti] || BLOB_TYPES[0];
  // Poly Blobs get an extra size bump so their orbiting-vertex detail is legible.
  const polyScale = shape === "poly" ? BLOB_POLY.sizeScale : 1;
  const radius = type.radius * QIX.sizeScale * polyScale * (boss ? BOSS.sizeMult : 1);
  const b = {
    x: field.x + (c + 0.5) * CELL,
    y: field.y + (r + 0.5) * CELL,
    vx: 0, vy: 0, t: 0,
    radius,
    speed: type.speed,
    color: type.color,
    hunter,
    shape,
    ti,
    spawnT: 0, // >0 while freshly respawned: visible telegraph, harmless and still
  };
  if (shape === "sheaf") {
    b.boss = boss;
    // Per-enemy sheaf params (default to QIX; the boss scales them up). sheafSpan/
    // stepSheaf read these, so the boss is bigger/faster/longer without touching others.
    b.spanBase   = QIX.spanBase     * (boss ? BOSS.spanBaseMult : 1);
    b.spanMax    = QIX.spanMax      * (boss ? BOSS.spanMaxMult : 1);
    b.lines      = Math.round(QIX.lines * (boss ? BOSS.linesMult : 1));
    b.endptSpeed = QIX.endpointSpeed * (boss ? BOSS.endpointSpeedMult : 1);
    b.surgeHoldT = QIX.surgeHold    * (boss ? BOSS.surgeHoldMult : 1);
    b.surgeIntMin = QIX.surgeIntervalMin * (boss ? BOSS.surgeIntervalMult : 1);
    b.surgeIntMax = QIX.surgeIntervalMax * (boss ? BOSS.surgeIntervalMult : 1);
    b.e1 = makeEndpoint(b.spanBase, b.endptSpeed);
    b.e2 = makeEndpoint(b.spanBase, b.endptSpeed);
    b.hist = [];                                   // {ax,ay,bx,by}, newest first
    b.surge = 0;                                   // 0..1 expansion envelope
    b.surging = false;
    b.surgeHold = 0;
    b.surgeTimer = b.surgeIntMin + Math.random() * (b.surgeIntMax - b.surgeIntMin);
  } else {
    b.verts = makeVerts();
    b.bodyRot = Math.random() * Math.PI * 2;
  }
  launch(b);
  return b;
}

// A Special Blob (§8): a poly Blob whose look/size/speed comes from
// config.SPECIAL_BLOBS instead of BLOB_TYPES, tagged `special` so kills/claims
// treat it differently (reward-on-enclosure, excluded from the respawn floor,
// takes precedence for being FILLED in a SPLIT — see grid.applyClaim).
function makeSpecialEnemy(kind, r, c) {
  const cfg = SPECIAL_BLOBS[kind.toUpperCase()];
  const b = {
    x: field.x + (c + 0.5) * CELL,
    y: field.y + (r + 0.5) * CELL,
    vx: 0, vy: 0, t: 0,
    radius: cfg.radius * QIX.sizeScale * BLOB_POLY.sizeScale,
    speed: cfg.speed,
    color: cfg.color,
    hunter: false,
    shape: "poly",
    ti: -1,
    spawnT: 0,
    special: kind,
  };
  b.verts = makeVerts();
  b.bodyRot = Math.random() * Math.PI * 2;
  launch(b);
  return b;
}

// Live poly Blob/Hunter starting count for this level (the sheaf/Qix keeps its own
// separate "always ≥1 alive" rule, so the 50% floor below applies to poly only).
export let startCount = 0;
// Killed poly specs {ti, hunter}, oldest first — the floor-respawn manager
// (main.js) pops from here via respawnOne() once the live poly count drops
// below floor. Enemies stay dead otherwise (§6).
export const deadPool = [];

// Spawn/respawn all enemies for a level.
//   qix     — BLOB_TYPES indices for sheaf Qix
//   blobs   — BLOB_TYPES indices for polygon Blobs
//   hunters — BLOB_TYPES indices for polygon Hunter Blobs (drift toward player)
//   special — kinds ("life" | "slow") of Special Blobs to place (§8); excluded
//             from startCount/the respawn floor — they're one-shot bonus targets
export function reset({ qix = [], blobs: polyIdx = [], hunters = [], special = [], boss = false } = {}) {
  blobs.length = 0;
  deadPool.length = 0;
  const specs = [
    // On a boss level the FIRST Qix becomes the boss (big rainbow lightning sheaf).
    ...qix.map((ti, i) => ({ ti, shape: "sheaf", hunter: false, boss: boss && i === 0 })),
    ...polyIdx.map(ti => ({ ti, shape: "poly", hunter: false })),
    ...hunters.map(ti => ({ ti, shape: "poly", hunter: true })),
  ];
  startCount = polyIdx.length + hunters.length;
  const cells = spawnCells(specs.length + special.length);
  specs.forEach((s, i) => {
    const [r, c] = cells[i];
    blobs.push(makeEnemy(s.ti, r, c, s.shape, s.hunter, s.boss));
  });
  special.forEach((kind, i) => {
    const [r, c] = cells[specs.length + i];
    blobs.push(makeSpecialEnemy(kind, r, c));
  });
}
reset();

// Spawn a single extra sheaf Qix mid-level (used to repopulate the board when the
// last one is killed via a ZOOM dash or a SPLIT — there should always be a star
// enemy to carve around). Picks a fresh open cell away from the player and
// telegraphs briefly so it doesn't appear on top of anything.
export function addSheaf(ti = 0, boss = false) {
  const [r, c] = spawnCells(1)[0];
  const b = makeEnemy(ti, r, c, "sheaf", false, boss);
  b.spawnT = RESPAWN.telegraph;
  blobs.push(b);
}

// How many sheaf (Qix) enemies are currently alive.
export function countSheafs() {
  let n = 0;
  for (const b of blobs) if (b.shape === "sheaf") n++;
  return n;
}

// How many poly (Blob/Hunter) enemies are currently alive — what the 50% floor
// compares against startCount.
export function countPoly() {
  let n = 0;
  for (const b of blobs) if (b.shape === "poly") n++;
  return n;
}

// Pick a respawn cell near an arena edge, preferring one far from the player.
function edgeCell(markerCol, markerRow, minDist) {
  const open = openCells();
  const band = RESPAWN.edgeBand;
  const edgeCells = open.filter(([r, c]) => r < band || r >= ROWS - band || c < band || c >= COLS - band);
  const pool = edgeCells.length ? edgeCells : open;
  let best = null, bestD2 = -1;
  for (const [r, c] of pool) {
    const d2 = (r - markerRow) ** 2 + (c - markerCol) ** 2;
    if (d2 >= minDist * minDist && d2 > bestD2) { bestD2 = d2; best = [r, c]; }
  }
  if (!best) {
    for (const [r, c] of pool) {
      const d2 = (r - markerRow) ** 2 + (c - markerCol) ** 2;
      if (d2 > bestD2) { bestD2 = d2; best = [r, c]; }
    }
  }
  return best || [Math.floor(ROWS / 2), Math.floor(COLS / 2)];
}

// Respawn ONE dead poly Blob/Hunter (oldest kill first) at an arena edge, away
// from the player, with a brief telegraph. No-op if nothing is queued.
export function respawnOne(markerCol, markerRow) {
  if (!deadPool.length) return;
  const spec = deadPool.shift();
  const [r, c] = edgeCell(markerCol, markerRow, RESPAWN.minPlayerDist);
  const b = makeEnemy(spec.ti, r, c, "poly", spec.hunter, false);
  b.spawnT = RESPAWN.telegraph;
  blobs.push(b);
}

// --- Sheaf body ---

const smooth = (t) => t * t * (3 - 2 * t); // smoothstep ease

// Current half-size of the sheaf body box.
function sheafSpan(b) {
  const base = b.spanBase + (b.spanMax - b.spanBase) * smooth(b.surge);
  return base * (1 + QIX.twist * Math.sin(b.t * QIX.twistFreq));
}

// Arena bounds in pixels, and clamps that keep a point inside the play field.
const FX0 = field.x, FY0 = field.y, FX1 = field.x + field.w, FY1 = field.y + field.h;
const clampX = (v) => (v < FX0 ? FX0 : v > FX1 ? FX1 : v);
const clampY = (v) => (v < FY0 ? FY0 : v > FY1 ? FY1 : v);

// The live stick (current endpoints in absolute coords) — what collision tests.
// Endpoints are clamped to the arena so the sheaf never draws/collides outside it.
function liveSeg(b) {
  return {
    ax: clampX(b.x + b.e1.x), ay: clampY(b.y + b.e1.y),
    bx: clampX(b.x + b.e2.x), by: clampY(b.y + b.e2.y),
  };
}

// Advance the sheaf: tick the surge envelope, sweep endpoints, record a snapshot.
function stepSheaf(b, dt) {
  b.surgeTimer -= dt;
  if (b.surgeTimer <= 0 && !b.surging) {
    b.surging = true;
    b.surgeHold = b.surgeHoldT;
    b.surgeTimer = b.surgeIntMin + Math.random() * (b.surgeIntMax - b.surgeIntMin);
  }
  if (b.surging) {
    b.surgeHold -= dt;
    if (b.surgeHold <= 0) b.surging = false;
  }
  const target = b.surging ? 1 : 0;
  b.surge += (target - b.surge) * Math.min(1, dt * QIX.surgeEase);

  const span = sheafSpan(b);
  const spd  = b.endptSpeed * (1 + (QIX.surgeSpeedMult - 1) * b.surge);
  for (const e of [b.e1, b.e2]) {
    const vlen = Math.hypot(e.vx, e.vy) || 1; // keep speed at target magnitude
    e.vx = (e.vx / vlen) * spd;
    e.vy = (e.vy / vlen) * spd;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.x < -span) { e.x = -span; e.vx =  Math.abs(e.vx); }
    else if (e.x > span) { e.x = span; e.vx = -Math.abs(e.vx); }
    if (e.y < -span) { e.y = -span; e.vy =  Math.abs(e.vy); }
    else if (e.y > span) { e.y = span; e.vy = -Math.abs(e.vy); }
  }
  b.hist.unshift(liveSeg(b)); // clamped to the arena (see liveSeg)
  if (b.hist.length > b.lines) b.hist.length = b.lines;
}

// --- Accessors for render ---

export function qixLines(b) { return b.hist; } // sheaf sticks

export function polyVerts(b) {                 // poly vertex pixel positions
  return b.verts.map(vd => {
    const angle = b.bodyRot + vd.baseAngle + vd.angularDrift * b.t;
    const r = b.radius * (1 + BLOB_POLY.oscillateAmp * Math.sin(b.t * BLOB_POLY.oscillateFreq * vd.freqMult + vd.phase));
    return { x: b.x + Math.cos(angle) * r, y: b.y + Math.sin(angle) * r };
  });
}

// Bounding radius (poly wall-bounce margin + render reach) — the full visual extent.
export function boundRadius(b) {
  return b.radius * (1 + BLOB_POLY.oscillateAmp);
}

// Collision radius — tighter than the bounding radius (which is the max oscillation
// extent), so a Blob only kills near its actual body, not its outermost spikes.
export function hitRadius(b) {
  return b.radius * BLOB_POLY.hitScale;
}

// Wall-bounce margin: poly uses its full extent; the sheaf uses its current span,
// so its centre stays far enough from walls that the sticks remain inside the
// arena (liveSeg also clamps endpoints as a hard guarantee).
function bounceMargin(b) {
  return b.shape === "poly" ? boundRadius(b) : sheafSpan(b);
}

// --- Physics ---

function solidAt(px, py) {
  return cellSolid(Math.floor((py - field.y) / CELL), Math.floor((px - field.x) / CELL));
}

export function update(dt, markerX = 0, markerY = 0) {
  if (isFrozen()) return;
  dt *= enemySlowMult(); // Special Blob SLOW-DOWN effect (§8)
  for (const b of blobs) {
    if (b.spawnT > 0) { b.spawnT = Math.max(0, b.spawnT - dt); b.t += dt; continue; } // telegraphing: visible, held still
    b.t += dt;
    if (b.shape === "sheaf") stepSheaf(b, dt);
    else b.bodyRot = (b.bodyRot + BLOB_POLY.rotateSpeed * dt) % (Math.PI * 2);

    if (b.hunter) {
      const dx = markerX - b.x, dy = markerY - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        b.vx += (dx / dist) * QIX.hunterDrift * dt;
        b.vy += (dy / dist) * QIX.hunterDrift * dt;
        const spd = Math.hypot(b.vx, b.vy);
        if (spd > b.speed) { b.vx = (b.vx / spd) * b.speed; b.vy = (b.vy / spd) * b.speed; }
      }
    }

    const m = bounceMargin(b);
    const nx = b.x + b.vx * dt;
    if (solidAt(nx + Math.sign(b.vx) * m, b.y)) b.vx = -b.vx; else b.x = nx;
    const ny = b.y + b.vy * dt;
    if (solidAt(b.x, ny + Math.sign(b.vy) * m)) b.vy = -b.vy; else b.y = ny;
  }
}

// --- Kill tracking ---

export let lastKilled = [];

export function removeBlobs(indices) {
  const kill = new Set(indices);
  lastKilled = [];
  for (let i = blobs.length - 1; i >= 0; i--) {
    if (!kill.has(i)) continue;
    const b = blobs[i];
    lastKilled.push({ x: b.x, y: b.y, radius: b.radius, color: b.color, special: b.special || null });
    if (b.shape === "poly" && !b.special) deadPool.push({ ti: b.ti, hunter: b.hunter });
    blobs.splice(i, 1);
  }
}

export function cells() {
  return blobs.map(b => ({
    col: Math.floor((b.x - field.x) / CELL),
    row: Math.floor((b.y - field.y) / CELL),
    // A Special Blob doesn't vote to keep its region open — see grid.applyClaim.
    holdsOpen: !b.special,
  }));
}

// ZOOM dash kill-sweep: destroy every blob whose body the ship passed through as it
// moved from (x0,y0)→(x1,y1) this frame. Segment-based so nothing tunnels through at
// dash speed. Returns the killed blobs' {x,y,radius,color} (does NOT touch lastKilled,
// which the SPLIT path owns). Iterates backwards so splices stay valid.
export function killNear(x0, y0, x1, y1, reach) {
  const killed = [];
  for (let i = blobs.length - 1; i >= 0; i--) {
    const b = blobs[i];
    if (b.spawnT > 0) continue; // telegraphing enemies are untouchable
    let near;
    if (b.shape === "poly") {
      near = distToSeg(b.x, b.y, x0, y0, x1, y1) < hitRadius(b) + reach;
    } else {
      const s = liveSeg(b);
      near = segSegDist(s.ax, s.ay, s.bx, s.by, x0, y0, x1, y1) < QIX.lineHitPad + reach;
    }
    if (near) {
      // A dash through a Special Blob destroys it but grants no reward (§8) —
      // the caller can tell by the `special` flag on the returned entry.
      killed.push({ x: b.x, y: b.y, radius: b.radius, color: b.color, special: b.special || null });
      if (b.shape === "poly" && !b.special) deadPool.push({ ti: b.ti, hunter: b.hunter });
      blobs.splice(i, 1);
    }
  }
  return killed;
}

// --- Geometry helpers ---

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function ccw(ax, ay, bx, by, cx, cy) {
  return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}

// Do segments p1p2 and p3p4 intersect?
function segsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
         ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy);
}

// Minimum distance between two segments.
function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    distToSeg(ax, ay, cx, cy, dx, dy),
    distToSeg(bx, by, cx, cy, dx, dy),
    distToSeg(cx, cy, ax, ay, bx, by),
    distToSeg(dx, dy, ax, ay, bx, by),
  );
}

// --- Danger / near-miss (surface gap to the exposed trail) ---

// Distance from a blob's lethal surface to the marker/trail (negative ≈ touching).
function blobGap(b, marker, trail) {
  if (b.shape === "poly") {
    const br = hitRadius(b);
    let d = Math.hypot(b.x - marker.x, b.y - marker.y) - br;
    for (let i = 0; i < trail.length - 1; i++) {
      const a = trail[i], c = trail[i + 1];
      d = Math.min(d, distToSeg(b.x, b.y, nodeX(a.col), nodeY(a.row), nodeX(c.col), nodeY(c.row)) - br);
    }
    if (trail.length) {
      const last = trail[trail.length - 1];
      d = Math.min(d, distToSeg(b.x, b.y, nodeX(last.col), nodeY(last.row), marker.x, marker.y) - br);
    }
    return d;
  }
  // sheaf — distance from the live stick to marker/trail.
  const s = liveSeg(b), pad = QIX.lineHitPad;
  let d = distToSeg(marker.x, marker.y, s.ax, s.ay, s.bx, s.by) - pad;
  for (let i = 0; i < trail.length - 1; i++) {
    const a = trail[i], c = trail[i + 1];
    d = Math.min(d, segSegDist(s.ax, s.ay, s.bx, s.by, nodeX(a.col), nodeY(a.row), nodeX(c.col), nodeY(c.row)) - pad);
  }
  if (trail.length) {
    const last = trail[trail.length - 1];
    d = Math.min(d, segSegDist(s.ax, s.ay, s.bx, s.by, nodeX(last.col), nodeY(last.row), marker.x, marker.y) - pad);
  }
  return d;
}

export function threatGap(marker, mode, trail) {
  if (mode !== "cutting") return Infinity;
  let min = Infinity;
  for (const b of blobs) { if (b.spawnT > 0) continue; min = Math.min(min, blobGap(b, marker, trail)); }
  return min;
}

// Fires on the EXIT transition (gap recovers back out past the hysteresis band),
// not on entry — a graze that's still closing in is a doomed approach, not a
// "miss" yet. Firing only once the threat has genuinely passed means the player
// never sees "NEAR MISS" moments before getting caught by the same blob.
export function pollNearMiss(marker, mode, trail, band = 14) {
  if (mode !== "cutting") { for (const b of blobs) b.near = false; return 0; }
  let n = 0;
  for (const b of blobs) {
    if (b.spawnT > 0) continue;
    const gap = blobGap(b, marker, trail);
    if (gap < band && gap > 2) {
      b.near = true; // entered the danger band — wait and see before crediting it
    } else if (b.near && gap > band + 8) {
      b.near = false; // recovered clear of the band without being caught — safe now
      n++;
    }
  }
  return n;
}

// --- Collision (only lethal while cutting) ---

export function collides(marker, mode, trail) {
  if (mode !== "cutting") return null;
  if (isShielded()) return null;
  for (const b of blobs) {
    if (b.spawnT > 0) continue; // telegraphing: visible but harmless
    if (b.shape === "poly") {
      const br = hitRadius(b);
      if (Math.hypot(b.x - marker.x, b.y - marker.y) < br + MARKER.radius) return b;
      const thr = br + 2;
      for (let i = 0; i < trail.length - 1; i++) {
        const a = trail[i], c = trail[i + 1];
        if (distToSeg(b.x, b.y, nodeX(a.col), nodeY(a.row), nodeX(c.col), nodeY(c.row)) < thr) return b;
      }
      if (trail.length) {
        const last = trail[trail.length - 1];
        if (distToSeg(b.x, b.y, nodeX(last.col), nodeY(last.row), marker.x, marker.y) < thr) return b;
      }
    } else {
      const s = liveSeg(b), pad = QIX.lineHitPad;
      if (distToSeg(marker.x, marker.y, s.ax, s.ay, s.bx, s.by) < pad + MARKER.radius) return b;
      const thr = pad + 2;
      for (let i = 0; i < trail.length - 1; i++) {
        const a = trail[i], c = trail[i + 1];
        if (segSegDist(s.ax, s.ay, s.bx, s.by, nodeX(a.col), nodeY(a.row), nodeX(c.col), nodeY(c.row)) < thr) return b;
      }
      if (trail.length) {
        const last = trail[trail.length - 1];
        if (segSegDist(s.ax, s.ay, s.bx, s.by, nodeX(last.col), nodeY(last.row), marker.x, marker.y) < thr) return b;
      }
    }
  }
  return null;
}
