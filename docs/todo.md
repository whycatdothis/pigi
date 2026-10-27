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
