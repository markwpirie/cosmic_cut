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

import { Application, Container, Graphics, Sprite, TilingSprite, Texture, Text, Rectangle, DisplacementFilter } from "pixi.js";
import { AdvancedBloomFilter } from "pixi-filters";
import { WIDTH, HEIGHT, field, CELL, COLS, ROWS, COLORS, THEMES, TIMING, POWERUPS, QIX, BLOB_POLY, SPARX, MARKER, BLOOM, CORNERS, GLASS, NEBULA, STARFIELD } from "./config.js";
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
let dispSprite = null; // noise map driving the nebula smoke-warp DisplacementFilter
let refractSprite = null; // nebula copy, extra-displaced + glass-masked → refraction
let refractMask = null;   // glass-shape mask (in bgRoot space) for refractSprite
let worldRoot = null; // shaken container holding the play-field glow layers
let glassMask = null; // union of claimed cells, used to clip the specular sweep to glass
let sweepGroup = null; // masked container holding the additive reflection TilingSprites
let sweepA = null, sweepB = null; // two parallax reflection layers
let sweepLast = 0;    // timestamp for sweep scroll dt
let stormTimer = 3;   // seconds until the next ambient void lightning strike
let storm = null;     // { x0,y0,x1,y1,life,max } the current ambient bolt
let stormFlash = 0;   // brief screen-flash envelope after a strike
let starsState = null;
let starLast = 0;
let starWind = STARFIELD.baseAngle; // current scroll heading; rotates slowly each frame

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

  // Create all named Graphics layers up front; we parent them into the right
  // container below. (`render()` clears every one of these each frame.)
  const allLayers = [
    "stars", "glass", "seams", "arena", "perimeter", "trail",
    "solar", "enemy", "sparx", "powerup", "marker", "particles", "vignette", "overlay",
  ];
  for (const name of allLayers) G[name] = new Graphics();

  // --- Layer tree (Phase 9 §1 bloom) ---------------------------------------
  // bloomGroup gets the AdvancedBloomFilter so the whole lit scene glows as one
  // (cross-layer halation, not per-stroke fakery). Inside it:
  //   bgRoot   — nebula sprite + parallax stars (glow, never shakes)
  //   worldRoot— the play field + actors (glow AND shakes on screen-shake)
  // The HUD/overlay text and the danger/dim frames sit OUTSIDE the bloom so they
  // stay crisp and readable.
  const bloomGroup = new Container();
  const bgRoot = new Container();
  worldRoot = new Container();

  bgSprite = new Sprite(bakeDeepSpaceTexture());
  bgSprite.anchor.set(0.5);                  // centre-anchored so it can drift/breathe/rotate
  bgSprite.position.set(WIDTH / 2, HEIGHT / 2);
  // Smoke-warp: an oversized noise map (renderable:false — it only supplies the texture
  // + transform) drives a DisplacementFilter on the nebula so it churns like volumetric
  // smoke. Scrolling/rotating the map each frame animates the turbulence.
  if (NEBULA.warp > 0) {
    dispSprite = new Sprite(bakeNoiseTexture());
    dispSprite.anchor.set(0.5);
    dispSprite.width = WIDTH * 1.5; dispSprite.height = HEIGHT * 1.5;
    dispSprite.position.set(WIDTH / 2, HEIGHT / 2);
    // Stays renderable so its transform actually updates each frame (renderable:false
    // can freeze the transform in v8 → no churn). It's added BEHIND the opaque, oversized
    // nebula, so the noise itself is never visible — bgSprite covers it.
    bgRoot.addChild(dispSprite);
    bgSprite.filters = [new DisplacementFilter({ sprite: dispSprite, scale: NEBULA.warp })];
  }
  bgRoot.addChild(bgSprite);

  // Glass refraction: a second copy of the nebula (same texture, transform-synced to
  // bgSprite each frame so it lines up), displaced MORE than the base, and masked to
  // the claimed-glass shape. Result: the gas bends where glass sits over it — refraction
  // — continuous with the un-bent nebula around it. Lives in bgRoot so it stays aligned
  // with the real nebula (no shake offset). 0 disables (saves a filtered draw).
  if (NEBULA.warp > 0 && GLASS.refraction > 0) {
    refractSprite = new Sprite(bgSprite.texture);
    refractSprite.anchor.set(0.5);
    refractSprite.filters = [new DisplacementFilter({ sprite: dispSprite, scale: GLASS.refraction })];
    refractMask = new Graphics();
    refractSprite.mask = refractMask;
    bgRoot.addChild(refractSprite, refractMask);
  }
  bgRoot.addChild(G.stars);

  worldRoot.addChild(G.glass); // claimed-glass fill + emissive rim

  // GLASS shimmer: two additive, diagonally-scrolling TilingSprites of a baked
  // streak/noise texture, grouped and clipped to the claimed shape by glassMask
  // (rebuilt each frame). Additive + transparency = organic drifting reflections
  // that let the starfield show through, instead of a flat painted band. The pair
  // gives parallax depth (B is larger + slower).
  const streak = bakeGlassStreakTexture();
  const SW = WIDTH + 128, SH = HEIGHT + 128; // oversize so screen-shake never exposes an edge
  sweepGroup = new Container();
  sweepA = new TilingSprite({ texture: streak, width: SW, height: SH });
  sweepB = new TilingSprite({ texture: streak, width: SW, height: SH });
  for (const s of [sweepA, sweepB]) { s.position.set(-64, -64); s.blendMode = "add"; s.tint = GLASS.tint; }
  sweepA.tileScale.set(GLASS.scaleA);
  sweepB.tileScale.set(GLASS.scaleB);
  sweepGroup.addChild(sweepB, sweepA); // far layer behind near layer
  glassMask = new Graphics();
  sweepGroup.mask = glassMask;
  worldRoot.addChild(sweepGroup, glassMask);

  for (const name of ["seams", "arena", "perimeter", "trail",
    "solar", "enemy", "sparx", "powerup", "marker", "particles"]) {
    worldRoot.addChild(G[name]);
  }

  bloomGroup.addChild(bgRoot, worldRoot);
  if (BLOOM.enabled) {
    const bloom = new AdvancedBloomFilter({
      threshold: BLOOM.threshold,
      bloomScale: BLOOM.bloomScale,
      brightness: BLOOM.brightness,
      blur: BLOOM.blur,
      quality: BLOOM.quality,
      pixelSize: { x: BLOOM.pixelSize, y: BLOOM.pixelSize }, // <1 supersamples (smoothest), >1 = blocky
    });
    // Render the bloom buffer at (at least) the screen's pixel density so the glow
    // isn't computed low-res and upscaled — the usual cause of a "pixelated" bloom.
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    bloom.resolution = BLOOM.resolution || dpr;
    bloomGroup.filters = [bloom];
    // Sample the full screen so glow isn't clipped to layer bounds.
    bloomGroup.filterArea = new Rectangle(0, 0, WIDTH, HEIGHT);
  }
  app.stage.addChild(bloomGroup);

  // Non-bloomed overlays on top, in paint order.
  app.stage.addChild(G.vignette, G.overlay);
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
// `cap` defaults to "round" (nice rounded ends for continuous polylines like the
// trail), but paths built from many disjoint per-cell segments (the perimeter)
// must use "butt" — round caps bulge + overlap-brighten at every node, which reads
// as a beaded/"pixely" line. See drawPerimeter.
function glow(g, build, passes, cap = "round") {
  for (const p of passes) {
    build(g);
    g.stroke({ width: p.w, color: p.c, alpha: p.a, cap, join: "round" });
  }
}

