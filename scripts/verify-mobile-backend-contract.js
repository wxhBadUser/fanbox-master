/* eslint-disable */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-backend-contract-' + Date.now());
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

const port = 14698;
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

function asJson(response) {
  try { return JSON.parse(response.body || '{}'); } catch { return {}; }
}

function containsForbiddenPath(value) {
  const text = JSON.stringify(value || {});
  return (
    text.includes('.fanbox' + path.sep + 'mobile') ||
    text.includes('.claude' + path.sep + 'projects') ||
    text.includes('.codex' + path.sep + 'sessions') ||
    /\.env(?:\.|["\\/]|$)/i.test(text)
  );
}

function hasTopKeys(obj, keys) {
  return !!obj && keys.every((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

function isStableError(obj, code) {
  return !!obj
    && obj.ok === false
    && obj.error
    && typeof obj.error === 'object'
    && typeof obj.error.code === 'string'
    && typeof obj.error.message === 'string'
    && (!code || obj.error.code === code);
}

function jsonText(value) {
  return JSON.stringify(value || {});
}

function containsSensitiveAuditData(value) {
  return /(rawPrompt|prompt|rawStdout|stdout|pty|tokenHash|Bearer\s|apiKey|password|secret|inputPreview)/i.test(jsonText(value));
}

(async () => {
  section('1) Start server and pair token');
  const server = mobile.startMobileServer({ port });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise((r) => setTimeout(r, 20));
  ok('server listening', server.listening);

  await mobile.saveConfig({ enabled: true });

  const infoPublic = asJson(await request({ path: '/api/mobile/info', method: 'GET' }));
  ok('mobile/info public LAN endpoint exists', infoPublic.ok === true, JSON.stringify(infoPublic));
  ok('mobile/info exposes only public pairing/server data',
    !!(infoPublic.server && infoPublic.pairing && infoPublic.features && infoPublic.connection)
      && !/tokenHash|Bearer\s|"token"\s*:|secret|password/i.test(JSON.stringify(infoPublic)),
    JSON.stringify(infoPublic));

  const pair = await mobile.startPairCode();
  const pairResponse = await request({
    path: '/api/mobile/pair/confirm',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ pairCode: pair.pairCode, deviceName: 'Contract Phone' }));
  const pairJson = asJson(pairResponse);
  const auth = { Authorization: 'Bearer ' + pairJson.token };
  ok('pair/confirm 200', pairResponse.status === 200, pairResponse.body);
  ok('token returned', typeof pairJson.token === 'string' && pairJson.token.length > 30);

  const unauthorized = asJson(await request({ path: '/api/mobile/app-state', method: 'GET' }));
  ok('protected API without token returns 401 stable error',
    unauthorized.ok === false && isStableError(unauthorized, 'unauthorized'),
    JSON.stringify(unauthorized));

  section('2) Seed sessions, files, usage, audit');
  const now = Date.now();
  const projectDir = path.join(TMP_HOME, 'project-a');
  fs.mkdirSync(projectDir, { recursive: true });
  const recentFile = path.join(projectDir, 'recent.md');
  fs.writeFileSync(recentFile, '# recent\n', 'utf8');
  const forbiddenFile = path.join(TMP_HOME, '.env');
  fs.writeFileSync(forbiddenFile, 'SECRET=1\n', 'utf8');

  const draft = await mobileSessions.createMobileDraftSession({
    cwd: projectDir,
    agentId: 'codex',
    deviceId: pairJson.deviceId,
  });
  ok('draft session created', draft && draft.ok === true, JSON.stringify(draft));
  await mobileSessions.appendMessageToMobileSession(draft.sessionId, {
    role: 'user',
    text: 'hello',
    status: 'sent',
    ts: now - 2000,
  });
  await mobileSessions.appendMessageToMobileSession(draft.sessionId, {
    role: 'agent',
    text: 'world',
    status: 'done',
    ts: now - 1000,
    agentId: 'codex',
  });
  await mobileSessions.setSessionStatus(draft.sessionId, 'running', { lastRunAgent: 'codex' });
  await mobileSessions.recordMobileUsage({
    sessionId: draft.sessionId,
    agentId: 'codex',
    cwd: projectDir,
    cwdLabel: 'project-a',
    startedAt: now - 3000,
    endedAt: now - 1000,
    durationMs: 2000,
    inputChars: 5,
    outputChars: 5,
    status: 'done',
  });
  await mobileSessions.appendAudit({
    action: 'mobile_message_sent',
    sessionId: draft.sessionId,
    deviceId: pairJson.deviceId,
    agentId: 'codex',
    cwd: projectDir,
    inputHash: 'hash-only',
    inputLen: 5,
  });

  section('3) Contract endpoints');
  const appState = asJson(await request({ path: '/api/mobile/app-state', method: 'GET', headers: auth }));
  ok('app-state ok', appState.ok === true);
  ok('app-state has stable top-level keys',
    hasTopKeys(appState, ['ok', 'server', 'auth', 'features', 'connection', 'currentContext', 'counts', 'meta']),
    JSON.stringify(appState));
  const counts = appState.counts || {};
  ok('app-state counts are numbers',
    ['sessions', 'activeSessions', 'pendingApprovals', 'devices', 'recentFiles'].every((k) => typeof counts[k] === 'number'),
    JSON.stringify(counts));
  ok('app-state does not expose token material', !/tokenHash|Bearer\s|secret|password/i.test(JSON.stringify(appState)), JSON.stringify(appState));
  ok('app-state declares LAN-only no relay/websocket',
    appState.server && appState.server.lanOnly === true
      && appState.features && appState.features.relay === false && appState.features.e2ee === false
      && appState.connection && appState.connection.transport === 'http+sse'
      && appState.connection.capabilities && appState.connection.capabilities.webSocket === false,
    JSON.stringify(appState));

  const dashboard = asJson(await request({ path: '/api/mobile/dashboard', method: 'GET', headers: auth }));
  ok('dashboard ok', dashboard.ok === true);
  ok('dashboard has stable top-level keys',
    hasTopKeys(dashboard, ['ok', 'activeSessions', 'runningAgents', 'pendingApprovals', 'recentFiles', 'usageSummary', 'recentAuditEntries', 'meta']),
    JSON.stringify(dashboard));
  ok('dashboard fixed arrays',
    ['activeSessions', 'runningAgents', 'pendingApprovals', 'recentFiles', 'recentAuditEntries'].every((k) => Array.isArray(dashboard[k])),
    JSON.stringify(dashboard));
  ok('dashboard running agents declare source',
    dashboard.runningAgents.every((a) => typeof a.source === 'string' && a.source.length > 0),
    JSON.stringify(dashboard.runningAgents));
  ok('dashboard usage summary exists', dashboard.usageSummary && typeof dashboard.usageSummary.todayRuns === 'number');

  const timeline = asJson(await request({ path: '/api/mobile/sessions/' + encodeURIComponent(draft.sessionId) + '/timeline', method: 'GET', headers: auth }));
  ok('timeline ok', timeline.ok === true);
  ok('timeline has stable top-level keys',
    hasTopKeys(timeline, ['ok', 'sessionId', 'status', 'agentId', 'cwd', 'cwdLabel', 'events', 'nextCursor', 'hasMore', 'meta']),
    JSON.stringify(timeline));
  ok('timeline events array', Array.isArray(timeline.events));
  const timelineEvents = Array.isArray(timeline.events) ? timeline.events : [];
  ok('timeline events have stable render fields',
    timelineEvents.length >= 2 && timelineEvents.every((e) => e.id && e.type && typeof e.timestamp === 'number' && typeof e.text === 'string' && e.source),
    JSON.stringify(timeline));
  ok('timeline does not require messages payload', !Object.prototype.hasOwnProperty.call(timeline, 'messages'));

  const recent = asJson(await request({ path: '/api/mobile/files/recent?limit=20', method: 'GET', headers: auth }));
  ok('files/recent ok', recent.ok === true);
  ok('files/recent has stable top-level keys', hasTopKeys(recent, ['ok', 'items', 'meta']), JSON.stringify(recent));
  ok('files/recent items array', Array.isArray(recent.items));
  ok('files/recent entries have contract fields',
    recent.items.every((f) => f.path && f.name && (f.kind === 'file' || f.kind === 'directory') && typeof f.source === 'string' && typeof f.reason === 'string' && Object.prototype.hasOwnProperty.call(f, 'mtime')),
    JSON.stringify(recent.items));
  ok('files/recent does not include forbidden paths', !containsForbiddenPath(recent.items), JSON.stringify(recent.items));

  const devices = asJson(await request({ path: '/api/mobile/devices', method: 'GET', headers: auth }));
  ok('devices ok', devices.ok === true);
  ok('devices has stable top-level keys', hasTopKeys(devices, ['ok', 'currentDeviceId', 'items', 'capabilities', 'meta']), JSON.stringify(devices));
  ok('devices items array', Array.isArray(devices.items) && devices.items.length >= 1, JSON.stringify(devices));
  ok('devices do not return token/tokenHash', !/tokenHash|Bearer\s|"token"\s*:/i.test(JSON.stringify(devices)), JSON.stringify(devices));
  const deviceItems = Array.isArray(devices.items) ? devices.items : [];
  ok('devices marks current device', deviceItems.some((d) => d.isCurrent === true));
  ok('devices entries expose safe device fields',
    deviceItems.every((d) => d.deviceId && d.deviceName && Object.prototype.hasOwnProperty.call(d, 'pairedAt') && Object.prototype.hasOwnProperty.call(d, 'lastActiveAt') && Object.prototype.hasOwnProperty.call(d, 'lastIp') && Array.isArray(d.scopes) && typeof d.revoked === 'boolean'),
    JSON.stringify(deviceItems));
  ok('devices does not pretend mobile revoke exists', devices.capabilities && devices.capabilities.revoke === false, JSON.stringify(devices));

  const audit = asJson(await request({ path: '/api/mobile/audit?limit=20', method: 'GET', headers: auth }));
  ok('audit ok', audit.ok === true);
  ok('audit has stable top-level keys', hasTopKeys(audit, ['ok', 'items', 'meta']), JSON.stringify(audit));
  ok('audit items array', Array.isArray(audit.items));
  ok('audit entries use safe timestamp field',
    audit.items.every((a) => a.id && typeof a.timestamp === 'number' && a.action),
    JSON.stringify(audit));
  ok('audit sensitive fields are trimmed',
    !containsSensitiveAuditData(audit),
    JSON.stringify(audit));

  section('4) Legacy endpoints and auth boundary');
  const legacyStatus = asJson(await request({ path: '/api/mobile/status', method: 'GET', headers: auth }));
  ok('legacy status API still exists', legacyStatus.ok === true, JSON.stringify(legacyStatus));
  const legacySessions = asJson(await request({ path: '/api/mobile/sessions?limit=10', method: 'GET', headers: auth }));
  ok('legacy sessions API still exists', legacySessions.ok === true && Array.isArray(legacySessions.items), JSON.stringify(legacySessions));
  const legacyAgents = asJson(await request({ path: '/api/mobile/agents', method: 'GET', headers: auth }));
  ok('legacy agents API still exists', legacyAgents.ok === true, JSON.stringify(legacyAgents));

  section('5) B2A: Desktop Continuation Read Model');

  // Test 1: Without provider, desktopContinuableAgents should be empty array, not crash
  ok('dashboard.desktopContinuableAgents is array even without provider',
    Array.isArray(dashboard.desktopContinuableAgents),
    JSON.stringify(dashboard.desktopContinuableAgents));
  ok('app-state.counts.desktopContinuableAgents is number even without provider',
    typeof counts.desktopContinuableAgents === 'number',
    JSON.stringify(counts));
  ok('app-state.counts.runningDesktopAgents is number even without provider',
    typeof counts.runningDesktopAgents === 'number',
    JSON.stringify(counts));

  // Test 2: Inject a mock terminal provider with fake data including secrets and ANSI
  const mockSecrets = 'sk-abc123def456ghiklmnopqrst Bearer xyz1234567890abcdefghij token=mysecrettoken12345 ANTHROPIC_API_KEY=sk-ant-api03-AAaaBBbbCCccDDddEEeeFFffGGggHHhhIIiiJJjjKKkkLLllMMmmNNnnOOooPPppQQrrSSttUUuuVVvvWWwwXXxxYYyyZZzz';
  const mockAnsi = '\x1b[32mhello\x1b[0m \x1b[1mworld\x1b[0m\r\n';
  const mockCwd = path.join(TMP_HOME, 'desktop-agent-project');
  fs.mkdirSync(mockCwd, { recursive: true });
  fs.writeFileSync(path.join(mockCwd, 'main.py'), 'print("hi")', 'utf8');
  fs.writeFileSync(path.join(TMP_HOME, '.env'), 'SECRET_KEY=should_not_leak', 'utf8'); // forbidden

  let mockCallCount = 0;
  mobile.setDesktopTerminalProvider(async function mockProvider() {
    mockCallCount++;
    return [
      {
        id: 'mock-term-1',
        cwd: mockCwd,
        proc: 'claude',
        busy: true,
        tail: mockAnsi + mockSecrets + '\nworking...',
        lastActiveAt: Date.now()
      },
      {
        id: 'mock-term-2',
        cwd: '', // unknown cwd
        proc: 'bash',
        busy: false,
        tail: '',
        lastActiveAt: Date.now() - 60 * 60 * 1000 // 1 hour ago
      },
      {
        id: 'mock-term-forbidden',
        cwd: TMP_HOME, // contains .env which is forbidden
        proc: 'codex',
        busy: true,
        tail: 'ls -la',
        lastActiveAt: Date.now()
      }
    ];
  });

  // Re-fetch dashboard and app-state with mock provider
  const dash2 = asJson(await request({ path: '/api/mobile/dashboard', method: 'GET', headers: auth }));
  ok('dashboard with provider ok', dash2.ok === true);
  ok('desktopContinuableAgents is array with mock data',
    Array.isArray(dash2.desktopContinuableAgents) && dash2.desktopContinuableAgents.length >= 2,
    'length=' + (dash2.desktopContinuableAgents ? dash2.desktopContinuableAgents.length : 'n/a'));

  const agents = dash2.desktopContinuableAgents || [];
  // Find the claude agent (busy, cwd=mockCwd) explicitly instead of relying on sort order
  const claudeAgent = agents.find((x) => x.agentId === 'claude' && x.busy === true);
  if (claudeAgent) {
    const a = claudeAgent;
    // Required fields
    ok('desktop agent has id', typeof a.id === 'string' && a.id.length > 0);
    ok('desktop agent source is desktop-terminal', a.source === 'desktop-terminal');
    ok('desktop agent agentId is claude', a.agentId === 'claude');
    ok('desktop agent label is string', typeof a.label === 'string' && a.label.length > 0);
    ok('desktop agent status is running when busy', a.status === 'running');
    ok('desktop agent busy is boolean', typeof a.busy === 'boolean');
    ok('desktop agent lastActiveAt is number', typeof a.lastActiveAt === 'number');
    ok('desktop agent canSendFollowup is false', a.canSendFollowup === false, 'got ' + JSON.stringify(a.canSendFollowup));
    ok('desktop agent terminalId is safe (not raw)',
      typeof a.terminalId === 'string' && a.terminalId !== 'mock-term-1',
      'got terminalId=' + a.terminalId);
    ok('desktop agent projectName is basename of cwd', a.projectName === 'desktop-agent-project', 'got ' + a.projectName);
    ok('desktop agent cwd is safe (allowed)', typeof a.cwd === 'string');
    ok('desktop agent riskFlags is array', Array.isArray(a.riskFlags));
    ok('desktop agent has reason string', typeof a.reason === 'string');

    // Output tail checks
    const tailText = JSON.stringify(a.outputTail);
    ok('outputTail ANSI stripped',
      !a.outputTail.includes('\x1b') && !a.outputTail.includes('\r'),
      'tail contains ANSI/CR');
    ok('outputTail secrets scrubbed (sk-)', !a.outputTail.includes('sk-abc123def456ghiklmnopqrst'), 'sk- not redacted');
    ok('outputTail secrets scrubbed (Bearer)', !a.outputTail.includes('xyz1234567890abcdefghij'), 'Bearer not redacted');
    ok('outputTail secrets scrubbed (token=)', !a.outputTail.includes('mysecrettoken12345'), 'token= not redacted');
    ok('outputTail secrets scrubbed (ANTHROPIC_API_KEY)', !a.outputTail.includes('sk-ant-api03-'), 'ANTHROPIC_API_KEY not redacted');
    ok('outputTail length limited',
      a.outputTail.length <= mobile.DESKTOP_AGENT_TAIL_MAX + 10,
      'tail length=' + a.outputTail.length + ' > max=' + mobile.DESKTOP_AGENT_TAIL_MAX);
    ok('outputTailRedacted flag set when scrubbed',
      a.outputTailRedacted === true,
      'outputTailRedacted=' + a.outputTailRedacted);

    // Sensitive field leak checks
    const agentJson = JSON.stringify(a);
    ok('desktop agent does not expose raw term id',
      !agentJson.includes('mock-term-1'), 'raw id leaked');
    ok('desktop agent does not expose pid', !/"pid"\s*:/.test(agentJson), 'pid field leaked');
    ok('desktop agent does not expose raw pty',
      !/(?:^|[^a-z])pty(?:$|[^a-z])/i.test(agentJson), 'pty leaked in: ' + agentJson.substring(0, 500));
    ok('desktop agent does not expose resumeToken/session token',
      !/resumeToken|sessionToken|sessionHandle/i.test(agentJson),
      'resume token leaked');

    // recentFiles checks
    ok('recentFiles is array', Array.isArray(a.recentFiles), 'recentFiles not array');
    if (Array.isArray(a.recentFiles)) {
      const filesJson = JSON.stringify(a.recentFiles);
      ok('recentFiles does not include .env (forbidden)',
        !a.recentFiles.some((f) => f.name === '.env' || (f.path && f.path.includes('.env'))),
        'forbidden .env in recentFiles');
      ok('recentFiles does not expose absolute path outside allowed',
        !containsForbiddenPath(a.recentFiles),
        'forbidden path in recentFiles');
      ok('recentFiles limited to max entries',
        a.recentFiles.length <= mobile.DESKTOP_AGENT_MAX_RECENT_FILES,
        'recentFiles length=' + a.recentFiles.length);
    }
  }

  // Test idle terminal
  if (agents.length >= 2) {
    const idle = agents.find((x) => x.agentId === 'unknown' && !x.busy) || agents[1];
    ok('idle terminal status is idle or unknown',
      idle.status === 'idle' || idle.status === 'unknown',
      'status=' + idle.status);
    ok('idle terminal has canOpen false (empty cwd)', idle.canOpen === false, 'canOpen=' + idle.canOpen);
    ok('idle terminal has riskFlags with cwd_outside_roots',
      Array.isArray(idle.riskFlags) && idle.riskFlags.includes('cwd_outside_roots'),
      'riskFlags=' + JSON.stringify(idle.riskFlags));
  }

  // Test desktop-agents timeline endpoint
  const appState2 = asJson(await request({ path: '/api/mobile/app-state', method: 'GET', headers: auth }));
  ok('app-state with provider has desktop counts',
    typeof appState2.counts.desktopContinuableAgents === 'number' && appState2.counts.desktopContinuableAgents >= 2,
    JSON.stringify(appState2.counts));
  ok('app-state meta shows provider source',
    appState2.meta && appState2.meta.desktopAgentsSource === 'desktop-terminal-provider',
    JSON.stringify(appState2.meta));

  // Pick the busy claude desktop agent id and query its timeline
  const timelineTestAgent = claudeAgent || (dash2.desktopContinuableAgents || [])[0];
  if (timelineTestAgent) {
    const agentTimeline = asJson(await request({
      path: '/api/mobile/desktop-agents/' + encodeURIComponent(timelineTestAgent.id) + '/timeline',
      method: 'GET',
      headers: auth
    }));
    ok('desktop-agent timeline ok', agentTimeline.ok === true, JSON.stringify(agentTimeline));
    ok('desktop-agent timeline canSendFollowup false', agentTimeline.canSendFollowup === false);
    ok('desktop-agent timeline has events array', Array.isArray(agentTimeline.events), 'events not array');
    ok('desktop-agent timeline events do not leak secrets',
      !/sk-|Bearer|mysecrettoken|resumeToken|sessionToken/i.test(JSON.stringify(agentTimeline))
        && !/(?:^|[^a-z])pty(?:$|[^a-z])/i.test(JSON.stringify(agentTimeline)),
      'secrets in timeline: ' + JSON.stringify(agentTimeline).substring(0, 1000));
  }

  // Test 404 for non-existent desktop agent
  const badTimeline = asJson(await request({
    path: '/api/mobile/desktop-agents/nonexistent-1234/timeline',
    method: 'GET',
    headers: auth
  }));
  ok('non-existent desktop agent returns 404',
    badTimeline.ok === false && badTimeline.error === 'desktop_agent_not_found',
    JSON.stringify(badTimeline));

  // Test: desktop-agents without auth returns 401
  const noAuthTimeline = asJson(await request({
    path: '/api/mobile/desktop-agents/' + encodeURIComponent(timelineTestAgent ? timelineTestAgent.id : 'x') + '/timeline',
    method: 'GET'
  }));
  ok('desktop-agent timeline without auth returns 401',
    noAuthTimeline.ok === false && isStableError(noAuthTimeline, 'unauthorized'),
    JSON.stringify(noAuthTimeline));

  // Test: dashboard without auth returns 401
  const noAuthDash = asJson(await request({ path: '/api/mobile/dashboard', method: 'GET' }));
  ok('dashboard without auth returns 401',
    noAuthDash.ok === false && isStableError(noAuthDash, 'unauthorized'),
    JSON.stringify(noAuthDash));

  // Reset provider to null
  mobile.setDesktopTerminalProvider(null);
  const dash3 = asJson(await request({ path: '/api/mobile/dashboard', method: 'GET', headers: auth }));
  ok('dashboard with null provider has empty array',
    Array.isArray(dash3.desktopContinuableAgents) && dash3.desktopContinuableAgents.length === 0,
    JSON.stringify(dash3.desktopContinuableAgents));

  // Standalone unit tests for scrub/strip functions
  ok('stripAnsi removes ANSI codes', mobile.stripAnsi('\x1b[32mhello\x1b[0m') === 'hello');
  ok('scrubSecrets redacts sk- keys', mobile.scrubSecrets('key is sk-1234567890abcdefghijklmnop').redacted === true);
  ok('detectAgentFromProc identifies claude', mobile.detectAgentFromProc('claude --print') === 'claude');
  ok('detectAgentFromProc identifies codex', mobile.detectAgentFromProc('/usr/bin/codex') === 'codex');
  ok('detectAgentFromProc unknown for shell', mobile.detectAgentFromProc('bash') === 'unknown');

  section('6) Syntax checks');
  ok('node -c electron/mobile.js already loaded', typeof mobile.createMobileServer === 'function');

  await new Promise((resolve) => server.close(resolve));
  console.log('\n===== Mobile backend contract verify =====');
  console.log('PASS:', passed);
  console.log('FAIL:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
