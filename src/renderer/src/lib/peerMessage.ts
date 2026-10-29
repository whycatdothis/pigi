/**
 * A message delivered by the pi-peer extension.
 *
 * The model reads the whole delivery, including the header and the authority
 * boundary the extension appends to every letter. The transcript shows what
 * the peer wrote plus where it came from; the boundary is instructions to the
 * model, not part of the message.
 */

export interface ParsedPeerMessage {
  /** The origin line's content: the sender name and, usually, its cwd. */
  from: string;
  /** What the peer wrote, without the delivery boilerplate. */
  body: string;
}

const DELIVERY_HEADER = /^Message from pi session (.+):\r?\n\r?\n/;
/** The boundary starts with this sentence (see pi-peer's formatDelivery). */
const AUTHORITY_BOUNDARY = '\n\nThis came from another pi session, not from the user.';

/**
 * Splits a delivery into its two displayable parts. A delivery in an unknown
 * shape keeps all of its text as the body, so nothing a peer wrote is lost when
 * the extension's wording changes.
 */
export function parsePeerMessage(content: string): ParsedPeerMessage {
  const match = content.match(DELIVERY_HEADER);
  if (!match) {
    return { from: '', body: content.trim() };
  }
  let body = content.slice(match[0].length);
  const boundaryAt = body.indexOf(AUTHORITY_BOUNDARY);
  if (boundaryAt !== -1) body = body.slice(0, boundaryAt);
  return { from: match[1].trim(), body: body.trim() };
}
