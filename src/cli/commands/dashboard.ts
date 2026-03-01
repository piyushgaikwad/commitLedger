import { Command } from 'commander';
import { GitRepository } from '../../git/repo.js';
import { MetadataBranchManager } from '../../git/metadata-branch.js';
import { logger } from '../../utils/logger.js';
import { ensureGitRepository, handleCommandError } from '../utils.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export function createDashboardCommand(): Command {
  const command = new Command('dashboard');

  command
    .description('Generate and open an HTML dashboard for commits')
    .option('-b, --branch <name>', 'Show commits for specific branch', '')
    .option('-l, --limit <number>', 'Limit number of commits to show', '50')
    .option('-o, --output <path>', 'Output HTML file path', 'commitledger-dashboard.html')
    .option('--no-open', 'Do not automatically open the dashboard in browser')
    .action(async (options) => {
      try {
        await dashboardCommand(options);
      } catch (error) {
        handleCommandError(error, 'dashboard');
      }
    });

  return command;
}

interface CommitWithReceipt {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  timestamp: string;
  message: string;
  branch: string;
  aiAgent: string | null;
  confidence: number | null;
  filesChanged: number;
  insertions: number;
  deletions: number;
  hasChatSummary: boolean;
}

async function dashboardCommand(options: {
  branch: string;
  limit: string;
  output: string;
  open: boolean;
}): Promise<void> {
  const repo = new GitRepository();
  await ensureGitRepository(repo);
  const metadataBranch = new MetadataBranchManager(repo);

  logger.info('Generating dashboard...');

  // Get commits
  const limit = parseInt(options.limit, 10);
  const branch = options.branch || (await repo.getCurrentBranch());

  logger.info(`Fetching ${limit} commits from branch: ${branch}`);

  // Get commit log
  const git = repo.getGitInstance();
  const log = await git.log(['-n', limit.toString(), branch]);

  // Collect commit data with receipts and chat summaries
  const commits: CommitWithReceipt[] = [];
  const chatSummaries: Record<string, any> = {};

  for (const commit of log.all) {
    const receipt = await metadataBranch.retrieveReceipt(commit.hash);
    const chatSummary = await metadataBranch.retrieveChatSummary(commit.hash);
    const hasChatSummary = chatSummary !== null;

    if (chatSummary) {
      chatSummaries[commit.hash] = chatSummary;
    }

    commits.push({
      sha: commit.hash,
      shortSha: commit.hash.substring(0, 7),
      author: commit.author_name,
      email: commit.author_email,
      timestamp: commit.date,
      message: commit.message,
      branch: branch,
      aiAgent: receipt?.agent_metadata?.agent_type || null,
      confidence: receipt?.agent_metadata?.confidence_score || null,
      filesChanged: receipt?.diff_statistics.files_changed || 0,
      insertions: receipt?.diff_statistics.insertions || 0,
      deletions: receipt?.diff_statistics.deletions || 0,
      hasChatSummary: hasChatSummary,
    });
  }

  // Generate HTML
  const html = generateDashboardHTML(commits, chatSummaries, branch, await repo.getRepositoryRoot());

  // Write to file
  const outputPath = join(process.cwd(), options.output);
  await fs.writeFile(outputPath, html, 'utf8');

  logger.success(`Dashboard generated: ${outputPath}`);

  // Open in browser
  if (options.open) {
    try {
      const platform = process.platform;
      if (platform === 'darwin') {
        execSync(`open "${outputPath}"`);
      } else if (platform === 'win32') {
        execSync(`start "" "${outputPath}"`);
      } else {
        execSync(`xdg-open "${outputPath}"`);
      }
      logger.info('Opening dashboard in browser...');
    } catch (error) {
      logger.warn('Could not open browser automatically');
    }
  }
}

