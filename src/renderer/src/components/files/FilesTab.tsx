import { IconFileSearch, IconFolderOpen, IconSearch } from '@tabler/icons-react';
import type { ShortcutBinding } from '../../../../shared/ipcContract';
import { formatShortcutLabel } from '../../shortcuts/formatShortcutLabel';
import { Button } from '../ui/button';
import { Kbd } from '../ui/kbd';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../ui/empty';
import FileViewer from './FileViewer';

/**
 * The Files tab: the reader when a file is open, and the two ways to get one
 * otherwise (open a project, or pick a file).
 */
export default function FilesTab({
  projectPath,
  filePath,
  sessionPath,
  findFileShortcut,
  onFindFile,
  onOpenProject,
}: {
  projectPath: string | null;
  filePath: string | null;
  sessionPath: string | null;
  findFileShortcut: ShortcutBinding | undefined;
  onFindFile: () => void;
  onOpenProject: () => void;
}): React.JSX.Element {
  if (!projectPath) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconFolderOpen />
          </EmptyMedia>
          <EmptyTitle>No project open</EmptyTitle>
          <EmptyDescription>Open a project to browse and read its files.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onOpenProject}>
            <IconFolderOpen data-icon="inline-start" />
            Open project
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (!filePath) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconFileSearch />
          </EmptyMedia>
          <EmptyTitle>Select a file</EmptyTitle>
          <EmptyDescription>
            Pick a file in the sidebar, or search the project by name.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onFindFile}>
            <IconSearch data-icon="inline-start" />
            Find file
            {findFileShortcut && (
              <Kbd className="ml-1.5 h-4 min-w-4 px-1 text-3xs">
                {formatShortcutLabel(findFileShortcut)}
              </Kbd>
            )}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <FileViewer
      key={`${projectPath}:${filePath}`}
      projectPath={projectPath}
      filePath={filePath}
      sessionPath={sessionPath}
    />
  );
}
