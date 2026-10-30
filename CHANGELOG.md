# Changelog

## [0.4.29] - 2026-10-30

### Added

- Messages an extension injects appear in the transcript as a card labelled
  with the customType, its text rendered as markdown and its images as
  thumbnails, instead of being invisible. A letter from another pi session is
  one of them

### Changed

- A code block whose language is not one with a fixed spelling now shows it
  with a capital first letter (`rust` as `Rust`), and a block with no language
  is labelled Text instead of plain text
- The message minimap's rail is shorter: its widest line is 32px (was 48),
  and the shortest stays 8px
- A minimap of six messages or fewer draws its lines at a third of the
  column's width, where it used to draw them at a quarter

### Fixed

- The minimal view no longer starts a working timer for a slash command or
  skill before the agent has produced any work, so an extension command that
  runs on its own is not shown as an endlessly working turn

## [0.4.28] - 2026-10-30

### Changed

- The sidebar's project rows sit at 80% foreground instead of full strength,
  so New chat and the hover actions keep the strong colour
- The toolbar's View menu keeps its compact 13px rows, accent-tinted checked
  item and inline check, now without the extra gap between rows
- Menus and searchable lists share one selected-row treatment: a tint of the
  theme accent, the label in the accent, secondary text muted, and the check
  beside the label
- The thinking-level flyout keeps the model list's body size on tighter rows
  and enters with a soft fade, so it no longer pops in
- A minimap of six messages or fewer draws its lines at a quarter of the
  column's width, and the rail only takes the width its lines need, so its
  hover area no longer reaches past the lines
- The message list draws its own scrollbar: no track, an 8px capsule thumb
  with tapered tips that widens to 12px while hovered or dragged instead of
  Chrome's platform rail widening with a track, shown while the list scrolls,
  is hovered or is dragged, and measured by the square root of the visible
  fraction so a long transcript keeps a thumb worth grabbing

## [0.4.27] - 2026-10-30

### Changed

- Markdown tables sit one step below prose, so a dense grid no longer reads as a
  larger paragraph
- Task lists show a single checkbox instead of a checkbox and a bullet, and the
  checkbox follows the message's text size
- The user's message bubbles and the working, steer and follow-up bars carry a
  faint tint of the accent instead of the grey surface
- The sidebar reads as a hierarchy: "Projects" is a small semibold label and a
  project name keeps the full foreground colour at regular weight, while its
  sessions are quieter
- The View menu uses the app's translucent popup and shadcn's item spacing, and
  its edge is a hairline instead of a faint ring
- The minimal view's divider is a hairline border, so it keeps one thickness

## [0.4.26] - 2026-10-29

### Changed

- The minimap's lines are a little heavier — 1.5 CSS px instead of 1, always at full strength instead of fading until you hover it, and one length up to six messages, where a three-line session used to draw three different lengths that read as a mistake rather than a shape
- Their colour now follows the contrast slider instead of being a fixed 50% of the muted text colour, so the rail goes from a faint grey at the slider's bottom to nearly the secondary text at the top

### Fixed

- Message minimap lines keep one weight down the whole column: they are drawn into one SVG measured in device pixels, so a scaled display or a page zoom no longer makes some lines thicker than their neighbours

## [0.4.25] - 2026-10-27

### Changed

- Headings are a six-step ladder that ends at body size: the fourth, fifth and sixth levels used to render as plain text, and every level now has its own line height, with the break above a heading that opens a section twice the paragraph gap
- A table's rows sit on a tighter line, a quote is indented further with its rule ending at the last line, and the padding inside inline code and around a horizontal rule follows the text size instead of staying at fixed pixels

## [0.4.24] - 2026-10-27

### Changed

- Corners are a little rounder across the window: buttons, inputs and rows sit at the app's 14px control tier and menus, dialogs and cards at 20px
- Small text keeps its size on the body's roomier line spacing, and three 17px titles (dialog and sheet titles, the session tree's search field) render at 15px
- The message minimap fades out instead of vanishing in one frame, and a list that is fading takes neither a click nor a tab stop
- Settings are written the moment you change them, one setting at a time: a change survives quitting the app, and one control can no longer overwrite a value it never touched

### Fixed

- In dark mode the composer is one colour: the model row no longer sits on a lighter band than the input above it
- The thinking label's sweep is a highlight again; on light themes it looked like a dark bar travelling across the text
- Ordered list items sit at twice the prose step, so a numbered list of short steps reads as separate actions

