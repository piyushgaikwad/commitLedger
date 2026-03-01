# Confidence Scoring Algorithm

This document explains how commitLedger calculates the confidence score for AI-assisted commits.

## Overview

The confidence score indicates how certain we are that an AI agent (like Claude Code) contributed to a commit. It's calculated using a **weighted scoring algorithm** that combines two factors:

```
Final Confidence = (File Overlap × 70%) + (Temporal Proximity × 30%)
```

**Threshold**: 60% (0.6)
- **≥ 60%**: Commit classified as AI-assisted ✅
- **< 60%**: Commit classified as human-authored ❌

---

## Scoring Components

### 1. File Overlap Score (70% weight)

**What it measures**: Percentage of commit files that appear in the AI agent's session

**Formula**:
```
File Overlap = (Files in both commit AND session) / (Total files in commit)
```

**Why it matters**: If the AI agent touched the same files that were committed, it's a strong indicator the AI helped write the code.

**Example**:
```
Commit changed:
├── src/app.ts       ✓ (in Claude session)
├── src/utils.ts     ✓ (in Claude session)
└── README.md        ✗ (not in Claude session)

Claude session files:
├── src/app.ts       (Read, Edit)
├── src/utils.ts     (Write)
└── package.json     (Read)

Calculation:
Overlapping files: 2 (app.ts, utils.ts)
Total commit files: 3
File Overlap Score = 2 / 3 = 0.67 (67%)
```

