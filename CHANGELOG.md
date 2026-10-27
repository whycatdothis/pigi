# Changelog

## [Unreleased]

### Changed

- Small text uses the named type scale everywhere: `text-sm`/`text-xs` were the
  same sizes as `text-body`/`text-caption` under Tailwind's names, and the last
  126 call sites now use the role names, so one size has one name and the check
  rejects the old steps in app code
- Every corner is named by role now: the last `rounded-md`/`lg`/`sm`/`xl` call
  sites (including the shadcn primitives) use the semantic tiers, so a radius no
  longer moves when `--radius` moves, and `npm run check` rejects the scale
  steps and the primitive `--radius-*` variables the way it already rejected
  arbitrary values

### Changed

- pigi's settings have one writer: the main process owns the file, a settings
  change sends only the slice it edited, and every window receives the merged
  snapshot, so the main window and the update window can no longer overwrite
  each other's writes. The file carries a monotonic revision, so a late write
  cannot win, and the last change is flushed synchronously on quit

### Fixed

- Closing the minimap list by moving the pointer away no longer flashes the whole list for one frame before it disappears: the exit animation holds its final invisible values until the list unmounts
- Ordered list items sit at the prose step instead of the tight bulleted-list gap, so a numbered list of one- or two-line steps reads as separate items at every text size
- One pi settings write disabled every control on the page for the length of the worker round trip; only the fields a write carries go inert now, so the rest of the page stays editable

## [0.4.23] - 2026-10-27

### Added

- A full-page settings view (⌘ ,): Appearance, Chat and Shortcuts for pigi, and Models & Thinking, Message Delivery, Compaction, Retry, Resources and Advanced for pi, with a Global / This project switch that writes to pi's `settings.json`
- Appearance settings: mode with a live preview, accent, background and foreground colors, contrast, text and code fonts and sizes
- Named themes (pigi, GitHub, Catppuccin, Nord, Gruvbox, Everforest, Notion, Linear), plus copying the current look out as a theme file and pasting one back in
- 18 code themes and 12 diagram themes, each with a real code block or diagram redrawn under its picker as you choose
- Mermaid diagrams in messages: drawn as they stream, with a source switch, a zoom overlay (wheel, pinch, drag, Escape), and text that stays selectable and searchable
- A design-token layer for radius, spacing, elevation and motion, with `docs/design-system.md`, a check that fails the build on hard-coded values, and `__designTokens()` in dev builds to render the set

### Changed

- pigi's settings moved from localStorage to `settings.json` in the app data folder, migrated on first launch, written atomically and debounced
- The accent is the theme colour: solid buttons, the checked switch and the sidebar action use it, split into a fill that keeps its white label readable and a text accent that clears 4.5:1 for links and icons
- Corners are superellipses everywhere, sized by role: transcript surfaces one tier below cards, the composer one above, markdown tables a single 10px step
- Typography has two families (text and code). Markdown headings and tables follow the text size instead of fixed pixels
- Message spacing follows the text size and two rules: same kind of block sits at its own step, a change of kind sits wider. Only the last row of a reply keeps the hover action band, and a table or code block after list text is no longer flush against it
- The Chat settings page is one row: a Default view switch instead of three described options
- The minimal view's shimmer is a gradient inside the text's own glyphs instead of a second, brighter copy revealed through a moving window
- Sidebar and menu rows show their shortcut as a bordered keycap on hover (New chat, Open project, Settings, Back to app), and the Shortcuts page's closing line draws ⌘ , as a keycap instead of plain text
- The comment editor's Save is an outline button, so only the quotes tab's Send carries the accent fill
- A sent quote now opens with its number on the quoted line (`1. > quoted text`) instead of the number standing on a line of its own

### Fixed

- The pi settings pages load in an unfocused or occluded window; they used to wait for an animation frame that such a window never produces
- Opening Appearance, Chat or Shortcuts no longer reads pi's settings files, and a pi settings value outside its declared range is refused instead of written
- A settings file that cannot be parsed is left alone instead of being replaced with the old localStorage value
- Code blocks keep one theme per surface instead of registering a new one for every frame of a colour-picker drag
- Switch tracks are 20px, so the thumb sits on whole pixels
- Popover, dialog and context-menu surfaces keep a visible hairline around their corners: the 0.5px ring drew the straight edges and vanished along a 20px arc, so the edge is an outline now
- A button that sets its own type size keeps it: the class merge understands the named type scale, so the model picker's label is 15px again instead of the variant's 13px
- The font pickers no longer list their default twice, and their values are left-aligned
- Tool status, diff, toast and warning colours follow the theme, so they stay readable in dark mode
- The terminal follows the code font and size; native window chrome and menus follow the chosen appearance
- Code blocks use a dark palette in dark mode, every token clearing 3:1 against the code background
- A code block that is still streaming is highlighted on a throttle instead of on every chunk, and rebuilds only the text that came in with the chunk rather than every highlighted line above it
- Update checks no longer pull the window mid-countdown, the update window closes itself when a background check finds nothing, and an install Squirrel never finishes returns to "ready to install"
- An update status that arrives while a window is still reading the current one no longer overwrites it with the older answer
- The update window resets its zoom whenever it appears, so View-menu zoom cannot clip its own buttons, and only that window can resize it
- Message minimap lines are one device pixel thick on every display: they sit on an 8px pitch, so no line lands on a different subpixel phase
- The minimap's hover list opens flush against the side edge and covers the lines
- The minimap list works from the keyboard: Tab reaches its rows, Enter opens it, and Escape closes it, returns focus to the lines, and does not flash the list back for a frame on the way out
- The live state label's letters no longer look doubled: the shimmer paints one copy of the glyphs, and it stays visible where the clip is unsupported or motion is reduced
- With reduced motion the live state label pulses at a fixed pace; the shimmer's measured width no longer retimes that pulse
- A tool block keeps one gap between the title and its output and the same gap to the status bar, with or without Show more; a block with no output no longer pays the gap twice

