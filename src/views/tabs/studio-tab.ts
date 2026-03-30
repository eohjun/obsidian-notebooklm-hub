import { Notice, setIcon } from 'obsidian';
import type { CreateArtifact } from '../../core/application/use-cases/create-artifact';
import type { RunResearch } from '../../core/application/use-cases/run-research';
import type { StudioArtifact, ResearchTask, DiscoveredSource } from '../../core/domain/entities';
import type { ArtifactType } from '../../core/domain/value-objects';

interface ArtifactOption {
  type: ArtifactType;
  label: string;
  icon: string;
  options?: { key: string; label: string; values: string[] }[];
}

const ARTIFACT_TYPES: ArtifactOption[] = [
  { type: 'audio', label: 'Audio', icon: '🎙️', options: [
    { key: 'format', label: 'Format', values: ['deep_dive', 'brief', 'critique', 'debate'] },
    { key: 'length', label: 'Length', values: ['short', 'default', 'long'] },
  ]},
  { type: 'video', label: 'Video', icon: '🎬', options: [
    { key: 'format', label: 'Format', values: ['explainer', 'brief', 'cinematic'] },
    { key: 'style', label: 'Style', values: ['auto_select', 'classic', 'whiteboard', 'kawaii', 'anime', 'watercolor'] },
  ]},
  { type: 'report', label: 'Report', icon: '📄', options: [
    { key: 'format', label: 'Format', values: ['Briefing Doc', 'Study Guide', 'Blog Post'] },
  ]},
  { type: 'flashcards', label: 'Flashcards', icon: '🃏' },
  { type: 'quiz', label: 'Quiz', icon: '❓', options: [
    { key: 'count', label: 'Count', values: ['5', '10', '20'] },
  ]},
  { type: 'infographic', label: 'Infographic', icon: '📊', options: [
    { key: 'style', label: 'Style', values: ['auto_select', 'sketch_note', 'professional', 'bento_grid'] },
  ]},
  { type: 'slides', label: 'Slides', icon: '📽️' },
  { type: 'data_table', label: 'Data Table', icon: '📋' },
  { type: 'mind_map', label: 'Mind Map', icon: '🧠' },
];

/**
 * Tab: Studio — create artifacts + research sources.
 */
export class StudioTab {
  private container!: HTMLElement;
  private notebookId = '';
  private selectedType: ArtifactOption = ARTIFACT_TYPES[0];
  private artifacts: StudioArtifact[] = [];

  constructor(
    private createArtifact: CreateArtifact,
    private runResearch: RunResearch,
  ) {}

  render(parent: HTMLElement): void {
    this.container = parent.createDiv({ cls: 'nlm-studio-tab' });
    this.renderArtifactCreator();
    this.renderArtifactList();
    this.renderResearchPanel();
    if (this.notebookId) this.refreshArtifacts();
  }

  setNotebookId(id: string): void {
    this.notebookId = id;
  }

  // ─────────────────────────────────────────────────────────
  // Artifact Creator
  // ─────────────────────────────────────────────────────────

  private renderArtifactCreator(): void {
    const section = this.container.createDiv({ cls: 'nlm-studio-section' });
    section.createEl('h5', { text: 'Create Artifact', cls: 'nlm-section-title' });

    // Type grid
    const grid = section.createDiv({ cls: 'nlm-artifact-grid' });
    for (const opt of ARTIFACT_TYPES) {
      const btn = grid.createEl('button', {
        cls: `nlm-artifact-type-btn ${opt.type === this.selectedType.type ? 'active' : ''}`,
        attr: { 'data-type': opt.type },
      });
      btn.createEl('span', { text: opt.icon, cls: 'nlm-artifact-icon' });
      btn.createEl('span', { text: opt.label, cls: 'nlm-artifact-label' });
      btn.addEventListener('click', () => {
        this.selectedType = opt;
        grid.querySelectorAll('.nlm-artifact-type-btn').forEach((el) => el.classList.remove('active'));
        btn.classList.add('active');
        this.renderOptionsPanel(optionsContainer);
      });
    }

    // Options panel
    const optionsContainer = section.createDiv({ cls: 'nlm-artifact-options' });
    this.renderOptionsPanel(optionsContainer);

    // Create button
    const createBtn = section.createEl('button', {
      text: 'Generate',
      cls: 'nlm-studio-create-btn',
    });
    createBtn.addEventListener('click', () => this.startCreation(createBtn, optionsContainer));
  }

