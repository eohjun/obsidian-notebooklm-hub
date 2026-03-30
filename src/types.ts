import { DEFAULT_MCP_HOST, DEFAULT_MCP_PORT } from './constants';

export interface NotebookLMHubSettings {
  // ── Legacy (migrated from v0.3.x) ────────────────────────
  zettelkastenFolder: string;
  includeMetadata: boolean;
  includeFrontmatter: boolean;
  autoOpenView: boolean;

  // ── Server connection ─────────────────────────────────────
  mcpHost: string;
  mcpPort: number;
  autoStartServer: boolean;
  nlmPath: string;
  mcpServerPath: string;

  // ── Note saving ───────────────────────────────────────────
  noteSaveFolder: string;

  // ── Downloads ─────────────────────────────────────────────
  downloadFolder: string;

  // ── Active tab ────────────────────────────────────────────
  activeTab: string;

  // ── Selected notebook (persisted) ─────────────────────────
  selectedNotebookId: string;
}

export const DEFAULT_SETTINGS: NotebookLMHubSettings = {
  // Legacy
  zettelkastenFolder: '04_Zettelkasten',
  includeMetadata: true,
  includeFrontmatter: false,
  autoOpenView: false,

  // Server
  mcpHost: DEFAULT_MCP_HOST,
  mcpPort: DEFAULT_MCP_PORT,
  autoStartServer: true,
  nlmPath: 'nlm',
  mcpServerPath: 'notebooklm-mcp',

  // Note saving
  noteSaveFolder: '00_Inbox',

  // Downloads
  downloadFolder: '09_Attachments/notebooklm',

  // UI state
  activeTab: 'chat',
  selectedNotebookId: '',
};

/**
 * Migrate v0.3.x settings to v1.0.0 format.
 */
export function migrateSettings(data: any): NotebookLMHubSettings {
  const settings = Object.assign({}, DEFAULT_SETTINGS);

  // Carry over legacy fields if present
  if (data.zettelkastenFolder) settings.zettelkastenFolder = data.zettelkastenFolder;
  if (data.includeMetadata !== undefined) settings.includeMetadata = data.includeMetadata;
  if (data.includeFrontmatter !== undefined) settings.includeFrontmatter = data.includeFrontmatter;
  if (data.autoOpenView !== undefined) settings.autoOpenView = data.autoOpenView;

  // New fields from data (if upgrading within v1.x)
  if (data.mcpHost) settings.mcpHost = data.mcpHost;
  if (data.mcpPort) settings.mcpPort = data.mcpPort;
  if (data.autoStartServer !== undefined) settings.autoStartServer = data.autoStartServer;
  if (data.nlmPath) settings.nlmPath = data.nlmPath;
  if (data.mcpServerPath) settings.mcpServerPath = data.mcpServerPath;
  if (data.noteSaveFolder) settings.noteSaveFolder = data.noteSaveFolder;
  if (data.downloadFolder) settings.downloadFolder = data.downloadFolder;
  if (data.activeTab) settings.activeTab = data.activeTab;
  if (data.selectedNotebookId) settings.selectedNotebookId = data.selectedNotebookId;

  return settings;
}
