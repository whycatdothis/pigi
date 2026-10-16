/**
 * Strings the recreated UI has to say, lifted from the app so the page and the
 * app cannot drift apart on wording.
 */

/** chatInput/index.tsx */
export const NEW_CHAT_HEADING = 'Here we go!';
export const NEW_CHAT_PLACEHOLDER = 'Type # to quick change project.';
export const FOLLOW_UP_PLACEHOLDER = 'Ask for follow-up changes';

/** thinkingBlock.tsx */
export const THINKING_LABEL = 'Thinking';

/** CollapsedReadGroup.tsx — the compact summary of folded read-only calls. */
export function buildReadGroupLabel(
  isActive: boolean,
  fileCount: number,
  gitCount: number,
  thinkingCount: number,
): string {
  const parts: string[] = [];
  if (fileCount > 0) {
    parts.push(`${isActive ? 'Exploring' : 'Explored'} ${fileCount} ${plural(fileCount, 'file')}`);
  }
  if (gitCount > 0) {
    parts.push(`${isActive ? 'Checking' : 'Checked'} git ${gitCount} ${plural(gitCount, 'time')}`);
  }
  if (thinkingCount > 0) {
    parts.push(
      `${isActive ? 'Thinking' : 'Thought'} ${thinkingCount} ${plural(thinkingCount, 'time')}`,
    );
  }
  if (parts.length === 0) return isActive ? 'Working...' : 'Done';

  const [first, ...rest] = parts;
  const tail = rest.map((part) => part[0].toLowerCase() + part.slice(1));
  return first + (tail.length > 0 ? ', ' + tail.join(', ') : '');
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
