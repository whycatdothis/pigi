<p align="center">
  <img src="./build/icon.png" alt="pigi logo" width="128">
</p>

<p align="center">
  <img alt="GitHub License" src="https://img.shields.io/github/license/whycatdothis/pigi?style=flat-square&color=blue">
  <img alt="GitHub Release" src="https://img.shields.io/github/v/release/whycatdothis/pigi?style=flat-square&color=blue">
</p>

<h1 align="center">pigi</h1>

<p align="center">
  <strong>A sleek desktop GUI for pi</strong>
</p>

<h3 align="center">
  <a href="https://pigi.pink">pigi.pink</a>
</h3>

---

## Features

- Clean, native UI that stays out of your way
- Respects your pi config — picks up models, skills, and settings automatically
- Built with performance in mind, no compromises
- Rich features:
  - **Fork & tree** — branch a new session from any message, and rewind through the session tree without losing a branch.
  - **Session search & minimap** — `Ctrl+R` fuzzy-searches every session; the minimap jumps around a long chat.
  - **View modes** — Minimal, Compact or Show All, from a clean summary to the full pi log.
  - **Files & Git** — browse and preview project files, review diffs and commits beside the chat.
  - **Quote** — select text in a reply, file or diff and send it back with your comment.
  - **Subagents** — agents can run tasks in child sessions with `pigi subagent`.
  - **Packages** — install and update pi extensions, skills, prompts and themes.
  - **Terminal** — a built-in shell with `Cmd+J`.
  - **Appearance** — light/dark, named themes, accent colours and fonts.

See them in action at **[pigi.pink](https://pigi.pink)**.

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
