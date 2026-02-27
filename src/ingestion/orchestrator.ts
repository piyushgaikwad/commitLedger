import { logger } from '../utils/logger.js';
import { Session, CachedSession, SessionParser } from './types.js';
import { ClaudeCodeParser } from './claude-code.js';
import { CursorParser } from './cursor.js';

/**
 * Session orchestrator - discovers and aggregates sessions from all AI tools
 */
export class SessionOrchestrator {
  private parsers: SessionParser[];
  private cache: Map<string, CachedSession>;
  private cacheTTL: number;

  constructor(options: { cacheTTL?: number } = {}) {
    this.parsers = [new ClaudeCodeParser(), new CursorParser()];
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 60 * 60 * 1000; // Default: 1 hour
  }

  /**
   * Get all sessions from all parsers
   */
  async getAllSessions(): Promise<Session[]> {
    const cacheKey = 'all_sessions';
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      logger.debug(`Using cached sessions (${cached.length} sessions)`);
      return cached;
    }

    logger.debug('Fetching sessions from all parsers...');

    const sessionsArrays = await Promise.all(
      this.parsers.map(async (parser) => {
        try {
          if (await parser.isAvailable()) {
            return await parser.parseSessions();
          }
        } catch (error) {
          logger.debug(`Parser error: ${error}`);
        }
        return [];
      })
    );

    const allSessions = sessionsArrays.flat();

    // Cache the result
    this.setCache(cacheKey, allSessions);

    logger.debug(`Fetched ${allSessions.length} sessions total`);
    return allSessions;
  }

  /**
   * Get sessions for a specific workspace/repository
   */
  async getSessionsForWorkspace(workspacePath: string): Promise<Session[]> {
    const allSessions = await this.getAllSessions();

    return allSessions.filter((session) =>
      this.matchesWorkspace(session.workspace_path, workspacePath)
    );
  }

  /**
   * Get sessions within a time range
   */
  async getSessionsInTimeRange(
    fromDate: Date,
    toDate: Date
  ): Promise<Session[]> {
    const allSessions = await this.getAllSessions();

    return allSessions.filter((session) => {
      const timestamp = session.timestamp.getTime();
      return timestamp >= fromDate.getTime() && timestamp <= toDate.getTime();
    });
  }

  /**
   * Get recent sessions (within last N hours)
   */
  async getRecentSessions(hoursAgo: number = 24): Promise<Session[]> {
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - hoursAgo * 60 * 60 * 1000);

    return this.getSessionsInTimeRange(fromDate, toDate);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Session cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    ttl: number;
    entries: string[];
  } {
    return {
      size: this.cache.size,
      ttl: this.cacheTTL,
      entries: Array.from(this.cache.keys()),
    };
  }

  /**
   * Get sessions from cache
   */
  private getFromCache(key: string): Session[] | null {
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Check if cache expired
    const now = Date.now();
    const age = now - cached.cached_at.getTime();

    if (age > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    return [cached.session];
  }

  /**
   * Set sessions in cache
   */
  private setCache(key: string, sessions: Session[]): void {
    // For simplicity, cache all sessions as one entry
    // In a more sophisticated implementation, we could cache individually
    if (sessions.length > 0) {
      // Store as a single cached entry (representing all sessions)
      // In practice, we'd want a more sophisticated cache structure
      this.cache.set(key, {
        session: sessions[0], // Placeholder - actual implementation would differ
        cached_at: new Date(),
        ttl: this.cacheTTL,
      });

      // For now, store a reference to all sessions
      (this.cache.get(key) as any)._allSessions = sessions;
    }
  }

  /**
   * Override getFromCache to handle our custom structure
   */
  private getFromCache(key: string): Session[] | null {
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Check if cache expired
    const now = Date.now();
    const age = now - cached.cached_at.getTime();

    if (age > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Return all sessions from our custom structure
    return (cached as any)._allSessions || [];
  }

  /**
   * Check if workspace paths match
   */
  private matchesWorkspace(
    sessionWorkspace: string,
    targetWorkspace: string
  ): boolean {
    // Normalize paths and check if they match
    const normalize = (path: string) =>
      path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();

    return normalize(sessionWorkspace) === normalize(targetWorkspace);
  }
}

// Export singleton instance
export const sessionOrchestrator = new SessionOrchestrator();