## [0.4.23] - 2026-10-27

### Added

- A full-page settings view (⌘ ,): Appearance, Chat and Shortcuts for pigi, and Models & Thinking, Message Delivery, Compaction, Retry, Resources and Advanced for pi, with a Global / This project switch
- Appearance settings: mode with a live preview, accent, background and foreground colours, contrast, text and code fonts and sizes
- Named themes (pigi, GitHub, Catppuccin, Nord, Gruvbox, Everforest, Notion, Linear), and copying the current look out as a theme file or pasting one back in
- 18 code themes and 12 diagram themes, each drawn under its picker as you choose
- Mermaid diagrams in messages: drawn as they stream, with a source switch, a zoom overlay and text that stays selectable

### Changed

- pigi's settings live in `settings.json` in the app data folder, migrated from localStorage on first launch
- The accent colours the app: solid buttons, the checked switch, links and sidebar actions
- Corners are continuous superellipses, sized by role, and the composer sits one tier above the transcript's cards
- Two type families, one for text and one for code; markdown headings and tables follow the text size
- Message spacing follows the text size, and a change of kind of block sits wider than two blocks of the same kind
- The Chat settings page is one row: a Default view switch instead of three described options
- The minimal view's shimmer runs inside the glyphs instead of revealing a second, brighter copy through a moving window
- Sidebar and menu rows show their shortcut as a keycap on hover
- A sent quote opens with its number on the quoted line

### Fixed

- The pi settings pages load in an unfocused or occluded window
- Opening a pigi settings page no longer reads pi's settings files, and a pi value outside its declared range is refused instead of written
- A settings file that cannot be parsed is left alone instead of being replaced
- Popover, dialog and context-menu surfaces keep a visible hairline around their corners
- Tool status, diff, toast and warning colours follow the theme, so they stay readable in dark mode
- The terminal follows the code font and size, and the native window chrome and menus follow the chosen appearance
- Code blocks use a dark palette in dark mode, every token clearing 3:1
- A streaming code block is highlighted on a throttle instead of on every chunk, so long output no longer stutters
- Update checks no longer pull the window mid-countdown, and the update window closes itself when a background check finds nothing
- Message minimap lines are one device pixel thick on every display
- The minimap's hover list opens flush against the side edge and covers the lines
- The minimap list works from the keyboard: Tab reaches its rows, Enter opens it, Escape closes it and returns to the lines
- The live state label's letters no longer look doubled
- With reduced motion the live state label pulses at a fixed pace

## [0.4.22] - 2026-10-24

### Fixed

- The update window sizes itself to its content, so a download's Cancel and Install buttons are no longer clipped off the bottom
- "Check for Updates" opens the window when a background check is already running instead of appearing to do nothing
- "Install and Restart" says "Restarting to install…" while the bundle is swapped in, and "Later" only closes the window

## [0.4.21] - 2026-10-24

### Changed

- The update window sits higher over the main window, and "pigi is up to date" counts down the two seconds it stays on screen

## [0.4.20] - 2026-10-24

### Changed

- The update window is a normal titled window that sizes itself to what it has to show: one line for a check, a progress bar and its buttons while a download runs
- It reads like a system update dialog, with the app icon, a bold status, a progress bar and a byte count
- "Check for Updates" opens its window immediately, and "pigi is up to date" is shown there instead of as a notification in the main window
- Settings menu rows match the size of the sidebar row they belong to

## [0.4.19] - 2026-10-24

### Added

- "Check for Updates…" in the macOS app menu, following the update status

### Fixed

- The update dot and the download progress bar use the theme accent instead of a hard-coded blue
- Background update checks are spread by ±10 minutes instead of landing on a fixed cadence

## [0.4.18] - 2026-10-23

### Added

- pigi updates itself: a downloaded update lights a dot on Settings, which offers "Update to <version>" and restarts into it
- "Check for Updates" in the Settings menu, with a progress window that can cancel the download

## [0.4.17] - 2026-10-23

### Fixed

- Cmd+Enter sends the quotes again after quoting a passage in a session whose quotes panel was already open

## [0.4.16] - 2026-10-23

### Added

- Dragging either sidebar past its minimum width collapses it, with the same animation as the toggle; dragging back out reopens it
- A plus under the quotes adds a global comment on all of them, sent after the quotes and labelled as such
- Cmd+Enter sends the quotes while the right sidebar is open, and the shortcut is shown on the Send button

### Changed

- The right sidebar can be dragged much wider on a large window, and narrows again when the window does
- Sent quotes form a more compact message, without blank lines between them

