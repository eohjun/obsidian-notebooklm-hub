/**
 * NotebookLM Hub Plugin
 *
 * Comprehensive NotebookLM integration for Obsidian.
 * Communicates with notebooklm-mcp HTTP server for full API access.
 */

import {
  Plugin,
  Notice,
  TFile,
  Editor,
  MarkdownView,
  Menu,
  normalizePath,
} from 'obsidian';
import { VIEW_TYPE_NOTEBOOKLM } from './constants';
import { NotebookLMHubSettings, DEFAULT_SETTINGS, migrateSettings } from './types';
import { NotebookLMHttpAdapter } from './core/adapters/notebooklm/http-adapter';
import { ServerProcessAdapter } from './core/adapters/notebooklm/server-process';
import { ManageNotebooks } from './core/application/use-cases/manage-notebooks';
import { ManageSources } from './core/application/use-cases/manage-sources';
import { SyncNotes } from './core/application/use-cases/sync-notes';
import { QueryNotebook } from './core/application/use-cases/query-notebook';
import { SaveAsNote } from './core/application/use-cases/save-as-note';
import { CreateArtifact } from './core/application/use-cases/create-artifact';
import { RunResearch } from './core/application/use-cases/run-research';
import { BatchOperations } from './core/application/use-cases/batch-operations';
import { ManagePipeline } from './core/application/use-cases/manage-pipeline';
import { ManageSharing } from './core/application/use-cases/manage-sharing';
import { ManageTags } from './core/application/use-cases/manage-tags';
import { ManageNlmNotes } from './core/application/use-cases/manage-nlm-notes';
import { AIDelegatedQuery } from './core/application/use-cases/ai-delegated-query';
import { QueueService } from './core/application/services/queue-service';
import { BatchModal } from './views/modals/batch-modal';
import { PipelineModal } from './views/modals/pipeline-modal';
import { SetupWizard } from './views/modals/setup-wizard';
import { MainView } from './views/main-view';
import { NotebookLMHubSettingTab } from './views/settings-tab';
import type { NoteData } from './core/domain/entities';

export default class NotebookLMHubPlugin extends Plugin {
  settings!: NotebookLMHubSettings;
  client!: NotebookLMHttpAdapter;
  server!: ServerProcessAdapter;

  // Use cases
  manageNotebooks!: ManageNotebooks;
  manageSources!: ManageSources;
  syncNotes!: SyncNotes;
  queryNotebook!: QueryNotebook;
  saveAsNote!: SaveAsNote;
  createArtifact!: CreateArtifact;
  runResearch!: RunResearch;
  batchOperations!: BatchOperations;
  managePipeline!: ManagePipeline;
  manageSharing!: ManageSharing;
  manageTags!: ManageTags;
  manageNlmNotes!: ManageNlmNotes;
  aiDelegatedQuery!: AIDelegatedQuery;
  queueService!: QueueService;

  private statusBarItem!: HTMLElement;

