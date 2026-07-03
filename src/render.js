// COSMIC CUT — render (all drawing)
// Reads the world (grid), player (marker), enemies (enemy) and game state and
// paints a frame. Knows nothing about input or rules. Per state it draws: the
// start menu, a level intro banner, the play field, the level-complete wipe, and
// the game-over / campaign-complete overlays.

import { WIDTH, HEIGHT, field, CELL, COLS, ROWS, COLORS, THEMES, TIMING, AUDIO, POWERUPS, QIX, BLOB_POLY, SPARX, MARKER, nodeX, nodeY } from "./config.js";
import * as powerups from "./powerups.js";
import { grid, slowFill, EMPTY, FILLED, seams, cellSolid, percent } from "./grid.js";
import { marker, mode, dir, trail, slowActive } from "./marker.js";
import { blobs, qixLines, polyVerts, boundRadius } from "./enemy.js";
import { sparxList } from "./sparx.js";
import * as game from "./game.js";
import { zoneCount } from "./levels.js";
import * as fx from "./fx.js";
import * as audio from "./audio.js"; // for the temporary beat-detector readout

const CX = field.x + field.w / 2;
const CY = field.y + field.h / 2;
const MAXR = Math.hypot(field.w / 2, field.h / 2);
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// Active play-field palette for the current zone (zone 1 cyan → 2 orange → …).
function theme() {
  return THEMES[game.currentLevel().zone - 1] || THEMES[0];
}

// Level-complete circle close-out radius for a given elapsed transition time: it
// holds (radius 0) through the score read-out + banner hold, then expands over
// completeWipe.
function wipeRadius(transT) {
  const w = (transT - TIMING.completeScore - TIMING.completeHold) / TIMING.completeWipe;
  if (w <= 0) return 0;
  const t = Math.min(w, 1);
  return (1 - (1 - t) * (1 - t)) * (MAXR + 30); // easeOut
}

// Deep-space backdrop: a baked nebula + galaxy layer (drawn once to an offscreen
// canvas), with live twinkling parallax stars on top — the "cosmic" in COSMIC CUT.
let stars = null;
let starLast = 0;
let deepCanvas = null;  // baked nebula + galaxies, drawn once
const STAR_TINTS = ["#cfeaff", "#ffffff", "#bcdcff", "#ffe6c4", "#ffd0e8", "#d6c4ff"];

// Paint a soft elliptical "galaxy": a bright core, a coloured disc, and a couple
// of faint arm sweeps. cx,cy in offscreen pixels.
function bakeGalaxy(g, cx, cy, r, tilt, core, arm) {
  g.save();
  g.translate(cx, cy);
  g.rotate(tilt);
  g.scale(1, 0.42); // flatten into a disc
  const disc = g.createRadialGradient(0, 0, 0, 0, 0, r);
  disc.addColorStop(0, core);
  disc.addColorStop(0.25, arm);
  disc.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = disc;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  // bright dense core
  const k = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
  k.addColorStop(0, "rgba(255,255,255,0.9)");
  k.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = k;
  g.beginPath(); g.arc(0, 0, r * 0.3, 0, Math.PI * 2); g.fill();
  g.restore();
}

function bakeDeepSpace() {
  if (typeof document === "undefined") return; // headless import safety
  deepCanvas = document.createElement("canvas");
  deepCanvas.width = WIDTH;
  deepCanvas.height = HEIGHT;
  const g = deepCanvas.getContext("2d");

  // Layered nebula clouds in varied galactic colours.
  const clouds = [
    { x: WIDTH * 0.22, y: HEIGHT * 0.28, r: 320, c: "rgba(120,40,180,0.16)" }, // magenta
    { x: WIDTH * 0.80, y: HEIGHT * 0.66, r: 360, c: "rgba(20,110,170,0.15)" }, // teal-blue
    { x: WIDTH * 0.62, y: HEIGHT * 0.18, r: 240, c: "rgba(200,60,120,0.10)" }, // rose
    { x: WIDTH * 0.12, y: HEIGHT * 0.78, r: 280, c: "rgba(60,60,200,0.11)" },  // indigo
    { x: WIDTH * 0.50, y: HEIGHT * 0.50, r: 420, c: "rgba(40,20,90,0.10)" },   // deep violet wash
  ];
  for (const n of clouds) {
    const rg = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    rg.addColorStop(0, n.c);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // A pair of distant galaxies.
  bakeGalaxy(g, WIDTH * 0.74, HEIGHT * 0.30, 130, -0.5, "rgba(190,210,255,0.55)", "rgba(120,90,220,0.22)");
  bakeGalaxy(g, WIDTH * 0.20, HEIGHT * 0.70, 95,  0.7,  "rgba(255,225,200,0.45)", "rgba(220,90,150,0.18)");

  // Faint baked background dust-stars (the still, distant field).
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.1 + Math.random() * 0.4;
    g.fillStyle = STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0];
    g.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, 1, 1);
  }
  g.globalAlpha = 1;
}

