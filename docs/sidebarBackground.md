# Sidebar Background: Opaque Surface with Synthetic Color

Status: research. No app code changed on this branch; this document records what
the sidebar material is today, what replacing macOS vibrancy with a
self-rendered background would involve, and the measurements taken in the
running dev app.

## Question

The sidebar is macOS vibrancy (`vibrancy: 'menu'`): a translucent white sheet
over the blurred desktop, so wallpaper colors show through it. Can the window
be made opaque and the sidebar keep that look — soft color fields sitting
behind a frosted sheet — without the OS material?

Yes. Everything the effect needs is a background layer plus a wash, and the
sidebar is the only translucent region in the window, so the change is local.

## What exists today

| Where                                            | What                                                            |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `src/main/windows/createMainWindow.ts:27`        | macOS: `vibrancy: 'menu'`, `backgroundColor: '#00000000'`       |
| `src/main/windows/createMainWindow.ts:28`        | other platforms: opaque `backgroundColor: '#ffffff'`            |
| `src/shared/designTokens.css:113`                | `--sidebar: color-mix(in srgb, white 55%, transparent)` (light) |
| `src/shared/designTokens.css:161`                | `--sidebar: oklch(0.269 0 0 / 55%)` (dark)                      |
| `src/shared/designTokens.css:115`, `:163`        | `--sidebar-solid` — the opaque approximation, already defined   |
| `src/renderer/src/components/ui/sidebar.tsx:143` | the panel: `bg-sidebar`                                         |
| `src/renderer/src/App.tsx:1371`                  | main column: opaque `bg-background`                             |
| `website/src/components/app/Sidebar.astro:57`    | the site's mock sidebar already uses `--sidebar-solid`          |

Two consequences:

- The wallpaper shows through the sidebar only. The chat column, toolbar and
  terminal are opaque, so an opaque window changes nothing outside the sidebar.
- `--sidebar-solid` already is the value the sidebar would take when opaque, and
  the marketing site previews it, so the app would finally match its own
  screenshot.

Also relevant: `src/renderer/src/lib/layoutConstants.ts:64` says overlay
surfaces (`VIBRANCY_OVERLAY_CONTENT`) use `bg-popover/88 backdrop-blur-sm`
because "blur renders incorrectly in vibrant regions". That is the one real
defect vibrancy causes in the app: `backdrop-filter` is unreliable over it.
Removing vibrancy removes the workaround too (see Open Questions).

## Proposed structure

```
sidebar panel            bg: opaque --sidebar-solid; isolation: isolate
├── color fields         absolute inset-0, z-index: -1, radial-gradients, pointer-events: none
├── wash                 absolute inset-0, z-index: -1, backdrop-filter: blur() + translucent surface color
└── existing content     header, project list, footer — unchanged
```

`z-index: -1` children paint above the panel's own background and below its
in-flow content, and `isolation: isolate` keeps them inside the panel's stacking
context. No wrapper element and no DOM changes are needed; the two layers are
siblings of the existing header/list/footer.

### Color fields: radial gradients, not `filter: blur()`

A `radial-gradient` is soft by construction, rasterizes once, and stays smooth
at any panel size. `filter: blur()` on a container of solid circles produces the
same picture but adds an offscreen filter pass that has to be redone whenever
the panel's size changes — and the sidebar's size changes on every frame of the
toggle animation and every frame of a drag (`--sidebar-width`,
`SIDEBAR_TRANSITION_CLASS_NAME`). Gradient layers cost a normal background paint
and nothing else.

### Wash: the only way to get real frosting

Blurred color fields alone are just a gradient wallpaper. The frosted look comes
from the wash layer: `backdrop-filter: blur(...) saturate(...)` over a
translucent surface color. That layer is what makes the fields read as _behind
glass_ rather than _painted on the surface_, and it is what will let a future
overlay on the sidebar (the Settings popover in `components/sidebar/`) blur its
backdrop for real.

**Backdrop-root caveat:** `mask-image`, `filter`, `opacity < 1` and similar
properties on an ancestor make that ancestor a backdrop root, and a
`backdrop-filter` descendant then samples only up to it. The wash must therefore
be a sibling of the scroll container, not a child of it — the project list uses
`content-fade-bottom` (`src/renderer/src/assets/main.css:354`), which sets
`mask-image` on the scroll element.

## Measurements

A 900 ms width animation (`244px → 360px`, the same easing as the toggle) traced
in the running dev app with the CDP `Tracing` domain, summing timeline events by
name. Same session, same content, variants swapped in live:

