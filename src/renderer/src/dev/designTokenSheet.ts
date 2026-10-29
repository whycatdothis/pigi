/**
 * Dev-only sheet that renders the token set from `assets/semanticTokens.css`
 * against the live theme, so a radius or type change can be judged in one place
 * instead of hunting for an example component. Opened with `__designTokens()`
 * from the console or CDP. Installed from main.tsx only when import.meta.env.DEV.
 */

const SHEET_ID = 'design-token-sheet';

const RADIUS_TOKENS = [
  '--radius-inline',
  '--radius-chip',
  '--radius-control-sm',
  '--radius-control',
  '--radius-surface-sm',
  '--radius-surface',
  '--radius-surface-lg',
  '--radius-container',
];

const TEXT_TOKENS = [
  '--text-3xs',
  '--text-2xs',
  '--text-caption',
  '--text-ui',
  '--text-body',
  '--text-lg',
  '--text-xl',
  '--text-2xl',
  '--text-code',
];

const WEIGHTS = [
  ['normal', 400],
  ['medium', 500],
  ['semibold', 600],
  ['bold', 700],
] as const;

const COLOR_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--muted',
  '--muted-foreground',
  '--accent-subtle',
  '--border',
  '--system-accent',
  '--success-fg',
  '--warning-fg',
  '--danger-fg',
  '--info-fg',
];

const SHADOW_TOKENS = ['--shadow-raised', '--shadow-popover', '--shadow-composer'];

const MOTION_TOKENS = ['--duration-fast', '--duration-base', '--duration-slow'];

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function toPixels(value: string): number {
  return Number.parseFloat(value);
}

function section(title: string): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:26px';
  const heading = document.createElement('h2');
  heading.textContent = title;
  heading.style.cssText =
    'margin:0;font-size:var(--text-caption);font-weight:600;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:0.04em';
  wrapper.append(heading);
  return wrapper;
}

function row(label: string, content: HTMLElement): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;align-items:center;gap:16px';
  const name = document.createElement('span');
  name.textContent = label;
  name.style.cssText =
    'width:190px;flex:none;font-family:var(--font-mono);font-size:11px;color:var(--muted-foreground);text-align:right';
  wrapper.append(name, content);
  return wrapper;
}

function radiusSection(): HTMLElement {
  const wrapper = section('Radius');
  for (const token of RADIUS_TOKENS) {
    const value = readToken(token);
    const radius = toPixels(value);
    const content = document.createElement('div');
    content.style.cssText = 'display:flex;align-items:center;gap:14px';

    const large = document.createElement('div');
    large.style.cssText = `width:64px;height:64px;background:var(--system-accent);border-radius:${value}`;
    const small = document.createElement('div');
    small.style.cssText = `width:120px;height:28px;background:var(--muted);border:1px solid var(--border);border-radius:${value}`;
    const tall = document.createElement('div');
    tall.style.cssText = `width:120px;height:140px;background:var(--muted);border:1px solid var(--border);border-radius:${value}`;
    const caption = document.createElement('span');
    caption.textContent = `${value} · 64px 方块 ${Math.round((radius / 64) * 100)}% · 28px 高 ${Math.round((radius / 28) * 100)}% · 140px 高 ${Math.round((radius / 140) * 100)}%`;
    caption.style.cssText =
      'font-family:var(--font-mono);font-size:11px;color:var(--muted-foreground)';

    content.append(large, small, tall, caption);
    wrapper.append(row(token, content));
  }
  return wrapper;
}

function typeSection(): HTMLElement {
  const wrapper = section('Type');
  for (const token of TEXT_TOKENS) {
    const value = readToken(token);
    const content = document.createElement('div');
    content.style.cssText = 'display:flex;align-items:baseline;gap:14px';
    const sample = document.createElement('span');
    sample.textContent = 'The quick brown fox 0123456789';
    sample.style.cssText = `font-size:${value};color:var(--foreground)`;
    const caption = document.createElement('span');
    caption.textContent = `${value} · ${Math.round(toPixels(value))}px`;
    caption.style.cssText =
      'font-family:var(--font-mono);font-size:11px;color:var(--muted-foreground)';
    content.append(sample, caption);
    wrapper.append(row(token, content));
  }
  for (const [name, weight] of WEIGHTS) {
    const content = document.createElement('div');
    content.style.cssText = 'display:flex;align-items:baseline;gap:14px';
    const sample = document.createElement('span');
    sample.textContent = `${name} — settings row label`;
    sample.style.cssText = `font-size:var(--text-ui);font-weight:${weight};color:var(--foreground)`;
    content.append(sample);
    wrapper.append(row(`weight ${weight}`, content));
  }
  return wrapper;
}

