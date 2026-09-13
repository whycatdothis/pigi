import { describe, expect, it } from 'vitest';
import { isFenceClosed } from './markdownFence';

/**
 * The line numbers here are the ones a markdown parser reports for a code block:
 * the last line the block covers, which is the closing fence once there is one
 * and the end of the text while the block is still being written.
 */
describe('isFenceClosed', () => {
  it('is closed when the last line of the block is a fence', () => {
    const source = ['before', '```mermaid', 'flowchart TD', '  A --> B', '```', 'after'].join('\n');
    expect(isFenceClosed(source, 5)).toBe(true);
  });

  it('is open while the block runs to the end of the text', () => {
    const source = ['```mermaid', 'flowchart TD', '  A --> B'].join('\n');
    expect(isFenceClosed(source, 3)).toBe(false);
  });

  it('is open when the text ends on the line after the last code line', () => {
    const source = '```mermaid\nflowchart TD\n  A --> B\n';
    expect(isFenceClosed(source, 4)).toBe(false);
  });

  it('accepts tildes and indentation, as CommonMark does', () => {
    expect(isFenceClosed('~~~mermaid\nflowchart TD\n~~~', 3)).toBe(true);
    expect(isFenceClosed('  ```mermaid\nflowchart TD\n  ```', 3)).toBe(true);
  });

  it('is open for an indented code block, which has no fence of its own', () => {
    expect(isFenceClosed('    flowchart TD\n      A --> B', 2)).toBe(false);
  });

  it('is open for a line number outside the text', () => {
    expect(isFenceClosed('```mermaid\nflowchart TD', 9)).toBe(false);
    expect(isFenceClosed('```mermaid\nflowchart TD', 0)).toBe(false);
    expect(isFenceClosed('```mermaid\nflowchart TD', 1.5)).toBe(false);
  });
});
