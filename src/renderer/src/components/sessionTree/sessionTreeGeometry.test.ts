import { describe, expect, it } from 'vitest';
import type { SessionTreeDisplayNode } from '../../lib/sessionTreeData';
import { BRANCH_SPACING_PX, ROW_HEIGHT_PX, findLitRowOffsetPx } from './sessionTreeGeometry';

function node(
  itemId: string,
  continuation: SessionTreeDisplayNode | null = null,
  branch: SessionTreeDisplayNode[] | null = null,
): SessionTreeDisplayNode {
  return { itemId, continuation, branch, railTint: 'none' };
}

describe('findLitRowOffsetPx', () => {
  it('measures a row from the branch child it hangs under, spacing included', () => {
    const b1 = node('b1', node('b2'));
    const b3 = node('b3');
    const fork = node('f', null, [b1, b3]);

    // The row that draws the line is at zero: its run ends at its own elbow.
    expect(findLitRowOffsetPx(b1, 'b1')).toBe(0);
    expect(findLitRowOffsetPx(b1, 'b2')).toBe(ROW_HEIGHT_PX);
    expect(findLitRowOffsetPx(b1, 'b3')).toBe(null);

    // A fork row measures across the branches before the lit one, including the
    // fork's own row and the spacing each branch wrapper adds above its child.
    expect(findLitRowOffsetPx(fork, 'b3')).toBe(ROW_HEIGHT_PX * 3 + BRANCH_SPACING_PX * 2);
  });

  it('counts the rows of a branch passed on the way down', () => {
    const d2 = node('d2');
    const nested = node('c1', null, [node('d1', d2), node('e1')]);
    const b1 = node('b1', nested);

    expect(findLitRowOffsetPx(b1, 'd2')).toBe(ROW_HEIGHT_PX * 3 + BRANCH_SPACING_PX);
  });
});
