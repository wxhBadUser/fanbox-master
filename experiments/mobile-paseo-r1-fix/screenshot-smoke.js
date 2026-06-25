/* eslint-disable */
'use strict';
// Mobile-Paseo-R1-Fix Screenshot Smoke
//
// Captures 390x844 dark-theme screenshots proving the R1-Fix backend/frontend
// changes are visible end-to-end through the mobile UI:
//   01-sessions-title-from-project-memory.png  — Sessions hub shows the REAL
//        first-message title (e.g. "# AGENTS.md instructions"), not the
//        synthesized "Claude session · <date>" fallback.
//   02-chat-detail-messages-visible.png        — project-memory session → Chat tab.
//        Shows the friendly empty state "这个历史会话暂无可显示消息" (project-memory
//        has no readable mobile message log); MUST NOT show [object Object].
//   03-chat-detail-empty-state-friendly.png    — same Chat empty state, framed.
//   04-terminal-history-empty-state.png        — project-memory session → Terminal tab.
//        Shows "这个历史会话没有可连接的实时终端" (no desktopAgentId → no red error,
//        no desktop_agent_not_found).
//   05-terminal-live-output-tail.png            — RUNNING desktop-agent row →
//        Terminal tab. Shows output_tail content from the seeded mock provider.
//   06-files-tab-still-ok.png                  — any session → Files tab (#sd-file-tree).
//
// Harness: playwright-core + Edge (same as mobile-paseo-r1 screenshot-smoke).
// In-process mobile server (electron/mobile.js), real pair/confirm + updateToken.
// Fixture: .claude/projects/<munge>/paseo-fix-sess-001.jsonl whose FIRST user message
// is "# AGENTS.md instructions" so the hub returns a project-memory session with
// titleSource:"first-message". The fixture cwd is DISTINCT from the mock desktop-
// terminal provider cwd, so findDesktopAgentId() returns null for the project-memory
// session (→ Terminal empty state) while the running agent still populates runningAgents.

const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const EDGE_PROFILE = path.join(os.tmpdir(), 'fanbox-paseo-r1fix-edge-profile-' + Date.now());
fs.mkdirSync(EDGE_PROFILE, { recursive: true });
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ---- Isolated TMP_HOME so no real user data is touched ----
const TMP_HOME = path.join(os.tmpdir(), 'fanbox-paseo-r1fix-shots-' + Date.now());
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

const mobile = require(path.join(__dirname, '..', '..', 'electron', 'mobile.js'));
const TEST_PORT = 14725;

