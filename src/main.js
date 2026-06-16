// COSMIC CUT — Phase 1
// New concepts: keyboard input, the game loop, and animating the canvas.
//
// The marker rides the SAFE border of the arena (§2). Pushing OUT into the
// open field to "cut" is Phase 2; here the marker is locked to the perimeter.
//
// Movement model (per design feedback): the marker is a train on a loop of
// track. Press a direction and it travels that way CONTINUOUSLY, rounding
// corners by itself, until you press the OPPOSITE direction to reverse. It is
// only ever stopped at the very start of a level.
//
// The trick that makes this simple: instead of an (x, y) we track a single
// number `t` — the distance travelled CLOCKWISE around the perimeter from the
// top-left corner. Moving is just `t += direction`, and wrapping `t` past the
// end of the loop turns the corners for free.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const MARGIN = 40;

// The play field rectangle. Its perimeter is the track the marker rides.
const field = {
  x: MARGIN,
  y: MARGIN,
  w: WIDTH - MARGIN * 2,
  h: HEIGHT - MARGIN * 2,
};
const LEFT = field.x;
const RIGHT = field.x + field.w;
const TOP = field.y;
const BOTTOM = field.y + field.h;

// Total length of the perimeter loop.
const PERIMETER = 2 * (field.w + field.h);

const marker = {
  x: 0,
  y: 0,
  speed: 260, // pixels per second — "standard speed is FAST" (§3)
  radius: 7,
};

// `t` = distance clockwise around the perimeter from the top-left corner.
// `dir` = travel direction: +1 clockwise, -1 anticlockwise, 0 stopped.
// Start at the bottom-centre (classic Qix spot) and STOPPED — the only time
// the marker is ever still (§ feedback: "never stopped except on level begin").
let t = field.w + field.h + field.w / 2;
let dir = 0;

// Map a perimeter distance to an actual point on the rectangle's edge.
function pointAt(d) {
  d = ((d % PERIMETER) + PERIMETER) % PERIMETER; // wrap into [0, PERIMETER)
  const { w, h } = field;
  if (d < w) return { x: LEFT + d, y: TOP };                 // top edge,  →
  if (d < w + h) return { x: RIGHT, y: TOP + (d - w) };       // right edge, ↓
  if (d < w + h + w) return { x: RIGHT - (d - w - h), y: BOTTOM }; // bottom, ←
  return { x: LEFT, y: BOTTOM - (d - 2 * w - h) };            // left edge,  ↑
}

// Which screen direction is "clockwise / forward" on the edge at distance d?
// (Top: right, Right: down, Bottom: left, Left: up.)
function forwardDirAt(d) {
  d = ((d % PERIMETER) + PERIMETER) % PERIMETER;
  const { w, h } = field;
  if (d < w) return "right";
  if (d < w + h) return "down";
  if (d < w + h + w) return "left";
  return "up";
}

// --- Input -----------------------------------------------------------------
// Direction changes are discrete events, so we act on keydown rather than
// polling a held-keys set. A press along the current edge sets the travel
// direction; pressing the opposite of the current travel reverses it.
const OPPOSITE = { left: "right", right: "left", up: "down", down: "up" };
const KEY_TO_DIR = {
  ArrowRight: "right", d: "right", D: "right",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
};

window.addEventListener("keydown", (e) => {
  const want = KEY_TO_DIR[e.key];
  if (!want) return;
  e.preventDefault(); // stop arrow keys scrolling the page

  const forward = forwardDirAt(t);
  if (want === forward) dir = 1; // go clockwise along this edge
  else if (want === OPPOSITE[forward]) dir = -1; // go anticlockwise
  // A press PERPENDICULAR to the current edge does nothing on the border —
  // that input becomes "start a cut" in Phase 2.
});

// --- Update ----------------------------------------------------------------
function update(dt) {
  t += dir * marker.speed * dt; // travel; wrapping in pointAt turns corners
  const p = pointAt(t);
  marker.x = p.x;
  marker.y = p.y;
}

// --- Render ----------------------------------------------------------------
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
// requestAnimationFrame runs our loop ~60×/sec. We measure the real seconds
// between frames (dt) and scale movement by it, so speed is the same on any
// machine regardless of frame rate.
let lastTime = performance.now();

function loop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

// Place the marker at its starting point before the first frame.
({ x: marker.x, y: marker.y } = pointAt(t));
requestAnimationFrame(loop);
