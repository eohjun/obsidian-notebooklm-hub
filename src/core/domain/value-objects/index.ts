/** Source types supported by NotebookLM */
export type SourceType = 'url' | 'text' | 'drive' | 'file';

/** Studio artifact types */
export type ArtifactType =
  | 'audio'
  | 'video'
  | 'report'
  | 'flashcards'
  | 'quiz'
  | 'infographic'
  | 'slides'
  | 'data_table'
  | 'mind_map';

/** Audio generation formats */
export type AudioFormat = 'deep_dive' | 'brief' | 'critique' | 'debate';

/** Audio length options */
export type AudioLength = 'short' | 'default' | 'long';

/** Video formats */
export type VideoFormat = 'explainer' | 'brief' | 'cinematic';

/** Video styles */
export type VideoStyle =
  | 'auto_select' | 'classic' | 'whiteboard' | 'kawaii'
  | 'anime' | 'watercolor' | 'retro_print' | 'heritage' | 'paper_craft';

/** Research modes */
export type ResearchMode = 'fast' | 'deep';

/** Research sources */
export type ResearchSource = 'web' | 'drive';

/** Chat response length */
export type ResponseLength = 'default' | 'longer' | 'shorter';

/** Chat goal */
export type ChatGoal = 'default' | 'custom' | 'learning_guide';

/** Queue item status */
export type QueueStatus = 'pending' | 'sending' | 'sent' | 'failed';

/** Connection status */
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

/** Sharing roles */
export type ShareRole = 'owner' | 'editor' | 'viewer';

/** Batch action types */
export type BatchAction = 'query' | 'add_source' | 'create' | 'delete' | 'studio';
