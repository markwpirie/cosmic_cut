// COSMIC CUT — game (lives, levels, zones & overall state)
// The state above the marker and the world: which level we're on, how many
// lives are left, and which screen we're showing. Data-driven progression reads
// the level table (levels.js). Zone unlocks persist in localStorage (guarded so
// the module still imports in headless tests). No DOM beyond that guarded use.

import { LEVELS, levelCount, zoneCount, zoneStart } from "./levels.js";
import { POINTS, ROWS } from "./config.js";

const START_LIVES = 3;
const UNLOCK_KEY = "cosmiccut.unlockedZone";
const HIGH_KEY = "cosmiccut.highScore";

// state: "menu" | "intro" | "playing" | "dead" | "levelcomplete" | "gameover" | "campaigncomplete"
export let state = "menu";
export let lives = START_LIVES;
export let levelIndex = 0;
export let score = 0;
export let levelMult = 1; // per-level score multiplier; each SPLIT doubles it
export let unlockedZone = loadUnlock(); // highest zone whose X-1 has been reached
export let highScore = loadHigh();
export let newHigh = false; // did this run just beat the high score?

export function currentLevel() {
  return LEVELS[levelIndex];
}

export function addScore(n) { score += Math.round(n); }
export function addLevelMult(m) { levelMult *= m; }

// Score a finished cut and return the full breakdown for the on-screen read-out:
//   { labels, base, mult, killPts, total }
// base = points per % claimed; mult = size bonus (BLOCK OUT/MEGA-CUT) × length
// bonus (LONG tiers) × the current level multiplier; killPts = per-Blob kill
// points (also ×level mult). A SPLIT additionally grants ×2 to the level
// multiplier for the rest of the level. labels are the bonus names, in stack
// order, for the staggered "doof doof doof" reveal.
export function scoreCut(gainedPct, length, kills) {
  const labels = [];
  let mult = 1;
  if (gainedPct >= POINTS.megaCutPct) { mult *= POINTS.megaCutMult; labels.push("MEGA-CUT"); }
  else if (gainedPct >= POINTS.blockOutPct) { mult *= POINTS.blockOutMult; labels.push("BLOCK OUT"); }
  if (length >= POINTS.megaLongHeights * ROWS) { mult *= POINTS.megaLongMult; labels.push("MEGA LONG"); }
  else if (length >= POINTS.superLongHeights * ROWS) { mult *= POINTS.superLongMult; labels.push("SUPER LONG"); }
  else if (length >= POINTS.longHeights * ROWS) { mult *= POINTS.longMult; labels.push("LONG"); }
  if (kills > 0) labels.push("SPLIT");

  const appliedMult = mult * levelMult;
  const base = gainedPct * POINTS.perPercent;
  const killPts = kills > 0 ? kills * POINTS.perKill * levelMult : 0;
  const total = Math.round(base * appliedMult + killPts);
  addScore(total);
  if (kills > 0) levelMult *= POINTS.splitMult; // ×2 for the rest of the level

  return { labels, base: Math.round(base), mult: appliedMult, killPts: Math.round(killPts), total };
}

// --- unlock persistence (guarded) ------------------------------------------
function loadUnlock() {
  try {
    if (typeof localStorage !== "undefined") {
      const v = parseInt(localStorage.getItem(UNLOCK_KEY), 10);
      if (v >= 1 && v <= zoneCount) return v;
    }
  } catch (e) { /* no storage (headless / private mode) — ignore */ }
  return 1;
}
function saveUnlock() {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(UNLOCK_KEY, String(unlockedZone));
  } catch (e) { /* ignore */ }
}
function unlock(zone) {
  if (zone > unlockedZone) { unlockedZone = zone; saveUnlock(); }
}

function loadHigh() {
  try {
    if (typeof localStorage !== "undefined") {
      const v = parseInt(localStorage.getItem(HIGH_KEY), 10);
      if (v > 0) return v;
    }
  } catch (e) { /* ignore */ }
  return 0;
}
// Commit the run's score to the high-score table at the end of a run.
function recordScore() {
  if (score > highScore) {
    highScore = score;
    newHigh = true;
    try { if (typeof localStorage !== "undefined") localStorage.setItem(HIGH_KEY, String(highScore)); } catch (e) { /* ignore */ }
  }
}

// --- run flow ---------------------------------------------------------------
// Start a fresh run from a chosen (unlocked) zone's first level.
export function startRun(zone) {
  const z = Math.max(1, Math.min(zone, unlockedZone));
  lives = START_LIVES;
  score = 0;
  levelMult = 1;
  newHigh = false;
  levelIndex = zoneStart(z);
  state = "intro";
}

// Intro banner finished → play.
export function beginPlay() {
  state = "playing";
}

// Target % reached → award the clear bonus, then the level-complete beat.
export function completeLevel() {
  addScore(POINTS.levelClear + lives * POINTS.lifeBonus);
  state = "levelcomplete";
}

// Move on from a completed level: extra life on X-4 (no cap, §14), reset the
// per-level multiplier, then the next level — or the campaign-complete screen.
export function advance() {
  if (currentLevel().extraLife) lives += 1;
  if (levelIndex >= levelCount - 1) { recordScore(); state = "campaigncomplete"; return; }
  levelIndex += 1;
  levelMult = 1;
  unlock(currentLevel().zone);
  state = "intro";
}

// A blob hit. Lose a life; out of lives → game over, otherwise freeze on the
// death spot ("dead") until the player presses a key to respawn.
export function loseLife() {
  lives -= 1;
  if (lives <= 0) { lives = 0; recordScore(); state = "gameover"; }
  else state = "dead";
}

export function toMenu() {
  state = "menu";
}

// Test-only resets (used by headless tests).
export function _resetUnlock() {
  unlockedZone = 1;
}
export function _resetHigh() {
  highScore = 0;
  newHigh = false;
}
