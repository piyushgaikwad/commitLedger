import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
import {
  ChatSummary,
  UserPrompt,
  AssistantResponse,
  ChatData,
} from './chat-summary-schema.js';
import { Session } from '../ingestion/types.js';
import { join } from 'path';

/**
 * Maximum content length before truncation
 */
const MAX_CONTENT_LENGTH = 10000;

/**
 * Generates chat summaries from AI session data
 */
export class ChatSummaryGenerator {
  /**
   * Generate a chat summary for a Claude Code session
   */
  async generateFromClaudeSession(
    commitSha: string,
    session: Session
  ): Promise<ChatSummary | null> {
    try {
      const sessionFile = session.raw_metadata?.session_file as string | undefined;
      if (!sessionFile) {
        logger.debug('No session file found in raw_metadata');
        return null;
      }

      logger.debug(`Reading session file: ${sessionFile}`);

      const content = await fs.readFile(sessionFile, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim());
      logger.debug(`Parsed ${lines.length} lines from session file`);

      const userPrompts: UserPrompt[] = [];
      const assistantResponses: AssistantResponse[] = [];

      // Track token usage across all events
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheCreationTokens = 0;
      let totalCacheReadTokens = 0;

      for (const line of lines) {
        try {
          const event = JSON.parse(line);

          // Extract token usage if present (nested in message)
          const usage = event.message?.usage;
          if (usage) {
            if (usage.input_tokens) {
              totalInputTokens += usage.input_tokens;
            }
            if (usage.output_tokens) {
              totalOutputTokens += usage.output_tokens;
            }
            if (usage.cache_creation_input_tokens) {
              totalCacheCreationTokens += usage.cache_creation_input_tokens;
            }
            if (usage.cache_read_input_tokens) {
              totalCacheReadTokens += usage.cache_read_input_tokens;
            }
            logger.debug(`Event ${event.type}: usage found - input:${usage.input_tokens || 0}, output:${usage.output_tokens || 0}, cache_create:${usage.cache_creation_input_tokens || 0}, cache_read:${usage.cache_read_input_tokens || 0}`);
          }

          // Process user messages
          if (event.type === 'user' && event.message?.content) {
            const timestamp = event.timestamp
              ? new Date(event.timestamp).toISOString()
              : new Date().toISOString();

            let contentText = '';
            if (typeof event.message.content === 'string') {
              contentText = event.message.content;
            } else if (Array.isArray(event.message.content)) {
              // Extract text from content array
              contentText = event.message.content
                .map((item: any) => {
                  if (typeof item === 'string') return item;
                  if (item.type === 'text' && item.text) return item.text;
                  return '';
                })
                .join('\n');
            }

            const truncated = contentText.length > MAX_CONTENT_LENGTH;
            userPrompts.push({
              timestamp,
              content: truncated
                ? contentText.substring(0, MAX_CONTENT_LENGTH) + '...'
                : contentText,
              truncated,
            });
          }

          // Process assistant messages
          if (event.type === 'assistant' && event.message?.content) {
            const timestamp = event.timestamp
              ? new Date(event.timestamp).toISOString()
              : new Date().toISOString();

            const content = Array.isArray(event.message.content)
              ? event.message.content
              : [event.message.content];

            // Extract text content
            let textContent = '';
            const toolUses: string[] = [];
            const filesModified: string[] = [];

            for (const item of content) {
              if (typeof item === 'string') {
                textContent += item;
              } else if (item.type === 'text' && item.text) {
                textContent += item.text;
              } else if (item.type === 'tool_use') {
                if (item.name) {
                  toolUses.push(item.name);
                }
                // Track files from tool uses
                if (item.input?.file_path) {
                  filesModified.push(item.input.file_path);
                }
              }
            }

            const truncated = textContent.length > MAX_CONTENT_LENGTH;
            assistantResponses.push({
              timestamp,
              content: truncated
                ? textContent.substring(0, MAX_CONTENT_LENGTH) + '...'
                : textContent,
              truncated,
              tool_uses: toolUses.length > 0 ? toolUses : undefined,
              files_modified:
                filesModified.length > 0 ? [...new Set(filesModified)] : undefined,
            });
          }
        } catch (parseError) {
          logger.debug(`Skipping malformed line: ${parseError}`);
        }
      }

      // Build token usage summary
      // Note: total_tokens represents actual consumed tokens (input + output)
      // Cache tokens are tracked separately as they have different costs
      const totalTokens = totalInputTokens + totalOutputTokens;
      logger.debug(`Token extraction complete - Input: ${totalInputTokens}, Output: ${totalOutputTokens}, Cache Create: ${totalCacheCreationTokens}, Cache Read: ${totalCacheReadTokens}, Actual Total: ${totalTokens}`);

      const chatData: ChatData = {
        total_messages: userPrompts.length + assistantResponses.length,
        user_prompts: userPrompts,
        assistant_responses: assistantResponses,
        token_usage: totalTokens > 0 ? {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
          cache_creation_input_tokens: totalCacheCreationTokens,
          cache_read_input_tokens: totalCacheReadTokens,
          total_tokens: totalTokens,
        } : undefined,
      };
      logger.debug(`token_usage ${totalTokens > 0 ? 'INCLUDED' : 'EXCLUDED'} in chat data`);

      // Create chat summary without integrity hash first
      const summaryWithoutHash: Omit<ChatSummary, 'integrity_hash'> = {
        version: '1.0',
        commit_sha: commitSha,
        session_id: session.session_id,
        agent_type: session.agent_type,
        chat_data: chatData,
        generated_at: new Date().toISOString(),
      };

      // Compute integrity hash
      const integrityHash = this.computeHash(summaryWithoutHash);

      const chatSummary: ChatSummary = {
        ...summaryWithoutHash,
        integrity_hash: integrityHash,
      };

      return chatSummary;
    } catch (error) {
      logger.debug(`Failed to generate chat summary: ${error}`);
      return null;
    }
  }

  /**
   * Generate a chat summary for a Cursor session
   * (To be implemented when Cursor ingestion is ready)
   */
  async generateFromCursorSession(
    commitSha: string,
    session: Session
  ): Promise<ChatSummary | null> {
    logger.debug('Cursor chat summary generation not yet implemented');
    return null;
  }

  /**
   * Generate a chat summary from a session
   */
  async generateFromSession(
    commitSha: string,
    session: Session
  ): Promise<ChatSummary | null> {
    switch (session.agent_type) {
      case 'claude-code':
        return this.generateFromClaudeSession(commitSha, session);
      case 'cursor':
        return this.generateFromCursorSession(commitSha, session);
      default:
        logger.debug(`Unknown agent type: ${session.agent_type}`);
        return null;
    }
  }

  /**
   * Compute SHA-256 hash of chat summary content
   */
  private computeHash(summary: Omit<ChatSummary, 'integrity_hash'>): string {
    const sortedKeys = Object.keys(summary).sort();
    const sortedSummary: Record<string, any> = {};
    for (const key of sortedKeys) {
      sortedSummary[key] = (summary as any)[key];
    }
    const content = JSON.stringify(sortedSummary);
    return createHash('sha256').update(content).digest('hex');
  }
}

// Export singleton instance
export const chatSummaryGenerator = new ChatSummaryGenerator();
