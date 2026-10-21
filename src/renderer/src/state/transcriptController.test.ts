import { describe, expect, it } from 'vitest';
import { TranscriptController } from './transcriptController';

function imageOnlyUserStart(): unknown {
  return {
    type: 'message_start',
    message: {
      role: 'user',
      timestamp: Date.now(),
      content: [
        { type: 'text', text: '[Attached 1 image]' },
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      ],
    },
  };
}

function userNodeCount(controller: TranscriptController): number {
  return controller.state.nodes.filter((node) => node.role === 'user').length;
}

describe('TranscriptController user message echo', () => {
  it('shows every echoed steer, even with the same text', () => {
    const controller = new TranscriptController();
    controller.processEvent(imageOnlyUserStart());
    controller.processEvent(imageOnlyUserStart());
    expect(userNodeCount(controller)).toBe(2);
  });

  it('does not duplicate an optimistic message when its echo arrives', () => {
    const controller = new TranscriptController();
    controller.addUserMessage('[Attached 1 image]', {
      imageSources: ['data:image/png;base64,AAAA'],
    });
    controller.processEvent(imageOnlyUserStart());
    controller.processEvent(imageOnlyUserStart());
    expect(userNodeCount(controller)).toBe(2);
  });
});
