// COSMIC CUT — reveal (Phase 10 §7, picture-reveal boss levels)
// Every X-5 boss level uncovers a per-zone "hero scene" behind claimed cells
// instead of a flat glass block, matching assets/levels.png's zone scenes:
// 1 cyan spiral galaxy, 2 green ringed planet, 3 gold black hole + jet,
// 4 purple ringed planet + moon, 5 red cracked planet in a red nebula.
// Baked once per zone to an offscreen canvas and cached. Swapping in supplied
// art later is just drawing an Image into the same canvas — zero renderer
// changes, since both renderers only ever ask for `revealSource(zone, w, h)`.
// Presentation-only (uses canvas/DOM APIs) — imported by the renderers only,
// never by pure logic modules.

import { THEMES } from "./config.js";

const cache = new Map();

export function revealSource(zone, w, h) {
  const key = `${zone}:${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  bakeScene(canvas.getContext("2d"), zone, w, h);
  cache.set(key, canvas);
  return canvas;
}

function bakeScene(g, zone, w, h) {
  const th = THEMES[zone - 1] || THEMES[0];
  g.fillStyle = "#050310";
  g.fillRect(0, 0, w, h);

  for (let i = 0; i < 160; i++) {
    g.globalAlpha = 0.15 + Math.random() * 0.55;
    g.fillStyle = "#ffffff";
    g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
  g.globalAlpha = 1;

  const cx = w * 0.56, cy = h * 0.48;
  const R = Math.min(w, h);
  switch (zone) {
    case 1: bakeSpiralGalaxy(g, cx, cy, R * 0.4, th.accent); break;
    case 2: bakeRingedPlanet(g, cx, cy, R * 0.22, th.accent, 0.35, false); break;
    case 3: bakeBlackHole(g, cx, cy, R * 0.15, th.accent); break;
    case 4: bakeRingedPlanet(g, cx, cy, R * 0.2, th.accent, 0.55, true); break;
    default: bakeCrackedPlanet(g, cx, cy, R * 0.24, th.accent); break;
  }

  const vg = g.createRadialGradient(w / 2, h / 2, R * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
}

function bakeSpiralGalaxy(g, cx, cy, r, color) {
  g.save();
  g.translate(cx, cy);
  for (let arm = 0; arm < 2; arm++) {
    g.save();
    g.rotate(arm * Math.PI);
    g.beginPath();
    for (let t = 0; t <= 1; t += 0.01) {
      const a = t * Math.PI * 4;
      const rr = t * r;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.5;
      if (t === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = color;
    g.globalAlpha = 0.4;
    g.lineWidth = r * 0.14;
    g.stroke();
    g.restore();
  }
  g.globalAlpha = 1;
  const core = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.35);
  core.addColorStop(0, "#ffffff");
  core.addColorStop(0.4, color);
  core.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = core;
  g.beginPath(); g.arc(0, 0, r * 0.35, 0, Math.PI * 2); g.fill();
  g.restore();
}

function bakeRingedPlanet(g, cx, cy, r, color, ringTilt, withMoon) {
  g.save();
  g.translate(cx, cy);

  g.save();
  g.scale(1, ringTilt);
  g.beginPath();
  g.ellipse(0, 0, r * 2.1, r * 2.1, 0, 0, Math.PI * 2);
  g.strokeStyle = color;
  g.globalAlpha = 0.45;
  g.lineWidth = r * 0.2;
  g.stroke();
  g.restore();

  const body = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(0.3, color);
  body.addColorStop(1, "#00040a");
  g.globalAlpha = 1;
  g.fillStyle = body;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();

  g.save();
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.clip();
  g.scale(1, ringTilt);
  g.beginPath();
  g.ellipse(0, r / ringTilt * 0.15, r * 2.1, r * 2.1, 0, 0, Math.PI * 2);
  g.strokeStyle = color;
  g.globalAlpha = 0.6;
  g.lineWidth = r * 0.2;
  g.stroke();
  g.restore();

  if (withMoon) {
    g.globalAlpha = 0.9;
    g.fillStyle = "#cfcfe6";
    g.beginPath(); g.arc(r * 1.7, -r * 1.15, r * 0.22, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function bakeBlackHole(g, cx, cy, r, color) {
  g.save();
  g.translate(cx, cy);
  const disk = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 3.2);
  disk.addColorStop(0, color);
  disk.addColorStop(0.5, "rgba(255,180,60,0.25)");
  disk.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = disk;
  g.beginPath(); g.arc(0, 0, r * 3.2, 0, Math.PI * 2); g.fill();

  g.globalAlpha = 0.5;
  g.strokeStyle = "#ffffff";
  g.lineWidth = r * 0.35;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(r * 3.6, -r * 3.6); g.stroke();
  g.globalAlpha = 1;

  g.fillStyle = "#000000";
  g.beginPath(); g.arc(0, 0, r * 0.7, 0, Math.PI * 2); g.fill();
  g.restore();
}

function bakeCrackedPlanet(g, cx, cy, r, color) {
  g.save();
  g.translate(cx, cy);
  const body = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  body.addColorStop(0, "#ffb0a0");
  body.addColorStop(0.35, color);
  body.addColorStop(1, "#1a0505");
  g.fillStyle = body;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();

  g.strokeStyle = "#ffcc66";
  g.globalAlpha = 0.7;
  g.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    let x = (Math.random() * 2 - 1) * r * 0.6, y = (Math.random() * 2 - 1) * r * 0.6;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (Math.random() * 2 - 1) * r * 0.2;
      y += (Math.random() * 2 - 1) * r * 0.2;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
}
