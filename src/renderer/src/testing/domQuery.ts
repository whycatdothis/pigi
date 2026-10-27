/**
 * A query that throws when nothing matches, so a test that loses its element
 * fails at the query instead of on an unrelated `null` further down.
 *
 * Browser tests measure computed style and geometry, so most of them need the
 * element itself rather than a locator.
 */
export function requireElement<T extends Element>(
  selector: string,
  scope: ParentNode = document,
): T {
  const element = scope.querySelector<T>(selector);
  if (!element) throw new Error(`nothing on the page matches ${selector}`);
  return element;
}
