import { beforeEach, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { IconCheck } from '@tabler/icons-react';
import { applyAppearance } from '../../appearance/applyAppearance';
import { useSettingsStore } from '../../state/settingsStore';
import { requireElement } from '../../testing/domQuery';
import { ACCENT_SELECTION_ROW_CLASS, COMPACT_SELECTION_ITEM_CLASS } from './selectionStyles';
import '../../assets/main.css';

beforeEach(() => {
  applyAppearance(useSettingsStore.getState().appearance);
});

test('compact selection rows use caption type and the accent checked state', async () => {
  const screen = await render(
    <div>
      <div data-state="unchecked" data-testid="unchecked" className={COMPACT_SELECTION_ITEM_CLASS}>
        Unchecked
      </div>
      <div data-state="checked" data-testid="checked" className={COMPACT_SELECTION_ITEM_CLASS}>
        Checked
        <IconCheck data-testid="check" />
      </div>
      <div data-testid="body" className={`${ACCENT_SELECTION_ROW_CLASS} text-body`}>
        Body
      </div>
      <div data-testid="tint" style={{ backgroundColor: 'var(--accent-subtle)' }} />
      <div data-testid="accent" style={{ color: 'var(--system-accent)' }} />
    </div>,
  );

  const unchecked = requireElement<HTMLElement>('[data-testid="unchecked"]', screen.container);
  const checked = requireElement<HTMLElement>('[data-testid="checked"]', screen.container);
  const tint = requireElement<HTMLElement>('[data-testid="tint"]', screen.container);
  const accent = requireElement<HTMLElement>('[data-testid="accent"]', screen.container);

  const uncheckedStyle = getComputedStyle(unchecked);
  const checkedStyle = getComputedStyle(checked);

  expect(uncheckedStyle.fontSize).toBe('13px');
  expect(uncheckedStyle.paddingLeft).toBe('8px');
  expect(uncheckedStyle.paddingRight).toBe('8px');
  expect(uncheckedStyle.borderRadius).toBe('14px');
  expect(uncheckedStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(checkedStyle.backgroundColor).toBe(getComputedStyle(tint).backgroundColor);
  expect(checkedStyle.color).toBe(getComputedStyle(accent).color);

  const body = requireElement<HTMLElement>('[data-testid="body"]', screen.container);
  expect(getComputedStyle(body).fontSize).toBe('15px');

  const check = requireElement<Element>('[data-testid="check"]', screen.container);
  expect(getComputedStyle(check).width).toBe('16px');
});
