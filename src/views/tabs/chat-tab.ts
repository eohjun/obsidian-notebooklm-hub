import { Notice, setIcon, MarkdownRenderer } from 'obsidian';
import type { App } from 'obsidian';
import type { QueryNotebook } from '../../core/application/use-cases/query-notebook';
import type { SaveAsNote } from '../../core/application/use-cases/save-as-note';
import type { ManageNotebooks } from '../../core/application/use-cases/manage-notebooks';
import type { ChatMessage, Notebook, QueryResponse } from '../../core/domain/entities';

/**
 * Tab: Chat — query NotebookLM and save responses as Obsidian notes.
 *
 * Features:
 * - Notebook selector dropdown
 * - Message list (user/assistant with citations)
 * - Input bar with send button
 * - "Save as note" per response and "Export session"
 */
export class ChatTab {
  private container!: HTMLElement;
  private messageListEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private sendBtn!: HTMLButtonElement;
  private notebookSelect!: HTMLSelectElement;
  private notebooks: Notebook[] = [];
  private selectedNotebookId = '';
  private selectedNotebookTitle = '';
  private isSending = false;

  constructor(
    private app: App,
    private queryNotebook: QueryNotebook,
    private saveAsNote: SaveAsNote,
    private manageNotebooks: ManageNotebooks,
    initialNotebookId: string,
  ) {
    this.selectedNotebookId = initialNotebookId;
  }

  render(parent: HTMLElement): void {
    this.container = parent.createDiv({ cls: 'nlm-chat-tab' });

    this.renderHeader();
    this.renderMessageList();
    this.renderInputBar();
    this.loadNotebooks();
    this.renderExistingMessages();
  }

  setNotebookId(id: string): void {
    this.selectedNotebookId = id;
    if (this.notebookSelect) {
      this.notebookSelect.value = id;
    }
    this.renderExistingMessages();
  }

  // ─────────────────────────────────────────────────────────
  // Header: notebook selector + actions
  // ─────────────────────────────────────────────────────────

  private renderHeader(): void {
    const header = this.container.createDiv({ cls: 'nlm-chat-header' });

    this.notebookSelect = header.createEl('select', { cls: 'nlm-chat-notebook-select' });
    this.notebookSelect.createEl('option', { text: 'Select notebook...', attr: { value: '' } });
    this.notebookSelect.addEventListener('change', () => {
      this.selectedNotebookId = this.notebookSelect.value;
      const opt = this.notebookSelect.selectedOptions[0];
      this.selectedNotebookTitle = opt?.text || '';
      this.renderExistingMessages();
    });

    const actions = header.createDiv({ cls: 'nlm-chat-header-actions' });

    const exportBtn = actions.createEl('button', {
      cls: 'nlm-toolbar-btn',
      attr: { 'aria-label': 'Export session as note' },
    });
    setIcon(exportBtn, 'download');
    exportBtn.addEventListener('click', () => this.exportSession());

    const clearBtn = actions.createEl('button', {
      cls: 'nlm-toolbar-btn',
      attr: { 'aria-label': 'Clear chat' },
    });
    setIcon(clearBtn, 'trash-2');
    clearBtn.addEventListener('click', () => this.clearChat());
  }

  // ─────────────────────────────────────────────────────────
  // Message List
  // ─────────────────────────────────────────────────────────

  private renderMessageList(): void {
    this.messageListEl = this.container.createDiv({ cls: 'nlm-chat-messages' });
  }

  private renderExistingMessages(): void {
    if (!this.messageListEl) return;
    this.messageListEl.empty();

    if (!this.selectedNotebookId) {
      this.messageListEl.createDiv({
        text: 'Select a notebook above to start chatting.',
        cls: 'nlm-empty-state',
      });
      return;
    }

    const session = this.queryNotebook.getSession(this.selectedNotebookId);
    if (!session || session.messages.length === 0) {
      this.messageListEl.createDiv({
        text: 'Ask a question about this notebook\'s sources.',
        cls: 'nlm-empty-state',
      });
      return;
    }

    for (const msg of session.messages) {
      this.renderMessage(msg);
    }

    this.scrollToBottom();
  }

  private renderMessage(msg: ChatMessage): void {
    const wrapper = this.messageListEl.createDiv({
      cls: `nlm-chat-msg nlm-chat-msg-${msg.role}`,
    });

    const roleLabel = wrapper.createDiv({ cls: 'nlm-chat-msg-role' });
    roleLabel.setText(msg.role === 'user' ? 'You' : 'NotebookLM');

    const contentEl = wrapper.createDiv({ cls: 'nlm-chat-msg-content' });

    if (msg.role === 'assistant') {
      // Render markdown for assistant messages
      MarkdownRenderer.render(this.app, msg.content, contentEl, '', this as any);

      // Citations
      if (msg.citations?.length) {
        const citesEl = wrapper.createDiv({ cls: 'nlm-chat-citations' });
        citesEl.createEl('span', { text: 'Sources: ', cls: 'nlm-chat-citations-label' });
        for (const cite of msg.citations) {
          citesEl.createEl('span', {
            text: cite.sourceTitle || 'Source',
            cls: 'nlm-chat-citation-badge',
          });
        }
      }

      // Save as note button
      const actionsEl = wrapper.createDiv({ cls: 'nlm-chat-msg-actions' });
      const saveBtn = actionsEl.createEl('button', {
        cls: 'nlm-chat-save-btn',
        attr: { 'aria-label': 'Save as note' },
      });
      setIcon(saveBtn, 'file-plus');
      saveBtn.createEl('span', { text: 'Save as note' });
      saveBtn.addEventListener('click', () => this.saveResponseAsNote(msg));
    } else {
      contentEl.setText(msg.content);
    }
  }

