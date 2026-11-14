// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const MODELS = [
  model('Alpha', ['low', 'high']),
  model('Beta', ['off', 'low', 'high']),
  model('Plain', []),
];

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

const slider = (): HTMLElement => screen.getByRole('slider', { name: 'Thinking' });

/** jsdom has no layout, so the width the cells share is given to the drag maths. */
function layOutSlider(width = 300): void {
  const cells = slider().firstElementChild;
  if (!cells) throw new Error('the slider has no cells');
  vi.spyOn(cells, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width,
    height: 24,
    top: 0,
    left: 0,
    right: width,
    bottom: 24,
    toJSON: () => ({}),
  });
}

afterEach(() => {
  cleanup();
});

describe('ModelSettingsPicker', () => {
  it('shows every level as a cell, the current one as the value', async () => {
    renderPicker();
    await openPicker();

    expect(slider()).toHaveAttribute('aria-valuetext', 'low');
    expect(slider()).toHaveAttribute('aria-valuenow', '0');
    expect(slider()).toHaveAttribute('aria-valuemax', '1');
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('steps through the levels with the keyboard', async () => {
    const { onSelectThinkingLevel } = renderPicker();
    await openPicker();

    slider().focus();
    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(onSelectThinkingLevel).toHaveBeenLastCalledWith('high');

    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuenow', '1'));
    fireEvent.keyDown(slider(), { key: 'Home' });
    expect(onSelectThinkingLevel).toHaveBeenLastCalledWith('low');
  });

  it('follows a drag across the cells and writes the level once, on release', async () => {
    const { onSelectThinkingLevel } = renderPicker();
    await openPicker();
    layOutSlider();

    fireEvent.pointerDown(slider(), { clientX: 10 });
    expect(slider()).toHaveAttribute('aria-valuenow', '0');

    fireEvent.pointerMove(slider(), { clientX: 290 });
    expect(slider()).toHaveAttribute('aria-valuenow', '1');
    expect(onSelectThinkingLevel).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider(), { clientX: 290 });
    await waitFor(() => expect(onSelectThinkingLevel).toHaveBeenCalledExactlyOnceWith('high'));
  });

  it('stays open on a level, and on a new model that has levels', async () => {
    const { onSelectModel } = renderPicker();
    await openPicker();

    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(screen.getByPlaceholderText('Search models')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /Beta/ }));

    expect(onSelectModel).toHaveBeenCalledWith(MODELS[1]);
    expect(screen.getByPlaceholderText('Search models')).toBeInTheDocument();
    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuemax', '2'));
    expect(slider()).toHaveAttribute('aria-valuetext', 'off');
  });

  it('closes on a model that has no thinking levels', async () => {
    renderPicker();
    await openPicker();

    fireEvent.click(screen.getByRole('option', { name: /Plain/ }));

    await waitFor(() => expect(screen.queryByPlaceholderText('Search models')).toBeNull());
  });
});
