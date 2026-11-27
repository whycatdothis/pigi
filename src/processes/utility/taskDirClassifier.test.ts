import { describe, expect, it } from 'vitest';
import { parseVerdicts } from './taskDirClassifier';

describe('parseVerdicts', () => {
  it('parses a bare JSON array', () => {
    expect(parseVerdicts('[{"dir": "/a/b", "p": 0.9}, {"dir": "/c", "p": 0.1}]')).toEqual([
      { dir: '/a/b', p: 0.9 },
      { dir: '/c', p: 0.1 },
    ]);
  });

  it('parses through prose and code fences around the array', () => {
    const text = 'Here are the scores:\n```json\n[{"dir": "/a", "p": 0.7}]\n```\nHope that helps.';
    expect(parseVerdicts(text)).toEqual([{ dir: '/a', p: 0.7 }]);
  });

  it('clamps probabilities into [0, 1]', () => {
    expect(parseVerdicts('[{"dir": "/a", "p": 1.4}, {"dir": "/b", "p": -0.2}]')).toEqual([
      { dir: '/a', p: 1 },
      { dir: '/b', p: 0 },
    ]);
  });

  it('drops malformed entries and keeps the valid ones', () => {
    const text = '[{"dir": "/a", "p": 0.8}, {"dir": 5, "p": 0.9}, {"p": 0.5}, "junk"]';
    expect(parseVerdicts(text)).toEqual([{ dir: '/a', p: 0.8 }]);
  });

  it('returns null when nothing usable came back', () => {
    expect(parseVerdicts('no json here')).toBeNull();
    expect(parseVerdicts('[broken]')).toBeNull();
    expect(parseVerdicts('[]')).toBeNull();
    expect(parseVerdicts('[{"dir": 1, "p": "x"}]')).toBeNull();
  });
});