### Fixed

- Sending the first message of a new session no longer opens the right sidebar just because another session had it open; each session remembers its own sidebar

## [0.4.15] - 2026-10-23

### Added

- Quote passages from the conversation: select text in a message and a Quote button appears (or press Q); add a comment, and the quotes collect in a right sidebar where they can be edited, deleted and sent as one message. Unsent quotes are kept across restarts

### Changed

- Unsent text in the chat input is kept across restarts, for each session and for the new-chat screen

### Fixed

- When an extension compacts the context right after a response, the working bar stays visible and messages sent during compaction show in the queue
- Editing a message whose response was stopped mid tool call goes back to before it instead of reporting that there is no reply to leave
- Moving the session to the message it is already at keeps a model or thinking level change made after it
- After going back to before the first message, the session tree opens the newest version
- Buttons and other controls show a focus ring only while navigating with Tab or the arrow keys

## [0.4.14] - 2026-10-22

### Added

- A session that finishes while you are in another one shows an accent dot in the sidebar in place of its time, until you open it
- Edit any message you sent: the conversation goes back to before it, without a summary, and the message returns to the chat input

### Changed

- The branch summary prompt's two answers are styled alike, with no highlighted default
- The path completion list opens above the path you are typing, and folders no longer end with `/`

### Fixed

- Extension commands such as `/plannotator-review` show a terminal icon in the chat input, matching the sent message
- Spinners keep turning while the app is busy, for example while a long tool output streams in
- A message taken back to the chat input keeps its images and files instead of showing them as text

## [0.4.13] - 2026-10-21

### Added

- Attach files and images with the `+` button, by pasting, or by dropping them on the chat input; messages sent while the agent is working keep their attachments
- Images and files you send appear inside your message; click one to see it larger or to preview it
- Type `@` to reference a project file: recent files show first, then results narrow as you type
- Type a path to complete files and folders with fuzzy matching; a completed path becomes a chip, and Backspace goes up a level
- Skills, slash commands and `@` references show as labels with icons, in the chat input and in sent messages
- A button at the top of the sidebar, or Cmd+B, hides and shows it

### Changed

- Choosing a project with `#` returns focus to the chat input
- New sidebar icons, and the session title in the toolbar no longer has one in front of it
- Send and stop buttons use the accent colour, and the chat input's lines are taller

### Fixed

- Stopping the agent puts queued steer and follow-up messages back in the input in the order you sent them
- Sending the same steer message twice shows both instead of hiding the second

## [0.4.12] - 2026-10-17

### Changed

- The session list and the chat area meet in a straight line, with the hairline between them running the full height of the window
- The macOS download is named `pigi-arm64.dmg`, so the site can link to the newest release as soon as it is published

## [0.4.11] - 2026-10-12

### Added

- Session tree: the tree button in the session toolbar (or `/tree`) shows every branch of the session — search it, filter by User, Assistant, Tools or Summaries, hover a row to preview the message, and pick one to continue from there
- A move that would leave messages behind can summarize them first, and a running summary can be cancelled
- Fork any message into a new chat, with the same model and thinking level; forking before one of your messages puts it back in the input
- Forked chats are listed under the chat they came from
- Every message shows `tree` and `fork` actions on hover, with a `?` that explains the session tree
- The new-chat input keeps its draft across restarts

### Changed

- Tooltips use the app's surface colour instead of black, and icons are drawn slightly bolder

### Fixed

- Draft text is no longer lost when switching between a session and the new-chat screen
- Narrowing the window keeps the chat input and the streaming queue aligned with the messages

## [0.4.10] - 2026-09-11

### Changed

- Auto-follow keeps the message list glued to the exact bottom, and every auto-scroll lands fully at the end
- Scrolling up more than a few lines stops the follow, and scrolling back down resumes it; small wheel nudges no longer stop it
- The Working bar and queued messages reserve their own space below the list instead of covering the transcript
- Less empty space below the last message

### Fixed

- Content that grows after it appears no longer leaves the list stuck short of the bottom

## [0.4.9] - 2026-09-11

### Added

- The session toolbar is a title bar region: drag anywhere on it to move the window

### Changed

- Picking a model keeps the picker open and asks for a thinking level, so a new model can be confirmed in one go
- Tool cards shift less while a tool runs: edit and write cards reserve their height up front, and command output is capped sooner
- Long lines in tool output scroll horizontally instead of wrapping
- The chat input's maximum height before scrolling is halved
- The login dialog has OAuth and API key tabs side by side, with the API key form always visible
- Terminal tabs are slightly taller

