import { useEffect, useState } from 'react';
import {
  IconCheck,
  IconExternalLink,
  IconLoader2,
  IconShieldExclamation,
} from '@tabler/icons-react';
import {
  npmPackageUrl,
  piDevPackageUrl,
  type CatalogPackage,
  type CatalogPackageDetail,
} from '../../../../shared/piPackages';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Skeleton } from '../ui/skeleton';
import { SpinningIcon } from '../ui/spinningIcon';
import MarkdownMessage from '../message/markdownMessage';
import { formatTimeAgo } from '@/lib/utils';
import { formatDownloads, RESOURCE_KIND_LABELS } from './packageLabels';

export interface CatalogInstallState {
  installed: boolean;
  /** This package's install is running. */
  busy: boolean;
  /** Another operation is running. */
  disabled: boolean;
}

function CatalogMeta({ pkg }: { pkg: CatalogPackage }): React.JSX.Element {
  // An age read once is precise enough for "3d ago".
  const [now] = useState(() => Date.now());
  const parts = [
    pkg.author,
    pkg.monthlyDownloads !== null ? formatDownloads(pkg.monthlyDownloads) : null,
    pkg.date ? formatTimeAgo(pkg.date, now) : null,
    pkg.kinds.map((kind) => RESOURCE_KIND_LABELS[kind].one).join(', ') || null,
  ].filter(Boolean);
  return (
    <span className="truncate text-caption text-muted-foreground/80">{parts.join(' · ')}</span>
  );
}

function InstallButton({
  state,
  onInstall,
  size = 'sm',
}: {
  state: CatalogInstallState;
  onInstall: () => void;
  size?: 'sm' | 'default';
}): React.JSX.Element {
  if (state.busy) {
    return (
      <SpinningIcon className="mx-2 text-muted-foreground">
        <IconLoader2 size={16} />
      </SpinningIcon>
    );
  }
  if (state.installed) {
    return (
      <span className="flex items-center gap-1 px-2 text-caption text-muted-foreground">
        <IconCheck size={14} />
        Installed
      </span>
    );
  }
  return (
    <Button
      size={size}
      variant={size === 'sm' ? 'outline' : 'default'}
      disabled={state.disabled}
      onClick={(event) => {
        // The row behind the button opens the details.
        event.stopPropagation();
        onInstall();
      }}
    >
      Install
    </Button>
  );
}

export function CatalogPackageRow({
  pkg,
  installState,
  onInstall,
  onOpen,
}: {
  pkg: CatalogPackage;
  installState: CatalogInstallState;
  onInstall: () => void;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onOpen();
        }
      }}
      className="flex cursor-default items-start gap-3 px-5 py-3.5 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      data-testid={`catalog-package-${pkg.name}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-ui font-medium text-foreground">{pkg.name}</span>
          <span className="shrink-0 text-caption text-muted-foreground">{pkg.version}</span>
        </div>
        {pkg.description && (
          <p className="line-clamp-2 text-caption text-muted-foreground">{pkg.description}</p>
        )}
        <CatalogMeta pkg={pkg} />
      </div>
      <div className="flex shrink-0 items-center">
        <InstallButton state={installState} onInstall={onInstall} />
      </div>
    </div>
  );
}

/**
 * Images are dropped: the window's CSP serves no remote image, and a README
 * full of broken badges reads worse than one without them. Raw HTML goes for
 * the same reason (it is mostly `<img>` and centering wrappers). A relative
 * link points into the repository, not at a file on this computer, so it is
 * rewritten against the repository or unlinked. Code blocks keep everything.
 */
function readmeForDisplay(readme: string, repositoryUrl: string | null): string {
  return readme
    .split(/(^```[\s\S]*?^```)/m)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/<\/?[a-zA-Z][^>]*>/g, '')
            .replace(
              /\[([^\]]*)\]\((?![a-z]+:|#)\.?\/?([^)\s]+)\)/gi,
              (_, text: string, path: string) =>
                repositoryUrl ? `[${text}](${repositoryUrl}/blob/HEAD/${path})` : text,
            ),
    )
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: CatalogPackageDetail }
  | { status: 'error'; error: string };

function ReadmeSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="h-3.5 w-4/5" />
      <Skeleton className="mt-3 h-5 w-1/4" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-2/3" />
    </div>
  );
}

function LinkButton({ href, children }: { href: string; children: string }): React.JSX.Element {
  return (
    <Button
      size="xs"
      variant="ghost"
      className="text-muted-foreground"
      onClick={() => window.piApi.openExternal(href)}
    >
      {children}
      <IconExternalLink data-icon="inline-end" />
    </Button>
  );
}

export function CatalogPackageDialog({
  pkg,
  installState,
  onInstall,
  onClose,
}: {
  pkg: CatalogPackage;
  installState: CatalogInstallState;
  onInstall: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const [state, setState] = useState<DetailState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void window.piApi.getPiCatalogPackage(pkg.name).then((result) => {
      if (cancelled) return;
      setState(
        result.success
          ? { status: 'ready', detail: result.detail }
          : { status: 'error', error: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [pkg.name]);

  const repositoryUrl =
    pkg.repositoryUrl ?? (state.status === 'ready' ? state.detail.repositoryUrl : null);
  const readme =
    state.status === 'ready' && state.detail.readme
      ? readmeForDisplay(state.detail.readme, repositoryUrl)
      : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[min(84vh,880px)] w-[min(760px,calc(100vw-64px))] max-w-none flex-col gap-0 p-0"
        data-testid="catalog-package-dialog"
      >
        <div className="flex flex-col gap-3 border-b border-border px-6 pt-5 pb-4">
          <div className="flex items-start gap-4 pr-8">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <DialogTitle className="flex min-w-0 items-baseline gap-2 text-lg leading-tight">
                <span className="truncate">{pkg.name}</span>
                <span className="shrink-0 text-caption font-normal text-muted-foreground">
                  {pkg.version}
                </span>
              </DialogTitle>
              <DialogDescription className="text-caption text-muted-foreground">
                {pkg.description || 'No description.'}
              </DialogDescription>
              <CatalogMeta pkg={pkg} />
            </div>
            <InstallButton state={installState} onInstall={onInstall} size="default" />
          </div>
          <div className="-ml-2 flex flex-wrap items-center gap-1">
            <LinkButton href={piDevPackageUrl(pkg.name)}>pi.dev</LinkButton>
            <LinkButton href={npmPackageUrl(pkg.name)}>npm</LinkButton>
            {repositoryUrl && <LinkButton href={repositoryUrl}>Repository</LinkButton>}
            {state.status === 'ready' && state.detail.license && (
              <span className="px-2 text-caption text-muted-foreground">
                {state.detail.license}
              </span>
            )}
          </div>
          <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
            <IconShieldExclamation size={14} className="mt-[3px] shrink-0" />
            Packages run with full access to your computer. Read the source before installing one
            you do not know.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {state.status === 'loading' && <ReadmeSkeleton />}
          {state.status === 'error' && (
            <p className="text-caption text-danger-fg">Could not load the README: {state.error}</p>
          )}
          {state.status === 'ready' &&
            (readme ? (
              <MarkdownMessage text={readme} />
            ) : (
              <p className="text-caption text-muted-foreground">This package has no README.</p>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
