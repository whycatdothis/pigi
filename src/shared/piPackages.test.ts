import { describe, expect, it } from 'vitest';
import {
  failureReason,
  npmNameFromSource,
  parsePackageInput,
  resourceKindsFromKeywords,
} from './piPackages';

describe('parsePackageInput', () => {
  it.each([
    ['npm:pi-web-access', 'npm:pi-web-access'],
    ['npm:@foo/bar@1.2.3', 'npm:@foo/bar@1.2.3'],
    ['git:github.com/user/repo@v1', 'git:github.com/user/repo@v1'],
    ['https://github.com/user/repo', 'https://github.com/user/repo'],
    ['ssh://git@github.com/user/repo', 'ssh://git@github.com/user/repo'],
    ['git@github.com:user/repo', 'git:git@github.com:user/repo'],
    ['/abs/path', '/abs/path'],
    ['~/code/my-ext', '~/code/my-ext'],
    ['./relative', './relative'],
    ['https://www.npmjs.com/package/@scope/name', 'npm:@scope/name'],
    ['https://pi.dev/packages/pi-web-access?type=extension', 'npm:pi-web-access'],
  ])('reads %s as a source', (text, source) => {
    expect(parsePackageInput(text)).toEqual({ kind: 'source', source, scope: null });
  });

  it('reads a pi install line, a bare name after it as npm, and -l as project scope', () => {
    expect(parsePackageInput('pi install npm:pi-web-access')).toEqual({
      kind: 'source',
      source: 'npm:pi-web-access',
      scope: null,
    });
    expect(parsePackageInput('  pi install -l pi-web-access ')).toEqual({
      kind: 'source',
      source: 'npm:pi-web-access',
      scope: 'project',
    });
  });

  it('searches for anything else', () => {
    expect(parsePackageInput('')).toEqual({ kind: 'empty' });
    expect(parsePackageInput('   ')).toEqual({ kind: 'empty' });
    expect(parsePackageInput('web search')).toEqual({ kind: 'search', query: 'web search' });
    expect(parsePackageInput('pi-web-access')).toEqual({ kind: 'search', query: 'pi-web-access' });
    expect(parsePackageInput('npm:')).toEqual({ kind: 'search', query: 'npm:' });
    expect(parsePackageInput('pi install')).toEqual({ kind: 'search', query: 'pi install' });
  });
});

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
