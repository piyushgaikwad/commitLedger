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
  sessions: number;
  tokens: number | null;
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

  // Get user name for greeting
  let userName = 'Developer';
  try {
    const git = repo.getGitInstance();
    const userConfig = await git.getConfig('user.name');
    if (userConfig.value) {
      userName = userConfig.value;
    }
  } catch (error) {
    // Use default if git config not available
  }

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

    // Extract session and token data from chat summary
    const sessions = chatSummary ? 1 : 0;
    const tokens = chatSummary?.chat_data?.token_usage?.total_tokens || null;

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
      sessions: sessions,
      tokens: tokens,
    });
  }

  // Generate HTML
  const html = generateDashboardHTML(commits, chatSummaries, branch, await repo.getRepositoryRoot(), userName);

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
  repoPath: string,
  userName: string
): string {
  const commitsJSON = JSON.stringify(commits, null, 2);
  const chatSummariesJSON = JSON.stringify(chatSummaries, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>commitLedger Dashboard</title>
  <style>
    :root{
      /* darker + blackish */
      --bg0:#05070a;
      --bg1:#070a0f;
      --bg2:#0a0f16;

      --glass: rgba(255,255,255,.04);
      --glass2: rgba(255,255,255,.03);
      --stroke: rgba(255,255,255,.08);
      --stroke2: rgba(255,255,255,.06);

      --text:#d7dee8;
      --muted:#97a7bb;
      --muted2:#6f8299;

      --green:#22c55e;
      --red:#ef4444;
      --amber:#f59e0b;

      --shadow: 0 30px 90px rgba(0,0,0,.75);
      --r1: 22px;
      --r2: 18px;
    }

    *{ box-sizing:border-box; }

    html, body{
      height: 100%;
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      color: var(--text);
      background:
        radial-gradient(1200px 700px at 35% -10%, rgba(110,140,200,.14), transparent 55%),
        radial-gradient(900px 600px at 70% -15%, rgba(160,120,220,.10), transparent 60%),
        radial-gradient(1200px 900px at 50% 110%, rgba(0,0,0,.65), transparent 60%),
        linear-gradient(180deg, var(--bg0), var(--bg1) 55%, var(--bg2));
      overflow: hidden;
    }

    /* subtle vignette */
    body::before{
      content:"";
      position:fixed; inset:0;
      background:
        radial-gradient(1200px 900px at 50% 45%, transparent 45%, rgba(0,0,0,.65) 78%, rgba(0,0,0,.9) 100%);
      pointer-events:none;
      mix-blend-mode: multiply;
    }

    .shell{
      height: 100%;
      padding: 22px;
      display:flex;
    }

    .app{
      width: 100%;
      height: 100%;
      border-radius: 28px;
      background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: var(--shadow);
      overflow:hidden;
      position:relative;
    }

    .app::after{
      content:"";
      position:absolute; inset:0;
      border-radius: 28px;
      pointer-events:none;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
    }

    .topbar{
      height: 0px;
      padding: 0px;
      display:none;
    }

    .main{
      height: 100%;
      display:grid;
      grid-template-columns: 78px 1fr;
    }

    .sidebar{
      padding: 0;
      border-right: none;
      background: transparent;
      display:flex;
      flex-direction:column;
      align-items:center;
      gap: 12px;
    }
    .nav{
      width:48px; height:48px;
      border-radius: 18px;
      display:grid;
      place-items:center;
      border: 1px solid rgba(255,255,255,.06);
      background: rgba(255,255,255,.02);
      color: var(--muted);
      cursor:pointer;
    }
    .nav.active{
      border-color: rgba(124,92,255,.35);
      background: rgba(124,92,255,.10);
      color: #e6e1ff;
    }
    .nav:hover{ background: rgba(255,255,255,.04); color: var(--text); }

    .content{
      padding: 20px;
      background: linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.16));
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,.12) transparent;
    }
    .content::-webkit-scrollbar{ width: 10px; }
    .content::-webkit-scrollbar-thumb{
      background: rgba(255,255,255,.10);
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: content-box;
    }

    .hero{
      display:flex;
      align-items:flex-end;
      justify-content:space-between;
      gap:16px;
      margin-bottom: 20px;
    }
    .h1{
      font-size:28px;
      font-weight:650;
      letter-spacing:-.02em;
      color: var(--text);
    }
    .h1 span{
      color: var(--muted);
    }
    .subtitle{
      margin-top:6px;
      font-size:12px;
      color: var(--muted);
    }

    .grid-4{
      display:grid;
      gap:12px;
      grid-template-columns: repeat(4, 1fr);
      margin-bottom: 16px;
    }
    @media (max-width: 1000px){
      .grid-4{grid-template-columns: repeat(2, 1fr)}
      .hero{flex-direction:column; align-items:flex-start}
    }
    @media (max-width: 560px){
      .grid-4{grid-template-columns: 1fr}
    }

    .card{
      background: var(--glass);
      border:1px solid var(--stroke);
      border-radius: 14px;
      box-shadow: 0 0 0 1px rgba(255,255,255,.06);
    }
    .card-inner{
      padding:14px;
    }
    .kicker{
      font-size:10px;
      letter-spacing:.22em;
      text-transform:uppercase;
      color: rgba(255,255,255,.60);
    }
    .big{
      margin-top:8px;
      font-size:28px;
      font-weight:650;
      color: var(--text);
    }
    .small{
      margin-top:4px;
      font-size:11px;
      color: var(--muted);
    }

    .section-header{
      margin-bottom: 12px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding: 12px 16px;
      background: var(--glass);
      border:1px solid var(--stroke);
      border-radius: 14px;
      box-shadow: 0 0 0 1px rgba(255,255,255,.06);
    }
    .section-header .left{
      display:flex;
      align-items:center;
      gap: 12px;
    }
    .section-title{
      font-size:11px;
      letter-spacing:.22em;
      text-transform:uppercase;
      color: rgba(255,255,255,.60);
    }
    .repo-info{
      font-size:13px;
      color: var(--text);
      font-weight: 600;
    }
    .repo-info .sep{
      color: var(--muted2);
      margin: 0 8px;
    }
    .branch-info{
      display:flex;
      align-items:center;
      gap: 6px;
      font-size:13px;
      color: var(--text);
      font-weight: 600;
    }
    .branch-info svg{
      width: 12px;
      height: 12px;
      opacity: .7;
      margin-right: 2px;
    }

    .list-section{
      margin-top: 0px;
    }
    .list{
      height: auto;
      min-height: 300px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.07);
      background: rgba(255,255,255,.02);
      overflow:auto;
    }

    .row{
      display:flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding: 14px 16px;
      border-top: 1px solid rgba(255,255,255,.06);
    }
    .row:first-child{ border-top:none; }
    .row:hover{ background: rgba(255,255,255,.03); }

    .row > div:first-child{
      flex: 1;
      min-width: 0;
    }

    .title{
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .meta{
      display:flex;
      align-items:center;
      flex-wrap:wrap;
      gap: 8px;
      color: var(--muted);
      font-size: 11px;
    }
    .dot{ opacity:.6; }

    .hash{
      display:inline-flex;
      align-items:center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(255,255,255,.03);
      border: 1px solid rgba(255,255,255,.09);
      color: var(--muted);
      font-size: 10px;
    }
    .hash svg{
      width: 12px;
      height: 12px;
    }

    .chip{
      display:inline-flex;
      align-items:center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .chip.claude-code{
      background: rgba(255,138,61,.10);
      border: 1px solid rgba(255,138,61,.28);
      color: #ffb380;
    }
    .chip.cursor{
      background: rgba(59,130,246,.10);
      border: 1px solid rgba(59,130,246,.28);
      color: #60a5fa;
    }
    .chip.human{
      background: rgba(165,206,0,.10);
      border: 1px solid rgba(165,206,0,.28);
      color: #A5CE00;
    }
    .chip .b{
      width:6px;height:6px;border-radius:999px;
    }
    .chip.claude-code .b{ background: rgba(255,138,61,.95); }
    .chip.cursor .b{ background: rgba(59,130,246,.95); }
    .chip.human .b{ background: rgba(165,206,0,.95); }

    .rstats{
      display:flex;
      flex-direction:column;
      align-items:flex-end;
      justify-content:flex-start;
      gap: 6px;
      flex-shrink: 0;
    }
    .diff{
      display:flex;
      gap: 10px;
      align-items:center;
      font-size: 11px;
      color: var(--muted);
    }
    .plus{ color: var(--green); font-weight: 700; }
    .minus{ color: var(--red); font-weight: 700; }
    .files{ color: var(--muted); }

    .sub{
      font-size: 12px;
      color: var(--muted);
      display:flex;
      gap: 10px;
      align-items:center;
    }
    .sep{ opacity:.5; }

    .view-chat-btn{
      display:inline-flex;
      align-items:center;
      gap: 5px;
      padding: 5px 9px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 500;
      color: #60a5fa;
      background: rgba(59,130,246,.10);
      border: 1px solid rgba(59,130,246,.25);
      cursor:pointer;
      transition: all 0.2s ease;
      margin-top: 6px;
    }
    .view-chat-btn:hover{
      background: rgba(59,130,246,.15);
      border-color: rgba(59,130,246,.35);
    }
    .view-chat-btn svg{
      width: 11px;
      height: 11px;
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
      background: var(--bg1);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 22px;
      max-width: 900px;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow);
    }

    .modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid rgba(255,255,255,.06);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015));
    }

    .modal-header h3 {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.01em;
    }

    .modal-close {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 1.5rem;
      line-height: 1;
      padding: 4px 8px;
      transition: color 0.2s ease;
    }

    .modal-close:hover {
      color: var(--text);
    }

    .modal-body {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .modal-body::-webkit-scrollbar {
      width: 10px;
    }

    .modal-body::-webkit-scrollbar-track {
      background: transparent;
    }

    .modal-body::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,.10);
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: content-box;
    }

    .message {
      background: rgba(0,0,0,.20);
      border: 1px solid rgba(255,255,255,.06);
      border-radius: 12px;
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
      color: var(--muted2);
      font-family: 'SF Mono', Monaco, monospace;
    }

    .message-content {
      color: var(--text);
      font-size: 0.875rem;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .message-meta {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,.06);
      font-size: 0.75rem;
      color: var(--muted);
    }

    .message-meta-item {
      margin-top: 4px;
    }

    .loading {
      text-align: center;
      color: var(--muted);
      padding: 40px;
      font-size: 0.875rem;
    }

    .error {
      text-align: center;
      color: var(--red);
      padding: 40px;
      font-size: 0.875rem;
    }

    @media (max-width: 900px){
      .shell{ padding: 12px; }
      .row{ flex-direction: column; }
      .rstats{ align-items:flex-start; }
      .main{ grid-template-columns: 68px 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="app">
      <div class="main">
        <aside class="sidebar">
        </aside>

        <section class="content">
          <div class="hero">
            <div>
              <div class="h1">Good day, <span>${userName}</span></div>
              <div class="subtitle">Here's an overview of your recent activity</div>
            </div>
          </div>

          <section class="grid-4" id="stats-grid"></section>

          <div class="section-header">
            <div class="left">
              <div class="section-title">Repository Root: </div>
              <div class="repo-info">
                ${repoPath.split('/').slice(-2).join(' <span class="sep">/</span> ')}
              </div>
              <span class="dot" style="margin: 0 8px; opacity: .6;">•</span>
              <div class="section-title">Branch: </div>
              <div class="branch-info">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M7 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm10 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM7 9a1 1 0 0 1 1 1v2c0 2.76 2.24 5 5 5h2a1 1 0 1 1 0 2h-2c-3.87 0-7-3.13-7-7v-2a1 1 0 0 1 1-1Z"
                    fill="currentColor"/>
                </svg>
                ${branch}
              </div>
            </div>
          </div>

          <section class="list-section card">
            <div class="list" id="list"></div>
          </section>
        </section>
      </div>
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

    function esc(s){
      return String(s)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }

    function formatDate(timestamp){
      const now = new Date();
      const date = new Date(timestamp);
      const diffMs = now - date;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'today';
      if (diffDays === 1) return 'yesterday';
      if (diffDays < 7) return diffDays + 'd ago';
      if (diffDays < 30) return Math.floor(diffDays / 7) + 'w ago';
      if (diffDays < 365) return Math.floor(diffDays / 30) + 'mo ago';
      return Math.floor(diffDays / 365) + 'y ago';
    }

    function row(commit){
      const agentClass = commit.aiAgent ? commit.aiAgent : 'human';
      const agentLabel = commit.aiAgent === 'claude-code' ? 'Claude Code' :
                         commit.aiAgent === 'cursor' ? 'Cursor' : 'Human';
      const confidenceText = commit.confidence ? \` \${(commit.confidence * 100).toFixed(0)}%\` : '';

      // Format tokens display
      let tokensDisplay = 'N/A';
      if (commit.tokens) {
        if (commit.tokens < 1000) {
          tokensDisplay = \`\${commit.tokens} tokens\`;
        } else {
          tokensDisplay = \`\${(commit.tokens / 1000).toFixed(1)}k tokens\`;
        }
      }

      return \`
        <div class="row">
          <div>
            <div class="title">\${esc(commit.message)}</div>
            <div class="meta">
              <span class="hash">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 7a4 4 0 1 0 0 8h6a4 4 0 1 0 0-8H9Z" stroke="rgba(215,222,232,.55)" stroke-width="2"/>
                </svg>
                \${esc(commit.shortSha)}
              </span>
              <span class="dot">•</span>
              <span>\${formatDate(commit.timestamp)}</span>
              <span class="dot">•</span>
              <span>\${esc(commit.author)}</span>
              <span class="chip \${agentClass}">
                <span class="b"></span>\${agentLabel}\${confidenceText}
              </span>
            </div>
            \${commit.hasChatSummary ? \`
              <button class="view-chat-btn" onclick="openChatModal('\${commit.sha}')">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path fill-rule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.678 3.348-3.97z" clip-rule="evenodd" />
                </svg>
                View Chat
              </button>
            \` : ''}
          </div>

          <div class="rstats">
            <div class="diff">
              <span class="plus">+\${commit.insertions}</span>
              <span class="minus">-\${commit.deletions}</span>
              <span class="files">\${commit.filesChanged} file\${commit.filesChanged !== 1 ? 's' : ''}</span>
            </div>
            <div class="sub">
              <span>\${commit.sessions} session\${commit.sessions !== 1 ? 's' : ''}</span>
              <span class="sep">·</span>
              <span>\${tokensDisplay}</span>
            </div>
          </div>
        </div>
      \`;
    }

    function renderStats(){
      const totalCommits = commits.length;
      const humanCommits = commits.filter(c => !c.aiAgent).length;
      const claudeCommits = commits.filter(c => c.aiAgent === 'claude-code').length;
      const cursorCommits = commits.filter(c => c.aiAgent === 'cursor').length;

      const statsGrid = document.getElementById('stats-grid');
      statsGrid.innerHTML = \`
        <div class="card">
          <div class="card-inner">
            <div class="kicker">Total Commits</div>
            <div class="big">\${totalCommits}</div>
            <div class="small">All commits analyzed</div>
          </div>
        </div>
        <div class="card">
          <div class="card-inner">
            <div class="kicker">Human Commits</div>
            <div class="big">\${humanCommits}</div>
            <div class="small">Manually authored</div>
          </div>
        </div>
        <div class="card">
          <div class="card-inner">
            <div class="kicker">Claude Commits</div>
            <div class="big">\${claudeCommits}</div>
            <div class="small">Claude Code assisted</div>
          </div>
        </div>
        <div class="card">
          <div class="card-inner">
            <div class="kicker">Cursor Commits</div>
            <div class="big">\${cursorCommits}</div>
            <div class="small">Cursor AI assisted</div>
          </div>
        </div>
      \`;
    }

    function render(){
      const list = document.getElementById('list');
      list.innerHTML = commits.map(row).join('');
    }

    renderStats();
    render();

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
