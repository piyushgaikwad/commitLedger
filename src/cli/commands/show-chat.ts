import { Command } from 'commander';
import chalk from 'chalk';
import { GitRepository } from '../../git/repo.js';
import { MetadataBranchManager } from '../../git/metadata-branch.js';
import { logger } from '../../utils/logger.js';
import { ensureGitRepository, handleCommandError } from '../utils.js';

export function createShowChatCommand(): Command {
  const command = new Command('show-chat');

  command
    .description('Display chat summary for a commit')
    .argument('<sha>', 'Commit SHA (short/full), HEAD, or branch name')
    .option('--json', 'Output as JSON instead of formatted display', false)
    .action(async (sha, options) => {
      try {
        await showChatCommand(sha, options);
      } catch (error) {
        handleCommandError(error, 'show-chat');
      }
    });

  return command;
}

async function showChatCommand(
  sha: string,
  options: { json: boolean }
): Promise<void> {
  const repo = new GitRepository();
  await ensureGitRepository(repo);

  const metadataBranch = new MetadataBranchManager(repo);

  // Resolve SHA (handles HEAD, branch names, etc.)
  const resolvedSha = await repo.resolveSHA(sha);

  // Retrieve chat summary
  const chatSummary = await metadataBranch.retrieveChatSummary(resolvedSha);

  if (!chatSummary) {
    logger.error(`No chat summary found for commit ${sha}`);
    process.exit(1);
  }

  if (options.json) {
    // Output as JSON
    console.log(JSON.stringify(chatSummary, null, 2));
  } else {
    // Pretty formatted output
    displayChatSummary(chatSummary);
  }
}

function displayChatSummary(summary: any): void {
  const { commit_sha, session_id, agent_type, chat_data, generated_at } = summary;

  console.log(chalk.cyan('═'.repeat(50)));
  console.log(chalk.cyan.bold('         AI SESSION SUMMARY'));
  console.log(chalk.cyan('═'.repeat(50)));
  console.log();

  // Commit Information
  console.log(chalk.yellow.bold('📋 Commit Information'));
  console.log(`  ${chalk.gray('SHA:')}        ${commit_sha}`);
  console.log(`  ${chalk.gray('Session ID:')} ${session_id}`);
  console.log(`  ${chalk.gray('Agent:')}      ${agent_type}`);
  console.log();

  // Filter valid messages first
  const validUserPrompts = chat_data.user_prompts.filter((p: any) => p.content && p.content.trim());
  const validAssistantResponses = chat_data.assistant_responses.filter((r: any) => r.content && r.content.trim());

  // Chat Statistics
  console.log(chalk.yellow.bold('📊 Chat Statistics'));
  console.log(`  ${chalk.gray('Total Messages:')}      ${validUserPrompts.length + validAssistantResponses.length}`);
  console.log(`  ${chalk.gray('User Prompts:')}        ${validUserPrompts.length}`);
  console.log(`  ${chalk.gray('Assistant Responses:')} ${validAssistantResponses.length}`);
  console.log();

  // User Prompts
  if (validUserPrompts.length > 0) {
    console.log(chalk.yellow.bold('💬 User Prompts'));
    validUserPrompts.forEach((prompt: any, index: number) => {
      console.log();
      console.log(chalk.blue(`  [${index + 1}] ${new Date(prompt.timestamp).toLocaleString()}`));
      console.log(chalk.gray('  ' + '-'.repeat(48)));

      // Wrap text at 80 characters
      const lines = wrapText(prompt.content, 74);
      lines.forEach(line => console.log(`  ${line}`));

      if (prompt.truncated) {
        console.log(chalk.yellow('  [Content truncated]'));
      }
    });
    console.log();
  }

  // Assistant Responses
  if (validAssistantResponses.length > 0) {
    console.log(chalk.yellow.bold('🤖 Assistant Responses'));
    validAssistantResponses.forEach((response: any, index: number) => {
      console.log();
      console.log(chalk.green(`  [${index + 1}] ${new Date(response.timestamp).toLocaleString()}`));
      console.log(chalk.gray('  ' + '-'.repeat(48)));

      if (response.tool_uses && response.tool_uses.length > 0) {
        console.log(chalk.magenta(`  Tools used: ${response.tool_uses.join(', ')}`));
      }

      if (response.files_modified && response.files_modified.length > 0) {
        console.log(chalk.cyan(`  Files modified: ${response.files_modified.length}`));
        response.files_modified.slice(0, 5).forEach((file: string) => {
          console.log(chalk.gray(`    • ${file}`));
        });
        if (response.files_modified.length > 5) {
          console.log(chalk.gray(`    ... and ${response.files_modified.length - 5} more`));
        }
      }

      console.log();
      const lines = wrapText(response.content, 74);
      lines.forEach(line => console.log(`  ${line}`));

      if (response.truncated) {
        console.log(chalk.yellow('  [Content truncated]'));
      }
    });
    console.log();
  }

  // Metadata
  console.log(chalk.yellow.bold('🔒 Metadata'));
  console.log(`  ${chalk.gray('Version:')}      ${summary.version}`);
  console.log(`  ${chalk.gray('Generated At:')} ${new Date(generated_at).toLocaleString()}`);
  console.log(`  ${chalk.gray('Integrity:')}    ${summary.integrity_hash.substring(0, 16)}...`);
  console.log();
}

/**
 * Wrap text at specified width
 */
function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }

    let currentLine = '';
    const words = paragraph.split(' ');

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine += (currentLine.length > 0 ? ' ' : '') + word;
      } else {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  return lines;
}
