import type { Turn } from '../components/demos/Transcript.astro';

/**
 * The sessions this site shows.
 *
 * They are written, not captured: the app reads a developer's own sessions off
 * disk, so a recreation has to author the content the way it authors the sidebar.
 * The work they describe is the work this site is about — the transcript, the
 * minimap, the tree and the terminal are all real parts of pigi, and each session
 * here is about one of them.
 *
 * A turn renders as: the message, then whatever the agent did about it (a
 * thought, a tool call), then the reply.
 */

/** The hero's window: what a session looks like, at a glance. */
export const heroTurns: Turn[] = [
  {
    user: 'the Tree 1 header overlaps the row underneath',
    time: '14:02',
    thinking:
      'The header is sticky inside the scroll container, so it covers whatever is above the threshold. The pinned band mirrors that header, and it assumes a fixed height — after a filter the header is taller, so the band is short by the difference and the row underneath shows through.',
    tool: {
      command: "rg -n 'pinnedBand|sticky' src/renderer/src/components/sessionTree",
      output: [
        'SessionTreePinnedBand.tsx:22:  const bandHeight = DEFAULT_HEIGHT;',
        'SessionTreeList.tsx:301:  <SessionTreePinnedBand topPx={bandTopPx} />',
      ],
      duration: '0.2s',
    },
    reply:
      'The band was measured once, when the tree mounted. After a filter the header grew and the band did not.',
    last: true,
  },
];

/**
 * The fork window.
 *
 * One finished turn and one the user is hovering: the still stands in for a
 * pointer over the newest message, which is where the app's fork action appears.
 * The tooltip's words are the app's own label for that action, and the fork has
 * no second line in the app — the extra line about the input box belongs to the
 * tree action on a user message (`messageBubbles.tsx`).
 *
 * The title matches a row in the sidebar, and the row under that one is a chat
 * forked from it.
 */
export const forkTurns: Turn[] = [
  {
    user: 'the tree blanks the window when a session is long',
    time: '11:02',
    thinking:
      'Every row is measured on mount, so a session with thousands of entries spends the first frames laying all of them out.',
    tool: {
      command: 'read src/renderer/src/components/sessionTree/SessionTreeList.tsx',
      output: ['86  * Row heights are constants and headers are measured, so'],
      duration: '0.2s',
    },
    reply:
      'Rows are a fixed height and the list draws a window over them, so it never measures the whole tree.',
  },
  {
    user: 'and the header should stay put while the rows scroll',
    time: '11:05',
    actionTooltip: { on: 'user', action: 'fork', label: 'Fork this msg in new session' },
  },
];

/**
 * The instant-history window: eight turns, long enough that the only way back to
 * the top is the minimap. That is the section's claim, so the panel has to be
 * worth navigating.
 */
export const historyTurns: Turn[] = [
  {
    user: 'the terminal panel drops frames while it animates open',
    time: '10:44',
    thinking:
      "Two things resize on every frame: the panel's height and the transcript's viewport. Each of those frames re-measures the visible rows.",
    tool: {
      command: "rg -n 'panelHeight|setPanelHeight' src/renderer/src",
      output: [
        'TerminalPanel.tsx:41:  const [panelHeight, setPanelHeight] = useState(0);',
        'TerminalPanel.tsx:88:      setPanelHeight(event.contentRect.height);',
      ],
      duration: '0.2s',
    },
    reply:
      "The panel's height is React state, so the open animation re-renders the whole tree sixty times a second and the transcript re-measures its rows on every one of those frames.",
  },
  {
    user: 'can you scope the resize observer to the panel instead of the window',
    time: '10:49',
    tool: {
      command: 'git log --oneline -3 -- src/components/terminal/TerminalPanel.tsx',
      output: [
        'a678ff1 fix: hold a version’s header in place at the top',
        '62d9bc3 fix: keep the session tree from blanking the window',
      ],
      duration: '0.1s',
    },
    reply:
      'Done. The observer is on the panel element now, and the height it reports goes straight to a CSS custom property. The gesture writes one value per frame and the browser paints it on the compositor — React never hears about it.',
  },
  {
    user: 'what does the transcript do while that gesture is running',
    time: '10:53',
    thinking:
      'The virtualizer needs to know the viewport height to decide how many rows to render. If the height changes every frame, it re-decides every frame.',
    reply:
      'It re-decides which rows to keep mounted, once per frame. Measured heights are cached, so it is not re-measuring — but it is re-rendering the window of rows, and that is where the frames go.',
  },
  {
    user: 'ok, do that. also check whether the minimap recomputes widths',
    time: '11:02',
    tool: {
      command: "rg -n 'maxLineWidth' src/renderer/src/components/transcript/",
      output: [
        'UserMessageMiniMap.tsx:78:  const [maxLineWidth, setMaxLineWidth] = useState(',
        'UserMessageMiniMap.tsx:82:  useEffect(() => {',
        'UserMessageMiniMap.tsx:86:    const observer = new ResizeObserver(([entry]) => {',
      ],
      duration: '0.2s',
    },
    reply:
      'It does — a `ResizeObserver` on the transcript container, writing state, on every frame of the gesture. Same shape of problem. The fix there is the same: publish the clamped width, and stop when the value has not changed.',
  },
  {
    user: 'does this affect the session tree too',
    time: '11:08',
    reply:
      'Different mechanism. The tree draws a windowed list as well, but its rows are a fixed height, so the window is arithmetic rather than measurement — nothing to re-measure when the window resizes, only a `scrollTop` to re-read.',
  },
  {
    user: 'the tree preview card is also lagging when I move the pointer fast',
    time: '11:14',
    thinking:
      'The card opens on a timer and closes on a timer. Moving fast across rows repeatedly restarts both, and each restart re-renders 380px of message preview.',
    reply:
      'The open delay restarts on every row, which is correct, but the card re-renders its body on each open. Debouncing the body to the row the pointer actually settles on removes the churn.',
  },
  {
    user: "let's not ship that. revert the preview change for now",
    time: '11:19',
    tool: {
      command: 'git restore src/components/sessionTree/SessionTreeList.tsx',
      output: [],
      duration: '0.1s',
    },
    reply:
      'Reverted. The panel and minimap changes stay; the preview card goes back to what shipped in 0.4.11 and I will redo it with the settle measurement in a separate pass.',
  },
  {
    user: 'good. run the tests before you commit',
    time: '11:24',
    tool: {
      command: 'npm test',
      output: [
        ' ✓ src/lib/sessionTreeLayout.test.ts (31 tests) 8ms',
        ' ✓ src/lib/measuredRowHeights.test.ts (9 tests) 4ms',
        ' Test Files  2 passed (2)',
        '      Tests  40 passed (40)',
      ],
      duration: '4.1s',
    },
    reply: 'Forty tests, green. Ready to commit whenever you are.',
    last: true,
  },
];

