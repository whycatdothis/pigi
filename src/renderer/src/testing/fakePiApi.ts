/**
 * The one fake the component tests use: the preload bridge.
 *
 * Everything the renderer knows about the outside world arrives through
 * `window.piApi`, so standing in for it is the whole mock. Nothing below this
 * line is faked: the components, the store and the tree library are the real
 * ones.
 */
import { vi } from 'vitest';
import type { EntryTextResult, PiCommand, SessionTree } from '../../../shared/ipcContract';

export interface FakePiApi {
  /** What `get_session_tree` answers with; replace it to simulate a growing session. */
  tree: SessionTree;
  /** What `get_entry_text` answers with, by entry id. */
  entryTexts: Map<string, EntryTextResult>;
  /** Every command the renderer sent, in order. */
  commands: PiCommand[];
  install: () => void;
}

/**
 * Put a fake in place of `window.piApi` and return the switchboard.
 *
 * Commands without an answer throw: a test that reaches for something this fake
 * does not model should say so out loud instead of quietly getting a `undefined`.
 */
export function installFakePiApi(tree: SessionTree): FakePiApi {
  const fake: FakePiApi = {
    tree,
    entryTexts: new Map(),
    commands: [],
    install: (): void => {
      vi.stubGlobal('piApi', { send: handleCommand });
    },
  };

  async function handleCommand(_sessionPath: string, command: PiCommand): Promise<unknown> {
    fake.commands.push(command);
    switch (command.type) {
      case 'get_session_tree':
        return fake.tree;
      case 'get_entry_text':
        return (
          fake.entryTexts.get(command.entryId) ?? {
            success: true,
            text: `text of ${command.entryId}`,
            truncated: false,
          }
        );
      default:
        throw new Error(`the fake piApi has no answer for ${command.type}`);
    }
  }

  fake.install();
  return fake;
}
