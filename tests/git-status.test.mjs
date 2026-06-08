import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import esbuild from "esbuild";

const outdir = path.join(".tmp", "tests");
const outfile = path.join(outdir, "git-status.mjs");
fs.mkdirSync(outdir, { recursive: true });

await esbuild.build({
  bundle: true,
  entryPoints: ["src/git-status.ts"],
  external: ["obsidian"],
  format: "esm",
  outfile,
  platform: "node",
  target: "es2022",
});

const {
  commitSelectedEntries,
  classifyStatus,
  getGitStatus,
  groupEntries,
  parsePorcelainV1z,
  toVaultRelativePath,
} = await import(path.resolve(outfile));

const fixture = [
  " M changed.md",
  "A  staged.md",
  "?? new.md",
  " D deleted.md",
  "R  renamed-new.md",
  "renamed-old.md",
  "",
].join("\0");

const parsed = parsePorcelainV1z(fixture);
assert.equal(parsed.length, 5);
assert.deepEqual(
  parsed.map((entry) => [entry.group, entry.path, entry.originalPath ?? null]),
  [
    ["changed", "changed.md", null],
    ["staged", "staged.md", null],
    ["untracked", "new.md", null],
    ["deleted", "deleted.md", null],
    ["renamed", "renamed-new.md", "renamed-old.md"],
  ],
);

assert.equal(classifyStatus("?", "?"), "untracked");
assert.equal(classifyStatus("M", " "), "staged");
assert.equal(classifyStatus(" ", "M"), "changed");
assert.equal(classifyStatus(" ", "D"), "deleted");
assert.equal(classifyStatus("R", " "), "renamed");
assert.equal(classifyStatus("U", "U"), "conflicted");

const grouped = groupEntries(parsed);
assert.equal(grouped.changed.length, 1);
assert.equal(grouped.staged.length, 1);
assert.equal(grouped.untracked.length, 1);
assert.equal(grouped.deleted.length, 1);
assert.equal(grouped.renamed.length, 1);

assert.equal(
  toVaultRelativePath("/tmp/repo", "/tmp/repo", "folder/file.md"),
  "folder/file.md",
);
assert.equal(
  toVaultRelativePath("/tmp/repo", "/tmp/repo/vault", "outside.md"),
  null,
);

const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-viewer-status-"));
execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
execFileSync("git", ["config", "user.email", "git-viewer@example.test"], { cwd: repoDir });
execFileSync("git", ["config", "user.name", "Git Viewer Test"], { cwd: repoDir });
fs.writeFileSync(path.join(repoDir, "tracked.md"), "initial\n");
fs.writeFileSync(path.join(repoDir, "delete-me.md"), "delete\n");
execFileSync("git", ["add", "."], { cwd: repoDir });
execFileSync("git", ["commit", "-m", "initial"], { cwd: repoDir, stdio: "ignore" });

fs.writeFileSync(path.join(repoDir, "tracked.md"), "changed\n");
fs.unlinkSync(path.join(repoDir, "delete-me.md"));
fs.writeFileSync(path.join(repoDir, "staged.md"), "staged\n");
fs.writeFileSync(path.join(repoDir, "new.md"), "new\n");
execFileSync("git", ["add", "staged.md"], { cwd: repoDir });

const statusOutput = execFileSync("git", ["status", "--porcelain=v1", "-z"], {
  cwd: repoDir,
  encoding: "utf8",
});
const statusEntries = parsePorcelainV1z(statusOutput);
const statusGroups = groupEntries(statusEntries);
assert.equal(statusGroups.changed.some((entry) => entry.path === "tracked.md"), true);
assert.equal(statusGroups.deleted.some((entry) => entry.path === "delete-me.md"), true);
assert.equal(statusGroups.staged.some((entry) => entry.path === "staged.md"), true);
assert.equal(statusGroups.untracked.some((entry) => entry.path === "new.md"), true);

const commitRepo = fs.mkdtempSync(path.join(os.tmpdir(), "git-viewer-commit-"));
execFileSync("git", ["init"], { cwd: commitRepo, stdio: "ignore" });
execFileSync("git", ["config", "user.email", "git-viewer@example.test"], { cwd: commitRepo });
execFileSync("git", ["config", "user.name", "Git Viewer Test"], { cwd: commitRepo });
fs.writeFileSync(path.join(commitRepo, "selected.md"), "initial\n");
fs.writeFileSync(path.join(commitRepo, "delete-selected.md"), "delete\n");
fs.writeFileSync(path.join(commitRepo, "unrelated-staged.md"), "initial\n");
execFileSync("git", ["add", "."], { cwd: commitRepo });
execFileSync("git", ["commit", "-m", "initial"], { cwd: commitRepo, stdio: "ignore" });

fs.writeFileSync(path.join(commitRepo, "selected.md"), "selected change\n");
fs.unlinkSync(path.join(commitRepo, "delete-selected.md"));
fs.writeFileSync(path.join(commitRepo, "new-selected.md"), "new selected\n");
fs.writeFileSync(path.join(commitRepo, "unrelated-staged.md"), "must stay staged\n");
execFileSync("git", ["add", "unrelated-staged.md"], { cwd: commitRepo });

const commitSnapshot = await getGitStatus(commitRepo);
const commitSelection = commitSnapshot.entries.filter((entry) =>
  ["selected.md", "delete-selected.md", "new-selected.md"].includes(entry.path),
);
const commitResult = await commitSelectedEntries(commitSnapshot.repoRoot, commitSelection, "commit selected files");

assert.match(commitResult.commitHash, /^[0-9a-f]{40}$/);
assert.deepEqual(
  commitResult.committedPaths.sort(),
  ["delete-selected.md", "new-selected.md", "selected.md"],
);
assert.equal(
  execFileSync("git", ["show", "--format=", "--name-only", "HEAD"], { cwd: commitRepo, encoding: "utf8" })
    .trim()
    .split("\n")
    .sort()
    .join(","),
  "delete-selected.md,new-selected.md,selected.md",
);
assert.equal(
  execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: commitRepo, encoding: "utf8" }).trim(),
  "unrelated-staged.md",
);
assert.equal(
  execFileSync("git", ["status", "--porcelain=v1", "--", "selected.md", "delete-selected.md", "new-selected.md"], {
    cwd: commitRepo,
    encoding: "utf8",
  }).trim(),
  "",
);

console.log("Git status parser tests passed.");
