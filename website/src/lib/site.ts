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
