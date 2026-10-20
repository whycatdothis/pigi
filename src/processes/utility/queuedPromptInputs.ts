/**
 * The SDK queues steering and follow-up messages as built prompt text, so
 * images and the user's original wording are gone by the time the queue is
 * cleared. This keeps each queued message's input in SDK queue order so
 * clearing the queue can hand the input back to the composer.
 */
import type { ClearedQueue, PromptInput } from '../../shared/ipcContract';
import { sanitizeUserPromptForDisplay } from '../../shared/chatAttachments';

export type PromptQueueName = keyof ClearedQueue;

type SdkQueues = Record<PromptQueueName, readonly string[]>;

export class QueuedPromptInputs {
  private queues: ClearedQueue = { steering: [], followUp: [] };

  /**
   * Record an input right before the SDK queues it. Returns a function that
   * drops the record if the SDK rejects the message.
   */
  add(queueName: PromptQueueName, input: PromptInput): () => void {
    this.queues[queueName].push(input);
    return () => {
      const queue = this.queues[queueName];
      const index = queue.indexOf(input);
      if (index !== -1) queue.splice(index, 1);
    };
  }

  /** Drop delivered inputs; the SDK delivers queued messages from the front. */
  sync(sdkQueues: SdkQueues): void {
    for (const queueName of ['steering', 'followUp'] as const) {
      const queue = this.queues[queueName];
      const deliveredCount = queue.length - sdkQueues[queueName].length;
      if (deliveredCount > 0) queue.splice(0, deliveredCount);
    }
  }

  /**
   * Clear the SDK queues and return the original inputs. Falls back to the
   * SDK text when the records are out of step with the SDK queue.
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

function inputsForQueue(recorded: PromptInput[], sdkTexts: readonly string[]): PromptInput[] {
  if (recorded.length === sdkTexts.length) return recorded;
  return sdkTexts.map((text) => ({
    message: sanitizeUserPromptForDisplay(text).text,
    attachments: [],
  }));
}
