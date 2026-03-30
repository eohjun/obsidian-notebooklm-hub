import { Modal, App, Notice, Setting } from 'obsidian';
import type { BatchOperations } from '../../core/application/use-cases/batch-operations';
import type { ManageNotebooks } from '../../core/application/use-cases/manage-notebooks';
import type { Notebook } from '../../core/domain/entities';
import type { BatchAction } from '../../core/domain/value-objects';

/**
 * Modal for batch operations across multiple notebooks.
 */
export class BatchModal extends Modal {
  private notebooks: Notebook[] = [];
  private selectedIds: Set<string> = new Set();
  private action: BatchAction = 'query';
  private queryText = '';
  private sourceUrl = '';

  constructor(
    app: App,
    private batchOps: BatchOperations,
    private manageNotebooks: ManageNotebooks,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Batch Operations' });

    // Load notebooks
    try {
      this.notebooks = await this.manageNotebooks.list();
    } catch (e) {
      contentEl.createEl('p', { text: `Failed to load notebooks: ${e}` });
      return;
    }

    // Action selector
    new Setting(contentEl)
      .setName('Action')
      .addDropdown((dd) => {
        dd.addOption('query', 'Query notebooks')
          .addOption('add_source', 'Add source to notebooks')
          .addOption('studio', 'Generate artifacts')
          .setValue(this.action)
          .onChange((v) => {
            this.action = v as BatchAction;
            this.renderActionInput(inputContainer);
          });
      });

    // Action-specific input
    const inputContainer = contentEl.createDiv();
    this.renderActionInput(inputContainer);

    // Notebook selector
    contentEl.createEl('h5', { text: 'Select Notebooks' });
    const selectAll = contentEl.createDiv({ cls: 'nlm-batch-select-all' });
    const allCb = selectAll.createEl('input', { attr: { type: 'checkbox' } }) as HTMLInputElement;
    selectAll.createEl('span', { text: 'Select all' });
    allCb.addEventListener('change', () => {
      const checkboxes = contentEl.querySelectorAll('.nlm-batch-nb-cb') as NodeListOf<HTMLInputElement>;
      checkboxes.forEach((cb) => { cb.checked = allCb.checked; });
      this.selectedIds = allCb.checked ? new Set(this.notebooks.map((n) => n.id)) : new Set();
    });

    const nbList = contentEl.createDiv({ cls: 'nlm-batch-nb-list' });
    for (const nb of this.notebooks) {
      const row = nbList.createDiv({ cls: 'nlm-batch-nb-row' });
      const cb = row.createEl('input', { cls: 'nlm-batch-nb-cb', attr: { type: 'checkbox' } }) as HTMLInputElement;
      row.createEl('span', { text: nb.title });
      cb.addEventListener('change', () => {
        if (cb.checked) this.selectedIds.add(nb.id);
        else this.selectedIds.delete(nb.id);
      });
    }

    // Execute button
    const execBtn = contentEl.createEl('button', {
      text: 'Execute',
      cls: 'nlm-studio-create-btn',
    });
    execBtn.style.marginTop = '12px';
    execBtn.addEventListener('click', () => this.execute(execBtn));
  }

  private renderActionInput(container: HTMLElement): void {
    container.empty();
    if (this.action === 'query') {
      new Setting(container).setName('Query').addText((t) =>
        t.setPlaceholder('What are the key findings?').onChange((v) => { this.queryText = v; }),
      );
    } else if (this.action === 'add_source') {
      new Setting(container).setName('Source URL').addText((t) =>
        t.setPlaceholder('https://...').onChange((v) => { this.sourceUrl = v; }),
      );
    }
  }

  private async execute(btn: HTMLElement): Promise<void> {
    if (this.selectedIds.size === 0) {
      new Notice('Select at least one notebook');
      return;
    }

    const names = this.notebooks
      .filter((n) => this.selectedIds.has(n.id))
      .map((n) => n.title);

    btn.setAttr('disabled', 'true');
    btn.setText('Executing...');

    try {
      switch (this.action) {
        case 'query':
          if (!this.queryText) { new Notice('Enter a query'); return; }
          await this.batchOps.queryMultiple(this.queryText, names);
          new Notice(`Batch query sent to ${names.length} notebooks`);
          break;
        case 'add_source':
          if (!this.sourceUrl) { new Notice('Enter a URL'); return; }
          await this.batchOps.addSourceToMultiple(this.sourceUrl, names);
          new Notice(`Source added to ${names.length} notebooks`);
          break;
        case 'studio':
          await this.batchOps.generateForMultiple('audio', names);
          new Notice(`Audio generation started for ${names.length} notebooks`);
          break;
      }
      this.close();
    } catch (e) {
      new Notice(`Batch failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      btn.removeAttribute('disabled');
      btn.setText('Execute');
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
