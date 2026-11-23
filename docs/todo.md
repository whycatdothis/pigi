# TODO

Follow-ups that were identified but deliberately left out of a branch, because
each one is mechanical or structural enough that mixing it into a feature branch
would make the change hard to review. Delete an entry when it lands; anything
user-visible also adds a line to the CHANGELOG.

## Security

- Windows CLI socket ACL: `remoteControlServer` chmods the socket `0600` on
  POSIX and skips the step on Windows, where the named pipe keeps Node's
  default DACL. Check the pipe's ACL (or set one) so "no token auth" stays a POSIX
  property, and note the platform difference in `docs/cli.md §9`.
- `PreviewFile` and `ReadProjectFile` accept any absolute path from the
  renderer, and `local-file://` serves any path. That is the documented trust
  model (see "Renderer Security Model"); a capability-based handoff (the main
  process remembers which paths the user picked or the agent mentioned) would
  retire the assumption.

## Performance

- Renderer code splitting: `AGENTS.md` forbids dynamic imports, so the terminal
  panel (`@xterm`), the Mermaid renderer and the settings page all ship in the
  chat entry. Allowing `React.lazy` for those three is worth ~1.2MB of parse on
  first paint; the update window and the entry split already landed.
- The login-shell probes in `shellEnvResolver` run one after another, so a slow
  `.zshrc` delays the first process spawn by the sum of the candidates (up to
  5s each). Running them concurrently would make it the slowest instead, but
  several interactive shells sourcing the same config write shared state
  (`.zcompdump`, `.zsh_history`) on exit, so it needs a plan for that first.
  The window does not wait for it, which is why this is not urgent.
- `App.tsx` still holds the session lifecycle, the file/workspace plumbing and
  the remote-control surface. `useGitBranch` and `useUpdateInstall` were pulled
  out; the file-open cluster (`fileRevision`, `fileLineTarget`,
  `revealedDirectory`, `handleOpenFile*`) has the same shape.

## Go to definition

Deferred from `feat/go-to-definition` (`docs/goToDefinition.md`):

- Main does not stop the code navigation process in `before-quit`, and its
  `exit` handler (which kills language servers) does not run when the process
  is terminated. Servers still exit on stdin EOF or the `processId` watch.
- A lookup sent just as the idle process exits fails with "The code
  navigation process exited" instead of being retried in a new process.
- Windows: a language server started through an npm `.cmd` shim runs under
  `cmd.exe`, and killing it kills the shell, not the server.
- No tests for `GoToDefinition` (stale replies, candidate list, cursors, the
  visit recorded before a jump), for Cmd+[ / Cmd+] acting on files in the
  Files tab, for the tab close button, or for main's process restart and
  timeout in `src/main/projects/codeNavigation.ts`.
- A Files tab's close control is a `role="button"` inside the tab's `<button>`
  and `tabIndex={-1}`, so a keyboard user cannot close a tab; the terminal's
  tabs have the same shape. Closing the focused tab should move focus to its
  neighbour, not to the body.
- `lastFileByProject` and `openFilesByProject` are two persisted maps kept in
  step by hand (the active file has a tab); one map of `{ files, active }`
  per project would drop the invariant and the merge on load.
- Start the language server when the Files tab shows a navigable file, not on
  the first click: the first lookup pays the server's start-up, often past
  the 3 s budget on a large project.
