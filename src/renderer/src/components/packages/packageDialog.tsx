/**
 * A package's details: what it holds (when installed), its README (when it
 * comes from npm), links, and the same actions as its card.
 */
import { useEffect, useState } from 'react';
import { IconExternalLink, IconShieldExclamation } from '@tabler/icons-react';
import {
  npmNameFromSource,
  npmPackageUrl,
  piDevPackageUrl,
  type CatalogPackage,
  type CatalogPackageDetail,
  type InstalledPiPackage,
  type PiExtensionLoadError,
  type PiPackageOperation,
  type PiResource,
} from '../../../../shared/piPackages';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Skeleton } from '../ui/skeleton';
import MarkdownMessage from '../message/markdownMessage';
import { KindLabels, PackageThumbnail } from './packageCards';
import { CatalogInstallButton, CatalogMeta, type CatalogInstallState } from './catalogPackages';
import {
  InstalledActions,
  LOCAL_RESOURCES_DESCRIPTION,
  PackageTitle,
  ResourceList,
} from './installedPackages';
import {
  errorsForPackage,
  installedMeta,
  gitWebUrl,
  packageTitle,
  resourceKinds,
  resourceSummary,
} from './packageLabels';

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

function useNpmDetail(name: string | null): DetailState | null {
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    void window.piApi.getPiCatalogPackage(name).then((result) => {
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
  }, [name]);
  return name ? state : null;
}

function ReadmeSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
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

function DialogSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-caption font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function PackageDialogFrame({
  header,
  children,
  onClose,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[min(84vh,880px)] w-[min(760px,calc(100vw-64px))] max-w-none flex-col gap-0 p-0"
        data-testid="package-dialog"
      >
        <div className="flex flex-col gap-3 border-b border-border px-6 pt-5 pb-4">{header}</div>
        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PackageDialog({
  installed,
  catalog,
  hasUpdate,
  releasedAt,
  loadErrors,
  busy,
  disabled,
  catalogInstallState,
  onRun,
  onCatalogInstall,
  onClose,
}: {
  /** At least one of the two; both when a catalog package is installed. */
  installed: InstalledPiPackage | null;
  catalog: CatalogPackage | null;
  hasUpdate: boolean;
  releasedAt: string | null;
  loadErrors: readonly PiExtensionLoadError[];
  busy: boolean;
  disabled: boolean;
  catalogInstallState: CatalogInstallState;
  onRun: (operation: PiPackageOperation) => void;
  onCatalogInstall: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const npmName = installed ? npmNameFromSource(installed.source) : (catalog?.name ?? null);
  const detail = useNpmDetail(npmName);
  const ready = detail?.status === 'ready' ? detail.detail : null;
  const repositoryUrl =
    installed?.repositoryUrl ??
    catalog?.repositoryUrl ??
    ready?.repositoryUrl ??
    (installed ? gitWebUrl(installed.source) : null);
  const readme = ready?.readme ? readmeForDisplay(ready.readme, repositoryUrl) : null;
  const errors = installed ? errorsForPackage(installed, loadErrors) : [];
  const title = installed ? packageTitle(installed) : (catalog?.name ?? '');
  const [now] = useState(() => Date.now());
  const description = installed?.description ?? catalog?.description ?? null;

  const header = (
    <>
      <div className="flex items-start gap-4 pr-8">
        <PackageThumbnail
          size="lg"
          image={
            installed?.installedPath
              ? { path: installed.installedPath }
              : npmName
                ? { npm: npmName }
                : null
          }
          kinds={installed ? resourceKinds(installed.resources) : (catalog?.kinds ?? [])}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-lg leading-tight">
            <PackageTitle
              title={title}
              version={installed?.version ?? catalog?.version ?? null}
              scope={installed?.scope ?? null}
            />
          </DialogTitle>
          <DialogDescription className="line-clamp-4 text-caption text-muted-foreground">
            {description || 'No description.'}
          </DialogDescription>
          {catalog ? (
            <>
              <CatalogMeta pkg={catalog} />
              {catalog.kinds.length > 0 && <KindLabels kinds={catalog.kinds} />}
            </>
          ) : (
            installed && (
              <span className="text-caption text-muted-foreground/80">
                {[installedMeta(installed, releasedAt, now), resourceSummary(installed.resources)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {installed ? (
            <InstalledActions
              pkg={installed}
              hasUpdate={hasUpdate}
              busy={busy}
              disabled={disabled}
              onRun={onRun}
              labelled
            />
          ) : (
            <CatalogInstallButton
              state={catalogInstallState}
              onInstall={onCatalogInstall}
              labelled
            />
          )}
        </div>
      </div>
      <div className="-ml-2 flex flex-wrap items-center gap-1">
        {npmName && <LinkButton href={piDevPackageUrl(npmName)}>pi.dev</LinkButton>}
        {npmName && <LinkButton href={npmPackageUrl(npmName)}>npm</LinkButton>}
        {repositoryUrl && <LinkButton href={repositoryUrl}>Repository</LinkButton>}
        {ready?.license && (
          <span className="px-2 text-caption text-muted-foreground">{ready.license}</span>
        )}
      </div>
      {!installed && (
        <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
          <IconShieldExclamation size={14} className="mt-[3px] shrink-0" />
          Packages run with full access to your computer. Read the source before installing one you
          do not know.
        </p>
      )}
    </>
  );

  return (
    <PackageDialogFrame header={header} onClose={onClose}>
      {errors.length > 0 && (
        <pre className="max-h-48 shrink-0 overflow-auto rounded-control bg-danger-bg px-3 py-2 font-mono text-code-compact whitespace-pre-wrap text-danger-fg">
          {errors.map((error) => `${error.path}\n${error.error}`).join('\n\n')}
        </pre>
      )}
      {installed &&
        (installed.installedPath === null ? (
          <p className="text-caption text-warning-fg">
            Settings list this package, but it is not installed.
          </p>
        ) : (
          <ResourceList resources={installed.resources} />
        ))}
      {detail && (
        <DialogSection title="README">
          {detail.status === 'loading' && <ReadmeSkeleton />}
          {detail.status === 'error' && (
            <p className="text-caption text-danger-fg">Could not load the README: {detail.error}</p>
          )}
          {detail.status === 'ready' &&
            (readme ? (
              <MarkdownMessage text={readme} />
            ) : (
              <p className="text-caption text-muted-foreground">This package has no README.</p>
            ))}
        </DialogSection>
      )}
    </PackageDialogFrame>
  );
}

export function LocalResourcesDialog({
  resources,
  onClose,
}: {
  resources: readonly PiResource[];
  onClose: () => void;
}): React.JSX.Element {
  return (
    <PackageDialogFrame
      onClose={onClose}
      header={
        <div className="flex items-start gap-4 pr-8">
          <PackageThumbnail size="lg" image={null} kinds={resourceKinds(resources)} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="text-lg leading-tight">Local</DialogTitle>
            <DialogDescription className="text-caption text-muted-foreground">
              {LOCAL_RESOURCES_DESCRIPTION}
            </DialogDescription>
            <span className="text-caption text-muted-foreground/80">
              {resourceSummary(resources)}
            </span>
          </div>
        </div>
      }
    >
      <ResourceList resources={resources} />
    </PackageDialogFrame>
  );
}
