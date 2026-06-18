// COSMIC CUT — audio director (music policy / orchestration)
// Sits between the game loop and the low-level engine (audio.js). It decides
// WHAT music plays and HOW it responds to play: a tension curve driven by fill%
// + danger (speeds up + pitches up the stage track, capped by config), and an
// event system of two stinger kinds —
//   layer:     plays OVER the music, non-interrupting   (kill)
//   interrupt: pauses the stage track, plays a short MP3, then the stage RESUMES
//              where it left off                        (level complete, caught)
// No DOM and no game-module coupling: the loop passes plain { fillPercent, danger }
// numbers, so this stays headless-importable like the rest of the engine.

import * as audio from "./audio.js";
import { AUDIO } from "./config.js";

let currentStageKey = null; // the stage track we're on (e.g. "stage3")
let interruptedKey = null;  // a stage track paused by a jingle, to resume next
let tension = 0;            // smoothed 0..1
let pingTimer = 0;          // seconds until the next sonar ping

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// --- scene cues (called from main.js onEnter) ------------------------------
export function title() { interruptedKey = null; audio.setTrack("title"); }
export function stageSelect() { interruptedKey = null; audio.setTrack("stageSelect"); }

// Play a zone's stage theme. If it's the very track an interrupting jingle just
// paused, resume it from that position; otherwise start fresh. Tension resets so
// each level opens calm.
export function stage(zone) {
  const key = "stage" + zone;
  const resume = key === interruptedKey;
  interruptedKey = null;
  currentStageKey = key;
  tension = 0;
  pingTimer = AUDIO.sonar.startDelay; // calm grace before the sonar kicks in
  audio.setMusicRate(1);
  audio.setTrack(key, { resume });
}

// --- per-frame tension (called during play, with the frame's dt) -----------
// Tension (fill% + danger) drives the SONAR PING RATE — the pings quicken as the
// board fills and a blob crowds your trail. (Music speed-up stays off: rateSpan 0.)
export function update({ fillPercent = 0, danger = 0, dt = 0 } = {}) {
  const T = AUDIO.tension;
  const target = clamp01(T.progressWeight * (fillPercent / 100) + T.dangerWeight * danger);
  tension += (target - tension) * T.ease; // smooth so the ping rate eases, not jumps
  audio.setMusicRate(1 + tension * T.rateSpan);
  audio.setIntensity(T.synthBase + tension * T.synthSpan);

  const S = AUDIO.sonar;
  pingTimer -= dt;
  if (pingTimer <= 0) {
    audio.sonarPing(tension);
    pingTimer = S.slowInterval + (S.fastInterval - S.slowInterval) * tension; // faster as tension rises
  }
}

// --- event stingers ---------------------------------------------------------
// Layered: a bright hit over the music; the explosion FX is owned by main.js.
export function kill() { audio.killStinger(); }

// Interrupting + resume: pause the stage track and play the short jingle. The
// stage track keeps its position, and the next stage() call resumes it.
export function levelComplete() { interruptedKey = currentStageKey; audio.setTrack("stageClear"); }
export function caught() { interruptedKey = currentStageKey; audio.setTrack("gameOver"); }

// Terminal: out of lives — play it through; the run ends at the menu, no resume.
export function gameOver() { interruptedKey = null; audio.setTrack("gameOver"); }
