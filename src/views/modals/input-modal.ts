import { Modal, App } from 'obsidian';

/**
 * Obsidian-native text input dialog replacing window.prompt().
 * Returns a Promise<string | null> — the entered value, or null if cancelled.
 */
export class InputModal extends Modal {
  private resolved = false;
  private resolvePromise!: (value: string | null) => void;

  constructor(
    app: App,
    private title: string,
    private message: string,
    private defaultValue = '',
    private placeholder = '',
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nlm-modal');

    contentEl.createEl('h3', { text: this.title });
    contentEl.createEl('p', { text: this.message, cls: 'nlm-modal-body' });

    const inputEl = contentEl.createEl('input', {
      cls: 'nlm-modal-input',
      attr: {
        type: 'text',
        placeholder: this.placeholder,
        value: this.defaultValue,
      },
    }) as HTMLInputElement;
    inputEl.value = this.defaultValue;

    const actions = contentEl.createDiv({ cls: 'nlm-modal-actions' });

    const cancelBtn = actions.createEl('button', {
      text: 'Cancel',
      cls: 'nlm-modal-btn nlm-modal-btn-secondary',
    });
    cancelBtn.addEventListener('click', () => {
      this.resolved = true;
      this.resolvePromise(null);
      this.close();
    });

    const okBtn = actions.createEl('button', {
      text: 'OK',
      cls: 'nlm-modal-btn nlm-modal-btn-primary',
    });
    okBtn.addEventListener('click', () => {
      this.resolved = true;
      this.resolvePromise(inputEl.value.trim() || null);
      this.close();
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.resolved = true;
        this.resolvePromise(inputEl.value.trim() || null);
        this.close();
      }
    });

    // Focus and select the input text
    inputEl.focus();
    inputEl.select();
  }

  onClose(): void {
    if (!this.resolved) {
      this.resolvePromise(null);
    }
    this.contentEl.empty();
  }

  async openAndWait(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      super.open();
    });
  }
}
