import { IconCornerDownLeft } from '@tabler/icons-react';
import type { ShortcutBinding } from '../../../shared/ipcContract';
import { Kbd } from '../components/ui/kbd';
import { formatShortcutKey, formatShortcutModifiers } from './formatShortcutLabel';

/** A shortcut hint that draws Enter as an icon rather than spelling it out. */
export function ShortcutKbd({
  binding,
  className,
}: {
  binding: ShortcutBinding;
  className?: string;
}): React.JSX.Element {
  const modifiers = formatShortcutModifiers(binding).join(' ');
  return (
    <Kbd className={className}>
      {modifiers}
      {binding.key === 'Enter' ? (
        <IconCornerDownLeft className="size-2.5" stroke={2.25} aria-label="Enter" />
      ) : (
        formatShortcutKey(binding.key)
      )}
    </Kbd>
  );
}
