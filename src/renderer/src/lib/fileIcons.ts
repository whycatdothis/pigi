import {
  file as defaultIconName,
  fileExtensions,
  fileNames,
} from 'material-icon-theme/dist/material-icons.json';
import { displayFileName } from './chatAttachments';

// Material Icon Theme (the VS Code extension) ships its icon mapping as a
// VS Code manifest. Only the file name and extension tables are needed here.
const iconsByFileName: Record<string, string> = fileNames;
const iconsByExtension: Record<string, string> = fileExtensions;

// `no-inline` keeps the 1000+ SVGs as separate assets instead of base64 in the bundle.
const ICON_DIRECTORY = '../../../../node_modules/material-icon-theme/icons';
const iconUrls = import.meta.glob<string>(
  '../../../../node_modules/material-icon-theme/icons/*.svg',
  { query: '?url&no-inline', import: 'default', eager: true },
);

function iconUrl(name: string): string | undefined {
  return iconUrls[`${ICON_DIRECTORY}/${name}.svg`];
}

/**
 * Icon for a file path, resolved like VS Code: exact file name first, then the
 * longest matching extension (`foo.test.ts` tries `test.ts`, then `ts`).
 */
export function fileIconUrl(path: string): string | undefined {
  const fileName = displayFileName(path).toLowerCase();
  const byName = iconsByFileName[fileName];
  if (byName) return iconUrl(byName) ?? iconUrl(defaultIconName);

  let dotIndex = fileName.indexOf('.');
  while (dotIndex !== -1) {
    const byExtension = iconsByExtension[fileName.slice(dotIndex + 1)];
    if (byExtension) return iconUrl(byExtension) ?? iconUrl(defaultIconName);
    dotIndex = fileName.indexOf('.', dotIndex + 1);
  }
  return iconUrl(defaultIconName);
}
