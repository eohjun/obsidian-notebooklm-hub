import { Notice, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { ManageSources } from '../../core/application/use-cases/manage-sources';
import type { ManageNotebooks } from '../../core/application/use-cases/manage-notebooks';
import type { Source } from '../../core/domain/entities';
import { ConfirmModal } from '../modals/confirm-modal';

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
    private app: App,
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

    if (type === 'file') {
      this.renderFileInput(container);
      return;
    }

    // Standard text input for url, text, drive
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

    const doAdd = async () => {
      let value = inputEl.value.trim();
      if (!value) { new Notice('Please enter a value'); return; }
      if (!this.notebookId) { new Notice('Please select a notebook first (Notebooks tab)'); return; }

      // Auto-parse Drive URL → document ID
      if (type === 'drive') {
        value = extractDriveDocumentId(value);
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
    };

    addBtn.addEventListener('click', doAdd);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  }

  /**
   * File source input: drag-and-drop zone + browse button + text fallback.
   */
  private renderFileInput(container: HTMLElement): void {
    // Hidden file input
    const fileInput = container.createEl('input', {
      attr: {
        type: 'file',
        accept: '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.mp3,.wav,.pptx,.xlsx',
        style: 'display:none',
      },
    }) as HTMLInputElement;

    // Drop zone
    const dropZone = container.createDiv({ cls: 'nlm-file-drop-zone' });
    dropZone.createEl('span', { text: '📁', cls: 'nlm-drop-icon' });
    dropZone.createEl('span', { text: 'Drop file here or click to browse', cls: 'nlm-drop-text' });

    // Text input for manual path entry
    const pathRow = container.createDiv({ cls: 'nlm-file-path-row' });
    const pathInput = pathRow.createEl('input', {
      cls: 'nlm-source-input',
      attr: { type: 'text', placeholder: 'Or paste file path here' },
    }) as HTMLInputElement;
    const addBtn = pathRow.createEl('button', { text: 'Add', cls: 'nlm-source-add-btn' });

    // Status display
    const statusEl = container.createDiv({ cls: 'nlm-file-status' });

    // Click drop zone → open file picker
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag events
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('nlm-drop-active');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('nlm-drop-active');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('nlm-drop-active');
      const file = e.dataTransfer?.files[0];
      if (file) {
        pathInput.value = (file as any).path || file.name;
        statusEl.setText(`Selected: ${file.name}`);
      }
    });

    // File input change
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        pathInput.value = (file as any).path || file.name;
        statusEl.setText(`Selected: ${file.name}`);
      }
    });

    // Add button
    const doAdd = async () => {
      const value = pathInput.value.trim();
      if (!value) { new Notice('Select or enter a file path'); return; }
      if (!this.notebookId) { new Notice('Please select a notebook first (Notebooks tab)'); return; }

      addBtn.setAttr('disabled', 'true');
      addBtn.setText('Adding...');

      try {
        await this.manageSources.addFile(this.notebookId, value);
        pathInput.value = '';
        statusEl.setText('');
        new Notice('File source added successfully');
        await this.refresh();
      } catch (e) {
        new Notice(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        addBtn.removeAttribute('disabled');
        addBtn.setText('Add');
      }
    };

    addBtn.addEventListener('click', doAdd);
    pathInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  }

  private getPlaceholder(type: string): string {
    switch (type) {
      case 'url': return 'https://example.com or YouTube URL';
      case 'text': return 'Paste text content here';
      case 'file': return '/path/to/document.pdf';
      case 'drive': return 'Google Drive URL or document ID';
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
        text: 'No notebook selected.',
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

  // ─────────────────────────────────────────────────────────

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
      const confirmed = await new ConfirmModal(
        this.app, 'Delete Source', `Delete source "${source.title}"?`, 'Delete', true,
      ).openAndWait();
      if (!confirmed) return;
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

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Extract Google Drive document ID from a URL or return the raw input if it's already an ID.
 *
 * Supported URL formats:
 * - https://docs.google.com/document/d/{ID}/edit
 * - https://docs.google.com/spreadsheets/d/{ID}/edit
 * - https://docs.google.com/presentation/d/{ID}/edit
 * - https://drive.google.com/file/d/{ID}/view
 * - https://drive.google.com/open?id={ID}
 */
function extractDriveDocumentId(input: string): string {
  const trimmed = input.trim();

  // Pattern: /d/{ID}/ in URL path
  const pathMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];

  // Pattern: ?id={ID} in query string
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];

  // Not a URL — assume raw document ID
  return trimmed;
}
