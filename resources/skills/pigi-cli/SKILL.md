---
name: pigi-cli
description: Operate the pigi app (the desktop app this session runs in) from bash with the `pigi` command. Use whenever a task needs pigi itself to act, such as running a task in a subagent (a fresh child session of this one) and getting its reply, or listing, creating, prompting and waiting on pigi sessions.
---

# pigi CLI

`pigi` is the command-line interface to the running pigi app: each command asks the app to do something it can do in its UI. Inside pigi it is on `PATH` and knows which session is calling it.

`pigi --help` lists every command this pigi version has; the set grows over time, so check it rather than assuming the list below is complete. `pigi <command> --help` gives a command's flags; `--json` prints structured output on stdout.

## Commands today

```
pigi ping
pigi session list [--cwd <dir> | --all] [--running] [--subagent] [--parent <session>]
pigi session create [--cwd <dir>] [--parent <session>] [--model provider/id] [--thinking <level>]
pigi session prompt <session> "<text>"
pigi session wait <session> [--timeout <seconds>] [--stop]
pigi session status <session>
pigi session abort <session>
pigi subagent "<task>" [--model provider/id] [--thinking <level>] [--detach | --timeout <seconds>]
```

- `<session>` is a session file, an id, or an id prefix as `session list` prints it.

- `ping` checks that pigi is reachable and prints its version.
- `session` commands work on sessions in the background; none of them changes which session the user is looking at. `session prompt` returns once the run has started; `session wait` prints the final reply once it is idle. To continue a session (a stopped subagent, say), `pigi session prompt <session> "continue"`, then `pigi session wait <session>`. Prompt a session soon after `session create`: pigi may close an idle session that has never run.
- `subagent` creates a child session of this one (shown under it in pigi's sidebar), sends it the task, waits, and prints its final reply on stdout. The child's id and path go to stderr as it starts. The child starts with an empty context and inherits this session's model and thinking level unless overridden.
- `subagent` blocks until the child finishes, which can take minutes. If the call is aborted, the child is aborted too; `--timeout` stops it when the time runs out. A pigi window reload does not end the call: it keeps waiting. `--detach` returns the path right away instead; `pigi session status <session>` shows its progress, `pigi session wait <session> --timeout 0` checks on it without waiting (exit 4 while it is still running, else its reply), and `pigi session abort <session>` stops it.
- A subagent cannot start subagents; `pigi subagent` refuses inside one.

## Conventions

- stdout carries only the result; progress and notices go to stderr.
- `-` as a text argument reads it from stdin.
- Exit codes: 0 success, 1 failed (for example the session errored or was aborted), 2 usage error, 3 pigi is not reachable, 4 still running (`session wait --timeout` ran out, or the pigi window did not come back after a reload; `pigi session wait <session>` continues).
