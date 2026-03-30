import { requestUrl, RequestUrlParam } from 'obsidian';
import type {
  INotebookLMClient,
  AddSourceParams,
  CrossQueryParams,
  ChatConfigParams,
  CreateArtifactParams,
  BatchParams,
} from '../../domain/interfaces';
import type {
  Notebook,
  NotebookDetail,
  Source,
  SourceContent,
  QueryResponse,
  StudioArtifact,
  ResearchTask,
  NlmNote,
  ShareStatus,
  ServerStatus,
} from '../../domain/entities';
import type {
  ArtifactType,
  ResearchMode,
  ResearchSource,
  ShareRole,
} from '../../domain/value-objects';
import {
  DEFAULT_MCP_HOST,
  DEFAULT_MCP_PORT,
  TOOL_CALL_TIMEOUT_MS,
  HEALTH_CHECK_TIMEOUT_MS,
} from '../../../constants';

/**
 * MCP JSON-RPC request ID counter.
 */
let requestId = 0;

/**
 * Communicates with the notebooklm-mcp HTTP server using the MCP protocol
 * (Streamable HTTP transport with JSON-RPC 2.0 messages).
 */
export class NotebookLMHttpAdapter implements INotebookLMClient {
  private baseUrl: string;
  private sessionId?: string;
  private initialized = false;

  constructor(
    private host: string = DEFAULT_MCP_HOST,
    private port: number = DEFAULT_MCP_PORT,
  ) {
    this.baseUrl = `http://${host}:${port}`;
  }

  updateConnection(host: string, port: number): void {
    this.host = host;
    this.port = port;
    this.baseUrl = `http://${host}:${port}`;
    this.initialized = false;
    this.sessionId = undefined;
  }

