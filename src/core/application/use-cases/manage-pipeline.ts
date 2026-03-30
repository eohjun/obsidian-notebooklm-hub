import type { INotebookLMClient } from '../../domain/interfaces';

/**
 * Use case: Run multi-step NotebookLM pipelines.
 * Built-in: ingest-and-podcast, research-and-report, multi-format.
 */
export class ManagePipeline {
  constructor(private client: INotebookLMClient) {}

  async list(): Promise<string[]> {
    return this.client.listPipelines();
  }

  async run(notebookId: string, pipelineName: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.client.runPipeline(notebookId, pipelineName, params);
  }
}
