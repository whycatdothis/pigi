export const GITHUB_OWNER = 'whycatdothis';
export const GITHUB_REPO = 'pigi';
export const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;
// Relies on the unversioned DMG name set by dmg.artifactName in electron-builder.yml.
export const DOWNLOAD_URL = `${RELEASES_URL}/latest/download/pigi-arm64.dmg`;
export const PI_URL = 'https://pi.dev';

export const LICENSE_NAME = 'Apache-2.0';
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

// Cookieless, so no consent banner.
export const UMAMI_SCRIPT_URL = 'https://cloud.umami.is/script.js';
export const UMAMI_WEBSITE_ID = '4c09383f-bc63-42a4-a5a2-cd56e0ac8368';

export const UMAMI_EVENT_DOWNLOAD = 'download-release';
export const UMAMI_EVENT_REPO = 'open-github';
