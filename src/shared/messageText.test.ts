import { describe, expect, it } from 'vitest';
import { latestAssistantActivity } from './messageText';

function assistant(...content: object[]): object {
  return { role: 'assistant', content };
}

describe('latestAssistantActivity', () => {
  it('takes the newest tool call and the newest text, from different messages if need be', () => {
    const messages = [
      assistant(
        { type: 'text', text: 'Looking.' },
        { type: 'toolCall', name: 'read', arguments: { path: 'a' } },
      ),
      { role: 'toolResult', content: [{ type: 'text', text: 'file body' }] },
      assistant({ type: 'toolCall', name: 'bash', arguments: { command: 'npm test' } }),
    ];

    expect(latestAssistantActivity(messages)).toEqual({
      lastToolCall: { name: 'bash', arguments: { command: 'npm test' } },
      lastText: 'Looking.',
    });
  });

  it('is empty before any assistant message', () => {
    expect(latestAssistantActivity([{ role: 'user', content: 'hi' }])).toEqual({
      lastToolCall: null,
      lastText: '',
    });
  });
});
