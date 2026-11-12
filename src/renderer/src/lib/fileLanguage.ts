import { bundledLanguages } from 'shiki/bundle/full';

// A Map, so a file named `constructor` does not read Object.prototype.
function languageMap(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

// Only extensions that are not already a shiki language id or alias.
const LANGUAGE_BY_EXTENSION = languageMap({
  // Starlark: shiki has no grammar for it, and its syntax is a subset of Python.
  bazel: 'python',
  bzl: 'python',
  bzlmod: 'python',
  cc: 'cpp',
  cljs: 'clojure',
  cxx: 'cpp',
  el: 'emacs-lisp',
  ex: 'elixir',
  exs: 'elixir',
  h: 'c',
  hpp: 'cpp',
  htm: 'html',
  hx: 'haxe',
  m: 'objective-c',
  mk: 'make',
  ml: 'ocaml',
  mm: 'objective-cpp',
  pas: 'pascal',
  patch: 'diff',
  pl: 'perl',
  pm: 'perl',
  psgi: 'perl',
  star: 'python',
  svg: 'xml',
  t: 'perl',
});

// Looked up as written, then lower-cased: Bazel only reads an upper-case BUILD,
// a lower-case `build` is usually a script.
const LANGUAGE_BY_FILE_NAME = languageMap({
  BUILD: 'python',
  WORKSPACE: 'python',
  'cmakelists.txt': 'cmake',
  dockerfile: 'docker',
  gnumakefile: 'make',
  makefile: 'make',
  '.npmrc': 'ini',
  '.prettierrc': 'json',
});

const LANGUAGE_BY_INTERPRETER = languageMap({
  dash: 'shellscript',
  ksh: 'shellscript',
  node: 'javascript',
});

// Interpreter of `#!/usr/bin/perl -w`, `#!/usr/bin/env -S python3` or `#!perl`.
const SHEBANG = /^#![ \t]*(?:\S*\/)?(?:env[ \t]+(?:-\S+[ \t]+)*)?([a-z]+)/;

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
  return path.slice(path.lastIndexOf('/') + 1);
}

function extensionOf(path: string): string {
  const fileName = fileNameOf(path);
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

function bundledLanguage(name: string): string {
  return Object.hasOwn(bundledLanguages, name) ? name : '';
}

/**
 * Shiki language for a file, or an empty string when it cannot be highlighted.
 * The shebang decides only when the path does not.
 */
export function languageForFile(path: string, content?: string | null): string {
  const fileName = fileNameOf(path);
  const extension = extensionOf(path);
  const byPath =
    LANGUAGE_BY_FILE_NAME.get(fileName) ??
    LANGUAGE_BY_FILE_NAME.get(fileName.toLowerCase()) ??
    LANGUAGE_BY_EXTENSION.get(extension) ??
    bundledLanguage(extension);
  if (byPath || !content) return byPath;
  const interpreter = SHEBANG.exec(content)?.[1] ?? '';
  return LANGUAGE_BY_INTERPRETER.get(interpreter) ?? bundledLanguage(interpreter);
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
