import { Modal, App, Notice, Setting } from 'obsidian';
import type { ManagePipeline } from '../../core/application/use-cases/manage-pipeline';

/**
 * Modal for running NotebookLM pipelines on a notebook.
 */
export class PipelineModal extends Modal {
  private pipelines: string[] = [];
  private selectedPipeline = '';
  private inputUrl = '';

  constructor(
    app: App,
    private managePipeline: ManagePipeline,
    private notebookId: string,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Run Pipeline' });

    try {
      this.pipelines = await this.managePipeline.list();
    } catch {
      this.pipelines = ['ingest-and-podcast', 'research-and-report', 'multi-format'];
    }

    new Setting(contentEl)
      .setName('Pipeline')
      .setDesc('Select a pipeline to run')
      .addDropdown((dd) => {
        for (const p of this.pipelines) {
          dd.addOption(p, p.replace(/-/g, ' '));
        }
        this.selectedPipeline = this.pipelines[0] || '';
        dd.onChange((v) => { this.selectedPipeline = v; });
      });

    new Setting(contentEl)
      .setName('Input URL (optional)')
      .setDesc('URL for ingest-and-podcast pipeline')
      .addText((t) => t.setPlaceholder('https://...').onChange((v) => { this.inputUrl = v; }));

    const runBtn = contentEl.createEl('button', {
      text: 'Run Pipeline',
      cls: 'nlm-studio-create-btn',
    });
    runBtn.style.marginTop = '12px';
    runBtn.addEventListener('click', async () => {
      if (!this.selectedPipeline) { new Notice('Select a pipeline'); return; }

      runBtn.setAttr('disabled', 'true');
      runBtn.setText('Running...');

      try {
        const params: Record<string, unknown> = {};
        if (this.inputUrl) params.input_url = this.inputUrl;

        await this.managePipeline.run(this.notebookId, this.selectedPipeline, params);
        new Notice(`Pipeline "${this.selectedPipeline}" started`);
        this.close();
      } catch (e) {
        new Notice(`Pipeline failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        runBtn.removeAttribute('disabled');
        runBtn.setText('Run Pipeline');
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
