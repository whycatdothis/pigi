import { describe, expect, it } from 'vitest';
import { breakTimelineLabels, wrapLabel, type LabelMeasurer } from './mermaidTimelineLabels';

/** Ten units a glyph, so a 150-unit column holds fifteen of them. */
const measure: LabelMeasurer = (text) => [...text].length * 10;

/** A description's worth of text with no spaces in it: one "word" to mermaid. */
const UNBROKEN = 'Supercalifragilisticexpialidocious';

function lines(label: string): string[] {
  return wrapLabel(label, measure).split('<br>');
}

describe('wrapLabel', () => {
  it('breaks a description that is wider than its column', () => {
    const wrapped = lines(UNBROKEN);

    expect(wrapped).toEqual(['Supercalifragil', 'isticexpialidoc', 'ious']);
    expect(wrapped.join('')).toBe(UNBROKEN);
  });

  it('leaves a description that already fits on one line', () => {
    expect(wrapLabel('week 1', measure)).toBe('week 1');
    expect(wrapLabel('ShipOneRelease', measure)).toBe('ShipOneRelease');
  });

  it('never starts a line with a mark that closes something', () => {
    // Fifteen glyphs fill a line exactly, so the comma lands on the next one,
    // where it would read as the start of a line instead of the end of a phrase.
    const text = `${'a'.repeat(15)},${'b'.repeat(5)}`;
    const wrapped = lines(text);

    expect(wrapped.some((line) => line.startsWith(','))).toBe(false);
    expect(wrapped.join('')).toBe(text);
  });

  it('keeps a mark that closes the description on the line it closes', () => {
    // Nothing follows the mark, so a line of its own would hold only the mark.
    const text = `${'a'.repeat(15)},`;

    expect(lines(text)).toEqual([text]);
  });

  it('never ends a line with a mark that opens something', () => {
    // The opening mark lands on the end of the first line, and the word after it
    // is long enough to be carried over: carrying it would leave the mark alone.
    const text = `${'a'.repeat(14)}(${'b'.repeat(20)}`;
    const wrapped = lines(text);

    expect(wrapped.some((line) => line.endsWith('('))).toBe(false);
    expect(wrapped.join('')).toBe(text);
  });

  it('does not cut a word in half', () => {
    // Twelve letters and a space fill most of the line, so the break would land
    // inside the word after it. The word moves down whole instead.
    expect(lines('xxxxxxxxxxxx abcdefgh')).toEqual(['xxxxxxxxxxxx', 'abcdefgh']);
  });

  it('keeps the line breaks a description already has', () => {
    expect(wrapLabel('first<br/>second', measure)).toBe('first<br>second');
    expect(wrapLabel('first<br>second', measure)).toBe('first<br>second');
  });
});

describe('breakTimelineLabels', () => {
  it('breaks the descriptions of a timeline and leaves its lines alone', () => {
    const code = [
      'timeline',
      '    title ShipOneRelease',
      '    section Preparation',
      `        week 1 : ${UNBROKEN}`,
      '        week 2 : short',
    ].join('\n');

    const broken = breakTimelineLabels(code, measure).split('\n');
    expect(broken[0]).toBe('timeline');
    expect(broken[1]).toBe('    title ShipOneRelease');
    expect(broken[2]).toBe('    section Preparation');
    expect(broken[3]).toBe('        week 1 : Supercalifragil<br>isticexpialidoc<br>ious');
    expect(broken[4]).toBe('        week 2 : short');
  });

  it('breaks every description of a line that has more than one', () => {
    const broken = breakTimelineLabels(`timeline\n    week 1 : ${UNBROKEN} : ${UNBROKEN}`, measure);
    expect(broken.match(/<br>/g)?.length).toBe(4);
    expect(broken.startsWith('timeline\n    week 1 : ')).toBe(true);
  });

  it('leaves a colon inside a description where it was', () => {
    const code = 'timeline\n    week 1 : ratio 1:1';
    const broken = breakTimelineLabels(code, measure);

    expect(broken).toBe(code);
    expect(broken.split(':').length).toBe(code.split(':').length);
  });

  it('leaves a description with no text after it as it was', () => {
    const code = 'timeline\n    week 1 :\n    week 2 : short';
    expect(breakTimelineLabels(code, measure)).toBe(code);
  });

  it('leaves an accessibility description alone', () => {
    const code = [
      'timeline',
      '    accDescr { A description long enough to need breaking }',
      '    week 1 : short',
    ].join('\n');
    expect(breakTimelineLabels(code, measure)).toBe(code);
  });

  it('leaves another diagram alone', () => {
    const code = `flowchart TD\n  A[${UNBROKEN}] --> B`;
    expect(breakTimelineLabels(code, measure)).toBe(code);
  });

  it('finds the timeline below front matter and a directive', () => {
    const code = [
      '---',
      'title: A release',
      '---',
      '%%{init: {"theme": "dark"}}%%',
      'timeline',
      `    week 1 : ${UNBROKEN}`,
    ].join('\n');

    const broken = breakTimelineLabels(code, measure);
    expect(broken).toContain('%%{init: {"theme": "dark"}}%%');
    expect(broken.split('\n')[5]).toContain('<br>');
  });
});
