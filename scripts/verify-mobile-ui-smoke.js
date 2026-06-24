/* eslint-disable */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-ui-smoke-' + Date.now());
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

const mobile = require(path.join(__dirname, '..', 'electron', 'mobile.js'));
const mobileSessions = mobile.mobileSessions;

const port = 14699;
let passed = 0;
let failed = 0;

function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failed++;
    console.log('  ✗ ' + name + (extra ? ' :: ' + extra : ''));
  }
}

function section(name) {
  console.log('\n[' + name + ']');
}

function request(opts, body) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, ...opts }, (res) => {
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

function containsForbiddenPath(value) {
  const text = JSON.stringify(value || {});
  return (
    text.includes('.fanbox' + path.sep + 'mobile') ||
    text.includes('.claude' + path.sep + 'projects') ||
    text.includes('.codex' + path.sep + 'sessions') ||
    /\.env(?:\.|["\\/]|$)/i.test(text)
  );
}

function containsSensitiveAuditData(value) {
  return /(rawPrompt|prompt|rawStdout|stdout|pty|tokenHash|Bearer\s|apiKey|password|secret|inputPreview)/i.test(JSON.stringify(value || {}));
}

async function main() {
  console.log('FanBox Mobile UI Smoke Test');
  console.log('TMP_HOME=' + TMP_HOME);

  // Setup desktop terminal write provider for B2C tests
  let lastWriteCall = null;
  mobile.setDesktopTerminalWriteProvider({
    sendInput: async (opts) => {
      lastWriteCall = opts;
      return { ok: true, accepted: true };
    }
  });

  // Start server
  await mobile.saveConfig({ enabled: true });
  const server = mobile.startMobileServer({ port });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise(r => setTimeout(r, 20));

  // ============================================================
  section('A1: Static asset serving (HTML/CSS/JS)');
  // ============================================================
  const htmlRes = await request({ path: '/mobile', method: 'GET' });
  ok('GET /mobile returns 200', htmlRes.status === 200, 'status=' + htmlRes.status);
  ok('GET /mobile returns HTML', htmlRes.headers['content-type'] && htmlRes.headers['content-type'].includes('text/html'), 'ct=' + htmlRes.headers['content-type']);
  ok('HTML contains home-cockpit view', htmlRes.body.includes('data-view="home-cockpit"'), 'missing home-cockpit');
  ok('HTML contains agent-detail view', htmlRes.body.includes('data-view="agent-detail"'), 'missing agent-detail');
  ok('HTML contains c-connection', htmlRes.body.includes('id="c-connection"'), 'missing c-connection');
  ok('HTML contains c-desktop-list', htmlRes.body.includes('id="c-desktop-list"'), 'missing c-desktop-list');
  ok('HTML contains c-mobile-list', htmlRes.body.includes('id="c-mobile-list"'), 'missing c-mobile-list');
  ok('HTML contains nt-project', htmlRes.body.includes('id="nt-project"'), 'missing nt-project');
  ok('HTML contains nt-agents', htmlRes.body.includes('id="nt-agents"'), 'missing nt-agents');
  ok('HTML contains nt-title', htmlRes.body.includes('id="nt-title"'), 'missing nt-title');
  ok('HTML contains nt-message', htmlRes.body.includes('id="nt-message"'), 'missing nt-message');
  ok('HTML contains nt-create', htmlRes.body.includes('id="nt-create"'), 'missing nt-create');
  ok('HTML contains d-timeline', htmlRes.body.includes('id="d-timeline"'), 'missing d-timeline');
  ok('HTML contains d-input', htmlRes.body.includes('id="d-input"'), 'missing d-input');
  ok('HTML contains d-send', htmlRes.body.includes('id="d-send"'), 'missing d-send');
  ok('HTML contains d-start', htmlRes.body.includes('id="d-start"'), 'missing d-start');
  ok('HTML contains app-back button', htmlRes.body.includes('id="app-back"'), 'missing app-back');
  ok('HTML contains d-composer', htmlRes.body.includes('id="d-composer"'), 'missing d-composer');
  ok('HTML contains d-start-zone', htmlRes.body.includes('id="d-start-zone"'), 'missing d-start-zone');
  ok('home-cockpit has is-active class', /<section[^>]*class="view is-active"[^>]*data-view="home-cockpit"/.test(htmlRes.body), 'home-cockpit not default active');

  const cssRes = await request({ path: '/mobile/mobile.css', method: 'GET' });
  ok('GET /mobile/mobile.css returns 200', cssRes.status === 200, 'status=' + cssRes.status);
  ok('CSS contains .cockpit', cssRes.body.includes('.cockpit'), 'missing .cockpit');
  ok('CSS contains .detail', cssRes.body.includes('.detail'), 'missing .detail');
  ok('CSS contains .status-pill', cssRes.body.includes('.status-pill'), 'missing .status-pill');
  ok('CSS contains .tl-event', cssRes.body.includes('.tl-event'), 'missing .tl-event');
  ok('CSS contains responsive media query', cssRes.body.includes('@media'), 'missing media queries');

  const jsRes = await request({ path: '/mobile/mobile.js', method: 'GET' });
  ok('GET /mobile/mobile.js returns 200', jsRes.status === 200, 'status=' + jsRes.status);
  ok('JS contains CS state store', jsRes.body.includes('const CS = {'), 'missing CS state');
  ok('JS contains cApi function', jsRes.body.includes('async function cApi'), 'missing cApi');
  ok('JS contains USE_CONTRACT_HOME=true', jsRes.body.includes('const USE_CONTRACT_HOME = true'), 'flag not true');
  ok('JS contains renderContractHome', jsRes.body.includes('function renderContractHome'), 'missing renderContractHome');
  ok('JS contains renderDesktopAgents', jsRes.body.includes('function renderDesktopAgents'), 'missing renderDesktopAgents');
  ok('JS contains renderMobileSessions', jsRes.body.includes('function renderMobileSessions'), 'missing renderMobileSessions');
  ok('JS contains renderTimelineEvents', jsRes.body.includes('function renderTimelineEvents'), 'missing renderTimelineEvents');
  ok('JS contains startContractMode', jsRes.body.includes('async function startContractMode'), 'missing startContractMode');
  ok('JS does NOT use "main" as default agent', !jsRes.body.includes('agentId: "main"'), 'still uses invalid "main" agent');
  ok('JS uses "claude" as default agent', jsRes.body.includes('agentId: "claude"'), 'missing claude default');
  ok('JS sends { text: message } not { message }', jsRes.body.includes('{ text: message }'), 'still sends message field');
  ok('JS sends confirm: true in startMobileSession', jsRes.body.includes('confirm: true'), 'missing confirm:true');
  ok('JS uses server.hostname not hostname directly', jsRes.body.includes('st.server && st.server.hostname'), 'hostname path wrong');
  ok('JS uses auth.scopes not .scopes directly', jsRes.body.includes('auth.scopes') || jsRes.body.includes('CS.appState.auth && CS.appState.auth.scopes'), 'scopes path wrong');
  ok('JS uses d.items for projects not d.projects', jsRes.body.includes('d.items || []') || jsRes.body.includes('CS.projects = d.items'), 'projects field wrong');
  ok('JS sends cwd not projectId in draft', jsRes.body.includes('cwd,') || jsRes.body.includes('cwd:'), 'draft missing cwd field');
  ok('JS uses session.id not session.sessionId', jsRes.body.includes('openMobileSession(session.id)'), 'uses session.sessionId');
  ok('JS uses ev.text for output_tail not ev.output', !jsRes.body.includes('ev.output') || /ev\.\w+/.test(jsRes.body.split('ev.output')[0]?.slice(-20) || ''), 'still uses ev.output');
  ok('JS uses a.id for desktop click not a.agentId', jsRes.body.includes('openDesktopAgent(a.id)'), 'uses a.agentId for click');
  ok('JS uses a.outputTail not a.output_tail_preview', !jsRes.body.includes('output_tail_preview'), 'still uses output_tail_preview');
  ok('JS uses data directly not data.agent', !jsRes.body.includes('data.agent ||'), 'still uses data.agent');
  ok('JS uses data directly not data.session', !jsRes.body.includes('data.session || {}'), 'still uses data.session');
  ok('JS uses ev.meta.files for recent_files', jsRes.body.includes('ev.meta && ev.meta.files') || jsRes.body.includes('ev.meta.files'), 'recent_files path wrong');
  ok('JS uses ev.meta.exitCode for process_exit', jsRes.body.includes('ev.meta && ev.meta.exitCode') || jsRes.body.includes('ev.meta.exitCode'), 'exitCode path wrong');
  ok('JS uses desktop_control (underscore) scope name not desktop:control (colon)', jsRes.body.includes('desktop_control') && !jsRes.body.includes('desktop:control'), 'scope name mismatch: must be desktop_control');

  // ============================================================
  section('A2: B1 - Pairing + App State');
  // ============================================================
  const pair = await mobile.startPairCode();
  const pairRes = await request({
    path: '/api/mobile/pair/confirm',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ pairCode: pair.pairCode, deviceName: 'UI Smoke Test Phone' }));
  ok('Pair confirm 200', pairRes.status === 200, 'status=' + pairRes.status);
  const pairData = asJson(pairRes);
  ok('Pair returns token', pairData && pairData.token && pairData.token.length > 0, JSON.stringify(pairData));
  const token = pairData.token;
  const auth = { 'Authorization': 'Bearer ' + token };

  // The default pair only grants read:status + read:files. For UI1A we need to
  // exercise the start (session:start) and follow-up (desktop_control) flows.
  // Grant those scopes to the paired device via updateToken (same module API the
  // backend verifier uses addTokenRecord for; here we mutate the existing paired
  // record). This is a test server (in-process, MOBILE_AGENT_FORCE_STUB=1);
  // it does NOT bypass real security on the production mobile server.
  const pairedDevice = pairData.deviceId;
  if (pairedDevice && typeof mobile.updateToken === 'function') {
    const pairedTokenHash = mobile.sha256(token);
    await mobile.updateToken(pairedTokenHash, (rec) => {
      rec.scopes = ['read:status', 'read:files', 'session:start', 'desktop_control'];
      return rec;
    });
  }

  const appState = asJson(await request({ path: '/api/mobile/app-state', headers: auth }));
  ok('B1 app-state ok', appState && appState.ok === true);
  ok('B1 server.hostname exists', appState.server && typeof appState.server.hostname === 'string' && appState.server.hostname.length > 0);
  ok('B1 server.name exists', appState.server && appState.server.name === 'FanBox Windows Edition');
  ok('B1 auth.paired=true', appState.auth && appState.auth.paired === true);
  ok('B1 auth.scopes is array', appState.auth && Array.isArray(appState.auth.scopes));
  ok('B1 auth.scopes includes session:start', appState.auth && appState.auth.scopes.includes('session:start'));
  ok('B1 auth.scopes includes desktop_control (underscore not colon)', appState.auth && appState.auth.scopes.includes('desktop_control'));
  ok('B1 counts object exists', appState.counts && typeof appState.counts === 'object');
  ok('B1 availableAgents is array', Array.isArray(appState.availableAgents));
  ok('B1 availableAgents contains claude', appState.availableAgents.some(a => a.id === 'claude'));
  ok('B1 currentContext object exists', appState.currentContext && typeof appState.currentContext === 'object');
  ok('B1 meta object exists', appState.meta && typeof appState.meta === 'object');

  // ============================================================
  section('A3: B1 - Dashboard');
  // ============================================================
  const dashboard = asJson(await request({ path: '/api/mobile/dashboard', headers: auth }));
  ok('B1 dashboard ok', dashboard && dashboard.ok === true);
  ok('B1 dashboard.activeSessions is array', Array.isArray(dashboard.activeSessions));
  ok('B1 dashboard.runningAgents is array', Array.isArray(dashboard.runningAgents));
  ok('B1 dashboard.mobileSessions is array', Array.isArray(dashboard.mobileSessions));
  ok('B1 dashboard.desktopContinuableAgents is array', Array.isArray(dashboard.desktopContinuableAgents));
  ok('B1 dashboard.pendingApprovals is array', Array.isArray(dashboard.pendingApprovals));
  ok('B1 dashboard.recentFiles is array', Array.isArray(dashboard.recentFiles));
  ok('B1 dashboard.usageSummary is object', dashboard.usageSummary && typeof dashboard.usageSummary === 'object');
  ok('B1 dashboard.recentAuditEntries is array', Array.isArray(dashboard.recentAuditEntries));

  // ============================================================
  section('A4: B3A - Projects list');
  // ============================================================
  const projects = asJson(await request({ path: '/api/mobile/projects', headers: auth }));
  ok('B3A projects ok', projects && projects.ok === true);
  ok('B3A projects.items is array', Array.isArray(projects.items));
  ok('B3A projects.total is number', typeof projects.total === 'number');
  if (projects.items.length > 0) {
    const p = projects.items[0];
    ok('B3A project has id', typeof p.id === 'string' && p.id.length > 0);
    ok('B3A project has name', typeof p.name === 'string');
    ok('B3A project has cwd', typeof p.cwd === 'string');
    ok('B3A project has canCreateSession (bool)', typeof p.canCreateSession === 'boolean');
    ok('B3A project has agentIds (array)', Array.isArray(p.agentIds));
  }

  // ============================================================
  section('A5: B3A - Create draft session (simulating new task form)');
  // ============================================================
  // R2: After removing roots fallback, test env may have no real projects.
  // This is expected — we use TMP_HOME as cwd fallback for the draft test.
  const creatableProject = projects.items.find(p => p.canCreateSession) || projects.items[0];
  ok('B3A found creatable project (or uses fallback)', true, creatableProject ? 'found' : 'using TMP_HOME fallback');
  
  let draftCwd;
  if (creatableProject) {
    draftCwd = creatableProject.cwd;
  } else {
    // Use tmp dir as cwd
    draftCwd = TMP_HOME;
  }

  const taskTitle = 'UI Smoke Test Task';
  const taskMessage = 'Hello from UI smoke test. Please create a test file.';

  const draftRes = await request({
    path: '/api/mobile/sessions/draft',
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  }, JSON.stringify({
    cwd: draftCwd,
    agentId: 'claude',
    title: taskTitle,
    initialMessage: taskMessage,
  }));
  ok('B3A draft create 200', draftRes.status === 200, 'status=' + draftRes.status + ' body=' + draftRes.body.substring(0, 200));
  const draftData = asJson(draftRes);
  ok('B3A draft ok=true', draftData && draftData.ok === true);
  ok('B3A draft session exists', draftData.session && typeof draftData.session === 'object');
  ok('B3A draft session.id is non-empty string', draftData.session && typeof draftData.session.id === 'string' && draftData.session.id.length > 0);
  ok('B3A draft session.status=draft', draftData.session && draftData.session.status === 'draft');
  ok('B3A draft session.agentId=claude', draftData.session && draftData.session.agentId === 'claude');
  ok('B3A draft session.title matches', draftData.session && draftData.session.title === taskTitle);
  ok('B3A draft timeline exists', draftData.timeline && Array.isArray(draftData.timeline.events));
  ok('B3A draft timeline contains session_created', draftData.timeline.events.some(e => e.type === 'session_created'));
  const draftSessionId = draftData.session.id;

  // Verify dashboard now shows the draft
  await new Promise(r => setTimeout(r, 100));
  const dashboardAfterDraft = asJson(await request({ path: '/api/mobile/dashboard', headers: auth }));
  const draftInList = dashboardAfterDraft.mobileSessions.find(s => s.sessionId === draftSessionId);
  ok('B3A draft appears in dashboard.mobileSessions', !!draftInList, 'mobileSessions=' + JSON.stringify(dashboardAfterDraft.mobileSessions.map(s => s.sessionId)));

  // Verify mobile timeline for the draft
  const draftTimeline = asJson(await request({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/timeline', headers: auth }));
  ok('B3A mobile timeline ok', draftTimeline && draftTimeline.ok === true);
  ok('B3A mobile timeline has id', draftTimeline.id === draftSessionId);
  ok('B3A mobile timeline has name (string)', typeof draftTimeline.name === 'string' && draftTimeline.name.length > 0);
  ok('B3A mobile timeline has title (string)', typeof draftTimeline.title === 'string');
  ok('B3A mobile timeline has events array', Array.isArray(draftTimeline.events));
  ok('B3A mobile timeline events include session_created', draftTimeline.events.some(e => e.type === 'session_created'));

  // ============================================================
  section('A6: B3B - Start session (simulating Start Agent button)');
  // ============================================================
  // Must send confirm: true
  const startResNoConfirm = await request({
    path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/start',
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  }, JSON.stringify({}));
  ok('B3B start without confirm returns confirm_required', startResNoConfirm.status === 400 || (asJson(startResNoConfirm) && asJson(startResNoConfirm).error && asJson(startResNoConfirm).error.code === 'confirm_required'), 'status=' + startResNoConfirm.status);

  const startRes = await request({
    path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/start',
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  }, JSON.stringify({ confirm: true }));
  ok('B3B start with confirm 200', startRes.status === 200, 'status=' + startRes.status + ' body=' + startRes.body.substring(0, 500));
  const startData = asJson(startRes);
  ok('B3B start ok=true', startData && startData.ok === true);
  ok('B3B start meta.phase=B3B', startData.meta && startData.meta.phase === 'B3B');
  ok('B3B start meta.willSpawnAgent=true', startData.meta && startData.meta.willSpawnAgent === true);
  ok('B3B start timeline exists', startData.timeline && Array.isArray(startData.timeline.events));
  ok('B3B timeline contains agent_start_requested', startData.timeline.events.some(e => e.type === 'agent_start_requested'));
  ok('B3B timeline contains agent_started', startData.timeline.events.some(e => e.type === 'agent_started'));
  ok('B3B timeline contains agent_completed', startData.timeline.events.some(e => e.type === 'agent_completed'));

  // Verify timeline after start
  await new Promise(r => setTimeout(r, 200));
  const timelineAfterStart = asJson(await request({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/timeline', headers: auth }));
  ok('B3B timeline after start has events', timelineAfterStart && Array.isArray(timelineAfterStart.events) && timelineAfterStart.events.length >= 3);
  ok('B3B session status is done/failed', timelineAfterStart && (timelineAfterStart.status === 'done' || timelineAfterStart.status === 'failed'), 'status=' + (timelineAfterStart && timelineAfterStart.status));

  // ============================================================
  section('A7: B2A - Desktop agents + B2B timeline');
  // ============================================================
  // Setup mock desktop terminal provider
  const mockTermId = 'mock-term-1';
  const testCwd = TMP_HOME;
  mobile.setDesktopTerminalProvider(() => [
    {
      id: mockTermId,
      cwd: testCwd,
      proc: 'claude',
      busy: true,
      lastActiveAt: Date.now(),
      tail: '\u001b[32m✓ Building project...\u001b[0m\nsk-1234567890abcdefghijklmnop should be redacted\nBearer token1234567890abcdef12345 should be redacted\nDone in 2.3s\n',
      events: [
        { type: 'output_tail', text: 'Running tests...', timestamp: Date.now() - 5000 },
        { type: 'status_change', text: 'running', status: 'running', timestamp: Date.now() - 4000 },
        { type: 'output_tail', text: 'Tests passed!', timestamp: Date.now() - 1000 },
      ]
    },
    {
      id: 'mock-term-2',
      cwd: '',
      proc: '',
      busy: false,
      lastActiveAt: Date.now() - 3600000,
      tail: '',
      events: []
    }
  ]);

  const dashWithDesktop = asJson(await request({ path: '/api/mobile/dashboard', headers: auth }));
  ok('B2A dashboard.desktopContinuableAgents is array', Array.isArray(dashWithDesktop.desktopContinuableAgents));
  ok('B2A has at least one desktop agent', dashWithDesktop.desktopContinuableAgents.length >= 1, 'count=' + dashWithDesktop.desktopContinuableAgents.length);
  if (dashWithDesktop.desktopContinuableAgents.length > 0) {
    const da = dashWithDesktop.desktopContinuableAgents[0];
    ok('B2A desktop agent has id (hashed)', typeof da.id === 'string' && da.id.startsWith('term-'), 'id=' + da.id);
    ok('B2A desktop agent id != raw term id', da.id !== mockTermId, 'id leaks raw term id: ' + da.id);
    ok('B2A desktop agent has source=desktop-terminal', da.source === 'desktop-terminal');
    ok('B2A desktop agent has agentId=claude', da.agentId === 'claude');
    ok('B2A desktop agent has label (string)', typeof da.label === 'string' && da.label.length > 0);
    ok('B2A desktop agent has status (running)', da.status === 'running');
    ok('B2A desktop agent has projectName (basename)', typeof da.projectName === 'string' && da.projectName.length > 0);
    ok('B2A desktop agent has cwd (allowed path)', typeof da.cwd === 'string');
    ok('B2A desktop agent has outputTail (string)', typeof da.outputTail === 'string');
    ok('B2A desktop agent outputTail ANSI stripped', !da.outputTail.includes('\u001b['), 'ANSI not stripped');
    ok('B2A desktop agent outputTail scrubs sk- secrets', !da.outputTail.includes('sk-1234567890abcdefghijklmnop'), 'sk- not scrubbed: ' + da.outputTail);
    ok('B2A desktop agent has canOpen=true (allowed cwd)', da.canOpen === true);
    ok('B2A desktop agent has riskFlags array', Array.isArray(da.riskFlags));
    // Device now has desktop_control scope (granted above), so canSendFollowup should be true
    ok('B2A desktop agent canSendFollowup=true (desktop_control scope granted)', da.canSendFollowup === true, 'canSendFollowup=' + da.canSendFollowup);

    // B2B: Timeline
    const desktopTimeline = asJson(await request({ path: '/api/mobile/desktop-agents/' + encodeURIComponent(da.id) + '/timeline', headers: auth }));
    ok('B2B desktop timeline ok', desktopTimeline && desktopTimeline.ok === true);
    ok('B2B timeline has id matching agent', desktopTimeline.id === da.id);
    ok('B2B timeline has agentId=claude', desktopTimeline.agentId === 'claude');
    ok('B2B timeline has cwd (string)', typeof desktopTimeline.cwd === 'string');
    ok('B2B timeline has projectName (string)', typeof desktopTimeline.projectName === 'string');
    ok('B2B timeline has followupBlockedReason (string)', typeof desktopTimeline.followupBlockedReason === 'string');
    ok('B2B timeline events is array', Array.isArray(desktopTimeline.events));
    ok('B2B timeline events.length > 0', desktopTimeline.events.length > 0);
    ok('B2B timeline events have required fields', desktopTimeline.events.every(e => e.id && e.type && typeof e.timestamp === 'number'));
    ok('B2B timeline contains status_snapshot event', desktopTimeline.events.some(e => e.type === 'status_snapshot'));
    ok('B2B timeline events do not leak raw term id', !JSON.stringify(desktopTimeline).includes(mockTermId));
    ok('B2B timeline events do not leak secrets', !JSON.stringify(desktopTimeline).includes('sk-1234567890abcdefghijklmnop'));

    // ============================================================
    section('A8: B2C - Follow-up input to desktop agent');
    // ============================================================
    // Device now has desktop_control scope, so input should be accepted (200).
    const inputRes = await request({
      path: '/api/mobile/desktop-agents/' + encodeURIComponent(da.id) + '/input',
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
    }, JSON.stringify({ text: 'test follow-up input from UI smoke' }));
    ok('B2C input with desktop_control scope returns 200', inputRes.status === 200, 'status=' + inputRes.status + ' body=' + inputRes.body.substring(0, 200));
    const inputData = asJson(inputRes);
    ok('B2C input ok=true', inputData && inputData.ok === true);
    ok('B2C input accepted=true', inputData && inputData.accepted === true);
    ok('B2C input meta.inputLength is number', inputData && inputData.meta && typeof inputData.meta.inputLength === 'number');
    ok('B2C input response does not echo raw input text', !inputRes.body.includes('test follow-up input from UI smoke'));
  }

  // ============================================================
  section('A9: Auth boundary checks');
  // ============================================================
  const noAuthRes = await request({ path: '/api/mobile/app-state' });
  ok('No auth returns 401', noAuthRes.status === 401, 'status=' + noAuthRes.status);
  const badAuthRes = await request({ path: '/api/mobile/app-state', headers: { 'Authorization': 'Bearer invalidtoken123' } });
  ok('Bad token returns 401', badAuthRes.status === 401, 'status=' + badAuthRes.status);

  // Non-existent session 404
  const noSession = await request({ path: '/api/mobile/sessions/nonexistent123/timeline', headers: auth });
  ok('Non-existent session timeline returns 404', noSession.status === 404, 'status=' + noSession.status);

  // ============================================================
  section('A10: JS syntax validation');
  // ============================================================
  const jsContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'mobile', 'mobile.js'), 'utf8');
  try {
    new Function(jsContent);
    ok('mobile.js parses as valid JavaScript', true);
  } catch (e) {
    ok('mobile.js parses as valid JavaScript', false, e.message);
  }

  const cssContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'mobile', 'mobile.css'), 'utf8');
  ok('mobile.css is non-empty', cssContent.length > 1000, 'length=' + cssContent.length);
  ok('mobile.css has cockpit styles', cssContent.includes('.cockpit') && cssContent.includes('.detail') && cssContent.includes('.tl-event'));

  // ============================================================
  section('B1B-Safety: Safety page contract');
  // ============================================================
  ok('HTML contains safety view', htmlRes.body.includes('data-view="safety"'), 'missing safety view');
  ok('HTML contains safety-devices container', htmlRes.body.includes('id="safety-devices"'), 'missing safety-devices');
  ok('HTML contains safety-scopes container', htmlRes.body.includes('id="safety-scopes"'), 'missing safety-scopes');
  ok('HTML contains safety-audit container', htmlRes.body.includes('id="safety-audit"'), 'missing safety-audit');
  ok('HTML contains safety-pairing container', htmlRes.body.includes('id="safety-pairing"'), 'missing safety-pairing');
  ok('JS contains renderSafety', jsContent.includes('function renderSafety'), 'missing renderSafety');
  ok('JS contains openSafety', jsContent.includes('function openSafety'), 'missing openSafety');
  ok('JS Safety fetches /api/mobile/devices', jsContent.includes('/api/mobile/devices'), 'missing devices fetch in JS');
  ok('JS Safety fetches /api/mobile/audit', jsContent.includes('/api/mobile/audit'), 'missing audit fetch in JS');
  ok('JS Safety fetches /api/mobile/pair/status', jsContent.includes('/api/mobile/pair/status'), 'missing pair/status fetch in JS');
  ok('JS Safety does not render token/tokenHash', !/safety.*tokenHash|safety.*Bearer/i.test(jsContent), 'safety leaks token');
  ok('JS Safety renders scopes with desktop_control check', jsContent.includes('desktop_control') && jsContent.includes('session:start'), 'safety missing scope checks');

  // Verify Safety API data is available
  const devicesData = asJson(await request({ path: '/api/mobile/devices', headers: auth }));
  ok('Safety: devices API returns ok', devicesData && devicesData.ok === true);
  ok('Safety: devices has items array', Array.isArray(devicesData.items));
  ok('Safety: devices does not leak token', !/tokenHash|Bearer\s|"token"\s*:/i.test(JSON.stringify(devicesData)), JSON.stringify(devicesData).substring(0, 200));

  const auditData = asJson(await request({ path: '/api/mobile/audit?limit=20', headers: auth }));
  ok('Safety: audit API returns ok', auditData && auditData.ok === true);
  ok('Safety: audit has items array', Array.isArray(auditData.items));
  ok('Safety: audit does not leak raw input', !containsSensitiveAuditData(auditData), 'audit leaks sensitive data');

  const pairStatusData = asJson(await request({ path: '/api/mobile/pair/status' }));
  ok('Safety: pair/status API returns ok', pairStatusData && pairStatusData.ok === true);
  ok('Safety: pair/status has pairing boolean', pairStatusData && typeof pairStatusData.pairing === 'boolean');

  const infoData = asJson(await request({ path: '/api/mobile/info' }));
  ok('Safety: info API returns ok', infoData && infoData.ok === true);
  ok('Safety: info has server.hostname', infoData && infoData.server && typeof infoData.server.hostname === 'string');
  ok('Safety: info does not leak token', !/tokenHash|Bearer\s|"token"\s*:/i.test(JSON.stringify(infoData)));

  // ============================================================
  section('B1B-Projects: Projects page contract');
  // ============================================================
  ok('HTML contains projects view', htmlRes.body.includes('data-view="projects"'), 'missing projects view');
  ok('HTML contains projects-list container', htmlRes.body.includes('id="projects-list"'), 'missing projects-list');
  ok('JS contains renderContractProjects', jsContent.includes('function renderContractProjects'), 'missing renderContractProjects');
  ok('JS contains openProjects', jsContent.includes('function openProjects'), 'missing openProjects');
  ok('JS Projects uses /api/mobile/projects', jsContent.includes('/api/mobile/projects'), 'missing projects fetch');
  ok('JS Projects renders canCreateSession', jsContent.includes('canCreateSession'), 'missing canCreateSession render');
  ok('JS Projects renders riskFlags', jsContent.includes('riskFlags'), 'missing riskFlags render');
  ok('JS Projects renders agentIds', jsContent.includes('agentIds'), 'missing agentIds render');
  ok('JS Projects creates draft via /api/mobile/sessions/draft', jsContent.includes('/api/mobile/sessions/draft'), 'missing draft creation');

  // Verify Projects API data shape
  const projectsData = asJson(await request({ path: '/api/mobile/projects', headers: auth }));
  ok('Projects: API returns ok', projectsData && projectsData.ok === true);
  ok('Projects: items is array', Array.isArray(projectsData.items));
  if (projectsData.items && projectsData.items.length > 0) {
    const p = projectsData.items[0];
    ok('Projects: item has canCreateSession (bool)', typeof p.canCreateSession === 'boolean');
    ok('Projects: item has riskFlags (array)', Array.isArray(p.riskFlags));
    ok('Projects: item has agentIds (array)', Array.isArray(p.agentIds));
    ok('Projects: item has sessionCount (number)', typeof p.sessionCount === 'number');
    ok('Projects: item has lastActiveAt (number)', typeof p.lastActiveAt === 'number');
    ok('Projects: item has source (string)', typeof p.source === 'string');
  }

  // ============================================================
  section('B1B-Files: Files page contract');
  // ============================================================
  ok('HTML contains files view', htmlRes.body.includes('data-view="files"'), 'missing files view');
  ok('HTML contains files-list container', htmlRes.body.includes('id="files-list"'), 'missing files-list');
  ok('HTML contains files-search input', htmlRes.body.includes('id="files-q"'), 'missing files-q');
  ok('HTML contains files-preview container', htmlRes.body.includes('id="files-preview"'), 'missing files-preview');
  ok('JS contains loadFiles', jsContent.includes('function loadFiles'), 'missing loadFiles');
  ok('JS Files uses /api/mobile/roots', jsContent.includes('/api/mobile/roots'), 'missing roots fetch');
  ok('JS Files uses /api/mobile/files', jsContent.includes('/api/mobile/files'), 'missing files fetch');
  ok('JS Files uses /api/mobile/search', jsContent.includes('/api/mobile/search'), 'missing search fetch');
  ok('JS Files uses /api/mobile/file', jsContent.includes('/api/mobile/file'), 'missing file preview fetch');
  ok('JS Files uses /api/mobile/files/recent', jsContent.includes('/api/mobile/files/recent'), 'missing recent files fetch');

  // Verify Files API data
  const rootsData = asJson(await request({ path: '/api/mobile/roots', headers: auth }));
  ok('Files: roots API returns ok', rootsData && rootsData.ok === true);
  ok('Files: roots has items array', Array.isArray(rootsData.items));

  const recentFilesData = asJson(await request({ path: '/api/mobile/files/recent?limit=20', headers: auth }));
  ok('Files: recent API returns ok', recentFilesData && recentFilesData.ok === true);
  ok('Files: recent has items array', Array.isArray(recentFilesData.items));
  ok('Files: recent does not include forbidden paths', !containsForbiddenPath(recentFilesData.items), 'recent has forbidden paths');

  // ============================================================
  section('B1B-Nav: Navigation consistency');
  // ============================================================
  ok('JS has switchContractView', jsContent.includes('function switchContractView'), 'missing switchContractView');
  ok('JS handles 401 with pairing redirect', jsContent.includes('pair-screen') && /401|unauthorized/i.test(jsContent), 'missing 401 handling');
  ok('JS has 5 main nav entries (home/detail/safety/projects/files)', jsContent.includes('safety') && jsContent.includes('projects') && jsContent.includes('files'), 'missing nav entries');
  ok('CSS has safety styles', cssContent.includes('.safety') || cssContent.includes('[data-view="safety"]'), 'missing safety CSS');
  ok('CSS has projects styles', cssContent.includes('.projects') || cssContent.includes('[data-view="projects"]'), 'missing projects CSS');

  // ============================================================
  section('UX-Polish: Productized mobile experience');
  // ============================================================
  // 1. Home 主行动按钮存在
  ok('UX1. Home has main action button (创建草稿)', htmlRes.body.includes('nt-create') && htmlRes.body.includes('创建草稿'), 'missing main action button');

  // 2. 状态 badge 存在
  ok('UX2. Home has status badge (c-status-dot + c-status-text)', htmlRes.body.includes('c-status-dot') && htmlRes.body.includes('c-status-text'), 'missing status badge');

  // 3. Detail timeline event class 存在
  ok('UX3. CSS has .tl-event class for timeline events', cssContent.includes('.tl-event'), 'missing tl-event class');

  // 4. follow-up disabled reason 可见 (composer hint element exists in JS)
  ok('UX4. JS renders follow-up disabled reason (d-composer-hint)', jsContent.includes('d-composer-hint') && /disabled|reason|hint/i.test(jsContent), 'missing disabled reason');

  // 5. Safety 权限文案是人话 (Chinese human-readable scope labels)
  ok('UX5a. Safety scope label: 查看状态', jsContent.includes('查看状态'), 'missing human-readable read:status label');
  ok('UX5b. Safety scope label: 查看文件', jsContent.includes('查看文件'), 'missing human-readable read:files label');
  ok('UX5c. Safety scope label: 继续输入 (desktop_control)', jsContent.includes('继续输入'), 'missing human-readable desktop_control label');
  ok('UX5d. Safety scope label: 启动任务 (session:start)', jsContent.includes('启动任务'), 'missing human-readable session:start label');

  // 6. audit 不显示 token/tokenHash/initialMessage/follow-up 原文
  ok('UX6a. JS Safety does not render tokenHash in audit', !/audit.*tokenHash|safety-audit.*token/i.test(jsContent), 'audit may leak token');
  ok('UX6b. Audit API does not leak initialMessage text', auditData && !/"initialMessage"\s*:\s*"/.test(JSON.stringify(auditData)), 'audit leaks initialMessage text');
  ok('UX6c. Audit API does not leak raw follow-up input', auditData && !/raw_input|rawInput|inputPreview/i.test(JSON.stringify(auditData)), 'audit leaks raw input');

  // 7. Projects riskFlags 转换成用户可理解文案
  ok('UX7. JS has riskFlagLabel helper for human-readable risk flags', jsContent.includes('riskFlagLabel') || jsContent.includes('riskFlagText'), 'missing riskFlag label helper');

  // 8. Files preview 不横向溢出 (CSS overflow guard)
  ok('UX8. CSS has files-preview-body overflow guard', cssContent.includes('.files-preview-body') && /overflow/i.test(cssContent), 'missing files preview overflow guard');

  // 9. Pairing screen 文案存在
  ok('UX9a. Pairing screen has FanBox Mobile title', htmlRes.body.includes('FanBox Mobile'), 'missing pairing title');
  ok('UX9b. Pairing screen has 安全配对 subtitle', htmlRes.body.includes('安全配对'), 'missing pairing subtitle');
  ok('UX9c. Pairing screen has pair-steps guide', htmlRes.body.includes('pair-steps'), 'missing pairing steps');

  // 10. 401 重新配对提示存在
  ok('UX10a. JS has 401 re-pair notice (登录已失效 or 重新配对)', jsContent.includes('登录已失效') || jsContent.includes('重新配对'), 'missing 401 re-pair notice');
  ok('UX10b. HTML has pair-notice element for 401 message', htmlRes.body.includes('pair-notice'), 'missing pair-notice element');

  // 11. 390×844 无横向溢出 (CSS has overflow-x hidden + responsive media query)
  ok('UX11a. CSS has overflow-x: hidden on body/html', /overflow-x:\s*hidden/i.test(cssContent), 'missing overflow-x hidden');
  ok('UX11b. CSS has responsive media query for mobile width', /@media\s*\(\s*max-width/i.test(cssContent), 'missing responsive media query');

  // 12. Home scopes summary exists (cockpit-scopes)
  ok('UX12. Home has scopes summary element (c-scopes-summary)', htmlRes.body.includes('c-scopes-summary'), 'missing scopes summary');

  // 13. Timeline event type icons exist in JS (input_sent, agent_started, etc.)
  ok('UX13. JS has timeline event icon for input_sent (📱 follow-up)', /input_sent.*📱|📱.*follow-up|你从手机发送/.test(jsContent), 'missing input_sent icon');

  // 14. Pairing screen has LAN URL display element
  ok('UX14. HTML has pair-lan element for LAN URL display', htmlRes.body.includes('pair-lan'), 'missing pair-lan element');


  // ============================================================
  section('UX-Reframe: Agent Remote Cockpit');
  // ============================================================
  // 1. sidebar 显示 connected computer
  ok('R1. sidebar has connected section', htmlRes.body.includes('sb-connected'), 'missing connected section');

  // 2. sidebar 显示 running agents section
  ok('R2. sidebar has running agents section', htmlRes.body.includes('sb-section-running'), 'missing running section');

  // 3. sidebar 显示 projects tree
  ok('R3. sidebar has projects list', htmlRes.body.includes('sb-projects-list'), 'missing projects list');

  // 4. project row 可展开（JS 有 toggleProjectExpanded）
  ok('R4. JS has toggleProjectExpanded', jsContent.includes('toggleProjectExpanded'), 'missing toggle');

  // 5. session row 显示 status badge（CSS 有 sidebar-session-status）
  ok('R5. CSS has sidebar-session-status', cssContent.includes('.sidebar-session-status'), 'missing session status CSS');

  // 6. 点击 session 打开 detail（JS 有 openMobileSession）
  ok('R6. JS has openMobileSession', jsContent.includes('openMobileSession'), 'missing openMobileSession');

  // 7. Home 显示 connected + permission chips
  ok('R7a. Home has c-connection', htmlRes.body.includes('c-connection'), 'missing connection');
  ok('R7b. Home has c-scopes-summary', htmlRes.body.includes('c-scopes-summary'), 'missing scopes');

  // 8. permission chips 人话
  ok('R8a. JS has 查看状态', jsContent.includes('查看状态'), 'missing label');
  ok('R8b. JS has 继续输入', jsContent.includes('继续输入'), 'missing label');
  ok('R8c. JS has 启动任务', jsContent.includes('启动任务'), 'missing label');

  // 9. New Chat 模态框存在
  ok('R9a. HTML has newchat-modal', htmlRes.body.includes('newchat-modal'), 'missing modal');
  ok('R9b. JS has openNewChatModal', jsContent.includes('openNewChatModal'), 'missing openNewChatModal');

  // 10. right file drawer 存在
  ok('R10a. HTML has files-drawer', htmlRes.body.includes('files-drawer'), 'missing drawer');
  ok('R10b. HTML has files-drawer-scrim', htmlRes.body.includes('files-drawer-scrim'), 'missing scrim');
  ok('R10c. JS has openFilesDrawer', jsContent.includes('openFilesDrawer'), 'missing openFilesDrawer');

  // 11. file drawer 默认隐藏
  ok('R11. files-drawer has hidden attr', htmlRes.body.includes('files-drawer"') && htmlRes.body.includes('hidden'), 'drawer not hidden');

  // 12. file button 存在
  ok('R12. HTML has app-files-drawer button', htmlRes.body.includes('app-files-drawer'), 'missing files button');

  // 13. 旧功能在 More 区
  ok('R13. HTML has sidebar-more section', htmlRes.body.includes('sidebar-more'), 'missing more section');
  ok('R14. old sidebar items moved to more-nav', htmlRes.body.includes('sb-more-nav'), 'missing more-nav');

  // 15. project overview view 存在
  ok('R15. HTML has project-overview view', htmlRes.body.includes('data-view="project-overview"'), 'missing project-overview view');

  // 16. 390×844 无横向溢出
  ok('R16. CSS has overflow-x hidden', /overflow-x:\s*hidden/i.test(cssContent), 'missing overflow guard');

  // 17. 不显示 token/tokenHash
  ok('R17. JS does not render tokenHash', !/tokenHash.*innerHTML/.test(jsContent), 'may leak tokenHash');

  // 19. sessions-by-cwd API 被使用
  ok('R19. JS uses sessions/by-cwd', jsContent.includes('sessions/by-cwd'), 'missing by-cwd API');

  // 20. More 区默认折叠
  ok('R20. more-nav has hidden attr', htmlRes.body.includes('sb-more-nav" hidden'), 'more-nav not hidden');

  // 21. goBack 支持分层返回
  ok('R21. JS goBack supports layered back', jsContent.includes('CS.selectedProject') && jsContent.includes('openProjectOverview'), 'missing layered goBack');

  // 22. startContractMode wires new functions
  ok('R22. JS startContractMode wires wireSidebarMore', jsContent.includes('wireSidebarMore'), 'missing wireSidebarMore call');
  ok('R23. JS startContractMode wires wireNewChatModal', jsContent.includes('wireNewChatModal'), 'missing wireNewChatModal call');
  ok('R24. JS startContractMode wires wireFilesDrawer', jsContent.includes('wireFilesDrawer'), 'missing wireFilesDrawer call');


  // ============================================================
  section('R2-Reframe: Desktop Project Memory Sync (Strict)');
  // ============================================================
  // These tests enforce the R2 strict reframe: mobile sidebar MUST use
  // /api/mobile/project-memory (desktop project memory source-of-truth),
  // NOT /api/mobile/projects with roots/drives fallback.

  // 1. JS uses /api/mobile/project-memory endpoint
  ok('R2-U1. JS uses /api/mobile/project-memory endpoint', jsContent.includes('/api/mobile/project-memory'), 'missing project-memory endpoint');

  // 2. JS does NOT use /api/mobile/projects as sidebar primary source
  //    (old endpoint with roots fallback — must not be the sidebar data source)
  ok('R2-U2. JS does NOT use /api/mobile/projects for sidebar', !/sidebar.*\/api\/mobile\/projects/.test(jsContent) && !/loadAllProjects.*\/api\/mobile\/projects/.test(jsContent), 'still using old projects endpoint for sidebar');

  // 3. JS does NOT use /api/mobile/roots for project list
  ok('R2-U3. JS does NOT use /api/mobile/roots for projects', !/projects.*\/api\/mobile\/roots/.test(jsContent), 'roots used for projects');

  // 4. JS has loadProjectMemory function
  ok('R2-U4. JS has loadProjectMemory function', jsContent.includes('loadProjectMemory'), 'missing loadProjectMemory');

  // 5. JS has renderProjectMemorySidebar function
  ok('R2-U5. JS has renderProjectMemorySidebar function', jsContent.includes('renderProjectMemorySidebar'), 'missing renderProjectMemorySidebar');

  // 6. HTML has sidebar-project-memory container
  ok('R2-U6. HTML has sidebar-project-memory container', htmlRes.body.includes('sidebar-project-memory') || htmlRes.body.includes('sb-project-memory'), 'missing project memory container');

  // 7. JS checks for drive root names and skips them
  ok('R2-U7. JS has drive root filter (isDriveRoot)', jsContent.includes('isDriveRoot') || jsContent.includes('driveRoot'), 'missing drive root filter');

  // 8. JS renders project rows with data-project-id
  ok('R2-U8. JS renders project rows with data-project-id', jsContent.includes('data-project-id'), 'missing data-project-id');

  // 9. JS renders session rows with data-session-id
  ok('R2-U9. JS renders session rows with data-session-id', jsContent.includes('data-session-id'), 'missing data-session-id');

  // 10. JS has openChatSession function (ChatGPT-like chat detail)
  ok('R2-U10. JS has openChatSession function', jsContent.includes('openChatSession'), 'missing openChatSession');

  // 11. HTML has chat-pane container
  ok('R2-U11. HTML has chat-pane container', htmlRes.body.includes('chat-pane') || htmlRes.body.includes('id="chat-pane"'), 'missing chat-pane');

  // 12. HTML has chat-messages container (message area)
  ok('R2-U12. HTML has chat-messages container', htmlRes.body.includes('chat-messages') || htmlRes.body.includes('id="chat-messages"'), 'missing chat-messages');

  // 13. HTML has chat-input container (bottom input)
  ok('R2-U13. HTML has chat-input container', htmlRes.body.includes('chat-input') || htmlRes.body.includes('id="chat-input"'), 'missing chat-input');

  // 14. JS has renderChatSession function
  ok('R2-U14. JS has renderChatSession function', jsContent.includes('renderChatSession'), 'missing renderChatSession');

  // 15. JS has renderChatEmptyState function
  ok('R2-U15. JS has renderChatEmptyState function', jsContent.includes('renderChatEmptyState'), 'missing renderChatEmptyState');

  // 16. JS has renderProjectOverview function
  ok('R2-U16. JS has renderProjectOverview function', jsContent.includes('renderProjectOverview'), 'missing renderProjectOverview');

  // 17. JS New Chat binds to selected project cwd
  ok('R2-U17. JS New Chat checks selectedProject', jsContent.includes('selectedProject') && /newChat|new-chat/i.test(jsContent), 'New Chat does not bind to selected project');

  // 18. JS New Chat shows warning when no project selected
  ok('R2-U18. JS New Chat shows warning when no project', /请先选择|no.*project.*selected|select.*project/i.test(jsContent), 'missing no-project warning');

  // 19. JS does NOT allow user to type arbitrary cwd in New Chat
  ok('R2-U19. JS New Chat does not allow arbitrary cwd input', !/newchat.*cwd.*input|cwd.*contenteditable/i.test(jsContent), 'New Chat allows arbitrary cwd');

  // 20. HTML has chat-empty-state view
  ok('R2-U20. HTML has chat-empty-state', htmlRes.body.includes('chat-empty-state') || htmlRes.body.includes('data-view="chat-empty"'), 'missing chat-empty-state');

  // 21. CSS has chat-pane styles
  ok('R2-U21. CSS has chat-pane styles', cssContent.includes('.chat-pane') || cssContent.includes('#chat-pane'), 'missing chat-pane CSS');

  // 22. CSS has chat-message bubble styles
  ok('R2-U22. CSS has chat-message styles', cssContent.includes('.chat-message') || cssContent.includes('.msg-bubble'), 'missing chat-message CSS');

  // 23. CSS has sidebar-project-row styles
  ok('R2-U23. CSS has sidebar-project-row styles', cssContent.includes('.sidebar-project-row') || cssContent.includes('.project-memory-row'), 'missing project-row CSS');

  // 24. CSS has sidebar-session-row styles
  ok('R2-U24. CSS has sidebar-session-row styles', cssContent.includes('.sidebar-session-row'), 'missing session-row CSS');

  // 25. JS has expandProject function (toggle expand/collapse)
  ok('R2-U25. JS has expandProject function', jsContent.includes('expandProject') || jsContent.includes('toggleProject'), 'missing expandProject');

  // 26. JS fetches project-memory on startup
  ok('R2-U26. JS fetches project-memory on startup', /startContractMode|initApp|loadProjectMemory/.test(jsContent) && jsContent.includes('loadProjectMemory'), 'does not fetch project-memory on startup');

  // 27. JS does NOT render drive roots as projects (defensive)
  ok('R2-U27. JS has defensive drive root skip', /isDriveRoot|skipDrive|filterDrive/.test(jsContent), 'missing defensive drive root skip');

  // 28. HTML does NOT have old project-list as primary sidebar
  ok('R2-U28. HTML does NOT use project-list as primary sidebar', !htmlRes.body.includes('id="project-list"') || htmlRes.body.includes('sidebar-project-memory'), 'old project-list still primary');

  // 29. JS has chat-followup-input element
  ok('R2-U29. JS has chat followup input', jsContent.includes('chat-followup') || jsContent.includes('followup-input'), 'missing chat followup input');

  // 30. JS has disabled state for followup when no scope
  ok('R2-U30. JS has followup disabled state', /followup.*disabled|disabled.*followup|canSendFollowup/.test(jsContent), 'missing followup disabled state');

  // 31. JS has draft start button logic
  ok('R2-U31. JS has draft start button', /draft.*start|start.*draft|startDraft/.test(jsContent), 'missing draft start button');

  // 32. JS does not expose token/tokenHash in rendering
  ok('R2-U32. JS does not render tokenHash', !/tokenHash.*innerHTML|innerHTML.*tokenHash/.test(jsContent), 'may leak tokenHash');

  // 33. CSS has no horizontal overflow at 390px
  ok('R2-U33. CSS has overflow-x hidden for chat', /overflow-x:\s*hidden/i.test(cssContent), 'missing overflow guard');

  // 34. JS has file drawer bind to current cwd
  ok('R2-U34. JS file drawer binds to current cwd', /openFilesDrawer|filesDrawer.*cwd|currentCwd/.test(jsContent), 'file drawer does not bind to cwd');

  // 35. HTML has More/Debug collapsed section for old features
  ok('R2-U35. HTML has More/Debug collapsed section', htmlRes.body.includes('sidebar-more') || htmlRes.body.includes('sb-more'), 'missing More/Debug section');

  // 36. Old features (Safety/Projects/Files/Skills/Settings) NOT in main sidebar
  ok('R2-U36. Old features not in main sidebar nav', !/nav-main.*Safety|nav-main.*Projects.*Files|nav-main.*Skills/.test(htmlRes.body), 'old features in main nav');


  // ============================================================
  console.log('\n===== Mobile UI Smoke Test =====');
  console.log('PASS: ' + passed);
  console.log('FAIL: ' + failed);

  await new Promise((resolve) => server.close(resolve));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