## [0.4.22] - 2026-10-24

### Fixed

- The update window really does size itself to its content now. Until this fix a download's Cancel and Install buttons were clipped off the bottom of the window, and "pigi is up to date" left the window at its opening height.
- "Check for Updates" opens the window when a background check is already running, instead of appearing to do nothing.
- "Install and Restart" says "Restarting to install…" while the bundle is being swapped in, so the click has an answer.
- "Later" only closes the window - it was going through the cancel path - and Escape closes it the same way.

## [0.4.21] - 2026-10-24

### Changed

- The update window sits higher over the main window, and "pigi is up to date" counts down the two seconds it stays on screen

## [0.4.20] - 2026-10-24

### Changed

- The update window is a normal titled window that sizes itself to what it has to show, instead of a fixed frameless box: one line for a check, a progress bar and its buttons while a download runs
- It reads like a system update dialog - app icon, bold status, progress bar, byte count - and its buttons use the theme accent
- "Check for Updates" opens its window immediately, so the click answers at once instead of after the check
- "pigi is up to date" is shown in that window, marked as closing itself after a second, instead of a notification in the main window
- The Settings menu rows match the size of the sidebar row they belong to, and the "Update to <version>" row carries the same dot as the Settings button

## [0.4.19] - 2026-10-24

### Added

- "Check for Updates…" in the macOS app menu; it follows the update status (checking, downloading, ready to install)

### Fixed

- The update dot and the download progress bar use the theme accent colour instead of a hard-coded blue
- Background update checks are spread by ±10 minutes instead of landing on a fixed two-hour cadence

## [0.4.18] - 2026-10-23

### Added

- pigi updates itself: a downloaded update lights a blue dot on Settings, which offers "Update to <version>" and restarts into it
- "Check for Updates" in the Settings menu, with a progress window that shows the download and can cancel it

## [0.4.17] - 2026-10-23

### Fixed

- Cmd+Enter sends the quotes again. After quoting a passage in a session whose quotes panel was already open, the shortcut did nothing until the session was reopened

## [0.4.16] - 2026-10-23

### Added

- Dragging either sidebar past its minimum width collapses it, with the same animation as the toggle; dragging back out reopens it, and the resize cursor stays for the whole drag
- A plus under the quotes adds a global comment on all of them, sent after the quotes and labeled as such
- Cmd+Enter sends the quotes while the right sidebar is open; the shortcut is shown on the Send button and can be changed in settings

### Changed

- The right sidebar can be dragged much wider on a large window, and narrows again when the window does. Quotes stay in a readable column however wide it gets
- Sent quotes form a more compact message, without blank lines between the quotes

### Fixed

- Sending the first message of a new session no longer opens the right sidebar just because another session had it open. Each session remembers whether its sidebar is open, across restarts

## [0.4.15] - 2026-10-23

### Added

- Quote passages from the conversation: select text in a message and a Quote button appears next to where the selection ends (or press Q); add a comment, and the quote is collected in a new right sidebar where comments can be edited or deleted. Send turns all quotes into one message. Unsent quotes are kept across restarts
- A right sidebar with tabs, toggled from the button at the right end of the session toolbar. Quotes is its first tab

### Changed

- Unsent text in the chat input is kept across restarts, for each session and for the new-chat screen

### Fixed

- When an extension compacts the context right after a response finishes, the working bar stays visible and messages sent during compaction show in the queue, instead of disappearing until compaction ends
- Editing a message whose response was stopped mid tool call goes back to before it, instead of reporting that the message has no reply to leave
- Moving the session to the message it is already at no longer drops a model or thinking level change made after it
- After going back to before the first message, the session tree opens the newest version instead of folding everything away, which left a single-version session with an empty list and no way to get back
- Buttons and other controls show a focus ring only while navigating with Tab or the arrow keys. Clicking a control and then pressing Shift or Escape, or closing a menu with the mouse after typing, no longer leaves a ring on it

## [0.4.14] - 2026-10-22

### Added

- A session that finishes while you are in another one shows an accent-colored dot in the sidebar in place of its time, until you open it. The dot is kept across restarts
- Edit any message you sent from the toolbar under it: the conversation goes back to before that message, without a summary, and the message returns to the chat input. What came after stays reachable in the session tree

