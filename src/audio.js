// COSMIC CUT — audio (procedural sound, no asset files required)
// A small but produced-sounding Web Audio engine: every voice runs through an
// envelope + filter and can send to a shared convolver REVERB, so nothing sounds
// like a bare beep. SFX, a soft danger-tied "cut" pulse, and a layered
// generative synthwave loop (sub-bass + detuned supersaw pad + delayed arp over
// an Am–F–C–G progression). Optional: MP3s in assets/ (see the TRACKS registry)
// drive the soundtrack per game moment — title, stage select, per-stage themes,
// stage-clear + game-over jingles. A missing looping track falls back to the
// synth; everything is lazy + guarded, so the module imports cleanly in Node.
// This is the low-level engine; audio-director.js orchestrates music policy.

import { AUDIO } from "./config.js";

let ctx = null;
let master = null;   // final output (respects mute)
let sfxBus = null;   // dry SFX
let musicBus = null; // music submix
let reverb = null;   // convolver input
let delay = null;    // feedback delay (for the arp)
let muted = load("cosmiccut.muted") === "1";
let musicWanted = load("cosmiccut.music") !== "0"; // on by default

function load(k) { try { return typeof localStorage !== "undefined" ? localStorage.getItem(k) : null; } catch (e) { return null; } }
function save(k, v) { try { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

// Independent SFX/music volume sliders (0..1), on top of the M mute / N music-on-off
// toggles above — those are all-or-nothing, these are the "how loud" knobs.
function loadVol(k) {
  const v = parseFloat(load(k));
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}
let sfxVolume = loadVol("cosmiccut.sfxVolume");
let musicVolume = loadVol("cosmiccut.musicVolume");
export function getSfxVolume() { return sfxVolume; }
export function getMusicVolume() { return musicVolume; }
export function setSfxVolume(v) {
  sfxVolume = Math.max(0, Math.min(1, v));
  save("cosmiccut.sfxVolume", String(sfxVolume));
  if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(AUDIO.sfxLevel * sfxVolume, ctx.currentTime, 0.05);
}
export function setMusicVolume(v) {
  musicVolume = Math.max(0, Math.min(1, v));
  save("cosmiccut.musicVolume", String(musicVolume));
  // Only re-ramp while music is actually meant to be audible — mirrors startMusic's
  // own target so this doesn't fight stopMusic's fade-to-0 when music is off.
  if (musicBus && ctx && musicWanted) musicBus.gain.setTargetAtTime(AUDIO.musicLevel * musicVolume, ctx.currentTime, 0.05);
}

// Exponential-decay noise → a cheap, lush reverb impulse response.
function reverbIR(seconds, decay) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function ensure() {
  if (ctx) return true;
  if (typeof window === "undefined") return false;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.6;
  master.connect(ctx.destination);

  reverb = ctx.createConvolver();
  reverb.buffer = reverbIR(1.8, 2.4);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.9;
  reverb.connect(reverbReturn).connect(master);

  delay = ctx.createDelay(0.6);
  delay.delayTime.value = 0.27;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  delay.connect(fb).connect(delay);
  delay.connect(master);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = AUDIO.sfxLevel * sfxVolume; // SFX sit a touch above the music
  sfxBus.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = 0.0; // faded in when music starts
  musicBus.connect(master);

  // Beat tap: analyse the music submix so a screen pulse can ride the bass
  // (works for both the MP3 tracks and the procedural synth fallback).
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = AUDIO.beat.smoothing;
  freqData = new Uint8Array(analyser.frequencyBinCount);
  musicBus.connect(analyser);

  loadTrack("title"); // warm the cache with the opening theme
  return true;
}

// Beat-reactive 0..1 value from the music's sub-bass: the throb is how far the
// bass rises ABOVE its own slow baseline (the kick), times a fixed gain — so a
// loud steady bass no longer pins it at 1, and it can't be poisoned by startup
// transients. Instant attack, slow release; returns 0 when muted. Tunables in
// config.AUDIO.beat.
let analyser = null;
let freqData = null;
let pulseEnv = 0;
let bassBaseline = 0; // slow-tracked steady bass level
let lastBass = 0;     // raw 0..1 sub-bass from the most recent musicPulse (debug)
export function musicPulse() {
  if (!analyser || muted) return 0;
  analyser.getByteFrequencyData(freqData);
  const N = Math.max(1, AUDIO.beat.bassBins | 0); // lowest bins ≈ sub-bass + kick
  let sum = 0;
  for (let i = 0; i < N; i++) sum += freqData[i];
  const bass = sum / (N * 255); // 0..1 current low-end energy
  lastBass = bass;
  bassBaseline += (bass - bassBaseline) * AUDIO.beat.baselineEase; // steady level
  const dev = Math.max(0, bass - bassBaseline);                    // the kick on top
  const target = Math.min(1, dev * AUDIO.beat.devGain);            // fixed-gain → 0..1
  if (target > pulseEnv) pulseEnv = target;                        // snap up on the beat
  else pulseEnv += (target - pulseEnv) * AUDIO.beat.release;        // ease back down
  return pulseEnv;
}
// Diagnostics for tuning the throb (we can't hear the audio while developing).
export function beatInfo() {
  return { an: analyser ? 1 : 0, muted: muted ? 1 : 0, bass: +lastBass.toFixed(2), env: +pulseEnv.toFixed(2) };
}

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

// --- a general voice: osc → (filter) → env-gain → dest, with a reverb send ----
function voice(freq, opts = {}) {
  if (!ensure()) return;
  const {
    type = "triangle", dur = 0.2, vol = 0.2, when = 0, slideTo = null,
    detune = 0, lp = null, attack = 0.008, rev = 0.18, delaySend = 0, dest = sfxBus,
  } = opts;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  if (detune) o.detune.value = detune;
  let node = o;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    o.connect(f);
    node = f;
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  node.connect(g);
  g.connect(dest);
  if (rev > 0 && reverb) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverb); }
  if (delaySend > 0 && delay) { const s = ctx.createGain(); s.gain.value = delaySend; g.connect(s); s.connect(delay); }
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol, when = 0, lp = 1500, rev = 0.1) {
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
  if (rev > 0 && reverb) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverb); }
  src.start(t);
}

