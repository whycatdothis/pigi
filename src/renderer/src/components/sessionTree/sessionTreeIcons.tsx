import React from 'react';
import { IconArrowFork, IconBinaryTree2 } from '@tabler/icons-react';
import { cn } from '../../lib/utils';

/**
 * The session tree's two glyphs, defined once so every surface draws the same
 * pair: the toolbar button, the `Tree 1` headers, the message actions and the
 * help dialog all take them from here.
 *
 * The fork is drawn on its side, so its arms point the way the message goes —
 * out of the branch you are on. The tree carries a small scale because of its
 * own drawing: Tabler gives it 16 of the 24 units in its viewBox where the
 * icons beside it use 18, which reads as a smaller icon. Scaling it up does not
 * touch the box the layout reserves — `transform` never affects layout — and
 * 1.15 puts its height level with the others while staying inside that box.
 */
const TREE_GLYPH_CLASS_NAME = 'scale-[1.15]';
const FORK_GLYPH_CLASS_NAME = 'rotate-90';

interface SessionTreeGlyphProps {
  size?: number;
  stroke?: number;
  className?: string;
}

/** `binary-tree-2` — the tree itself. */
export function SessionTreeIcon({
  size = 15,
  stroke,
  className,
}: SessionTreeGlyphProps): React.JSX.Element {
  return (
    <IconBinaryTree2 size={size} stroke={stroke} className={cn(TREE_GLYPH_CLASS_NAME, className)} />
  );
}

/** `arrow-fork` on its side — one message going on as a chat of its own. */
export function SessionForkIcon({
  size = 15,
  stroke,
  className,
}: SessionTreeGlyphProps): React.JSX.Element {
  return (
    <IconArrowFork size={size} stroke={stroke} className={cn(FORK_GLYPH_CLASS_NAME, className)} />
  );
}
