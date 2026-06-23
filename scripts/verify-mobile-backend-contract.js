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
  const mockNow = Date.now();
  // Generate mock events with known timestamps for B2B timeline testing
  // Include raw secrets and ANSI to verify scrubbing
  const mockRawEvents = [
    {
      id: 'raw-ev-1',
      type: 'status_change',
      timestamp: mockNow - 5000,
      rawType: 'status_change',
      rawText: '',
      status: 'running',
      agentId: 'claude'
    },
    {
      id: 'raw-ev-2',
      type: 'output_tail',
      timestamp: mockNow - 3000,
      rawType: 'output_tail',
      rawText: '\x1b[32mProcessing...\x1b[0m sk-abc123def456ghiklmnopqrstuvwxyz Bearer tok1234567890abcdefghij working on files',
      status: 'running',
      agentId: 'claude'
    },
    {
      id: 'raw-ev-3',
      type: 'output_tail',
      timestamp: mockNow - 1000,
      rawType: 'output_tail',
      rawText: 'Analyzing project structure token=mysecrettoken12345 password=hunter2done',
      status: 'running',
      agentId: 'claude'
    }
  ];

  mobile.setDesktopTerminalProvider(async function mockProvider() {
    mockCallCount++;
    return [
      {
        id: 'mock-term-1',
        cwd: mockCwd,
        proc: 'claude',
        busy: true,
        tail: mockAnsi + mockSecrets + '\nworking...',
        lastActiveAt: mockNow,
        events: mockRawEvents
      },
      {
        id: 'mock-term-2',
        cwd: '', // unknown cwd
        proc: 'bash',
        busy: false,
        tail: '',
        lastActiveAt: mockNow - 60 * 60 * 1000, // 1 hour ago
        events: [
          { id: 'raw-ev-idle-1', type: 'status_change', timestamp: mockNow - 3600000, status: 'idle', agentId: 'unknown' }
        ]
      },
      {
        id: 'mock-term-forbidden',
        cwd: TMP_HOME, // contains .env which is forbidden
        proc: 'codex',
        busy: true,
        tail: 'ls -la',
        lastActiveAt: mockNow,
        events: []
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

    // B2B: ring-buffered timeline event tests
    section('5b) B2B: Desktop agent timeline event buffer');
    ok('timeline meta exists with correct shape',
      agentTimeline.meta && typeof agentTimeline.meta === 'object',
      'meta missing: ' + JSON.stringify(agentTimeline.meta));
    ok('timeline meta.timelineSource is desktop-terminal-ring-buffer',
      agentTimeline.meta && agentTimeline.meta.timelineSource === 'desktop-terminal-ring-buffer',
      'source=' + (agentTimeline.meta && agentTimeline.meta.timelineSource));
    ok('timeline meta.limit is number',
      typeof (agentTimeline.meta && agentTimeline.meta.limit) === 'number');
    ok('timeline meta.hasMore is boolean',
      typeof (agentTimeline.meta && agentTimeline.meta.hasMore) === 'boolean');
    ok('eventCount matches events length',
      agentTimeline.eventCount === agentTimeline.events.length,
      'eventCount=' + agentTimeline.eventCount + ' vs events.length=' + agentTimeline.events.length);

    // Events are sorted ascending by timestamp
    const timestamps = agentTimeline.events.map((e) => e.timestamp);
    let ascending = true;
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < timestamps[i-1]) { ascending = false; break; }
    }
    ok('events sorted ascending by timestamp', ascending, 'timestamps=' + JSON.stringify(timestamps));

    // Each event has required fields
    let allEventsValid = true;
    let eventFieldErrors = [];
    for (const ev of agentTimeline.events) {
      const required = ['id', 'type', 'timestamp', 'agentId', 'desktopAgentId', 'source'];
      for (const f of required) {
        if (!(f in ev) || ev[f] === undefined || ev[f] === null) {
          allEventsValid = false;
          eventFieldErrors.push('missing ' + f + ' in event type=' + ev.type);
        }
      }
      if (ev.source !== 'desktop-terminal') {
        allEventsValid = false;
        eventFieldErrors.push('source not desktop-terminal: ' + ev.source);
      }
    }
    ok('all events have required fields (id,type,timestamp,agentId,desktopAgentId,source)',
      allEventsValid, eventFieldErrors.join('; '));

    // output_tail events: no ANSI, no secrets, text <= 500
    const outputEvents = agentTimeline.events.filter((e) => e.type === 'output_tail');
    ok('output_tail events exist in timeline', outputEvents.length >= 1,
      'output_tail count=' + outputEvents.length);
    for (const ev of outputEvents) {
      ok('output_tail event text has no ANSI escape',
        !/\x1b/.test(ev.text || ''), 'ANSI in output_tail text');
      ok('output_tail event text has no CR',
        !(ev.text || '').includes('\r'), 'CR in output_tail text');
      ok('output_tail event text no sk- secret',
        !(ev.text || '').includes('sk-abc123def'), 'sk- leaked in event');
      ok('output_tail event text no Bearer secret',
        !(ev.text || '').includes('tok1234567890abcdefghij'), 'Bearer leaked in event');
      ok('output_tail event text no token= secret',
        !(ev.text || '').includes('mysecrettoken12345'), 'token= leaked in event');
      ok('output_tail event text no password= secret',
        !(ev.text || '').includes('hunter2'), 'password= leaked in event');
      ok('output_tail event text length <= 500',
        (ev.text || '').length <= 500, 'text length=' + (ev.text || '').length);
      ok('output_tail event desktopAgentId matches agent id',
        ev.desktopAgentId === timelineTestAgent.id, 'desktopAgentId mismatch');
    }

    // Events do not contain forbidden fields
    const timelineJson = JSON.stringify(agentTimeline);
    const forbiddenFields = ['rawPty', 'rawStdout', 'resumeToken', 'tokenHash', 'raw_input', 'raw_pty', 'raw_env', 'raw_resume_token', 'pid', 'rawId'];
    for (const ff of forbiddenFields) {
      ok('timeline does not contain forbidden field: ' + ff,
        !new RegExp('"' + ff + '"').test(timelineJson),
        'forbidden field ' + ff + ' found');
    }

    // status_snapshot event is always present (most recent)
    const snapshotEvents = agentTimeline.events.filter((e) => e.type === 'status_snapshot');
    ok('status_snapshot event present', snapshotEvents.length >= 1, 'snapshot count=' + snapshotEvents.length);

    // status_change event present
    const statusChangeEvents = agentTimeline.events.filter((e) => e.type === 'status_change');
    ok('status_change event present', statusChangeEvents.length >= 1, 'status_change count=' + statusChangeEvents.length);
  }

  // Test limit parameter
  if (timelineTestAgent) {
    const tlLimit3 = asJson(await request({
      path: '/api/mobile/desktop-agents/' + encodeURIComponent(timelineTestAgent.id) + '/timeline?limit=3',
      method: 'GET',
      headers: auth
    }));
    ok('timeline limit=3 respects limit',
      tlLimit3.ok && Array.isArray(tlLimit3.events) && tlLimit3.events.length <= 3,
      'events.length=' + (tlLimit3.events && tlLimit3.events.length));

    const tlLimitHuge = asJson(await request({
      path: '/api/mobile/desktop-agents/' + encodeURIComponent(timelineTestAgent.id) + '/timeline?limit=99999',
      method: 'GET',
      headers: auth
    }));
    ok('timeline limit capped at 100',
      tlLimitHuge.ok && Array.isArray(tlLimitHuge.events) && tlLimitHuge.events.length <= 100,
      'events.length=' + (tlLimitHuge.events && tlLimitHuge.events.length));
    ok('timeline meta.limit capped at 100',
      tlLimitHuge.meta && tlLimitHuge.meta.limit <= 100,
      'meta.limit=' + (tlLimitHuge.meta && tlLimitHuge.meta.limit));
  }

  // Test since parameter
  if (timelineTestAgent) {
    // Get all events first
    const tlAll = asJson(await request({
      path: '/api/mobile/desktop-agents/' + encodeURIComponent(timelineTestAgent.id) + '/timeline?limit=100',
      method: 'GET',
      headers: auth
    }));
    if (tlAll.ok && Array.isArray(tlAll.events) && tlAll.events.length >= 2) {
      const midTs = tlAll.events[Math.floor(tlAll.events.length / 2)].timestamp;
      const tlSince = asJson(await request({
        path: '/api/mobile/desktop-agents/' + encodeURIComponent(timelineTestAgent.id) + '/timeline?since=' + midTs + '&limit=100',
        method: 'GET',
        headers: auth
      }));
      ok('timeline since parameter works',
        tlSince.ok && Array.isArray(tlSince.events),
        JSON.stringify(tlSince).substring(0, 200));
      if (tlSince.ok && Array.isArray(tlSince.events)) {
        const allNewer = tlSince.events.every((e) => e.timestamp >= midTs);
        ok('timeline since returns only newer events', allNewer,
          'old event found: ' + JSON.stringify(tlSince.events.find((e) => e.timestamp < midTs)));
      }
    }
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

  // ===== B2C: Safe follow-up input =====
  section('5c) B2C: Safe mobile follow-up input for desktop agents');

  // Install a mock write provider that records calls and pushes input_sent events to ring buffer
  let writeCalls = [];
  let writeProviderAvailable = true;
  const mockWriteProvider = {
    async sendInput(desktopAgentId, text, opts) {
      const call = { desktopAgentId, text, opts: opts || {}, at: Date.now() };
      writeCalls.push(call);
      // Push input_sent into the read-side events so timeline projection picks it up
      mockRawEvents.push({
        id: 'raw-ev-input-' + mockRawEvents.length,
        type: 'input_sent',
        timestamp: Date.now(),
        title: 'Mobile follow-up',
        text: 'Mobile follow-up sent',
        status: 'running',
        agentId: 'claude',
        meta: { inputLength: text.length }
      });
      return { ok: true };
    }
  };
  ok('setDesktopTerminalWriteProvider exists', typeof mobile.setDesktopTerminalWriteProvider === 'function');
  mobile.setDesktopTerminalWriteProvider(mockWriteProvider);

  // Provision a second device with desktop_control scope by adding a token record directly
  const crypto = require('crypto');
  function sha256Hex(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
  const writeToken = mobile.genToken();
  const writeDeviceId = mobile.genDeviceId();
  await mobile.addTokenRecord({
    id: writeDeviceId,
    tokenHash: sha256Hex(writeToken),
    deviceName: 'Write Phone',
    pairedAt: Date.now(),
    lastSeenAt: Date.now(),
    scopes: ['read:status', 'read:files', 'desktop_control'],
    revoked: false,
  });
  const writeAuth = { Authorization: 'Bearer ' + writeToken, 'Content-Type': 'application/json' };

  function postInput(agentId, body, hdrs) {
    return request({
      path: '/api/mobile/desktop-agents/' + encodeURIComponent(agentId) + '/input',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(hdrs || {}) },
    }, JSON.stringify(body || {}));
  }

  const writeAgentId = claudeAgent ? claudeAgent.id : (agents[0] && agents[0].id);
  ok('write target agent resolved', typeof writeAgentId === 'string' && writeAgentId.length > 0, 'writeAgentId=' + writeAgentId);

  // 1. No token → 401 unauthorized
  const noAuthInput = asJson(await postInput(writeAgentId, { text: 'hello' }, {}));
  ok('POST input without auth returns 401 unauthorized',
    isStableError(noAuthInput, 'unauthorized'), JSON.stringify(noAuthInput));

  // 2. Read-only token → desktop_control_scope_required
  const noScopeInput = asJson(await postInput(writeAgentId, { text: 'hello' }, auth));
  ok('POST input without desktop_control scope returns desktop_control_scope_required',
    isStableError(noScopeInput, 'desktop_control_scope_required'), JSON.stringify(noScopeInput));

  // 3. Provider null → write_provider_unavailable
  mobile.setDesktopTerminalWriteProvider(null);
  const noProviderInput = asJson(await postInput(writeAgentId, { text: 'hello' }, writeAuth));
  ok('POST input without write provider returns write_provider_unavailable',
    isStableError(noProviderInput, 'write_provider_unavailable'), JSON.stringify(noProviderInput));
  // restore
  mobile.setDesktopTerminalWriteProvider(mockWriteProvider);

  // 4. Unknown agent id → desktop_agent_not_found
  const badAgentInput = asJson(await postInput('term-nonexistent-xxxxxxxxxxxx', { text: 'hello' }, writeAuth));
  ok('POST input for unknown agent returns desktop_agent_not_found',
    isStableError(badAgentInput, 'desktop_agent_not_found'), JSON.stringify(badAgentInput));

  // 5. Empty text → input_empty
  const emptyInput1 = asJson(await postInput(writeAgentId, { text: '' }, writeAuth));
  ok('POST input with empty text returns input_empty',
    isStableError(emptyInput1, 'input_empty'), JSON.stringify(emptyInput1));
  const emptyInput2 = asJson(await postInput(writeAgentId, { text: '   ' }, writeAuth));
  ok('POST input with whitespace-only text returns input_empty',
    isStableError(emptyInput2, 'input_empty'), JSON.stringify(emptyInput2));
  const emptyInput3 = asJson(await postInput(writeAgentId, {}, writeAuth));
  ok('POST input with missing text returns input_empty',
    isStableError(emptyInput3, 'input_empty'), JSON.stringify(emptyInput3));

  // 6. Too long → input_too_long
  const longText = 'a'.repeat(4097);
  const longInput = asJson(await postInput(writeAgentId, { text: longText }, writeAuth));
  ok('POST input with text.length > 4096 returns input_too_long',
    isStableError(longInput, 'input_too_long'), JSON.stringify(longInput));

  // 7. ANSI escape → input_rejected_control_chars
  const ansiInput = asJson(await postInput(writeAgentId, { text: '\x1b[32mhello\x1b[0m' }, writeAuth));
  ok('POST input with ANSI escape returns input_rejected_control_chars',
    isStableError(ansiInput, 'input_rejected_control_chars'), JSON.stringify(ansiInput));

  // 7b. NUL → input_rejected_control_chars
  const nulInput = asJson(await postInput(writeAgentId, { text: 'abc\x00def' }, writeAuth));
  ok('POST input with NUL returns input_rejected_control_chars',
    isStableError(nulInput, 'input_rejected_control_chars'), JSON.stringify(nulInput));

  // Reset write calls before valid test
  writeCalls = [];
  const secretPayload = 'continue with refactoring the auth module';

  // 8. Valid input accepted
  const okInput = asJson(await postInput(writeAgentId, { text: secretPayload, appendNewline: true }, writeAuth));
  ok('POST valid input returns ok:true', okInput.ok === true, JSON.stringify(okInput));
  ok('POST valid input has accepted:true', okInput.accepted === true, JSON.stringify(okInput));
  ok('POST valid input echoes desktopAgentId in id field', okInput.id === writeAgentId, 'id=' + okInput.id);
  ok('POST valid input meta.inputLength is character count',
    okInput.meta && typeof okInput.meta.inputLength === 'number' && okInput.meta.inputLength === secretPayload.length,
    'meta=' + JSON.stringify(okInput.meta));
  ok('POST valid input meta.appendNewline is true',
    okInput.meta && okInput.meta.appendNewline === true);
  ok('POST valid input meta.auditWritten is true',
    okInput.meta && okInput.meta.auditWritten === true);
  ok('POST valid input write provider was called once', writeCalls.length === 1, 'calls=' + writeCalls.length);
  if (writeCalls.length >= 1) {
    ok('write provider received correct desktopAgentId', writeCalls[0].desktopAgentId === writeAgentId);
    ok('write provider received correct text', writeCalls[0].text === secretPayload, 'got=' + JSON.stringify(writeCalls[0].text));
    ok('write provider received appendNewline=true', writeCalls[0].opts && writeCalls[0].opts.appendNewline === true);
  }

  // 9. Response does NOT contain input text
  const okInputJson = JSON.stringify(okInput);
  ok('success response does not echo input text',
    !okInputJson.includes(secretPayload), 'response leaked: ' + okInputJson.substring(0, 400));

  // 10. Leak checks: no raw id / pid / tokenHash / resumeToken
  ok('success response does not contain raw terminal id mock-term-1',
    !okInputJson.includes('mock-term-1'));
  ok('success response does not contain pid field', !/"pid"\s*:/.test(okInputJson));
  ok('success response does not contain tokenHash', !/tokenHash/i.test(okInputJson));
  ok('success response does not contain resumeToken', !/resumeToken/i.test(okInputJson));

  // 11. Audit does not contain input text
  const auditRes = asJson(await request({ path: '/api/mobile/audit', method: 'GET', headers: writeAuth }));
  const auditJson = JSON.stringify(auditRes);
  ok('audit response does not contain raw input text',
    !auditJson.includes(secretPayload), 'audit leaked input: ' + auditJson.substring(0, 600));
  ok('audit contains desktop_agent.input.accepted entry',
    /desktop_agent\.input\.accepted/.test(auditJson));

  // 12. Timeline includes input_sent event with fixed text
  const timelineAfter = asJson(await request({
    path: '/api/mobile/desktop-agents/' + encodeURIComponent(writeAgentId) + '/timeline?limit=50',
    method: 'GET',
    headers: writeAuth,
  }));
  ok('timeline after input has events array', Array.isArray(timelineAfter.events), JSON.stringify(timelineAfter).substring(0, 300));
  const inputSentEvents = (timelineAfter.events || []).filter((e) => e && e.type === 'input_sent');
  ok('timeline contains at least one input_sent event', inputSentEvents.length >= 1, 'events=' + (timelineAfter.events || []).map((e) => e && e.type).join(','));
  if (inputSentEvents.length >= 1) {
    const ev = inputSentEvents[0];
    ok('input_sent event text is fixed literal (no echo)',
      ev.text === 'Mobile follow-up sent',
      'text=' + JSON.stringify(ev.text));
    ok('input_sent event has meta.inputLength',
      ev.meta && typeof ev.meta.inputLength === 'number' && ev.meta.inputLength === secretPayload.length,
      'meta=' + JSON.stringify(ev.meta));
    ok('input_sent event does NOT include deviceId in meta',
      !ev.meta || !ev.meta.deviceId,
      'meta=' + JSON.stringify(ev.meta));
    const evJson = JSON.stringify(ev);
    ok('input_sent event does not echo raw input text',
      !evJson.includes(secretPayload), 'event leaked: ' + evJson);
  }

  // 13. canSendFollowup is true for scoped device when provider is available
  const dashWrite = asJson(await request({ path: '/api/mobile/dashboard', method: 'GET', headers: writeAuth }));
  ok('dashboard with write scope has desktopContinuableAgents', Array.isArray(dashWrite.desktopContinuableAgents));
  const writeScopedAgent = (dashWrite.desktopContinuableAgents || []).find((a) => a.id === writeAgentId);
  ok('agent with canOpen shows canSendFollowup=true for write-scoped device',
    writeScopedAgent && writeScopedAgent.canSendFollowup === true,
    'agent=' + JSON.stringify(writeScopedAgent && writeScopedAgent.canSendFollowup));

  // Read-only device must see canSendFollowup=false regardless of provider
  const dashRead = asJson(await request({ path: '/api/mobile/dashboard', method: 'GET', headers: auth }));
  const readScopedAgent = (dashRead.desktopContinuableAgents || []).find((a) => a.id === writeAgentId);
  ok('agent shows canSendFollowup=false for read-only device',
    readScopedAgent && readScopedAgent.canSendFollowup === false,
    'agent=' + JSON.stringify(readScopedAgent && readScopedAgent.canSendFollowup));

  // Provider null → canSendFollowup=false even for write-scoped device
  mobile.setDesktopTerminalWriteProvider(null);
  const dashNoProv = asJson(await request({ path: '/api/mobile/dashboard', method: 'GET', headers: writeAuth }));
  const noProvAgent = (dashNoProv.desktopContinuableAgents || []).find((a) => a.id === writeAgentId);
  ok('agent shows canSendFollowup=false when write provider is null',
    noProvAgent && noProvAgent.canSendFollowup === false,
    'agent=' + JSON.stringify(noProvAgent && noProvAgent.canSendFollowup));
  mobile.setDesktopTerminalWriteProvider(mockWriteProvider);

  // 14. Rate limit: second immediate call returns rate_limited
  // Wait for previous rate-limit window to clear
  await new Promise((r) => setTimeout(r, 1100));
  writeCalls = [];
  const rateOk = asJson(await postInput(writeAgentId, { text: 'first message' }, writeAuth));
  ok('first post-rate-limit input accepted', rateOk.ok === true, JSON.stringify(rateOk));
  const rateLimited = asJson(await postInput(writeAgentId, { text: 'second too fast' }, writeAuth));
  ok('second input within 1s returns rate_limited',
    isStableError(rateLimited, 'rate_limited'), JSON.stringify(rateLimited));
  ok('rate_limited did NOT call write provider', writeCalls.length === 1, 'calls=' + writeCalls.length);

  // audit contains rate_limited entry
  const auditAfter = asJson(await request({ path: '/api/mobile/audit', method: 'GET', headers: writeAuth }));
  const auditAfterJson = JSON.stringify(auditAfter);
  ok('audit contains desktop_agent.input.rate_limited entry',
    /desktop_agent\.input\.rate_limited/.test(auditAfterJson));
  ok('audit does not contain rate-limited input text "second too fast"',
    !auditAfterJson.includes('second too fast'));

  // Wait for rate limit to clear, test with appendNewline=false
  await new Promise((r) => setTimeout(r, 1100));
  writeCalls = [];
  const noNewline = asJson(await postInput(writeAgentId, { text: 'no newline', appendNewline: false }, writeAuth));
  ok('input with appendNewline:false accepted', noNewline.ok === true, JSON.stringify(noNewline));
  if (writeCalls.length >= 1) {
    ok('write provider received appendNewline=false', writeCalls[0].opts && writeCalls[0].opts.appendNewline === false);
  }

  // 15. Devices endpoint does not expose token / tokenHash
  const devicesRes = asJson(await request({ path: '/api/mobile/devices', method: 'GET', headers: writeAuth }));
  const devicesResJson = JSON.stringify(devicesRes);
  ok('devices response does not expose token or tokenHash',
    !/tokenHash|"token"\s*:/.test(devicesResJson), 'devices=' + devicesResJson.substring(0, 500));
  ok('devices lists scopes array per device',
    Array.isArray(devicesRes.items) && devicesRes.items.every((d) => Array.isArray(d.scopes)),
    'devices[0].scopes=' + JSON.stringify(devicesRes.items && devicesRes.items[0] && devicesRes.items[0].scopes));

  // Reset BOTH providers to null
  mobile.setDesktopTerminalWriteProvider(null);
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
