/* eslint-disable */
'use strict';
// Mobile-UI1A Step 5: Real mobile smoke + screenshots
//
// This script captures 390x844 mobile viewport screenshots for UI1A:
//   1. Pairing screen  -> uses the REAL mobile server on port 4580 (no token)
//   2. Home / Desktop Agent Detail / Mobile Session Draft Detail / Start timeline
//      -> uses an IN-PROCESS test server with a scoped test token
//
// Security note: the in-process server is a TEST server
// (MOBILE_AGENT_FORCE_STUB=1, tmp HOME, scoped test token issued via the real
// pair/confirm flow then expanded with session:start + desktop_control through
// the backend module's updateToken API). It does NOT bypass any production
// security logic; the real server on 4580 is only used for the unpaired
// pairing-screen shot.

const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CHROME_PROFILE = path.join(os.tmpdir(), 'fanbox-ui1a-edge-profile-' + Date.now());
fs.mkdirSync(CHROME_PROFILE, { recursive: true });
const REAL_MOBILE_URL = 'http://127.0.0.1:4580/mobile';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ---- In-process test server setup (mirrors verify-mobile-ui-smoke.js) ----
const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-ui1a-shots-' + Date.now());
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
const mobileSessions = mobile.mobileSessions;
const TEST_PORT = 14700;

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
  // Desktop terminal write provider for B2C follow-up
  mobile.setDesktopTerminalWriteProvider({
    sendInput: async (opts) => ({ ok: true, accepted: true })
  });

  // Mock desktop terminal provider (B2A/B2B)
  const mockTermId = 'mock-term-1';
  const testCwd = TMP_HOME;
  mobile.setDesktopTerminalProvider(() => [
    {
      id: mockTermId,
      cwd: testCwd,
      proc: 'claude',
      busy: true,
      lastActiveAt: Date.now(),
      tail: '\u001b[32m✓ Building project...\u001b[0m\nDone in 2.3s\n',
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

  // Pair
  const pair = await mobile.startPairCode();
  const pairRes = await request({
    path: '/api/mobile/pair/confirm',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ pairCode: pair.pairCode, deviceName: 'UI1A Screenshot Phone' }));
  const pairData = asJson(pairRes);
  if (!pairData || !pairData.token) throw new Error('pair failed: ' + pairRes.body);
  const token = pairData.token;
  const deviceId = pairData.deviceId;

  // Expand scopes for UI1A flows (session:start + desktop_control)
  if (deviceId && typeof mobile.updateToken === 'function') {
    const pairedTokenHash = mobile.sha256(token);
    await mobile.updateToken(pairedTokenHash, (rec) => {
      rec.scopes = ['read:status', 'read:files', 'session:start', 'desktop_control'];
      return rec;
    });
  }

  const auth = { 'Authorization': 'Bearer ' + token };

  // Create a draft session (for Mobile Session Draft Detail screenshot)
  const draftRes = await request({
    path: '/api/mobile/sessions/draft',
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  }, JSON.stringify({
    cwd: testCwd,
    agentId: 'claude',
    title: 'UI1A Screenshot Draft Task',
    initialMessage: 'Please create a test file for the screenshot.',
  }));
  const draftData = asJson(draftRes);
  if (!draftData || !draftData.ok) throw new Error('draft failed: ' + draftRes.body);
  const draftSessionId = draftData.session.id;

  return { server, token, deviceId, auth, draftSessionId };
}

async function fetchDesktopAgentId(auth) {
  const dash = asJson(await request({ path: '/api/mobile/dashboard', headers: auth }));
  if (!dash || !Array.isArray(dash.desktopContinuableAgents) || dash.desktopContinuableAgents.length === 0) {
    return null;
  }
  return dash.desktopContinuableAgents[0].id;
}

async function main() {
  console.log('Mobile-UI1A Screenshot Smoke');
  console.log('TMP_HOME=' + TMP_HOME);
  console.log('SCREENSHOT_DIR=' + SCREENSHOT_DIR);

  // ---- Verify real server is up for pairing screenshot ----
  let realServerUp = false;
  try {
    const realInfo = asJson(await new Promise((resolve) => {
      http.get('http://127.0.0.1:4580/api/mobile/info', (res) => {
        let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b }));
      }).on('error', () => resolve({ status: 0, body: '' }));
    }));
    realServerUp = !!(realInfo && realInfo.ok === true && realInfo.auth && realInfo.auth.paired === false);
  } catch (_) { /* ignore */ }
  check('real mobile server on 4580 is up and unpaired (for pairing screenshot)', realServerUp);

  // ---- Setup in-process test server ----
  const ctx = await setupTestServer();
  console.log('test server listening on ' + TEST_PORT);
  console.log('draft session: ' + ctx.draftSessionId);

  // ---- Launch browser (persistent context to avoid user-data-dir conflicts) ----
  // Use a single persistent context; localStorage is per-origin so the real
  // server (127.0.0.1:4580) and test server (127.0.0.1:14700) won't clash.
  let browserCtx;
  try {
    browserCtx = await chromium.launchPersistentContext(CHROME_PROFILE, {
      executablePath: CHROME_PATH,
      headless: true,
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (e) {
    console.log('FATAL: cannot launch browser: ' + e.message);
    process.exit(2);
  }

  // ============================================================
  // Shot 1: Pairing screen (REAL server, no token)
  // ============================================================
  console.log('\n[Shot 1: Pairing screen @ real server 4580]');
  if (realServerUp) {
    const page = await browserCtx.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    let resp;
    try {
      resp = await page.goto(REAL_MOBILE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    } catch (e) {
      console.log('  navigation error: ' + e.message);
    }
    check('1a. /mobile loads (HTTP 200)', resp && resp.status() === 200, resp ? 'status=' + resp.status() : 'no resp');
    await page.waitForTimeout(1500);
    check('1b. no JS pageerror on pairing screen', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    check('1c. pairing screen visible', /pair|配对|pairing|code|码|connect|连接/i.test(bodyText), bodyText.substring(0, 120));
    const overflow = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth
    }));
    check('1d. no horizontal overflow at 390px (pairing)', overflow.sw <= overflow.cw + 2, 'sw=' + overflow.sw + ' cw=' + overflow.cw);
    const shotPath = path.join(SCREENSHOT_DIR, '01-pairing-390x844.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    check('1e. pairing screenshot saved', fs.existsSync(shotPath), shotPath);
    await page.close();
  } else {
    console.log('  SKIPPED: real server not available');
  }

  // ============================================================
  // Shots 2-6: In-process test server with scoped token
  // ============================================================
  const page = await browserCtx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  // Auto-accept confirm/alert dialogs (start button uses confirm("确认启动 Agent？"))
  page.on('dialog', async (dialog) => { await dialog.accept(); });

  const TEST_URL = 'http://127.0.0.1:' + TEST_PORT + '/mobile';

  // Navigate first (origin must exist before localStorage can be set)
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  // Inject token into localStorage, then reload to trigger restoreToken -> showApp
  await page.evaluate((token) => {
    try { localStorage.setItem('fanbox_mobile_token', token); } catch (_) {}
  }, ctx.token);

  // ============================================================
  // Shot 2: Home (Contract Cockpit)
  // ============================================================
  console.log('\n[Shot 2: Home @ test server ' + TEST_PORT + ']');
  let resp;
  try {
    resp = await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    console.log('  navigation error: ' + e.message);
  }
  check('2a. /mobile loads (HTTP 200)', resp && resp.status() === 200, resp ? 'status=' + resp.status() : 'no resp');
  await page.waitForTimeout(2500); // allow token restore + app-state + dashboard fetch + render
  check('2b. no JS pageerror on Home', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  const unexpectedConsole = consoleErrors.filter(e => !/401|unauthorized|Failed to fetch|NetworkError|ERR|favicon|404.*Not Found/i.test(e));
  check('2c. no unexpected console errors on Home', unexpectedConsole.length === 0, unexpectedConsole.slice(0, 3).join(' | '));

  // Confirm Home is the active view
  const homeActive = await page.evaluate(() => {
    const v = document.querySelector('[data-view="home-cockpit"]');
    return v && v.classList.contains('is-active') && !v.hidden;
  });
  check('2d. home-cockpit view is active', homeActive);

  // Confirm Home consumed app-state + dashboard (check rendered content)
  const homeRendered = await page.evaluate(() => {
    const conn = document.getElementById('c-connection');
    const desk = document.getElementById('c-desktop-list');
    const mobi = document.getElementById('c-mobile-list');
    return {
      connText: conn ? conn.innerText.substring(0, 200) : '(no c-connection)',
      deskChildren: desk ? desk.children.length : -1,
      mobiChildren: mobi ? mobi.children.length : -1,
    };
  });
  check('2e. c-connection rendered', homeRendered.connText && homeRendered.connText.length > 0, homeRendered.connText.substring(0, 80));
  check('2f. c-desktop-list has rendered cards', homeRendered.deskChildren >= 1, 'children=' + homeRendered.deskChildren);
  check('2g. c-mobile-list has rendered cards', homeRendered.mobiChildren >= 1, 'children=' + homeRendered.mobiChildren);

  const overflow2 = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth
  }));
  check('2h. no horizontal overflow at 390px (Home)', overflow2.sw <= overflow2.cw + 2, 'sw=' + overflow2.sw + ' cw=' + overflow2.cw);

  const shot2 = path.join(SCREENSHOT_DIR, '02-home-390x844.png');
  await page.screenshot({ path: shot2, fullPage: false });
  check('2i. Home screenshot saved', fs.existsSync(shot2), shot2);

  // ============================================================
  // Shot 3: Desktop Agent Detail
  // ============================================================
  console.log('\n[Shot 3: Desktop Agent Detail]');
  const desktopAgentId = await fetchDesktopAgentId(ctx.auth);
  check('3a. desktop agent id resolved', !!desktopAgentId, 'id=' + desktopAgentId);
  if (desktopAgentId) {
    // Go back to Home first, then click the first desktop card
    await page.evaluate(() => {
      const back = document.getElementById('app-back');
      if (back && !back.hidden) back.click();
    });
    await page.waitForTimeout(1000);
    // Click the first .desk-card (real UI interaction)
    const cardClicked = await page.evaluate(() => {
      const card = document.querySelector('.desk-card');
      if (card) { card.click(); return true; }
      return false;
    });
    check('3b. desktop agent card clicked', cardClicked);
    await page.waitForTimeout(2000); // allow timeline fetch + render

    const detailActive = await page.evaluate(() => {
      const v = document.querySelector('[data-view="agent-detail"]');
      return v && v.classList.contains('is-active') && !v.hidden;
    });
    check('3c. agent-detail view is active', detailActive);

    const detailRendered = await page.evaluate(() => {
      const header = document.getElementById('d-header');
      const timeline = document.getElementById('d-timeline');
      const input = document.getElementById('d-input');
      const sendBtn = document.getElementById('d-send');
      return {
        headerText: header ? header.innerText.substring(0, 200) : '(no d-header)',
        timelineChildren: timeline ? timeline.children.length : -1,
        inputExists: !!input,
        sendExists: !!sendBtn,
        sendDisabled: sendBtn ? sendBtn.disabled : null,
      };
    });
    check('3d. d-header rendered', detailRendered.headerText && detailRendered.headerText.length > 0, detailRendered.headerText.substring(0, 80));
    check('3e. d-timeline has events', detailRendered.timelineChildren >= 1, 'children=' + detailRendered.timelineChildren);
    check('3f. d-input exists', detailRendered.inputExists);
    check('3g. d-send exists', detailRendered.sendExists);
    // canSendFollowup should be true (desktop_control scope granted), so send should NOT be disabled
    check('3h. d-send enabled (desktop_control scope granted)', detailRendered.sendDisabled === false, 'disabled=' + detailRendered.sendDisabled);

    const overflow3 = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth
    }));
    check('3i. no horizontal overflow at 390px (Desktop Detail)', overflow3.sw <= overflow3.cw + 2, 'sw=' + overflow3.sw + ' cw=' + overflow3.cw);

    const shot3 = path.join(SCREENSHOT_DIR, '03-desktop-agent-detail-390x844.png');
    await page.screenshot({ path: shot3, fullPage: false });
    check('3j. Desktop Agent Detail screenshot saved', fs.existsSync(shot3), shot3);
  }

  // ============================================================
  // Shot 4: Mobile Session Draft Detail
  // ============================================================
  console.log('\n[Shot 4: Mobile Session Draft Detail]');
  // Go back to Home first
  await page.evaluate(() => {
    const back = document.getElementById('app-back');
    if (back && !back.hidden) back.click();
  });
  await page.waitForTimeout(1500);

  // Click the first .mobi-card-info (real UI interaction; onclick is on .mobi-card-info)
  const draftClicked = await page.evaluate(() => {
    const card = document.querySelector('.mobi-card-info');
    if (card) { card.click(); return true; }
    return false;
  });
  check('4a. mobile session card clicked (draft)', draftClicked);
  await page.waitForTimeout(2000);

  const draftDetail = await page.evaluate(() => {
    const header = document.getElementById('d-header');
    const timeline = document.getElementById('d-timeline');
    const startBtn = document.getElementById('d-start');
    const startZone = document.getElementById('d-start-zone');
    return {
      headerText: header ? header.innerText.substring(0, 200) : '(no d-header)',
      timelineChildren: timeline ? timeline.children.length : -1,
      startExists: !!startBtn,
      startDisabled: startBtn ? startBtn.disabled : null,
      startZoneVisible: startZone ? !startZone.hidden : false,
    };
  });
  check('4b. d-header rendered (draft)', draftDetail.headerText && draftDetail.headerText.length > 0, draftDetail.headerText.substring(0, 80));
  check('4c. d-timeline has session_created event', draftDetail.timelineChildren >= 1, 'children=' + draftDetail.timelineChildren);
  check('4d. d-start exists (draft)', draftDetail.startExists);
  // session:start scope granted, so start should be enabled
  check('4e. d-start enabled (session:start scope granted)', draftDetail.startDisabled === false, 'disabled=' + draftDetail.startDisabled);

  const overflow4 = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth
  }));
  check('4f. no horizontal overflow at 390px (Draft Detail)', overflow4.sw <= overflow4.cw + 2, 'sw=' + overflow4.sw + ' cw=' + overflow4.cw);

  const shot4 = path.join(SCREENSHOT_DIR, '04-mobile-session-draft-detail-390x844.png');
  await page.screenshot({ path: shot4, fullPage: false });
  check('4g. Mobile Session Draft Detail screenshot saved', fs.existsSync(shot4), shot4);

  // ============================================================
  // Shot 5: Start -> timeline with agent_start_requested/started/completed
  // ============================================================
  console.log('\n[Shot 5: Start -> timeline]');
  // Click the start button via the UI
  const startClicked = await page.evaluate(() => {
    const btn = document.getElementById('d-start');
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  });
  check('5a. d-start clicked', startClicked);
  await page.waitForTimeout(3000); // allow start + sync stub runner + timeline refresh

  const afterStart = await page.evaluate(() => {
    const timeline = document.getElementById('d-timeline');
    const text = timeline ? timeline.innerText : '';
    return {
      timelineChildren: timeline ? timeline.children.length : -1,
      hasStartRequested: /启动请求已发送|agent_start_requested/i.test(text),
      hasStarted: /Agent 已启动|agent_started/i.test(text),
      hasCompleted: /Agent 已完成|agent_completed/i.test(text),
      textSample: text.substring(0, 400),
    };
  });
  check('5b. timeline has events after start', afterStart.timelineChildren >= 1, 'children=' + afterStart.timelineChildren);
  check('5c. timeline shows agent_start_requested', afterStart.hasStartRequested, afterStart.textSample.substring(0, 120));
  check('5d. timeline shows agent_started', afterStart.hasStarted);
  check('5e. timeline shows agent_completed', afterStart.hasCompleted);

  const overflow5 = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth
  }));
  check('5f. no horizontal overflow at 390px (Start timeline)', overflow5.sw <= overflow5.cw + 2, 'sw=' + overflow5.sw + ' cw=' + overflow5.cw);

  const shot5 = path.join(SCREENSHOT_DIR, '05-start-timeline-390x844.png');
  await page.screenshot({ path: shot5, fullPage: false });
  check('5g. Start timeline screenshot saved', fs.existsSync(shot5), shot5);

  // ============================================================
  // Shot 6 (bonus): 401 -> back to pairing
  // ============================================================
  console.log('\n[Shot 6: 401 -> pairing screen]');
  // Clear token and reload to simulate token loss -> should show pairing
  await page.evaluate(() => {
    try { localStorage.removeItem('fanbox_mobile_token'); } catch (_) {}
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const pairVisible = await page.evaluate(() => {
    const ps = document.getElementById('pair-screen');
    return ps && !ps.hidden;
  });
  check('6a. pair-screen visible after token cleared', pairVisible);
  const shot6 = path.join(SCREENSHOT_DIR, '06-401-back-to-pairing-390x844.png');
  await page.screenshot({ path: shot6, fullPage: false });
  check('6b. 401 pairing screenshot saved', fs.existsSync(shot6), shot6);

  await browserCtx.close();

  // ---- Summary ----
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('\n===== Mobile-UI1A Screenshot Smoke =====');
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
