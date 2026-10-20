/**
 * Native attachment picker for the chat input.
 *
 * The renderer asks for either images or files; main opens the OS dialog and
 * returns absolute paths plus display metadata. The renderer enforces the
 * attachment limit. The utility process reads the bytes, so large files never
 * cross IPC here.
 */
import { dialog, ipcMain } from 'electron';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  PiChannel,
  type ChatAttachmentKind,
  type PickedAttachment,
  type PickAttachmentsResult,
} from '../../shared/ipcContract';
import { imageMimeTypeForPath, isSupportedImageMimeType } from '../../shared/chatAttachments';
import { getMainWindow } from '../windows/createMainWindow';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const FILE_MIME_TYPE = 'application/octet-stream';

async function describeFile(path: string): Promise<PickedAttachment> {
  let size = 0;
  try {
    const stats = await stat(path);
    size = stats.size;
  } catch {
    // Keep size 0: the utility process reports unreadable files to the model.
  }

  const imageMimeType = imageMimeTypeForPath(path);
  const kind: ChatAttachmentKind = imageMimeType ? 'image' : 'file';
  return {
    path,
    name: basename(path),
    size,
    mimeType: imageMimeType ?? FILE_MIME_TYPE,
    kind,
  };
}

export function registerAttachmentHandlers(): void {
  ipcMain.handle(
    PiChannel.PickAttachments,
    async (_event, kind: ChatAttachmentKind): Promise<PickAttachmentsResult> => {
      if (kind !== 'image' && kind !== 'file') {
        return { success: false, error: 'kind must be image or file' };
      }

      const properties: Array<'openFile' | 'multiSelections'> = ['openFile', 'multiSelections'];
      const filters = kind === 'image' ? [{ name: 'Images', extensions: IMAGE_EXTENSIONS }] : [];
      const win = getMainWindow();
      const result = win
        ? await dialog.showOpenDialog(win, { properties, filters })
        : await dialog.showOpenDialog({ properties, filters });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const files = await Promise.all(result.filePaths.map((path) => describeFile(path)));

      // Defensive: the filter above should already exclude non-images, but a
      // typed path in the dialog can slip through.
      const filtered =
        kind === 'image' ? files.filter((file) => isSupportedImageMimeType(file.mimeType)) : files;
      if (filtered.length === 0) {
        return { success: false, error: 'No supported images selected' };
      }
      return { success: true, files: filtered };
    },
  );
}
