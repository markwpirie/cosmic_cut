// COSMIC CUT — levels (the campaign data table)
// Data-driven progression (§11). Each level lists its claim TARGET % and which
// Blobs spawn — indices into config.BLOB_TYPES, a blue/big/slow → red/small/fast
// spectrum. Difficulty rises by raising the target, adding Blobs, and shifting
// them redder. Sparx/Hunter and boss picture-reveals are Phase 5+/10; bosses
// (sub 5) are flagged but for now just use the zone's tougher Blob set.
// This is the single source of truth for progression — tune freely here.

function lvl(zone, sub, target, blobs) {
  return {
    zone,
    sub,
    label: `${zone}-${sub}`,
    target,
    blobs,
    extraLife: sub === 4, // extra life on clearing X-4 (§14)
    boss: sub === 5,      // X-5 boss (picture reveal is Phase 10)
  };
}

// Targets ramp 70% → 90% (bosses dip a little); Blob counts ramp fast (2 by 1-2,
// 3 by 1-3) and the spectrum shifts redder by zone. Tune to taste.
export const LEVELS = [
  // Zone 1 — cyan; ramps to three Blobs fast
  lvl(1, 1, 70, [0]), lvl(1, 2, 72, [0, 1]), lvl(1, 3, 74, [0, 1, 2]), lvl(1, 4, 76, [1, 2, 3]), lvl(1, 5, 70, [1, 2, 3]),
  // Zone 2 — orange; quicker Blobs
  lvl(2, 1, 78, [1, 2, 3]), lvl(2, 2, 80, [2, 2, 3]), lvl(2, 3, 80, [2, 3, 3]), lvl(2, 4, 82, [2, 3, 4]), lvl(2, 5, 74, [2, 3, 4]),
  // Zone 3 — green; a fourth Blob appears
  lvl(3, 1, 80, [2, 3, 4]), lvl(3, 2, 82, [2, 3, 3, 4]), lvl(3, 3, 84, [3, 3, 4]), lvl(3, 4, 84, [3, 3, 4, 4]), lvl(3, 5, 78, [3, 4, 4]),
  // Zone 4 — violet; amber/red pressure
  lvl(4, 1, 84, [3, 4, 4]), lvl(4, 2, 86, [3, 3, 4, 4]), lvl(4, 3, 86, [3, 4, 4, 4]), lvl(4, 4, 88, [4, 4, 4, 3]), lvl(4, 5, 80, [4, 4, 4]),
  // Zone 5 — gold; red swarm
  lvl(5, 1, 86, [4, 4, 4]), lvl(5, 2, 88, [4, 4, 4, 3]), lvl(5, 3, 90, [4, 4, 4, 4]), lvl(5, 4, 90, [4, 4, 4, 4, 3]), lvl(5, 5, 82, [4, 4, 4, 4]),
];

export const levelCount = LEVELS.length;
export const zoneCount = LEVELS[LEVELS.length - 1].zone;

// Index of the first level (X-1) of a zone (1..zoneCount).
export function zoneStart(zone) {
  return LEVELS.findIndex((l) => l.zone === zone && l.sub === 1);
}
