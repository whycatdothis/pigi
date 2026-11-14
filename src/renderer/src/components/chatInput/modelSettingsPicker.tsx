import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelInfo, ThinkingLevel } from '../../../../shared/ipcContract';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { cn } from '../../lib/utils';
import { modelOptionKey, modelSearchValue, formatModelDetails } from './formatters';

const MODEL_SEARCH_PLACEHOLDER = 'Search models';
const MODEL_EMPTY_TEXT = 'No models found';
// Fixed, not a maximum: the box stays the same height while a query narrows the
// results, so only the rows move under the search box.
const MODEL_LIST_HEIGHT_CLASS = 'h-56';
const THINKING_LABEL = 'Thinking';

export function ModelSettingsPicker({
  modelLabel,
  modelValue,
  modelOptions,
  onSelectModel,
  onRequestModelRefresh,
  thinkingLabel,
  thinkingValue,
  thinkingOptions,
  onSelectThinkingLevel,
}: {
  modelLabel: string;
  modelValue: ModelInfo | null;
  modelOptions: ModelInfo[];
  onSelectModel: (model: ModelInfo) => void;
  onRequestModelRefresh: () => void;
  thinkingLabel: string;
  thinkingValue: ThinkingLevel | null;
  thinkingOptions: ThinkingLevel[];
  onSelectThinkingLevel: (thinkingLevel: ThinkingLevel) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const modelListRef = useRef<HTMLDivElement>(null);
  const selectedKey = modelValue ? modelOptionKey(modelValue) : '';
  const canOpen = modelOptions.length > 0 || thinkingOptions.length > 0;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        // Refresh on every open attempt: corrects a stale/partial model list
        // right when the user needs it. Fire-and-forget even if the picker
        // cannot open yet (empty list) — the refreshed list arrives via push
        // and the button becomes usable then.
        onRequestModelRefresh();
        if (!canOpen) return;
      }
      setOpen(nextOpen);
      if (!nextOpen) setModelSearch('');
    },
    [canOpen, onRequestModelRefresh],
  );

  useEffect(() => {
    if (!open || !modelValue) {
      if (!open) return;
      const frame = window.requestAnimationFrame(() => {
        modelListRef.current?.scrollTo({ top: 0 });
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const frame = window.requestAnimationFrame(() => {
      const selectedEl = modelListRef.current?.querySelector<HTMLElement>('[data-checked="true"]');
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'center' });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, modelValue]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      modelListRef.current?.scrollTo({ top: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [modelSearch]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <ModelSettingsButton modelLabel={modelLabel} thinkingLabel={thinkingLabel} />
      </PopoverTrigger>
      {/* Pinned upward: the composer sits at the window's bottom edge, and a side
          Radix picked per open would move the box on the new-chat screen. */}
      <PopoverContent side="top" align="end" className="w-80 gap-0 p-0">
        <Command>
          <CommandInput
            autoFocus
            value={modelSearch}
            onValueChange={setModelSearch}
            placeholder={MODEL_SEARCH_PLACEHOLDER}
          />
          <CommandList ref={modelListRef} className={MODEL_LIST_HEIGHT_CLASS}>
            <CommandEmpty>{MODEL_EMPTY_TEXT}</CommandEmpty>
            <CommandGroup>
              {modelOptions.map((model) => {
                const key = modelOptionKey(model);
                return (
                  <CommandItem
                    key={key}
                    value={modelSearchValue(model)}
                    data-checked={key === selectedKey ? true : undefined}
                    className="rounded-control"
                    onSelect={() => {
                      onSelectModel(model);
                      if (key === selectedKey || model.thinkingLevels.length === 0) {
                        setOpen(false);
                        return;
                      }
                      // A new model keeps the popover open, so its thinking
                      // level can be set without opening the picker again.
                      setModelSearch('');
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{model.name}</span>
                      <span className="truncate text-caption text-muted-foreground">
                        {formatModelDetails(model)}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {thinkingOptions.length > 0 && (
            <>
              <div className="px-1">
                <Separator className="bg-foreground/25 !h-[0.5px]" />
              </div>
              <ThinkingLevelSlider
                value={thinkingValue}
                options={thinkingOptions}
                onSelect={onSelectThinkingLevel}
              />
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ModelSettingsButton({
  modelLabel,
  thinkingLabel,
  className,
  ...props
}: React.ComponentProps<typeof Button> & {
  modelLabel: string;
  thinkingLabel: string;
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'h-7 max-w-60 min-w-0 gap-1.5 rounded-control px-1.5 text-body font-normal hover:bg-muted/70',
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate text-foreground">{modelLabel}</span>
      <span className="shrink-0 text-muted-foreground">{thinkingLabel}</span>
    </Button>
  );
}

/**
 * The model's thinking levels as a rail of the same cells the picker had, now
 * draggable: the white pill follows the pointer across the cells and a press
 * anywhere picks the cell under it. The cells keep still, so a drag does not
 * reflow the labels under the pointer.
 */
function ThinkingLevelSlider({
  value,
  options,
  onSelect,
}: {
  value: ThinkingLevel | null;
  options: ThinkingLevel[];
  onSelect: (thinkingLevel: ThinkingLevel) => void | Promise<void>;
}): React.JSX.Element {
  const cellsRef = useRef<HTMLDivElement>(null);
  // The pill follows the pointer at once; the level is written once, on release.
  // Committing every cell a drag crosses costs a write and two reads each, and
  // the pill would trail the pointer by that round trip.
  const [preview, setPreview] = useState<ThinkingLevel | null>(null);
  const shown = preview && options.includes(preview) ? preview : value;
  const index = Math.max(0, shown ? options.indexOf(shown) : 0);
  const share = 100 / options.length;

  const pickAt = (clientX: number): void => {
    const cells = cellsRef.current;
    if (!cells) return;
    const bounds = cells.getBoundingClientRect();
    if (bounds.width === 0) return;
    const ratio = (clientX - bounds.left) / bounds.width;
    const next =
      options[Math.min(options.length - 1, Math.max(0, Math.floor(ratio * options.length)))];
    if (next !== shown) setPreview(next);
  };

  return (
    <div className="px-1 pt-2 pb-1.5">
      <div
        role="slider"
        aria-label={THINKING_LABEL}
        aria-valuemin={0}
        aria-valuemax={options.length - 1}
        aria-valuenow={index}
        aria-valuetext={shown ?? undefined}
        tabIndex={0}
        className="relative h-8 cursor-pointer rounded-control bg-muted p-0.5 outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pickAt(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) pickAt(event.clientX);
        }}
        // The preview is held until the level is applied, so the pill does not
        // snap back to the old cell for the length of the write.
        onPointerUp={async (event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (preview && preview !== value) await onSelect(preview);
          setPreview(null);
        }}
        onPointerCancel={() => {
          setPreview(null);
        }}
        // cmdk takes the arrows for its list while this has the focus.
        onKeyDown={(event) => {
          const step =
            event.key === 'ArrowRight' || event.key === 'ArrowUp'
              ? 1
              : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                ? -1
                : 0;
          if (step === 0 && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          event.stopPropagation();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? options.length - 1
                : Math.min(options.length - 1, Math.max(0, index + step));
          if (next !== index) onSelect(options[next]);
        }}
      >
        <div ref={cellsRef} className="relative flex h-full rounded-control-sm">
          <span
            aria-hidden
            className="absolute inset-y-0 rounded-control-sm bg-background shadow-xs"
            style={{ left: `${index * share}%`, width: `${share}%` }}
          />
          {options.map((level) => (
            <span
              key={level}
              className={cn(
                'relative flex min-w-0 flex-1 basis-0 items-center justify-center truncate px-0.5 text-caption leading-none',
                level === shown ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {level}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
