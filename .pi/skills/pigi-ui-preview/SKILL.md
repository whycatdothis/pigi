---
name: pigi-ui-preview
description: Show the user a visual preview of a UI/design choice (color swatches, spacing options, skeleton states, side-by-side variants) by injecting a throwaway overlay into the running renderer and clip-screenshotting it. Use when comparing design options visually without reproducing the exact app state that renders them. Requires the dev app running with CDP (see pigi-debug).
---

# pigi UI Preview

Inject a fixed overlay into the running app, screenshot only its rect, `read` the
PNG. The overlay inherits the live theme, so using the target component's real
Tailwind classes gives a production-faithful crop. It is still a mock; for exact
fidelity trigger the real state.

```bash
RECT=$(node scripts/cdp.mjs eval '
(() => {
  document.getElementById("__preview")?.remove();
  const panel = document.createElement("div");
  panel.id = "__preview";
  panel.className = "bg-background border-border text-foreground";
  panel.style.cssText = "position:fixed;top:60px;left:40px;z-index:99999;display:flex;gap:16px;padding:16px;border:1px solid;border-radius:8px";
  panel.innerHTML = `<div class="animate-pulse rounded-md bg-muted" style="width:200px;height:16px"></div>`;
  document.body.appendChild(panel);
  const r = panel.getBoundingClientRect();
  return JSON.stringify({ x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) });
})()' | tail -1)
node scripts/cdp.mjs capture /tmp/preview.png "$RECT"      # clip scale defaults to 2
node scripts/cdp.mjs eval 'document.getElementById("__preview")?.remove()'
```

- Theme classes for the panel chrome (`bg-background`, `border-border`), never
  hardcoded colors: the app may be in dark mode.
- Put variants side by side in one panel; mirror real adjacency when elements
  interact (e.g. diff above a status footer).
- Keep the id `__preview` so re-running replaces instead of stacking.
