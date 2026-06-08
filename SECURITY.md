# Security Policy

## Supported versions

Only the latest release is actively supported.

## Reporting a vulnerability

Please report security issues privately by emailing the maintainer or opening a minimal GitHub security advisory if available.

Do not include sensitive vault content in public issues. If a reproduction needs file paths, reduce them to synthetic names first.

## Security posture

Git Viewer runs local `git` commands against the current vault or repository and renders status output inside Obsidian.

The plugin code does not make network requests and does not read or write the system clipboard.

History is read-only. It uses local `git log` and `git show --name-status` commands to render recent commits and changed file lists.

The only write action is **Commit selected**. It creates a commit from explicitly selected paths through a temporary Git index, then refreshes the selected paths in the real index after the branch is advanced. It does not run pull, clone, fetch, merge, rebase, stage, unstage, push, reset, discard, or branch management commands.
