import type { INotebookLMClient, AddSourceParams } from '../../domain/interfaces';
import type { Source, SourceContent } from '../../domain/entities';

/**
 * Use case: Manage NotebookLM sources (add, delete, describe, content).
 * Supports all source types: text, URL, YouTube, file, Google Drive.
 */
export class ManageSources {
  constructor(private client: INotebookLMClient) {}

  async addText(notebookId: string, text: string, title?: string): Promise<Source> {
    return this.client.addSource(notebookId, {
      sourceType: 'text',
      text,
      title,
      wait: true,
    });
  }

  async addUrl(notebookId: string, url: string): Promise<Source> {
    return this.client.addSource(notebookId, {
      sourceType: 'url',
      url,
      wait: true,
    });
  }

  async addFile(notebookId: string, filePath: string): Promise<Source> {
    return this.client.addSource(notebookId, {
      sourceType: 'file',
      filePath,
      wait: true,
    });
  }

  async addDrive(notebookId: string, documentId: string): Promise<Source> {
    return this.client.addSource(notebookId, {
      sourceType: 'drive',
      documentId,
      wait: true,
    });
  }

  async add(notebookId: string, params: AddSourceParams): Promise<Source> {
    return this.client.addSource(notebookId, params);
  }

  async delete(sourceIds: string[]): Promise<void> {
    return this.client.deleteSource(sourceIds);
  }

  async describe(sourceId: string): Promise<string> {
    return this.client.describeSource(sourceId);
  }

  async getContent(sourceId: string): Promise<SourceContent> {
    return this.client.getSourceContent(sourceId);
  }

  async rename(sourceId: string, newTitle: string): Promise<void> {
    return this.client.renameSource(sourceId, newTitle);
  }

  async listDrive(notebookId: string): Promise<Source[]> {
    return this.client.listDriveSources(notebookId);
  }

  async syncDrive(sourceIds: string[]): Promise<void> {
    return this.client.syncDriveSources(sourceIds);
  }
}
