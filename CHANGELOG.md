# Changelog

All notable changes to Git Viewer are documented here.

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