function generateDashboardHTML(
  commits: CommitWithReceipt[],
  chatSummaries: Record<string, any>,
  branch: string,
  repoPath: string
): string {
  const commitsJSON = JSON.stringify(commits, null, 2);
  const chatSummariesJSON = JSON.stringify(chatSummaries, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>commitLedger Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #000000;
      color: #e5e7eb;
      line-height: 1.5;
      min-height: 100vh;
      padding: 24px;
      font-weight: 400;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    .header {
      background: #0a0a0a;
      padding: 24px 32px;
      border-radius: 12px;
      margin-bottom: 24px;
      border: 1px solid #1f1f1f;
    }

    .header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }

    .header .subtitle {
      color: #6b7280;
      font-size: 0.875rem;
      font-weight: 400;
    }

    .header .subtitle strong {
      color: #9ca3af;
      font-weight: 500;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: #0a0a0a;
      padding: 16px 20px;
      border-radius: 10px;
      border: 1px solid #1f1f1f;
      transition: all 0.2s ease;
    }

    .stat-card:hover {
      border-color: #2a2a2a;
      background: #0f0f0f;
    }

    .stat-card .label {
      color: #6b7280;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }

    .stat-card .value {
      font-size: 1.875rem;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.02em;
    }

    .commits {
      background: #0a0a0a;
      border-radius: 12px;
      padding: 24px 28px;
      border: 1px solid #1f1f1f;
    }

    .commits h2 {
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: 20px;
      color: #ffffff;
      letter-spacing: -0.01em;
    }

    .commit-card {
      background: #050505;
      border: 1px solid #1a1a1a;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 10px;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    }

    .commit-card:hover {
      border-color: #2a2a2a;
      background: #0a0a0a;
    }

    .commit-card.ai-assisted::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: linear-gradient(180deg, #3b82f6 0%, #8b5cf6 100%);
    }

    .commit-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 16px;
    }

    .commit-info {
      flex: 1;
      min-width: 0;
    }

    .commit-sha {
      font-family: 'JetBrains Mono', 'SF Mono', 'Monaco', monospace;
      color: #6b7280;
      font-size: 0.75rem;
      margin-bottom: 6px;
      font-weight: 500;
    }

    .commit-message {
      color: #ffffff;
      font-size: 0.9375rem;
      font-weight: 500;
      margin-bottom: 8px;
      line-height: 1.4;
      letter-spacing: -0.01em;
    }

    .commit-meta {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      color: #6b7280;
      font-size: 0.8125rem;
    }

    .commit-meta-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .commit-meta-item svg {
      width: 14px;
      height: 14px;
      opacity: 0.6;
    }

    .ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 500;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .ai-badge.claude-code {
      background: rgba(139, 92, 246, 0.15);
      color: #a78bfa;
      border: 1px solid rgba(139, 92, 246, 0.25);
    }

    .ai-badge.cursor {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.25);
    }

    .ai-badge.human {
      background: rgba(107, 114, 128, 0.15);
      color: #9ca3af;
      border: 1px solid rgba(107, 114, 128, 0.2);
    }

    .ai-badge svg {
      width: 13px;
      height: 13px;
    }

    .stats-row {
      display: flex;
      gap: 12px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #1a1a1a;
    }

    .stat {
      font-size: 0.8125rem;
      color: #6b7280;
      font-weight: 400;
    }

    .stat strong {
      color: #9ca3af;
      font-weight: 500;
    }

    .stat.additions {
      color: #10b981;
    }

    .stat.additions strong {
      color: #34d399;
    }

    .stat.deletions {
      color: #ef4444;
    }

    .stat.deletions strong {
      color: #f87171;
    }

    .confidence {
      font-size: 0.6875rem;
      color: #6b7280;
      font-weight: 400;
    }

    .view-chat-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      font-size: 0.75rem;
      font-weight: 500;
      color: #60a5fa;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-top: 8px;
    }

    .view-chat-btn:hover {
      background: rgba(59, 130, 246, 0.15);
      border-color: rgba(59, 130, 246, 0.3);
    }

    .view-chat-btn svg {
      width: 12px;
      height: 12px;
    }

    /* Modal Styles */
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(4px);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .modal.active {
      display: flex;
    }

    .modal-content {
      background: #0a0a0a;
      border: 1px solid #1f1f1f;
      border-radius: 12px;
      max-width: 900px;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid #1f1f1f;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h3 {
      font-size: 1.125rem;
      font-weight: 600;
      color: #ffffff;
      letter-spacing: -0.01em;
    }

    .modal-close {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      font-size: 1.5rem;
      line-height: 1;
      padding: 4px 8px;
      transition: color 0.2s ease;
    }

    .modal-close:hover {
      color: #ffffff;
    }

    .modal-body {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .modal-body::-webkit-scrollbar {
      width: 8px;
    }

    .modal-body::-webkit-scrollbar-track {
      background: #0a0a0a;
    }

    .modal-body::-webkit-scrollbar-thumb {
      background: #2a2a2a;
      border-radius: 4px;
    }

    .modal-body::-webkit-scrollbar-thumb:hover {
      background: #3a3a3a;
    }

    .chat-section {
      margin-bottom: 24px;
    }

    .chat-section-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }

    .message {
      background: #050505;
      border: 1px solid #1a1a1a;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 12px;
    }

    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .message-role {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .message-role.user {
      color: #60a5fa;
    }

    .message-role.assistant {
      color: #a78bfa;
    }

    .message-time {
      font-size: 0.75rem;
      color: #6b7280;
      font-family: 'JetBrains Mono', monospace;
    }

    .message-content {
      color: #e5e7eb;
      font-size: 0.875rem;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .message-meta {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #1a1a1a;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .message-meta-item {
      margin-top: 4px;
    }

    .loading {
      text-align: center;
      color: #6b7280;
      padding: 40px;
      font-size: 0.875rem;
    }

    .error {
      text-align: center;
      color: #ef4444;
      padding: 40px;
      font-size: 0.875rem;
    }

    @media (max-width: 768px) {
      .header h1 {
        font-size: 2rem;
      }

      .commit-header {
        flex-direction: column;
      }

      .stats {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 commitLedger Dashboard</h1>
      <div class="subtitle">
        Repository: <strong>${repoPath}</strong> • Branch: <strong>${branch}</strong>
      </div>
    </div>

    <div class="stats" id="stats"></div>

    <div class="commits">
      <h2>📝 Recent Commits</h2>
      <div id="commits-container"></div>
    </div>
  </div>

  <!-- Chat Modal -->
  <div class="modal" id="chatModal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalTitle">AI Chat History</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body" id="modalBody">
        <div class="loading">Loading...</div>
      </div>
    </div>
  </div>

  <script>
    const commits = ${commitsJSON};
    const chatSummaries = ${chatSummariesJSON};

    // Calculate statistics
    const totalCommits = commits.length;
    const aiCommits = commits.filter(c => c.aiAgent).length;
    const humanCommits = totalCommits - aiCommits;
    const claudeCommits = commits.filter(c => c.aiAgent === 'claude-code').length;
    const cursorCommits = commits.filter(c => c.aiAgent === 'cursor').length;

    // Render statistics
    const statsContainer = document.getElementById('stats');
    statsContainer.innerHTML = \`
      <div class="stat-card">
        <div class="label">Total Commits</div>
        <div class="value">\${totalCommits}</div>
      </div>
      <div class="stat-card">
        <div class="label">AI-Assisted</div>
        <div class="value">\${aiCommits}</div>
      </div>
      <div class="stat-card">
        <div class="label">Human-Authored</div>
        <div class="value">\${humanCommits}</div>
      </div>
      <div class="stat-card">
        <div class="label">Claude Code</div>
        <div class="value">\${claudeCommits}</div>
      </div>
      <div class="stat-card">
        <div class="label">Cursor</div>
        <div class="value">\${cursorCommits}</div>
      </div>
    \`;

    // Render commits
    const commitsContainer = document.getElementById('commits-container');
    commits.forEach(commit => {
      const aiClass = commit.aiAgent ? 'ai-assisted' : '';
      const agentBadge = commit.aiAgent
        ? \`<div class="ai-badge \${commit.aiAgent}">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
               <path d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5z" />
             </svg>
             \${commit.aiAgent}
             \${commit.confidence ? \`<span class="confidence">(\${(commit.confidence * 100).toFixed(0)}%)</span>\` : ''}
           </div>\`
        : \`<div class="ai-badge human">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
               <path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd" />
             </svg>
             Human
           </div>\`;

      const date = new Date(commit.timestamp).toLocaleString();

      commitsContainer.innerHTML += \`
        <div class="commit-card \${aiClass}">
          <div class="commit-header">
            <div class="commit-info">
              <div class="commit-sha">\${commit.sha}</div>
              <div class="commit-message">\${commit.message}</div>
              <div class="commit-meta">
                <div class="commit-meta-item">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd" />
                  </svg>
                  \${commit.author}
                </div>
                <div class="commit-meta-item">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clip-rule="evenodd" />
                  </svg>
                  \${date}
                </div>
              </div>
            </div>
            \${agentBadge}
          </div>
          <div class="stats-row">
            <div class="stat"><strong>\${commit.filesChanged}</strong> files changed</div>
            <div class="stat additions"><strong>+\${commit.insertions}</strong> additions</div>
            <div class="stat deletions"><strong>-\${commit.deletions}</strong> deletions</div>
          </div>
          \${commit.hasChatSummary ? \`
            <button class="view-chat-btn" onclick="openChatModal('\${commit.sha}')">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path fill-rule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.678 3.348-3.97z" clip-rule="evenodd" />
              </svg>
              View Chat History
            </button>
          \` : ''}
        </div>
      \`;
    });

    // Modal functions
    function openChatModal(sha) {
      const modal = document.getElementById('chatModal');
      const modalTitle = document.getElementById('modalTitle');
      const modalBody = document.getElementById('modalBody');

      const commit = commits.find(c => c.sha === sha);
      const chatSummary = chatSummaries[sha];

      if (!chatSummary) {
        modalBody.innerHTML = '<div class="error">No chat history available</div>';
        return;
      }

      modalTitle.textContent = \`AI Chat History - \${commit.shortSha}\`;
      modalBody.innerHTML = renderChatSummary(chatSummary);
      modal.classList.add('active');
    }

    function closeModal() {
      const modal = document.getElementById('chatModal');
      modal.classList.remove('active');
    }

    function renderChatSummary(summary) {
      const { chat_data } = summary;

      // Filter out empty messages
      const validUserPrompts = chat_data.user_prompts.filter(p => p.content && p.content.trim());
      const validAssistantResponses = chat_data.assistant_responses.filter(r => r.content && r.content.trim());

      // Combine and sort messages by timestamp
      const allMessages = [
        ...validUserPrompts.map(p => ({ ...p, role: 'user' })),
        ...validAssistantResponses.map(r => ({ ...r, role: 'assistant' }))
      ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      if (allMessages.length === 0) {
        return '<div class="error">No chat messages available</div>';
      }

      let html = '';

      allMessages.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleString();
        const roleClass = msg.role === 'user' ? 'user' : 'assistant';
        const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';

        html += \`
          <div class="message">
            <div class="message-header">
              <div class="message-role \${roleClass}">\${roleLabel}</div>
              <div class="message-time">\${time}</div>
            </div>
            <div class="message-content">\${escapeHtml(msg.content)}</div>
            \${msg.tool_uses && msg.tool_uses.length > 0 ? \`
              <div class="message-meta">
                <div class="message-meta-item"><strong>Tools used:</strong> \${msg.tool_uses.join(', ')}</div>
              </div>
            \` : ''}
            \${msg.files_modified && msg.files_modified.length > 0 ? \`
              <div class="message-meta">
                <div class="message-meta-item"><strong>Files modified:</strong> \${msg.files_modified.length}</div>
                \${msg.files_modified.slice(0, 3).map(f => \`<div class="message-meta-item">  • \${f}</div>\`).join('')}
                \${msg.files_modified.length > 3 ? \`<div class="message-meta-item">  ... and \${msg.files_modified.length - 3} more</div>\` : ''}
              </div>
            \` : ''}
            \${msg.truncated ? '<div class="message-meta"><em>Content truncated</em></div>' : ''}
          </div>
        \`;
      });

      return html;
    }

    function escapeHtml(text) {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, m => map[m]);
    }

    // Close modal when clicking outside
    document.getElementById('chatModal').addEventListener('click', function(e) {
      if (e.target === this) {
        closeModal();
      }
    });

    // Close modal on Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeModal();
      }
    });
  </script>
</body>
</html>`;
}
