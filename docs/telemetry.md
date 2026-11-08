# Telemetry

pigi sends anonymous usage events and error reports to its own endpoint on
Cloudflare, which stores them in Workers Analytics Engine. It is on by default,
with no prompt; Settings → Privacy turns it off, and so does `DO_NOT_TRACK`
(any value but `0`) in the login shell. Readers see the same facts on
[pigi.pink/privacy](https://pigi.pink/privacy)
(`website/src/pages/privacy.astro`); change both together.

| Piece              | Where                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Queue, opt-out, id | `src/main/telemetry.ts`                                                                                                       |
| Renderer reports   | `pi:report_telemetry`, `src/renderer/src/lib/errorReporting.ts`, `App.tsx`, `useKeyboardShortcuts.ts`                         |
| Endpoint           | `website/functions/api/telemetry.ts` (Pages Function, deployed with the site)                                                 |
| Storage            | Analytics Engine dataset `pigi_telemetry`, bound as `TELEMETRY` in the Pages project; previews write `pigi_telemetry_preview` |

## When something is sent

All three must hold:

- The build carries the endpoint. Only `release.yml` sets `PIGI_TELEMETRY_URL`
  (→ `__PIGI_TELEMETRY_URL__`), so `npm run dev`, local builds and forks send
  nothing. To try it, start dev with
  `PIGI_TELEMETRY_URL=https://<branch>.pigi-1jh.pages.dev/api/telemetry npm run dev`;
  a preview deployment writes to the preview dataset.
- `telemetry.enabled` in pigi's `settings.json` is true.
- `DO_NOT_TRACK` is unset or `0`. It is read from the login shell like
  `PI_SUBAGENT_PI_BINARY`, since a Finder-launched app has no shell env.

Main queues events and posts them as one batch 30 seconds after the first one,
so a burst is one request. Offline, the queue (at most 500) waits for the next
try; events still queued when the app quits may be lost. Turning the switch off
drops the queue and deletes `telemetry-id` in the user data folder; turning it
on again starts a new id.

## Columns

Each event is one data point. The install id (a random UUID made on first send)
is the only index, so sampling keeps or drops whole installs.

| Column      | Value                                |
| ----------- | ------------------------------------ |
| `index1`    | install id                           |
| `blob1`     | event name                           |
| `blob2`     | app version                          |
| `blob3`     | macOS version                        |
| `blob4`     | arch                                 |
| `blob5`     | country (Cloudflare's lookup; no IP) |
| `blob6`…    | the event's fields, below            |
| `double1`   | the event's value, below             |
| `timestamp` | when the endpoint received the batch |

| Event          | When                                                                          | `blob6` …                                                                                  | `double1` |
| -------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| `app_started`  | Launch                                                                        | default tool view                                                                          |           |
| `prompt_sent`  | Each prompt sent                                                              |                                                                                            |           |
| `feature_used` | Switching workspace tab; any app shortcut                                     | `tab.<chat\|files\|git>` or `shortcut.<shortcut id>`                                       |           |
| `exception`    | Uncaught error or rejection in main or a renderer; update failed while online | source (`main`, `renderer`, `update`), error name, message, stack                          |           |
| `process_gone` | A renderer or utility process died, other than a clean exit                   | process (`renderer`, `pi-agent`, `session-worker`, `terminal`, or Electron's type), reason | exit code |

A new feature is a `tab.` or `shortcut.` name reported from the renderer; main
rejects anything else (`FEATURE_PATTERN`). Shortcuts are reported by the one
dispatcher, so a new shortcut is counted without code.

## What is never sent

Prompts, replies, tool calls or output, file contents, project or session names,
model or provider settings, hostnames. Error messages and stacks go through
`scrubErrorText`: app frames keep their place in the bundle
(`<app>/out/main/index.js:12:3`), every other path or URL becomes `<path>` or
`<url>`. A message can still quote short text from its cause (a JSON parse error
quotes its input), so messages are cut to 300 characters and each distinct error
is reported once per launch, at most 20 per launch.

## Querying

The SQL API (`https://api.cloudflare.com/client/v4/accounts/<account>/analytics_engine/sql`)
needs a token with Account Analytics Read. Weight counts by `_sample_interval`:

```sql
-- Daily active installs (sent a prompt)
SELECT toStartOfDay(timestamp) AS day, count(DISTINCT index1) AS installs
FROM pigi_telemetry
WHERE blob1 = 'prompt_sent' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY day ORDER BY day

-- Feature use: times and installs
SELECT blob6 AS feature, SUM(_sample_interval) AS times, count(DISTINCT index1) AS installs
FROM pigi_telemetry
WHERE blob1 = 'feature_used' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY feature ORDER BY times DESC
```

Data is kept for three months.

## Rules for changing it

- A new event or field goes in the tables above and, if it is a new kind of
  data, on the privacy page and in the CHANGELOG. Fields are positional: add
  new ones at the end of an event, never reorder.
- Only main sends. A renderer adds a variant to `RendererTelemetryReport`.
- Anything taken from an error goes through `scrubErrorText`.
