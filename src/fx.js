// COSMIC CUT — fx (juice: particles + screen shake)
// Pure maths, no DOM, so it's headless-testable. render-pixi.js reads the
// particle list and the shake offset; main.js spawns bursts and adds shake on events.
//
// A particle is { x, y, vx, vy, life, max, size, color, glow?, shrink?, grav? }.
// `glow`/`shrink`/`grav` are optional richness fields the Pixi renderer honours.

import { FX } from "./config.js"; // pure data — fx stays browser-API-free

const particles = []; // see shape above
let shake = 0;        // current shake magnitude (px), decays over time

export function reset() {
  particles.length = 0;
  shake = 0;
}

// Kick the screen-shake up to `mag` pixels (keeps the strongest recent hit).
export function addShake(mag) {
  if (mag > shake) shake = mag;
}

// Spray `count` particles out from (x,y).
export function burst(x, y, color, count = 14, speed = 160, life = 0.6) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: life * (0.6 + Math.random() * 0.4),
      max: life,
      size: 1.5 + Math.random() * 2.5,
      color, glow: true, shrink: true,
    });
  }
}

// A ring of particles (for SPLIT / big claims).
export function ring(x, y, color, count = 20, speed = 220, life = 0.7) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    particles.push({
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life, max: life, size: 2 + Math.random() * 2, color, glow: true,
    });
  }
}

// Engine ember dribbled behind the ship as it rides/cuts. (dirx,diry) = travel dir,
// so the spark trails opposite the motion. Small + short-lived so it reads as exhaust.
export function trailPuff(x, y, color, dirx = 0, diry = 0) {
  const a = Math.random() * Math.PI * 2;
  particles.push({
    x: x + (Math.random() - 0.5) * 3, y: y + (Math.random() - 0.5) * 3,
    vx: Math.cos(a) * 16 - dirx * 42, vy: Math.sin(a) * 16 - diry * 42,
    life: 0.28 + Math.random() * 0.3, max: 0.58,
    size: 1.2 + Math.random() * 1.8, color, glow: true, shrink: true,
  });
}

// A big kill explosion: a fast spark spray (with gravity) + white-hot core bits.
export function explode(x, y, color, power = 1) {
  const n = Math.round(26 * power);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (120 + Math.random() * 260) * power;
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.4 + Math.random() * 0.5, max: 0.9,
      size: 1.5 + Math.random() * 3, color, glow: true, grav: 130, shrink: true,
    });
  }
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 220;
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.22, max: 0.22, size: 2 + Math.random() * 2.2,
      color: "#ffffff", glow: true, shrink: true,
    });
  }
  // Third wave: slow neon dust that hangs and drifts after the flash — the kill
  // leaves a lingering glowing cloud instead of vanishing in half a second.
  const nd = Math.round(FX.dustCount * power);
  for (let i = 0; i < nd; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = FX.dustSpeedMin + Math.random() * (FX.dustSpeedMax - FX.dustSpeedMin);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: FX.dustLifeMin + Math.random() * (FX.dustLifeMax - FX.dustLifeMin),
      max: FX.dustLifeMax,
      size: 1 + Math.random() * 0.8, color, glow: true, shrink: true,
    });
  }
}

export function update(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.grav) p.vy += p.grav * dt;     // embers arc downward
    p.vx *= 1 - Math.min(1, dt * 2.2);   // drag
    p.vy *= 1 - Math.min(1, dt * 2.2);
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  shake *= Math.exp(-dt * 9); // smooth decay
  if (shake < 0.05) shake = 0;
}

export function getParticles() { return particles; }

// A fresh random offset within the current shake magnitude.
export function shakeOffset() {
  if (shake === 0) return { x: 0, y: 0 };
  return { x: (Math.random() * 2 - 1) * shake, y: (Math.random() * 2 - 1) * shake };
}
