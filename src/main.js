// COSMIC CUT — main (entry point)
// Wires the modules and runs the loop as a small state machine:
//   menu → intro → playing → (levelcomplete → intro → …) → campaigncomplete
//   playing → gameover → menu
// Concerns stay in their modules: config (numbers), levels (data), control
// (input), grid (world), marker (player), enemy (Blobs), game (state), render.

import * as control from "./control.js"; // also registers keyboard listeners
import * as grid from "./grid.js";
import { marker, mode, trail, lastCutLength, update as updateMarker, reset as resetMarker } from "./marker.js";
import * as enemy from "./enemy.js";
import * as game from "./game.js";
import { render } from "./render.js";
import * as audio from "./audio.js";
import * as fx from "./fx.js";
import { TIMING, POINTS, THEMES, field } from "./config.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Total level-complete beat: hold on the text, ripple, then a short tail.
const COMPLETE_TIME = TIMING.completeHold + TIMING.completeWipe + TIMING.completeTail;
const FCX = field.x + field.w / 2;
const FCY = field.y + field.h / 2;
const REWARD_MIN = 2500;  // show the big central read-out for bonuses, or any cut over this
const POPUP_MIN_PCT = 50; // only float a "+N%" pop-up for a big single-cut claim

const DIR_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "w", "a", "s", "d", "W", "A", "S", "D"]);

let transT = 0;        // clock for intro / levelcomplete / dead transitions
let menuSel = 1;       // selected starting zone on the menu
let popups = [];       // floating "+N%" claim pop-ups
let reward = null;     // central score read-out (bonus labels + base × mult = total)
let deathPoint = null; // where the last fatal contact happened (flashed while "dead")
let deathBlob = null;  // the blob that caught the player (also flashed)
let prevPercent = 0;   // to detect how much a claim just added
let scorePulseT = 99;  // time since the HUD score last jumped (drives a brief pulse)
let danger = 0;        // 0..1, how close a blob is to your exposed trail
let prevCutting = false; // tracks the cut-tension tone on/off
let audioStarted = false;

function zoneColor() { return THEMES[game.currentLevel().zone - 1].frontier; }

// Load the current level's world: clear the arena, home the marker, spawn the
// level's Blobs, drop any held input, pop-ups and banner.
function loadLevel() {
  grid.reset();
  resetMarker();
  enemy.reset(game.currentLevel().blobs);
  control.reset();
  fx.reset();
  prevPercent = 0;
  popups = [];
  reward = null;
  deathPoint = null;
  deathBlob = null;
  danger = 0;
}

// Lost a life but still alive: forfeit the cut, re-home marker + Blobs, keep the
// claimed territory.
function respawn() {
  resetMarker();
  enemy.reset(game.currentLevel().blobs);
  control.reset();
  deathPoint = null;
  deathBlob = null;
}

// React to entering a new state.
function onEnter(s) {
  if (s === "intro") { loadLevel(); transT = 0; }
  else if (s === "levelcomplete") { resetMarker(); transT = 0; } // marker back to start & hold
}

