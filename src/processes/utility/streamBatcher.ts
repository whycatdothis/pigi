import type { WriteToolInput } from '@earendil-works/pi-coding-agent';
import type { StreamBatch, StreamBatchToolArgs } from '../../shared/ipcContract';

// Compatible with Electron's MessagePortMain.
export interface Port {
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
  on(event: 'message', listener: (messageEvent: { data: unknown }) => void): unknown;
}

/**
 * Coalesces streaming updates into one batch per interval, and sends only what
 * the renderer has not seen: text arrives as deltas already, but a tool's output
 * and a `write`'s content are cumulative snapshots, and re-sending them whole
 * copies the same kilobytes tens of times a second.
 */
export class StreamBatcher {
  private static readonly MIN_INTERVAL_MS = 8;
  private batch: StreamBatch = { type: 'stream_batch' };
  private dirty = false;
  private scheduled = false;
  private lastFlushAt = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private port: Port | null = null;
  /** What the renderer has already been given, per tool call, so a batch can carry the tail. */
  private sentToolOutput = new Map<string, string>();
  private sentWriteArgs = new Map<string, { path?: string; content: string }>();

  start(port: Port): void {
    this.port = port;
  }

  stop(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  appendText(delta: string): void {
    this.batch.text = (this.batch.text || '') + delta;
    this.markDirty();
  }

  appendThinking(delta: string): void {
    this.batch.thinking = (this.batch.thinking || '') + delta;
    this.markDirty();
  }

  setToolOutput(id: string, output: string): void {
    const previous = this.sentToolOutput.get(id) ?? '';
    this.sentToolOutput.set(id, output);
    // A tool's output is cumulative; a snapshot that extends the last one only
    // needs its tail. A truncated snapshot (bash keeps head and tail) is not an
    // extension and replaces the whole value, as before. Only the newest value
    // travels per tool call, so the two fields never disagree in one batch.
    if (output.startsWith(previous)) {
      if (this.batch.toolOutput) delete this.batch.toolOutput[id];
      if (!this.batch.toolOutputDelta) this.batch.toolOutputDelta = {};
      this.batch.toolOutputDelta[id] =
        (this.batch.toolOutputDelta[id] ?? '') + output.slice(previous.length);
    } else {
      if (this.batch.toolOutputDelta) delete this.batch.toolOutputDelta[id];
      if (!this.batch.toolOutput) this.batch.toolOutput = {};
      this.batch.toolOutput[id] = output;
    }
    this.markDirty();
  }

  /** A streaming `write`: the content only ever grows, so only the tail is sent. */
  setWriteArgs(toolCallId: string, args: Partial<WriteToolInput>): void {
    const content = typeof args.content === 'string' ? args.content : '';
    const previous = this.sentWriteArgs.get(toolCallId);
    const path = args.path ?? previous?.path;
    this.sentWriteArgs.set(toolCallId, { path, content });
    if (
      previous !== undefined &&
      path === previous.path &&
      content.length > previous.content.length &&
      content.startsWith(previous.content)
    ) {
      if (this.batch.toolArgs) delete this.batch.toolArgs[toolCallId];
      if (!this.batch.toolArgsContentDelta) this.batch.toolArgsContentDelta = {};
      this.batch.toolArgsContentDelta[toolCallId] =
        (this.batch.toolArgsContentDelta[toolCallId] ?? '') +
        content.slice(previous.content.length);
      this.markDirty();
      return;
    }
    if (previous !== undefined && path === previous.path && content === previous.content) return;
    if (this.batch.toolArgsContentDelta) delete this.batch.toolArgsContentDelta[toolCallId];
    this.setToolArgs(toolCallId, { name: 'write', args: { path, content } });
  }

  setToolDetails(toolCallId: string, details: Record<string, unknown>): void {
    if (!this.batch.toolDetails) this.batch.toolDetails = {};
    this.batch.toolDetails[toolCallId] = details;
    this.markDirty();
  }

  setToolArgs(toolCallId: string, entry: StreamBatchToolArgs): void {
    if (!this.batch.toolArgs) this.batch.toolArgs = {};
    this.batch.toolArgs[toolCallId] = entry;
    this.markDirty();
  }

  /** The tool finished; its result travels as an event, so drop what it sent. */
  forgetTool(toolCallId: string): void {
    this.sentToolOutput.delete(toolCallId);
    this.sentWriteArgs.delete(toolCallId);
  }

  /** Call before any push event so buffered deltas reach the renderer first. */
  flushNow(): void {
    this.flush();
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.scheduled) return;
    this.scheduled = true;

    const elapsed = performance.now() - this.lastFlushAt;
    const delay = Math.max(1, StreamBatcher.MIN_INTERVAL_MS - elapsed);
    this.flushTimer = setTimeout(() => this.flush(), delay);
  }

  private flush(): void {
    this.scheduled = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.dirty || !this.port) return;
    this.lastFlushAt = performance.now();
    this.port.postMessage(this.batch);
    this.batch = { type: 'stream_batch' };
    this.dirty = false;
  }
}
