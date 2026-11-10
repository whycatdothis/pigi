import {
  type TranscriptNode,
  type AssistantNode,
  type SystemNode,
  type ToolNode,
  getCodemodeDetails,
  getEditDiffDetails,
  getToolArgs,
} from '../state/transcriptController';
import { cleanToolOutput, getCodemodeScript } from './toolDisplay';
import type { RenderItem } from './readGrouping';
import {
  BLOCK_CONTENT_MAX_HEIGHT,
  CODEMODE_SCRIPT_MAX_HEIGHT,
  CUSTOM_MESSAGE_MAX_HEIGHT,
  READ_GROUP_MAX_COLLAPSED_ENTRIES,
  TOOL_BLOCK_LINE_HEIGHT,
} from './layoutConstants';
import { getToolBlockBodyHeightRange } from './toolDisplay';
import { parseSkillBlock } from './skillBlock';

/** Tool block chrome around the body: border, header padding, status row,
 *  and the hover toolbar below the card. */
const TOOL_BLOCK_CHROME_HEIGHT = 56;
/** The "Show more" row, present only when the body is clamped. */
const TOOL_BLOCK_SHOW_MORE_HEIGHT = 20;
/** An injected message card: the mono header row plus the card's padding. */
const CUSTOM_CARD_CHROME_HEIGHT = 38;
/** Deliberately conservative: mono lines hold more, and over-estimating a row
 *  costs less than a scroll jump from under-estimating it. */
const ESTIMATE_CHARS_PER_LINE = 84;
const TOOL_BLOCK_COMMAND_LINE_HEIGHT = 20;
const USER_MESSAGE_TOOLBAR_HEIGHT = 24;
const USER_MESSAGE_LEADING_PADDING = 24;
const USER_MESSAGE_TRAILING_PADDING = 8;
const USER_MESSAGE_WRAP_ESTIMATE_WIDTH = 72;
/** Conservative estimate cap for the user bubble's reduced viewport clamp. */
const USER_MESSAGE_MAX_ESTIMATE_HEIGHT = 200;
/** Markdown body: --text-body at 1.5, not the mono TOOL_BLOCK_LINE_HEIGHT. */
const CUSTOM_BODY_LINE_HEIGHT = 24;
/** One row of 64px image thumbnails and the 8px gap above it. */
const CUSTOM_IMAGE_ROW_HEIGHT = 72;

const COLLAPSED_GROUP_TRIGGER_HEIGHT = 28;
const COLLAPSED_GROUP_COMMAND_LINE_HEIGHT = 16;
/** The "Show more" / "Show less" toggle row present when entries are hidden. */
const COLLAPSED_GROUP_SHOW_MORE_HEIGHT = 20;

export function estimateRenderItemHeight(item: RenderItem | undefined): number {
  if (!item) return 96;
  if (item.type === 'readGroup') {
    const visibleLines = Math.min(item.entries.length, READ_GROUP_MAX_COLLAPSED_ENTRIES);
    const showMoreRow =
      item.entries.length > READ_GROUP_MAX_COLLAPSED_ENTRIES ? COLLAPSED_GROUP_SHOW_MORE_HEIGHT : 0;
    return (
      COLLAPSED_GROUP_TRIGGER_HEIGHT +
      visibleLines * COLLAPSED_GROUP_COMMAND_LINE_HEIGHT +
      showMoreRow
    );
  }
  return estimateNodeHeight(item.node);
}

function estimateNodeHeight(node: TranscriptNode | undefined): number {
  if (!node) {
    return 96;
  }
  switch (node.role) {
    case 'user':
      return estimateUserHeight(node.text);
    case 'assistant':
      return estimateAssistantHeight(node);
    case 'tool':
      return estimateToolHeight(node);
    case 'system':
      return node.kind === 'custom' ? estimateCustomHeight(node) : 56;
  }
}

function estimateCustomHeight(node: SystemNode): number {
  const text = node.detail ?? '';
  // Markdown reflows what the source counts — soft wraps merge into one
  // paragraph, lists and headings take more than their source lines — so this
  // proxy is generous on purpose rather than accurate.
  const lineCount = Math.max(countLines(text), Math.ceil(text.length / ESTIMATE_CHARS_PER_LINE));
  const bodyHeight = lineCount * CUSTOM_BODY_LINE_HEIGHT;
  const visibleBody = Math.min(bodyHeight, CUSTOM_MESSAGE_MAX_HEIGHT);
  const showMore = bodyHeight > CUSTOM_MESSAGE_MAX_HEIGHT ? TOOL_BLOCK_SHOW_MORE_HEIGHT : 0;
  const images = node.imageSources?.length ? CUSTOM_IMAGE_ROW_HEIGHT : 0;
  return CUSTOM_CARD_CHROME_HEIGHT + visibleBody + showMore + images;
}

