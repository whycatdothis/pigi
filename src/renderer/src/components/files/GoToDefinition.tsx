import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import type { CodeDefinition } from '../../../../shared/ipcContract';
import type { LineRange } from '../../lib/filePathCandidates';
import { sourcePositionFromPoint, sourceWordRangeFromPoint } from '../../lib/sourceLineSelection';
import { useAppStore } from '../../state/appStore';
import { Command, CommandGroup, CommandItem, CommandList } from '../ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover';

/**
 * Set on the viewer while the modifier is held over a word and while a lookup
 * runs; FileViewer's classes style them.
 */
const DEFINITION_ARMED_ATTRIBUTE = 'data-definition-armed';
/** The word a click would look up, styled as a link in assets/searchHighlights.css. */
const DEFINITION_LINK_HIGHLIGHT = 'pi-definition-link';
const DEFINITION_PENDING_ATTRIBUTE = 'data-definition-pending';

function definitionLines(definition: CodeDefinition): LineRange {
  return { start: definition.line, end: definition.line };
}

interface Candidates {
  symbol: string;
  definitions: CodeDefinition[];
  /** The clicked line, which Back returns to. */
  line: number;
  x: number;
  y: number;
}

/**
 * Cmd+click (Ctrl+click off macOS) in the source view jumps to the
 * definition of the identifier under the pointer; several definitions open a
 * list at the click. See docs/goToDefinition.md.
 */
export default function GoToDefinition({
  containerRef,
  projectPath,
  filePath,
  enabled,
  onOpenFile,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  projectPath: string;
  filePath: string;
  enabled: boolean;
  onOpenFile: (path: string, lines?: LineRange | null) => void;
}): React.JSX.Element | null {
  const isMac = useAppStore((state) => state.platform === 'mac');
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const latestRequest = useRef(0);
  const commandRef = useRef<HTMLDivElement>(null);
  const jumpTo = useCallback(
    (definition: CodeDefinition, fromLine: number) => {
      useAppStore.getState().recordFileVisit(projectPath, {
        filePath,
        lines: { start: fromLine, end: fromLine },
      });
      onOpenFile(definition.filePath, definitionLines(definition));
    },
    [filePath, onOpenFile, projectPath],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    const modifierHeld = (event: KeyboardEvent | MouseEvent): boolean =>
      isMac ? event.metaKey : event.ctrlKey;
    let pointer: { x: number; y: number } | null = null;
    let held = false;
    let linkShown = false;
    const showLink = (): void => {
      if (!held && !linkShown) return;
      const word = held && pointer ? sourceWordRangeFromPoint(pointer.x, pointer.y) : null;
      container.toggleAttribute(DEFINITION_ARMED_ATTRIBUTE, word !== null);
      if (word) CSS.highlights.set(DEFINITION_LINK_HIGHLIGHT, new Highlight(word));
      else CSS.highlights.delete(DEFINITION_LINK_HIGHLIGHT);
      linkShown = word !== null;
    };
    const arm = (event: KeyboardEvent): void => {
      held = modifierHeld(event);
      showLink();
    };
    const track = (event: MouseEvent): void => {
      pointer = { x: event.clientX, y: event.clientY };
      held = modifierHeld(event);
      showLink();
    };
    const leave = (): void => {
      pointer = null;
      showLink();
    };
    const disarm = (): void => {
      held = false;
      showLink();
    };
    const lookUp = (event: MouseEvent): void => {
      if (event.button !== 0 || !modifierHeld(event)) return;
      // A drag that ends with the modifier down is a selection, not a click.
      if (window.getSelection()?.isCollapsed === false) return;
      const position = sourcePositionFromPoint(event.clientX, event.clientY);
      if (!position) return;
      event.preventDefault();
      const request = ++latestRequest.current;
      const { clientX: x, clientY: y } = event;
      container.setAttribute(DEFINITION_PENDING_ATTRIBUTE, '');
      window.piApi
        .findDefinition(projectPath, filePath, position.line, position.column)
        .then((result) => {
          if (request !== latestRequest.current) return;
          if (!result.success) {
            toast.error(result.error);
          } else if (result.symbol === null) {
            // Not on an identifier: nothing to say.
          } else if (result.definitions.length === 0) {
            toast(`No definition found for ${result.symbol}`);
          } else if (result.definitions.length === 1 && result.definitions[0]) {
            jumpTo(result.definitions[0], position.line);
          } else {
            setCandidates({
              symbol: result.symbol,
              definitions: result.definitions,
              line: position.line,
              x,
              y,
            });
          }
        })
        .catch(() => {
          if (request === latestRequest.current) toast.error('Unable to find the definition');
        })
        .finally(() => {
          if (request === latestRequest.current) {
            container.removeAttribute(DEFINITION_PENDING_ATTRIBUTE);
          }
        });
    };

    window.addEventListener('keydown', arm);
    window.addEventListener('keyup', arm);
    window.addEventListener('blur', disarm);
    container.addEventListener('click', lookUp);
    container.addEventListener('mousemove', track);
    container.addEventListener('mouseleave', leave);
    container.addEventListener('scroll', showLink);
    return () => {
      window.removeEventListener('keydown', arm);
      window.removeEventListener('keyup', arm);
      window.removeEventListener('blur', disarm);
      container.removeEventListener('click', lookUp);
      container.removeEventListener('mousemove', track);
      container.removeEventListener('mouseleave', leave);
      container.removeEventListener('scroll', showLink);
      disarm();
      container.removeAttribute(DEFINITION_PENDING_ATTRIBUTE);
      // A reply for the file this effect was set up for is no longer wanted.
      latestRequest.current += 1;
      setCandidates(null);
    };
  }, [containerRef, enabled, filePath, isMac, jumpTo, projectPath]);

  const anchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          DOMRect.fromRect({ x: candidates?.x ?? 0, y: candidates?.y ?? 0, width: 0, height: 0 }),
      },
    }),
    [candidates],
  );

  if (!candidates) return null;
  return (
    <Popover open onOpenChange={(open) => !open && setCandidates(null)}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        align="start"
        className="w-96 p-0"
        // cmdk's arrow keys listen on its root, so focus goes there, not to the content.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          commandRef.current?.focus();
        }}
      >
        <Command ref={commandRef} tabIndex={-1} className="outline-none">
          <CommandList>
            <CommandGroup
              heading={`${candidates.definitions.length} definitions of ${candidates.symbol}`}
            >
              {candidates.definitions.map((definition) => (
                <CommandItem
                  key={`${definition.filePath}:${definition.line}`}
                  value={`${definition.filePath}:${definition.line}`}
                  onSelect={() => {
                    setCandidates(null);
                    jumpTo(definition, candidates.line);
                  }}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-mono text-caption">
                      {definition.lineContent}
                    </span>
                    <span className="truncate text-2xs text-muted-foreground">
                      {definition.filePath}:{definition.line}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
