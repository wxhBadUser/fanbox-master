/* eslint-disable */
'use strict';
// Mobile-Reframe-R2 Screenshot Smoke
//
// Captures 390x844 screenshots for the R2 reframed mobile UI:
//   01-sidebar-project-memory.png
//   02-project-expanded-sessions.png
//   03-chat-empty-state.png
//   04-project-overview.png
//   05-chat-session-detail.png
//   06-chat-draft-detail.png
//   07-file-drawer-open.png
//   08-file-preview.png
//   09-new-chat-no-project-warning.png
//   10-followup-disabled-reason.png
//
// Uses fixture desktop project memory (Claude/Codex session logs) to simulate
// real projects: fanbox-master, docs, 光子多任务去噪, paseo-main, 去噪.

const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const EDGE_PROFILE = path.join(os.tmpdir(), 'fanbox-r2-edge-profile-' + Date.now());
fs.mkdirSync(EDGE_PROFILE, { recursive: true });
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-r2-shots-' + Date.now());
fs.mkdirSync(TMP_HOME, { recursive: true });
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME;
process.env.FANBOX_MOBILE_DIR = path.join(TMP_HOME, '.fanbox', 'mobile');
process.env.FANBOX_WECHAT_DIR = path.join(TMP_HOME, '.fanbox', 'wechat');
process.env.FANBOX_SESSIONS_DIR = path.join(TMP_HOME, '.fanbox', 'sessions');
process.env.MOBILE_AGENT_FORCE_STUB = '1';
fs.mkdirSync(process.env.FANBOX_MOBILE_DIR, { recursive: true });
fs.mkdirSync(process.env.FANBOX_WECHAT_DIR, { recursive: true });
fs.mkdirSync(process.env.FANBOX_SESSIONS_DIR, { recursive: true });

// R2: Create fixture desktop project memory (Claude + Codex session logs)
// This is the SAME source-of-truth that server.js agentProjects() reads.
const CLAUDE_PROJ_DIR = path.join(TMP_HOME, '.claude', 'projects');
const CODEX_SESS_DIR = path.join(TMP_HOME, '.codex', 'sessions');
fs.mkdirSync(CLAUDE_PROJ_DIR, { recursive: true });
fs.mkdirSync(CODEX_SESS_DIR, { recursive: true });

// Fixture projects with real cwds (must exist as directories for stat check)
const fixtureProjects = [
  { name: 'fanbox-master', cwd: path.join(TMP_HOME, 'fanbox-master'), agent: 'claude' },
  { name: 'docs', cwd: path.join(TMP_HOME, 'docs'), agent: 'claude' },
  { name: '光子多任务去噪', cwd: path.join(TMP_HOME, '光子多任务去噪'), agent: 'codex' },
  { name: 'paseo-main', cwd: path.join(TMP_HOME, 'paseo-main'), agent: 'claude' },
  { name: '去噪', cwd: path.join(TMP_HOME, '去噪'), agent: 'codex' },
];

// Create project directories
for (const p of fixtureProjects) {
  fs.mkdirSync(p.cwd, { recursive: true });
  // Create a marker file so the directory is not empty
  fs.writeFileSync(path.join(p.cwd, 'README.md'), '# ' + p.name + '\n\nFixture project for R2 screenshot smoke.\n', 'utf8');
}

// Helper: munge cwd to Claude Code project dir name (same as server.js mungeClaudeDir)
function mungeClaudeDir(cwd) {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

// Create fixture Claude session logs
const now = Date.now();
for (const p of fixtureProjects) {
  if (p.agent !== 'claude') continue;
  const projDir = path.join(CLAUDE_PROJ_DIR, mungeClaudeDir(p.cwd));
  fs.mkdirSync(projDir, { recursive: true });
  // Create 2 session files per project
  for (let i = 0; i < 2; i++) {
    const sessionId = p.name + '-claude-session-' + i + '-' + (now - i * 3600000);
    const fp = path.join(projDir, sessionId + '.jsonl');
    const content = [
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'Working on ' + p.name + ' task ' + i },
        timestamp: new Date(now - i * 3600000 - 60000).toISOString(),
        cwd: p.cwd,
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: 'tu_' + i,
            name: 'Write',
            input: { file_path: path.join(p.cwd, 'file_' + i + '.js') },
          }],
        },
        timestamp: new Date(now - i * 3600000 - 30000).toISOString(),
      }),
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'Done with task ' + i },
        timestamp: new Date(now - i * 3600000).toISOString(),
        isMeta: false,
      }),
    ].join('\n') + '\n';
    fs.writeFileSync(fp, content, 'utf8');
    // Set mtime to simulate recent activity
    const st = fs.statSync(fp);
    const mtime = (now - i * 3600000) / 1000;
    fs.utimesSync(fp, st.atime, mtime);
  }
}

