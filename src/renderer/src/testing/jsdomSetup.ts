/**
 * The few APIs jsdom does not have, for component tests.
 *
 * jsdom has no layout engine, so anything that exists only to drive layout is stubbed
 * here rather than mocked per test: the component keeps calling it, it just does not
 * move anything. Tests that need a real measurement belong in a `*.browser.test` file
 * instead (see docs/testing.md).
 */
import '@testing-library/jest-dom/vitest';

/** Elements the app asked jsdom to scroll. jsdom cannot move them, so this is all it records. */
export const scrollRequests: Element[] = [];

/**
 * Size the layout is told every element has, once a test asks for one.
 *
 * jsdom reports a zero rect for everything. A virtual list decides how many rows to
 * draw from the size of its viewport, so without this it draws none at all — and a
 * list that draws nothing passes a test that reads the rows, which is worse than
 * failing. `installViewport` fills the size in; until it is called, everything keeps
 * the zero rect jsdom gives it, so tests that do not measure anything are unaffected.
 *
 * Call it before mounting. From then on, every element reports this size and an
 * observer reports it once when it starts watching an element — the same first report a
 * real one makes. Nothing needs a size change to be reported yet, so it is not.
 */
let viewport: { width: number; height: number } | null = null;

/** What the layout was told it has, for a test that wants to compute with it. */
export function viewportSize(): { width: number; height: number } {
  return viewport ?? { width: 0, height: 0 };
}

/** Give the layout a size, and `ResizeObserver` something to report. */
export function installViewport(size: { width: number; height: number }): void {
  viewport = size;
  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get: () => size.width,
  });
  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get: () => size.height,
  });
  Element.prototype.getBoundingClientRect = function elementRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
      top: 0,
      left: 0,
      right: size.width,
      bottom: size.height,
      toJSON: () => ({}),
    };
  };
}

class ResizeObserverStub {
  /** What the observer was asked to watch. */
  readonly observed = new Set<Element>();

  constructor(
    private readonly callback: (entries: ResizeObserverEntry[], observer: unknown) => void,
  ) {}

  observe(element: Element): void {
    this.observed.add(element);
    if (viewport === null) return;
    // What a real observer does first: report the element once, so the code that
    // asked to watch it has a starting size instead of waiting for a change.
    const { width, height } = viewport;
    const size = { blockSize: height, inlineSize: width };
    const rect = new DOMRectReadOnly(0, 0, width, height);
    const entry: ResizeObserverEntry = {
      target: element,
      contentRect: rect,
      borderBoxSize: [size],
      contentBoxSize: [size],
      devicePixelContentBoxSize: [size],
    };
    this.callback([entry], this);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }

  disconnect(): void {
    this.observed.clear();
  }
}

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverStub,
    configurable: true,
  });
}

// The tree brings the current row into view when the dialog opens; with no layout
// there is nowhere to scroll to.
Element.prototype.scrollIntoView = function scrollIntoView(): void {
  scrollRequests.push(this);
};