// --- one-shot SFX -----------------------------------------------------------
export function ui() { voice(720, { type: "triangle", dur: 0.07, vol: 0.12, lp: 3000, rev: 0.12 }); }
export function cutStartBlip() { voice(440, { type: "triangle", dur: 0.08, vol: 0.14, slideTo: 700, lp: 3000, rev: 0.2 }); }
export function claim() {
  voice(523, { type: "triangle", dur: 0.2, vol: 0.2, slideTo: 880, lp: 3200, rev: 0.28 });
  voice(1046, { type: "sine", dur: 0.16, vol: 0.09, when: 0.02, rev: 0.35 });
  noise(0.1, 0.08, 0, 3000, 0.2);
}
export function kill() { // blob explosion: crack + sub-boom + debris tail
  voice(170, { type: "sawtooth", dur: 0.26, vol: 0.2, slideTo: 48, lp: 1500, rev: 0.25 });
  voice(90, { type: "sine", dur: 0.42, vol: 0.3, slideTo: 28, rev: 0.4 });
  noise(0.16, 0.2, 0, 1300, 0.2);
  noise(0.5, 0.12, 0.02, 600, 0.55);
}
// A short bright musical hit layered OVER the music (non-interrupting) on a kill.
export function killStinger() {
  [0, 7, 12].forEach((s, i) => voice(660 * 2 ** (s / 12), { type: "triangle", dur: 0.18, vol: 0.12, rev: 0.35, delaySend: 0.25, when: i * 0.05 }));
}
export function death() {
  [0, -3, -7].forEach((s, i) => voice(330 * 2 ** (s / 12), { type: "sawtooth", dur: 0.6, vol: 0.18, slideTo: 40, detune: i * 8, lp: 1400, rev: 0.5, when: i * 0.04 }));
  noise(0.5, 0.2, 0, 800, 0.4);
}
export function nearMiss() { voice(1200, { type: "sine", dur: 0.14, vol: 0.13, slideTo: 1900, rev: 0.4 }); }
// Submarine sonar "ping": a reverberant tone whose pitch climbs with `prog`
// (0..1 = how long the current cut has been drawn) — the rising sequence of
// pings telegraphs the mounting danger of staying exposed. The director fires it
// ~1s apart for the duration of a cut.
export function sonarPing(prog = 0) {
  const f = AUDIO.sonar.freq * (1 + prog * AUDIO.sonar.pitchRange);
  voice(f, { type: "sine", dur: 0.5, vol: AUDIO.sonar.level, attack: 0.004, rev: 0.75, delaySend: 0.3 });
  voice(f * 2, { type: "sine", dur: 0.2, vol: AUDIO.sonar.level * 0.3, attack: 0.004, rev: 0.6 }); // metallic shimmer
}
export function powerupPickup() {
  // A bright rising arpeggio (C–E–G–C) — deliberately loud and bell-like so it
  // sings out over the claim/whoosh/bonus sounds that fire on the same frame.
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => {
    voice(f,     { type: "triangle", dur: 0.16, vol: 0.30, when: i * 0.055, rev: 0.45, delaySend: 0.25 });
    voice(f * 2, { type: "sine",     dur: 0.12, vol: 0.12, when: i * 0.055, rev: 0.5  }); // shimmer octave
  });
  voice(1568, { type: "sine", dur: 0.5, vol: 0.14, when: 0.22, attack: 0.01, rev: 0.7, delaySend: 0.35 }); // sparkle tail
}
export function powerupExpire() {
  voice(660, { type: "triangle", dur: 0.18, vol: 0.14, slideTo: 330, lp: 3000, rev: 0.3 });
}
export function extraLife() { [0, 4, 7, 12, 16].forEach((s, i) => voice(440 * 2 ** (s / 12), { type: "triangle", dur: 0.22, vol: 0.16, rev: 0.4, delaySend: 0.2, when: i * 0.09 })); }
export function levelClear() { [0, 4, 7, 12, 19].forEach((s, i) => voice(330 * 2 ** (s / 12), { type: "triangle", dur: 0.3, vol: 0.18, rev: 0.5, delaySend: 0.25, when: i * 0.11 })); }
export function gameOver() { [0, -2, -5, -9].forEach((s, i) => voice(294 * 2 ** (s / 12), { type: "sawtooth", dur: 0.5, vol: 0.18, lp: 1600, rev: 0.5, when: i * 0.18 })); }
export function highScore() { [0, 7, 12, 16, 19, 24].forEach((s, i) => voice(440 * 2 ** (s / 12), { type: "triangle", dur: 0.26, vol: 0.17, rev: 0.45, delaySend: 0.3, when: i * 0.09 })); }

