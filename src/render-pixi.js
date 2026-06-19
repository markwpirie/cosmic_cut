// COSMIC CUT — render-pixi (Phase 9 graphics layer)
// A drop-in alternative to render.js that paints the same world with Pixi.js
// instead of the 2D canvas. It exposes the SAME contract main.js already uses:
//   await init(canvas)   — set up the Pixi Application (async; CDN ESM import)
//   render(view)         — paint one frame from the given view + live world state
// It reads exactly the same world modules as render.js (grid/marker/enemy/…), so
// no game logic changes — this is purely presentation (design principle §1.2).
//
// Opt-in: main.js only loads this module when the URL has ?pixi, so the canvas
// renderer stays the default and the branch is always playable while this grows.
//
// Style note: we draw in an immediate-mode style (clear + rebuild each frame)
// to mirror render.js closely and keep the port easy to reason about. Glow is
// faked with a few widening, fading stroke passes (Pixi has no shadowBlur).

import { Application, Container, Graphics, Sprite, Texture, Text } from "pixi.js";
import { WIDTH, HEIGHT, field, CELL, COLS, ROWS, COLORS, THEMES, TIMING, POWERUPS, QIX, BLOB_POLY, SPARX, MARKER } from "./config.js";
import * as powerups from "./powerups.js";
import { grid, slowFill, EMPTY, FILLED, seams, cellSolid, percent } from "./grid.js";
import { marker, mode, dir, trail, slowActive } from "./marker.js";
import { blobs, qixLines, polyVerts, boundRadius } from "./enemy.js";
import { sparxList } from "./sparx.js";
import * as game from "./game.js";
import { zoneCount } from "./levels.js";
import * as fx from "./fx.js";

const CX = field.x + field.w / 2;
const CY = field.y + field.h / 2;
const MAXR = Math.hypot(field.w / 2, field.h / 2);
const FONT = "system-ui, sans-serif";
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function theme() { return THEMES[game.currentLevel().zone - 1] || THEMES[0]; }

// --- Pixi app + persistent layers ------------------------------------------
let app = null;
let G = {};          // named Graphics layers, cleared + redrawn each frame
let bgSprite = null; // baked nebula/galaxy texture
let starsState = null;
let starLast = 0;

// Text pool — reuse Text objects across frames (creating them per frame is slow).
let uiLayer = null;
const textPool = [];
let textIdx = 0;

export async function init(canvas) {
  app = new Application();
  await app.init({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    background: COLORS.bg,
    antialias: true,
    resolution: (typeof window !== "undefined" && window.devicePixelRatio) || 1,
    autoDensity: true,
  });
  app.ticker.stop(); // main.js's loop drives us; we render manually each frame

  // Background: a baked nebula+galaxy sprite, then a Graphics for live stars.
  bgSprite = new Sprite(bakeDeepSpaceTexture());
  app.stage.addChild(bgSprite);

  // Build the layer stack in paint order.
  const order = [
    "stars", "bloom", "glass", "seams", "arena", "perimeter", "trail",
    "solar", "enemy", "sparx", "powerup", "marker", "particles", "vignette", "overlay",
  ];
  for (const name of order) {
    G[name] = new Graphics();
    app.stage.addChild(G[name]);
  }
  uiLayer = new Container();
  app.stage.addChild(uiLayer);

  initStars();
}

// --- Text pool helpers -----------------------------------------------------
function beginText() { textIdx = 0; }
function drawText(str, x, y, opts = {}) {
  const { size = 18, color = "#ffffff", weight = "600", align = "left", alpha = 1 } = opts;
  let t = textPool[textIdx];
  if (!t) {
    t = new Text({ text: str, style: { fontFamily: FONT, fontSize: size, fill: color, fontWeight: weight } });
    uiLayer.addChild(t);
    textPool.push(t);
  }
  t.text = str;
  t.style.fontFamily = FONT;
  t.style.fontSize = size;
  t.style.fontWeight = weight;
  t.style.fill = color;
  if (align === "center") t.anchor.set(0.5, 0.5);
  else if (align === "right") t.anchor.set(1, 0);
  else t.anchor.set(0, 0);
  t.x = x; t.y = y; t.alpha = alpha; t.visible = true;
  textIdx++;
  return t;
}
function endText() { for (let i = textIdx; i < textPool.length; i++) textPool[i].visible = false; }
function centerText(str, y, size, color, alpha = 1, weight = "700") {
  return drawText(str, WIDTH / 2, y, { size, color, weight, align: "center", alpha });
}

