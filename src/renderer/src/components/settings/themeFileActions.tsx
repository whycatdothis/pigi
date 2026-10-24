/**
 * Share a look between pigi windows: copy the current appearance as a theme
 * file, or paste one back in. The page owns nothing here; the store replaces
 * the whole appearance on import.
 */
import { useState } from 'react';
import { useSettingsStore } from '../../state/settingsStore';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';
import { parseThemeFile, serializeTheme } from '../../../../shared/themeFile';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

const COPIED_FEEDBACK_MS = 1500;

export function ThemeFileActions(): React.JSX.Element {
  const appearance = useSettingsStore((state) => state.appearance);
  const updateAppearance = useSettingsStore((state) => state.updateAppearance);
  const { copied, copy } = useCopyFeedback(serializeTheme(appearance), COPIED_FEEDBACK_MS);
  const [importOpen, setImportOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function closeImport(): void {
    setImportOpen(false);
    setDraft('');
    setError(null);
  }

  function importTheme(): void {
    const result = parseThemeFile(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    updateAppearance(() => result.appearance);
    closeImport();
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={copy}
        className="text-caption text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        {copied ? 'Copied' : 'Copy theme'}
      </button>
      <button
        type="button"
        onClick={() => setImportOpen(true)}
        className="text-caption text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        Import theme
      </button>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => (open ? setImportOpen(true) : closeImport())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import theme</DialogTitle>
            <DialogDescription>
              Paste a theme copied from another pigi window. It replaces the current colors, fonts,
              and sizes.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            aria-label="Theme file contents"
            spellCheck={false}
            placeholder={'{\n  "kind": "pigi-theme",\n  …\n}'}
            className="h-40 w-full resize-none rounded-md border border-input bg-transparent p-2.5 font-mono text-caption outline-none placeholder:text-muted-foreground focus-visible:border-ring"
          />
          {error !== null && <p className="text-caption text-danger-fg">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={closeImport}>
              Cancel
            </Button>
            <Button onClick={importTheme} disabled={draft.trim() === ''}>
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
