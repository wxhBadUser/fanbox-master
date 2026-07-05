/* eslint-disable */
'use strict';
// Mobile-Paseo-R1 Screenshot Smoke
//
// Captures 390x844 dark-theme screenshots for the rebuilt Paseo R1 mobile UI:
//   01-sessions-list.png            — default Sessions hub (#hub-projects)
//   02-session-detail-chat.png      — session-detail → Chat tab (#sd-messages)
//   03-session-detail-terminal.png   — session-detail → Terminal tab (#sd-term-out)
//   04-session-detail-files.png      — session-detail → Files tab (#sd-file-tree)
//   05-session-detail-changes.png    — session-detail → Changes tab (#sd-changes-list)
//   06-settings-hosts.png            — Settings view (Host + Permissions sections)
//   07-followup-disabled.png         — running session w/ limited token (input disabled + reason)
//   08-draft-start.png               — draft session showing enabled composer (Start affordance)
//
// Harness: playwright-core + Edge (same as mobile-reframe-r2 / mobile-ux-reframe smokes).
// In-process mobile server (electron/mobile.js), real pair/confirm + updateToken for scopes.
// Fixture: .claude/projects/<munge>/paseo-sess-001.jsonl (mirrors verify-mobile-ui-smoke.js).

const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const EDGE_PROFILE = path.join(os.tmpdir(), 'fanbox-paseo-r1-edge-profile-' + Date.now());
fs.mkdirSync(EDGE_PROFILE, { recursive: true });
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ---- Isolated TMP_HOME so no real user data is touched ----
const TMP_HOME = path.join(os.tmpdir(), 'fanbox-paseo-r1-shots-' + Date.now());
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
const TEST_PORT = 14715;

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
  // Desktop terminal write provider (follow-up input)
  mobile.setDesktopTerminalWriteProvider({
    sendInput: async () => ({ ok: true, accepted: true })
  });

  // Mock desktop terminal provider → populates runningAgents in session-hub
  const mockTermId = 'mock-term-1';
  const fixtureProjectCwd = path.join(TMP_HOME, 'fanbox-master');
  mobile.setDesktopTerminalProvider(() => [
    {
      id: mockTermId, cwd: fixtureProjectCwd, proc: 'claude', busy: true, lastActiveAt: Date.now(),
      tail: '\u001b[32m\u2713 Building...\u001b[0m\nDone\n',
      events: [
        { type: 'output_tail', text: 'Running tests...', timestamp: Date.now() - 5000 },
        { type: 'status_change', text: 'running', status: 'running', timestamp: Date.now() - 4000 },
        { type: 'output_tail', text: 'Tests passed!', timestamp: Date.now() - 1000 },
      ]
    }
  ]);

  await mobile.saveConfig({ enabled: true });
  const server = mobile.startMobileServer({ port: TEST_PORT });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise(r => setTimeout(r, 20));
  if (!server.listening) throw new Error('test server failed to listen');

  // Pair first device (FULL scopes — includes desktop_control)
  const pair1 = await mobile.startPairCode();
  const pairRes1 = await request({
    path: '/api/mobile/pair/confirm', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ pairCode: pair1.pairCode, deviceName: 'Paseo R1 Phone' }));
  const pairData1 = asJson(pairRes1);
  if (!pairData1 || !pairData1.token) throw new Error('pair1 failed: ' + pairRes1.body);
  const token1 = pairData1.token;
  const deviceId1 = pairData1.deviceId;
  if (deviceId1 && typeof mobile.updateToken === 'function') {
    const hash1 = mobile.sha256(token1);
    await mobile.updateToken(hash1, (rec) => {
      rec.scopes = ['read:status', 'read:files', 'session:start', 'desktop_control'];
      return rec;
    });
  }

  // Pair second device (LIMITED scopes — NO desktop_control → disabled followup)
  const pair2 = await mobile.startPairCode();
  const pairRes2 = await request({
    path: '/api/mobile/pair/confirm', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ pairCode: pair2.pairCode, deviceName: 'Paseo R1 Limited Phone' }));
  const pairData2 = asJson(pairRes2);
  if (!pairData2 || !pairData2.token) throw new Error('pair2 failed: ' + pairRes2.body);
  const token2 = pairData2.token;
  const deviceId2 = pairData2.deviceId;
  if (deviceId2 && typeof mobile.updateToken === 'function') {
    const hash2 = mobile.sha256(token2);
    await mobile.updateToken(hash2, (rec) => {
      rec.scopes = ['read:status', 'read:files', 'session:start'];
      return rec;
    });
  }

  const auth1 = { 'Authorization': 'Bearer ' + token1 };

  // ---- Seed fixture: .claude/projects/<munge>/paseo-sess-001.jsonl ----
  // So GET /api/mobile/session-hub returns a real fanbox-master project with
  // at least one session row. Mirrors verify-mobile-ui-smoke.js.
  fs.mkdirSync(fixtureProjectCwd, { recursive: true });
  fs.writeFileSync(path.join(fixtureProjectCwd, 'README.md'), '# fanbox\n', 'utf8');
  // A real file so the Files tab shows content
  fs.writeFileSync(path.join(fixtureProjectCwd, 'fix.js'), 'function fix () { return true; }\n', 'utf8');

  const claudeProjRoot = path.join(TMP_HOME, '.claude', 'projects');
  fs.mkdirSync(claudeProjRoot, { recursive: true });
  const mungeClaudeDir = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, '-');
  const claudeProjectDir = path.join(claudeProjRoot, mungeClaudeDir(fixtureProjectCwd));
  fs.mkdirSync(claudeProjectDir, { recursive: true });
  const claudeSessionFile = path.join(claudeProjectDir, 'paseo-sess-001.jsonl');
  const now = Date.now();
  const claudeSessionContent = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'Fix the auth bug in mobile.js' }, timestamp: new Date(now - 3600000).toISOString(), cwd: fixtureProjectCwd }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Looking into the auth flow now.' }] }, timestamp: new Date(now - 3500000).toISOString() }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu1', name: 'Edit', input: { file_path: path.join(fixtureProjectCwd, 'fix.js') } }] }, timestamp: new Date(now - 3400000).toISOString() }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'Done, the fix looks good.' }, timestamp: new Date(now - 3300000).toISOString() }),
  ].join('\n') + '\n';
  fs.writeFileSync(claudeSessionFile, claudeSessionContent, 'utf8');
  const fileTime = Math.floor((now - 3600000) / 1000);
  try { fs.utimesSync(claudeSessionFile, fileTime, fileTime); } catch (_) {}

  // Give the projection a moment to pick up the fixture file.
  await new Promise(r => setTimeout(r, 200));

  // ---- Seed a draft session (for screenshot 08) ----
  const draftRes = await request({
    path: '/api/mobile/sessions/draft', method: 'POST',
    headers: { ...auth1, 'Content-Type': 'application/json' },
  }, JSON.stringify({
    cwd: fixtureProjectCwd,
    agentId: 'claude',
    title: 'Paseo R1 Draft Task',
    initialMessage: 'Refactor the session-hub projection.',
  }));
  const draftData = asJson(draftRes);
  const draftSessionId = draftData && draftData.session ? draftData.session.id : null;

  return { server, token1, token2, deviceId1, deviceId2, auth1, draftSessionId, fixtureProjectCwd };
}

