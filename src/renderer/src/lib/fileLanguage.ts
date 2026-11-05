const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: 'bash',
  c: 'c',
  cc: 'cpp',
  clj: 'clojure',
  cljs: 'clojure',
  cjs: 'javascript',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  cxx: 'cpp',
  dart: 'dart',
  diff: 'diff',
  dockerfile: 'docker',
  el: 'elixir',
  erl: 'erlang',
  ex: 'elixir',
  exs: 'elixir',
  fish: 'fish',
  go: 'go',
  gql: 'graphql',
  graphql: 'graphql',
  h: 'c',
  hpp: 'cpp',
  hs: 'haskell',
  htm: 'html',
  html: 'html',
  ini: 'ini',
  java: 'java',
  js: 'javascript',
  json: 'json',
  json5: 'json5',
  jsonc: 'jsonc',
  jsx: 'jsx',
  kt: 'kotlin',
  kts: 'kotlin',
  less: 'less',
  lua: 'lua',
  m: 'objective-c',
  md: 'markdown',
  mdx: 'mdx',
  mjs: 'javascript',
  mm: 'objective-cpp',
  nix: 'nix',
  patch: 'diff',
  php: 'php',
  pl: 'perl',
  ps1: 'powershell',
  py: 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  sass: 'sass',
  scala: 'scala',
  scss: 'scss',
  sh: 'shellscript',
  sql: 'sql',
  svelte: 'svelte',
  svg: 'xml',
  swift: 'swift',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zig: 'zig',
  zsh: 'shellscript',
};

const LANGUAGE_BY_FILE_NAME: Record<string, string> = {
  dockerfile: 'docker',
  makefile: 'make',
  'cmakelists.txt': 'cmake',
  '.npmrc': 'ini',
  '.prettierrc': 'json',
};

const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx', 'markdown']);
const BITMAP_IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'avif',
]);

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).toLowerCase();
}

function extensionOf(path: string): string {
  const fileName = fileNameOf(path);
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1);
}

/** Shiki language for a path, or an empty string when it cannot be highlighted. */
export function languageForPath(path: string): string {
  const byName = LANGUAGE_BY_FILE_NAME[fileNameOf(path)];
  if (byName) return byName;
  return LANGUAGE_BY_EXTENSION[extensionOf(path)] ?? '';
}

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extensionOf(path));
}

/** An image with no text to show: SVG is not one, its source is worth reading. */
export function isBitmapImagePath(path: string): boolean {
  return BITMAP_IMAGE_EXTENSIONS.has(extensionOf(path));
}

export function isSvgPath(path: string): boolean {
  return extensionOf(path) === 'svg';
}