function ensureStars() {
  if (stars) return;
  bakeDeepSpace();
  stars = [];
  for (let i = 0; i < 150; i++) {
    const far = Math.random() < 0.6;             // two parallax layers
    stars.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      size: far ? 1 : (Math.random() < 0.25 ? 2 : 1),
      v: (far ? 3 : 9) + Math.random() * (far ? 6 : 14),
      a: 0.3 + Math.random() * 0.6,
      tw: Math.random() * Math.PI * 2,           // twinkle phase
      tws: 1.5 + Math.random() * 3,              // twinkle speed
      tint: STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0],
    });
  }
}

function drawBackground(ctx, beat = 0) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ensureStars();

  const t = now();
  // Baked nebula + galaxies, breathing gently (and a touch on the beat).
  if (deepCanvas) {
    ctx.globalAlpha = 0.85 + 0.1 * Math.sin(t / 3500) + beat * 0.15;
    ctx.drawImage(deepCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }

  // Music beat: a faint full-screen bloom that breathes with the bass.
  if (beat > 0.02) {
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(WIDTH, HEIGHT) * 0.7);
    g.addColorStop(0, `rgba(120,90,220,${0.07 * beat})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  const dt = Math.min(0.05, (t - starLast) / 1000);
  starLast = t;
  const ts = t / 1000;
  const starBoost = 1 + beat * 0.7; // stars flare brighter on the beat
  for (const s of stars) {
    s.y += s.v * dt;
    if (s.y > HEIGHT) { s.y = 0; s.x = Math.random() * WIDTH; }
    const tw = 0.55 + 0.45 * Math.sin(ts * s.tws + s.tw); // per-star twinkle
    ctx.globalAlpha = Math.min(1, s.a * tw * starBoost);
    ctx.fillStyle = s.tint;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
}

function drawParticles(ctx) {
  for (const p of fx.getParticles()) {
    const k = Math.max(0, p.life / p.max);
    ctx.globalAlpha = k;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// Pulsing red vignette when a blob is near your exposed trail (danger 0..1).
function drawDangerEdge(ctx, danger) {
  if (!danger || danger <= 0.02) return;
  const pulse = 0.6 + 0.4 * Math.sin(now() / 90);
  const g = ctx.createRadialGradient(CX, CY, Math.min(WIDTH, HEIGHT) * 0.35, CX, CY, Math.max(WIDTH, HEIGHT) * 0.62);
  g.addColorStop(0, "rgba(255,40,40,0)");
  g.addColorStop(1, `rgba(255,30,30,${0.5 * danger * pulse})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

// Claimed territory rendered as glossy, shimmering glass: a translucent base
// (darker for SLOW-DRAW cells), then a moving specular glint and a breathing
// ripple sheen painted only over the claimed mass. During the level-complete
// wipe, cells within the expanding circle (radius wipeR) vanish inside-out.
function drawClaimed(ctx, wipeR = -1) {
  const th = theme();
  const fillNormal = th.claimedFill;
  const fillSlow = th.claimedFillSlow || COLORS.claimedFillSlow;

  // Gather visible claimed cells once (reused for the base fill and the clip).
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== FILLED) continue;
      const px = field.x + c * CELL;
      const py = field.y + r * CELL;
      if (wipeR >= 0 && Math.hypot(px + CELL / 2 - CX, py + CELL / 2 - CY) <= wipeR) continue;
      cells.push([px, py, slowFill[r][c]]);
    }
  }
  if (!cells.length) return;

  // 1) Base translucent glass (two passes so the slow/normal tints stay flat).
  ctx.fillStyle = fillNormal;
  for (const [px, py, s] of cells) if (!s) ctx.fillRect(px, py, CELL, CELL);
  ctx.fillStyle = fillSlow;
  for (const [px, py, s] of cells) if (s) ctx.fillRect(px, py, CELL, CELL);

  const t = now() / 1000;
  const shimmer = 0.5 + 0.5 * Math.sin(t * 1.6);
  const span = field.w + field.h;

  // 2) Breathing zone-tint sheen (the "ripple") — only on the bright/normal glass,
  //    so the slow "dark glass" stays genuinely dark.
  let anyNormal = false;
  ctx.save();
  ctx.beginPath();
  for (const [px, py, s] of cells) if (!s) { ctx.rect(px, py, CELL, CELL); anyNormal = true; }
  if (anyNormal) {
    ctx.clip();
    ctx.globalAlpha = 0.05 + 0.05 * shimmer;
    ctx.fillStyle = th.frontier;
    ctx.fillRect(field.x, field.y, field.w, field.h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 3) Specular glints — clip to the whole claimed mass (glass catches light on
  //    bright and dark cells alike). Two crossing sweeps for a rippling shimmer.
  ctx.save();
  ctx.beginPath();
  for (const [px, py] of cells) ctx.rect(px, py, CELL, CELL);
  ctx.clip();

  const sweep = ((t * 0.16) % 1) * 2 * span - span;
  const gx = field.x + sweep;
  const glint = ctx.createLinearGradient(gx, field.y, gx + span * 0.32, field.y + field.h);
  glint.addColorStop(0, "rgba(255,255,255,0)");
  glint.addColorStop(0.5, `rgba(255,255,255,${(0.10 + 0.06 * shimmer).toFixed(3)})`);
  glint.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glint;
  ctx.fillRect(field.x, field.y, field.w, field.h);

  const sweep2 = (((t * 0.09) + 0.5) % 1) * 2 * span - span;
  const gx2 = field.x + field.w - sweep2;
  const glint2 = ctx.createLinearGradient(gx2, field.y + field.h, gx2 - span * 0.4, field.y);
  glint2.addColorStop(0, "rgba(255,255,255,0)");
  glint2.addColorStop(0.5, `rgba(200,240,255,${(0.05 + 0.05 * (1 - shimmer)).toFixed(3)})`);
  glint2.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glint2;
  ctx.fillRect(field.x, field.y, field.w, field.h);

  ctx.restore();
}

function drawSeams(ctx) {
  ctx.strokeStyle = theme().seam;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (const key of seams) {
    const [kind, a, b] = key.split(":");
    const p = Number(a);
    const q = Number(b);
    if (kind === "h") {
      if (!(cellSolid(p - 1, q) && cellSolid(p, q))) continue; // only when buried
      const x = field.x + q * CELL;
      const y = field.y + p * CELL;
      ctx.moveTo(x, y); ctx.lineTo(x + CELL, y);
    } else {
      if (!(cellSolid(q, p - 1) && cellSolid(q, p))) continue;
      const x = field.x + p * CELL;
      const y = field.y + q * CELL;
      ctx.moveTo(x, y); ctx.lineTo(x, y + CELL);
    }
  }
  ctx.stroke();
}

function drawArena(ctx) {
  const t = theme();
  ctx.lineWidth = 2;
  ctx.strokeStyle = t.arena;
  ctx.shadowColor = t.arena;
  ctx.shadowBlur = 6;
  ctx.strokeRect(field.x, field.y, field.w, field.h);
  ctx.shadowBlur = 0;
}

// The bold bright frontier line the marker rides. It throbs with the music beat
// (glow + width + brightness) and, because it traces the live open/claimed
// boundary every frame, the throb naturally follows the evolving shape.
function drawPerimeter(ctx, beat = 0) {
  const t = theme();
  ctx.strokeStyle = t.frontier;
  ctx.lineWidth = 3.5 + beat * AUDIO.beat.widthBoost;
  ctx.lineCap = "round";
  ctx.shadowColor = t.frontier;
  ctx.shadowBlur = 12 + beat * AUDIO.beat.glowBoost;
  ctx.globalAlpha = Math.min(1, 0.8 + beat * 0.2); // flare brighter on the beat
  ctx.beginPath();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== EMPTY) continue;
      const x = field.x + c * CELL;
      const y = field.y + r * CELL;
      if (cellSolid(r - 1, c)) { ctx.moveTo(x, y); ctx.lineTo(x + CELL, y); }
      if (cellSolid(r + 1, c)) { ctx.moveTo(x, y + CELL); ctx.lineTo(x + CELL, y + CELL); }
      if (cellSolid(r, c - 1)) { ctx.moveTo(x, y); ctx.lineTo(x, y + CELL); }
      if (cellSolid(r, c + 1)) { ctx.moveTo(x + CELL, y); ctx.lineTo(x + CELL, y + CELL); }
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineCap = "butt";
  ctx.globalAlpha = 1;
}

