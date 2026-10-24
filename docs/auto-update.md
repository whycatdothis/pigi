# Auto-Update Design

## Overview

pigi updates itself through `electron-updater` against GitHub Releases. Two
entry points: the macOS app menu and Settings. Both run the same manual check —
silent background checks only light the theme-coloured dot in Settings when a
download lands.

## Decisions

### Library: electron-updater

`electron-builder.yml` already publishes to GitHub (`publish.provider: github`),
and electron-builder already writes `app-update.yml` plus `latest-mac.yml`,
`pigi-<version>-arm64-mac.zip` and its `.blockmap` into each release.
electron-updater reads all of that, so the build and release pipeline needs no
change.

No `electron-log`: electron-updater logs to the console by default, and the app
has no file logging anywhere else.

### Channel: stable only

Single `latest` channel. No beta/alpha.

### autoDownload: false

Both flows call `downloadUpdate(cancellationToken)` explicitly, which is what
gives the progress window a token to cancel.

### autoInstallOnAppQuit: false

Installing is a user action:

1. Settings popover: "Update to <version>" → `quitAndInstall()`
2. Progress window: "Install and Restart" → `quitAndInstall()`

A quitter never picks up a half-decided update.

### Platform: macOS only

`isSupported()` is `app.isPackaged && process.platform === 'darwin'`. A dev run
has no signed bundle to swap, and no Windows or Linux target is published, so
both report `unsupported` and the manual check answers with a toast.

### One status, pushed

Rather than one channel per event, main owns a single `UpdateStatus` value:

```ts
type UpdateStatus =
  | { phase: 'unsupported' }
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up_to_date' }
  | { phase: 'downloading'; version; percent; transferredBytes; totalBytes; bytesPerSecond }
  | { phase: 'downloaded'; version }
  | { phase: 'error'; message };
```

It is broadcast on every change and readable on demand (`GetUpdateStatus`), so a
window that opens mid-download — or after the main window was closed and
reopened — shows the same state as main. Event-per-channel would need a replay
path for each one.

### Flow 1: Silent Background Check

```
Launch (+15s) / every 2 hours, jittered by ±10 min
  → autoUpdater.checkForUpdates()
    → update-not-available: status 'up_to_date', nothing visible
    → update-available
      → autoUpdater.downloadUpdate()   (no window)
        → download-progress → status 'downloading' (log only, no UI)
        → update-downloaded → status 'downloaded'
          → accent dot on the Settings sidebar button
```

The delay exists so the main window is up before the first push; users also
notice a launch that immediately starts downloading.

The interval between later checks is jittered by ±10 minutes. A fixed two-hour
period keeps every instance at a constant phase relative to its launch, so
the checks — and, once a version appears, the 160 MB downloads — of a large
user base stay clumped together instead of spreading out.

### Flow 2: Manual Check (Settings)

```
Settings sidebar button → popover → "Check for Updates"
  → CheckForUpdates
    → status 'checking' + UpdateProgressWindow opens at once
    → update-available
      → same window becomes the download UI
      → downloadUpdate(token)
        → progress: bar + percentage + speed + Cancel
        → Cancel → token.cancel(), close window, status 'idle'
        → update-downloaded → "Install and Restart" / "Later"
      → Install and Restart → status 'installing' ("Restarting to install…")
      → Squirrel re-fetches the bundle from the updater's local proxy
      → the app quits and reopens on the new version
    → update-not-available → window shows "pigi is up to date" and counts
                             down 2s before closing itself
    → error → window closes, toast with the message
    → unsupported → toast "Only the packaged app can check for updates"
```

The window opens at the start of the check rather than when a download begins:
a check takes a few seconds over the network, and without it the click looks
ignored. A found update keeps the same window as the download UI; "up to date"
is answered by the window itself, which counts down two seconds and closes, so
it does not leave a window behind and the main window stays out of it. Errors
still toast in the main window, since the message can be longer than a window
this size should hold.

Checking while a download is already running (or finished) reopens the progress
window instead of starting a second download.

The Settings popover's item swaps from "Check for Updates" to
"Update to <version>" once a download lands, and the sidebar button grows a dot
in the theme accent colour.

### Flow 3: The App Menu Item

The macOS app menu carries one update item, directly under "About":

```
idle / up_to_date / error    Check for Updates…          → manual check
checking                     Checking for Updates…       → disabled
downloading                  Downloading pigi <version>… → opens progress window
downloaded                   Update to <version>…        → opens progress window
installing                   Installing Update…          → disabled
unsupported (dev)            Check for Updates…          → disabled
```

