/**
 * The CLI surface is a public contract (docs/cli.md §6): removing or renaming a
 * method, param or error code must fail here until the snapshot is updated on
 * purpose.
 */
import { describe, expect, it } from 'vitest';
import {
  REMOTE_METHODS,
  REMOTE_PROTOCOL_VERSION,
  RemoteErrorCode,
  parseRemoteParams,
  splitModelRef,
} from './remoteCommandContract';

describe('remote command contract', () => {
  it('keeps its surface', () => {
    const surface = Object.entries(REMOTE_METHODS).map(([method, spec]) => ({
      method,
      command: spec.command,
      positional: 'positional' in spec ? spec.positional : [],
      params: Object.entries(spec.params).map(
        ([name, param]) =>
          `${name}: ${param.type}${'required' in param && param.required ? '!' : ''}${
            'flag' in param ? ` --${param.flag}` : ''
          }`,
      ),
    }));
    expect({
      protocol: REMOTE_PROTOCOL_VERSION,
      surface,
      errors: RemoteErrorCode,
    }).toMatchSnapshot();
  });

  it('rejects a param the method does not take, naming it', () => {
    const parsed = parseRemoteParams('session.wait', { path: '/s.jsonl', follow: true });

    expect(parsed).toMatchObject({
      ok: false,
      error: { code: RemoteErrorCode.UNSUPPORTED_PARAM, data: { param: 'follow' } },
    });
    expect(parseRemoteParams('session.wait', { path: '/s', constructor: 1 })).toMatchObject({
      ok: false,
      error: { code: RemoteErrorCode.UNSUPPORTED_PARAM, data: { param: 'constructor' } },
    });
  });

  it('checks types, values and required params', () => {
    expect(parseRemoteParams('session.wait', { path: '/s', timeout: '5' }).ok).toBe(false);
    expect(parseRemoteParams('session.create', { thinkingLevel: 'huge' }).ok).toBe(false);
    expect(parseRemoteParams('session.prompt', { path: '/s' }).ok).toBe(false);
    expect(parseRemoteParams('session.wait', { path: '/s', timeout: 5 })).toEqual({
      ok: true,
      params: { path: '/s', timeout: 5 },
    });
  });

  it('splits a model ref at the first slash', () => {
    expect(splitModelRef('openrouter/anthropic/claude')).toEqual({
      provider: 'openrouter',
      modelId: 'anthropic/claude',
    });
    expect(splitModelRef('claude')).toBeNull();
  });
});
