import { Notice, setIcon } from 'obsidian';
import type { ManageSources } from '../../core/application/use-cases/manage-sources';
import type { ManageNotebooks } from '../../core/application/use-cases/manage-notebooks';
import type { Source } from '../../core/domain/entities';

const SOURCE_TYPE_ICONS: Record<string, string> = {
  url: '🔗',
  text: '📝',
  drive: '📁',
  file: '📄',
  youtube: '▶️',
};

/**
 * Tab: Source management — view sources in selected notebook, add new sources.
 */
export class SourceTab {
  private container!: HTMLElement;
  private sources: Source[] = [];
  private notebookId = '';

  constructor(
    private manageSources: ManageSources,
    private manageNotebooks: ManageNotebooks,
  ) {}

  render(parent: HTMLElement): void {
    this.container = parent.createDiv({ cls: 'nlm-source-tab' });
    this.renderToolbar();
    this.container.createDiv({ cls: 'nlm-source-list', attr: { 'data-role': 'list' } });
    this.renderAddPanel();
  }

  setNotebookId(id: string): void {
    this.notebookId = id;
    this.refresh();
  }

  private renderToolbar(): void {
    const toolbar = this.container.createDiv({ cls: 'nlm-tab-toolbar' });

    const refreshBtn = toolbar.createEl('button', {
      cls: 'nlm-toolbar-btn',
      attr: { 'aria-label': 'Refresh sources' },
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => this.refresh());

    toolbar.createEl('span', { text: 'Sources', cls: 'nlm-toolbar-title' });
  }

  private renderAddPanel(): void {
    const panel = this.container.createDiv({ cls: 'nlm-add-source-panel' });
    panel.createEl('h5', { text: 'Add Source' });

    const typeRow = panel.createDiv({ cls: 'nlm-source-type-row' });
    const types = [
      { type: 'url', label: 'URL / YouTube', icon: '🔗' },
      { type: 'text', label: 'Text', icon: '📝' },
      { type: 'file', label: 'File Path', icon: '📄' },
      { type: 'drive', label: 'Google Drive', icon: '📁' },
    ];

    const inputArea = panel.createDiv({ cls: 'nlm-source-input-area' });
    let selectedType = 'url';

    for (const t of types) {
      const btn = typeRow.createEl('button', {
        cls: `nlm-source-type-btn ${t.type === 'url' ? 'active' : ''}`,
        attr: { 'data-type': t.type },
      });
      btn.createEl('span', { text: t.icon });
      btn.createEl('span', { text: t.label, cls: 'nlm-type-label' });
      btn.addEventListener('click', () => {
        selectedType = t.type;
        typeRow.querySelectorAll('.nlm-source-type-btn').forEach((el) =>
          el.classList.remove('active'),
        );
        btn.classList.add('active');
        this.renderInputForType(inputArea, t.type);
      });
    }

    this.renderInputForType(inputArea, 'url');
  }

  private renderInputForType(container: HTMLElement, type: string): void {
    container.empty();

    const inputEl = container.createEl('input', {
      cls: 'nlm-source-input',
      attr: {
        type: 'text',
        placeholder: this.getPlaceholder(type),
      },
    });

    const addBtn = container.createEl('button', {
      text: 'Add',
      cls: 'nlm-source-add-btn',
    });

    addBtn.addEventListener('click', async () => {
      const value = inputEl.value.trim();
      if (!value) {
        new Notice('Please enter a value');
        return;
      }
      if (!this.notebookId) {
        new Notice('Please select a notebook first (Notebooks tab)');
        return;
      }

      addBtn.setAttr('disabled', 'true');
      addBtn.setText('Adding...');

      try {
        await this.addSource(type, value);
        inputEl.value = '';
        new Notice('Source added successfully');
        await this.refresh();
      } catch (e) {
        new Notice(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        addBtn.removeAttribute('disabled');
        addBtn.setText('Add');
      }
    });

    // Enter key support
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addBtn.click();
    });
  }

  private getPlaceholder(type: string): string {
    switch (type) {
      case 'url': return 'https://example.com or YouTube URL';
      case 'text': return 'Paste text content here';
      case 'file': return '/path/to/document.pdf';
      case 'drive': return 'Google Drive document ID';
      default: return 'Enter value';
    }
  }

  private async addSource(type: string, value: string): Promise<void> {
    switch (type) {
      case 'url':
        await this.manageSources.addUrl(this.notebookId, value);
        break;
      case 'text':
        await this.manageSources.addText(this.notebookId, value);
        break;
      case 'file':
        await this.manageSources.addFile(this.notebookId, value);
        break;
      case 'drive':
        await this.manageSources.addDrive(this.notebookId, value);
        break;
    }
  }

  async refresh(): Promise<void> {
    const listEl = this.container.querySelector('[data-role="list"]') as HTMLElement;
    if (!listEl) return;
    listEl.empty();

    if (!this.notebookId) {
      listEl.createDiv({
        text: 'Select a notebook from the Notebooks tab to view sources.',
        cls: 'nlm-empty-state',
      });
      return;
    }

    listEl.createDiv({ text: 'Loading...', cls: 'nlm-loading' });

    try {
      const detail = await this.manageNotebooks.get(this.notebookId);
      this.sources = detail.sources;
      listEl.empty();

      if (this.sources.length === 0) {
        listEl.createDiv({
          text: 'No sources yet. Add one below.',
          cls: 'nlm-empty-state',
        });
        return;
      }

      for (const source of this.sources) {
        this.renderSourceItem(listEl, source);
      }
    } catch (e) {
      listEl.empty();
      listEl.createDiv({
        text: `Error: ${e instanceof Error ? e.message : String(e)}`,
        cls: 'nlm-error-state',
      });
    }
  }

  private renderSourceItem(parent: HTMLElement, source: Source): void {
    const item = parent.createDiv({ cls: 'nlm-source-item' });

    const icon = SOURCE_TYPE_ICONS[source.type] || '📎';
    item.createEl('span', { text: icon, cls: 'nlm-source-icon' });

    const info = item.createDiv({ cls: 'nlm-source-info' });
    info.createEl('span', { text: source.title || '(Untitled)', cls: 'nlm-source-title' });
    info.createEl('span', { text: source.type, cls: 'nlm-source-type-badge' });
    if (source.isStale) {
      info.createEl('span', { text: 'Stale', cls: 'nlm-source-stale-badge' });
    }

    const actions = item.createDiv({ cls: 'nlm-source-actions' });

    const deleteBtn = actions.createEl('button', {
      cls: 'nlm-action-btn nlm-action-danger',
      attr: { 'aria-label': 'Delete source' },
    });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm(`Delete source "${source.title}"?`)) return;
      try {
        await this.manageSources.delete([source.id]);
        new Notice(`Deleted: ${source.title}`);
        await this.refresh();
      } catch (e) {
        new Notice(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }
}
