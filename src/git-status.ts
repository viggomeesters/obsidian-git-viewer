import { execFile } from "node:child_process";
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
  run(args: string[], options: { cwd: string }): Promise<string>;
}

export class CliGitCommandRunner implements GitCommandRunner {
  async run(args: string[], options: { cwd: string }): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: options.cwd,
        encoding: "buffer",
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
  const output = await runner.run(["status", "--porcelain=v1", "-z"], { cwd: repoRoot });
  const entries = parsePorcelainV1z(output);

  return {
    repoRoot,
    branch,
    entries,
    grouped: groupEntries(entries),
  };
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