// Menu/intro/restart input, layered over control.js's own key listener.
window.addEventListener("keydown", (e) => {
  // First key in the page wakes the audio context (browsers require a gesture).
  audio.resume();
  if (!audioStarted) { audio.startMusic(); audioStarted = true; }
  // Sound toggles, any state.
  if (e.key === "m" || e.key === "M") { audio.toggleMute(); audio.ui(); return; }
  if (e.key === "n" || e.key === "N") { audio.toggleMusic(); return; }

  if (game.state === "menu") {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { menuSel = Math.max(1, menuSel - 1); audio.ui(); }
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { menuSel = Math.min(game.unlockedZone, menuSel + 1); audio.ui(); }
    else if (e.key === "Enter" || e.key === " ") { game.startRun(menuSel); audio.ui(); }
    return;
  }
  if (game.state === "intro") {
    // The level (and the Blobs) only start once the player picks a direction —
    // this same press is captured by control.js and steers the first move.
    if (DIR_KEYS.has(e.key)) game.beginPlay();
    return;
  }
  if (game.state === "dead") {
    // Frozen on the death spot until a key — then respawn and carry on.
    respawn();
    game.beginPlay();
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

  if (game.state === "playing") {
    const prevCount = enemy.blobs.length;
    updateMarker(dt);
    enemy.update(dt);
    const gained = grid.percent - prevPercent;
    const kills = prevCount - enemy.blobs.length;

    // A claim just landed → score it, pop-up, sound + particles + shake.
    if (gained >= POPUP_MIN_PCT) {
      const a = Math.atan2(FCY - marker.y, FCX - marker.x);
      popups.push({ text: `+${Math.round(gained)}%`, x: marker.x + Math.cos(a) * 34, y: marker.y + Math.sin(a) * 34, t: 0 });
    }
    if (gained >= 0.5 || kills > 0) {
      const res = game.scoreCut(gained, lastCutLength, kills);
      if (res.labels.length > 0 || res.total >= REWARD_MIN) reward = { ...res, t: 0 };
      scorePulseT = 0;
      audio.claim();
      if (res.labels.length) audio.bonus(res.labels.length + 1, TIMING.rewardStep); // doof doof doof
      fx.burst(marker.x, marker.y, zoneColor(), 12 + Math.round(gained), 150);
      fx.addShake(Math.min(12, 2 + gained * 0.25));
    }
    if (kills > 0) {
      audio.kill();
      fx.ring(marker.x, marker.y, "#ff6a3c", 18, 250);
      fx.addShake(9);
    }
    prevPercent = grid.percent;

    const hit = enemy.collides(marker, mode, trail);
    if (hit) {
      deathPoint = { x: marker.x, y: marker.y };
      deathBlob = { x: hit.x, y: hit.y, radius: hit.radius };
      audio.cutStop();
      audio.death();
      fx.ring(hit.x, hit.y, "#ff4d4d", 24, 320, 0.8);
      fx.burst(marker.x, marker.y, "#ffffff", 16, 220);
      fx.addShake(16);
      game.loseLife(); // → "dead" (freeze until keypress) or "gameover"
      transT = 0;
      if (game.state === "gameover") { audio.gameOver(); if (game.newHigh) audio.highScore(); }
    } else {
      // Near miss: a blob grazed your trail without hitting → small reward.
      const nm = enemy.pollNearMiss(marker, mode, trail);
      if (nm > 0) {
        game.addScore(POINTS.nearMiss * nm);
        popups.push({ text: "NEAR MISS", x: marker.x, y: marker.y - 12, t: 0 });
        audio.nearMiss();
        fx.addShake(3);
        scorePulseT = 0;
      }
      if (grid.percent >= game.currentLevel().target) {
        game.completeLevel();
        audio.levelClear();
        fx.addShake(6);
        transT = 0;
      }
    }

    // Danger level (nearest blob to the trail) drives the edge glow + music.
    const gap = enemy.threatGap(marker, mode, trail);
    danger = gap === Infinity ? 0 : Math.max(0, Math.min(1, (40 - gap) / 40));
    audio.setIntensity(0.2 + danger * 0.6 + Math.min(0.2, grid.percent / 500));
  } else if (game.state === "intro") {
    transT += dt; // banner only; play begins on the first direction press
    danger = 0;
  } else if (game.state === "dead") {
    transT += dt; // drives the contact-point flash
  } else if (game.state === "levelcomplete") {
    transT += dt;
    if (transT >= COMPLETE_TIME) {
      const livesBefore = game.lives;
      game.advance();
      if (game.lives > livesBefore) audio.extraLife(); // X-4 clear bonus life
    }
  }

  // Soft "tension" pulse while cutting — quiet when safe, swells/quickens as a
  // blob nears your line (driven by danger, not cut length).
  const cutting = game.state === "playing" && mode === "cutting";
  if (cutting && !prevCutting) { audio.cutStart(); audio.cutStartBlip(); }
  if (cutting) audio.cutTension(danger);
  if (!cutting && prevCutting) audio.cutStop();
  prevCutting = cutting;

  // Handle any state change caused by this frame's logic BEFORE drawing — so a
  // freshly-advanced level is loaded (grid cleared) before it's rendered, rather
  // than flashing the just-cleared board for a frame.
  if (game.state !== prevState) { onEnter(game.state); prevState = game.state; }

  for (const p of popups) p.t += dt;
  popups = popups.filter((p) => p.t < TIMING.popupLife);
  if (reward) { reward.t += dt; if (reward.t >= TIMING.rewardLife) reward = null; }
  scorePulseT += dt;
  fx.update(dt);

  render(ctx, { transT, menuSel, popups, reward, deathPoint, deathBlob, scorePulseT, danger });
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