// A fake-3D glossy sphere: a soft outer glow, the shaded body, a lower-right shadow
// and an upper-left specular highlight — so cores/pickups/particles read as lit beads
// instead of flat discs. Light is assumed to come from the upper-left. With bloom the
// white specular blooms into a convincing glassy sheen. `glow` scales the outer halo.
function sphere(g, x, y, r, color, opts = {}) {
  const { glow = 0.2, light = 0xffffff } = opts;
  if (glow > 0) g.circle(x, y, r * 1.8).fill({ color, alpha: glow });        // soft outer glow
  g.circle(x, y, r).fill({ color, alpha: 0.95 });                            // body
  g.circle(x + r * 0.25, y + r * 0.3, r * 0.7).fill({ color: 0x000000, alpha: 0.26 }); // shadow side
  g.circle(x - r * 0.28, y - r * 0.32, r * 0.5).fill({ color, alpha: 0.65 }); // lit lobe
  g.circle(x - r * 0.3, y - r * 0.34, r * 0.22).fill({ color: light, alpha: 0.9 }); // specular
}

// --- Rainbow + lightning toolkit -------------------------------------------
// HSL hue (degrees) → 0xRRGGBB int. Used for rainbow Qix sheafs and electric arcs.
function hueColor(h, s = 1, l = 0.6) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1) { r = c; g = x; } else if (hh < 2) { r = x; g = c; }
  else if (hh < 3) { g = c; b = x; } else if (hh < 4) { g = x; b = c; }
  else if (hh < 5) { r = x; b = c; } else { r = c; b = x; }
  const m = l - c / 2, to = (v) => Math.round((v + m) * 255);
  return (to(r) << 16) | (to(g) << 8) | to(b);
}

// A jagged lightning path between two points (fresh jitter each call → flickers).
function boltPts(x0, y0, x1, y1, jitter, segs) {
  const pts = [{ x: x0, y: y0 }];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    pts.push({ x: x0 + (x1 - x0) * t + (Math.random() - 0.5) * jitter,
               y: y0 + (y1 - y0) * t + (Math.random() - 0.5) * jitter });
  }
  pts.push({ x: x1, y: y1 });
  return pts;
}
function strokePts(g, pts, w, c, a) {
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.stroke({ width: w, color: c, alpha: a, cap: "round", join: "round" });
}
// Electric arc: one jagged path, stroked as wide-coloured halo + white core + tinted core.
function drawBolt(g, x0, y0, x1, y1, color, opts = {}) {
  const { jitter = 14, segs = 6, w = 2, a = 1 } = opts;
  const pts = boltPts(x0, y0, x1, y1, jitter, segs);
  strokePts(g, pts, w * 3, color, a * 0.18);
  strokePts(g, pts, w, 0xffffff, a);
  strokePts(g, pts, w * 0.6, color, a * 0.85);
}

// Seamless, tileable streak+noise texture for the glass reflection TilingSprites.
// Diagonal bands (intensity follows (x+y) over a period that divides the tile, so it
// wraps cleanly) modulated by periodic sines for organic shimmer. White with alpha;
// the TilingSprite tints + additively blends it.
function bakeGlassStreakTexture() {
  const S = 256, P = 64; // S % P === 0 → diagonal bands tile seamlessly
  const cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const ctx2 = cv.getContext("2d");
  const img = ctx2.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = ((x + y) % P) / P;                         // 0..1 across a diagonal band
      let band = Math.exp(-(((u - 0.5) / 0.16) ** 2));     // soft main streak
      band += 0.30 * Math.exp(-(((u - 0.14) / 0.05) ** 2)); // a thin secondary glint
      const n = 0.5 + 0.5 * Math.sin((2 * Math.PI * (2 * x + y)) / S)
                            * Math.sin((2 * Math.PI * (x - 3 * y)) / S); // periodic → tiles
      const a = Math.max(0, Math.min(1, band * (0.16 + 0.40 * n)));
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = (a * 255) | 0;
    }
  }
  ctx2.putImageData(img, 0, 0);
  return wrapTexture(Texture.from(cv));
}

