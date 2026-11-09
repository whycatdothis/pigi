/**
 * The tour, one entry per step.
 *
 * Each step is a name, a paragraph and the window it shows (the window itself is
 * `FeatureTour.astro`, because each one is a different shape: a slash menu, three
 * densities, a dialog, a terminal). The order here is the order of the chips and
 * of the windows, and the three are addressed by index.
 *
 * `label` is the headline of its step, not an eyebrow above one. The paragraph
 * under it opens with the line the section used to set in 30px type: a name says
 * what a feature is, and a sentence like "It is the pi you already have" only says
 * it again, so the sentence became the paragraph's first line and the name became
 * the thing set large.
 *
 * The paragraphs carry the one thing a still cannot say — what to click. Each ends
 * on the affordance the still actually answers to: the filter menu, a minimap bar,
 * the `?` beside the tree's search field, the session field, Preview and Source,
 * the Quote button, a terminal tab, the Packages tabs, the Appearance controls.
 */
export interface FeatureStep {
  /** Ties a chip, its paragraph and its window together. */
  id: string;
  /** The step's headline. */
  label: string;
  /**
   * The paragraph, with the page's own inline markup where a UI glyph is quoted
   * (`?`). Rendered with `set:html`; it is this file's copy, not input.
   */
  body: string;
}

export const FEATURE_STEPS: readonly FeatureStep[] = [
  {
    id: 'pi',
    label: 'Your pi, unchanged',
    body: 'It is the pi you already have. Models, skills, extensions and sessions are the ones already on the machine, read from pi’s own configuration and session directory — no import step, no second setup, nothing to keep in sync.',
  },
  {
    id: 'views',
    label: 'View modes',
    body: 'One transcript, three densities. Minimal keeps the timer and the answer, Compact folds consecutive read-only calls into one line, and Show All is the native pi log — pick one from the filter menu and the same turn is drawn three ways.',
  },
  {
    id: 'switch',
    label: 'Instant session switch',
    body: 'A long session is not a loading screen. Sessions open as fast as the window does, parsed in their own process and drawn as a windowed list that measures a row once — and the minimap takes you anywhere in it.',
  },
  {
    id: 'fork',
    label: 'Fork',
    body: 'Branch off any message. Forking copies the conversation up to that point into a chat of its own, with the same model and thinking level; the original stays where it was, and the fork is listed beneath it.',
  },
  {
    id: 'tree',
    label: 'Tree',
    body: 'Rewind without losing what you had. Going back moves the session — nothing is deleted and nothing has to be summarised, every branch is still in the tree, and the <span class="font-mono text-[13px]">?</span> beside its search field says what a jump really does.',
  },
  {
    id: 'switcher',
    label: 'Session switcher',
    body: 'Every session is one line away. One field over all of pigi — every session, in every project, on Ctrl + R — and the letters you typed are marked in the titles, so you can see why a row is there.',
  },
  {
    id: 'files',
    label: 'Files',
    body: 'The project beside the conversation. ⌘2 opens its tree with each file’s own icon, ⌘P finds a file by name, and a file opens as highlighted source with line numbers or, for markdown, as the rendered page. A path in a reply is a link that opens here, at the lines it names — switch the still between Preview and Source.',
  },
  {
    id: 'git',
    label: 'Git',
    body: 'Review what the agent changed without leaving it. ⌘3 shows the staged and unstaged files, a diff against main or any ref, the last commit, and the commit list. Diffs are highlighted with the changed words marked, unified or side by side, and follow the agent as it edits.',
  },
  {
    id: 'quote',
    label: 'Quote',
    body: 'Point at the exact words. Select text in a reply, a file or a diff and press Q: the passage goes to the quotes panel with your comment, and from a file with its path and lines. Collect a few, add a global comment, send them as one message — press Quote in the still to add the selection.',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    body: 'A shell in the same window. ⌘J opens a real terminal along the bottom, already in the project the agent is working in: run the test it just broke without leaving the conversation.',
  },
  {
    id: 'subagents',
    label: 'Subagents',
    body: 'Hand a task to a second session. Agents inside pigi get a <span class="font-mono text-[13px]">pigi</span> command: <span class="font-mono text-[13px]">pigi subagent "…"</span> runs the task in a fresh child session with the same model and prints its reply back — a review of the diff before you commit, say. Children gather in one row under their parent, so you can open one and watch it work.',
  },
  {
    id: 'packages',
    label: 'Packages',
    body: 'Extensions without the terminal. Packages lists the pi packages you have — extensions, skills, prompts and themes — with updates and removal in place, and the Marketplace searches the pi catalog with each package’s README. An install reaches open sessions without a restart. Switch between the two tabs in the still.',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    body: 'Light, dark or the system’s, named themes from GitHub to Catppuccin, eight accents, your own colours with a contrast floor, fonts and code themes. The still is live: pick a mode, a theme or an accent and this whole page follows, coloured by the app’s own code.',
  },
];