// --- Glow stroke helper: draw a path several times, widening + fading --------
// build(g) issues the path commands (moveTo/lineTo/…); we stroke it per pass.
function glow(g, build, passes) {
  for (const p of passes) {
    build(g);
    g.stroke({ width: p.w, color: p.c, alpha: p.a, cap: "round", join: "round" });
  }
}

// --- Baked deep-space texture (nebula + galaxies + dust) --------------------
const STAR_TINTS = ["#cfeaff", "#ffffff", "#bcdcff", "#ffe6c4", "#ffd0e8", "#d6c4ff"];
function bakeGalaxy(g, cx, cy, r, tilt, core, arm) {
  g.save();
  g.translate(cx, cy); g.rotate(tilt); g.scale(1, 0.42);
  const disc = g.createRadialGradient(0, 0, 0, 0, 0, r);
  disc.addColorStop(0, core); disc.addColorStop(0.25, arm); disc.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = disc; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  const k = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
  k.addColorStop(0, "rgba(255,255,255,0.9)"); k.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = k; g.beginPath(); g.arc(0, 0, r * 0.3, 0, Math.PI * 2); g.fill();
  g.restore();
}
function bakeDeepSpaceTexture() {
  const cv = document.createElement("canvas");
  cv.width = WIDTH; cv.height = HEIGHT;
  const g = cv.getContext("2d");
  g.fillStyle = COLORS.bg; g.fillRect(0, 0, WIDTH, HEIGHT);
  const clouds = [
    { x: WIDTH * 0.22, y: HEIGHT * 0.28, r: 320, c: "rgba(120,40,180,0.16)" },
    { x: WIDTH * 0.80, y: HEIGHT * 0.66, r: 360, c: "rgba(20,110,170,0.15)" },
    { x: WIDTH * 0.62, y: HEIGHT * 0.18, r: 240, c: "rgba(200,60,120,0.10)" },
    { x: WIDTH * 0.12, y: HEIGHT * 0.78, r: 280, c: "rgba(60,60,200,0.11)" },
    { x: WIDTH * 0.50, y: HEIGHT * 0.50, r: 420, c: "rgba(40,20,90,0.10)" },
  ];
  for (const n of clouds) {
    const rg = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    rg.addColorStop(0, n.c); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg; g.fillRect(0, 0, WIDTH, HEIGHT);
  }
  bakeGalaxy(g, WIDTH * 0.74, HEIGHT * 0.30, 130, -0.5, "rgba(190,210,255,0.55)", "rgba(120,90,220,0.22)");
  bakeGalaxy(g, WIDTH * 0.20, HEIGHT * 0.70, 95, 0.7, "rgba(255,225,200,0.45)", "rgba(220,90,150,0.18)");
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.1 + Math.random() * 0.4;
    g.fillStyle = STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0];
    g.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, 1, 1);
  }
  g.globalAlpha = 1;
  return Texture.from(cv);
}

function initStars() {
  starsState = [];
  for (let i = 0; i < 150; i++) {
    const far = Math.random() < 0.6;
    starsState.push({
      x: Math.random() * WIDTH, y: Math.random() * HEIGHT,
      size: far ? 1 : (Math.random() < 0.25 ? 2 : 1),
      v: (far ? 3 : 9) + Math.random() * (far ? 6 : 14),
      a: 0.3 + Math.random() * 0.6,
      tw: Math.random() * Math.PI * 2, tws: 1.5 + Math.random() * 3,
      tint: STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0],
    });
  }
}

// --- Per-frame scene draws -------------------------------------------------
function drawBackground(beat) {
  const t = now();
  bgSprite.alpha = 0.85 + 0.1 * Math.sin(t / 3500) + beat * 0.15;
  const dt = Math.min(0.05, (t - starLast) / 1000);
  starLast = t;
  const ts = t / 1000;
  const boost = 1 + beat * 0.7;
  const g = G.stars; g.clear();
  for (const s of starsState) {
    s.y += s.v * dt;
    if (s.y > HEIGHT) { s.y = 0; s.x = Math.random() * WIDTH; }
    const tw = 0.55 + 0.45 * Math.sin(ts * s.tws + s.tw);
    g.rect(s.x, s.y, s.size, s.size).fill({ color: s.tint, alpha: Math.min(1, s.a * tw * boost) });
  }
}

