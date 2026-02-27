import { Command } from 'commander';
import chalk from 'chalk';
import { GitRepository } from '../../git/repo.js';
import { MetadataBranchManager } from '../../git/metadata-branch.js';
import { Receipt } from '../../receipt/schema.js';
import { logger, LogLevel } from '../../utils/logger.js';

interface ListOptions {
  verbose: boolean;
  aiOnly: boolean;
  humanOnly: boolean;
  agent?: string;
  limit?: number;
  json: boolean;
  minConfidence?: number;
}

export const createListCommand = () => {
  return new Command('list')
    .description('List all commits with their AI receipts')
    .option('--ai-only', 'Show only AI-assisted commits')
    .option('--human-only', 'Show only human commits (no AI)')
    .option('--agent <name>', 'Filter by AI agent (claude-code, cursor)')
    .option('-n, --limit <number>', 'Limit number of results', parseInt)
    .option('--min-confidence <score>', 'Minimum confidence score (0.0-1.0)', parseFloat)
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Show detailed output')
    .action(async (options: ListOptions) => {
      try {
        if (options.verbose) {
          logger.setLevel(LogLevel.DEBUG);
        }

        // Check if in git repository
        const repo = new GitRepository();
        if (!(await repo.isGitRepository())) {
          console.error(
            chalk.red('✗ Not a git repository. Run this command from within a git repository.')
          );
          process.exit(1);
        }

        const repoRoot = await repo.getRepositoryRoot();
        const metadataBranch = new MetadataBranchManager(repo);

        logger.debug('Listing receipts...');

        // Get all receipts
        const allReceipts = await metadataBranch.listReceipts();

        if (allReceipts.length === 0) {
          console.log(chalk.yellow('No receipts found.'));
          console.log(chalk.dim('  Capture receipts with: commitledger capture HEAD'));
          return;
        }

        logger.debug(`Found ${allReceipts.length} total receipts`);

        // Apply filters
        let filteredReceipts = allReceipts;

        // Filter by AI/human
        if (options.aiOnly) {
          filteredReceipts = filteredReceipts.filter(
            (r) => r.agent_metadata !== null
          );
          logger.debug(`After --ai-only filter: ${filteredReceipts.length} receipts`);
        }

        if (options.humanOnly) {
          filteredReceipts = filteredReceipts.filter(
            (r) => r.agent_metadata === null
          );
          logger.debug(`After --human-only filter: ${filteredReceipts.length} receipts`);
        }

        // Filter by agent
        if (options.agent) {
          filteredReceipts = filteredReceipts.filter(
            (r) =>
              r.agent_metadata !== null &&
              r.agent_metadata.agent_type === options.agent
          );
          logger.debug(`After --agent filter: ${filteredReceipts.length} receipts`);
        }

        // Filter by minimum confidence
        if (options.minConfidence !== undefined) {
          filteredReceipts = filteredReceipts.filter(
            (r) =>
              r.agent_metadata !== null &&
              r.agent_metadata.confidence_score >= options.minConfidence!
          );
          logger.debug(
            `After --min-confidence filter: ${filteredReceipts.length} receipts`
          );
        }

        // Apply limit
        if (options.limit && options.limit > 0) {
          filteredReceipts = filteredReceipts.slice(0, options.limit);
          logger.debug(`After limit: ${filteredReceipts.length} receipts`);
        }

        // Output results
        if (options.json) {
          outputJSON(filteredReceipts);
        } else {
          outputTable(filteredReceipts, allReceipts.length, filteredReceipts.length);
        }
      } catch (error) {
        console.error(chalk.red(`✗ Failed to list receipts: ${error}`));
        logger.debug(`Error: ${error}`);
        process.exit(1);
      }
    });
};

/**
 * Output receipts as formatted table
 */
function outputTable(
  receipts: Receipt[],
  totalCount: number,
  filteredCount: number
): void {
  console.log(
    chalk.bold('\n═══════════════════════════════════════════')
  );
  console.log(chalk.bold('         COMMIT RECEIPTS'));
  console.log(
    chalk.bold('═══════════════════════════════════════════\n')
  );

  for (const receipt of receipts) {
    const shortSha = receipt.commit_metadata.sha.substring(0, 7);
    const date = new Date(receipt.commit_metadata.timestamp).toLocaleDateString();
    const message = receipt.commit_metadata.message.split('\n')[0]; // First line only
    const truncatedMessage =
      message.length > 50 ? message.substring(0, 47) + '...' : message;

    // Determine badge and color
    let badge = '';
    let agentInfo = '';
    let color = chalk.white;

    if (receipt.agent_metadata) {
      const confidence = (receipt.agent_metadata.confidence_score * 100).toFixed(1);
      const agentName = formatAgentName(receipt.agent_metadata.agent_type);

      badge = '🤖';
      color = chalk.cyan;
      agentInfo = chalk.dim(` (${agentName}, ${confidence}%)`);
    } else {
      badge = '👤';
      color = chalk.white;
      agentInfo = chalk.dim(' (Human)');
    }

    // Format line
    console.log(
      `${badge} ${color(shortSha)} ${chalk.dim(date)} ${truncatedMessage}${agentInfo}`
    );
  }

  // Summary
  console.log(
    chalk.bold('\n═══════════════════════════════════════════')
  );
  if (filteredCount < totalCount) {
    console.log(
      chalk.dim(`Showing ${filteredCount} of ${totalCount} total receipts`)
    );
  } else {
    console.log(chalk.dim(`Total: ${totalCount} receipts`));
  }

  // Stats
  const aiCount = receipts.filter((r) => r.agent_metadata !== null).length;
  const humanCount = receipts.filter((r) => r.agent_metadata === null).length;

  console.log(
    chalk.dim(
      `  🤖 AI-assisted: ${aiCount} | 👤 Human: ${humanCount}`
    )
  );

  console.log(
    chalk.bold('═══════════════════════════════════════════\n')
  );
}

/**
 * Output receipts as JSON
 */
function outputJSON(receipts: Receipt[]): void {
  const output = receipts.map((receipt) => ({
    sha: receipt.commit_metadata.sha,
    short_sha: receipt.commit_metadata.sha.substring(0, 7),
    branch: receipt.commit_metadata.branch,
    author: receipt.commit_metadata.author,
    timestamp: receipt.commit_metadata.timestamp,
    message: receipt.commit_metadata.message,
    ai_agent: receipt.agent_metadata
      ? {
          type: receipt.agent_metadata.agent_type,
          session_id: receipt.agent_metadata.session_id,
          confidence: receipt.agent_metadata.confidence_score,
        }
      : null,
    files_changed: receipt.diff_statistics.files_changed,
    insertions: receipt.diff_statistics.insertions,
    deletions: receipt.diff_statistics.deletions,
  }));

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Format agent name for display
 */
function formatAgentName(agentType: string): string {
  switch (agentType) {
    case 'claude-code':
      return 'Claude Code';
    case 'cursor':
      return 'Cursor';
    default:
      return agentType;
  }
}
