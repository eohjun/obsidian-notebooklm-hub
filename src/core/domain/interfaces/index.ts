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
} from '../entities';
import type {
  SourceType,
  ArtifactType,
  AudioFormat,
  AudioLength,
  VideoFormat,
  VideoStyle,
  ResearchMode,
  ResearchSource,
  ChatGoal,
  ResponseLength,
  ShareRole,
  BatchAction,
} from '../value-objects';

// ─────────────────────────────────────────────────────────────
// NotebookLM Client Interface (Port)
// ─────────────────────────────────────────────────────────────

export interface INotebookLMClient {
  // ── Server ────────────────────────────────────────────────
  getServerStatus(): Promise<ServerStatus>;

  // ── Notebooks ─────────────────────────────────────────────
  listNotebooks(): Promise<Notebook[]>;
  createNotebook(title: string): Promise<Notebook>;
  getNotebook(notebookId: string): Promise<NotebookDetail>;
  describeNotebook(notebookId: string): Promise<string>;
  renameNotebook(notebookId: string, newTitle: string): Promise<void>;
  deleteNotebook(notebookId: string): Promise<void>;

  // ── Sources ───────────────────────────────────────────────
  addSource(notebookId: string, params: AddSourceParams): Promise<Source>;
  deleteSource(sourceIds: string[]): Promise<void>;
  describeSource(sourceId: string): Promise<string>;
  getSourceContent(sourceId: string): Promise<SourceContent>;
  renameSource(sourceId: string, newTitle: string): Promise<void>;
  listDriveSources(notebookId: string): Promise<Source[]>;
  syncDriveSources(sourceIds: string[]): Promise<void>;

  // ── Query & Chat ──────────────────────────────────────────
  queryNotebook(notebookId: string, query: string): Promise<QueryResponse>;
  crossNotebookQuery(params: CrossQueryParams): Promise<QueryResponse>;
  configureChat(notebookId: string, params: ChatConfigParams): Promise<void>;

  // ── Studio ────────────────────────────────────────────────
  createArtifact(notebookId: string, params: CreateArtifactParams): Promise<StudioArtifact>;
  getStudioStatus(notebookId: string): Promise<StudioArtifact[]>;
  deleteArtifact(notebookId: string, artifactId: string): Promise<void>;
  downloadArtifact(notebookId: string, artifactId: string, artifactType: ArtifactType): Promise<ArrayBuffer>;
  reviseSlides(notebookId: string, artifactId: string, instructions: string[]): Promise<StudioArtifact>;

  // ── Research ──────────────────────────────────────────────
  startResearch(notebookId: string, query: string, source: ResearchSource, mode: ResearchMode): Promise<ResearchTask>;
  getResearchStatus(notebookId: string, maxWait?: number): Promise<ResearchTask>;
  importResearch(notebookId: string, taskId: string, sourceIndices: number[]): Promise<void>;

  // ── Notes (NLM internal) ──────────────────────────────────
  createNote(notebookId: string, content: string, title?: string): Promise<NlmNote>;
  listNotes(notebookId: string): Promise<NlmNote[]>;
  updateNote(notebookId: string, noteId: string, content: string): Promise<void>;
  deleteNote(notebookId: string, noteId: string): Promise<void>;

  // ── Sharing ───────────────────────────────────────────────
  getShareStatus(notebookId: string): Promise<ShareStatus>;
  inviteCollaborator(notebookId: string, email: string, role: ShareRole): Promise<void>;
  setPublicAccess(notebookId: string, isPublic: boolean): Promise<void>;

  // ── Batch ─────────────────────────────────────────────────
  batch(params: BatchParams): Promise<unknown>;

  // ── Tags ──────────────────────────────────────────────────
  addTags(notebookId: string, tags: string[]): Promise<void>;
  removeTags(notebookId: string, tags: string[]): Promise<void>;
  listTags(): Promise<Record<string, string[]>>;

  // ── Pipeline ──────────────────────────────────────────────
  runPipeline(notebookId: string, pipelineName: string, params?: Record<string, unknown>): Promise<unknown>;
  listPipelines(): Promise<string[]>;
}

// ─────────────────────────────────────────────────────────────
// Parameter Types
// ─────────────────────────────────────────────────────────────

export interface AddSourceParams {
  sourceType: SourceType;
  url?: string;
  text?: string;
  documentId?: string;
  filePath?: string;
  title?: string;
  wait?: boolean;
}

export interface CrossQueryParams {
  query: string;
  notebookNames?: string[];
  tags?: string[];
  all?: boolean;
}

export interface ChatConfigParams {
  goal?: ChatGoal;
  customPrompt?: string;
  responseLength?: ResponseLength;
}

export interface CreateArtifactParams {
  artifactType: ArtifactType;
  format?: AudioFormat | VideoFormat | string;
  length?: AudioLength;
  style?: VideoStyle | string;
  instructions?: string;
  focus?: string;
  count?: number;
}

export interface BatchParams {
  action: BatchAction;
  query?: string;
  notebookNames?: string[];
  tags?: string[];
  all?: boolean;
  sourceUrl?: string;
  artifactType?: ArtifactType;
  titles?: string[];
}

// ─────────────────────────────────────────────────────────────
// Server Process Interface
// ─────────────────────────────────────────────────────────────

export interface IServerProcess {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
  getHealthUrl(): string;
}
