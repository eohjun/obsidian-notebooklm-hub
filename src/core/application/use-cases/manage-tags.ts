import type { INotebookLMClient } from '../../domain/interfaces';

/**
 * Use case: Manage notebook tags for organization and smart selection.
 */
export class ManageTags {
  constructor(private client: INotebookLMClient) {}

  async add(notebookId: string, tags: string[]): Promise<void> {
    return this.client.addTags(notebookId, tags);
  }

  async remove(notebookId: string, tags: string[]): Promise<void> {
    return this.client.removeTags(notebookId, tags);
  }

  async list(): Promise<Record<string, string[]>> {
    return this.client.listTags();
  }
}
