import assert from "node:assert/strict";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const readme = fs.readFileSync("README.md", "utf8");
const main = fs.readFileSync("src/main.ts", "utf8");
const gitStatus = fs.readFileSync("src/git-status.ts", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

assert.equal(packageJson.scripts.build, "NODE_ENV=production node esbuild.config.mjs");
assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
assert.equal(packageJson.scripts.lint, "node tests/lint.mjs");
assert.equal(manifest.id, "git-viewer");
assert.equal(manifest.isDesktopOnly, true);
assert.match(manifest.description, /read-only/i);
assert.match(gitStatus, /status", "--porcelain=v1", "-z", "--untracked-files=all"/);
assert.match(gitStatus, /formatGitCommandError/);
assert.match(main, /registerView/);
assert.match(main, /getRightLeaf/);
assert.match(main, /getAbstractFileByPath/);
assert.match(readme, /No pull/i);
assert.match(readme, /Commit selected files/);
assert.equal(main.includes("commit selected"), false);
assert.equal(main.includes("git commit"), false);
assert.equal(main.includes("git push"), false);
assert.equal(main.includes("git pull"), false);
assert.equal(main.includes("git reset"), false);
assert.equal(styles.includes("!important"), false);

console.log("Git Viewer lint checks passed.");
