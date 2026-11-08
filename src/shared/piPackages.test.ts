import { describe, expect, it } from 'vitest';
import {
  authorFromManifest,
  failureReason,
  imageUrlFromManifest,
  npmNameFromSource,
  packageImageUrl,
  parsePackageImageUrl,
  parseInstallSource,
  piSourceType,
  resourceKindsFromKeywords,
} from './piPackages';

describe('npmNameFromSource', () => {
  it('drops the version, keeping a scope', () => {
    expect(npmNameFromSource('npm:pi-web-access')).toBe('pi-web-access');
    expect(npmNameFromSource('npm:pi-web-access@1.0.0')).toBe('pi-web-access');
    expect(npmNameFromSource('npm:@scope/name@^2')).toBe('@scope/name');
    expect(npmNameFromSource('git:github.com/a/b')).toBeNull();
  });
});

describe('resourceKindsFromKeywords', () => {
  it('maps pi.dev keywords to resource kinds', () => {
    expect(resourceKindsFromKeywords(['pi-package', 'Extension', 'pi-skill'])).toEqual([
      'extensions',
      'skills',
    ]);
  });
});

describe('failureReason', () => {
  it('names a known npm error code', () => {
    const log = [
      'npm error code E404',
      'npm error 404 Not Found - GET https://registry.npmjs.org/nope',
      'npm error A complete log of this run can be found in: /x.log',
    ].join('\n');
    expect(failureReason(log)).toBe('Not found in the npm registry.');
  });

  it('falls back to the first npm error line, then git fatal', () => {
    expect(failureReason('npm error code EWHAT\nnpm error something odd happened')).toBe(
      'something odd happened',
    );
    expect(failureReason("Cloning into 'x'...\nfatal: repository 'https://h/x' not found")).toBe(
      "repository 'https://h/x' not found",
    );
    expect(failureReason('nothing useful')).toBeNull();
  });
});

describe('package images', () => {
  it('round-trips npm names and paths', () => {
    for (const target of [{ npm: '@scope/pkg' }, { path: '/Users/me/my pkg' }]) {
      expect(parsePackageImageUrl(packageImageUrl(target))).toEqual(target);
    }
    expect(parsePackageImageUrl('package-image://url/https%3A%2F%2Fx')).toBeNull();
    // The name becomes a registry path; nothing else may ride along.
    expect(parsePackageImageUrl('package-image://npm/..%2F..%2F-%2Fwhoami')).toBeNull();
    expect(parsePackageImageUrl('package-image://npm/x%401.0.0')).toBeNull();
  });

  it('accepts only http(s) images of the kinds pi.dev shows', () => {
    expect(imageUrlFromManifest({ pi: { image: 'https://x.dev/a.PNG?v=1' } })).toBe(
      'https://x.dev/a.PNG?v=1',
    );
    expect(imageUrlFromManifest({ pi: { image: 'https://x.dev/a.svg' } })).toBeNull();
    expect(imageUrlFromManifest({ pi: { image: 'file:///etc/a.png' } })).toBeNull();
    expect(imageUrlFromManifest({ pi: { video: 'https://x.dev/a.mp4' } })).toBeNull();
  });
});

describe('authorFromManifest', () => {
  it('reads the name from either form, without email or url', () => {
    expect(authorFromManifest({ author: 'Ada Lovelace <ada@example.com> (https://ada.dev)' })).toBe(
      'Ada Lovelace',
    );
    expect(authorFromManifest({ author: { name: 'Ada', email: 'ada@example.com' } })).toBe('Ada');
    expect(authorFromManifest({ author: '' })).toBeNull();
    expect(authorFromManifest(null)).toBeNull();
  });
});

describe('parseInstallSource', () => {
  it.each([
    ['npm:pi-web-access', 'npm:pi-web-access'],
    ['npm:@foo/bar@1.2.3', 'npm:@foo/bar@1.2.3'],
    ['git:github.com/user/repo@v1', 'git:github.com/user/repo@v1'],
    ['https://github.com/user/repo', 'https://github.com/user/repo'],
    ['ssh://git@github.com/user/repo', 'ssh://git@github.com/user/repo'],
    ['git@github.com:user/repo', 'git:git@github.com:user/repo'],
    ['./relative', './relative'],
    ['https://www.npmjs.com/package/@scope/name', 'npm:@scope/name'],
    ['https://pi.dev/packages/pi-web-access?type=extension', 'npm:pi-web-access'],
    ['  pi install -l pi-web-access ', 'npm:pi-web-access'],
  ])('reads %s as a source', (text, source) => {
    expect(parseInstallSource(text)).toBe(source);
  });

  it('reads a bare word as an npm name and keeps other sources', () => {
    expect(parseInstallSource('pi-web-access')).toBe('npm:pi-web-access');
    expect(parseInstallSource('pi install npm:@scope/pkg')).toBe('npm:@scope/pkg');
    expect(parseInstallSource('https://github.com/user/repo')).toBe('https://github.com/user/repo');
    expect(parseInstallSource('~/code/pkg')).toBe('~/code/pkg');
    expect(parseInstallSource('npm:@scope/name@1.2.0')).toBe('npm:@scope/name@1.2.0');
    expect(parseInstallSource('git@github.com:user/repo.git')).toBe(
      'git:git@github.com:user/repo.git',
    );
  });

  it('keeps a path whole, spaces and all', () => {
    expect(parseInstallSource('/Users/me/My Packages/pkg')).toBe('/Users/me/My Packages/pkg');
    expect(parseInstallSource('C:\\Users\\me\\pkg')).toBe('C:\\Users\\me\\pkg');
  });

  it('rejects text that is not one source', () => {
    expect(parseInstallSource('')).toBeNull();
    expect(parseInstallSource('two words')).toBeNull();
    expect(parseInstallSource('npm:')).toBeNull();
    expect(parseInstallSource('pi install')).toBeNull();
    expect(parseInstallSource('pi install -l')).toBeNull();
  });
});

describe('piSourceType', () => {
  it('reads sources as pi does', () => {
    expect(piSourceType('npm:@scope/x@1.0.0')).toBe('npm');
    expect(piSourceType('git:git@github.com:user/repo')).toBe('git');
    expect(piSourceType('https://github.com/user/repo')).toBe('git');
    expect(piSourceType('~/code/pkg')).toBe('local');
    expect(piSourceType('../pkg')).toBe('local');
  });
});
