import { describe, expect, it } from 'vitest';
import {
  findPathTokenAtEnd,
  isLeadingSlashCommand,
  isPathQueryText,
  parentPath,
  pathCompletionLabel,
  pathTokenDirectory,
} from './pathReferences';

describe('findPathTokenAtEnd', () => {
  it('finds the token that ends at the cursor', () => {
    expect(findPathTokenAtEnd('src/renderer')).toEqual({
      token: 'src/renderer',
      startOffset: 0,
    });
  });

  it('starts after whitespace', () => {
    expect(findPathTokenAtEnd('look at src/renderer')).toEqual({
      token: 'src/renderer',
      startOffset: 8,
    });
  });

  it('requires a slash', () => {
    expect(findPathTokenAtEnd('src')).toBeNull();
  });

  it('ignores URLs', () => {
    expect(findPathTokenAtEnd('https://example.com/a')).toBeNull();
    expect(findPathTokenAtEnd('see //host/share')).toBeNull();
  });

  it('leaves @ and # references to their own pickers', () => {
    expect(findPathTokenAtEnd('@src/renderer')).toBeNull();
    expect(findPathTokenAtEnd('#project/src')).toBeNull();
  });

  it('allows an absolute path after whitespace', () => {
    expect(findPathTokenAtEnd('open /Users/me')).toEqual({
      token: '/Users/me',
      startOffset: 5,
    });
  });

  it('treats a bare tilde as the home directory token', () => {
    expect(findPathTokenAtEnd('~')).toEqual({ token: '~', startOffset: 0 });
    expect(findPathTokenAtEnd('open ~')).toEqual({ token: '~', startOffset: 5 });
  });

  it('keeps spaces once a name has been typed', () => {
    expect(findPathTokenAtEnd('src/My Doc')).toEqual({
      token: 'src/My Doc',
      startOffset: 0,
    });
    expect(findPathTokenAtEnd('look at src/My Doc')).toEqual({
      token: 'src/My Doc',
      startOffset: 8,
    });
  });

  it('ends completion on the first space after a bare directory', () => {
    expect(findPathTokenAtEnd('src/ ')).toBeNull();
    expect(findPathTokenAtEnd('~ ')).toBeNull();
    expect(findPathTokenAtEnd('open /Users/ ')).toBeNull();
  });

  it('does not reopen for prose after a bare path was closed with a space', () => {
    expect(findPathTokenAtEnd('src/ hello')).toBeNull();
    expect(findPathTokenAtEnd('/ hello')).toBeNull();
    expect(findPathTokenAtEnd('~ hello')).toBeNull();
  });

  it('keeps matching when a typed name is followed by another word', () => {
    expect(findPathTokenAtEnd('src/My hello')).toEqual({
      token: 'src/My hello',
      startOffset: 0,
    });
  });

  it('keeps a trailing space after a typed name', () => {
    expect(findPathTokenAtEnd('src/My ')).toEqual({
      token: 'src/My ',
      startOffset: 0,
    });
  });
});

describe('pathTokenDirectory', () => {
  it('keeps everything through the last slash', () => {
    expect(pathTokenDirectory('src/renderer/file')).toBe('src/renderer/');
  });

  it('is empty when the token has no directory', () => {
    expect(pathTokenDirectory('renderer')).toBe('');
  });

  it('keeps a trailing slash', () => {
    expect(pathTokenDirectory('src/')).toBe('src/');
  });
});

describe('pathCompletionLabel', () => {
  it('keeps the typed path prefix', () => {
    expect(pathCompletionLabel('src/ren', null, 'renderer')).toBe('src/renderer');
    expect(pathCompletionLabel('~/Doc', null, 'Documents')).toBe('~/Documents');
    expect(pathCompletionLabel('/', null, 'Users')).toBe('/Users');
  });

  it('keeps a bare tilde as the home alias', () => {
    expect(pathCompletionLabel('~', null, 'mingxin')).toBe('~');
  });

  it('appends the next segment to a directory chip label', () => {
    expect(pathCompletionLabel('src', 'src/renderer', 'main')).toBe('src/renderer/main');
    expect(pathCompletionLabel('', '~', 'Documents')).toBe('~/Documents');
  });

  it('joins a root directory without a double slash', () => {
    expect(pathCompletionLabel('', '/', 'Users')).toBe('/Users');
  });

  it('keeps segments typed after a directory chip', () => {
    expect(pathCompletionLabel('main/ip', 'src', 'ipc')).toBe('src/main/ipc');
  });
});

describe('parentPath', () => {
  it('drops the last segment', () => {
    expect(parentPath('src/main')).toBe('src');
    expect(parentPath('~/Documents')).toBe('~');
    expect(parentPath('/Users/me')).toBe('/Users');
  });

  it('stops at the filesystem root', () => {
    expect(parentPath('/Users')).toBe('/');
    expect(parentPath('/')).toBeNull();
  });

  it('has no parent for a single relative segment', () => {
    expect(parentPath('src')).toBeNull();
    expect(parentPath('~')).toBeNull();
  });
});

describe('isPathQueryText', () => {
  it('ends at whitespace', () => {
    expect(isPathQueryText('comp')).toBe(true);
    expect(isPathQueryText('main/ip')).toBe(true);
    expect(isPathQueryText(' ')).toBe(false);
    expect(isPathQueryText('comp more')).toBe(false);
  });
});

describe('isLeadingSlashCommand', () => {
  it('treats a leading slash without a second slash as a command', () => {
    expect(isLeadingSlashCommand('/com')).toBe(true);
    expect(isLeadingSlashCommand('/tmp')).toBe(true);
    expect(isLeadingSlashCommand('/')).toBe(true);
  });

  it('treats a leading absolute path as a path', () => {
    expect(isLeadingSlashCommand('/Users/me')).toBe(false);
    expect(isLeadingSlashCommand('/usr/local')).toBe(false);
  });

  it('ignores tokens that do not start with a slash', () => {
    expect(isLeadingSlashCommand('src/foo')).toBe(false);
    expect(isLeadingSlashCommand('~/foo')).toBe(false);
  });
});
