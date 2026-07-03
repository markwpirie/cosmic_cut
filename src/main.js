// COSMIC CUT — main (entry point)
// Wires the modules and runs the loop as a small state machine:
//   title → menu → intro → playing → (levelcomplete → intro → …) → campaigncomplete
//   playing → gameover → menu
// Concerns stay in their modules: config (numbers), levels (data), control
// (input), grid (world), marker (player), enemy (Blobs), game (state), render.

import * as control from "./control.js"; // also registers keyboard listeners
import * as grid from "./grid.js";
import { marker, mode, dir, trail, lastCutLength, lastCutSlow, zoomDash, selfHit, startZoomDash, snapToNode, update as updateMarker, reset as resetMarker, home as homeMarker } from "./marker.js";
import * as enemy from "./enemy.js";
import * as game from "./game.js";
import { render } from "./render.js";
import * as audio from "./audio.js";
import * as director from "./audio-director.js";
import * as fx from "./fx.js";
import { TIMING, POINTS, THEMES, POWERUPS, field, WIDTH, HEIGHT, MOBILE, TOUCH } from "./config.js";
import * as powerups from "./powerups.js";
import * as sparx from "./sparx.js";

// Renderer selection (Phase 9). Default is the canvas renderer; add ?pixi to the
// URL to use the Pixi.js renderer (loaded on demand so canvas mode never fetches
// Pixi). Both honour the same render(view) contract via the draw() helper below.
const USE_PIXI = typeof location !== "undefined" && new URLSearchParams(location.search).has("pixi");
const canvas = document.getElementById("game");
// The canvas takes its size from config (device-branched: portrait on mobile),
// overriding the static HTML attributes — set BEFORE either renderer initialises.
canvas.width = WIDTH;
canvas.height = HEIGHT;
let ctx = null;
let pixiRenderer = null;
if (USE_PIXI) {
  pixiRenderer = await import("./render-pixi.js");
  await pixiRenderer.init(canvas);
} else {
  ctx = canvas.getContext("2d");
}
// Contain-fit display sizing, applied AFTER init because Pixi's autoDensity writes
// its own inline style. Biggest undistorted fit: viewport width, or the width the
// viewport height allows, capped at native size so desktop stays pixel-crisp.
// (dvh tracks the iOS URL bar; the ratio is device-branched so CSS can't hardcode it.)
const RATIO = (WIDTH / HEIGHT).toFixed(4);
canvas.style.width = `min(100vw, calc(100dvh * ${RATIO}), ${WIDTH}px)`;
canvas.style.height = "auto";
canvas.style.aspectRatio = `${WIDTH} / ${HEIGHT}`;
function draw(view) {
  if (pixiRenderer) pixiRenderer.render(view);
  else render(ctx, view);
}

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
const SHEAF_RESPAWN = 1.5; // seconds before a new Qix appears once the board has none
let sheafRespawnT = SHEAF_RESPAWN;

function zoneColor() { return THEMES[game.currentLevel().zone - 1].frontier; }

