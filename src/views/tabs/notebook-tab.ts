import { Notice, setIcon } from 'obsidian';
import type { ManageNotebooks } from '../../core/application/use-cases/manage-notebooks';
import type { Notebook, NotebookDetail } from '../../core/domain/entities';

/**
 * Tab: Notebook browser — list, create, delete, rename notebooks.
 * Shows sources when a notebook is selected.
 */
export class NotebookTab {
  private container!: HTMLElement;
  private notebooks: Notebook[] = [];
  private selectedNotebookId: string;
  private onNotebookSelect?: (notebookId: string) => void;

  constructor(
    private manageNotebooks: ManageNotebooks,
    initialNotebookId: string,
  ) {
    this.selectedNotebookId = initialNotebookId;
  }

  setOnNotebookSelect(handler: (notebookId: string) => void): void {
    this.onNotebookSelect = handler;
  }

  render(parent: HTMLElement): void {
    this.container = parent.createDiv({ cls: 'nlm-notebook-tab' });
    this.renderToolbar();
    this.renderList();
    this.refresh();
  }

  private renderToolbar(): void {
    const toolbar = this.container.createDiv({ cls: 'nlm-tab-toolbar' });

    const refreshBtn = toolbar.createEl('button', {
      cls: 'nlm-toolbar-btn',
      attr: { 'aria-label': 'Refresh' },
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => this.refresh());

    const createBtn = toolbar.createEl('button', {
      cls: 'nlm-toolbar-btn',
      attr: { 'aria-label': 'Create notebook' },
    });
    setIcon(createBtn, 'plus');
    createBtn.addEventListener('click', () => this.promptCreate());
  }

  private renderList(): void {
    const list = this.container.createDiv({ cls: 'nlm-notebook-list' });
    list.setAttribute('data-role', 'list');
  }

  async refresh(): Promise<void> {
    const listEl = this.container.querySelector('[data-role="list"]');
    if (!listEl) return;

    (listEl as HTMLElement).empty();
    (listEl as HTMLElement).createEl('div', { text: 'Loading...', cls: 'nlm-loading' });

    try {
      this.notebooks = await this.manageNotebooks.list();
      (listEl as HTMLElement).empty();

      if (this.notebooks.length === 0) {
        (listEl as HTMLElement).createDiv({
          text: 'No notebooks yet. Click + to create one.',
          cls: 'nlm-empty-state',
        });
        return;
      }

      for (const nb of this.notebooks) {
        this.renderNotebookItem(listEl as HTMLElement, nb);
      }
    } catch (e) {
      (listEl as HTMLElement).empty();
      (listEl as HTMLElement).createDiv({
        text: `Error: ${e instanceof Error ? e.message : String(e)}`,
        cls: 'nlm-error-state',
      });
    }
  }

  private renderNotebookItem(parent: HTMLElement, nb: Notebook): void {
    const item = parent.createDiv({
      cls: `nlm-notebook-item ${nb.id === this.selectedNotebookId ? 'selected' : ''}`,
      attr: { 'data-id': nb.id },
    });

    const info = item.createDiv({ cls: 'nlm-notebook-info' });
    info.createEl('span', { text: nb.title, cls: 'nlm-notebook-title' });
    info.createEl('span', {
      text: `${nb.sourcesCount} sources`,
      cls: 'nlm-notebook-meta',
    });

    const actions = item.createDiv({ cls: 'nlm-notebook-actions' });

    const renameBtn = actions.createEl('button', {
      cls: 'nlm-action-btn',
      attr: { 'aria-label': 'Rename' },
    });
    setIcon(renameBtn, 'pencil');
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.promptRename(nb);
    });

    const deleteBtn = actions.createEl('button', {
      cls: 'nlm-action-btn nlm-action-danger',
      attr: { 'aria-label': 'Delete' },
    });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.promptDelete(nb);
    });

    item.addEventListener('click', () => {
      this.selectedNotebookId = nb.id;
      // Update selection UI
      parent.querySelectorAll('.nlm-notebook-item').forEach((el) =>
        el.classList.remove('selected'),
      );
      item.classList.add('selected');
      this.onNotebookSelect?.(nb.id);
    });
  }

  private async promptCreate(): Promise<void> {
    const title = await promptInput('New Notebook', 'Enter notebook title:');
    if (!title) return;

    try {
      const nb = await this.manageNotebooks.create(title);
      new Notice(`Created: ${nb.title}`);
      await this.refresh();
    } catch (e) {
      new Notice(`Failed to create notebook: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async promptRename(nb: Notebook): Promise<void> {
    const newTitle = await promptInput('Rename Notebook', 'New title:', nb.title);
    if (!newTitle || newTitle === nb.title) return;

    try {
      await this.manageNotebooks.rename(nb.id, newTitle);
      new Notice(`Renamed to: ${newTitle}`);
      await this.refresh();
    } catch (e) {
      new Notice(`Failed to rename: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async promptDelete(nb: Notebook): Promise<void> {
    const confirmed = await promptConfirm(
      'Delete Notebook',
      `Delete "${nb.title}"? This is irreversible.`,
    );
    if (!confirmed) return;

    try {
      await this.manageNotebooks.delete(nb.id);
      new Notice(`Deleted: ${nb.title}`);
      if (this.selectedNotebookId === nb.id) {
        this.selectedNotebookId = '';
        this.onNotebookSelect?.('');
      }
      await this.refresh();
    } catch (e) {
      new Notice(`Failed to delete: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  getSelectedNotebookId(): string {
    return this.selectedNotebookId;
  }
}

// ─────────────────────────────────────────────────────────────
// Simple prompt helpers (no Obsidian Modal dependency)
// ─────────────────────────────────────────────────────────────

function promptInput(title: string, message: string, defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const value = window.prompt(message, defaultValue);
    resolve(value);
  });
}

function promptConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    resolve(window.confirm(message));
  });
}
