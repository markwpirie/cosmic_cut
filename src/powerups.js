// COSMIC CUT — powerups (Phase 6, §8)
// Owns all pickup state: placed pickups, the floating ZOOM marker, and active
// timed effects. Other modules read a handful of simple getters; this module
// activates effects and consumes pickups when the player collects them.

import { POWERUPS, CELL, COLS, ROWS, field, nodeX, nodeY, MARKER } from "./config.js";
import { grid, FILLED, EMPTY, cellSolid, percent } from "./grid.js";
import { blobs, removeBlobs, cells as blobCells } from "./enemy.js";
import * as audio from "./audio.js";

// --- Internal state ---
export let pickups = [];  // [{type, col, row}]  — claim-to-collect
let zoom = null;           // {x,y,vx,vy,angle} or null — floating ZOOM marker
let savedZoom = null;      // saved while aiming so cancel can restore it
let aiming = false;        // true while player is choosing ZOOM direction
const effects = { freeze: 0, boost: 0, shield: 0, solarwind: 0 };
let solarDir = { x: 0, y: 0 }; // unit vector the solar wind is blowing toward

// --- Getters (read by enemy, marker, render, main) ---
export function isFrozen()        { return effects.freeze > 0; }
export function isShielded()      { return effects.shield > 0; }
export function boostMult()       { return effects.boost > 0 ? POWERUPS.BOOST.speedMult : 1; }
export function isAiming()        { return aiming; }
export function getPickups()      { return pickups; }
export function getZoom()         { return zoom; }
export function getActiveEffects(){ return { freeze: effects.freeze, boost: effects.boost, shield: effects.shield, solarwind: effects.solarwind }; }
// For render: the active gust as {dir, time} or null (drives the wind streaks).
export function getSolarWind()    { return effects.solarwind > 0 ? { dir: solarDir, time: effects.solarwind } : null; }

// End ZOOM aim mode (called from main.js once a dash direction is committed to the
// marker). The dash itself lives in marker.js; powerups just owns the floating
// pickup + the aim gate.
export function endAiming() { aiming = false; savedZoom = null; }

// --- Lifecycle ---
export function reset() {
  pickups = [];
  zoom = null;
  savedZoom = null;
  aiming = false;
  effects.freeze = 0;
  effects.boost  = 0;
  effects.shield = 0;
  effects.solarwind = 0;
}

// --- Per-frame update ---
export function update(dt) {
  for (const key of ["freeze", "boost", "shield", "solarwind"]) {
    if (effects[key] > 0) {
      effects[key] -= dt;
      if (effects[key] <= 0) { effects[key] = 0; audio.powerupExpire(); }
    }
  }
  // While the wind blows, keep forcing every enemy's velocity toward the chosen
  // wall (this runs before enemy.update each frame, so the push always wins).
  if (effects.solarwind > 0) {
    for (const b of blobs) {
      const s = b.speed * POWERUPS.SOLARWIND.gustMult;
      b.vx = solarDir.x * s;
      b.vy = solarDir.y * s;
    }
  }
  if (!zoom) return;
  zoom.angle = (zoom.angle + dt * 1.8) % (Math.PI * 2);
  const r = 6;
  const nx = zoom.x + zoom.vx * dt;
  if (solidAt(nx + Math.sign(zoom.vx) * r, zoom.y)) zoom.vx = -zoom.vx;
  else zoom.x = nx;
  const ny = zoom.y + zoom.vy * dt;
  if (solidAt(zoom.x, ny + Math.sign(zoom.vy) * r)) zoom.vy = -zoom.vy;
  else zoom.y = ny;
}