  private scrollToBottom(): void {
    if (this.messageListEl) {
      this.messageListEl.scrollTop = this.messageListEl.scrollHeight;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Input Bar
  // ─────────────────────────────────────────────────────────

  private renderInputBar(): void {
    const bar = this.container.createDiv({ cls: 'nlm-chat-input-bar' });

    this.inputEl = bar.createEl('input', {
      cls: 'nlm-chat-input',
      attr: {
        type: 'text',
        placeholder: 'Ask about this notebook...',
      },
    });

    this.sendBtn = bar.createEl('button', {
      cls: 'nlm-chat-send-btn',
      attr: { 'aria-label': 'Send' },
    });
    setIcon(this.sendBtn, 'send');

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });

    this.sendBtn.addEventListener('click', () => this.send());
  }

  private async send(): Promise<void> {
    const query = this.inputEl.value.trim();
    if (!query) return;

    if (!this.selectedNotebookId) {
      new Notice('Please select a notebook first');
      return;
    }

    if (this.isSending) return;

    this.isSending = true;
    this.inputEl.value = '';
    this.setSendingState(true);

    // Show user message immediately
    const userMsg: ChatMessage = { role: 'user', content: query, timestamp: Date.now() };
    this.renderMessage(userMsg);

    // Show loading indicator
    const loadingEl = this.messageListEl.createDiv({ cls: 'nlm-chat-loading' });
    loadingEl.setText('Thinking...');
    this.scrollToBottom();

    try {
      const response = await this.queryNotebook.query(
        this.selectedNotebookId,
        this.selectedNotebookTitle,
        query,
      );

      // Remove loading, render assistant message
      loadingEl.remove();
      const session = this.queryNotebook.getSession(this.selectedNotebookId);
      const lastMsg = session?.messages[session.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        this.renderMessage(lastMsg);
      }
    } catch (e) {
      loadingEl.remove();
      const errMsg = e instanceof Error ? e.message : String(e);
      const errorEl = this.messageListEl.createDiv({ cls: 'nlm-chat-error' });
      errorEl.setText(`Error: ${errMsg}`);
      new Notice(`Query failed: ${errMsg}`);
    } finally {
      this.isSending = false;
      this.setSendingState(false);
      this.scrollToBottom();
      this.inputEl.focus();
    }
  }

  private setSendingState(sending: boolean): void {
    this.inputEl.disabled = sending;
    this.sendBtn.disabled = sending;
    if (sending) {
      this.sendBtn.addClass('nlm-sending');
    } else {
      this.sendBtn.removeClass('nlm-sending');
    }
  }

  // ─────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────

  private async saveResponseAsNote(msg: ChatMessage): Promise<void> {
    // Find the preceding user question
    const session = this.queryNotebook.getSession(this.selectedNotebookId);
    if (!session) return;

    const idx = session.messages.indexOf(msg);
    const userMsg = idx > 0 ? session.messages[idx - 1] : null;
    const query = userMsg?.role === 'user' ? userMsg.content : 'Query';

    try {
      const path = await this.saveAsNote.saveResponse({
        query,
        response: {
          response: msg.content,
          citations: msg.citations || [],
        },
        notebookTitle: this.selectedNotebookTitle,
      });
      new Notice(`Saved to ${path}`);
    } catch (e) {
      new Notice(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async exportSession(): Promise<void> {
    if (!this.selectedNotebookId) {
      new Notice('No active chat session');
      return;
    }

    const session = this.queryNotebook.getSession(this.selectedNotebookId);
    if (!session || session.messages.length === 0) {
      new Notice('No messages to export');
      return;
    }

    try {
      const path = await this.saveAsNote.saveSession({
        messages: session.messages,
        notebookTitle: this.selectedNotebookTitle,
      });
      new Notice(`Session exported to ${path}`);
    } catch (e) {
      new Notice(`Failed to export: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private clearChat(): void {
    if (!this.selectedNotebookId) return;
    this.queryNotebook.clearSession(this.selectedNotebookId);
    this.renderExistingMessages();
    new Notice('Chat cleared');
  }

  // ─────────────────────────────────────────────────────────
  // Notebook Loading
  // ─────────────────────────────────────────────────────────

  private async loadNotebooks(): Promise<void> {
    try {
      this.notebooks = await this.manageNotebooks.list();

      // Clear existing options (except placeholder)
      while (this.notebookSelect.options.length > 1) {
        this.notebookSelect.remove(1);
      }

      for (const nb of this.notebooks) {
        const opt = this.notebookSelect.createEl('option', {
          text: nb.title,
          attr: { value: nb.id },
        });
        if (nb.id === this.selectedNotebookId) {
          opt.selected = true;
          this.selectedNotebookTitle = nb.title;
        }
      }
    } catch (e) {
      new Notice(`Failed to load notebooks: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