**Implementation**: [src/matching/scoring.ts](src/matching/scoring.ts#L95-L112)

---

### 2. Temporal Proximity Score (30% weight)

**What it measures**: How close in time the commit was made to the AI session activity

**Formula**: Exponential decay function
```
Temporal Score = e^(-timeDelta / halfLife)

Where:
- timeDelta = minutes between commit and last session activity
- halfLife = 30 minutes (time when score drops to 50%)
- e = Euler's number (2.71828...)
```

**Why it matters**: Commits made soon after AI session activity are more likely to be AI-assisted. The score decays exponentially over time.

**Score by Time Gap**:
| Time Gap | Temporal Score | Interpretation |
|----------|---------------|----------------|
| 0 min | 100% | Just now |
| 5 min | 85% | Very recent |
| 10 min | 72% | Recent |
| 15 min | 61% | Fairly recent |
| 30 min | 50% | Half-life point |
| 45 min | 42% | Getting old |
| 60 min | 25% | Old |
| 90 min | 13% | Very old |
| 120 min | 6% | Too old |
| > 6 hours | 0% | Outside time window (filtered out) |

**Time Window**: Only sessions within the last **6 hours** are considered. Older sessions are filtered out before scoring.

**Implementation**: [src/matching/scoring.ts](src/matching/scoring.ts#L46-L60)

---

## Combined Scoring Examples

### Example 1: High Confidence (96%)

**Scenario**: All commit files from recent Claude session

```
Commit Details:
- Time: 2:30 PM
- Files: src/app.ts, src/utils.ts, src/types.ts

Claude Session:
- Time: 2:25 PM (5 minutes ago)
- Files touched: src/app.ts, src/utils.ts, src/types.ts, package.json

Calculation:
File Overlap = 3 overlapping / 3 total = 1.00 (100%)
Temporal Score = e^(-5/30) = 0.85 (85%)

Final Confidence = (1.00 × 0.70) + (0.85 × 0.30)
                 = 0.70 + 0.26
                 = 0.96 (96%) ✅

Result: AI-assisted commit detected
```

---

### Example 2: Medium Confidence (51%)

**Scenario**: Partial file overlap, commit made an hour later

```
Commit Details:
- Time: 3:00 PM
- Files: src/app.ts, src/config.ts, README.md

Claude Session:
- Time: 2:00 PM (60 minutes ago)
- Files touched: src/app.ts, src/config.ts, src/utils.ts

Calculation:
File Overlap = 2 overlapping / 3 total = 0.67 (67%)
Temporal Score = e^(-60/30) = 0.14 (14%)

Final Confidence = (0.67 × 0.70) + (0.14 × 0.30)
                 = 0.47 + 0.04
                 = 0.51 (51%) ❌

Result: Below threshold, human-authored commit
```

---

### Example 3: Low Confidence (15%)

**Scenario**: Files not touched by Claude

```
Commit Details:
- Time: 4:00 PM
- Files: docs/guide.md, LICENSE

Claude Session:
- Time: 3:30 PM (30 minutes ago)
- Files touched: src/app.ts, src/utils.ts

Calculation:
File Overlap = 0 overlapping / 2 total = 0.00 (0%)
Temporal Score = e^(-30/30) = 0.50 (50%)

Final Confidence = (0.00 × 0.70) + (0.50 × 0.30)
                 = 0.00 + 0.15
                 = 0.15 (15%) ❌

Result: Below threshold, human-authored commit
```

---

### Example 4: Perfect Confidence (100%)

**Scenario**: All files, immediate commit

```
Commit Details:
- Time: 2:00:30 PM
- Files: src/feature.ts

Claude Session:
- Time: 2:00:00 PM (30 seconds ago)
- Files touched: src/feature.ts

Calculation:
File Overlap = 1 overlapping / 1 total = 1.00 (100%)
Temporal Score = e^(-0.5/30) = 0.98 (98%)

Final Confidence = (1.00 × 0.70) + (0.98 × 0.30)
                 = 0.70 + 0.29
                 = 0.99 (99%) ✅

Result: AI-assisted commit detected
```

---

## Matching Process

The confidence calculation happens in 4 phases:

### Phase 1: Repository Isolation Filter
Only sessions from the same repository/workspace are considered.

```typescript
sessions = sessions.filter(s =>
  s.workspace_path === commitWorkspacePath
);
```

### Phase 2: Time Window Filter
Only sessions within the last 6 hours are considered.

```typescript
sessions = sessions.filter(s =>
  Math.abs(s.timestamp - commitTime) <= 6 hours
);
```

### Phase 3: Score All Sessions
Calculate confidence score for each remaining session.

```typescript
for (session of sessions) {
  fileScore = calculateFileOverlap(commitFiles, session.files);
  temporalScore = calculateTemporalProximity(commitTime, session.time);
  confidence = (fileScore × 0.7) + (temporalScore × 0.3);
}
```

### Phase 4: Find Best Match
Select the session with the highest confidence score.

```typescript
bestMatch = sessions.sort((a, b) => b.confidence - a.confidence)[0];

if (bestMatch.confidence >= 0.6) {
  return { agent: bestMatch.agent, confidence: bestMatch.confidence };
} else {
  return { agent: null, confidence: 0 }; // Human-authored
}
```

**Implementation**: [src/matching/engine.ts](src/matching/engine.ts)

---

## Real-World Examples

From actual commitLedger repository commits:

### ✅ High Confidence Detections

```
Commit: e7569a9 (feat: Implement Git hooks infrastructure)
Files: 6 changed (hooks.ts, install-hooks.ts, uninstall-hooks.ts, etc.)
Session: 4d197e77-b5de-4492-9a8c-d9ed84387ddc
Confidence: 99.8%
Reason: All 6 files touched by Claude, committed immediately after edits
```

```
Commit: 0f3a3cc (feat: Fix AI detection)
Files: 5 changed (claude-code.ts, scoring.ts, engine.ts, etc.)
Session: 4d197e77-b5de-4492-9a8c-d9ed84387ddc
Confidence: 99.9%
Reason: All 5 files touched by Claude, active session
```

```
Commit: 3168c86 (fix: Pass commit files to matching engine)
Files: 3 changed (capture.ts, orchestrator.ts, engine.ts)
Session: 4d197e77-b5de-4492-9a8c-d9ed84387ddc
Confidence: 88.3%
Reason: All 3 files touched by Claude, good temporal proximity
```

### ❌ No Detection (Human-Authored)

```
Commit: 1ea8c65 (Test: Adding test file)
Files: 1 changed (test.txt)
Session: None matched
Confidence: < 60%
Reason: File never touched by Claude in any recent session
```

---

## Design Rationale

### Why These Weights?

**File Overlap (70%)**:
- Most reliable indicator of AI contribution
- If AI touched the exact files committed, it likely helped write the code
- More important than timing

**Temporal Proximity (30%)**:
- Supports file overlap evidence
- Developers may commit hours after AI session
- Less reliable alone (developer could be working on same files independently)

### Why 60% Threshold?

**Precision vs Recall Trade-off**:
- **Higher threshold (70%)**: Fewer false positives, but miss some AI commits
- **Lower threshold (50%)**: Catch more AI commits, but more false positives
- **60% (current)**: Balanced approach

**60% means**:
- Pure file overlap approach: Need ≥86% file overlap (0.86 × 0.7 = 0.60)
- With good timing (50% temporal): Need ≥71% file overlap (0.71 × 0.7 + 0.5 × 0.3 = 0.65)
- With perfect timing (100% temporal): Need ≥43% file overlap (0.43 × 0.7 + 1.0 × 0.3 = 0.60)

### Why 6-Hour Time Window?

- Covers a typical coding session
- Developer might commit at end of day after morning Claude session
- Balances recall (catching AI commits) with precision (avoiding old unrelated sessions)
- Can be configured via `MatchingOptions.timeWindowHours`

### Why 30-Minute Half-Life?

- Commits are often made within minutes of AI assistance
- 30 minutes feels natural for "recent activity"
- After 30 minutes, temporal score drops to 50% (still significant with good file overlap)
- After 90 minutes, temporal score ~13% (relies heavily on file overlap)

---

## Factors That Increase Confidence

✅ **All commit files touched by AI** → High file overlap (70% of score)
✅ **Commit made immediately after AI session** → High temporal score (30% of score)
✅ **Active AI session in same workspace** → Passes repository filter
✅ **Recent session activity** → Within 6-hour window
✅ **Single focused commit** → All files from one session

---

## Factors That Decrease Confidence

❌ **Files not in AI session** → Low file overlap
❌ **Commit hours after session ended** → Low temporal score
❌ **Partial file overlap** → Some files AI, some manual
❌ **Old sessions** → Outside 6-hour window (filtered out)
❌ **Mixed authorship** → Some files from AI, others not

---

## Configuration

Confidence scoring can be customized via `MatchingOptions`:

```typescript
const matchingEngine = new MatchingEngine({
  confidenceThreshold: 0.6,    // Default: 60%
  timeWindowHours: 6,           // Default: 6 hours
  fileWeight: 0.7,              // Default: 70%
  temporalWeight: 0.3           // Default: 30%
});
```

---

## Interpreting Confidence Scores

| Range | Interpretation | Meaning |
|-------|---------------|---------|
| **90-100%** | Very High | All/most files from AI, very recent activity |
| **80-90%** | High | Most files from AI, recent activity |
| **70-80%** | Good | Good file overlap, reasonable timing |
| **60-70%** | Moderate | Minimum confidence, likely AI-assisted |
| **50-60%** | Low | Below threshold, likely human (borderline) |
| **< 50%** | Very Low | Clearly human-authored |

---

## Debugging Confidence Scores

Use verbose mode to see detailed scoring:

```bash
commitledger capture HEAD --verbose
```

Output shows:
```
⋯ Session 4d197e77: files=1.00, temporal=0.61, final=0.88, overlapping=3/3
```

Breaking down `files=1.00, temporal=0.61, final=0.88`:
- `files=1.00`: 100% file overlap (all commit files in session)
- `temporal=0.61`: 61% temporal score (~25 min ago)
- `final=0.88`: 88% final confidence
- `overlapping=3/3`: 3 overlapping files out of 3 total

---

## Source Code

**Confidence Calculation**:
- [src/matching/scoring.ts](src/matching/scoring.ts) - Scoring algorithms
- [src/matching/engine.ts](src/matching/engine.ts) - Matching engine

**Key Functions**:
- `calculateFileOverlapPercentage()` - File overlap calculation
- `calculateTemporalScore()` - Temporal proximity calculation
- `calculateConfidenceScore()` - Combined confidence score
- `calculateDetailedScore()` - Full score with details

---

## Future Improvements

Potential enhancements to confidence scoring:

1. **Commit message similarity**: Compare commit message to AI session prompts
2. **Code similarity**: Analyze if committed code matches AI-generated code style
3. **Multiple sessions**: Handle cases where multiple AI tools were used
4. **Author-specific learning**: Adjust weights based on developer patterns
5. **Test results**: Factor in whether tests passed/failed
6. **Code review feedback**: Adjust confidence based on review comments

---

**Last Updated**: February 27, 2026
**Version**: 0.1.0