### Fixed

- New sessions no longer start without gateway or OAuth models after another process refreshes a login token; logging in or out is picked up by every session
- A collapsed project no longer makes the sidebar wobble sideways
- Queued steer and follow-up messages no longer cover the transcript
- Selected text in the terminal is clearly visible in both themes
- Resizing the window no longer stutters or makes messages jump at 768, 1024, 1280 or 1536px
- Opening or resizing the terminal no longer covers messages
- Dragging the sidebar edge or the terminal handle follows the pointer and no longer re-renders the app on every move
- The git branch in the chat input refreshes when you create a session, switch sessions or switch project
- Code blocks, tables, tool output and the login dialog no longer rubber-band when scrolled past their edge on macOS
- Tab bars lay out horizontally and highlight the active tab, and the active terminal tab shows its grey background again

## [0.4.8] - 2026-09-07

### Added

- Cmd+Shift+[ and Cmd+Shift+] cycle through threads in the current project, wrapping at the ends
- `/reload` reloads extensions, skills, prompts, settings and context files without restarting the session

### Fixed

- Switching back to a session restores the position you left it at
- Auto-follow no longer stalls or vibrates while output streams in
- Arrow-up/down history recall respects soft-wrapped lines

## [0.4.7] - 2026-09-06

### Fixed

- Streaming message lists no longer freeze mid-turn or jolt when a turn finishes
- Auto-follow keeps following while the latest message is fully visible, instead of stopping at random
- Switching sessions restores your exact scroll position
- Opening the terminal no longer shifts the message list
- Read groups no longer freeze while the model thinks between file reads

## [0.4.6] - 2026-09-01

### Added

- Extension commands appear in the slash command menu, and extension notifications arrive as toasts
- Slash commands render as a styled pill instead of a plain text bubble

### Changed

- Read groups say "Explored N files", collapse git read-only commands separately, and show the thinking count while streaming
- More commands are recognised as read-only and collapsed into those groups

### Fixed

- Compact and Show All lists no longer jump away from the bottom while many messages stream in
- Code blocks with long lines scroll horizontally instead of clipping
- The copy button no longer scrolls away when scrolling code sideways
- Editing a queued message during compaction no longer fails silently

## [0.4.5] - 2026-08-17

### Fixed

- Sending a message scrolls to the bottom and follows the reply again, without the chat input's collapse tripping auto-follow

## [0.4.4] - 2026-08-17

### Added

- Code blocks have a copy button in the top-right corner

### Fixed

- Scrolling up locks the message list so streaming output cannot drag it back to the bottom
- The arrow keys in the chat input move the cursor between lines first, and recall history only at the first or last line
- The message list no longer shifts a few pixels when it settles at the bottom
- The model list can no longer get stuck after a bad start; loading it is time-boxed and retried

## [0.4.3] - 2026-08-13

### Added

- A Minimal view for following agent work and final responses

### Changed

- User messages are more compact, so long prompts take less screen space
- Subagents run through the standalone pi CLI instead of opening another window

### Fixed

- The chat input recovers after prompt or session startup errors
- Closing the terminal no longer disturbs the chat layout

## [0.4.2] - 2026-08-07

### Added

- Arrow-up recalls your previous messages and arrow-down walks forward again, keeping whatever you had started typing

### Fixed

- "Show less" sticks, instead of flickering and springing back open when the selected chat is hidden
- Clicking a chat in the sidebar no longer refreshes or jumps the list
- A new chat's thinking levels match the model you are on

## [0.4.1] - 2026-08-05

### Changed

- The view mode menu highlights the selected option with the accent colour and a check mark

### Fixed

- The model picker reliably shows the full model list, including gateway models that load over the network
- A new chat's thinking levels follow your most recently used model

## [0.4.0] - 2026-07-31

### Fixed

- The message list no longer bounces while pinned to the bottom during fast streaming

## [0.3.20] - 2026-07-29

### Changed

- Tool blocks are cleaner: no internal border lines, tighter spacing, and a status bar with coloured text instead of a background
- The conversation header is slightly taller and shows the title without the old spacing
- Tool block status bars show a success or failure icon and the elapsed time only
- Links, search highlights, the minimap and the working indicator use a refined indigo accent
- Large edit diffs and large highlighted output render faster

### Fixed

