# Testing

Four layers, three of them in use. The rule of thumb: pick the cheapest layer that
can actually fail for the bug you are worried about.

| Layer         | Runs on       | Command           | In CI | Answers                     |
| ------------- | ------------- | ----------------- | ----- | --------------------------- |
| **Unit**      | node, no DOM  | `npm test`        | yes   | is this logic right?        |
| **Component** | jsdom + React | `npm test`        | yes   | does this surface behave?   |
| **Browser**   | real Chromium | `npm test` (last) | yes   | does it lay out and scroll? |
| **Electron**  | the real app  | by hand, via CDP  | no    | does it work in the app?    |

`npm test` is the whole thing: unit and component first, the browser layer last, so a
long session does not cost a browser start until the cheap layers are green. The
browser layer needs Chromium downloaded once — `npx playwright install chromium` (CI
runs the same step and caches it). One layer at a time: `npm run test:jsdom`,
`npm run test:browser`, `npm run test:watch`.

## What goes where

- **Unit** (`lib/`, geometry, the utility process): anything that is a function of
  its arguments — filters, layout maths, row building, lineage, counts. When a
  component is making a decision, extracting it here is cheaper than testing the
  component.
- **Component** (`*.test.tsx`): one surface at a time — the session tree dialog, the
  input, the transcript rows — mounted with a fake IPC boundary. This is where
  wiring bugs live: keyboard handling, refs, effects, state machines, fold state,
  what re-render does to what. Prefer mounting the surface, never the whole `App`.
- **Browser** (`*.browser.test.tsx`): only what jsdom cannot answer — measured row
  height, real scrolling, overflow (the hover card), sticky and pinned positions.
  Keep the count small; each test costs a browser start.
- **Electron** (no harness in the repo yet): window resizing, native chrome,
  `vibrancy`, background throttling, the real agent and real session files. Drive it
  with the CDP tooling in `.pi/skills/pigi-debug`, or by hand. Deliberately kept out
  of `npm test`: too heavy, too flaky, and the interesting parts cannot run in CI.

Presentational components (buttons, chips, markdown rendering) are not tested.

## Writing a component test

- The only fake is the process boundary: `installFakePiApi()` in
  `src/renderer/src/testing/fakePiApi.ts` stands in for `window.piApi`. Do not mock
  our own modules.
- Fixtures are built with `sessionTree()` from `src/renderer/src/testing/sessionTreeFixtures.ts`.
- Query by role and name first (`getByRole('button', { name: /.../ })`), fall back to
  the `data-*` handles the rows already carry (`data-tree-row-id`, `data-tree-filter`,
  `data-active`). Those ids are the stable handle for "which row", not the text.
- Use `userEvent` rather than `fireEvent`: it walks the real pointer, focus and
  keyboard sequence.
- jsdom test files start with `// @vitest-environment jsdom` and import
  `../../testing/jsdomSetup` (matchers plus the few DOM APIs jsdom lacks).
- A test that mounts a virtual list (the session tree list is one) calls
  `installViewport({ width, height })` before rendering. Without a size the list
  draws no rows at all, and a test that reads rows then measures nothing instead of
  failing; `testing/jsdomViewport.test.tsx` is the recipe, with what a 320px
  viewport draws.

### Assertions that survive a refactor

Assert **model output** (a pure function), **presence or absence of a named row**,
and **the outcome of an interaction**. Never assert:

- "the number of mounted rows equals the number of entries" — a virtualized list
  breaks this on purpose;
- the DOM nesting, wrapper elements or class names;
- snapshots.

A test that pins the current shape of the markup is deleted by the next refactor, so
it buys nothing.

### Characterization tests

Some behaviour is known and not wanted yet (the tree dialog lists rows that arrive
while it is open only after a reopen). Record it as a test anyway, with a comment
saying it is recorded, not desired — then a later fix shows up as a deliberate change
instead of an accident.

Make a test fail on purpose once, before trusting it.

### Environment

Pin time zone and locale in anything that formats or compares dates
(`formatSessionTreeTime`, the lineage labels); a test that depends on the machine's
clock or language is not a test.

## jsdom cannot

- measure anything: every `clientWidth`, `scrollHeight` and rect is `0`, unless the
  test called `installViewport`;
- scroll: `scrollIntoView` is stubbed, `scrollTop` stays put;
- apply CSS, so `overflow`, sticky and the hairline geometry do nothing;
- tell whether text overflows its box (which is exactly why the hover card is a
  browser test).

If a test needs one of these, it belongs in `*.browser.test.tsx` or in the app, not
in a mock of the number.
