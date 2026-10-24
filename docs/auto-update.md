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
    → update-available
      → open UpdateProgressWindow (BrowserWindow 420x200, frameless, centered)
      → downloadUpdate(token)
        → progress: bar + percentage + speed + Cancel
        → Cancel → token.cancel(), close window, status 'idle'
        → update-downloaded → "Install and Restart" / "Later"
    → update-not-available → toast "pigi is up to date"
    → error → toast with the message
    → unsupported → toast "Only the packaged app can check for updates"
```

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
- Frameless with vibrancy, so it reads as a sheet rather than a document window.
  Parent-linked to the main window, which keeps it above it.
- The renderer only displays the pushed status; Cancel and Install send an IPC
  message and wait for the next status, so the window cannot disagree with the
  updater.

### IPC Channels

| Channel                      | Direction            | Purpose                                 |
| ---------------------------- | -------------------- | --------------------------------------- |
| `pi:get_update_status`       | renderer → main      | Current status (late subscriber)        |
| `pi:check_for_updates`       | renderer → main      | Check now; returns the resulting status |
| `pi:cancel_update_download`  | renderer → main      | Abort the download, close the window    |
| `pi:quit_and_install_update` | renderer → main      | Restart into the downloaded version     |
| `pi:update_status_changed`   | main → all renderers | Status changed                          |

### Preload API (`window.piApi.update`)

```ts
getStatus: () => Promise<UpdateStatus>
check: () => Promise<UpdateStatus>
cancelDownload: () => void
quitAndInstall: () => void
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
4. Manual path: Settings → "Check for Updates" on an up-to-date build toasts
   "pigi is up to date"; on an outdated one it shows the progress window, and
   Cancel must leave the app running and installable later.
