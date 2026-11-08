import { useState } from 'react';
import {
  IconAlertTriangle,
  IconChevronRight,
  IconDots,
  IconExternalLink,
  IconLoader2,
  IconTrash,
} from '@tabler/icons-react';
import {
  npmNameFromSource,
  npmPackageUrl,
  PI_RESOURCE_KINDS,
  piDevPackageUrl,
  type InstalledPiPackage,
  type PiExtensionLoadError,
  type PiPackageOperation,
  type PiResource,
} from '../../../../shared/piPackages';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { SpinningIcon } from '../ui/spinningIcon';
import { cn } from '@/lib/utils';
import {
  errorsForPackage,
  RESOURCE_KIND_ICONS,
  RESOURCE_KIND_LABELS,
  resourceSummary,
} from './packageLabels';

export function ScopeBadge(): React.JSX.Element {
  return (
    <span className="shrink-0 rounded-chip bg-muted px-1.5 text-2xs leading-[18px] font-medium text-muted-foreground">
      Project
    </span>
  );
}

function ResourceList({ resources }: { resources: readonly PiResource[] }): React.JSX.Element {
  if (resources.length === 0) {
    return (
      <p className="text-caption text-muted-foreground">
        Nothing for pi in this package, or a filter in settings excludes all of it.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {PI_RESOURCE_KINDS.map((kind) => {
        const ofKind = resources.filter((resource) => resource.kind === kind);
        if (ofKind.length === 0) return null;
        const KindIcon = RESOURCE_KIND_ICONS[kind];
        return (
          <div key={kind} className="flex flex-col gap-1">
            <h4 className="text-caption font-semibold text-muted-foreground capitalize">
              {RESOURCE_KIND_LABELS[kind].many}
            </h4>
            <ul className="flex flex-col">
              {ofKind.map((resource) => (
                <li
                  key={resource.path}
                  className={cn(
                    'flex min-w-0 items-start gap-2 py-1',
                    !resource.enabled && 'opacity-50',
                  )}
                  title={[resource.description, resource.path].filter(Boolean).join('\n\n')}
                >
                  <KindIcon size={14} className="mt-[3px] shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-caption font-medium text-foreground">
                        {resource.name}
                      </span>
                      {resource.scope === 'project' && <ScopeBadge />}
                      {!resource.enabled && (
                        <span className="shrink-0 text-2xs text-muted-foreground">Disabled</span>
                      )}
                    </div>
                    {resource.description && (
                      <span className="line-clamp-1 text-caption text-muted-foreground">
                        {resource.description}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ExpandableRow({
  title,
  meta,
  description,
  details,
  notice,
  actions,
  testId,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  description?: string | null;
  details: React.ReactNode;
  notice?: React.ReactNode;
  actions?: React.ReactNode;
  testId?: string;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-3 px-5 py-3.5" data-testid={testId}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="group/row flex min-w-0 flex-1 flex-col gap-0.5 text-left outline-none"
        >
          <div className="flex min-w-0 items-center gap-2">
            {title}
            <IconChevronRight
              size={14}
              className={cn(
                'shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] group-hover/row:opacity-100 group-focus-visible/row:opacity-100',
                expanded && 'rotate-90 opacity-100',
              )}
            />
          </div>
          {description && (
            <span className="line-clamp-1 text-caption text-muted-foreground">{description}</span>
          )}
          {meta && <span className="truncate text-caption text-muted-foreground/80">{meta}</span>}
          {notice}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {expanded && <div className="pl-0.5">{details}</div>}
    </div>
  );
}

/** `https://github.com/a/b.git` reads as `github.com/a/b`. */
function displaySource(source: string): string {
  return source
    .replace(/^git:/, '')
    .replace(/^(https?|ssh|git):\/\/(git@)?/, '')
    .replace(/\.git(@|$)/, '$1');
}

export function InstalledPackageRow({
  pkg,
  hasUpdate,
  loadErrors,
  busy,
  disabled,
  onRun,
}: {
  pkg: InstalledPiPackage;
  hasUpdate: boolean;
  loadErrors: readonly PiExtensionLoadError[];
  /** This package's operation is running. */
  busy: boolean;
  /** Another operation is running. */
  disabled: boolean;
  onRun: (operation: PiPackageOperation) => void;
}): React.JSX.Element {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const npmName = npmNameFromSource(pkg.source);
  // What the user installed, not package.json's name: a git repo's manifest
  // can name something it no longer contains.
  const title = npmName ?? displaySource(pkg.source);
  const errors = errorsForPackage(pkg, loadErrors);
  const missing = pkg.installedPath === null;
  const run = (action: PiPackageOperation['action']): void =>
    onRun({ action, source: pkg.source, scope: pkg.scope });
  const summary = resourceSummary(pkg.resources);

  let actions: React.ReactNode;
  if (busy) {
    actions = (
      <SpinningIcon className="mx-2 text-muted-foreground">
        <IconLoader2 size={16} />
      </SpinningIcon>
    );
  } else if (confirmingRemove) {
    actions = (
      <>
        <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(false)}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={disabled}
          onClick={() => {
            setConfirmingRemove(false);
            run('remove');
          }}
        >
          Remove
        </Button>
      </>
    );
  } else {
    actions = (
      <>
        {missing ? (
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => run('install')}>
            Install
          </Button>
        ) : (
          hasUpdate && (
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => run('update')}>
              Update
            </Button>
          )
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`More actions for ${title}`}
              className="text-muted-foreground"
            >
              <IconDots size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {npmName && (
              <DropdownMenuItem
                onSelect={() => window.piApi.openExternal(piDevPackageUrl(npmName))}
              >
                <IconExternalLink />
                View on pi.dev
              </DropdownMenuItem>
            )}
            {npmName && (
              <DropdownMenuItem onSelect={() => window.piApi.openExternal(npmPackageUrl(npmName))}>
                <IconExternalLink />
                View on npm
              </DropdownMenuItem>
            )}
            {pkg.repositoryUrl && (
              <DropdownMenuItem
                onSelect={() => pkg.repositoryUrl && window.piApi.openExternal(pkg.repositoryUrl)}
              >
                <IconExternalLink />
                Open repository
              </DropdownMenuItem>
            )}
            {(npmName || pkg.repositoryUrl) && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant="destructive"
              disabled={disabled}
              onSelect={() => setConfirmingRemove(true)}
            >
              <IconTrash />
              Remove…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  }

  return (
    <ExpandableRow
      testId={`installed-package-${title}`}
      title={
        <>
          <span className="truncate text-ui font-medium text-foreground">{title}</span>
          {pkg.version && (
            <span className="shrink-0 text-caption text-muted-foreground">{pkg.version}</span>
          )}
          {pkg.scope === 'project' && <ScopeBadge />}
        </>
      }
      description={pkg.description}
      meta={summary || null}
      notice={
        missing ? (
          <span className="mt-1 flex items-center gap-1.5 text-caption text-warning-fg">
            <IconAlertTriangle size={14} className="shrink-0" />
            In settings but not installed
          </span>
        ) : errors.length > 0 ? (
          <span className="mt-1 flex items-start gap-1.5 text-caption text-danger-fg">
            <IconAlertTriangle size={14} className="mt-[3px] shrink-0" />
            <span className="line-clamp-2">
              {errors.length === 1
                ? `Failed to load: ${errors[0]?.error}`
                : `${errors.length} extensions failed to load`}
            </span>
          </span>
        ) : null
      }
      details={
        <div className="flex flex-col gap-3">
          {errors.length > 0 && (
            <pre className="max-h-48 overflow-auto rounded-control bg-danger-bg px-3 py-2 font-mono text-code-compact whitespace-pre-wrap text-danger-fg">
              {errors.map((error) => `${error.path}\n${error.error}`).join('\n\n')}
            </pre>
          )}
          <ResourceList resources={pkg.resources} />
        </div>
      }
      actions={actions}
    />
  );
}

/** Resources from pi's own directories and settings paths, which no package owns. */
export function LocalResourcesRow({
  resources,
}: {
  resources: readonly PiResource[];
}): React.JSX.Element {
  return (
    <ExpandableRow
      testId="local-resources"
      title={<span className="truncate text-ui font-medium text-foreground">Local</span>}
      description="Not from a package: ~/.pi/agent, ~/.agents/skills, project .pi/ and paths in settings."
      meta={resourceSummary(resources)}
      details={<ResourceList resources={resources} />}
    />
  );
}
