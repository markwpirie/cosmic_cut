// COSMIC CUT — Phase 2
// New concept: the core claim algorithm — cut into open space, close the loop,
// flood-fill the enclosed area, show the live percentage (§2, §13).
//
// THE MODEL CHANGE
// Phase 1's marker rode a smooth perimeter line. To claim *area*, the arena is
// now a GRID of cells, each EMPTY or FILLED (claimed). The marker travels on
// the grid LINES (the lattice between cells), still moving continuously and
// turning at intersections — the same "ride the rail, never stop" feel.
//
// A cell-edge between two cells is "safe boundary" if a FILLED cell (or the
// arena wall) sits on either side; it's "open" if both sides are empty. Riding
// hugs safe boundary. Pushing into open space starts a CUT — a trail of edges
// through empty cells. When the trail returns to safe ground, the trail plus
// the existing walls enclose the empty space into regions; we keep the largest
// open region to play in and CLAIM everything else (flood fill).

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const MARGIN = 40;

const field = {
  x: MARGIN,
  y: MARGIN,
  w: WIDTH - MARGIN * 2, // 720
  h: HEIGHT - MARGIN * 2, // 520
};

// Grid of cells covering the field. CELL must divide field.w and field.h.
// Finer cells = more granular cuts and smoother claimed outlines.
const CELL = 8;
const COLS = field.w / CELL; // 90
const ROWS = field.h / CELL; // 65

// Cell states. The grid holds the CLAIMED territory; the arena wall is implicit
// (anything off the grid counts as solid — see cellSolid()).
const EMPTY = 0;
const FILLED = 1;
const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));

// --- Geometry helpers ------------------------------------------------------
// Lattice point (col, row) -> pixel position. col: 0..COLS, row: 0..ROWS.
function nodeX(col) { return field.x + col * CELL; }
function nodeY(row) { return field.y + row * CELL; }

// Is cell (cr, cc) solid? Off-grid = the arena wall = solid.
function cellSolid(cr, cc) {
  if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS) return true;
  return grid[cr][cc] === FILLED;
}

// A lattice point is "safe" if any of the four cells touching it is solid —
// i.e. it sits on the arena wall or against claimed territory.
function nodeIsSafe(col, row) {
  return (
    cellSolid(row - 1, col - 1) ||
    cellSolid(row - 1, col) ||
    cellSolid(row, col - 1) ||
    cellSolid(row, col)
  );
}

// Classify the edge leaving (col,row) in direction (dx,dy) by looking at the
// two cells it runs between:
//   "INVALID"  — leaves the arena
//   "OPEN"     — empty on BOTH sides (open space; pushing here starts a cut)
//   "BOUNDARY" — empty on one side, solid on the other (the true perimeter —
//                the only thing the marker may ride)
//   "INTERIOR" — solid on BOTH sides (buried inside claimed territory or wall;
//                NOT rideable — this is what stops the marker slicing through
//                a claimed area)
function classifyEdge(col, row, dx, dy) {
  const nc = col + dx;
  const nr = row + dy;
  if (nc < 0 || nc > COLS || nr < 0 || nr > ROWS) return "INVALID";
  let sa, sb; // the two cells flanking the edge
  if (dx !== 0) {
    const c = Math.min(col, nc); // horizontal edge along grid-line row
    sa = cellSolid(row - 1, c);
    sb = cellSolid(row, c);
  } else {
    const r = Math.min(row, nr); // vertical edge along grid-line col
    sa = cellSolid(r, col - 1);
    sb = cellSolid(r, col);
  }
  if (sa && sb) return "INTERIOR";
  if (!sa && !sb) return "OPEN";
  return "BOUNDARY";
}

// A cut may travel through open space or hug a perimeter, but never along an
// interior (both-solid) edge.
function canCut(col, row, dx, dy) {
  const cls = classifyEdge(col, row, dx, dy);
  return cls === "OPEN" || cls === "BOUNDARY";
}

// --- Marker & state --------------------------------------------------------
const marker = {
  col: COLS / 2, // start bottom-centre (classic Qix spot)
  row: ROWS,
  x: 0,
  y: 0,
  speed: 240, // px/sec — "standard speed is FAST" (§3)
  radius: 7,
};
marker.x = nodeX(marker.col);
marker.y = nodeY(marker.row);

let dir = null; // {dx,dy}; null only at level begin (§ "never stop")
let mode = "riding"; // "riding" | "cutting"
let trail = []; // nodes of the in-progress cut
let percent = 0;