// --- Spawn ---
// Called after a successful claim. Randomly places a new pickup on the board.
export function trySpawn(markerCol, markerRow) {
  if (percent < POWERUPS.spawnMinPct) return;
  if (pickups.length + (zoom ? 1 : 0) >= POWERUPS.maxOnBoard) return;
  if (Math.random() > POWERUPS.spawnChance) return;

  // Weighted pool: FREEZE/BOOST/SHIELD common, SOLARWIND less, ZOOM rare.
  const pool = [
    "FREEZE","FREEZE","FREEZE",
    "BOOST","BOOST","BOOST",
    "SHIELD","SHIELD","SHIELD",
    "SOLARWIND","SOLARWIND",
    "ZOOM",
  ].filter(t => t !== "ZOOM" || !zoom); // only one ZOOM at a time

  const type = pool[Math.floor(Math.random() * pool.length)];

  const occupied = new Set(pickups.map(p => `${p.row},${p.col}`));
  const blobSet  = new Set(blobCells().map(b => `${b.row},${b.col}`));
  const candidates = [];
  const MIN_MARKER = 8; // cells away from the player's current position
  for (let r = 5; r < ROWS - 5; r++) {
    for (let c = 5; c < COLS - 5; c++) {
      if (grid[r][c] !== EMPTY) continue;
      if (occupied.has(`${r},${c}`)) continue;
      if (blobSet.has(`${r},${c}`)) continue;
      if ((r - markerRow) ** 2 + (c - markerCol) ** 2 < MIN_MARKER ** 2) continue;
      candidates.push([r, c]);
    }
  }
  if (!candidates.length) return;

  const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
  if (type === "ZOOM") {
    const k = Math.SQRT1_2;
    const s = POWERUPS.zoomDriftSpeed;
    zoom = {
      x: field.x + (c + 0.5) * CELL,
      y: field.y + (r + 0.5) * CELL,
      vx: s * k * (Math.random() < 0.5 ? -1 : 1),
      vy: s * k * (Math.random() < 0.5 ? -1 : 1),
      angle: 0,
    };
  } else {
    pickups.push({ type, col: c, row: r });
  }
}

// --- Claim detection ---
// Call after applyClaim() fills the grid. Returns collected type strings.
export function checkClaim() {
  const collected = [];
  pickups = pickups.filter(p => {
    if (grid[p.row][p.col] === FILLED) { collected.push(p.type); activate(p.type); return false; }
    return true;
  });
  // Silently remove ZOOM if it was enclosed (not triggered — player must touch it).
  if (zoom) {
    const zr = Math.floor((zoom.y - field.y) / CELL);
    const zc = Math.floor((zoom.x - field.x) / CELL);
    if (zr >= 0 && zr < ROWS && zc >= 0 && zc < COLS && grid[zr][zc] === FILLED) zoom = null;
  }
  return collected;
}

// DEV/TEST ONLY: drop a ZOOM pickup right on the marker so it's collected next
// frame (arrows appear immediately). Bound to the Z key in main.js — remove this
// and its key handler before shipping. Used to test the ZOOM aim/teleport path.
export function devSpawnZoom(mx, my) {
  if (aiming) return;
  zoom = { x: mx, y: my, vx: 0, vy: 0, angle: 0 };
}

// --- ZOOM touch ---
// Call each frame while playing. Returns true when the player touches the ZOOM
// marker, entering aiming mode. main.js handles the aiming UI.
export function checkZoomTouch(mx, my) {
  if (!zoom || aiming) return false;
  if (Math.hypot(zoom.x - mx, zoom.y - my) < MARKER.radius + 8 * POWERUPS.iconScale) {
    savedZoom = { ...zoom };
    zoom = null;
    aiming = true;
    return true;
  }
  return false;
}

// NOTE: ZOOM no longer teleports. The dash (a real 2× cut, invulnerable, kills on
// contact) is started on the marker via marker.startZoomDash() from main.js's keydown;
// main.js calls endAiming() here once the dash is committed. See marker.js + main.js.

// Cancel ZOOM aiming — restores the floating marker.
export function cancelZoom() {
  aiming = false;
  if (savedZoom) { zoom = savedZoom; savedZoom = null; }
}

// --- Effect activation ---
function activate(type) {
  switch (type) {
    case "FREEZE":    effects.freeze = POWERUPS.FREEZE.duration; break;
    case "BOOST":     effects.boost  = POWERUPS.BOOST.duration;  break;
    case "SHIELD":    effects.shield = POWERUPS.SHIELD.duration; break;
    case "SOLARWIND": activateSolarWind(); break;
  }
}

function activateSolarWind() {
  const dirs = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
  ];
  solarDir = dirs[Math.floor(Math.random() * 4)];
  effects.solarwind = POWERUPS.SOLARWIND.duration; // sustained push (see update)
}

function solidAt(px, py) {
  return cellSolid(Math.floor((py - field.y) / CELL), Math.floor((px - field.x) / CELL));
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
