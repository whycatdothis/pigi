/**
 * A local draft of a formatted value.
 *
 * Settings fields are edited in place but committed on blur or Enter, so they
 * keep a draft while the committed value comes back from somewhere else: a
 * write that round-trips through the worker, a preset, a reset. The draft must
 * survive those round trips while the user is typing, and reset when the value
 * changed from outside — the two rules that, written out per field, had each
 * copy drifting (one of them resets on every render, another never resets).
 *
 * The reset happens during render, not in an effect: React's "storing
 * information from previous renders" pattern, which avoids the cascading second
 * pass an effect would add. `source` is compared with `isSameSource` (identity
 * by default) — a field whose value is rebuilt as a new array on every snapshot
 * passes a comparison on its content instead.
 */
import { useState } from 'react';

export type DraftSetter<TDraft> = (next: TDraft) => void;

/**
 * @param source the value that owns the field; when it changes, the draft resets
 * @param derive draft from the new source and the draft it replaces, so a list
 *   can keep the identity of rows that are still in the same place
 * @param isSameSource compare by content where the source is rebuilt each time
 */
export function useDraft<TSource, TDraft>(
  source: TSource,
  derive: (source: TSource, previousDraft: TDraft | undefined) => TDraft,
  isSameSource: (next: TSource, previous: TSource) => boolean = Object.is,
): [draft: TDraft, setDraft: DraftSetter<TDraft>] {
  const [draft, setDraft] = useState<TDraft>(() => derive(source, undefined));
  const [lastSource, setLastSource] = useState(source);

  if (!isSameSource(source, lastSource)) {
    setLastSource(source);
    setDraft(derive(source, draft));
  }

  return [draft, setDraft];
}
