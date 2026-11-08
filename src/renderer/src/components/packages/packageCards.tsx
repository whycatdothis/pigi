import { useState } from 'react';
import {
  packageImageUrl,
  type PackageImageTarget,
  type PiResourceKind,
} from '../../../../shared/piPackages';
import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';
import { RESOURCE_KIND_ICONS, RESOURCE_KIND_LABELS, UNKNOWN_KIND_ICON } from './packageLabels';

/** At most two columns, one when a column would get narrower than 18rem; gap-3 is 12px. */
const GRID_COLUMNS = 'repeat(auto-fill, minmax(max(18rem, calc(50% - 6px)), 1fr))';

export function CardGrid({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: GRID_COLUMNS }}>
      {children}
    </div>
  );
}

/**
 * The package's `pi.image` when it has one, else the icon of what it mostly
 * holds. The icon shows until the image loads, so a slow or missing image
 * never shows a broken one.
 */
export function PackageThumbnail({
  image,
  kinds,
  size = 'md',
}: {
  image: PackageImageTarget | null;
  kinds: readonly PiResourceKind[];
  size?: 'md' | 'lg';
}): React.JSX.Element {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const kind = kinds[0];
  const KindIcon = kind ? RESOURCE_KIND_ICONS[kind] : UNKNOWN_KIND_ICON;
  // A transparent logo was drawn for a plain background, not a kind's tint.
  const tinted = kind !== undefined && status !== 'loaded';
  return (
    <div
      data-kind={tinted ? kind : undefined}
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-control',
        size === 'md' ? 'size-11' : 'size-14',
        tinted ? 'package-tile' : 'bg-muted text-muted-foreground',
      )}
    >
      {/* Gone once the image shows: a transparent logo would sit on top of it. */}
      {status !== 'loaded' && <KindIcon size={size === 'md' ? 26 : 32} stroke={1.5} />}
      {image && status !== 'failed' && (
        <img
          src={packageImageUrl(image)}
          alt=""
          loading="lazy"
          draggable={false}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('failed')}
          className={cn(
            'absolute inset-0 size-full object-cover transition-opacity',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </div>
  );
}

/** What a package holds, as pi.dev labels it. */
export function KindLabels({ kinds }: { kinds: readonly PiResourceKind[] }): React.JSX.Element {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {kinds.map((kind) => (
        <span
          key={kind}
          className="rounded-inline border border-border px-1.5 py-0.5 text-3xs leading-none font-medium tracking-wider text-foreground uppercase"
        >
          {RESOURCE_KIND_LABELS[kind].one}
        </span>
      ))}
    </div>
  );
}

/**
 * One package: the card opens its details, the actions act in place. The
 * actions sit outside the card's button, so clicking one does not open it.
 */
export function PackageCard({
  thumbnail,
  title,
  description,
  meta,
  kinds = [],
  notice,
  actions,
  onOpen,
  testId,
}: {
  thumbnail: React.ReactNode;
  title: React.ReactNode;
  description?: string | null;
  meta?: React.ReactNode;
  kinds?: readonly PiResourceKind[];
  notice?: React.ReactNode;
  actions?: React.ReactNode;
  onOpen: () => void;
  testId?: string;
}): React.JSX.Element {
  return (
    <div
      className="relative flex min-w-0 gap-3.5 rounded-surface-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40 has-[>button:focus-visible]:ring-3 has-[>button:focus-visible]:ring-ring/25"
      data-testid={testId}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label="Show details"
        className="absolute inset-0 rounded-surface-lg outline-none"
      />
      <div className="pointer-events-none">{thumbnail}</div>
      <div className="pointer-events-none flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-h-7 min-w-0 items-center gap-2">{title}</div>
        {description && (
          <p className="line-clamp-2 text-caption text-muted-foreground">{description}</p>
        )}
        {meta && <span className="truncate text-caption text-muted-foreground/80">{meta}</span>}
        {kinds.length > 0 && <KindLabels kinds={kinds} />}
        {notice}
      </div>
      {actions && (
        <div className="relative flex shrink-0 items-start gap-0.5 self-start">{actions}</div>
      )}
    </div>
  );
}

export function CardsSkeleton({ count }: { count: number }): React.JSX.Element {
  return (
    <CardGrid>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex gap-3.5 rounded-surface-lg border border-border p-4">
          <Skeleton className="size-11 rounded-control" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </CardGrid>
  );
}
