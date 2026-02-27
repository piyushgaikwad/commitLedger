import { Command } from 'commander';
import { GitRepository } from '../../git/repo.js';
import { MetadataBranchManager } from '../../git/metadata-branch.js';
import { receiptGenerator } from '../../receipt/generator.js';
import { logger } from '../../utils/logger.js';
import { ensureGitRepository, handleCommandError } from '../utils.js';

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

  // TODO: In future, integrate session ingestion and matching here
  // For now, create a human receipt (no AI detected)
  const receipt = receiptGenerator.generateHumanReceipt(
    commitContext,
    diffSummary
  );

  // Store receipt
  await metadataBranch.storeReceipt(commitContext.sha, receipt);

  logger.success(`Receipt captured for ${commitContext.shortSha}`);

  if (!receipt.agent_metadata) {
    logger.info('No AI agent detected for this commit');
  } else {
    logger.info(
      `AI Agent: ${receipt.agent_metadata.agent_type} (confidence: ${receipt.agent_metadata.confidence_score.toFixed(2)})`
    );
  }
}
