# Phase 2: Status & Next Steps

## ✅ What's Complete

### 1. Core Infrastructure
- ✅ Session type definitions
- ✅ Matching engine with 4-phase algorithm
- ✅ Scoring algorithms (Jaccard similarity, temporal proximity)
- ✅ Session orchestrator with caching
- ✅ AI detection integrated into capture command
- ✅ Confidence threshold evaluation (0.6 default)

### 2. File Structure
```
src/ingestion/
├── types.ts           ✅ Complete
├── orchestrator.ts    ✅ Complete (with caching)
├── claude-code.ts     ⚠️  Needs update for JSONL format
└── cursor.ts          ⚠️  Placeholder (research needed)

src/matching/
├── scoring.ts         ✅ Complete
└── engine.ts          ✅ Complete

src/cli/commands/
└── capture.ts         ✅ Updated with AI detection
```

---

## 🔧 What Needs Fixing

### 1. Claude Code Parser (HIGH PRIORITY)

**Current Issue:** Parser expects JSON files in `conversations/` directory, but actual format is JSONL files directly in project directory.

**Actual Format:**
```
~/.claude/projects/<project-name>/
├── <session-id>.jsonl    # JSONL format (one JSON object per line)
├── <session-id>.jsonl
└── <session-id>/         # Session directory (purpose unclear)
```

**JSONL Event Types:**
- `tool_use` - Tool invocations with file paths
- `text` - Text content
- `user` - User messages
- `thinking` - Assistant thinking
- `bash_progress` - Bash command progress
- `file-history-snapshot` - File state snapshots

**Tool Names in Events:**
- `Bash` (80 uses)
- `Write` (32 uses) - has `input.file_path`
- `Edit` (19 uses) - has `input.file_path`
- `Read` (13 uses) - has `input.file_path`
- `TodoWrite` (18 uses)
- `Task`, `EnterPlanMode`, `ExitPlanMode`, `AskUserQuestion`

**Event Structure:**
```json
{
  "type": "tool_use",
  "cwd": "/Users/piyush.gaikwad/dev/commitLedger",
  "sessionId": "4d197e77-b5de-4492-9a8c-d9ed84387ddc",
  "message": {
    "content": [
      {
        "type": "tool_use",
        "name": "Write",
        "input": {
          "file_path": "/path/to/file.ts",
          "content": "..."
        }
      }
    ]
  }
}
```

**Required Changes:**
1. Read `.jsonl` files instead of looking for `conversations/` directory
2. Parse JSONL format (one JSON per line)
3. Filter for `tool_use` type events
4. Extract `cwd` as workspace path
5. Extract file paths from `Read`, `Write`, `Edit` tool inputs
6. Use `sessionId` as session identifier
7. Get timestamp from event timestamps

**Implementation:**
```typescript
// Parse JSONL file
const lines = content.split('\n').filter(l => l.trim());
for (const line of lines) {
  const event = JSON.parse(line);

  if (event.type === 'tool_use') {
    // Extract workspace
    workspace = event.cwd || workspace;

    // Extract files
    for (const toolUse of event.message?.content || []) {
      if (['Read', 'Write', 'Edit'].includes(toolUse.name)) {
        const filePath = toolUse.input?.file_path;
        if (filePath) {
          files.add(filePath);
        }
      }
    }
  }
}
```

---

### 2. Cursor Parser (MEDIUM PRIORITY)

**Status:** Placeholder implementation

**Needs:**
1. Research Cursor's session storage location
2. Determine session file format
3. Implement parser similar to Claude Code

**Likely Locations:**
- macOS: `~/Library/Application Support/Cursor`
- Linux: `~/.config/Cursor`
- Windows: `%APPDATA%/Cursor`

---

## 📋 Remaining Tasks

### Immediate (Week 3)
1. **Fix Claude Code Parser** (1-2 days)
   - Update to read JSONL files
   - Extract file paths from tool uses
   - Test with actual session data

2. **Test AI Detection** (1 day)
   - Make commits while Claude Code is running
   - Verify detection works
   - Test confidence scoring
   - Validate file matching