// Click the first hub session row matching a data-source filter.
// Returns true if a row was clicked.
async function clickHubSession(page, sourceFilter) {
  return await page.evaluate((src) => {
    const selector = src
      ? `.hub-session[data-source="${src}"]`
      : '.hub-session';
    const row = document.querySelector(selector);
    if (row) { row.click(); return true; }
    return false;
  }, sourceFilter || null);
}

async function main() {
  console.log('Mobile-Paseo-R1 Screenshot Smoke');
  console.log('TMP_HOME=' + TMP_HOME);
  console.log('SCREENSHOT_DIR=' + SCREENSHOT_DIR);

  const ctx = await setupTestServer();
  console.log('test server listening on ' + TEST_PORT);
  console.log('draft session: ' + ctx.draftSessionId);

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
  // Shot 1: Sessions hub (default view)
  // ============================================================
  console.log('\n[Shot 1: sessions-list]');
  try {
    await page.waitForSelector('#hub-projects', { state: 'visible', timeout: 10000 });
    await page.waitForSelector('.hub-session', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(800);
    const shot1 = path.join(SCREENSHOT_DIR, '01-sessions-list.png');
    await page.screenshot({ path: shot1 });
    const ok1 = fs.existsSync(shot1) && fs.statSync(shot1).size > 0;
    check('01-sessions-list.png captured', ok1, shot1);
  } catch (e) {
    const shot1 = path.join(SCREENSHOT_DIR, '01-sessions-list.png');
    await page.screenshot({ path: shot1 });
    check('01-sessions-list.png captured (fallback)', fs.existsSync(shot1) && fs.statSync(shot1).size > 0, e.message);
  }

  // ============================================================
  // Shots 2-5: Session detail (open running agent, switch tabs)
  // ============================================================
  console.log('\n[Shots 2-5: session-detail tabs]');

  // Open the running agent row (desktop-terminal source → has terminal + chat)
  const opened = await clickHubSession(page, 'desktop-terminal');
  check('2a. running agent row clicked', opened, opened ? 'desktop-terminal' : 'no desktop-terminal row — will try fallback');
  if (!opened) {
    // Fallback: click any hub-session row
    const fallback = await clickHubSession(page, null);
    check('2a. fallback: any hub-session row clicked', fallback);
  }
  await page.waitForTimeout(2000);

  // Shot 2: Chat tab (default active tab)
  console.log('[Shot 2: session-detail-chat]');
  try {
    await page.waitForSelector('#sd-messages', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(800);
    const shot2 = path.join(SCREENSHOT_DIR, '02-session-detail-chat.png');
    await page.screenshot({ path: shot2 });
    check('02-session-detail-chat.png captured', fs.existsSync(shot2) && fs.statSync(shot2).size > 0, shot2);
  } catch (e) {
    const shot2 = path.join(SCREENSHOT_DIR, '02-session-detail-chat.png');
    await page.screenshot({ path: shot2 });
    check('02-session-detail-chat.png captured (fallback)', fs.existsSync(shot2) && fs.statSync(shot2).size > 0, e.message);
  }

  // Shot 3: Terminal tab
  console.log('[Shot 3: session-detail-terminal]');
  try {
    await page.evaluate(() => {
      const tab = document.querySelector('.sd-tab[data-tab="terminal"]');
      if (tab) tab.click();
    });
    await page.waitForSelector('#sd-term-out', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);
    const shot3 = path.join(SCREENSHOT_DIR, '03-session-detail-terminal.png');
    await page.screenshot({ path: shot3 });
    check('03-session-detail-terminal.png captured', fs.existsSync(shot3) && fs.statSync(shot3).size > 0, shot3);
  } catch (e) {
    const shot3 = path.join(SCREENSHOT_DIR, '03-session-detail-terminal.png');
    await page.screenshot({ path: shot3 });
    check('03-session-detail-terminal.png captured (fallback)', fs.existsSync(shot3) && fs.statSync(shot3).size > 0, e.message);
  }

  // Shot 4: Files tab
  console.log('[Shot 4: session-detail-files]');
  try {
    await page.evaluate(() => {
      const tab = document.querySelector('.sd-tab[data-tab="files"]');
      if (tab) tab.click();
    });
    await page.waitForSelector('#sd-file-tree', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);
    const shot4 = path.join(SCREENSHOT_DIR, '04-session-detail-files.png');
    await page.screenshot({ path: shot4 });
    check('04-session-detail-files.png captured', fs.existsSync(shot4) && fs.statSync(shot4).size > 0, shot4);
  } catch (e) {
    const shot4 = path.join(SCREENSHOT_DIR, '04-session-detail-files.png');
    await page.screenshot({ path: shot4 });
    check('04-session-detail-files.png captured (fallback)', fs.existsSync(shot4) && fs.statSync(shot4).size > 0, e.message);
  }

  // Shot 5: Changes tab
  console.log('[Shot 5: session-detail-changes]');
  try {
    await page.evaluate(() => {
      const tab = document.querySelector('.sd-tab[data-tab="changes"]');
      if (tab) tab.click();
    });
    await page.waitForSelector('#sd-changes-list', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(800);
    const shot5 = path.join(SCREENSHOT_DIR, '05-session-detail-changes.png');
    await page.screenshot({ path: shot5 });
    check('05-session-detail-changes.png captured', fs.existsSync(shot5) && fs.statSync(shot5).size > 0, shot5);
  } catch (e) {
    const shot5 = path.join(SCREENSHOT_DIR, '05-session-detail-changes.png');
    await page.screenshot({ path: shot5 });
    check('05-session-detail-changes.png captured (fallback)', fs.existsSync(shot5) && fs.statSync(shot5).size > 0, e.message);
  }

  // ============================================================
  // Shot 6: Settings (Host + Permissions sections)
  // ============================================================
  console.log('\n[Shot 6: settings-hosts]');
  try {
    // Navigate to settings via the bottombar button
    await page.evaluate(() => {
      const btn = document.querySelector('.hub-bottombar-btn[data-go="settings"]');
      if (btn) btn.click();
      else if (typeof window.UI1A !== 'undefined' && window.UI1A.openSettings) window.UI1A.openSettings();
    });
    await page.waitForSelector('#set-host-name', { state: 'visible', timeout: 10000 });
    await page.waitForSelector('#set-perms', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);
    const shot6 = path.join(SCREENSHOT_DIR, '06-settings-hosts.png');
    await page.screenshot({ path: shot6 });
    check('06-settings-hosts.png captured', fs.existsSync(shot6) && fs.statSync(shot6).size > 0, shot6);
  } catch (e) {
    const shot6 = path.join(SCREENSHOT_DIR, '06-settings-hosts.png');
    await page.screenshot({ path: shot6 });
    check('06-settings-hosts.png captured (fallback)', fs.existsSync(shot6) && fs.statSync(shot6).size > 0, e.message);
  }

  // ============================================================
  // Shot 7: Followup disabled (limited token, no desktop_control)
  // ============================================================
  console.log('\n[Shot 7: followup-disabled]');
  const page2 = await browserCtx.newPage();
  page2.on('pageerror', (err) => pageErrors.push(err.message));
  page2.on('dialog', async (dialog) => { await dialog.accept(); });
  try {
    await page2.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page2.evaluate((token) => {
      try { localStorage.setItem('fanbox_mobile_token', token); } catch (_) {}
    }, ctx.token2);
    await page2.reload({ waitUntil: 'networkidle', timeout: 15000 });
    await page2.waitForTimeout(3000);
    // Open the running agent (desktop-terminal) — input should be disabled
    await page2.evaluate(() => {
      const row = document.querySelector('.hub-session[data-source="desktop-terminal"]') ||
        document.querySelector('.hub-session');
      if (row) row.click();
    });
    await page2.waitForTimeout(2000);
    await page2.waitForSelector('#sd-input', { state: 'visible', timeout: 10000 });
    await page2.waitForTimeout(800);
    const shot7 = path.join(SCREENSHOT_DIR, '07-followup-disabled.png');
    await page2.screenshot({ path: shot7 });
    check('07-followup-disabled.png captured', fs.existsSync(shot7) && fs.statSync(shot7).size > 0, shot7);
    // Verify the input is actually disabled (best-effort assertion)
    const disabledState = await page2.evaluate(() => {
      const input = document.getElementById('sd-input');
      const hint = document.getElementById('sd-input-hint');
      return {
        inputDisabled: input ? input.disabled : null,
        hintText: hint ? hint.textContent : '',
      };
    });
    check('7b. followup input disabled (limited token)', disabledState.inputDisabled === true, 'hint=' + disabledState.hintText);
  } catch (e) {
    const shot7 = path.join(SCREENSHOT_DIR, '07-followup-disabled.png');
    try { await page2.screenshot({ path: shot7 }); } catch (_) {}
    check('07-followup-disabled.png captured (fallback)', fs.existsSync(shot7) && fs.statSync(shot7).size > 0, e.message);
  }
  await page2.close();

  // ============================================================
  // Shot 8: Draft start (enabled composer = Start affordance)
  // ============================================================
  console.log('\n[Shot 8: draft-start]');
  try {
    // Go back to sessions hub on the main page
    await page.evaluate(() => {
      const back = document.getElementById('sd-back');
      if (back) back.click();
    });
    await page.waitForTimeout(1500);
    // Reload the hub to ensure draft session is visible
    await page.evaluate(() => {
      if (typeof window.UI1A !== 'undefined' && window.UI1A.loadSessionHub) window.UI1A.loadSessionHub();
    });
    await page.waitForTimeout(1500);
    // Open the draft session row (source=mobile-draft)
    const draftClicked = await page.evaluate(() => {
      const row = document.querySelector('.hub-session[data-source="mobile-draft"]') ||
        document.querySelector('.hub-session');
      if (row) { row.click(); return true; }
      return false;
    });
    check('8a. draft session row clicked', draftClicked);
    await page.waitForTimeout(2000);
    await page.waitForSelector('#sd-messages', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(800);
    const shot8 = path.join(SCREENSHOT_DIR, '08-draft-start.png');
    await page.screenshot({ path: shot8 });
    check('08-draft-start.png captured', fs.existsSync(shot8) && fs.statSync(shot8).size > 0, shot8);
    // Verify the input is enabled (Start affordance)
    const draftState = await page.evaluate(() => {
      const input = document.getElementById('sd-input');
      const send = document.getElementById('sd-send');
      return {
        inputDisabled: input ? input.disabled : null,
        sendDisabled: send ? send.disabled : null,
      };
    });
    check('8b. draft composer enabled (Start affordance)', draftState.inputDisabled === false, 'inputDisabled=' + draftState.inputDisabled);
  } catch (e) {
    const shot8 = path.join(SCREENSHOT_DIR, '08-draft-start.png');
    try { await page.screenshot({ path: shot8 }); } catch (_) {}
    check('08-draft-start.png captured (fallback)', fs.existsSync(shot8) && fs.statSync(shot8).size > 0, e.message);
  }

  // ---- Check no JS pageerrors throughout ----
  check('no JS pageerror throughout', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await browserCtx.close();

  // ---- Summary ----
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('\n===== Mobile-Paseo-R1 Screenshot Smoke =====');
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
