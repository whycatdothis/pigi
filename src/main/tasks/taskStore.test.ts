import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTask,
  listTasks,
  replaceWorkDirsBlock,
  reportTaskDirs,
  updateTask,
} from './taskStore';

let root: string;
let workA: string;
let workB: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pigi-tasks-'));
  workA = mkdtempSync(join(tmpdir(), 'pigi-work-a-'));
  workB = mkdtempSync(join(tmpdir(), 'pigi-work-b-'));
});

afterEach(() => {
  for (const dir of [root, workA, workB]) rmSync(dir, { recursive: true, force: true });
});

describe('createTask', () => {
  it('creates the directory layout and reads back through listTasks', async () => {
    const task = await createTask('task-foo', root);

    expect(task).toMatchObject({
      name: 'task-foo',
      path: join(root, 'task-foo'),
      workDirs: [],
      suggestedDirs: [],
      activeWorkDir: null,
    });
    expect(readFileSync(join(task.path, '.gitignore'), 'utf8')).toBe('.pigi/\n');
    const agents = readFileSync(join(task.path, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('pigi:workdirs:start');
    expect(agents).toContain('(none yet');
    expect(await listTasks(root)).toEqual([task]);
  });

  it('rejects duplicates case-insensitively and bad names', async () => {
    await createTask('Task-Foo', root);
    await expect(createTask('task-foo', root)).rejects.toThrow('already exists');
    await expect(createTask('a/b', root)).rejects.toThrow('Task names');
    await expect(createTask('.hidden', root)).rejects.toThrow('Task names');
    await expect(createTask('', root)).rejects.toThrow('Task names');
  });

  it('creates directories with spaces and CJK names verbatim', async () => {
    const task = await createTask('订正 数据', root);
    expect(task.path).toBe(join(root, '订正 数据'));
    expect(task.name).toBe('订正 数据');
    const names = (await listTasks(root)).map((listed) => listed.name);
    expect(names).toContain('订正 数据');
    await expect(createTask('订正 数据', root)).rejects.toThrow('already exists');
  });

  it('two creates racing the same name produce exactly one task', async () => {
    // Both name checks resolve before either mkdir starts, so the loser's
    // non-recursive mkdir is what stops it — with the friendly error, and
    // without opening the winner's directory.
    const results = await Promise.allSettled([
      createTask('task-race', root),
      createTask('task-race', root),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(Error);
    expect(String(rejected[0].reason)).toMatch('already exists');

    const listed = await listTasks(root);
    expect(listed.map((task) => task.name)).toEqual(['task-race']);
  });
});

describe('listTasks', () => {
  it('reads a corrupt task.json as an empty config instead of failing', async () => {
    const taskPath = join(root, 'broken');
    mkdirSync(join(taskPath, '.pigi'), { recursive: true });
    writeFileSync(join(taskPath, '.pigi', 'task.json'), '{ nope', 'utf8');

    const tasks = await listTasks(root);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ name: 'broken', workDirs: [], activeWorkDir: null });
  });
});

describe('updateTask', () => {
  it('adds, removes with a tombstone, and rewrites only the managed AGENTS.md block', async () => {
    const task = await createTask('task-foo', root);
    writeFileSync(
      join(task.path, 'AGENTS.md'),
      `# My notes\n\n<!-- pigi:workdirs:start -->\nSTALE-ENTRY\n<!-- pigi:workdirs:end -->\n\nkeep this\n`,
      'utf8',
    );

    const added = await updateTask(
      task.path,
      { addWorkDirs: [workA, `${workB}/`], setActiveWorkDir: workA },
      root,
    );
    expect(added.workDirs).toEqual([workA, workB]);
    expect(added.activeWorkDir).toBe(workA);

    const agents = readFileSync(join(task.path, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('# My notes');
    expect(agents).toContain('keep this');
    expect(agents).toContain(`- ${workA}`);
    expect(agents).not.toContain('STALE-ENTRY');

    const removed = await updateTask(task.path, { removeWorkDirs: [workA] }, root);
    expect(removed.workDirs).toEqual([workB]);
    expect(removed.activeWorkDir).toBeNull();

    // The tombstone keeps reports from resurrecting the removed dir.
    const reported = await reportTaskDirs(task.path, [workA], 'prompt', root);
    expect(reported.workDirs).toEqual([workB]);

    // An explicit re-add clears the tombstone.
    const reAdded = await updateTask(task.path, { addWorkDirs: [workA] }, root);
    expect(reAdded.workDirs).toEqual([workB, workA]);
  });

  it('rejects paths that do not exist and non-workdir active dirs', async () => {
    const task = await createTask('task-foo', root);
    await expect(
      updateTask(task.path, { addWorkDirs: [join(root, 'missing')] }, root),
    ).rejects.toThrow('does not exist');
    await expect(updateTask(task.path, { setActiveWorkDir: workA }, root)).rejects.toThrow(
      'one of the working directories',
    );
    await expect(updateTask(task.path, { addWorkDirs: [task.path] }, root)).rejects.toThrow(
      'task directory itself',
    );
  });

  it('dismissing a suggestion tombstones it', async () => {
    const task = await createTask('task-foo', root);
    const suggested = await reportTaskDirs(task.path, [workA], 'tool', root);
    expect(suggested.suggestedDirs).toEqual([workA]);

    const dismissed = await updateTask(task.path, { ignoreSuggestedDirs: [workA] }, root);
    expect(dismissed.suggestedDirs).toEqual([]);

    const again = await reportTaskDirs(task.path, [workA], 'tool', root);
    expect(again.suggestedDirs).toEqual([]);
  });

  it('refuses directories outside the tasks root', async () => {
    await expect(updateTask(workA, { addWorkDirs: [workB] }, root)).rejects.toThrow(
      'Not a task directory',
    );
  });

  it('leaves AGENTS.md alone when the work dirs did not change', async () => {
    const task = await createTask('task-foo', root);
    await updateTask(task.path, { addWorkDirs: [workA] }, root);
    // The user takes the file over; a rewrite would re-append the managed block.
    writeFileSync(join(task.path, 'AGENTS.md'), '# my own notes\n', 'utf8');

    await updateTask(task.path, { renameTo: 'renamed', setHidden: true, setEmoji: '🐛' }, root);

    expect(readFileSync(join(task.path, 'AGENTS.md'), 'utf8')).toBe('# my own notes\n');
  });

  it('does not recreate a deleted AGENTS.md until the work dirs change', async () => {
    const task = await createTask('task-foo', root);
    rmSync(join(task.path, 'AGENTS.md'));

    await updateTask(task.path, { setEmoji: '🐛' }, root);
    expect(existsSync(join(task.path, 'AGENTS.md'))).toBe(false);

    await updateTask(task.path, { addWorkDirs: [workA] }, root);
    expect(readFileSync(join(task.path, 'AGENTS.md'), 'utf8')).toContain(`- ${workA}`);
  });

  it('renames the display name without moving the directory', async () => {
    const task = await createTask('task-foo', root);

    const renamed = await updateTask(task.path, { renameTo: 'roadmap 二期 🚀' }, root);
    expect(renamed.name).toBe('roadmap 二期 🚀');
    expect(renamed.path).toBe(task.path);

    await expect(updateTask(task.path, { renameTo: '.dot' }, root)).rejects.toThrow('Task names');
    await expect(updateTask(task.path, { renameTo: 'a/b' }, root)).rejects.toThrow('Task names');

    // The rename is persisted; the directory name is not.
    const [listed] = await listTasks(root);
    expect(listed.name).toBe('roadmap 二期 🚀');
    expect(listed.path).toBe(task.path);

    // Renaming back to the directory name drops the override.
    const back = await updateTask(task.path, { renameTo: 'task-foo' }, root);
    expect(back.name).toBe('task-foo');
    expect(
      JSON.parse(readFileSync(join(task.path, '.pigi', 'task.json'), 'utf8')),
    ).not.toHaveProperty('name');
  });

  it('rejects renames that collide with another task, in either name', async () => {
    const task = await createTask('task-foo', root);
    const other = await createTask('task-bar', root);
    await updateTask(other.path, { renameTo: 'roadmap' }, root);

    await expect(updateTask(task.path, { renameTo: 'Task-Bar' }, root)).rejects.toThrow(
      'already exists',
    );
    await expect(updateTask(task.path, { renameTo: 'ROADMAP' }, root)).rejects.toThrow(
      'already exists',
    );
    await expect(updateTask(task.path, { renameTo: 'a/b' }, root)).rejects.toThrow('Task names');
    // The current own name and a fresh name pass.
    await expect(updateTask(task.path, { renameTo: 'TASK-FOO' }, root)).resolves.toMatchObject({
      name: 'TASK-FOO',
    });
    await expect(createTask('task-foo-2', root)).resolves.toBeTruthy();
    await expect(createTask('roadmap', root)).rejects.toThrow('already exists');
  });

  it('hides and emotes a task, persisting both', async () => {
    const task = await createTask('task-foo', root);
    expect(task.hidden).toBe(false);
    expect(task.emoji).toBeNull();

    const hidden = await updateTask(task.path, { setHidden: true, setEmoji: '🚀' }, root);
    expect(hidden.hidden).toBe(true);
    expect(hidden.emoji).toBe('🚀');

    const [listed] = await listTasks(root);
    expect(listed.hidden).toBe(true);
    expect(listed.emoji).toBe('🚀');

    const cleared = await updateTask(task.path, { setHidden: false, setEmoji: null }, root);
    expect(cleared.hidden).toBe(false);
    expect(cleared.emoji).toBeNull();
  });
});

describe('reportTaskDirs', () => {
  it('adds prompt-mentioned dirs outright, resolving files to their parent', async () => {
    const task = await createTask('task-foo', root);
    writeFileSync(join(workA, 'file.ts'), '', 'utf8');

    const updated = await reportTaskDirs(task.path, [join(workA, 'file.ts')], 'prompt', root);
    expect(updated.workDirs).toEqual([workA]);
    const agents = readFileSync(join(task.path, 'AGENTS.md'), 'utf8');
    expect(agents).toContain(`- ${workA}`);
  });

  it('suggests tool-touched dirs without adding them, skipping listed and nested ones', async () => {
    const task = await createTask('task-foo', root);
    await updateTask(task.path, { addWorkDirs: [workA] }, root);
    mkdirSync(join(workA, 'src'));

    const updated = await reportTaskDirs(
      task.path,
      [workA, join(workA, 'src'), workB],
      'tool',
      root,
    );
    expect(updated.workDirs).toEqual([workA]);
    expect(updated.suggestedDirs).toEqual([workB]);
  });

  it('a prompt-mentioned parent swallows listed children', async () => {
    const task = await createTask('task-foo', root);
    const child = join(workA, 'child');
    mkdirSync(child);
    await updateTask(task.path, { addWorkDirs: [child], setActiveWorkDir: child }, root);

    const updated = await reportTaskDirs(task.path, [workA], 'prompt', root);
    expect(updated.workDirs).toEqual([workA]);
    expect(updated.activeWorkDir).toBe(workA);
  });
});

describe('dirLog', () => {
  it('records directory-list changes with action and source, newest last', async () => {
    const task = await createTask('task-foo', root);
    const workC = mkdtempSync(join(tmpdir(), 'pigi-work-c-'));
    const suggested = join(workA, 'sub');
    mkdirSync(suggested);

    await updateTask(task.path, { addWorkDirs: [workA] }, root);
    await reportTaskDirs(task.path, [workB], 'prompt', root);
    await reportTaskDirs(task.path, [workC], 'model', root);
    await reportTaskDirs(task.path, [suggested], 'tool', root);
    await updateTask(task.path, { ignoreSuggestedDirs: [suggested] }, root);
    await updateTask(task.path, { removeWorkDirs: [workA] }, root);

    const [listed] = await listTasks(root);
    const events = listed.dirLog.map(({ dir, action, source }) => ({ dir, action, source }));
    expect(events).toEqual([
      { dir: workA, action: 'added', source: 'manual' },
      { dir: workB, action: 'added', source: 'prompt' },
      { dir: workC, action: 'added', source: 'model' },
      { dir: suggested, action: 'dismissed', source: 'manual' },
      { dir: workA, action: 'removed', source: 'manual' },
    ]);
    rmSync(workC, { recursive: true, force: true });
  });

  it('caps the log at fifty entries, keeping the newest', async () => {
    const task = await createTask('task-foo', root);
    for (let i = 0; i < 55; i++) {
      await updateTask(task.path, { addWorkDirs: [workA] }, root);
    }
    const [listed] = await listTasks(root);
    expect(listed.dirLog).toHaveLength(50);
  });

  it('drops malformed log entries but keeps the rest of the file readable', async () => {
    const taskPath = join(root, 'logged');
    mkdirSync(join(taskPath, '.pigi'), { recursive: true });
    writeFileSync(
      join(taskPath, '.pigi', 'task.json'),
      JSON.stringify({
        workDirs: [],
        removedDirs: [],
        suggestedDirs: [],
        activeWorkDir: null,
        dirLog: [
          { dir: '/ok', action: 'added', source: 'manual', at: 1 },
          { dir: '/bad-action', action: 'exploded', source: 'manual', at: 2 },
          { dir: '/bad-source', action: 'added', source: 'ghost', at: 3 },
          { dir: 42, action: 'added', source: 'manual', at: 4 },
          'junk',
        ],
      }),
      'utf8',
    );

    const [listed] = await listTasks(root);
    expect(listed.dirLog).toEqual([{ dir: '/ok', action: 'added', source: 'manual', at: 1 }]);
  });
});

describe('replaceWorkDirsBlock', () => {
  it('replaces between markers and appends when they are gone', () => {
    const withMarkers =
      'before\n<!-- pigi:workdirs:start -->\nx\n<!-- pigi:workdirs:end -->\nafter\n';
    const replaced = replaceWorkDirsBlock(withMarkers, ['/a']);
    expect(replaced).toBe(
      'before\n<!-- pigi:workdirs:start -->\n- /a\n<!-- pigi:workdirs:end -->\nafter\n',
    );

    const appended = replaceWorkDirsBlock('user content\n', ['/a']);
    expect(appended).toContain('user content');
    expect(appended).toContain('- /a');
  });

  it('drops an orphaned end marker instead of appending a new block every sync', () => {
    const orphanEnd = 'notes\n<!-- pigi:workdirs:end -->\n';
    const once = replaceWorkDirsBlock(orphanEnd, ['/a']);
    expect(once).toContain('notes');
    expect(once.match(/pigi:workdirs:start/g)).toHaveLength(1);
    expect(once.match(/pigi:workdirs:end/g)).toHaveLength(1);

    // The next sync replaces in place; before the pairing fix it appended
    // another block each time.
    expect(replaceWorkDirsBlock(once, ['/a'])).toBe(once);
  });

  it('drops an orphaned start marker without swallowing the user content after it', () => {
    const orphanStart = 'notes\n<!-- pigi:workdirs:start -->\nuser list\n';
    const once = replaceWorkDirsBlock(orphanStart, ['/a']);
    expect(once).toContain('user list');

    // Before the fix, this second sync replaced everything between the orphan
    // START and the appended block's END — deleting "user list".
    const twice = replaceWorkDirsBlock(once, ['/a']);
    expect(twice).toBe(once);
    expect(twice).toContain('user list');
  });
});
