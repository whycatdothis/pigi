/**
 * Installed pi packages and the marketplace (the pi.dev catalog), one tab
 * each. The field filters the installed packages or searches the marketplace;
 * installing from npm, git or a folder has its own dialog.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  IconAlertTriangle,
  IconArrowUp,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconLoader2,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import {
  npmNameFromSource,
  PI_DEV_PACKAGES_URL,
  PI_RESOURCE_KINDS,
  type CatalogPackage,
  type InstalledPiPackage,
  type PiExtensionLoadError,
  type PiPackageOperation,
  type PiPackageScope,
  type PiPackagesSnapshot,
} from '../../../../shared/piPackages';
import { usePiPackages, type PackageActivity } from '../../hooks/usePiPackages';
import { usePackageCatalog } from '../../hooks/usePackageCatalog';
import { PACKAGES_CONTENT_MAX_WIDTH } from '../../lib/layoutConstants';
import { Button } from '../ui/button';
import { SpinningIcon } from '../ui/spinningIcon';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { TooltipProvider } from '../ui/tooltip';
import { cn } from '@/lib/utils';
import { InstalledPackageCard, LocalResourcesCard } from './installedPackages';
import { CatalogPackageCard, type CatalogInstallState } from './catalogPackages';
import { CardGrid, CardsSkeleton } from './packageCards';
import { InstallSourceDialog } from './installSourceDialog';
import { LocalResourcesDialog, PackageDialog } from './packageDialog';
import {
  ACTION_FAILURE_LABELS,
  ACTION_PROGRESS_LABELS,
  ACTION_SUCCESS_LABELS,
  packageTitle,
  resourceKinds,
} from './packageLabels';

/** Even, so the two columns end level. */
const POPULAR_PAGE_SIZE = 12;

type PackagesTab = 'installed' | 'marketplace';

type DialogTarget =
  | { kind: 'installed'; key: string }
  | { kind: 'catalog'; pkg: CatalogPackage }
  | { kind: 'local' }
  | { kind: 'source' };

interface PackagesPageProps {
  projectPath: string | null;
  /** Reloads running sessions; returns how many reloaded now and how many wait for their reply. */
  onPackagesChanged: () => { reloaded: number; waiting: number };
}

function EmptyCard({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 rounded-surface-lg border border-dashed border-border px-5 py-8 text-center text-caption text-muted-foreground">
      {children}
    </div>
  );
}

function ErrorCard({
  children,
  onRetry,
}: {
  children: React.ReactNode;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-surface-lg border border-border bg-card px-5 py-4">
      <span className="min-w-0 flex-1 text-caption text-danger-fg">{children}</span>
      <Button size="xs" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ElapsedSeconds({ since }: { since: number }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
      {Math.max(0, Math.floor((now - since) / 1000))}s
    </span>
  );
}

function ActivityCard({
  activity,
  onRetry,
  onDismiss,
}: {
  activity: PackageActivity;
  onRetry: () => void;
  onDismiss: () => void;
}): React.JSX.Element {
  const [showLog, setShowLog] = useState(false);
  const { action, source } = activity.operation;
  if (activity.status === 'running') {
    return (
      <div
        className="flex items-center gap-3 rounded-surface-sm border border-border bg-popover px-4 py-3 shadow-popover"
        data-testid="package-activity"
      >
        <SpinningIcon className="text-muted-foreground">
          <IconLoader2 size={16} />
        </SpinningIcon>
        <span className="min-w-0 flex-1 truncate text-ui text-foreground">
          {ACTION_PROGRESS_LABELS[action]} <span className="font-medium">{source}</span>…
        </span>
        <ElapsedSeconds since={activity.startedAt} />
      </div>
    );
  }
  return (
    <div
      className="flex flex-col gap-2 rounded-surface-sm border border-danger-border bg-danger-bg px-4 py-3 shadow-popover"
      data-testid="package-activity"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <IconAlertTriangle size={16} className="mt-[3px] shrink-0 text-danger-fg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-ui font-medium text-danger-fg">
            {ACTION_FAILURE_LABELS[action]} {source}
          </span>
          <span className="text-caption break-words text-foreground/80">{activity.error}</span>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Dismiss"
          className="text-danger-fg hover:bg-danger-fg/10 hover:text-danger-fg"
          onClick={onDismiss}
        >
          <IconX />
        </Button>
      </div>
      <div className="flex items-center gap-1 pl-7">
        <Button size="xs" variant="outline" onClick={onRetry}>
          Try again
        </Button>
        {activity.log && (
          <Button size="xs" variant="ghost" onClick={() => setShowLog((value) => !value)}>
            {showLog ? 'Hide output' : 'Show output'}
          </Button>
        )}
        {showLog && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(activity.log);
              toast.success('Copied');
            }}
          >
            <IconCopy data-icon="inline-start" />
            Copy
          </Button>
        )}
      </div>
      {showLog && (
        <pre className="ml-7 max-h-64 overflow-auto rounded-control bg-background/70 px-3 py-2 font-mono text-code-compact whitespace-pre-wrap text-foreground">
          {activity.log}
        </pre>
      )}
    </div>
  );
}

