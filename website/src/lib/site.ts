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
