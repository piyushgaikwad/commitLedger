# commitLedger - Complete User Guide

## Table of Contents
- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands Reference](#commands-reference)
- [Common Workflows](#common-workflows)
- [Understanding Receipts](#understanding-receipts)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

---

## Overview

**commitLedger** is an AI Commit Ledger that tracks AI-assisted development by generating structured "AI Receipts" for each commit. It stores these receipts in a dedicated metadata branch (`ai/checkpoints/v1`) without polluting your development branches.

### Key Features
- 📋 **Automatic Receipt Generation** - Capture commit metadata automatically
- 🤖 **AI Detection** - Identify commits made with Claude Code, Cursor, or manually
- 🔒 **Local-First** - All data stays on your machine, zero cloud dependencies
- 🌳 **Git-Native** - Metadata stored in dedicated branch, never modifies history
- 🎨 **Beautiful CLI** - Colored terminal output with JSON export option
- ✅ **Works Everywhere** - Empty repos, existing repos, root commits - all supported

---

## Installation

### Option 1: Global Installation (Recommended)

```bash
# Clone the repository
git clone https://github.com/salesforce/commitLedger.git
cd commitLedger

# Install dependencies
npm install

# Build the project
npm run build

# Link globally
npm link

# Verify installation
commitledger --version
```

### Option 2: Local Installation

```bash
# Clone and build
git clone https://github.com/salesforce/commitLedger.git
cd commitLedger
npm install
npm run build

# Use with full path
./dist/index.mjs --version
```

### Option 3: Homebrew (Coming Soon)

```bash
brew tap salesforce/commitledger
brew install commitledger
```

---

## Quick Start

### 1. Initialize in Your Repository

```bash
# Navigate to your Git repository
cd /path/to/your/repo

# Initialize commitLedger
commitledger init
```

**Output:**
```
ℹ Initializing AI Commit Ledger...
ℹ Repository: /path/to/your/repo
ℹ Creating metadata branch: ai/checkpoints/v1
✓ Metadata branch 'ai/checkpoints/v1' created
✓ AI Commit Ledger initialized successfully!
```

### 2. Make Commits as Usual

```bash
# Make changes to your code
echo "Hello World" > README.md
git add README.md
git commit -m "Add README"
```

### 3. Capture Receipt

```bash
# Capture receipt for latest commit
commitledger capture HEAD

# Or capture for a specific commit
commitledger capture abc1234
```

**Output:**
```
ℹ Capturing receipt for commit HEAD...
ℹ Commit: abc1234 on main
ℹ Author: Your Name <your.email@example.com>
ℹ Files changed: 1, +10 -0
✓ Receipt captured for abc1234
ℹ No AI agent detected for this commit
```

### 4. View Receipt

```bash
# View receipt for latest commit
commitledger show HEAD

# View specific commit
commitledger show abc1234

# View as JSON
commitledger show abc1234 --json
```

---

## Commands Reference

### Global Options

```bash
commitledger [options] [command]

Options:
  -V, --version     Show version number
  -v, --verbose     Enable verbose logging (debug mode)
  -q, --quiet       Suppress non-error output
  -h, --help        Display help information
```

### `init` - Initialize Ledger

Initialize AI Commit Ledger in the current repository.

```bash
commitledger init [options]

Options:
  -b, --branch <name>    Custom metadata branch name (default: "ai/checkpoints/v1")

Examples:
  commitledger init
  commitledger init --branch custom-metadata-branch
```

**What it does:**
1. Creates an orphan branch `ai/checkpoints/v1` for metadata storage
2. Initializes the branch with README and checkpoints directory
3. Switches back to your working branch (or creates `main` if repo is empty)

**Branch Structure:**
```
ai/checkpoints/v1/
├── README.md          # Documentation
└── checkpoints/       # Receipt storage
    ├── <sha1>.json
    ├── <sha2>.json
    └── ...
```

---

### `capture` - Capture Receipt

Manually capture a receipt for a commit.

```bash
commitledger capture [sha] [options]

Arguments:
  sha                    Commit SHA (short or full), or HEAD (default: "HEAD")

Options:
  -f, --force           Overwrite existing receipt

Examples:
  commitledger capture                    # Capture latest commit
  commitledger capture HEAD               # Same as above
  commitledger capture abc1234            # Capture by short SHA
  commitledger capture abc1234...def5678  # Capture by full SHA
  commitledger capture HEAD --force       # Overwrite existing
```

**What it does:**
1. Resolves the commit SHA (if HEAD or branch name)
2. Extracts commit metadata (author, timestamp, message, etc.)
3. Calculates diff statistics (files changed, insertions, deletions)
4. Attempts to match with AI session data (Claude Code/Cursor)
5. Generates receipt with integrity hash
6. Stores receipt in metadata branch using Git plumbing commands

**Receipt Storage:**
- Stored as `checkpoints/<full-sha>.json` in metadata branch
- Never checks out metadata branch (uses Git plumbing)
- Safe to run even with uncommitted changes

---

### `show` - Display Receipt

Display a receipt for a commit with beautiful formatting.

```bash
commitledger show <sha> [options]

Arguments:
  sha                    Commit SHA (short/full), HEAD, or branch name

Options:
  --json                Output as JSON instead of formatted display

Examples:
  commitledger show HEAD              # Show latest commit
  commitledger show abc1234           # Show by short SHA
  commitledger show main              # Show tip of main branch
  commitledger show abc1234 --json    # JSON output
```

**Output Format (Pretty):**
```
═══════════════════════════════════════════
         AI COMMIT RECEIPT
═══════════════════════════════════════════

📋 Commit Information
  SHA:       abc1234567890abcdef...
  Short SHA: abc1234
  Branch:    main
  Author:    Jane Doe <jane@example.com>
  Date:      2/27/2026, 10:30:00 AM
  Message:   Add user authentication

👤 Human-Authored
  No AI agent detected for this commit

📊 Changes
  Files Changed: 5
  Insertions:    +120
  Deletions:     -30

  Changed Files:
    • src/auth.ts
    • src/login.ts
    • tests/auth.test.ts

🔒 Integrity
  Version:        1.0
  Generated At:   2/27/2026, 10:30:45 AM
  Integrity Hash: 44d9fc020beac938...
```

**Output Format (JSON):**
```json
{
  "version": "1.0",
  "commit_metadata": {
    "sha": "abc1234567890abcdef...",
    "branch": "main",
    "author": "Jane Doe",
    "email": "jane@example.com",
    "timestamp": "2026-02-27T10:30:00.000Z",
    "message": "Add user authentication"
  },
  "agent_metadata": null,
  "diff_statistics": {
    "files_changed": 5,
    "insertions": 120,
    "deletions": 30,
    "changed_files": ["src/auth.ts", "src/login.ts", "tests/auth.test.ts"]
  },
  "verification_status": {},
  "integrity_hash": "44d9fc020beac938...",
  "generated_at": "2026-02-27T10:30:45.000Z"
}
```

---

## Common Workflows

### Workflow 1: Fresh Empty Repository

```bash
# Create new repository
mkdir my-project && cd my-project
git init

# Initialize commitLedger
commitledger init
# ✓ Creates ai/checkpoints/v1 branch
# ✓ Switches to main branch for you

# Make your first commit
echo "# My Project" > README.md
git add README.md
git commit -m "Initial commit"

# Capture receipt
commitledger capture HEAD

# View receipt
commitledger show HEAD
```

---

### Workflow 2: Existing Repository

```bash
# Navigate to existing repo
cd /path/to/existing/repo

# Initialize commitLedger
commitledger init

# Work normally, capture receipts for important commits
git add .
git commit -m "Add new feature"
commitledger capture HEAD

# View receipt
commitledger show HEAD
```

---

### Workflow 3: Bulk Capture (Multiple Commits)

```bash
# Capture receipts for last 5 commits
for sha in $(git log -5 --format=%H); do
  commitledger capture $sha
done

# View all captured receipts
for sha in $(git log -5 --format=%h); do
  echo "=== Commit $sha ==="
  commitledger show $sha --json | jq '.commit_metadata.message'
done
```

---

### Workflow 4: Checking Receipts Before Push

```bash
# See which commits have receipts
git log --oneline -10

# Check specific commits
commitledger show abc1234
commitledger show def5678

# Verify receipts exist
for sha in $(git log origin/main..HEAD --format=%H); do
  if commitledger show $sha 2>/dev/null; then
    echo "✓ Receipt exists for $sha"
  else
    echo "✗ No receipt for $sha"
    commitledger capture $sha
  fi
done
```

---

## Understanding Receipts

### Receipt Structure

Each receipt contains:

1. **Version** - Schema version (currently `1.0`)
2. **Commit Metadata** - Standard Git commit information
3. **Agent Metadata** - AI tool detection (coming in Phase 2)
4. **Diff Statistics** - Files changed, lines added/removed
5. **Verification Status** - Policy checks (coming in Phase 5)
6. **Integrity Hash** - SHA-256 hash for tamper detection
7. **Generated At** - Timestamp when receipt was created

### Receipt Integrity

Receipts include an integrity hash to detect tampering:

```javascript
// Integrity hash calculation
const receiptWithoutHash = { ...receipt };
delete receiptWithoutHash.integrity_hash;
const hash = SHA256(JSON.stringify(receiptWithoutHash, Object.keys(receiptWithoutHash).sort()));
```

To verify integrity:
```bash
# Get receipt
commitledger show abc1234 --json > receipt.json

# Verify hash matches (integrity check built-in)
# If receipt is valid, it displays without errors
commitledger show abc1234
```

---

## Troubleshooting

### Issue: Command Not Found

```bash
commitledger: command not found
```

**Solution:**
```bash
# Re-link the global command
cd /path/to/commitLedger
npm link

# Or use full path
/path/to/commitLedger/dist/index.mjs --version
```

---

### Issue: Metadata Branch Already Exists

```bash
⚠ Metadata branch 'ai/checkpoints/v1' already exists. Skipping initialization.
```

**Solution:** This is normal. The branch was already created. You can continue using commitLedger.

---

### Issue: No Receipt Found

```bash
✗ No receipt found for commit abc1234
```

**Solution:**
```bash
# Capture the receipt first
commitledger capture abc1234

# Then view it
commitledger show abc1234
```

---

### Issue: Failed to Get Diff Summary

```bash
⚠ Failed to get diff summary for HEAD: Error: fatal: ambiguous argument 'HEAD^'
```

**Solution:** This happens for root commits (first commit with no parent). This is expected and handled automatically. The receipt will show 0 changes, but you can still capture it.

---

### Issue: Working Tree Changes During Init

If you have uncommitted changes during `init`:

```bash
ℹ Initializing AI Commit Ledger...
# Changes are automatically stashed
✓ Metadata branch 'ai/checkpoints/v1' created
# Changes are automatically restored
```

**No action needed** - commitLedger handles this automatically.

---

## Advanced Usage

### Viewing Metadata Branch Directly

```bash
# List all receipts in metadata branch
git show ai/checkpoints/v1:checkpoints/

# View specific receipt file
git show ai/checkpoints/v1:checkpoints/<full-sha>.json

# Checkout metadata branch (not recommended)
git checkout ai/checkpoints/v1
ls checkpoints/
git checkout main  # Switch back
```

---

### Using with Git Aliases

Add to your `~/.gitconfig`:

```ini
[alias]
  cl-init = !commitledger init
  cl-capture = !commitledger capture HEAD
  cl-show = !commitledger show HEAD
  cl-recap = !commitledger show HEAD --json | jq '{message: .commit_metadata.message, files: .diff_statistics.files_changed}'
```

Usage:
```bash
git cl-init
git cl-capture
git cl-show
git cl-recap
```

---

### Scripting with JSON Output

```bash
# Extract commit message from receipt
commitledger show abc1234 --json | jq -r '.commit_metadata.message'

# Get files changed
commitledger show abc1234 --json | jq -r '.diff_statistics.changed_files[]'

# Count total changes
commitledger show abc1234 --json | jq '.diff_statistics.insertions + .diff_statistics.deletions'

# Check if AI-assisted
commitledger show abc1234 --json | jq -r 'if .agent_metadata != null then "AI-assisted" else "Human" end'
```

---

### Batch Operations

**Capture all commits on a branch:**
```bash
#!/bin/bash
# capture-branch.sh
BRANCH=${1:-main}
for sha in $(git log $BRANCH --format=%H); do
  echo "Capturing $sha..."
  commitledger capture $sha
done
```

**Export all receipts:**
```bash
#!/bin/bash
# export-receipts.sh
mkdir -p receipts-export
for sha in $(git log --format=%H); do
  commitledger show $sha --json > receipts-export/$sha.json 2>/dev/null || true
done
echo "Exported to receipts-export/"
```

---

## What's Coming Next

### Phase 2: Session Ingestion & Matching (Upcoming)
- Automatic AI agent detection (Claude Code, Cursor)
- Session matching algorithm
- Confidence scoring
- No manual capture needed!

### Phase 3: Additional Commands (Upcoming)
- `commitledger list` - List all AI-assisted commits
- `commitledger query` - Search receipts by date, author, agent
- `commitledger stats` - Aggregate statistics and charts

### Phase 4: Automation (Upcoming)
- `commitledger install-hooks` - Auto-capture on every commit
- `commitledger uninstall-hooks` - Remove hooks
- Post-commit hook integration

### Phase 5: Dashboard & Policy (Upcoming)
- `commitledger dashboard` - Local web UI with visualizations
- Policy engine for governance
- Pre-push hooks with compliance checks
- PRISM integration

---

## FAQ

**Q: Does commitLedger modify my Git history?**
A: No. It stores receipts in a separate metadata branch (`ai/checkpoints/v1`) that never touches your development branches.

**Q: Can I delete the metadata branch?**
A: Yes, but you'll lose all receipts. Simply run `git branch -D ai/checkpoints/v1`. You can re-initialize anytime with `commitledger init`.

**Q: Do receipts slow down my repository?**
A: No. Receipts are small JSON files (~1KB each) stored in a separate branch. They don't affect checkout, merge, or commit performance.

**Q: Can I use this with existing repositories?**
A: Yes! Run `commitledger init` in any Git repository, old or new.

**Q: How do I uninstall?**
A:
```bash
# Remove global command
npm unlink -g @salesforce/commitledger

# Optionally delete metadata branch
git branch -D ai/checkpoints/v1
```

**Q: Is my data sent to the cloud?**
A: No. commitLedger is 100% local-first. No data is ever sent to external servers.

**Q: Can I customize the metadata branch name?**
A: Yes! Use `commitledger init --branch custom-name`.

---

## Support & Contribution

- **Issues**: Report bugs at [GitHub Issues](https://github.com/salesforce/commitLedger/issues)
- **Documentation**: [README.md](README.md)
- **Architecture**: [docs/architecture.md](docs/architecture.md)

---

**Built with ❤️ by Piyush Gaikwad @ Salesforce**
