// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetSubagentNotice,
  pendingSubagentNotices,
  rememberSubagentNotice,
  subagentNoticeText,
  type PendingSubagentNotice,
} from './subagentNotices';

const notice: PendingSubagentNotice = {
  childPath: '/sessions/child.jsonl',
  childId: '0199c1d2-0000-7000-8000-000000000001',
  parentPath: '/sessions/parent.jsonl',
  title: 'Review the diff',
};

beforeEach(() => {
  localStorage.clear();
});

describe('subagent notices', () => {
  it('keep one notice per child across a reload', () => {
    rememberSubagentNotice(notice);
    rememberSubagentNotice({ ...notice, title: 'Review the diff again' });
    rememberSubagentNotice({ ...notice, childPath: '/sessions/other.jsonl' });

    expect(pendingSubagentNotices().map((pending) => pending.title)).toEqual([
      'Review the diff again',
      'Review the diff',
    ]);

    forgetSubagentNotice(notice.childPath);
    expect(pendingSubagentNotices()).toHaveLength(1);
    forgetSubagentNotice('/sessions/other.jsonl');
    expect(localStorage.getItem('pigi.pendingSubagentNotices')).toBeNull();
  });

  it('drops stored entries that are not notices', () => {
    localStorage.setItem('pigi.pendingSubagentNotices', JSON.stringify([{ title: 'x' }, notice]));
    expect(pendingSubagentNotices()).toEqual([notice]);
    localStorage.setItem('pigi.pendingSubagentNotices', 'not json');
    expect(pendingSubagentNotices()).toEqual([]);
  });

  it('names the child and the command that reads its reply', () => {
    const text = subagentNoticeText(notice, { failure: null, readable: true });

    expect(text).toContain('pigi: subagent 0199c1d2-0000-7000-8000-000000000001');
    expect(text).toContain('("Review the diff") finished');
    expect(text).toContain('pigi session wait 0199c1d2-0000-7000-8000-000000000001');
    // The reply is never inlined, which is the point of the notice.
    expect(text.length).toBeLessThan(300);
  });

  it('says how it failed, on one line, clipped', () => {
    const text = subagentNoticeText(
      { ...notice, title: 'Review the diff, then review it again. '.repeat(10) },
      { failure: 'session aborted\nby the user', readable: true },
    );

    expect(text).toContain('failed: session aborted by the user.');
    expect(text).toContain('…');
    expect(text.split('\n')).toHaveLength(1);
  });

  it('does not send the parent to read a reply that was never written', () => {
    const text = subagentNoticeText(notice, { failure: 'it produced no reply', readable: false });

    expect(text).toContain('failed: it produced no reply');
    expect(text).not.toContain('pigi session wait');
  });
});
