import { describe, expect, it } from 'vitest';
import type { PromptAttachment } from '../../shared/ipcContract';
import { QueuedPromptInputs } from './queuedPromptInputs';

const image: PromptAttachment = {
  kind: 'image',
  name: 'a.png',
  mimeType: 'image/png',
  data: 'AA==',
};

describe('QueuedPromptInputs', () => {
  it('hands back the original inputs when the queue is cleared', () => {
    const inputs = new QueuedPromptInputs();
    inputs.add('steering', '[Attached 1 image]', { message: '', attachments: [image] });
    inputs.add('followUp', 'later', { message: 'later', attachments: [] });

    const cleared = inputs.clear(() => ({
      steering: ['[Attached 1 image]'],
      followUp: ['later'],
    }));

    expect(cleared).toEqual({
      steering: [{ message: '', attachments: [image] }],
      followUp: [{ message: 'later', attachments: [] }],
    });
  });

  it('drops delivered inputs by text', () => {
    const inputs = new QueuedPromptInputs();
    inputs.add('steering', 'first', { message: 'first', attachments: [image] });
    inputs.add('steering', 'second', { message: 'second', attachments: [] });
    inputs.sync({ steering: ['second'], followUp: [] });

    expect(inputs.clear(() => ({ steering: ['second'], followUp: [] })).steering).toEqual([
      { message: 'second', attachments: [] },
    ]);
  });

  it('matches delivered inputs by text, not by position', () => {
    const inputs = new QueuedPromptInputs();
    inputs.add('steering', 'first', { message: 'first', attachments: [image] });
    inputs.add('steering', 'second', { message: 'second', attachments: [] });
    inputs.sync({ steering: ['first'], followUp: [] });

    expect(inputs.clear(() => ({ steering: ['first'], followUp: [] })).steering).toEqual([
      { message: 'first', attachments: [image] },
    ]);
  });

  it('falls back to sanitized SDK text for messages queued without a record', () => {
    const inputs = new QueuedPromptInputs();
    inputs.add('steering', 'mine', { message: 'mine', attachments: [image] });
    inputs.sync({ steering: ['from extension', 'mine'], followUp: [] });

    expect(
      inputs.clear(() => ({ steering: ['from extension', 'mine'], followUp: [] })).steering,
    ).toEqual([
      { message: 'from extension', attachments: [] },
      { message: 'mine', attachments: [image] },
    ]);
  });

  it('falls back to sanitized SDK text when out of step', () => {
    const inputs = new QueuedPromptInputs();

    const cleared = inputs.clear(() => ({
      steering: ['look\n\n[Attached files]\n/tmp/a.ts'],
      followUp: [],
    }));

    expect(cleared.steering).toEqual([{ message: 'look', attachments: [] }]);
  });
});
