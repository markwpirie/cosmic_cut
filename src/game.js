// COSMIC CUT — game (lives, levels, zones & overall state)
// The state above the marker and the world: which level we're on, how many
// lives are left, and which screen we're showing. Data-driven progression reads
// the level table (levels.js). Zone unlocks persist in localStorage (guarded so
// the module still imports in headless tests). No DOM beyond that guarded use.

import { LEVELS, levelCount, zoneCount, zoneStart } from "./levels.js";

const START_LIVES = 3;
const UNLOCK_KEY = "cosmiccut.unlockedZone";

// state: "menu" | "intro" | "playing" | "levelcomplete" | "gameover" | "campaigncomplete"
export let state = "menu";
export let lives = START_LIVES;
export let levelIndex = 0;
export let unlockedZone = loadUnlock(); // highest zone whose X-1 has been reached

export function currentLevel() {
  return LEVELS[levelIndex];
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

// --- run flow ---------------------------------------------------------------
// Start a fresh run from a chosen (unlocked) zone's first level.
export function startRun(zone) {
  const z = Math.max(1, Math.min(zone, unlockedZone));
  lives = START_LIVES;
  levelIndex = zoneStart(z);
  state = "intro";
}

// Intro banner finished → play.
export function beginPlay() {
  state = "playing";
}

// Target % reached → the level-complete beat (the wipe/pause runs in main+render).
export function completeLevel() {
  state = "levelcomplete";
}

// Move on from a completed level: extra life on X-4 (no cap, §14), then the next
// level — or the campaign-complete screen after the final level.
export function advance() {
  if (currentLevel().extraLife) lives += 1;
  if (levelIndex >= levelCount - 1) { state = "campaigncomplete"; return; }
  levelIndex += 1;
  unlock(currentLevel().zone);
  state = "intro";
}

export function loseLife() {
  lives -= 1;
  if (lives <= 0) { lives = 0; state = "gameover"; }
}

export function toMenu() {
  state = "menu";
}

// Test-only reset of unlock progress (used by headless tests).
export function _resetUnlock() {
  unlockedZone = 1;
}