function drawClaimed(wipeR = -1) {
  const g = G.glass; g.clear();
  const th = theme();
  const fillNormal = th.claimedFill;
  const fillSlow = th.claimedFillSlow || COLORS.claimedFillSlow;

  // Two moving diagonal "glisten" bands, computed per filled cell so the shimmer
  // only ever appears on claimed glass (and naturally follows its shape) — the
  // canvas renderer clips a gradient to the same effect.
  const t = now() / 1000;
  const span = field.w + field.h;                 // diagonal extent
  const bandHalf = 90;                            // band half-width, px
  const b1 = ((t * 0.16) % 1) * (span + bandHalf * 2) - bandHalf;          // L→R
  const b2 = ((t * 0.09 + 0.5) % 1) * (span + bandHalf * 2) - bandHalf;    // slower
  const glint = (u) => {
    let a = 0;
    const d1 = Math.abs(u - b1); if (d1 < bandHalf) a += 0.13 * (1 - d1 / bandHalf);
    const d2 = Math.abs(u - b2); if (d2 < bandHalf) a += 0.07 * (1 - d2 / bandHalf);
    return a;
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== FILLED) continue;
      const px = field.x + c * CELL, py = field.y + r * CELL;
      if (wipeR >= 0 && Math.hypot(px + CELL / 2 - CX, py + CELL / 2 - CY) <= wipeR) continue;
      g.rect(px, py, CELL, CELL).fill(slowFill[r][c] ? fillSlow : fillNormal);
      const a = glint((px - field.x) + (py - field.y)); // diagonal coordinate
      if (a > 0.003) g.rect(px, py, CELL, CELL).fill({ color: "#ffffff", alpha: a });
    }
  }
}

function drawSeams() {
  const g = G.seams; g.clear();
  for (const key of seams) {
    const [kind, a, b] = key.split(":");
    const p = Number(a), q = Number(b);
    if (kind === "h") {
      if (!(cellSolid(p - 1, q) && cellSolid(p, q))) continue;
      const x = field.x + q * CELL, y = field.y + p * CELL;
      g.moveTo(x, y).lineTo(x + CELL, y);
    } else {
      if (!(cellSolid(q, p - 1) && cellSolid(q, p))) continue;
      const x = field.x + p * CELL, y = field.y + q * CELL;
      g.moveTo(x, y).lineTo(x, y + CELL);
    }
  }
  g.stroke({ width: 1.25, color: theme().seam });
}

function drawArena() {
  const g = G.arena; g.clear();
  glow(g, gg => gg.rect(field.x, field.y, field.w, field.h), [
    { w: 6, c: theme().arena, a: 0.18 },
    { w: 2, c: theme().arena, a: 1 },
  ]);
}

function drawPerimeter(beat) {
  const g = G.perimeter; g.clear();
  const col = theme().frontier;
  const build = (gg) => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] !== EMPTY) continue;
        const x = field.x + c * CELL, y = field.y + r * CELL;
        if (cellSolid(r - 1, c)) { gg.moveTo(x, y); gg.lineTo(x + CELL, y); }
        if (cellSolid(r + 1, c)) { gg.moveTo(x, y + CELL); gg.lineTo(x + CELL, y + CELL); }
        if (cellSolid(r, c - 1)) { gg.moveTo(x, y); gg.lineTo(x, y + CELL); }
        if (cellSolid(r, c + 1)) { gg.moveTo(x + CELL, y); gg.lineTo(x + CELL, y + CELL); }
      }
    }
  };
  glow(g, build, [
    { w: 7 + beat * 3, c: col, a: 0.16 },
    { w: 3.5 + beat * 2, c: col, a: Math.min(1, 0.85 + beat * 0.15) },
  ]);
}

