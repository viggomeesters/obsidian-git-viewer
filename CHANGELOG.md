# Changelog

All notable changes to Git Viewer are documented here.

## 0.2.0 - 2026-06-08

- Add explicit selected-file commits from the Git Viewer sidebar.
- Add checkboxes, commit message input, selected count, and Commit selected action.
- Commit through a temporary Git index so unrelated staged and unstaged files are not included.
- Keep pull, push, clone, branch management, discard, and reset out of scope.

## 0.1.1 - 2026-06-08

- Hide hidden/internal Git paths that Obsidian cannot open as vault files.
- Keep deleted status entries visible but disabled instead of showing repeated unavailable-file notices.
- Remove push from the near-term roadmap.

## 0.1.0 - 2026-06-08

- Initial public release.
- Add lightweight read-only Git status sidebar view.
- Group files into staged, changed, untracked, deleted, renamed, and conflicted sections.
- Open vault files directly in Obsidian from the status list.
- Refresh manually and after vault file events.
- Parse local `git status --porcelain=v1 -z --untracked-files=all` output without network access.
