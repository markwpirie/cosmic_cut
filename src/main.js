// COSMIC CUT — main (entry point)
// Wires the modules and runs the loop as a small state machine:
//   title → menu → intro → playing → (levelcomplete → intro → …) → campaigncomplete
//   playing → gameover → menu
// Concerns stay in their modules: config (numbers), levels (data), control
// (input), grid (world), marker (player), enemy (Blobs), game (state), render.

import * as control from "./control.js"; // also registers keyboard listeners
import * as grid from "./grid.js";
import { marker, mode, trail, lastCutLength, update as updateMarker, reset as resetMarker, home as homeMarker } from "./marker.js";
import * as enemy from "./enemy.js";
import * as game from "./game.js";
import { render } from "./render.js";
import * as audio from "./audio.js";
import * as director from "./audio-director.js";
import * as fx from "./fx.js";
import { TIMING, POINTS, THEMES, field } from "./config.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Total level-complete beat: read out the score, hold the banner, ripple, tail.
const COMPLETE_TIME = TIMING.completeScore + TIMING.completeHold + TIMING.completeWipe + TIMING.completeTail;
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
let paused = false;      // P / ESC freeze during play

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
// claimed territory. Respawn at the lowest, most-central node still bordering
// open space, so a bottom block-out doesn't strand you far from the action.
function respawn() {
  const spot = grid.respawnNode();
  homeMarker(spot.col, spot.row);
  enemy.reset(game.currentLevel().blobs);
  control.reset();
  deathPoint = null;
  deathBlob = null;
  popups = [];
}

// React to entering a new state — the AudioDirector owns which music moment it
// cues (incl. interrupt/resume of the stage track).
function onEnter(s) {
  if (s === "title") director.title();
  else if (s === "menu") director.stageSelect();
  else if (s === "intro") { loadLevel(); transT = 0; director.stage(game.currentLevel().zone); }
  else if (s === "playing") director.stage(game.currentLevel().zone); // resume after a caught/jingle break (no-op if already on it)
  else if (s === "levelcomplete") {
    resetMarker(); transT = 0;
    if (reward) reward.t = 0; // replay the final cut's read-out fresh during the score phase
    director.levelComplete(); // Stage Clear interrupts; stage resumes next level
  }
  else if (s === "dead") director.caught();   // Game Over MP3 interrupts; stage resumes on respawn
  else if (s === "gameover") director.gameOver(); // terminal — plays through, then menu
  // "campaigncomplete" keeps whatever's already playing.
}

// Menu/intro/restart input, layered over control.js's own key listener.
window.addEventListener("keydown", (e) => {
  // The very first key wakes the audio context (browsers require a gesture) and
  // starts the opening theme — consumed so the title screen stays up to hear it.
  audio.resume();
  if (!audioStarted) { audio.startMusic(); audioStarted = true; return; }
  // Sound toggles, any state.
  if (e.key === "m" || e.key === "M") { audio.toggleMute(); audio.ui(); return; }
  if (e.key === "n" || e.key === "N") { audio.toggleMusic(); return; }

  // Pause toggle (during the active level / death freeze). Halts the loop, ducks
  // the music + movement/cut tones, and resumes them on unpause.
  if (e.key === "p" || e.key === "P" || e.key === "Escape") {
    if (game.state === "playing" || game.state === "intro" || game.state === "dead") {
      paused = !paused;
      audio.ui();
      if (paused) { audio.stopMusic(); audio.moveTone(false); audio.cutStop(); prevCutting = false; }
      else audio.startMusic();
    }
    return;
  }
  if (paused) return; // swallow all other input while paused

  if (game.state === "title") { game.toMenu(); audio.ui(); return; } // splash → stage select

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
    // Frozen on the death spot. A brief forced hold + ignoring held-key
    // auto-repeat stops a mashed/held key from skipping straight into respawn.
    if (transT < TIMING.deathHold || e.repeat) return;
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

  if (paused) { // frozen: draw the overlay over the held frame, advance nothing
    render(ctx, { transT, menuSel, popups, reward, deathPoint, deathBlob, scorePulseT, danger, beat: 0, paused: true });
    requestAnimationFrame(loop);
    return;
  }

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
      audio.claimWhoosh(); // the "schooooofff" as the line closes
      if (res.labels.length) audio.bonus(res.labels.length + 1, TIMING.rewardStep); // doof doof doof
      fx.burst(marker.x, marker.y, zoneColor(), 12 + Math.round(gained), 150);
      fx.addShake(Math.min(12, 2 + gained * 0.25));
    }
    if (kills > 0) {
      audio.kill();
      director.kill(); // bright musical stinger layered over the music
      // Each trapped blob explodes where it was caught, in its own colour.
      for (const k of enemy.lastKilled) {
        fx.burst(k.x, k.y, k.color, 26, 320);
        fx.ring(k.x, k.y, k.color, 20, 300, 0.7);
        fx.ring(k.x, k.y, "#ffffff", 14, 200, 0.45);
      }
      fx.addShake(11);
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
      popups = []; // drop any lingering "+N%"/NEAR MISS so they don't show over CAUGHT!
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
    // Music tension: fill% + danger speed up / pitch up the stage track (and the
    // synth intensity for the fallback). All curve constants in config.AUDIO.tension.
    director.update({ fillPercent: grid.percent, danger, dt, cutting: mode === "cutting" });
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

  // Movement "schoo": present while in play, brighter while cutting, silent otherwise.
  audio.moveTone(game.state === "playing", cutting ? 1 : 0);

  // Handle any state change caused by this frame's logic BEFORE drawing — so a
  // freshly-advanced level is loaded (grid cleared) before it's rendered, rather
  // than flashing the just-cleared board for a frame.
  if (game.state !== prevState) { onEnter(game.state); prevState = game.state; }

  for (const p of popups) p.t += dt;
  popups = popups.filter((p) => p.t < TIMING.popupLife);
  if (reward) { reward.t += dt; if (reward.t >= TIMING.rewardLife) reward = null; }
  scorePulseT += dt;
  fx.update(dt);

  const beat = audio.musicPulse(); // 0..1 bass-driven pulse for a beat-synced screen glow
  render(ctx, { transT, menuSel, popups, reward, deathPoint, deathBlob, scorePulseT, danger, beat });
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
