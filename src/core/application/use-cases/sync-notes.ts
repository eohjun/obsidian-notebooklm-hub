import type { INotebookLMClient } from '../../domain/interfaces';
import type { NoteData } from '../../domain/entities';
import type { QueueService } from '../services/queue-service';

/**
 * Use case: Sync Obsidian notes to NotebookLM as text sources.
 * Bridges the QueueService with the NotebookLM client.
 */
export class SyncNotes {
  constructor(
    private client: INotebookLMClient,
    private queueService: QueueService,
  ) {}

  /**
   * Process all queued notes, sending each as a text source to the given notebook.
   */
  async processQueue(
    notebookId: string,
    onProgress?: (sent: number, failed: number, total: number) => void,
  ): Promise<{ sent: number; failed: number }> {
    const sender = async (noteData: NoteData): Promise<void> => {
      let content = noteData.content;

      // Prepend title as header
      if (noteData.title) {
        content = `# ${noteData.title}\n\n${content}`;
      }

      // Append metadata if present
      if (noteData.metadata) {
        const parts: string[] = [];
        if (noteData.metadata.tags?.length) {
          parts.push(`Tags: ${noteData.metadata.tags.join(', ')}`);
        }
        if (noteData.metadata.created) {
          parts.push(`Created: ${new Date(noteData.metadata.created).toISOString()}`);
        }
        if (noteData.metadata.modified) {
          parts.push(`Modified: ${new Date(noteData.metadata.modified).toISOString()}`);
        }
        if (parts.length > 0) {
          content += `\n\n---\n${parts.join('\n')}`;
        }
      }

      await this.client.addSource(notebookId, {
        sourceType: 'text',
        text: content,
        title: noteData.title,
        wait: false,
      });
    };

    return this.queueService.processAll(sender, onProgress);
  }
}
