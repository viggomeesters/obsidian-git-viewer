# Contributing

Thanks for helping improve Git Viewer.

## Local setup

```bash
npm install
npm run build
npx tsc --noEmit
npm test
```

For manual testing, copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/git-viewer/` in a Git-backed test vault, reload Obsidian, and open the Git Viewer view.

## Pull requests

- Keep Git Viewer minimal and status-focused.
- Keep History read-only and local-only.
- Keep commit behavior explicit and selected-file only.
- Do not add stage, unstage, push, pull, reset, discard, branch, merge, rebase, or clone behavior.
- Do not add network APIs in plugin code unless the security model and README are updated.
- Do not add clipboard access without explicit user action and documentation.
- Run build, typecheck, lint, and tests before opening a PR.

## Release assets

Community releases must include:

- `main.js`
- `manifest.json`
- `styles.css`