interface ActivityResult {
  title: string;
  detail: string;
  /** Some extension failed to load: stays until dismissed. */
  failed: boolean;
}

/** How long a clean result stays in the corner. */
const RESULT_VISIBLE_MS = 4000;

function ResultCard({
  result,
  onDismiss,
}: {
  result: ActivityResult;
  onDismiss: () => void;
}): React.JSX.Element {
  const ResultIcon = result.failed ? IconAlertTriangle : IconCheck;
  return (
    <div
      className="flex items-start gap-3 rounded-surface-sm border border-border bg-popover px-4 py-3 shadow-popover"
      data-testid="package-result"
      role="status"
    >
      <ResultIcon
        size={16}
        className={cn('mt-[3px] shrink-0', result.failed ? 'text-warning-fg' : 'text-success-fg')}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-ui font-medium text-foreground">{result.title}</span>
        <span className="text-caption break-words text-muted-foreground">{result.detail}</span>
      </div>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Dismiss"
        className="text-muted-foreground"
        onClick={onDismiss}
      >
        <IconX />
      </Button>
    </div>
  );
}

function packageKey(pkg: { scope: PiPackageScope; source: string }): string {
  return `${pkg.scope}:${pkg.source}`;
}

function installedByNpmName(snapshot: PiPackagesSnapshot | null): Map<string, InstalledPiPackage> {
  const byName = new Map<string, InstalledPiPackage>();
  for (const pkg of snapshot?.packages ?? []) {
    const name = npmNameFromSource(pkg.source);
    // Project first in the list; the user-scope entry wins, as in pi.
    if (name) byName.set(name, pkg);
  }
  return byName;
}

/** Groups the installed cards by the kind each mostly holds; empty ones last. */
function kindRank(pkg: InstalledPiPackage): number {
  const kind = resourceKinds(pkg.resources)[0];
  return kind ? PI_RESOURCE_KINDS.indexOf(kind) : PI_RESOURCE_KINDS.length;
}

function matchesFilter(query: string, ...texts: (string | null | undefined)[]): boolean {
  const needle = query.toLowerCase();
  return texts.some((text) => text?.toLowerCase().includes(needle));
}

function packageMatches(pkg: InstalledPiPackage, query: string): boolean {
  return matchesFilter(
    query,
    packageTitle(pkg),
    pkg.description,
    ...pkg.resources.map((resource) => resource.name),
  );
}

