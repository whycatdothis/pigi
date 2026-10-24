# Appearance

Design plan for the appearance system: a ChatGPT-style settings page backed by
a single derivation pipeline, so every color, font, and size on screen comes
from one settings object instead of per-component decisions.

Status: plan. Implemented in phases (see [Phases](#phases)).

## Reference: ChatGPT's Appearance page

Observed from the app itself (macOS, 2026). The layout is the target for our
settings page; the capability list is the target for our data model.

| Area         | Control                                              | Behavior                                                                                      |
| ------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Visual style | Mode                                                 | Three preview cards (System / Light / Dark). The card is a miniature of the app, not an icon. |
|              | Theme                                                | Import, copy, and a dropdown with a `Aa` swatch preview.                                      |
|              | Accent                                               | Preset dropdown + custom swatch + hex field.                                                  |
|              | Background                                           | Swatch + hex field.                                                                           |
|              | Foreground                                           | Swatch + hex field.                                                                           |
|              | Font                                                 | Family dropdown.                                                                              |
| Advanced     | UI font size / Code font size                        | Numeric stepper in `px`, with a one-line description.                                         |
|              | Reduce motion                                        | `System` / `On` / `Off`.                                                                      |
|              | Separate light and dark modes                        | Switch; when on, every color and font setting below is edited per mode.                       |
|              | UI / Content / Code font + style                     | Family + weight per role, per mode.                                                           |
|              | Translucent sidebar                                  | Per mode.                                                                                     |
|              | Contrast                                             | Slider 0–100 with the numeric value; default 73.                                              |
|              | Diff markers                                         | Color vs `+`/`-` markers.                                                                     |
|              | Use pointer cursors, Dock icon, Font smoothing       | Desktop-app details.                                                                          |
| Footer       | Advanced disclosure (left), Reset to default (right) | Reset is page-level.                                                                          |

Everything applies instantly; there is no save button.

## Goals

1. **Appearance is data.** Colors, fonts, and sizes are derived from one
   persisted object. Components keep consuming semantic tokens and never branch
   on the theme.
2. **Per-mode from day one.** Light and dark are separate slots in the persisted
   model, with a shared slot when `separateModes` is off. Adding per-mode later
   would change the storage format; the model includes it now.
3. **Customizable without breaking relationships.** A custom background must
   carry `card`, `popover`, `muted`, `border`, and `sidebar` with it. That is a
   derivation problem, not a CSS problem.
4. **Contrast is a global dimension.** One slider moves the text ramp, borders,
   and surfaces together. Individual components do not own contrast decisions.
5. **Cheap to extend.** A new setting is: one field in the model, one line in
   the resolver, one row in the settings page. A new token is one entry in the
   derivation table.

## Non-goals

- Arbitrary per-component theming ("this card is red").
- User-supplied CSS or themes as files (only import/export of our own JSON).
- Deriving Shiki/xterm palettes from a custom background. Those palettes are
  fixed per mode; a custom background aligns the surfaces, not the syntax
  colors. See [Dependent surfaces](#dependent-surfaces).

## Data model

New file `src/shared/appearance.ts` (pure data, imported by renderer, tests, and
the main process if it ever needs the defaults).

```ts
export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorMode = 'light' | 'dark';
export type ReduceMotion = 'system' | 'on' | 'off';

/** A preset id, or a custom `#rrggbb`. */
export type AccentChoice = { presetId: string } | { hex: string };

export interface ModeAppearance {
  /** null = the built-in default for the resolved mode. */
  background: string | null;
  foreground: string | null;
  accent: AccentChoice;
  /** 0-100. 73 reproduces today's palette. */
  contrast: number;
  translucentSidebar: boolean;
  fonts: FontAppearance;
}

export interface FontAppearance {
  /** Family stacks; null = the built-in stack for the role. */
  ui: string | null;
  content: string | null;
  code: string | null;
  /** px values; the UI scale, anchored on the body text size. */
  uiSize: number; // default 15
  codeSize: number; // default 14
}

export interface AppearanceSettings {
  mode: ThemeMode;
  /** When false, the light slot is authoritative for both modes (see Resolution). */
  separateModes: boolean;
  light: ModeAppearance;
  dark: ModeAppearance;
  reduceMotion: ReduceMotion;
  fontSmoothing: boolean;
}

export interface PigiSettings {
  version: 2;
  appearance: AppearanceSettings;
  chat: { toolBlockViewMode: ToolBlockViewMode };
}
```

Defaults reproduce today's look:

```ts
export const DEFAULT_MODE_APPEARANCE: { light: ModeAppearance; dark: ModeAppearance } = {
  light: {
    background: null, // white
    foreground: null, // #1a1c1f
    accent: { presetId: 'indigo' },
    contrast: 73,
    translucentSidebar: true,
    fonts: { ui: null, content: null, code: null, uiSize: 15, codeSize: 14 },
  },
  dark: {
    background: null, // oklch(0.145 0 0)
    foreground: null, // oklch(0.985 0 0)
    accent: { presetId: 'indigo' },
    contrast: 73,
    translucentSidebar: true,
    fonts: { ui: null, content: null, code: null, uiSize: 15, codeSize: 14 },
  },
};
```

Accent presets move from `src/renderer/src/lib/themeAccents.ts` to
`src/shared/appearance.ts` (`ACCENT_PRESETS`, same eight entries with
`lightOklch` / `darkOklch` / `swatchHex`). The renderer file is deleted; its
DOM-writing function is replaced by the token pipeline.

### Storage and migration

One key (`pigi.settings`), now versioned:

```ts
// v1 (shipped on feat/settings-page)
{ theme: 'system', accentId: 'indigo', toolBlockViewMode: 'compact_read' }

// v2
{ version: 2, appearance: {...}, chat: { toolBlockViewMode } }
```

`parsePigiSettings` migrates v1 field by field:

- `theme` → `appearance.mode`
- `accentId` → both `light.accent` and `dark.accent` as presets
- `separateModes: false` (v1 had one accent for both modes)
- everything else → defaults

Writes are debounced (`requestIdleCallback` or a short timer) because a color
picker drag commits many values; the store keeps the in-memory value immediate
and the DOM update synchronous.

## Resolution

`resolveAppearance(settings, systemIsDark)` picks the slot and the effective
mode. Pure, no DOM.

```
resolvedMode = settings.mode === 'system'
  ? (systemIsDark ? 'dark' : 'light')
  : settings.mode

slot = settings.separateModes
  ? settings[resolvedMode]
  : settings.light        // shared slot
```

When `separateModes` is off, `null` colors still resolve to **the active
mode's** built-in default, so a shared theme means "same choices", not "light
colors in dark mode". An explicit background applies to both modes — that is
what "one mode" means.

Fonts are part of the slot, so `separateModes` also separates fonts (matching
ChatGPT). The two sizes (`uiSize`, `codeSize`) are the exception only in the
sense that they are numbers, not families.

## Token derivation

`deriveTokens(resolved) -> Record<CssVarName, string>` in
`src/shared/appearanceTokens.ts`. This is the only place that turns user input
into color values.

### Steps

1. **Normalize inputs.** `background` default per mode (`#ffffff` /
   `oklch(0.145 0 0)`), `foreground` default (`#1a1c1f` / `oklch(0.985 0 0)`).
   Both accept `#rgb`, `#rrggbb`, `rgb()`, `oklch()`.
2. **Contrast targets (absolute, WCAG-based).** The slider does not scale a
   hand-tuned ramp; it selects how much separation the theme must guarantee.
   Targets are floors: a stronger user foreground is never lowered.

   | Slider       | Secondary text            | Border / divider           |
   | ------------ | ------------------------- | -------------------------- |
   | 0            | 4.5:1 light / 5.5:1 dark  | 1.15:1 light / 1.25:1 dark |
   | 73 (default) | 5.0:1 light / 7.0:1 dark  | 1.3:1 light / 1.45:1 dark  |
   | 100          | 7.0:1 light / 10.0:1 dark | 3.0:1                      |

   Intermediate positions interpolate linearly. Dark mode asks for a higher
   physical ratio at the same slider position because the same ratio reads
   weaker on a dark background (Material's dark theme uses 60% white for
   secondary text, about 7.5:1 on `#121212`). The settings page shows the
   resolved ratio next to the slider, so the number is never opaque.

3. **Solving, not constants.** `mixUntilContrast(from, toward, reference,
ratio)` binary searches the mix amount (16 iterations) to hit a floor
   instead of using per-theme constants, so a custom background keeps the
   guarantee. Borders follow that solve; surfaces use fixed per-mode steps
   (see step 5) because they are decoration without a WCAG floor, and tying
   them to the slider made the default dark hover state (`--accent`) three
   times lighter than shipped.
4. **Foreground enforcement.** If the chosen foreground is below 7:1 against
   the chosen background, its derived lightness is pushed away from the
   background until it clears 7:1 (hue and chroma preserved). The stored value
   is not rewritten; only the token output is corrected.
5. **Surfaces and text.**

   ```
   card        = mix(bg, fg, 0 light / 0.0714 dark)
   popover     = card
   secondary   = mix(bg, fg, 0.037 light / 0.146 dark)
   muted       = secondary
   accent      = secondary                (hover fill)
   primary     = mix(bg, fg, 1 light / 0.925 dark)
   sidebar     = mix(bg, fg, 0 light / 0.148 dark)
   border      = mix(bg, fg, solved border amount)
   input       = border
   mutedText   = solve(fg toward bg until ratio >= target)
   ```

   The steps are the shipped palette expressed as mixes, so defaults are
   unchanged and custom backgrounds still get proportional surfaces.

6. **Accent.** Preset → the mode's `lightOklch` / `darkOklch`. Custom hex →
   convert to oklch, clamp `L` to `[0.50, 0.62]` (light) / `[0.68, 0.78]` (dark)
   and `C` to `[0.08, 0.22]`, then raise `L` until `contrast(accent, bg) >= 4.5`.
   `accentForeground` is the stronger of white and near-black against the
   accent, so a light accent gets dark text instead of unreadable white.
7. **Status colors.** Four roles × three tokens (`-fg`, `-bg`, `-border`),
   derived from fixed hues (`success 145`, `warning 75`, `danger 27`, `info 250`)
   with the mode's lightness, each solved to 4.5:1 against the background.
   These replace every raw `#166534` / `text-green-700` / `text-red-500` in the
   renderer.
8. **Sidebar.** `mix(bg, fg, surface * 0.8)`, then 55% alpha when
   `translucentSidebar` (today's value), opaque otherwise. `sidebarSolid` is the
   opaque equivalent (the existing mix formula, computed from the derived
   sidebar and background, not from literals).

### Default palette

The floors above change three values compared with today's hand-tuned palette;
everything else stays put, so the default look is preserved except where it was
below AA:

| Token                   | Today         | New default | Why                             |
| ----------------------- | ------------- | ----------- | ------------------------------- |
| Light secondary text    | 4.61:1        | 5.0:1       | Floor for secondary text        |
| Dark secondary text     | 7.62:1        | 7.0:1       | Same perceived strength on dark |
| Light border            | 1.26:1        | 1.3:1       | Hairlines were nearly invisible |
| Foreground / background | 17.1 / 18.9:1 | unchanged   | Already above AAA               |

Two token families are unified with the rest of the theme rather than kept as
their old one-off values: `--primary` / `--secondary-foreground` /
`--accent-foreground` / `--sidebar-*` now derive from the resolved foreground
(light `#1a1c1f` instead of a separate `#171717`), and `--sidebar-foreground`
follows it too (old light value was near-black `#0a0a0a`). The dark
`--sidebar-primary` used to be a stray blue (`#1447e6`) that no component
referenced; it now matches `--primary`. `--destructive` comes from the status
ramp at Tailwind-600 vividness, so it lands within 0.01 lightness of the old
red.

Dark background and foreground (`#0b0b0b` / `#fafafa`) stay as they are in
phase 1. Retuning them to the usual dark-theme practice (`#121212` surface,
~87% white foreground, which avoids halation and lands near 13:1) is a
separate, reviewed step with before/after screenshots — a value change, not a
mechanism change, and it should not ride along silently.

The full output table (all values are CSS strings so they can be written
verbatim):

| Token                                                              | Source                                      |
| ------------------------------------------------------------------ | ------------------------------------------- |
| `--app-background` / `--app-foreground`                            | inputs                                      |
| `--app-card`, `--app-card-foreground`                              | surface(0.25) / fg                          |
| `--app-popover`, `--app-popover-foreground`                        | surface(0.50) / fg                          |
| `--app-secondary`, `--app-secondary-foreground`                    | surface(1.0) / fg                           |
| `--app-muted`, `--app-muted-foreground`                            | surface(1.0) / mutedText                    |
| `--app-accent`, `--app-accent-foreground`                          | surface(1.6) / fg                           |
| `--app-primary`, `--app-primary-foreground`                        | fg / bg                                     |
| `--app-destructive`                                                | status.danger.fg                            |
| `--app-border`, `--app-input`, `--app-ring`                        | border / border / accent                    |
| `--app-sidebar`, `--app-sidebar-solid`, `--app-sidebar-foreground` | sidebar ramp / opaque equivalent / fg       |
| `--app-sidebar-accent`, `--app-sidebar-accent-foreground`          | fg at 10% alpha / fg                        |
| `--app-sidebar-border`, `--app-sidebar-ring`                       | border / accent                             |
| `--app-system-accent`                                              | accent                                      |
| `--app-success-fg`, `--app-success-bg`, `--app-success-border`     | status ramp                                 |
| `--app-warning-*`, `--app-danger-*`, `--app-info-*`                | status ramp                                 |
| `--app-chart-1..5`                                                 | fixed (documented as not user-customizable) |
| `--font-ui`, `--font-content`, `--font-code`                       | fonts                                       |
| `--font-ui-scale`, `--font-code-scale`                             | sizes                                       |

`--dialog-solid` and `--search-highlight-bg` stay as `color-mix()` rules in
CSS that reference the tokens, so they follow automatically.

### Invariants (unit-tested)

`deriveTokens` must satisfy these for every preset, both modes, contrast
`0 / 73 / 100`, and a set of sample custom backgrounds (white, beige, navy,
mid-grey):

- `contrast(fg, bg) >= 7`
- `contrast(mutedText, bg) >= target(contrast, mode).secondaryText`
- `contrast(accent, bg) >= 4.5`
- `contrast(accentForeground, accent) >= 4.5`
- `contrast(successFg, bg) >= 4.5`, same for warning/danger/info
- `contrast(border, bg) >= target(contrast, mode).border`, and the border ratio
  is monotonic in `contrast`
- with `contrast >= 73` on the default palette, every token ratio is at least
  the documented default in [Default palette](#default-palette)
- a mid-grey background still yields a readable theme: the solver falls back
  to the better of black and white rather than a half-step (7:1 is physically
  unreachable on mid grey, and the page says so instead of pretending)

Color math lives in `src/shared/colorMath.ts` (hex ↔ rgb ↔ oklab/oklch, mix,
WCAG contrast). No dependency: the conversions are ~150 lines and are needed in
tests, the renderer, and possibly the marketing site.

## Applying tokens

`src/renderer/src/appearance/applyAppearance.ts`:

```ts
export function applyAppearance(settings: AppearanceSettings): ResolvedAppearance {
  const resolved = resolveAppearance(settings, systemIsDark());
  const tokens = deriveTokens(resolved);

  const root = document.documentElement;
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
  root.classList.toggle('dark', resolved.mode === 'dark');
  root.classList.toggle('light', resolved.mode === 'light');
  root.dataset.reduceMotion = String(resolved.reduceMotion);
  root.dataset.fontSmoothing = resolved.fontSmoothing ? 'on' : 'off';

  notifyAppearanceChange(resolved); // terminal, Shiki, charts
  return resolved;
}
```

- Called synchronously from `initializePigiSettings()` in `main.tsx` **before**
  React renders, so the first paint is already correct. No flash.
- Called again on every committed settings change; writing ~45 custom
  properties on one element is a single style recalculation.
- `prefers-color-scheme` and `prefers-reduced-motion` listeners re-apply when
  the mode is `system` / reduce motion is `system`.
- Subscribers (`subscribeAppearance`) let surfaces that cannot use CSS variables
  react: xterm, Shiki, the mini-map canvas, and the terminal theme reader.

### CSS indirection

`src/shared/designTokens.css` keeps its current literals as the website's
defaults, but each app-facing token now reads the engine's value first:

```css
:root {
  --background: var(--app-background, oklch(1 0 0));
  --foreground: var(--app-foreground, #1a1c1f);
  /* ... */
  --system-accent: var(--app-system-accent, var(--accent-light, oklch(0.55 0.2 277.1)));
  --success-fg: var(--app-success-fg, oklch(0.45 0.13 145));
}
.dark {
  --background: var(--app-background, oklch(0.145 0 0));
  --foreground: var(--app-foreground, oklch(0.985 0 0));
  --system-accent: var(--app-system-accent, var(--accent-dark, oklch(0.7 0.17 277.1)));
  --success-fg: var(--app-success-fg, oklch(0.78 0.13 145));
}
```

Inline custom properties on `<html>` win over both `:root` and `.dark`, so the
engine is the single writer in the app while `website/` keeps working from the
same file.

`--accent-light` / `--accent-dark` stay as documented fallbacks; the renderer
no longer sets them.

## Typography

Three roles, three families, one runtime knob each:

| Role    | Cascade property        | Fallback when unset      |
| ------- | ----------------------- | ------------------------ |
| UI      | `--font-ui` on `<html>` | System stack             |
| Content | `--font-sans` (theme)   | System stack             |
| Code    | `--font-mono` (theme)   | SF Mono + `ui-monospace` |

`deriveTokens` writes `--app-font-ui`, `--app-font-content`, and
`--app-font-code`; the shared stylesheet keeps the literal stacks as
fallbacks, so the marketing site never depends on the renderer. `--font-ui`
lives in `:root` (chrome), `--font-sans` is consumed by `.user-content` and the
`font-sans` utility (message text), and `--font-mono` replaced the three copies
of the mono stack in `assets/main.css` plus the `font-mono` utility.

### Sizes

One UI scale plus one code scale, both anchored on today's values:

| Token                 | Default | Scale |
| --------------------- | ------- | ----- |
| `--text-3xs`          | 10px    | ui    |
| `--text-2xs`          | 11px    | ui    |
| `--text-caption`      | 13px    | ui    |
| `--text-ui`           | 14px    | ui    |
| `--text-body`         | 15px    | ui    |
| `--text-xs`           | 13px    | ui    |
| `--text-sm`           | 15px    | ui    |
| `--text-base`         | 17px    | ui    |
| `--text-lg`           | 20px    | ui    |
| `--text-xl`           | 24px    | ui    |
| `--text-code-compact` | 13px    | code  |
| `--text-code`         | 14px    | code  |

`--font-ui-scale = uiSize / 15`, `--font-code-scale = codeSize / 14`, and each
token is `calc(<default>px * var(--app-font-*-scale))`. Root font size is
**not** touched: spacing is rem-based and must not scale with text. `body`
(14px), the type scale above, and the code sizes all use the scales;
`--text-xs` / `--text-sm` / `--text-base` keep their existing rem anchors so
their line-height ratios stay put.

**Consolidation.** The renderer has 54 arbitrary sizes (`text-[10px]`…`text-
[15px]`) across five values. Each maps to the closest token:

| Arbitrary     | Token                                | Typical use             |
| ------------- | ------------------------------------ | ----------------------- |
| `text-[10px]` | `text-3xs`                           | badges, counts          |
| `text-[11px]` | `text-2xs`                           | metadata                |
| `text-[13px]` | `text-caption` / `text-code-compact` | secondary UI, mono rows |
| `text-[14px]` | `text-ui` / `text-code`              | plain text, tool output |
| `text-[15px]` | `text-body`                          | message content         |

The sweep is done: `rg 'text-\[[0-9]+px\]'` returns nothing in
`src/renderer/src`. The new tokens carry no line-height, so replacing an
arbitrary size kept the inherited leading exactly as it was; `text-xs` /
`text-sm` / `text-base` were left alone for the places that want Tailwind's
line-height.

### Terminal

`terminalController.ts` reads `--app-font-code` and scales its shipped 15px by
`--app-font-code-scale` (the code size, anchored at 14px), so the default stays
15px and a size change moves the terminal proportionally. `TerminalPanel`
subscribes to `subscribeAppearance` (replacing the old class MutationObserver)
and `applyAppearance()` updates the palette, family, and size of every cached
terminal, then refits the active one.

## Motion

`reduceMotion: 'system' | 'on' | 'off'` resolves to
`<html data-reduce-motion="true">`. The media query in `assets/main.css`
becomes a single attribute selector plus one variant:

```css
@custom-variant reduce-motion (&:where([data-reduce-motion='true'] *));
```

The attribute is set from the resolved `reduceMotion` (system preference or an
explicit on/off), and the six `motion-reduce:` utilities in the renderer are
now `reduce-motion:`. The global kill switch becomes:

```css
[data-reduce-motion='true'] *,
[data-reduce-motion='true'] *::before,
[data-reduce-motion='true'] *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}
```

The five existing `motion-reduce:` usages switch to `reduce-motion:`.
JS resolves `system` against `matchMedia` so CSS has one boolean to read.

## Settings page

`appearanceSettings.tsx` is rewritten to the reference layout and uses the
existing `SettingsGroup` / `SettingsRow` primitives plus
`components/settings/appearanceControls.tsx`:

- `ColorField` — one bordered field holding a round swatch and the hex value;
  the swatch opens the native picker, the hex commits on blur/Enter, and the
  field grows a ring on focus. Used for background and foreground.
- `AccentField` — one button per preset (the stored value is the preset id, so
  the tuned per-mode colors survive) plus a rainbow ring for a custom hex.
- `SliderField` — range input with the resolved value and contrast ratio on the
  right, e.g. `73 · 5.0:1`.
- `NumberInput` — a small bordered field with the unit outside it, committed on
  blur/Enter and clamped to the range (font sizes).
- `ThemePresetField` — the named theme menu: `Aa` tile tinted with the theme's
  accent, the name, and a chevron. Selecting one applies both mode slots; the
  label reads `Custom` as soon as a color no longer matches a preset.
- `FontPicker` — a compact native select over the whitelist (no preview glyph,
  single chevron); the code role's empty option reads "System mono".
- `ModePreviewPicker` — three icon-only miniature windows (System / Light /
  Dark), 100x70, drawn from the _derived_ tokens of each mode, so a custom
  palette or a named theme shows up in them immediately. The captured object is
  a unit: the app's own background, a 5px margin, then the window (background
  mixed 4% toward the foreground, hairline border mixed from the preview's own
  palette, 8px radius) holding a full-height sidebar bar next to an inset
  content card. The card keeps 6px of padding: two muted lines from the left and
  two accent lines from the right (assistant, then user), then the composer with
  a send dot. The sidebar bar is mixed from the window color rather than
  `--app-sidebar`, which is nearly white on the light side. The system preview
  renders two units at full size, crops both at the same point from the left,
  and stitches the halves, so the seam carries the dark unit's own background
  margin instead of gluing the two drawings together. Selection is the picker's
  own 2px accent border, never a ring stacked on the drawing; the name is an
  `aria-label`, shown on hover.
- `SettingSwitch` — row plus switch for the boolean preferences.

Structure. Everything is visible at once: there is no collapsed advanced
section, and the groups are ordered the way the page is read — what the theme
is, how text is set, then the details.

```
Appearance                                  (page title, text-xl)
Mode                                        (its own card, no title)
  Mode              [▤] [▤] [▤]             (ModePreviewPicker, icons only)
Visual style                                (SettingsGroup title)
  Theme             ⤓ ⧉ [Aa Nord ▾]         (icons: import, copy)
  Accent            ●●●●●●●● + custom       (AccentField)
  Background        [● #FFFFFF]            (ColorField)
  Foreground        [● #0D0D0D]            (ColorField)
  Contrast          [——●——] 73 · 5.0:1
  Separate light and dark modes  [switch]
  Editing           [Light | Dark]          (only when separate modes are on)
Typography
  Font              [System ▾]              (content role)
  UI font           [System ▾]
  UI font size      [15] px
  Code font         [System mono ▾]
  Code font size    [14] px
Details
  Translucent sidebar  [switch]
  Font smoothing    [switch]
  Reduce motion     [System | On | Off]
Reset appearance                            (footer row, right)
```

- Rows are label plus control, one line each; nothing on this page needs a
  caption under the label, so every row is 48px high. The Mode row uses the
  same padding with a 100x70 preview, which makes it 80px tall.
- Type carries the hierarchy by weight, not size: page title 16/600, group
  title 13/600 muted, row label 14/500, control text 13/400 with tabular
  numerals. Every control is 28px tall so the right column lines up.
- One radius scale: card 15, control 8, small chip 6, mode preview window 8
  inside a 12 tray and a 13 selection border.
- Surfaces are solid (`bg-card` with a 1px `--border`); the dividers use the
  same solid border color and stay inset to the row padding.
- The settings column is 660px wide (`SETTINGS_CONTENT_MAX_WIDTH`); the
  transcript column is wider, but label/control rows read badly when stretched.
- Rows share one card; the divider between rows is inset by the row's own
  padding (`before:inset-x-5`) instead of running edge to edge, so it lines up
  with the labels. Group titles sit flush with the card's left edge.

### Named themes

`src/shared/themePresets.ts` holds the shipped palettes: `pigi` (the built-in
look), GitHub, Catppuccin, Nord, Gruvbox, Everforest, Notion, Linear. Each one
is a pair of color-only slots (`background`, `foreground`, `accent`); fonts,
contrast, and translucency stay whatever the user picked.

- Selecting a theme writes **both** slots, so the light and dark sides match.
  When the two slots differ the theme also turns separate modes on; sharing one
  palette across modes would hide half of it.
- Nothing extra is persisted: the active theme is derived by matching the
  slot's colors against the list, so editing any color falls back to `Custom`
  on its own and an imported theme file is matched the same way.
- The download and copy buttons in the Theme row are the same clipboard
  actions described under [Theme portability](#phase-4--theme-portability-copy-and-import-shipped).

- Edits always apply to the resolved slot: `light` or `dark` when separate
  modes are on (chosen with the `Editing` control, default = current mode),
  otherwise the shared `light` slot.
- The page shows the mode it is editing in the `Editing` control; it never
  flips the app theme just to preview. The preview cards are the preview.
- `Reset appearance` restores `DEFAULT_MODE_APPEARANCE` for the whole
  appearance object (per-row reset is not needed; contrast is one slider).

## Dark-mode audit fixes

These are defects found in the current code and are in scope for phase 3:

| File                                                                             | Problem                                                                                   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `components/message/ToolBlock.tsx:104-119`                                       | Status hexes `#854d0e`, `#166534`, `#991b1b`, `#3f3f46` are light-only.                   |
| `components/message/CollapsedReadGroup.tsx:68-70`                                | Same three hexes.                                                                         |
| `components/ui/sonner.tsx:35-39`                                                 | `--success-text` / `--error-text` light-only hex.                                         |
| `components/sidebar/sessionList.tsx:369`                                         | `hover:bg-[#e5e5e5]` light-only.                                                          |
| `components/transcript/StreamingQueue.tsx:90,104`                                | `text-yellow-600`, `text-blue-500` with no dark variant.                                  |
| `components/transcript/MessageSearch.tsx:196`                                    | `text-red-500` ≈ 3.9:1 on white.                                                          |
| `components/message/syntaxHighlightedCode.tsx:35`                                | Shiki theme is hardcoded `one-light` in dark mode.                                        |
| `components/chatInput/index.tsx:114`, `components/update/UpdateProgress.tsx:107` | `text-white` on the accent; 3.2–4.0:1 for light accents.                                  |
| `src/main/index.ts` (appearance IPC)                                             | Native window chrome, menus, and `prefers-color-scheme` follow the OS, not the app theme. |

Fixes: status tokens for the first six; Shiki base theme from background
luminance plus the 3:1 token pass (re-tokenize when the background changes;
cache keyed by base theme); `--app-accent-foreground` for accent-on-accent
text. The last row is an IPC message (`pi:set_appearance_theme`) that sets
`nativeTheme.themeSource`, re-applies the window's vibrancy material, and lets
native menus follow the chosen mode. It does not change what a translucent
sidebar looks like: the material is meant to show the desktop behind the
window, so a light wallpaper still reads light — turning translucency off
gives an opaque sidebar that follows the palette exactly.

## Dependent surfaces

- **xterm**: palette stays Atom One Light/Dark (fixed). Background already
  tracks `--background`; foreground stays the palette's own to keep ANSI colors
  legible. Font family/size follow the code role.
- **Shiki**: the base theme is chosen by the _measured luminance of the actual
  background_, not by the mode (`one-light` for light backgrounds,
  `one-dark-pro` for dark ones — the package ships `one-dark-pro`, there is no
  `one-dark`). The theme's `tokenColors[].settings.foreground` are then passed
  through one generic pass: keep hue and chroma, move lightness away from the
  background until each token clears **3:1** — the WCAG rate for large text and
  UI graphics, which is what code tokens are. Tokens already at or above 3:1
  are left alone, so the default look barely changes (one-light's comment color
  is 2.58:1 on white and gets corrected; strings at 3.21:1 stay).
  Shiki's own `colors.background` is never used: the code block background is
  our `--muted` token, so it always follows the palette.
- **Marketing site**: imports `designTokens.css` unchanged; `--app-*` is unset
  there, so literals apply.

## File map

```
src/shared/
├── appearance.ts              # Types, defaults, presets, parse/migrate/serialize
├── appearanceTokens.ts        # resolveAppearance + deriveTokens + invariants
├── colorMath.ts               # hex/rgb/oklch/oklab, mix, WCAG contrast
└── designTokens.css           # token defaults + --app-* indirection

src/renderer/src/
├── appearance/applyAppearance.ts   # DOM writer + subscribeAppearance
├── components/settings/
│   ├── appearanceSettings.tsx      # The page
│   ├── appearanceControls.tsx      # ColorField, SliderField, ModePreviewPicker, ...
│   └── settingsControls.tsx        # existing primitives (+ NumberStepper/FontPicker)
├── components/terminal/terminalController.ts   # subscribes to font changes
├── components/message/syntaxHighlightedCode.tsx # mode-aware Shiki theme
└── state/settingsStore.ts          # appearance slice + setters + migration
```

Tests (vitest, jsdom project):

- `src/shared/colorMath.test.ts` — round trips, clamping, known contrast pairs.
- `src/shared/appearance.test.ts` — parse/migrate/defaults, per-mode resolution.
- `src/shared/appearanceTokens.test.ts` — the invariant list above, default
  parity with `designTokens.css`.
- `src/renderer/src/state/settingsStore.test.ts` — commit → persist → apply
  (with a jsdom `<html>`), reset, migration from v1.

## Phases

Each phase is independently shippable and leaves the app working.

### Phase 1 — Model and pipeline (no visual change) · shipped

- `colorMath.ts`, `appearance.ts` (types, presets, parse/migrate), `appearanceTokens.ts`.
- `designTokens.css` `--app-*` indirection; `applyAppearance` writes tokens.
- `settingsStore` stores v2 and applies on commit; `main.tsx` unchanged in shape.
- Existing `AppearanceSettings` keeps working through the new store fields.

Acceptance: `npm run check`, the new unit tests, and a scripted comparison that
defaults render the same computed colors as before (within 3%).

### Phase 2 — Settings page · shipped

- New controls, ChatGPT-like layout, Advanced disclosure, reset.
- Per-mode editor (`Separate light and dark modes` + `Editing`).
- Font sizes and families wired through tokens.
- `reduce-motion` variant replaces `motion-reduce:` and the media query, so the
  setting works even when the OS preference is off.

Acceptance: every control writes through the store; previews match applied
tokens; keyboard and screen-reader labels on the new controls; `npm run check`.

### Phase 3 — Audit fixes and consolidation · shipped

- Status tokens replace the eight defect sites, including `DiffView` and the
  settings-page warning, which now use the success/danger/warning pairs.
- 54 arbitrary font sizes → tokens.
- Terminal follows code font/size live.
- Native window material and menus follow the chosen mode
  (`nativeTheme.themeSource`), not only the OS.

Acceptance: `rg 'text-\[[0-9]+px\]'` clean; dark-mode pass over transcript,
sidebar, settings, dialogs, terminal; no `#` hexes in components outside
`designTokens.css` / `terminalTheme.css`.

### Phase 4 — Theme portability (copy and import shipped)

A theme is the whole appearance object in a small envelope, so a look travels
as text (`src/shared/themeFile.ts`):

```json
{ "kind": "pigi-theme", "version": 1, "appearance": { ... } }
```

- `Copy theme` writes that JSON to the clipboard; `Import theme` opens a dialog
  with a textarea and replaces the appearance on success.
- The envelope is strict (`kind`, numeric `version`, an `appearance` object)
  and the payload is parsed by the same tolerant `parseAppearance`, so a file
  from an older build still imports. A newer `version` is refused with a
  readable message instead of applying half a theme.
- Not done yet: user-saved named themes, file drag-and-drop, and exported
  preview thumbnails on the Mode picker.

## Decisions

1. **Syntax highlighting follows the background, not the mode.** Base theme
   picked by background luminance, token colors solved to 3:1. See
   [Dependent surfaces](#dependent-surfaces).
2. **Fonts come from a whitelist**, not free text, so a missing family cannot
   silently fall back (and the picker can show a real preview):
   `System`, `SF Pro`, `SF Mono`, `Helvetica Neue`, `Inter`, `JetBrains Mono`,
   `Menlo`, `Georgia`, `Iowan Old Style`. The list is a constant in
   `src/shared/appearance.ts`; adding one is a data change.
3. **Contrast is absolute (WCAG floors), interpolated across the slider.**
   Floors, not exact values: a stronger foreground is never weakened. The page
   shows the resolved ratio next to the slider.
4. **Marketing site.** `designTokens.css` stays the shared default source. Any
   new token must keep a literal default so the site never depends on the
   engine.
