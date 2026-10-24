/**
 * The application menu.
 *
 * The update item is the only part that changes at runtime, so the whole menu
 * is rebuilt whenever its label or enabled state changes and left alone
 * otherwise. `download-progress` pushes status many times a second, and each
 * push reaches `refreshApplicationMenu`; comparing the rendered item first
 * keeps those ticks from allocating a menu.
 */
import { app, Menu } from 'electron';
import { is } from '@electron-toolkit/utils';
import { getUpdateMenuItemState, runUpdateMenuItemAction } from '../ipc/updateManager';

/** The update item as last built; null until the menu exists. */
let builtUpdateItemSignature: string | null = null;

function updateItemSignature(): string {
  const state = getUpdateMenuItemState();
  return `${state.label}|${state.enabled}`;
}

export function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';
  const updateItem = getUpdateMenuItemState();
  builtUpdateItemSignature = `${updateItem.label}|${updateItem.enabled}`;

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS app menu
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              // Apple's order: About, updates, then the rest of the app menu.
              {
                label: updateItem.label,
                enabled: updateItem.enabled,
                click: () => runUpdateMenuItemAction(),
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    // Edit menu — standard copy/paste/undo shortcuts
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    // View menu — no reload item so Ctrl+R is free for custom shortcuts
    {
      label: 'View',
      submenu: [
        ...(is.dev ? [{ role: 'toggleDevTools' as const }] : []),
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    // Window menu (macOS)
    ...(isMac
      ? [
          {
            label: 'Window',
            submenu: [
              { role: 'minimize' as const },
              { role: 'zoom' as const },
              { role: 'close' as const },
            ],
          },
        ]
      : []),
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/** Rebuild only when the update item would actually look different. */
export function refreshApplicationMenu(): void {
  if (updateItemSignature() === builtUpdateItemSignature) return;
  setupApplicationMenu();
}
