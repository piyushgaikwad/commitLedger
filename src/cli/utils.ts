import { GitRepository } from '../git/repo.js';
import { logger } from '../utils/logger.js';

/**
 * Ensures the current directory is a Git repository
 * Exits with error message if not
 */
export async function ensureGitRepository(
  repo: GitRepository
): Promise<void> {
  const isRepo = await repo.isGitRepository();
  if (!isRepo) {
    logger.error(
      'Not a git repository. Please run this command from a Git repository.'
    );
    process.exit(1);
  }
}

/**
 * Handles command errors gracefully
 */
export function handleCommandError(error: unknown, commandName: string): void {
  logger.error(`Error executing '${commandName}' command:`);

  if (error instanceof Error) {
    logger.error(error.message);
    if (process.env.DEBUG) {
      logger.debug(error.stack || '');
    }
  } else {
    logger.error(String(error));
  }

  process.exit(1);
}

/**
 * Formats a date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Truncates a string to a maximum length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
