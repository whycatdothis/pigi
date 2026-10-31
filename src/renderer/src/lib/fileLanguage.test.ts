import { describe, expect, it } from 'vitest';
import { isMarkdownPath, languageForPath } from './fileLanguage';

describe('languageForPath', () => {
  it('maps common extensions and special file names', () => {
    expect(languageForPath('src/app.ts')).toBe('typescript');
    expect(languageForPath('src/app.tsx')).toBe('tsx');
    expect(languageForPath('src/index.test.mjs')).toBe('javascript');
    expect(languageForPath('docs/readme.md')).toBe('markdown');
    expect(languageForPath('Dockerfile')).toBe('docker');
    expect(languageForPath('config/package.json')).toBe('json');
  });

  it('returns an empty language for unknown extensions', () => {
    expect(languageForPath('assets/logo.bin')).toBe('');
    expect(languageForPath('LICENSE')).toBe('');
  });
});

describe('isMarkdownPath', () => {
  it('recognizes the markdown extensions', () => {
    expect(isMarkdownPath('README.md')).toBe(true);
    expect(isMarkdownPath('docs/page.markdown')).toBe(true);
    expect(isMarkdownPath('docs/page.mdx')).toBe(true);
    expect(isMarkdownPath('src/app.ts')).toBe(false);
  });
});
