// COSMIC CUT — Phase 1
// New concepts: keyboard input, the game loop, and animating the canvas.
//
// The marker rides the SAFE border of the arena (§2). In this game you can
// only ever sit on the perimeter of unclaimed space; pushing OUT into the open
// field to "cut" is Phase 2. So here we lock the marker to the rectangle's
// edges and let the arrow keys (or WASD) walk it around, turning at corners.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const MARGIN = 40;

// The play field rectangle. Its four edges are the track the marker walks.
const field = {
  x: MARGIN,
  y: MARGIN,
  w: WIDTH - MARGIN * 2,
  h: HEIGHT - MARGIN * 2,
};
// Convenience edge coordinates.
const LEFT = field.x;
const RIGHT = field.x + field.w;
const TOP = field.y;
const BOTTOM = field.y + field.h;

// The player's marker. Always sits exactly on the perimeter.
// Start at the bottom-centre, the classic Qix starting spot.
const marker = {
  x: field.x + field.w / 2,
  y: BOTTOM,
  speed: 260, // pixels per second — "standard speed is FAST" (§3)
  radius: 7,
};

// --- Input -----------------------------------------------------------------
// We track which keys are currently held in a set, then read it each frame.
// (Reading state in the loop feels smoother than acting on each key event.)
const keys = new Set();

window.addEventListener("keydown", (e) => {
  keys.add(e.key);
  // Stop the arrow keys from scrolling the page.
  if (e.key.startsWith("Arrow")) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.key));

function held(...names) {
  return names.some((n) => keys.has(n));
}

// --- Update (game logic, runs every frame) ---------------------------------
function update(dt) {
  const step = marker.speed * dt; // distance to move this frame

  // Desired direction from the keys held.
  let dx = 0;
  let dy = 0;
  if (held("ArrowRight", "d", "D")) dx += step;
  if (held("ArrowLeft", "a", "A")) dx -= step;
  if (held("ArrowDown", "s", "S")) dy += step;
  if (held("ArrowUp", "w", "W")) dy -= step;

  // The marker can only travel ALONG an edge it's currently on:
  //  - horizontal movement is allowed on the top or bottom edge
  //  - vertical movement is allowed on the left or right edge
  // At a corner the marker is on two edges at once, so it can turn.
  const eps = 0.5;
  const onHorizontalEdge =
    Math.abs(marker.y - TOP) < eps || Math.abs(marker.y - BOTTOM) < eps;
  const onVerticalEdge =
    Math.abs(marker.x - LEFT) < eps || Math.abs(marker.x - RIGHT) < eps;

  if (onHorizontalEdge) marker.x += dx;
  if (onVerticalEdge) marker.y += dy;

  // Clamp to the rectangle so we never leave the border. Clamping at a corner
  // snaps the marker exactly onto both edges, which is what lets it turn.
  marker.x = Math.max(LEFT, Math.min(RIGHT, marker.x));
  marker.y = Math.max(TOP, Math.min(BOTTOM, marker.y));
}

// --- Render (drawing, runs every frame) ------------------------------------
function drawBackground() {
  ctx.fillStyle = "#05030f";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawArena() {
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#19e6ff";
  ctx.shadowColor = "#19e6ff";
  ctx.shadowBlur = 16;
  ctx.strokeRect(field.x, field.y, field.w, field.h);
  ctx.shadowBlur = 0;
}

function drawMarker() {
  ctx.fillStyle = "#ff3df0";
  ctx.shadowColor = "#ff3df0";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, marker.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function render() {
  drawBackground();
  drawArena();
  drawMarker();
}

// --- The game loop ---------------------------------------------------------
// requestAnimationFrame calls our loop ~60 times a second, in sync with the
// screen. We measure the real time between frames (dt) and scale movement by
// it, so the marker travels at the same speed regardless of frame rate.
let lastTime = performance.now();

function loop(now) {
  const dt = (now - lastTime) / 1000; // seconds since last frame
  lastTime = now;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