  async onload(): Promise<void> {
    await this.loadSettings();

    // ── Initialize adapters ─────────────────────────────────
    this.client = new NotebookLMHttpAdapter(
      this.settings.mcpHost,
      this.settings.mcpPort,
    );

    this.server = new ServerProcessAdapter({
      host: this.settings.mcpHost,
      port: this.settings.mcpPort,
      nlmPath: this.settings.nlmPath,
      mcpServerPath: this.settings.mcpServerPath,
    });

    // ── Initialize use cases ────────────────────────────────
    this.queueService = new QueueService();
    this.queueService.on(() => this.updateStatusBar());
    this.manageNotebooks = new ManageNotebooks(this.client);
    this.manageSources = new ManageSources(this.client);
    this.syncNotes = new SyncNotes(this.client, this.queueService);
    this.queryNotebook = new QueryNotebook(this.client);
    this.saveAsNote = new SaveAsNote(this.app, this.settings.noteSaveFolder);
    this.createArtifact = new CreateArtifact(this.client, this.app, this.settings.downloadFolder);
    this.runResearch = new RunResearch(this.client);
    this.batchOperations = new BatchOperations(this.client);
    this.managePipeline = new ManagePipeline(this.client);
    this.manageSharing = new ManageSharing(this.client);
    this.manageTags = new ManageTags(this.client);
    this.manageNlmNotes = new ManageNlmNotes(this.client);
    this.aiDelegatedQuery = new AIDelegatedQuery(this.client);

    // ── Register view ───────────────────────────────────────
    this.registerView(
      VIEW_TYPE_NOTEBOOKLM,
      (leaf) => new MainView(leaf, this),
    );

    // ── Status bar ──────────────────────────────────────────
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar();

    // ── Ribbon icons ────────────────────────────────────────
    this.addRibbonIcon('send', 'Send current note to NotebookLM', async () => {
      await this.sendCurrentNote();
    });

    this.addRibbonIcon('book-open', 'Open NotebookLM Hub', async () => {
      await this.activateView();
    });

    // ── Commands ────────────────────────────────────────────
    this.addCommand({
      id: 'send-current-note',
      name: 'Send current note to NotebookLM',
      editorCallback: async () => {
        await this.sendCurrentNote();
      },
    });

    this.addCommand({
      id: 'send-selection',
      name: 'Send selected text to NotebookLM',
      editorCallback: async (editor: Editor) => {
        const selection = editor.getSelection();
        if (selection) {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          await this.sendText(selection, view?.file?.basename || 'Selection');
        } else {
          new Notice('Please select some text');
        }
      },
    });

    this.addCommand({
      id: 'send-all-notes',
      name: 'Send all permanent notes to NotebookLM',
      callback: async () => {
        await this.sendAllPermanentNotes();
      },
    });

    this.addCommand({
      id: 'open-notebooklm',
      name: 'Open NotebookLM Hub',
      callback: async () => {
        await this.activateView();
      },
    });

    this.addCommand({
      id: 'batch-operations',
      name: 'Batch operations across notebooks',
      callback: () => {
        new BatchModal(this.app, this.batchOperations, this.manageNotebooks).open();
      },
    });

    this.addCommand({
      id: 'setup-wizard',
      name: 'Run setup wizard',
      callback: () => {
        new SetupWizard(this.app, this.server, this.client).open();
      },
    });

    this.addCommand({
      id: 'run-pipeline',
      name: 'Run pipeline on selected notebook',
      callback: () => {
        const nbId = this.settings.selectedNotebookId;
        if (!nbId) {
          new Notice('Select a notebook first');
          return;
        }
        new PipelineModal(this.app, this.managePipeline, nbId).open();
      },
    });

    // ── Context menus ───────────────────────────────────────
    this.registerEvent(
      (this.app.workspace as any).on('file-menu', (menu: Menu, file: TFile) => {
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem((item) => {
            item
              .setTitle('Send to NotebookLM')
              .setIcon('send')
              .onClick(async () => {
                await this.sendFile(file);
              });
          });
        }
      }),
    );

    this.registerEvent(
      (this.app.workspace as any).on(
        'editor-menu',
        (menu: Menu, editor: Editor, view: MarkdownView) => {
          menu.addItem((item) => {
            item
              .setTitle('Send to NotebookLM')
              .setIcon('send')
              .onClick(async () => {
                await this.sendCurrentNote();
              });
          });

          const selection = editor.getSelection();
          if (selection) {
            menu.addItem((item) => {
              item
                .setTitle('Send selection to NotebookLM')
                .setIcon('text-select')
                .onClick(async () => {
                  await this.sendText(selection, view.file?.basename || 'Selection');
                });
            });
          }
        },
      ),
    );

    // ── Settings tab ────────────────────────────────────────
    this.addSettingTab(new NotebookLMHubSettingTab(this.app, this));

    // ── Auto-start server ───────────────────────────────────
    if (this.settings.autoStartServer) {
      this.app.workspace.onLayoutReady(async () => {
        try {
          await this.server.start();
        } catch (e) {
          // Server may already be running or nlm not installed — silent fail
          console.log('NotebookLM Hub: Server auto-start skipped:', e);
        }
      });
    }

