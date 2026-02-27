import { Command } from 'commander';
import chalk from 'chalk';
import { GitRepository } from '../../git/repo.js';
import { GitHooksManager } from '../../git/hooks.js';
import { logger, LogLevel } from '../../utils/logger.js';

export const installHooksCommand = new Command('install-hooks')
  .description('Install Git post-commit hook for automatic receipt capture')
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
      console.log(chalk.blue(`ℹ Installing hook in ${repoRoot}`));

      // Install hook
      const hooksManager = new GitHooksManager(repoRoot);
      const result = await hooksManager.installHook();

      if (result.success) {
        console.log(chalk.green(`✓ ${result.message}`));
        console.log(
          chalk.blue('\nℹ Receipts will now be automatically captured after each commit')
        );
        console.log(chalk.dim('  To disable: commitledger uninstall-hooks'));
      } else {
        console.error(chalk.red(`✗ ${result.message}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`✗ Failed to install hooks: ${error}`));
      logger.debug(`Error: ${error}`);
      process.exit(1);
    }
  });
