# Development Rules

**Do not add an entity unless it is necessary (如无必要，勿增实体).** Keep the
solution simple and reliable; a new concept, layer, flag, file or state has to
pay for itself.

## Workflow

- Do NOT commit unless asked. Commit and release workflow: `pigi-release` skill.
- Edit with `read` + `edit`, never `sed`; read files with `read`, not `cat`/`head`/`tail`.
- Run `npm run check` after significant changes and read the full output.
- Deferred follow-ups live in `docs/todo.md`: check it before working in an area it names, delete the entry when it lands.
- `rg --type ts` covers `.ts` and `.tsx`; `--type tsx` is not a valid type.

## Code Quality

- No `eslint-disable` comments, no `any`, no `as` unless nothing else works (then a comment says why).
- Comments earn their place: no restating what the code says, no narrating the diff. Write the ones that carry something the reader cannot get from the code — why this way, what broke before, which measurement forced the value — and keep those short.
- No inline or dynamic imports; every import is top-level.
- Never downgrade code to satisfy a dependency's stale types — upgrade the dependency.
- Ask before removing functionality that looks intentional; no backward compatibility unless asked.
- Third-party APIs: read the real docs first (context7 skill, then `node_modules`), never training data.

## Rendering and Layout

How and why is in `docs/architecture.md`; the rules:

- Panels use `usePanelResize`: live size in a CSS custom property, store commit at gesture end, `data-panel-resizing` disables transitions.
- Subscribe to store fields, never the whole store; keep geometry observers and measurement refs in the smallest component that needs them.
- No viewport-width media queries or Tailwind breakpoints; write the desktop style (enforced by ESLint and `scripts/checkCssMediaQueries.mjs`).
- Long-running animations must stay on the compositor: `transform`/`opacity` only, never a `transform` on an `<svg>`, spinners use `SpinningIcon`.

## Design System

- Radius, spacing, elevation, motion and type are named by role in `src/renderer/src/assets/semanticTokens.css`; read `docs/design-system.md` before styling a new component.
- No pixel values for radius, font size or shadow in `className` (`scripts/checkDesignTokens.mjs` rejects them); `__designTokens()` renders the token set in a dev build.

## Naming

- camelCase file names; no abbreviations (`message`, not `msg`).
- IPC channels are snake_case with a `pi:` prefix, declared in `src/shared/ipcContract.ts`. No magic strings anywhere; ask first if one seems unavoidable.
