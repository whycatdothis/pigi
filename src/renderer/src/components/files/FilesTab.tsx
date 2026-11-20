import { useCallback, useEffect, useState } from 'react';
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
import FileViewer, { type FileLineTarget } from './FileViewer';
import FileTabs from './FileTabs';
import { useAppStore } from '../../state/appStore';
import type { LineRange } from '../../lib/filePathCandidates';

/** A file once it was drawn, with what its viewer was given then. */
interface ShownFile {
  key: string;
  projectPath: string;
  filePath: string;
  lineTarget: FileLineTarget | null;
}

/** A file still loading past this shows its spinner instead of the previous file. */
const KEEP_PREVIOUS_FILE_MS = 400;

const VIEWER_CLASS_NAME = 'flex min-h-0 flex-1 flex-col';

/**
 * The Files tab: the reader when a file is open, and the two ways to get one
 * otherwise (open a project, or pick a file).
 */
export default function FilesTab({
  projectPath,
  sessionProjectPath,
  filePath,
  fileRevision,
  lineTarget,
  sessionPath,
  findFileShortcut,
  onFindFile,
  onOpenFile,
  onStepFileHistory,
  onOpenProject,
}: {
  projectPath: string | null;
  /** The session's own project; another project's quotes need absolute references. */
  sessionProjectPath: string | null;
  filePath: string | null;
  fileRevision: number;
  lineTarget: FileLineTarget | null;
  sessionPath: string | null;
  findFileShortcut: ShortcutBinding | undefined;
  onFindFile: () => void;
  onOpenFile: (path: string, lines?: LineRange | null) => void;
  onStepFileHistory: (step: -1 | 1) => void;
  onOpenProject: () => void;
}): React.JSX.Element {
  const openFiles = useAppStore((state) =>
    projectPath ? state.openFilesByProject.get(projectPath) : undefined,
  );
  const closeFile = useAppStore((state) => state.closeFile);

  // A newly opened file loads and highlights out of sight while the previous
  // one stays on screen, instead of the pane flashing through a spinner and
  // plain text.
  const key = projectPath && filePath ? `${projectPath}:${filePath}` : null;
  const [shown, setShown] = useState<ShownFile | null>(null);
  if (shown && !key) setShown(null);
  if (shown && shown.key === key && shown.lineTarget !== lineTarget) {
    setShown({ ...shown, lineTarget });
  }
  const previous = shown && shown.key !== key ? shown : null;
  const showFile = useCallback(() => {
    if (key && projectPath && filePath) setShown({ key, projectPath, filePath, lineTarget });
  }, [key, projectPath, filePath, lineTarget]);
  const waiting = previous !== null;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(showFile, KEEP_PREVIOUS_FILE_MS);
    return () => clearTimeout(timer);
  }, [waiting, showFile]);

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

  const tabs = openFiles?.length ? (
    <FileTabs
      paths={openFiles}
      activePath={filePath}
      onSelect={(path) => onOpenFile(path)}
      onClose={(path) => closeFile(projectPath, path)}
    />
  ) : null;

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
    <div className="flex min-h-0 flex-1 flex-col">
      {tabs}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {previous && (
          <div key={previous.key} className={VIEWER_CLASS_NAME}>
            <FileViewer
              projectPath={previous.projectPath}
              sessionProjectPath={sessionProjectPath}
              filePath={previous.filePath}
              fileRevision={fileRevision}
              lineTarget={previous.lineTarget}
              sessionPath={sessionPath}
              onOpenFile={onOpenFile}
              onStepFileHistory={onStepFileHistory}
            />
          </div>
        )}
        <div
          key={key}
          aria-hidden={previous ? true : undefined}
          className={
            previous
              ? 'pointer-events-none invisible absolute inset-0 flex flex-col'
              : VIEWER_CLASS_NAME
          }
        >
          <FileViewer
            projectPath={projectPath}
            sessionProjectPath={sessionProjectPath}
            filePath={filePath}
            fileRevision={fileRevision}
            lineTarget={lineTarget}
            sessionPath={sessionPath}
            onOpenFile={onOpenFile}
            onStepFileHistory={onStepFileHistory}
            onReady={showFile}
          />
        </div>
      </div>
    </div>
  );
}
