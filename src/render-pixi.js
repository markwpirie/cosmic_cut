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
import { WIDTH, HEIGHT, field, CELL, COLS, ROWS, COLORS, THEMES, TIMING, POWERUPS, SPECIAL_BLOBS, QIX, BOSS, BLOB_POLY, SPARX, MARKER, RESPAWN, BLOOM, CORNERS, GLASS, NEBULA,STARFIELD, SHIP_TRAIL, SHIP_VIS, AMBIENT, ENERGY, IMPACT, GRID_BG, MOTES, VIGNETTE, HUD, MOBILE, TOUCH } from "./config.js";
import * as powerups from "./powerups.js";
import { grid, slowFill, EMPTY, FILLED, seams, cellSolid, percent } from "./grid.js";
import { marker, mode, dir, trail, slowActive, zoomDash } from "./marker.js";
import { blobs, qixLines, polyVerts, boundRadius } from "./enemy.js";
import { sparxList } from "./sparx.js";
import * as game from "./game.js";
import { zoneCount } from "./levels.js";
import * as fx from "./fx.js";

const CX = field.x + field.w / 2;
const CY = field.y + field.h / 2;
const MAXR = Math.hypot(field.w / 2, field.h / 2);
// Background/VFX scale: px radii in the bakes/effects were tuned on the 680-min
// desktop canvas; scale them by the current short side so mobile keeps proportions.
const BGS = Math.min(WIDTH, HEIGHT) / 680;
const FONT = HUD.font; // Orbitron with a system-ui fallback (loaded in index.html)
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
// Boss multi-stage escalation (presentation-only): stage = how many claim-%
// thresholds (BOSS.stages) have been crossed. The boss visibly angers per stage.
function bossStage() { return BOSS.stages.filter((s) => percent >= s).length; }
let bossFlareT = 0;   // countdown to the next stage-3 flare ring
let bossFlare = null; // { x, y, age } — the currently-expanding flare ring

let stormTimer = 3;   // seconds until the next ambient void lightning strike
let storm = null;     // { x0,y0,x1,y1,life,max } the current ambient bolt
let stormFlash = 0;   // brief screen-flash envelope after a strike
let starsState = null;
let starLast = 0;
let starWind = STARFIELD.baseAngle; // current scroll heading; rotates slowly each frame

// --- Ambient particles (presentation-only, renderer-local) ------------------
// Continuous emission (thruster embers, enemy wakes, sparx sparks, dust motes)
// lives here instead of fx.js — fx stays the gameplay-EVENT system main.js owns.
// Same particle shape as fx so drawParticles() renders both with one code path.
// Hard-capped at AMBIENT.max: when full, the oldest non-mote dies first.
const ambient = [];
let ambientLast = 0;
let ambDt = 0.016; // last frame's dt — lets draw-time emitters (enemies/sparx) rate-scale
function spawnAmbient(p) {
  if (ambient.length >= AMBIENT.max) {
    const i = ambient.findIndex(q => !q.mote);
    if (i < 0) return;            // board is all motes (shouldn't happen) — drop it
    ambient.splice(i, 1);
  }
  ambient.push(p);
}
function updateAmbient() {
  const t = now();
  const dt = Math.min(0.05, ambientLast ? (t - ambientLast) / 1000 : 0.016);
  ambientLast = t; ambDt = dt;
  for (let i = ambient.length - 1; i >= 0; i--) {
    const p = ambient[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.mote) {                 // motes are persistent — no drag; wrap the field instead of dying
      if (p.x < field.x) p.x += field.w; else if (p.x > field.x + field.w) p.x -= field.w;
      if (p.y < field.y) p.y += field.h; else if (p.y > field.y + field.h) p.y -= field.h;
      continue;
    }
    if (p.grav) p.vy += 260 * dt;
    p.vx *= Math.exp(-dt * 2.2); p.vy *= Math.exp(-dt * 2.2);
    p.life -= dt;
    if (p.life <= 0) ambient.splice(i, 1);
  }
  return dt;
}
function clearAmbient() { // drop transient particles (menus, level loads); keep motes
  for (let i = ambient.length - 1; i >= 0; i--) if (!ambient[i].mote) ambient.splice(i, 1);
}

// Persistent dust motes: slow drift, twinkle, wrap the field rect. Seeded once at init.
function seedMotes() {
  for (let i = 0; i < MOTES.count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = MOTES.speedMin + Math.random() * (MOTES.speedMax - MOTES.speedMin);
    ambient.push({
      x: field.x + Math.random() * field.w, y: field.y + Math.random() * field.h,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 1, max: 1, size: 1 + Math.random(),
      color: "#bfe9ff", mote: true,
      phase: Math.random() * Math.PI * 2, tw: 0.6 + Math.random() * 1.2, // twinkle phase/speed
    });
  }
}

// --- Ship visibility: spawn beacon + riding locator (config.SHIP_VIS) --------
// The beacon re-fires whenever a level (re)starts or the ship respawns, so the eye
// finds the ship instantly even while it sits still on the bright perimeter.
let beaconT = 99;      // seconds since the beacon was triggered
let prevStateR = null; // renderer-side state tracker (main.js owns the real machine)
function updateBeacon() {
  if (game.state !== prevStateR) {
    if (game.state === "intro" || (prevStateR === "dead" && game.state === "playing")) beaconT = 0;
    prevStateR = game.state;
  }
  beaconT += ambDt;
}

