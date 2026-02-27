import { Command } from 'commander';
import chalk from 'chalk';
import { GitRepository } from '../../git/repo.js';
import { GitHooksManager } from '../../git/hooks.js';
import { logger, LogLevel } from '../../utils/logger.js';

export const uninstallHooksCommand = new Command('uninstall-hooks')
  .description('Uninstall Git post-commit hook')
  .option('--verbose', 'Show detailed output')
  .action(async (options) => {
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
      console.log(chalk.blue(`ℹ Uninstalling hook from ${repoRoot}`));

      // Uninstall hook
      const hooksManager = new GitHooksManager(repoRoot);
      const result = await hooksManager.uninstallHook();

      if (result.success) {
        console.log(chalk.green(`✓ ${result.message}`));
        console.log(
          chalk.blue('\nℹ Receipts will no longer be automatically captured')
        );
        console.log(chalk.dim('  You can still manually capture with: commitledger capture HEAD'));
      } else {
        console.error(chalk.red(`✗ ${result.message}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`✗ Failed to uninstall hooks: ${error}`));
      logger.debug(`Error: ${error}`);
      process.exit(1);
    }
  });
