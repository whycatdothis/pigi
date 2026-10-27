// @vitest-environment jsdom
/**
 * The per-field saving state: which fields a pending write marks, and which it
 * leaves alone. The subject is the timing around the worker round trip, so the
 * client call is held open by the test (a promise the test settles by hand)
 * rather than answered immediately.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PiSettingsResult, PiSettingsSnapshot } from '../../../shared/piSettings';
// The jsdom stubs and the DOM matchers.
import '../testing/jsdomSetup';
import { usePiSettings, type PiSettingsController } from './usePiSettings';

// vi.mock is hoisted above the imports it replaces, so the fakes have to be
// minted in vi.hoisted. The settings client is the IPC boundary this hook
// talks to; its promise is the clock every assertion turns on.
const piAgentClient = vi.hoisted(() => ({
  getPiSettings: vi.fn(),
  setPiSettings: vi.fn(),
}));

// The hook reports failures through a toast; the test has to see it fire.
const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('../services/piAgentClient', () => piAgentClient);
vi.mock('sonner', () => ({ toast }));

const CWD = '/work/project';

const SNAPSHOT: PiSettingsSnapshot = {
  global: {},
  project: {},
  paths: {
    agentDir: '~/.pi/agent',
    globalSettings: '~/.pi/agent/settings.json',
    projectSettings: '/work/project/.pi/settings.json',
  },
  projectTrusted: true,
  piVersion: '0.0-test',
};

/** The fields the harness reports on, covering both scopes of one field. */
const PROBES = [
  { field: 'steeringMode', scope: 'global' },
  { field: 'steeringMode', scope: 'project' },
  { field: 'httpIdleTimeoutMs', scope: 'global' },
] as const;

/**
 * Mounts the hook and prints its answers: whether a snapshot arrived, whether
 * anything is saving, and `isFieldSaving` for each probe. `onWrite` decides
 * what the button writes, and can record the outcome.
 */
function Harness({
  onWrite,
}: {
  onWrite: (controller: PiSettingsController) => void;
}): React.JSX.Element {
  const controller = usePiSettings(CWD);
  return (
    <div>
      <span data-testid="snapshot">{controller.snapshot ? 'loaded' : 'empty'}</span>
      <span data-testid="saving">{controller.saving ? 'saving' : 'idle'}</span>
      {PROBES.map(({ field, scope }) => (
        <span key={`${scope}:${field}`} data-testid={`field-${scope}-${field}`}>
          {controller.isFieldSaving(field, scope) ? 'saving' : 'idle'}
        </span>
      ))}
      <button type="button" data-testid="write" onClick={() => onWrite(controller)}>
        write
      </button>
    </div>
  );
}

/** What one probe's span currently says. */
function probeState(scope: string, field: string): string {
  return screen.getByTestId(`field-${scope}-${field}`).textContent ?? '';
}

function savingState(): string {
  return screen.getByTestId('saving').textContent ?? '';
}

/** A write the test holds open until it decides the outcome. */
function pendingResult(): {
  promise: Promise<PiSettingsResult>;
  resolve: (result: PiSettingsResult) => void;
  reject: (reason?: unknown) => void;
} {
  return Promise.withResolvers<PiSettingsResult>();
}

/** Wait for the mount-time load to land, so its promise cannot bleed into a write. */
async function waitForLoad(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('snapshot')).toHaveTextContent('loaded'));
}

/** Click the write button and let the dispatch (and its state updates) flush. */
async function clickWrite(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('write'));
  });
}

beforeEach(() => {
  piAgentClient.getPiSettings.mockReset().mockResolvedValue({ success: true, snapshot: SNAPSHOT });
  piAgentClient.setPiSettings.mockReset();
  toast.error.mockReset();
});

afterEach(cleanup);