// Mark a texture's sampler as repeating (so scrolling/tiling has no seam). v8's exact
// wrap API varies a little between builds, so set it a couple of ways.
function wrapTexture(tex) {
  const src = tex.source;
  if (src) {
    if (src.style) { src.style.addressMode = "repeat"; src.style.update?.(); }
    src.addressModeU = "repeat"; src.addressModeV = "repeat";
  }
  return tex;
}

// Smooth, tileable RG noise for the nebula DisplacementFilter. R drives horizontal
// offset, G vertical; built from summed sines at integer frequencies over the tile so
// it wraps seamlessly when the map scrolls. Two different field mixes for R vs G give
// organic 2D churn rather than uniform shear.
function bakeNoiseTexture() {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const ctx2 = cv.getContext("2d");
  const img = ctx2.createImageData(S, S), d = img.data;
  const f = (x, y, fx, fy, ph) => Math.sin((2 * Math.PI * (fx * x + fy * y)) / S + ph);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = 0.5 + 0.26 * f(x, y, 1, 0, 0) + 0.15 * f(x, y, 0, 1, 1.3) + 0.09 * f(x, y, 2, 1, 2.1);
      const gg = 0.5 + 0.26 * f(x, y, 0, 1, 0.7) + 0.15 * f(x, y, 1, 0, 2.0) + 0.09 * f(x, y, 1, 2, 0.4);
      const i = (y * S + x) * 4;
      d[i] = Math.max(0, Math.min(255, r * 255)) | 0;
      d[i + 1] = Math.max(0, Math.min(255, gg * 255)) | 0;
      d[i + 2] = 128; d[i + 3] = 255;
    }
  }
  ctx2.putImageData(img, 0, 0);
  return wrapTexture(Texture.from(cv));
}

// --- Rounded territory edges (our signature look) --------------------------
// Trace the boundary of a cell region into continuous CLOSED loops of pixel points,
// so the edges can be stroked with rounded corners (round joins on disjoint per-cell
// segments can't do this — they just bead). `inside(r,c)` = is the cell part of the
// region (out-of-bounds counts as outside). Each region cell emits its EXPOSED sides
// as directed edges oriented region-on-the-left; we then walk start→end into loops.
function traceLoops(inside) {
  const edges = new Map(); // startKey "c,r" -> [{ec,er}, …]
  const add = (sc, sr, ec, er) => {
    const k = sc + "," + sr; const a = edges.get(k);
    if (a) a.push({ ec, er }); else edges.set(k, [{ ec, er }]);
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!inside(r, c)) continue;
      if (!inside(r - 1, c)) add(c + 1, r, c, r);         // top    → leftward
      if (!inside(r, c - 1)) add(c, r, c, r + 1);         // left   → downward
      if (!inside(r + 1, c)) add(c, r + 1, c + 1, r + 1); // bottom → rightward
      if (!inside(r, c + 1)) add(c + 1, r + 1, c + 1, r); // right  → upward
    }
  }
  const loops = [];
  const guardMax = COLS * ROWS * 4 + 16;
  for (const start of edges.keys()) {
    while ((edges.get(start) || []).length) {
      const pts = [];
      let cur = start, indir = null, guard = 0;
      while (guard++ < guardMax) {
        const list = edges.get(cur);
        if (!list || !list.length) break;
        const [cc, cr] = cur.split(",").map(Number);
        // At a pinch (node with >1 exit) prefer straight > left > right > back so loops
        // stay coherent instead of pairing branches arbitrarily.
        let pick = 0;
        if (list.length > 1 && indir) {
          let best = 9;
          for (let j = 0; j < list.length; j++) {
            const ox = Math.sign(list[j].ec - cc), oy = Math.sign(list[j].er - cr);
            const dot = indir.x * ox + indir.y * oy, cross = indir.x * oy - indir.y * ox;
            const rank = dot > 0 ? 0 : dot < 0 ? 3 : (cross > 0 ? 1 : 2);
            if (rank < best) { best = rank; pick = j; }
          }
        } else {
          pick = list.length - 1;
        }
        const e = list.splice(pick, 1)[0];
        pts.push({ x: nx(cc), y: ny(cr) });
        indir = { x: Math.sign(e.ec - cc), y: Math.sign(e.er - cr) };
        cur = e.ec + "," + e.er;
        if (cur === start) break;
      }
      if (pts.length >= 3) loops.push(simplifyLoop(pts));
    }
  }
  return loops;
}

