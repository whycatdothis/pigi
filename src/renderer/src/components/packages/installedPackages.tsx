import { useState } from 'react';
import {
  IconAlertTriangle,
  IconArrowUp,
  IconDownload,
  IconLoader2,
  IconTrash,
  type Icon,
} from '@tabler/icons-react';
import {
  PI_RESOURCE_KINDS,
  type InstalledPiPackage,
  type PiExtensionLoadError,
  type PiPackageOperation,
  type PiResource,
} from '../../../../shared/piPackages';
import { Button } from '../ui/button';
import { SpinningIcon } from '../ui/spinningIcon';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';
import { PackageCard, PackageThumbnail } from './packageCards';
import {
  errorsForPackage,
  installedMeta,
  packageTitle,
  RESOURCE_KIND_ICONS,
  RESOURCE_KIND_LABELS,
  resourceKinds,
} from './packageLabels';

export function ScopeBadge(): React.JSX.Element {
  return (
    <span className="shrink-0 rounded-chip bg-muted px-1.5 text-2xs leading-[18px] font-medium text-muted-foreground">
      Project
    </span>
  );
}

export function ResourceList({
  resources,
}: {
  resources: readonly PiResource[];
}): React.JSX.Element {
  if (resources.length === 0) {
    return (
      <p className="text-caption text-muted-foreground">
        Nothing for pi in this package, or a filter in settings excludes all of it.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {PI_RESOURCE_KINDS.map((kind) => {
        const ofKind = resources.filter((resource) => resource.kind === kind);
        if (ofKind.length === 0) return null;
        const KindIcon = RESOURCE_KIND_ICONS[kind];
        return (
          <div key={kind} className="flex flex-col gap-1">
            <h4 className="text-caption font-semibold text-muted-foreground capitalize">
              {RESOURCE_KIND_LABELS[kind].many} · {ofKind.length}
            </h4>
            <ul className="flex flex-col">
              {ofKind.map((resource) => (
                <li
                  key={resource.path}
                  className={cn(
                    'flex min-w-0 items-start gap-2 py-1',
                    !resource.enabled && 'opacity-50',
                  )}
                  title={resource.path}
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
                      <span className="text-caption text-muted-foreground">
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

function IconAction({
  icon: ActionIcon,
  label,
  onClick,
  disabled,
  className,
}: {
  icon: Icon;
  label: string;
  onClick: () => void;
  disabled: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn('text-muted-foreground', className)}
        >
          <ActionIcon size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Install (when settings name it but it is missing), Update, Remove. Icons on
 * a card, labelled buttons in the details; Remove asks first in both.
 */
export function InstalledActions({
  pkg,
  hasUpdate,
  busy,
  disabled,
  onRun,
  labelled = false,
}: {
  pkg: InstalledPiPackage;
  hasUpdate: boolean;
  /** This package's operation is running. */
  busy: boolean;
  /** Another operation is running. */
  disabled: boolean;
  onRun: (operation: PiPackageOperation) => void;
  labelled?: boolean;
}): React.JSX.Element {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const run = (action: PiPackageOperation['action']): void =>
    onRun({ action, source: pkg.source, scope: pkg.scope });
  const missing = pkg.installedPath === null;

  if (busy) {
    return (
      <SpinningIcon className="m-1.5 text-muted-foreground">
        <IconLoader2 size={16} />
      </SpinningIcon>
    );
  }
  if (confirmingRemove) {
    return (
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
  }
  if (labelled) {
    return (
      <>
        {missing && (
          <Button size="sm" disabled={disabled} onClick={() => run('install')}>
            Install
          </Button>
        )}
        {!missing && hasUpdate && (
          <Button size="sm" disabled={disabled} onClick={() => run('update')}>
            Update
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => setConfirmingRemove(true)}
        >
          Remove
        </Button>
      </>
    );
  }
  return (
    <>
      {missing && (
        <IconAction
          icon={IconDownload}
          label="Install"
          disabled={disabled}
          onClick={() => run('install')}
          className="text-foreground"
        />
      )}
      {!missing && hasUpdate && (
        <IconAction
          icon={IconArrowUp}
          label="Update"
          disabled={disabled}
          onClick={() => run('update')}
          className="text-primary hover:text-primary"
        />
      )}
      <IconAction
        icon={IconTrash}
        label="Remove"
        disabled={disabled}
        onClick={() => setConfirmingRemove(true)}
      />
    </>
  );
}

export function PackageNotice({
  missing,
  errors,
}: {
  missing: boolean;
  errors: readonly PiExtensionLoadError[];
}): React.JSX.Element | null {
  if (missing) {
    return (
      <span className="mt-1 flex items-center gap-1.5 text-caption text-warning-fg">
        <IconAlertTriangle size={14} className="shrink-0" />
        In settings but not installed
      </span>
    );
  }
  if (errors.length === 0) return null;
  return (
    <span className="mt-1 flex items-start gap-1.5 text-caption text-danger-fg">
      <IconAlertTriangle size={14} className="mt-[3px] shrink-0" />
      <span className="line-clamp-2">
        {errors.length === 1
          ? `Failed to load: ${errors[0]?.error}`
          : `${errors.length} extensions failed to load`}
      </span>
    </span>
  );
}

export function PackageTitle({
  title,
  version,
  scope,
}: {
  title: string;
  version: string | null;
  scope: InstalledPiPackage['scope'] | null;
}): React.JSX.Element {
  return (
    <>
      <span className="truncate text-ui font-medium text-foreground" title={title}>
        {title}
      </span>
      {version && <span className="shrink-0 text-caption text-muted-foreground">{version}</span>}
      {scope === 'project' && <ScopeBadge />}
    </>
  );
}

export function InstalledPackageCard({
  pkg,
  hasUpdate,
  releasedAt,
  loadErrors,
  busy,
  disabled,
  onRun,
  onOpen,
}: {
  pkg: InstalledPiPackage;
  hasUpdate: boolean;
  releasedAt: string | null;
  loadErrors: readonly PiExtensionLoadError[];
  busy: boolean;
  disabled: boolean;
  onRun: (operation: PiPackageOperation) => void;
  onOpen: () => void;
}): React.JSX.Element {
  const title = packageTitle(pkg);
  // An age read once is precise enough for "3d ago".
  const [now] = useState(() => Date.now());
  return (
    <PackageCard
      testId={`installed-package-${title}`}
      onOpen={onOpen}
      thumbnail={
        <PackageThumbnail
          image={pkg.installedPath ? { path: pkg.installedPath } : null}
          kinds={resourceKinds(pkg.resources)}
        />
      }
      title={<PackageTitle title={title} version={pkg.version} scope={pkg.scope} />}
      description={pkg.description}
      meta={installedMeta(pkg, releasedAt, now)}
      kinds={resourceKinds(pkg.resources)}
      notice={
        <PackageNotice
          missing={pkg.installedPath === null}
          errors={errorsForPackage(pkg, loadErrors)}
        />
      }
      actions={
        <InstalledActions
          pkg={pkg}
          hasUpdate={hasUpdate}
          busy={busy}
          disabled={disabled}
          onRun={onRun}
        />
      }
    />
  );
}

export const LOCAL_RESOURCES_DESCRIPTION =
  'Not from a package: ~/.pi/agent, ~/.agents/skills, project .pi/ and paths in settings.';

/** Resources from pi's own directories and settings paths, which no package owns. */
export function LocalResourcesCard({
  resources,
  onOpen,
}: {
  resources: readonly PiResource[];
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <PackageCard
      testId="local-resources"
      onOpen={onOpen}
      thumbnail={<PackageThumbnail image={null} kinds={resourceKinds(resources)} />}
      title={<PackageTitle title="Local" version={null} scope={null} />}
      description={LOCAL_RESOURCES_DESCRIPTION}
      kinds={resourceKinds(resources)}
    />
  );
}
