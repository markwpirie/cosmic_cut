// COSMIC CUT — game (lives & overall state)
// The small bit of state that sits above the marker and the world: how many
// lives are left and whether we're playing or showing GAME OVER. Phase 4 adds
// the win condition and level progression here. No DOM.

const START_LIVES = 3;

export let lives = START_LIVES;
export let state = "playing"; // "playing" | "gameover"

// A blob hit. Costs a life; at zero, the run is over.
export function loseLife() {
  lives -= 1;
  if (lives <= 0) {
    lives = 0;
    state = "gameover";
  }
}

// New run (level restart after game over).
export function reset() {
  lives = START_LIVES;
  state = "playing";
}
