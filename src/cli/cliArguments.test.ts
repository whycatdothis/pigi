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

  it('resolves paths against the working directory and reads - from stdin', () => {
    expect(parseCliArguments(['session', 'prompt', 'a.jsonl', '-'], context)).toMatchObject({
      params: { path: '/repo/a.jsonl', text: '-' },
      stdinParam: 'text',
    });
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