function drawTrail(beat) {
  const g = G.trail; g.clear();
  if (mode !== "cutting" || trail.length === 0) return;
  const heat = Math.min(1, trail.length / (2 * ROWS));
  const col = slowActive ? "#5fd0ff" : heat > 0.85 ? "#ff5a3c" : heat > 0.5 ? "#ffae3c" : theme().trail;
  const build = (gg) => {
    gg.moveTo(nx(trail[0].col), ny(trail[0].row));
    for (let i = 1; i < trail.length; i++) gg.lineTo(nx(trail[i].col), ny(trail[i].row));
    gg.lineTo(marker.x, marker.y);
  };
  glow(g, build, [
    { w: (slowActive ? 7 : 5) + heat * 3 + beat * 2, c: col, a: 0.2 },
    { w: 3 + heat * 2.5 + beat * 2, c: col, a: 1 },
  ]);
}

function drawSolarWind() {
  const g = G.solar; g.clear();
  const sw = powerups.getSolarWind();
  if (!sw) return;
  const d = sw.dir, t = now() / 1000;
  const half = Math.hypot(field.w, field.h) / 2;
  const px = -d.y, py = d.x;
  for (let i = 0; i < 30; i++) {
    const b = (i / 30) * 2 - 1 + Math.sin(i * 12.9) * 0.03;
    const a = (((t * 0.55) + i * 0.137) % 1) * 2 - 1;
    const x0 = CX + d.x * (a * half) + px * (b * half);
    const y0 = CY + d.y * (a * half) + py * (b * half);
    const fade = 1 - Math.abs(a);
    g.moveTo(x0 - d.x * 26, y0 - d.y * 26).lineTo(x0, y0)
      .stroke({ width: 1.6, color: POWERUPS.SOLARWIND.color, alpha: 0.14 * fade * (0.6 + 0.4 * Math.sin(t * 5 + i)) });
  }
}

function drawEnemies() {
  const g = G.enemy; g.clear();
  for (const b of blobs) (b.shape === "sheaf" ? drawSheaf : drawPoly)(g, b);
}
function drawSheaf(g, b) {
  const H = qixLines(b);
  if (!H.length) return;
  const N = H.length;
  // Two glow passes; newest sticks brightest.
  for (const pass of [{ w: 5, a: 0.12 }, { w: 1.6, a: 0.95 }]) {
    for (let i = 0; i < N; i++) {
      const age = i / N;
      const s = H[i];
      const c = (pass.w < 2 && i < 2) ? "#ffffff" : b.color;
      g.moveTo(s.ax, s.ay).lineTo(s.bx, s.by)
        .stroke({ width: pass.w, color: c, alpha: pass.a * (1 - age * 0.85), cap: "round" });
    }
  }
}
function drawPoly(g, b) {
  const verts = polyVerts(b);
  const Nv = verts.length, half = Nv >> 1;
  const ring = (gg) => { verts.forEach((v, i) => i === 0 ? gg.moveTo(v.x, v.y) : gg.lineTo(v.x, v.y)); gg.closePath(); };
  glow(g, ring, [{ w: 9, c: b.color, a: 0.12 }, { w: 4, c: b.color, a: 0.3 }, { w: 1.6, c: "#ffffff", a: 0.9 }]);
  // internal diagonals
  for (let i = 0; i < half; i++) {
    g.moveTo(verts[i].x, verts[i].y).lineTo(verts[i + half].x, verts[i + half].y)
      .stroke({ width: 1.6, color: b.color, alpha: 0.5 });
  }
  g.circle(b.x, b.y, 2.5).fill({ color: "#ffffff", alpha: 0.9 });
  if (b.hunter) {
    const dx = marker.x - b.x, dy = marker.y - b.y, d = Math.hypot(dx, dy);
    if (d > 0) {
      const reach = Math.min(d * 0.45, boundRadius(b) * 2.5);
      g.moveTo(b.x, b.y).lineTo(b.x + (dx / d) * reach, b.y + (dy / d) * reach)
        .stroke({ width: 1.2, color: b.color, alpha: 0.15 + 0.12 * Math.sin(b.t * 3.5) });
    }
  }
}

