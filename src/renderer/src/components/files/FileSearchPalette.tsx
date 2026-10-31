import { memo, startTransition, useCallback, useEffect, useRef, useState } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { FileIcon } from '../fileIcon';

/** More than the chat composer's @ list: this is the only way to reach a file by name. */
const SEARCH_LIMIT = 30;
const QUERY_DEBOUNCE_MS = 70;

/** Split a project-relative path into the result row's name and directory. */
function splitFilePath(path: string): { name: string; directory: string } {
  const slash = path.lastIndexOf('/');
  return slash === -1
    ? { name: path, directory: '' }
    : { name: path.slice(slash + 1), directory: path.slice(0, slash) };
}

/**
 * Cmd+P over the active project. Selecting a result opens it in the Files tab;
 * main owns the fuzzy index, so this only debounces and renders.
 */
const FileSearchPalette = memo(function FileSearchPalette({
  open,
  onOpenChange,
  projectPath,
  container,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string | null;
  container: HTMLElement | null;
  onSelect: (path: string) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [selectedValue, setSelectedValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open || !projectPath) return;

    let cancelled = false;
    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        window.piApi
          .searchProjectFiles(projectPath, query, SEARCH_LIMIT)
          .then((result) => {
            if (cancelled || requestIdRef.current !== requestId) return;
            if (result.success) {
              startTransition(() => {
                setResults(result.files);
                // Select in the same commit that adds the items: a later frame
                // can lose an Enter pressed as soon as the rows appear.
                setSelectedValue(result.files[0] ?? '');
                setError(null);
                setLoading(false);
              });
            } else {
              setResults([]);
              setSelectedValue('');
              setError(result.error);
              setLoading(false);
            }
          })
          .catch(() => {
            if (cancelled || requestIdRef.current !== requestId) return;
            setResults([]);
            setSelectedValue('');
            setError('Unable to search project files');
            setLoading(false);
          });
      },
      query.trim() ? QUERY_DEBOUNCE_MS : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, projectPath, query]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      // Invalidate an in-flight search in either direction; a reopened palette
      // starts from its empty state instead of showing the last query's hits.
      requestIdRef.current += 1;
      setQuery('');
      setResults([]);
      setSelectedValue('');
      setError(null);
      setLoading(nextOpen);
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const handleSelect = useCallback(
    (path: string) => {
      onSelect(path);
      handleOpenChange(false);
    },
    [handleOpenChange, onSelect],
  );

  const emptyMessage = !projectPath
    ? 'Open a project to search its files.'
    : loading
      ? 'Searching…'
      : (error ?? 'No files found');

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      modal={false}
      title="Find file"
      description="Search the active project's files"
      container={container}
      overlayClassName="absolute inset-0"
      className="absolute top-[54px] left-1/2 w-[calc(100%-2rem)] max-w-[550px] -translate-x-1/2 translate-y-0"
    >
      <Command value={selectedValue} onValueChange={setSelectedValue} shouldFilter={false}>
        <CommandInput
          placeholder="Search files by name"
          value={query}
          onValueChange={setQuery}
          autoFocus
          inputGroupClassName="h-9"
        />
        <CommandList className="max-h-[min(24rem,60vh)] pt-1">
          {results.length === 0 ? (
            <CommandEmpty>{emptyMessage}</CommandEmpty>
          ) : (
            <CommandGroup>
              {results.map((file) => {
                const { name, directory } = splitFilePath(file);
                return (
                  <CommandItem
                    key={file}
                    value={file}
                    onSelect={() => handleSelect(file)}
                    showCheckIcon={false}
                    className="px-2 py-1"
                  >
                    <FileIcon path={file} />
                    <span className="min-w-0 flex-1 truncate text-body">{name}</span>
                    {directory && (
                      <span className="max-w-[45%] shrink-0 truncate text-caption text-muted-foreground">
                        {directory}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
});

export default FileSearchPalette;
