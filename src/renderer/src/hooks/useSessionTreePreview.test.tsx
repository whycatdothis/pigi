// @vitest-environment jsdom
/**
 * The hover preview card's timing.
 *
 * The card shows what a row had to cut off, which is a measurement only a real
 * browser can make — so the row's overflow is stubbed here and the *timing* is
 * the subject: the card waits for the pointer to rest, reads the text while it
 * waits, and leaves when the pointer does. The browser layer takes the same card
 * with real overflow.
 */
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SessionTreeEntry } from '../../../shared/ipcContract';
// The jsdom stubs and the DOM matchers; nothing here moves anything.
import '../testing/jsdomSetup';
import { installFakePiApi, type FakePiApi } from '../testing/fakePiApi';
import { sessionTree, sessionTreeEntry } from '../testing/sessionTreeFixtures';
import { useSessionTreePreview } from './useSessionTreePreview';

const ROW_A: SessionTreeEntry = sessionTreeEntry(0, 'row-a', null, 'user', 'first row');
const ROW_B: SessionTreeEntry = sessionTreeEntry(1, 'row-b', 'row-a', 'assistant', 'second row');
const SESSION_PATH = '/tmp/preview-timing.jsonl';

/** Let the timers and the read they start run to completion. */
async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Make a row's text look clipped. jsdom measures every element as zero wide, so
 * a row that has to be previewed says so here instead of being measured.
 */
function clipRowText(row: HTMLElement): void {
  const text = row.querySelector<HTMLElement>('[data-tree-row-text]');
  if (!text) throw new Error('no row text to clip');
  Object.defineProperty(text, 'scrollWidth', { value: 400, configurable: true });
  Object.defineProperty(text, 'clientWidth', { value: 100, configurable: true });
}

function Harness(): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { card, previewText, handleRowEnter, scheduleCardHide } = useSessionTreePreview({
    sessionPath: SESSION_PATH,
    dialogRef,
  });
  return (
    <div ref={dialogRef}>
      {[ROW_A, ROW_B].map((entry) => (
        <button
          key={entry.id}
          type="button"
          data-testid={`row-${entry.id}`}
          onMouseEnter={(event) => handleRowEnter(event, entry)}
          onMouseLeave={scheduleCardHide}
        >
          <span data-tree-row-text>{entry.preview}</span>
        </button>
      ))}
      {card && (
        <div data-testid="session-tree-preview">
          {previewText === null ? 'Loading…' : previewText.text}
        </div>
      )}
    </div>
  );
}

let fake: FakePiApi;

beforeEach(() => {
  vi.useFakeTimers();
  fake = installFakePiApi(sessionTree([ROW_A, ROW_B], 'row-b'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function row(entryId: string): HTMLElement {
  return screen.getByTestId(`row-${entryId}`);
}

describe('useSessionTreePreview', () => {
  it('shows the card only after the pointer has rested on a row', async () => {
    render(<Harness />);
    clipRowText(row('row-a'));

    fireEvent.mouseEnter(row('row-a'));
    await tick(400);
    expect(screen.queryByTestId('session-tree-preview')).not.toBeInTheDocument();

    await tick(200);
    expect(screen.getByTestId('session-tree-preview')).toHaveTextContent('text of row-a');
  });

  it('reads the row while the pointer waits, so the card is rarely empty', async () => {
    render(<Harness />);
    clipRowText(row('row-a'));

    fireEvent.mouseEnter(row('row-a'));
    await tick(150);
    expect(fake.commands).toEqual([{ type: 'get_entry_text', entryId: 'row-a' }]);
    expect(screen.queryByTestId('session-tree-preview')).not.toBeInTheDocument();

    await tick(400);
    expect(screen.getByTestId('session-tree-preview')).not.toHaveTextContent('Loading');
  });

  it('shows nothing for a row the pointer only crossed', async () => {
    render(<Harness />);
    clipRowText(row('row-a'));
    clipRowText(row('row-b'));

    fireEvent.mouseEnter(row('row-a'));
    await tick(200);
    fireEvent.mouseEnter(row('row-b'));
    await tick(200);
    expect(screen.queryByTestId('session-tree-preview')).not.toBeInTheDocument();

    await tick(400);
    expect(screen.getByTestId('session-tree-preview')).toHaveTextContent('text of row-b');
  });

  it("keeps a card's own text while the pointer moves on to another row", async () => {
    render(<Harness />);
    clipRowText(row('row-a'));
    clipRowText(row('row-b'));

    fireEvent.mouseEnter(row('row-a'));
    await tick(600);
    expect(screen.getByTestId('session-tree-preview')).toHaveTextContent('text of row-a');

    // The pointer moved on; the read for the new row must not blank the card that
    // is still up, and the card takes the new text when it follows the pointer.
    fireEvent.mouseEnter(row('row-b'));
    await tick(300);
    expect(screen.getByTestId('session-tree-preview')).toHaveTextContent('text of row-a');

    await tick(400);
    expect(screen.getByTestId('session-tree-preview')).toHaveTextContent('text of row-b');
  });

  it('takes the card away after the pointer leaves the row', async () => {
    render(<Harness />);
    clipRowText(row('row-a'));

    fireEvent.mouseEnter(row('row-a'));
    await tick(600);
    expect(screen.getByTestId('session-tree-preview')).toBeInTheDocument();

    fireEvent.mouseLeave(row('row-a'));
    await tick(200);
    expect(screen.queryByTestId('session-tree-preview')).not.toBeInTheDocument();
  });
});