// Create fixture Codex session logs
for (const p of fixtureProjects) {
  if (p.agent !== 'codex') continue;
  const sessDir = path.join(CODEX_SESS_DIR, p.name);
  fs.mkdirSync(sessDir, { recursive: true });
  for (let i = 0; i < 2; i++) {
    const sessionId = 'rollout-2026-01-01T00-00-00-' + p.name + '-' + i;
    const fp = path.join(sessDir, sessionId + '.jsonl');
    const content = [
      JSON.stringify({
        type: 'session_meta',
        id: p.name + '-codex-' + i,
        cwd: p.cwd,
        timestamp: new Date(now - i * 7200000).toISOString(),
      }),
      JSON.stringify({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Codex task for ' + p.name + ' #' + i }],
        timestamp: new Date(now - i * 7200000).toISOString(),
      }),
    ].join('\n') + '\n';
    fs.writeFileSync(fp, content, 'utf8');
    const st = fs.statSync(fp);
    const mtime = (now - i * 7200000) / 1000;
    fs.utimesSync(fp, st.atime, mtime);
  }
}

const mobile = require(path.join(__dirname, '..', '..', 'electron', 'mobile.js'));
const TEST_PORT = 14712;

function request(opts, body) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: TEST_PORT, ...opts }, (res) => {
      let buf = '';
      res.on('data', (chunk) => { buf += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: buf }));
    });
    req.on('error', (e) => resolve({ status: 0, error: String(e), body: '' }));
    if (body) req.write(body);
    req.end();
  });
}
function asJson(r) { try { return JSON.parse(r.body); } catch { return null; } }

const results = [];
function check(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: extra || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (extra ? ' :: ' + extra : ''));
}

async function setupTestServer() {
  mobile.setDesktopTerminalWriteProvider({
    sendInput: async () => ({ ok: true, accepted: true })
  });
  const mockTermId = 'mock-term-1';
  const testCwd = fixtureProjects[0].cwd; // fanbox-master
  mobile.setDesktopTerminalProvider(() => [
    {
      id: mockTermId, cwd: testCwd, proc: 'claude', busy: true, lastActiveAt: Date.now(),
      tail: '\u001b[32m\u2713 Building...\u001b[0m\nDone\n',
      events: [
        { type: 'output_tail', text: 'Running tests...', timestamp: Date.now() - 5000 },
        { type: 'status_change', text: 'running', status: 'running', timestamp: Date.now() - 4000 },
      ]
    }
  ]);

  await mobile.saveConfig({ enabled: true });
  const server = mobile.startMobileServer({ port: TEST_PORT });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise(r => setTimeout(r, 20));
  if (!server.listening) throw new Error('test server failed to listen');

  // Pair device (full scopes)
  const pair = await mobile.startPairCode();
  const pairRes = await request({
    path: '/api/mobile/pair/confirm', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ pairCode: pair.pairCode, deviceName: 'R2 Screenshot Phone' }));
  const pairData = asJson(pairRes);
  if (!pairData || !pairData.token) throw new Error('pair failed: ' + pairRes.body);
  const token = pairData.token;
  const deviceId = pairData.deviceId;

  if (deviceId && typeof mobile.updateToken === 'function') {
    const hash = mobile.sha256(token);
    await mobile.updateToken(hash, (rec) => {
      rec.scopes = ['read:status', 'read:files', 'session:start', 'desktop_control'];
      return rec;
    });
  }

  // Pair second device (limited scopes - NO desktop_control)
  const pair2 = await mobile.startPairCode();
  const pairRes2 = await request({
    path: '/api/mobile/pair/confirm', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ pairCode: pair2.pairCode, deviceName: 'R2 Limited Phone' }));
  const pairData2 = asJson(pairRes2);
  const token2 = pairData2.token;
  const deviceId2 = pairData2.deviceId;
  if (deviceId2 && typeof mobile.updateToken === 'function') {
    const hash2 = mobile.sha256(token2);
    await mobile.updateToken(hash2, (rec) => {
      rec.scopes = ['read:status', 'read:files', 'session:start'];
      return rec;
    });
  }

  const auth = { 'Authorization': 'Bearer ' + token };
  const auth2 = { 'Authorization': 'Bearer ' + token2 };

  // Verify fixture project memory is loaded
  const pmRes = await request({ path: '/api/mobile/project-memory', headers: auth });
  const pmData = asJson(pmRes);
  check('fixture project-memory returns ok', pmData && pmData.ok === true, JSON.stringify(pmData).slice(0, 200));
  check('fixture project-memory has items', pmData && Array.isArray(pmData.items) && pmData.items.length > 0, 'items=' + (pmData ? pmData.items.length : 0));
  if (pmData && pmData.items) {
    const names = pmData.items.map(p => p.name);
    check('fixture includes fanbox-master', names.includes('fanbox-master'), names.join(','));
    check('fixture does NOT include C: drive', !names.some(n => /^[A-Z]:?$/.test(n)), names.join(','));
  }

  // Seed a draft session for screenshot 06
  const draftRes = await request({
    path: '/api/mobile/sessions/draft', method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  }, JSON.stringify({ cwd: testCwd, agentId: 'claude', title: 'R2 Draft Task', initialMessage: 'test draft for screenshot' }));
  const draftData = asJson(draftRes);
  const draftSessionId = draftData && draftData.session ? draftData.session.id : null;

  // Create a test file for file drawer screenshot
  const testFile = path.join(testCwd, 'R2-test-file.txt');
  fs.writeFileSync(testFile, 'R2 test file content\nLine 2\nLine 3\n', 'utf8');

  return { server, token, token2, deviceId, deviceId2, auth, auth2, draftSessionId, testCwd };
}