  private renderOptionsPanel(container: HTMLElement): void {
    container.empty();
    const options = this.selectedType.options;
    if (!options?.length) {
      container.createEl('span', { text: 'No additional options', cls: 'nlm-text-muted' });
      return;
    }
    for (const opt of options) {
      const row = container.createDiv({ cls: 'nlm-option-row' });
      row.createEl('label', { text: opt.label, cls: 'nlm-option-label' });
      const select = row.createEl('select', {
        cls: 'nlm-option-select',
        attr: { 'data-key': opt.key },
      });
      for (const val of opt.values) {
        select.createEl('option', { text: val, attr: { value: val } });
      }
    }
  }

  private async startCreation(btn: HTMLElement, optionsContainer: HTMLElement): Promise<void> {
    if (!this.notebookId) {
      new Notice('Select a notebook first (Notebooks tab)');
      return;
    }

    btn.setAttr('disabled', 'true');
    btn.setText('Generating...');

    // Gather options
    const params: Record<string, unknown> = { artifactType: this.selectedType.type };
    optionsContainer.querySelectorAll('select').forEach((sel) => {
      const key = sel.getAttribute('data-key');
      if (key) {
        const val = (sel as HTMLSelectElement).value;
        params[key] = key === 'count' ? parseInt(val, 10) : val;
      }
    });

    try {
      const artifact = await this.createArtifact.create(this.notebookId, params as any);
      new Notice(`${this.selectedType.label} generation started!`);

      // Poll for completion
      const completed = await this.createArtifact.waitForCompletion(
        this.notebookId,
        artifact.id,
        (status) => btn.setText(`Status: ${status}...`),
      );

      if (completed) {
        new Notice(`${this.selectedType.label} ready!`);
      }
      await this.refreshArtifacts();
    } catch (e) {
      new Notice(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      btn.removeAttribute('disabled');
      btn.setText('Generate');
    }
  }

  // ─────────────────────────────────────────────────────────
  // Artifact List
  // ─────────────────────────────────────────────────────────

  private renderArtifactList(): void {
    const section = this.container.createDiv({ cls: 'nlm-studio-section' });

    const header = section.createDiv({ cls: 'nlm-section-header' });
    header.createEl('h5', { text: 'Artifacts', cls: 'nlm-section-title' });
    const refreshBtn = header.createEl('button', { cls: 'nlm-toolbar-btn', attr: { 'aria-label': 'Refresh' } });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => this.refreshArtifacts());

    section.createDiv({ cls: 'nlm-artifact-list', attr: { 'data-role': 'artifact-list' } });
  }

