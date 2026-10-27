import { describe, expect, it } from 'vitest';
import { parkDraftAttachments, takeParkedDraftAttachments } from './chatAttachments';
import type { ChatAttachment } from './chatAttachments';

function image(name: string): ChatAttachment {
  return { id: name, kind: 'image', name, mimeType: 'image/png', size: 4, data: 'AAAA' };
}

describe('parked draft attachments', () => {
  it('hands the same list back to the draft that parked it', () => {
    parkDraftAttachments('session-a', [image('cat.png')]);

    expect(takeParkedDraftAttachments('session-a').map((entry) => entry.name)).toEqual(['cat.png']);
  });

  it('does not hand one draft the attachments of another', () => {
    parkDraftAttachments('session-a', [image('cat.png')]);

    expect(takeParkedDraftAttachments('session-b')).toEqual([]);
    // The slot is consumed either way, so the image cannot resurface later.
    expect(takeParkedDraftAttachments('session-a')).toEqual([]);
  });

  it('parks nothing when the composer was empty', () => {
    parkDraftAttachments('session-a', [image('cat.png')]);
    parkDraftAttachments('session-a', []);

    expect(takeParkedDraftAttachments('session-a')).toEqual([]);
  });
});
