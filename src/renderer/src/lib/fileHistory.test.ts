import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILE_HISTORY,
  addFileVisit,
  moveInFileHistory,
  type FileHistory,
  type FileVisit,
} from './fileHistory';

function visit(filePath: string, line?: number): FileVisit {
  return { filePath, lines: line === undefined ? null : { start: line, end: line } };
}

function record(...visits: FileVisit[]): FileHistory {
  return visits.reduce(addFileVisit, EMPTY_FILE_HISTORY);
}

describe('file history', () => {
  it('returns from a jump to the line it started at', () => {
    // Opened from the tree, then a jump from line 200 to another file.
    const history = record(visit('a.ts'), visit('a.ts', 200), visit('b.ts', 40));
    expect(history.visits).toEqual([visit('a.ts', 200), visit('b.ts', 40)]);
    const back = moveInFileHistory(history, -1);
    expect(back && back.visits[back.index]).toEqual(visit('a.ts', 200));
  });

  it('keeps both ends of a jump inside one file', () => {
    expect(record(visit('a.ts'), visit('a.ts', 200), visit('a.ts', 10)).visits).toEqual([
      visit('a.ts', 200),
      visit('a.ts', 10),
    ]);
  });

  it('adds nothing for the file already on screen', () => {
    const history = record(visit('a.ts', 5));
    expect(addFileVisit(history, visit('a.ts'))).toBe(history);
    expect(addFileVisit(history, visit('a.ts', 5))).toBe(history);
  });

  it('drops the forward visits on a new one', () => {
    const back = moveInFileHistory(record(visit('a.ts'), visit('b.ts'), visit('c.ts')), -1);
    expect(back && addFileVisit(back, visit('d.ts')).visits).toEqual([
      visit('a.ts'),
      visit('b.ts'),
      visit('d.ts'),
    ]);
  });

  it('stops at either end and keeps the last 50', () => {
    expect(moveInFileHistory(record(visit('a.ts')), -1)).toBeNull();
    expect(moveInFileHistory(record(visit('a.ts')), 1)).toBeNull();
    const long = record(...Array.from({ length: 60 }, (_, index) => visit(`${index}.ts`)));
    expect(long.visits).toHaveLength(50);
    expect(long.visits[0]).toEqual(visit('10.ts'));
    expect(long.index).toBe(49);
  });
});
