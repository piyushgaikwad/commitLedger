import { Command } from 'commander';
import chalk from 'chalk';
import { GitRepository } from '../../git/repo.js';
import { MetadataBranchManager } from '../../git/metadata-branch.js';
import { logger } from '../../utils/logger.js';
import { ensureGitRepository, handleCommandError, formatDate } from '../utils.js';

export function createShowCommand(): Command {
  const command = new Command('show');

  command
    .description('Display receipt for a commit')
    .argument('<sha>', 'Commit SHA')
    .option('--json', 'Output as JSON', false)
    .action(async (sha, options) => {
      try {
        await showCommand(sha, options);
      } catch (error) {
        handleCommandError(error, 'show');
      }
    });

  return command;
}

async function showCommand(
  sha: string,
  options: { json: boolean }
): Promise<void> {
  const repo = new GitRepository();
  await ensureGitRepository(repo);

  const metadataBranch = new MetadataBranchManager(repo);

  // Retrieve receipt
  const receipt = await metadataBranch.retrieveReceipt(sha);

  if (!receipt) {
    logger.error(`No receipt found for commit ${sha}`);
    process.exit(1);
  }

  // Output as JSON if requested
  if (options.json) {
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }

  // Pretty-print the receipt
  logger.plain('');
  logger.plain(chalk.bold.cyan('═══════════════════════════════════════════'));
  logger.plain(chalk.bold.cyan('         AI COMMIT RECEIPT'));
  logger.plain(chalk.bold.cyan('═══════════════════════════════════════════'));
  logger.plain('');

  // Commit Info
  logger.plain(chalk.bold('📋 Commit Information'));
  logger.plain(`  SHA:       ${chalk.yellow(receipt.commit_metadata.sha)}`);
  logger.plain(`  Short SHA: ${chalk.yellow(receipt.commit_metadata.sha.substring(0, 7))}`);
  logger.plain(`  Branch:    ${chalk.green(receipt.commit_metadata.branch)}`);
  logger.plain(`  Author:    ${receipt.commit_metadata.author} <${receipt.commit_metadata.email}>`);
  logger.plain(`  Date:      ${formatDate(receipt.commit_metadata.timestamp)}`);
  logger.plain(`  Message:   ${chalk.italic(receipt.commit_metadata.message)}`);
  logger.plain('');

  // AI Agent Info
  if (receipt.agent_metadata) {
    const agentTypeLabel =
      receipt.agent_metadata.agent_type === 'claude-code'
        ? '🤖 Claude Code'
        : receipt.agent_metadata.agent_type === 'cursor'
        ? '✨ Cursor Agent'
        : '❓ Unknown AI';

    logger.plain(chalk.bold('🤖 AI Agent Information'));
    logger.plain(`  Type:       ${agentTypeLabel}`);
    logger.plain(`  Session ID: ${receipt.agent_metadata.session_id}`);
    logger.plain(
      `  Confidence: ${chalk.cyan((receipt.agent_metadata.confidence_score * 100).toFixed(1) + '%')}`
    );
  } else {
    logger.plain(chalk.bold('👤 Human-Authored'));
    logger.plain('  No AI agent detected for this commit');
  }
  logger.plain('');

  // Diff Statistics
  logger.plain(chalk.bold('📊 Changes'));
  logger.plain(`  Files Changed: ${receipt.diff_statistics.files_changed}`);
  logger.plain(`  Insertions:    ${chalk.green(`+${receipt.diff_statistics.insertions}`)}`);
  logger.plain(`  Deletions:     ${chalk.red(`-${receipt.diff_statistics.deletions}`)}`);
  logger.plain('');

  if (receipt.diff_statistics.changed_files.length > 0) {
    logger.plain(chalk.bold('  Changed Files:'));
    receipt.diff_statistics.changed_files.forEach((file) => {
      logger.plain(`    • ${file}`);
    });
    logger.plain('');
  }

  // Verification Status
  if (receipt.verification_status) {
    logger.plain(chalk.bold('✓ Verification'));
    if (receipt.verification_status.tests_run !== undefined) {
      logger.plain(
        `  Tests Run: ${receipt.verification_status.tests_run ? chalk.green('Yes') : chalk.red('No')}`
      );
    }
    if (receipt.verification_status.policies_checked) {
      logger.plain(
        `  Policies Checked: ${receipt.verification_status.policies_checked.join(', ')}`
      );
    }
    if (receipt.verification_status.validation_errors) {
      logger.plain(
        chalk.red(
          `  Errors: ${receipt.verification_status.validation_errors.join(', ')}`
        )
      );
    }
    logger.plain('');
  }

  // Metadata
  logger.plain(chalk.bold('🔒 Integrity'));
  logger.plain(`  Version:        ${receipt.version}`);
  logger.plain(`  Generated At:   ${formatDate(receipt.generated_at)}`);
  logger.plain(`  Integrity Hash: ${chalk.gray(receipt.integrity_hash.substring(0, 16) + '...')}`);
  logger.plain('');
  logger.plain(chalk.bold.cyan('═══════════════════════════════════════════'));
  logger.plain('');
}
