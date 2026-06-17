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

export const LEVELS = [
  // Zone 1 — learn the ropes (blue/cyan, one slow Blob)
  lvl(1, 1, 45, [0]), lvl(1, 2, 50, [0]), lvl(1, 3, 52, [1]), lvl(1, 4, 55, [1]), lvl(1, 5, 48, [1]),
  // Zone 2 — a second Blob appears (cyan/green)
  lvl(2, 1, 55, [1]), lvl(2, 2, 57, [1, 0]), lvl(2, 3, 58, [2]), lvl(2, 4, 60, [2, 0]), lvl(2, 5, 52, [2, 1]),
  // Zone 3 — green/amber, quicker
  lvl(3, 1, 58, [2, 1]), lvl(3, 2, 60, [2, 2]), lvl(3, 3, 62, [3]), lvl(3, 4, 64, [3, 1]), lvl(3, 5, 55, [3, 2]),
  // Zone 4 — amber pressure, up to three
  lvl(4, 1, 62, [3, 2]), lvl(4, 2, 64, [3, 2]), lvl(4, 3, 66, [3, 3]), lvl(4, 4, 68, [4, 2]), lvl(4, 5, 58, [4, 3]),
  // Zone 5 — red, small & fast
  lvl(5, 1, 65, [4, 3]), lvl(5, 2, 67, [4, 3]), lvl(5, 3, 69, [4, 4]), lvl(5, 4, 70, [4, 4, 2]), lvl(5, 5, 62, [4, 4, 4]),
];

export const levelCount = LEVELS.length;
export const zoneCount = LEVELS[LEVELS.length - 1].zone;

// Index of the first level (X-1) of a zone (1..zoneCount).
export function zoneStart(zone) {
  return LEVELS.findIndex((l) => l.zone === zone && l.sub === 1);
}