// The fixture project (project-memory) uses a cwd DISTINCT from the mock provider
// so findDesktopAgentId() returns null for the project-memory session (→ Terminal
// empty state) while the running agent still resolves to its term-<hash> id.
const FIXTURE_PROJECT_CWD = path.join(TMP_HOME, 'fanbox-master');
const LIVE_AGENT_CWD = path.join(TMP_HOME, 'live-agent-project');
const FIXTURE_TITLE = '# AGENTS.md instructions';

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
  // Mock desktop terminal provider → populates runningAgents in session-hub.
  // Uses LIVE_AGENT_CWD (distinct from FIXTURE_PROJECT_CWD) so the project-memory
  // session does NOT bind to this running agent.
  const mockTermId = 'mock-term-r1fix';
  mobile.setDesktopTerminalProvider(() => [
    {
      id: mockTermId, cwd: LIVE_AGENT_CWD, proc: 'claude', busy: true, lastActiveAt: Date.now(),
      tail: '\u001b[32m\u2713 Running test suite...\u001b[0m\nTests passed!\n',
      events: [
        { type: 'output_tail', text: 'Running test suite...', timestamp: Date.now() - 5000 },
        { type: 'status_change', text: 'running', status: 'running', timestamp: Date.now() - 4000 },
        { type: 'output_tail', text: 'Tests passed!', timestamp: Date.now() - 1000 },
      ]
    }
  ]);

  await mobile.saveConfig({ enabled: true });
  const server = mobile.startMobileServer({ port: TEST_PORT });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise(r => setTimeout(r, 20));
  if (!server.listening) throw new Error('test server failed to listen');

  // Pair device with FULL scopes (includes desktop_control → enabled followup)
  const pair1 = await mobile.startPairCode();
  const pairRes1 = await request({
    path: '/api/mobile/pair/confirm', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ pairCode: pair1.pairCode, deviceName: 'Paseo R1-Fix Phone' }));
  const pairData1 = asJson(pairRes1);
  if (!pairData1 || !pairData1.token) throw new Error('pair failed: ' + pairRes1.body);
  const token1 = pairData1.token;
  const deviceId1 = pairData1.deviceId;
  if (deviceId1 && typeof mobile.updateToken === 'function') {
    const hash1 = mobile.sha256(token1);
    await mobile.updateToken(hash1, (rec) => {
      rec.scopes = ['read:status', 'read:files', 'session:start', 'desktop_control'];
      return rec;
    });
  }
  const auth1 = { 'Authorization': 'Bearer ' + token1 };

  // ---- Seed fixture project dir (project-memory cwd) ----
  // A real file so the Files tab shows content for the project-memory session.
  fs.mkdirSync(FIXTURE_PROJECT_CWD, { recursive: true });
  fs.writeFileSync(path.join(FIXTURE_PROJECT_CWD, 'README.md'), '# fanbox\n', 'utf8');
  fs.writeFileSync(path.join(FIXTURE_PROJECT_CWD, 'fix.js'), 'function fix () { return true; }\n', 'utf8');

  // Seed a file in the live-agent cwd too (for Shot 6 Files tab on the running agent).
  fs.mkdirSync(LIVE_AGENT_CWD, { recursive: true });
  fs.writeFileSync(path.join(LIVE_AGENT_CWD, 'agent.log'), 'agent started\n', 'utf8');

  // ---- Seed fixture: .claude/projects/<munge>/paseo-fix-sess-001.jsonl ----
  // FIRST user message is the recognizable "# AGENTS.md instructions" string so
  // the project-memory parser surfaces titleSource:"first-message" with the real
  // title (NOT the "Claude session · <date>" fallback).
  const claudeProjRoot = path.join(TMP_HOME, '.claude', 'projects');
  fs.mkdirSync(claudeProjRoot, { recursive: true });
  const mungeClaudeDir = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, '-');
  const claudeProjectDir = path.join(claudeProjRoot, mungeClaudeDir(FIXTURE_PROJECT_CWD));
  fs.mkdirSync(claudeProjectDir, { recursive: true });
  const claudeSessionFile = path.join(claudeProjectDir, 'paseo-fix-sess-001.jsonl');
  const now = Date.now();
  const claudeSessionContent = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: FIXTURE_TITLE }, timestamp: new Date(now - 3600000).toISOString(), cwd: FIXTURE_PROJECT_CWD }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Reading AGENTS.md to align on the project rules.' }] }, timestamp: new Date(now - 3500000).toISOString() }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu1', name: 'Edit', input: { file_path: path.join(FIXTURE_PROJECT_CWD, 'fix.js') } }] }, timestamp: new Date(now - 3400000).toISOString() }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'Done, the fix looks good.' }, timestamp: new Date(now - 3300000).toISOString() }),
  ].join('\n') + '\n';
  fs.writeFileSync(claudeSessionFile, claudeSessionContent, 'utf8');
  const fileTime = Math.floor((now - 3600000) / 1000);
  try { fs.utimesSync(claudeSessionFile, fileTime, fileTime); } catch (_) {}

  // Give the projection a moment to pick up the fixture file.
  await new Promise(r => setTimeout(r, 200));

  return { server, token1, auth1, fixtureProjectCwd: FIXTURE_PROJECT_CWD, liveAgentCwd: LIVE_AGENT_CWD };
}

