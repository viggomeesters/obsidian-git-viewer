# Git Viewer

Git Viewer is a lightweight read-only Git status viewer for Obsidian. It is built for people who want to stay inside Obsidian, see exactly which vault files changed, and open those files without launching a heavier Git client or Visual Studio Code.

## Features

- Shows Git status in a compact Obsidian sidebar view.
- Groups files into Staged, Changed, Untracked, Deleted, Renamed, and Conflicted.
- Opens files inside Obsidian when they are inside the current vault.
- Uses local Git porcelain output through the `git` CLI.
- Refreshes manually and after vault file events.
- Stays read-only in v0.1.

## Non-goals

Git Viewer v0.1 deliberately does **not** include:

- pull
- clone
- fetch
- merge
- rebase
- branch create/switch/delete
- force push
- commit
- push
- stage/unstage
- discard/reset/delete
- conflict resolution
- automatic sync

The plugin is a status viewer first. Write actions should only be added after the status and diff foundations are stable.

## Roadmap

### v0.2: Commit selected files

Commit support should be scoped and explicit:

- select files with checkboxes
- enter a commit message
- preview exactly which files will be committed
- commit through a temporary index or equivalent restore-safe strategy
- never accidentally include unrelated staged or unstaged files

It should not use a naive `git add <files> && git commit` flow by default, because that can disturb existing staged state in busy vaults.

### v0.3: Push current branch

Push support should remain narrow:

- push only the current branch
- require an upstream
- no pull
- no force
- no branch management
- no credential UI
- show compact errors when Git rejects the push

## Installation

Manual install:

1. Build or download `main.js`, `manifest.json`, and `styles.css`.
2. Create `.obsidian/plugins/git-viewer/` in your vault.
3. Put the three files in that folder.
4. Reload Obsidian.
5. Enable **Git Viewer** in **Settings -> Community plugins**.

## Usage

Open the command palette and run **Open Git Viewer**, or click the Git Viewer ribbon icon. The view opens in the right sidebar.

Click a file to open it in Obsidian. Deleted files and files outside the current vault cannot be opened.

## Development

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Security and privacy

Git Viewer runs local `git` commands against the current vault/repository. It does not make network requests and does not modify files in v0.1.

## License

[MIT](LICENSE)
