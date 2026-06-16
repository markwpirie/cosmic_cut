// COSMIC CUT — main (entry point)
// Wires the pieces together and runs the game loop. Each concern lives in its
// own module: config (numbers), control (input), grid (the world), marker (the
// player), enemy (the Blob), game (lives/state), render (drawing). Keep thin.

import * as control from "./control.js"; // also registers keyboard listeners
import { reset as resetGrid } from "./grid.js";
import { marker, mode, trail, update as updateMarker, reset as resetMarker } from "./marker.js";
import { update as updateBlob, reset as resetBlob, collides } from "./enemy.js";
import * as game from "./game.js";
import { render } from "./render.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Lost a life but still alive: forfeit the in-progress cut, send the marker
// back to start, re-home the blob, clear any held input. Claimed area stays.
function respawn() {
  resetMarker();
  resetBlob();
  control.reset();
}

// Out of lives → wipe the level on the next key. control.js also hears this
// keydown; reset() afterwards clears whatever it queued.
window.addEventListener("keydown", () => {
  if (game.state !== "gameover") return;
  game.reset();
  resetGrid();
  resetMarker();
  resetBlob();
  control.reset();
});

// requestAnimationFrame runs ~60×/sec. Each frame: step the logic by the real
// elapsed time (dt), check for a blob hit, then draw. Frozen while game over.
let lastTime = performance.now();

function loop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  if (game.state === "playing") {
    updateMarker(dt);
    updateBlob(dt);
    if (collides(marker, mode, trail)) {
      game.loseLife();
      if (game.state === "playing") respawn();
    }
  }
  render(ctx);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