describe('usePiSettings', () => {
  it('marks only the fields a pending write carries, in the scope it targets', async () => {
    const pendingWrite = pendingResult();
    piAgentClient.setPiSettings.mockReturnValue(pendingWrite.promise);

    render(
      <Harness
        onWrite={(controller) => {
          void controller.setUpdates('global', [{ field: 'steeringMode', value: 'all' }]);
        }}
      />,
    );
    await waitForLoad();

    await clickWrite();

    // The write is out: its field reads saving in the scope it targets, while
    // the same field in the other scope and every untouched field stays idle.
    expect(probeState('global', 'steeringMode')).toBe('saving');
    expect(probeState('project', 'steeringMode')).toBe('idle');
    expect(probeState('global', 'httpIdleTimeoutMs')).toBe('idle');
    expect(savingState()).toBe('saving');
  });

  it('marks every field written in the same call', async () => {
    const pendingWrite = pendingResult();
    piAgentClient.setPiSettings.mockReturnValue(pendingWrite.promise);

    render(
      <Harness
        onWrite={(controller) => {
          void controller.setUpdates('global', [
            { field: 'steeringMode', value: 'all' },
            { field: 'httpIdleTimeoutMs', value: 60000 },
          ]);
        }}
      />,
    );
    await waitForLoad();

    await clickWrite();

    expect(probeState('global', 'steeringMode')).toBe('saving');
    expect(probeState('global', 'httpIdleTimeoutMs')).toBe('saving');
    expect(probeState('project', 'steeringMode')).toBe('idle');
  });

  it('clears the in-flight fields when the write resolves', async () => {
    const pendingWrite = pendingResult();
    piAgentClient.setPiSettings.mockReturnValue(pendingWrite.promise);

    let writeOutcome: boolean | undefined;
    render(
      <Harness
        onWrite={(controller) => {
          void controller
            .setUpdates('global', [{ field: 'steeringMode', value: 'all' }])
            .then((written) => {
              writeOutcome = written;
            });
        }}
      />,
    );
    await waitForLoad();
    await clickWrite();
    expect(probeState('global', 'steeringMode')).toBe('saving');

    await act(async () => {
      pendingWrite.resolve({
        success: true,
        snapshot: { ...SNAPSHOT, global: { steeringMode: 'all' } },
      });
    });

    expect(probeState('global', 'steeringMode')).toBe('idle');
    expect(savingState()).toBe('idle');
    expect(writeOutcome).toBe(true);
    expect(piAgentClient.setPiSettings).toHaveBeenCalledExactlyOnceWith(CWD, 'global', [
      { field: 'steeringMode', value: 'all' },
    ]);
  });

  it('clears the in-flight fields and toasts when the write is rejected', async () => {
    const pendingWrite = pendingResult();
    piAgentClient.setPiSettings.mockReturnValue(pendingWrite.promise);

    let writeOutcome: boolean | undefined;
    render(
      <Harness
        onWrite={(controller) => {
          void controller
            .setUpdates('global', [{ field: 'steeringMode', value: 'all' }])
            .then((written) => {
              writeOutcome = written;
            });
        }}
      />,
    );
    await waitForLoad();
    await clickWrite();
    expect(probeState('global', 'steeringMode')).toBe('saving');

    await act(async () => {
      pendingWrite.reject(new Error('pi settings file is locked'));
    });

    expect(probeState('global', 'steeringMode')).toBe('idle');
    expect(savingState()).toBe('idle');
    expect(writeOutcome).toBe(false);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('pi settings file is locked');
  });

  it('keeps a field saving until every overlapping write of it has settled', async () => {
    const firstWrite = pendingResult();
    const secondWrite = pendingResult();
    piAgentClient.setPiSettings
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);

    render(
      <Harness
        onWrite={(controller) => {
          void controller.setUpdates('project', [{ field: 'steeringMode', value: 'all' }]);
        }}
      />,
    );
    await waitForLoad();

    // A reset can be clicked while its control's write is still out, so the
    // same field can be written twice concurrently.
    await clickWrite();
    await clickWrite();
    expect(probeState('project', 'steeringMode')).toBe('saving');

    await act(async () => {
      firstWrite.resolve({ success: true, snapshot: SNAPSHOT });
    });
    expect(probeState('project', 'steeringMode')).toBe('saving');

    await act(async () => {
      secondWrite.resolve({ success: true, snapshot: SNAPSHOT });
    });
    expect(probeState('project', 'steeringMode')).toBe('idle');
    expect(savingState()).toBe('idle');
  });
});
