import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
import {
  Session,
  SessionParser,
  ClaudeConversation,
  ClaudeMessage,
} from './types.js';

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
      // Get workspace path from project metadata
      const workspacePath = await this.getWorkspacePath(projectPath);

      // Parse conversations
      const conversationsDir = join(projectPath, 'conversations');
      try {
        const conversations = await fs.readdir(conversationsDir);

        for (const convFile of conversations) {
          if (!convFile.endsWith('.json')) continue;

          try {
            const convPath = join(conversationsDir, convFile);
            const session = await this.parseConversation(
              convPath,
              workspacePath,
              projectHash
            );
            if (session) {
              sessions.push(session);
            }
          } catch (error) {
            logger.debug(`Error parsing conversation ${convFile}: ${error}`);
          }
        }
      } catch {
        // No conversations directory
      }
    } catch (error) {
      logger.debug(`Error parsing project ${projectHash}: ${error}`);
    }

    return sessions;
  }

  private async getWorkspacePath(projectPath: string): Promise<string> {
    try {
      // Try to read project metadata
      const metadataPath = join(projectPath, 'metadata.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      return metadata.workspace_path || projectPath;
    } catch {
      // Fallback: use project path
      return projectPath;
    }
  }

  private async parseConversation(
    convPath: string,
    workspacePath: string,
    projectHash: string
  ): Promise<Session | null> {
    try {
      const content = await fs.readFile(convPath, 'utf8');
      const conversation: ClaudeConversation = JSON.parse(content);

      // Extract referenced files from tool uses and messages
      const referencedFiles = this.extractReferencedFiles(conversation);

      // Get timestamp (last message or conversation updated_at)
      const timestamp = this.getTimestamp(conversation);

      // Create transcript hash
      const transcriptHash = this.createTranscriptHash(conversation);

      // Create session
      const session: Session = {
        agent_type: 'claude-code',
        session_id: conversation.id || projectHash,
        workspace_path: workspacePath,
        referenced_files: referencedFiles,
        timestamp,
        transcript_summary: this.createSummary(conversation),
        transcript_hash: transcriptHash,
        raw_metadata: {
          conversation_id: conversation.id,
          project_hash: projectHash,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
        },
      };

      return session;
    } catch (error) {
      logger.debug(`Failed to parse conversation: ${error}`);
      return null;
    }
  }

  private extractReferencedFiles(conversation: ClaudeConversation): string[] {
    const files = new Set<string>();

    for (const message of conversation.messages || []) {
      // Extract from tool uses
      if (message.tool_uses) {
        for (const toolUse of message.tool_uses) {
          if (toolUse.file_path) {
            files.add(toolUse.file_path);
          }
          // Extract from Read/Edit/Write tool inputs
          if (toolUse.input?.file_path) {
            files.add(String(toolUse.input.file_path));
          }
        }
      }

      // Extract file paths from message content (simple pattern matching)
      const fileMatches = message.content.match(/\b[\w/-]+\.(ts|js|py|go|rs|java|cpp|c|h|json|yaml|yml|md|txt)\b/g);
      if (fileMatches) {
        fileMatches.forEach((f) => files.add(f));
      }
    }

    return Array.from(files);
  }

  private getTimestamp(conversation: ClaudeConversation): Date {
    // Use last message timestamp or conversation updated_at
    if (conversation.messages && conversation.messages.length > 0) {
      const lastMessage = conversation.messages[conversation.messages.length - 1];
      if (lastMessage.timestamp) {
        return new Date(lastMessage.timestamp);
      }
    }

    if (conversation.updated_at) {
      return new Date(conversation.updated_at);
    }

    return new Date();
  }

  private createTranscriptHash(conversation: ClaudeConversation): string {
    // Hash all message content
    const content = (conversation.messages || [])
      .map((m) => m.content)
      .join('\n');
    return createHash('sha256').update(content).digest('hex');
  }

  private createSummary(conversation: ClaudeConversation): string {
    // Extract first user message as summary
    const firstUserMessage = conversation.messages?.find(
      (m) => m.role === 'user'
    );
    if (firstUserMessage) {
      return firstUserMessage.content.substring(0, 200);
    }
    return 'No summary available';
  }
}
