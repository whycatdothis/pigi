/**
 * Session ids are UUIDv7: the first 13 characters (`01a1b9cc-6e5c`) are the
 * creation time in milliseconds, so a shorter prefix is shared by every
 * session made within the same minute or so, like a batch of subagents.
 */
const MINIMUM_LENGTH = 13;

function sharedPrefixLength(left: string, right: string | undefined): number {
  if (right === undefined) return 0;
  let length = 0;
  while (length < left.length && left[length] === right[length]) length++;
  return length;
}

/** Like git's abbreviated hashes: each id cut to the shortest prefix no other given id starts with. */
export function shortIds(ids: readonly string[]): string[] {
  const sorted = [...new Set(ids)].sort();
  const lengths = new Map<string, number>();
  sorted.forEach((id, index) => {
    const shared = Math.max(
      sharedPrefixLength(id, sorted[index - 1]),
      sharedPrefixLength(id, sorted[index + 1]),
    );
    lengths.set(id, Math.max(MINIMUM_LENGTH, shared + 1));
  });
  return ids.map((id) => id.slice(0, lengths.get(id)));
}
