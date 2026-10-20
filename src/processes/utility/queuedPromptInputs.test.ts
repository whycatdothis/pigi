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
    inputs.add('steering', { message: '', attachments: [image] });
    inputs.add('followUp', { message: 'later', attachments: [] });

    const cleared = inputs.clear(() => ({
      steering: ['[Attached 1 image]'],
      followUp: ['later'],
    }));

    expect(cleared).toEqual({
      steering: [{ message: '', attachments: [image] }],
      followUp: [{ message: 'later', attachments: [] }],
    });
  });

  it('drops delivered inputs from the front', () => {
    const inputs = new QueuedPromptInputs();
    inputs.add('steering', { message: 'first', attachments: [image] });
    inputs.add('steering', { message: 'second', attachments: [] });
    inputs.sync({ steering: ['second'], followUp: [] });

    expect(inputs.clear(() => ({ steering: ['second'], followUp: [] })).steering).toEqual([
      { message: 'second', attachments: [] },
    ]);
  });

  it('forgets an input the SDK rejected', () => {
    const inputs = new QueuedPromptInputs();
    const drop = inputs.add('steering', { message: 'rejected', attachments: [] });
    drop();

    expect(inputs.clear(() => ({ steering: [], followUp: [] })).steering).toEqual([]);
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