function estimateUserHeight(text: string): number {
  if (parseSkillBlock(text)) {
    return 88;
  }
  const visibleLineCount = countLines(text);
  const characterLineCount = Math.ceil(text.length / USER_MESSAGE_WRAP_ESTIMATE_WIDTH);
  const estimatedLineCount = Math.max(visibleLineCount, characterLineCount);
  const rawHeight =
    estimatedLineCount * 24 +
    20 +
    USER_MESSAGE_TOOLBAR_HEIGHT +
    USER_MESSAGE_LEADING_PADDING +
    USER_MESSAGE_TRAILING_PADDING;
  return Math.max(56, Math.min(rawHeight, USER_MESSAGE_MAX_ESTIMATE_HEIGHT));
}

function estimateAssistantHeight(node: AssistantNode): number {
  const thinkingLineCap = Math.ceil(BLOCK_CONTENT_MAX_HEIGHT / 20) + 4; // lines + header slack
  const thinkingLineCount = Math.min(countLines(node.thinking), thinkingLineCap);
  const textLength =
    node.text.length + Math.min(node.thinking.length, thinkingLineCap * ESTIMATE_CHARS_PER_LINE);
  const lineCount = countLines(node.text) + thinkingLineCount;
  return Math.max(
    80,
    Math.max(Math.ceil(textLength / ESTIMATE_CHARS_PER_LINE), lineCount) * 24 + 56,
  );
}

function estimateToolHeight(node: ToolNode): number {
  const { minHeight = 0, maxHeight } = getToolBlockBodyHeightRange(node);
  const contentHeight = estimateToolBodyLineCount(node) * TOOL_BLOCK_LINE_HEIGHT;
  // An unclamped body takes its content's height, and shows no Show more.
  const bodyHeight =
    maxHeight === undefined
      ? contentHeight
      : Math.min(Math.max(contentHeight, minHeight), maxHeight);
  const showMoreHeight =
    maxHeight !== undefined && contentHeight > maxHeight ? TOOL_BLOCK_SHOW_MORE_HEIGHT : 0;
  return (
    estimateToolCommandLineCount(node) * TOOL_BLOCK_COMMAND_LINE_HEIGHT +
    bodyHeight +
    showMoreHeight +
    TOOL_BLOCK_CHROME_HEIGHT
  );
}

function estimateToolBodyLineCount(node: ToolNode): number {
  if (node.name === 'edit') {
    return countLines(getEditDiffDetails(node)?.diff ?? '');
  }
  if (node.name === 'write') {
    const content = getToolArgs(node)?.content;
    return countLines(typeof content === 'string' ? content : '');
  }
  if (node.name === 'codemode') {
    const script = getCodemodeScript(node);
    const calls = getCodemodeDetails(node)?.calls.length ?? 0;
    // The card shows the tail of the script, at most CODEMODE_SCRIPT_MAX_HEIGHT
    // of it, and the output without codemode's own header lines.
    const scriptLines = Math.min(
      script ? countLines(script) : 0,
      Math.floor(CODEMODE_SCRIPT_MAX_HEIGHT / TOOL_BLOCK_LINE_HEIGHT),
    );
    return scriptLines + calls + countLines(cleanToolOutput(node));
  }
  return countLines(node.output ?? '');
}

function countLines(text: string): number {
  if (!text) {
    return 0;
  }
  return text.split('\n').length;
}

function estimateToolCommandLineCount(node: ToolNode): number {
  const args = getToolArgs(node);
  const command =
    node.name === 'bash'
      ? `$ ${String(args?.command ?? '')}`
      : node.name === 'read' || node.name === 'write' || node.name === 'edit'
        ? `${node.name} ${String(args?.path ?? '')}`
        : String(JSON.stringify(args ?? {}) ?? '');

  return Math.min(2, Math.max(1, Math.ceil(command.length / 80)));
}