    // ── Auto open view ──────────────────────────────────────
    if (this.settings.autoOpenView) {
      this.app.workspace.onLayoutReady(() => {
        this.activateView();
      });
    }
  }

  async onunload(): Promise<void> {
    // Stop server if we started it
    await this.server.stop();
  }

  // ─────────────────────────────────────────────────────────
  // Settings
  // ─────────────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = migrateSettings(data || {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);

    // Update adapters/use cases with new settings
    this.client.updateConnection(this.settings.mcpHost, this.settings.mcpPort);
    this.saveAsNote?.updateSaveFolder(this.settings.noteSaveFolder);
    this.createArtifact?.updateDownloadFolder(this.settings.downloadFolder);
    this.server.updateConfig({
      host: this.settings.mcpHost,
      port: this.settings.mcpPort,
      nlmPath: this.settings.nlmPath,
      mcpServerPath: this.settings.mcpServerPath,
    });
  }

  // ─────────────────────────────────────────────────────────
  // View Management
  // ─────────────────────────────────────────────────────────

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_NOTEBOOKLM);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
    } else {
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_NOTEBOOKLM, active: true });
        this.app.workspace.revealLeaf(leaf);
      }
    }
  }

  getView(): MainView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_NOTEBOOKLM);
    return leaves.length > 0 ? (leaves[0].view as MainView) : null;
  }

  // ─────────────────────────────────────────────────────────
  // Note Processing (migrated from v0.3.x)
  // ─────────────────────────────────────────────────────────

  isPermanentNote(file: TFile): boolean {
    const folder = normalizePath(this.settings.zettelkastenFolder);
    const filePath = normalizePath(file.path);
    return (
      filePath.startsWith(folder) &&
      file.extension === 'md' &&
      /^\d{12}/.test(file.basename)
    );
  }

  async getNoteData(file: TFile): Promise<NoteData> {
    const content = await this.app.vault.cachedRead(file);
    const metadata = this.app.metadataCache.getFileCache(file);

    let processedContent = content;
    if (!this.settings.includeFrontmatter) {
      processedContent = processedContent.replace(/^---[\s\S]*?---\n?/, '');
    }

    const noteData: NoteData = {
      title: file.basename,
      content: processedContent,
      path: normalizePath(file.path),
    };

    if (this.settings.includeMetadata) {
      noteData.metadata = {
        created: file.stat.ctime,
        modified: file.stat.mtime,
        tags: metadata?.tags?.map((t) => t.tag) || [],
      };
    }

    return noteData;
  }

  async sendCurrentNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('No note is currently open');
      return;
    }
    await this.sendFile(file);
  }

  async sendFile(file: TFile): Promise<void> {
    const noteData = await this.getNoteData(file);
    await this.queueNote(noteData);
  }

  async sendText(text: string, title: string): Promise<void> {
    const noteData: NoteData = { title, content: text, path: '' };
    await this.queueNote(noteData);
  }

  async sendAllPermanentNotes(): Promise<void> {
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => this.isPermanentNote(f));

    if (files.length === 0) {
      new Notice(`No permanent notes found in ${this.settings.zettelkastenFolder}`);
      return;
    }

    new Notice(`Preparing to send ${files.length} permanent notes...`);

    for (const file of files) {
      const noteData = await this.getNoteData(file);
      this.queueService.add(noteData);
    }

    new Notice(`${files.length} notes added to queue`);
    this.updateStatusBar();
    await this.activateView();
  }

  async queueNote(noteData: NoteData): Promise<void> {
    this.queueService.add(noteData);
    this.updateStatusBar();
    await this.activateView();
  }

  updateStatusBar(): void {
    const pending = this.queueService.pendingCount;
    const total = this.queueService.size;

    if (pending > 0) {
      this.statusBarItem.setText(`NLM: ${pending} pending`);
    } else if (total > 0) {
      this.statusBarItem.setText(`NLM: ${total} queued`);
    } else {
      this.statusBarItem.setText('NLM Hub');
    }
  }
}
