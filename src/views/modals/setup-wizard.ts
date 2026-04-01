import { Modal, App, Notice, Setting } from 'obsidian';
import type { ServerProcessAdapter } from '../../core/adapters/notebooklm/server-process';
import type { NotebookLMHttpAdapter } from '../../core/adapters/notebooklm/http-adapter';

interface CheckResult {
  label: string;
  passed: boolean;
  message: string;
}

/**
 * First-run setup wizard.
 * Checks: nlm CLI installed, authenticated, server reachable.
 */
export class SetupWizard extends Modal {
  constructor(
    app: App,
    private server: ServerProcessAdapter,
    private client: NotebookLMHttpAdapter,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'NotebookLM Hub Setup' });
    contentEl.createEl('p', {
      text: 'Checking your environment...',
      cls: 'nlm-text-muted',
    });

    const checkList = contentEl.createDiv({ cls: 'nlm-setup-checklist' });
    const results: CheckResult[] = [];

    // Check 1: nlm CLI installed
    const nlmCheck = this.addCheckItem(checkList, 'nlm CLI installed');
    const nlmInstalled = await this.server.isNlmInstalled();
    this.updateCheckItem(nlmCheck, nlmInstalled,
      nlmInstalled ? 'Found' : 'Not found. Install: uv tool install notebooklm-mcp-cli');
    results.push({ label: 'nlm CLI', passed: nlmInstalled, message: '' });

    if (!nlmInstalled) {
      this.renderInstructions(contentEl, 'install');
      return;
    }

    // Check 2: Authenticated
    const authCheck = this.addCheckItem(checkList, 'Authenticated');
    const authenticated = await this.server.isAuthenticated();
    this.updateCheckItem(authCheck, authenticated,
      authenticated ? 'Logged in' : 'Not authenticated. Run: nlm login');
    results.push({ label: 'Auth', passed: authenticated, message: '' });

    if (!authenticated) {
      this.renderInstructions(contentEl, 'auth');
      return;
    }

    // Check 3: Server reachable
    const serverCheck = this.addCheckItem(checkList, 'MCP server reachable');
    const serverOk = await this.client.isHealthy();
    this.updateCheckItem(serverCheck, serverOk,
      serverOk ? 'Connected' : 'Not running — will attempt to start automatically');
    results.push({ label: 'Server', passed: serverOk, message: '' });

    if (!serverOk) {
      // Try to start
      const startCheck = this.addCheckItem(checkList, 'Starting server...');
      try {
        await this.server.start();
        this.updateCheckItem(startCheck, true, 'Server started');
      } catch (e) {
        this.updateCheckItem(startCheck, false,
          `Failed to start. Run manually: notebooklm-mcp --transport http`);
      }
    }

    // Summary
    const allPassed = results.every((r) => r.passed);
    contentEl.createEl('p', {
      text: allPassed
        ? 'All checks passed! You\'re ready to use NotebookLM Hub.'
        : 'Some checks failed. See instructions above.',
      cls: allPassed ? 'nlm-setup-success' : 'nlm-setup-warning',
    });

    const closeBtn = contentEl.createEl('button', {
      text: 'Close',
      cls: 'nlm-studio-create-btn',
    });
    closeBtn.style.marginTop = '12px';
    closeBtn.addEventListener('click', () => this.close());
  }

  private addCheckItem(parent: HTMLElement, label: string): HTMLElement {
    const item = parent.createDiv({ cls: 'nlm-setup-check-item' });
    item.createEl('span', { text: '⏳', cls: 'nlm-setup-check-icon' });
    item.createEl('span', { text: label, cls: 'nlm-setup-check-label' });
    item.createEl('span', { text: 'Checking...', cls: 'nlm-setup-check-status' });
    return item;
  }

  private updateCheckItem(item: HTMLElement, passed: boolean, message: string): void {
    const icon = item.querySelector('.nlm-setup-check-icon');
    const status = item.querySelector('.nlm-setup-check-status');
    if (icon) icon.textContent = passed ? '✅' : '❌';
    if (status) {
      status.textContent = message;
      status.classList.toggle('nlm-setup-check-fail', !passed);
    }
  }

  private renderInstructions(parent: HTMLElement, type: 'install' | 'auth'): void {
    const box = parent.createDiv({ cls: 'nlm-setup-instructions' });

    if (type === 'install') {
      box.createEl('h4', { text: 'Install notebooklm-mcp-cli' });
      box.createEl('p', { text: 'Run one of these commands in your terminal:' });
      const code = box.createEl('pre', { cls: 'nlm-setup-code' });
      code.createEl('code', { text: 'uv tool install notebooklm-mcp-cli' });
      box.createEl('p', { text: 'Or with pip:' });
      const code2 = box.createEl('pre', { cls: 'nlm-setup-code' });
      code2.createEl('code', { text: 'pip install notebooklm-mcp-cli' });
    } else {
      box.createEl('h4', { text: 'Authenticate with Google' });
      box.createEl('p', { text: 'Run this command in your terminal:' });
      const code = box.createEl('pre', { cls: 'nlm-setup-code' });
      code.createEl('code', { text: 'nlm login' });
      box.createEl('p', { text: 'This will open a browser window for Google sign-in.' });
    }

    const retryBtn = parent.createEl('button', {
      text: 'Retry Checks',
      cls: 'nlm-studio-create-btn',
    });
    retryBtn.style.marginTop = '12px';
    retryBtn.addEventListener('click', () => this.onOpen());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
