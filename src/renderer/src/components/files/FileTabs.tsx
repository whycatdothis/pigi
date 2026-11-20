import { useEffect, useRef } from 'react';
import { IconX } from '@tabler/icons-react';
import { FileIcon } from '../fileIcon';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

const MIDDLE_BUTTON = 1;

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function parentName(path: string): string {
  const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
  return fileName(parent);
}

/** The Files tab's open files; the active one's full path is in the viewer's header below. */
export default function FileTabs({
  paths,
  activePath,
  onSelect,
  onClose,
}: {
  paths: readonly string[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const names = paths.map(fileName);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-state=active]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activePath, paths]);

  return (
    <div className="flex h-10 shrink-0 items-center overflow-x-auto px-2">
      <Tabs value={activePath ?? ''} onValueChange={onSelect} className="flex-none gap-0">
        <TabsList ref={listRef} variant="chip">
          {paths.map((path, index) => {
            const name = names[index] ?? path;
            // Two open files with one name tell themselves apart by their folder.
            const duplicate = names.indexOf(name) !== names.lastIndexOf(name);
            return (
              <TabsTrigger
                key={path}
                value={path}
                title={path}
                onAuxClick={(event) => {
                  if (event.button === MIDDLE_BUTTON) onClose(path);
                }}
                className="group/tab h-8 max-w-56 flex-none px-2.5 text-caption font-normal text-muted-foreground"
              >
                <FileIcon path={path} className="size-3.5" />
                <span className="truncate">{name}</span>
                {duplicate && (
                  <span className="truncate text-2xs text-muted-foreground">
                    {parentName(path)}
                  </span>
                )}
                <span
                  role="button"
                  aria-label={`Close ${name}`}
                  tabIndex={-1}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(path);
                  }}
                  className="-mr-1 ml-0.5 flex size-3.5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover/tab:opacity-100 group-data-[state=active]/tab:opacity-100 hover:bg-foreground/10"
                >
                  <IconX size={7} />
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
}
