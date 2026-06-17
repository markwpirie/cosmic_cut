// COSMIC CUT — audio (procedural sound, no asset files)
// A small Web Audio engine: punchy retro SFX synthesised on the fly, plus a
// gentle generative synthwave loop that swells with danger. Everything is lazy
// and guarded so the module imports cleanly headlessly (no window/AudioContext →
// every call is a no-op). Mute state persists in localStorage.

let ctx = null;
let master = null;   // overall output (respects mute)
let sfxBus = null;   // SFX submix
let musicBus = null; // music submix (lower)
let muted = load("cosmiccut.muted") === "1";
let musicWanted = load("cosmiccut.music") !== "0"; // music on by default

function load(k) { try { return typeof localStorage !== "undefined" ? localStorage.getItem(k) : null; } catch (e) { return null; } }
function save(k, v) { try { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

// Create the context lazily (first call after a user gesture). Returns false if
// Web Audio isn't available (e.g. Node), so callers can safely bail.
function ensure() {
  if (ctx) return true;
  if (typeof window === "undefined") return false;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.6;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.0; // faded in when music starts
  musicBus.connect(master);
  return true;
}

// Resume the context (browsers start it suspended until a user gesture).
export function resume() {
  if (ensure() && ctx.state === "suspended") ctx.resume();
}

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  save("cosmiccut.muted", muted ? "1" : "0");
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.02);
  return muted;
}

// --- one-shot SFX -----------------------------------------------------------
function blip(freq, dur, type = "square", vol = 0.2, slideTo = null, when = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur, vol = 0.3, when = 0, lp = 1200) {
  if (!ensure()) return;
  const t = ctx.currentTime + when;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t);
}

export function ui() { blip(680, 0.05, "square", 0.12); }
export function cutStartBlip() { blip(520, 0.06, "square", 0.14, 760); }
export function claim() { blip(330, 0.12, "triangle", 0.22, 540); noise(0.12, 0.12, 0, 2200); }
export function kill() { blip(180, 0.22, "sawtooth", 0.22, 60); noise(0.16, 0.18, 0, 900); }
export function death() { blip(300, 0.5, "sawtooth", 0.3, 50); noise(0.5, 0.25, 0, 700); }
export function nearMiss() { blip(900, 0.08, "sine", 0.16, 1400); }
export function extraLife() { [0, 4, 7, 12].forEach((s, i) => blip(440 * 2 ** (s / 12), 0.16, "triangle", 0.2, null, i * 0.09)); }

export function levelClear() {
  [0, 4, 7, 12, 16].forEach((s, i) => blip(330 * 2 ** (s / 12), 0.18, "triangle", 0.22, null, i * 0.1));
}
export function gameOver() {
  [0, -2, -4, -7].forEach((s, i) => blip(330 * 2 ** (s / 12), 0.3, "sawtooth", 0.22, null, i * 0.16));
}
export function highScore() {
  [0, 7, 12, 16, 19, 24].forEach((s, i) => blip(440 * 2 ** (s / 12), 0.2, "square", 0.2, null, i * 0.08));
}

// The "doof doof doof": n rising blips in time with the score read-out reveal.
export function bonus(n, step = 0.15) {
  const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19];
  for (let i = 0; i < n; i++) {
    const s = scale[Math.min(i, scale.length - 1)];
    blip(330 * 2 ** (s / 12), 0.16, "square", 0.2, null, i * step);
    blip(165 * 2 ** (s / 12), 0.18, "triangle", 0.12, null, i * step); // octave-down body = "doof"
  }
}

// --- the live "tension" tone while cutting ---------------------------------
let cutOsc = null;
let cutGain = null;
export function cutStart() {
  if (!ensure()) return;
  cutStop();
  cutOsc = ctx.createOscillator();
  cutGain = ctx.createGain();
  cutOsc.type = "sawtooth";
  cutOsc.frequency.value = 110;
  cutGain.gain.value = 0.0001;
  cutGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.08);
  cutOsc.connect(cutGain).connect(sfxBus);
  cutOsc.start();
}
export function cutTension(level) { // level 0..1 → pitch rises with cut length
  if (cutOsc) cutOsc.frequency.setTargetAtTime(110 + level * 520, ctx.currentTime, 0.06);
}
export function cutStop() {
  if (!cutOsc) return;
  const o = cutOsc;
  const g = cutGain;
  g.gain.cancelScheduledValues(ctx.currentTime);
  g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
  setTimeout(() => { try { o.stop(); } catch (e) { /* already stopped */ } }, 200);
  cutOsc = null;
  cutGain = null;
}

// --- generative synthwave loop ---------------------------------------------
// Minor-pentatonic so it can't sound wrong; tempo + filter brighten with danger.
const PENT = [0, 3, 5, 7, 10];
const ROOT = 110; // A2
let musicTimer = null;
let nextNote = 0;
let stepN = 0;
let intensity = 0; // 0..1, set from gameplay danger

function scheduleStep(step, when) {
  if (!ensure()) return;
  const cutoff = 500 + intensity * 2600;
  // bass on the beat
  if (step % 4 === 0) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = ROOT * (step % 8 === 0 ? 1 : 1.5);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 400;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.18, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.32);
    o.connect(f).connect(g).connect(musicBus);
    o.start(when); o.stop(when + 0.36);
  }
  // arp pluck every 8th
  const semi = PENT[(step * 2 + (step % 3)) % PENT.length] + (step % 8 >= 4 ? 12 : 0);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = ROOT * 4 * 2 ** (semi / 12);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.06 + intensity * 0.05, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
  o.connect(f).connect(g).connect(musicBus);
  o.start(when); o.stop(when + 0.26);
}

function scheduler() {
  if (!ctx) return;
  const spb = 60 / (96 + intensity * 36) / 2; // seconds per 8th-note
  while (nextNote < ctx.currentTime + 0.15) {
    scheduleStep(stepN, nextNote);
    nextNote += spb;
    stepN = (stepN + 1) % 32;
  }
}

export function startMusic() {
  if (!ensure() || musicTimer) return;
  if (!musicWanted) return;
  musicBus.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5); // gentle fade-in
  nextNote = ctx.currentTime + 0.1;
  stepN = 0;
  musicTimer = setInterval(scheduler, 40);
}
export function stopMusic() {
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(0.0, ctx.currentTime, 0.4);
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
export function setIntensity(x) { intensity = Math.max(0, Math.min(1, x)); }
export function toggleMusic() {
  musicWanted = !musicWanted;
  save("cosmiccut.music", musicWanted ? "1" : "0");
  if (musicWanted) startMusic(); else stopMusic();
  return musicWanted;
}
