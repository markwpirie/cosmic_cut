// COSMIC CUT — game (lives, levels, zones & overall state)
// The state above the marker and the world: which level we're on, how many
// lives are left, and which screen we're showing. Data-driven progression reads
// the level table (levels.js). Zone unlocks persist in localStorage (guarded so
// the module still imports in headless tests). No DOM beyond that guarded use.

import { LEVELS, levelCount, zoneCount, zoneStart } from "./levels.js";
import { POINTS, ROWS, SUPER } from "./config.js";

const START_LIVES = 3;
const UNLOCK_KEY = "cosmiccut.unlockedZone";
const HIGH_KEY = "cosmiccut.highScore";
const SUPER_KEY = "cosmiccut.superUnlocked";
const CANDY_KEY = "cosmiccut.candyTheme";
const CANDY_MUSIC_KEY = "cosmiccut.candyMusic";

// state: "title" | "menu" | "intro" | "playing" | "dead" | "levelcomplete" | "gameover" | "campaigncomplete"
// "title" is the opening splash; "menu" is the stage-select screen.
export let state = "title";
export let lives = START_LIVES;
export let levelIndex = 0;
export let score = 0;
export let levelMult = 1; // per-level score multiplier; each SPLIT doubles it
export let unlockedZone = loadUnlock(); // highest zone whose X-1 has been reached
export let highScore = loadHigh();
export let newHigh = false; // did this run just beat the high score?
// SUPER mode (§5): clearing 5-5 unlocks S1-1+ — the same 25 levels, replayed with
// 2× enemy counts and lower (recalculated) targets. `superMode` is this run's flag;
// `superUnlocked` persists once earned; `justUnlockedSuper` flags the ONE
// campaign-complete screen that should announce the unlock (not later replays).
export let superMode = false;
export let superUnlocked = loadSuperUnlock();
export let justUnlockedSuper = false;
// CANDY MODE (cosmetic skin, config.CANDY): both flags persist. `candyTheme` is
// the skin itself; `candyMusic` picks Pink Mode vs the normal zone themes while
// the skin is on (defaults ON — it only matters when candyTheme is true).
export let candyTheme = loadFlag(CANDY_KEY, false);
export let candyMusic = loadFlag(CANDY_MUSIC_KEY, true);

export function currentLevel() {
  return LEVELS[levelIndex];
}

// The current level's spec, doubled for SUPER mode (enemy counts × SUPER.enemyMult,
// target recalculated but never below SUPER.targetMin). Everything that spawns
// enemies or checks the win condition should read through this, not currentLevel().
export function currentSpec() {
  const lv = currentLevel();
  if (!superMode) return lv;
  const dup = (arr) => Array(SUPER.enemyMult).fill(arr).flat();
  return {
    ...lv,
    qix: dup(lv.qix), blobs: dup(lv.blobs), hunters: dup(lv.hunters),
    sparx: lv.sparx * SUPER.enemyMult, fastSparx: lv.fastSparx * SUPER.enemyMult,
    target: Math.max(SUPER.targetMin, lv.target + SUPER.targetDelta),
  };
}

// Display label for the HUD/menus — "S1-1" etc. in SUPER mode.
export function levelLabel() {
  return (superMode ? "S" : "") + currentLevel().label;
}

export function addScore(n) { score += Math.round(n); }
export function addLevelMult(m) { levelMult *= m; }
// Granted by SPLIT-enclosing an "life" Special Blob (§8). No cap (§7 — matches
// the X-4 extra-life pickup).
export function addLife() { lives += 1; }