// Drop points that sit mid-run (no direction change) so only real corners remain —
// keeps arcTo well-behaved and lets the corner radius smooth staircases.
function simplifyLoop(pts) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    if (Math.sign(b.x - a.x) === Math.sign(c.x - b.x) &&
        Math.sign(b.y - a.y) === Math.sign(c.y - b.y)) continue;
    out.push(b);
  }
  return out.length >= 3 ? out : pts;
}
function simplifyOpen(pts) {
  if (pts.length <= 2) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    if (Math.sign(b.x - a.x) === Math.sign(c.x - b.x) &&
        Math.sign(b.y - a.y) === Math.sign(c.y - b.y)) continue;
    out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Link a set of undirected unit segments (the interior glass seams) into maximal
// polyline chains so they can be drawn with rounded corners like everything else.
// segs: array of [aCol, aRow, bCol, bRow]. Returns arrays of {x,y} pixel points.
function traceChains(segs) {
  const nk = (x, y) => x + "," + y;
  const ek = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  const adj = new Map();
  const link = (k, n) => { const s = adj.get(k); if (s) s.add(n); else adj.set(k, new Set([n])); };
  for (const [ax, ay, bx, by] of segs) { const a = nk(ax, ay), b = nk(bx, by); link(a, b); link(b, a); }
  const pt = (k) => { const [c, r] = k.split(",").map(Number); return { x: nx(c), y: ny(r) }; };
  const used = new Set();
  const chains = [];
  const walk = (a, b) => {
    const path = [a, b]; used.add(ek(a, b));
    let prev = a, cur = b;
    while (true) {
      const nbrs = adj.get(cur);
      if (!nbrs || nbrs.size !== 2) break;        // stop at junctions + endpoints
      let next = null;
      for (const n of nbrs) if (n !== prev && !used.has(ek(cur, n))) { next = n; break; }
      if (next === null) break;
      used.add(ek(cur, next)); path.push(next); prev = cur; cur = next;
      if (cur === a) break;                        // closed loop
    }
    return path.map(pt);
  };
  for (const [k, nbrs] of adj) if (nbrs.size !== 2)            // chains anchored at ends/junctions
    for (const n of nbrs) if (!used.has(ek(k, n))) chains.push(walk(k, n));
  for (const [k, nbrs] of adj)                                // leftover pure loops
    for (const n of nbrs) if (!used.has(ek(k, n))) chains.push(walk(k, n));
  return chains;
}

// Issue path commands for a polyline with rounded corners (arcTo), radius R clamped
// per-corner to half the shorter adjacent edge. `closed` loops vs open trail.
function roundedPath(g, pts, R, closed) {
  const n = pts.length;
  if (n < 2) return;
  const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  if (R <= 0 || n === 2) {
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) g.lineTo(pts[i].x, pts[i].y);
    if (closed) g.closePath();
    return;
  }
  if (closed) {
    const s = { x: (pts[n - 1].x + pts[0].x) / 2, y: (pts[n - 1].y + pts[0].y) / 2 };
    g.moveTo(s.x, s.y);
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
      g.arcTo(cur.x, cur.y, next.x, next.y, Math.min(R, D(prev, cur) / 2, D(cur, next) / 2));
    }
    g.closePath();
  } else {
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n - 1; i++) {
      const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
      g.arcTo(cur.x, cur.y, next.x, next.y, Math.min(R, D(prev, cur) / 2, D(cur, next) / 2));
    }
    g.lineTo(pts[n - 1].x, pts[n - 1].y);
  }
}

