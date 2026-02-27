import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
import { Session, SessionParser } from './types.js';

export class ClaudeCodeParser implements SessionParser {
  private storagePath: string;

  constructor() {
    this.storagePath = join(homedir(), '.claude', 'projects');
  }

  getStoragePath(): string {
    return this.storagePath;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.storagePath);
      return true;
    } catch {
      return false;
    }
  }

  async parseSessions(): Promise<Session[]> {
    if (!(await this.isAvailable())) {
      logger.debug('Claude Code storage not found');
      return [];
    }

    const sessions: Session[] = [];

    try {
      const projects = await fs.readdir(this.storagePath);

      for (const projectHash of projects) {
        if (projectHash.startsWith('.')) continue;

        const projectPath = join(this.storagePath, projectHash);
        const projectSessions = await this.parseProjectSessions(
          projectPath,
          projectHash
        );
        sessions.push(...projectSessions);
      }

      logger.debug(`Parsed ${sessions.length} Claude Code sessions`);
    } catch (error) {
      logger.debug(`Error parsing Claude Code sessions: ${error}`);
    }

    return sessions;
  }

  private async parseProjectSessions(
    projectPath: string,
    projectHash: string
  ): Promise<Session[]> {
    const sessions: Session[]= [];

    try {
      // Read all files in project directory
      const files = await fs.readdir(projectPath);

      // Find all .jsonl files (session files)
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

      for (const jsonlFile of jsonlFiles) {
        try {
          const sessionPath = join(projectPath, jsonlFile);
          const session = await this.parseJSONLSession(sessionPath, projectHash);
          if (session) {
            sessions.push(session);
          }
        } catch (error) {
          logger.debug(`Error parsing session ${jsonlFile}: ${error}`);
        }
      }
    } catch (error) {
      logger.debug(`Error parsing project ${projectHash}: ${error}`);
    }

    return sessions;
  }

  /**
   * Parse a single JSONL session file
   * Format: One JSON event per line
   */
  private async parseJSONLSession(
    sessionPath: string,
    projectHash: string
  ): Promise<Session | null> {
    try {
      const content = await fs.readFile(sessionPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());

      if (lines.length === 0) {
        return null;
      }

      // Extract data from events
      let sessionId = '';
      let workspacePath = '';
      const referencedFiles = new Set<string>();
      let lastTimestamp: Date = new Date();
      const eventContent: string[] = [];

      for (const line of lines) {
        try {
          const event = JSON.parse(line);

          // Extract session ID (first occurrence)
          if (!sessionId && event.sessionId) {
            sessionId = event.sessionId;
          }

          // Extract workspace path from cwd
          if (!workspacePath && event.cwd) {
            workspacePath = event.cwd;
          }

          // Extract timestamp
          if (event.timestamp) {
            lastTimestamp = new Date(event.timestamp);
          }

          // Process assistant messages that contain tool uses
          if (event.type === 'assistant' && event.message?.content) {
            const content = Array.isArray(event.message.content)
              ? event.message.content
              : [event.message.content];

            for (const item of content) {
              // Check if this content item is a tool_use
              if (item.type === 'tool_use' && ['Read', 'Write', 'Edit'].includes(item.name)) {
                const filePath = item.input?.file_path;
                if (filePath) {
                  referencedFiles.add(filePath);
                }
              }
            }
          }

          // Collect content for hash (text and user messages)
          if (event.type === 'text' && event.message?.text) {
            const text = String(event.message.text);
            eventContent.push(text);
          } else if (event.type === 'user' && event.message?.content) {
            const content = typeof event.message.content === 'string'
              ? event.message.content
              : JSON.stringify(event.message.content);
            eventContent.push(content);
          }
        } catch (parseError) {
          // Skip malformed lines
          logger.debug(`Skipping malformed JSONL line: ${parseError}`);
        }
      }

      // Must have at least a session ID
      if (!sessionId) {
        logger.debug(`No session ID found in ${sessionPath}`);
        return null;
      }

      // Create transcript hash
      const transcriptHash = createHash('sha256')
        .update(eventContent.join('\n'))
        .digest('hex');

      // Create summary from first text content
      const summary = eventContent.length > 0 && typeof eventContent[0] === 'string'
        ? eventContent[0].substring(0, 200)
        : 'No summary available';

      const session: Session = {
        agent_type: 'claude-code',
        session_id: sessionId,
        workspace_path: workspacePath || projectHash,
        referenced_files: Array.from(referencedFiles),
        timestamp: lastTimestamp,
        transcript_summary: summary,
        transcript_hash: transcriptHash,
        raw_metadata: {
          project_hash: projectHash,
          session_file: sessionPath,
          event_count: lines.length,
        },
      };

      return session;
    } catch (error) {
      logger.debug(`Failed to parse JSONL session: ${error}`);
      return null;
    }
  }
}
