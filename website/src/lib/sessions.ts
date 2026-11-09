import type { Turn } from '../components/demos/Transcript.astro';

export const heroTurns: Turn[] = [
  {
    user: 'the tree header overlaps the row underneath',
    time: '13:52',
    thinking:
      'The band is sticky and zero-height, so it paints over the row instead of taking its space.',
    tool: {
      prefix: 'read',
      command: 'src/renderer/src/components/sessionTree/SessionTreePinnedBand.tsx',
      output: [
        '164      <div className="sticky top-0 z-20 h-0" aria-hidden="true" data-testid="session-tree-pinned">',
      ],
      duration: '0.1s',
    },
    reply:
      'It paints over the row instead of moving it: the band is an overlay, and nothing reserves its height.',
  },
  {
    user: 'reserve it then',
    time: '13:58',
    tool: {
      prefix: 'edit',
      command: 'src/renderer/src/components/sessionTree/SessionTreePinnedBand.tsx',
      diff: [
        { type: 'remove', number: 164, content: '  className="sticky top-0 z-20 h-0"' },
        {
          type: 'add',
          number: 164,
          content: '  className="sticky top-0 z-20 h-[var(--pinned-band)]"',
        },
      ],
      duration: '0.4s',
    },
    reply:
      'The band holds its own height now, so the rows move up by exactly that much while one is pinned.',
    last: true,
  },
];

export const builderTurns: Turn[] = [
  {
    user: 'the release DMG has been unsigned since the electron-builder bump',
    time: '09:05',
    thinking:
      'Notarizing is on and signing is not, so an unsigned bundle goes out for notarization and comes back. The config names no certificate, and never did.',
    tool: {
      command: "rg -n 'identity|notarize' electron-builder.yml",
      output: ['39   notarize: true'],
      duration: '0.1s',
    },
    reply:
      'The config asks for notarization and names no identity, so the certificate has to arrive from the release job. Nothing there exports one.',
  },
  {
    user: 'pin the version that reads the identity from the environment',
    time: '09:12',
    tool: {
      command: 'npm view electron-builder version',
      output: ['26.0.12'],
      duration: '0.4s',
    },
    reply:
      'Pinned to 26.0.12, and left the version in the release skill so the next bump checks it before tagging.',
  },
  {
    user: 'is the DMG reproducible from this commit',
    time: '09:18',
    tool: { command: 'git status --short', output: [], duration: '0.1s' },
    reply: 'Clean tree, and the lockfile is the one the tag will build from.',
    last: true,
  },
];

// Four turns so the transcript overflows its window, as a real session would.
export const forkTurns: Turn[] = [
  {
    user: 'does the tree keep a fork under the session it came from',
    time: '10:51',
    tool: {
      command: 'rg -n "depth" src/renderer/src/lib/sessionLineage.ts',
      output: [
        '31 export function lineageDepth(parentPath: string | null): number {',
        '54   const isLastChild = index === siblings.length - 1;',
      ],
      duration: '0.1s',
    },
    reply:
      'It does. Depth is read from the session file, so a fork is drawn under its parent wherever it is opened from.',
  },
  {
    user: 'the tree jumps to the wrong row when I reopen it',
    time: '10:58',
    thinking:
      'The scroll position is restored before the rows exist, so the browser clamps it to a list that is still empty.',
    reply:
      'It restores before the first window of rows is laid out, and a scroll into an empty list is clamped to nothing. Restored after the first frame, it lands where it left.',
  },
  {
    user: 'the tree blanks the window when a session is long',
    time: '11:02',
    thinking:
      'Every row is measured on mount, so a session with thousands of entries spends the first frames laying all of them out.',
    tool: {
      prefix: 'read',
      command: 'src/renderer/src/components/sessionTree/SessionTreeList.tsx',
      output: ['86  * Row heights are constants and headers are measured, so'],
      duration: '0.2s',
    },
    reply:
      'Rows are a fixed height and the list draws a window over them, so it never measures the whole tree.',
  },
  {
    user: 'and the header should stay put while the rows scroll',
    time: '11:05',
    // Label verbatim from the app's fork action.
    actionTooltip: { on: 'user', action: 'fork', label: 'Fork this msg in new session' },
  },
];

// Long enough that the minimap is the only quick way back to the top.
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

