/**
 * Line breaks for a timeline's descriptions.
 *
 * Mermaid's timeline wraps a label on whitespace only, so a description with no
 * space in it — a Chinese sentence, a long identifier — never wraps: it stays on
 * one line, wider than the column it is centred in, and runs into the label of
 * the next column. A `<br>` is a line to that wrapper and the row grows to hold
 * the lines, so the breaks are put into the source here, before it is drawn.
 */

/** The narrowest column mermaid gives a timeline label, in the units it draws in. */
const COLUMN_WIDTH = 150;

/** How wide a label's text is in those units; measured by the renderer. */
export type LabelMeasurer = (text: string) => number;

/** Marks that close something: a line that starts with one is torn from its text. */
const CLOSING_MARKS = '、。，．；：？！）］｝」』》〉】〕”’·…)]},.;:!?';
/** Marks that open something, which must not be left at the end of a line. */
const OPENING_MARKS = '（［｛「『《〈【〔“‘([{';
/** What a word is made of, for not cutting one in half. */
const WORD = /[\w.+-]/;

const TIMELINE_START = /^\s*timeline\b/;
const NOT_A_DESCRIPTION = /^\s*(?:title|section|accTitle|accDescr)\b/;
const ACCESSIBILITY_DESCRIPTION = /^\s*accDescr\s*\{\s*$/;
const ACCESSIBILITY_END = /}\s*$/;
const SEPARATOR = /(:)/;

/**
 * A timeline's descriptions, broken into lines that fit the column mermaid gives
 * them. Every other diagram, and every other line of a timeline, is left as it
 * was.
 */
export function breakTimelineLabels(code: string, measure: LabelMeasurer): string {
  const lines = code.split('\n');
  const start = diagramStart(lines);
  if (start === -1 || !TIMELINE_START.test(lines[start] ?? '')) return code;

  let inAccessibilityDescription = false;
  return lines
    .map((line, index) => {
      if (index <= start) return line;
      if (ACCESSIBILITY_DESCRIPTION.test(line)) {
        inAccessibilityDescription = true;
        return line;
      }
      if (inAccessibilityDescription) {
        inAccessibilityDescription = !ACCESSIBILITY_END.test(line);
        return line;
      }
      return breakDescriptions(line, measure);
    })
    .join('\n');
}

/**
 * One description, with the `<br>`es it needs. Exported for its rules: where a
 * line may end, and which words stay whole.
 */
export function wrapLabel(text: string, measure: LabelMeasurer): string {
  const body = text.trim();
  if (body === '') return text;

  const wrapped = body
    .replace(/<br\s*\/?>/gi, '<br>')
    .split('<br>')
    .map((line) => fitLines(line.trim(), measure))
    .join('<br>');
  // The whitespace around a description is the source's, and the rewrite only
  // adds breaks: a line keeps everything the model wrote around it.
  const start = text.indexOf(body);
  return text.slice(0, start) + wrapped + text.slice(start + body.length);
}

/** The lines a run of text takes, as `<br>` reads. */
function fitLines(text: string, measure: LabelMeasurer): string {
  const lines: string[] = [];
  let line = '';
  for (const glyph of text) {
    // A mark that closes something belongs to the line it closes, even when that
    // line is already as wide as it may be.
    const tooWide = line !== '' && measure(line + glyph) > COLUMN_WIDTH;
    if (tooWide && !CLOSING_MARKS.includes(glyph)) {
      lines.push(line);
      line = glyph;
    } else {
      line += glyph;
    }
  }
  lines.push(line);
  keepLinesReadable(lines);
  return lines.join('<br>');
}

/**
 * Move glyphs across the breaks that landed badly: an opening mark goes with what
 * it opens, and a word a break would cut in half moves down whole — unless that
 * would leave a mark that opens something at the end of the line.
 */
function keepLinesReadable(lines: string[]): void {
  for (let index = 0; index + 1 < lines.length; index += 1) {
    let head = lines[index] ?? '';
    let tail = lines[index + 1] ?? '';

    while (head.length > 1 && OPENING_MARKS.includes(head[head.length - 1] ?? '')) {
      tail = (head[head.length - 1] ?? '') + tail;
      head = head.slice(0, -1);
    }

    const word = /[\w.+-]*$/.exec(head)?.[0] ?? '';
    const rest = head.slice(0, -word.length);
    const stranded = OPENING_MARKS.includes(rest[rest.length - 1] ?? '');
    if (word !== '' && rest !== '' && !stranded && WORD.test(tail.slice(0, 1))) {
      head = rest;
      tail = word + tail;
    }

    lines[index] = head.trimEnd();
    lines[index + 1] = tail.trimStart();
  }
}

/** A timeline line is `period : description : description`; each is a label. */
function breakDescriptions(line: string, measure: LabelMeasurer): string {
  const trimmed = line.trimStart();
  if (trimmed === '' || trimmed.startsWith('%%') || NOT_A_DESCRIPTION.test(line)) return line;

  const parts = line.split(SEPARATOR);
  if (parts.length < 3) return line;
  return parts
    .map((part, index) => (index > 0 && index % 2 === 0 ? wrapLabel(part, measure) : part))
    .join('');
}

/** The line the diagram itself starts on, below any front matter or directive. */
function diagramStart(lines: string[]): number {
  let index = 0;
  if ((lines[0] ?? '').trim() === '---') {
    const end = lines.findIndex((line, at) => at > 0 && line.trim() === '---');
    if (end === -1) return -1;
    index = end + 1;
  }

  for (; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').trim();
    if (line === '' || line.startsWith('%%')) continue;
    return index;
  }
  return -1;
}