| Variant                           | Paint   | RasterTask                 | PrePaint |
| --------------------------------- | ------- | -------------------------- | -------- |
| today (translucent, no layers)    | 27.6 ms | 11.3 ms                    | 13.5 ms  |
| + color fields (gradients)        | 27.4 ms | 11.6 ms                    | 12.2 ms  |
| + fields + `backdrop-filter` wash | 25.6 ms | 8.4 ms (462 vs 220 events) | 11.9 ms  |
| + fields + `filter: blur()`       | 26.2 ms | 10.3 ms                    | 11.2 ms  |

Differences are inside run-to-run noise. The panel is 244×800 — 195k pixels —
and the whole width animation paints for about 27 ms of main-thread time. The
`backdrop-filter` blur itself runs as a compositor/GPU pass that this trace does
not cover, so the GPU side still needs eyeballing on a real machine; the CPU
side is not a reason to avoid the design.

## Tuning

Live previews (injected as throwaway layers into the real sidebar, then
removed): a light multi-hue field set, a light single-hue set, and the same
multi-hue set in dark mode.

- **Alpha does not carry across themes.** The same field alphas that look right
  on light (`wash` at 62% of `--sidebar-solid`) read over-saturated and muddy on
  dark; dark needs a wash around 78–85%, or field alphas cut to roughly a third.
- **Hue source.** Fields can follow `--system-accent`
  (`src/renderer/src/lib/themeAccents.ts`, 8 accents) plus two fixed
  complements (rose, teal, amber) for the multi-hue look, or derive entirely
  from the accent for a quieter single-hue look.
- **Do not animate the fields.** They are static decoration; any motion competes
  with streaming text for the same paint budget and adds nothing.

### Field parameters used in the previews

```css
background:
  radial-gradient(
    70% 38% at 18% 4%,
    color-mix(in srgb, var(--system-accent) 95%, transparent),
    transparent 70%
  ),
  radial-gradient(60% 30% at 95% 40%, oklch(0.72 0.2 16 / 80%), transparent 70%),
  radial-gradient(70% 36% at 5% 72%, oklch(0.82 0.15 182 / 85%), transparent 72%),
  radial-gradient(60% 30% at 75% 98%, oklch(0.85 0.18 95 / 75%), transparent 70%);
```

```css
/* wash, light mode; dark raises the surface share */
backdrop-filter: blur(26px) saturate(1.35);
background: color-mix(in srgb, var(--sidebar-solid) 62%, transparent);
```

## Open questions

1. **Scope of the opaque change.** Either the window becomes opaque and only the
   sidebar gets a material (`--sidebar` stays, but over an opaque window it must
   be opaque itself), or `--sidebar` becomes `--sidebar-solid` and
   `has-data-[variant=inset]:bg-sidebar` in `components/ui/sidebar.tsx` changes
   with it. The second touches more surfaces and should be checked against the
   site's mock.
2. **Window background.** `backgroundColor: '#00000000'` must become an opaque
   value, otherwise the transparent backing shows as a flash while the renderer
   paints during launch, resize and fullscreen transitions.
3. **Overlay cleanup.** With vibrancy gone, `VIBRANCY_OVERLAY_CONTENT` could
   return to a normal translucent popover and the Settings popover over the
   sidebar would frost correctly. This is a separate decision from the sidebar
   background, and a separate diff.
4. **State coupling.** Fields could react to app state (a running session, the
   selected project) — the advantage a self-rendered background has over the OS
   material, but also a source of noise and meaningless motion if overdone.
5. **Losses.** The sidebar stops tracking the wallpaper: dragging the window over
   a colorful desktop no longer changes it, and it looks identical in full
   screen. That is the intent, but it is a visible change in behavior.

## Verification checklist (needs the real window)

- Launch flash, resize, and fullscreen transitions with an opaque
  `backgroundColor`.
- Toggle animation and drag resize with fields and wash present — watch for
  tearing or a one-frame gap at the panel edge.
- Settings popover over the sidebar: `backdrop-filter` over the wash.
- Light and dark × several accents, plus a narrow (220 px) and wide (360 px)
  sidebar, where the fields' percentage positions compress.

## If this goes ahead

1. `createMainWindow.ts`: drop `vibrancy`, set an opaque `backgroundColor`.
2. `designTokens.css`: make `--sidebar` opaque (or switch the panel to
   `--sidebar-solid`); add field and wash tokens so both themes are tuned in one
   place rather than inline.
3. One background component (two absolutely positioned layers) rendered by the
   sidebar panel; `components/ui/sidebar.tsx` gets `isolation: isolate`, or the
   layers live inside it.
4. Verify per the checklist, then reconcile the site mock.