  // ─────────────────────────────────────────────────────────
  // MCP Protocol Layer
  // ─────────────────────────────────────────────────────────

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const initResult = await this.sendJsonRpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'obsidian-notebooklm-hub', version: '1.0.0' },
    });

    this.sessionId = initResult._sessionId;
    this.initialized = true;

    // Send initialized notification
    await this.sendNotification('notifications/initialized', {});
  }

  private async sendJsonRpc(method: string, params: Record<string, unknown>): Promise<any> {
    const id = ++requestId;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id,
    });

    const reqParams: RequestUrlParam = {
      url: `${this.baseUrl}/mcp`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      },
      body,
      throw: false,
    };

    const response = await requestUrl(reqParams);

    if (response.status >= 400) {
      throw new McpError(
        `MCP server error (${response.status}): ${response.text}`,
        response.status,
      );
    }

    // Parse response — may be JSON or SSE
    const contentType = response.headers['content-type'] || '';

    if (contentType.includes('text/event-stream')) {
      return this.parseSSEResponse(response.text);
    }

    const json = response.json;

    // Capture session ID from response
    if (response.headers['mcp-session-id']) {
      this.sessionId = response.headers['mcp-session-id'];
    }

    if (json.error) {
      throw new McpError(
        json.error.message || 'Unknown MCP error',
        json.error.code,
      );
    }

    return json.result;
  }

  private async sendNotification(method: string, params: Record<string, unknown>): Promise<void> {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    });

    await requestUrl({
      url: `${this.baseUrl}/mcp`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      },
      body,
      throw: false,
    });
  }

  private parseSSEResponse(text: string): any {
    const lines = text.split('\n');
    let lastData = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        lastData = line.slice(6);
      }
    }

    if (!lastData) {
      throw new McpError('Empty SSE response', -1);
    }

    const json = JSON.parse(lastData);
    if (json.error) {
      throw new McpError(json.error.message, json.error.code);
    }
    return json.result;
  }

  /**
   * Call an MCP tool and return the text content from the result.
   */
  private async callTool(name: string, args: Record<string, unknown> = {}): Promise<string> {
    await this.ensureInitialized();

    const result = await this.sendJsonRpc('tools/call', {
      name,
      arguments: args,
    });

    // MCP tool results have content array with type/text entries
    if (result?.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text);
      return textParts.join('\n');
    }

    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  /**
   * Call tool and parse JSON from the text response.
   */
  private async callToolJson<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const text = await this.callTool(name, args);
    try {
      return JSON.parse(text);
    } catch {
      // Some tools return formatted text, not JSON. Return as-is wrapped.
      return text as unknown as T;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Health Check
  // ─────────────────────────────────────────────────────────

  async isHealthy(): Promise<boolean> {
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/health`,
        method: 'GET',
        throw: false,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────
  // INotebookLMClient Implementation
  // ─────────────────────────────────────────────────────────

  async getServerStatus(): Promise<ServerStatus> {
    try {
      const healthy = await this.isHealthy();
      if (!healthy) {
        return { connectionStatus: 'disconnected' };
      }

      const info = await this.callTool('server_info');
      return {
        connectionStatus: 'connected',
        version: extractField(info, 'version'),
        authenticated: true,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('authentication') || msg.includes('login')) {
        return { connectionStatus: 'connected', authenticated: false, error: msg };
      }
      return { connectionStatus: 'error', error: msg };
    }
  }

  // ── Notebooks ─────────────────────────────────────────────

  async listNotebooks(): Promise<Notebook[]> {
    const text = await this.callTool('notebook_list');
    return parseNotebookList(text);
  }

  async createNotebook(title: string): Promise<Notebook> {
    const text = await this.callTool('notebook_create', { title });
    return parseNotebook(text);
  }

  async getNotebook(notebookId: string): Promise<NotebookDetail> {
    const text = await this.callTool('notebook_get', { notebook_id: notebookId });
    return parseNotebookDetail(text);
  }

  async describeNotebook(notebookId: string): Promise<string> {
    return this.callTool('notebook_describe', { notebook_id: notebookId });
  }

  async renameNotebook(notebookId: string, newTitle: string): Promise<void> {
    await this.callTool('notebook_rename', { notebook_id: notebookId, new_title: newTitle });
  }

  async deleteNotebook(notebookId: string): Promise<void> {
    await this.callTool('notebook_delete', { notebook_id: notebookId, confirm: true });
  }

  // ── Sources ───────────────────────────────────────────────

  async addSource(notebookId: string, params: AddSourceParams): Promise<Source> {
    const args: Record<string, unknown> = {
      notebook_id: notebookId,
      source_type: params.sourceType,
    };
    if (params.url) args.url = params.url;
    if (params.text) args.text = params.text;
    if (params.documentId) args.document_id = params.documentId;
    if (params.filePath) args.file_path = params.filePath;
    if (params.title) args.title = params.title;
    if (params.wait !== undefined) args.wait = params.wait;

    const text = await this.callTool('source_add', args);
    return parseSource(text);
  }

  async deleteSource(sourceIds: string[]): Promise<void> {
    await this.callTool('source_delete', { source_ids: sourceIds, confirm: true });
  }

  async describeSource(sourceId: string): Promise<string> {
    return this.callTool('source_describe', { source_id: sourceId });
  }

  async getSourceContent(sourceId: string): Promise<SourceContent> {
    const text = await this.callTool('source_get_content', { source_id: sourceId });
    return parseSourceContent(text);
  }

  async renameSource(sourceId: string, newTitle: string): Promise<void> {
    await this.callTool('source_rename', { source_id: sourceId, new_title: newTitle });
  }

  async listDriveSources(notebookId: string): Promise<Source[]> {
    const text = await this.callTool('source_list_drive', { notebook_id: notebookId });
    return parseSourceList(text);
  }

  async syncDriveSources(sourceIds: string[]): Promise<void> {
    await this.callTool('source_sync_drive', { source_ids: sourceIds, confirm: true });
  }

  // ── Query & Chat ──────────────────────────────────────────

  async queryNotebook(notebookId: string, query: string): Promise<QueryResponse> {
    const text = await this.callTool('notebook_query', {
      notebook_id: notebookId,
      query,
    });
    return parseQueryResponse(text);
  }

  async crossNotebookQuery(params: CrossQueryParams): Promise<QueryResponse> {
    const args: Record<string, unknown> = { query: params.query };
    if (params.notebookNames) args.notebook_names = params.notebookNames.join(',');
    if (params.tags) args.tags = params.tags.join(',');
    if (params.all) args.all = true;

    const text = await this.callTool('cross_notebook_query', args);
    return parseQueryResponse(text);
  }

  async configureChat(notebookId: string, params: ChatConfigParams): Promise<void> {
    const args: Record<string, unknown> = { notebook_id: notebookId };
    if (params.goal) args.goal = params.goal;
    if (params.customPrompt) args.custom_prompt = params.customPrompt;
    if (params.responseLength) args.response_length = params.responseLength;

    await this.callTool('chat_configure', args);
  }

  // ── Studio ────────────────────────────────────────────────

  async createArtifact(notebookId: string, params: CreateArtifactParams): Promise<StudioArtifact> {
    const args: Record<string, unknown> = {
      notebook_id: notebookId,
      artifact_type: params.artifactType,
      confirm: true,
    };
    if (params.format) args.format = params.format;
    if (params.length) args.length = params.length;
    if (params.style) args.style = params.style;
    if (params.instructions) args.instructions = params.instructions;
    if (params.focus) args.focus = params.focus;
    if (params.count) args.count = params.count;

    const text = await this.callTool('studio_create', args);
    return parseArtifact(text);
  }

  async getStudioStatus(notebookId: string): Promise<StudioArtifact[]> {
    const text = await this.callTool('studio_status', { notebook_id: notebookId });
    return parseArtifactList(text);
  }

  async deleteArtifact(notebookId: string, artifactId: string): Promise<void> {
    await this.callTool('studio_delete', {
      notebook_id: notebookId,
      artifact_id: artifactId,
      confirm: true,
    });
  }

  async downloadArtifact(
    notebookId: string,
    artifactId: string,
    artifactType: ArtifactType,
  ): Promise<ArrayBuffer> {
    const text = await this.callTool('download_artifact', {
      notebook_id: notebookId,
      artifact_id: artifactId,
      artifact_type: artifactType,
    });
    // download_artifact returns file path or base64 — handle in use case
    return new TextEncoder().encode(text).buffer;
  }

  async reviseSlides(
    notebookId: string,
    artifactId: string,
    instructions: string[],
  ): Promise<StudioArtifact> {
    const text = await this.callTool('studio_revise', {
      notebook_id: notebookId,
      artifact_id: artifactId,
      slide_instructions: instructions,
      confirm: true,
    });
    return parseArtifact(text);
  }

  // ── Research ──────────────────────────────────────────────

  async startResearch(
    notebookId: string,
    query: string,
    source: ResearchSource,
    mode: ResearchMode,
  ): Promise<ResearchTask> {
    const text = await this.callTool('research_start', {
      notebook_id: notebookId,
      query,
      source,
      mode,
    });
    return parseResearchTask(text);
  }

  async getResearchStatus(notebookId: string, maxWait?: number): Promise<ResearchTask> {
    const args: Record<string, unknown> = { notebook_id: notebookId };
    if (maxWait) args.max_wait = maxWait;

    const text = await this.callTool('research_status', args);
    return parseResearchTask(text);
  }

  async importResearch(
    notebookId: string,
    taskId: string,
    sourceIndices: number[],
  ): Promise<void> {
    await this.callTool('research_import', {
      notebook_id: notebookId,
      task_id: taskId,
      source_indices: sourceIndices,
    });
  }

  // ── Notes ─────────────────────────────────────────────────

  async createNote(notebookId: string, content: string, title?: string): Promise<NlmNote> {
    const args: Record<string, unknown> = {
      notebook_id: notebookId,
      action: 'create',
      content,
    };
    if (title) args.title = title;

    const text = await this.callTool('note', args);
    return parseNlmNote(text);
  }

  async listNotes(notebookId: string): Promise<NlmNote[]> {
    const text = await this.callTool('note', {
      notebook_id: notebookId,
      action: 'list',
    });
    return parseNlmNoteList(text);
  }

  async updateNote(notebookId: string, noteId: string, content: string): Promise<void> {
    await this.callTool('note', {
      notebook_id: notebookId,
      action: 'update',
      note_id: noteId,
      content,
    });
  }

  async deleteNote(notebookId: string, noteId: string): Promise<void> {
    await this.callTool('note', {
      notebook_id: notebookId,
      action: 'delete',
      note_id: noteId,
      confirm: true,
    });
  }

  // ── Sharing ───────────────────────────────────────────────

  async getShareStatus(notebookId: string): Promise<ShareStatus> {
    const text = await this.callTool('notebook_share_status', { notebook_id: notebookId });
    return parseShareStatus(text);
  }

  async inviteCollaborator(notebookId: string, email: string, role: ShareRole): Promise<void> {
    await this.callTool('notebook_share_invite', {
      notebook_id: notebookId,
      email,
      role,
    });
  }

  async setPublicAccess(notebookId: string, isPublic: boolean): Promise<void> {
    await this.callTool('notebook_share_public', {
      notebook_id: notebookId,
      is_public: isPublic,
    });
  }

  // ── Batch ─────────────────────────────────────────────────

  async batch(params: BatchParams): Promise<unknown> {
    const args: Record<string, unknown> = { action: params.action };
    if (params.query) args.query = params.query;
    if (params.notebookNames) args.notebook_names = params.notebookNames.join(',');
    if (params.tags) args.tags = params.tags.join(',');
    if (params.all) args.all = true;
    if (params.sourceUrl) args.source_url = params.sourceUrl;
    if (params.artifactType) args.artifact_type = params.artifactType;
    if (params.titles) args.titles = params.titles.join(',');
    if (params.action === 'delete' || params.action === 'studio') args.confirm = true;

    return this.callTool('batch', args);
  }

  // ── Tags ──────────────────────────────────────────────────

  async addTags(notebookId: string, tags: string[]): Promise<void> {
    await this.callTool('tag', {
      action: 'add',
      notebook_id: notebookId,
      tags: tags.join(','),
    });
  }

  async removeTags(notebookId: string, tags: string[]): Promise<void> {
    await this.callTool('tag', {
      action: 'remove',
      notebook_id: notebookId,
      tags: tags.join(','),
    });
  }

  async listTags(): Promise<Record<string, string[]>> {
    const text = await this.callTool('tag', { action: 'list' });
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  // ── Pipeline ──────────────────────────────────────────────

  async runPipeline(
    notebookId: string,
    pipelineName: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const args: Record<string, unknown> = {
      action: 'run',
      notebook_id: notebookId,
      pipeline_name: pipelineName,
      confirm: true,
    };
    if (params) Object.assign(args, params);

    return this.callTool('pipeline', args);
  }

  async listPipelines(): Promise<string[]> {
    const text = await this.callTool('pipeline', { action: 'list' });
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────

export class McpError extends Error {
  constructor(message: string, public code: number) {
    super(message);
    this.name = 'McpError';
  }
}

// ─────────────────────────────────────────────────────────────
// Response Parsers
// ─────────────────────────────────────────────────────────────
// MCP tool responses are text. Some return structured data that
// we can parse; others return human-readable summaries. These
// parsers are best-effort — they extract what they can.

function extractField(text: string, field: string): string | undefined {
  const match = text.match(new RegExp(`${field}[:\\s]+(.+?)(?:\\n|$)`, 'i'));
  return match?.[1]?.trim();
}

function parseNotebook(text: string): Notebook {
  try {
    const json = JSON.parse(text);
    return {
      id: json.id ?? json.notebook_id ?? '',
      title: json.title ?? '',
      sourcesCount: json.sources_count ?? json.sourcesCount ?? 0,
      createdAt: json.created_at,
      updatedAt: json.updated_at,
    };
  } catch {
    return {
      id: extractField(text, 'id') ?? '',
      title: extractField(text, 'title') ?? text.split('\n')[0] ?? '',
      sourcesCount: 0,
    };
  }
}

function parseNotebookList(text: string): Notebook[] {
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return json.map((n: any) => parseNotebook(JSON.stringify(n)));
    if (json.notebooks) return json.notebooks.map((n: any) => parseNotebook(JSON.stringify(n)));
  } catch {
    // Not JSON — try line-by-line parsing
  }
  return [];
}

function parseNotebookDetail(text: string): NotebookDetail {
  try {
    const json = JSON.parse(text);
    const sources = (json.sources ?? []).map((s: any) => ({
      id: s.id ?? '',
      title: s.title ?? '',
      type: s.type ?? 'text',
      url: s.url,
      isStale: s.is_stale,
    }));
    return {
      ...parseNotebook(text),
      sources,
      description: json.description,
    };
  } catch {
    return { ...parseNotebook(text), sources: [] };
  }
}

function parseSource(text: string): Source {
  try {
    const json = JSON.parse(text);
    return {
      id: json.id ?? json.source_id ?? '',
      title: json.title ?? '',
      type: json.type ?? json.source_type ?? 'text',
      url: json.url,
      isStale: json.is_stale,
    };
  } catch {
    return {
      id: extractField(text, 'id') ?? '',
      title: extractField(text, 'title') ?? '',
      type: 'text',
    };
  }
}

function parseSourceList(text: string): Source[] {
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return json.map((s: any) => parseSource(JSON.stringify(s)));
  } catch { /* fallthrough */ }
  return [];
}

function parseSourceContent(text: string): SourceContent {
  try {
    const json = JSON.parse(text);
    return {
      content: json.content ?? '',
      title: json.title ?? '',
      sourceType: json.source_type ?? '',
      charCount: json.char_count ?? json.content?.length ?? 0,
    };
  } catch {
    return { content: text, title: '', sourceType: '', charCount: text.length };
  }
}

function parseQueryResponse(text: string): QueryResponse {
  try {
    const json = JSON.parse(text);
    return {
      response: json.response ?? json.answer ?? text,
      conversationId: json.conversation_id,
      citations: json.citations ?? [],
    };
  } catch {
    return { response: text, citations: [] };
  }
}

function parseArtifact(text: string): StudioArtifact {
  try {
    const json = JSON.parse(text);
    return {
      id: json.id ?? json.artifact_id ?? '',
      type: json.type ?? json.artifact_type ?? '',
      status: json.status ?? 'unknown',
      url: json.url,
      title: json.title,
      createdAt: json.created_at,
    };
  } catch {
    return { id: '', type: 'audio', status: 'unknown' };
  }
}

function parseArtifactList(text: string): StudioArtifact[] {
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return json.map((a: any) => parseArtifact(JSON.stringify(a)));
    if (json.artifacts) return json.artifacts.map((a: any) => parseArtifact(JSON.stringify(a)));
  } catch { /* fallthrough */ }
  return [];
}

function parseResearchTask(text: string): ResearchTask {
  try {
    const json = JSON.parse(text);
    return {
      taskId: json.task_id ?? '',
      status: json.status ?? 'pending',
      sourcesFound: json.sources_found ?? 0,
      report: json.report,
      sources: json.sources ?? [],
    };
  } catch {
    return { taskId: '', status: 'pending', sourcesFound: 0, sources: [] };
  }
}

function parseNlmNote(text: string): NlmNote {
  try {
    const json = JSON.parse(text);
    return {
      id: json.id ?? json.note_id ?? '',
      title: json.title,
      content: json.content ?? '',
    };
  } catch {
    return { id: '', content: text };
  }
}

function parseNlmNoteList(text: string): NlmNote[] {
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return json.map((n: any) => parseNlmNote(JSON.stringify(n)));
  } catch { /* fallthrough */ }
  return [];
}

function parseShareStatus(text: string): ShareStatus {
  try {
    const json = JSON.parse(text);
    return {
      isPublic: json.is_public ?? false,
      accessLevel: json.access_level ?? 'restricted',
      collaborators: json.collaborators ?? [],
      publicLink: json.public_link,
    };
  } catch {
    return { isPublic: false, accessLevel: 'restricted', collaborators: [] };
  }
}
