import { Receipt, CommitMetadata, DiffStatistics } from './schema.js';
import { CommitContext, DiffSummary } from '../git/types.js';
import { computeReceiptHash } from '../utils/hash.js';

export interface ReceiptGeneratorOptions {
  commitContext: CommitContext;
  diffSummary: DiffSummary;
  agentType?: 'claude-code' | 'cursor' | 'unknown';
  sessionId?: string;
  confidenceScore?: number;
}

/**
 * Generates an AI Receipt from commit context and matching information
 */
export class ReceiptGenerator {
  generate(options: ReceiptGeneratorOptions): Receipt {
    const {
      commitContext,
      diffSummary,
      agentType,
      sessionId,
      confidenceScore,
    } = options;

    // Build commit metadata
    const commitMetadata: CommitMetadata = {
      sha: commitContext.sha,
      branch: commitContext.branch,
      author: commitContext.author,
      email: commitContext.email,
      timestamp: commitContext.timestamp.toISOString(),
      message: commitContext.message,
    };

    // Build diff statistics
    const diffStatistics: DiffStatistics = {
      files_changed: diffSummary.filesChanged,
      insertions: diffSummary.insertions,
      deletions: diffSummary.deletions,
      changed_files: diffSummary.changedFiles,
    };

    // Build agent metadata (null if no AI detected)
    const agentMetadata =
      agentType && sessionId && confidenceScore !== undefined
        ? {
            agent_type: agentType,
            session_id: sessionId,
            confidence_score: confidenceScore,
          }
        : null;

    // Create receipt without integrity hash first
    const receiptWithoutHash: Omit<Receipt, 'integrity_hash'> = {
      version: '1.0',
      commit_metadata: commitMetadata,
      agent_metadata: agentMetadata,
      diff_statistics: diffStatistics,
      verification_status: undefined,
      generated_at: new Date().toISOString(),
    };

    // Compute integrity hash
    const integrityHash = computeReceiptHash(receiptWithoutHash);

    // Final receipt with hash
    const receipt: Receipt = {
      ...receiptWithoutHash,
      integrity_hash: integrityHash,
    };

    return receipt;
  }

  /**
   * Generates a receipt for a human-authored commit (no AI detected)
   */
  generateHumanReceipt(
    commitContext: CommitContext,
    diffSummary: DiffSummary
  ): Receipt {
    return this.generate({
      commitContext,
      diffSummary,
      agentType: undefined,
      sessionId: undefined,
      confidenceScore: undefined,
    });
  }

  /**
   * Generates a receipt for an AI-assisted commit
   */
  generateAIReceipt(
    commitContext: CommitContext,
    diffSummary: DiffSummary,
    agentType: 'claude-code' | 'cursor',
    sessionId: string,
    confidenceScore: number
  ): Receipt {
    return this.generate({
      commitContext,
      diffSummary,
      agentType,
      sessionId,
      confidenceScore,
    });
  }
}

// Export singleton instance
export const receiptGenerator = new ReceiptGenerator();
