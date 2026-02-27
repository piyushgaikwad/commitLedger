/**
 * Scoring algorithms for matching commits to AI sessions
 */

/**
 * Calculate Jaccard similarity between two sets of files
 * Jaccard = |intersection| / |union|
 */
export function calculateJaccardSimilarity(
  filesA: string[],
  filesB: string[]
): number {
  if (filesA.length === 0 && filesB.length === 0) {
    return 1.0; // Both empty, perfect match
  }

  if (filesA.length === 0 || filesB.length === 0) {
    return 0.0; // One empty, no match
  }

  // Normalize file paths for comparison
  const normalize = (path: string) =>
    path.replace(/\\/g, '/').toLowerCase().trim();

  const setA = new Set(filesA.map(normalize));
  const setB = new Set(filesB.map(normalize));

  // Calculate intersection
  const intersection = new Set([...setA].filter((x) => setB.has(x)));

  // Calculate union
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Calculate temporal proximity score
 * Uses exponential decay: closer timestamps = higher score
 *
 * Score = e^(-timeDelta / halfLife)
 * where:
 * - timeDelta is absolute time difference in minutes
 * - halfLife is the time (in minutes) where score drops to 0.5
 */
export function calculateTemporalScore(
  commitTime: Date,
  sessionTime: Date,
  halfLifeMinutes: number = 30
): number {
  const timeDeltaMs = Math.abs(
    commitTime.getTime() - sessionTime.getTime()
  );
  const timeDeltaMinutes = timeDeltaMs / (1000 * 60);

  // Exponential decay function
  const score = Math.exp(-timeDeltaMinutes / halfLifeMinutes);

  return Math.max(0, Math.min(1, score)); // Clamp between 0 and 1
}

/**
 * Calculate combined confidence score
 *
 * Formula: fileScore * fileWeight + temporalScore * temporalWeight
 *
 * Default weights:
 * - File overlap: 70% (more important)
 * - Temporal proximity: 30% (less important)
 */
export function calculateConfidenceScore(
  fileScore: number,
  temporalScore: number,
  fileWeight: number = 0.7,
  temporalWeight: number = 0.3
): number {
  const score = fileScore * fileWeight + temporalScore * temporalWeight;
  return Math.max(0, Math.min(1, score)); // Clamp between 0 and 1
}

/**
 * Check if a score meets the confidence threshold
 */
export function meetsConfidenceThreshold(
  score: number,
  threshold: number = 0.6
): boolean {
  return score >= threshold;
}

/**
 * Calculate file overlap percentage
 * Returns the percentage of commit files that appear in session files
 */
export function calculateFileOverlapPercentage(
  commitFiles: string[],
  sessionFiles: string[]
): number {
  if (commitFiles.length === 0) {
    return 0.0;
  }

  const normalize = (path: string) =>
    path.replace(/\\/g, '/').toLowerCase().trim();

  const commitSet = new Set(commitFiles.map(normalize));
  const sessionSet = new Set(sessionFiles.map(normalize));

  const overlapping = [...commitSet].filter((f) => sessionSet.has(f));

  return overlapping.length / commitFiles.length;
}

/**
 * Score details for debugging and logging
 */
export interface ScoreDetails {
  file_overlap_score: number;
  temporal_score: number;
  final_score: number;
  file_weight: number;
  temporal_weight: number;
  threshold: number;
  meets_threshold: boolean;
  overlapping_files?: string[];
  time_delta_minutes?: number;
}

/**
 * Calculate detailed score with all components
 */
export function calculateDetailedScore(
  commitFiles: string[],
  commitTime: Date,
  sessionFiles: string[],
  sessionTime: Date,
  threshold: number = 0.6
): ScoreDetails {
  // Calculate component scores
  const fileScore = calculateJaccardSimilarity(commitFiles, sessionFiles);
  const temporalScore = calculateTemporalScore(commitTime, sessionTime);
  const finalScore = calculateConfidenceScore(fileScore, temporalScore);

  // Calculate time delta
  const timeDeltaMs = Math.abs(commitTime.getTime() - sessionTime.getTime());
  const timeDeltaMinutes = timeDeltaMs / (1000 * 60);

  // Find overlapping files
  const normalize = (path: string) =>
    path.replace(/\\/g, '/').toLowerCase().trim();
  const commitSet = new Set(commitFiles.map(normalize));
  const sessionSet = new Set(sessionFiles.map(normalize));
  const overlappingFiles = [...commitSet].filter((f) => sessionSet.has(f));

  return {
    file_overlap_score: fileScore,
    temporal_score: temporalScore,
    final_score: finalScore,
    file_weight: 0.7,
    temporal_weight: 0.3,
    threshold,
    meets_threshold: meetsConfidenceThreshold(finalScore, threshold),
    overlapping_files: overlappingFiles,
    time_delta_minutes: timeDeltaMinutes,
  };
}
