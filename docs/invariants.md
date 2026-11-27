# Invariants

What this repository refuses to break, and the check that refuses it. Read this
before changing an area, and run the check named in its row while working —
that is faster than re-reading the code around it.

A rule that is only written in prose does not exist: it becomes an entry here
only when something fails when it is broken. The last row is the process.

## Security

| Invariant                                                                                                                  | Checked by                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Both windows are sandboxed, context-isolated, without Node or insecure content                                             | `src/main/windows/rendererSecurityPreferences.test.ts`          |
| The CSP allows only self-scripts, no `unsafe-eval`, no objects/frames/forms, images from app/data/package-image/local-file | same file                                                       |
| A window never navigates away, and only `http(s)`/`mailto` reach the system browser                                        | `src/main/windows/windowNavigation.test.ts`                     |
| `local-file://` serves only a regular file ≤ 64MB (no devices, no FIFO, no huge files)                                     | `src/main/protocols/localFile.test.ts`                          |
| Package images are http(s) at public addresses, before and after redirects                                                 | `src/shared/piPackages.test.ts`                                 |
| Markdown output is parsed, never injected: no raw HTML, no `javascript:`/`data:` hrefs                                     | `src/renderer/src/components/message/markdownMessage.test.tsx`  |
| Only the listed files may call `shell.openExternal`, write `dangerouslySetInnerHTML`, or `eval`                            | `node scripts/checkDangerousApis.mjs` (allowlist in the script) |
| The renderer never imports `electron`, `src/main`, `src/processes` or the preload; `src/shared` imports neither process    | `node scripts/checkImports.mjs` (rules in the script)           |
| pi's settings file is written 0600 through a temp file and a rename                                                        | `src/processes/utility/piSettingsWrite.test.ts`                 |

## Performance

| Invariant                                                                                      | Checked by                                                                                           |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| The renderer entry, its largest chunk and all JavaScript stay inside their gzip caps           | `node scripts/checkBundleBudget.mjs` (caps in `scripts/bundleBudget.json`)                           |
| No source file may grow past 800 lines, and none of the files that already did may grow at all | `node scripts/checkFileSize.mjs` (baseline in `scripts/fileSizeBudget.json`)                         |
| A streaming message is not re-parsed on every batch; the interval scales with the text         | `src/renderer/src/hooks/useStreamingThrottledValue.test.ts`                                          |
| A streaming code block is tokenized at most once per throttle interval                         | `src/renderer/src/components/message/markdownMessage.test.tsx`                                       |
| Stream batches carry only a tail, never the same value twice, and a truncation replaces it     | `src/processes/utility/streamBatcher.test.ts`, `src/renderer/src/state/transcriptController.test.ts` |

## Known gaps — reviewed by hand, not checked

Listed so they are decisions rather than oversights. Each one is a candidate for
the next check, not a promise that review will hold.

- **The CLI socket's caps** (`MAX_QUEUED_REQUESTS`, `MAX_IN_FLIGHT_REQUESTS`) and
  the unix `0600` mode are runtime behaviour in a module that needs a real
  Electron to start; `docs/cli.md §9` states the threat model.
- **The main process stays out of the streaming data path.** A change here shows
  up as main forwarding a batch, which no test would catch — it is a design
  property of the MessagePort handoff, described in `docs/architecture.md`.
- **`local-file`/`PreviewFile`/`ReadProjectFile` trust the renderer with any
  absolute path.** The trust model is documented; the capability handoff that
  would retire it is still in `docs/todo.md`.

## Process

| Invariant                                                              | Checked by                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| Every check above runs on every push, and a red check blocks the merge | `.github/workflows/ci.yml`                      |
| Known CVEs in shipped dependencies fail the build                      | `npm audit --omit=dev --audit-level=high` in CI |
| Dependency updates arrive as reviewable PRs                            | `.github/dependabot.yml`                        |
| Every number worth watching is one command away                        | `npm run report`                                |

When something broke once, add the check that makes breaking it again
impossible — then add its row here. Deleting a row without deleting its check
is how this file starts lying.