function colorSection(): HTMLElement {
  const wrapper = section('Color');
  for (const token of COLOR_TOKENS) {
    const value = readToken(token);
    const content = document.createElement('div');
    content.style.cssText = 'display:flex;align-items:center;gap:14px';
    const swatch = document.createElement('div');
    swatch.style.cssText = `width:64px;height:28px;border-radius:var(--radius-chip);border:1px solid var(--border);background:${value}`;
    const caption = document.createElement('span');
    caption.textContent = value;
    caption.style.cssText =
      'font-family:var(--font-mono);font-size:11px;color:var(--muted-foreground)';
    content.append(swatch, caption);
    wrapper.append(row(token, content));
  }
  return wrapper;
}

function shadowSection(): HTMLElement {
  const wrapper = section('Elevation');
  for (const token of SHADOW_TOKENS) {
    const value = readToken(token);
    const content = document.createElement('div');
    content.style.cssText = 'display:flex;align-items:center;gap:14px';
    const box = document.createElement('div');
    box.style.cssText = `width:120px;height:56px;border-radius:var(--radius-surface);background:var(--card);border:1px solid var(--border);box-shadow:${value}`;
    const caption = document.createElement('span');
    caption.textContent = value;
    caption.style.cssText =
      'font-family:var(--font-mono);font-size:11px;color:var(--muted-foreground)';
    content.append(box, caption);
    wrapper.append(row(token, content));
  }
  return wrapper;
}

function motionSection(): HTMLElement {
  const wrapper = section('Motion');
  for (const token of MOTION_TOKENS) {
    const value = readToken(token);
    const content = document.createElement('div');
    content.style.cssText = 'display:flex;align-items:center;gap:14px';
    const track = document.createElement('div');
    track.style.cssText =
      'width:160px;height:28px;border-radius:var(--radius-control);background:var(--muted);padding:4px';
    const ball = document.createElement('div');
    ball.style.cssText = `width:20px;height:20px;border-radius:var(--radius-chip);background:var(--system-accent);transition:transform ${value} var(--ease-standard)`;
    track.append(ball);
    track.addEventListener('mouseenter', () => {
      ball.style.transform = 'translateX(132px)';
    });
    track.addEventListener('mouseleave', () => {
      ball.style.transform = 'translateX(0)';
    });
    const caption = document.createElement('span');
    caption.textContent = `${value} · hover to run`;
    caption.style.cssText =
      'font-family:var(--font-mono);font-size:11px;color:var(--muted-foreground)';
    content.append(track, caption);
    wrapper.append(row(token, content));
  }
  return wrapper;
}

function closeSheet(): void {
  document.getElementById(SHEET_ID)?.remove();
}

function openSheet(): void {
  closeSheet();
  const host = document.createElement('div');
  host.id = SHEET_ID;
  host.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;background:var(--background);color:var(--foreground);overflow:auto;padding:24px 32px;font-family:var(--font-ui)';

  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;align-items:baseline;gap:14px;margin-bottom:20px;font-size:var(--text-caption);color:var(--muted-foreground)';
  const title = document.createElement('strong');
  title.textContent = 'Design tokens';
  title.style.cssText = 'font-size:var(--text-lg);color:var(--foreground)';
  const hint = document.createElement('span');
  hint.textContent = 'semanticTokens.css · Esc closes';
  header.append(title, hint);

  host.append(
    header,
    radiusSection(),
    typeSection(),
    colorSection(),
    shadowSection(),
    motionSection(),
  );
  document.body.append(host);
}

export function installDesignTokenSheet(): void {
  const globalScope = window as Window & { __designTokens?: () => void };
  globalScope.__designTokens = openSheet;
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        closeSheet();
      }
    },
    true,
  );
}
