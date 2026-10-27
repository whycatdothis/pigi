import { describe, expect, it } from 'vitest';
import { isFenceClosed } from './markdownFence';

/**
 * The line numbers here are the ones a markdown parser reports for a code block:
 * the line its fence opens on, and the last line the block covers, which is the
 * closing fence once there is one and the end of the text while the block is
 * still being written.
 */
describe('isFenceClosed', () => {
  it('is closed when the last line of the block is a fence', () => {
    const source = ['before', '```mermaid', 'flowchart TD', '  A --> B', '```', 'after'].join('\n');
    expect(isFenceClosed(source, 2, 5)).toBe(true);
  });

  it('is open while the block runs to the end of the text', () => {
    const source = ['```mermaid', 'flowchart TD', '  A --> B'].join('\n');
    expect(isFenceClosed(source, 1, 3)).toBe(false);
  });

  it('is open when the text ends on the line after the last code line', () => {
    const source = '```mermaid\nflowchart TD\n  A --> B\n';
    expect(isFenceClosed(source, 1, 4)).toBe(false);
  });

  it('does not treat an opening fence as its own closer', () => {
    // The failure this exists for: the message ends on ```mermaid, which the
    // parser reports as a one-line block of its own. Matching it would draw an
    // empty diagram and take the source off the screen.
    expect(isFenceClosed('```mermaid', 1, 1)).toBe(false);
    expect(isFenceClosed('```mermaid\n', 1, 1)).toBe(false);
    expect(isFenceClosed('```mermaid\nA --> B\n```mermaid', 3, 3)).toBe(false);
  });

  it('does not let a longer or different run close a fence', () => {
    // A four-backtick line does not close a three-backtick block, and a fence of
    // the other kind never closes anything.
    expect(isFenceClosed('````mermaid\nA --> B\n```', 1, 3)).toBe(false);
    expect(isFenceClosed('```mermaid\nA --> B\n~~~', 1, 3)).toBe(false);
    // The other way round is CommonMark: the closer may be longer.
    expect(isFenceClosed('```mermaid\nA --> B\n````', 1, 3)).toBe(true);
    expect(isFenceClosed('~~~mermaid\nA --> B\n~~~~~', 1, 3)).toBe(true);
  });

  it('accepts tildes and indentation, as CommonMark does', () => {
    expect(isFenceClosed('~~~mermaid\nflowchart TD\n~~~', 1, 3)).toBe(true);
    expect(isFenceClosed('  ```mermaid\nflowchart TD\n  ```', 1, 3)).toBe(true);
    expect(isFenceClosed('  ```mermaid\nflowchart TD\n ```', 1, 3)).toBe(true);
  });

  it('accepts a fence indented by the list it sits in', () => {
    const source = ['- step one:', '', '      ```mermaid', '      A --> B', '      ```'].join('\n');
    expect(isFenceClosed(source, 3, 5)).toBe(true);
    // The list marker on the fence's own line counts as its indent too.
    expect(isFenceClosed('- ```mermaid\n  A --> B\n  ```', 1, 3)).toBe(true);
  });

  it('is open for an indented code block, which has no fence of its own', () => {
    expect(isFenceClosed('    flowchart TD\n      A --> B', 1, 2)).toBe(false);
  });

  it('is open for a line number outside the text', () => {
    expect(isFenceClosed('```mermaid\nflowchart TD', 1, 9)).toBe(false);
    expect(isFenceClosed('```mermaid\nflowchart TD', 0, 2)).toBe(false);
    expect(isFenceClosed('```mermaid\nflowchart TD', 1, 1.5)).toBe(false);
  });
});
