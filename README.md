<p align="center">
  <img src="assets/hero.svg" alt="Git Viewer for Obsidian" width="100%">
</p>

<p align="center">
  <a href="https://github.com/viggomeesters/obsidian-git-viewer/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/viggomeesters/obsidian-git-viewer?style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-green?style=flat-square"></a>
  <img alt="Obsidian 1.5.0+" src="https://img.shields.io/badge/Obsidian-1.5.0%2B-7c3aed?style=flat-square">
  <img alt="Read-only" src="https://img.shields.io/badge/mode-read--only-0f766e?style=flat-square">
</p>

# Git Viewer

Git Viewer is a lightweight read-only Git status viewer for Obsidian. It is built for people who want to stay inside Obsidian, see exactly which vault files changed, and open those files without launching a heavier Git client or Visual Studio Code.

![Git Viewer preview](assets/screenshot.svg)

## Features

- Shows Git status in a compact Obsidian sidebar view.
- Groups files into Staged, Changed, Untracked, Deleted, Renamed, and Conflicted.
- Opens files inside Obsidian when they are inside the current vault.
- Uses local Git porcelain output through the `git` CLI.
- Refreshes manually and after vault file events.
- Stays read-only in v0.1.
- Makes no network requests from plugin code.

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

### Community plugin directory

Git Viewer is ready for submission to the Obsidian Community plugin directory. Once accepted, it can be installed from **Settings -> Community plugins -> Browse** inside Obsidian.

### Manual installation

Until the community directory submission is accepted:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/viggomeesters/obsidian-git-viewer/releases/latest).
2. Create this folder in your vault: `.obsidian/plugins/git-viewer/`.
3. Put the downloaded files in that folder.
4. Reload Obsidian.
5. Enable **Git Viewer** in **Settings -> Community plugins**.

### BRAT installation

For beta testing, install the plugin with [BRAT](https://github.com/TfTHacker/obsidian42-brat) using this repository URL:

```text
https://github.com/viggomeesters/obsidian-git-viewer
```

## Usage

Open the command palette and run **Open Git Viewer**, or click the Git Viewer ribbon icon. The view opens in the right sidebar.

Click a file to open it in Obsidian. Deleted files and files outside the current vault cannot be opened.

## Development

```bash
npm install
npm run build
npm run lint
npx tsc --noEmit
npm test
```

For local development, copy or symlink this repository into `.obsidian/plugins/git-viewer/` inside a Git-backed Obsidian test vault.

## Release process

Obsidian installs community plugin files from GitHub releases. For each release:

1. Update `manifest.json`, `package.json`, and `versions.json` when the plugin version or minimum Obsidian version changes.
2. Run `npm install`, `npm run build`, `npm run lint`, `npx tsc --noEmit`, and `npm test`.
3. Create a GitHub release whose tag exactly matches `manifest.json.version`.
4. Attach `main.js`, `manifest.json`, and `styles.css` as release assets.

The repository includes a GitHub Actions release workflow with artifact attestation support. If GitHub Actions is disabled for the owner account, manual releases are still usable for Obsidian, but the Community automated review may show a recommendation about missing artifact attestations.

## Community directory submission

The repository is prepared for Obsidian Community plugin submission. The remaining submission step must be completed by the repository owner in the Obsidian Community site because it requires signing in, linking GitHub, and confirming the developer policies/support commitment.

Submit this repository URL:

```text
https://github.com/viggomeesters/obsidian-git-viewer
```

The current release is ready for review:

- root `README.md`, `LICENSE`, and `manifest.json` exist
- `manifest.json.id` is `git-viewer`
- `manifest.json.version` is `0.1.0`
- `versions.json` maps `0.1.0` to Obsidian `1.5.0`
- GitHub release `0.1.0` should include `main.js`, `manifest.json`, and `styles.css`

Official references:

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Manifest](https://docs.obsidian.md/Reference/Manifest)
- [Obsidian releases repository](https://github.com/obsidianmd/obsidian-releases)

## Security and privacy

Git Viewer runs local `git` commands against the current vault or repository. It does not make network requests, does not use clipboard APIs, and does not modify files in v0.1.

## License

[MIT](LICENSE)
