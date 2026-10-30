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
| `--radius-chip`       | 8px    | chips, badges, thumbnails, theme tiles                              | 20–24          | 35%    |
| `--radius-control-sm` | 10px   | `size-6` icon buttons, xs controls, markdown tables                 | 24–120         | 8–42%  |
| `--radius-control`    | 14px   | buttons, inputs, menu items, sidebar rows, markdown code blocks     | 28–120         | 12–50% |
| `--radius-surface-sm` | 16px   | tool blocks, thinking blocks, read groups, preview frames and rings | 40–240         | 7–40%  |
| `--radius-surface`    | 20px   | menus, branch summary, error notices                                | 38–170         | 12–27% |
| `--radius-surface-lg` | 24px   | message bubbles, cards                                              | 40–135         | 18–60% |
| `--radius-surface-xl` | 28px   | composer, queue bar                                                 | 110–135        | 21–25% |
| `--radius-container`  | 36px   | settings cards, page panels                                         | 80–290         | 12–45% |
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
- **A 0.5px hairline on a big radius is an outline.** `rounded-surface` (20px)
  with `ring-[0.5px]` draws its straight edges and loses the whole arc to
  antialiasing; a 0.5px `border` does the same. `VIBRANCY_OVERLAY_CONTENT`
  therefore draws its edge with `outline-[0.5px]`, which renders at every radius.
  Smaller radii (8–12px chips and cards) are fine with a ring.

## Type

`--text-3xs` 10 / `--text-2xs` 11 / `--text-caption` 13 / `--text-ui` 14 /
`--text-body` 15 / `--text-lg` 20 / `--text-xl` 24 / `--text-2xl` 28, plus
`--text-code-compact` 13 and `--text-code` 14. Every step multiplies by
`--app-font-ui-scale` (or `--app-font-code-scale`) so the size settings scale the
whole ramp instead of the root font size.

One scale, one set of names. Tailwind's `text-xs` / `text-sm` / `text-base`
(13 / 15 / 17px) are the steps this ramp replaced, and app code must not use
them: `text-xs` and `text-caption` were the same size under two names, and the
merge is what makes a role name mean one thing. They stay defined in
`designTokens.css` for the marketing site, which shares the file; `npm run
check` rejects them in `src/renderer`.

Line heights ship with the step: a step that declares its own
`--text-*--line-height` carries one, and a step that does not — every semantic
role here — emits no `line-height` at all, so the element inherits
`body { line-height: 1.6 }` from `main.css`. That is why a merged `text-sm` call
site renders at 15 × 1.6 = 24px and a `text-caption` at 13 × 1.6 = 20.8px, where
Tailwind's `13 / 15 / 17` steps carried 17 / 22 / 26px line boxes. Surfaces that
need a tighter or looser rhythm say so with a `leading-*` class — the composer's
editor is the one place that does.

Weights carry hierarchy, not size: 400 body, 500 row labels and control values,
600 page and group headings. Tracking is reserved for display-size type — the
page title (`-0.02em`) and the two top markdown headings (`-0.015em`,
`-0.011em`); at h3 and below the whole-line difference is a pixel or two and the
declaration earns nothing.

## Selection

`ACCENT_SELECTION_ROW_CLASS` in
`src/renderer/src/components/ui/selectionStyles.ts` carries the checked row:
the accent tint and accent text, with the check or icon in the accent and
secondary text muted. Short mode menus (View, Theme) add caption text on a
28px row; searchable lists stay at body size on their 32px rows and the
thinking flyout keeps body text on a tighter 28px row. Segmented controls
keep the muted track and white pill; they are a different affordance. Do not
introduce a second tint for a selected row.

## Spacing, elevation, motion

- `--spacing-row` 12 (label ↔ control), `--spacing-group` 16 (controls within a
  card), `--spacing-section` 36 (between settings groups).
- `--shadow-raised` (1px hairline lift), `--shadow-popover` (menus, dialogs),
  `--shadow-composer` (the one large soft shadow).
- `--duration-fast` 100ms (hover, focus), `--duration-base` 150ms (colour,
  opacity), `--duration-slow` 200ms (enter, exit), `--ease-standard`.

## Prose rhythm scales, chrome does not

Block spacing multiplies `--text-body`, never `em`: `em` resolves against the
font size of the element that owns the margin, so a 0.93em table or a 0.84em
code block silently shrinks its own gaps and the same block gap renders at
three different sizes in one message. Heading margins are part of the same
ladder, so raising the text size moves headings with the paragraphs around them.