### Changed

- The branch summary prompt's two answers are styled alike, with no highlighted default
- The path completion list opens above the path you are typing instead of at the left edge of the chat input, and folders no longer end with `/`

### Fixed

- Extension commands (such as `/plannotator-review`) show a terminal icon in the chat input, matching the sent message, instead of the skill icon
- Spinners (the star in the working bar, a running session in the sidebar, reading and thinking in the transcript, loading toasts) keep turning while the app is busy (for example while a long tool output streams in) instead of freezing
- A message taken back to the chat input (editing it, moving the session to it, or continuing before it in a new chat) keeps its images and files, instead of showing the attached file list and pasted file contents as text and losing its images

## [0.4.13] - 2026-10-21

### Added

- Attach files and images to a message with the `+` button, by pasting, or by dropping them on the chat input. Messages sent while the agent is working (steer and follow-up) keep their attachments, and files too large to attach are refused with a message
- Images and files you send appear inside your message; click an image to see it larger, or a file to preview it (Quick Look on macOS, the file manager elsewhere)
- Type `@` to reference a project file: the most recently modified files show before you type, then results narrow as you type, with file-type icons
- Type a path (anything with a `/`, or `~` for your home folder) to complete files and folders with fuzzy matching. A completed path becomes a chip that shows the whole path; a folder stays open until you type a space, so you can keep typing or pick to go deeper, and Backspace goes up a level
- Skills, slash commands and `@` file references show as labels with icons, both in the chat input and in sent messages
- A button at the top of the sidebar, or Cmd+B, hides and shows it, with an animation; hovering the button shows the shortcut

### Changed

- Choosing a project with `#` returns focus to the chat input
- New sidebar icons for new chat, project folders and opening a project
- The session title in the toolbar no longer has an icon in front of it
- Send and stop buttons use the accent color
- Taller lines in the chat input

### Fixed

- Stopping the agent puts queued steer and follow-up messages back in the input in the order you sent them
- Sending the same steer message twice shows both instead of hiding the second

## [0.4.12] - 2026-10-17

### Changed

- The session list and the chat area meet in a straight line: the rounded corner between them is gone, and the hairline that separates them runs the full height of the window
- The macOS download is named `pigi-arm64.dmg` instead of `pigi-<version>-arm64.dmg`, so the site can link to `releases/latest/download/pigi-arm64.dmg` and hand out the newest release the moment it is published, with nothing to rebuild

## [0.4.11] - 2026-10-12

### Added

- Session tree: the tree button in the session toolbar (or `/tree`) shows every branch of the session, not just the one you are on. Search it, filter by `User` / `Assistant` / `Tools` / `Summaries`, hover a row to preview the message, and pick one (click or Enter) to continue the session from there. Hovering a row lights the branch line that leads to it, and the rows it hangs from stay pinned at the top while you scroll
- Session tree: when a move would leave messages behind, you can have them summarized first; the summary joins the conversation as context, and a running summary can be cancelled
- Fork any message into a new chat: the conversation up to that point is copied into a new session with the same model and thinking level, and the original stays where it was. Forking before one of your messages puts that message back in the input box so you can reword it
- Forked chats are listed under the chat they came from in the sidebar
- Every message shows `tree` and `fork` actions on hover, with a `?` that explains the session tree
- The new-chat input keeps its draft: text typed without sending is still there the next time you start a new chat

### Changed

- Tooltips use the app's surface colour instead of black, without the arrow
- Icons are drawn slightly bolder across the app

- Draft text is no longer lost when switching between a session and the new-chat screen
- Narrowing the window keeps the chat input and the streaming queue aligned with the messages

## [0.4.10] - 2026-09-11

### Changed

- Auto-follow during streaming now keeps the message list glued to the exact bottom: content stays above the input with no drift, and every auto-scroll (new message, scroll-to-bottom button) lands fully at the end
- Scrolling up more than a few lines while output streams stops the follow; scrolling back down to the bottom resumes it. Small wheel nudges no longer stop the follow
- The Working bar and queued messages reserve their own space below the message list instead of overlapping it, so they can never cover the transcript
- Less empty space below the last message

### Fixed

- Tool cards and other content that grow after they appear no longer push the end of the transcript under the bottom edge, leaving the list stuck short of the bottom until you scrolled manually

## [0.4.9] - 2026-09-11

### Added

- The session toolbar is now a draggable title bar region — drag anywhere on the toolbar to move the window
- Message list scrollbar stays thin at all times instead of occasionally showing the thick system scrollbar

### Changed

- Picking a model now keeps the picker open and opens the thinking-level menu so you can confirm a thinking level for the new model; the picker closes once you pick one (or dismiss it)
- Tool cards shift less while a tool runs: edit and write cards reserve their body height from the first frame and only grow, command output is capped at a shorter height before "Show more", and the card's header, footer and toggle are tighter
- Long lines in tool output scroll horizontally instead of wrapping
- The chat input grows to at most half its previous maximum height before scrolling
- The login dialog now has OAuth and API key tabs side by side with a fixed height; the API key form is always visible instead of hidden behind "Add provider"
- Login dialog: signed-in OAuth providers are listed first, the list scrollbar is hidden, and Login buttons match the Logout style instead of solid black
- Terminal tabs are slightly taller

