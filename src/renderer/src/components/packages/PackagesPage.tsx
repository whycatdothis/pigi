/**
 * Installed pi packages and the catalog, with one field for both: a search
 * query browses the catalog, a source (`npm:…`, a git URL, a path, a
 * `pi install …` line) installs directly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  IconAlertTriangle,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconLoader2,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import {
  npmNameFromSource,
  parsePackageInput,
  PI_DEV_PACKAGES_URL,
  type CatalogPackage,
  type PiPackageOperation,
  type PiPackageScope,
  type PiPackagesSnapshot,
} from '../../../../shared/piPackages';
import { usePiPackages, type PackageActivity } from '../../hooks/usePiPackages';
import { usePackageCatalog } from '../../hooks/usePackageCatalog';
import { SETTINGS_CONTENT_MAX_WIDTH } from '../../lib/layoutConstants';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { SpinningIcon } from '../ui/spinningIcon';
import { SegmentedControl, SettingsCard } from '../settings/settingsControls';
import { InstalledPackageRow, LocalResourcesRow } from './installedPackages';
import {
  CatalogPackageDialog,
  CatalogPackageRow,
  type CatalogInstallState,
} from './catalogPackages';
import {
  ACTION_FAILURE_LABELS,
  ACTION_PROGRESS_LABELS,
  ACTION_SUCCESS_LABELS,
  sourceKindLabel,
} from './packageLabels';

const POPULAR_PAGE_SIZE = 10;

interface PackagesPageProps {
  projectPath: string | null;
  projectName: string | null;
  /** Reloads running sessions; returns how many reloaded now and how many wait for their reply. */
  onPackagesChanged: () => { reloaded: number; waiting: number };
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <h2 className="text-caption font-semibold text-muted-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function RowsSkeleton({ rows }: { rows: number }): React.JSX.Element {
  return (
    <SettingsCard>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 px-5 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </SettingsCard>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <SettingsCard>
      <p className="px-5 py-4 text-caption text-muted-foreground">{children}</p>
    </SettingsCard>
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
        className="flex items-center gap-3 rounded-surface-sm border border-border bg-card px-4 py-3"
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
      className="flex flex-col gap-2 rounded-surface-sm border border-danger-border bg-danger-bg px-4 py-3"
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

function SourceInstallCard({
  source,
  scope,
  projectName,
  onScopeChange,
  onInstall,
  disabled,
}: {
  source: string;
  scope: PiPackageScope;
  projectName: string | null;
  onScopeChange: (scope: PiPackageScope) => void;
  onInstall: () => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <div
      className="flex items-center gap-3 rounded-surface-sm border border-border bg-card px-4 py-3"
      data-testid="source-install"
    >
      <IconDownload size={16} className="shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-code text-foreground" title={source}>
          {source}
        </span>
        <span className="text-caption text-muted-foreground">
          {sourceKindLabel(source)} ·{' '}
          {scope === 'project'
            ? `installs into ${projectName ?? 'this project'}`
            : 'installs for every project'}
        </span>
      </div>
      {projectName && (
        <SegmentedControl
          value={scope}
          options={[
            { value: 'user', label: 'Global' },
            { value: 'project', label: 'This project' },
          ]}
          onChange={onScopeChange}
        />
      )}
      <Button size="sm" disabled={disabled} onClick={onInstall}>
        Install
      </Button>
    </div>
  );
}

function packageKey(pkg: { scope: PiPackageScope; source: string }): string {
  return `${pkg.scope}:${pkg.source}`;
}

function installedNpmNames(snapshot: PiPackagesSnapshot | null): Set<string> {
  const names = new Set<string>();
  for (const pkg of snapshot?.packages ?? []) {
    const name = npmNameFromSource(pkg.source);
    if (name) names.add(name);
  }
  return names;
}

export default function PackagesPage({
  projectPath,
  projectName,
  onPackagesChanged,
}: PackagesPageProps): React.JSX.Element {
  const packages = usePiPackages(projectPath);
  const { snapshot, health, activity, listError } = packages;
  const [text, setText] = useState('');
  const input = useMemo(() => parsePackageInput(text), [text]);
  // The toggle wins over a typed `-l`; without a project there is only one scope.
  const [scopeChoice, setScopeChoice] = useState<PiPackageScope | null>(null);
  const typedScope = input.kind === 'source' ? input.scope : null;
  const sourceScope: PiPackageScope = projectPath ? (scopeChoice ?? typedScope ?? 'user') : 'user';
  const catalogQuery = input.kind === 'source' ? null : input.kind === 'search' ? input.query : '';
  const { state: catalog, retry: retryCatalog } = usePackageCatalog(catalogQuery);
  const [popularCount, setPopularCount] = useState(POPULAR_PAGE_SIZE);
  const [openPackage, setOpenPackage] = useState<CatalogPackage | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  const running = activity?.status === 'running';
  // The failure card already offers the retry; a second Install beside it is noise.
  const failedSameSource =
    activity?.status === 'failed' &&
    input.kind === 'source' &&
    activity.operation.source === input.source;
  const installedNames = useMemo(() => installedNpmNames(snapshot), [snapshot]);

  /** Resolves true on success; a failure is shown by the activity card. */
  const run = useCallback(
    async (operation: PiPackageOperation): Promise<boolean> => {
      const loadErrors = await packages.run(operation);
      if (!loadErrors) return false;
      const { reloaded, waiting } = onPackagesChanged();
      const label = `${ACTION_SUCCESS_LABELS[operation.action]} ${operation.source}`;
      const [firstError, ...otherErrors] = loadErrors;
      if (firstError) {
        // An install from the search results hides the installed list, so the
        // row's own notice may not be on screen.
        toast.error(`${label}, but it failed to load`, {
          description:
            otherErrors.length > 0
              ? `${loadErrors.length} extensions failed. ${firstError.error}`
              : firstError.error,
        });
        return true;
      }
      toast.success(label, {
        description:
          waiting > 0
            ? `Applies to ${waiting === 1 ? 'a running session' : `${waiting} running sessions`} once ${waiting === 1 ? 'it finishes' : 'they finish'}.`
            : reloaded > 0
              ? `Reloaded ${reloaded === 1 ? 'the open session' : `${reloaded} open sessions`}.`
              : 'New sessions will load it.',
      });
      return true;
    },
    [onPackagesChanged, packages],
  );

  const installSource = useCallback(() => {
    if (input.kind !== 'source' || running) return;
    void run({ action: 'install', source: input.source, scope: sourceScope }).then((succeeded) => {
      // A failed line stays, so an edit starts from it.
      if (succeeded) setText('');
    });
  }, [input, run, running, sourceScope]);

  const catalogInstallState = useCallback(
    (name: string): CatalogInstallState => ({
      installed: installedNames.has(name),
      busy:
        running &&
        activity.operation.action === 'install' &&
        npmNameFromSource(activity.operation.source) === name,
      disabled: running,
    }),
    [activity, installedNames, running],
  );

  const installFromCatalog = useCallback(
    (name: string) => {
      void run({ action: 'install', source: `npm:${name}`, scope: 'user' });
    },
    [run],
  );

  const catalogPackages = catalog.packages ?? [];
  const isSearch = input.kind === 'search';
  const shownCatalog = isSearch ? catalogPackages : catalogPackages.slice(0, popularCount);
  const catalogStale = catalog.query !== (catalogQuery ?? '').trim();

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="packages-page">
      <div className="h-11 shrink-0 [-webkit-app-region:drag]" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="mx-auto flex w-full flex-col gap-9 px-5 pt-7 pb-10"
          style={{ maxWidth: `${SETTINGS_CONTENT_MAX_WIDTH}px` }}
        >
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Packages</h1>
            <p className="text-caption text-muted-foreground">
              Extensions, skills, prompt templates and themes for pi, from npm, git or a folder.
              They run with full access to your computer, so install the ones you trust.
            </p>
          </header>

          <div className="flex flex-col gap-3">
            <div className="flex h-10 items-center gap-2 rounded-control border border-input bg-card px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
              {catalog.loading && catalogQuery !== null ? (
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
                  if (event.key === 'Enter') installSource();
                  if (event.key === 'Escape' && text) {
                    event.preventDefault();
                    setText('');
                  }
                }}
                placeholder="Search packages, or paste npm:…, a git URL or a path"
                spellCheck={false}
                autoComplete="off"
                aria-label="Search packages or enter a package source"
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
            {input.kind === 'source' && !failedSameSource && (
              <SourceInstallCard
                source={input.source}
                scope={sourceScope}
                projectName={projectName}
                onScopeChange={setScopeChoice}
                onInstall={installSource}
                disabled={running}
              />
            )}
            {activity && (
              <ActivityCard
                key={`${activity.operation.action}:${activity.operation.source}`}
                activity={activity}
                onRetry={() => void run(activity.operation)}
                onDismiss={packages.dismissActivity}
              />
            )}
          </div>

          {!isSearch && (
            <Section
              title="Installed"
              aside={
                snapshot?.projectTrusted === false && (
                  <span
                    className="truncate text-caption text-warning-fg"
                    title="pi ignores a project's packages until the project is trusted (/trust in pi)."
                  >
                    Project not trusted — its packages are ignored
                  </span>
                )
              }
            >
              {snapshot === null && listError === null && <RowsSkeleton rows={2} />}
              {snapshot === null && listError !== null && (
                <SettingsCard>
                  <div className="flex items-center gap-3 px-5 py-4">
                    <span className="min-w-0 flex-1 text-caption text-danger-fg">
                      Could not read installed packages: {listError}
                    </span>
                    <Button size="xs" variant="outline" onClick={packages.reload}>
                      Try again
                    </Button>
                  </div>
                </SettingsCard>
              )}
              {snapshot !== null && (
                <>
                  {listError !== null && (
                    <p className="text-caption text-danger-fg">
                      Could not refresh the list: {listError}
                    </p>
                  )}
                  {snapshot.packages.length === 0 ? (
                    <EmptyCard>
                      No packages yet. Pick one below, search the catalog, or paste a source above.
                    </EmptyCard>
                  ) : (
                    <SettingsCard>
                      {snapshot.packages.map((pkg) => (
                        <InstalledPackageRow
                          key={packageKey(pkg)}
                          pkg={pkg}
                          hasUpdate={health?.updates.includes(pkg.source) ?? false}
                          loadErrors={health?.loadErrors ?? []}
                          busy={
                            running &&
                            activity.operation.source === pkg.source &&
                            activity.operation.scope === pkg.scope
                          }
                          disabled={running}
                          onRun={(operation) => void run(operation)}
                        />
                      ))}
                    </SettingsCard>
                  )}
                  {snapshot.local.length > 0 && (
                    <SettingsCard>
                      <LocalResourcesRow resources={snapshot.local} />
                    </SettingsCard>
                  )}
                </>
              )}
            </Section>
          )}

          {input.kind !== 'source' && (
            <Section
              title={isSearch ? 'Results' : 'Popular'}
              aside={
                <Button
                  size="xs"
                  variant="ghost"
                  className="-mr-2 text-muted-foreground"
                  onClick={() => window.piApi.openExternal(PI_DEV_PACKAGES_URL)}
                >
                  Browse pi.dev
                  <IconExternalLink data-icon="inline-end" />
                </Button>
              }
            >
              {catalog.packages === null && catalog.error === null && <RowsSkeleton rows={4} />}
              {catalog.error !== null && (
                <SettingsCard>
                  <div className="flex items-center gap-3 px-5 py-4">
                    <span className="min-w-0 flex-1 text-caption text-danger-fg">
                      {catalog.error}
                    </span>
                    <Button size="xs" variant="outline" onClick={retryCatalog}>
                      Try again
                    </Button>
                  </div>
                </SettingsCard>
              )}
              {catalog.packages !== null &&
                (shownCatalog.length === 0 ? (
                  !catalogStale && <EmptyCard>No pi packages match “{catalog.query}”.</EmptyCard>
                ) : (
                  <div
                    className={
                      catalogStale ? 'opacity-60 transition-opacity' : 'transition-opacity'
                    }
                  >
                    <SettingsCard>
                      {shownCatalog.map((pkg) => (
                        <CatalogPackageRow
                          key={pkg.name}
                          pkg={pkg}
                          installState={catalogInstallState(pkg.name)}
                          onInstall={() => installFromCatalog(pkg.name)}
                          onOpen={() => setOpenPackage(pkg)}
                        />
                      ))}
                    </SettingsCard>
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
            </Section>
          )}
        </div>
      </div>
      {openPackage && (
        <CatalogPackageDialog
          pkg={openPackage}
          installState={catalogInstallState(openPackage.name)}
          onInstall={() => installFromCatalog(openPackage.name)}
          onClose={() => setOpenPackage(null)}
        />
      )}
    </div>
  );
}
