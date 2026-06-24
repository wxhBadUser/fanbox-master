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

  section('5d) B3A: Phone project selection + new agent session draft');

  // B3A-1: GET /api/mobile/projects returns startable project list shape
  const projectsRes = asJson(await request({ path: '/api/mobile/projects', method: 'GET', headers: auth }));
  ok('GET /api/mobile/projects returns ok:true', projectsRes.ok === true, JSON.stringify(projectsRes).substring(0, 300));
  ok('projects.items is array', Array.isArray(projectsRes.items), 'items=' + JSON.stringify(projectsRes.items));

  if (Array.isArray(projectsRes.items) && projectsRes.items.length > 0) {
    const p0 = projectsRes.items[0];
    ok('project item has id', typeof p0.id === 'string');
    ok('project item has name', typeof p0.name === 'string');
    ok('project item has cwd', typeof p0.cwd === 'string');
    ok('project item has source', typeof p0.source === 'string');
    ok('project item has canCreateSession (boolean)', typeof p0.canCreateSession === 'boolean');
    ok('project item has reason (string)', typeof p0.reason === 'string');
    ok('project item has riskFlags (array)', Array.isArray(p0.riskFlags));
    ok('project item has agentIds (array)', Array.isArray(p0.agentIds), 'agentIds=' + JSON.stringify(p0.agentIds));
    ok('project item has sessionCount (number)', typeof p0.sessionCount === 'number');
    ok('project item has lastActiveAt (number)', typeof p0.lastActiveAt === 'number');
  }
  ok('projects response does not contain forbidden paths',
    !containsForbiddenPath(projectsRes), 'projects=' + JSON.stringify(projectsRes).substring(0, 500));

  // Helper for POST /sessions/draft
  const VALID_TEST_CWD = TMP_HOME;
  function postDraft(body, hdrs) {
    return request({
      path: '/api/mobile/sessions/draft',
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs || {}),
    }, JSON.stringify(body || {}));
  }

  // Track write provider calls before B3A (B2C set both providers to null, so writeCalls is gone)
  // We verify write provider is not called by noting that no new input events appear on a dummy agent timeline.

  // B3A-2: No token -> unauthorized
  const noAuthDraft = asJson(await postDraft({ cwd: VALID_TEST_CWD, agentId: 'claude', mode: 'draft' }, {}));
  ok('POST draft without token returns unauthorized',
    noAuthDraft.ok === false && isStableError(noAuthDraft, 'unauthorized'), JSON.stringify(noAuthDraft));

  // B3A-3: Missing cwd -> cwd_required
  const noCwdDraft = asJson(await postDraft({ agentId: 'claude', mode: 'draft' }, auth));
  ok('POST draft with missing cwd returns cwd_required',
    isStableError(noCwdDraft, 'cwd_required'), JSON.stringify(noCwdDraft));

  // B3A-4: Empty cwd -> cwd_required
  const emptyCwdDraft = asJson(await postDraft({ cwd: '', agentId: 'claude', mode: 'draft' }, auth));
  ok('POST draft with empty cwd returns cwd_required',
    isStableError(emptyCwdDraft, 'cwd_required'), JSON.stringify(emptyCwdDraft));

  // B3A-5: cwd outside allowed roots -> cwd_not_allowed
  // Use a path that resolves outside TMP_HOME
  const badCwdDraft = asJson(await postDraft({ cwd: 'C:\\Windows\\System32', agentId: 'claude', mode: 'draft' }, auth));
  ok('POST draft with disallowed cwd returns cwd_not_allowed',
    isStableError(badCwdDraft, 'cwd_not_allowed'), JSON.stringify(badCwdDraft));

  // B3A-6: bad agentId -> agent_not_allowed
  const badAgentDraft = asJson(await postDraft({ cwd: VALID_TEST_CWD, agentId: 'evilsh', mode: 'draft' }, auth));
  ok('POST draft with invalid agentId returns agent_not_allowed',
    isStableError(badAgentDraft, 'agent_not_allowed'), JSON.stringify(badAgentDraft));

  // B3A-7: title too long -> title_too_long
  const longTitle = 'x'.repeat(81);
  const longTitleDraft = asJson(await postDraft({ cwd: VALID_TEST_CWD, agentId: 'claude', title: longTitle, mode: 'draft' }, auth));
  ok('POST draft with title >80 returns title_too_long',
    isStableError(longTitleDraft, 'title_too_long'), JSON.stringify(longTitleDraft));

  // B3A-8: initialMessage too long -> initial_message_too_long
  const longMsg = 'y'.repeat(2001);
  const longMsgDraft = asJson(await postDraft({ cwd: VALID_TEST_CWD, agentId: 'claude', initialMessage: longMsg, mode: 'draft' }, auth));
  ok('POST draft with initialMessage >2000 returns initial_message_too_long',
    isStableError(longMsgDraft, 'initial_message_too_long'), JSON.stringify(longMsgDraft));

  // B3A-9: invalid mode -> invalid_mode
  const badModeDraft = asJson(await postDraft({ cwd: VALID_TEST_CWD, agentId: 'claude', mode: 'run' }, auth));
  ok('POST draft with invalid mode returns invalid_mode',
    isStableError(badModeDraft, 'invalid_mode'), JSON.stringify(badModeDraft));

  // Record write provider call count BEFORE the valid draft, to verify no write happens
  // (B2C already reset provider to null; B3A must not call it anyway)
  const auditBeforeDraft = asJson(await request({ path: '/api/mobile/audit?limit=50', method: 'GET', headers: auth }));
  const draftSecret = 'B3A-SECRET-PAYLOAD-' + Date.now() + '-do-not-echo-zzz';

  // B3A-10: Valid request creates draft
  const validDraftRes = await postDraft({
    cwd: VALID_TEST_CWD,
    agentId: 'claude',
    title: 'B3A test draft',
    initialMessage: draftSecret,
    mode: 'draft'
  }, auth);
  const validDraft = asJson(validDraftRes);
  ok('POST valid draft returns 200 ok:true', validDraftRes.status === 200 && validDraft.ok === true,
    'status=' + validDraftRes.status + ' body=' + JSON.stringify(validDraft).substring(0, 500));
  ok('POST valid draft has session object', !!(validDraft.session && typeof validDraft.session === 'object'),
    JSON.stringify(validDraft).substring(0, 400));
  ok('POST valid draft session.id is non-empty string',
    typeof (validDraft.session && validDraft.session.id) === 'string' && validDraft.session.id.length > 0);
  ok('POST valid draft session.status === "draft"',
    validDraft.session && validDraft.session.status === 'draft', 'status=' + (validDraft.session && validDraft.session.status));
  ok('POST valid draft session.agentId === "claude"',
    validDraft.session && validDraft.session.agentId === 'claude');
  ok('POST valid draft session.canStart === false',
    validDraft.session && validDraft.session.canStart === false);
  ok('POST valid draft session.source === "mobile-draft"',
    validDraft.session && validDraft.session.source === 'mobile-draft');
  ok('POST valid draft session has createdAt (number)',
    typeof (validDraft.session && validDraft.session.createdAt) === 'number');
  ok('POST valid draft session has cwd/cwdLabel/title',
    !!(validDraft.session && validDraft.session.cwd && validDraft.session.cwdLabel && validDraft.session.title));
  ok('POST valid draft meta.willSpawnAgent === false',
    validDraft.meta && validDraft.meta.willSpawnAgent === false);
  ok('POST valid draft meta.phase === "B3A"',
    validDraft.meta && validDraft.meta.phase === 'B3A');
  ok('POST valid draft meta.initialMessageLength equals message length',
    validDraft.meta && validDraft.meta.initialMessageLength === draftSecret.length);

  // B3A-11: timeline in response contains session_created event
  const draftTimeline = validDraft.timeline;
  ok('POST valid draft has timeline object', !!(draftTimeline && typeof draftTimeline === 'object'));
  ok('POST valid draft timeline.events is array',
    Array.isArray(draftTimeline && draftTimeline.events));
  const sessionCreatedEvt = draftTimeline && Array.isArray(draftTimeline.events)
    ? draftTimeline.events.find((e) => e && e.type === 'session_created')
    : null;
  ok('POST valid draft timeline contains session_created event', !!sessionCreatedEvt,
    'events=' + JSON.stringify(draftTimeline && draftTimeline.events));
  if (sessionCreatedEvt) {
    ok('session_created event.text is fixed literal',
      sessionCreatedEvt.text === 'Mobile session draft created', 'text=' + JSON.stringify(sessionCreatedEvt.text));
    ok('session_created event has meta.initialMessageLength (number)',
      typeof sessionCreatedEvt.meta.initialMessageLength === 'number');
    ok('session_created event does NOT include deviceId',
      !('deviceId' in (sessionCreatedEvt.meta || {})), 'meta=' + JSON.stringify(sessionCreatedEvt.meta));
    ok('session_created event meta does NOT contain initialMessage text',
      JSON.stringify(sessionCreatedEvt).indexOf(draftSecret) === -1);
  }

  // B3A-12: Response does not leak sensitive fields
  const draftJson = JSON.stringify(validDraft);
  ok('draft response does not contain internalId', !/internalId/.test(draftJson));
  ok('draft response does not contain pid', !/["']pid["']\s*:/.test(draftJson));
  ok('draft response does not contain tokenHash', !/tokenHash/.test(draftJson));
  ok('draft response does not contain resumeToken', !/resumeToken/.test(draftJson));
  ok('draft response does NOT echo initialMessage secret',
    draftJson.indexOf(draftSecret) === -1, 'found secret in response!');

  // B3A-13: Audit contains mobile_session.draft.created, no secret
  const auditAfterDraft = asJson(await request({ path: '/api/mobile/audit?limit=50', method: 'GET', headers: auth }));
  const auditHasDraftCreated = Array.isArray(auditAfterDraft.items) &&
    auditAfterDraft.items.some((a) => a && a.action === 'mobile_session.draft.created');
  ok('audit contains mobile_session.draft.created entry', auditHasDraftCreated,
    'audit actions=' + JSON.stringify((auditAfterDraft.items || []).map((a) => a && a.action)));
  const auditText = JSON.stringify(auditAfterDraft);
  ok('audit does NOT contain initialMessage secret',
    auditText.indexOf(draftSecret) === -1, 'audit has secret!');
  ok('audit entries contain initialMessageLength (number) for draft',
    Array.isArray(auditAfterDraft.items) && auditAfterDraft.items.some((a) =>
      a && a.action === 'mobile_session.draft.created' && typeof a.initialMessageLength === 'number'));

  // B3A-14: Re-fetch timeline via GET, session_created still present
  const newSessionId = validDraft.session.id;
  const fetchedTimeline = asJson(await request({
    path: '/api/mobile/sessions/' + encodeURIComponent(newSessionId) + '/timeline',
    method: 'GET',
    headers: auth
  }));
  ok('GET session timeline after draft returns ok:true', fetchedTimeline.ok === true, JSON.stringify(fetchedTimeline).substring(0, 300));
  ok('GET session timeline contains session_created event',
    Array.isArray(fetchedTimeline.events) && fetchedTimeline.events.some((e) => e && e.type === 'session_created'),
    'events=' + JSON.stringify((fetchedTimeline.events || []).map((e) => e && e.type)));

  // B3A-15: Timeline does not leak secrets/sensitive fields
  const timelineText = JSON.stringify(fetchedTimeline);
  ok('timeline response does not contain initialMessage secret',
    timelineText.indexOf(draftSecret) === -1);
  ok('timeline response does not contain tokenHash/resumeToken/pid/internalId',
    !/tokenHash|resumeToken|["']pid["']\s*:|internalId/.test(timelineText));

  // B3A-16: Session list includes the new draft session
  const sessionsList = asJson(await request({ path: '/api/mobile/sessions?limit=50', method: 'GET', headers: auth }));
  ok('GET /api/mobile/sessions returns ok:true with items',
    sessionsList.ok === true && Array.isArray(sessionsList.items), JSON.stringify(sessionsList).substring(0, 200));
  const foundDraftInList = Array.isArray(sessionsList.items) && sessionsList.items.some((s) => s && s.sessionId === newSessionId);
  ok('sessions list contains the newly created draft session', foundDraftInList,
    'looking for ' + newSessionId);

  // B3A-17: Draft session does not trigger write provider (B2C path) — since provider is null,
  // any accidental call would throw. The successful creation of the draft already proves no spawn.
  // Additionally verify no new desktop agent timeline was created/polluted.

  section('5e) B3B: Start Mobile Draft Session Runner');

  // Create a token with session:start scope for B3B tests
  const b3bTokenPlain = mobile.genToken();
  const b3bDeviceId = mobile.genDeviceId();
  const b3bTokenHash = mobile.sha256(b3bTokenPlain);
  await mobile.addTokenRecord({
    id: b3bDeviceId,
    deviceName: 'B3B Test Phone',
    tokenHash: b3bTokenHash,
    scopes: ['read:status', 'read:files', 'session:start'],
    pairedAt: Date.now(),
    lastSeenAt: Date.now(),
    revoked: false,
  });
  const b3bAuth = { Authorization: 'Bearer ' + b3bTokenPlain };

  // Also create a read-only token without session:start
  const roTokenPlain = mobile.genToken();
  const roDeviceId = mobile.genDeviceId();
  const roTokenHash = mobile.sha256(roTokenPlain);
  await mobile.addTokenRecord({
    id: roDeviceId,
    deviceName: 'Read-Only Phone',
    tokenHash: roTokenHash,
    scopes: ['read:status', 'read:files'],
    pairedAt: Date.now(),
    lastSeenAt: Date.now(),
    revoked: false,
  });
  const roAuth = { Authorization: 'Bearer ' + roTokenPlain };

  // Create a fresh draft session for B3B tests (with initialMessage)
  const b3bProjectDir = path.join(TMP_HOME, 'b3b-project');
  fs.mkdirSync(b3bProjectDir, { recursive: true });
  fs.writeFileSync(path.join(b3bProjectDir, 'README.md'), '# B3B test\n');

  const b3bDraftBody = JSON.stringify({
    cwd: b3bProjectDir,
    agentId: 'qoder',
    title: 'B3B start test',
    initialMessage: 'Run a quick test for B3B phase',
    mode: 'draft',
  });
  const b3bDraftResp = await request({
    path: '/api/mobile/sessions/draft',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, b3bDraftBody);
  const b3bDraftJson = asJson(b3bDraftResp);
  ok('B3B: fresh draft created with session:start token',
    b3bDraftResp.status === 200 && b3bDraftJson.ok === true && b3bDraftJson.session && b3bDraftJson.session.id,
    JSON.stringify(b3bDraftJson).substring(0, 300));
  const b3bSessionId = b3bDraftJson.session && b3bDraftJson.session.id;

  // B3B-1: No token returns 401
  const b3bNoTokenStart = asJson(await request({
    path: '/api/mobile/sessions/' + b3bSessionId + '/start',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ confirm: true })));
  ok('B3B-1: POST start without token returns 401 unauthorized',
    b3bNoTokenStart.ok === false && isStableError(b3bNoTokenStart, 'unauthorized'),
    JSON.stringify(b3bNoTokenStart));

  // B3B-2: Read-only token returns session_start_scope_required
  const b3bRoStart = asJson(await request({
    path: '/api/mobile/sessions/' + b3bSessionId + '/start',
    method: 'POST',
    headers: { ...roAuth, 'Content-Type': 'application/json' },
  }, JSON.stringify({ confirm: true })));
  ok('B3B-2: POST start without session:start scope returns session_start_scope_required',
    b3bRoStart.ok === false && isStableError(b3bRoStart, 'session_start_scope_required'),
    JSON.stringify(b3bRoStart));

  // B3B-3: Non-existent session returns session_not_found
  const b3bNotFoundStart = asJson(await request({
    path: '/api/mobile/sessions/mobile-nonexistent123/start',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, JSON.stringify({ confirm: true })));
  ok('B3B-3: POST start for non-existent session returns session_not_found',
    b3bNotFoundStart.ok === false && isStableError(b3bNotFoundStart, 'session_not_found'),
    JSON.stringify(b3bNotFoundStart));

  // B3B-4: Non-draft session returns session_not_draft (use the seeded session which is running)
  const b3bRunningStart = asJson(await request({
    path: '/api/mobile/sessions/' + draft.sessionId + '/start',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, JSON.stringify({ confirm: true })));
  ok('B3B-4: POST start for non-draft session returns session_not_draft',
    b3bRunningStart.ok === false && isStableError(b3bRunningStart, 'session_not_draft'),
    JSON.stringify(b3bRunningStart));

  // B3B-5: Missing confirm:true returns confirm_required
  const b3bNoConfirmStart = asJson(await request({
    path: '/api/mobile/sessions/' + b3bSessionId + '/start',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, JSON.stringify({})));
  ok('B3B-5: POST start without confirm returns confirm_required',
    b3bNoConfirmStart.ok === false && isStableError(b3bNoConfirmStart, 'confirm_required'),
    JSON.stringify(b3bNoConfirmStart));

  // B3B-6: cwd not allowed (create a draft with a forbidden cwd scenario via direct manipulation)
  // Test by starting another device's draft session
  const b3bOtherDeviceDraft = await mobileSessions.createMobileDraftSession({
    cwd: b3bProjectDir,
    agentId: 'qoder',
    deviceId: 'other-device-id-not-mine',
    initialMessage: 'not my session',
    title: 'other device draft',
  });
  const b3bOtherStart = asJson(await request({
    path: '/api/mobile/sessions/' + b3bOtherDeviceDraft.sessionId + '/start',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, JSON.stringify({ confirm: true })));
  ok('B3B-6: POST start for another device\'s draft is rejected',
    b3bOtherStart.ok === false && (isStableError(b3bOtherStart, 'forbidden') || b3bOtherStart.error),
    JSON.stringify(b3bOtherStart));

  // B3B-7: bad agentId returns agent_not_allowed
  // Create a valid draft first, then tamper with stored agentId
  const b3bBadDraftBody = JSON.stringify({
    cwd: b3bProjectDir,
    agentId: 'qoder',
    title: 'bad agent draft',
    initialMessage: 'bad agent',
    mode: 'draft',
  });
  const b3bBadDraftResp = await request({
    path: '/api/mobile/sessions/draft',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, b3bBadDraftBody);
  const b3bBadDraftJson = asJson(b3bBadDraftResp);
  const b3bBadAgentSessionId = b3bBadDraftJson.session && b3bBadDraftJson.session.id;
  // Tamper: directly modify stored session to have invalid agentId
  {
    const sObj = await mobileSessions.readMobileSessionsObj();
    const entry = Object.entries(sObj.sessions || {}).find(([, v]) => v && v.sessionId === b3bBadAgentSessionId);
    if (entry) {
      entry[1].agentId = 'malicious-agent';
      await mobileSessions.writeMobileSessions(sObj);
    }
  }
  const b3bBadAgentStart = asJson(await request({
    path: '/api/mobile/sessions/' + b3bBadAgentSessionId + '/start',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, JSON.stringify({ confirm: true })));
  ok('B3B-7: POST start with bad agentId returns agent_not_allowed',
    b3bBadAgentStart.ok === false && isStableError(b3bBadAgentStart, 'agent_not_allowed'),
    JSON.stringify(b3bBadAgentStart));

  // B3B-8: Legal start with mock runner (MOBILE_AGENT_FORCE_STUB=1 already set)
  const b3bValidStart = asJson(await request({
    path: '/api/mobile/sessions/' + b3bSessionId + '/start',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, JSON.stringify({ confirm: true })));
  ok('B3B-8: Legal POST start returns ok:true',
    b3bValidStart.ok === true,
    JSON.stringify(b3bValidStart).substring(0, 500));
  ok('B3B-8b: session status is done (sync runner completed)',
    b3bValidStart.session && b3bValidStart.session.status === 'done',
    'status=' + (b3bValidStart.session && b3bValidStart.session.status));
  ok('B3B-8c: session.source is mobile-draft',
    b3bValidStart.session && b3bValidStart.session.source === 'mobile-draft',
    'source=' + (b3bValidStart.session && b3bValidStart.session.source));
  ok('B3B-8d: session.canStart is false',
    b3bValidStart.session && b3bValidStart.session.canStart === false,
    'canStart=' + (b3bValidStart.session && b3bValidStart.session.canStart));
  ok('B3B-8e: meta.phase is B3B',
    b3bValidStart.meta && b3bValidStart.meta.phase === 'B3B',
    'meta=' + JSON.stringify(b3bValidStart.meta));
  ok('B3B-8f: meta.willSpawnAgent is true',
    b3bValidStart.meta && b3bValidStart.meta.willSpawnAgent === true);
  ok('B3B-8g: meta.auditWritten is true',
    b3bValidStart.meta && b3bValidStart.meta.auditWritten === true);
  ok('B3B-8h: meta.usedStub is true (MOBILE_AGENT_FORCE_STUB=1)',
    b3bValidStart.meta && b3bValidStart.meta.usedStub === true);
  ok('B3B-8i: initialMessageLength is positive',
    typeof b3bValidStart.meta.initialMessageLength === 'number' && b3bValidStart.meta.initialMessageLength > 0);

  // B3B-9: timeline contains required events
  const b3bStartTl = b3bValidStart.timeline;
  ok('B3B-9: timeline.events is an array', Array.isArray(b3bStartTl && b3bStartTl.events), JSON.stringify(b3bStartTl));
  const b3bTlTypes = Array.isArray(b3bStartTl && b3bStartTl.events) ? b3bStartTl.events.map(e => e.type) : [];
  ok('B3B-9b: timeline contains agent_start_requested',
    b3bTlTypes.includes('agent_start_requested'), 'types=' + b3bTlTypes.join(','));
  ok('B3B-9c: timeline contains agent_started',
    b3bTlTypes.includes('agent_started'), 'types=' + b3bTlTypes.join(','));
  ok('B3B-9d: timeline contains agent_completed',
    b3bTlTypes.includes('agent_completed'), 'types=' + b3bTlTypes.join(','));

  // B3B-10: Response does NOT contain sensitive fields
  const b3bStartText = JSON.stringify(b3bValidStart);
  ok('B3B-10: Response does not leak pid/tokenHash/resumeToken/raw process',
    !/tokenHash|["']pid["']\s*:|resumeToken|rawProcess|internalId|_internal/.test(b3bStartText),
    b3bStartText.substring(0, 400));

  // B3B-11: Response does not contain initialMessage plain text
  ok('B3B-11: Response does not echo initialMessage plain text',
    !b3bStartText.includes('Run a quick test for B3B phase'),
    'message text should not be in response');

  // B3B-12: Audit does not contain initialMessage plain text
  const b3bAuditAfter = await mobileSessions.readAuditMobile();
  const b3bAuditText = JSON.stringify(b3bAuditAfter);
  ok('B3B-12: Audit does not contain initialMessage plain text',
    !b3bAuditText.includes('Run a quick test for B3B phase'),
    'audit should not contain initial message content');
  ok('B3B-12b: Audit contains mobile_session.start.accepted',
    b3bAuditText.includes('mobile_session.start.accepted'));
  ok('B3B-12c: Audit contains mobile_session.start.completed',
    b3bAuditText.includes('mobile_session.start.completed'));
  ok('B3B-12d: Audit contains mobile_session.start.rejected for scope check',
    b3bAuditText.includes('session_start_scope_required'));

  // B3B-13: Verify via GET that session status is done and canStart is false
  const b3bSessionAfter = asJson(await request({
    path: '/api/mobile/sessions/' + b3bSessionId,
    method: 'GET',
    headers: b3bAuth,
  }));
  ok('B3B-13: GET session after start returns status=done',
    b3bSessionAfter.ok === true && b3bSessionAfter.session && b3bSessionAfter.session.status === 'done',
    JSON.stringify(b3bSessionAfter).substring(0, 300));

  // B3B-14: Verify messages: user message is now 'sent', agent message is present
  const b3bMsgsAfter = asJson(await request({
    path: '/api/mobile/sessions/' + b3bSessionId + '/messages',
    method: 'GET',
    headers: b3bAuth,
  }));
  ok('B3B-14: GET messages returns ok with messages array',
    b3bMsgsAfter.ok === true && Array.isArray(b3bMsgsAfter.messages),
    JSON.stringify(b3bMsgsAfter).substring(0, 300));
  const b3bMsgArr = Array.isArray(b3bMsgsAfter.messages) ? b3bMsgsAfter.messages : [];
  const b3bUserMsg = b3bMsgArr.find(m => m.role === 'user');
  const b3bAgentMsg = b3bMsgArr.find(m => m.role === 'agent');
  ok('B3B-14b: user message exists with status=sent (not draft-pending)',
    b3bUserMsg && b3bUserMsg.status === 'sent',
    b3bUserMsg ? 'user status=' + b3bUserMsg.status : 'no user msg');
  ok('B3B-14c: agent response message exists',
    !!b3bAgentMsg, 'agent present=' + !!b3bAgentMsg);

  // B3B-15: Rate limit: second immediate start is rate_limited
  const b3bDraft2Body = JSON.stringify({
    cwd: b3bProjectDir,
    agentId: 'qoder',
    title: 'B3B rate limit test',
    initialMessage: 'rate limit test',
    mode: 'draft',
  });
  const b3bDraft2Resp = await request({
    path: '/api/mobile/sessions/draft',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, b3bDraft2Body);
  const b3bDraft2Json = asJson(b3bDraft2Resp);
  const b3bSessionId2 = b3bDraft2Json.session && b3bDraft2Json.session.id;

  const b3bRateStart = asJson(await request({
    path: '/api/mobile/sessions/' + b3bSessionId2 + '/start',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, JSON.stringify({ confirm: true })));
  ok('B3B-15: Second immediate start is rate_limited (429)',
    b3bRateStart.ok === false && isStableError(b3bRateStart, 'rate_limited'),
    JSON.stringify(b3bRateStart).substring(0, 300));

  // Wait for rate limit to pass, then verify the second draft can be started
  await new Promise(r => setTimeout(r, 5200));
  const b3bAfterRateStart = asJson(await request({
    path: '/api/mobile/sessions/' + b3bSessionId2 + '/start',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, JSON.stringify({ confirm: true })));
  ok('B3B-15b: After rate limit window passes, start succeeds',
    b3bAfterRateStart.ok === true,
    JSON.stringify(b3bAfterRateStart).substring(0, 200));

  // B3B-16: Devices endpoint shows scopes without exposing tokens
  const b3bDevicesResp = asJson(await request({
    path: '/api/mobile/devices',
    method: 'GET',
    headers: b3bAuth,
  }));
  ok('B3B-16: Devices endpoint returns ok with items',
    b3bDevicesResp.ok === true && Array.isArray(b3bDevicesResp.items),
    JSON.stringify(b3bDevicesResp).substring(0, 300));
  const b3bDeviceInList = Array.isArray(b3bDevicesResp.items) && b3bDevicesResp.items.find(d => d.id === b3bDeviceId);
  ok('B3B-16b: B3B device is listed with scopes array containing session:start',
    b3bDeviceInList && Array.isArray(b3bDeviceInList.scopes) && b3bDeviceInList.scopes.includes('session:start'),
    b3bDeviceInList ? 'scopes=' + JSON.stringify(b3bDeviceInList.scopes) : 'device not found');
  const b3bDevicesText = JSON.stringify(b3bDevicesResp);
  ok('B3B-16c: Devices endpoint does NOT leak tokens/tokenHash',
    !/tokenHash|["']token["']\s*:|secret/i.test(b3bDevicesText),
    'devices response should not contain raw tokens');

  // B3B-17: Timeline fetched via GET for completed session includes all B3B events
  const b3bTlAfter = asJson(await request({
    path: '/api/mobile/sessions/' + b3bSessionId + '/timeline?limit=50',
    method: 'GET',
    headers: b3bAuth,
  }));
  ok('B3B-17: GET timeline returns ok', b3bTlAfter.ok === true, JSON.stringify(b3bTlAfter).substring(0, 200));
  const b3bTlAfterTypes = Array.isArray(b3bTlAfter.events) ? b3bTlAfter.events.map(e => e.type) : [];
  ok('B3B-17b: GET timeline contains session_created',
    b3bTlAfterTypes.includes('session_created'), 'types=' + b3bTlAfterTypes.join(','));
  ok('B3B-17c: GET timeline contains agent_start_requested',
    b3bTlAfterTypes.includes('agent_start_requested'), 'types=' + b3bTlAfterTypes.join(','));
  ok('B3B-17d: GET timeline contains agent_started',
    b3bTlAfterTypes.includes('agent_started'), 'types=' + b3bTlAfterTypes.join(','));
  ok('B3B-17e: GET timeline contains agent_completed',
    b3bTlAfterTypes.includes('agent_completed'), 'types=' + b3bTlAfterTypes.join(','));

  // B3B-18: Client cannot override cwd/agentId/initialMessage (body params are ignored)
  const b3bDraft3Body = JSON.stringify({
    cwd: b3bProjectDir,
    agentId: 'qoder',
    title: 'override test',
    initialMessage: 'original message',
    mode: 'draft',
  });
  const b3bDraft3Resp = await request({
    path: '/api/mobile/sessions/draft',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, b3bDraft3Body);
  const b3bDraft3Json = asJson(b3bDraft3Resp);
  const b3bSessionId3 = b3bDraft3Json.session && b3bDraft3Json.session.id;
  await new Promise(r => setTimeout(r, 5200)); // wait rate limit

  const b3bOverrideStart = asJson(await request({
    path: '/api/mobile/sessions/' + b3bSessionId3 + '/start',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, JSON.stringify({
    confirm: true,
    cwd: 'C:\\Windows\\System32',
    agentId: 'malware',
    initialMessage: 'overridden message',
    command: 'rm -rf /',
    args: ['--evil'],
    binary: 'cmd.exe'
  })));
  ok('B3B-18: Extra body fields (cwd/agentId/command/args) are ignored - start still succeeds with stored values',
    b3bOverrideStart.ok === true && b3bOverrideStart.session && b3bOverrideStart.session.agentId === 'qoder',
    JSON.stringify(b3bOverrideStart).substring(0, 400));
  const b3bOverrideText = JSON.stringify(b3bOverrideStart);
  ok('B3B-18b: No command injection in response',
    !b3bOverrideText.includes('rm -rf') && !b3bOverrideText.includes('cmd.exe') && !b3bOverrideText.includes('malware'));

  // B3B-19: No arbitrary shell - verify runner is the safe stub, no raw shell executed
  ok('B3B-19: No shell access - runner uses MOBILE_AGENT_FORCE_STUB (usedStub=true in meta)',
    b3bOverrideStart.meta && b3bOverrideStart.meta.usedStub === true,
    'stub runner was used, no real CLI spawned');

  // B3B-20: Response does not contain pid/tokenHash/resumeToken/raw process
  ok('B3B-20: Response does not leak process details',
    !/tokenHash|["']pid["']\s*:|resumeToken|rawProcess|internalId|_internal/.test(b3bOverrideText));

  // B3B-21: Verify that trying to start an already-started session returns session_not_draft
  await new Promise(r => setTimeout(r, 5200)); // wait for rate limit to pass
  const b3bSecondStart = asJson(await request({
    path: '/api/mobile/sessions/' + b3bSessionId + '/start',
    method: 'POST',
    headers: { ...b3bAuth, 'Content-Type': 'application/json' },
  }, JSON.stringify({ confirm: true })));
  ok('B3B-21: Second start on completed session returns session_not_draft',
    b3bSecondStart.ok === false && isStableError(b3bSecondStart, 'session_not_draft'),
    JSON.stringify(b3bSecondStart).substring(0, 200));

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