- The message list no longer vibrates shortly after opening a conversation
- The working indicator and the sidebar's running spinner stay smooth while the app renders
- Syntax highlighting in write previews and command output no longer flickers as it streams

## [0.3.19] - 2026-07-27

### Added

- A terminal panel that slides up from the bottom, toggled with Cmd+J or the title-bar icon, resizable by its top edge and coloured by the theme
- Terminal tabs per project: the shells, their scrollback and their order are kept when you switch away and back, macOS line-editing shortcuts work inside, and closing the last tab returns focus to the chat input

### Changed

- An over-long command in a collapsed read group ellipsizes in the middle, keeping the filename and line range visible

### Fixed

- Sessions are auto-named again after the first exchange

## [0.3.18] - 2026-07-23

### Added

- Edit, write and bash tool cards show a placeholder skeleton while they run

### Changed

- The title bar's bottom border is a hairline matching the sidebar divider
- A successful edit no longer fills its status footer with green, so it no longer blends into the diff above it

## [0.3.17] - 2026-07-23

### Changed

- Paragraphs and lists share one tighter line height
- Thinking blocks and long tool output stay anchored to their latest lines when collapsed

### Fixed

- New sessions no longer open with an incomplete model list; the picker keeps refreshing until the full list is available
- Auto-scroll lands exactly at the bottom instead of a few pixels short

## [0.3.16] - 2026-07-22

### Added

- Long content (tool output, thinking, user messages) collapses at 300px with Show more / Show less
- Consecutive read-only calls group into one compact row such as "Looked into 3 files", with search highlights inside
- Thinking blocks show their duration, ticking live while streaming
- Message search with Cmd+F: fuzzy search across messages and tool output, with keyboard navigation and a highlight for each match

### Changed

- Tool block command timeouts show in the status bar, and the Show more chevron points the right way
- Thinking blocks collapse at 120px, and sub-second durations read `0.xs`
- Markdown has a more comfortable line height, headings group with their content, and code blocks have better spacing
- The pi SDK upgrade adds Kimi K3 and keeps API key and OAuth credentials across launches

### Fixed

- Thinking blocks between read tools no longer break the group apart
- Thinking durations are no longer missing or zero when deltas arrive in bursts
- A search match hidden in clamped content expands the block to reveal it
- Search highlights stay visible while paging between matches, and a match below the fold expands its block
- Scroll-to-bottom reaches the last message, and the sidebar scrolls to the selected session

## [0.3.14] - 2026-07-10

### Added

- The minimap highlights the bar closest to your scroll position, and hovering the popover scrolls the active item into view
- OAuth device code flow, with a toast that copies the code and opens the verification page

### Changed

- Assistant messages use the app's default line height instead of a fixed 24px
- The message toolbar's spacing moved below the buttons, and the bottom fade is shorter
- The pi SDK upgrade brings 30+ providers and models

### Fixed

- The list no longer jitters when long content streams in

## [0.3.13] - 2026-07-01

### Fixed

- Switching sessions no longer triggers the typewriter animation on the toolbar title

## [0.3.12] - 2026-07-01

### Added

- Double-click the session name in the toolbar to rename it inline, with the same typewriter effect as the sidebar

### Changed

- An expanded compact read group shows its tool cards inside one bordered container

## [0.3.11] - 2026-06-30

### Added

- A session toolbar with the session title and a view mode toggle between compact and full tool blocks

## [0.3.10] - 2026-06-30

### Added

- A compact read view: consecutive read-only calls collapse into one line, with the commands listed underneath

### Fixed

- Pressing Enter while selecting text with an input method no longer renames a session
- Escape aborts a running session only when the chat input or the message list is focused
- New chats recover from failed startup attempts without resending old failed messages
- The session switcher shows accurate relative times, and clicking a session or project refreshes the list

## [0.3.9] - 2026-06-28

### Fixed

- New sessions appear in the sidebar and switcher after the first response completes
- Navigation forward and back no longer skips sessions that are still loading
- Session titles are no longer truncated to 48 characters
- Switching sessions restores the scroll-to-bottom position

## [0.3.8] - 2026-06-14

### Fixed

- Clicking a session switches the active project to that session's project
- Opening a new session no longer loses the previous one from navigation history

## [0.3.7] - 2026-06-14

### Added

- A new session view with a centred heading, a centred input box and a clean footer
- `#` in the input opens a project picker with fuzzy search

### Changed

- Thinking level options are per model, and the model is chosen on the first send
- Markdown tables have rounded corners, and the transcript is more compact

### Fixed

