# Review: feat/chat-attachments

Base `main` (8858e51), commits c898f50..5b33b6c. `npm run check` and vitest green.

## Should fix

1. **Async attachment build reorders the queue** (`piAgent.ts` `queuePrompt`)
   - Control-port commands run concurrently; prompt/steer/follow_up await `buildPromptContent` before calling the SDK.
   - An image steer followed by a text steer lands in reverse order.
   - Stop during an image build: `clear_queue`/`abort` finish first, then the steer is queued. It is not restored and leaks into the next prompt.
   - Fix: run prompt/steer/follow_up/clear_queue/abort through one promise chain.
2. **`QueuedPromptInputs` aligns with the SDK queue by length only** (`queuedPromptInputs.ts`)
   - The SDK removes delivered messages by text (`indexOf`), and extensions (`sendUserMessage`) push into the same queue unrecorded.
   - Clear can then restore the wrong text or attachments.
   - Fix: reconcile by text.
3. **Drop on the editor may also insert a `file://` URI** (`chatInput/index.tsx`, unverified)
   - ProseMirror's drop falls back to `text/uri-list`.
   - Fix: an `editorProps.handleDrop` that returns `true` when the drop has files.

## Minor

4. `areDuplicateNodes` compares `imageSources`; optimistic and SDK URLs never match, so hydration merge can duplicate a user bubble. Compare counts instead.
5. `ATTACHED_SUMMARY_RE` / `INLINE_FILE_BLOCK_RE` strip matching user-typed text. Tighten them to the generated format.
6. Path-less clipboard files are read fully to base64 before the 256KB limit applies. Check `file.size` first.
7. The sidebar toggle uses Cmd+S (Save convention). shadcn already binds Cmd+B to a separate, unused sidebar state. Unify on Cmd+B.
8. `lucide-react` was added for two folder icons that Tabler already has. The `main.css` comment is wrong: an explicit `stroke={2}` is still thinned.
9. `@ff-labs/fff-node` is pinned to nightly as a prod dependency. Verify it loads from asar-unpacked in packaged builds.