function drawSparx() {
  const g = G.sparx; g.clear();
  for (const s of sparxList) {
    const col = s.latched ? SPARX.latchColor : s.color;
    const pulse = 0.6 + 0.4 * Math.sin(s.t * 8 + (s.fast ? 1.5 : 0));
    for (let i = 0; i < s.tail.length; i++) {
      const a = (1 - i / s.tail.length) * 0.35 * pulse;
      g.circle(s.tail[i].x, s.tail[i].y, SPARX.radius * 0.55).fill({ color: col, alpha: a });
    }
    const r = SPARX.radius;
    const rot = s.t * (s.fast ? 6 : 3.5);
    diamond(g, s.x, s.y, r, rot, "#ffffff", 0.9 * pulse);
    diamond(g, s.x, s.y, r * 1.5, rot + Math.PI / 4, col, 0.55 * pulse);
  }
}
function diamond(g, x, y, r, rot, color, alpha) {
  const pts = [[0, -r], [r, 0], [0, r], [-r, 0]].map(([dx, dy]) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    return [x + dx * c - dy * s, y + dx * s + dy * c];
  });
  g.poly(pts.flat()).fill({ color, alpha });
}

function drawPowerUps() {
  const g = G.powerup; g.clear();
  const S = POWERUPS.iconScale;
  const draw = (type, x, y, angle = 0) => {
    const cfg = POWERUPS[type], col = cfg.color;
    // backing disc
    g.circle(x, y, 8 * S).fill({ color: col, alpha: 0.12 });
    const lw = 2.2;
    if (type === "FREEZE") {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        const dx = Math.sin(a) * 5 * S, dy = -Math.cos(a) * 5 * S;
        g.moveTo(x - dx, y - dy).lineTo(x + dx, y + dy).stroke({ width: lw, color: col });
      }
    } else if (type === "SOLARWIND") {
      for (let i = -1; i <= 1; i++) {
        const yo = i * 3 * S;
        g.moveTo(x - 3 * S, y + yo - 2 * S).lineTo(x, y + yo).lineTo(x + 3 * S, y + yo - 2 * S).stroke({ width: lw, color: col });
      }
    } else if (type === "BOOST") {
      g.poly([x + 1 * S, y - 5 * S, x - 2 * S, y, x + 1 * S, y, x - 1 * S, y + 5 * S, x + 3 * S, y - 1 * S, x, y - 1 * S]).fill(col);
    } else if (type === "SHIELD") {
      const pts = [];
      for (let i = 0; i < 5; i++) { const a = (i * 2 * Math.PI) / 5 - Math.PI / 2; pts.push(x + Math.cos(a) * 5 * S, y + Math.sin(a) * 5 * S); }
      g.poly(pts).stroke({ width: lw, color: col });
    } else if (type === "ZOOM") {
      g.circle(x, y, 3 * S).fill(col);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + angle;
        g.moveTo(x + Math.cos(a) * 4 * S, y + Math.sin(a) * 4 * S).lineTo(x + Math.cos(a) * 8 * S, y + Math.sin(a) * 8 * S).stroke({ width: lw, color: col });
      }
    }
  };
  for (const p of powerups.getPickups()) draw(p.type, field.x + p.col * CELL + CELL / 2, field.y + p.row * CELL + CELL / 2);
  const z = powerups.getZoom();
  if (z) draw("ZOOM", z.x, z.y, z.angle);
}