// The "doof": a punchy pitched-down kick + click, rising slightly per beat.
export function bonus(n, step = 0.15) {
  if (!ensure()) return;
  for (let i = 0; i < n; i++) {
    const t = ctx.currentTime + i * step;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150 + i * 28, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g).connect(sfxBus);
    if (reverb) { const s = ctx.createGain(); s.gain.value = 0.15; g.connect(s); s.connect(reverb); }
    o.start(t); o.stop(t + 0.28);
    noise(0.025, 0.12, i * step, 5000, 0.05); // transient click
  }
}

// --- the danger-tied "cut" pulse (soft bass hum + tremolo, NOT a squeal) -----
let cut = null;
export function cutStart() {
  if (!ensure()) return;
  cutStop();
  const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 88;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 480;
  const g = ctx.createGain(); g.gain.value = 0.018;
  const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 2.4;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.01;
  lfo.connect(lfoGain).connect(g.gain); // tremolo on the hum
  o.connect(f).connect(g).connect(sfxBus);
  if (reverb) { const s = ctx.createGain(); s.gain.value = 0.25; g.connect(s); s.connect(reverb); }
  o.start(); lfo.start();
  cut = { o, f, g, lfo, lfoGain };
}
export function cutTension(danger) { // danger 0..1: louder, brighter, faster pulse
  if (!cut) return;
  const t = ctx.currentTime;
  cut.f.frequency.setTargetAtTime(480 + danger * 1500, t, 0.1);
  cut.g.gain.setTargetAtTime(0.018 + danger * 0.05, t, 0.1);
  cut.lfo.frequency.setTargetAtTime(2.4 + danger * 9, t, 0.1);
  cut.lfoGain.gain.setTargetAtTime(0.01 + danger * 0.05, t, 0.1);
}
export function cutStop() {
  if (!cut) return;
  const { o, lfo, g } = cut;
  g.gain.cancelScheduledValues(ctx.currentTime);
  g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
  setTimeout(() => { try { o.stop(); lfo.stop(); } catch (e) { /* already stopped */ } }, 220);
  cut = null;
}

