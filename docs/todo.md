# TODO

Follow-ups that were identified but deliberately left out of a branch, because
each one is mechanical or structural enough that mixing it into a feature branch
would make the change hard to review. Delete an entry when it lands; anything
user-visible also adds a line to the CHANGELOG.

## Move the last `rounded-*` scale classes onto role names

`assets/semanticTokens.css` names radius by role, but 88 call sites in 36 files
still use Tailwind's scale: `rounded-md` 43, `rounded-lg` 28, `rounded-sm` 11,
`rounded-xl` 6. Those are shadcn primitives (`designTokens.css`: `--radius-sm:
calc(var(--radius) * 0.6)` and so on), so their size moves whenever `--radius`
moves — the opposite of a role name.

- Map each call site to a role, not to a number: `rounded-inline` for inline
  code and kbd, `rounded-chip` for badges and thumbnails, `rounded-control` and
  `rounded-control-sm` for buttons, inputs, rows and menu items,
  `rounded-surface*` for the transcript and panels.
- Then extend `scripts/checkDesignTokens.mjs` with a rule that rejects
  `rounded-(xs|sm|md|lg|xl|2xl|3xl)` in a class string, keeping `rounded-full`
  and the role names.
- Decide first what to do about `components/ui/` (button, sidebar, command,
  dropdown-menu, context-menu, tabs, tooltip, empty, kbd, skeleton — 35 of the
  call sites): those files come from the shadcn registry, and `shadcn add`
  re-emits scale classes. Either map them and re-map after every add, or list
  them in the check's `ALLOWED` map with that reason.
- Verify with `npm run check`, then by eye through the settings page, the
  sidebar, a long transcript and the composer: the corner system is
  `superellipse(1.5)` on every rounded box, so a wrong tier shows up as a corner
  that no longer matches its neighbour.

## Structural refactors from the settings-branch review

### One `useDraft` hook instead of five copies

The "formatted value + local draft + reset when the value changes externally"
pattern is written out five times: `settingsControls.tsx` (`TextField` and
`StringListField`), `appearanceControls.tsx` (the hex field and the numeric
field), and `themeFileActions.tsx`. They differ only in parsing and commit. One
`hooks/useDraft.ts` with a test for the external-change reset removes the class
of bug where one copy forgets to reset (or resets while the user is typing).

### A typed request helper in `piAgentBridge.ts`

Three callback maps (`pendingRenameCallbacks`, `pendingReadMessagesCallbacks`,
`pendingSettingsCallbacks`) repeat the same bookkeeping: mint an id, store a
resolver, time out, delete. A single `request<TResponse>(...)` keyed by a
discriminated union of request kinds makes a missing handler a type error
instead of a hang.

### Version the settings file shared by two windows

pigi's `settings.json` is read by the main process before the window exists and
written by the renderer through a 150 ms debounce. Nothing in the file says
which revision it holds, so two writers (main window and the updater window)
can interleave and lose one write. Add a monotonic revision and take the highest
on read, with a test in `src/main/pigiSettingsFile.test.ts` for the interleaved
case.

Each of these three needs the settings page, the updater window and the session
worker re-checked afterwards, which is why they are not folded into a feature
branch.

## One owner for pigi's settings file

Today the main process reads `settings.json` before the window exists (native
theme, window background), the preload reads it again synchronously (first paint
without a flash of the wrong theme), and the renderer writes it through a 150 ms
debounce. Three readers, one writer, no broadcast: the updater window and the
main window can disagree, a `pagehide` flush is an async `invoke` that
`before-quit` can beat, and nothing in the file says which revision it is.

The shape that makes all three problems go away at once: the main process owns
the file, the renderer receives a snapshot and sends changes, main debounces and
flushes synchronously on `before-quit`, and the file carries a monotonic
revision so a late write cannot win. The synchronous preload read has to stay —
it is what avoids the theme flash — so the snapshot has to be pushed into the
preload's first paint path rather than fetched after it.

## Per-field saving state on the pi settings pages

`usePiSettings` exposes one `saving` flag, so one field's write disables every
field on the page for the length of a worker round trip, a lock and two file
reads (up to ~200 ms while the pi TUI holds the lock). Track the fields that are
in flight instead, and leave the rest interactive.

## One type scale

The semantic scale (`--text-caption` 13, `--text-ui` 14, `--text-body` 15) sits
next to Tailwind's (`text-xs` 13, `text-sm` 14), so two names mean one size and
126 call sites still use the old one. Merge them, or mark the legacy steps in
`docs/design-system.md` the way `docs/todo.md` marks the radius migration.

## Terminal and appearance follow-ups

- `corner-shape: superellipse(1.5)` applies to every rounded box, which moves
  painting off the fast rounded-rect path. Record one trace on a long transcript
  with `blink.animations` to confirm paint cost did not regress, and check
  `.appearance-slider::-webkit-slider-thumb` — it uses `var(--radius-full)`
  rather than the class, so it is a superellipse only because a pseudo-element
  is not matched by `:where(:not(.rounded-full))`.

## Ordered list items need more room

A numbered list reads cramped: `.markdown-body li + li` sits at
`--message-item-spacing` (0.3 × `--text-body`, 4.5px at the default size), which
was tuned for a bulleted list of short lines. An ordered list is usually steps —
one or two lines each with real text in them — so at 4.5px the numbers run
together and the list stops reading as separate items.

Raise the gap for `ol` only, as a token of its own (something in the 0.8–1.0 ×
`--text-body` range, i.e. the prose step or just under it) so `ul` keeps its
tight rhythm, and check the nested case: an `ol` inside a `ul` inherits
`--markdown-item-spacing` from `.markdown-body li > ol` too. Verify against a real
reply with a 6-step list and a nested list, at 15px and at 18px text size, then
update the ladder in `docs/design-system.md`.