A row inside a reply is one of three kinds — prose, a card (tool card, read
group), or a thinking card — and there are two rules only: neighbours of the
same kind sit at that kind's step, neighbours of different kinds sit at the
kind-change step. A message an extension injected (a letter from another
session, for instance) is a card of its own between replies. Reasoning and tool work are different groups of a reply, so
any change of kind is the widest gap inside it.

| Token                            | Value               | Where                                   |
| -------------------------------- | ------------------- | --------------------------------------- |
| `--message-item-spacing`         | `0.3 × --text-body` | bulleted list item ↔ item, nested lists |
| `--message-ordered-item-spacing` | `1.6 × --text-body` | ordered list item ↔ ordered list item   |
| `--message-text-spacing`         | `0.8 × --text-body` | prose ↔ prose                           |
| `--message-surface-spacing`      | `1.0 × --text-body` | card ↔ card, thinking ↔ thinking        |
| `--message-kind-change-spacing`  | `1.8 × --text-body` | any two different kinds                 |

`--markdown-*` alias the `--message-*` values, so the markdown body and the
transcript cannot drift apart. A 15px body gives 4.5 / 24 / 12 / 15 / 27. The
ordered-list step is deliberately twice the prose step: a numbered list is a
sequence of steps with real text in each one, and at the paragraph gap they read
as one run of text rather than as separate actions.

Headings are their own ladder, em against the body size so they scale with the
text-size setting: `1.618 / 1.462 / 1.318 / 1.188 / 1.076 / 1em` for h1…h6, with
line height running against size (`1.2 / 1.2 / 1.3 / 1.4 / 1.5 / 1.5`) and
tracking pulling in on the two display steps (`-0.015em` at h1, `-0.011em` at
h2). h6 is exactly the body size: a heading is a heading through weight and
space, and no step of the ladder drops below the paragraph it introduces.

Vertically every heading carries the prose step above and below, and a heading
that follows prose takes a break of `2 × --text-body` instead — 30px at the
default body, against a 12px prose gap and a 12px heading-to-heading gap. A
heading that opens a section reads as a boundary; two headings in a row read as
an outline, so they stay at the block step. A rule takes the same break on both
sides, since it separates sections too.

Fixed chrome, deliberately not scaling: the 25px hover action band, the 4px base
row gap, `pt-6`/`pb-2` on a user message.

## Corners are superellipses

`designTokens.css` declares `corner-shape: superellipse(1.5)` for every rounded
element except `.rounded-full`, inside `@layer base` so app rules can opt out.
The argument is half the classic exponent: 1.5 is `x³ + y³ = r³`, which leaves
the straight edge with zero curvature. 1 is a circle; 2 (the `squircle` keyword)
fills the corner further and reads squarer.

## An overlay exits through its own `display`

An overlay that fades out does not need JavaScript to remove it. Transition
`display` with `allow-discrete` alongside `opacity`, and give the open state its
first frame with `@starting-style`: the element stays for the length of the exit
and then leaves the layout by itself. One boolean in the component, no
`animationend` handler, no timer underneath in case that event never arrives,
and nothing that can desync from the state. `display: none` is also what keeps a
closed panel out of hit testing, the tab order and the accessibility tree, so
`inert` is only needed for the fade itself. The message minimap is the reference
(`.message-minimap-panel` in `main.css`). Keep the element mounted after its
first open — a hidden subtree costs no layout, and diffing 400 hidden rows
measured the same as diffing none.

## Adding a component

1. Pick the tier by role, not by look: is it a control, a content block, a card?
2. Check the ratio against the element's height. Over ~45% it is a pill; under
   ~10% it reads square, and the fix is usually a smaller container, not a
   bigger radius.
3. Use the token name in `className` (`rounded-surface-lg`) or
   `var(--radius-surface-lg)` in CSS. Never a pixel value.
4. If the element clips opaque children, add `corner-shape: round`.
5. Run `npm run check` — it fails on hard-coded radii, on Tailwind's own radius
   steps (`rounded-md`, `rounded-lg`, …) and on the primitive `--radius-sm…`
   variables. A component copied in with `shadcn add` arrives with the scale
   steps and has to be re-mapped to roles; that is deliberate, since a step's
   size moves with `--radius` and a role's does not.

## Checking a change

`__designTokens()` in the devtools console (dev builds only) renders every
radius tier against 64px / 28px / 140px boxes, the type ramp, the colour roles,
the shadows and the durations with the live theme applied. Esc closes it.
Source: `src/renderer/src/dev/designTokenSheet.ts`.