// --- movement whoosh ("schoo") + line-complete release ("schooooofff") -------
// A soft looping band-passed noise that's present while the marker is moving and
// brightens while cutting; volume eased toward 0 when idle/paused.
let move = null;
export function moveTone(on, bright = 0) {
  if (!ensure()) return;
  if (!move) {
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 600; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(bp).connect(g).connect(sfxBus);
    if (reverb) { const s = ctx.createGain(); s.gain.value = 0.22; g.connect(s); s.connect(reverb); }
    src.start();
    move = { src, bp, g };
  }
  const t = ctx.currentTime;
  move.g.gain.setTargetAtTime(on ? AUDIO.moveLevel + bright * 0.03 : 0.0001, t, 0.08);
  move.bp.frequency.setTargetAtTime(420 + bright * 1100, t, 0.12);
}

// A filtered-noise sweep that falls away — the release when a cut closes and the
// territory claims (the "schooooofff" that the movement schoo resolves into).
export function claimWhoosh() {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.7);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
  lp.frequency.setValueAtTime(5000, t);
  lp.frequency.exponentialRampToValueAtTime(350, t + 0.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
  src.connect(lp).connect(g).connect(sfxBus);
  if (reverb) { const s = ctx.createGain(); s.gain.value = 0.4; g.connect(s); s.connect(reverb); }
  src.start(t); src.stop(t + 0.72);
}

// --- generative synthwave: Am – F – C – G ----------------------------------
const A3 = 220;
const nf = (semi) => A3 * 2 ** (semi / 12);
// root (semitones from A) + a triad on top
const PROG = [
  { r: 0, c: [0, 3, 7] },  // Am
  { r: 8, c: [0, 4, 7] },  // F
  { r: 3, c: [0, 4, 7] },  // C
  { r: 10, c: [0, 4, 7] }, // G
];
let musicTimer = null;
let nextNote = 0;
let step = 0;          // 16th-note counter across the 4-bar loop
let intensity = 0;

function bass(freq, when, dur) {
  voice(freq, { type: "sawtooth", dur, vol: 0.14, when, lp: 280, rev: 0.1, dest: musicBus });
  voice(freq, { type: "sine", dur, vol: 0.12, when, dest: musicBus });
}
function pad(freqs, when, dur) {
  for (const f of freqs) for (const det of [-8, 0, 8]) {
    voice(f, { type: "sawtooth", dur, vol: 0.022, when, detune: det, lp: 500 + intensity * 2400, attack: 0.25, rev: 0.6, dest: musicBus });
  }
}
function arp(freq, when) {
  voice(freq, { type: "triangle", dur: 0.22, vol: 0.05 + intensity * 0.05, when, lp: 1800 + intensity * 2500, rev: 0.4, delaySend: 0.35, dest: musicBus });
}
function hat(when) { noise(0.04, 0.05 + intensity * 0.05, when, 9000, 0.1); }

