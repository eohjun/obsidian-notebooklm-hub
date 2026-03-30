import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_NOTEBOOKLM } from '../constants';
import type NotebookLMHubPlugin from '../main';
import type { ServerStatus } from '../core/domain/entities';
import { ChatTab } from './tabs/chat-tab';
import { NotebookTab } from './tabs/notebook-tab';
import { SourceTab } from './tabs/source-tab';
import { StudioTab } from './tabs/studio-tab';
import { QueueTab } from './tabs/queue-tab';

const TABS = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'notebooks', label: 'Notebooks', icon: '📓' },
  { id: 'sources', label: 'Sources', icon: '📎' },
  { id: 'studio', label: 'Studio', icon: '🎙️' },
  { id: 'queue', label: 'Queue', icon: '📤' },
] as const;

/**
 * Main sidebar view with tabbed navigation.
 */
export class MainView extends ItemView {
  private plugin: NotebookLMHubPlugin;
  private activeTab: string;
  private statusEl!: HTMLElement;
  private tabContainer!: HTMLElement;
  private contentContainer!: HTMLElement;

  // Tab instances (created once, rendered on demand)
  private chatTab?: ChatTab;
  private notebookTab?: NotebookTab;
  private sourceTab?: SourceTab;
  private studioTab?: StudioTab;
  private queueTab?: QueueTab;

  constructor(leaf: WorkspaceLeaf, plugin: NotebookLMHubPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.activeTab = plugin.settings.activeTab || 'chat';
  }

  getViewType(): string { return VIEW_TYPE_NOTEBOOKLM; }
  getDisplayText(): string { return 'NotebookLM Hub'; }
  getIcon(): string { return 'book-open'; }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('nlm-hub-container');

    // ── Header ────────────────────────────────────────────
    const header = container.createDiv({ cls: 'nlm-hub-header' });
    header.createEl('span', { text: 'NotebookLM Hub', cls: 'nlm-hub-title' });
    this.statusEl = header.createEl('span', { cls: 'nlm-hub-status' });
    this.updateStatus({ connectionStatus: 'connecting' });

    // ── Tabs ──────────────────────────────────────────────
    this.tabContainer = container.createDiv({ cls: 'nlm-hub-tabs' });
    for (const tab of TABS) {
      const tabEl = this.tabContainer.createEl('button', {
        cls: `nlm-hub-tab ${this.activeTab === tab.id ? 'active' : ''}`,
        attr: { 'data-tab': tab.id },
      });
      tabEl.createEl('span', { text: tab.icon, cls: 'nlm-tab-icon' });
      tabEl.createEl('span', { text: tab.label, cls: 'nlm-tab-label' });
      tabEl.addEventListener('click', () => this.switchTab(tab.id));
    }

    // ── Content ───────────────────────────────────────────
    this.contentContainer = container.createDiv({ cls: 'nlm-hub-content' });

    // Initialize tab instances
    this.initTabs();
    this.renderTab(this.activeTab);
    this.checkServerStatus();
  }

  async onClose(): Promise<void> {
    this.queueTab?.destroy();
    this.plugin.settings.activeTab = this.activeTab;
    await this.plugin.saveSettings();
  }

  // ─────────────────────────────────────────────────────────
  // Tab Initialization
  // ─────────────────────────────────────────────────────────

  private initTabs(): void {
    const { manageNotebooks, manageSources, syncNotes, queueService, queryNotebook, saveAsNote, createArtifact, runResearch } = this.plugin;

    this.chatTab = new ChatTab(
      this.plugin.app,
      queryNotebook,
      saveAsNote,
      manageNotebooks,
      this.plugin.settings.selectedNotebookId,
    );

    this.notebookTab = new NotebookTab(manageNotebooks, this.plugin.settings.selectedNotebookId);
    this.notebookTab.setOnNotebookSelect((id) => this.onNotebookSelected(id));

    this.sourceTab = new SourceTab(manageSources, manageNotebooks);

    this.studioTab = new StudioTab(createArtifact, runResearch);

    this.queueTab = new QueueTab(queueService, syncNotes);

    // Set initial notebook context
    const nbId = this.plugin.settings.selectedNotebookId;
    if (nbId) {
      this.sourceTab.setNotebookId(nbId);
      this.queueTab.setNotebookId(nbId);
    }
  }

  private onNotebookSelected(notebookId: string): void {
    this.plugin.settings.selectedNotebookId = notebookId;
    this.plugin.saveSettings();

    this.chatTab?.setNotebookId(notebookId);
    this.sourceTab?.setNotebookId(notebookId);
    this.studioTab?.setNotebookId(notebookId);
    this.queueTab?.setNotebookId(notebookId);
  }

  // ─────────────────────────────────────────────────────────
  // Tab Rendering
  // ─────────────────────────────────────────────────────────

  private switchTab(tabId: string): void {
    this.activeTab = tabId;
    this.tabContainer.querySelectorAll('.nlm-hub-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    this.renderTab(tabId);
  }

  private renderTab(tabId: string): void {
    this.contentContainer.empty();

    switch (tabId) {
      case 'chat':
        this.chatTab?.render(this.contentContainer);
        break;
      case 'notebooks':
        this.notebookTab?.render(this.contentContainer);
        break;
      case 'sources':
        this.sourceTab?.render(this.contentContainer);
        break;
      case 'studio':
        this.studioTab?.render(this.contentContainer);
        break;
      case 'queue':
        this.queueTab?.render(this.contentContainer);
        break;
    }
  }

  private renderPlaceholder(title: string, description: string): void {
    const wrapper = this.contentContainer.createDiv({ cls: 'nlm-tab-placeholder' });
    wrapper.createEl('h4', { text: title });
    wrapper.createEl('p', { text: description, cls: 'nlm-tab-placeholder-desc' });
  }

  // ─────────────────────────────────────────────────────────
  // Status
  // ─────────────────────────────────────────────────────────

  updateStatus(status: ServerStatus): void {
    if (!this.statusEl) return;
    this.statusEl.empty();

    const dot = this.statusEl.createEl('span', { cls: 'nlm-status-dot' });
    const label = this.statusEl.createEl('span', { cls: 'nlm-status-label' });

    const map: Record<string, [string, string]> = {
      connected: ['nlm-status-connected', 'Connected'],
      disconnected: ['nlm-status-disconnected', 'Disconnected'],
      connecting: ['nlm-status-connecting', 'Connecting...'],
      error: ['nlm-status-error', status.error ? `Error: ${status.error}` : 'Error'],
    };

    const [cls, text] = map[status.connectionStatus] || map.error;
    dot.addClass(cls);
    label.setText(text);
  }

  private async checkServerStatus(): Promise<void> {
    try {
      const status = await this.plugin.client.getServerStatus();
      this.updateStatus(status);
    } catch {
      this.updateStatus({ connectionStatus: 'error', error: 'Failed to check server' });
    }
  }
}