// --- Ship ribbon trail (Phase 9 art pass step 3) -----------------------------
// A glowing tail that streams behind the rocket: timestamped points recorded as
// the ship moves, drawn as per-segment tapered strokes (Pixi strokes are uniform
// width, so the taper needs one stroke per segment). Bloom supplies the glow.
const ribbon = [];
function updateRibbon(dt) {
  const t = now();
  const last = ribbon[ribbon.length - 1];
  if (!last || Math.hypot(marker.x - last.x, marker.y - last.y) >= SHIP_TRAIL.minDist) {
    ribbon.push({ x: marker.x, y: marker.y, t });
  }
  while (ribbon.length && (t - ribbon[0].t) / 1000 > SHIP_TRAIL.life) ribbon.shift();

  // Thruster embers stream from the tail while the ship is actually moving.
  if (dir && last && (marker.x !== last.x || marker.y !== last.y)) {
    const rate = zoomDash ? SHIP_TRAIL.emitDash : mode === "cutting" ? SHIP_TRAIL.emitCut : SHIP_TRAIL.emitRide;
    const angle = Math.atan2(dir.dy, dir.dx);
    const tx = marker.x - Math.cos(angle) * MARKER.radius * 1.2;
    const ty = marker.y - Math.sin(angle) * MARKER.radius * 1.2;
    let n = rate * dt + Math.random(); // fractional accumulation without module state
    for (; n >= 1; n--) {
      const hot = mode === "cutting" || zoomDash;
      const back = angle + Math.PI + (Math.random() - 0.5) * 0.7;
      const sp = 30 + Math.random() * 50;
      spawnAmbient({
        x: tx + (Math.random() - 0.5) * 3, y: ty + (Math.random() - 0.5) * 3,
        vx: Math.cos(back) * sp, vy: Math.sin(back) * sp,
        life: 0.2 + Math.random() * 0.2, max: 0.4,
        size: hot ? 2.4 : 1.8,
        color: zoomDash ? (Math.random() < 0.5 ? SHIP_TRAIL.colorDash : "#ffffff")
             : hot ? (Math.random() < 0.4 ? "#ffffff" : SHIP_TRAIL.colorCut)
             : theme().trail,
        glow: true, shrink: true,
      });
    }
  }
}
function drawRibbon() {
  const g = G.ribbon;
  const t = now();
  const col = zoomDash ? SHIP_TRAIL.colorDash
    : mode === "cutting" ? (slowActive ? SHIP_TRAIL.colorSlow : SHIP_TRAIL.colorCut)
    : theme().trail;
  for (let i = 1; i < ribbon.length; i++) {
    const a = ribbon[i - 1], b = ribbon[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) > 40) continue; // respawn teleport — don't streak
    const age = Math.min(1, (t - b.t) / 1000 / SHIP_TRAIL.life);
    if (age >= 1) continue;                              // fully faded (e.g. frozen on death)
    g.moveTo(a.x, a.y).lineTo(b.x, b.y)
      .stroke({ width: Math.max(0.5, SHIP_TRAIL.width * (1 - age)), color: col, alpha: SHIP_TRAIL.alpha * (1 - age) * (1 - age), cap: "round" });
  }
}

// Text pool — reuse Text objects across frames (creating them per frame is slow).
let uiLayer = null;
let uiGfx = null;    // HUD chrome Graphics (cleared each frame, under the text pool)
const textPool = [];
let textIdx = 0;
let dispPct = 0;     // displayed claim % — eases toward the real percent (HUD.ease)
let pctFlashT = 99;  // seconds since the last claim jump (drives the bar's white flash)
let lastPct = 0;

export async function init(canvas) {
  // Wait (briefly) for the sci-fi HUD face so Text metrics are measured with the real
  // font. Offline / slow network falls through to system-ui after 1.5s — never blocks.
  if (typeof document !== "undefined" && document.fonts?.load) {
    try {
      await Promise.race([
        document.fonts.load("16px Orbitron"),
        new Promise((res) => setTimeout(res, 1500)),
      ]);
    } catch { /* fall back silently */ }
  }
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
    "stars", "grid", "glass", "seams", "arena", "perimeter", "trail",
    "solar", "enemy", "sparx", "powerup", "ribbon", "marker", "particles", "vignette", "overlay",
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

  worldRoot.addChild(G.grid);  // faint holo-lattice over the unclaimed void (under everything)
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
    "solar", "enemy", "sparx", "powerup", "ribbon", "marker", "particles"]) {
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

  // Corner-darkening vignette: baked once, zero per-frame cost, sits above the bloomed
  // scene but below the danger-edge frame (G.vignette, which stays its own thing).
  if (VIGNETTE.alpha > 0) app.stage.addChild(new Sprite(bakeVignetteTexture()));

  // Non-bloomed overlays on top, in paint order.
  app.stage.addChild(G.vignette, G.overlay);
  uiLayer = new Container();
  app.stage.addChild(uiLayer);
  uiGfx = new Graphics();       // HUD chrome (brackets, claim bar, ship glyphs) —
  uiLayer.addChild(uiGfx);      // added FIRST so all pooled Text sits above it

  initStars();
  seedMotes();
}

