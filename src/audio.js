// COSMIC CUT — audio (procedural sound, no asset files required)
// A small but produced-sounding Web Audio engine: every voice runs through an
// envelope + filter and can send to a shared convolver REVERB, so nothing sounds
// like a bare beep. SFX, a soft danger-tied "cut" pulse, and a layered
// generative synthwave loop (sub-bass + detuned supersaw pad + delayed arp over
// an Am–F–C–G progression). Optional: drop assets/music.mp3 in and it plays
// instead. Everything is lazy + guarded, so the module imports cleanly in Node.

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
  sfxBus.gain.value = 0.9;
  sfxBus.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = 0.0; // faded in when music starts
  musicBus.connect(master);

  tryFile();
  return true;
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
export function kill() {
  voice(170, { type: "sawtooth", dur: 0.26, vol: 0.2, slideTo: 48, lp: 1500, rev: 0.25 });
  noise(0.16, 0.16, 0, 1000, 0.2);
}
export function death() {
  [0, -3, -7].forEach((s, i) => voice(330 * 2 ** (s / 12), { type: "sawtooth", dur: 0.6, vol: 0.18, slideTo: 40, detune: i * 8, lp: 1400, rev: 0.5, when: i * 0.04 }));
  noise(0.5, 0.2, 0, 800, 0.4);
}
export function nearMiss() { voice(1200, { type: "sine", dur: 0.14, vol: 0.13, slideTo: 1900, rev: 0.4 }); }
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
  musicBus.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5);
  if (fileOK && mediaEl) { mediaEl.play().catch(() => {}); return; } // prefer a real track
  if (musicTimer) return;
  nextNote = ctx.currentTime + 0.1;
  step = 0;
  musicTimer = setInterval(scheduler, 40);
}
export function stopMusic() {
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(0.0, ctx.currentTime, 0.4);
  if (mediaEl) { try { mediaEl.pause(); } catch (e) { /* ignore */ } }
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
export function setIntensity(x) { intensity = Math.max(0, Math.min(1, x)); }
export function toggleMusic() {
  musicWanted = !musicWanted;
  save("cosmiccut.music", musicWanted ? "1" : "0");
  if (musicWanted) startMusic(); else stopMusic();
  return musicWanted;
}

// --- optional drop-in track: assets/music.mp3 ------------------------------
let mediaEl = null;
let fileOK = false;
let fileTried = false;
function tryFile() {
  if (fileTried || typeof Audio === "undefined") return;
  fileTried = true;
  const el = new Audio();
  el.loop = true;
  el.preload = "auto";
  el.src = "assets/music.mp3";
  el.addEventListener("canplaythrough", () => {
    try {
      const src = ctx.createMediaElementSource(el);
      src.connect(musicBus);
      mediaEl = el;
      fileOK = true;
      if (musicWanted && musicTimer) { clearInterval(musicTimer); musicTimer = null; el.play().catch(() => {}); }
    } catch (e) { /* ignore */ }
  }, { once: true });
  el.addEventListener("error", () => { fileOK = false; }, { once: true });
  el.load();
}
