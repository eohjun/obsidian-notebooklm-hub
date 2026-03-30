import type { INotebookLMClient } from '../../domain/interfaces';
import type { Notebook, NotebookDetail } from '../../domain/entities';

/**
 * Use case: Manage NotebookLM notebooks (CRUD + describe).
 */
export class ManageNotebooks {
  constructor(private client: INotebookLMClient) {}

  async list(): Promise<Notebook[]> {
    return this.client.listNotebooks();
  }

  async create(title: string): Promise<Notebook> {
    return this.client.createNotebook(title);
  }

  async get(notebookId: string): Promise<NotebookDetail> {
    return this.client.getNotebook(notebookId);
  }

  async describe(notebookId: string): Promise<string> {
    return this.client.describeNotebook(notebookId);
  }

  async rename(notebookId: string, newTitle: string): Promise<void> {
    return this.client.renameNotebook(notebookId, newTitle);
  }

  async delete(notebookId: string): Promise<void> {
    return this.client.deleteNotebook(notebookId);
  }
}
