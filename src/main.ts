import {
  FileSystemAdapter,
  ItemView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import {
  GitStatusEntry,
  GitStatusGroup,
  GitStatusSnapshot,
  getGitStatus,
  groupEntries,
  toVaultRelativePath,
} from "./git-status";

const VIEW_TYPE_GIT_VIEWER = "git-viewer";
const GROUP_LABELS: Record<GitStatusGroup, string> = {
  staged: "Staged",
  changed: "Changed",
  untracked: "Untracked",
  deleted: "Deleted",
  renamed: "Renamed",
  conflicted: "Conflicted",
};
const GROUP_ORDER: GitStatusGroup[] = ["staged", "changed", "untracked", "deleted", "renamed", "conflicted"];

export default class GitViewerPlugin extends Plugin {
  private refreshTimer: number | null = null;

  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_GIT_VIEWER,
      (leaf) => new GitViewerView(leaf, this),
    );

    this.addRibbonIcon("git-branch", "Open Git Viewer", () => {
      void this.openView();
    });

    this.addCommand({
      id: "open-git-viewer",
      name: "Open Git Viewer",
      callback: () => {
        void this.openView();
      },
    });

    this.addCommand({
      id: "refresh-git-viewer",
      name: "Refresh Git Viewer",
      callback: () => {
        void this.refreshOpenViews();
      },
    });

    this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("modify", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("rename", () => this.scheduleRefresh()));
  }

  onunload(): void {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async openView(): Promise<void> {
    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_GIT_VIEWER, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  getVaultBasePath(): string | null {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }
    return null;
  }

  async refreshOpenViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GIT_VIEWER);
    await Promise.all(
      leaves.map(async (leaf) => {
        if (leaf.view instanceof GitViewerView) {
          await leaf.view.refresh();
        }
      }),
    );
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshOpenViews();
    }, 500);
  }
}

class GitViewerView extends ItemView {
  private snapshot: GitStatusSnapshot | null = null;
  private error: string | null = null;
  private loading = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: GitViewerPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_GIT_VIEWER;
  }

  getDisplayText(): string {
    return "Git Viewer";
  }

  getIcon(): string {
    return "git-branch";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const vaultPath = this.plugin.getVaultBasePath();
    if (!vaultPath) {
      this.snapshot = null;
      this.error = "Git Viewer requires Obsidian desktop with a local file-system vault.";
      this.render();
      return;
    }

    this.loading = true;
    this.error = null;
    this.render();

    try {
      this.snapshot = await getGitStatus(vaultPath);
      this.error = null;
    } catch (error) {
      this.snapshot = null;
      this.error = getErrorMessage(error);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("git-viewer");

    const header = container.createDiv({ cls: "git-viewer__header" });
    const title = header.createDiv({ cls: "git-viewer__title" });
    title.createDiv({ cls: "git-viewer__name", text: "Git Viewer" });
    title.createDiv({
      cls: "git-viewer__meta",
      text: this.snapshot ? `${this.snapshot.branch || "detached"} - ${this.snapshot.repoRoot}` : "Read-only Git status",
    });

    const refreshButton = header.createEl("button", {
      cls: "git-viewer__icon-button",
      attr: { "aria-label": "Refresh Git status", title: "Refresh Git status" },
    });
    setIcon(refreshButton, "refresh-cw");
    refreshButton.addEventListener("click", () => {
      void this.refresh();
    });

    if (this.loading) {
      renderMessage(container, "Reading Git status...");
      return;
    }

    if (this.error) {
      renderMessage(container, this.error);
      return;
    }

    if (!this.snapshot) {
      renderMessage(container, "No Git status has been loaded.");
      return;
    }

    if (this.snapshot.entries.length === 0) {
      renderMessage(container, "Working tree clean.");
      return;
    }

    const visibleEntries = this.getVisibleEntries(this.snapshot.entries);
    const hiddenCount = this.snapshot.entries.length - visibleEntries.length;
    if (visibleEntries.length === 0) {
      renderMessage(
        container,
        hiddenCount > 0
          ? `No openable vault file changes. ${hiddenCount} hidden or internal Git path${hiddenCount === 1 ? "" : "s"} omitted.`
          : "No openable vault file changes.",
      );
      return;
    }

    if (hiddenCount > 0) {
      container.createDiv({
        cls: "git-viewer__note",
        text: `${hiddenCount} hidden or internal Git path${hiddenCount === 1 ? "" : "s"} omitted.`,
      });
    }

    const grouped = groupEntries(visibleEntries);
    const sections = container.createDiv({ cls: "git-viewer__sections" });
    for (const group of GROUP_ORDER) {
      const entries = grouped[group];
      if (entries.length === 0) continue;
      this.renderGroup(sections, group, entries);
    }
  }

  private renderGroup(parent: HTMLElement, group: GitStatusGroup, entries: GitStatusEntry[]): void {
    const section = parent.createDiv({ cls: "git-viewer__section" });
    const heading = section.createDiv({ cls: "git-viewer__section-heading" });
    heading.createSpan({ text: GROUP_LABELS[group] });
    heading.createSpan({ cls: "git-viewer__count", text: String(entries.length) });

    const list = section.createDiv({ cls: "git-viewer__list" });
    for (const entry of entries) {
      const item = list.createEl("button", { cls: "git-viewer__item" });
      const file = this.getOpenableFile(entry);
      const isOpenable = file instanceof TFile;
      if (!isOpenable) {
        item.addClass("git-viewer__item--disabled");
        item.disabled = true;
      }
      item.createSpan({ cls: `git-viewer__badge git-viewer__badge--${group}`, text: `${entry.indexStatus}${entry.worktreeStatus}` });
      const labels = item.createSpan({ cls: "git-viewer__item-labels" });
      labels.createSpan({ cls: "git-viewer__path", text: entry.path });
      if (entry.originalPath) {
        labels.createSpan({ cls: "git-viewer__subpath", text: `from ${entry.originalPath}` });
      }
      if (!isOpenable) {
        labels.createSpan({ cls: "git-viewer__subpath", text: "not available in Obsidian" });
      }
      item.addEventListener("click", () => {
        void this.openEntry(entry);
      });
    }
  }

  private async openEntry(entry: GitStatusEntry): Promise<void> {
    const file = this.getOpenableFile(entry);
    if (!(file instanceof TFile)) {
      new Notice("This file cannot be opened in Obsidian.");
      return;
    }

    await this.app.workspace.getLeaf(false).openFile(file);
  }

  private getVisibleEntries(entries: GitStatusEntry[]): GitStatusEntry[] {
    return entries.filter((entry) => entry.group === "deleted" || this.getOpenableFile(entry) instanceof TFile);
  }

  private getOpenableFile(entry: GitStatusEntry): TFile | null {
    const snapshot = this.snapshot;
    const vaultPath = this.plugin.getVaultBasePath();
    if (!snapshot || !vaultPath) return null;

    const vaultRelativePath = toVaultRelativePath(snapshot.repoRoot, vaultPath, entry.path);
    if (!vaultRelativePath) return null;

    const file = this.app.vault.getAbstractFileByPath(vaultRelativePath);
    return file instanceof TFile ? file : null;
  }
}

function renderMessage(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "git-viewer__message", text: message });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return String(error);
}