// --- Baked deep-space texture (nebula + galaxies + dust) --------------------
const STAR_TINTS = ["#cfeaff", "#ffffff", "#bcdcff", "#ffe6c4", "#ffd0e8", "#d6c4ff"];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
// Organic, colourful nebula: many overlapping ADDITIVE gas daubs (so overlaps build
// luminous colour), a soft core glow (not a hard white disc), bright filament wisps,
// and dark dust lanes for structure. `cols` is an array of [r,g,b]; `flatten` squashes
// it vertically. Replaces the old clean radial "galaxy" that read as a white circle.
function bakeNebula(g, cx, cy, R, cols, flatten = 0.82) {
  const pick = () => cols[(Math.random() * cols.length) | 0];
  g.save();
  g.translate(cx, cy);
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 70; i++) {                       // glowing gas
    const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * R;
    const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad * flatten;
    const br = R * (0.10 + Math.random() * 0.30), c = pick();
    const grd = g.createRadialGradient(x, y, 0, x, y, br);
    grd.addColorStop(0, rgba(c, (0.045 + Math.random() * 0.085).toFixed(3)));
    grd.addColorStop(1, rgba(c, 0));
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, br, 0, Math.PI * 2); g.fill();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.55); // soft core, not a disc
  core.addColorStop(0, "rgba(255,255,255,0.15)");
  core.addColorStop(0.45, "rgba(210,230,255,0.05)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = core; g.beginPath(); g.arc(0, 0, R * 0.55, 0, Math.PI * 2); g.fill();
  g.lineCap = "round";                                  // soft flowing filament wisps
  for (let i = 0; i < 6; i++) {
    const c = pick();
    g.strokeStyle = rgba(c, (0.035 + Math.random() * 0.04).toFixed(3));
    g.lineWidth = 1 + Math.random() * 1.5;
    g.shadowBlur = 6 + Math.random() * 6; g.shadowColor = rgba(c, 0.5); // blur → wisp, not glyph
    let x = (Math.random() - 0.5) * R * 0.7, y = (Math.random() - 0.5) * R * flatten * 0.7;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 3; k++) {                        // smooth curves, not jagged lineTo
      const mx = x + (Math.random() - 0.5) * R * 0.5, my = y + (Math.random() - 0.5) * R * flatten * 0.5;
      x += (Math.random() - 0.5) * R * 0.55; y += (Math.random() - 0.5) * R * flatten * 0.55;
      g.quadraticCurveTo(mx, my, x, y);
    }
    g.stroke();
  }
  g.shadowBlur = 0;
  g.globalCompositeOperation = "source-over";           // dark dust lanes
  for (let i = 0; i < 6; i++) {
    const x = (Math.random() - 0.5) * R * 1.2, y = (Math.random() - 0.5) * R * flatten * 1.2;
    const br = R * (0.08 + Math.random() * 0.22);
    const grd = g.createRadialGradient(x, y, 0, x, y, br);
    grd.addColorStop(0, "rgba(4,3,10,0.55)"); grd.addColorStop(1, "rgba(4,3,10,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, br, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
function bakeDeepSpaceTexture() {
  const cv = document.createElement("canvas");
  cv.width = WIDTH; cv.height = HEIGHT;
  const g = cv.getContext("2d");
  g.fillStyle = COLORS.bg; g.fillRect(0, 0, WIDTH, HEIGHT);
  // Palette pass (Phase 9 §2): restrained, cyan-hero void. Retinted off the old
  // purple/magenta mix toward deep teal-blue and muted indigo, and dropped a touch
  // in alpha for a deeper near-black void — magenta is now reserved for boss energy
  // (see TODO §1 art-direction). Zone-independent, so safe regardless of THEMES.
  const clouds = [
    { x: WIDTH * 0.22, y: HEIGHT * 0.28, r: 320, c: "rgba(40,95,155,0.13)" },
    { x: WIDTH * 0.80, y: HEIGHT * 0.66, r: 360, c: "rgba(20,110,170,0.13)" },
    { x: WIDTH * 0.62, y: HEIGHT * 0.18, r: 240, c: "rgba(30,120,150,0.08)" },
    { x: WIDTH * 0.12, y: HEIGHT * 0.78, r: 280, c: "rgba(50,55,140,0.09)" },
    { x: WIDTH * 0.50, y: HEIGHT * 0.50, r: 420, c: "rgba(30,22,72,0.08)" },
  ];
  for (const n of clouds) {
    const rg = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    rg.addColorStop(0, n.c); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg; g.fillRect(0, 0, WIDTH, HEIGHT);
  }
  // Two colourful nebulae (blue/pink/teal + teal/green/red accent) — organic clouds
  // with filaments + dust, not white discs. Low per-daub alpha keeps the void dark.
  // Art pass: cooled palettes — the pink/warm daubs are gone so the void reads
  // cyan/teal/blue and magenta stays reserved for enemy & boss energy.
  bakeNebula(g, WIDTH * 0.74, HEIGHT * 0.28, 205, [[90, 150, 255], [110, 190, 235], [120, 225, 255], [190, 225, 245]], 0.85);
  bakeNebula(g, WIDTH * 0.20, HEIGHT * 0.72, 165, [[60, 220, 205], [120, 255, 200], [80, 140, 220], [110, 150, 255]], 0.80);
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
  const tt = t / 1000;
  // Opaque (alpha 1) so it fully hides the displacement-map sprite sitting behind it;
  // oversized + centre-anchored so the breathe/drift never exposes a screen edge. The
  // "pulse" now comes from scale-breathing + the smoke-warp, not alpha.
  bgSprite.alpha = 1;
  // Wander + rock the whole nebula so the gas clouds aren't pinned to fixed screen
  // spots. All amplitudes stay inside the oversize margin (NEBULA.scale) so no edge
  // shows. The lissajous (different x/y frequencies) gives a non-repeating drift.
  bgSprite.scale.set(NEBULA.scale + 0.04 * Math.sin(tt * 0.18));
  bgSprite.rotation = NEBULA.rotate * (0.7 * Math.sin(tt * 0.05) + 0.3 * Math.sin(tt * 0.13));
  bgSprite.x = WIDTH / 2 + NEBULA.drift * Math.sin(tt * 0.06);
  bgSprite.y = HEIGHT / 2 + NEBULA.drift * Math.cos(tt * 0.043);
  // Churn the smoke: a perpetual slow swirl (continuous rotation) plus a gentle drift of
  // the displacement map → the nebula curls and evolves. NEBULA.evolve scales the rate.
  if (dispSprite) {
    const e = NEBULA.evolve;
    dispSprite.rotation = tt * 0.12 * e;                       // perpetual swirl
    dispSprite.x = WIDTH / 2 + 55 * Math.sin(tt * 0.25 * e);   // drift
    dispSprite.y = HEIGHT / 2 + 55 * Math.cos(tt * 0.21 * e);
  }
  if (refractSprite) {                          // keep the refraction copy aligned to the nebula
    refractSprite.position.copyFrom(bgSprite.position);
    refractSprite.scale.copyFrom(bgSprite.scale);
    refractSprite.rotation = bgSprite.rotation;
    refractSprite.alpha = bgSprite.alpha;
  }
  const dt = Math.min(0.05, (t - starLast) / 1000);
  starLast = t;
  const ts = t / 1000;
  const boost = 1 + beat * 0.7;
  // Scroll the field along a heading that slowly rotates, so it doesn't always fall
  // straight N→S — over a minute the drift swings to a new direction. Each star keeps
  // its own speed (parallax) and wraps toroidally on both axes.
  starWind += dt * STARFIELD.windTurn;
  const wx = Math.cos(starWind), wy = Math.sin(starWind);
  const g = G.stars; g.clear();
  for (const s of starsState) {
    s.x += s.v * wx * dt;
    s.y += s.v * wy * dt;
    if (s.x < 0) s.x += WIDTH; else if (s.x > WIDTH) s.x -= WIDTH;
    if (s.y < 0) s.y += HEIGHT; else if (s.y > HEIGHT) s.y -= HEIGHT;
    const tw = 0.55 + 0.45 * Math.sin(ts * s.tws + s.tw);
    g.rect(s.x, s.y, s.size, s.size).fill({ color: s.tint, alpha: Math.min(1, s.a * tw * boost) });
  }

  // Ambient lightning storm in the void: every few seconds a forked bolt strikes from
  // the top, with a brief blue screen-flash. Drawn over the nebula (G.stars sits above
  // bgSprite), subtle enough not to fight the gameplay.
  stormTimer -= dt;
  if (stormTimer <= 0) {
    stormTimer = 5 + Math.random() * 8;
    const x0 = Math.random() * WIDTH;
    storm = { x0, y0: 0, x1: x0 + (Math.random() - 0.5) * 320, y1: HEIGHT * (0.35 + Math.random() * 0.5), life: 0.22, max: 0.22 };
    stormFlash = 0.6;
  }
  if (storm) {
    storm.life -= dt;
    if (storm.life <= 0) storm = null;
    else {
      const a = storm.life / storm.max;
      drawBolt(g, storm.x0, storm.y0, storm.x1, storm.y1, 0xaad4ff, { jitter: 34, segs: 11, w: 2, a: a * 0.55 });
      // a fork
      const fx2 = storm.x0 + (storm.x1 - storm.x0) * 0.55;
      const fy2 = storm.y1 * 0.55;
      drawBolt(g, fx2, fy2, fx2 + (Math.random() - 0.5) * 160, fy2 + 60 + Math.random() * 120, 0xaad4ff, { jitter: 22, segs: 7, w: 1.4, a: a * 0.4 });
    }
  }
  if (stormFlash > 0) {
    stormFlash -= dt * 3;
    g.rect(0, 0, WIDTH, HEIGHT).fill({ color: 0x2a4a7a, alpha: Math.max(0, stormFlash) * 0.12 });
  }
}

function drawClaimed(wipeR = -1) {
  const g = G.glass; g.clear();
  const th = theme();
  const fillNormal = th.claimedFill;
  const fillSlow = th.claimedFillSlow || COLORS.claimedFillSlow;

  const visible = (px, py) => !(wipeR >= 0 && Math.hypot(px + CELL / 2 - CX, py + CELL / 2 - CY) <= wipeR);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== FILLED) continue;
      const px = field.x + c * CELL, py = field.y + r * CELL;
      if (!visible(px, py)) continue;
      g.rect(px, py, CELL, CELL).fill(slowFill[r][c] ? fillSlow : fillNormal);
    }
  }

  // Glass treatment (Phase 9 §3): trace the claimed region's outline as continuous
  // loops and stroke it in the zone's hero colour with rounded corners — bloom turns
  // it into a crisp emissive rim, giving claimed territory the luminous-glass-panel
  // look. (visible() excludes wiped cells during the level-complete ripple.)
  const insideGlass = (rr, cc) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS &&
    grid[rr][cc] === FILLED && visible(field.x + cc * CELL, field.y + rr * CELL);
  const rimLoops = traceLoops(insideGlass);
  for (const lp of rimLoops) roundedPath(g, lp, CORNERS.radius, true);
  g.stroke({ width: 1.5, color: th.frontier, alpha: 0.55 });
}