function drawTrail(ctx, beat = 0) {
  if (mode !== "cutting" || trail.length === 0) return;
  // Heat builds toward the LONG threshold (2× field height): the trail brightens,
  // thickens and reddens, telegraphing both the building bonus and the risk. The
  // line also throbs with the beat, like the perimeter.
  const heat = Math.min(1, trail.length / (2 * ROWS));
  // A slow draw shows as a cooler, denser "glass-building" line; otherwise the
  // trail heats up (yellow→red) toward the LONG threshold.
  const color = slowActive ? "#5fd0ff"
              : heat > 0.85 ? "#ff5a3c" : heat > 0.5 ? "#ffae3c" : theme().trail;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 + heat * 2.5 + (slowActive ? 1.5 : 0) + beat * AUDIO.beat.widthBoost;
  ctx.shadowColor = color;
  ctx.shadowBlur = (slowActive ? 18 : 10) + heat * 16 + beat * AUDIO.beat.glowBoost;
  ctx.globalAlpha = Math.min(1, 0.85 + beat * 0.15);
  ctx.beginPath();
  ctx.moveTo(nodeX(trail[0].col), nodeY(trail[0].row));
  for (let i = 1; i < trail.length; i++) ctx.lineTo(nodeX(trail[i].col), nodeY(trail[i].row));
  ctx.lineTo(marker.x, marker.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// --- Enemy bodies ---

// The star Qix: a stack of straight "sticks" from the position history, newest
// brightest, older fading — the twisting expanding/contracting ribbon.
function drawSheaf(ctx, b) {
  const H = qixLines(b);
  if (!H.length) return;
  const N = H.length;

  ctx.save();
  ctx.shadowColor = b.color;
  ctx.lineCap = "round";

  const widths = QIX.glowWidth;
  const alphas = QIX.glowAlpha;
  for (let pass = 0; pass < widths.length; pass++) {
    ctx.lineWidth  = widths[pass];
    ctx.shadowBlur = pass === 0 ? 22 : pass === 1 ? 12 : 5;
    for (let i = 0; i < N; i++) {
      const age = i / N;                         // 0 = newest stick
      ctx.globalAlpha = alphas[pass] * (1 - age * 0.85);
      ctx.strokeStyle = (pass === widths.length - 1 && i < 2) ? "#ffffff" : b.color;
      const s = H[i];
      ctx.beginPath();
      ctx.moveTo(s.ax, s.ay);
      ctx.lineTo(s.bx, s.by);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// The polygon Blob: a ring of orbiting vertices with internal diagonals, glow
// passes, and a bright centre. Hunter Blobs add a pulsing tendril at the player.
function drawPoly(ctx, b) {
  const verts = polyVerts(b);
  const Nv = verts.length;
  const half = Nv >> 1;

  ctx.save();
  ctx.shadowColor = b.color;
  ctx.lineJoin = "round";

  const widths = BLOB_POLY.glowWidth;
  const alphas = BLOB_POLY.glowAlpha;
  for (let pass = 0; pass < widths.length; pass++) {
    ctx.globalAlpha = alphas[pass];
    ctx.strokeStyle = pass === widths.length - 1 ? "#ffffff" : b.color;
    ctx.lineWidth   = widths[pass];
    ctx.shadowBlur  = pass < 2 ? 22 : 8;

    ctx.beginPath();
    verts.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
    ctx.closePath();
    ctx.stroke();

    if (pass >= 1) {
      ctx.beginPath();
      for (let i = 0; i < half; i++) {
        ctx.moveTo(verts[i].x, verts[i].y);
        ctx.lineTo(verts[i + half].x, verts[i + half].y);
      }
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 0.9;
  ctx.fillStyle   = "#ffffff";
  ctx.shadowBlur  = 12;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
  ctx.fill();

  if (b.hunter) {
    const dx = marker.x - b.x, dy = marker.y - b.y;
    const d  = Math.hypot(dx, dy);
    if (d > 0) {
      const reach = Math.min(d * 0.45, boundRadius(b) * 2.5);
      ctx.globalAlpha = 0.15 + 0.12 * Math.sin(b.t * 3.5);
      ctx.strokeStyle = b.color;
      ctx.lineWidth   = 1.2;
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + (dx / d) * reach, b.y + (dy / d) * reach);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawQix(ctx) {
  for (const b of blobs) (b.shape === "sheaf" ? drawSheaf : drawPoly)(ctx, b);
}

// SOLAR WIND: streaks of light blowing across the field in the gust direction.
function drawSolarWind(ctx) {
  const sw = powerups.getSolarWind();
  if (!sw) return;
  const d = sw.dir;
  const t = now() / 1000;
  const half = Math.hypot(field.w, field.h) / 2;
  const px = -d.y, py = d.x; // perpendicular (cross) axis
  ctx.save();
  ctx.beginPath();
  ctx.rect(field.x, field.y, field.w, field.h);
  ctx.clip();
  ctx.strokeStyle = POWERUPS.SOLARWIND.color;
  ctx.shadowColor = POWERUPS.SOLARWIND.color;
  ctx.lineCap = "round";
  const N = 30;
  const L = 26;
  for (let i = 0; i < N; i++) {
    const b = (i / N) * 2 - 1 + Math.sin(i * 12.9) * 0.03; // cross position −1..1
    const a = (((t * 0.55) + i * 0.137) % 1) * 2 - 1;       // along position, wrapping
    const cx0 = CX + d.x * (a * half) + px * (b * half);
    const cy0 = CY + d.y * (a * half) + py * (b * half);
    const fade = 1 - Math.abs(a);
    ctx.globalAlpha = 0.14 * fade * (0.6 + 0.4 * Math.sin(t * 5 + i));
    ctx.lineWidth = 1.6;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(cx0 - d.x * L, cy0 - d.y * L);
    ctx.lineTo(cx0, cy0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// --- Sparx ---

function drawSparx(ctx) {
  for (const s of sparxList) {
    const col   = s.latched ? SPARX.latchColor : s.color;
    const glow  = s.latched ? 22 : 14;
    const pulse = 0.6 + 0.4 * Math.sin(s.t * 8 + (s.fast ? 1.5 : 0));

    ctx.save();
    ctx.shadowColor = col;

    // Fading position trail — shows the recent path.
    for (let i = 0; i < s.tail.length; i++) {
      const a = (1 - i / s.tail.length) * 0.35 * pulse;
      ctx.globalAlpha = a;
      ctx.fillStyle   = col;
      ctx.shadowBlur  = 4;
      ctx.beginPath();
      ctx.arc(s.tail[i].x, s.tail[i].y, SPARX.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    // Core: a rotating diamond (square rotated 45°).
    ctx.globalAlpha = 0.9 * pulse;
    ctx.fillStyle   = "#ffffff";
    ctx.shadowBlur  = glow;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.t * (s.fast ? 6 : 3.5));
    const r = SPARX.radius;
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Coloured outer ring.
    ctx.globalAlpha = 0.55 * pulse;
    ctx.fillStyle   = col;
    ctx.shadowBlur  = glow * 0.6;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.t * (s.fast ? 6 : 3.5) + Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.5); ctx.lineTo(r * 1.5, 0); ctx.lineTo(0, r * 1.5); ctx.lineTo(-r * 1.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
}

function drawPowerUps(ctx) {
  const t = now();
  const pulse = 8 + 10 * (0.5 + 0.5 * Math.sin(t / 350));

  const S = POWERUPS.iconScale;

  function icon(ctx, type, x, y, angle = 0) {
    const cfg = POWERUPS[type];
    ctx.strokeStyle = cfg.color;
    ctx.fillStyle   = cfg.color;
    ctx.shadowColor = cfg.color;
    ctx.shadowBlur  = pulse;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(S, S);
    ctx.lineWidth = 1.5 / S * 1.5; // visually ~1.5px after scaling, a touch bolder
    // Soft backing disc so the icon reads against busy backgrounds.
    ctx.globalAlpha = 0.12;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (type === "FREEZE") {
      // Snowflake: 3 lines at 0° / 60° / 120°
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.rotate((i * Math.PI) / 3);
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke();
        ctx.restore();
      }
    } else if (type === "SOLARWIND") {
      // Three stacked chevrons pointing right
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-3, i * 3 - 2); ctx.lineTo(0, i * 3); ctx.lineTo(3, i * 3 - 2);
        ctx.stroke();
      }
    } else if (type === "BOOST") {
      // Lightning bolt fill
      ctx.beginPath();
      ctx.moveTo(1, -5); ctx.lineTo(-2, 0); ctx.lineTo(1, 0); ctx.lineTo(-1, 5);
      ctx.lineTo(3, -1); ctx.lineTo(0, -1); ctx.closePath();
      ctx.fill();
    } else if (type === "SHIELD") {
      // Pentagon outline
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        i === 0 ? ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5)
                : ctx.lineTo(Math.cos(a) * 5, Math.sin(a) * 5);
      }
      ctx.closePath(); ctx.stroke();
    } else if (type === "ZOOM") {
      // Filled circle + 4 radiating spikes
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
        ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Static pickups
  for (const p of powerups.getPickups()) {
    const x = field.x + p.col * CELL + CELL / 2;
    const y = field.y + p.row * CELL + CELL / 2;
    icon(ctx, p.type, x, y);
  }

  // Floating ZOOM marker
  const z = powerups.getZoom();
  if (z) icon(ctx, "ZOOM", z.x, z.y, z.angle);

  ctx.shadowBlur = 0;
}

// ZOOM aiming overlay: 4 directional arrows around the marker.
function drawZoomAim(ctx) {
  const arrows = [
    {dx:0, dy:-1, label:"▲"}, {dx:0, dy:1, label:"▼"},
    {dx:-1, dy:0, label:"◀"}, {dx:1, dy:0, label:"▶"},
  ];
  const r = 28;
  const pulse = 0.6 + 0.4 * Math.sin(now() / 150);
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const { dx, dy, label } of arrows) {
    ctx.fillStyle = POWERUPS.ZOOM.color;
    ctx.shadowColor = POWERUPS.ZOOM.color;
    ctx.shadowBlur = 12 * pulse;
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.fillText(label, marker.x + dx * r, marker.y + dy * r);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// The player is a little rocket ship that points the way it's travelling.
function drawMarker(ctx) {
  // While cutting you're vulnerable — the hull flashes hot to telegraph it.
  let color = COLORS.marker;
  let hot = false;
  if (mode === "cutting") {
    const pulse = 0.5 + 0.5 * Math.sin(now() / 70);
    color = pulse > 0.5 ? "#ffffff" : "#ff4d4d";
    hot = true;
  }

  // Heading: face the travel direction; default nose-up at level start.
  const angle = dir ? Math.atan2(dir.dy, dir.dx) : -Math.PI / 2;
  const r = MARKER.radius;

  ctx.save();
  ctx.translate(marker.x, marker.y);
  ctx.rotate(angle);

  // Engine flame behind the ship, flickering (hotter/longer while cutting).
  const flick = 0.6 + 0.4 * Math.sin(now() / 45);
  const flame = (hot ? r * 2.2 : r * 1.5) * flick;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = hot ? "#ffd24d" : "#7df9ff";
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, -r * 0.4);
  ctx.lineTo(-r * 0.9 - flame, 0);
  ctx.lineTo(-r * 0.9, r * 0.4);
  ctx.closePath();
  ctx.fill();

  // Hull: a sleek triangle nose pointing along +x (heading).
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(r * 1.6, 0);        // nose
  ctx.lineTo(-r * 0.9, -r);      // back-left fin
  ctx.lineTo(-r * 0.4, 0);       // tail notch
  ctx.lineTo(-r * 0.9, r);       // back-right fin
  ctx.closePath();
  ctx.fill();

  // Cockpit dot.
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "#ffffff";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(r * 0.3, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawHUD(ctx, scorePulseT = 99) {
  const L = game.currentLevel();
  ctx.textBaseline = "top";
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = theme().frontier; // match the zone's border colour
  ctx.fillText(`ZONE ${L.label}`, 12, 10);
  ctx.fillStyle = COLORS.hud;
  ctx.fillText(`${percent.toFixed(0)}/${L.target}%`, 110, 10);
  ctx.fillStyle = COLORS.marker;
  ctx.fillText(`${"♥".repeat(game.lives)}`, 220, 10);
  if (game.levelMult > 1) {
    ctx.fillStyle = COLORS.hudAccent;
    ctx.fillText(`×${game.levelMult}`, 330, 10);
  }
  // Score, right-aligned, pulsing briefly (bigger + accent) whenever it jumps.
  const p = scorePulseT < TIMING.scorePulse ? 1 - scorePulseT / TIMING.scorePulse : 0;
  ctx.save();
  ctx.translate(WIDTH - 12, 10);
  ctx.scale(1 + 0.4 * p, 1 + 0.4 * p);
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = p > 0 ? theme().frontier : COLORS.hud;
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillText(`SCORE ${fmt(game.score)}`, 0, 0);
  ctx.restore();
  ctx.textAlign = "left";

  // Active power-up effect bar: one pill per timed effect, below the main HUD line.
  const active = powerups.getActiveEffects();
  const rows = [
    ["freeze",    POWERUPS.FREEZE],
    ["boost",     POWERUPS.BOOST ],
    ["shield",    POWERUPS.SHIELD],
    ["solarwind", POWERUPS.SOLARWIND],
  ].filter(([k]) => active[k] > 0);
  if (rows.length) {
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textBaseline = "top";
    let ex = 12;
    for (const [key, cfg] of rows) {
      const rem = active[key];
      const dur = cfg.duration;
      const label = `${cfg.label} ${rem.toFixed(1)}s`;
      const w = ctx.measureText(label).width;
      ctx.fillStyle = cfg.color;
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur = 6;
      ctx.fillText(label, ex, 30);
      // Depleting bar below the label
      ctx.fillStyle = cfg.color;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(ex, 47, w, 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = cfg.color;
      ctx.fillRect(ex, 47, w * (rem / dur), 2);
      ex += w + 16;
    }
    ctx.shadowBlur = 0;
  }
}

// --- overlays / screens ----------------------------------------------------
function centerText(ctx, text, y, font, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, WIDTH / 2, y);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

function drawTitle(ctx) {
  centerText(ctx, "COSMIC CUT", CY - 40, "700 72px system-ui, sans-serif", COLORS.frontier);
  centerText(ctx, "carve the cosmos", CY + 18, "500 22px system-ui, sans-serif", COLORS.hud);
  // A gentle pulse on the prompt so the title feels alive while the theme plays.
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now() / 600));
  ctx.globalAlpha = pulse;
  centerText(ctx, "press any key", CY + 86, "600 20px system-ui, sans-serif", COLORS.hudAccent);
  ctx.globalAlpha = 1;
  centerText(ctx, "M  mute     ·     N  music", HEIGHT - 48,
    "500 15px system-ui, sans-serif", COLORS.locked);
}

function drawMenu(ctx, menuSel) {
  // Positions/gap derive from the canvas so the portrait mobile layout fits too
  // (mirrors render-pixi.drawMenu — the Pixi renderer is the mobile target, this
  // keeps the fallback playable).
  centerText(ctx, "COSMIC CUT", HEIGHT * 0.2, "700 56px system-ui, sans-serif", COLORS.frontier);
  if (game.highScore > 0) centerText(ctx, `HI  ${fmt(game.highScore)}`, HEIGHT * 0.28, "700 22px system-ui, sans-serif", COLORS.hudAccent);
  centerText(ctx, "select a starting zone", HEIGHT * 0.345, "500 20px system-ui, sans-serif", COLORS.hud);

  const n = zoneCount;
  const gap = Math.min(110, (WIDTH - 64) / Math.max(1, n - 1));
  const half = Math.min(40, gap * 0.42);
  const startX = WIDTH / 2 - ((n - 1) * gap) / 2;
  const y = HEIGHT / 2 + 20;
  for (let z = 1; z <= n; z++) {
    const x = startX + (z - 1) * gap;
    const locked = z > game.unlockedZone;
    const selected = z === menuSel;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // chip
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.strokeStyle = locked ? COLORS.locked : selected ? COLORS.hudAccent : COLORS.arena;
    if (selected && !locked) { ctx.shadowColor = COLORS.hudAccent; ctx.shadowBlur = 16; }
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = locked ? COLORS.locked : selected ? COLORS.hudAccent : COLORS.frontier;
    ctx.font = "700 30px system-ui, sans-serif";
    ctx.fillText(String(z), x, y - 6);
    ctx.font = "500 13px system-ui, sans-serif";
    ctx.fillText(locked ? "LOCKED" : `${z}-1`, x, y + 22);
    ctx.restore();
  }
  centerText(ctx, "← →  select        ENTER  start", HEIGHT - 78,
    "500 18px system-ui, sans-serif", COLORS.hud);
  centerText(ctx, "M  mute     ·     N  music", HEIGHT - 48,
    "500 15px system-ui, sans-serif", COLORS.locked);
}

function drawIntro(ctx) {
  const L = game.currentLevel();
  centerText(ctx, `ZONE ${L.label}`, CY - 30, "700 52px system-ui, sans-serif", theme().frontier);
  centerText(ctx, L.boss ? `BOSS — CLAIM ${L.target}%` : `CLAIM ${L.target}%`, CY + 24,
    "600 26px system-ui, sans-serif", COLORS.hudAccent);
  centerText(ctx, "press a direction to begin", CY + 72, "500 17px system-ui, sans-serif", COLORS.hud);
  centerText(ctx, "hold SPACE while cutting for a SLOW DRAW — double points, dark glass", CY + 104,
    "500 14px system-ui, sans-serif", COLORS.locked);
}

function drawLevelComplete(ctx, transT) {
  // expanding ring tracing the wipe edge (after the hold)
  const wipeR = wipeRadius(transT);
  if (wipeR > 0 && wipeR < MAXR + 30) {
    const col = theme().frontier;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.shadowColor = col;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(CX, CY, wipeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  const pop = Math.min(1, (transT - TIMING.completeScore) / 0.25); // banner pops in once the score beat is done
  ctx.save();
  ctx.translate(WIDTH / 2, CY);
  ctx.scale(pop, pop);
  ctx.fillStyle = COLORS.marker;
  ctx.font = "700 46px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LEVEL COMPLETE", 0, 0); // origin already at centre — don't offset again
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

function drawPopups(ctx, popups) {
  const col = theme().frontier;
  ctx.save();
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 10;
  for (const p of popups) {
    const k = Math.min(1, p.t / TIMING.popupLife);
    ctx.globalAlpha = 1 - k * k; // hold bright, fade late
    ctx.fillText(p.text, p.x, p.y - 18 - k * 30); // rise as it fades
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.restore();
}

function fmt(n) { return Math.round(n).toLocaleString(); }
function fmtMult(m) { return Number.isInteger(m) ? `${m}` : m.toFixed(1); }

// easeOutBack: 0 → 1 with a slight overshoot, for "expanding" pop-in text.
function popScale(p) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const c1 = 1.70158;
  const x = p - 1;
  return 1 + (c1 + 1) * x * x * x + c1 * x * x;
}

const POP_DUR = 0.22; // seconds for one element to expand into place

// Central score read-out: the bonus names pop in one-by-one, then the score, the
// ×multiplier and the total each "doof" in with expanding text. Holds, then fades.
function drawReward(ctx, r) {
  if (!r) return;
  const life = TIMING.rewardLife;
  const step = TIMING.rewardStep;
  const accent = theme().frontier;
  const cx = WIDTH / 2;
  const top = CY - 78;

  ctx.save();
  ctx.globalAlpha = r.t < life * 0.8 ? 1 : Math.max(0, (life - r.t) / (life * 0.2));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Draw `text` with an expanding pop that begins at reveal index `idx`.
  const pop = (text, x, y, idx, font, color, glow) => {
    const sc = popScale((r.t - idx * step) / POP_DUR);
    if (sc <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.fillText(text, 0, 0);
    ctx.restore();
    ctx.shadowBlur = 0;
  };

  let idx = 0;

  // 1) bonus names, each its own pop
  if (r.labels.length) {
    ctx.font = "800 28px system-ui, sans-serif";
    const ws = r.labels.map((l) => ctx.measureText(l).width);
    const sep = 22;
    const tw = ws.reduce((s, w) => s + w, 0) + sep * (r.labels.length - 1);
    let x = cx - tw / 2;
    for (let i = 0; i < r.labels.length; i++) {
      pop(r.labels[i], x + ws[i] / 2, top, idx, "800 28px system-ui, sans-serif", COLORS.hudAccent, 14);
      x += ws[i] + sep;
      idx++;
    }
  }

  // 2) score → ×multiplier (each a beat), laid out on a fixed centred row
  const baseStr = fmt(r.base);
  const multStr = `×${fmtMult(r.mult)}${r.killPts > 0 ? ` +${fmt(r.killPts)}` : ""}`;
  ctx.font = "800 30px system-ui, sans-serif";
  const wB = ctx.measureText(baseStr).width;
  const wM = ctx.measureText(multStr).width;
  const gap = 20;
  const rowL = cx - (wB + gap + wM) / 2;
  pop(baseStr, rowL + wB / 2, top + 56, idx, "800 30px system-ui, sans-serif", COLORS.hud, 8);
  pop(multStr, rowL + wB + gap + wM / 2, top + 56, idx + 1, "800 30px system-ui, sans-serif", COLORS.hudAccent, 14);

  // 3) the total — biggest beat
  pop(`+${fmt(r.total)}`, cx, top + 118, idx + 2, "900 60px system-ui, sans-serif", accent, 22);

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// Frozen-on-death overlay: a pulsing highlight at the contact point, held until
// the player presses a key. (A fuller explosion can replace this later.)
function drawDeathFlash(ctx, p, blob, transT) {
  const blink = 0.5 + 0.5 * Math.sin(transT * 12);
  if (p) {
    const r = 12 + 6 * blink;
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.55 * blink;
    ctx.fillStyle = COLORS.marker;
    ctx.shadowColor = COLORS.marker;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  if (blob) {
    // ring the blob that caught you — shows the real kill point on a line contact
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.6 * blink;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(blob.x, blob.y, blob.radius + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  centerText(ctx, "CAUGHT!", field.y + 64, "700 40px system-ui, sans-serif", COLORS.marker);
  // Brief forced pause so a held/mashed key can't skip straight into respawn.
  if (transT >= TIMING.deathHold) {
    centerText(ctx, "press any key to continue", field.y + 100, "500 18px system-ui, sans-serif", COLORS.hud);
  }
}

// Pause overlay — dims the frozen board and shows how to resume.
function drawPaused(ctx) {
  ctx.fillStyle = "rgba(5, 3, 15, 0.6)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  centerText(ctx, "PAUSED", CY - 18, "700 52px system-ui, sans-serif", COLORS.frontier);
  centerText(ctx, "P / ESC  resume     ·     M  mute     ·     N  music", CY + 40,
    "500 17px system-ui, sans-serif", COLORS.hud);
}

function drawGameOver(ctx) {
  ctx.fillStyle = "rgba(5, 3, 15, 0.78)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  centerText(ctx, "GAME OVER", CY - 56, "700 48px system-ui, sans-serif", COLORS.hudAccent);
  centerText(ctx, `SCORE ${fmt(game.score)}`, CY - 6, "700 28px system-ui, sans-serif", COLORS.hud);
  if (game.newHigh) {
    const p = 0.6 + 0.4 * Math.sin(now() / 140);
    ctx.globalAlpha = p;
    centerText(ctx, "★ NEW HIGH SCORE ★", CY + 36, "800 26px system-ui, sans-serif", theme().frontier);
    ctx.globalAlpha = 1;
  } else {
    centerText(ctx, `HI  ${fmt(game.highScore)}`, CY + 36, "600 22px system-ui, sans-serif", COLORS.locked);
  }
  centerText(ctx, "press any key — start screen", CY + 78, "500 20px system-ui, sans-serif", COLORS.hud);
}

function drawCampaignComplete(ctx) {
  ctx.fillStyle = "rgba(5, 3, 15, 0.82)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  centerText(ctx, "CAMPAIGN COMPLETE", CY - 60, "700 46px system-ui, sans-serif", COLORS.frontier);
  centerText(ctx, `FINAL SCORE ${fmt(game.score)}`, CY - 8, "700 28px system-ui, sans-serif", COLORS.hudAccent);
  if (game.newHigh) centerText(ctx, "★ NEW HIGH SCORE ★", CY + 32, "800 24px system-ui, sans-serif", theme().frontier);
  else centerText(ctx, `HI  ${fmt(game.highScore)}`, CY + 32, "600 22px system-ui, sans-serif", COLORS.locked);
  centerText(ctx, "you cleared all five zones — press any key", CY + 72,
    "500 20px system-ui, sans-serif", COLORS.hud);
}

export function render(ctx, view = {}) {
  const { transT = 0, menuSel = 1, popups = [], reward = null, deathPoint = null, deathBlob = null, scorePulseT = 99, danger = 0, beat = 0, paused = false } = view;
  drawBackground(ctx, beat);

  if (AUDIO.debugBeat) { // TEMP: live beat detector readout (bottom-left, clear of the HUD)
    const d = audio.beatInfo();
    ctx.save();
    ctx.fillStyle = "#39ff14";
    ctx.font = "600 13px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`an${d.an} m${d.muted} bass ${d.bass} env ${d.env} → beat ${beat.toFixed(2)}`, 10, HEIGHT - 8);
    ctx.restore();
    ctx.textBaseline = "top";
  }

  if (game.state === "title") { drawTitle(ctx); return; }
  if (game.state === "menu") { drawMenu(ctx, menuSel); return; }

  // The play field shakes (screen-shake); overlays/HUD stay steady and readable.
  const off = fx.shakeOffset();
  ctx.save();
  ctx.translate(off.x, off.y);

  if (game.state === "levelcomplete") {
    drawClaimed(ctx, wipeRadius(transT));
    drawArena(ctx);
    drawParticles(ctx);
    drawMarker(ctx);
    ctx.restore();
    drawHUD(ctx);
    // Phase 1: read out the final cut's score over the full board. Phase 2+:
    // LEVEL COMPLETE banner, then the circle close-out wipe.
    if (transT < TIMING.completeScore) drawReward(ctx, reward);
    else drawLevelComplete(ctx, transT);
    return;
  }

  drawClaimed(ctx);
  drawSeams(ctx);
  drawArena(ctx);
  drawPerimeter(ctx, beat);
  drawTrail(ctx, beat);
  drawSolarWind(ctx);
  drawQix(ctx);
  drawSparx(ctx);
  drawPowerUps(ctx);
  drawMarker(ctx);
  if (powerups.isAiming()) drawZoomAim(ctx);
  drawParticles(ctx);
  ctx.restore();

  drawDangerEdge(ctx, danger);
  drawPopups(ctx, popups);
  drawReward(ctx, reward);
  drawHUD(ctx, scorePulseT);

  if (game.state === "intro") drawIntro(ctx);
  else if (game.state === "dead") drawDeathFlash(ctx, deathPoint, deathBlob, transT);
  else if (game.state === "gameover") drawGameOver(ctx);
  else if (game.state === "campaigncomplete") drawCampaignComplete(ctx);

  if (paused) drawPaused(ctx);
}
