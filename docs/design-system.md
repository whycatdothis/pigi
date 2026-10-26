# Design system

Two layers, and components only touch the second one.

| Layer     | File                                         | Holds                                                                                  |
| --------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Primitive | `src/shared/designTokens.css`                | Colours, families, the type scale, the Tailwind radius scale. Shared with the website. |
| Semantic  | `src/renderer/src/assets/semanticTokens.css` | Radius, spacing, elevation and motion by role. App only.                               |

The appearance engine writes `--app-*` custom properties on `<html>`
(`applyAppearance`), and the primitive layer maps them onto the shadcn colour
names. Semantics do not carry colours: a colour is either an `--app-*` role or a
status token (`--success-fg`, `--danger-bg`, …).

## Radius

One tier per kind of surface. The number is not the point — the ratio between
radius and the element's **short side** is. A corner reads round at roughly a
third of the height; below a tenth it reads square.

| Token                 | Value  | Applied to                                                          | Typical height | Ratio  |
| --------------------- | ------ | ------------------------------------------------------------------- | -------------- | ------ |
| `--radius-inline`     | 6px    | inline code, kbd                                                    | 18–22          | 30%    |
| `--radius-chip`       | 8px    | chips, badges, thumbnails, markdown tables                          | 20–24          | 35%    |
| `--radius-control-sm` | 10px   | `size-6` icon buttons, xs controls                                  | 24             | 42%    |
| `--radius-control`    | 14px   | buttons, inputs, menu items, sidebar rows, markdown code blocks     | 28–120         | 12–50% |
| `--radius-surface-sm` | 16px   | tool blocks, thinking blocks, read groups, preview frames and rings | 40–240         | 7–40%  |
| `--radius-surface`    | 20px   | menus, branch summary, error notices                                | 38–170         | 12–27% |
| `--radius-surface-lg` | 24px   | message bubbles, cards                                              | 40–135         | 18–60% |
| `--radius-container`  | 36px   | settings cards, page panels, composer                               | 80–290         | 12–45% |
| `--radius-full`       | 9999px | circles, and pills whose height is unknown                          | —              | —      |

Rules that come up every time:

- **The browser clamps.** Adjacent radii may not exceed the edge they share, so
  `2 × radius ≤ height` for a single element. Anything above that renders as a
  pill no matter what the class says — a 36px bubble is already fully round at
  18px. Raising the number past that changes nothing.
- **Concentric insets.** A child inset by `d` inside a parent with radius `r`
  needs `r − d`. The theme badge (inset 5px in a 14px control) uses `chip`.
- **Children inherit.** A header or footer that sits flush against its parent's
  edge declares no radius at all: the parent clips it. Declaring `rounded-t-md`
  inside a 20px card leaves a notch where the tighter corner pulls away.
- **Pills stay circles.** `border-radius: 50%` plus a superellipse is a
  squircle, not a circle, which is why `corner-shape` skips `.rounded-full`.
- **Clipping follows the shape.** Chrome clips `overflow: hidden` children with
  the same `corner-shape` the box declares, so a drawing that fills its frame
  still keeps the corner. Markdown tables are the one opt-out, and for a
  different reason: their cells paint over the border arc, so the container
  needs `round` to keep the arc and the fill agreeing.

## Type

`--text-3xs` 10 / `--text-2xs` 11 / `--text-caption` 13 / `--text-ui` 14 /
`--text-body` 15 / `--text-lg` 20 / `--text-xl` 24 / `--text-2xl` 28, plus
`--text-code-compact` 13 and `--text-code` 14. Every step multiplies by
`--app-font-ui-scale` (or `--app-font-code-scale`) so the size settings scale the
whole ramp instead of the root font size.

Weights carry hierarchy, not size: 400 body, 500 row labels and control values,
600 page and group headings. Tracking is reserved for the page title
(`-0.02em`). Line heights ship with the step (`--text-*--line-height`).

## Spacing, elevation, motion

- `--spacing-row` 12 (label ↔ control), `--spacing-group` 16 (controls within a
  card), `--spacing-section` 36 (between settings groups).
- `--shadow-raised` (1px hairline lift), `--shadow-popover` (menus, dialogs),
  `--shadow-composer` (the one large soft shadow).
- `--duration-fast` 100ms (hover, focus), `--duration-base` 150ms (colour,
  opacity), `--duration-slow` 200ms (enter, exit), `--ease-standard`.

## Corners are superellipses

`designTokens.css` declares `corner-shape: superellipse(1.5)` for every rounded
element except `.rounded-full`, inside `@layer base` so app rules can opt out.
The argument is half the classic exponent: 1.5 is `x³ + y³ = r³`, which leaves
the straight edge with zero curvature. 1 is a circle; 2 (the `squircle` keyword)
fills the corner further and reads squarer.

## Adding a component

1. Pick the tier by role, not by look: is it a control, a content block, a card?
2. Check the ratio against the element's height. Over ~45% it is a pill; under
   ~10% it reads square, and the fix is usually a smaller container, not a
   bigger radius.
3. Use the token name in `className` (`rounded-surface-lg`) or
   `var(--radius-surface-lg)` in CSS. Never a pixel value.
4. If the element clips opaque children, add `corner-shape: round`.
5. Run `npm run check` — it fails on hard-coded radii, font sizes and shadows.

## Checking a change

`__designTokens()` in the devtools console (dev builds only) renders every
radius tier against 64px / 28px / 140px boxes, the type ramp, the colour roles,
the shadows and the durations with the live theme applied. Esc closes it.
Source: `src/renderer/src/dev/designTokenSheet.ts`.
