// COSMIC CUT — main (entry point)
// Wires the modules and runs the loop as a small state machine:
//   menu → intro → playing → (levelcomplete → intro → …) → campaigncomplete
//   playing → gameover → menu
// Concerns stay in their modules: config (numbers), levels (data), control
// (input), grid (world), marker (player), enemy (Blobs), game (state), render.

import * as control from "./control.js"; // also registers keyboard listeners
import * as grid from "./grid.js";
import { marker, mode, trail, update as updateMarker, reset as resetMarker } from "./marker.js";
import * as enemy from "./enemy.js";
import * as game from "./game.js";
import { render } from "./render.js";
import { TIMING } from "./config.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Total level-complete beat: hold on the text, ripple, then a short tail.
const COMPLETE_TIME = TIMING.completeHold + TIMING.completeWipe + TIMING.completeTail;

const DIR_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "w", "a", "s", "d", "W", "A", "S", "D"]);

let transT = 0;        // clock for intro / levelcomplete transitions
let menuSel = 1;       // selected starting zone on the menu
let popups = [];       // floating "+N%" claim pop-ups
let banner = null;     // central reward flash ("SPLIT!")
let prevPercent = 0;   // to detect how much a claim just added

// Load the current level's world: clear the arena, home the marker, spawn the
// level's Blobs, drop any held input, pop-ups and banner.
function loadLevel() {
  grid.reset();
  resetMarker();
  enemy.reset(game.currentLevel().blobs);
  control.reset();
  prevPercent = 0;
  popups = [];
  banner = null;
}

// Lost a life but still alive: forfeit the cut, re-home marker + Blobs, keep the
// claimed territory.
function respawn() {
  resetMarker();
  enemy.reset(game.currentLevel().blobs);
  control.reset();
}

// React to entering a new state.
function onEnter(s) {
  if (s === "intro") { loadLevel(); transT = 0; }
  else if (s === "levelcomplete") { resetMarker(); transT = 0; } // marker back to start & hold
}

// Menu/intro/restart input, layered over control.js's own key listener.
window.addEventListener("keydown", (e) => {
  if (game.state === "menu") {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") menuSel = Math.max(1, menuSel - 1);
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") menuSel = Math.min(game.unlockedZone, menuSel + 1);
    else if (e.key === "Enter" || e.key === " ") game.startRun(menuSel);
    return;
  }
  if (game.state === "intro") {
    // The level (and the Blobs) only start once the player picks a direction —
    // this same press is captured by control.js and steers the first move.
    if (DIR_KEYS.has(e.key)) game.beginPlay();
    return;
  }
  if (game.state === "gameover" || game.state === "campaigncomplete") {
    game.toMenu();
    menuSel = Math.min(menuSel, game.unlockedZone);
  }
});

let lastTime = performance.now();
let prevState = null;

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05); // clamp big gaps (tab switches)
  lastTime = now;

  if (game.state !== prevState) { onEnter(game.state); prevState = game.state; }

  if (game.state === "playing") {
    const prevCount = enemy.blobs.length;
    updateMarker(dt);
    enemy.update(dt);
    // A claim just landed → float a "+N%" pop-up at the marker.
    const gained = grid.percent - prevPercent;
    if (gained >= 0.5) popups.push({ text: `+${Math.max(1, Math.round(gained))}%`, x: marker.x, y: marker.y, t: 0 });
    prevPercent = grid.percent;
    // A blob died on a claimed side → that was a SPLIT.
    if (enemy.blobs.length < prevCount) banner = { text: "SPLIT!", t: 0 };
    if (enemy.collides(marker, mode, trail)) {
      game.loseLife();
      if (game.state === "playing") respawn();
    } else if (grid.percent >= game.currentLevel().target) {
      game.completeLevel();
    }
  } else if (game.state === "intro") {
    transT += dt; // banner only; play begins on the first direction press
  } else if (game.state === "levelcomplete") {
    transT += dt;
    if (transT >= COMPLETE_TIME) game.advance();
  }

  for (const p of popups) p.t += dt;
  popups = popups.filter((p) => p.t < TIMING.popupLife);
  if (banner) { banner.t += dt; if (banner.t >= TIMING.splitFlash) banner = null; }

  render(ctx, transT, menuSel, popups, banner);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
