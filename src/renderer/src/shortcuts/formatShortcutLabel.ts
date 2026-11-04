import type { ShortcutBinding } from '../../../shared/ipcContract';
import { useAppStore } from '../state/appStore';

export function formatShortcutModifiers(binding: ShortcutBinding): string[] {
  const isMac = useAppStore.getState().platform === 'mac';
  const parts: string[] = [];
  if (binding.meta) {
    parts.push(isMac ? '⌘' : 'Meta');
  }
  if (binding.ctrl) {
    parts.push(isMac ? '⌃' : 'Ctrl');
  }
  if (binding.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }
  if (binding.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }
  return parts;
}

export function formatShortcutKey(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

export function formatShortcutLabel(binding: ShortcutBinding): string {
  return [...formatShortcutModifiers(binding), formatShortcutKey(binding.key)].join(' ');
}
