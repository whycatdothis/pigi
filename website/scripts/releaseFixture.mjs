/**
 * A canned GitHub release, for the two scripts that drive the built page.
 *
 * The download button asks api.github.com which file the newest release holds and
 * rewrites its own href when the answer arrives. Left alone, that request makes
 * both scripts depend on GitHub being reachable and under its 60-per-hour
 * anonymous rate limit — a run that hits the limit reports the fallback link and
 * looks like a broken button.
 *
 * So the API is answered from here instead, and the scripts assert on the page's
 * own logic: that it reads a release, picks the arm64 DMG out of its assets and
 * writes the file's URL onto every button.
 */

/** Shape of the two fields `interactions.ts` reads off an asset. */
const arm64Dmg = {
  name: 'pigi-9.9.9-arm64.dmg',
  size: 156561714,
  browser_download_url:
    'https://github.com/whycatdothis/pigi/releases/download/v9.9.9/pigi-9.9.9-arm64.dmg',
};

/** The newest release, as the API would return it: a DMG plus the noise around it. */
export const CANDIDATE_RELEASE = {
  tag_name: 'v9.9.9',
  assets: [
    { name: 'pigi-9.9.9-arm64.dmg.blockmap', size: 165000, browser_download_url: 'ignored' },
    { name: 'pigi-9.9.9-arm64-mac.zip', size: 155000000, browser_download_url: 'ignored' },
    arm64Dmg,
    { name: 'latest-mac.yml', size: 400, browser_download_url: 'ignored' },
  ],
};

/** What the page should end up pointing at. */
export const CANDIDATE_DOWNLOAD_URL = arm64Dmg.browser_download_url;
export const CANDIDATE_VERSION = CANDIDATE_RELEASE.tag_name;
export const CANDIDATE_ASSET = arm64Dmg.name;

/**
 * Answers the releases API in this page, once.
 *
 * Playwright matches on the glob, so the pattern covers every repository the
 * script could ask about; the fixture above is what comes back.
 */
export async function stubReleaseApi(page) {
  await page.route('**/api.github.com/repos/**/releases/latest', (route) =>
    route.fulfill({ json: CANDIDATE_RELEASE }),
  );
}
