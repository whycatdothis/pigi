/** Each open quote comment editor's save of its changed comment. */
export const openQuoteEditorSaves = new Set<() => void>();

/** Saves every open editor's changed comment, so Send includes what they hold. */
export function saveOpenQuoteEditors(): void {
  for (const save of [...openQuoteEditorSaves]) {
    save();
  }
}
