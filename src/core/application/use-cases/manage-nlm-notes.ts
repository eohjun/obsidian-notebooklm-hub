import type { INotebookLMClient } from '../../domain/interfaces';
import type { NlmNote } from '../../domain/entities';

/**
 * Use case: Manage NotebookLM internal notes (not Obsidian notes).
 */
export class ManageNlmNotes {
  constructor(private client: INotebookLMClient) {}

  async create(notebookId: string, content: string, title?: string): Promise<NlmNote> {
    return this.client.createNote(notebookId, content, title);
  }

  async list(notebookId: string): Promise<NlmNote[]> {
    return this.client.listNotes(notebookId);
  }

  async update(notebookId: string, noteId: string, content: string): Promise<void> {
    return this.client.updateNote(notebookId, noteId, content);
  }

  async delete(notebookId: string, noteId: string): Promise<void> {
    return this.client.deleteNote(notebookId, noteId);
  }
}