function drawMarker() {
  const g = G.marker; g.clear();
  let color = COLORS.marker, hot = false;
  if (mode === "cutting") { const pulse = 0.5 + 0.5 * Math.sin(now() / 70); color = pulse > 0.5 ? "#ffffff" : "#ff4d4d"; hot = true; }
  const angle = dir ? Math.atan2(dir.dy, dir.dx) : -Math.PI / 2;
  const r = MARKER.radius;
  // helper to place a local point into world space
  const c = Math.cos(angle), s = Math.sin(angle);
  const P = (lx, ly) => [marker.x + lx * c - ly * s, marker.y + lx * s + ly * c];
  // flame
  const flick = 0.6 + 0.4 * Math.sin(now() / 45);
  const flame = (hot ? r * 2.2 : r * 1.5) * flick;
  g.poly([...P(-r * 0.9, -r * 0.4), ...P(-r * 0.9 - flame, 0), ...P(-r * 0.9, r * 0.4)])
    .fill({ color: hot ? "#ffd24d" : "#7df9ff", alpha: 0.9 });
  // hull
  g.poly([...P(r * 1.6, 0), ...P(-r * 0.9, -r), ...P(-r * 0.4, 0), ...P(-r * 0.9, r)]).fill(color);
  // cockpit
  const [cx, cy] = P(r * 0.3, 0);
  g.circle(cx, cy, r * 0.28).fill({ color: "#ffffff", alpha: 0.95 });
  // ZOOM aim arrows
  if (powerups.isAiming()) {
    const rr = 28, pulse = 0.6 + 0.4 * Math.sin(now() / 150);
    beginTextNote();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      drawText(dx ? (dx < 0 ? "◀" : "▶") : (dy < 0 ? "▲" : "▼"), marker.x + dx * rr, marker.y + dy * rr,
        { size: 18, color: POWERUPS.ZOOM.color, weight: "700", align: "center", alpha: 0.6 + 0.4 * pulse });
    }
  }
}
// aim arrows share the text pool but are drawn mid-scene; guard so endText() at
// the end of render() still hides leftovers correctly (they're just pooled text).
function beginTextNote() { /* no-op marker for readability */ }

function drawParticles() {
  const g = G.particles; g.clear();
  for (const p of fx.getParticles()) {
    const k = Math.max(0, p.life / p.max);
    g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size).fill({ color: p.color, alpha: k });
  }
}

function drawDangerEdge(danger) {
  const g = G.vignette; g.clear();
  if (!danger || danger <= 0.02) return;
  const pulse = 0.6 + 0.4 * Math.sin(now() / 90);
  // approximate the radial vignette with a translucent border frame
  const a = 0.5 * danger * pulse;
  const t = 90;
  g.rect(0, 0, WIDTH, t).rect(0, HEIGHT - t, WIDTH, t).rect(0, 0, t, HEIGHT).rect(WIDTH - t, 0, t, HEIGHT)
    .fill({ color: "#ff1e1e", alpha: a * 0.5 });
}

function wipeRadius(transT) {
  const w = (transT - TIMING.completeScore - TIMING.completeHold) / TIMING.completeWipe;
  if (w <= 0) return 0;
  const t = Math.min(w, 1);
  return (1 - (1 - t) * (1 - t)) * (MAXR + 30);
}

function dim(alpha) { G.overlay.rect(0, 0, WIDTH, HEIGHT).fill({ color: "#05030f", alpha }); }
function fmt(n) { return Math.round(n).toLocaleString(); }
const nx = (col) => field.x + col * CELL;
const ny = (row) => field.y + row * CELL;

// --- HUD + overlays --------------------------------------------------------
function drawHUD(scorePulseT) {
  const L = game.currentLevel();
  drawText(`ZONE ${L.label}`, 12, 10, { size: 18, color: theme().frontier });
  drawText(`${percent.toFixed(0)}/${L.target}%`, 110, 10, { size: 18 });
  drawText("♥".repeat(game.lives), 220, 10, { size: 18, color: COLORS.marker });
  if (game.levelMult > 1) drawText(`×${game.levelMult}`, 330, 10, { size: 18, color: COLORS.hudAccent });
  const p = scorePulseT < TIMING.scorePulse ? 1 - scorePulseT / TIMING.scorePulse : 0;
  drawText(`SCORE ${fmt(game.score)}`, WIDTH - 12, 10, { size: 18 + 6 * p, color: p > 0 ? theme().frontier : COLORS.hud, weight: "700", align: "right" });

  const active = powerups.getActiveEffects();
  const rows = [["freeze", POWERUPS.FREEZE], ["boost", POWERUPS.BOOST], ["shield", POWERUPS.SHIELD], ["solarwind", POWERUPS.SOLARWIND]].filter(([k]) => active[k] > 0);
  let ex = 12;
  for (const [key, cfg] of rows) {
    const label = `${cfg.label} ${active[key].toFixed(1)}s`;
    const t = drawText(label, ex, 30, { size: 13, color: cfg.color });
    ex += t.width + 16;
  }
}