// Load the current level's world: clear the arena, home the marker, spawn the
// level's Blobs, drop any held input, pop-ups and banner.
function loadLevel() {
  grid.reset();
  resetMarker();
  const lv = game.currentLevel();
  enemy.reset({ qix: lv.qix || [], blobs: lv.blobs || [], hunters: lv.hunters || [], boss: lv.boss });
  sparx.reset(lv.sparx || 0, lv.fastSparx || 0);
  control.reset();
  fx.reset();
  powerups.reset();
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
  const rlv = game.currentLevel();
  enemy.reset({ qix: rlv.qix || [], blobs: rlv.blobs || [], hunters: rlv.hunters || [], boss: rlv.boss });
  sparx.reset(rlv.sparx || 0, rlv.fastSparx || 0);
  control.reset();
  powerups.reset();
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
    if (powerups.isAiming()) { powerups.cancelZoom(); return; } // cancel ZOOM aim
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
  // DEV/TEST: Z drops a ZOOM on the marker (instant pickup) to test the aim path.
  // Remove this and powerups.devSpawnZoom before shipping.
  if ((e.key === "z" || e.key === "Z") && game.state === "playing" && !powerups.isAiming()) {
    powerups.devSpawnZoom(marker.x, marker.y); return;
  }

  // ZOOM direction selection — absorbs input until the player picks a direction.
  if (powerups.isAiming()) {
    const zoomDirs = {
      ArrowUp: {dx:0,dy:-1}, w: {dx:0,dy:-1}, W: {dx:0,dy:-1},
      ArrowDown: {dx:0,dy:1}, s: {dx:0,dy:1}, S: {dx:0,dy:1},
      ArrowLeft: {dx:-1,dy:0}, a: {dx:-1,dy:0}, A: {dx:-1,dy:0},
      ArrowRight: {dx:1,dy:0}, d: {dx:1,dy:0}, D: {dx:1,dy:0},
    };
    const d = zoomDirs[e.key];
    if (d && startZoomDash(d.dx, d.dy)) {
      // Dash committed on the marker — leave aim mode and let it rip. If the chosen
      // heading can't start a cut (e.g. pressing along the wall), startZoomDash
      // returns false and we stay aiming so the player can pick another direction.
      powerups.endAiming();
      audio.powerupPickup();
      popups.push({ text: "ZOOM!", x: marker.x, y: marker.y - 20, t: 0 });
    } else if (d) {
      // A real direction key that startZoomDash rejected (e.g. picked up ZOOM while
      // RIDING: only the one heading that leads into open field can ever dash from
      // there — the other 3 are always invalid). Without feedback this reads as a
      // total softlock ("arrows show, nothing happens"); a quick reject cue makes it
      // clear the input landed and another direction is needed.
      audio.ui();
      fx.addShake(3);
    }
    return; // swallow all keys (including non-directional) during aiming
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

// --- Touch controls (mobile / iPhone) ----------------------------------------
// A relative virtual joystick: the primary finger's displacement direction is the
// "held" heading (so the marker turns onto that line at junctions, exactly like a
// held arrow key); a direction change also fires a fresh press (start a cut / turn
// now). A SECOND finger = slow draw (SPACE). Taps drive the menus. Keyboard still
// works alongside. Built on control.press/release/setSlow so it reuses the intent model.
const SYNTH = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
let touchId = null, touchAnchor = null, touchDir = null;
let touchMoved = false;      // did the steering touch leave the dead-zone? (tap vs swipe)
let anchorState = null;      // game.state when the steering touch landed
let slowTouchId = null; // the finger holding the on-screen SLOW button (mobile)

// Map a touch's client coords into canvas (game) coordinates — the canvas is
// contain-fit scaled, so client px ≠ game px.
function canvasPos(t) {
  const r = canvas.getBoundingClientRect();
  return { x: (t.clientX - r.left) * (WIDTH / r.width), y: (t.clientY - r.top) * (HEIGHT / r.height) };
}
function hitSlowBtn(t) {
  if (!MOBILE) return false;
  const p = canvasPos(t), b = TOUCH.slowBtn;
  return Math.hypot(p.x - b.x, p.y - b.y) <= b.hitR;
}
// SLOW is held while the button finger is down OR two+ steering fingers are down
// (the original two-finger gesture still works).
function refreshSlow(e) {
  let steerCount = 0;
  for (const t of e.touches) if (t.identifier !== slowTouchId) steerCount++;
  control.setSlow(slowTouchId !== null || steerCount >= 2);
}

function touchDominant(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}
function setTouchDir(name) {
  // On the zone-select menu a swipe moves the selection (mirrors ← → keys);
  // it never feeds movement intents there.
  if (game.state === "menu") {
    if (name === "left") { menuSel = Math.max(1, menuSel - 1); audio.ui(); }
    else if (name === "right") { menuSel = Math.min(game.unlockedZone, menuSel + 1); audio.ui(); }
    return;
  }
  if (touchDir === name) return;
  if (touchDir) control.release(SYNTH[touchDir]);
  touchDir = name;
  if (name) {
    control.press(SYNTH[name]);
    if (game.state === "intro") game.beginPlay(); // a direction begins the level (like a key)
  }
}
// Shared "a touch happened" gesture: wake audio (first gesture) + advance non-play
// screens. Returns true if it consumed the very first gesture (audio bootstrap).
function touchGesture() {
  audio.resume();
  if (!audioStarted) { audio.startMusic(); audioStarted = true; return true; }
  if (paused) return true;
  if (game.state === "title") { game.toMenu(); audio.ui(); }
  // menu: handled on touchEND (tap = start, swipe = change selection) — see endTouch
  else if (game.state === "dead") { if (transT >= TIMING.deathHold) { respawn(); game.beginPlay(); } }
  else if (game.state === "gameover" || game.state === "campaigncomplete") {
    game.toMenu(); menuSel = Math.min(menuSel, game.unlockedZone);
  }
  return false;
}
if (canvas && typeof window !== "undefined" && "ontouchstart" in window) {
  // Listeners live on the DOCUMENT, not the canvas: the joystick is relative
  // (anchor + delta), so a swipe may start ANYWHERE — including the letterbox
  // dead space around the canvas, which used to swallow touches and get players
  // killed. preventDefault everywhere also keeps iOS from panning the page.
  document.addEventListener("touchstart", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === slowTouchId) continue; // already the SLOW finger
      // A finger landing on the SLOW button holds slow — it never steers.
      if (slowTouchId === null && hitSlowBtn(t)) {
        slowTouchId = t.identifier;
        audio.resume(); // still counts as a gesture for the audio context
        continue;
      }
      // Capture the state BEFORE the gesture may advance it (title→menu):
      // a tap's meaning belongs to the screen it landed on, not the next one.
      const stateAtStart = game.state;
      touchGesture();
      if (touchId === null) {
        touchId = t.identifier;
        touchAnchor = { x: t.clientX, y: t.clientY };
        touchMoved = false;
        anchorState = stateAtStart;
      }
    }
    refreshSlow(e);
  }, { passive: false });
  document.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (touchId === null || !touchAnchor) return;
    let t = null;
    for (const ct of e.touches) if (ct.identifier === touchId) { t = ct; break; }
    if (!t) return;
    const dx = t.clientX - touchAnchor.x, dy = t.clientY - touchAnchor.y;
    if (Math.hypot(dx, dy) > 16) {
      touchMoved = true;
      setTouchDir(touchDominant(dx, dy)); // 16px dead-zone
      // Menu: re-anchor after each step so one long drag can step several zones.
      if (game.state === "menu") touchAnchor = { x: t.clientX, y: t.clientY };
    }
  }, { passive: false });
  const endTouch = (e) => {
    e.preventDefault();
    let slowStill = false, steerStill = false;
    for (const ct of e.touches) {
      if (ct.identifier === slowTouchId) slowStill = true;
      if (ct.identifier === touchId) steerStill = true;
    }
    if (!slowStill) slowTouchId = null;
    if (!steerStill) {
      // A tap (no movement) that both began AND ended on the menu starts the run.
      if (anchorState === "menu" && game.state === "menu" && !touchMoved && touchId !== null) {
        game.startRun(menuSel); audio.ui();
      }
      setTouchDir(null); touchId = null; touchAnchor = null; anchorState = null;
    }
    refreshSlow(e);
  };
  document.addEventListener("touchend", endTouch, { passive: false });
  document.addEventListener("touchcancel", endTouch, { passive: false });
}

