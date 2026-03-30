import { PluginSettingTab, Setting, App, Notice } from 'obsidian';
import type NotebookLMHubPlugin from '../main';

export class NotebookLMHubSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: NotebookLMHubPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Server Connection ─────────────────────────────────
    containerEl.createEl('h3', { text: 'Server Connection' });

    new Setting(containerEl)
      .setName('MCP server host')
      .setDesc('Host address for the notebooklm-mcp HTTP server')
      .addText((text) =>
        text
          .setPlaceholder('127.0.0.1')
          .setValue(this.plugin.settings.mcpHost)
          .onChange(async (value) => {
            this.plugin.settings.mcpHost = value || '127.0.0.1';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('MCP server port')
      .setDesc('Port for the notebooklm-mcp HTTP server')
      .addText((text) =>
        text
          .setPlaceholder('8000')
          .setValue(String(this.plugin.settings.mcpPort))
          .onChange(async (value) => {
            const port = parseInt(value, 10);
            if (!isNaN(port) && port > 0 && port < 65536) {
              this.plugin.settings.mcpPort = port;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName('Auto-start server')
      .setDesc('Automatically start the MCP server when the plugin loads')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoStartServer)
          .onChange(async (value) => {
            this.plugin.settings.autoStartServer = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('nlm CLI path')
      .setDesc('Path to the nlm command. Leave as "nlm" if installed globally.')
      .addText((text) =>
        text
          .setPlaceholder('nlm')
          .setValue(this.plugin.settings.nlmPath)
          .onChange(async (value) => {
            this.plugin.settings.nlmPath = value || 'nlm';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Test connection')
      .setDesc('Check if the MCP server is reachable')
      .addButton((btn) =>
        btn
          .setButtonText('Test')
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText('Testing...');
            try {
              const status = await this.plugin.client.getServerStatus();
              if (status.connectionStatus === 'connected') {
                new Notice(`Connected! Server v${status.version || 'unknown'}`);
              } else if (status.connectionStatus === 'disconnected') {
                new Notice('Server not running. Start with "nlm serve --transport http"');
              } else {
                new Notice(`Connection error: ${status.error}`);
              }
            } catch (e) {
              new Notice(`Error: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              btn.setDisabled(false);
              btn.setButtonText('Test');
            }
          }),
      );

    // ── Sync Settings ─────────────────────────────────────
    containerEl.createEl('h3', { text: 'Note Sync' });

    new Setting(containerEl)
      .setName('Zettelkasten folder')
      .setDesc('Folder containing permanent notes for batch sync')
      .addText((text) =>
        text
          .setPlaceholder('04_Zettelkasten')
          .setValue(this.plugin.settings.zettelkastenFolder)
          .onChange(async (value) => {
            this.plugin.settings.zettelkastenFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Include metadata')
      .setDesc('Include tags and dates when syncing notes')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeMetadata)
          .onChange(async (value) => {
            this.plugin.settings.includeMetadata = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Include frontmatter')
      .setDesc('Include YAML frontmatter in synced content')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeFrontmatter)
          .onChange(async (value) => {
            this.plugin.settings.includeFrontmatter = value;
            await this.plugin.saveSettings();
          }),
      );

    // ── Storage ───────────────────────────────────────────
    containerEl.createEl('h3', { text: 'Storage' });

    new Setting(containerEl)
      .setName('Note save folder')
      .setDesc('Where to save notes exported from NotebookLM queries')
      .addText((text) =>
        text
          .setPlaceholder('00_Inbox')
          .setValue(this.plugin.settings.noteSaveFolder)
          .onChange(async (value) => {
            this.plugin.settings.noteSaveFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Download folder')
      .setDesc('Where to save downloaded artifacts (audio, video, etc.)')
      .addText((text) =>
        text
          .setPlaceholder('09_Attachments/notebooklm')
          .setValue(this.plugin.settings.downloadFolder)
          .onChange(async (value) => {
            this.plugin.settings.downloadFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    // ── General ───────────────────────────────────────────
    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('Auto-open view')
      .setDesc('Open NotebookLM Hub sidebar on Obsidian startup')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoOpenView)
          .onChange(async (value) => {
            this.plugin.settings.autoOpenView = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
