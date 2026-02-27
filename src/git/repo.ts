import simpleGit, { SimpleGit, DiffResult } from 'simple-git';
import { logger } from '../utils/logger.js';
import {
  CommitContext,
  FileChange,
  DiffSummary,
  GitServiceOptions,
} from './types.js';

export class GitRepository {
  private git: SimpleGit;
  private repoPath: string;
  private metadataBranch: string;

  constructor(options: GitServiceOptions = {}) {
    this.repoPath = options.repoPath || process.cwd();
    this.metadataBranch = options.metadataBranch || 'ai/checkpoints/v1';
    this.git = simpleGit(this.repoPath);
  }

  /**
   * Checks if current directory is a Git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await this.git.revparse(['--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the root directory of the Git repository
   */
  async getRepositoryRoot(): Promise<string> {
    try {
      const root = await this.git.revparse(['--show-toplevel']);
      return root.trim();
    } catch (error) {
      throw new Error(`Failed to get repository root: ${error}`);
    }
  }

  /**
   * Gets the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch (error) {
      throw new Error(`Failed to get current branch: ${error}`);
    }
  }

  /**
   * Gets commit context for a given SHA (defaults to HEAD)
   */
  async getCommitContext(sha: string = 'HEAD'): Promise<CommitContext> {
    try {
      const log = await this.git.log({
        from: sha,
        to: sha,
        maxCount: 1,
      });

      if (!log.latest) {
        throw new Error(`Commit ${sha} not found`);
      }

      const commit = log.latest;
      const branch = await this.getCurrentBranch();

      return {
        sha: commit.hash,
        shortSha: commit.hash.substring(0, 7),
        branch,
        author: commit.author_name,
        email: commit.author_email,
        timestamp: new Date(commit.date),
        message: commit.message,
      };
    } catch (error) {
      throw new Error(`Failed to get commit context: ${error}`);
    }
  }

  /**
   * Gets the diff summary for a commit
   */
  async getDiffSummary(sha: string = 'HEAD'): Promise<DiffSummary> {
    try {
      // Get diff against parent commit
      const diff: DiffResult = await this.git.diff([
        '--numstat',
        `${sha}^`,
        sha,
      ]);

      const lines = diff.split('\n').filter((line) => line.trim());
      const changedFiles: string[] = [];
      let totalInsertions = 0;
      let totalDeletions = 0;

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 3) {
          const insertions = parseInt(parts[0], 10) || 0;
          const deletions = parseInt(parts[1], 10) || 0;
          const filePath = parts[2];

          changedFiles.push(filePath);
          totalInsertions += insertions;
          totalDeletions += deletions;
        }
      }

      return {
        filesChanged: changedFiles.length,
        insertions: totalInsertions,
        deletions: totalDeletions,
        changedFiles,
      };
    } catch (error) {
      logger.warn(`Failed to get diff summary for ${sha}: ${error}`);
      // Return empty diff if it fails (e.g., initial commit with no parent)
      return {
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        changedFiles: [],
      };
    }
  }

  /**
   * Gets detailed file changes for a commit
   */
  async getChangedFiles(sha: string = 'HEAD'): Promise<FileChange[]> {
    try {
      const diff: DiffResult = await this.git.diff([
        '--numstat',
        `${sha}^`,
        sha,
      ]);

      const lines = diff.split('\n').filter((line) => line.trim());
      const fileChanges: FileChange[] = [];

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 3) {
          const insertions = parseInt(parts[0], 10) || 0;
          const deletions = parseInt(parts[1], 10) || 0;
          const filePath = parts[2];

          // Determine status (simplified for now)
          let status: FileChange['status'] = 'modified';
          if (insertions > 0 && deletions === 0) {
            status = 'added';
          } else if (insertions === 0 && deletions > 0) {
            status = 'deleted';
          }

          fileChanges.push({
            path: filePath,
            status,
            insertions,
            deletions,
          });
        }
      }

      return fileChanges;
    } catch (error) {
      logger.warn(`Failed to get changed files for ${sha}: ${error}`);
      return [];
    }
  }

  /**
   * Checks if a branch exists
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      const branches = await this.git.branch();
      return (
        branches.all.includes(branchName) ||
        branches.all.includes(`remotes/origin/${branchName}`)
      );
    } catch {
      return false;
    }
  }

  /**
   * Gets the metadata branch name
   */
  getMetadataBranchName(): string {
    return this.metadataBranch;
  }

  /**
   * Gets the repository path
   */
  getRepoPath(): string {
    return this.repoPath;
  }

  /**
   * Gets the SimpleGit instance for advanced operations
   */
  getGitInstance(): SimpleGit {
    return this.git;
  }
}