It opens the progress window rather than installing, so every install stays a
click inside that window — the failure toast is reported from the renderer,
which would not know about an install started by main.

The menu is rebuilt (not mutated) when the item's label or enabled state
changes; `refreshApplicationMenu` compares the rendered string first, because
`download-progress` pushes status many times a second.

### Progress Window

- `src/main/windows/createUpdateProgressWindow.ts`, following the existing
  `createMainWindow.ts` convention.
- Loads the same renderer bundle at `#/update-progress`; `renderer/src/main.tsx`
  picks `<UpdateProgress />` over `<App />` from `window.location.hash`
  (`shared/routes.ts`). No second vite entry, no second preload.
- A normal titled window (`Updating pigi`) rather than a frameless sheet: it
  replaces the app, so it should read as a system dialog, and the red button is
  the way out. Closing it does not cancel the download. Parent-linked to the
  main window, which keeps it above it, and placed over it: centred
  horizontally, a tenth of the way down. The top edge stays put when the
  content grows, so the status line never jumps.
- The window hugs its content. It has no fixed height: the renderer measures
  what the current status needs and reports it over
  `PiChannel.UpdateProgressContentHeight`, and main resizes with that number (clamped
  to 72–260px, 400px wide). A one-line "up to date" is a short window; a
  download grows to fit the bar and its buttons; a long error message wraps
  instead of being clipped.
- The content follows the shape of a system update dialog: app icon, bold
  status, progress bar, byte count on the left and actions on the right. Only
  `checking` carries a spinner, and the bar plus buttons are drawn in the theme
  accent. A single-line status ("up to date") is one centred row instead of a
  block with an empty bottom half.
- The renderer only displays the pushed status; Cancel and Install send an IPC
  message and wait for the next status, so the window cannot disagree with the
  updater.

### IPC Channels

| Channel                             | Direction            | Purpose                                 |
| ----------------------------------- | -------------------- | --------------------------------------- |
| `pi:get_update_status`              | renderer → main      | Current status (late subscriber)        |
| `pi:check_for_updates`              | renderer → main      | Check now; returns the resulting status |
| `pi:cancel_update_download`         | renderer → main      | Abort the download, close the window    |
| `pi:dismiss_update_window`          | renderer → main      | Close the window, keep the download     |
| `pi:quit_and_install_update`        | renderer → main      | Restart into the downloaded version     |
| `pi:update_progress_content_height` | renderer → main      | How tall the progress window content is |
| `pi:update_status_changed`          | main → all renderers | Status changed                          |

### Preload API (`window.piApi.update`)

```ts
getStatus: () => Promise<UpdateStatus>
check: () => Promise<UpdateStatus>
cancelDownload: () => void
dismissWindow: () => void
quitAndInstall: () => void
setProgressWindowContentHeight: (height: number) => void
onStatus: (callback: (status: UpdateStatus) => void) => () => void
```

### Zustand Store

```ts
updateStatus: UpdateStatus        // pushed from main, read on mount
setUpdateStatus: (status: UpdateStatus) => void
```

`App` mirrors the status into the store and derives `pendingUpdateVersion`
(`downloaded` only), which it passes to the memoized sidebar.

### File Structure

```
src/main/
├── ipc/updateManager.ts              # autoUpdater wiring, status, IPC, timers
├── windows/createUpdateProgressWindow.ts
└── index.ts                          # + initializeUpdateManager, scheduleBackgroundUpdateChecks

src/renderer/src/
├── main.tsx                          # + hash fork for #/update-progress
├── App.tsx                           # + status subscription, check/install handlers
├── services/piAgentClient.ts         # + update API wrappers
├── state/appStore.ts                 # + updateStatus
└── components/update/UpdateProgress.tsx

src/shared/
├── ipcContract.ts                    # + UpdateStatus, PiChannel entries
└── routes.ts                         # + UPDATE_PROGRESS_HASH

src/preload/index.ts                  # + window.piApi.update
```

## Verification

Needs two published versions and a signed build, so it cannot be exercised in a
dev run:

1. Install a released version (0.4.17 or later) from `~/Applications/pigi.app`.
2. Bump, release the next version as usual.
3. Launch the installed build: the accent dot appears within a couple of hours
   at the latest (the launch check runs 15s in), then Settings → "Update to …" →
   "Install and Restart" swaps the bundle in place.
4. Manual path: Settings → "Check for Updates" on an up-to-date build shows
   "pigi is up to date" in the window, counting 2 then 1, and then closes it, with no
   toast in the main window; on an outdated one the same window becomes the
   download, and Cancel must leave the app running and installable later.
