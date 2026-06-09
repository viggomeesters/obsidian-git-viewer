# Changelog

All notable changes to Git Viewer are documented here.

## 0.3.1 - 2026-06-09

- Raise the minimum Obsidian version to match the workspace API used by the sidebar reveal flow.
- Shorten command IDs and command names for Community review.
- Await the sidebar reveal promise and remove redundant DOM element assertions.
- Rebuild release assets for Community review; artifact attestations require account-level GitHub Actions to be enabled.

## 0.3.0 - 2026-06-08

- Add Changes and History tabs.
- Add read-only History view with the latest 50 commits.
- Add commit details with full hash, author, timestamp, message body, and changed files.
- Add a post-commit "View in History" shortcut for the newly created commit.
- Keep History local-only through `git log` and `git show --name-status`.

## 0.2.1 - 2026-06-08

- Add Select all and Unselect all controls to the commit panel.

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
