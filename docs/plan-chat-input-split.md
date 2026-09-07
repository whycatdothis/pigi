# Plan: split `ChatInput.tsx`

## Goal

`src/renderer/src/components/ChatInput.tsx` is 1131 lines. Split it into a `components/chatInput/` directory (same pattern as `components/sidebar/`) plus one hook, with **zero behavior change**.

## Non-goals

- No visual/behavioral change. Every className, `data-testid`, placeholder string, keyboard behavior, focus behavior must stay identical.
- No new features, no renamed props on `ChatInput`.
- Do not extract slash-command _state_ into a hook (only its JSX). It is tightly coupled to `handleKeyDown` / `handleSend`.
- Do not touch `lib/slashCommands.ts`.

## Rules (from AGENTS.md, repeated because they matter here)

- Use `read` + `edit`/`write`; never `sed`.
- camelCase file names.
- No `any`, no `as`, no inline `import()`.
- No magic strings: keep every existing constant; move it to the file that uses it.
- No abbreviated names in new code (`command` not `cmd`, `index` not `i` is fine to keep where it already exists, but new identifiers must be full words).
- Run `npm run check` at the end and read the full output.
- Do not commit.

## Target file layout

```
src/renderer/src/components/chatInput/
  index.tsx                 ChatInput default export + ChatInputHandle + ChatInputProps
  slashCommandPopover.tsx   SlashCommandPopover (new wrapper) + SlashCommandItem
  modelSettingsPicker.tsx   ModelSettingsPicker + ModelSettingsButton + ThinkingLevelFlyout
  projectPicker.tsx         ProjectPicker
  contextUsageTooltip.tsx   ContextUsageTooltip
  formatters.ts             pure format helpers + their constants
  textareaMeasure.ts        resizeTextarea + getVisualLineInfo
src/renderer/src/hooks/
  useInputHistory.ts        shell-style up/down history recall
```

Delete `src/renderer/src/components/ChatInput.tsx` after everything is moved.

Only external importer: `src/renderer/src/App.tsx` line 62:

```ts
import ChatInput, { type ChatInputHandle } from './components/ChatInput';
```

Change to `'./components/chatInput'`. Nothing else imports from this file (`StreamingQueue.tsx` only mentions it in comments).

---

## Step 1: `textareaMeasure.ts`

Move verbatim:

- `TEXTAREA_MAX_HEIGHT_RATIO`
- `resizeTextarea(textarea)`
- `getVisualLineInfo(textarea)`

Export both functions. No changes.

## Step 2: `formatters.ts`

Move verbatim, all exported:

Constants:

- `TOKEN_UNIT`, `TOKEN_SUFFIX`, `UNKNOWN_STATUS`, `MODEL_OPTION_KEY_SEPARATOR`, `CONTEXT_USAGE_UNAVAILABLE`, `AUTO_COMPACT_LABEL`

Functions:

- `modelOptionKey`, `modelSearchValue`, `formatModelDetails`
- `formatContextUsage`, `formatContextWindow`, `formatUsedContext`, `formatAutoCompactExplanation`
- `formatPercent`, `formatTokenCount`

`UNKNOWN_STATUS` is used by both `index.tsx` (git branch fallback) and the format helpers, so it lives here and is exported.

## Step 3: `contextUsageTooltip.tsx`

Move `ContextUsageTooltip` verbatim. Imports `formatContextWindow`, `formatUsedContext`, `formatAutoCompactExplanation` from `./formatters`. Export as named export.

## Step 4: `projectPicker.tsx`

Move `ProjectPicker` verbatim (it uses `fuzzysort`, `IconChevronDown`, `IconFolderOpen`, `Command*`, `Popover*`, `cn`). Named export. Its two inline strings `'Search projects'` and `'No projects found'` are existing magic strings; lift them to module constants `PROJECT_SEARCH_PLACEHOLDER` / `PROJECT_EMPTY_TEXT` in this file (mirrors the existing `MODEL_SEARCH_PLACEHOLDER` / `MODEL_EMPTY_TEXT` pattern).

