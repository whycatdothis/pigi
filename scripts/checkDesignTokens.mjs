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
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_ROOT = path.resolve('src/renderer/src');
const TOKEN_FILE = 'shared/designTokens.css';
const SEMANTIC_TOKEN_FILE = 'assets/semanticTokens.css';

const RULES = [
  {
    name: 'arbitrary radius',
    pattern: /rounded(?:-[a-z]+)*\[[^\]]*(?:\d+(?:px|rem|em)|calc\(var\(--radius\))[^\]]*\]/g,
    hint: 'use rounded-inline / chip / control / surface / container',
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
    skip: (match) => match.includes('var(--radius'),
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
