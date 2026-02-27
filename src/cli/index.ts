import { Command } from 'commander';
import { createInitCommand } from './commands/init.js';
import { createCaptureCommand } from './commands/capture.js';
import { createShowCommand } from './commands/show.js';
import { installHooksCommand } from './commands/install-hooks.js';
import { uninstallHooksCommand } from './commands/uninstall-hooks.js';
import { logger, LogLevel } from '../utils/logger.js';

const program = new Command();

program
  .name('commitledger')
  .description('AI Commit Ledger - Track AI-assisted development')
  .version('0.1.0')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .option('-q, --quiet', 'Suppress non-error output', false)
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      logger.setLevel(LogLevel.DEBUG);
    } else if (opts.quiet) {
      logger.setLevel(LogLevel.ERROR);
    }
  });

// Register commands
program.addCommand(createInitCommand());
program.addCommand(createCaptureCommand());
program.addCommand(createShowCommand());
program.addCommand(installHooksCommand);
program.addCommand(uninstallHooksCommand);

// TODO: Add more commands
// program.addCommand(createListCommand());
// program.addCommand(createQueryCommand());
// program.addCommand(createStatsCommand());
// program.addCommand(createDashboardCommand());
// program.addCommand(createExportCommand());

// Parse command line arguments
program.parse(process.argv);