### Fixed

- New sessions no longer occasionally start without your gateway/OAuth models (and with a model picker that refuses to switch). This happened when a session was created while another process was refreshing a login token, most visibly right after launching the app; logging in or out in one session is now also picked up by all others without restarting them
- The sidebar no longer wobbles sideways after expanding many sessions with "Show more"
- The view-mode menu in the toolbar has proper list sizing and spacing again, with the check mark right beside the selected label
- Queued steer/follow-up messages no longer cover the transcript: the message list raises its bottom edge as the queue grows taller
- Selected text in the terminal is clearly visible again in light and dark themes
- Cmd+K clears the terminal buffer while the terminal is focused
- Resizing the window no longer stutters or makes messages jump when the width passes 768, 1024, 1280 or 1536px
- Opening or resizing the terminal no longer covers messages; the latest messages stay visible while reading history preserves your position
- Dragging the terminal resize handle now smoothly resizes the chat input and message list
- Dragging the sidebar edge no longer re-renders the whole app on every pointer move; the width follows the pointer and is saved on release
- Resizing the window does less work per frame in long conversations: the message minimap tracks its own width and virtual rows reuse observed heights instead of re-measuring every visible row
- The git branch shown in the chat input refreshes when you create a session, switch sessions, or switch project in a new session
- Code blocks, tables, tool output and the login dialog no longer rubber-band when scrolled past their edge on macOS, which previously exposed transparent backgrounds and shifted code away from its header
- Tab bars now lay out horizontally and highlight the active tab correctly
- The active terminal tab shows its rounded grey background again

## [0.4.8] - 2026-09-07

### Added

- Use Cmd+Shift+[ and Cmd+Shift+] to cycle through threads in the current project in sidebar order, wrapping between the first and last threads
- `/reload` slash command reloads extensions, skills, prompts, settings and context files without restarting the session

### Fixed

- Switching back to a session now restores the position you left it at — previously it could land at the previous session's position or an unrelated spot
- Auto-follow no longer stalls or vibrates while new output streams in, and streaming cards no longer overflow the breathing room below the last message
- Arrow-up/down history recall now respects soft-wrapped lines — previously it triggered history even when the cursor was on a wrapped (visual) line that wasn't the first or last

## [0.4.7] - 2026-09-06

### Fixed

- Streaming message lists no longer freeze mid-turn or jolt when a turn finishes
- Auto-follow is more reliable: the list keeps following new output whenever the latest message is still fully visible, instead of randomly stopping
- Switching sessions restores your exact scroll position; opening a session lands on the newest messages, and scrolling back to the bottom lands cleanly without chasing a moving target
- Opening the terminal no longer shifts the message list — only the chat input rises above the panel, and messages no longer show through the bar under the input
- Read groups no longer freeze while the model thinks between file reads

## [0.4.6] - 2026-09-01

### Added

- Extension commands (e.g. `/plannotator-review`) now appear in the slash command autocomplete menu
- Extension notifications are displayed as toast messages instead of being silently ignored
- Slash commands render as a styled command pill in the chat instead of a plain text bubble

### Changed

- Read groups now show "Explored N files" instead of "Looked into N files"
- Git read-only commands (diff, log, show, status, blame, etc.) are collapsed into read groups and labeled separately as "checked git N times"
- Thinking count is now visible during streaming, not just after completion
- More bash commands recognized as read-only and collapsed: `sed`, `awk`, `nl`, `tac`, `sort`, `uniq`, `perl` (with read-only flags)

### Fixed

- Compact and Show All message lists no longer intermittently jump away from the bottom while many messages stream in.
- Code blocks with long lines now show a horizontal scrollbar instead of clipping content
- The copy button on code blocks no longer scrolls away when scrolling code horizontally
- Editing a queued message during compaction no longer fails silently

## [0.4.5] - 2026-08-17

### Fixed

- Sending a message now reliably scrolls to the bottom and follows the reply again: auto-follow no longer trips on the list's own scroll positioning while the chat input collapses after sending (the lock is wheel-only again — keyboard and scrollbar scrolling no longer disable auto-follow).

## [0.4.4] - 2026-08-17

### Added

- Code blocks in messages now show a copy button in the top-right corner, so you can copy the code inside a fenced block with one click.

### Fixed

- Scrolling up now reliably locks the message list so streaming output no longer drags it back to the bottom: the virtualizer's scroll corrections are gated off while the lock is engaged (late row re-measurements, such as async code highlighting landing above the viewport, could still yank the locked viewport downward), and any scroll away from the bottom — including scrollbar drags and keyboard scrolling, not just wheel events — now disables auto-follow until the list is scrolled back down to the bottom.
- The up and down arrow keys in the chat input now move the cursor between lines first: recalling previous messages only kicks in when the cursor is already on the first line (up arrow) or the last line (down arrow), so editing a multi-line message no longer suddenly jumps into message history.
- The message list no longer micro-jitters when scrolling to the bottom of a long conversation: messages stay in place instead of shifting a few pixels as the list settles.
- The model list can no longer get permanently stuck after a bad start: every catalog load is now time-boxed and aborted for real, a worker that cannot build the catalog is respawned fresh, and opening the model picker now kicks a background refresh — so a session opened quickly after launch no longer ends up with a missing or frozen model list that only an app restart could fix.

