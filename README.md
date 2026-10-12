<p align="center">
  <img src="./build/icon.png" alt="pigi logo" width="128">
</p>

<p align="center">
  <img alt="GitHub License" src="https://img.shields.io/github/license/whycatdothis/pigi?style=flat-square&color=blue">
  <img alt="GitHub Release" src="https://img.shields.io/github/v/release/whycatdothis/pigi?style=flat-square&color=blue">
</p>

<h1 align="center">pigi</h1>

<p align="center">
  <strong>A sleek desktop GUI for <a href="https://pi.dev">pi</a></strong>
</p>

---

## Features

- Clean, native UI that stays out of your way
- Faithful to the original pi experience
- Respects your pi config — picks up models, skills, and settings automatically
- Built with performance in mind, no compromises

![pigi](./resources/hi-pigi.png)

### Highlights

#### Instant history

Past sessions open instantly, even long ones.

#### Fork

Branch a new session from any user message. Forks stay nested under their original session in the sidebar.

![Fork](./resources/fork.png)

#### Session tree

Browse and jump between branches of a session (`/tree` or the toolbar).

![Session tree](./resources/tree.png)

#### View modes

Switch how the transcript renders tool activity.

**Minimal** — Codex-style: working timer, tool cards, final summary.

![Minimal view](./resources/minimal-view.png)

**Compact** — collapses consecutive read-only tool calls into one group.

![Compact view](./resources/compact-view.png)

**Show All** — every tool call as its own block, like the native pi log.

![Show All view](./resources/show-all-view.png)

#### Session search

`Ctrl+R` fuzzy-searches across all sessions.

![Session search](./resources/session-switcher.png)

#### Chat minimap

Overview of your messages for quick navigation in long chats.

![Chat minimap](./resources/minimap.png)

#### Built-in terminal

Toggle with `Cmd+J`.

![Built-in terminal](./resources/terminal.png)

## Install

Download the latest build from [Releases](https://github.com/whycatdothis/pigi/releases).

## Develop

```bash
npm install
npm run dev
```

Build for distribution:

```bash
npm run build:mac
```

## License

[Apache 2.0](./LICENSE)
