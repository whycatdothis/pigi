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

class ResizeObserverStub {
  /** What the observer was asked to watch; jsdom reports no sizes, so nothing fires. */
  readonly observed = new Set<Element>();

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }

  disconnect(): void {
    this.observed.clear();
  }
}

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub });
}

// The tree brings the current row into view when the dialog opens; with no layout
// there is nowhere to scroll to.
Element.prototype.scrollIntoView = function scrollIntoView(): void {
  scrollRequests.push(this);
};