- Switching to a model that does not support the current thinking level resets it instead of sending it
- The copy button sits flush below thinking blocks, and the session switcher shows accurate relative times

## [0.3.6] - 2026-06-08

### Changed

- Auto-rename triggers after 3 text messages instead of after the first full turn

## [0.3.5] - 2026-06-08

### Added

- Auto-rename: after 3 text messages a lightweight call generates a title, with a typewriter animation in the sidebar

### Fixed

- The session switcher no longer lags when searching 1000+ sessions, and always selects the first result
- Manual rename refreshes the right project's list

## [0.3.4] - 2026-06-07

### Fixed

- The Ctrl+R session switcher works in production builds

## [0.3.3] - 2026-06-07

### Added

- Each session remembers its scroll position
- A user message minimap on the right of the chat: hover for the list, click to jump
- A session switcher (Ctrl+R) across all projects, with Ctrl+Tab to toggle to the previous one
- Cmd+[ and Cmd+] navigate session history, browser-style
- Switching sessions expands the project and scrolls to the session in the sidebar

### Fixed

- Cmd+R no longer breaks session resume
- Renamed sessions show their new name in the switcher

## [0.3.2] - 2026-06-03

### Changed

- Edit diffs render from the server-computed diff, so custom edit tools show a diff too

### Fixed

- Compaction errors show as their own message below the failure marker
- Clicking a recently created session no longer opens a different one

## [0.3.1] - 2026-06-03

### Fixed

- New chat no longer appears twice in the sidebar

## [0.3.0] - 2026-06-03

### Added

- New chat opens instantly, from a warm background process that already has model info and settings

### Changed

- Switching to a previous session is near-instant
- A new chat starts on the last-used model and thinking level

### Fixed

- Alt+Enter follow-up messages work during streaming

## [0.2.8] - 2026-05-31

### Added

- Slash command autocomplete includes skills

### Changed

- Enter sends and Shift+Enter inserts a newline
- New sessions inherit the last-used model and thinking level
- Long messages fade out at the edge instead of being cut off
- Refined tool blocks, icons, menus and dialogs

### Fixed

- The accent follows the macOS accent colour setting

## [0.2.7] - 2026-05-29

### Changed

- The window border is hairline-thin, aligned with the native look
- Bash output is plain text, while code keeps full syntax highlighting
- Session labels sit slightly darker than folder labels

### Fixed

- No more macOS Keychain prompt on launch
- Escape and the send button abort a running compaction, and steer messages sent during compaction are replayed after it
- Compacted sessions show "Compacted N times" when reopened

## [0.2.6] - 2026-05-26

### Changed

- Markdown links use the accent colour
- Code highlighting uses the `one-light` theme
- Thinking blocks are tighter and more legible
- Text is antialiased, and the light theme's foreground is softer
- Settings popovers and context menus are frosted glass, as is the sidebar

### Fixed

- The bash block's "more" button sits right-aligned below the timeout instead of stranded mid-line

## [0.2.5] - 2026-05-23

### Added

- Double-click a session name in the sidebar to rename it inline

### Changed

- A project's add button appears on hover

### Fixed

- No more duplicate empty sessions when creating new chats quickly

## [0.2.4] - 2026-05-23

### Changed

- The font weight scale follows the macOS feel, so text renders lighter

## [0.2.3] - 2026-05-23

### Changed

- Font weights tuned per role: UI controls, dialog titles and markdown bold each sit at their own weight
- Toasts moved to the bottom-right with transparent borders

## [0.2.2]

### Added

- A settings popover in the sidebar footer with Login and Settings
- Reusable frosted-glass menus
- The chat input grows to 35vh and scrolls at its maximum
- The system accent colour for focus rings and sidebar highlights
- Customisable keyboard shortcuts

### Changed

- A 0.5px hairline between the sidebar and the main content
- Empty states share one welcome screen
- The app uses the system font stack instead of a web font
- Text on UI chrome is not selectable, while messages stay selectable
- Dialogs open without taking focus

## [0.2.1] - 2026-05-15

### Added

- An empty state when no session is open, with a shortcut hint for first-time users
- Cmd+O opens a project directory

### Changed

- The chat input, message list and streaming queue hide when no session is open

## [0.2.0] - 2026-05-11

### Added

- App icon

### Fixed

- A running session stays visible when its project is collapsed

## [0.1.0] - 2026-05-10

### Added

- Initial release: a desktop GUI for pi with project management, a session sidebar and a fast transcript