// --- Input -----------------------------------------------------------------
// `pending` is the player's most recent intent, applied at the next grid
// intersection (a buffered turn, like Pac-Man). We dedupe OS key-repeat so a
// held key doesn't keep re-triggering cuts.
let pending = null;
const down = new Set();
const KEY_VEC = {
  ArrowRight: { dx: 1, dy: 0 }, d: { dx: 1, dy: 0 }, D: { dx: 1, dy: 0 },
  ArrowLeft: { dx: -1, dy: 0 }, a: { dx: -1, dy: 0 }, A: { dx: -1, dy: 0 },
  ArrowDown: { dx: 0, dy: 1 }, s: { dx: 0, dy: 1 }, S: { dx: 0, dy: 1 },
  ArrowUp: { dx: 0, dy: -1 }, w: { dx: 0, dy: -1 }, W: { dx: 0, dy: -1 },
};

window.addEventListener("keydown", (e) => {
  const v = KEY_VEC[e.key];
  if (!v) return;
  e.preventDefault();
  if (down.has(e.key)) return; // ignore auto-repeat
  down.add(e.key);
  pending = v;
});
window.addEventListener("keyup", (e) => down.delete(e.key));

// --- Movement decisions (run at each grid intersection) --------------------
function setDir(dx, dy) { dir = { dx, dy }; }

function startCut(dx, dy) {
  mode = "cutting";
  trail = [{ col: marker.col, row: marker.row }];
  setDir(dx, dy);
}

function decideRiding() {
  // 1. Honour a fresh player intent.
  if (pending) {
    const cls = classifyEdge(marker.col, marker.row, pending.dx, pending.dy);
    const p = pending;
    pending = null;
    if (cls === "OPEN") { startCut(p.dx, p.dy); return; } // push into space = cut
    if (cls === "BOUNDARY") { setDir(p.dx, p.dy); return; } // ride along boundary
    // INVALID: ignore
  }
  // Stopped and no usable input → stay put. The marker is only ever still at
  // level begin; it must NOT auto-start before the player picks a direction.
  if (!dir) return;
  // 2. Keep going straight if still on boundary.
  if (classifyEdge(marker.col, marker.row, dir.dx, dir.dy) === "BOUNDARY") {
    return;
  }
  // 3. Hit a corner — auto-turn to follow the boundary loop (never reverse if
  //    another option exists; never stop).
  const rev = dir ? { dx: -dir.dx, dy: -dir.dy } : null;
  const all = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  ];
  for (const d of all) {
    if (rev && d.dx === rev.dx && d.dy === rev.dy) continue;
    if (classifyEdge(marker.col, marker.row, d.dx, d.dy) === "BOUNDARY") {
      setDir(d.dx, d.dy);
      return;
    }
  }
  if (rev && classifyEdge(marker.col, marker.row, rev.dx, rev.dy) === "BOUNDARY") {
    setDir(rev.dx, rev.dy);
    return;
  }
  dir = null; // only reachable at level begin with no input yet
}

function decideCutting() {
  const rev = { dx: -dir.dx, dy: -dir.dy };
  // A perpendicular/forward press steers the cut; reversing into our own trail
  // is disallowed.
  if (pending && !(pending.dx === rev.dx && pending.dy === rev.dy)) {
    const p = pending;
    pending = null;
    if (canCut(marker.col, marker.row, p.dx, p.dy)) { setDir(p.dx, p.dy); return; }
  }
  // Otherwise carry straight on.
  if (canCut(marker.col, marker.row, dir.dx, dir.dy)) return;
  // Forward is blocked (arena edge or claimed interior): turn to any non-reverse
  // direction we can still cut along.
  const all = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  ];
  for (const d of all) {
    if (d.dx === rev.dx && d.dy === rev.dy) continue;
    if (canCut(marker.col, marker.row, d.dx, d.dy)) {
      setDir(d.dx, d.dy);
      return;
    }
  }
  setDir(rev.dx, rev.dy);
}

// Called the instant the marker lands on a grid intersection.
function onArrive() {
  if (mode === "cutting") {
    trail.push({ col: marker.col, row: marker.row });
    if (nodeIsSafe(marker.col, marker.row)) {
      finishCut(); // claim, back to riding
      decideRiding();
      return;
    }
    decideCutting();
    return;
  }
  decideRiding();
}

