/**
 * Session ingestion types and interfaces
 */

export type AgentType = 'claude-code' | 'cursor' | 'unknown';

/**
 * Unified session data structure from AI tools
 */
export interface Session {
  agent_type: AgentType;
  session_id: string;
  workspace_path: string;
  referenced_files: string[];
  timestamp: Date;
  transcript_summary?: string;
  transcript_hash: string;
  raw_metadata?: Record<string, unknown>;
}

/**
 * Raw Claude Code conversation data
 */
export interface ClaudeConversation {
  id: string;
  created_at: string;
  updated_at: string;
  messages: ClaudeMessage[];
  project_path?: string;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tool_uses?: ClaudeToolUse[];
}

export interface ClaudeToolUse {
  tool_name: string;
  input?: Record<string, unknown>;
  output?: string;
  file_path?: string;
}

/**
 * Raw Cursor session data (to be determined by research)
 */
export interface CursorSession {
  id: string;
  workspace: string;
  timestamp: string;
  files: string[];
  // Additional fields to be added after research
}

/**
 * Session cache entry
 */
export interface CachedSession {
  session: Session;
  cached_at: Date;
  ttl: number; // Time to live in milliseconds
}

/**
 * Session parser interface
 */
export interface SessionParser {
  /**
   * Parse sessions from the AI tool's storage
   */
  parseSessions(): Promise<Session[]>;

  /**
   * Check if the tool is installed and has session data
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get the storage path for the tool
   */
  getStoragePath(): string;
}
