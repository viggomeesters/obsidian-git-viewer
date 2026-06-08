import assert from "node:assert/strict";
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const main = fs.readFileSync("src/main.ts", "utf8");
const gitStatus = fs.readFileSync("src/git-status.ts", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

assert.equal(manifest.id, "git-viewer");
assert.equal(manifest.name, "Git Viewer");
assert.equal(manifest.isDesktopOnly, true);
assert.match(manifest.description, /read-only/i);
assert.match(gitStatus, /status", "--porcelain=v1", "-z", "--untracked-files=all"/);
assert.match(main, /registerView/);
assert.match(main, /addRibbonIcon/);
assert.match(main, /getAbstractFileByPath/);
assert.match(main, /getVisibleEntries/);
assert.match(main, /hidden or internal Git path/);
assert.equal(main.includes("git commit"), false);
assert.equal(main.includes("git push"), false);
assert.equal(main.includes("git pull"), false);
assert.equal(styles.includes("!important"), false);

console.log("Git Viewer smoke checks passed.");