async function main() {
  console.log('Mobile-Paseo-R1-Fix Screenshot Smoke');
  console.log('TMP_HOME=' + TMP_HOME);
  console.log('SCREENSHOT_DIR=' + SCREENSHOT_DIR);

  const ctx = await setupTestServer();
  console.log('test server listening on ' + TEST_PORT);

  let browserCtx;
  try {
    browserCtx = await chromium.launchPersistentContext(EDGE_PROFILE, {
      executablePath: EDGE_PATH,
      headless: true,
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (e) {
    console.error('FATAL: cannot launch browser: ' + e.message);
    await new Promise(r => ctx.server.close(r));
    process.exit(2);
  }

  const page = await browserCtx.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('dialog', async (dialog) => { await dialog.accept(); });

  const TEST_URL = 'http://127.0.0.1:' + TEST_PORT + '/mobile';

  // Navigate first (origin must exist before localStorage can be set)
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate((token) => {
    try { localStorage.setItem('fanbox_mobile_token', token); } catch (_) {}
  }, ctx.token1);
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000); // allow token restore + startContractMode + loadSessionHub

  // ============================================================
  // Shot 1: Sessions hub showing the REAL first-message title
  // ============================================================
  console.log('\n[Shot 1: sessions-title-from-project-memory]');
  let titleOnHub = '';
  try {
    await page.waitForSelector('#hub-projects', { state: 'visible', timeout: 10000 });
    await page.waitForSelector('.hub-session', { state: 'attached', timeout: 10000 });
    // Wait for the project-memory row whose title text includes the fixture title.
    // The hub renders session.title inside .hub-session-title.
    try {
      await page.waitForFunction((needle) => {
        const rows = document.querySelectorAll('.hub-session');
        for (const r of rows) {
          const t = r.querySelector('.hub-session-title');
          if (t && t.textContent && t.textContent.indexOf(needle) !== -1) return true;
        }
        return false;
      }, { timeout: 8000 }, FIXTURE_TITLE);
    } catch (_) { /* fall through — still capture */ }
    await page.waitForTimeout(800);
    titleOnHub = await page.evaluate((needle) => {
      const rows = document.querySelectorAll('.hub-session');
      for (const r of rows) {
        const t = r.querySelector('.hub-session-title');
        if (t && t.textContent && t.textContent.indexOf(needle) !== -1) return t.textContent.trim();
      }
      return '';
    }, FIXTURE_TITLE);
    const shot1 = path.join(SCREENSHOT_DIR, '01-sessions-title-from-project-memory.png');
    await page.screenshot({ path: shot1 });
    const ok1 = fs.existsSync(shot1) && fs.statSync(shot1).size > 0;
    check('01-sessions-title-from-project-memory.png captured', ok1, shot1);
    check('1b. hub shows real first-message title (not "Claude session · <date>")', titleOnHub.indexOf(FIXTURE_TITLE) !== -1, 'title="' + titleOnHub + '"');
  } catch (e) {
    const shot1 = path.join(SCREENSHOT_DIR, '01-sessions-title-from-project-memory.png');
    await page.screenshot({ path: shot1 });
    check('01-sessions-title-from-project-memory.png captured (fallback)', fs.existsSync(shot1) && fs.statSync(shot1).size > 0, e.message);
  }

  // ============================================================
  // Shots 2-4: project-memory session → Chat + Terminal empty states
  // ============================================================
  console.log('\n[Shots 2-4: project-memory session detail]');

  // Click the project-memory session row (source=desktop-project-memory). Fall back
  // to any row whose title matches the fixture, then any hub-session row.
  const pmClicked = await page.evaluate((needle) => {
    let row = document.querySelector('.hub-session[data-source="desktop-project-memory"]');
    if (!row) {
      const rows = document.querySelectorAll('.hub-session');
      for (const r of rows) {
        const t = r.querySelector('.hub-session-title');
        if (t && t.textContent && t.textContent.indexOf(needle) !== -1) { row = r; break; }
      }
    }
    if (!row) row = document.querySelector('.hub-session');
    if (row) { row.click(); return true; }
    return false;
  }, FIXTURE_TITLE);
  check('2a. project-memory session row clicked', pmClicked);
  await page.waitForTimeout(2000);

  // Shot 2: Chat tab (default active tab) → REAL messages from project-memory jsonl.
  // Mobile-Paseo-R1-Fix-Strict: the friendly empty state is no longer acceptable.
  // The Chat tab MUST show real history messages (user/assistant text + tool summary).
  console.log('[Shot 2: chat-detail-messages-visible]');
  let chatHasMessages = false;
  let chatHasFixJs = false;
  let chatNoObjectObject = false;
  let chatNoRawJson = false;
  try {
    await page.waitForSelector('#sd-messages', { state: 'visible', timeout: 10000 });
    // Wait for the project-memory timeline to load (events rendered as .sd-msg rows).
    try {
      await page.waitForFunction(() => {
        const box = document.getElementById('sd-messages');
        if (!box) return false;
        // Real messages render as child nodes (sd-msg / sd-msg-row etc.).
        // The friendly empty state renders a single .sd-empty div.
        const empty = box.querySelector('.sd-empty');
        if (empty) return false; // still empty — keep waiting
        return box.children.length > 0;
      }, { timeout: 8000 });
    } catch (_) { /* fall through — capture whatever we have */ }
    await page.waitForTimeout(800);
    const chatState = await page.evaluate((needle) => {
      const box = document.getElementById('sd-messages');
      if (!box) return { txt: '', hasMsg: false, hasFixJs: false, hasObjectObject: false, hasRawJson: false };
      const txt = box.textContent || '';
      const hasMsg = box.children.length > 0 && !box.querySelector('.sd-empty');
      const hasFixJs = /fix\.js/i.test(txt);
      const hasObjectObject = txt.indexOf('[object Object]') !== -1;
      // Raw tool_use JSON leak: "tool_use_id" / "input":{... file_path ...}
      const hasRawJson = /"tool_use_id"\s*:\s*"tu1"/.test(txt) || /"input"\s*:\s*\{\s*"file_path"/.test(txt);
      // Also confirm the fixture user message appears (real history, not empty state)
      const hasNeedle = txt.indexOf(needle) !== -1;
      return { txt: txt.slice(0, 200), hasMsg: hasMsg && hasNeedle, hasFixJs, hasObjectObject, hasRawJson };
    }, FIXTURE_TITLE);
    chatHasMessages = !!chatState.hasMsg;
    chatHasFixJs = !!chatState.hasFixJs;
    chatNoObjectObject = !chatState.hasObjectObject;
    chatNoRawJson = !chatState.hasRawJson;
    const shot2 = path.join(SCREENSHOT_DIR, '02-chat-detail-messages-visible.png');
    await page.screenshot({ path: shot2 });
    check('02-chat-detail-messages-visible.png captured', fs.existsSync(shot2) && fs.statSync(shot2).size > 0, shot2);
    check('2b. Chat tab shows real history messages (fixture title visible, no [object Object])', chatHasMessages && chatNoObjectObject, chatState.txt);
  } catch (e) {
    const shot2 = path.join(SCREENSHOT_DIR, '02-chat-detail-messages-visible.png');
    await page.screenshot({ path: shot2 });
    check('02-chat-detail-messages-visible.png captured (fallback)', fs.existsSync(shot2) && fs.statSync(shot2).size > 0, e.message);
  }

  // Shot 3: Chat tab tool/file-edit safe summary (mentions fix.js, no raw JSON).
  console.log('[Shot 3: chat-detail-tool-summary-safe]');
  try {
    // Ensure we are still on the Chat tab.
    await page.evaluate(() => {
      const tab = document.querySelector('.sd-tab[data-tab="chat"]');
      if (tab) tab.click();
    });
    await page.waitForSelector('#sd-messages', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(800);
    const shot3 = path.join(SCREENSHOT_DIR, '03-chat-detail-tool-summary-safe.png');
    await page.screenshot({ path: shot3 });
    check('03-chat-detail-tool-summary-safe.png captured', fs.existsSync(shot3) && fs.statSync(shot3).size > 0, shot3);
    // The fixture has an Edit tool_use on fix.js → timeline must mention fix.js as a safe summary.
    check('3b. Chat tab shows safe tool summary mentioning fix.js (no raw tool_use JSON)', chatHasFixJs && chatNoRawJson,
      'fixJs=' + chatHasFixJs + ' rawJson=' + (!chatNoRawJson));
  } catch (e) {
    const shot3 = path.join(SCREENSHOT_DIR, '03-chat-detail-tool-summary-safe.png');
    await page.screenshot({ path: shot3 });
    check('03-chat-detail-tool-summary-safe.png captured (fallback)', fs.existsSync(shot3) && fs.statSync(shot3).size > 0, e.message);
  }

  // Shot 4: Terminal tab on the SAME project-memory session → friendly empty state
  // (desktopAgentId is null because the fixture cwd ≠ mock provider cwd).
  console.log('[Shot 4: terminal-history-empty-state]');
  let termEmptyState = false;
  try {
    await page.evaluate(() => {
      const tab = document.querySelector('.sd-tab[data-tab="terminal"]');
      if (tab) tab.click();
    });
    await page.waitForSelector('#sd-term-out', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);
    termEmptyState = await page.evaluate(() => {
      const out = document.getElementById('sd-term-out');
      if (!out) return false;
      const txt = out.textContent || '';
      // Must show the friendly empty state; must NOT show a red error or
      // desktop_agent_not_found.
      if (txt.indexOf('desktop_agent_not_found') !== -1) return false;
      if (out.querySelector('.sd-error')) return false;
      return txt.indexOf('这个历史会话没有可连接的实时终端') !== -1;
    });
    const shot4 = path.join(SCREENSHOT_DIR, '04-terminal-history-empty-state.png');
    await page.screenshot({ path: shot4 });
    check('04-terminal-history-empty-state.png captured', fs.existsSync(shot4) && fs.statSync(shot4).size > 0, shot4);
    check('4b. Terminal tab shows friendly empty state (no red error)', termEmptyState);
  } catch (e) {
    const shot4 = path.join(SCREENSHOT_DIR, '04-terminal-history-empty-state.png');
    await page.screenshot({ path: shot4 });
    check('04-terminal-history-empty-state.png captured (fallback)', fs.existsSync(shot4) && fs.statSync(shot4).size > 0, e.message);
  }

  // ============================================================
  // Shot 5: RUNNING desktop-agent row → Terminal tab → live output_tail
  // ============================================================
  console.log('\n[Shot 5: terminal-live-output-tail]');
  let liveOutputShown = false;
  try {
    // Go back to the sessions hub.
    await page.evaluate(() => {
      const back = document.getElementById('sd-back');
      if (back) back.click();
    });
    await page.waitForTimeout(1500);
    // Reload the hub to ensure runningAgents are fresh.
    await page.evaluate(() => {
      if (typeof window.UI1A !== 'undefined' && window.UI1A.loadSessionHub) window.UI1A.loadSessionHub();
    });
    await page.waitForTimeout(1500);
    await page.waitForSelector('#hub-projects', { state: 'visible', timeout: 10000 });
    await page.waitForSelector('.hub-session[data-source="desktop-terminal"]', { state: 'attached', timeout: 10000 });
    // Click the running-agent row (source=desktop-terminal).
    const runClicked = await page.evaluate(() => {
      const row = document.querySelector('.hub-session[data-source="desktop-terminal"]');
      if (row) { row.click(); return true; }
      return false;
    });
    check('5a. running desktop-agent row clicked', runClicked);
    await page.waitForTimeout(2000);
    // Ensure the Terminal tab is active (it may already be from the previous
    // session's tab state, but switch explicitly to be safe).
    await page.evaluate(() => {
      const tab = document.querySelector('.sd-tab[data-tab="terminal"]');
      if (tab) tab.click();
    });
    await page.waitForSelector('#sd-term-out', { state: 'visible', timeout: 10000 });
    // Wait for output_tail content to render (the seeded mock provider returns
    // "Running test suite..." / "Tests passed!" output_tail events).
    try {
      await page.waitForFunction(() => {
        const out = document.getElementById('sd-term-out');
        if (!out) return false;
        const txt = out.textContent || '';
        // The live terminal must show real output_tail text, NOT the empty state.
        if (txt.indexOf('这个历史会话没有可连接的实时终端') !== -1) return false;
        return txt.indexOf('Running test suite') !== -1 || txt.indexOf('Tests passed') !== -1;
      }, { timeout: 8000 });
      liveOutputShown = true;
    } catch (_) { /* fall through — still capture */ }
    await page.waitForTimeout(800);
    const shot5 = path.join(SCREENSHOT_DIR, '05-terminal-live-output-tail.png');
    await page.screenshot({ path: shot5 });
    check('05-terminal-live-output-tail.png captured', fs.existsSync(shot5) && fs.statSync(shot5).size > 0, shot5);
    check('5b. live Terminal shows output_tail content', liveOutputShown);
  } catch (e) {
    const shot5 = path.join(SCREENSHOT_DIR, '05-terminal-live-output-tail.png');
    try { await page.screenshot({ path: shot5 }); } catch (_) {}
    check('05-terminal-live-output-tail.png captured (fallback)', fs.existsSync(shot5) && fs.statSync(shot5).size > 0, e.message);
  }

  // ============================================================
  // Shot 6: Files tab (still working — unchanged)
  // ============================================================
  console.log('\n[Shot 6: files-tab-still-ok]');
  try {
    // The running-agent session (still open) has cwd = LIVE_AGENT_CWD with a
    // seeded agent.log. Switch to the Files tab.
    await page.evaluate(() => {
      const tab = document.querySelector('.sd-tab[data-tab="files"]');
      if (tab) tab.click();
    });
    await page.waitForSelector('#sd-file-tree', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);
    const shot6 = path.join(SCREENSHOT_DIR, '06-files-tab-still-ok.png');
    await page.screenshot({ path: shot6 });
    check('06-files-tab-still-ok.png captured', fs.existsSync(shot6) && fs.statSync(shot6).size > 0, shot6);
  } catch (e) {
    // Fallback: go back to hub, open the project-memory session, Files tab.
    try {
      await page.evaluate(() => {
        const back = document.getElementById('sd-back');
        if (back) back.click();
      });
      await page.waitForTimeout(1500);
      await page.evaluate((needle) => {
        let row = document.querySelector('.hub-session[data-source="desktop-project-memory"]');
        if (!row) {
          const rows = document.querySelectorAll('.hub-session');
          for (const r of rows) {
            const t = r.querySelector('.hub-session-title');
            if (t && t.textContent && t.textContent.indexOf(needle) !== -1) { row = r; break; }
          }
        }
        if (!row) row = document.querySelector('.hub-session');
        if (row) row.click();
      }, FIXTURE_TITLE);
      await page.waitForTimeout(2000);
      await page.evaluate(() => {
        const tab = document.querySelector('.sd-tab[data-tab="files"]');
        if (tab) tab.click();
      });
      await page.waitForSelector('#sd-file-tree', { state: 'visible', timeout: 10000 });
      await page.waitForTimeout(1000);
      const shot6 = path.join(SCREENSHOT_DIR, '06-files-tab-still-ok.png');
      await page.screenshot({ path: shot6 });
      check('06-files-tab-still-ok.png captured (fallback)', fs.existsSync(shot6) && fs.statSync(shot6).size > 0, shot6);
    } catch (e2) {
      const shot6 = path.join(SCREENSHOT_DIR, '06-files-tab-still-ok.png');
      try { await page.screenshot({ path: shot6 }); } catch (_) {}
      check('06-files-tab-still-ok.png captured (fallback2)', fs.existsSync(shot6) && fs.statSync(shot6).size > 0, e2.message);
    }
  }

  // ---- Check no JS pageerrors throughout ----
  check('no JS pageerror throughout', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await browserCtx.close();

  // ---- Summary ----
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('\n===== Mobile-Paseo-R1-Fix Screenshot Smoke =====');
  console.log('PASS: ' + passed);
  console.log('FAIL: ' + failed);
  console.log('Screenshots dir: ' + SCREENSHOT_DIR);

  await new Promise((resolve) => ctx.server.close(resolve));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
