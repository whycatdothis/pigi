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
 * the `?` beside the tree's search field, the session field, a terminal tab.
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
    id: 'terminal',
    label: 'Terminal',
    body: 'A shell in the same window. ⌘J opens a real terminal along the bottom, already in the project the agent is working in: run the test it just broke without leaving the conversation.',
  },
];
