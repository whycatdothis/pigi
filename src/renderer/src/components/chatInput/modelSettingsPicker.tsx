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
const MODEL_LIST_MAX_HEIGHT_CLASS = 'max-h-56';
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
  // Selecting a new model keeps the popover open and puts the focus on its
  // current thinking level, so one Enter confirms it; the popover closes once a
  // level is picked (or the user dismisses it). Counted, not a flag: a second
  // model picked in the same visit asks for the focus again.
  const [thinkingFocusRequests, setThinkingFocusRequests] = useState(0);
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
      if (!nextOpen) {
        setModelSearch('');
        setThinkingFocusRequests(0);
      }
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
      {/* The search sits at the bottom edge, so the popover is pinned to open
          upward: a side Radix picked per open would move the box. */}
      <PopoverContent side="top" align="end" className="w-80 gap-0 p-0">
        <Command>
          <CommandList ref={modelListRef} className={MODEL_LIST_MAX_HEIGHT_CLASS}>
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
                      // A new model keeps the popover open to confirm a thinking level.
                      setModelSearch('');
                      setThinkingFocusRequests((count) => count + 1);
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
              <ThinkingLevelRail
                focusRequest={thinkingFocusRequests}
                value={thinkingValue}
                label={thinkingLabel}
                options={thinkingOptions}
                onSelect={(level) => {
                  onSelectThinkingLevel(level);
                  setThinkingFocusRequests(0);
                  setOpen(false);
                }}
              />
            </>
          )}
          <CommandInput
            autoFocus
            value={modelSearch}
            onValueChange={setModelSearch}
            placeholder={MODEL_SEARCH_PLACEHOLDER}
          />
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

/** Keys cmdk would otherwise take for its list while a stop here has the focus. */
const RAIL_KEYS = new Set([
  'Enter',
  ' ',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

/**
 * The model's thinking levels as a rail: every level it has, one click each.
 * They used to hang off a hover flyout, which hid three to seven short choices
 * behind a second hover for the sake of one line.
 */
function ThinkingLevelRail({
  focusRequest = 0,
  label,
  value,
  options,
  onSelect,
}: {
  /** Bumped when a model is picked: the focus goes to the level it starts on. */
  focusRequest?: number;
  /** Only for the rail's accessible name; the trigger already shows the value. */
  label: string;
  value: ThinkingLevel | null;
  options: ThinkingLevel[];
  onSelect: (thinkingLevel: ThinkingLevel) => void;
}): React.JSX.Element {
  const checkedRef = useRef<HTMLButtonElement | null>(null);

  // Follows `value` too: the request arrives with the model, one render before
  // the new model's level does, and the checked stop moves with it.
  useEffect(() => {
    if (focusRequest > 0) checkedRef.current?.focus();
  }, [focusRequest, value]);

  return (
    <div
      className="px-1 py-1.5"
      // The rail lives inside the Command, whose root turns Enter into "select
      // the highlighted model" and gives the arrows to the list; without this
      // the focused stop could not be activated at all.
      onKeyDown={(event) => {
        if (RAIL_KEYS.has(event.key)) event.stopPropagation();
      }}
    >
      <div className="px-1 pb-1 text-caption text-muted-foreground">{THINKING_LABEL}</div>
      <div
        role="group"
        aria-label={`${THINKING_LABEL} (${label})`}
        className="flex items-center gap-0.5 rounded-control bg-muted p-0.5"
      >
        {options.map((level) => (
          <button
            key={level}
            ref={level === value ? checkedRef : undefined}
            type="button"
            aria-pressed={level === value}
            className={cn(
              'h-6 flex-1 rounded-control-sm px-0.5 text-caption leading-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden',
              level === value
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => {
              onSelect(level);
            }}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
}