// Score a finished cut and return the full breakdown for the on-screen read-out:
//   { labels, base, mult, killPts, total }
// base = points per % claimed; mult = size bonus (BLOCK OUT/MEGA-CUT) × length
// bonus (LONG tiers) × the current level multiplier; killPts = per-Blob kill
// points (also ×level mult). A SPLIT additionally grants ×2 to the level
// multiplier for the rest of the level. labels are the bonus names, in stack
// order, for the staggered "doof doof doof" reveal.
export function scoreCut(gainedPct, length, kills, slow = false) {
  const labels = [];
  let mult = 1;
  if (gainedPct >= POINTS.megaCutPct) { mult *= POINTS.megaCutMult; labels.push("MEGA-CUT"); }
  else if (gainedPct >= POINTS.blockOutPct) { mult *= POINTS.blockOutMult; labels.push("BLOCK OUT"); }
  if (length >= POINTS.megaLongHeights * ROWS) { mult *= POINTS.megaLongMult; labels.push("MEGA LONG"); }
  else if (length >= POINTS.superLongHeights * ROWS) { mult *= POINTS.superLongMult; labels.push("SUPER LONG"); }
  else if (length >= POINTS.longHeights * ROWS) { mult *= POINTS.longMult; labels.push("LONG"); }
  if (slow) { mult *= POINTS.slowCutMult; labels.push("SLOW DRAW"); } // the Stix double
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

// Generic persisted boolean (guarded like the rest): "1"/"0" in storage,
// `fallback` when unset or storage is unavailable (headless / private mode).
function loadFlag(key, fallback) {
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(key);
      if (v === "1") return true;
      if (v === "0") return false;
    }
  } catch (e) { /* ignore */ }
  return fallback;
}
function saveFlag(key, val) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(key, val ? "1" : "0"); }
  catch (e) { /* ignore */ }
}
export function toggleCandy() { candyTheme = !candyTheme; saveFlag(CANDY_KEY, candyTheme); }
export function toggleCandyMusic() { candyMusic = !candyMusic; saveFlag(CANDY_MUSIC_KEY, candyMusic); }

// Pause-menu row order — single source of truth so main.js (input/hit-testing)
// and render-pixi.js (drawing) never drift apart. CANDY MUSIC only appears
// while the skin itself is on (mirrors the start-menu chip/row pairing).
export function pauseMenuRows() {
  return candyTheme
    ? ["resume", "sfx", "music", "candy", "candyMusic", "quit"]
    : ["resume", "sfx", "music", "candy", "quit"];
}

function loadSuperUnlock() {
  try { if (typeof localStorage !== "undefined") return localStorage.getItem(SUPER_KEY) === "1"; }
  catch (e) { /* no storage (headless / private mode) — ignore */ }
  return false;
}
function saveSuperUnlock() {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(SUPER_KEY, superUnlocked ? "1" : "0"); }
  catch (e) { /* ignore */ }
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
// Start a fresh run from a chosen (unlocked) zone's first level. `asSuper` starts
// the SUPER campaign instead (only takes effect if it's actually unlocked).
export function startRun(zone, asSuper = false) {
  superMode = asSuper && superUnlocked;
  justUnlockedSuper = false;
  const z = Math.max(1, Math.min(zone, superMode ? zoneCount : unlockedZone));
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
// Clearing the LAST level for the first time NOT in SUPER mode unlocks SUPER.
export function advance() {
  if (currentLevel().extraLife) lives += 1;
  if (levelIndex >= levelCount - 1) {
    recordScore();
    if (!superMode && !superUnlocked) { superUnlocked = true; saveSuperUnlock(); justUnlockedSuper = true; }
    state = "campaigncomplete";
    return;
  }
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

// Instructions screen, reachable from the zone-select menu (the "?" button/H
// key) — a read-only overlay, not a real state transition in the campaign
// sense, but modeled as one so main.js's existing state-driven input routing
// and render-pixi's state-driven draw dispatch both just work unchanged.
export function openHelp() { state = "help"; }
export function closeHelp() { state = "menu"; }

export function toMenu() {
  state = "menu";
}

// Bail out of the current run (from the pause menu) straight to stage-select.
// Commits the score so far to the high-score table first — quitting early
// shouldn't forfeit a high score just because the run didn't end in game over.
export function quitToMenu() {
  recordScore();
  state = "menu";
}

// Test-only resets (used by headless tests).
export function _resetUnlock() {
  unlockedZone = 1;
}
export function _resetSuper() {
  superUnlocked = false;
  superMode = false;
  justUnlockedSuper = false;
}
export function _resetHigh() {
  highScore = 0;
  newHigh = false;
}
