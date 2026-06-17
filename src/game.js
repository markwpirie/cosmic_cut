// COSMIC CUT — game (lives, levels, zones & overall state)
// The state above the marker and the world: which level we're on, how many
// lives are left, and which screen we're showing. Data-driven progression reads
// the level table (levels.js). Zone unlocks persist in localStorage (guarded so
// the module still imports in headless tests). No DOM beyond that guarded use.

import { LEVELS, levelCount, zoneCount, zoneStart } from "./levels.js";
import { POINTS, ROWS } from "./config.js";

const START_LIVES = 3;
const UNLOCK_KEY = "cosmiccut.unlockedZone";

// state: "menu" | "intro" | "playing" | "dead" | "levelcomplete" | "gameover" | "campaigncomplete"
export let state = "menu";
export let lives = START_LIVES;
export let levelIndex = 0;
export let score = 0;
export let levelMult = 1; // per-level score multiplier; each SPLIT doubles it
export let unlockedZone = loadUnlock(); // highest zone whose X-1 has been reached

export function currentLevel() {
  return LEVELS[levelIndex];
}

export function addScore(n) { score += Math.round(n); }
export function addLevelMult(m) { levelMult *= m; }

// Score a finished cut and return a banner label to flash (or null). Base points
// per % claimed × size bonus (BLOCK OUT/MEGA-CUT) × length bonus (LONG tiers) ×
// the level multiplier; plus per-kill points, and a fresh ×2 to the level
// multiplier on a SPLIT. Two or more bonus names → "MULTI STACK!".
export function scoreCut(gainedPct, length, kills) {
  const labels = [];
  let mult = 1;
  if (gainedPct >= POINTS.megaCutPct) { mult *= POINTS.megaCutMult; labels.push("MEGA-CUT"); }
  else if (gainedPct >= POINTS.blockOutPct) { mult *= POINTS.blockOutMult; labels.push("BLOCK OUT"); }
  if (length >= 3 * ROWS) { mult *= POINTS.megaLongMult; labels.push("MEGA LONG"); }
  else if (length >= 2 * ROWS) { mult *= POINTS.superLongMult; labels.push("SUPER LONG"); }
  else if (length >= ROWS) { mult *= POINTS.longMult; labels.push("LONG"); }

  let pts = gainedPct * POINTS.perPercent * mult * levelMult;
  if (kills > 0) { pts += kills * POINTS.perKill * levelMult; labels.push("SPLIT"); }
  addScore(pts);
  if (kills > 0) levelMult *= POINTS.splitMult; // ×2 for the rest of the level

  if (labels.length >= 2) return "MULTI STACK!";
  if (labels.length === 1) return labels[0] + "!";
  return null;
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
  score = 0;
  levelMult = 1;
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
  if (levelIndex >= levelCount - 1) { state = "campaigncomplete"; return; }
  levelIndex += 1;
  levelMult = 1;
  unlock(currentLevel().zone);
  state = "intro";
}

// A blob hit. Lose a life; out of lives → game over, otherwise freeze on the
// death spot ("dead") until the player presses a key to respawn.
export function loseLife() {
  lives -= 1;
  if (lives <= 0) { lives = 0; state = "gameover"; }
  else state = "dead";
}

export function toMenu() {
  state = "menu";
}

// Test-only reset of unlock progress (used by headless tests).
export function _resetUnlock() {
  unlockedZone = 1;
}