export const treeTurns: Turn[] = [
  {
    user: 'Add a minimap to the transcript',
    time: '09:12',
    thinking: 'One bar per user message, sized by how long the message is.',
    tool: {
      prefix: 'read',
      command: 'src/components/transcript/UserMessageMiniMap.tsx',
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

export const terminalTurns: Turn[] = [
  ...heroTurns.map((turn): Turn => ({ ...turn, last: false })),
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

export interface SessionRow {
  title: string;
  time: string;
  depth?: number;
  hasChildren?: boolean;
  // The "2 subagents, 1 running" row that folds a parent's subagents, not a session.
  subagentGroup?: boolean;
  running?: boolean;
}

export const FORK_ROW: SessionRow = { title: 'Fork from message 12', time: '3d', depth: 1 };

const OLDER_ROW: SessionRow = { title: 'Terminal panel resize jank', time: '18m' };

export function sidebarRows(activeTitle: string): SessionRow[] {
  return [
    { title: activeTitle, time: 'now', hasChildren: true },
    FORK_ROW,
    activeTitle === OLDER_ROW.title ? { title: 'The transcript flickers', time: '2h' } : OLDER_ROW,
  ];
}

export const switchSessions: { title: string; turns: Turn[] }[] = [
  { title: 'Terminal panel resize jank', turns: historyTurns },
  { title: 'Add the chat minimap', turns: treeTurns },
  { title: 'Fix the tree header overlap', turns: heroTurns },
];

export const switchSessionRows: SessionRow[] = [
  { title: 'Fix the tree header overlap', time: 'now' },
  { title: 'Add the chat minimap', time: '4m' },
  { title: 'Terminal panel resize jank', time: '18m' },
];

export const COPY_SESSION_TITLE = 'Copy file names from the Files tab';

export const quoteTurns: Turn[] = [
  {
    user: 'right-click a file in the Files tree to copy its name or path',
    time: '12:53',
    tool: {
      prefix: 'read',
      command: 'src/renderer/src/components/files/FileTreeSidebar.tsx',
      output: ['412          <ContextMenuTrigger asChild>'],
      duration: '0.1s',
    },
    reply:
      'Done: a tree row opens a context menu with Copy Name and Copy Relative Path, and the path in the viewer’s title bar is selectable now, with a copy button beside it on hover.',
  },
  {
    user: 'does the copy button work from the keyboard',
    time: '12:58',
    reply:
      'It does. The button is in the tab order right after the path, and it shows itself on focus as well as on hover, so the keyboard gets the same affordance the pointer does.',
    quote: 'it shows itself on focus as well as on hover',
    last: true,
  },
];

export const quotePanelQuotes = [
  {
    text: 'the path in the viewer’s title bar is selectable now',
    comment: 'Selectable, but keep it from being dragged out',
  },
  {
    reference: '@docs/architecture.md',
    text: 'Both a panel and its adjacent content consume that same property',
    comment: 'Does the right sidebar follow this too?',
  },
  {
    reference: '@src/renderer/src/components/files/FileViewer.tsx:265-267',
    comment: 'Use the shared copy button here',
  },
];

// Output mirrors `pigi subagent` (describeCreated in src/cli/pigi.ts).
export const subagentTurns: Turn[] = [
  {
    user: 'have a second session review this before I commit',
    time: '13:02',
    thinking:
      'A fresh session reads the diff without my context, so it will not take my reasons for granted.',
    tool: {
      command:
        'pigi subagent "Review the uncommitted changes against origin/main. Read-only: report bugs and anything that could be simpler, with file:line."',
      output: [
        'pigi: subagent 01a1bb3c ~/.pi/agent/sessions/--Users-me-pigi--/01a1bb3c.jsonl (deepseek/deepseek-v4.1-flash, thinking max)',
        '1. FileViewer.tsx:265 — after a click the button still says "Copy path";',
        '   the copied state is only a changed icon.',
        '2. useCopyFeedback.ts:14 — the reset timer is not cleared on unmount.',
      ],
      duration: '2m 14s',
    },
    reply:
      'Both findings are real. The copied state is announced now, and the timer is cleared when the viewer unmounts; the tests pass.',
  },
  {
    user: 'and have one check the changelog entry while you wait',
    time: '13:06',
    tool: {
      command:
        'pigi subagent "Check this branch’s CHANGELOG entry: user-facing, one line per change, no file names."',
      output: [
        'pigi: subagent 01a1bb41 ~/.pi/agent/sessions/--Users-me-pigi--/01a1bb41.jsonl (deepseek/deepseek-v4.1-flash, thinking max)',
      ],
      status: 'running',
      duration: '18s',
    },
    last: true,
  },
];

export const subagentSessionRows: SessionRow[] = [
  { title: COPY_SESSION_TITLE, time: 'now', hasChildren: true, running: true },
  { title: '2 subagents, 1 running', time: 'now', depth: 1, subagentGroup: true },
  { title: 'Review the uncommitted changes against origin/main', time: '4m', depth: 2 },
  { title: 'Check this branch’s CHANGELOG entry', time: 'now', depth: 2, running: true },
  { title: 'Terminal panel resize jank', time: '18m' },
];
