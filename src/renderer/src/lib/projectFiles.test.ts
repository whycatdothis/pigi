import { describe, expect, it } from 'vitest';
import { rankProjectFiles } from './projectFiles';

const files = ['src/main.ts', 'src/renderer/main.tsx', 'src/renderer/app.tsx', 'package.json'];

describe('rankProjectFiles', () => {
  it('shows the first paths for an empty query', () => {
    expect(rankProjectFiles(files, '')).toEqual(files.slice(0, 20));
  });

  it('ranks paths matching the query', () => {
    expect(rankProjectFiles(files, 'renderer app')).toEqual(['src/renderer/app.tsx']);
  });

  it('returns no matches for unrelated queries', () => {
    expect(rankProjectFiles(files, 'zzzzzz')).toEqual([]);
  });
});