async function main() {
  console.log('Mobile-Reframe-R2 Screenshot Smoke');
  console.log('TMP_HOME=' + TMP_HOME);
  console.log('SCREENSHOT_DIR=' + SCREENSHOT_DIR);

  const ctx = await setupTestServer();
  console.log('test server listening on ' + TEST_PORT);
  console.log('draft session: ' + ctx.draftSessionId);

  let browserCtx;
  try {
    browserCtx = await chromium.launchPersistentContext(EDGE_PROFILE, {
      executablePath: EDGE_PATH,
      viewport: { width: 390, height: 844 },
      headless: true,
      args: ['--disable-extensions', '--no-sandbox'],
    });
  } catch (e) {
    console.error('Cannot launch Edge:', e.message);
    console.error('Install playwright-core: npm install playwright-core');
    await new Promise(r => ctx.server.close(r));
    process.exit(1);
  }

  const page = await browserCtx.newPage();
  const baseUrl = 'http://127.0.0.1:' + TEST_PORT;

  // Inject token into localStorage before page load
  await page.addInitScript((token) => {
    try {
      localStorage.setItem('fanbox_mobile_token', token);
      localStorage.setItem('fanbox_mobile_paired', '1');
    } catch (e) { /* ignore */ }
  }, ctx.token);

  // Shot 1: Sidebar with project memory
  console.log('\n[Shot 1: sidebar-project-memory]');
  await page.goto(baseUrl + '/mobile', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  // Open sidebar
  await page.evaluate(() => {
    const menu = document.getElementById('app-menu');
    if (menu) menu.click();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-sidebar-project-memory.png') });
  check('01-sidebar-project-memory.png captured', fs.existsSync(path.join(SCREENSHOT_DIR, '01-sidebar-project-memory.png')));

  // Verify sidebar has project memory (not drive roots)
  const sidebarText = await page.evaluate(() => {
    const el = document.getElementById('sb-projects-list');
    return el ? el.textContent : '';
  });
  check('sidebar shows fanbox-master', sidebarText.includes('fanbox-master'), sidebarText.slice(0, 100));
  check('sidebar does NOT show C: drive', !sidebarText.match(/\bC:?\b/), sidebarText.slice(0, 100));

  // Shot 2: Project expanded with sessions
  console.log('[Shot 2: project-expanded-sessions]');
  await page.evaluate(() => {
    // Click first project header to expand
    const header = document.querySelector('.sidebar-project-row');
    if (header) header.click();
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-project-expanded-sessions.png') });
  check('02-project-expanded-sessions.png captured', fs.existsSync(path.join(SCREENSHOT_DIR, '02-project-expanded-sessions.png')));

  // Shot 3: Chat empty state
  console.log('[Shot 3: chat-empty-state]');
  await page.evaluate(() => {
    // Close sidebar
    const scrim = document.getElementById('sidebar-scrim');
    if (scrim) scrim.click();
  });
  await page.waitForTimeout(800);
  // The default view should be chat-pane with empty state
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-chat-empty-state.png') });
  check('03-chat-empty-state.png captured', fs.existsSync(path.join(SCREENSHOT_DIR, '03-chat-empty-state.png')));

  // Shot 4: Project overview
  console.log('[Shot 4: project-overview]');
  await page.evaluate(() => {
    // Open sidebar and click on a project name (not expand, but open overview)
    const menu = document.getElementById('app-menu');
    if (menu) menu.click();
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    // Click on the project name to open overview
    const names = document.querySelectorAll('.sidebar-project-name');
    if (names.length > 0) names[0].click();
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const scrim = document.getElementById('sidebar-scrim');
    if (scrim) scrim.click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-project-overview.png') });
  check('04-project-overview.png captured', fs.existsSync(path.join(SCREENSHOT_DIR, '04-project-overview.png')));

  // Shot 5: Chat session detail
  console.log('[Shot 5: chat-session-detail]');
  await page.evaluate(() => {
    // Open sidebar, expand first project, click first session
    const menu = document.getElementById('app-menu');
    if (menu) menu.click();
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    // Expand first project if not already
    const existing = document.querySelector('.sidebar-session-row');
    if (!existing) {
      const header = document.querySelector('.sidebar-project-row');
      if (header) header.click();
    }
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    // Click first session row
    const session = document.querySelector('.sidebar-session-row');
    if (session) session.click();
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const scrim = document.getElementById('sidebar-scrim');
    if (scrim) scrim.click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-chat-session-detail.png') });
  check('05-chat-session-detail.png captured', fs.existsSync(path.join(SCREENSHOT_DIR, '05-chat-session-detail.png')));

  // Shot 6: Chat draft detail
  console.log('[Shot 6: chat-draft-detail]');
  if (ctx.draftSessionId) {
    await page.evaluate((sid) => {
      // Try to open the draft session via the chat session opener
      if (typeof window.__openChatSession === 'function') {
        window.__openChatSession(sid);
      }
    }, ctx.draftSessionId);
    await page.waitForTimeout(1500);
    // If that didn't work, navigate directly
    const hasDraft = await page.evaluate(() => {
      const t = document.getElementById('chat-session-title');
      return t && t.textContent.includes('Draft');
    });
    if (!hasDraft) {
      // Use the app's openMobileSession function
      await page.evaluate((sid) => {
        if (typeof window.__app !== 'undefined' && window.__app.openMobileSession) {
          window.__app.openMobileSession(sid);
        }
      }, ctx.draftSessionId);
      await page.waitForTimeout(1500);
    }
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-chat-draft-detail.png') });
  check('06-chat-draft-detail.png captured', fs.existsSync(path.join(SCREENSHOT_DIR, '06-chat-draft-detail.png')));

  // Shot 7: File drawer open
  console.log('[Shot 7: file-drawer-open]');
  await page.evaluate(() => {
    const btn = document.getElementById('app-files-drawer');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-file-drawer-open.png') });
  check('07-file-drawer-open.png captured', fs.existsSync(path.join(SCREENSHOT_DIR, '07-file-drawer-open.png')));

  // Shot 8: File preview
  console.log('[Shot 8: file-preview]');
  await page.evaluate(() => {
    // Click on a file in the drawer
    const fileItems = document.querySelectorAll('.files-list-item, .file-item');
    if (fileItems.length > 0) fileItems[0].click();
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-file-preview.png') });
  check('08-file-preview.png captured', fs.existsSync(path.join(SCREENSHOT_DIR, '08-file-preview.png')));
  // Close drawer
  await page.evaluate(() => {
    const scrim = document.querySelector('.files-drawer-scrim');
    if (scrim) scrim.click();
  });
  await page.waitForTimeout(500);

  // Shot 9: New Chat no project warning
  console.log('[Shot 9: new-chat-no-project-warning]');
  // Need to clear selected project first — go to chat empty state
  await page.evaluate(() => {
    // Close sidebar if open
    const scrim = document.getElementById('sidebar-scrim');
    if (scrim) scrim.click();
  });
  await page.waitForTimeout(500);
  // Click New Chat button
  await page.evaluate(() => {
    const btn = document.getElementById('sidebar-new-chat');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-new-chat-no-project-warning.png') });
  check('09-new-chat-no-project-warning.png captured', fs.existsSync(path.join(SCREENSHOT_DIR, '09-new-chat-no-project-warning.png')));

  // Shot 10: Followup disabled reason (limited scope device)
  console.log('[Shot 10: followup-disabled-reason]');
  // Switch to limited token (no desktop_control)
  await page.evaluate((token2) => {
    try {
      localStorage.setItem('fanbox_mobile_token', token2);
    } catch (e) { /* ignore */ }
  }, ctx.token2);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  // Open a session to see disabled followup
  await page.evaluate(() => {
    const menu = document.getElementById('app-menu');
    if (menu) menu.click();
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const header = document.querySelector('.sidebar-project-row');
    if (header) header.click();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const session = document.querySelector('.sidebar-session-row');
    if (session) session.click();
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const scrim = document.getElementById('sidebar-scrim');
    if (scrim) scrim.click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10-followup-disabled-reason.png') });
  check('10-followup-disabled-reason.png captured', fs.existsSync(path.join(SCREENSHOT_DIR, '10-followup-disabled-reason.png')));

  // Summary
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('\n===== Mobile-Reframe-R2 Screenshot Smoke =====');
  console.log('PASS: ' + passed);
  console.log('FAIL: ' + failed);

  await browserCtx.close();
  await new Promise(r => ctx.server.close(r));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
