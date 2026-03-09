# AI Commit Ledger

> A local-first, Git-native CLI tool that generates structured "AI Receipts" for each commit, tracking AI-assisted development.

## Overview

AI Commit Ledger addresses the traceability and governance gap in AI-assisted development. As developers increasingly use AI tools like Claude Code and Cursor Agent, there's no standardized way to capture which commits were AI-generated, what prompts led to changes, or whether governance policies were followed.

This tool provides a local-first solution that generates structured "AI Receipts" for each commit and stores them in a dedicated metadata branch (`ai/checkpoints/v1`) without polluting development branches.

## Key Features

- **Automatic Receipt Generation**: Post-commit hooks capture AI activity
- **Multi-Agent Support**: Claude Code and Cursor Agent detection
- **Local-First**: All data stays on your machine, zero cloud dependencies
- **Git-Native**: Metadata stored in dedicated branch, never modifies history
- **CLI + Web UI**: Terminal commands and local dashboard visualization
- **Governance Ready**: Policy enforcement and compliance tracking

## Use Cases

1. **Team-level AI adoption visibility** - Track % of AI-assisted commits, breakdown by tool
2. **Human vs AI attribution** - Know which commits were AI-generated at a glance
3. **Enhanced PR reviews** - Provide context to reviewers (PRISM integration ready)
4. **Incident investigation** - Understand AI intent and assumptions behind changes
5. **AI governance enforcement** - Policy compliance for sensitive paths

### Manual Installation (Clone & Build)

```bash
# Clone the repository
git clone https://github.com/salesforce/commitLedger.git
cd commitLedger

# Install dependencies
npm install

# Build the project
npm run build

# Add to your PATH by editing ~/.zshrc
echo 'export PATH="$PATH:/path/to/commitLedger/dist"' >> ~/.zshrc

# Reload your shell configuration
source ~/.zshrc
```

**Note**: Replace `/path/to/commitLedger` with the actual path where you cloned the repository.

### Verify Installation

```bash
commitledger --version
```

## Quick Start

```bash
# Navigate to your Git repository
cd /path/to/your/repo

# Initialize AI Commit Ledger
commitledger init

# Install Git hooks
commitledger install-hooks

# Make commits as usual - receipts are captured automatically!
```

## Commands

```bash
commitledger init                    # Initialize ledger in current repo
commitledger capture [sha]           # Manually capture receipt for commit
commitledger show <sha>              # Display receipt for commit
commitledger list [options]          # List AI-assisted commits
commitledger query [filters]         # Search receipts by date, agent, files
commitledger dashboard               # Launch local web UI
commitledger stats                   # Show aggregate statistics
commitledger install-hooks           # Install Git hooks
commitledger uninstall-hooks         # Remove Git hooks
commitledger export [format]         # Export receipts (JSON/CSV)
```

## Configuration

Create a `.commitledgerrc.json` file in your repository or home directory:

```json
{
  "metadata_branch": "ai/checkpoints/v1",
  "confidence_threshold": 0.6,
  "session_paths": {
    "claude_code": "~/.claude/",
    "cursor": "~/.cursor/"
  },
  "receipt_format": "json",
  "include_markdown": true,
  "policies": {
    "require_tests_for_ai": false,
    "sensitive_paths": ["src/auth/", "src/security/"]
  },
  "ui": {
    "port": 3000,
    "auto_open": true
  }
}
```

## Receipt Schema

Each commit receipt contains:

- **Commit Metadata**: SHA, branch, author, timestamp, message
- **Agent Metadata**: AI tool used, session ID, confidence score
- **Diff Statistics**: Files changed, insertions, deletions
- **Verification Status**: Tests run, policies checked
- **Integrity Hash**: SHA-256 of receipt content

Example:

```json
{
  "version": "1.0",
  "commit_metadata": {
    "sha": "abc123...",
    "branch": "main",
    "author": "Jane Doe",
    "email": "jane@example.com",
    "timestamp": "2024-03-15T10:30:00Z",
    "message": "Add user authentication"
  },
  "agent_metadata": {
    "agent_type": "claude-code",
    "session_id": "session-xyz",
    "confidence_score": 0.95
  },
  "diff_statistics": {
    "files_changed": 5,
    "insertions": 120,
    "deletions": 30,
    "changed_files": ["src/auth.ts", "src/login.ts"]
  }
}
```

## CommitLedger Working

1) ![CmmitLedger UI](<Screenshot 2026-03-09 at 11.04.02 AM.png>)


## Development

```bash
# Clone the repository
git clone https://github.com/salesforce/commitLedger.git
cd commitLedger

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run coverage

# Build for production
npm run build
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed architectural design.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

