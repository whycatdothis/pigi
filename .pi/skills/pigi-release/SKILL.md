---
name: pigi-release
description: Commit changes and release new versions. Use when asked to commit, release, bump version, or tag a release.
---

# pigi Release

## Commit

Only on explicit instruction. Run `npm run check` if code changed since the last run.

1. Add a user-facing entry under `## [Unreleased]` in `CHANGELOG.md` (`### Added` /
   `### Changed` / `### Fixed`). Describe what the user experiences; no file names,
   refactors, or tooling. Skip for internal-only changes.
2. Conventional commit message (`fix:`, `feat:`, `refactor:`, `chore:`, `docs:`), bullets
   in the body for non-trivial changes. Changelog and code in one commit.
3. Never amend or force-push without asking.

## Release

Pushing a `v*` tag runs `.github/workflows/release.yml`: build, sign, notarize, publish,
and fill the release notes from the `## [<version>]` section of `CHANGELOG.md`. Header
and tag must match exactly.

1. On `main`, clean tree, `## [Unreleased]` non-empty (else ask).
2. `npm version <version> --no-git-tag-version` (patch by default; updates lock file too).
3. Rename `## [Unreleased]` to `## [<version>] - YYYY-MM-DD`.
4. Commit `release: v<version>`.
5. `git tag -a v<version> -m "v<version>" && git push --follow-tags` (annotated tag
   required; `--follow-tags` skips lightweight tags).
6. Report the run: `gh run list --workflow release.yml --limit 1`.