// --- The claim (flood fill) ------------------------------------------------
function finishCut() {
  // 1. Turn the trail into a set of "walls" between cells.
  const walls = new Set();
  for (let i = 0; i < trail.length - 1; i++) {
    const a = trail[i];
    const b = trail[i + 1];
    if (a.row === b.row) {
      walls.add(`h:${a.row}:${Math.min(a.col, b.col)}`); // horizontal grid-line
    } else {
      walls.add(`v:${a.col}:${Math.min(a.row, b.row)}`); // vertical grid-line
    }
  }

  // 2. Label every empty cell into connected regions. The trail walls and the
  //    existing claimed cells act as barriers, so the cut splits the open space.
  const comp = Array.from({ length: ROWS }, () => new Array(COLS).fill(-1));
  const sizes = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === FILLED || comp[r][c] !== -1) continue;
      const id = sizes.length;
      let size = 0;
      const stack = [[r, c]];
      comp[r][c] = id;
      while (stack.length) {
        const [cr, cc] = stack.pop();
        size++;
        // up / down / left / right, blocked by trail walls or solid cells
        if (cr - 1 >= 0 && grid[cr - 1][cc] === EMPTY && comp[cr - 1][cc] === -1 && !walls.has(`h:${cr}:${cc}`)) { comp[cr - 1][cc] = id; stack.push([cr - 1, cc]); }
        if (cr + 1 < ROWS && grid[cr + 1][cc] === EMPTY && comp[cr + 1][cc] === -1 && !walls.has(`h:${cr + 1}:${cc}`)) { comp[cr + 1][cc] = id; stack.push([cr + 1, cc]); }
        if (cc - 1 >= 0 && grid[cr][cc - 1] === EMPTY && comp[cr][cc - 1] === -1 && !walls.has(`v:${cc}:${cr}`)) { comp[cr][cc - 1] = id; stack.push([cr, cc - 1]); }
        if (cc + 1 < COLS && grid[cr][cc + 1] === EMPTY && comp[cr][cc + 1] === -1 && !walls.has(`v:${cc + 1}:${cr}`)) { comp[cr][cc + 1] = id; stack.push([cr, cc + 1]); }
      }
      sizes.push(size);
    }
  }

  // 3. Keep the largest open region; claim all the others.
  if (sizes.length > 1) {
    let largest = 0;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[largest]) largest = i;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (comp[r][c] !== -1 && comp[r][c] !== largest) grid[r][c] = FILLED;
      }
    }
  }

  trail = [];
  mode = "riding";
  recomputePercent();
}

function recomputePercent() {
  let filled = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === FILLED) filled++;
  percent = (filled / (ROWS * COLS)) * 100;
}

// --- Update ----------------------------------------------------------------
function update(dt) {
  if (!dir) { decideRiding(); if (!dir) return; } // start moving on first input
  let remaining = marker.speed * dt;
  while (remaining > 0 && dir) {
    const tx = nodeX(marker.col + dir.dx);
    const ty = nodeY(marker.row + dir.dy);
    const distToNode = Math.hypot(tx - marker.x, ty - marker.y);
    if (remaining >= distToNode) {
      marker.x = tx;
      marker.y = ty;
      marker.col += dir.dx;
      marker.row += dir.dy;
      remaining -= distToNode;
      onArrive(); // pick the next direction (may claim)
    } else {
      marker.x += dir.dx * remaining;
      marker.y += dir.dy * remaining;
      remaining = 0;
    }
  }
}

// --- Render ----------------------------------------------------------------
function drawBackground() {
  ctx.fillStyle = "#05030f";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawClaimed() {
  // Claimed cells fill as one solid translucent mass (no internal grid lines).
  // Glass-like blocks come in Phase 9.
  ctx.fillStyle = "rgba(25, 230, 255, 0.16)";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== FILLED) continue;
      ctx.fillRect(field.x + c * CELL, field.y + r * CELL, CELL, CELL);
    }
  }
}

function drawPerimeter() {
  // The frontier of the OPEN region — every edge where empty space meets solid
  // (claimed territory or the arena wall). This is exactly the path the marker
  // can ride, so we draw it BOLD and bright. Drawn over the dimmer arena frame
  // so the live, rideable perimeter always stands out, hugging claimed areas
  // rather than the outer rectangle. Batched into one path for speed.
  ctx.strokeStyle = "#7df9ff";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.shadowColor = "#7df9ff";
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

function drawArena() {
  // The outer frame, drawn dim/thin so the bold open-region frontier (which
  // overlays it where the border is still open) reads as the bolder line.
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1f8fa3";
  ctx.shadowColor = "#1f8fa3";
  ctx.shadowBlur = 6;
  ctx.strokeRect(field.x, field.y, field.w, field.h);
  ctx.shadowBlur = 0;
}

function drawTrail() {
  if (mode !== "cutting" || trail.length === 0) return;
  ctx.strokeStyle = "#5ad6ff"; // cut line is blue (§10); LONG colours = Phase 5
  ctx.lineWidth = 3;
  ctx.shadowColor = "#5ad6ff";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(nodeX(trail[0].col), nodeY(trail[0].row));
  for (let i = 1; i < trail.length; i++) ctx.lineTo(nodeX(trail[i].col), nodeY(trail[i].row));
  ctx.lineTo(marker.x, marker.y); // up to the live marker position
  ctx.stroke();
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

function drawHUD() {
  ctx.fillStyle = "#fff";
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(`CLAIMED ${percent.toFixed(0)}%`, 12, 10);
  ctx.fillStyle = "#ff3df0";
  ctx.fillText(`TARGET 50%`, 150, 10); // win condition arrives in Phase 4
}

function render() {
  drawBackground();
  drawClaimed();
  drawArena();
  drawPerimeter();
  drawTrail();
  drawMarker();
  drawHUD();
}

// --- Game loop -------------------------------------------------------------
let lastTime = performance.now();
function loop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
