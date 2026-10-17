/** Everything on the site that points somewhere, or that measures something. */

export const GITHUB_OWNER = 'whycatdothis';
export const GITHUB_REPO = 'pigi';
export const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;
/**
 * The download, with no version in it.
 *
 * `releases/latest/download/<file>` is GitHub's own shortcut: it answers with the
 * asset of whichever release is newest *at the moment of the click*. So the link
 * is right the second a release is published — there is nothing to rebuild, and
 * nothing for the visitor's browser to look up, which also means no API call, no
 * rate limit and no dependency on `api.github.com` being reachable.
 *
 * The one thing it requires is a file name that every release carries, which is
 * why the DMG is named without its version (`dmg.artifactName` in
 * `electron-builder.yml`, and `pigi-arm64.dmg` on every release since 0.4.11).
 */
export const DOWNLOAD_URL = `${RELEASES_URL}/latest/download/pigi-arm64.dmg`;
export const PI_URL = 'https://pi.dev';

export const LICENSE_NAME = 'Apache-2.0';
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

/**
 * The page's colour: pink, the pig's.
 *
 * The icon (`public/icon-256.png`) is `#f6729b`, and that is the pink the page is
 * about — but it is a 2.7:1 pink: too light to carry white text and too light to
 * read as text on white. So the page uses that hue at the lightness each job
 * needs, and keeps the icon's own value for the mark itself:
 *
 * - `--brand` fills the download button and `--brand-ink` (white) prints on it:
 *   4.8:1, and it does not change with the theme, so the button is the same pink
 *   on a white page and a near-black one. Both are tokens in `global.css`, which
 *   is where the button reads them from — a second copy here would be a pink that
 *   could drift from the pink on the page.
 * - `SITE_ACCENT_LIGHT`/`SITE_ACCENT_DARK` are the same hue tuned per theme for
 *   things that have to read: the section eyebrows, the lit minimap bar, the
 *   selected session, the focus ring (4.9:1 on the page, 9.6:1 on the dark page).
 *
 * The two accents are published the way the app publishes a chosen accent
 * (`applyThemeAccent` writes `--accent-light` and `--accent-dark` on <html>), so
 * the windows on the page and the page around them are tinted by the same value.
 * The app's own accent list (`src/renderer/src/lib/themeAccents.ts`) has eight
 * entries and none of them is the pig's; this is the one colour the page names
 * for itself.
 */
/** Pink at text lightness, per theme; hue held where the icon's pink sits. */
export const SITE_ACCENT_LIGHT = 'oklch(0.56 0.2 356)';
export const SITE_ACCENT_DARK = 'oklch(0.78 0.13 356)';

/** Umami, the only analytics on the site. Cookieless, so no consent banner. */
export const UMAMI_SCRIPT_URL = 'https://cloud.umami.is/script.js';
export const UMAMI_WEBSITE_ID = '4c09383f-bc63-42a4-a5a2-cd56e0ac8368';

/**
 * Event names, kept in one place so a rename cannot leave the dashboard reading
 * half the site under an old label. Both are attached to elements as
 * `data-umami-event` attributes; the tracker binds them itself, which is why the
 * download click is recorded even though it starts a navigation away from the
 * page.
 */
export const UMAMI_EVENT_DOWNLOAD = 'download-release';
export const UMAMI_EVENT_REPO = 'open-github';
