import { Notice, setIcon } from 'obsidian';
import type { QueueService } from '../../core/application/services/queue-service';
import type { SyncNotes } from '../../core/application/use-cases/sync-notes';
import type { QueuedNote } from '../../core/domain/entities';

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  sending: '📤',
  sent: '✅',
  failed: '❌',
};

/**
 * Tab: Queue management — view pending/sent/failed notes, trigger sync.
 */
export class QueueTab {
  private container!: HTMLElement;
  private listEl!: HTMLElement;
  private unsubscribe?: () => void;
  private notebookId = '';

  constructor(
    private queueService: QueueService,
    private syncNotes: SyncNotes,
  ) {}

  render(parent: HTMLElement): void {
    this.container = parent.createDiv({ cls: 'nlm-queue-tab' });
    this.renderToolbar();
    this.listEl = this.container.createDiv({ cls: 'nlm-queue-list' });
    this.renderFooter();
    this.updateList();

    // Subscribe to queue events
    this.unsubscribe = this.queueService.on(() => this.updateList());
  }

  setNotebookId(id: string): void {
    this.notebookId = id;
  }

  destroy(): void {
    this.unsubscribe?.();
  }

  private renderToolbar(): void {
    const toolbar = this.container.createDiv({ cls: 'nlm-tab-toolbar' });

    const info = toolbar.createDiv({ cls: 'nlm-queue-info' });
    info.setAttribute('data-role', 'info');

    const actions = toolbar.createDiv({ cls: 'nlm-queue-toolbar-actions' });

    const clearBtn = actions.createEl('button', {
      cls: 'nlm-toolbar-btn',
      attr: { 'aria-label': 'Clear completed' },
    });
    setIcon(clearBtn, 'eraser');
    clearBtn.addEventListener('click', () => {
      this.queueService.clearCompleted();
      new Notice('Cleared completed items');
    });

    const clearAllBtn = actions.createEl('button', {
      cls: 'nlm-toolbar-btn nlm-action-danger',
      attr: { 'aria-label': 'Clear all' },
    });
    setIcon(clearAllBtn, 'trash-2');
    clearAllBtn.addEventListener('click', () => {
      if (window.confirm('Clear entire queue?')) {
        this.queueService.clear();
        new Notice('Queue cleared');
      }
    });
  }

  private renderFooter(): void {
    const footer = this.container.createDiv({ cls: 'nlm-queue-footer' });

    const sendAllBtn = footer.createEl('button', {
      text: 'Send All',
      cls: 'nlm-queue-send-btn',
      attr: { 'data-role': 'send-btn' },
    });

    const stopBtn = footer.createEl('button', {
      text: 'Stop',
      cls: 'nlm-queue-stop-btn',
      attr: { 'data-role': 'stop-btn', style: 'display:none' },
    });

    sendAllBtn.addEventListener('click', () => this.startProcessing());
    stopBtn.addEventListener('click', () => {
      this.queueService.requestStop();
      new Notice('Stopping after current item...');
    });
  }

  private async startProcessing(): Promise<void> {
    if (!this.notebookId) {
      new Notice('Please select a notebook first (Notebooks tab)');
      return;
    }

    const pending = this.queueService.pendingCount;
    if (pending === 0) {
      new Notice('No pending notes to send');
      return;
    }

    // Toggle buttons
    this.toggleProcessingUI(true);
    new Notice(`Sending ${pending} notes...`);

    try {
      const result = await this.syncNotes.processQueue(
        this.notebookId,
        (sent, failed, total) => {
          this.updateInfo(`Sending... ${sent + failed}/${total}`);
        },
      );

      new Notice(`Done: ${result.sent} sent, ${result.failed} failed`);
    } catch (e) {
      new Notice(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.toggleProcessingUI(false);
    }
  }

  private toggleProcessingUI(processing: boolean): void {
    const sendBtn = this.container.querySelector('[data-role="send-btn"]') as HTMLElement;
    const stopBtn = this.container.querySelector('[data-role="stop-btn"]') as HTMLElement;

    if (sendBtn) sendBtn.style.display = processing ? 'none' : '';
    if (stopBtn) stopBtn.style.display = processing ? '' : 'none';
  }

  private updateInfo(text?: string): void {
    const infoEl = this.container.querySelector('[data-role="info"]') as HTMLElement;
    if (!infoEl) return;

    if (text) {
      infoEl.setText(text);
      return;
    }

    const total = this.queueService.size;
    const pending = this.queueService.pendingCount;
    const sent = this.queueService.getByStatus('sent').length;
    const failed = this.queueService.getByStatus('failed').length;

    const parts: string[] = [];
    if (pending > 0) parts.push(`${pending} pending`);
    if (sent > 0) parts.push(`${sent} sent`);
    if (failed > 0) parts.push(`${failed} failed`);

    infoEl.setText(parts.length > 0 ? parts.join(' · ') : 'Queue empty');
  }

  private updateList(): void {
    if (!this.listEl) return;
    this.listEl.empty();

    this.updateInfo();

    const items = this.queueService.getAll();

    if (items.length === 0) {
      this.listEl.createDiv({
        text: 'Queue is empty. Use "Send to NotebookLM" to add notes.',
        cls: 'nlm-empty-state',
      });
      return;
    }

    for (const item of items) {
      this.renderQueueItem(item);
    }
  }

  private renderQueueItem(item: QueuedNote): void {
    const row = this.listEl.createDiv({
      cls: `nlm-queue-item nlm-queue-status-${item.status}`,
    });

    row.createEl('span', {
      text: STATUS_ICONS[item.status] || '?',
      cls: 'nlm-queue-status-icon',
    });

    const info = row.createDiv({ cls: 'nlm-queue-item-info' });
    info.createEl('span', { text: item.note.title, cls: 'nlm-queue-item-title' });
    if (item.error) {
      info.createEl('span', { text: item.error, cls: 'nlm-queue-item-error' });
    }

    if (item.status === 'pending' || item.status === 'failed') {
      const removeBtn = row.createEl('button', {
        cls: 'nlm-action-btn',
        attr: { 'aria-label': 'Remove' },
      });
      setIcon(removeBtn, 'x');
      removeBtn.addEventListener('click', () => {
        this.queueService.remove(item.id);
      });
    }
  }
}
