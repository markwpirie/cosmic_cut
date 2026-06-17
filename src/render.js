// COSMIC CUT — render (all drawing)
// Reads the world (grid), player (marker), enemies (enemy) and game state and
// paints a frame. Knows nothing about input or rules. Per state it draws: the
// start menu, a level intro banner, the play field, the level-complete wipe, and
// the game-over / campaign-complete overlays.

import { WIDTH, HEIGHT, field, CELL, COLS, ROWS, COLORS, THEMES, TIMING, MARKER, nodeX, nodeY } from "./config.js";
import { grid, EMPTY, FILLED, seams, cellSolid, percent } from "./grid.js";
import { marker, mode, trail } from "./marker.js";
import { blobs, radius as blobRadius } from "./enemy.js";
import * as game from "./game.js";
import { zoneCount } from "./levels.js";
import * as fx from "./fx.js";

const CX = field.x + field.w / 2;
const CY = field.y + field.h / 2;
const MAXR = Math.hypot(field.w / 2, field.h / 2);
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// Active play-field palette for the current zone (zone 1 cyan → 2 orange → …).
function theme() {
  return THEMES[game.currentLevel().zone - 1] || THEMES[0];
}

// Level-complete ripple radius for a given elapsed transition time: it holds
// (radius 0) for completeHold, then expands over completeWipe.
function wipeRadius(transT) {
  const w = (transT - TIMING.completeHold) / TIMING.completeWipe;
  if (w <= 0) return 0;
  const t = Math.min(w, 1);
  return (1 - (1 - t) * (1 - t)) * (MAXR + 30); // easeOut
}

// Drifting starfield + faint nebula, for the "cosmic" in COSMIC CUT.
let stars = null;
let nebula = null;
let starLast = 0;
function ensureStars() {
  if (stars) return;
  stars = [];
  for (let i = 0; i < 110; i++) {
    stars.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      size: Math.random() < 0.15 ? 2 : 1,
      v: 4 + Math.random() * 16,
      a: 0.25 + Math.random() * 0.6,
    });
  }
  nebula = [
    { x: WIDTH * 0.25, y: HEIGHT * 0.3, r: 260, c: "rgba(80,40,160,0.10)" },
    { x: WIDTH * 0.78, y: HEIGHT * 0.7, r: 300, c: "rgba(20,90,150,0.10)" },
  ];
}
function drawBackground(ctx) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ensureStars();
  for (const n of nebula) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, n.c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  const t = now();
  const dt = Math.min(0.05, (t - starLast) / 1000);
  starLast = t;
  ctx.fillStyle = "#cfeaff";
  for (const s of stars) {
    s.y += s.v * dt;
    if (s.y > HEIGHT) { s.y = 0; s.x = Math.random() * WIDTH; }
    ctx.globalAlpha = s.a;
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

// Claimed cells as one solid translucent mass. During the level-complete wipe,
// cells within the expanding circle (radius wipeR) vanish inside-out.
function drawClaimed(ctx, wipeR = -1) {
  ctx.fillStyle = theme().claimedFill;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== FILLED) continue;
      if (wipeR >= 0) {
        const px = field.x + (c + 0.5) * CELL;
        const py = field.y + (r + 0.5) * CELL;
        if (Math.hypot(px - CX, py - CY) <= wipeR) continue; // wiped away
      }
      ctx.fillRect(field.x + c * CELL, field.y + r * CELL, CELL, CELL);
    }
  }
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

function drawPerimeter(ctx) {
  const t = theme();
  ctx.strokeStyle = t.frontier;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.shadowColor = t.frontier;
  ctx.shadowBlur = 12;
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
}

function drawTrail(ctx) {
  if (mode !== "cutting" || trail.length === 0) return;
  // Heat builds toward the LONG threshold (2× field height): the trail brightens,
  // thickens and reddens, telegraphing both the building bonus and the risk.
  const heat = Math.min(1, trail.length / (2 * ROWS));
  const color = heat > 0.85 ? "#ff5a3c" : heat > 0.5 ? "#ffae3c" : theme().trail;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 + heat * 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 + heat * 16;
  ctx.beginPath();
  ctx.moveTo(nodeX(trail[0].col), nodeY(trail[0].row));
  for (let i = 1; i < trail.length; i++) ctx.lineTo(nodeX(trail[i].col), nodeY(trail[i].row));
  ctx.lineTo(marker.x, marker.y);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawBlobs(ctx) {
  for (const b of blobs) {
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(b.x, b.y, blobRadius(b), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawMarker(ctx) {
  // While cutting you're vulnerable — the marker flashes hot to telegraph it.
  let color = COLORS.marker;
  let r = MARKER.radius;
  if (mode === "cutting") {
    const pulse = 0.5 + 0.5 * Math.sin(now() / 70);
    color = pulse > 0.5 ? "#ffffff" : "#ff4d4d";
    r = MARKER.radius + pulse * 1.6;
  }
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, r, 0, Math.PI * 2);
  ctx.fill();
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

function drawMenu(ctx, menuSel) {
  centerText(ctx, "COSMIC CUT", 140, "700 56px system-ui, sans-serif", COLORS.frontier);
  if (game.highScore > 0) centerText(ctx, `HI  ${fmt(game.highScore)}`, 192, "700 22px system-ui, sans-serif", COLORS.hudAccent);
  centerText(ctx, "select a starting zone", 234, "500 20px system-ui, sans-serif", COLORS.hud);

  const n = zoneCount;
  const gap = 110;
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
    ctx.strokeRect(x - 40, y - 40, 80, 80);
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
  const pop = Math.min(1, transT / 0.25);
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
  centerText(ctx, "press any key to continue", field.y + 100, "500 18px system-ui, sans-serif", COLORS.hud);
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
  const { transT = 0, menuSel = 1, popups = [], reward = null, deathPoint = null, deathBlob = null, scorePulseT = 99, danger = 0 } = view;
  drawBackground(ctx);

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
    drawLevelComplete(ctx, transT);
    return;
  }

  drawClaimed(ctx);
  drawSeams(ctx);
  drawArena(ctx);
  drawPerimeter(ctx);
  drawTrail(ctx);
  drawBlobs(ctx);
  drawMarker(ctx);
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
}