// Glass reflection. Rebuild glassMask = the union of claimed cells (which clips the
// sweepGroup), then scroll the two additive TilingSprites diagonally. The texture's
// transparency + additive blend make it read as drifting light on glass, not a band.
function drawGlassSweep(wipeR = -1) {
  const gm = glassMask; gm.clear();
  const rm = refractMask; if (rm) rm.clear();
  let any = false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== FILLED) continue;
      const px = field.x + c * CELL, py = field.y + r * CELL;
      if (wipeR >= 0 && Math.hypot(px + CELL / 2 - CX, py + CELL / 2 - CY) <= wipeR) continue;
      gm.rect(px, py, CELL, CELL);
      if (rm) rm.rect(px, py, CELL, CELL);
      any = true;
    }
  }
  // Refraction: reveal the extra-displaced nebula copy only where glass is.
  if (refractSprite) {
    refractSprite.visible = any && GLASS.refraction > 0;
    if (refractSprite.visible) rm.fill({ color: 0xffffff });
  }
  const on = any && GLASS.opacity > 0;
  sweepGroup.visible = on;
  if (!on) return;
  gm.fill({ color: 0xffffff }); // mask coverage (colour irrelevant)

  const t = now();
  const dt = Math.min(0.05, (t - sweepLast) / 1000); sweepLast = t;
  const v = GLASS.speed * dt;                 // diagonal drift (scroll both axes)
  sweepA.tilePosition.x -= v;        sweepA.tilePosition.y -= v;
  sweepB.tilePosition.x -= v * 0.45; sweepB.tilePosition.y -= v * 0.45; // parallax: slower
  sweepA.alpha = GLASS.opacity;
  sweepB.alpha = GLASS.opacity * 0.6;
}

function drawSeams(wipeR = -1) {
  const g = G.seams; g.clear();
  // Collect the visible interior seam segments (as col/row node pairs), then link
  // them into chains and stroke with the same rounded corners as everything else.
  // During the level-complete ripple, cull any seam whose midpoint is inside the wipe
  // radius so the interior lines vanish WITH the glass (instead of lingering on the
  // already-wiped board).
  const culled = (mx, my) => wipeR >= 0 && Math.hypot(mx - CX, my - CY) <= wipeR;
  const segs = [];
  for (const key of seams) {
    const [kind, a, b] = key.split(":");
    const p = Number(a), q = Number(b);
    if (kind === "h") {
      if (cellSolid(p - 1, q) && cellSolid(p, q) && !culled(nx(q + 0.5), ny(p))) segs.push([q, p, q + 1, p]);
    } else {
      if (cellSolid(q, p - 1) && cellSolid(q, p) && !culled(nx(p), ny(q + 0.5))) segs.push([p, q, p, q + 1]);
    }
  }
  if (!segs.length) return;
  for (const ch of traceChains(segs)) roundedPath(g, simplifyOpen(ch), CORNERS.radius, false);
  g.stroke({ width: 1.25, color: theme().seam });
}

function drawArena() {
  const g = G.arena; g.clear();
  // Rounded so the arena's own corners (drawn on top of the glass) match the rounded
  // glass rim — otherwise the sharp rect corner shows through as a hard corner where
  // claimed glass meets a wall (e.g. the SE corner). Same radius keeps them aligned.
  glow(g, gg => gg.roundRect(field.x, field.y, field.w, field.h, CORNERS.radius), [
    { w: 6, c: theme().arena, a: 0.18 },
    { w: 2, c: theme().arena, a: 1 },
  ]);
}