function drawPopups(popups) {
  const col = theme().frontier;
  for (const p of popups) {
    const k = Math.min(1, p.t / TIMING.popupLife);
    drawText(p.text, p.x, p.y - 18 - k * 30, { size: 28, color: col, weight: "700", align: "center", alpha: 1 - k * k });
  }
}

function drawReward(r) {
  if (!r) return;
  const life = TIMING.rewardLife;
  const alpha = r.t < life * 0.8 ? 1 : Math.max(0, (life - r.t) / (life * 0.2));
  const top = CY - 70;
  if (r.labels.length) centerText(r.labels.join("   "), top, 26, COLORS.hudAccent, alpha, "800");
  centerText(`${fmt(r.base)}   ×${r.mult}${r.killPts > 0 ? ` +${fmt(r.killPts)}` : ""}`, top + 48, 28, COLORS.hud, alpha, "800");
  centerText(`+${fmt(r.total)}`, top + 110, 56, theme().frontier, alpha, "900");
}

function drawTitle() {
  centerText("COSMIC CUT", CY - 40, 72, COLORS.frontier);
  centerText("carve the cosmos", CY + 18, 22, COLORS.hud, 1, "500");
  centerText("press any key", CY + 86, 20, COLORS.hudAccent, 0.55 + 0.45 * Math.abs(Math.sin(now() / 600)), "600");
  centerText("M  mute     ·     N  music", HEIGHT - 48, 15, COLORS.locked, 1, "500");
}

function drawMenu(menuSel) {
  centerText("COSMIC CUT", 140, 56, COLORS.frontier);
  if (game.highScore > 0) centerText(`HI  ${fmt(game.highScore)}`, 192, 22, COLORS.hudAccent, 1, "700");
  centerText("select a starting zone", 234, 20, COLORS.hud, 1, "500");
  const n = zoneCount, gap = 110, startX = WIDTH / 2 - ((n - 1) * gap) / 2, y = HEIGHT / 2 + 20;
  for (let z = 1; z <= n; z++) {
    const x = startX + (z - 1) * gap;
    const locked = z > game.unlockedZone, selected = z === menuSel;
    G.overlay.rect(x - 40, y - 40, 80, 80).stroke({ width: selected ? 3 : 1.5, color: locked ? COLORS.locked : selected ? COLORS.hudAccent : COLORS.arena });
    drawText(String(z), x, y - 6, { size: 30, color: locked ? COLORS.locked : selected ? COLORS.hudAccent : COLORS.frontier, weight: "700", align: "center" });
    drawText(locked ? "LOCKED" : `${z}-1`, x, y + 28, { size: 13, color: locked ? COLORS.locked : COLORS.hud, weight: "500", align: "center" });
  }
  centerText("← →  select        ENTER  start", HEIGHT - 78, 18, COLORS.hud, 1, "500");
  centerText("M  mute     ·     N  music", HEIGHT - 48, 15, COLORS.locked, 1, "500");
}

function drawIntro() {
  const L = game.currentLevel();
  centerText(`ZONE ${L.label}`, CY - 30, 52, theme().frontier);
  centerText(L.boss ? `BOSS — CLAIM ${L.target}%` : `CLAIM ${L.target}%`, CY + 24, 26, COLORS.hudAccent, 1, "600");
  centerText("press a direction to begin", CY + 72, 17, COLORS.hud, 1, "500");
  centerText("hold SPACE while cutting for a SLOW DRAW — double points, dark glass", CY + 104, 14, COLORS.locked, 1, "500");
}

function drawDeathFlash(p, transT) {
  centerText("CAUGHT!", field.y + 64, 40, COLORS.marker);
  if (p) {
    const blink = 0.5 + 0.5 * Math.sin(transT * 12);
    G.overlay.circle(p.x, p.y, 12 + 6 * blink).fill({ color: COLORS.marker, alpha: 0.45 + 0.55 * blink });
  }
  if (transT >= TIMING.deathHold) centerText("press any key to continue", field.y + 100, 18, COLORS.hud, 1, "500");
}

function drawLevelCompleteBanner(transT) {
  const wipeR = wipeRadius(transT);
  if (wipeR > 0 && wipeR < MAXR + 30) G.overlay.circle(CX, CY, wipeR).stroke({ width: 4, color: theme().frontier });
  const pop = Math.min(1, (transT - TIMING.completeScore) / 0.25);
  if (pop > 0) centerText("LEVEL COMPLETE", CY, 46 * pop, COLORS.marker);
}

