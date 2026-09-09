# Development Rules

For DeepSeek model: do not overthink, think less and act more.

## Workflow

- Do NOT commit automatically after changes; wait for explicit commit instruction. Commit and release workflow is in `pigi-release` skill.
- Never use `sed` for code edits; always use `read` + `edit` tools so you understand the semantic context around the change
- Never use `sed`/`cat`/`head`/`tail` to read files; use the `read` tool (supports offset/limit for specific lines)
- Run `npm run check` after any significant code change to catch type errors, lint issues, and formatting problems before committing. Read the full output — do not pipe through `rg` or `grep`.
- ripgrep (`rg`): use `--type ts` for both `.ts` and `.tsx` files (ripgrep's built-in `ts` type already includes `*.tsx`, `*.cts`, `*.mts`). Do NOT use `--type tsx` — it's not a valid type. Run `rg --type-list` to verify.

## Conversational Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text
- Technical prose only, be kind but direct (e.g., "Thanks @user" not "Thanks so much @user!")

## Code Quality

- **NEVER add eslint-disable comments** — restructure code to satisfy lint rules instead. The only exception is when there is a genuine false positive with no architectural workaround, and must be approved by the user first.
- No `any` types unless absolutely necessary
- No `as` type assertions unless absolutely necessary (use type guards, typed variables, or discriminated unions). When `as` is unavoidable (e.g. untyped SDK data, TS `Array.includes` limitation, `React.CSSProperties` for custom CSS vars), add a comment explaining why.
- Check node_modules for external API type definitions instead of guessing
- **NEVER use inline imports** - no `await import("./foo.js")`, no `import("pkg").Type` in type positions, no dynamic imports for types. Always use standard top-level imports.
- NEVER remove or downgrade code to fix type errors from outdated dependencies; upgrade the dependency instead
- Always ask before removing functionality or code that appears to be intentional
- Do not preserve backward compatibility unless the user explicitly asks for it
- For any third-party library or framework API decision, consult the true source documentation before proceeding. Do not rely on training data for API signatures, options, or behavior. Methods to find docs, in order of preference:
  1. context7 skill — for up-to-date library/API docs
  2. Search via chrome-devtools skill — for web docs, articles, GitHub repos
  3. node_modules — for Node.js dependencies, search `node_modules/<pkg>/README.md`, `node_modules/<pkg>/docs/`, or the package's own TypeScript type definitions

### Resize and Layout Performance

- Use `src/renderer/src/hooks/usePanelResize.ts` for draggable panels, including future right sidebars. Keep live dimensions in a shared CSS custom property; commit React/store dimensions only when the gesture ends.
- Resize handles must disable size transitions while dragging via `data-panel-resizing`. Keep real space reserved for adjacent content; do not cover it with translated overlays.
- Keep geometry observers local to the smallest component that needs their result. Prefer `ResizeObserverEntry` measurements over repeated synchronous DOM reads; do not route presentation-only dimensions through the app or transcript state.
- Scope live CSS custom properties to the smallest layout subtree that consumes them. Inherited variables on the app root can invalidate styles throughout a long transcript on every frame; use flex/grid to resize unaffected siblings naturally.
- Keep virtual row measurement refs stable. Use the virtualizer's measurement callbacks for height caching instead of reading every row's height on each render.
- Subscribe to specific store fields; use shallow selectors for multiple fields. Do not subscribe an app/layout component to the entire store.
- No viewport-width media queries in the renderer CSS: no Tailwind breakpoint variants (`sm:` `md:` `lg:` `xl:` `2xl:` `max-*:`), no `.container` utility, and check third-party CSS before adding it. Tailwind v4 output is layered, and Blink treats any rule-set change in a layered sheet as a change to all rules: every breakpoint crossing during a native window resize rebuilds the font cache, invalidates every font, and re-runs style and layout for the whole document (60-80ms per crossing). This is a desktop app with a fixed minimum width; write the desktop style unconditionally. Enforced by an ESLint rule and `scripts/checkCssMediaQueries.mjs` (runs in `npm run build`).
- Validate resize changes with long conversations: panel dragging, native window resizing, bottom follow, history reading, and interrupted gestures. Document the reusable behavior in `docs/architecture.md`.

## Naming Conventions

- All source file names use camelCase (e.g. `piAgent.ts`, `appStore.ts`, `ipcChannels.ts`)
- No abbreviated variable/function names — use full descriptive names for readability (e.g. `message` not `msg`, `command` not `cmd`, `callback` not `cb`, `sessionPort` not `sp`, `index` not `idx`). Common terms like `id`, `url`, `api` are fine.
- IPC channel names use snake_case with `pi:` prefix, defined in `src/shared/ipcChannels.ts` (no magic strings)
- No magic strings anywhere in the codebase; use constants, enums, or registries. If a magic string seems unavoidable, ask the user first.
