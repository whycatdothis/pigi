/**
 * A message an extension injected into the transcript (`role: 'custom'`).
 *
 * Extensions shape these themselves, so only one envelope is known here: the
 * letter pi-peer wraps around a delivery. Stripping it lets the card show what
 * the peer wrote, and keeps the authority boundary — instructions addressed to
 * the model, not part of the message — out of sight. Any other shape keeps all
 * of its text as the body, so nothing an extension injected is lost when its
 * wording changes.
 */

export interface ParsedCustomMessage {
  /** The origin line's content when a known envelope was stripped. */
  from: string;
  /** What the card shows as the message. */
  body: string;
}

const DELIVERY_HEADER = /^Message from pi session (.+):\r?\n\r?\n/;
/** The boundary starts with this sentence (see pi-peer's formatDelivery). */
const AUTHORITY_BOUNDARY = '\n\nThis came from another pi session, not from the user.';
/** The reply hint follows the boundary on the next line; used alone if the
 *  boundary sentence is reworded. */
const REPLY_HINT = '\nReply with message_peer(';

export function parseCustomMessage(content: string): ParsedCustomMessage {
  const match = content.match(DELIVERY_HEADER);
  if (!match) {
    return { from: '', body: content.trim() };
  }
  let body = content.slice(match[0].length);
  const boundaryAt = body.indexOf(AUTHORITY_BOUNDARY);
  if (boundaryAt !== -1) body = body.slice(0, boundaryAt);
  const replyAt = body.indexOf(REPLY_HINT);
  if (replyAt !== -1) body = body.slice(0, replyAt);
  return { from: match[1].trim(), body: body.trim() };
}