function drawPerimeter(beat) {
  const g = G.perimeter; g.clear();
  const col = theme().frontier;
  // Trace the open region's outline as continuous loops, then stroke with rounded
  // corners — the perimeter is the boundary of the EMPTY area (against glass + walls).
  const loops = traceLoops((r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === EMPTY);
  if (!loops.length) return;
  const build = (gg) => { for (const lp of loops) roundedPath(gg, lp, CORNERS.radius, true); };
  glow(g, build, [
    { w: 7 + beat * 3, c: col, a: 0.16 },
    { w: 3.5 + beat * 2, c: col, a: Math.min(1, 0.85 + beat * 0.15) },
  ]); // round join/cap on continuous loops → smooth rounded corners
}

function drawTrail(beat) {
  const g = G.trail; g.clear();
  if (mode !== "cutting" || trail.length === 0) return;
  const heat = Math.min(1, trail.length / (2 * ROWS));
  const col = slowActive ? "#5fd0ff" : heat > 0.85 ? "#ff5a3c" : heat > 0.5 ? "#ffae3c" : theme().trail;
  // The live cut line, rounded to match the perimeter (its corners are our signature
  // look). Points = trail nodes + the marker's current sub-node position.
  const raw = trail.map((t) => ({ x: nx(t.col), y: ny(t.row) }));
  raw.push({ x: marker.x, y: marker.y });
  const pts = simplifyOpen(raw);
  const build = (gg) => roundedPath(gg, pts, CORNERS.radius, false);
  glow(g, build, [
    { w: (slowActive ? 7 : 5) + heat * 3 + beat * 2, c: col, a: 0.2 },
    { w: 3 + heat * 2.5 + beat * 2, c: col, a: 1 },
  ]);
}

// Danger crackle: when an enemy is closing on your exposed cut, electric arcs spit off
// the marker — rising with `danger` (0..1). Drawn into the trail layer (bloomed).
function drawCutCrackle(danger) {
  if (mode !== "cutting" || danger < 0.32) return;
  const g = G.trail, t = now() / 1000;
  const arcs = danger > 0.7 ? 2 : 1;
  for (let k = 0; k < arcs; k++) {
    if (Math.random() > danger) continue;
    const ang = Math.random() * Math.PI * 2, len = 10 + danger * 32;
    drawBolt(g, marker.x, marker.y, marker.x + Math.cos(ang) * len, marker.y + Math.sin(ang) * len,
      hueColor(t * 220 + k * 90), { jitter: 7, segs: 4, w: 1.4, a: 0.45 + danger * 0.45 });
  }
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
  const boss = b.boss;
  const t = now() / 1000;
  // BOSS sticks shimmer through the rainbow (its signature); regular Qix sticks glow in
  // the enemy's own neon colour, newest 2 white-hot. Boss gets a fatter, brighter set
  // of passes. (Rainbow is reserved for the boss so it reads as special.)
  const passes = boss
    ? [{ w: 11, a: 0.12 }, { w: 5, a: 0.45 }, { w: 1.8, a: 1 }]
    : [{ w: 5, a: 0.12 }, { w: 1.6, a: 0.95 }];
  for (const pass of passes) {
    for (let i = 0; i < N; i++) {
      const age = i / N;
      const s = H[i];
      const c = boss
        ? ((pass.w < 2 && i < 2) ? 0xffffff : hueColor(t * 80 + i * 16 + b.t * 30))
        : (i < 2 ? 0xffffff : b.color);
      g.moveTo(s.ax, s.ay).lineTo(s.bx, s.by)
        .stroke({ width: pass.w, color: c, alpha: pass.a * (1 - age * 0.85), cap: "round" });
    }
  }
  if (boss) { // a pulsing rainbow heart at the body centre
    const pulse = 0.65 + 0.35 * Math.sin(t * 4.5);
    g.circle(b.x, b.y, 18 * pulse).fill({ color: hueColor(t * 100), alpha: 0.45 });
    g.circle(b.x, b.y, 9 * pulse).fill({ color: hueColor(t * 100 + 120), alpha: 0.6 });
    g.circle(b.x, b.y, 4).fill({ color: 0xffffff, alpha: 0.95 });
  } else { // glowy 3D nucleus at the sheaf's body centre
    sphere(g, b.x, b.y, 5, b.color, { glow: 0.3 });
  }
  drawSheafLightning(g, b, H, t, boss);
}

// Electric crackle on the Qix: a flickering bolt along the live stick (constant on the
// boss, occasional otherwise) plus, for the boss, arcs lashing out around it.
function drawSheafLightning(g, b, H, t, boss) {
  const s = H[0]; // newest = live stick
  if (Math.random() < (boss ? 0.7 : 0.12)) {
    drawBolt(g, s.ax, s.ay, s.bx, s.by, boss ? hueColor(t * 120 + 40) : b.color,
      { jitter: boss ? 26 : 13, segs: boss ? 9 : 6, w: boss ? 2.4 : 1.5, a: boss ? 0.9 : 0.55 });
  }
  if (boss) {
    const arcs = 1 + (Math.random() * 2 | 0);
    for (let k = 0; k < arcs; k++) {
      if (Math.random() > 0.6) continue;
      const ang = Math.random() * Math.PI * 2, len = 70 + Math.random() * 150;
      drawBolt(g, b.x, b.y, b.x + Math.cos(ang) * len, b.y + Math.sin(ang) * len,
        hueColor(t * 120 + 180 + k * 60), { jitter: 24, segs: 8, w: 2, a: 0.6 });
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
  sphere(g, b.x, b.y, 4, b.color, { glow: 0.28 }); // glowy 3D core
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
    // backing: a glossy 3D sphere (lit bead) instead of a flat disc
    sphere(g, x, y, 8 * S, col, { glow: 0.16 });
    const lw = 2.2;
    const ink = "#ffffff"; // glyph drawn white so it reads on the coloured sphere
    if (type === "FREEZE") {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        const dx = Math.sin(a) * 5 * S, dy = -Math.cos(a) * 5 * S;
        g.moveTo(x - dx, y - dy).lineTo(x + dx, y + dy).stroke({ width: lw, color: ink });
      }
    } else if (type === "SOLARWIND") {
      for (let i = -1; i <= 1; i++) {
        const yo = i * 3 * S;
        g.moveTo(x - 3 * S, y + yo - 2 * S).lineTo(x, y + yo).lineTo(x + 3 * S, y + yo - 2 * S).stroke({ width: lw, color: ink });
      }
    } else if (type === "BOOST") {
      g.poly([x + 1 * S, y - 5 * S, x - 2 * S, y, x + 1 * S, y, x - 1 * S, y + 5 * S, x + 3 * S, y - 1 * S, x, y - 1 * S]).fill(ink);
    } else if (type === "SHIELD") {
      const pts = [];
      for (let i = 0; i < 5; i++) { const a = (i * 2 * Math.PI) / 5 - Math.PI / 2; pts.push(x + Math.cos(a) * 5 * S, y + Math.sin(a) * 5 * S); }
      g.poly(pts).stroke({ width: lw, color: ink });
    } else if (type === "ZOOM") {
      g.circle(x, y, 3 * S).fill(ink);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + angle;
        g.moveTo(x + Math.cos(a) * 4 * S, y + Math.sin(a) * 4 * S).lineTo(x + Math.cos(a) * 8 * S, y + Math.sin(a) * 8 * S).stroke({ width: lw, color: ink });
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
    const r = (p.size || 2) * (p.shrink ? 0.4 + 0.6 * k : 1);
    if (p.glow) {
      g.circle(p.x, p.y, r * 2.6).fill({ color: p.color, alpha: 0.16 * k });   // soft halo
      g.circle(p.x, p.y, r).fill({ color: p.color, alpha: Math.min(1, k) });   // body
      // offset hot highlight (upper-left) → reads as a lit 3D bead, not a flat dot
      g.circle(p.x - r * 0.3, p.y - r * 0.3, r * 0.5).fill({ color: "#ffffff", alpha: 0.6 * k });
    } else {
      g.rect(p.x - r / 2, p.y - r / 2, r, r).fill({ color: p.color, alpha: k });
    }
  }
}

function drawDangerEdge(danger) {
  const g = G.vignette; g.clear();
  if (!danger || danger <= 0.02) return;
  const pulse = 0.6 + 0.4 * Math.sin(now() / 90);
  const base = 0.5 * danger * pulse;
  // The old version stacked 4 full-length strips, so the corners got TWO reds on top
  // of each other → darker corners. Instead build the vignette from concentric frames,
  // each made of NON-overlapping strips (corners belong to one strip only), with alpha
  // fading inward for a soft glow creeping in from the edges.
  const bands = 6, depth = 100, step = depth / bands;
  const frame = (inset, thick, alpha) => {
    const w = WIDTH - 2 * inset, h = HEIGHT - 2 * inset;
    g.rect(inset, inset, w, thick)                              // top (full width)
     .rect(inset, inset + h - thick, w, thick)                 // bottom (full width)
     .rect(inset, inset + thick, thick, h - 2 * thick)         // left (between)
     .rect(inset + w - thick, inset + thick, thick, h - 2 * thick) // right (between)
     .fill({ color: "#ff1e1e", alpha });
  };
  for (let i = 0; i < bands; i++) {
    const k = 1 - i / bands;                 // outermost band brightest
    frame(i * step, step + 0.5, base * 0.55 * k * k);
  }
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
  drawText(`ZONE ${L.label}`, 12, 10, { size: 18, color: theme().accent || theme().frontier });
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
  centerText(`ZONE ${L.label}`, CY - 30, 52, theme().accent || theme().frontier);
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
  if (sweepGroup) sweepGroup.visible = false; // re-enabled by drawGlassSweep when glass exists
  if (refractSprite) refractSprite.visible = false; // ditto (glass refraction)
  beginText();

  drawBackground(beat);

  if (game.state === "title") { drawTitle(); finishFrame(); return; }
  if (game.state === "menu") { drawMenu(menuSel); finishFrame(); return; }

  // Apply screen shake to the world layers via stage position offset.
  const off = fx.shakeOffset ? fx.shakeOffset() : { x: 0, y: 0 };

  if (game.state === "levelcomplete") {
    drawClaimed(wipeRadius(transT));
    drawGlassSweep(wipeRadius(transT));
    drawSeams(wipeRadius(transT)); // interior lines vanish WITH the glass as the ripple passes
    [G.perimeter, G.trail, G.solar, G.enemy, G.sparx, G.powerup].forEach(g => g.clear());
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
  drawGlassSweep();
  drawSeams();
  drawArena();
  drawPerimeter(beat);
  drawTrail(beat);
  drawCutCrackle(danger);
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

// World container shakes as one; bg/stars, UI and overlays stay steady
// (matches the canvas renderer). Shaking the parent keeps the bloom coherent.
function applyShake(off) {
  if (worldRoot) { worldRoot.x = off.x; worldRoot.y = off.y; }
}

function finishFrame() {
  endText();
  app.render();
}
