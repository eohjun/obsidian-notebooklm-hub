import { normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import type { QueryResponse, ChatMessage } from '../../domain/entities';

/**
 * Use case: Save NotebookLM query responses as Obsidian notes.
 * Creates a Literature Note-style markdown file with frontmatter.
 */
export class SaveAsNote {
  constructor(
    private app: App,
    private saveFolder: string,
  ) {}

  updateSaveFolder(folder: string): void {
    this.saveFolder = folder;
  }

  /**
   * Save a single query response as a note.
   */
  async saveResponse(params: {
    query: string;
    response: QueryResponse;
    notebookTitle: string;
  }): Promise<string> {
    const { query, response, notebookTitle } = params;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeTitle = this.sanitizeFilename(query.slice(0, 60));
    const filename = `NLM-${timestamp}-${safeTitle}.md`;
    const path = normalizePath(`${this.saveFolder}/${filename}`);

    const content = this.formatSingleResponse(query, response, notebookTitle);

    await this.ensureFolder(this.saveFolder);
    await this.app.vault.create(path, content);

    return path;
  }

  /**
   * Save an entire chat session as a note.
   */
  async saveSession(params: {
    messages: ChatMessage[];
    notebookTitle: string;
  }): Promise<string> {
    const { messages, notebookTitle } = params;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `NLM-Session-${timestamp}-${this.sanitizeFilename(notebookTitle)}.md`;
    const path = normalizePath(`${this.saveFolder}/${filename}`);

    const content = this.formatSession(messages, notebookTitle);

    await this.ensureFolder(this.saveFolder);
    await this.app.vault.create(path, content);

    return path;
  }

  private formatSingleResponse(
    query: string,
    response: QueryResponse,
    notebookTitle: string,
  ): string {
    const now = new Date().toISOString();
    const lines: string[] = [
      '---',
      `source: "NotebookLM: ${notebookTitle}"`,
      `created: ${now}`,
      'type: literature-note',
      'tags:',
      '  - notebooklm',
      '  - query-response',
      '---',
      '',
      `# ${query}`,
      '',
      response.response,
    ];

    if (response.citations.length > 0) {
      lines.push('', '## Citations', '');
      for (const cite of response.citations) {
        const title = cite.sourceTitle || 'Unknown source';
        const text = cite.text ? `: ${cite.text}` : '';
        lines.push(`- **${title}**${text}`);
      }
    }

    lines.push('', `---`, `*Query from NotebookLM notebook "${notebookTitle}" on ${now}*`);

    return lines.join('\n');
  }

  private formatSession(messages: ChatMessage[], notebookTitle: string): string {
    const now = new Date().toISOString();
    const lines: string[] = [
      '---',
      `source: "NotebookLM: ${notebookTitle}"`,
      `created: ${now}`,
      'type: literature-note',
      'tags:',
      '  - notebooklm',
      '  - chat-session',
      '---',
      '',
      `# Chat Session: ${notebookTitle}`,
      '',
    ];

    for (const msg of messages) {
      if (msg.role === 'user') {
        lines.push(`## Q: ${msg.content}`, '');
      } else {
        lines.push(msg.content, '');
        if (msg.citations?.length) {
          lines.push('**Citations:**');
          for (const cite of msg.citations) {
            lines.push(`- ${cite.sourceTitle || 'Source'}${cite.text ? ': ' + cite.text : ''}`);
          }
          lines.push('');
        }
        lines.push('---', '');
      }
    }

    lines.push(`*Exported from NotebookLM on ${now}*`);
    return lines.join('\n');
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const normalizedPath = normalizePath(folderPath);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (!existing) {
      try {
        await this.app.vault.createFolder(normalizedPath);
      } catch {
        // "already exists" — treat as success
      }
    }
  }
}
