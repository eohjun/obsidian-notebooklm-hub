import type { INotebookLMClient, BatchParams } from '../../domain/interfaces';

/**
 * Use case: Batch operations across multiple notebooks.
 * Query, add sources, create, delete, or generate artifacts in bulk.
 */
export class BatchOperations {
  constructor(private client: INotebookLMClient) {}

  async queryMultiple(query: string, notebookNames: string[]): Promise<unknown> {
    return this.client.batch({ action: 'query', query, notebookNames });
  }

  async queryByTags(query: string, tags: string[]): Promise<unknown> {
    return this.client.batch({ action: 'query', query, tags });
  }

  async queryAll(query: string): Promise<unknown> {
    return this.client.batch({ action: 'query', query, all: true });
  }

  async addSourceToMultiple(sourceUrl: string, notebookNames: string[]): Promise<unknown> {
    return this.client.batch({ action: 'add_source', sourceUrl, notebookNames });
  }

  async createMultiple(titles: string[]): Promise<unknown> {
    return this.client.batch({ action: 'create', titles });
  }

  async deleteMultiple(notebookNames: string[]): Promise<unknown> {
    return this.client.batch({ action: 'delete', notebookNames });
  }

  async generateForMultiple(artifactType: string, notebookNames: string[]): Promise<unknown> {
    return this.client.batch({
      action: 'studio',
      artifactType: artifactType as any,
      notebookNames,
    });
  }

  async run(params: BatchParams): Promise<unknown> {
    return this.client.batch(params);
  }
}
