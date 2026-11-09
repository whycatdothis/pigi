/**
 * File icons, resolved the way the app resolves them (`src/renderer/src/lib/fileIcons.ts`):
 * Material Icon Theme's manifest, exact file name first, then the longest
 * matching extension (`foo.test.ts` tries `test.ts`, then `ts`).
 *
 * The SVGs are read at build time and handed out as data URIs for an `<img>`,
 * the element the app draws them in. Inlined as markup instead, two icons that
 * share a gradient id would paint each other's fills.
 */
import {
  file as defaultIconName,
  fileExtensions,
  fileNames,
} from 'material-icon-theme/dist/material-icons.json';

const iconsByFileName: Record<string, string> = fileNames;
const iconsByExtension: Record<string, string> = fileExtensions;

const iconSources = import.meta.glob<string>('/node_modules/material-icon-theme/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function iconSource(name: string): string | undefined {
  return iconSources[`/node_modules/material-icon-theme/icons/${name}.svg`];
}

function iconName(path: string): string {
  const fileName = (path.split('/').pop() ?? path).toLowerCase();
  const byName = iconsByFileName[fileName];
  if (byName) return byName;

  let dotIndex = fileName.indexOf('.');
  while (dotIndex !== -1) {
    const byExtension = iconsByExtension[fileName.slice(dotIndex + 1)];
    if (byExtension) return byExtension;
    dotIndex = fileName.indexOf('.', dotIndex + 1);
  }
  return defaultIconName;
}

export function fileIconUrl(path: string): string {
  const source = iconSource(iconName(path)) ?? iconSource(defaultIconName) ?? '';
  return `data:image/svg+xml,${encodeURIComponent(source)}`;
}
