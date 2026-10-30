#!/usr/bin/env node
/**
 * Fails when UI code hard-codes a design value instead of using a token.
 *
 * `assets/semanticTokens.css` names radius, spacing, elevation and motion by
 * role; components reference those names. Arbitrary values are how the last
 * round of drift started (five different radii for the same kind of surface),
 * so they are rejected here rather than in review.
 *
 * Allowed: `rounded-[var(--radius-x)]`, `rounded-[calc(...)]` built from
 * tokens, and the miniature drawings in the appearance previews, which scale a
 * whole window into 84px and cannot use UI radii.
 *
 * Tailwind's own steps are rejected too. `rounded-md` and friends are computed
 * from `--radius`, so their size moves whenever that primitive moves, which is
 * the opposite of a role. `text-xs` / `text-sm` / `text-base` are the steps the
 * semantic ramp replaced (13 / 15 / 17px); app code names the role instead.
 * Both sets stay defined in `shared/designTokens.css` for the marketing site,
 * not for app code.
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_ROOT = path.resolve('src/renderer/src');
const TOKEN_FILE = 'shared/designTokens.css';
const SEMANTIC_TOKEN_FILE = 'assets/semanticTokens.css';

const RULES = [
  {
    name: 'arbitrary radius',
    pattern: /rounded(?:-[a-z]+)*-?\[[^\]]*(?:\d+(?:px|rem|em)|calc\(var\(--radius\))[^\]]*\]/g,
    hint: 'use rounded-inline / chip / control / surface / container',
  },
  {
    name: 'Tailwind radius step',
    pattern: /rounded(?:-[a-z]+)*(?:-(?:xs|sm|md|lg|xl|2xl|3xl))\b/g,
    hint: 'use rounded-inline / chip / control / control-sm / surface* / container / full',
    extensions: ['.ts', '.tsx'],
    // `control-sm` and `surface-sm` end in a Tailwind step name; they are role
    // names, not steps.
    skip: (match) =>
      /^rounded(?:-(?:s|e|t|r|b|l|ss|se|ee|es|tl|tr|br|bl))?-(?:inline|chip|control-sm|control|surface-sm|surface-lg|surface-xl|surface|container|full)$/.test(
        match,
      ),
  },
  {
    name: 'primitive radius variable',
    pattern: /var\(--radius-(?:xs|sm|md|lg|xl|2xl|3xl|4xl)\)/g,
    hint: 'use var(--radius-inline … container) from semanticTokens.css',
    extensions: ['.ts', '.tsx'],
  },
  {
    name: 'Tailwind type step',
    pattern: /\btext-(?:xs|sm|base)\b/g,
    hint: 'use the semantic scale (text-caption / text-ui / text-body / text-lg / text-xl / text-2xl)',
    extensions: ['.ts', '.tsx'],
  },
  {
    name: 'arbitrary font size',
    pattern: /text-\[[^\]]*?\d+(?:\.\d+)?(?:px|rem|em)[^\]]*?\]/g,
    hint: 'use the type scale (text-3xs … text-2xl, text-code)',
    // `text-[var(--text-ui)]` names a token, which is what this rule wants.
    skip: (match) => match.includes('var(--text'),
  },
  {
    name: 'arbitrary shadow',
    pattern: /shadow-\[[^\]]*\]/g,
    hint: 'use shadow-raised / shadow-popover / shadow-composer',
    // A ring built from a colour token is fine; a literal shape is not.
    skip: (match) => match.includes('var('),
  },
  {
    name: 'hard-coded border radius in CSS',
    pattern: /border-radius:\s*([^;]+);/g,
    hint: 'use var(--radius-*)',
    extensions: ['.css'],
    // A shorthand like `0 0 var(--radius-surface-sm)` is fine; a literal is not.
    // A percentage is relative to the box rather than a design value, and the
    // scrollbar thumb needs one to keep its ends round at every width.
    skip: (match) => match.includes('var(--radius') || match.includes('%'),
  },
];

const ALLOWED = new Map([
  [
    'components/settings/appearanceControls.tsx',
    { pattern: /rounded-\[2px\]/g, reason: 'miniature composer inside the mode preview' },
  ],
]);

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(entryPath);
      continue;
    }
    if (/\.(ts|tsx|css)$/.test(entry.name)) {
      yield entryPath;
    }
  }
}

const failures = [];
for (const filePath of walk(SOURCE_ROOT)) {
  const relative = path.relative(SOURCE_ROOT, filePath).split(path.sep).join('/');
  if (relative === SEMANTIC_TOKEN_FILE) {
    continue;
  }
  const extension = path.extname(filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  let source = text;
  const allowed = ALLOWED.get(relative);
  if (allowed) {
    source = source.replace(allowed.pattern, '');
  }
  for (const rule of RULES) {
    if (rule.extensions && !rule.extensions.includes(extension)) {
      continue;
    }
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of source.matchAll(pattern)) {
      if (rule.skip?.(match[0])) {
        continue;
      }
      const line = source.slice(0, match.index).split('\n').length;
      failures.push(`${relative}:${line}  ${rule.name}  ${match[0]}  (${rule.hint})`);
    }
  }
}

if (failures.length > 0) {
  console.error('Hard-coded design values found (see docs/design-system.md):');
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  console.error(`\nTokens live in ${TOKEN_FILE} and ${SEMANTIC_TOKEN_FILE}.`);
  process.exit(1);
}