let lastTime = performance.now();
let prevState = null;

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05); // clamp big gaps (tab switches)
  lastTime = now;

  if (paused) { // frozen: draw the overlay over the held frame, advance nothing
    draw({ transT, menuSel, popups, reward, deathPoint, deathBlob, scorePulseT, danger, beat: 0, paused: true, slowBtn: slowTouchId !== null });
    requestAnimationFrame(loop);
    return;
  }

  if (game.state === "playing") {
    const prevCount = enemy.blobs.length;
    const prevSparxKillTotal = sparx.totalKilled; // a kill respawns immediately (same
                                                   // count), so track a running total
                                                   // instead of sparxList.length delta
    const aiming = powerups.isAiming();      // frozen while picking a ZOOM dash direction
    const dashing = zoomDash;                // a ZOOM dash is driving the cut this frame
    const px0 = marker.x, py0 = marker.y;    // pre-move position, for the dash kill-sweep
    powerups.update(dt);

    if (!aiming) updateMarker(dt);

    // ZOOM dash kill-sweep: destroy every enemy the ship flew through this frame.
    // (zoomDash clears itself the instant the dash's cut closes, so we use the
    // start-of-frame `dashing` flag to still sweep that final segment.)
    let dashKilled = [];
    if (dashing) {
      dashKilled = enemy.killNear(px0, py0, marker.x, marker.y, POWERUPS.ZOOM.dashKillReach);
      if (dashKilled.length) {
        game.addScore(POWERUPS.ZOOM.killPoints * dashKilled.length);
        for (const k of dashKilled) {
          fx.explode(k.x, k.y, k.color, 1.2);
          fx.ring(k.x, k.y, k.color, 16, 260, 0.6);
        }
        popups.push({ text: `ZOOM +${POWERUPS.ZOOM.killPoints * dashKilled.length}`, x: marker.x, y: marker.y - 20, t: 0 });
        audio.kill(); director.kill(); fx.addShake(12); scorePulseT = 0;
      }
    }

    // Touch a floating ZOOM → enter aim mode. Snap to the current node (keeping any
    // in-progress cut) so the dash can begin cleanly; the keydown handler fires it.
    if (!aiming && powerups.checkZoomTouch(marker.x, marker.y)) {
      snapToNode();
      popups.push({ text: "AIM!", x: marker.x, y: marker.y - 24, t: 0 });
      audio.powerupPickup();
    }
    // Engine embers trailing the ship as it moves — hotter + denser while cutting.
    if (dir && !aiming) {
      const cutting = mode === "cutting";
      if (Math.random() < (cutting ? 0.95 : 0.45)) {
        fx.trailPuff(marker.x, marker.y, cutting ? "#ff9a3c" : zoneColor(), dir.dx, dir.dy);
      }
    }
    enemy.update(dt, marker.x, marker.y);
    sparx.update(dt, marker, trail);
    const gained = grid.percent - prevPercent;
    const blobKills = prevCount - enemy.blobs.length - dashKilled.length; // claim SPLIT kills only
    // sparx.totalKilled diff, NOT a sparxList.length delta — an enclosed Sparx
    // respawns immediately (same kind, opposite side), which would mask a plain
    // count comparison.
    const sparxKillsNow = sparx.totalKilled - prevSparxKillTotal;
    const kills = blobKills + sparxKillsNow; // total SPLITs, for scoring/multiplier

    // A claim just landed → score it, pop-up, sound + particles + shake.
    if (gained >= POPUP_MIN_PCT) {
      const a = Math.atan2(FCY - marker.y, FCX - marker.x);
      popups.push({ text: `+${Math.round(gained)}%`, x: marker.x + Math.cos(a) * 34, y: marker.y + Math.sin(a) * 34, t: 0 });
    }
    if (gained >= 0.5 || kills > 0) {
      const res = game.scoreCut(gained, lastCutLength, kills, lastCutSlow);
      if (res.labels.length > 0 || res.total >= REWARD_MIN) reward = { ...res, t: 0 };
      scorePulseT = 0;
      audio.claim();
      audio.claimWhoosh(); // the "schooooofff" as the line closes
      if (res.labels.length) audio.bonus(res.labels.length + 1, TIMING.rewardStep); // doof doof doof
      fx.burst(marker.x, marker.y, zoneColor(), 12 + Math.round(gained), 150);
      fx.addShake(Math.min(28, 8 + gained * 0.55)); // the satisfying "thud" on a completed cut
    }
    if (kills > 0) {
      audio.kill();
      director.kill(); // bright musical stinger layered over the music
      // Each trapped blob/Sparx detonates where it was caught, in its own colour.
      // Gated on each kind's OWN fresh count (not just `kills > 0`) — lastKilled
      // only gets repopulated on an actual kill of that kind, so this avoids
      // re-exploding stale positions from an earlier frame's kill of the other kind.
      if (blobKills > 0) {
        for (const k of enemy.lastKilled) {
          fx.explode(k.x, k.y, k.color, 1.4);
          fx.ring(k.x, k.y, k.color, 22, 340, 0.7);
          fx.ring(k.x, k.y, "#ffffff", 16, 220, 0.45);
        }
      }
      if (sparxKillsNow > 0) {
        for (const k of sparx.lastKilled) {
          fx.explode(k.x, k.y, k.color, 1.4);
          fx.ring(k.x, k.y, k.color, 22, 340, 0.7);
          fx.ring(k.x, k.y, "#ffffff", 16, 220, 0.45);
        }
      }
      fx.addShake(16);
    }
    // Check if a claim enclosed any pickups, and try to spawn a new one.
    if (gained >= 0.5) {
      const collected = powerups.checkClaim();
      for (const type of collected) {
        popups.push({ text: POWERUPS[type].label + "!", x: marker.x, y: marker.y - 36, t: 0 });
        audio.powerupPickup();
        if (type === "SOLARWIND") fx.addShake(8);
      }
      powerups.trySpawn(marker.col, marker.row);
    }

    prevPercent = grid.percent;

    // Repopulate the Qix if the board has none left (all killed via ZOOM dash / SPLIT)
    // — there should always be a star enemy to carve around. Short delay so it doesn't
    // pop in the instant the last one dies.
    const curLv = game.currentLevel();
    if (curLv.qix && curLv.qix.length && enemy.countSheafs() === 0) {
      sheafRespawnT -= dt;
      if (sheafRespawnT <= 0) {
        enemy.addSheaf(curLv.qix[0], curLv.boss);
        sheafRespawnT = SHEAF_RESPAWN;
      }
    } else {
      sheafRespawnT = SHEAF_RESPAWN;
    }

    // Death checks. The player is invulnerable to enemies while AIMING a ZOOM (frozen)
    // and during the DASH itself — the dash kills on contact instead (above). But
    // riding over your OWN cut line is ALWAYS fatal, even mid-dash (selfHit), which is
    // what stops you walling off un-claimable islands.
    const invuln = aiming || dashing;
    const sparxHit = invuln ? null : sparx.collides(marker);
    let hit = sparxHit || (invuln ? null : enemy.collides(marker, mode, trail));
    if (!hit && selfHit) hit = { x: marker.x, y: marker.y, radius: 6, self: true };
    if (hit) {
      deathPoint = { x: marker.x, y: marker.y };
      deathBlob  = { x: hit.x, y: hit.y, radius: hit.radius || 6 };
      audio.cutStop();
      audio.death();
      fx.ring(hit.x, hit.y, sparxHit ? hit.color : "#ff4d4d", 24, 320, 0.8);
      fx.burst(marker.x, marker.y, "#ffffff", 16, 220);
      fx.addShake(16);
      popups = [];
      game.loseLife();
      transT = 0;
      if (game.state === "gameover") { audio.gameOver(); if (game.newHigh) audio.highScore(); }
    } else {
      // Near miss: a blob grazed your trail without hitting → small reward. Skipped
      // while aiming/dashing (you're invulnerable then, so it's not a "miss").
      if (!invuln) {
        const nm = enemy.pollNearMiss(marker, mode, trail);
        if (nm > 0) {
          game.addScore(POINTS.nearMiss * nm);
          popups.push({ text: "NEAR MISS", x: marker.x, y: marker.y - 12, t: 0 });
          audio.nearMiss();
          fx.addShake(3);
          scorePulseT = 0;
        }
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
  draw({ transT, menuSel, popups, reward, deathPoint, deathBlob, scorePulseT, danger, beat, slowBtn: slowTouchId !== null });
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
