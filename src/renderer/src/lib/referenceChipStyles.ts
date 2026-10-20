/**
 * Shared look for `/command`, skill and path references.
 *
 * The same chip is rendered in the composer and in sent messages, so both
 * places must read from these constants instead of copying the class list.
 */
export const REFERENCE_CHIP_CLASS =
  'mx-px mt-px inline-flex h-5.5 max-w-60 items-center gap-1 rounded-[6px] bg-[var(--system-accent)]/10 px-1.5 align-top text-[0.875rem] text-[var(--system-accent)]';

/** Chip used by triggers that open a popover. */
export const INTERACTIVE_REFERENCE_CHIP_CLASS = `${REFERENCE_CHIP_CLASS} hover:opacity-80 cursor-pointer`;