function drawGameOver() {
  dim(0.78);
  centerText("GAME OVER", CY - 56, 48, COLORS.hudAccent);
  centerText(`SCORE ${fmt(game.score)}`, CY - 6, 28, COLORS.hud, 1, "700");
  if (game.newHigh) centerText("★ NEW HIGH SCORE ★", CY + 36, 26, theme().frontier, 0.6 + 0.4 * Math.sin(now() / 140), "800");
  else centerText(`HI  ${fmt(game.highScore)}`, CY + 36, 22, COLORS.locked, 1, "600");
  centerText("press any key — start screen", CY + 78, 20, COLORS.hud, 1, "500");
}

function drawCampaignComplete() {
  dim(0.82);
  centerText("CAMPAIGN COMPLETE", CY - 60, 46, COLORS.frontier);
  centerText(`FINAL SCORE ${fmt(game.score)}`, CY - 8, 28, COLORS.hudAccent, 1, "700");
  if (game.newHigh) centerText("★ NEW HIGH SCORE ★", CY + 32, 24, theme().frontier, 1, "800");
  else centerText(`HI  ${fmt(game.highScore)}`, CY + 32, 22, COLORS.locked, 1, "600");
  centerText("you cleared all five zones — press any key", CY + 72, 20, COLORS.hud, 1, "500");
}

function drawPaused() {
  dim(0.6);
  centerText("PAUSED", CY - 18, 52, COLORS.frontier);
  centerText("P / ESC  resume     ·     M  mute     ·     N  music", CY + 40, 17, COLORS.hud, 1, "500");
}

// --- The frame -------------------------------------------------------------
export function render(view = {}) {
  if (!app) return;
  const { transT = 0, menuSel = 1, popups = [], reward = null, deathPoint = null, scorePulseT = 99, danger = 0, beat = 0, paused = false } = view;

  // Pixi display objects persist between frames, so wipe every layer up front
  // (and reset any shake offset) — otherwise the previous state's scene lingers
  // behind, e.g. the play field showing through the title screen.
  for (const key in G) { G[key].clear(); G[key].x = 0; G[key].y = 0; }
  beginText();

  drawBackground(beat);

  if (game.state === "title") { drawTitle(); finishFrame(); return; }
  if (game.state === "menu") { drawMenu(menuSel); finishFrame(); return; }

  // Apply screen shake to the world layers via stage position offset.
  const off = fx.shakeOffset ? fx.shakeOffset() : { x: 0, y: 0 };

  if (game.state === "levelcomplete") {
    drawClaimed(wipeRadius(transT));
    [G.seams, G.perimeter, G.trail, G.solar, G.enemy, G.sparx, G.powerup].forEach(g => g.clear());
    drawArena();
    drawParticles();
    drawMarker();
    drawHUD(scorePulseT);
    if (transT < TIMING.completeScore) drawReward(reward);
    else drawLevelCompleteBanner(transT);
    applyShake(off);
    finishFrame();
    return;
  }

  drawClaimed();
  drawSeams();
  drawArena();
  drawPerimeter(beat);
  drawTrail(beat);
  drawSolarWind();
  drawEnemies();
  drawSparx();
  drawPowerUps();
  drawMarker();
  drawParticles();
  drawDangerEdge(danger);

  drawPopups(popups);
  drawReward(reward);
  drawHUD(scorePulseT);

  if (game.state === "intro") drawIntro();
  else if (game.state === "dead") drawDeathFlash(deathPoint, transT);
  else if (game.state === "gameover") drawGameOver();
  else if (game.state === "campaigncomplete") drawCampaignComplete();
  if (paused) drawPaused();

  applyShake(off);
  finishFrame();
}

// World layers shake; UI/overlay stays steady (matches the canvas renderer).
function applyShake(off) {
  const worldLayers = [G.glass, G.seams, G.arena, G.perimeter, G.trail, G.solar, G.enemy, G.sparx, G.powerup, G.marker, G.particles];
  for (const g of worldLayers) { g.x = off.x; g.y = off.y; }
}

function finishFrame() {
  endText();
  app.render();
}
