import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitStatusGroup =
  | "staged"
  | "changed"
  | "untracked"
  | "deleted"
  | "renamed"
  | "conflicted";

export interface GitStatusEntry {
  path: string;
  originalPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  group: GitStatusGroup;
}

export interface GitStatusSnapshot {
  repoRoot: string;
  branch: string;
  entries: GitStatusEntry[];
  grouped: Record<GitStatusGroup, GitStatusEntry[]>;
}

export interface GitCommandRunner {
  run(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<string>;
}

export class CliGitCommandRunner implements GitCommandRunner {
  async run(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: options.cwd,
        encoding: "buffer",
        env: options.env ? { ...process.env, ...options.env } : process.env,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 8000,
      });
      return stdout.toString("utf8");
    } catch (error) {
      throw new Error(formatGitCommandError(args, error));
    }
  }
}

export async function getGitStatus(
  vaultPath: string,
  runner: GitCommandRunner = new CliGitCommandRunner(),
): Promise<GitStatusSnapshot> {
  const repoRoot = normalizeSystemPath(
    (await runner.run(["rev-parse", "--show-toplevel"], { cwd: vaultPath })).trim(),
  );
  const branch = (await runner.run(["branch", "--show-current"], { cwd: repoRoot })).trim();
  const output = await runner.run(["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: repoRoot });
  const entries = parsePorcelainV1z(output);

  return {
    repoRoot,
    branch,
    entries,
    grouped: groupEntries(entries),
  };
}

export interface GitCommitResult {
  commitHash: string;
  committedPaths: string[];
}

export interface GitHistoryCommit {
  hash: string;
  shortHash: string;
  author: string;
  timestamp: string;
  subject: string;
}

export interface GitCommitFile {
  status: string;
  path: string;
  originalPath?: string;
}

export interface GitCommitDetail extends GitHistoryCommit {
  body: string;
  files: GitCommitFile[];
}

export async function commitSelectedEntries(
  repoRoot: string,
  entries: GitStatusEntry[],
  message: string,
  runner: GitCommandRunner = new CliGitCommandRunner(),
): Promise<GitCommitResult> {
  const commitMessage = message.trim();
  if (!commitMessage) throw new Error("Commit message is required.");
  if (entries.length === 0) throw new Error("Select at least one file to commit.");

  const ref = (await runner.run(["symbolic-ref", "-q", "HEAD"], { cwd: repoRoot })).trim();
  if (!ref) throw new Error("Cannot commit from detached HEAD.");

  const tempIndexPath = path.join(
    os.tmpdir(),
    `git-viewer-index-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const tempIndexEnv = { GIT_INDEX_FILE: tempIndexPath };

  try {
    const parent = await getCurrentHead(repoRoot, runner);
    await runner.run(parent ? ["read-tree", parent] : ["read-tree", "--empty"], {
      cwd: repoRoot,
      env: tempIndexEnv,
    });

    const pathsToAdd: string[] = [];
    const pathsToRemove: string[] = [];
    for (const entry of entries) {
      if (entry.originalPath) pathsToRemove.push(entry.originalPath);
      if (entry.group === "deleted") {
        pathsToRemove.push(entry.path);
      } else {
        pathsToAdd.push(entry.path);
      }
    }

    const removePaths = uniquePaths(pathsToRemove);
    if (removePaths.length > 0) {
      await runner.run(["rm", "--cached", "--ignore-unmatch", "--", ...removePaths], {
        cwd: repoRoot,
        env: tempIndexEnv,
      });
    }

    const addPaths = uniquePaths(pathsToAdd);
    if (addPaths.length > 0) {
      await runner.run(["add", "--", ...addPaths], {
        cwd: repoRoot,
        env: tempIndexEnv,
      });
    }

    const committedPaths = (await runner.run(["diff", "--cached", "--name-only"], {
      cwd: repoRoot,
      env: tempIndexEnv,
    }))
      .split("\n")
      .map((line) => normalizeGitPath(line.trim()))
      .filter(Boolean);
    if (committedPaths.length === 0) throw new Error("Selected files do not contain commit changes.");

    const tree = (await runner.run(["write-tree"], { cwd: repoRoot, env: tempIndexEnv })).trim();
    const commitArgs = ["commit-tree", tree];
    if (parent) commitArgs.push("-p", parent);
    commitArgs.push("-m", commitMessage);
    const commitHash = (await runner.run(commitArgs, { cwd: repoRoot, env: tempIndexEnv })).trim();

    if (parent) {
      await runner.run(["update-ref", "-m", "Git Viewer commit", ref, commitHash, parent], { cwd: repoRoot });
    } else {
      await runner.run(["update-ref", "-m", "Git Viewer commit", ref, commitHash], { cwd: repoRoot });
    }

    const resetPaths = uniquePaths([...addPaths, ...removePaths]);
    if (resetPaths.length > 0) {
      await runner.run(["reset", "-q", "--", ...resetPaths], { cwd: repoRoot });
    }

    return { commitHash, committedPaths };
  } finally {
    await fs.rm(tempIndexPath, { force: true });
  }
}

export async function getGitHistory(
  repoRoot: string,
  limit = 50,
  runner: GitCommandRunner = new CliGitCommandRunner(),
): Promise<GitHistoryCommit[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
  const output = await runner.run(
    ["log", `--max-count=${safeLimit}`, "--date=iso-strict", "--format=%H%x00%h%x00%an%x00%ad%x00%s%x00"],
    { cwd: repoRoot },
  );
  return parseGitLog(output);
}

export async function getGitCommitDetail(
  repoRoot: string,
  commitHash: string,
  runner: GitCommandRunner = new CliGitCommandRunner(),
): Promise<GitCommitDetail> {
  if (!/^[0-9a-f]{7,40}$/i.test(commitHash)) throw new Error("Invalid commit hash.");
  const output = await runner.run(
    ["show", "--date=iso-strict", "--format=%H%x00%h%x00%an%x00%ad%x00%s%x00%b%x00", "--name-status", "-z", commitHash],
    { cwd: repoRoot },
  );
  return parseGitShow(output);
}

export function parsePorcelainV1z(output: string): GitStatusEntry[] {
  const records = output.split("\0").filter((record) => record.length > 0);
  const entries: GitStatusEntry[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const indexStatus = record[0] ?? " ";
    const worktreeStatus = record[1] ?? " ";
    const filePath = record.slice(3);

    if (!filePath) continue;

    let originalPath: string | undefined;
    if (isRenameOrCopy(indexStatus, worktreeStatus) && index + 1 < records.length) {
      originalPath = records[index + 1];
      index += 1;
    }

    entries.push({
      path: normalizeGitPath(filePath),
      originalPath: originalPath ? normalizeGitPath(originalPath) : undefined,
      indexStatus,
      worktreeStatus,
      group: classifyStatus(indexStatus, worktreeStatus),
    });
  }

  return entries;
}

export function parseGitLog(output: string): GitHistoryCommit[] {
  const fields = output.split("\0");
  const commits: GitHistoryCommit[] = [];
  for (let index = 0; index + 4 < fields.length; index += 5) {
    const hash = fields[index]?.trim() ?? "";
    const shortHash = fields[index + 1]?.trim() ?? "";
    const author = fields[index + 2]?.trim() ?? "";
    const timestamp = fields[index + 3]?.trim() ?? "";
    const subject = fields[index + 4]?.trim() ?? "";
    if (!hash) continue;
    commits.push({ hash, shortHash, author, timestamp, subject });
  }
  return commits;
}

export function parseGitShow(output: string): GitCommitDetail {
  const fields = output.split("\0");
  const hash = fields[0]?.trim() ?? "";
  const shortHash = fields[1]?.trim() ?? "";
  const author = fields[2]?.trim() ?? "";
  const timestamp = fields[3]?.trim() ?? "";
  const subject = fields[4]?.trim() ?? "";
  const body = fields[5]?.trim() ?? "";
  if (!hash) throw new Error("Could not parse commit details.");

  const files: GitCommitFile[] = [];
  for (let index = 6; index < fields.length; index += 1) {
    const status = fields[index]?.trim();
    if (!status) continue;
    const filePath = fields[index + 1] ?? "";
    if (!filePath) continue;
    if (status.startsWith("R") || status.startsWith("C")) {
      const originalPath = filePath;
      const newPath = fields[index + 2] ?? "";
      if (newPath) {
        files.push({
          status,
          path: normalizeGitPath(newPath),
          originalPath: normalizeGitPath(originalPath),
        });
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    files.push({
      status,
      path: normalizeGitPath(filePath),
    });
    index += 1;
  }

  return { hash, shortHash, author, timestamp, subject, body, files };
}

export function groupEntries(entries: GitStatusEntry[]): Record<GitStatusGroup, GitStatusEntry[]> {
  return {
    staged: entries.filter((entry) => entry.group === "staged"),
    changed: entries.filter((entry) => entry.group === "changed"),
    untracked: entries.filter((entry) => entry.group === "untracked"),
    deleted: entries.filter((entry) => entry.group === "deleted"),
    renamed: entries.filter((entry) => entry.group === "renamed"),
    conflicted: entries.filter((entry) => entry.group === "conflicted"),
  };
}

export function classifyStatus(indexStatus: string, worktreeStatus: string): GitStatusGroup {
  if (indexStatus === "?" && worktreeStatus === "?") return "untracked";
  if (indexStatus === "U" || worktreeStatus === "U" || (indexStatus === "A" && worktreeStatus === "A") || (indexStatus === "D" && worktreeStatus === "D")) {
    return "conflicted";
  }
  if (isRenameOrCopy(indexStatus, worktreeStatus)) return "renamed";
  if (indexStatus === "D" || worktreeStatus === "D") return "deleted";
  if (indexStatus !== " ") return "staged";
  return "changed";
}

export function toVaultRelativePath(repoRoot: string, vaultPath: string, gitPath: string): string | null {
  const absolutePath = normalizeSystemPath(path.resolve(repoRoot, gitPath));
  const normalizedVaultPath = normalizeSystemPath(vaultPath);
  const relative = normalizeSystemPath(path.relative(normalizedVaultPath, absolutePath));

  if (relative === "") return "";
  if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) return null;
  return relative;
}

function isRenameOrCopy(indexStatus: string, worktreeStatus: string): boolean {
  return indexStatus === "R" || indexStatus === "C" || worktreeStatus === "R" || worktreeStatus === "C";
}

function normalizeGitPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeSystemPath(value: string): string {
  return value.replace(/\\/g, "/");
}

async function getCurrentHead(repoRoot: string, runner: GitCommandRunner): Promise<string | null> {
  try {
    return (await runner.run(["rev-parse", "--verify", "HEAD"], { cwd: repoRoot })).trim();
  } catch {
    return null;
  }
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map(normalizeGitPath).filter(Boolean)));
}

function formatGitCommandError(args: string[], error: unknown): string {
  if (isNodeExecError(error)) {
    const stderr = bufferOrStringToText(error.stderr).trim();
    if (stderr) return `git ${args.join(" ")} failed: ${stderr}`;
    if (error.code) return `git ${args.join(" ")} failed with code ${String(error.code)}`;
  }
  if (error instanceof Error && error.message.trim()) {
    return `git ${args.join(" ")} failed: ${error.message}`;
  }
  return `git ${args.join(" ")} failed.`;
}

function isNodeExecError(error: unknown): error is { code?: unknown; stderr?: Buffer | string } {
  return typeof error === "object" && error !== null && ("stderr" in error || "code" in error);
}

function bufferOrStringToText(value: Buffer | string | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value.toString("utf8");
}
