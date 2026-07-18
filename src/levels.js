// COSMIC CUT — levels (the campaign data table)
// Data-driven progression (§11). Each level specifies: claim TARGET %, which Qix
// blobs spawn (indices into config.BLOB_TYPES), Hunter Blobs (same indices),
// and counts of normal/fast Sparx. Difficulty rises by raising the target,
// adding enemies, shifting blobs redder, and mixing in faster enemy types.
// This is the single source of truth for progression — tune freely here.

// Enemy mix per level:
//   main[]    — BLOB_TYPES indices. By default the FIRST becomes the line-sheaf
//               Qix (the star); the rest become polygon Blobs. Override with
//               opts.qix / opts.blobs for full per-level control.
//   hunters[] — BLOB_TYPES indices for polygon Hunter Blobs (drift toward player)
//   sparx / fastSparx — counts of normal / Fast Sparx spawned at the corners
//   special[] — kinds ("life" | "slow") of Special Blobs (§8) to place, on top
//               of the roster above
function lvl(zone, sub, target, main, opts = {}) {
  const [first, ...rest] = main;
  const qix   = opts.qix   ?? (first !== undefined ? [first] : []);
  const blobs = opts.blobs ?? rest;
  const { hunters = [], sparx = 0, fastSparx = 0, special = [] } = opts;
  return {
    zone, sub,
    label: `${zone}-${sub}`,
    target, qix, blobs, hunters, sparx, fastSparx, special,
    extraLife: sub === 4,
    boss:      sub === 5,
  };
}

// Target rebalance (2026-07-18, Mark: zone 3 felt too hard, 90% clears with
// blobs+hunters+sparx+a line-sheaf all on screen at once). The old table only
// escalated ONE knob against you as levels progressed — a shrinking unclaimed
// area (70%→90%) — while ALSO piling on more/faster enemies into that same
// shrinking space. The two compounded: by 5-4 the "safe room per enemy" had
// collapsed roughly 16× versus 1-1 (10.0 → 0.6 on a rough load-vs-remaining-
// area estimate: roaming enemies — Qix/Blobs/Hunters — weighted heavier than
// perimeter-bound Sparx, since only the former eat into the open space you
// still need to cut). Rebalanced so that curve declines gently (floor ~1.3–2.4
// instead of 0.6–0.9) — let enemy COUNT/SPEED carry the rising difficulty, not
// also an ever-shrinking finish line on top of it. Zone 1 is left almost
// untouched (not the reported problem); every zone still ends with a target
// dip on its X-5 boss, matching the original convention.
export const LEVELS = [
  // --- Zone 1 — cyan; introduces the Qix, then one Sparx at 1-3 ---
  lvl(1, 1, 70, [0]),
  lvl(1, 2, 72, [0, 1]),
  lvl(1, 3, 72, [0, 1],    { sparx: 1 }),
  lvl(1, 4, 74, [1, 2],    { sparx: 1 }),
  lvl(1, 5, 68, [1, 2],    { sparx: 1 }),          // boss

  // --- Zone 2 — orange; Fast Sparx arrives, Hunter Blob at 2-3 ---
  lvl(2, 1, 72, [1, 2, 3], { fastSparx: 1 }),
  lvl(2, 2, 74, [2, 2, 3], { sparx: 2, special: ["life"] }),
  lvl(2, 3, 74, [2, 3],    { sparx: 1, hunters: [2] }),
  lvl(2, 4, 76, [2, 3],    { sparx: 2, hunters: [2] }),
  lvl(2, 5, 68, [2, 3, 4], { sparx: 1, hunters: [2] }), // boss

  // --- Zone 3 — green; mix of Sparx types + Hunters ---
  lvl(3, 1, 72, [2, 3, 4], { sparx: 1, fastSparx: 1 }),
  lvl(3, 2, 72, [2, 3, 4], { sparx: 1, fastSparx: 1, hunters: [3], special: ["slow"] }),
  lvl(3, 3, 74, [3, 3, 4], { sparx: 2, fastSparx: 1, hunters: [3] }),
  lvl(3, 4, 74, [3, 4, 4], { sparx: 2, fastSparx: 1, hunters: [3], special: ["life"] }),
  lvl(3, 5, 66, [3, 4, 4], { sparx: 1, fastSparx: 2, hunters: [3] }), // boss

  // --- Zone 4 — violet; rising Fast Sparx pressure ---
  lvl(4, 1, 72, [3, 4, 4], { sparx: 2, fastSparx: 1, hunters: [3, 4] }),
  lvl(4, 2, 74, [3, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4] }),
  lvl(4, 3, 74, [3, 4, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4], special: ["slow"] }),
  lvl(4, 4, 76, [4, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4, 4] }),
  lvl(4, 5, 66, [4, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4, 4] }), // boss

  // --- Zone 5 — gold; red swarm, peak difficulty ---
  lvl(5, 1, 74, [4, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4] }),
  lvl(5, 2, 76, [4, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4, 4], special: ["life"] }),
  lvl(5, 3, 76, [4, 4, 4, 4], { sparx: 3, fastSparx: 2, hunters: [4] }),
  lvl(5, 4, 78, [4, 4, 4, 4], { sparx: 3, fastSparx: 2, hunters: [4, 4], special: ["slow"] }),
  lvl(5, 5, 70, [4, 4, 4, 4], { sparx: 2, fastSparx: 3, hunters: [4, 4] }), // campaign boss
];

export const levelCount = LEVELS.length;
export const zoneCount  = LEVELS[LEVELS.length - 1].zone;

export function zoneStart(zone) {
  return LEVELS.findIndex(l => l.zone === zone && l.sub === 1);
}
