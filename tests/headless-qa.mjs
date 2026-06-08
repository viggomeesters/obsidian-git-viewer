import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import esbuild from "esbuild";

const requiredAssets = ["main.js", "manifest.json", "styles.css"];
for (const asset of requiredAssets) {
  assert.equal(fs.existsSync(asset), true, `${asset} exists`);
}

const outdir = path.join(".tmp", "qa");
const outfile = path.join(outdir, "git-status.mjs");
fs.mkdirSync(outdir, { recursive: true });
await esbuild.build({
  bundle: true,
  entryPoints: ["src/git-status.ts"],
  format: "esm",
  outfile,
  platform: "node",
  target: "es2022",
});
const { groupEntries, parsePorcelainV1z } = await import(path.resolve(outfile));

const testVault = fs.mkdtempSync(path.join(os.tmpdir(), "git-viewer-vault-"));
const obsidianDir = path.join(testVault, ".obsidian");
const pluginDir = path.join(obsidianDir, "plugins", "git-viewer");
fs.mkdirSync(pluginDir, { recursive: true });
fs.writeFileSync(path.join(obsidianDir, "community-plugins.json"), JSON.stringify(["git-viewer"], null, 2));
for (const asset of requiredAssets) {
  fs.copyFileSync(asset, path.join(pluginDir, asset));
}

execFileSync("git", ["init"], { cwd: testVault, stdio: "ignore" });
execFileSync("git", ["config", "user.email", "git-viewer@example.test"], { cwd: testVault });
execFileSync("git", ["config", "user.name", "Git Viewer QA"], { cwd: testVault });

fs.writeFileSync(path.join(testVault, "tracked.md"), "initial\n");
fs.writeFileSync(path.join(testVault, "remove.md"), "remove\n");
fs.writeFileSync(path.join(testVault, "rename-me.md"), "rename\n");
execFileSync("git", ["add", "."], { cwd: testVault });
execFileSync("git", ["commit", "-m", "initial"], { cwd: testVault, stdio: "ignore" });

fs.writeFileSync(path.join(testVault, "tracked.md"), "changed\n");
fs.unlinkSync(path.join(testVault, "remove.md"));
execFileSync("git", ["mv", "rename-me.md", "renamed.md"], { cwd: testVault });
fs.writeFileSync(path.join(testVault, "staged.md"), "staged\n");
fs.writeFileSync(path.join(testVault, "untracked.md"), "untracked\n");
execFileSync("git", ["add", "staged.md"], { cwd: testVault });

const v2Output = execFileSync("git", ["status", "--porcelain=v2", "-z"], {
  cwd: testVault,
  encoding: "utf8",
});
assert.equal(v2Output.length > 0, true);

const output = execFileSync("git", ["status", "--porcelain=v1", "-z"], {
  cwd: testVault,
  encoding: "utf8",
});
const grouped = groupEntries(parsePorcelainV1z(output));

assert.equal(grouped.changed.some((entry) => entry.path === "tracked.md"), true);
assert.equal(grouped.deleted.some((entry) => entry.path === "remove.md"), true);
assert.equal(grouped.staged.some((entry) => entry.path === "staged.md"), true);
assert.equal(grouped.untracked.some((entry) => entry.path === "untracked.md"), true);
assert.equal(grouped.renamed.some((entry) => entry.path === "renamed.md" && entry.originalPath === "rename-me.md"), true);
assert.equal(fs.existsSync(path.join(pluginDir, "main.js")), true);
assert.equal(fs.existsSync(path.join(pluginDir, "manifest.json")), true);
assert.equal(fs.existsSync(path.join(pluginDir, "styles.css")), true);

console.log(`Headless Git-testvault QA passed: ${testVault}`);
