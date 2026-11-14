// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '../../testing/jsdomSetup';
import type { ModelInfo, ThinkingLevel } from '../../../../shared/ipcContract';
import { ModelSettingsPicker } from './modelSettingsPicker';

const model = (name: string, thinkingLevels: ThinkingLevel[]): ModelInfo => ({
  id: name.toLowerCase(),
  name,
  provider: 'test',
  api: 'test',
  contextWindow: 200_000,
  maxTokens: 8_000,
  reasoning: true,
  thinkingLevels,
});

const MODELS = [model('Alpha', ['low', 'high']), model('Beta', ['off', 'low', 'high'])];

/** Stands in for the app: a new model brings its own levels and starting level. */
function Harness({
  onSelectModel,
  onSelectThinkingLevel,
}: {
  onSelectModel: (model: ModelInfo) => void;
  onSelectThinkingLevel: (level: ThinkingLevel) => void;
}): React.JSX.Element {
  const [selected, setSelected] = useState(MODELS[0]);
  const [level, setLevel] = useState<ThinkingLevel | null>('low');
  return (
    <ModelSettingsPicker
      modelLabel={selected.name}
      modelValue={selected}
      modelOptions={MODELS}
      onSelectModel={(next) => {
        setSelected(next);
        setLevel(next.thinkingLevels[0] ?? null);
        onSelectModel(next);
      }}
      onRequestModelRefresh={() => {}}
      thinkingLabel={level ?? 'unknown'}
      thinkingValue={level}
      thinkingOptions={selected.thinkingLevels}
      onSelectThinkingLevel={(next) => {
        setLevel(next);
        onSelectThinkingLevel(next);
      }}
    />
  );
}

function renderPicker(): {
  onSelectModel: ReturnType<typeof vi.fn>;
  onSelectThinkingLevel: ReturnType<typeof vi.fn>;
} {
  const onSelectModel = vi.fn();
  const onSelectThinkingLevel = vi.fn();
  render(<Harness onSelectModel={onSelectModel} onSelectThinkingLevel={onSelectThinkingLevel} />);
  return { onSelectModel, onSelectThinkingLevel };
}

async function openPicker(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));
  await screen.findByPlaceholderText('Search models');
}

const rail = (): HTMLElement => screen.getByRole('group', { name: /Thinking/ });

afterEach(() => {
  cleanup();
});

describe('ModelSettingsPicker', () => {
  it('shows every level of the model as one pressable stop', async () => {
    renderPicker();
    await openPicker();

    expect(
      within(rail())
        .getAllByRole('button')
        .map((stop) => stop.textContent),
    ).toEqual(['low', 'high']);
    expect(within(rail()).getByRole('button', { pressed: true })).toHaveTextContent('low');
  });

  it('picks a level and closes', async () => {
    const { onSelectThinkingLevel } = renderPicker();
    await openPicker();

    fireEvent.click(within(rail()).getByRole('button', { name: 'high' }));

    expect(onSelectThinkingLevel).toHaveBeenCalledWith('high');
    await waitFor(() => expect(screen.queryByPlaceholderText('Search models')).toBeNull());
  });

  it('keeps the popover open on a new model and focuses the level it starts on', async () => {
    const { onSelectModel, onSelectThinkingLevel } = renderPicker();
    await openPicker();

    fireEvent.click(screen.getByRole('option', { name: /Beta/ }));

    expect(onSelectModel).toHaveBeenCalledWith(MODELS[1]);
    expect(onSelectThinkingLevel).not.toHaveBeenCalled();
    // The rail lists the new model's levels and the stop Enter would press has
    // the focus, so the level is confirmed before the popover closes.
    await waitFor(() =>
      expect(
        within(rail())
          .getAllByRole('button')
          .map((stop) => stop.textContent),
      ).toEqual(['off', 'low', 'high']),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(within(rail()).getByRole('button', { pressed: true })),
    );
  });
});
