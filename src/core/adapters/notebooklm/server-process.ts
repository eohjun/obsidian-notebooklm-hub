import { requestUrl, Platform } from 'obsidian';
import { exec } from 'child_process';
import type { ChildProcess } from 'child_process';
import type { IServerProcess } from '../../domain/interfaces';
import { DEFAULT_MCP_HOST, DEFAULT_MCP_PORT } from '../../../constants';

/**
 * Manages the notebooklm-mcp HTTP server process lifecycle.
 *
 * Responsibilities:
 * - Start the server (`nlm serve --transport http`)
 * - Stop the server on plugin unload
 * - Health check polling
 * - Detect if server is already running externally
 */
export class ServerProcessAdapter implements IServerProcess {
  private process: ChildProcess | null = null;
  private host: string;
  private port: number;
  private nlmPath: string;
  private mcpServerPath: string;

  constructor(options: {
    host?: string;
    port?: number;
    nlmPath?: string;
    mcpServerPath?: string;
  } = {}) {
    this.host = options.host ?? DEFAULT_MCP_HOST;
    this.port = options.port ?? DEFAULT_MCP_PORT;
    this.nlmPath = options.nlmPath ?? 'nlm';
    this.mcpServerPath = options.mcpServerPath ?? 'notebooklm-mcp';
  }

  updateConfig(options: { host?: string; port?: number; nlmPath?: string; mcpServerPath?: string }): void {
    if (options.host) this.host = options.host;
    if (options.port) this.port = options.port;
    if (options.nlmPath) this.nlmPath = options.nlmPath;
    if (options.mcpServerPath) this.mcpServerPath = options.mcpServerPath;
  }

  getHealthUrl(): string {
    return `http://${this.host}:${this.port}/health`;
  }

  async isRunning(): Promise<boolean> {
    try {
      const response = await requestUrl({
        url: this.getHealthUrl(),
        method: 'GET',
        throw: false,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    // Check if already running (externally managed)
    if (await this.isRunning()) {
      return;
    }

    // Desktop only — mobile can't spawn processes
    if (Platform.isMobile) {
      throw new Error(
        'Cannot start MCP server on mobile. Please run the server externally.'
      );
    }

    return new Promise<void>((resolve, reject) => {
      // notebooklm-mcp is the MCP server binary; configured via env vars
      const cmd = this.mcpServerPath;

      this.process = exec(cmd, {
        env: {
          ...process.env,
          NOTEBOOKLM_MCP_TRANSPORT: 'http',
          NOTEBOOKLM_MCP_HOST: this.host,
          NOTEBOOKLM_MCP_PORT: String(this.port),
        },
      });

      this.process.on('error', (err) => {
        this.process = null;
        reject(new Error(`Failed to start nlm server: ${err.message}`));
      });

      this.process.on('exit', (code) => {
        this.process = null;
        if (code !== 0 && code !== null) {
          reject(new Error(`nlm server exited with code ${code}`));
        }
      });

      // Wait for server to become healthy
      this.waitForHealth(15_000)
        .then(() => resolve())
        .catch((err) => {
          this.stop();
          reject(err);
        });
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');

      // Give it a moment to shut down gracefully
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 3000);

        if (this.process) {
          this.process.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.process = null;
    }
  }

  /**
   * Check if the nlm CLI and notebooklm-mcp server are installed.
   */
  async isNlmInstalled(): Promise<boolean> {
    const nlmOk = await this.checkCommand(`${this.nlmPath} --version`);
    const mcpOk = await this.checkCommand(`${this.mcpServerPath} --help`);
    return nlmOk && mcpOk;
  }

  private checkCommand(cmd: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      exec(cmd, (error) => resolve(!error));
    });
  }

  /**
   * Check if user is authenticated with nlm.
   */
  async isAuthenticated(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      exec(`${this.nlmPath} doctor --json`, (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }
        try {
          const result = JSON.parse(stdout);
          resolve(result.authenticated === true || result.auth === 'ok');
        } catch {
          // If --json is not supported, check for "authenticated" in output
          resolve(stdout.toLowerCase().includes('authenticated'));
        }
      });
    });
  }

  private async waitForHealth(timeoutMs: number): Promise<void> {
    const start = Date.now();
    const pollInterval = 500;

    while (Date.now() - start < timeoutMs) {
      if (await this.isRunning()) {
        return;
      }
      await sleep(pollInterval);
    }

    throw new Error(`Server did not start within ${timeoutMs}ms`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
