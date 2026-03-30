import type { INotebookLMClient } from '../../domain/interfaces';
import type { ShareStatus } from '../../domain/entities';
import type { ShareRole } from '../../domain/value-objects';

/**
 * Use case: Manage notebook sharing — collaborators, public access.
 */
export class ManageSharing {
  constructor(private client: INotebookLMClient) {}

  async getStatus(notebookId: string): Promise<ShareStatus> {
    return this.client.getShareStatus(notebookId);
  }

  async invite(notebookId: string, email: string, role: ShareRole = 'viewer'): Promise<void> {
    return this.client.inviteCollaborator(notebookId, email, role);
  }

  async setPublic(notebookId: string, isPublic: boolean): Promise<void> {
    return this.client.setPublicAccess(notebookId, isPublic);
  }
}
