import { describe, expect, it } from 'vitest';
import { parseCliArguments } from './cliArguments';

const context = { cwd: '/repo', env: { PIGI_SESSION: '/sessions/a.jsonl' } };

describe('parseCliArguments', () => {
  it('runs a subagent under the calling session', () => {
    expect(parseCliArguments(['subagent', 'review this', '--thinking', 'high'], context)).toEqual({
      kind: 'call',
      method: 'subagent.run',
      params: { task: 'review this', thinkingLevel: 'high', parent: '/sessions/a.jsonl' },
      json: false,
      stdinParam: null,
    });
  });

  it('asks for --parent outside a pigi session', () => {
    const invocation = parseCliArguments(['subagent', 'x'], { cwd: '/repo', env: {} });

    expect(invocation.kind).toBe('usage_error');
  });

  it('returns at once and asks to be told when the child finishes', () => {
    expect(parseCliArguments(['subagent', 'review this', '--notify'], context)).toMatchObject({
      params: { task: 'review this', notify: true, parent: '/sessions/a.jsonl' },
    });
  });

  it('resolves paths against the working directory and reads - from stdin', () => {
    expect(parseCliArguments(['session', 'prompt', 'a.jsonl', '-'], context)).toMatchObject({
      params: { path: '/repo/a.jsonl', text: '-' },
      stdinParam: 'text',
    });
  });

  it('passes a session id on as it is', () => {
    expect(parseCliArguments(['session', 'abort', '01a1b9cc'], context)).toMatchObject({
      method: 'session.abort',
      params: { path: '01a1b9cc' },
    });
    expect(parseCliArguments(['session', 'status', 'sessions/x'], context)).toMatchObject({
      params: { path: '/repo/sessions/x' },
    });
  });

  it('lists every project or a parent’s children without defaulting the project', () => {
    expect(parseCliArguments(['session', 'list', '--all', '--running'], context)).toMatchObject({
      params: { all: true, running: true },
    });
    const children = parseCliArguments(['session', 'list', '--parent', '01a1'], context);
    expect(children.kind === 'call' && children.params).toEqual({ parent: '01a1' });
  });

  it('defaults the project to the working directory', () => {
    expect(parseCliArguments(['session', 'list', '--json'], context)).toMatchObject({
      method: 'session.list',
      params: { cwd: '/repo' },
      json: true,
    });
    expect(parseCliArguments(['session', 'create', '--parent-self'], context)).toMatchObject({
      params: { parent: '/sessions/a.jsonl' },
    });
  });

  it('rejects unknown options, bad numbers and unquoted text', () => {
    expect(parseCliArguments(['session', 'wait', 'a', '--follow'], context).kind).toBe(
      'usage_error',
    );
    expect(parseCliArguments(['session', 'wait', 'a', '--timeout', 'x'], context).kind).toBe(
      'usage_error',
    );
    expect(parseCliArguments(['subagent', 'review', 'this'], context).kind).toBe('usage_error');
  });

  it('prints help for no command and per command', () => {
    expect(parseCliArguments([], context).kind).toBe('help');
    const help = parseCliArguments(['subagent', '--help'], context);
    expect(help.kind === 'help' && help.text).toContain('--thinking');
  });
});
