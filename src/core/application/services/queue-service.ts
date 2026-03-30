import type { NoteData, QueuedNote } from '../../domain/entities';
import type { QueueStatus } from '../../domain/value-objects';

export type QueueEventType = 'added' | 'updated' | 'removed' | 'cleared' | 'processing-start' | 'processing-end';

export interface QueueEvent {
  type: QueueEventType;
  item?: QueuedNote;
}

type QueueListener = (event: QueueEvent) => void;

/**
 * Manages the note sync queue.
 * Extracted from the monolithic plugin class for clean separation.
 */
export class QueueService {
  private queue: Map<string, QueuedNote> = new Map();
  private listeners: QueueListener[] = [];
  private _isProcessing = false;
  private _shouldStop = false;

  get isProcessing(): boolean {
    return this._isProcessing;
  }

  get shouldStop(): boolean {
    return this._shouldStop;
  }

  get size(): number {
    return this.queue.size;
  }

  get pendingCount(): number {
    return this.getByStatus('pending').length;
  }

  getAll(): QueuedNote[] {
    return Array.from(this.queue.values());
  }

  getByStatus(status: QueueStatus): QueuedNote[] {
    return this.getAll().filter((n) => n.status === status);
  }

  add(noteData: NoteData): QueuedNote {
    const id = noteData.path || `text-${Date.now()}`;
    const item: QueuedNote = { id, note: noteData, status: 'pending' };
    this.queue.set(id, item);
    this.emit({ type: 'added', item });
    return item;
  }

  addBatch(notes: NoteData[]): QueuedNote[] {
    return notes.map((n) => this.add(n));
  }

  remove(id: string): void {
    const item = this.queue.get(id);
    if (item) {
      this.queue.delete(id);
      this.emit({ type: 'removed', item });
    }
  }

  updateStatus(id: string, status: QueueStatus, error?: string): void {
    const item = this.queue.get(id);
    if (item) {
      item.status = status;
      item.error = error;
      this.emit({ type: 'updated', item });
    }
  }

  clear(): void {
    this.queue.clear();
    this.emit({ type: 'cleared' });
  }

  clearCompleted(): void {
    for (const [id, item] of this.queue) {
      if (item.status === 'sent') {
        this.queue.delete(id);
      }
    }
    this.emit({ type: 'cleared' });
  }

  requestStop(): void {
    this._shouldStop = true;
  }

  /**
   * Process all pending items using the provided sender function.
   * Returns counts of sent/failed items.
   */
  async processAll(
    sender: (noteData: NoteData) => Promise<void>,
    onProgress?: (sent: number, failed: number, total: number) => void,
  ): Promise<{ sent: number; failed: number }> {
    const pending = this.getByStatus('pending');
    if (pending.length === 0) return { sent: 0, failed: 0 };

    this._isProcessing = true;
    this._shouldStop = false;
    this.emit({ type: 'processing-start' });

    let sent = 0;
    let failed = 0;

    for (const item of pending) {
      if (this._shouldStop) break;

      this.updateStatus(item.id, 'sending');

      try {
        await sender(item.note);
        this.updateStatus(item.id, 'sent');
        sent++;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        this.updateStatus(item.id, 'failed', error);
        failed++;
      }

      onProgress?.(sent, failed, pending.length);
    }

    this._isProcessing = false;
    this._shouldStop = false;
    this.emit({ type: 'processing-end' });

    return { sent, failed };
  }

  // ── Event System ──────────────────────────────────────────

  on(listener: QueueListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: QueueEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
