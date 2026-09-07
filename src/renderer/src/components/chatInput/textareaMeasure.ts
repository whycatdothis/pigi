const TEXTAREA_MAX_HEIGHT_RATIO = 0.35;

export function resizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  const maxHeight = window.innerHeight * TEXTAREA_MAX_HEIGHT_RATIO;
  textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
}

/**
 * Measure the visual (soft-wrapped) line the caret sits on and the total
 * number of visual lines.  Uses a hidden mirror div that replicates the
 * textarea's text-layout properties so word-wrap breaks are counted.
 */
export function getVisualLineInfo(textarea: HTMLTextAreaElement): {
  caretLine: number;
  totalLines: number;
} {
  const computed = getComputedStyle(textarea);
  let lineHeight = parseFloat(computed.lineHeight);
  if (Number.isNaN(lineHeight) || lineHeight <= 0) {
    lineHeight = parseFloat(computed.fontSize) * 1.2;
  }

  const contentWidth =
    textarea.clientWidth - parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight);

  const mirror = document.createElement('div');
  mirror.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'white-space:pre-wrap;overflow-wrap:break-word;' +
    `width:${contentWidth}px;font:${computed.font};` +
    `letter-spacing:${computed.letterSpacing};` +
    `line-height:${computed.lineHeight};` +
    'padding:0;border:none;margin:0;box-sizing:content-box';

  // Full text -> total visual lines
  mirror.textContent = textarea.value || '\u200b';
  document.body.appendChild(mirror);
  const totalLines = Math.max(1, Math.round(mirror.scrollHeight / lineHeight));

  // Text up to caret + zero-width marker -> caret visual line
  mirror.textContent = textarea.value.slice(0, textarea.selectionStart);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  const caretLine = Math.round(marker.offsetTop / lineHeight);

  document.body.removeChild(mirror);
  return { caretLine, totalLines };
}
