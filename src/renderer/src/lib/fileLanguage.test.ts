import { describe, expect, it } from 'vitest';
import { isMarkdownPath, languageForFile } from './fileLanguage';

describe('languageForFile', () => {
  it('maps extensions and special file names', () => {
    expect(languageForFile('src/app.ts')).toBe('ts');
    expect(languageForFile('src/app.TSX')).toBe('tsx');
    expect(languageForFile('docs/readme.md')).toBe('md');
    expect(languageForFile('Dockerfile')).toBe('docker');
    expect(languageForFile('dockerfile')).toBe('docker');
    expect(languageForFile('lib/Foo/Bar.pm')).toBe('perl');
    expect(languageForFile('t/foo.t')).toBe('perl');
    expect(languageForFile('lib/BUILD.bazel')).toBe('python');
    expect(languageForFile('lib/BUILD')).toBe('python');
    expect(languageForFile('lib/defs.bzl')).toBe('python');
  });

  it('returns an empty language for unknown extensions and plain text', () => {
    expect(languageForFile('assets/logo.bin')).toBe('');
    expect(languageForFile('LICENSE')).toBe('');
    expect(languageForFile('notes.txt')).toBe('');
    expect(languageForFile('.gitignore')).toBe('');
    expect(languageForFile('scripts/build')).toBe('');
    expect(languageForFile('src/constructor')).toBe('');
    expect(languageForFile('src/a.__proto__')).toBe('');
  });

  it('falls back to the shebang when the path does not decide', () => {
    expect(languageForFile('bin/tool', '#!/usr/bin/perl -w\nuse strict;')).toBe('perl');
    expect(languageForFile('bin/tool', '#! /usr/bin/env -S python3 -u\n')).toBe('python');
    expect(languageForFile('bin/tool', '#!/usr/bin/env node\n')).toBe('javascript');
    expect(languageForFile('bin/tool', '#!/bin/sh\n')).toBe('sh');
    expect(languageForFile('cgi/app.cgi', '#!perl\n')).toBe('perl');
    expect(languageForFile('bin/tool', '#!/usr/bin/env\n')).toBe('');
    expect(languageForFile('bin/tool', 'no shebang')).toBe('');
    expect(languageForFile('bin/tool.ts', '#!/usr/bin/env node\n')).toBe('ts');
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
