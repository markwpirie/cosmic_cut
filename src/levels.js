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
function lvl(zone, sub, target, main, opts = {}) {
  const [first, ...rest] = main;
  const qix   = opts.qix   ?? (first !== undefined ? [first] : []);
  const blobs = opts.blobs ?? rest;
  const { hunters = [], sparx = 0, fastSparx = 0 } = opts;
  return {
    zone, sub,
    label: `${zone}-${sub}`,
    target, qix, blobs, hunters, sparx, fastSparx,
    extraLife: sub === 4,
    boss:      sub === 5,
  };
}

export const LEVELS = [
  // --- Zone 1 — cyan; introduces the Qix, then one Sparx at 1-3 ---
  lvl(1, 1, 70, [0]),
  lvl(1, 2, 72, [0, 1]),
  lvl(1, 3, 74, [0, 1],    { sparx: 1 }),
  lvl(1, 4, 76, [1, 2],    { sparx: 1 }),
  lvl(1, 5, 70, [1, 2],    { sparx: 1 }),          // boss

  // --- Zone 2 — orange; Fast Sparx arrives, Hunter Blob at 2-3 ---
  lvl(2, 1, 78, [1, 2, 3], { fastSparx: 1 }),
  lvl(2, 2, 80, [2, 2, 3], { sparx: 2 }),
  lvl(2, 3, 80, [2, 3],    { sparx: 1, hunters: [2] }),
  lvl(2, 4, 82, [2, 3],    { sparx: 2, hunters: [2] }),
  lvl(2, 5, 74, [2, 3, 4], { sparx: 1, hunters: [2] }), // boss

  // --- Zone 3 — green; mix of Sparx types + Hunters ---
  lvl(3, 1, 80, [2, 3, 4], { sparx: 1, fastSparx: 1 }),
  lvl(3, 2, 82, [2, 3, 4], { sparx: 1, fastSparx: 1, hunters: [3] }),
  lvl(3, 3, 84, [3, 3, 4], { sparx: 2, fastSparx: 1, hunters: [3] }),
  lvl(3, 4, 84, [3, 4, 4], { sparx: 2, fastSparx: 1, hunters: [3] }),
  lvl(3, 5, 78, [3, 4, 4], { sparx: 1, fastSparx: 2, hunters: [3] }), // boss

  // --- Zone 4 — violet; rising Fast Sparx pressure ---
  lvl(4, 1, 84, [3, 4, 4], { sparx: 2, fastSparx: 1, hunters: [3, 4] }),
  lvl(4, 2, 86, [3, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4] }),
  lvl(4, 3, 86, [3, 4, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4] }),
  lvl(4, 4, 88, [4, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4, 4] }),
  lvl(4, 5, 80, [4, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4, 4] }), // boss

  // --- Zone 5 — gold; red swarm, peak difficulty ---
  lvl(5, 1, 86, [4, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4] }),
  lvl(5, 2, 88, [4, 4, 4], { sparx: 2, fastSparx: 2, hunters: [4, 4] }),
  lvl(5, 3, 90, [4, 4, 4, 4], { sparx: 3, fastSparx: 2, hunters: [4] }),
  lvl(5, 4, 90, [4, 4, 4, 4], { sparx: 3, fastSparx: 2, hunters: [4, 4] }),
  lvl(5, 5, 82, [4, 4, 4, 4], { sparx: 2, fastSparx: 3, hunters: [4, 4] }), // campaign boss
];

export const levelCount = LEVELS.length;
export const zoneCount  = LEVELS[LEVELS.length - 1].zone;

export function zoneStart(zone) {
  return LEVELS.findIndex(l => l.zone === zone && l.sub === 1);
}
