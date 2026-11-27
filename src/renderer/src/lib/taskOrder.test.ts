// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskInfo } from '../../../shared/ipcContract';
import { loadTaskOrder, saveTaskOrder, sortTasksByOrder } from './taskOrder';

function task(path: string): TaskInfo {
  return {
    name: path,
    path,
    workDirs: [],
    suggestedDirs: [],
    activeWorkDir: null,
    dirLog: [],
    hidden: false,
    emoji: null,
  };
}

afterEach(() => localStorage.clear());

describe('sortTasksByOrder', () => {
  it('puts ranked tasks in the stored order', () => {
    const tasks = [task('/t/a'), task('/t/b'), task('/t/c')];
    expect(sortTasksByOrder(tasks, ['/t/c', '/t/a']).map((t) => t.path)).toEqual([
      '/t/c',
      '/t/a',
      '/t/b',
    ]);
  });

  it('appends tasks the order does not know, keeping their given order', () => {
    const tasks = [task('/t/new1'), task('/t/b'), task('/t/new2'), task('/t/a')];
    expect(sortTasksByOrder(tasks, ['/t/b', '/t/a']).map((t) => t.path)).toEqual([
      '/t/b',
      '/t/a',
      '/t/new1',
      '/t/new2',
    ]);
  });

  it('ignores stored paths whose task no longer exists', () => {
    const tasks = [task('/t/a'), task('/t/b')];
    expect(sortTasksByOrder(tasks, ['/t/gone', '/t/b', '/t/a']).map((t) => t.path)).toEqual([
      '/t/b',
      '/t/a',
    ]);
  });
});

describe('task order storage', () => {
  it('round-trips the order through localStorage', () => {
    saveTaskOrder(['/t/b', '/t/a']);
    expect(loadTaskOrder()).toEqual(['/t/b', '/t/a']);
  });

  it('reads corrupt or wrong-shaped data as no order', () => {
    localStorage.setItem('pigi.taskOrder', '{nope');
    expect(loadTaskOrder()).toEqual([]);
    localStorage.setItem('pigi.taskOrder', '["/t/a", 7]');
    expect(loadTaskOrder()).toEqual(['/t/a']);
  });
});
