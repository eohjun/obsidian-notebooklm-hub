import type { INotebookLMClient } from '../../domain/interfaces';
import type { ResearchTask } from '../../domain/entities';
import type { ResearchMode, ResearchSource } from '../../domain/value-objects';

/**
 * Use case: Run NotebookLM research (web/drive source discovery) and import results.
 */
export class RunResearch {
  constructor(private client: INotebookLMClient) {}

  async start(
    notebookId: string,
    query: string,
    source: ResearchSource = 'web',
    mode: ResearchMode = 'fast',
  ): Promise<ResearchTask> {
    return this.client.startResearch(notebookId, query, source, mode);
  }

  async getStatus(notebookId: string, maxWait?: number): Promise<ResearchTask> {
    return this.client.getResearchStatus(notebookId, maxWait);
  }

  async importSources(notebookId: string, taskId: string, sourceIndices: number[]): Promise<void> {
    return this.client.importResearch(notebookId, taskId, sourceIndices);
  }

  /**
   * Poll research status until completion or timeout.
   */
  async waitForCompletion(
    notebookId: string,
    onProgress?: (task: ResearchTask) => void,
    timeoutMs = 300_000,
  ): Promise<ResearchTask> {
    const start = Date.now();
    const pollInterval = 3_000;

    while (Date.now() - start < timeoutMs) {
      const task = await this.getStatus(notebookId);
      onProgress?.(task);

      if (task.status === 'completed') return task;
      if (task.status === 'failed') throw new Error('Research failed');

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    throw new Error('Research timed out');
  }
}