function scheduleStep(when) {
  const bar = Math.floor(step / 16) % PROG.length;
  const inBar = step % 16;
  const { r, c } = PROG[bar];
  const sixteenth = 60 / (98 + intensity * 30) / 4;
  if (inBar === 0) {
    bass(nf(r - 12), when, sixteenth * 15.5);
    pad(c.map((s) => nf(r + s)), when, sixteenth * 15.5);
  }
  if (inBar % 2 === 0) {
    const ci = (inBar / 2) % c.length;
    arp(nf(r + c[ci] + 12), when);
    if (intensity > 0.45 && inBar % 4 === 2) hat(when);
  }
  step = (step + 1) % (16 * PROG.length);
}

function scheduler() {
  if (!ctx) return;
  const sixteenth = 60 / (98 + intensity * 30) / 4;
  while (nextNote < ctx.currentTime + 0.18) {
    scheduleStep(nextNote);
    nextNote += sixteenth;
  }
}

export function startMusic() {
  if (!ensure() || !musicWanted) return;
  musicBus.gain.setTargetAtTime(AUDIO.musicLevel * musicVolume, ctx.currentTime, 1.5);
  if (!activeTrack) activeTrack = "title"; // first play = the opening theme
  const entry = loadTrack(activeTrack);
  if (entry.ok && entry.el) {
    const spec = TRACKS[activeTrack];
    entry.el.playbackRate = spec && spec.loop ? musicRate : 1;
    entry.el.play().catch(() => {});
    return; // prefer a real track
  }
  const spec = TRACKS[activeTrack];
  if (spec && spec.loop === false) return; // a one-shot jingle has nothing to loop
  if (musicTimer) return; // file missing or still loading -> procedural for now
  nextNote = ctx.currentTime + 0.1;
  step = 0;
  musicTimer = setInterval(scheduler, 40);
}
export function stopMusic() {
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(0.0, ctx.currentTime, 0.4);
  const entry = trackCache.get(activeTrack);
  if (entry && entry.el) { try { entry.el.pause(); } catch (e) { /* ignore */ } }
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
export function setIntensity(x) { intensity = Math.max(0, Math.min(1, x)); }
export function toggleMusic() {
  musicWanted = !musicWanted;
  save("cosmiccut.music", musicWanted ? "1" : "0");
  if (musicWanted) startMusic(); else stopMusic();
  return musicWanted;
}

// --- drop-in soundtrack: assets/*.mp3 --------------------------------------
// Each game moment maps to a named track. A looping track whose file is missing
// or not yet loaded falls back to the procedural synthwave loop; a one-shot
// jingle (loop:false) that's missing just stays silent (its SFX cue covers it).
// To add/replace music: drop the file in assets/ and edit its line here. Stages
// 6-8 are already wired for when the campaign grows past five zones.
const TRACKS = {
  title:       { file: "01 - The Wind Blew All Day Long (Opening Theme).mp3", loop: true },
  stageSelect: { file: "02 - Beyond the Peace (Stage Select).mp3", loop: true },
  stage1:      { file: "03 - Back to the Fire (Stage 1 - Hydra).mp3", loop: true },
  stage2:      { file: "05 - Venus Fire (Stage 2 - Gorgon).mp3", loop: true },
  stage3:      { file: "07 - The Grubby Dark Blue (Stage 3 - Seiren).mp3", loop: true },
  stage4:      { file: "09 - Truth (Stage 4 - Haides).mp3", loop: true },
  stage5:      { file: "11 - Final Take a Chance (Stage 5 - Ellis).mp3", loop: true },
  stage6:      { file: "13 - His Behavior Inspired Us With Distrust (Stage 6 - Cerberus).mp3", loop: true },
  stage7:      { file: "14 - Hunger Made Them Desperate (Stage 7 - Orn Base).mp3", loop: true },
  stage8:      { file: "16. Final Point (Stage 8 - Orn Core).mp3", loop: true },
  stageClear:  { file: "18 - Stage Clear.mp3", loop: false },
  gameOver:    { file: "22 - Game Over.mp3", loop: false },
};

const trackCache = new Map(); // key -> { el, ok } (el null until canplaythrough)
let activeTrack = null;       // track key currently routed to musicBus (null = none yet)
let musicRate = 1;            // current playbackRate for stage tracks (tension curve)

// Tempo+pitch rise: speed-ups also pitch up (no time-stretch).
function setPreservesPitch(el, v) {
  el.preservesPitch = v; el.mozPreservesPitch = v; el.webkitPreservesPitch = v;
}

function loadTrack(key) {
  if (trackCache.has(key)) return trackCache.get(key);
  const entry = { el: null, ok: false };
  trackCache.set(key, entry);
  const spec = TRACKS[key];
  if (!spec || !spec.file || typeof Audio === "undefined") return entry; // no file -> stays synth
  const el = new Audio();
  el.loop = !!spec.loop;
  el.preload = "auto";
  setPreservesPitch(el, false);
  el.src = encodeURI("assets/" + spec.file);
  el.addEventListener("canplaythrough", () => {
    try {
      ctx.createMediaElementSource(el).connect(musicBus);
      entry.el = el;
      entry.ok = true;
      // If we're still waiting on exactly this track, hand off from the synth.
      if (musicWanted && activeTrack === key) {
        if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
        el.playbackRate = spec.loop ? musicRate : 1; // jingles always play at normal speed
        el.play().catch(() => {});
      }
    } catch (e) { /* ignore */ }
  }, { once: true });
  el.addEventListener("error", () => { entry.ok = false; }, { once: true });
  el.load();
  return entry;
}

// Cue a named track: pause the previous one, play the new file when it's ready,
// and (for looping tracks only) bridge with the procedural synth loop until it
// loads. A missing jingle leaves the bus quiet for its SFX cue. With { resume }
// the track continues from its paused position instead of restarting at 0 — used
// to return to a stage track after an interrupting jingle.
export function setTrack(key, { resume = false } = {}) {
  if (key === activeTrack) return;
  const prev = trackCache.get(activeTrack);
  if (prev && prev.el) { try { prev.el.pause(); } catch (e) { /* ignore */ } }
  activeTrack = key;
  const spec = TRACKS[key];
  const entry = loadTrack(key);
  if (!musicWanted || !ensure()) return;
  if (entry.ok && entry.el) {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (!resume) { try { entry.el.currentTime = 0; } catch (e) { /* ignore */ } }
    entry.el.playbackRate = spec && spec.loop ? musicRate : 1;
    entry.el.play().catch(() => {});
  } else if (spec && spec.loop) {
    if (!musicTimer) { nextNote = ctx.currentTime + 0.1; step = 0; musicTimer = setInterval(scheduler, 40); }
  } else if (musicTimer) { // missing jingle -> let the synth go quiet under the SFX
    clearInterval(musicTimer); musicTimer = null;
  }
}

// Convenience for the game loop: play the theme for a zone (1..8).
export function setStageMusic(zone) { setTrack("stage" + zone); }

// Tension curve: scale the active stage track's playback speed (tempo + pitch),
// clamped to config. Jingles (loop:false) keep normal speed.
export function setMusicRate(rate) {
  musicRate = Math.max(1, Math.min(AUDIO.tension.rateCap, rate));
  const entry = trackCache.get(activeTrack);
  const spec = TRACKS[activeTrack];
  if (entry && entry.el && spec && spec.loop) entry.el.playbackRate = musicRate;
}