## Step 5: `modelSettingsPicker.tsx`

Move verbatim:

- constants `MODEL_SEARCH_PLACEHOLDER`, `MODEL_EMPTY_TEXT`, `MODEL_LIST_MAX_HEIGHT_CLASS`, `THINKING_MENU_LABEL`
- `ModelSettingsPicker` (named export)
- `ModelSettingsButton` (module-private)
- `ThinkingLevelFlyout` (module-private)

Imports `modelOptionKey`, `modelSearchValue`, `formatModelDetails` from `./formatters`.

## Step 6: `slashCommandPopover.tsx`

Two things here.

### 6a. Move `SlashCommandItem` verbatim (module-private).

### 6b. New `SlashCommandPopover` component

Extract the entire `<Popover open={hasSlashMatches} ...>` block from the main JSX, **including the `PopoverTrigger asChild` wrapping `children`**. The trigger wraps the whole input group, so this component must accept `children`.

Also move into this component the "scroll selected item into view" effect (the `useEffect` that uses `slashListRef`, currently lines ~163-181 of the original) — `slashListRef` is only used there and in the popover JSX, so it belongs here.

```ts
interface SlashCommandPopoverProps {
  matches: SlashCommandMatches; // { builtin: SlashCommand[]; skill: SlashCommand[] }
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (flatIndex: number) => void;
  onDismiss: () => void; // called from Popover onOpenChange(false)
  children: React.ReactNode; // the PopoverTrigger content
}
```

Export a `SlashCommandMatches` type (or reuse whatever `matchSlashCommands` returns — check `lib/slashCommands.ts`; if it already exports a matching type, use it instead of defining a new one).

Export a constant `EMPTY_SLASH_MATCHES: SlashCommandMatches = { builtin: [], skill: [] }` — the original code inlines `{ builtin: [], skill: [] }` six times. Note: sharing one frozen object as a state value is fine here because the component only reads lengths / maps over it; `setSlashMatches(EMPTY_SLASH_MATCHES)` when already empty is a no-op re-render, same as before functionally (previously a new object each time caused a re-render; now it may skip one — this is not a behavior change the user can observe).

Inside, `open` is derived: `matches.builtin.length > 0 || matches.skill.length > 0`.

The builtin list and skill list both currently have an identical inline `onSelect` (set textarea to `/${name} `, clear matches, focus). Collapse both into calling `onSelect(slashCommand)`; the parent supplies the single implementation.

Keep `Separator` between groups, `PopoverContent` props (`side="top"`, `align="start"`, `sideOffset={6}`, className, `style width CHAT_INPUT_MAX_WIDTH`, `onOpenAutoFocus preventDefault`) exactly as-is.

## Step 7: `hooks/useInputHistory.ts`

Extract the shell-style history recall. Currently it is spread across:

- refs `historyIndexRef`, `savedDraftRef`
- `resetHistoryRecall`
- `applyHistoryEntry`
- the `ArrowUp` / `ArrowDown` branches inside `handleKeyDown`
- the "typing exits history recall" block at the top of `handleInput`
- the "which value to save as draft" ternary inside the per-session draft effect

Signature:

```ts
export function useInputHistory(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  userHistory: string[],
): {
  /** Exit recall mode and drop the saved draft. Call on send, session switch, programmatic restore. */
  reset: () => void;
  /** Call from onInput before anything else; keeps edited text as current draft. */
  handleTyping: () => void;
  /**
   * The text that should be persisted as the session draft: the textarea value
   * when not recalling, otherwise the draft saved before recall started.
   */
  getDraftForSave: () => string;
  /**
   * Handle ArrowUp/ArrowDown. Returns true if the event was consumed
   * (preventDefault already called). Returns false to let the caller continue.
   */
  handleArrowKey: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
};
```

Implementation notes:

