/** Everything on the site that points somewhere, or that measures something. */

export const GITHUB_OWNER = 'whycatdothis';
export const GITHUB_REPO = 'pigi';
export const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;
/** Never 404s: GitHub redirects this to whichever release is newest. */
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
export const PI_URL = 'https://pi.dev';

export const LICENSE_NAME = 'Apache-2.0';
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

/**
 * The macOS build published by the release workflow. `electron-builder.yml` only
 * targets arm64 today, so this is the only artifact the site offers as a
 * download; the pattern is what tells the DMG apart from the zip, the blockmaps
 * and the updater's metadata in the same release.
 */
export const MAC_DMG_PATTERN = /-arm64\.dmg$/;

/**
 * The page's colour: the pig's own pink.
 *
 * `BRAND_PINK` is sampled from `public/icon-256.png` — the app icon, the colour
 * the site is about. It is a light pink (a hair under 3:1 against white), so it is
 * a *surface* and never text: the download button fills with it and prints
 * `BRAND_PINK_INK` on it (6.4:1). Everything that has to read — the section
 * eyebrows, the minimap's lit bar, the selected session, the focus ring — uses the
 * accent instead, which is the same pink at the lightness text needs.
 *
 * The two accents are published the way the app publishes a chosen accent
 * (`applyThemeAccent` writes `--accent-light` and `--accent-dark` on <html>), so
 * the windows on the page and the page around them are tinted by the same value.
 * The app's own accent list (`src/renderer/src/lib/themeAccents.ts`) has eight
 * entries and none of them is the pig's; this is the one colour the page names
 * for itself.
 */
export const BRAND_PINK = '#f6729b';
export const BRAND_PINK_INK = '#201a1d';
/** Pink at text lightness, per theme; hue held where the icon's pink sits. */
export const SITE_ACCENT_LIGHT = 'oklch(0.56 0.19 355)';
export const SITE_ACCENT_DARK = 'oklch(0.78 0.13 355)';

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
