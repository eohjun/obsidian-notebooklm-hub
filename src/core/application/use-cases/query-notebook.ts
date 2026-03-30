import type { INotebookLMClient, CrossQueryParams, ChatConfigParams } from '../../domain/interfaces';
import type { QueryResponse, ChatSession, ChatMessage } from '../../domain/entities';

/**
 * Use case: Query NotebookLM notebooks and manage chat sessions.
 * Maintains conversation history per notebook.
 */
export class QueryNotebook {
  /** Active chat sessions keyed by notebookId */
  private sessions: Map<string, ChatSession> = new Map();

  constructor(private client: INotebookLMClient) {}

  /**
   * Send a query to a single notebook and track the conversation.
   */
  async query(notebookId: string, notebookTitle: string, query: string): Promise<QueryResponse> {
    const session = this.getOrCreateSession(notebookId, notebookTitle);

    // Add user message
    session.messages.push({
      role: 'user',
      content: query,
      timestamp: Date.now(),
    });

    const response = await this.client.queryNotebook(notebookId, query);

    // Track conversation ID for follow-ups
    if (response.conversationId) {
      session.conversationId = response.conversationId;
    }

    // Add assistant message
    session.messages.push({
      role: 'assistant',
      content: response.response,
      citations: response.citations,
      timestamp: Date.now(),
    });

    return response;
  }

  /**
   * Query across multiple notebooks.
   */
  async crossQuery(params: CrossQueryParams): Promise<QueryResponse> {
    return this.client.crossNotebookQuery(params);
  }

  /**
   * Configure chat behavior for a notebook.
   */
  async configureChat(notebookId: string, params: ChatConfigParams): Promise<void> {
    return this.client.configureChat(notebookId, params);
  }

  /**
   * Get the current session for a notebook, or create a new one.
   */
  getSession(notebookId: string): ChatSession | undefined {
    return this.sessions.get(notebookId);
  }

  getOrCreateSession(notebookId: string, notebookTitle: string): ChatSession {
    let session = this.sessions.get(notebookId);
    if (!session) {
      session = {
        notebookId,
        notebookTitle,
        messages: [],
      };
      this.sessions.set(notebookId, session);
    }
    return session;
  }

  /**
   * Clear conversation history for a notebook.
   */
  clearSession(notebookId: string): void {
    this.sessions.delete(notebookId);
  }

  /**
   * Get all active session notebook IDs.
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
}
