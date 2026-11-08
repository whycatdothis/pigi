import { describe, expect, it } from 'vitest';
import type { PiSessionInfo } from '../../../shared/ipcContract';
import { matchSessions } from './sessionLookup';

function session(id: string): PiSessionInfo {
  return {
    path: `/sessions/2026_${id}.jsonl`,
    id,
    cwd: '/repo',
    created: '',
    modified: '',
    messageCount: 0,
    firstMessage: '',
    allMessagesText: '',
  };
}

const sessions = [session('01a1b9cc-6e5c'), session('01a1b9cc-7f00'), session('01a1b9dd-0000')];

describe('matchSessions', () => {
  it('finds a session by file, exact id or unique prefix', () => {
    expect(matchSessions('/sessions/2026_01a1b9dd-0000.jsonl', sessions)).toEqual([sessions[2]]);
    expect(matchSessions('01a1b9cc-6e5c', sessions)).toEqual([sessions[0]]);
    expect(matchSessions('01a1b9d', sessions)).toEqual([sessions[2]]);
  });

  it('returns every match of an ambiguous prefix, each session once', () => {
    expect(matchSessions('01a1b9cc', [...sessions, sessions[0]])).toEqual(sessions.slice(0, 2));
  });

  it('returns nothing for an unknown file or id', () => {
    expect(matchSessions('/sessions/other.jsonl', sessions)).toEqual([]);
    expect(matchSessions('ffff', sessions)).toEqual([]);
  });
});
