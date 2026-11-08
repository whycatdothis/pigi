import { useRef, useState } from 'react';
import {
  IconAlertCircle,
  IconBrandGit,
  IconBrandNpm,
  IconFolder,
  IconFolderOpen,
  IconPackage,
  type Icon,
} from '@tabler/icons-react';
import { parseInstallSource, piSourceType, type PiSourceType } from '../../../../shared/piPackages';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '@/lib/utils';
import { packageTitle, SOURCE_TYPE_LABELS } from './packageLabels';

const EXAMPLES: readonly { kind: string; sources: readonly string[] }[] = [
  { kind: 'npm', sources: ['package-name', 'npm:@scope/name@1.2.0'] },
  { kind: 'git', sources: ['https://github.com/user/repo', 'git@github.com:user/repo.git'] },
  { kind: 'Folder', sources: ['~/code/my-package'] },
  { kind: 'pi', sources: ['pi install npm:package-name'] },
];

const SOURCE_ICONS: Record<PiSourceType, Icon> = {
  npm: IconBrandNpm,
  git: IconBrandGit,
  local: IconFolder,
};

function Examples(): React.JSX.Element {
  return (
    <dl className="grid grid-cols-[3.5rem_1fr] items-baseline gap-x-3 gap-y-2.5">
      {EXAMPLES.map(({ kind, sources }) => (
        <div key={kind} className="contents">
          <dt className="text-ui text-muted-foreground">{kind}</dt>
          <dd className="flex flex-wrap gap-1.5">
            {sources.map((example) => (
              <code
                key={example}
                className="rounded-inline bg-muted px-1.5 py-0.5 font-mono text-code text-foreground select-text"
              >
                {example}
              </code>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * What Enter will install, read back from the line. Always there, one height
 * for every state, so typing never resizes the dialog.
 */
function SourcePreview({
  text,
  source,
  busy,
}: {
  text: string;
  source: string | null;
  busy: boolean;
}): React.JSX.Element {
  const type = source ? piSourceType(source) : null;
  const kind = type ? SOURCE_TYPE_LABELS[type] : null;
  const empty = text.trim() === '';
  const PreviewIcon = type ? SOURCE_ICONS[type] : empty ? IconPackage : IconAlertCircle;
  return (
    <div
      className={cn(
        'flex h-14 items-center gap-3 rounded-control border px-3',
        source ? 'border-border bg-card' : 'border-dashed border-border',
      )}
      data-testid="install-source-preview"
    >
      <PreviewIcon
        size={18}
        className={cn(
          'shrink-0',
          !source && !empty ? 'text-danger-fg' : 'text-muted-foreground',
          empty && 'opacity-60',
        )}
      />
      <div className="flex min-w-0 flex-col">
        {source && kind ? (
          <>
            <span className="truncate font-mono text-code text-foreground" title={source}>
              {packageTitle({ source })}
            </span>
            <span className="text-ui text-muted-foreground">
              {busy ? `${kind} · another change is running` : kind}
            </span>
          </>
        ) : empty ? (
          <span className="text-ui text-muted-foreground">
            Type or paste a source, or open a folder
          </span>
        ) : (
          <span className="text-ui text-danger-fg">Not an npm name, git URL or path</span>
        )}
      </div>
    </div>
  );
}

export function InstallSourceDialog({
  disabled,
  onInstall,
  onClose,
}: {
  disabled: boolean;
  onInstall: (source: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [text, setText] = useState('');
  const fieldRef = useRef<HTMLInputElement>(null);
  const source = parseInstallSource(text);

  const chooseFolder = async (): Promise<void> => {
    const folder = await window.piApi.pickPackageFolder();
    if (folder) setText(folder);
    fieldRef.current?.focus();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[520px]"
        aria-describedby={undefined}
        data-testid="install-source-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-body">Install a package</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <div className="flex h-9 items-center gap-1 rounded-control border border-input pr-1 pl-2.5 transition-colors has-[input[aria-invalid=true]]:border-destructive">
            <input
              ref={fieldRef}
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.key === 'Process') return;
                if (event.key === 'Enter' && source && !disabled) onInstall(source);
              }}
              placeholder="npm:package-name, a git URL or a folder path"
              spellCheck={false}
              autoComplete="off"
              aria-label="Package source"
              aria-invalid={text.trim() !== '' && !source}
              className="h-full min-w-0 flex-1 bg-transparent font-mono text-code text-foreground outline-none placeholder:text-muted-foreground"
              data-testid="install-source-field"
            />
            <Button
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => void chooseFolder()}
            >
              <IconFolderOpen data-icon="inline-start" />
              Open
            </Button>
          </div>
          <SourcePreview text={text} source={source} busy={disabled} />
        </div>
        <Examples />
      </DialogContent>
    </Dialog>
  );
}