/**
 * The moment before the tree: a pointer resting on the newest reply's tree action.
 *
 * The app puts those actions on assistant messages too, and hovering one is the
 * other way into the tree — this is the still that shows it. The `?` inside the
 * tooltip is the same `?` the tree's toolbar carries, and it opens the dialog the
 * section below shows; the tooltip is the app's own, label and all.
 *
 * The session is the one the tree dialog is open on, so the tree in the next still
 * is this conversation.
 */
export const treeEntryTurns: Turn[] = [
  {
    user: 'and dim the bars that are not active',
    time: '09:21',
    reply: 'Only the bar nearest the middle of the viewport is lit now.',
    actionTooltip: { on: 'assistant', action: 'tree', label: 'Move the session here', help: true },
    last: true,
  },
];

/** The session-switcher window: whatever was open when the palette came up. */
export const switcherTurns: Turn[] = [
  {
    user: 'the bars should get dimmer when I scroll past them',
    time: '09:30',
    tool: {
      command: 'read src/components/transcript/UserMessageMiniMap.tsx',
      output: [
        '132   const distanceFromCentre = 1 - Math.abs(normalized * 2 - 1);',
        '145   const isActive = index === activeIndex;',
      ],
      duration: '0.1s',
    },
    reply:
      'Width comes from the bar’s position in the list; the lit one is the message nearest the middle of the viewport.',
    last: true,
  },
];

/** The terminal window: the session that ran the tests, with the panel open. */
export const terminalTurns: Turn[] = [
  {
    user: 'run the suite before you commit',
    time: '15:19',
    tool: {
      command: 'npm test',
      output: [' Test Files  3 passed (3)', '      Tests  49 passed (49)'],
      duration: '4.1s',
    },
    reply: 'Green. The panel is open on the run if you want the full output.',
    last: true,
  },
];

/**
 * The window behind the tree dialog. The tree is the feature, so the transcript
 * behind it is the session the tree belongs to, cut off where the dialog covers
 * it.
 */
export const treeTurns: Turn[] = [
  {
    user: 'Add a minimap to the transcript',
    time: '09:12',
    thinking: 'One bar per user message, sized by how long the message is.',
    tool: {
      command: 'read src/components/transcript/UserMessageMiniMap.tsx',
      output: ['78   const [maxLineWidth, setMaxLineWidth] = useState('],
      duration: '0.1s',
    },
    reply: 'One bar per user message. Here is the plan.',
  },
  {
    user: 'make the bars scale with length',
    time: '09:14',
    reply: 'Width now tracks the message length, clamped so a two-word message is still a target.',
  },
  {
    user: 'also show a timestamp on hover',
    time: '09:18',
    reply: 'Added — the list beside the bars reads the message and its time.',
  },
  {
    user: 'and dim the bars that are not active',
    time: '09:21',
    reply: 'Only the bar nearest the middle of the viewport is lit now.',
    last: true,
  },
];