// Faint holographic lattice over the UNCLAIMED void — run-based segments so the grid
// only exists where cells are EMPTY, and visibly gives way to glass as you claim.
// Alpha stays below the bloom threshold: it's depth, not glow.
function drawHoloGrid() {
  const g = G.grid;
  const a = GRID_BG.alpha * (0.8 + 0.2 * Math.sin(now() / 1400)); // gentle breathing
  const N = GRID_BG.spacing;
  for (let r = N; r < ROWS; r += N) {          // horizontal lines along lattice row r
    const y = field.y + r * CELL;
    let run = -1;
    for (let c = 0; c <= COLS; c++) {
      const open = c < COLS && grid[r][c] === EMPTY && grid[r - 1][c] === EMPTY;
      if (open && run < 0) run = c;
      else if (!open && run >= 0) {
        g.moveTo(field.x + run * CELL, y).lineTo(field.x + c * CELL, y)
          .stroke({ width: 1, color: GRID_BG.color, alpha: a });
        run = -1;
      }
    }
  }
  for (let c = N; c < COLS; c += N) {          // vertical lines along lattice col c
    const x = field.x + c * CELL;
    let run = -1;
    for (let r = 0; r <= ROWS; r++) {
      const open = r < ROWS && grid[r][c] === EMPTY && grid[r][c - 1] === EMPTY;
      if (open && run < 0) run = r;
      else if (!open && run >= 0) {
        g.moveTo(x, field.y + run * CELL).lineTo(x, field.y + r * CELL)
          .stroke({ width: 1, color: GRID_BG.color, alpha: a });
        run = -1;
      }
    }
  }
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
// Overlay text scale: the big Orbitron sizes were tuned on the 800-wide desktop
// canvas; on the 440-wide portrait canvas they'd overflow. HUD text is untouched
// (drawText direct, explicitly sized per device via config.HUD).
const TXT_SCALE = MOBILE ? WIDTH / 640 : 1;
function centerText(str, y, size, color, alpha = 1, weight = "700") {
  return drawText(str, WIDTH / 2, y, { size: size * TXT_SCALE, color, weight, align: "center", alpha });
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

// Corner-darkening vignette: a radial gradient baked once to a full-screen texture.
// Transparent centre → deep void colour at the corners; drawn as a plain Sprite so
// there's zero per-frame cost and no extra filter on the GPU budget.
function bakeVignetteTexture() {
  const cv = document.createElement("canvas");
  cv.width = WIDTH; cv.height = HEIGHT;
  const ctx2 = cv.getContext("2d");
  const R = Math.hypot(WIDTH, HEIGHT) / 2;
  const grad = ctx2.createRadialGradient(WIDTH / 2, HEIGHT / 2, R * VIGNETTE.inner, WIDTH / 2, HEIGHT / 2, R);
  grad.addColorStop(0, "rgba(2, 2, 12, 0)");
  grad.addColorStop(1, `rgba(2, 2, 12, ${VIGNETTE.alpha})`);
  ctx2.fillStyle = grad;
  ctx2.fillRect(0, 0, WIDTH, HEIGHT);
  return Texture.from(cv);
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
  // Radii scale with the canvas short side (tuned on the 680-min desktop) so the
  // portrait mobile bake keeps the same cloud-to-canvas proportions.
  const clouds = [
    { x: WIDTH * 0.22, y: HEIGHT * 0.28, r: 320 * BGS, c: "rgba(40,95,155,0.13)" },
    { x: WIDTH * 0.80, y: HEIGHT * 0.66, r: 360 * BGS, c: "rgba(20,110,170,0.13)" },
    { x: WIDTH * 0.62, y: HEIGHT * 0.18, r: 240 * BGS, c: "rgba(30,120,150,0.08)" },
    { x: WIDTH * 0.12, y: HEIGHT * 0.78, r: 280 * BGS, c: "rgba(50,55,140,0.09)" },
    { x: WIDTH * 0.50, y: HEIGHT * 0.50, r: 420 * BGS, c: "rgba(30,22,72,0.08)" },
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
  bakeNebula(g, WIDTH * 0.74, HEIGHT * 0.28, 205 * BGS, [[90, 150, 255], [110, 190, 235], [120, 225, 255], [190, 225, 245]], 0.85);
  bakeNebula(g, WIDTH * 0.20, HEIGHT * 0.72, 165 * BGS, [[60, 220, 205], [120, 255, 200], [80, 140, 220], [110, 150, 255]], 0.80);
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
    storm = { x0, y0: 0, x1: x0 + (Math.random() - 0.5) * WIDTH * 0.4, y1: HEIGHT * (0.35 + Math.random() * 0.5), life: 0.22, max: 0.22 };
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
      drawBolt(g, fx2, fy2, fx2 + (Math.random() - 0.5) * WIDTH * 0.2, fy2 + 60 + Math.random() * 120, 0xaad4ff, { jitter: 22, segs: 7, w: 1.4, a: a * 0.4 });
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
  const cfg = POWERUPS.SOLARWIND;
  const d = sw.dir, t = now() / 1000;
  const half = Math.hypot(field.w, field.h) / 2;
  const px = -d.y, py = d.x;
  // Streaks: stronger + wider than the original (was 1.6px/0.14 peak alpha —
  // barely visible). Same scrolling-band layout, just louder.
  for (let i = 0; i < 30; i++) {
    const b = (i / 30) * 2 - 1 + Math.sin(i * 12.9) * 0.03;
    const a = (((t * 0.55) + i * 0.137) % 1) * 2 - 1;
    const x0 = CX + d.x * (a * half) + px * (b * half);
    const y0 = CY + d.y * (a * half) + py * (b * half);
    const fade = 1 - Math.abs(a);
    g.moveTo(x0 - d.x * 26, y0 - d.y * 26).lineTo(x0, y0)
      .stroke({ width: cfg.streakWidth, color: cfg.color, alpha: cfg.streakAlpha * fade * (0.6 + 0.4 * Math.sin(t * 5 + i)) });
  }
  // Directional chevrons: a row of ">"-shaped marks scrolling WITH the gust so the
  // heading reads at a glance (the streaks alone don't clearly signal "which way").
  const chevW = 14, chevH = 22;
  for (let i = 0; i < cfg.chevronCount; i++) {
    const b = ((i + 0.5) / cfg.chevronCount) * 2 - 1;
    const a = (((t * 0.9) + i * 0.31) % 1) * 2 - 1;
    const cx = CX + d.x * (a * half) + px * (b * half * 0.7);
    const cy = CY + d.y * (a * half) + py * (b * half * 0.7);
    const fade = 1 - Math.abs(a);
    const tipX = cx + d.x * chevH, tipY = cy + d.y * chevH;
    const backX = cx - d.x * chevH, backY = cy - d.y * chevH;
    g.moveTo(backX + px * chevW, backY + py * chevW).lineTo(tipX, tipY).lineTo(backX - px * chevW, backY - py * chevW)
      .stroke({ width: 2.5, color: "#ffffff", alpha: 0.5 * fade });
  }
}

// Respawn telegraph: a contracting ring + pulsing white dot in the enemy's own
// colour, standing in for the body while it's freshly respawned (harmless, still,
// no wake/sparks — §6). Shared by drawEnemies and drawSparx.
function drawSpawning(g, x, y, color, radius, spawnT) {
  const f = 1 - Math.max(0, Math.min(1, spawnT / RESPAWN.telegraph)); // 0 → 1 as it arrives
  const alpha = 0.5 + 0.4 * Math.sin(f * Math.PI * 6);
  g.circle(x, y, radius * (1.8 - 0.8 * f)).stroke({ width: 2, color, alpha });
  g.circle(x, y, 2.5).fill({ color: 0xffffff, alpha: 0.85 });
}

function drawEnemies() {
  const g = G.enemy; g.clear();
  for (const b of blobs) {
    if (b.spawnT > 0) { drawSpawning(g, b.x, b.y, b.color, boundRadius(b), b.spawnT); continue; }
    (b.shape === "sheaf" ? drawSheaf : drawPoly)(g, b);
  }
}

// Energy-being treatment: a breathing double halo around a body core (bloom turns it
// radiant) + a drifting wake of body-coloured motes. Emission pauses while FREEZE holds
// the enemies still (a stationary blob shedding a wake reads wrong).
function energyCore(g, x, y, r, color, phase) {
  const pulse = 0.5 + 0.5 * Math.sin(now() / 1000 * ENERGY.corePulse + phase);
  g.circle(x, y, r * 4).fill({ color, alpha: ENERGY.coreHalo * 0.5 * pulse });
  g.circle(x, y, r * 2.5).fill({ color, alpha: ENERGY.coreHalo * pulse });
}
function emitWake(b) {
  if (game.state !== "playing" || powerups.isFrozen()) return;
  let n = ENERGY.wakeRate * ambDt + Math.random();
  for (; n >= 1; n--) {
    spawnAmbient({
      x: b.x + (Math.random() - 0.5) * 8, y: b.y + (Math.random() - 0.5) * 8,
      vx: (b.vx || 0) * 0.25 + (Math.random() - 0.5) * 20,
      vy: (b.vy || 0) * 0.25 + (Math.random() - 0.5) * 20,
      life: 0.45 + Math.random() * 0.35, max: 0.8,
      size: 1 + Math.random(), color: b.color, glow: true, shrink: true,
    });
  }
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
        ? ((pass.w < 2 && i < 2) ? 0xffffff : hueColor(t * (80 + bossStage() * 50) + i * 16 + b.t * 30))
        : (i < 2 ? 0xffffff : b.color);
      g.moveTo(s.ax, s.ay).lineTo(s.bx, s.by)
        .stroke({ width: pass.w, color: c, alpha: pass.a * (1 - age * 0.85), cap: "round" });
    }
  }
  if (boss) { // a pulsing rainbow heart — grows + gains a rotating ring per stage
    const stage = bossStage();
    const grow = 1 + stage * BOSS.stageCore;
    const pulse = (0.65 + 0.35 * Math.sin(t * (4.5 + stage))) * grow;
    g.circle(b.x, b.y, 18 * pulse).fill({ color: hueColor(t * 100), alpha: 0.45 });
    g.circle(b.x, b.y, 9 * pulse).fill({ color: hueColor(t * 100 + 120), alpha: 0.6 });
    g.circle(b.x, b.y, 4 * grow).fill({ color: 0xffffff, alpha: 0.95 });
    if (stage >= 1) { // rotating arc-ring: the boss is "charging"
      const R = 26 * grow, a0 = t * (1.2 + stage * 0.6);
      for (let k = 0; k < 3; k++) {
        const s0 = a0 + (k * Math.PI * 2) / 3;
        g.arc(b.x, b.y, R, s0, s0 + 1.1).stroke({ width: 2, color: hueColor(t * 140 + k * 120), alpha: 0.55 });
      }
    }
    if (stage >= 3) { // final fury: slow flare rings + shed rainbow motes
      bossFlareT -= ambDt;
      if (bossFlareT <= 0) { bossFlareT = BOSS.flarePeriod; bossFlare = { x: b.x, y: b.y, age: 0 }; }
      if (game.state === "playing" && Math.random() < 30 * ambDt) {
        const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 50;
        spawnAmbient({
          x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.8 + Math.random() * 0.6, max: 1.4,
          size: 1.6, color: hueColor(t * 120 + Math.random() * 360), glow: true, shrink: true,
        });
      }
    }
    if (bossFlare) {
      bossFlare.age += ambDt;
      const k = bossFlare.age / 0.9;
      if (k >= 1) bossFlare = null;
      else g.circle(bossFlare.x, bossFlare.y, 20 + k * 240)
        .stroke({ width: 3 * (1 - k), color: hueColor(t * 100), alpha: 0.5 * (1 - k) });
    }
  } else { // glowy 3D nucleus wrapped in a breathing energy halo
    energyCore(g, b.x, b.y, 5, b.color, b.t || 0);
    sphere(g, b.x, b.y, 5, b.color, { glow: 0.3 });
  }
  emitWake(b);
  // The live stick's endpoints occasionally shed sparks — sells "made of energy".
  if (game.state === "playing" && !powerups.isFrozen()) {
    const s0 = H[0];
    for (const [px, py] of [[s0.ax, s0.ay], [s0.bx, s0.by]]) {
      if (Math.random() < ENERGY.endpointSparkRate * ambDt) {
        spawnAmbient({
          x: px, y: py, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60,
          life: 0.25 + Math.random() * 0.2, max: 0.45,
          size: 1.4, color: boss ? hueColor(t * 120) : b.color, glow: true, shrink: true,
        });
      }
    }
  }
  drawSheafLightning(g, b, H, t, boss);
}

// Electric crackle on the Qix: a flickering bolt along the live stick (constant on the
// boss, occasional otherwise) plus, for the boss, arcs lashing out around it.
function drawSheafLightning(g, b, H, t, boss) {
  const stage = boss ? bossStage() : 0;
  const s = H[0]; // newest = live stick
  if (Math.random() < (boss ? 0.7 + stage * 0.1 : 0.12)) {
    drawBolt(g, s.ax, s.ay, s.bx, s.by, boss ? hueColor(t * 120 + 40) : b.color,
      { jitter: boss ? 26 : 13, segs: boss ? 9 : 6, w: boss ? 2.4 : 1.5, a: boss ? 0.9 : 0.55 });
    if (stage >= 3) // final fury: a second simultaneous bolt strobes the live stick
      drawBolt(g, s.ax, s.ay, s.bx, s.by, hueColor(t * 120 + 200), { jitter: 30, segs: 9, w: 1.8, a: 0.7 });
  }
  if (boss) {
    const arcs = 1 + stage * BOSS.stageArcs + (Math.random() * 2 | 0);
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
  energyCore(g, b.x, b.y, 4, b.color, b.t * 1.7); // breathing halo under the core
  sphere(g, b.x, b.y, 4, b.color, { glow: 0.28 }); // glowy 3D core
  // Special Blob glyph (§8) — reads at a glance which reward it holds.
  if (b.special === "life") {
    const gl = b.radius * 0.5;
    g.moveTo(b.x - gl, b.y).lineTo(b.x + gl, b.y)
      .moveTo(b.x, b.y - gl).lineTo(b.x, b.y + gl)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
  } else if (b.special === "slow") {
    const gl = b.radius * 0.5;
    g.circle(b.x, b.y, gl).stroke({ width: 1.6, color: 0xffffff, alpha: 0.95 })
      .moveTo(b.x, b.y).lineTo(b.x, b.y - gl * 0.8)
      .moveTo(b.x, b.y).lineTo(b.x + gl * 0.5, b.y)
      .stroke({ width: 1.6, color: 0xffffff, alpha: 0.95 });
  }
  emitWake(b);
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
    if (s.spawnT > 0) { drawSpawning(g, s.x, s.y, s.color, SPARX.radius, s.spawnT); continue; }
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

    // Energy dribble: constant small sparks along the perimeter; a latched Fast
    // Sparx erupts in a red danger shower + crackles as it rockets up your cut.
    if (game.state === "playing" && !powerups.isFrozen()) {
      const rate = s.latched ? ENERGY.sparxLatchRate : ENERGY.sparxRate;
      let n = rate * ambDt + Math.random();
      for (; n >= 1; n--) {
        const a = Math.random() * Math.PI * 2, sp = s.latched ? 40 + Math.random() * 90 : 15 + Math.random() * 35;
        spawnAmbient({
          x: s.x + (Math.random() - 0.5) * 4, y: s.y + (Math.random() - 0.5) * 4,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.2 + Math.random() * 0.25, max: 0.45,
          size: s.latched ? 1.8 : 1.3, color: col, glow: true, shrink: true, grav: !s.latched,
        });
      }
      if (s.latched && Math.random() < 0.25) {
        const a = Math.random() * Math.PI * 2, len = 14 + Math.random() * 10;
        drawBolt(g, s.x, s.y, s.x + Math.cos(a) * len, s.y + Math.sin(a) * len, col,
          { jitter: 6, segs: 4, w: 1.2, a: 0.8 });
      }
    }
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
  // Contrast backplate: a soft dark disc silhouettes the hull against the bright
  // perimeter/bloom (the hull + border otherwise both blow out to white).
  if (SHIP_VIS.backplateAlpha > 0) {
    g.circle(marker.x, marker.y, r * SHIP_VIS.backplateR)
      .fill({ color: COLORS.bg, alpha: SHIP_VIS.backplateAlpha });
  }
  // Spawn beacon: double expanding ring + hull flash on level (re)start / respawn.
  if (beaconT < SHIP_VIS.beaconTime) {
    const k = beaconT / SHIP_VIS.beaconTime;
    for (const off of [0, 0.35]) {
      const kk = Math.max(0, k - off);
      if (kk <= 0 || kk >= 1) continue;
      g.circle(marker.x, marker.y, 8 + kk * SHIP_VIS.beaconR)
        .stroke({ width: 2.5 * (1 - kk), color: "#ffffff", alpha: 0.85 * (1 - kk) });
    }
    g.circle(marker.x, marker.y, r * 1.6).fill({ color: "#ffffff", alpha: 0.35 * (1 - k) });
  }
  // Riding locator: a faint periodic pulse so the idle/riding ship keeps announcing
  // itself (while cutting the hot trail does that job already).
  if (SHIP_VIS.locatorPeriod > 0 && mode === "riding" && game.state === "playing") {
    const k = (now() / 1000 % SHIP_VIS.locatorPeriod) / SHIP_VIS.locatorPeriod;
    g.circle(marker.x, marker.y, 6 + k * SHIP_VIS.locatorR)
      .stroke({ width: 1.5, color: "#ffffff", alpha: SHIP_VIS.locatorAlpha * (1 - k) });
  }
  // flame
  const flick = 0.6 + 0.4 * Math.sin(now() / 45);
  const flame = (hot ? r * 2.2 : r * 1.5) * flick;
  g.poly([...P(-r * 0.9, -r * 0.35), ...P(-r * 0.9 - flame, 0), ...P(-r * 0.9, r * 0.35)])
    .fill({ color: hot ? "#ffd24d" : "#7df9ff", alpha: 0.9 });
  // hull — swept vector dart: long nose, swept-back wing tips, notched tail
  const hull = [...P(r * 2.0, 0), ...P(-r * 1.1, -r * 0.9), ...P(-r * 0.5, 0), ...P(-r * 1.1, r * 0.9)];
  g.poly(hull).fill(color);
  g.poly(hull).stroke({ width: 1, color: "#ffffff", alpha: hot ? 0.9 : 0.55, join: "round" }); // crisp vector edge
  // spine — thin bright line nose → tail notch
  g.moveTo(...P(r * 2.0, 0)).lineTo(...P(-r * 0.5, 0)).stroke({ width: 1, color: "#ffffff", alpha: 0.7 });
  // cockpit — short visor slit across the body
  g.moveTo(...P(r * 0.7, -r * 0.28)).lineTo(...P(r * 0.7, r * 0.28))
    .stroke({ width: r * 0.32, color: "#ffffff", alpha: 0.95, cap: "round" });
  // engine bead at the notch
  const [ex, ey] = P(-r * 0.55, 0);
  sphere(g, ex, ey, r * 0.3, hot ? "#ffd24d" : "#7df9ff");
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
  const tNow = now() / 1000;
  const one = (p) => {
    if (p.mote) { // twinkling dust — a bare dim dot, no halo (depth cue, not a spark)
      const a = MOTES.alphaMin + (MOTES.alphaMax - MOTES.alphaMin) * (0.5 + 0.5 * Math.sin(tNow * p.tw + p.phase));
      g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: a });
      return;
    }
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
  };
  for (const p of fx.getParticles()) one(p); // gameplay-event particles (fx.js)
  for (const p of ambient) one(p);           // renderer-local ambient particles
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
  const bands = 6, depth = Math.min(WIDTH, HEIGHT) * 0.15, step = depth / bands; // ≈102 on desktop (unchanged), 66 on mobile
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
// Sci-fi data-viz top bar (NEXUS board §HUD): bracket-framed zone chip, an eased
// claim bar with the level-target tick, mini ship-glyph lives, score underline.
// All chrome goes into uiGfx (under the pooled text, outside the bloom).
function miniShip(gg, x, y, r, color, alpha = 1) {
  gg.poly([x + r * 2, y, x - r * 1.1, y - r * 0.9, x - r * 0.5, y, x - r * 1.1, y + r * 0.9])
    .fill({ color, alpha });
}
function drawHUD(scorePulseT) {
  const L = game.currentSpec(); // SUPER-recalculated target when active
  const accent = theme().accent || theme().frontier;
  const ts = HUD.textSize, ss = HUD.scoreSize;

  // Zone chip framed by corner brackets (row 1, left).
  const zt = drawText(`ZONE ${game.levelLabel()}`, 16, 10, { size: ts, color: accent, weight: "700" });
  const bx0 = 10, bx1 = 16 + zt.width + 8, by0 = 7, by1 = 10 + ts + 8, bl = 6;
  uiGfx.moveTo(bx0 + bl, by0).lineTo(bx0, by0).lineTo(bx0, by0 + bl)
    .moveTo(bx1 - bl, by1).lineTo(bx1, by1).lineTo(bx1, by1 - bl)
    .stroke({ width: 1.5, color: accent, alpha: 0.7 });

  // Claim-progress bar: eased fill, white flash on a claim jump, target tick.
  // Mobile: row 2, left. Desktop: row 1, centre-left (positions from config.HUD).
  if (percent !== lastPct) { if (percent > lastPct + 0.5) pctFlashT = 0; lastPct = percent; }
  dispPct += (percent - dispPct) * HUD.ease;
  pctFlashT += ambDt;
  const { barX, barY, barW, barH } = HUD;
  const flash = Math.max(0, 1 - pctFlashT / 0.35);
  uiGfx.roundRect(barX, barY, barW, barH, barH / 2).fill({ color: HUD.trackColor, alpha: 0.8 })
    .roundRect(barX, barY, barW, barH, barH / 2).stroke({ width: 1, color: HUD.fillColor, alpha: 0.35 });
  const fw = Math.max(barH, barW * Math.min(1, dispPct / 100));
  if (dispPct > 0.5) {
    uiGfx.roundRect(barX, barY, fw, barH, barH / 2)
      .fill({ color: flash > 0 ? "#ffffff" : HUD.fillColor, alpha: 0.85 + 0.15 * flash });
  }
  const tickX = barX + barW * (L.target / 100);
  uiGfx.moveTo(tickX, barY - 3).lineTo(tickX, barY + barH + 3)
    .stroke({ width: 1.5, color: HUD.tickColor, alpha: 0.8 });
  const pctY = MOBILE ? barY + barH / 2 - HUD.smallSize / 2 - 1 : 10;
  drawText(`${percent.toFixed(0)}/${L.target}%`, barX + barW + 10, pctY, { size: HUD.smallSize, weight: "600" });

  // Lives as mini ship glyphs — right-aligned so they fit any canvas width.
  // Mobile: row 2, right. Desktop: row 1, centre-right (matches the old spot).
  const livesY = MOBILE ? barY + barH / 2 : 20;
  const livesRight = MOBILE ? WIDTH - 16 : WIDTH * 0.525 + game.lives * 24;
  for (let i = 0; i < game.lives; i++) miniShip(uiGfx, livesRight - (game.lives - i) * 24 + 12, livesY, MOBILE ? 6 : 5, COLORS.marker, 0.95);
  if (game.levelMult > 1) drawText(`×${game.levelMult}`, livesRight + 12, livesY - ts / 2 - 1, { size: ts, color: COLORS.hudAccent, weight: "700" });

  // Score with pulse + an underline that flares on the pulse (row 1, right).
  const p = scorePulseT < TIMING.scorePulse ? 1 - scorePulseT / TIMING.scorePulse : 0;
  const st = drawText(`SCORE ${fmt(game.score)}`, WIDTH - 16, 10, { size: ss + 5 * p, color: p > 0 ? theme().frontier : COLORS.hud, weight: "700", align: "right" });
  const ulY = 10 + ss + 5;
  uiGfx.moveTo(WIDTH - 16 - st.width, ulY).lineTo(WIDTH - 16, ulY)
    .stroke({ width: 1.5, color: theme().frontier, alpha: 0.25 + 0.6 * p });

  // Hairline separator under the whole top bar.
  uiGfx.moveTo(10, HUD.sepY).lineTo(WIDTH - 10, HUD.sepY).stroke({ width: 1, color: COLORS.hud, alpha: HUD.lineAlpha });

  const active = powerups.getActiveEffects();
  const rows = [["freeze", POWERUPS.FREEZE], ["boost", POWERUPS.BOOST], ["shield", POWERUPS.SHIELD], ["solarwind", POWERUPS.SOLARWIND], ["slowdown", SPECIAL_BLOBS.SLOW]].filter(([k]) => active[k] > 0);
  let ex = 16;
  for (const [key, cfg] of rows) {
    const label = `${cfg.label} ${active[key].toFixed(1)}s`;
    const t = drawText(label, ex, HUD.fxY, { size: HUD.smallSize, color: cfg.color });
    ex += t.width + 16;
  }
}

// The on-screen SLOW hold button (mobile only) — lives in the bottom control
// strip, drawn outside the bloom so it reads as UI. Pressed = brighter + filled.
function drawSlowButton(held) {
  if (!MOBILE) return;
  const b = TOUCH.slowBtn;
  const col = SHIP_TRAIL.colorSlow;
  uiGfx.circle(b.x, b.y, b.r).fill({ color: "#06121f", alpha: held ? 0.9 : 0.6 })
    .circle(b.x, b.y, b.r).stroke({ width: held ? 3 : 2, color: col, alpha: held ? 1 : 0.6 });
  if (held) uiGfx.circle(b.x, b.y, b.r * 0.75).fill({ color: col, alpha: 0.25 });
  drawText("SLOW", b.x, b.y - 8, { size: 14, color: held ? "#ffffff" : col, weight: "700", align: "center" });
  drawText("×2", b.x, b.y + 11, { size: 10, color: held ? "#ffffff" : col, weight: "600", align: "center", alpha: 0.8 });
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
  centerText(MOBILE ? "tap to start" : "press any key", CY + 86, 20, COLORS.hudAccent, 0.55 + 0.45 * Math.abs(Math.sin(now() / 600)), "600");
  if (!MOBILE) centerText("M  mute     ·     N  music", HEIGHT - 48, 15, COLORS.locked, 1, "500");
}

function drawMenu(menuSel) {
  centerText("COSMIC CUT", HEIGHT * 0.2, 56, COLORS.frontier);
  if (game.highScore > 0) centerText(`HI  ${fmt(game.highScore)}`, HEIGHT * 0.28, 22, COLORS.hudAccent, 1, "700");
  centerText("select a starting zone", HEIGHT * 0.345, 20, COLORS.hud, 1, "500");
  // Chip spacing scales to the canvas so all zones fit on-screen. `half` is fixed
  // FIRST (a sane touch-sized chip), then `gap` is derived from the span actually
  // left over after reserving `half` + EDGE_PAD on both ends — so the outermost
  // chips can never spill off the canvas edge (the old formula derived half FROM
  // gap, which left no such guarantee and clipped ~7.5px off both edges on mobile).
  // One extra chip for SUPER mode once it's been earned (clear 5-5).
  const n = zoneCount + (game.superUnlocked ? 1 : 0);
  const EDGE_PAD = 16;
  const half = MOBILE ? 32 : 40, chipTxt = Math.min(30, half * 0.75);
  const gap = Math.min(110, (WIDTH - 2 * EDGE_PAD - 2 * half) / Math.max(1, n - 1));
  const startX = WIDTH / 2 - ((n - 1) * gap) / 2, y = HEIGHT / 2 + 20;
  for (let z = 1; z <= n; z++) {
    const isSuper = z === zoneCount + 1;
    const x = startX + (z - 1) * gap;
    const locked = !isSuper && z > game.unlockedZone, selected = z === menuSel;
    const stroke = locked ? COLORS.locked : selected ? COLORS.hudAccent : (isSuper ? COLORS.hudAccent : COLORS.arena);
    G.overlay.rect(x - half, y - half, half * 2, half * 2).stroke({ width: selected ? 3 : 1.5, color: stroke });
    drawText(isSuper ? "S" : String(z), x, y - 6, { size: isSuper ? chipTxt * 0.7 : chipTxt, color: locked ? COLORS.locked : selected ? COLORS.hudAccent : COLORS.frontier, weight: "700", align: "center" });
    drawText(locked ? "LOCKED" : (isSuper ? "SUPER" : `${z}-1`), x, y + half * 0.7, { size: Math.min(13, half * 0.34), color: locked ? COLORS.locked : COLORS.hud, weight: "500", align: "center" });
  }
  centerText(MOBILE ? "swipe ← →  select      tap  start" : "← →  select        ENTER  start", HEIGHT - 78, 18, COLORS.hud, 1, "500");
  if (!MOBILE) centerText("M  mute     ·     N  music", HEIGHT - 48, 15, COLORS.locked, 1, "500");
}

function drawIntro() {
  const L = game.currentSpec(); // SUPER-recalculated target when active
  centerText(`ZONE ${game.levelLabel()}`, CY - 30, 52, theme().accent || theme().frontier);
  centerText(L.boss ? `BOSS — CLAIM ${L.target}%` : `CLAIM ${L.target}%`, CY + 24, 26, COLORS.hudAccent, 1, "600");
  centerText(MOBILE ? "swipe to begin" : "press a direction to begin", CY + 72, 17, COLORS.hud, 1, "500");
  centerText(MOBILE ? "hold SLOW (or a second finger) while cutting — double points"
                    : "hold SPACE while cutting for a SLOW DRAW — double points, dark glass",
    CY + 104, 14, COLORS.locked, 1, "500");
}

let deathSpawned = false; // one-shot latch: spark eruption fires on the first dead frame
function drawDeathFlash(p, transT) {
  centerText("CAUGHT!", field.y + 64, 40, COLORS.marker);
  if (p) {
    // One-shot spark eruption (white + magenta, arcing down) at the hit point.
    if (!deathSpawned) {
      deathSpawned = true;
      for (let i = 0; i < IMPACT.sparks; i++) {
        const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
        spawnAmbient({
          x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
          life: 0.5 + Math.random() * 0.6, max: 1.1,
          size: 1.5 + Math.random() * 2, color: Math.random() < 0.5 ? "#ffffff" : COLORS.hudAccent,
          glow: true, shrink: true, grav: true,
        });
      }
    }
    // Shock ring + radial danger arcs + white flash for the first impact window.
    if (transT < IMPACT.window) {
      const k = transT / IMPACT.window;                        // 0 → 1 across the window
      G.overlay.circle(p.x, p.y, 6 + transT * IMPACT.ringSpeed)
        .stroke({ width: 3 * (1 - k), color: "#ffffff", alpha: 0.8 * (1 - k) });
      G.overlay.circle(p.x, p.y, 26 * (1 - k)).fill({ color: "#ffffff", alpha: 0.5 * (1 - k) });
      for (let i = 0; i < IMPACT.bolts; i++) {
        const a = Math.random() * Math.PI * 2, len = 30 + Math.random() * 50;
        drawBolt(G.overlay, p.x, p.y, p.x + Math.cos(a) * len, p.y + Math.sin(a) * len,
          COLORS.hudAccent, { jitter: 10, segs: 5, w: 1.6, a: 0.7 * (1 - k) });
      }
    }
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
  centerText(game.justUnlockedSuper ? "SUPER MODE UNLOCKED" : "CAMPAIGN COMPLETE", CY - 60, 46, COLORS.frontier);
  centerText(`FINAL SCORE ${fmt(game.score)}`, CY - 8, 28, COLORS.hudAccent, 1, "700");
  if (game.newHigh) centerText("★ NEW HIGH SCORE ★", CY + 32, 24, theme().frontier, 1, "800");
  else centerText(`HI  ${fmt(game.highScore)}`, CY + 32, 22, COLORS.locked, 1, "600");
  const tail = game.justUnlockedSuper ? "replay the campaign with double the enemies — press any key"
    : game.superMode ? "SUPER campaign cleared — press any key"
    : "you cleared all five zones — press any key";
  centerText(tail, CY + 72, 20, COLORS.hud, 1, "500");
}

function drawPaused() {
  dim(0.6);
  centerText("PAUSED", CY - 18, 52, COLORS.frontier);
  centerText("P / ESC  resume     ·     M  mute     ·     N  music", CY + 40, 17, COLORS.hud, 1, "500");
}

// --- The frame -------------------------------------------------------------
export function render(view = {}) {
  if (!app) return;
  const { transT = 0, menuSel = 1, popups = [], reward = null, deathPoint = null, scorePulseT = 99, danger = 0, beat = 0, paused = false, slowBtn = false } = view;

  // Pixi display objects persist between frames, so wipe every layer up front
  // (and reset any shake offset) — otherwise the previous state's scene lingers
  // behind, e.g. the play field showing through the title screen.
  for (const key in G) { G[key].clear(); G[key].x = 0; G[key].y = 0; }
  if (uiGfx) uiGfx.clear();
  if (sweepGroup) sweepGroup.visible = false; // re-enabled by drawGlassSweep when glass exists
  if (refractSprite) refractSprite.visible = false; // ditto (glass refraction)
  beginText();

  drawBackground(beat);
  const dtA = updateAmbient(); // ambient particles tick in every state (so leftovers decay)
  updateBeacon();              // ship spawn-beacon triggers on level (re)start / respawn
  if (game.state !== "dead") deathSpawned = false; // re-arm the death eruption latch

  if (game.state === "title" || game.state === "menu") {
    ribbon.length = 0; clearAmbient();
    if (game.state === "title") drawTitle(); else drawMenu(menuSel);
    finishFrame(); return;
  }

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

  drawHoloGrid();
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
  if (game.state === "playing") updateRibbon(dtA);
  else if (game.state !== "dead") ribbon.length = 0; // keep the tail on the death frame
  drawRibbon();
  drawMarker();
  drawParticles();
  drawDangerEdge(danger);

  drawPopups(popups);
  drawReward(reward);
  drawHUD(scorePulseT);
  drawSlowButton(slowBtn); // mobile-only touch UI in the bottom control strip

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
