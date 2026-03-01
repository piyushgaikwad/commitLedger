import { Command } from 'commander';
import { GitRepository } from '../../git/repo.js';
import { MetadataBranchManager } from '../../git/metadata-branch.js';
import { receiptGenerator } from '../../receipt/generator.js';
import { chatSummaryGenerator } from '../../receipt/chat-summary-generator.js';
import { logger } from '../../utils/logger.js';
import { ensureGitRepository, handleCommandError } from '../utils.js';
import { sessionOrchestrator } from '../../ingestion/orchestrator.js';
import { matchingEngine } from '../../matching/engine.js';
import type { Session } from '../../ingestion/types.js';

export function createCaptureCommand(): Command {
  const command = new Command('capture');

  command
    .description('Manually capture a receipt for a commit')
    .argument('[sha]', 'Commit SHA (defaults to HEAD)', 'HEAD')
    .option('-f, --force', 'Overwrite existing receipt', false)
    .action(async (sha, options) => {
      try {
        await captureCommand(sha, options);
      } catch (error) {
        handleCommandError(error, 'capture');
      }
    });

  return command;
}

async function captureCommand(
  sha: string,
  options: { force: boolean }
): Promise<void> {
  const repo = new GitRepository();
  await ensureGitRepository(repo);

  const metadataBranch = new MetadataBranchManager(repo);

  logger.info(`Capturing receipt for commit ${sha}...`);

  // Check if receipt already exists
  const exists = await metadataBranch.receiptExists(sha);
  if (exists && !options.force) {
    logger.warn(
      `Receipt already exists for ${sha}. Use --force to overwrite.`
    );
    return;
  }

  // Get commit context
  const commitContext = await repo.getCommitContext(sha);
  const diffSummary = await repo.getDiffSummary(sha);

  logger.info(`Commit: ${commitContext.shortSha} on ${commitContext.branch}`);
  logger.info(`Author: ${commitContext.author} <${commitContext.email}>`);
  logger.info(
    `Files changed: ${diffSummary.filesChanged}, +${diffSummary.insertions} -${diffSummary.deletions}`
  );

  // AI Detection: Try to match commit to AI session
  let receipt;
  let matchedSession: Session | null = null;
  try {
    logger.debug('Attempting to detect AI agent...');

    // Get repository root for workspace matching
    const repoRoot = await repo.getRepositoryRoot();

    // Get recent sessions (last 24 hours)
    const sessions = await sessionOrchestrator.getRecentSessions(24);
    logger.debug(`Found ${sessions.length} recent AI sessions`);

    if (sessions.length > 0) {
      // Try to match commit to a session
      const matchResult = await matchingEngine.matchCommit(
        commitContext,
        sessions,
        repoRoot,
        diffSummary.changedFiles
      );

      if (matchResult.session && matchResult.confidence_score >= 0.6) {
        // AI-assisted commit detected
        matchedSession = matchResult.session;

        // Only generate AI receipt if agent type is known (not 'unknown')
        if (matchResult.session.agent_type === 'claude-code' || matchResult.session.agent_type === 'cursor') {
          receipt = receiptGenerator.generateAIReceipt(
            commitContext,
            diffSummary,
            matchResult.session.agent_type,
            matchResult.session.session_id,
            matchResult.confidence_score
          );

          logger.debug(
            `AI agent detected: ${matchResult.session.agent_type} (${(matchResult.confidence_score * 100).toFixed(1)}%)`
          );
        } else {
          // Unknown agent type - treat as human
          receipt = receiptGenerator.generateHumanReceipt(
            commitContext,
            diffSummary
          );
          logger.debug('Unknown agent type, treating as human commit');
        }
      } else {
        // No confident match - human commit
        receipt = receiptGenerator.generateHumanReceipt(
          commitContext,
          diffSummary
        );
        logger.debug('No AI agent detected (low confidence or no match)');
      }
    } else {
      // No sessions found - human commit
      receipt = receiptGenerator.generateHumanReceipt(
        commitContext,
        diffSummary
      );
      logger.debug('No AI sessions found');
    }
  } catch (error) {
    // Fallback to human receipt on error
    logger.debug(`AI detection error: ${error}`);
    receipt = receiptGenerator.generateHumanReceipt(
      commitContext,
      diffSummary
    );
  }

  // Store receipt
  await metadataBranch.storeReceipt(commitContext.sha, receipt);

  logger.success(`Receipt captured for ${commitContext.shortSha}`);

  // Store chat summary if AI session was matched
  if (matchedSession) {
    try {
      logger.debug('Generating chat summary...');
      const chatSummary = await chatSummaryGenerator.generateFromSession(
        commitContext.sha,
        matchedSession
      );

      if (chatSummary) {
        await metadataBranch.storeChatSummary(commitContext.sha, chatSummary);
        logger.success(
          `Chat summary captured (${chatSummary.chat_data.total_messages} messages)`
        );
      } else {
        logger.debug('Could not generate chat summary');
      }
    } catch (error) {
      logger.debug(`Failed to generate/store chat summary: ${error}`);
    }
  }

  if (!receipt.agent_metadata) {
    logger.info('No AI agent detected for this commit');
  } else {
    logger.info(
      `AI Agent: ${receipt.agent_metadata.agent_type} (confidence: ${(receipt.agent_metadata.confidence_score * 100).toFixed(1)}%)`
    );
  }
}