## [0.4.3] - 2026-08-13

### Added

- New Minimal view provides a focused, compact way to follow agent work and final responses.

### Changed

- User messages are more compact and long prompts take up less screen space.
- Subagents now launch through the standalone pi CLI instead of opening another app window.

### Fixed

- Chat input now recovers correctly after prompt or session startup errors.
- Closing the terminal no longer disrupts the chat layout or sticky headers.

## [0.4.2] - 2026-08-07

### Added

- Pressing the up arrow in the chat input now recalls your previous messages, one by one back through the whole conversation; the down arrow walks forward again. If you had started typing something, it is remembered and comes back when you press down — so nothing you wrote is lost.

### Fixed

- In the sidebar, collapsing a project's chat list with "Show less" now sticks: the list no longer flickers and springs back open when the selected chat is one of the hidden older chats.
- Clicking a chat in the sidebar no longer makes the list refresh or jump: resuming a chat leaves the list untouched, and the scroll-to-center behavior now applies only to selections made outside the list (session switcher, navigation history), not to your own clicks.
- Thinking levels in a new chat now match the model you are on: models that support the strongest level (like Kimi K3's "max") offer it again, and the last-used level is clamped to what the current model actually supports instead of carrying over a level from another model.

## [0.4.1] - 2026-08-05

### Changed

- The view mode dropdown in the message toolbar now highlights the selected option (Compact / Show All) with the app's accent color and a matching check mark; the menu and its options have more breathing room.

### Fixed

- The model picker now reliably shows the full model list, including gateway models that load over the network: the model list is loaded once at startup, pushed to the app when ready, and refreshed when you log in or out — instead of being re-fetched and repeatedly polled by each chat, which could leave the picker stuck on a partial list.
- A new chat's thinking-level options now follow your most recently used model instead of the first model in the list when the app has just started.

## [0.4.0] - 2026-07-31

### Fixed

- The message list no longer visibly bounces while pinned to the bottom during fast streaming (most noticeable with quick models): the bottom pin now runs inside a ResizeObserver callback, so it applies in the same frame the content grows instead of one frame later.

## [0.3.20] - 2026-07-29

### Fixed

- The message list no longer occasionally vibrates when it's scrolled to the bottom, which could happen shortly after opening a conversation.
- The "Working..." indicator and the sidebar's running-session spinner stay smooth instead of stuttering while the app is busy rendering.
- Syntax-highlighted code in write previews and command output no longer flickers between plain and colored text as it streams in.

### Changed

- Tool blocks have a cleaner look: removed internal border lines, tightened spacing, and the status bar now uses colored text without a background fill.
- The conversation header is slightly taller and shows a notebook icon before the (now medium-weight) title; its width is capped and horizontal padding tightened.
- Tool block status bars now show a success/failure icon and just the elapsed time (dropped the "Elapsed"/"Took" labels), and status/thinking icons are a touch bolder.
- Links, search highlights, the message mini-map, focus rings, and the "Working..." indicator now use a refined indigo accent color instead of following the (often muted) system accent. More accent colors are built in, ready for an upcoming picker in settings.
- Large edit diffs render noticeably faster and are less likely to cause a hitch when they first appear, since off-screen diff lines are no longer laid out until scrolled into view.
- Large highlighted output (writes, command results, code blocks) renders faster: off-screen lines are no longer laid out until scrolled into view.

## [0.3.19] - 2026-07-27

### Added

- Built-in terminal panel that slides up from the bottom of the main area. Toggle it with the title-bar terminal icon or Cmd+J (the icon's tooltip shows the shortcut), and drag its top edge to resize. Its colors follow the app's light/dark theme, and it opens and closes with a smooth animation that stays fluid even on long conversations.
- Terminal tabs, one strip per project. The "+" button opens a new terminal in the current project's directory; each tab shows the shell's title and has a close button. Tabs are grouped per project: switching projects shows that project's own tabs, and switching back restores them exactly (shells and scrollback intact). The 5 most-recently-used projects are kept alive, and a project's tabs are released after an hour of inactivity. macOS line-editing shortcuts work inside the terminal (Cmd/Option with arrows and delete), clicking a tab focuses its terminal, and closing the last tab (or the panel) returns focus to the chat input.

### Changed

- In collapsed read groups, an over-long command now ellipsizes in the middle instead of the end, so the useful tail (filename, line range, final arguments) stays visible.

### Fixed

- Sessions are auto-named again after the first exchange. The automatic title generation had silently stopped working after a recent model-system update.

## [0.3.18] - 2026-07-23

### Added

- Edit, write, and bash tool cards now show a placeholder skeleton while they run, instead of a blank card, so it's clear content is still loading.

### Changed

- The title bar's bottom border is now a hairline that matches the sidebar divider, instead of the thicker, heavier line it used before.
- A successful edit no longer fills its status footer with green, so it no longer blends into the green of the diff above it. The footer bar and timing stay; only the background is dropped.

## [0.3.17] - 2026-07-23

### Changed

- Tightened spacing in rendered messages: paragraphs and lists now share a single, more compact line-height, so bullet and numbered lists no longer feel loosely spaced.
- Thinking blocks and long tool output now stay anchored to their latest lines when collapsed, with the Show more button above the content. Edit diffs still show from the top.

### Fixed

- New sessions sometimes opened with an incomplete model list (notably missing Booking-Gateway models) when a provider was slow to load. The model picker now keeps refreshing until the full list is available, and it updates on its own right after you log in or out.
- The message list and the scroll-to-bottom button sometimes stopped just short of the real bottom. Auto-scroll now lands exactly at the bottom.

## [0.3.16] - 2026-07-22

### Added

- Long block content (tool outputs, thinking text, user messages) now auto-collapses at 300px with a "Show more" / "Show less" button. For streaming tool output, the button floats above the content with a frosted-glass background while scrolling. For static content like user messages, the button sits below the clamped area.
- Consecutive read-only tool calls (read, grep, ls) now auto-group into a compact collapsed row like "Looked into 3 files". Expanding the group shows full tool outputs with search highlight support. The "Working..." shimmer row now appears at the end of expanded content inside the group.
- Thinking blocks inside read groups are shown as compact rows with a brain icon, duration, and chevron to expand the full block inline. Thinking blocks stay inside the group even after the thinking message finishes.
- Thinking blocks now display the thinking duration in the header, with live ticking during streaming.
- Tool block title rows now have a gray background for visual separation from the output body.

### Changed

- Tool block command timeout is now shown in the status bar (next to "Took Xs") instead of the title row.
- Show more/less chevron direction adapts to whether the button is above or below content.
- User message bubble spacing is now managed by a single container padding instead of individual margins.
- Thinking block collapsed max height reduced to 120px.
- Thinking duration format: sub-second durations show as `0.xs` instead of `<1s`.
- Live streaming thinking duration anchors to message start time rather than first delta, avoiding zero durations when deltas are batched.
- Tool block command truncation button no longer disappears after expanding.
- Expanding a read group no longer auto-scrolls to the bottom of the conversation.

### Fixed

- History thinking duration was missing when opening a previous session. Messages now carry the outer persistence timestamp for accurate duration calculation.
- Thinking blocks between read tools are transparent to grouping and appear inside the group instead of breaking it apart.
- Thinking deltas arriving in bursts no longer produce zero or missing durations during live streaming.

### Fixed

- Search matches hidden behind clamped content now auto-expand the block to reveal the match.

### Added

- Message search via Cmd+F / Ctrl+F: fuzzy-search across all messages and tool outputs, with keyboard-driven match navigation (Enter/arrows), per-occurrence active highlight like Chrome's find-in-page, and auto-expand for grouped read blocks and overflow-hidden tool content.

### Changed

- Upgraded pi SDK from v0.80.6 to v0.80.10, adding Kimi K3 model support and improving credential persistence for API key and OAuth providers.
- Improved markdown typography in assistant messages: more comfortable line height for reading, headings now visually group with their content, and code blocks have better spacing.

### Fixed

- Search highlights no longer disappear when navigating between matches — the active highlight now stays visible throughout paging.
- Tool output blocks with overflow-hidden content now auto-expand when jumping to a search match below the fold.
- Scroll-to-bottom button now scrolls all the way to the last message.

## [0.3.14] - 2026-07-10

### Added

- Message minimap now highlights the bar closest to your current scroll position with a blue indicator.
- Hovering the minimap popover highlights and scrolls the active item into view.
- OAuth device code flow support: when a provider requires a device code, a persistent toast shows the code with a "Copy & Open" button that copies to clipboard and opens the verification page.

### Changed

- Upgraded pi SDK from v0.74.0 to v0.80.6, bringing 30+ new LLM providers and models.
- Assistant messages now use the app's default line height instead of a fixed 24px, for a tighter and more natural reading rhythm.
- Message toolbar spacing shifted from above to below buttons, reducing visual gap between message text and action bar.
- Bottom gradient fade shortened to avoid overlapping the chat input area.
- Last message in the list has slightly more breathing room at the bottom.

### Fixed

- Scroll-to-bottom button now scrolls all the way to the last message instead of stopping a few pixels short.
- Restored bottom spacing between message list and chat input that was lost when switching to block translation layout.
- Reduced visual jitter when long content streams in during AI responses, especially noticeable in long thinking blocks.
- Sidebar now automatically scrolls to the selected session when switching, expanding the project and show-more list as needed

## [0.3.13] - 2026-07-01

### Fixed

- Switching sessions no longer triggers typewriter animation on the toolbar title.

## [0.3.12] - 2026-07-01

### Added

- Double-click the session name in the toolbar to rename it inline, matching the sidebar behavior.
- Toolbar session title now animates with the same typewriter effect as the sidebar when the title updates.

### Changed

- Expanded compact read group now shows tool cards inside the same bordered container.

## [0.3.11] - 2026-06-30

### Added

- Session toolbar at the top of the message list showing session title and a view mode toggle to switch between compact and full tool block display.

## [0.3.10] - 2026-06-30

### Added

- Compact read view mode: consecutive read-only tool calls (read, grep, rg, ls, fd, etc.) are collapsed into a single "Looked into N files" line with a list of commands underneath. Click to expand and see the full cards. Active groups show a shimmer animation on the current command.

### Fixed

- Pressing Enter while selecting text with an input method no longer saves a session rename.
- Pressing Esc now only aborts a running session when the chat input or message list is focused.
- New chats now recover better from failed startup attempts and retry without resending old failed messages.
- Session switcher now shows accurate relative times (e.g. "2m", "5h") instead of "now" for all sessions.
- Clicking a session or project in the sidebar now refreshes the session list

## [0.3.9] - 2026-06-28

### Fixed

- New sessions now appear in session switcher and sidebar after the first response completes
- Navigation forward/back no longer skips sessions that are being loaded from disk
- Session titles no longer get truncated to 48 characters on first message
- Switching sessions now correctly restores scroll-to-bottom position when user was already scrolled to the bottom

## [0.3.8] - 2026-06-14

### Fixed

- Clicking a session now properly switches the active project to that session's project
- Opening a new session no longer loses the previously active session from navigation history

## [0.3.7] - 2026-06-14

### Added

- New session view with centered "Here we go" heading, center-aligned input box, and clean footer
- `#project-name` dropdown in top-left of input for project selection with fuzzy search
- `#` hash autocomplete in textarea for switching projects

### Changed

- Thinking level options are now per-model: switching models filters available thinking levels automatically
- Model selection no longer available in new session toolbar; model/thinking set on first send

### Fixed

- Switching to a model that doesn't support the current thinking level now properly resets to `off` on the backend

### Changed

- Reduced spacing between messages in the transcript for a more compact layout.
- Markdown tables now have rounded corners.
- Increased the maximum number of recent projects from 12 to 64.

### Fixed

- The copy button now sits flush below thinking blocks instead of having extra space.
- The copy button now sits flush below thinking blocks instead of having extra space.
- Session switcher now shows accurate relative times (e.g. "2m", "5h") instead of "now" for all sessions.

## [0.3.6] - 2026-06-08

### Changed

- Auto-rename now triggers after 3 text messages instead of waiting for the first full agent turn to complete.

## [0.3.5] - 2026-06-08

### Added

- Auto-rename sessions: after 3 text messages (user + assistant, excluding tool calls), a lightweight LLM call generates a concise title using the cheapest available model. Triggers mid-turn without waiting for the full agent response.
- Typewriter animation when auto-rename updates the session title in the sidebar.

### Fixed

- Session switcher no longer lags when searching with many sessions (1000+).
- Session switcher now always selects the first item when opened or when search results change.
- Manual rename now refreshes the correct project's session list (uses session cwd instead of active project).

## [0.3.4] - 2026-06-07

### Fixed

- Ctrl+R session switcher shortcut now works in production builds, not just in dev mode.

## [0.3.3] - 2026-06-07

### Added

- Session session message lists remember scroll position — switching between sessions restores where you left off. New sessions open scrolled to the latest message.
- User message minimap on the right side of the chat — hover to see a list of your messages, click to jump to any one.
- Session switcher (Ctrl+R): search and switch to any session across all projects.
- Ctrl+Tab opens the session switcher and auto-focuses the previous session for quick toggling.
- Navigate session history with Cmd+[ (back) and Cmd+] (forward), browser-style.
- Switching sessions now auto-expands the project and scrolls to the session in the sidebar.

### Changed

- Dialog and command palette now use 550px width by default.

### Fixed

- Refreshing the app (Cmd+R) no longer breaks session resume — the session reconnects seamlessly.
- Opening a session no longer briefly logs errors about missing ports.
- Renamed sessions now show their updated name in the session switcher.

## [0.3.2] - 2026-06-03

### Changed

- Edit tool diffs now render using the server-computed diff from tool result details, instead of recomputing client-side from tool arguments. This enables diff display for custom edit tools (e.g. tagged-edit) that don't use oldText/newText arguments.

### Fixed

- Compaction errors now display as a separate error message below the "Compaction failed" marker, instead of cramming the full error into the marker line.
- Clicking a recently created session in the sidebar no longer switches to a different session.

## [0.3.1] - 2026-06-03

### Fixed

- New chat no longer appears twice in the sidebar.

## [0.3.0] - 2026-06-03

### Added

- New chat opens instantly with no delay — a warm background process is pre-spawned so model info and settings are available immediately.

### Changed

- Switching to a previous session is now near-instant — messages appear immediately without waiting for the background process.
- New chat shows the last-used model and thinking level by default (seeded from the most recent session on first launch).

### Fixed

- Alt+Enter follow-up message now works correctly during streaming.

## [0.2.8] - 2026-05-31

### Added

- Slash command autocomplete now includes available skills alongside built-in commands.

### Changed

- Send shortcut changed from Cmd+Enter to Enter (Shift+Enter still inserts newline).
- New sessions now inherit the last-used model and thinking level from the previous session.
- Long messages now fade out at the edge instead of being cut off.
- Refined visual polish across tool blocks, icons, menus, and dialogs.

### Fixed

- System accent color now correctly matches the macOS accent color setting.
- Tool block footer spacing restored between content and status bar.

## [0.2.7] - 2026-05-29

### Changed

- macOS window: refined border to hairline-thin by aligning `vibrancy`/`backgroundColor` with native Codex approach, removing redundant `transparent: true` and `visualEffectState: 'active'`.

### Fixed

- Disable Electron cookie encryption fuse to prevent macOS Keychain password prompt on launch.
- ESC/send button now correctly aborts in-progress compaction via `abortCompaction()`.
- Steer/followUp messages sent during compaction are preserved and replayed when compaction finishes.

### Changed

- Tool block: bash execution output no longer has syntax highlighting (plain text).
- Tool block: use shiki full bundle for syntax highlighting, supporting all languages (rust, go, etc.).
- Tool block: file extension resolved directly as shiki language key at runtime; only a small override map for ambiguous extensions.
- Sidebar: session labels slightly darker than folder labels for better visual hierarchy.
- Compaction: show abort button during compaction, correct end-of-compaction text (aborted/failed/success), position marker at chronological boundary instead of scroll-out-of-view top, and display "Compacted N times" at the bottom of reopened compacted sessions.

## [0.2.6] - 2026-05-26

### Changed

- Markdown links now use system accent color with improved underline styling for better visibility.

- Code syntax highlighting theme switched from `github-light` to `one-light`.
- Thinking block: tighter title-content spacing and increased background opacity for better visibility.
- Enable font smoothing (antialiased) for crisper text on macOS.
- Body font-weight now uses `--font-weight-normal` variable instead of hardcoded value.
- Thinking block: 13px medium title, 14px content with tighter line-height.
- Markdown headings resized (h1: 26px, h2: 19px, h3: 17px).
- Font weight scale aligned with standard values (400/500/600/700) for lighter text rendering.
- Light mode foreground color aligned with Codex (#1a1c1f) for less aggressive contrast.
- Settings popover and context menus now use frosted glass with 80% opacity instead of solid backgrounds.
- macOS sidebar now uses `menu` vibrancy with semi-transparent background for a more refined frosted glass appearance.

### Fixed

- Bash toolblock: fix "more" button position when timeout indicator is also present, now right-aligned below timeout instead of stranded mid-line after the command text.

## [0.2.5] - 2026-05-23

### Added

- Double-click session name in sidebar to rename it inline.

### Changed

- Projects group action button (+ icon) now only appears on hover, reducing visual clutter.

### Fixed

- Prevent duplicate empty sessions when quickly creating new chats in succession.

## [0.2.4] - 2026-05-23

### Changed

- Font weight scale adjusted: `font-normal` 350, `font-medium` 550, `font-semibold` 650, `font-bold` 750.

## [0.2.3] - 2026-05-23

### Changed

- Font weight adjusted for native macOS feel: baseline 350, UI controls use `font-normal` (350), dialog/sheet/popover/empty titles use `font-semibold` (600), markdown bold and tool block command titles use `font-medium` (500).
- Toast notifications repositioned to bottom-right with transparent borders.

## [0.2.2]

### Added

- Settings button in sidebar footer with frosted-glass popover containing Login and Settings items.
- `MenuItem` component and `.menu-content` CSS utility for reusable frosted-glass menu styling.
- Chat input textarea now auto-grows up to 35vh with scrollbar at max height.
- System accent color used for focus rings and sidebar highlights instead of gray.
- Centralized keyboard shortcut system with persistent keybinding store and customizable shortcuts.

### Changed

- Sidebar and main content divider refined to 0.5px hairline border for native-feel precision.
- Project right-click context menu uses frosted-glass styling matching the Settings popover.
- Unify empty-state branding: session-empty screen now shows "Welcome to pigi" instead of "No session open", matching the project-empty screen.
- Switch from Geist web font to system font stack for more native text rendering on each OS.
- Disable text selection on UI chrome (labels, buttons, headings); message content remains selectable.
- Dialog overlay backdrop lightened and auto-focus on open removed for more native dialog behavior.

## [0.2.1] - 2026-05-15

### Added

- Empty state screen when no session is active, replacing the chat input. First-time users see "Welcome to pigi" with a shortcut hint (Cmd+O) to open a project. Returning users see "No session open" with a prompt to select from the sidebar.
- Global Cmd+O keyboard shortcut to open a project directory.

### Changed

- Chat input, message list, and streaming queue are now hidden when no session is open.

## [0.2.0] - 2026-05-11

### Added

- App icon.

### Fixed

- Running sessions remain visible when a project is collapsed, even after they finish running. The collapsed view now snapshots running session IDs at collapse time and filters the session list to show only those sessions.

## [0.1.0] - 2026-05-10

### Added

- Initial release. Desktop GUI for pi with project management, session sidebar, and high-performance rendering.
