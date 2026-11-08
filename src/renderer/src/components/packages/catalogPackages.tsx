import { useState } from 'react';
import { IconCheck, IconDownload, IconLoader2 } from '@tabler/icons-react';
import type { CatalogPackage } from '../../../../shared/piPackages';
import { Button } from '../ui/button';
import { SpinningIcon } from '../ui/spinningIcon';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { formatTimeAgo } from '@/lib/utils';
import { PackageCard, PackageThumbnail } from './packageCards';
import { PackageTitle } from './installedPackages';
import { formatDownloads } from './packageLabels';

export interface CatalogInstallState {
  installed: boolean;
  /** This package's install is running. */
  busy: boolean;
  /** Another operation is running. */
  disabled: boolean;
}

export function CatalogMeta({ pkg }: { pkg: CatalogPackage }): React.JSX.Element {
  // An age read once is precise enough for "3d ago".
  const [now] = useState(() => Date.now());
  const parts = [
    pkg.author,
    pkg.monthlyDownloads !== null ? formatDownloads(pkg.monthlyDownloads) : null,
    pkg.date ? formatTimeAgo(pkg.date, now) : null,
  ].filter(Boolean);
  return (
    <span className="truncate text-caption text-muted-foreground/80">{parts.join(' · ')}</span>
  );
}

export function CatalogInstallButton({
  state,
  onInstall,
  labelled = false,
}: {
  state: CatalogInstallState;
  onInstall: () => void;
  labelled?: boolean;
}): React.JSX.Element {
  if (state.busy) {
    return (
      <SpinningIcon className="m-1.5 text-muted-foreground">
        <IconLoader2 size={16} />
      </SpinningIcon>
    );
  }
  if (state.installed) {
    return (
      <span className="flex h-7 items-center gap-1 px-1.5 text-caption text-muted-foreground">
        <IconCheck size={14} />
        Installed
      </span>
    );
  }
  if (labelled) {
    return (
      <Button size="sm" disabled={state.disabled} onClick={onInstall}>
        Install
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Install"
          disabled={state.disabled}
          onClick={onInstall}
          className="text-foreground"
        >
          <IconDownload size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Install for every project</TooltipContent>
    </Tooltip>
  );
}

export function CatalogPackageCard({
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
    <PackageCard
      testId={`catalog-package-${pkg.name}`}
      onOpen={onOpen}
      thumbnail={<PackageThumbnail image={{ npm: pkg.name }} kinds={pkg.kinds} />}
      title={<PackageTitle title={pkg.name} version={pkg.version} scope={null} />}
      description={pkg.description}
      meta={<CatalogMeta pkg={pkg} />}
      kinds={pkg.kinds}
      actions={<CatalogInstallButton state={installState} onInstall={onInstall} />}
    />
  );
}