export default function PackagesPage({
  projectPath,
  onPackagesChanged,
}: PackagesPageProps): React.JSX.Element {
  const packages = usePiPackages(projectPath);
  const { snapshot, health, activity, listError } = packages;
  const [tab, setTab] = useState<PackagesTab>('installed');
  const [text, setText] = useState('');
  const searchText = text.trim();
  // The popular list loads on the installed tab too, so switching shows it at once.
  const catalogQuery = tab === 'marketplace' ? searchText : '';
  const { state: catalog, retry: retryCatalog } = usePackageCatalog(catalogQuery);
  const [popularCount, setPopularCount] = useState(POPULAR_PAGE_SIZE);
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [result, setResult] = useState<ActivityResult | null>(null);
  useEffect(() => {
    if (!result || result.failed) return;
    const timer = window.setTimeout(() => setResult(null), RESULT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [result]);
  const fieldRef = useRef<HTMLInputElement>(null);

  const running = activity?.status === 'running';
  const installedByName = useMemo(() => installedByNpmName(snapshot), [snapshot]);

  /** Applies finished changes to running sessions and says so. */
  const announce = useCallback(
    (label: string, loadErrors: readonly PiExtensionLoadError[]) => {
      const { reloaded, waiting } = onPackagesChanged();
      const [firstError, ...otherErrors] = loadErrors;
      if (firstError) {
        // An install from the marketplace tab keeps the card's own notice out of sight.
        setResult({
          title: `${label}, but not everything loaded`,
          detail:
            otherErrors.length > 0
              ? `${loadErrors.length} extensions failed. ${firstError.error}`
              : firstError.error,
          failed: true,
        });
        return;
      }
      setResult({
        title: label,
        detail:
          waiting > 0
            ? `Applies to ${waiting === 1 ? 'a running session' : `${waiting} running sessions`} once ${waiting === 1 ? 'it finishes' : 'they finish'}.`
            : reloaded > 0
              ? `Reloaded ${reloaded === 1 ? 'the open session' : `${reloaded} open sessions`}.`
              : 'New sessions will load it.',
        failed: false,
      });
    },
    [onPackagesChanged],
  );

  /** Resolves true on success; a failure is shown by the activity card. */
  const run = useCallback(
    async (operation: PiPackageOperation): Promise<boolean> => {
      setResult(null);
      const loadErrors = await packages.run(operation);
      if (!loadErrors) return false;
      announce(`${ACTION_SUCCESS_LABELS[operation.action]} ${operation.source}`, loadErrors);
      return true;
    },
    [announce, packages],
  );

  const updatable = (snapshot?.packages ?? []).filter((pkg) =>
    health?.updates.includes(pkg.source),
  );

  const updateAll = async (): Promise<void> => {
    setResult(null);
    const { done, loadErrors } = await packages.runAll(
      updatable.map((pkg) => ({ action: 'update', source: pkg.source, scope: pkg.scope })),
    );
    if (done > 0) announce(`Updated ${done === 1 ? '1 package' : `${done} packages`}`, loadErrors);
  };

  const catalogInstallState = useCallback(
    (name: string): CatalogInstallState => ({
      installed: installedByName.has(name),
      busy:
        running &&
        activity.operation.action === 'install' &&
        npmNameFromSource(activity.operation.source) === name,
      disabled: running,
    }),
    [activity, installedByName, running],
  );

  const installFromDialog = (source: string): void => {
    setDialog(null);
    void run({ action: 'install', source, scope: 'user' });
  };

  const installFromCatalog = useCallback(
    (name: string) => {
      void run({ action: 'install', source: `npm:${name}`, scope: 'user' });
    },
    [run],
  );

  const isBusy = (pkg: InstalledPiPackage): boolean =>
    running && activity.operation.source === pkg.source && activity.operation.scope === pkg.scope;
  const runInstalled = (operation: PiPackageOperation): void => {
    void run(operation).then((succeeded) => {
      // Else the dialog's target would come back, open, with a later reinstall.
      if (succeeded && operation.action === 'remove') setDialog(null);
    });
  };

  const filteredInstalled = (snapshot?.packages ?? [])
    .filter((pkg) => !searchText || packageMatches(pkg, searchText))
    .sort((a, b) => kindRank(a) - kindRank(b));
  const localResources = snapshot?.local ?? [];
  const showLocal =
    localResources.length > 0 &&
    (!searchText || localResources.some((resource) => matchesFilter(searchText, resource.name)));

  const catalogPackages = catalog.packages ?? [];
  const isSearch = searchText !== '';
  const shownCatalog = isSearch ? catalogPackages : catalogPackages.slice(0, popularCount);
  const catalogStale = catalog.query !== (catalogQuery ?? '').trim();

  const dialogInstalled =
    dialog?.kind === 'installed'
      ? (snapshot?.packages.find((pkg) => packageKey(pkg) === dialog.key) ?? null)
      : dialog?.kind === 'catalog'
        ? (installedByName.get(dialog.pkg.name) ?? null)
        : null;
  const dialogCatalog = dialog?.kind === 'catalog' ? dialog.pkg : null;

  const installedTab = (
    <div className="flex flex-col gap-4">
      {snapshot?.projectTrusted === false && (
        <p className="flex items-center gap-1.5 text-caption text-warning-fg">
          <IconAlertTriangle size={14} className="shrink-0" />
          This project is not trusted, so pi ignores its packages (/trust in pi).
        </p>
      )}
      {snapshot === null && listError === null && <CardsSkeleton count={4} />}
      {snapshot === null && listError !== null && (
        <ErrorCard onRetry={packages.reload}>
          Could not read installed packages: {listError}
        </ErrorCard>
      )}
      {snapshot !== null && listError !== null && (
        <p className="text-caption text-danger-fg">Could not refresh the list: {listError}</p>
      )}
      {snapshot !== null &&
        (snapshot.packages.length === 0 && localResources.length === 0 ? (
          <EmptyCard>
            No packages yet.
            <Button size="sm" variant="outline" onClick={() => setTab('marketplace')}>
              Browse the marketplace
            </Button>
          </EmptyCard>
        ) : filteredInstalled.length === 0 && !showLocal ? (
          <EmptyCard>
            Nothing installed matches “{searchText}”.
            <Button size="sm" variant="outline" onClick={() => setTab('marketplace')}>
              Search the marketplace
            </Button>
          </EmptyCard>
        ) : (
          <CardGrid>
            {showLocal && (
              <div className="col-span-full">
                <LocalResourcesCard
                  resources={localResources}
                  onOpen={() => setDialog({ kind: 'local' })}
                />
              </div>
            )}
            {filteredInstalled.map((pkg) => (
              <InstalledPackageCard
                key={packageKey(pkg)}
                pkg={pkg}
                hasUpdate={health?.updates.includes(pkg.source) ?? false}
                releasedAt={health?.releasedAt[pkg.source] ?? null}
                loadErrors={health?.loadErrors ?? []}
                busy={isBusy(pkg)}
                disabled={running}
                onRun={runInstalled}
                onOpen={() => setDialog({ kind: 'installed', key: packageKey(pkg) })}
              />
            ))}
          </CardGrid>
        ))}
    </div>
  );

  const marketplaceTab = (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h2 className="text-caption font-semibold text-muted-foreground">
          {isSearch ? 'Results' : 'Popular'}
        </h2>
        <Button
          size="xs"
          variant="ghost"
          className="-mr-2 text-muted-foreground"
          onClick={() => window.piApi.openExternal(PI_DEV_PACKAGES_URL)}
        >
          Browse pi.dev
          <IconExternalLink data-icon="inline-end" />
        </Button>
      </div>
      {catalog.packages === null && catalog.error === null && <CardsSkeleton count={6} />}
      {catalog.error !== null && <ErrorCard onRetry={retryCatalog}>{catalog.error}</ErrorCard>}
      {catalog.packages !== null &&
        (shownCatalog.length === 0 ? (
          !catalogStale && <EmptyCard>No pi packages match “{catalog.query}”.</EmptyCard>
        ) : (
          <div className={catalogStale ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <CardGrid>
              {shownCatalog.map((pkg) => (
                <CatalogPackageCard
                  key={pkg.name}
                  pkg={pkg}
                  installState={catalogInstallState(pkg.name)}
                  onInstall={() => installFromCatalog(pkg.name)}
                  onOpen={() => setDialog({ kind: 'catalog', pkg })}
                />
              ))}
            </CardGrid>
          </div>
        ))}
      {!isSearch && catalogPackages.length > popularCount && (
        <Button
          variant="ghost"
          size="sm"
          className="self-center text-muted-foreground"
          onClick={() => setPopularCount((count) => count + POPULAR_PAGE_SIZE * 2)}
        >
          Show more
        </Button>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative flex h-full min-h-0 flex-col" data-testid="packages-page">
        <div className="h-11 shrink-0 [-webkit-app-region:drag]" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className="mx-auto flex w-full flex-col gap-6 px-8 pt-7 pb-10"
            style={{ maxWidth: `${PACKAGES_CONTENT_MAX_WIDTH}px` }}
          >
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Packages</h1>

            <Tabs
              value={tab}
              onValueChange={(value) =>
                setTab(value === 'marketplace' ? 'marketplace' : 'installed')
              }
            >
              <TabsList variant="chip">
                <TabsTrigger
                  value="installed"
                  className="px-3"
                  data-testid="packages-tab-installed"
                >
                  Installed
                  {snapshot && (
                    <span className="text-caption font-normal text-muted-foreground tabular-nums">
                      {snapshot.packages.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="marketplace"
                  className="px-3"
                  data-testid="packages-tab-marketplace"
                >
                  Marketplace
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center justify-between gap-3">
              <div className="flex h-10 w-1/4 items-center gap-2 rounded-control border border-input bg-card px-3 transition-colors">
                {catalog.loading && tab === 'marketplace' && catalogQuery !== null ? (
                  <SpinningIcon className="text-muted-foreground">
                    <IconLoader2 size={16} />
                  </SpinningIcon>
                ) : (
                  <IconSearch size={16} className="shrink-0 text-muted-foreground" />
                )}
                <input
                  ref={fieldRef}
                  // The page exists to find or add a package; the field is the first thing to use.
                  autoFocus
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && text) {
                      event.preventDefault();
                      setText('');
                    }
                  }}
                  placeholder={
                    tab === 'installed' ? 'Filter installed packages' : 'Search the marketplace'
                  }
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Search packages"
                  className="h-full min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
                  data-testid="packages-field"
                />
                {text && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Clear"
                    className="text-muted-foreground"
                    onClick={() => {
                      setText('');
                      fieldRef.current?.focus();
                    }}
                  >
                    <IconX />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {updatable.length > 0 && (
                  <Button
                    variant="outline"
                    className="h-10"
                    disabled={running}
                    onClick={() => void updateAll()}
                    data-testid="packages-update-all"
                  >
                    <IconArrowUp data-icon="inline-start" />
                    Update all
                    <span className="text-caption font-normal text-muted-foreground tabular-nums">
                      {updatable.length}
                    </span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => setDialog({ kind: 'source' })}
                  data-testid="packages-install-source"
                >
                  <IconDownload data-icon="inline-start" />
                  Install from…
                </Button>
              </div>
            </div>

            {tab === 'installed' ? installedTab : marketplaceTab}
          </div>
        </div>
        {(activity || result) && (
          // Floats over the page so starting or finishing a change moves no card.
          <div className="absolute bottom-4 left-4 z-10 w-96 max-w-[calc(100%-2rem)] animate-in duration-slow fade-in-0 slide-in-from-bottom-2">
            {activity ? (
              <ActivityCard
                key={`${activity.operation.action}:${activity.operation.source}`}
                activity={activity}
                onRetry={() => void run(activity.operation)}
                onDismiss={packages.dismissActivity}
              />
            ) : (
              result && <ResultCard result={result} onDismiss={() => setResult(null)} />
            )}
          </div>
        )}
        {dialog?.kind === 'source' && (
          <InstallSourceDialog
            disabled={running}
            onInstall={installFromDialog}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === 'local' && (
          <LocalResourcesDialog resources={localResources} onClose={() => setDialog(null)} />
        )}
        {(dialogInstalled || dialogCatalog) && (
          <PackageDialog
            key={dialogCatalog?.name ?? (dialogInstalled ? packageKey(dialogInstalled) : '')}
            installed={dialogInstalled}
            catalog={dialogCatalog}
            hasUpdate={
              dialogInstalled ? (health?.updates.includes(dialogInstalled.source) ?? false) : false
            }
            releasedAt={
              dialogInstalled ? (health?.releasedAt[dialogInstalled.source] ?? null) : null
            }
            loadErrors={health?.loadErrors ?? []}
            busy={dialogInstalled ? isBusy(dialogInstalled) : false}
            disabled={running}
            catalogInstallState={catalogInstallState(dialogCatalog?.name ?? '')}
            onRun={runInstalled}
            onCatalogInstall={() => dialogCatalog && installFromCatalog(dialogCatalog.name)}
            onClose={() => setDialog(null)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
