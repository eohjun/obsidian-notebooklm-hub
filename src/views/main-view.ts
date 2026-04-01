import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import { VIEW_TYPE_NOTEBOOKLM, HEALTH_CHECK_INTERVAL_MS } from '../constants';
import type NotebookLMHubPlugin from '../main';
import type { ServerStatus, Notebook } from '../core/domain/entities';
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
  private notebookSelectEl!: HTMLSelectElement;
  private errorBannerEl!: HTMLElement;
  private healthCheckInterval?: ReturnType<typeof setInterval>;

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

    // ── Connection Error Banner (hidden by default) ───────
    this.errorBannerEl = container.createDiv({ cls: 'nlm-connection-error' });
    this.errorBannerEl.style.display = 'none';
    this.errorBannerEl.createEl('span', { text: 'Server disconnected', cls: 'nlm-connection-error-text' });
    const retryBtn = this.errorBannerEl.createEl('button', { text: 'Retry', cls: 'nlm-retry-btn' });
    retryBtn.addEventListener('click', () => this.checkServerStatus());

    // ── Global Notebook Selector ──────────────────────────
    const notebookBar = container.createDiv({ cls: 'nlm-hub-notebook-bar' });
    this.notebookSelectEl = notebookBar.createEl('select', { cls: 'nlm-global-notebook-select' });
    this.notebookSelectEl.createEl('option', { text: 'Select notebook...', attr: { value: '' } });
    this.notebookSelectEl.addEventListener('change', () => {
      const id = this.notebookSelectEl.value;
      const opt = this.notebookSelectEl.selectedOptions[0];
      const title = opt?.text || '';
      this.onNotebookSelected(id);
      this.chatTab?.setNotebookTitle(title);
    });

    const nbRefreshBtn = notebookBar.createEl('button', {
      cls: 'nlm-toolbar-btn',
      attr: { 'aria-label': 'Refresh notebooks' },
    });
    setIcon(nbRefreshBtn, 'refresh-cw');
    nbRefreshBtn.addEventListener('click', () => this.loadGlobalNotebooks());

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
    this.loadGlobalNotebooks();
    this.checkServerStatus();

    // ── Periodic Health Check ─────────────────────────────
    this.healthCheckInterval = setInterval(
      () => this.checkServerStatus(),
      HEALTH_CHECK_INTERVAL_MS,
    );
  }

  async onClose(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.queueTab?.destroy();
    this.plugin.settings.activeTab = this.activeTab;
    await this.plugin.saveSettings();
  }

  // ─────────────────────────────────────────────────────────
  // Global Notebook Selector
  // ─────────────────────────────────────────────────────────

  async loadGlobalNotebooks(): Promise<void> {
    try {
      const notebooks = await this.plugin.manageNotebooks.list();
      const currentId = this.plugin.settings.selectedNotebookId;

      // Clear existing options (except placeholder)
      while (this.notebookSelectEl.options.length > 1) {
        this.notebookSelectEl.remove(1);
      }

      for (const nb of notebooks) {
        const opt = this.notebookSelectEl.createEl('option', {
          text: nb.title,
          attr: { value: nb.id },
        });
        if (nb.id === currentId) {
          opt.selected = true;
          this.chatTab?.setNotebookTitle(nb.title);
        }
      }
    } catch (e) {
      // Silently fail — user can retry or notebooks may not be loaded yet
    }
  }

  // ─────────────────────────────────────────────────────────
  // Tab Initialization
  // ─────────────────────────────────────────────────────────

  private initTabs(): void {
    const app = this.plugin.app;
    const { manageNotebooks, manageSources, syncNotes, queueService, queryNotebook, saveAsNote, createArtifact, runResearch } = this.plugin;

    this.chatTab = new ChatTab(
      app,
      queryNotebook,
      saveAsNote,
      this.plugin.settings.selectedNotebookId,
    );

    this.notebookTab = new NotebookTab(app, manageNotebooks, this.plugin.settings.selectedNotebookId);
    this.notebookTab.setOnNotebookSelect((id) => {
      this.onNotebookSelected(id);
      // Sync the global dropdown
      this.notebookSelectEl.value = id;
      const title = this.notebookSelectEl.selectedOptions[0]?.text || '';
      this.chatTab?.setNotebookTitle(title);
    });
    this.notebookTab.setOnNotebooksChanged(() => this.loadGlobalNotebooks());

    this.sourceTab = new SourceTab(app, manageSources, manageNotebooks);

    this.studioTab = new StudioTab(app, createArtifact, runResearch);

    this.queueTab = new QueueTab(app, queueService, syncNotes);

    // Set initial notebook context
    const nbId = this.plugin.settings.selectedNotebookId;
    if (nbId) {
      this.sourceTab.setNotebookId(nbId);
      this.studioTab.setNotebookId(nbId);
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

  // ─────────────────────────────────────────────────────────
  // Status & Health Check
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

    // Toggle error banner
    if (this.errorBannerEl) {
      const showBanner = status.connectionStatus === 'disconnected' || status.connectionStatus === 'error';
      this.errorBannerEl.style.display = showBanner ? 'flex' : 'none';
      if (showBanner) {
        const errorText = this.errorBannerEl.querySelector('.nlm-connection-error-text');
        if (errorText) {
          errorText.textContent = status.error
            ? `Server error: ${status.error}`
            : 'Server disconnected';
        }
      }
    }
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
