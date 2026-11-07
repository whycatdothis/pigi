/**
 * Shared look for `/command`, skill and path references.
 *
 * The same chip is rendered in the composer and in sent messages, so both
 * places must read from these constants instead of copying the class list.
 */
const REFERENCE_CHIP_BASE_CLASS =
  'mx-px mt-px inline-flex h-5.5 items-center gap-1 rounded-chip bg-[var(--system-accent)]/10 px-1.5 align-top text-ui text-[var(--system-accent)]';

export const REFERENCE_CHIP_CLASS = `${REFERENCE_CHIP_BASE_CLASS} max-w-60`;

/** Path chips show the whole path, bounded only by the line they sit on. */
export const PATH_CHIP_CLASS = `${REFERENCE_CHIP_BASE_CLASS} max-w-full`;

const INTERACTIVE_CHIP_CLASS = 'hover:opacity-80 cursor-pointer';

/** Chip used by triggers that open a popover or a file. */
export const INTERACTIVE_REFERENCE_CHIP_CLASS = `${REFERENCE_CHIP_CLASS} ${INTERACTIVE_CHIP_CLASS}`;

export const INTERACTIVE_PATH_CHIP_CLASS = `${PATH_CHIP_CLASS} ${INTERACTIVE_CHIP_CLASS}`;
