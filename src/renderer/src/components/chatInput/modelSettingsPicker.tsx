import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCheck, IconChevronRight } from '@tabler/icons-react';
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
const THINKING_MENU_LABEL = 'Thinking';

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
  // Selecting a new model keeps the popover open and forces the thinking
  // flyout open so the user confirms a thinking level for that model; the
  // popover closes once a level is picked (or the user dismisses it).
  const [pendingThinkingConfirm, setPendingThinkingConfirm] = useState(false);
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
        setPendingThinkingConfirm(false);
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
      <PopoverContent align="end" className="w-64 gap-0 overflow-visible p-0">
        <Command className="rounded-b-none">
          <CommandInput
            autoFocus
            value={modelSearch}
            onValueChange={setModelSearch}
            placeholder={MODEL_SEARCH_PLACEHOLDER}
          />
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
                    className="rounded-lg"
                    onSelect={() => {
                      onSelectModel(model);
                      // Same model or a model without thinking levels:
                      // nothing to confirm, close immediately.
                      if (key === selectedKey || model.thinkingLevels.length === 0) {
                        setOpen(false);
                        return;
                      }
                      // New model: keep the popover open, normalize the list
                      // view, and ask for a thinking-level confirmation.
                      setModelSearch('');
                      setPendingThinkingConfirm(true);
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{model.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {formatModelDetails(model)}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="px-2">
          <Separator className="bg-foreground/25 !h-[0.5px]" />
        </div>
        <ThinkingLevelFlyout
          forceOpen={pendingThinkingConfirm}
          value={thinkingValue}
          label={thinkingLabel}
          options={thinkingOptions}
          onSelect={(level) => {
            onSelectThinkingLevel(level);
            setPendingThinkingConfirm(false);
            setOpen(false);
          }}
        />
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
        'h-7 max-w-60 min-w-0 gap-1.5 rounded-md px-1.5 text-sm font-normal hover:bg-muted/70',
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate text-foreground">{modelLabel}</span>
      <span className="shrink-0 text-muted-foreground">{thinkingLabel}</span>
    </Button>
  );
}

function ThinkingLevelFlyout({
  forceOpen = false,
  label,
  value,
  options,
  onSelect,
}: {
  /** Kept open regardless of hover: the model picker forces a thinking confirmation. */
  forceOpen?: boolean;
  label: string;
  value: ThinkingLevel | null;
  options: ThinkingLevel[];
  onSelect: (thinkingLevel: ThinkingLevel) => void;
}): React.JSX.Element {
  const [hoverOpen, setHoverOpen] = useState(false);
  const open = (forceOpen || hoverOpen) && options.length > 0;
  const checkedItemRef = useRef<HTMLButtonElement | null>(null);

  // When forced open (a new model was just selected), focus the current
  // level so a single Enter (or click) confirms it and closes the picker.
  const wasForceOpenRef = useRef(false);
  useEffect(() => {
    if (forceOpen && !wasForceOpenRef.current) {
      checkedItemRef.current?.focus();
    }
    wasForceOpenRef.current = forceOpen;
  }, [forceOpen]);

  return (
    <div
      className="relative px-2 py-1.5"
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
      onFocus={() => setHoverOpen(true)}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={options.length === 0}
        className={cn(
          'h-8 w-full justify-start gap-2 rounded-lg px-1.5 text-sm font-normal hover:bg-muted/60 border-0',
          forceOpen && 'bg-muted/70',
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 truncate text-left text-foreground">
          {THINKING_MENU_LABEL}
        </span>
        <span className="sr-only">{label}</span>
        <IconChevronRight data-icon="inline-end" className="ml-auto text-muted-foreground" />
      </Button>

      {open && (
        <div className="absolute bottom-1 left-full pl-1">
          <div
            role="menu"
            className="min-w-28 rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
          >
            {options.map((level) => (
              <Button
                key={level}
                ref={(element) => {
                  if (level === value) checkedItemRef.current = element;
                }}
                type="button"
                variant="ghost"
                size="sm"
                role="menuitemradio"
                aria-checked={level === value}
                className={cn(
                  'h-7 w-full justify-start gap-2 rounded-md px-2 text-sm font-normal',
                  level === value && 'bg-muted text-foreground',
                )}
                onClick={() => {
                  onSelect(level);
                }}
              >
                <span>{level}</span>
                {level === value && <IconCheck data-icon="inline-end" className="ml-auto" />}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
