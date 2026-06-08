# Security Policy

## Supported versions

Only the latest release is actively supported.

## Reporting a vulnerability

Please report security issues privately by emailing the maintainer or opening a minimal GitHub security advisory if available.

Do not include sensitive vault content in public issues. If a reproduction needs file paths, reduce them to synthetic names first.

## Security posture

Git Viewer is read-only in v0.1. It runs local `git` commands against the current vault or repository and renders status output inside Obsidian.

The plugin code does not make network requests, does not read or write the system clipboard, and does not modify files. It does not run pull, clone, fetch, merge, rebase, stage, unstage, commit, push, reset, discard, or branch management commands.