- `reset`, `handleTyping`, `getDraftForSave` are `useCallback` with `[]` deps (they only touch refs and `textareaRef`).
- `handleArrowKey` depends on `[userHistory, textareaRef]`. It contains the exact logic of the two existing branches, including:
  - `noModifiers` check — **compute it inside the hook**; return `false` if key is not ArrowUp/ArrowDown or modifiers are pressed.
  - the `selectionStart !== selectionEnd` early return
  - `getVisualLineInfo` caret-line checks (import from `../components/chatInput/textareaMeasure`)
  - the `Math.min(historyIndexRef.current, userHistory.length - 1)` clamp
  - the private `applyHistoryEntry(index)` which calls `resizeTextarea` and moves the caret to end
- Return `true` **only** on the paths where the original code called `e.preventDefault()`. On the early-return paths (empty history, caret not on edge line, already at oldest, etc.) return `true` as well when the original code did a bare `return` — because in the original the bare `return` also stopped the Enter handler from running. Check each branch against the original: every path inside `if (e.key === 'ArrowUp' && noModifiers) {...}` and `if (e.key === 'ArrowDown' && noModifiers) {...}` ends in `return`, so the hook returns `true` for any ArrowUp/ArrowDown with no modifiers, regardless of whether it consumed the event. Only when the key is something else or modifiers are held does it return `false`. Document this in a short comment.
- All existing comments that explain _why_ (e.g. "With an active selection the default collapse/caret behavior wins", "At the newest entry, pressing down restores the saved draft") move with the code. Drop comments that merely restate the code.

## Step 8: `index.tsx` (the trimmed `ChatInput`)

Keep:

- `ChatInputHandle`, `ChatInputProps` (exported), all prop destructuring unchanged
- constants `MODEL_FALLBACK`, `THINKING_FALLBACK`, `NEW_SESSION_PLACEHOLDER`, `NEW_SESSION_HEADING`
- `textareaRef`, `useImperativeHandle`
- `draftsRef`, `prevSessionIdRef`, per-session draft effect (now uses `history.getDraftForSave()` and `history.reset()`)
- restoreText effect (uses `history.reset()`, `resizeTextarea`)
- slash state: `slashMatches`, `selectedSlashIndex`, `allSlashCommands`, `flatSlashMatches`, `hasSlashMatches`
- `hashMode` state
- `handleSend`, `handleFollowUpSend`, `handleKeyDown`, `handleInput`
- the outer layout JSX, `ProjectPicker` usage, `InputGroup`, `ModelSettingsPicker` usage, footer (git branch + `ContextUsageTooltip`)

Add one local helper inside the component to remove the 5x repeated "clear input" triple:

```ts
const clearInput = useCallback(() => {
  const textarea = textareaRef.current;
  if (!textarea) return;
  textarea.value = '';
  textarea.style.height = 'auto';
  setSlashMatches(EMPTY_SLASH_MATCHES);
}, []);
```

Use it in `handleSend` (3 places), `handleFollowUpSend`, and the builtin-no-arg branch of `handleKeyDown`. Note: `handleFollowUpSend` and the final fall-through of `handleSend` did **not** previously call `setSlashMatches` — but at that point matches are necessarily empty-or-irrelevant (text is being cleared) and the popover `open` is derived from matches, so clearing is harmless. If you prefer strict equivalence, keep those two sites without the `setSlashMatches` call; either is acceptable, pick one and be consistent.

Add one local helper for "insert command into textarea" (used by both the popover `onSelect` and the Tab/Enter branch in `handleKeyDown`):

```ts
const insertSlashCommand = useCallback((command: SlashCommand) => {
  const textarea = textareaRef.current;
  if (!textarea) return;
  textarea.value = `/${command.name} `;
  setSlashMatches(EMPTY_SLASH_MATCHES);
  textarea.focus();
}, []);
```

Original Tab/Enter branch did not call `.focus()` explicitly in the insert path? Check: it does (`textareaRef.current.focus()`). Good, identical.

