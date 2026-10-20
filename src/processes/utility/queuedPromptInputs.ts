/**
 * The SDK queues steering and follow-up messages as built prompt text, so
 * images and the user's original wording are gone by the time the queue is
 * cleared. This keeps each queued message's input next to the text the SDK
 * actually queued, and matches the two by text: the SDK removes delivered
 * messages by text, and extensions can push into the same queues without
 * being recorded here.
 */
import type { ClearedQueue, PromptInput } from '../../shared/ipcContract';
import { sanitizeUserPromptForDisplay } from '../../shared/chatAttachments';

export type PromptQueueName = keyof ClearedQueue;

type SdkQueues = Record<PromptQueueName, readonly string[]>;

const QUEUE_NAMES = ['steering', 'followUp'] as const;

interface QueuedInput {
  /** Prompt text exactly as the SDK stores it in its queue. */
  text: string;
  input: PromptInput;
}

export class QueuedPromptInputs {
  private queues: Record<PromptQueueName, QueuedInput[]> = { steering: [], followUp: [] };

  /**
   * Record an input with the text the SDK queued for it. Call this right after
   * the SDK accepts the message, before any other queue command can run.
   */
  add(queueName: PromptQueueName, text: string, input: PromptInput): void {
    this.queues[queueName].push({ text, input });
  }

  /** Keep only the records whose text is still queued in the SDK. */
  sync(sdkQueues: SdkQueues): void {
    for (const queueName of QUEUE_NAMES) {
      this.queues[queueName] = matchRecords(this.queues[queueName], sdkQueues[queueName]);
    }
  }

  /**
   * Clear the SDK queues and return the original inputs in SDK queue order.
   * Text queued without a record (extensions) falls back to the stripped SDK
   * text, since its attachments and original wording are not available.
   */
  clear(clearSdkQueues: () => SdkQueues): ClearedQueue {
    const recorded = this.queues;
    this.queues = { steering: [], followUp: [] };
    const sdkQueues = clearSdkQueues();
    return {
      steering: inputsForQueue(recorded.steering, sdkQueues.steering),
      followUp: inputsForQueue(recorded.followUp, sdkQueues.followUp),
    };
  }
}

/**
 * Return the first text present only in `after`, comparing as multisets so a
 * message delivered during the call does not hide the appended one. Callers
 * must snapshot `before`: the SDK queue getters return the live array that
 * steer/followUp mutate in place.
 */
export function firstAppendedQueueText(
  before: readonly string[],
  after: readonly string[],
): string | null {
  const remaining = [...before];
  for (const text of after) {
    const index = remaining.indexOf(text);
    if (index === -1) return text;
    remaining.splice(index, 1);
  }
  return null;
}

function matchRecords(records: QueuedInput[], sdkTexts: readonly string[]): QueuedInput[] {
  const unmatched = [...records];
  const matched: QueuedInput[] = [];
  for (const text of sdkTexts) {
    const index = unmatched.findIndex((record) => record.text === text);
    if (index !== -1) matched.push(unmatched.splice(index, 1)[0]);
  }
  return matched;
}

function inputsForQueue(records: QueuedInput[], sdkTexts: readonly string[]): PromptInput[] {
  const unmatched = [...records];
  return sdkTexts.map((text) => {
    const index = unmatched.findIndex((record) => record.text === text);
    if (index !== -1) return unmatched.splice(index, 1)[0].input;
    return { message: sanitizeUserPromptForDisplay(text).text, attachments: [] };
  });
}
