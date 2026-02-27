import { Command } from 'commander';
import { GitRepository } from '../../git/repo.js';
import { MetadataBranchManager } from '../../git/metadata-branch.js';
import { logger } from '../../utils/logger.js';
import { ensureGitRepository, handleCommandError } from '../utils.js';

export function createInitCommand(): Command {
  const command = new Command('init');

  command
    .description('Initialize AI Commit Ledger in the current repository')
    .option('-b, --branch <name>', 'Metadata branch name', 'ai/checkpoints/v1')
    .action(async (options) => {
      try {
        await initCommand(options);
      } catch (error) {
        handleCommandError(error, 'init');
      }
    });

  return command;
}

async function initCommand(options: { branch: string }): Promise<void> {
  logger.info('Initializing AI Commit Ledger...');

  // Create Git repository instance
  const repo = new GitRepository({
    metadataBranch: options.branch,
  });

  // Ensure we're in a Git repository
  await ensureGitRepository(repo);

  // Get repository root
  const repoRoot = await repo.getRepositoryRoot();
  logger.info(`Repository: ${repoRoot}`);

  // Initialize metadata branch
  const metadataBranch = new MetadataBranchManager(repo);
  await metadataBranch.initialize();

  logger.success('AI Commit Ledger initialized successfully!');
  logger.info('');
  logger.info('Next steps:');
  logger.info('  1. Install Git hooks: commitledger install-hooks');
  logger.info('  2. Make commits as usual - receipts will be captured automatically');
  logger.info('  3. View receipts: commitledger list');
  logger.info('  4. Launch dashboard: commitledger dashboard');
}
