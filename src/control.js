// COSMIC CUT — control
// Keyboard input → movement intents (§16). Two intents:
//   pending  — a single FRESH key press, consumed at the next intersection
//              (used to start a cut, or turn the instant it's possible).
//   held     — the latest still-held direction is a STANDING intent: hold a
//              direction approaching a junction and the marker turns onto that
//              line the moment it arrives.
//
// DOM listeners are guarded by a window check so this module imports cleanly in
// Node for headless tests, which drive input via press()/release() directly.

const KEY_VEC = {
  ArrowRight: { dx: 1, dy: 0 }, d: { dx: 1, dy: 0 }, D: { dx: 1, dy: 0 },
  ArrowLeft: { dx: -1, dy: 0 }, a: { dx: -1, dy: 0 }, A: { dx: -1, dy: 0 },
  ArrowDown: { dx: 0, dy: 1 }, s: { dx: 0, dy: 1 }, S: { dx: 0, dy: 1 },
  ArrowUp: { dx: 0, dy: -1 }, w: { dx: 0, dy: -1 }, W: { dx: 0, dy: -1 },
};

let pending = null;
const heldKeys = []; // movement keys currently down, in press order

export function press(key) {
  if (!KEY_VEC[key]) return;
  if (heldKeys.includes(key)) return; // ignore OS auto-repeat
  heldKeys.push(key);
  pending = KEY_VEC[key];
}

export function release(key) {
  const i = heldKeys.indexOf(key);
  if (i >= 0) heldKeys.splice(i, 1);
}

// The direction the player is currently holding (latest press still down).
export function currentDesired() {
  return heldKeys.length ? KEY_VEC[heldKeys[heldKeys.length - 1]] : null;
}

export function peekPending() { return pending; }
export function clearPending() { pending = null; }

// Reset all input state (used by tests / level restart).
export function reset() {
  pending = null;
  heldKeys.length = 0;
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (!KEY_VEC[e.key]) return;
    e.preventDefault(); // stop arrows scrolling the page
    press(e.key);
  });
  window.addEventListener("keyup", (e) => release(e.key));
}
