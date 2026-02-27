/**
 * Git-related type definitions
 */

export interface CommitContext {
  sha: string;
  shortSha: string; // First 7 characters
  branch: string;
  author: string;
  email: string;
  timestamp: Date;
  message: string;
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  insertions: number;
  deletions: number;
}

export interface DiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  changedFiles: string[];
}

export interface ReceiptFilter {
  sha?: string;
  branch?: string;
  author?: string;
  agentType?: 'claude-code' | 'cursor' | 'unknown';
  dateFrom?: Date;
  dateTo?: Date;
  minConfidence?: number;
}

export interface GitServiceOptions {
  repoPath?: string;
  metadataBranch?: string;
}
