// COSMIC CUT — fx (juice: particles + screen shake)
// Pure maths, no DOM, so it's headless-testable. render.js reads the particle
// list and the shake offset; main.js spawns bursts and adds shake on events.

const particles = []; // { x, y, vx, vy, life, max, size, color }
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
      color,
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
      life, max: life, size: 2 + Math.random() * 2, color,
    });
  }
}

export function update(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - Math.min(1, dt * 2.2); // drag
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