3. **Build & Verify** (1 day)
   - Run full test suite
   - Test in real repository
   - Document findings

### Short Term (Week 4)
4. **Git Hooks** (2 days)
   - Create post-commit hook template
   - Implement install-hooks command
   - Implement uninstall-hooks command
   - Test hook preservation

5. **List Command** (2 days)
   - Implement list command with filters
   - Show AI badges (🤖 vs 👤)
   - Add formatting and colors
   - Support JSON output

6. **Query Command** (1 day)
   - Implement filtering by date, author, agent
   - Add file pattern matching
   - Min confidence filtering

---

## 🧪 Testing Plan

### Unit Tests Needed
- [ ] Claude Code JSONL parser
- [ ] Scoring algorithms (Jaccard, temporal)
- [ ] Matching engine phases
- [ ] Session orchestrator caching

### Integration Tests Needed
- [ ] End-to-end: commit → detect → store → retrieve
- [ ] Multiple sessions with overlapping files
- [ ] Edge cases (no sessions, low confidence)
- [ ] Hook installation/uninstallation

### Manual Testing
```bash
# 1. Make a commit with Claude Code running
echo "test" > test.txt
git add test.txt
git commit -m "Test AI detection"

# 2. Capture receipt
commitledger capture HEAD --verbose

# 3. Verify detection
commitledger show HEAD

# Expected: Should show Claude Code with confidence > 60%
```

---

## 📊 Current Detection Rate

**With Current Parser:** 0% (parser not finding sessions due to format mismatch)

**After Fix (Expected):** 70-90% for commits made during active Claude Code sessions

---

## 🎯 Success Criteria for Phase 2

- [x] Session ingestion infrastructure
- [x] Matching engine with scoring
- [x] Confidence threshold evaluation
- [ ] Claude Code detection working (>60% confidence)
- [ ] Cursor placeholder (can skip for MVP)
- [ ] Post-commit hook auto-capture
- [ ] List command with AI badges
- [ ] Query command with filters

---

## 📝 Quick Fix Instructions

### To Fix Claude Code Parser:

1. Edit `src/ingestion/claude-code.ts`
2. Replace `parseProjectSessions` method:
   - Look for `*.jsonl` files in project root (not `conversations/`)
   - Parse JSONL format (split by line, JSON.parse each)
   - Filter for `type: "tool_use"` events
   - Extract `cwd` as workspace
   - Extract file paths from `Read`/`Write`/`Edit` tool inputs

3. Test:
   ```bash
   npm run build
   commitledger capture HEAD --verbose
   ```

4. Should see: "Parsed N Claude Code sessions"

---

## 🚀 Next Commands to Implement

After detection is working:

### `install-hooks`
```bash
commitledger install-hooks
# Installs post-commit hook
# Preserves existing hooks
```

### `list`
```bash
commitledger list
# Shows:
# 🤖 abc1234 (Claude Code, 89%) - Add feature
# 👤 def5678 (Human) - Fix typo
# 🤖 ghi9012 (Cursor, 76%) - Refactor

commitledger list --ai-only
commitledger list --agent claude-code
commitledger list -n 20
```

### `query`
```bash
commitledger query --from 2026-01-01
commitledger query --author "Jane Doe"
commitledger query --files "src/**/*.ts"
commitledger query --min-confidence 0.8
```

---

## 💡 Tips

1. **Debug AI Detection:**
   ```bash
   commitledger capture HEAD --verbose
   # Check logs for:
   # - "Parsed N Claude Code sessions"
   # - "Found N recent AI sessions"
   # - File overlap scores
   ```

2. **Manually Check Sessions:**
   ```bash
   ls ~/.claude/projects/
   ls ~/.claude/projects/<your-project>/
   cat ~/.claude/projects/<your-project>/<session-id>.jsonl | head -20
   ```

3. **Test Matching:**
   - Make a commit that changes files
   - Check if those files appear in recent Claude Code tool uses
   - Verify temporal proximity (commit within 6 hours of session)

---

Last Updated: Feb 27, 2026 12:30 PM
Status: 80% Complete (Core done, parser needs fix, commands pending)
