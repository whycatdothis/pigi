// @vitest-environment jsdom
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRememberedScroll } from './useRememberedScroll';

function Viewer({
  viewer,
  contentKey,
}: {
  viewer: string;
  contentKey: string | null;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useRememberedScroll(ref, viewer, contentKey);
  return <div ref={ref} data-testid="scroller" />;
}

function scrollTo(top: number): HTMLElement {
  const element = screen.getByTestId('scroller');
  element.scrollTop = top;
  fireEvent.scroll(element);
  return element;
}

describe('useRememberedScroll', () => {
  afterEach(cleanup);

  it('restores the last position of the same key once the content is ready', () => {
    const { unmount } = render(<Viewer viewer="a" contentKey="one" />);
    scrollTo(240);
    unmount();

    const { rerender } = render(<Viewer viewer="a" contentKey={null} />);
    const element = screen.getByTestId('scroller');
    const restore = vi.fn();
    element.scrollTo = restore;
    expect(restore).not.toHaveBeenCalled();
    rerender(<Viewer viewer="a" contentKey="one" />);
    expect(restore).toHaveBeenCalledWith(0, 240);
  });

  it('starts another key at its top and restores only on mount', () => {
    const { unmount } = render(<Viewer viewer="b" contentKey="one" />);
    scrollTo(240);
    unmount();

    const { rerender } = render(<Viewer viewer="b" contentKey="two" />);
    const element = screen.getByTestId('scroller');
    const restore = vi.fn();
    element.scrollTo = restore;
    rerender(<Viewer viewer="b" contentKey="one" />);
    expect(restore).not.toHaveBeenCalled();
  });
});
