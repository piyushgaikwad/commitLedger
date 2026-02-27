import { logger } from '../utils/logger.js';
import { Session } from '../ingestion/types.js';
import { CommitContext } from '../git/types.js';
import {
  calculateDetailedScore,
  ScoreDetails,
} from './scoring.js';

/**
 * Match result containing the best matching session and confidence
 */
export interface MatchResult {
  session: Session | null;
  confidence_score: number;
  match_details: ScoreDetails | null;
}

/**
 * Matching engine options
 */
export interface MatchingOptions {
  confidenceThreshold?: number;
  timeWindowHours?: number; // Only consider sessions within N hours of commit
  fileWeight?: number;
  temporalWeight?: number;
}

/**
 * Matching engine - matches commits to AI sessions
 */
export class MatchingEngine {
  private confidenceThreshold: number;
  private timeWindowHours: number;

  constructor(options: MatchingOptions = {}) {
    this.confidenceThreshold = options.confidenceThreshold || 0.6;
    this.timeWindowHours = options.timeWindowHours || 6; // Default: 6 hours
  }

  /**
   * Match a commit to the best AI session
   */
  async matchCommit(
    commit: CommitContext,
    sessions: Session[],
    workspacePath: string,
    commitFiles: string[] = []
  ): Promise<MatchResult> {
    logger.debug(
      `Matching commit ${commit.shortSha} (${commitFiles.length} files) with ${sessions.length} sessions`
    );

    // Phase 1: Repository isolation filter
    const repoSessions = this.filterByRepository(sessions, workspacePath);
    logger.debug(
      `Phase 1: ${repoSessions.length} sessions match repository`
    );

    if (repoSessions.length === 0) {
      return {
        session: null,
        confidence_score: 0,
        match_details: null,
      };
    }

    // Phase 2: Time window filter
    const timeSessions = this.filterByTimeWindow(repoSessions, commit.timestamp);
    logger.debug(
      `Phase 2: ${timeSessions.length} sessions within time window`
    );

    if (timeSessions.length === 0) {
      return {
        session: null,
        confidence_score: 0,
        match_details: null,
      };
    }

    // Phase 3: Score all remaining sessions
    const scoredSessions = this.scoreAllSessions(
      commit,
      timeSessions,
      commitFiles
    );

    // Phase 4: Find best match above threshold
    const bestMatch = this.findBestMatch(scoredSessions);

    if (bestMatch && bestMatch.score >= this.confidenceThreshold) {
      logger.debug(
        `Match found: ${bestMatch.session.agent_type} (${(bestMatch.score * 100).toFixed(1)}%)`
      );
      return {
        session: bestMatch.session,
        confidence_score: bestMatch.score,
        match_details: bestMatch.details,
      };
    }

    logger.debug('No match found above confidence threshold');
    return {
      session: null,
      confidence_score: bestMatch?.score || 0,
      match_details: bestMatch?.details || null,
    };
  }

  /**
   * Phase 1: Filter sessions by repository/workspace path
   */
  private filterByRepository(
    sessions: Session[],
    workspacePath: string
  ): Session[] {
    const normalize = (path: string) =>
      path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();

    const normalizedWorkspace = normalize(workspacePath);

    return sessions.filter((session) => {
      const normalizedSession = normalize(session.workspace_path);
      return (
        normalizedSession === normalizedWorkspace ||
        normalizedSession.startsWith(normalizedWorkspace + '/') ||
        normalizedWorkspace.startsWith(normalizedSession + '/')
      );
    });
  }

  /**
   * Phase 2: Filter sessions by time window
   */
  private filterByTimeWindow(
    sessions: Session[],
    commitTime: Date
  ): Session[] {
    const windowMs = this.timeWindowHours * 60 * 60 * 1000;

    return sessions.filter((session) => {
      const timeDelta = Math.abs(
        commitTime.getTime() - session.timestamp.getTime()
      );
      return timeDelta <= windowMs;
    });
  }

  /**
   * Phase 3: Score all sessions
   */
  private scoreAllSessions(
    commit: CommitContext,
    sessions: Session[],
    commitFiles: string[]
  ): ScoredSession[] {
    return sessions.map((session) => {
      const details = calculateDetailedScore(
        commitFiles,
        commit.timestamp,
        session.referenced_files,
        session.timestamp,
        this.confidenceThreshold
      );

      return {
        session,
        score: details.final_score,
        details,
      };
    });
  }

  /**
   * Phase 4: Find best matching session
   */
  private findBestMatch(
    scoredSessions: ScoredSession[]
  ): ScoredSession | null {
    if (scoredSessions.length === 0) {
      return null;
    }

    // Sort by score (highest first)
    const sorted = scoredSessions.sort((a, b) => b.score - a.score);

    return sorted[0];
  }

  /**
   * Match multiple commits at once (batch operation)
   */
  async matchCommits(
    commits: CommitContext[],
    sessions: Session[],
    workspacePath: string
  ): Promise<Map<string, MatchResult>> {
    const results = new Map<string, MatchResult>();

    for (const commit of commits) {
      const result = await this.matchCommit(commit, sessions, workspacePath);
      results.set(commit.sha, result);
    }

    return results;
  }
}

/**
 * Scored session with confidence score
 */
interface ScoredSession {
  session: Session;
  score: number;
  details: ScoreDetails;
}

// Export singleton instance
export const matchingEngine = new MatchingEngine();
