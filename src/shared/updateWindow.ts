/**
 * How long the progress window keeps "pigi is up to date" on screen before it
 * closes itself.
 *
 * Shared, because the window renders a countdown for exactly this long: one
 * constant keeps what the user reads and what the timer does from drifting
 * apart.
 */
export const UP_TO_DATE_CLOSE_SECONDS = 2;
