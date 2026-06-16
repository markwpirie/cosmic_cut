// COSMIC CUT — main (entry point)
// Wires the pieces together and runs the game loop. Each concern lives in its
// own module: config (numbers), control (input), grid (the world), marker (the
// player), render (drawing). Keep this file thin.

import "./control.js"; // registers keyboard listeners (side-effect import)
import { update } from "./marker.js";
import { render } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// requestAnimationFrame runs ~60×/sec. Each frame: update the logic by the real
// elapsed time (dt), then draw.
let lastTime = performance.now();

function loop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  update(dt);
  render(ctx);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
