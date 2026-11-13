/**
 * The application menu.
 *
 * The update and command-line items change at runtime, so the whole menu is
 * rebuilt whenever one of them would look different and left alone otherwise.
 * `download-progress` pushes status many times a second, and each push reaches
 * `refreshApplicationMenu`; comparing the rendered items first keeps those
 * ticks from allocating a menu.
 */
import { app, Menu } from 'electron';
import { is } from '@electron-toolkit/utils';
import { getUpdateMenuItemState, runUpdateMenuItemAction } from '../ipc/updateManager';
import { getCliMenuItemState, runCliMenuItemAction } from '../ipc/cliInstall';

/** The items that change at runtime; null until the menu exists. */
let builtUpdateItemSignature: string | null = null;
let builtCliItemSignature: string | null = null;

function updateItemSignature(): string {
  const state = getUpdateMenuItemState();
  return `${state.label}|${state.enabled}`;
}

function cliItemSignature(): string {
  const state = getCliMenuItemState();
  return `${state.label}|${state.visible}|${state.enabled}`;
}

export function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';
  const updateItem = getUpdateMenuItemState();
  const cliItem = getCliMenuItemState();
  builtUpdateItemSignature = `${updateItem.label}|${updateItem.enabled}`;
  builtCliItemSignature = `${cliItem.label}|${cliItem.visible}|${cliItem.enabled}`;

  const template: Electron.MenuItemConstructorOptions[] = [
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
              ...(cliItem.visible
                ? [
                    {
                      label: cliItem.label,
                      enabled: cliItem.enabled,
                      click: () => void runCliMenuItemAction(),
                    },
                  ]
                : []),
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
    // No reload item, so Ctrl+R is free for custom shortcuts.
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

/** Rebuild only when an item that changes at runtime would look different. */
export function refreshApplicationMenu(): void {
  const unchanged =
    updateItemSignature() === builtUpdateItemSignature &&
    cliItemSignature() === builtCliItemSignature;
  if (unchanged) return;
  setupApplicationMenu();
}
