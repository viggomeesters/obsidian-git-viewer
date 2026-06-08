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
  GitCommitDetail,
  GitHistoryCommit,
  GitStatusEntry,
  GitStatusGroup,
  GitStatusSnapshot,
  commitSelectedEntries,
  getGitCommitDetail,
  getGitHistory,
  getGitStatus,
  groupEntries,
  toVaultRelativePath,
} from "./git-status";

const VIEW_TYPE_GIT_VIEWER = "git-viewer";
const HISTORY_LIMIT = 50;
const GROUP_LABELS: Record<GitStatusGroup, string> = {
  staged: "Staged",
  changed: "Changed",
  untracked: "Untracked",
  deleted: "Deleted",
  renamed: "Renamed",
  conflicted: "Conflicted",
};
const GROUP_ORDER: GitStatusGroup[] = ["staged", "changed", "untracked", "deleted", "renamed", "conflicted"];
type GitViewerTab = "changes" | "history";

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
  private committing = false;
  private commitMessage = "";
  private selectedEntryKeys = new Set<string>();
  private activeTab: GitViewerTab = "changes";
  private history: GitHistoryCommit[] = [];
  private historyError: string | null = null;
  private historyLoading = false;
  private selectedCommitHash: string | null = null;
  private commitDetail: GitCommitDetail | null = null;
  private commitDetailError: string | null = null;
  private commitDetailLoading = false;
  private lastCommitHash: string | null = null;

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
      text: this.snapshot ? `${this.snapshot.branch || "detached"} - ${this.snapshot.repoRoot}` : "Git status and history",
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

    this.renderTabs(container);

    if (this.activeTab === "history") {
      this.renderHistory(container);
      return;
    }

    this.renderChanges(container);
  }

  private renderTabs(parent: HTMLElement): void {
    const tabs = parent.createDiv({ cls: "git-viewer__tabs" });
    const changesButton = tabs.createEl("button", {
      cls: `git-viewer__tab${this.activeTab === "changes" ? " git-viewer__tab--active" : ""}`,
      text: "Changes",
    });
    const historyButton = tabs.createEl("button", {
      cls: `git-viewer__tab${this.activeTab === "history" ? " git-viewer__tab--active" : ""}`,
      text: "History",
    });

    changesButton.addEventListener("click", () => {
      this.activeTab = "changes";
      this.render();
    });
    historyButton.addEventListener("click", () => {
      this.activeTab = "history";
      this.render();
      void this.loadHistory();
    });
  }

  private renderChanges(container: HTMLElement): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;

    const lastCommitHash = this.lastCommitHash;
    if (lastCommitHash) {
      const banner = container.createDiv({ cls: "git-viewer__last-commit" });
      banner.createSpan({ text: `Last commit ${lastCommitHash.slice(0, 7)}` });
      const viewButton = banner.createEl("button", {
        cls: "git-viewer__link-button",
        text: "View in History",
      });
      viewButton.addEventListener("click", () => {
        this.activeTab = "history";
        this.selectedCommitHash = lastCommitHash;
        this.render();
        void this.loadHistory();
        void this.loadCommitDetail(lastCommitHash);
      });
    }

    if (snapshot.entries.length === 0) {
      renderMessage(container, "Working tree clean.");
      return;
    }

    const visibleEntries = this.getVisibleEntries(snapshot.entries);
    const hiddenCount = snapshot.entries.length - visibleEntries.length;
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

    this.retainVisibleSelections(visibleEntries);
    this.renderCommitPanel(container, visibleEntries);

    const grouped = groupEntries(visibleEntries);
    const sections = container.createDiv({ cls: "git-viewer__sections" });
    for (const group of GROUP_ORDER) {
      const entries = grouped[group];
      if (entries.length === 0) continue;
      this.renderGroup(sections, group, entries);
    }
  }

  private renderHistory(parent: HTMLElement): void {
    if (this.historyLoading) {
      renderMessage(parent, "Reading Git history...");
      return;
    }

    if (this.historyError) {
      renderMessage(parent, this.historyError);
      return;
    }

    if (this.history.length === 0) {
      renderMessage(parent, "No commit history found.");
      if (this.snapshot && !this.historyLoading) {
        void this.loadHistory();
      }
      return;
    }

    const historyLayout = parent.createDiv({ cls: "git-viewer__history-layout" });
    const list = historyLayout.createDiv({ cls: "git-viewer__history-list" });
    for (const commit of this.history) {
      const item = list.createEl("button", {
        cls: `git-viewer__history-item${commit.hash === this.selectedCommitHash ? " git-viewer__history-item--active" : ""}`,
      });
      item.createSpan({ cls: "git-viewer__history-hash", text: commit.shortHash });
      const labels = item.createSpan({ cls: "git-viewer__history-labels" });
      labels.createSpan({ cls: "git-viewer__history-subject", text: commit.subject || "(no subject)" });
      labels.createSpan({ cls: "git-viewer__history-meta", text: `${commit.author} - ${formatTimestamp(commit.timestamp)}` });
      item.addEventListener("click", () => {
        this.selectedCommitHash = commit.hash;
        this.render();
        void this.loadCommitDetail(commit.hash);
      });
    }

    const detailPanel = historyLayout.createDiv({ cls: "git-viewer__commit-detail" });
    this.renderCommitDetail(detailPanel);
  }

  private renderCommitDetail(parent: HTMLElement): void {
    if (!this.selectedCommitHash) {
      parent.createDiv({ cls: "git-viewer__commit-detail-empty", text: "Select a commit to view changed files." });
      return;
    }

    if (this.commitDetailLoading) {
      parent.createDiv({ cls: "git-viewer__commit-detail-empty", text: "Reading commit..." });
      return;
    }

    if (this.commitDetailError) {
      parent.createDiv({ cls: "git-viewer__commit-detail-empty", text: this.commitDetailError });
      return;
    }

    if (!this.commitDetail || this.commitDetail.hash !== this.selectedCommitHash) {
      parent.createDiv({ cls: "git-viewer__commit-detail-empty", text: "Select a commit to load details." });
      void this.loadCommitDetail(this.selectedCommitHash);
      return;
    }

    parent.createDiv({ cls: "git-viewer__commit-detail-subject", text: this.commitDetail.subject || "(no subject)" });
    parent.createDiv({ cls: "git-viewer__commit-detail-meta", text: this.commitDetail.hash });
    parent.createDiv({ cls: "git-viewer__commit-detail-meta", text: `${this.commitDetail.author} - ${formatTimestamp(this.commitDetail.timestamp)}` });

    if (this.commitDetail.body) {
      parent.createDiv({ cls: "git-viewer__commit-body", text: this.commitDetail.body });
    }

    const files = parent.createDiv({ cls: "git-viewer__commit-files" });
    const heading = files.createDiv({ cls: "git-viewer__section-heading" });
    heading.createSpan({ text: "Changed files" });
    heading.createSpan({ cls: "git-viewer__count", text: String(this.commitDetail.files.length) });

    const list = files.createDiv({ cls: "git-viewer__list" });
    for (const file of this.commitDetail.files) {
      const item = list.createDiv({ cls: "git-viewer__commit-file" });
      item.createSpan({ cls: "git-viewer__history-file-status", text: file.status });
      const openButton = item.createEl("button", { cls: "git-viewer__file-button" });
      const openableFile = this.getOpenableHistoryFile(file.path);
      if (!(openableFile instanceof TFile)) {
        openButton.addClass("git-viewer__file-button--disabled");
        openButton.disabled = true;
      }
      const labels = openButton.createSpan({ cls: "git-viewer__item-labels" });
      labels.createSpan({ cls: "git-viewer__path", text: file.path });
      if (file.originalPath) {
        labels.createSpan({ cls: "git-viewer__subpath", text: `from ${file.originalPath}` });
      }
      if (!(openableFile instanceof TFile)) {
        labels.createSpan({ cls: "git-viewer__subpath", text: "not available in Obsidian" });
      }
      openButton.addEventListener("click", () => {
        if (openableFile instanceof TFile) {
          void this.app.workspace.getLeaf(false).openFile(openableFile);
        }
      });
    }
  }

  private renderGroup(parent: HTMLElement, group: GitStatusGroup, entries: GitStatusEntry[]): void {
    const section = parent.createDiv({ cls: "git-viewer__section" });
    const heading = section.createDiv({ cls: "git-viewer__section-heading" });
    heading.createSpan({ text: GROUP_LABELS[group] });
    heading.createSpan({ cls: "git-viewer__count", text: String(entries.length) });

    const list = section.createDiv({ cls: "git-viewer__list" });
    for (const entry of entries) {
      const item = list.createDiv({ cls: "git-viewer__item" });
      const file = this.getOpenableFile(entry);
      const isOpenable = file instanceof TFile;
      const entryKey = getEntryKey(entry);

      const checkbox = item.createEl("input", {
        cls: "git-viewer__checkbox",
        attr: {
          "aria-label": `Select ${entry.path} for commit`,
          type: "checkbox",
        },
      }) as HTMLInputElement;
      checkbox.checked = this.selectedEntryKeys.has(entryKey);
      checkbox.disabled = this.committing;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedEntryKeys.add(entryKey);
        } else {
          this.selectedEntryKeys.delete(entryKey);
        }
        this.render();
      });

      item.createSpan({
        cls: `git-viewer__badge git-viewer__badge--${group}`,
        text: `${entry.indexStatus}${entry.worktreeStatus}`,
      });

      const openButton = item.createEl("button", { cls: "git-viewer__file-button" });
      if (!isOpenable) {
        openButton.addClass("git-viewer__file-button--disabled");
        openButton.disabled = true;
      }
      const labels = openButton.createSpan({ cls: "git-viewer__item-labels" });
      labels.createSpan({ cls: "git-viewer__path", text: entry.path });
      if (entry.originalPath) {
        labels.createSpan({ cls: "git-viewer__subpath", text: `from ${entry.originalPath}` });
      }
      if (!isOpenable) {
        labels.createSpan({ cls: "git-viewer__subpath", text: "not available in Obsidian" });
      }
      openButton.addEventListener("click", () => {
        void this.openEntry(entry);
      });
    }
  }

  private renderCommitPanel(parent: HTMLElement, visibleEntries: GitStatusEntry[]): void {
    const selectedEntries = this.getSelectedEntries(visibleEntries);
    const panel = parent.createDiv({ cls: "git-viewer__commit-panel" });

    const textarea = panel.createEl("textarea", {
      cls: "git-viewer__commit-message",
      attr: {
        "aria-label": "Commit message",
        placeholder: "Commit message",
        rows: "3",
      },
    }) as HTMLTextAreaElement;
    textarea.value = this.commitMessage;
    textarea.disabled = this.committing;

    const actions = panel.createDiv({ cls: "git-viewer__commit-actions" });
    actions.createSpan({
      cls: "git-viewer__commit-count",
      text: `${selectedEntries.length} selected`,
    });

    const selectionActions = actions.createDiv({ cls: "git-viewer__selection-actions" });
    const selectAllButton = selectionActions.createEl("button", {
      cls: "git-viewer__secondary-button",
      text: "Select all",
    });
    const unselectAllButton = selectionActions.createEl("button", {
      cls: "git-viewer__secondary-button",
      text: "Unselect all",
    });

    const commitButton = actions.createEl("button", {
      cls: "git-viewer__commit-button",
      text: this.committing ? "Committing..." : "Commit selected",
    });

    const updateButton = () => {
      selectAllButton.disabled = this.committing || visibleEntries.length === 0 || selectedEntries.length === visibleEntries.length;
      unselectAllButton.disabled = this.committing || selectedEntries.length === 0;
      commitButton.disabled = this.committing || selectedEntries.length === 0 || this.commitMessage.trim().length === 0;
    };
    selectAllButton.addEventListener("click", () => {
      this.selectedEntryKeys = new Set(visibleEntries.map(getEntryKey));
      this.render();
    });
    unselectAllButton.addEventListener("click", () => {
      this.selectedEntryKeys.clear();
      this.render();
    });
    textarea.addEventListener("input", () => {
      this.commitMessage = textarea.value;
      updateButton();
    });
    commitButton.addEventListener("click", () => {
      void this.commitSelectedVisibleEntries(visibleEntries);
    });
    updateButton();
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

  private getSelectedEntries(visibleEntries: GitStatusEntry[]): GitStatusEntry[] {
    return visibleEntries.filter((entry) => this.selectedEntryKeys.has(getEntryKey(entry)));
  }

  private retainVisibleSelections(visibleEntries: GitStatusEntry[]): void {
    const visibleKeys = new Set(visibleEntries.map(getEntryKey));
    this.selectedEntryKeys = new Set(Array.from(this.selectedEntryKeys).filter((key) => visibleKeys.has(key)));
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

  private async commitSelectedVisibleEntries(visibleEntries: GitStatusEntry[]): Promise<void> {
    const snapshot = this.snapshot;
    if (!snapshot || this.committing) return;

    const selectedEntries = this.getSelectedEntries(visibleEntries);
    if (selectedEntries.length === 0) {
      new Notice("Select at least one file to commit.");
      return;
    }
    if (!this.commitMessage.trim()) {
      new Notice("Enter a commit message.");
      return;
    }

    this.committing = true;
    this.render();

    try {
      const result = await commitSelectedEntries(snapshot.repoRoot, selectedEntries, this.commitMessage);
      this.selectedEntryKeys.clear();
      this.commitMessage = "";
      this.lastCommitHash = result.commitHash;
      this.selectedCommitHash = result.commitHash;
      this.history = [];
      this.commitDetail = null;
      new Notice(`Committed ${result.committedPaths.length} file${result.committedPaths.length === 1 ? "" : "s"}: ${result.commitHash.slice(0, 7)}`);
      await this.refresh();
    } catch (error) {
      new Notice(getErrorMessage(error));
    } finally {
      this.committing = false;
      this.render();
    }
  }

  private async loadHistory(): Promise<void> {
    if (!this.snapshot || this.historyLoading) return;

    this.historyLoading = true;
    this.historyError = null;
    this.render();

    try {
      this.history = await getGitHistory(this.snapshot.repoRoot, HISTORY_LIMIT);
      this.historyError = null;
      if (!this.selectedCommitHash && this.history.length > 0) {
        this.selectedCommitHash = this.history[0].hash;
      }
      if (this.selectedCommitHash) {
        await this.loadCommitDetail(this.selectedCommitHash, false);
      }
    } catch (error) {
      this.history = [];
      this.historyError = getErrorMessage(error);
    } finally {
      this.historyLoading = false;
      this.render();
    }
  }

  private async loadCommitDetail(commitHash: string | null, rerender = true): Promise<void> {
    if (!this.snapshot || !commitHash || this.commitDetailLoading) return;
    if (this.commitDetail?.hash === commitHash) return;

    this.commitDetailLoading = true;
    this.commitDetailError = null;
    if (rerender) this.render();

    try {
      this.commitDetail = await getGitCommitDetail(this.snapshot.repoRoot, commitHash);
      this.commitDetailError = null;
    } catch (error) {
      this.commitDetail = null;
      this.commitDetailError = getErrorMessage(error);
    } finally {
      this.commitDetailLoading = false;
      if (rerender) this.render();
    }
  }

  private getOpenableHistoryFile(gitPath: string): TFile | null {
    const snapshot = this.snapshot;
    const vaultPath = this.plugin.getVaultBasePath();
    if (!snapshot || !vaultPath) return null;

    const vaultRelativePath = toVaultRelativePath(snapshot.repoRoot, vaultPath, gitPath);
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

function getEntryKey(entry: GitStatusEntry): string {
  return `${entry.indexStatus}${entry.worktreeStatus}\0${entry.path}\0${entry.originalPath ?? ""}`;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}
