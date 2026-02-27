import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Git hooks manager - installs and manages post-commit hooks
 */
export class GitHooksManager {
  private repoPath: string;
  private hooksDir: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.hooksDir = join(repoPath, '.git', 'hooks');
  }

  /**
   * Get the path to the hook template
   */
  private getHookTemplatePath(): string {
    // Template is in: commitLedger/hooks/templates/post-commit
    // We're in: commitLedger/dist/git/hooks.js
    // So go up to project root, then to hooks/templates
    const projectRoot = join(__dirname, '..', '..');
    return join(projectRoot, 'hooks', 'templates', 'post-commit');
  }

  /**
   * Get the path to the post-commit hook in the repository
   */
  private getHookPath(): string {
    return join(this.hooksDir, 'post-commit');
  }

  /**
   * Check if hooks directory exists
   */
  async hooksDirectoryExists(): Promise<boolean> {
    try {
      await fs.access(this.hooksDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if post-commit hook exists
   */
  async hookExists(): Promise<boolean> {
    try {
      await fs.access(this.getHookPath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if commitledger hook is already installed
   */
  async isCommitledgerHookInstalled(): Promise<boolean> {
    if (!(await this.hookExists())) {
      return false;
    }

    try {
      const content = await fs.readFile(this.getHookPath(), 'utf8');
      return content.includes('commitledger capture');
    } catch {
      return false;
    }
  }

  /**
   * Read the hook template
   */
  private async readHookTemplate(): Promise<string> {
    const templatePath = this.getHookTemplatePath();

    try {
      return await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      logger.debug(`Failed to read hook template from ${templatePath}: ${error}`);

      // Fallback: return inline template
      return `#!/bin/sh
# commitledger post-commit hook
# Auto-capture AI commit receipts

# Try to capture receipt for the commit
# Use || true to ensure hook doesn't fail the commit
commitledger capture HEAD --quiet || true
`;
    }
  }

  /**
   * Install the post-commit hook
   */
  async installHook(): Promise<{ success: boolean; message: string }> {
    // Check if hooks directory exists
    if (!(await this.hooksDirectoryExists())) {
      return {
        success: false,
        message: 'Not a git repository (no .git/hooks directory found)',
      };
    }

    // Check if already installed
    if (await this.isCommitledgerHookInstalled()) {
      return {
        success: true,
        message: 'commitledger hook is already installed',
      };
    }

    const hookPath = this.getHookPath();
    const hookTemplate = await this.readHookTemplate();

    try {
      // Check if hook already exists
      if (await this.hookExists()) {
        // Append to existing hook
        const existingContent = await fs.readFile(hookPath, 'utf8');

        // Add separator and commitledger hook
        const newContent = `${existingContent.trim()}

# === commitledger hook (auto-added) ===
${hookTemplate.trim()}
`;

        await fs.writeFile(hookPath, newContent, { mode: 0o755 });

        return {
          success: true,
          message: 'commitledger hook appended to existing post-commit hook',
        };
      } else {
        // Create new hook
        await fs.writeFile(hookPath, hookTemplate, { mode: 0o755 });

        return {
          success: true,
          message: 'post-commit hook created successfully',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to install hook: ${error}`,
      };
    }
  }

  /**
   * Uninstall the commitledger hook
   */
  async uninstallHook(): Promise<{ success: boolean; message: string }> {
    if (!(await this.hookExists())) {
      return {
        success: true,
        message: 'No post-commit hook found',
      };
    }

    if (!(await this.isCommitledgerHookInstalled())) {
      return {
        success: true,
        message: 'commitledger hook is not installed',
      };
    }

    try {
      const hookPath = this.getHookPath();
      const content = await fs.readFile(hookPath, 'utf8');

      // Remove commitledger section
      // Match from "# === commitledger hook" to the end, or just the commitledger capture line
      let newContent = content
        .replace(/\n*# === commitledger hook \(auto-added\) ===[\s\S]*?(?=\n#|$)/g, '')
        .replace(/\n*# commitledger post-commit hook[\s\S]*?commitledger capture HEAD[^\n]*\n*/g, '');

      // Trim trailing whitespace
      newContent = newContent.trim();

      if (newContent.length === 0 || newContent === '#!/bin/sh') {
        // Hook only contained commitledger content, remove file
        await fs.unlink(hookPath);
        return {
          success: true,
          message: 'post-commit hook removed',
        };
      } else {
        // Write back remaining content
        await fs.writeFile(hookPath, newContent + '\n', { mode: 0o755 });
        return {
          success: true,
          message: 'commitledger hook removed from post-commit',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to uninstall hook: ${error}`,
      };
    }
  }

  /**
   * Get hook status information
   */
  async getHookStatus(): Promise<{
    hooksDirectoryExists: boolean;
    hookExists: boolean;
    commitledgerInstalled: boolean;
  }> {
    return {
      hooksDirectoryExists: await this.hooksDirectoryExists(),
      hookExists: await this.hookExists(),
      commitledgerInstalled: await this.isCommitledgerHookInstalled(),
    };
  }
}
