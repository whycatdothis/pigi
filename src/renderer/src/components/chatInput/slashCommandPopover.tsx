import { useEffect, useRef } from 'react';
import type { SlashCommand, SlashCommandMatches } from '../../lib/slashCommands';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Separator } from '../ui/separator';
import { cn } from '../../lib/utils';
import { CHAT_INPUT_MAX_WIDTH } from '../../lib/layoutConstants';

export function SlashCommandPopover({
  matches,
  selectedIndex,
  onSelect,
  onHover,
  onDismiss,
  children,
}: {
  matches: SlashCommandMatches;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (flatIndex: number) => void;
  onDismiss: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const slashListRef = useRef<HTMLDivElement>(null);
  const hasMatches = matches.builtin.length > 0 || matches.skill.length > 0;

  // Scroll selected slash item into view
  useEffect(() => {
    if (!hasMatches) return;
    const container = slashListRef.current;
    if (!container) return;
    const scrollParent = container.parentElement;
    if (!scrollParent) return;
    if (selectedIndex === 0) {
      scrollParent.scrollTop = 0;
      return;
    }
    const buttons = container.querySelectorAll('button');
    const selected = buttons[selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, hasMatches]);

  return (
    <Popover
      open={hasMatches}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDismiss();
      }}
    >
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="max-h-[40vh] overflow-y-auto p-1 bg-popover/50"
        style={{ width: `${CHAT_INPUT_MAX_WIDTH}px` }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div ref={slashListRef}>
          {matches.builtin.map((slashCommand, i) => (
            <SlashCommandItem
              key={slashCommand.name}
              slashCommand={slashCommand}
              isSelected={i === selectedIndex}
              onSelect={() => onSelect(slashCommand)}
              onHover={() => onHover(i)}
            />
          ))}
          {matches.builtin.length > 0 && matches.skill.length > 0 && (
            <Separator className="my-0.5 mx-auto h-px !w-[98%] opacity-90" />
          )}
          {matches.skill.map((slashCommand, i) => {
            const flatIndex = matches.builtin.length + i;
            return (
              <SlashCommandItem
                key={slashCommand.name}
                slashCommand={slashCommand}
                isSelected={flatIndex === selectedIndex}
                onSelect={() => onSelect(slashCommand)}
                onHover={() => onHover(flatIndex)}
              />
            );
          })}
        </div>
      </PopoverContent>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
    </Popover>
  );
}

function SlashCommandItem({
  slashCommand,
  isSelected,
  onSelect,
  onHover,
}: {
  slashCommand: SlashCommand;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm',
        isSelected && 'bg-foreground/7',
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={onHover}
    >
      <span className="shrink-0 font-mono text-foreground">/{slashCommand.name}</span>
      {slashCommand.source !== 'skill' && (
        <span
          className={cn(
            'min-w-0 truncate',
            isSelected ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {slashCommand.description}
        </span>
      )}
    </button>
  );
}
