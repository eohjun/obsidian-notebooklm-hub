import { normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import type { INotebookLMClient, CreateArtifactParams } from '../../domain/interfaces';
import type { StudioArtifact } from '../../domain/entities';
import type { ArtifactType } from '../../domain/value-objects';

/**
 * Use case: Create, monitor, and download NotebookLM Studio artifacts.
 */
export class CreateArtifact {
  constructor(
    private client: INotebookLMClient,
    private app: App,
    private downloadFolder: string,
  ) {}

  updateDownloadFolder(folder: string): void {
    this.downloadFolder = folder;
  }

  async create(notebookId: string, params: CreateArtifactParams): Promise<StudioArtifact> {
    return this.client.createArtifact(notebookId, params);
  }

  async getStatus(notebookId: string): Promise<StudioArtifact[]> {
    return this.client.getStudioStatus(notebookId);
  }

  async delete(notebookId: string, artifactId: string): Promise<void> {
    return this.client.deleteArtifact(notebookId, artifactId);
  }

  async reviseSlides(notebookId: string, artifactId: string, instructions: string[]): Promise<StudioArtifact> {
    return this.client.reviseSlides(notebookId, artifactId, instructions);
  }

  /**
   * Download an artifact and save to the vault download folder.
   * Returns the vault-relative path of the saved file.
   */
  async download(notebookId: string, artifact: StudioArtifact): Promise<string> {
    const data = await this.client.downloadArtifact(notebookId, artifact.id, artifact.type as ArtifactType);
    const ext = getExtension(artifact.type as ArtifactType);
    const safeName = (artifact.title || artifact.type).replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
    const timestamp = Date.now();
    const filename = `${safeName}-${timestamp}.${ext}`;
    const path = normalizePath(`${this.downloadFolder}/${filename}`);

    await this.ensureFolder(this.downloadFolder);
    await this.app.vault.createBinary(path, data);

    return path;
  }

  /**
   * Poll artifact status until completion or timeout.
   */
  async waitForCompletion(
    notebookId: string,
    artifactId: string,
    onProgress?: (status: string) => void,
    timeoutMs = 300_000,
  ): Promise<StudioArtifact | null> {
    const start = Date.now();
    const pollInterval = 5_000;

    while (Date.now() - start < timeoutMs) {
      const artifacts = await this.getStatus(notebookId);
      const target = artifacts.find((a) => a.id === artifactId);

      if (!target) return null;

      onProgress?.(target.status);

      if (target.status === 'completed' || target.status === 'ready') {
        return target;
      }
      if (target.status === 'failed' || target.status === 'error') {
        throw new Error(`Artifact generation failed: ${target.status}`);
      }

      await sleep(pollInterval);
    }

    throw new Error('Artifact generation timed out');
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath);
    if (!this.app.vault.getAbstractFileByPath(normalized)) {
      try { await this.app.vault.createFolder(normalized); } catch { /* exists */ }
    }
  }
}

function getExtension(type: ArtifactType): string {
  const map: Record<string, string> = {
    audio: 'mp3',
    video: 'mp4',
    report: 'md',
    flashcards: 'md',
    quiz: 'md',
    infographic: 'png',
    slides: 'pdf',
    data_table: 'csv',
    mind_map: 'json',
  };
  return map[type] || 'bin';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
