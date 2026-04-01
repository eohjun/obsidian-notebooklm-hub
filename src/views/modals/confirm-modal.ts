import { Modal, App } from 'obsidian';

/**
 * Obsidian-native confirmation dialog replacing window.confirm().
 * Returns a Promise<boolean> — true if confirmed, false if cancelled.
 */
export class ConfirmModal extends Modal {
  private resolved = false;
  private resolvePromise!: (value: boolean) => void;

  constructor(
    app: App,
    private title: string,
    private message: string,
    private confirmText = 'Confirm',
    private isDangerous = false,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nlm-modal');

    contentEl.createEl('h3', { text: this.title });
    contentEl.createEl('p', { text: this.message, cls: 'nlm-modal-body' });

    const actions = contentEl.createDiv({ cls: 'nlm-modal-actions' });

    const cancelBtn = actions.createEl('button', {
      text: 'Cancel',
      cls: 'nlm-modal-btn nlm-modal-btn-secondary',
    });
    cancelBtn.addEventListener('click', () => {
      this.resolved = true;
      this.resolvePromise(false);
      this.close();
    });

    const confirmBtn = actions.createEl('button', {
      text: this.confirmText,
      cls: `nlm-modal-btn ${this.isDangerous ? 'nlm-modal-btn-danger' : 'nlm-modal-btn-primary'}`,
    });
    confirmBtn.addEventListener('click', () => {
      this.resolved = true;
      this.resolvePromise(true);
      this.close();
    });

    // Focus confirm button for keyboard accessibility
    confirmBtn.focus();
  }

  onClose(): void {
    if (!this.resolved) {
      this.resolvePromise(false);
    }
    this.contentEl.empty();
  }

  async openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      super.open();
    });
  }
}