`handleKeyDown` after refactor:

```ts
if (e.nativeEvent.isComposing || e.key === 'Process') return;

if (hasSlashMatches) {
  // ArrowUp / ArrowDown / Tab|Enter / Escape branches unchanged,
  // Tab|Enter uses clearInput + onSlashCommand or insertSlashCommand
}

if (history.handleArrowKey(e)) return;

if (e.key === 'Enter' && !e.shiftKey) { ... unchanged ... }
```

`handleInput` after refactor:

```ts
const textarea = textareaRef.current;
if (!textarea) return;
history.handleTyping();
resizeTextarea(textarea);
const value = textarea.value;
setSlashMatches(matchSlashCommands(value, allSlashCommands));
setSelectedSlashIndex(0);
if (isNewSession) { ... hash detection unchanged ... }
```

Hash detection: the existing `textBeforeCursor.match(/^#$/)` then `if/else setHashMode` can be simplified to `setHashMode(textBeforeCursor === '#')` — same semantics, keep the comment.

The JSX wraps the input group in `<SlashCommandPopover matches={slashMatches} selectedIndex={selectedSlashIndex} onSelect={insertSlashCommand} onHover={setSelectedSlashIndex} onDismiss={() => setSlashMatches(EMPTY_SLASH_MATCHES)}>...</SlashCommandPopover>`.

Remove now-unused imports (`fuzzysort`, `IconCheck`, `IconChevronDown`, `IconChevronRight`, `IconFolderOpen`, `Command*`, `Tooltip*`, `Button`, `Separator`, etc.). Lint will flag leftovers.

## Step 9: verify

1. `npm run check` — read the whole output, fix everything.
2. Manual smoke via `pigi-debug` skill (start dev app, CDP):
   - type `/` → popover appears; ArrowUp/Down cycles across builtin + skill groups, selected item scrolls into view; Tab inserts `/name `; Enter on a no-arg builtin executes; Escape closes.
   - type text, ArrowUp recalls previous prompts only when caret on first visual line; ArrowDown returns to draft; typing mid-recall exits recall and keeps edited text.
   - switch sessions: draft is preserved per session, restored on return, input auto-focuses.
   - abort during streaming → `restoreText` merges with current draft.
   - new-session view: type `#` → ProjectPicker opens; select project → `#` removed, git branch refreshed.
   - model picker opens, search works, selected model scrolls to center, Thinking flyout on hover.
   - context usage tooltip shows in non-new-session footer.
3. `rg -n "components/ChatInput'" src` returns nothing.

## Expected sizes (approximate)

| file                                | lines |
| ----------------------------------- | ----- |
| `chatInput/index.tsx`               | ~300  |
| `chatInput/slashCommandPopover.tsx` | ~120  |
| `chatInput/modelSettingsPicker.tsx` | ~260  |
| `chatInput/projectPicker.tsx`       | ~100  |
| `chatInput/contextUsageTooltip.tsx` | ~45   |
| `chatInput/formatters.ts`           | ~70   |
| `chatInput/textareaMeasure.ts`      | ~60   |
| `hooks/useInputHistory.ts`          | ~110  |

## Things that are easy to get wrong

- `handleArrowKey` must return `true` for _every_ unmodified ArrowUp/ArrowDown (see Step 7), otherwise the Enter branch semantics change — not visible for arrow keys, but keep the control flow identical.
- Slash popover ArrowUp/Down must be checked **before** history recall, as today.
- `PopoverTrigger asChild` must still wrap the `div.relative.mx-auto.w-full` that contains InputGroup + footer; the popover anchors to that.
- `onOpenAutoFocus={(e) => e.preventDefault()}` on the slash PopoverContent must stay, or focus leaves the textarea when the list opens.
- The per-session draft effect must call `history.getDraftForSave()` **before** `history.reset()`.
- `ModelSettingsPicker` calls `onRequestModelRefresh` on every open attempt even when `canOpen` is false — keep that.