  private async refreshArtifacts(): Promise<void> {
    const listEl = this.container.querySelector('[data-role="artifact-list"]') as HTMLElement;
    if (!listEl || !this.notebookId) return;

    listEl.empty();
    listEl.createDiv({ text: 'Loading...', cls: 'nlm-loading' });

    try {
      this.artifacts = await this.createArtifact.getStatus(this.notebookId);
      listEl.empty();

      if (this.artifacts.length === 0) {
        listEl.createDiv({ text: 'No artifacts yet.', cls: 'nlm-empty-state' });
        return;
      }

      for (const a of this.artifacts) {
        const item = listEl.createDiv({ cls: 'nlm-artifact-item' });
        const typeOpt = ARTIFACT_TYPES.find((t) => t.type === a.type);
        item.createEl('span', { text: typeOpt?.icon || '📎', cls: 'nlm-artifact-item-icon' });

        const info = item.createDiv({ cls: 'nlm-artifact-item-info' });
        info.createEl('span', { text: a.title || a.type, cls: 'nlm-artifact-item-title' });
        info.createEl('span', { text: a.status, cls: `nlm-artifact-status nlm-status-${a.status}` });

        const actions = item.createDiv({ cls: 'nlm-artifact-item-actions' });

        if (a.status === 'completed' || a.status === 'ready') {
          const dlBtn = actions.createEl('button', { cls: 'nlm-action-btn', attr: { 'aria-label': 'Download' } });
          setIcon(dlBtn, 'download');
          dlBtn.addEventListener('click', async () => {
            try {
              const path = await this.createArtifact.download(this.notebookId, a);
              new Notice(`Downloaded to ${path}`);
            } catch (e) {
              new Notice(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
            }
          });
        }

        const delBtn = actions.createEl('button', { cls: 'nlm-action-btn nlm-action-danger', attr: { 'aria-label': 'Delete' } });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async () => {
          if (!window.confirm(`Delete this ${a.type} artifact?`)) return;
          try {
            await this.createArtifact.delete(this.notebookId, a.id);
            new Notice('Deleted');
            await this.refreshArtifacts();
          } catch (e) {
            new Notice(`Failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        });
      }
    } catch (e) {
      listEl.empty();
      listEl.createDiv({ text: `Error: ${e instanceof Error ? e.message : String(e)}`, cls: 'nlm-error-state' });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Research Panel
  // ─────────────────────────────────────────────────────────

  private renderResearchPanel(): void {
    const section = this.container.createDiv({ cls: 'nlm-studio-section' });
    section.createEl('h5', { text: 'Research', cls: 'nlm-section-title' });

    const row = section.createDiv({ cls: 'nlm-research-input-row' });
    const input = row.createEl('input', {
      cls: 'nlm-source-input',
      attr: { type: 'text', placeholder: 'Search query for source discovery...' },
    });

    const modeSelect = row.createEl('select', { cls: 'nlm-option-select' });
    modeSelect.createEl('option', { text: 'Fast', attr: { value: 'fast' } });
    modeSelect.createEl('option', { text: 'Deep', attr: { value: 'deep' } });

    const sourceSelect = row.createEl('select', { cls: 'nlm-option-select' });
    sourceSelect.createEl('option', { text: 'Web', attr: { value: 'web' } });
    sourceSelect.createEl('option', { text: 'Drive', attr: { value: 'drive' } });

    const searchBtn = row.createEl('button', { text: 'Search', cls: 'nlm-source-add-btn' });

    const resultsEl = section.createDiv({ cls: 'nlm-research-results', attr: { 'data-role': 'research-results' } });

    searchBtn.addEventListener('click', async () => {
      const query = (input as HTMLInputElement).value.trim();
      if (!query) { new Notice('Enter a search query'); return; }
      if (!this.notebookId) { new Notice('Select a notebook first'); return; }

      searchBtn.setAttr('disabled', 'true');
      searchBtn.setText('Searching...');
      resultsEl.empty();
      resultsEl.createDiv({ text: 'Researching...', cls: 'nlm-loading' });

      try {
        await this.runResearch.start(
          this.notebookId,
          query,
          (sourceSelect as HTMLSelectElement).value as any,
          (modeSelect as HTMLSelectElement).value as any,
        );

        const task = await this.runResearch.waitForCompletion(
          this.notebookId,
          (t) => {
            resultsEl.empty();
            resultsEl.createDiv({ text: `Found ${t.sourcesFound} sources...`, cls: 'nlm-loading' });
          },
        );

        this.renderResearchResults(resultsEl, task);
      } catch (e) {
        resultsEl.empty();
        resultsEl.createDiv({ text: `Error: ${e instanceof Error ? e.message : String(e)}`, cls: 'nlm-error-state' });
      } finally {
        searchBtn.removeAttribute('disabled');
        searchBtn.setText('Search');
      }
    });
  }

  private renderResearchResults(container: HTMLElement, task: ResearchTask): void {
    container.empty();

    if (task.report) {
      const reportEl = container.createDiv({ cls: 'nlm-research-report' });
      reportEl.createEl('strong', { text: 'Report' });
      reportEl.createEl('p', { text: task.report.slice(0, 500) + (task.report.length > 500 ? '...' : '') });
    }

    if (task.sources.length === 0) {
      container.createDiv({ text: 'No sources found.', cls: 'nlm-empty-state' });
      return;
    }

    container.createEl('p', { text: `${task.sources.length} sources found. Select to import:`, cls: 'nlm-text-muted' });

    const checkboxes: { index: number; el: HTMLInputElement }[] = [];

    for (const src of task.sources) {
      const row = container.createDiv({ cls: 'nlm-research-source-row' });
      const cb = row.createEl('input', { attr: { type: 'checkbox' } }) as HTMLInputElement;
      cb.checked = true;
      checkboxes.push({ index: src.index, el: cb });

      const info = row.createDiv({ cls: 'nlm-research-source-info' });
      info.createEl('span', { text: src.title, cls: 'nlm-source-title' });
      if (src.snippet) {
        info.createEl('span', { text: src.snippet.slice(0, 100), cls: 'nlm-text-muted' });
      }
    }

    const importBtn = container.createEl('button', { text: 'Import Selected', cls: 'nlm-source-add-btn' });
    importBtn.addEventListener('click', async () => {
      const selected = checkboxes.filter((c) => c.el.checked).map((c) => c.index);
      if (selected.length === 0) { new Notice('Select at least one source'); return; }

      importBtn.setAttr('disabled', 'true');
      importBtn.setText('Importing...');

      try {
        await this.runResearch.importSources(this.notebookId, task.taskId, selected);
        new Notice(`Imported ${selected.length} sources`);
        container.empty();
        container.createDiv({ text: `Successfully imported ${selected.length} sources.`, cls: 'nlm-empty-state' });
      } catch (e) {
        new Notice(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        importBtn.removeAttribute('disabled');
        importBtn.setText('Import Selected');
      }
    });
  }
}
