// COSMIC CUT — render (all drawing)
// Reads the world (grid) and player (marker) state and paints a frame. Knows
// nothing about input or game rules. Render hierarchy (§16): dim arena frame <
// thin seams < solid claimed fill < bold open frontier < cut trail < marker.

import { WIDTH, HEIGHT, field, CELL, COLS, ROWS, COLORS, MARKER, nodeX, nodeY } from "./config.js";
import { grid, EMPTY, FILLED, seams, cellSolid, percent } from "./grid.js";
import { marker, mode, trail } from "./marker.js";
import { blob, radius as blobRadius } from "./enemy.js";
import { lives, state } from "./game.js";

function drawBackground(ctx) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawClaimed(ctx) {
  // Claimed cells fill as one solid translucent mass (no internal grid lines).
  ctx.fillStyle = COLORS.claimedFill;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== FILLED) continue;
      ctx.fillRect(field.x + c * CELL, field.y + r * CELL, CELL, CELL);
    }
  }
}

function drawSeams(ctx) {
  // Internal perimeters: remembered cut lines now buried between two claimed
  // cells. Thin and dim — visible and rideable, clearly not the open frontier.
  ctx.strokeStyle = COLORS.seam;
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
  // Dim outer frame, so the bold frontier overlaying it reads as the bolder line.
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.arena;
  ctx.shadowColor = COLORS.arena;
  ctx.shadowBlur = 6;
  ctx.strokeRect(field.x, field.y, field.w, field.h);
  ctx.shadowBlur = 0;
}

function drawPerimeter(ctx) {
  // The open frontier — every edge where empty space meets solid. The bold,
  // bright, rideable line the marker follows. Batched into one path.
  ctx.strokeStyle = COLORS.frontier;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.shadowColor = COLORS.frontier;
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
  ctx.strokeStyle = COLORS.trail;
  ctx.lineWidth = 3;
  ctx.shadowColor = COLORS.trail;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(nodeX(trail[0].col), nodeY(trail[0].row));
  for (let i = 1; i < trail.length; i++) ctx.lineTo(nodeX(trail[i].col), nodeY(trail[i].row));
  ctx.lineTo(marker.x, marker.y);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawBlob(ctx) {
  ctx.fillStyle = COLORS.blob;
  ctx.shadowColor = COLORS.blob;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(blob.x, blob.y, blobRadius(), 0, Math.PI * 2);
  ctx.fill();
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
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillStyle = COLORS.hud;
  ctx.fillText(`CLAIMED ${percent.toFixed(0)}%`, 12, 10);
  ctx.fillStyle = COLORS.hudAccent;
  ctx.fillText(`TARGET 50%`, 150, 10); // win condition arrives in Phase 4
  ctx.fillStyle = COLORS.marker;
  ctx.fillText(`LIVES ${"♥".repeat(lives)}`, 270, 10);
}

function drawGameOver(ctx) {
  if (state !== "gameover") return;
  ctx.fillStyle = "rgba(5, 3, 15, 0.78)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.hudAccent;
  ctx.font = "700 48px system-ui, sans-serif";
  ctx.fillText("GAME OVER", WIDTH / 2, HEIGHT / 2 - 24);
  ctx.fillStyle = COLORS.hud;
  ctx.font = "500 20px system-ui, sans-serif";
  ctx.fillText("press any key to restart", WIDTH / 2, HEIGHT / 2 + 28);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

export function render(ctx) {
  drawBackground(ctx);
  drawClaimed(ctx);
  drawSeams(ctx);
  drawArena(ctx);
  drawPerimeter(ctx);
  drawTrail(ctx);
  drawBlob(ctx);
  drawMarker(ctx);
  drawHUD(ctx);
  drawGameOver(ctx);
}
