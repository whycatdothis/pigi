// Resolved like src/renderer/src/lib/fileIcons.ts. Served as <img> data URIs
// because inlined SVGs that share a gradient id paint each other's fills.
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
