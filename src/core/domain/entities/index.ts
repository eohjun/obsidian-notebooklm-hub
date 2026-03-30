import type {
  SourceType,
  ArtifactType,
  QueueStatus,
  ConnectionStatus,
  ShareRole,
} from '../value-objects';

// ─────────────────────────────────────────────────────────────
// Notebook
// ─────────────────────────────────────────────────────────────

export interface Notebook {
  id: string;
  title: string;
  sourcesCount: number;
  createdAt?: string;
  updatedAt?: string;
  isOwned?: boolean;
  isShared?: boolean;
}

export interface NotebookDetail extends Notebook {
  sources: Source[];
  description?: string;
}

// ─────────────────────────────────────────────────────────────
// Source
// ─────────────────────────────────────────────────────────────

export interface Source {
  id: string;
  title: string;
  type: SourceType;
  url?: string;
  isStale?: boolean;
}

export interface SourceContent {
  content: string;
  title: string;
  sourceType: string;
  charCount: number;
}

// ─────────────────────────────────────────────────────────────
// Query & Chat
// ─────────────────────────────────────────────────────────────

export interface QueryResponse {
  response: string;
  conversationId?: string;
  citations: Citation[];
}

export interface Citation {
  sourceId?: string;
  sourceTitle?: string;
  text?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: number;
}

export interface ChatSession {
  notebookId: string;
  notebookTitle: string;
  messages: ChatMessage[];
  conversationId?: string;
}

// ─────────────────────────────────────────────────────────────
// Studio Artifacts
// ─────────────────────────────────────────────────────────────

export interface StudioArtifact {
  id: string;
  type: ArtifactType;
  status: string;
  url?: string;
  title?: string;
  createdAt?: string;
}

// ─────────────────────────────────────────────────────────────
// Research
// ─────────────────────────────────────────────────────────────

export interface ResearchTask {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  sourcesFound: number;
  report?: string;
  sources: DiscoveredSource[];
}

export interface DiscoveredSource {
  index: number;
  title: string;
  url?: string;
  snippet?: string;
}

// ─────────────────────────────────────────────────────────────
// Notes (NotebookLM internal notes)
// ─────────────────────────────────────────────────────────────

export interface NlmNote {
  id: string;
  title?: string;
  content: string;
}

// ─────────────────────────────────────────────────────────────
// Sharing
// ─────────────────────────────────────────────────────────────

export interface Collaborator {
  email: string;
  role: ShareRole;
  isPending: boolean;
  displayName?: string;
}

export interface ShareStatus {
  isPublic: boolean;
  accessLevel: string;
  collaborators: Collaborator[];
  publicLink?: string;
}

// ─────────────────────────────────────────────────────────────
// Queue (Obsidian note sync)
// ─────────────────────────────────────────────────────────────

export interface NoteData {
  title: string;
  content: string;
  path: string;
  metadata?: {
    created?: number;
    modified?: number;
    tags?: string[];
  };
}

export interface QueuedNote {
  id: string;
  note: NoteData;
  status: QueueStatus;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Auth & Server Status
// ─────────────────────────────────────────────────────────────

export interface ServerStatus {
  connectionStatus: ConnectionStatus;
  version?: string;
  authenticated?: boolean;
  profile?: string;
  error?: string;
}
