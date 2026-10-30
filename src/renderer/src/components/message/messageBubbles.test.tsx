// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '../../testing/jsdomSetup';
import { SystemBubble } from './messageBubbles';
import type { SystemNode } from '../../state/transcriptController';

afterEach(cleanup);

/** What pi-peer hands the SDK: a header the model needs, the peer's text, and
 *  the authority boilerplate. Nothing is stripped out of it. */
const PEER_CONTENT = [
  'Message from pi session pigi (/Users/mingxin/Programs/pigi):',
  '',
  'main moved; rebase **before** you push.',
  '',
  'This came from another pi session, not from the user.',
  'Reply with message_peer({ to: "pigi", message: "..." }) if a reply is useful.',
].join('\n');

const IMAGE_SOURCE = 'data:image/png;base64,iVBORw0KGgo=';

function customNode(overrides: Partial<SystemNode> = {}): SystemNode {
  return {
    id: 'system-1',
    role: 'system',
    kind: 'custom',
    text: 'pi-peer',
    detail: PEER_CONTENT,
    isLoading: false,
    ...overrides,
  };
}

function renderCard(node: SystemNode): HTMLElement {
  render(<SystemBubble node={node} searchQuery="" activeOccurrenceIndex={null} />);
  return screen.getByTestId('custom-message');
}

test('a custom message is headed by its type and keeps the content it was sent', () => {
  const card = renderCard(customNode());

  expect(card.textContent).toContain('pi-peer');
  // The full delivery survives: header, body, and the boilerplate the model needs.
  expect(card.textContent).toContain('Message from pi session pigi');
  expect(card.textContent).toContain('This came from another pi session');
});

test('the content is rendered as markdown, since extensions send it that way', () => {
  const card = renderCard(customNode());

  expect(card.querySelector('strong')?.textContent).toBe('before');
  expect(card.textContent).not.toContain('**before**');
});

test('images ride along as thumbnails, as they do on a user message', () => {
  renderCard(customNode({ detail: undefined, imageSources: [IMAGE_SOURCE] }));

  expect(screen.getByAltText('Attached image').getAttribute('src')).toBe(IMAGE_SOURCE);
});
