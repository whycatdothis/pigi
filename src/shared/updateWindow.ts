/**
 * How long the progress window keeps "pigi is up to date" on screen before it
 * closes itself.
 *
 * Shared, because the window renders a countdown for exactly this long: one
 * constant keeps what the user reads and what the timer does from drifting
 * apart.
 */
export const UP_TO_DATE_CLOSE_SECONDS = 2;

/**
 * Where a failed update sends the user to install by hand. GitHub resolves
 * `latest/download/<file>` to the newest release's asset, and every release
 * since 0.4.11 carries the DMG under this unversioned name.
 */
export const MANUAL_DOWNLOAD_URL =
  'https://github.com/whycatdothis/pigi/releases/latest/download/pigi-arm64.dmg';
