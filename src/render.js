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

const CX = field.x + field.w / 2;
const CY = field.y + field.h / 2;
const MAXR = Math.hypot(field.w / 2, field.h / 2);

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

function drawBackground(ctx) {
  ctx.fillStyle = COLORS.bg;
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
  const t = theme();
  ctx.strokeStyle = t.trail;
  ctx.lineWidth = 3;
  ctx.shadowColor = t.trail;
  ctx.shadowBlur = 10;
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
  ctx.fillStyle = COLORS.marker;
  ctx.shadowColor = COLORS.marker;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, MARKER.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawHUD(ctx) {
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
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.hud;
  ctx.fillText(`SCORE ${game.score}`, WIDTH - 12, 10);
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
  centerText(ctx, "COSMIC CUT", 150, "700 56px system-ui, sans-serif", COLORS.frontier);
  centerText(ctx, "select a starting zone", 210, "500 20px system-ui, sans-serif", COLORS.hud);

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
  centerText(ctx, "← →  select        ENTER  start", HEIGHT - 70,
    "500 18px system-ui, sans-serif", COLORS.hud);
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

// Big central reward flash, e.g. "SPLIT!". Pops in and fades.
function drawBanner(ctx, banner) {
  if (!banner) return;
  const k = Math.min(1, banner.t / TIMING.splitFlash);
  const pop = Math.min(1, banner.t / 0.18);
  ctx.save();
  ctx.globalAlpha = 1 - k * k;
  ctx.translate(WIDTH / 2, CY - 60);
  ctx.scale(pop, pop);
  ctx.fillStyle = COLORS.marker;
  ctx.shadowColor = COLORS.marker;
  ctx.shadowBlur = 20;
  ctx.font = "800 56px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(banner.text, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
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
  centerText(ctx, "GAME OVER", CY - 40, "700 48px system-ui, sans-serif", COLORS.hudAccent);
  centerText(ctx, `SCORE ${game.score}`, CY + 14, "700 26px system-ui, sans-serif", COLORS.hud);
  centerText(ctx, "press any key — start screen", CY + 56, "500 20px system-ui, sans-serif", COLORS.hud);
}

function drawCampaignComplete(ctx) {
  ctx.fillStyle = "rgba(5, 3, 15, 0.82)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  centerText(ctx, "CAMPAIGN COMPLETE", CY - 44, "700 46px system-ui, sans-serif", COLORS.frontier);
  centerText(ctx, `FINAL SCORE ${game.score}`, CY + 8, "700 28px system-ui, sans-serif", COLORS.hudAccent);
  centerText(ctx, "you cleared all five zones — press any key", CY + 50,
    "500 20px system-ui, sans-serif", COLORS.hud);
}

export function render(ctx, view = {}) {
  const { transT = 0, menuSel = 1, popups = [], banner = null, deathPoint = null, deathBlob = null } = view;
  drawBackground(ctx);

  if (game.state === "menu") { drawMenu(ctx, menuSel); return; }

  if (game.state === "levelcomplete") {
    drawClaimed(ctx, wipeRadius(transT));
    drawArena(ctx);
    drawMarker(ctx);
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
  drawPopups(ctx, popups);
  drawBanner(ctx, banner);
  drawHUD(ctx);

  if (game.state === "intro") drawIntro(ctx);
  else if (game.state === "dead") drawDeathFlash(ctx, deathPoint, deathBlob, transT);
  else if (game.state === "gameover") drawGameOver(ctx);
  else if (game.state === "campaigncomplete") drawCampaignComplete(ctx);
}
