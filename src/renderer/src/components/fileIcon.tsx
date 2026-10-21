import { fileIconUrl } from '../lib/fileIcons';
import { cn } from '../lib/utils';

/** Language-specific icon for a file path (Material Icon Theme). */
export function FileIcon({
  path,
  className,
}: {
  path: string;
  className?: string;
}): React.JSX.Element {
  return (
    <img
      src={fileIconUrl(path)}
      alt=""
      draggable={false}
      className={cn('size-4 shrink-0', className)}
    />
  );
}
