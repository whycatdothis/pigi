/**
 * Presentational building blocks for the settings page. Controls are
 * uncontrolled-in-progress: text and number fields keep a local draft and
 * commit on blur/Enter, so a write never fires per keystroke.
 */
import { useState, type ReactNode } from 'react';
import { IconPlus, IconX } from '@tabler/icons-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { SETTINGS_CONTENT_MAX_WIDTH } from '../../lib/layoutConstants';
import { cn } from '@/lib/utils';

/** Page-level content column shared by every section. */
export function SettingsContent({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div
      className="mx-auto flex w-full flex-col gap-9 px-5 pt-[72px] pb-7"
      style={{ maxWidth: `${SETTINGS_CONTENT_MAX_WIDTH}px` }}
    >
      {children}
    </div>
  );
}

export function SettingsGroup({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      {(title || description) && (
        <div className="flex flex-col gap-0.5">
          {title && <h2 className="text-caption font-semibold text-muted-foreground">{title}</h2>}
          {description && <p className="text-caption text-muted-foreground">{description}</p>}
        </div>
      )}
      <div
        className={cn(
          // Solid surface and a real 1px edge: a translucent card over a
          // sub-pixel border reads as washed out.
          'overflow-hidden rounded-[15px] border border-border bg-card',
          // Dividers are inset to the row text instead of running edge to edge.
          '[&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-5',
          "[&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-border [&>*+*]:before:content-['']",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function RowLabel({
  label,
  description,
  hint,
}: {
  label: string;
  description?: string;
  hint?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-ui font-medium text-foreground">{label}</span>
        {hint}
      </div>
      {description && <span className="text-caption text-muted-foreground">{description}</span>}
    </div>
  );
}

/** Label left, control right. */
export function SettingsRow({
  label,
  description,
  hint,
  disabled,
  className,
  children,
}: {
  label: string;
  description?: string;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        // Every label-only row is the same height, whatever control it holds.
        'flex items-center justify-between gap-6 px-5',
        description ? 'py-3' : 'min-h-12',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <RowLabel label={label} description={description} hint={hint} />
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** Label on top, full-width control below (list editors, long text). */
export function SettingsStackRow({
  label,
  description,
  hint,
  disabled,
  children,
}: {
  label: string;
  description?: string;
  hint?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-col gap-2 px-5 py-5', disabled && 'pointer-events-none opacity-50')}
    >
      <RowLabel label={label} description={description} hint={hint} />
      {children}
    </div>
  );
}

/**
 * Shows where a value comes from and resets it. `project` scope reads
 * "Using global" for inherited values.
 */
export function SettingSourceTag({
  isOverridden,
  scope,
  onReset,
}: {
  isOverridden: boolean;
  scope: 'global' | 'project';
  onReset: () => void;
}): React.JSX.Element {
  if (isOverridden) {
    return (
      <button
        type="button"
        onClick={onReset}
        className="text-caption text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        Reset
      </button>
    );
  }
  return (
    <span className="text-caption text-muted-foreground/70">
      {scope === 'project' ? 'Using global' : 'Default'}
    </span>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        // Filled track, no outline: the segmented control should not mix a
        // second chrome language with the selects in the same column.
        'inline-flex h-7 items-center gap-0.5 rounded-lg bg-muted p-0.5',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-6 rounded-md px-2.5 text-caption leading-none transition-colors',
            option.value === value
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function NumberField({
  value,
  onCommit,
  min,
  max,
  placeholder,
  disabled,
  suffix,
  className,
}: {
  value: number | undefined;
  onCommit: (value: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  suffix?: string;
  className?: string;
}): React.JSX.Element {
  const formatted = value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(formatted);
  const [lastFormatted, setLastFormatted] = useState(formatted);

  // Adjust during render when the committed value changes (React's
  // "storing information from previous renders" pattern) instead of an
  // effect, which would add a cascading render pass.
  if (formatted !== lastFormatted) {
    setLastFormatted(formatted);
    setDraft(formatted);
  }

  function commit(): void {
    const trimmed = draft.trim();
    if (trimmed === '') {
      onCommit(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(formatted);
      return;
    }
    const clamped = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? 0, parsed));
    setDraft(String(clamped));
    onCommit(clamped);
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            setDraft(formatted);
          }
        }}
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        className="h-7 w-28 rounded-md text-right font-mono text-caption tabular-nums"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export function TextField({
  value,
  onCommit,
  placeholder,
  disabled,
  className,
  monospace,
}: {
  value: string | undefined;
  onCommit: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  monospace?: boolean;
}): React.JSX.Element {
  const formatted = value ?? '';
  const [draft, setDraft] = useState(formatted);
  const [lastFormatted, setLastFormatted] = useState(formatted);

  if (formatted !== lastFormatted) {
    setLastFormatted(formatted);
    setDraft(formatted);
  }

  function commit(): void {
    const trimmed = draft.trim();
    onCommit(trimmed.length > 0 ? trimmed : null);
  }

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.stopPropagation();
          setDraft(formatted);
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      className={cn('h-7 rounded-md text-xs', monospace && 'font-mono', className)}
    />
  );
}

/** Editable list of strings; empty rows are dropped and an empty list clears the field. */
export function StringListField({
  value,
  onCommit,
  placeholder,
  disabled,
  addLabel,
}: {
  value: readonly string[] | undefined;
  onCommit: (value: string[] | null) => void;
  placeholder?: string;
  disabled?: boolean;
  addLabel: string;
}): React.JSX.Element {
  const [rows, setRows] = useState<string[]>(() => [...(value ?? [])]);
  // Compare by content: a new snapshot re-creates every array, and
  // in-progress edits must not be reset just because the reference changed.
  const valueKey = JSON.stringify(value ?? []);
  const [lastValueKey, setLastValueKey] = useState(valueKey);

  if (valueKey !== lastValueKey) {
    setLastValueKey(valueKey);
    setRows([...(value ?? [])]);
  }

  function commit(nextRows: string[]): void {
    const cleaned = nextRows.map((row) => row.trim()).filter((row) => row.length > 0);
    setRows(cleaned);
    onCommit(cleaned.length > 0 ? cleaned : null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Input
            value={row}
            onChange={(event) => {
              const next = [...rows];
              next[index] = event.target.value;
              setRows(next);
            }}
            onBlur={() => commit(rows)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit(rows);
              } else if (event.key === 'Escape') {
                event.stopPropagation();
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            spellCheck={false}
            className="h-7 flex-1 rounded-md font-mono text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove entry"
            disabled={disabled}
            onClick={() => commit(rows.filter((_, rowIndex) => rowIndex !== index))}
            className="text-muted-foreground hover:text-foreground"
          >
            <IconX />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={disabled}
        onClick={() => setRows([...rows, ''])}
        className="w-fit text-muted-foreground"
      >
        <IconPlus data-icon="inline-start" />
        {addLabel}
      </Button>
    </div>
  );
}

export function SettingsHint({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="px-1 text-xs text-muted-foreground">{children}</p>;
}
