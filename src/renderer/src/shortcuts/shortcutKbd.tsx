import { IconCornerDownLeft } from '@tabler/icons-react';
import type { ShortcutBinding } from '../../../shared/ipcContract';
import { Kbd } from '../components/ui/kbd';
import { formatShortcutKey, formatShortcutModifiers } from './formatShortcutLabel';

/** A shortcut hint that draws Enter as an icon rather than spelling it out. */
export function ShortcutKbd({
  binding,
  className,
  decorative,
}: {
  binding: ShortcutBinding;
  className?: string;
  /** Skip the icon's label, for a hint that only reserves another hint's space. */
  decorative?: boolean;
}): React.JSX.Element {
  const modifiers = formatShortcutModifiers(binding).join(' ');
  return (
    <Kbd className={className} aria-hidden={decorative || undefined}>
      {modifiers}
      {binding.key === 'Enter' ? (
        <IconCornerDownLeft
          className="size-2.5"
          stroke={2.25}
          aria-label={decorative ? undefined : 'Enter'}
        />
      ) : (
        formatShortcutKey(binding.key)
      )}
    </Kbd>
  );
}

/**
 * A button hint's invisible twin. Render it before the button's label, with the
 * hint after it: the two take equal space, so the label stays centered in the
 * button whether or not the hint is showing.
 */
export function ShortcutKbdSpacer({
  binding,
  className,
}: {
  binding: ShortcutBinding;
  className?: string;
}): React.JSX.Element {
  return (
    <span aria-hidden className="invisible inline-flex">
      <ShortcutKbd binding={binding} className={className} decorative />
    </span>
  );
}
