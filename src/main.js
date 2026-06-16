// COSMIC CUT — Phase 0
// Goal: prove the tooling works end to end. Grab the canvas, draw the
// deep-space field and a neon-bordered arena frame (§5). No game logic yet —
// that starts in Phase 1 (a movable marker on the arena border).

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Logical play-field size. The arena is inset inside this frame.
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const MARGIN = 40; // gap between canvas edge and the neon arena border

// The play field rectangle — the rules of the game will live inside this.
const field = {
  x: MARGIN,
  y: MARGIN,
  w: WIDTH - MARGIN * 2,
  h: HEIGHT - MARGIN * 2,
};

function drawBackground() {
  // Deep space backdrop.
  ctx.fillStyle = "#05030f";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawArena() {
  // Neon border frame around the unclaimed play field.
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#19e6ff";
  ctx.shadowColor = "#19e6ff";
  ctx.shadowBlur = 16;
  ctx.strokeRect(field.x, field.y, field.w, field.h);
  ctx.shadowBlur = 0; // reset so it doesn't bleed into later draws
}

function render() {
  drawBackground();
  drawArena();
}

render();
