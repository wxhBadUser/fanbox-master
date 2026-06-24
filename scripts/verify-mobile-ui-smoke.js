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
  // Find a project with canCreateSession=true
  const creatableProject = projects.items.find(p => p.canCreateSession) || projects.items[0];
  ok('B3A found creatable project', !!creatableProject, JSON.stringify(projects.items.map(p => ({id: p.id, cwd: p.cwd, canCreate: p.canCreateSession}))));
  
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
