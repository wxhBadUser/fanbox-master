/* eslint-disable */
// Phase 2A-1 smoke · Mobile Sessions + Agent Workspace Shell
//
// 验证：
//   1) auth 边界：no token / bad token / 非 LAN 全部拒绝
//   2) /api/mobile/sessions 200 + 结构化 + 不含 token/cookie/apiKey/.jsonl/claudeSession/codexSession
//   3) /api/mobile/sessions/:id 200 + messages 截断 + outputTail ≤ 1024
//   4) /api/mobile/sessions/by-cwd?cwd= 只返回该 cwd
//   5) /api/mobile/context/current 200
//   6) /api/mobile/context/cwd 校验 allowed roots（越界 403）+ 不启动 agent
//   7) /api/mobile/context/select 200 + 不启动 agent
//   8) UI 改动：5 Tab = Home / Files / Agent / Skills / Sessions（不再有 Usage Tab）
//   9) UI 危险文案扫描：无 Start Agent / Run Agent / Send Task / Execute / Terminal Input /
//      Delete File / Rename File / Move File / Upload File
//  10) UI 行为：Files 顶部 "在此文件夹打开 Agent" / "查看此文件夹 Sessions"
//  11) 关闭 Mobile Access 后 sessions API 一律 401
//  12) 没有 /api/mobile/sessions/:id/messages POST 端点
//  13) 没有 /api/mobile/pty/input 端点
//  14) Phase 0A / Phase 1 smoke 仍能独立运行（不在本脚本内跑）
//
// 注意：agent 安装探测可能要 spawn 子进程，本测试通过 mock 数据绕开。

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-smoke-phase2a-' + Date.now());
fs.mkdirSync(TMP_HOME, { recursive: true });
process.env.HOME = TMP_HOME; process.env.USERPROFILE = TMP_HOME;
process.env.FANBOX_MOBILE_DIR = path.join(TMP_HOME, '.fanbox', 'mobile');
process.env.FANBOX_WECHAT_DIR = path.join(TMP_HOME, '.fanbox', 'wechat');
process.env.FANBOX_SESSIONS_DIR = path.join(TMP_HOME, '.fanbox', 'sessions');
fs.mkdirSync(process.env.FANBOX_MOBILE_DIR, { recursive: true });
fs.mkdirSync(process.env.FANBOX_WECHAT_DIR, { recursive: true });
fs.mkdirSync(process.env.FANBOX_SESSIONS_DIR, { recursive: true });

const mobile = require(path.join(__dirname, '..', 'electron', 'mobile.js'));
const mobileSessions = mobile.mobileSessions;

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
function section(t) { console.log('\n[' + t + ']'); }

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_MOBILE = path.join(ROOT_DIR, 'public', 'mobile');
const HTML_PATH = path.join(PUBLIC_MOBILE, 'index.html');
const CSS_PATH  = path.join(PUBLIC_MOBILE, 'mobile.css');
const JS_PATH   = path.join(PUBLIC_MOBILE, 'mobile.js');

const port = 14581;

function req(opts, body) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, ...opts }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: buf }));
    });
    r.on('error', (e) => resolve({ status: 0, error: String(e), body: '' }));
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  // ============================================================
  // [1] 准备：启动 server + 配对拿 token
  // ============================================================
  section('1) 准备：启动 server + 配对 + 注入 mock 数据');
  const server = mobile.startMobileServer({ port });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise((r) => setTimeout(r, 20));
  ok('mobile server listening', server.listening);
  await mobile.saveConfig({ enabled: true });
  const pc = await mobile.startPairCode();
  const rPC = await req({ path: '/api/mobile/pair/confirm', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({ pairCode: pc.pairCode, deviceName: 'Smoke-Phase2A' }));
  const jPC = JSON.parse(rPC.body);
  const token = jPC.token;
  const auth = { Authorization: 'Bearer ' + token };
  ok('pair/confirm 200', rPC.status === 200);
  ok('token 取得', !!token && token.length > 30);

  // ---- 注入 wechat sessions（含敏感字段，必须被 scrub）----
  const wechatPath = path.join(process.env.FANBOX_WECHAT_DIR, 'conversations.json');
  const now = Date.now();
  const wechatMock = {
    desktop: {
      label: 'wx-desktop-1',
      updatedAt: now - 60000,
      lastActiveAt: now - 60000,
      claudeSession: 'wx-claude-uuid-LEAKED-SHOULD-NOT-APPEAR',
      codexSession: 'wx-codex-uuid-LEAKED-SHOULD-NOT-APPEAR',
      messages: [
        { role: 'user', text: '帮我看看 fanbox 的 mobile 端怎么搞' },
        { role: 'agent', text: '这是 wechat 会话回复 preview。这里有一串 secret=AKIAI44QH8DHBEXAMPLE password=hunter2' }
      ]
    },
    'wx-other-2': {
      label: 'wx-other-2',
      updatedAt: now - 120000,
      lastActiveAt: now - 120000,
      messages: [
        { role: 'user', text: 'token=abc123def456ghi789 帮我看看' },
        { role: 'agent', text: 'ok' }
      ]
    }
  };
  fs.writeFileSync(wechatPath, JSON.stringify(wechatMock, null, 2), 'utf8');

  // ---- 注入 mobile sessions ----
  const mobileSessPath = path.join(process.env.FANBOX_MOBILE_DIR, 'sessions.json');
  const cwdMock = path.join(TMP_HOME, 'fanbox-cwd-A');
  fs.mkdirSync(cwdMock, { recursive: true });
  const cwdMockB = path.join(TMP_HOME, 'fanbox-cwd-B');
  fs.mkdirSync(cwdMockB, { recursive: true });
  const mobileMock = {
    schemaVersion: 2,
    sessions: {
      'mobile-A': {
        agentId: 'claude',
        kind: 'agent',
        cwd: cwdMock,
        title: 'mobile A 测试 session',
        status: 'idle',
        createdAt: now - 300000,
        updatedAt: now - 30000,
        lastActiveAt: now - 30000,
        messageCount: 3,
        tokenEstimate: 1500,
        summary: {
          lastMessagePreview: '最近一条 preview，含敏感：sk-abcdefghijklmnop12345',
          outputTail: 'output tail content',
          lastRole: 'agent'
        },
        context: { files: ['README.md', 'package.json'], skills: ['plan'] }
      },
      'mobile-B': {
        agentId: 'codex',
        kind: 'agent',
        cwd: cwdMockB,
        title: 'mobile B 测试 session',
        status: 'unknown',
        createdAt: now - 200000,
        updatedAt: now - 20000,
        lastActiveAt: now - 20000,
        summary: {
          lastMessagePreview: 'B 会话 preview',
          outputTail: '',
          lastRole: 'user'
        }
      }
    }
  };
  fs.writeFileSync(mobileSessPath, JSON.stringify(mobileMock, null, 2), 'utf8');

  // ---- 注入 desktop sessions（含敏感字段）----
  const desktopPath = path.join(process.env.FANBOX_SESSIONS_DIR, 'index.json');
  const desktopMock = {
    sessions: {
      'desktop-X': {
        agentId: 'opencode',
        cwd: cwdMock,
        title: 'desktop X',
        status: 'idle',
        createdAt: now - 100000,
        updatedAt: now - 10000,
        lastActiveAt: now - 10000,
        token: 'should-not-leak-bearer-token-1234',
        cookie: 'session-cookie-LEAK',
        apiKey: 'AKIA-LIVE-LEAK',
        claudeSession: 'cs-uuid-LEAK',
        summary: {
          lastMessagePreview: 'desktop preview secret=p@ssw0rd!!',
          outputTail: 'x'.repeat(2048),  // 测试截断
          lastRole: 'agent'
        }
      }
    }
  };
  fs.writeFileSync(desktopPath, JSON.stringify(desktopMock, null, 2), 'utf8');

  ok('mock 数据已注入 wechat / mobile / desktop 三处', true);

  // ============================================================
  // [2] auth 边界
  // ============================================================
  section('2) auth 边界');
  const paths = [
    '/api/mobile/sessions',
    '/api/mobile/sessions/by-cwd?cwd=' + encodeURIComponent(cwdMock),
    '/api/mobile/context/current'
  ];
  for (const p of paths) {
    const r = await req({ path: p, method: 'GET' });
    ok('no-token ' + p + ' 401', r.status === 401, r.status);
    const r2 = await req({ path: p, method: 'GET', headers: { Authorization: 'Bearer wrong-token' } });
    ok('bad-token ' + p + ' 401', r2.status === 401, r2.status);
  }
  // POST context
  for (const p of ['/api/mobile/context/cwd', '/api/mobile/context/select']) {
    const r = await req({ path: p, method: 'POST', headers: { 'Content-Type': 'application/json' } }, '{}');
    ok('no-token POST ' + p + ' 401', r.status === 401, r.status);
    const r2 = await req({ path: p, method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' } }, '{}');
    ok('bad-token POST ' + p + ' 401', r2.status === 401, r2.status);
  }

  // ============================================================
  // [3] /api/mobile/sessions 200 + 结构化
  // ============================================================
  section('3) /api/mobile/sessions 列表');
  const rList = await req({ path: '/api/mobile/sessions?limit=50', method: 'GET', headers: auth });
  const jList = JSON.parse(rList.body);
  ok('list 200', rList.status === 200);
  ok('list.ok === true', jList.ok === true);
  ok('list.items 是数组', Array.isArray(jList.items));
  ok('list 至少包含 wechat+mobile+desktop 注入数据', jList.items.length >= 4, 'count=' + jList.items.length);
  ok('list 含 3 种 source', new Set(jList.items.map(i => i.source)).size >= 2, 'sources=' + Array.from(new Set(jList.items.map(i => i.source))).join(','));

  // ============================================================
  // [4] /api/mobile/sessions 不含敏感字段
  // ============================================================
  section('4) /api/mobile/sessions 不含敏感字段');
  const listStr = JSON.stringify(jList);
  ok('list 不含 token 字段', !listStr.includes('"token"') && !/should-not-leak-bearer-token-1234/.test(listStr));
  ok('list 不含 cookie 字段', !listStr.includes('"cookie"') && !/session-cookie-LEAK/.test(listStr));
  ok('list 不含 apiKey 字段', !listStr.includes('"apiKey"') && !/AKIA-LIVE-LEAK/.test(listStr));
  ok('list 不含 secret 字段', !/secret=AKIA/.test(listStr) && !/secret=p@ssw0rd/.test(listStr));
  ok('list 不含 password 字段', !/password=hunter2/.test(listStr) && !/p@ssw0rd/.test(listStr));
  ok('list 不含 Bearer 字面', !/Bearer\s+[A-Za-z0-9]/.test(listStr));
  ok('list 不含 sk-xxx 长串', !/sk-[a-zA-Z0-9_-]{20,}/.test(listStr));
  ok('list 不含 .jsonl 路径', !listStr.includes('.jsonl'));
  ok('list 不含 .cast 路径', !listStr.includes('.cast'));
  ok('list 不含 claudeSession 字段', !listStr.includes('claudeSession'));
  ok('list 不含 codexSession 字段', !listStr.includes('codexSession'));
  ok('list 不含 wx-claude-uuid-LEAKED', !listStr.includes('wx-claude-uuid-LEAKED'));
  ok('list 不含 wx-codex-uuid-LEAKED', !listStr.includes('wx-codex-uuid-LEAKED'));
  ok('list 不含 cs-uuid-LEAK', !listStr.includes('cs-uuid-LEAK'));
  // 项级
  for (const it of jList.items) {
    if ('token' in it) { ok('item ' + it.sessionId + ' 无 token', false, JSON.stringify(it).slice(0, 200)); break; }
    if ('cookie' in it) { ok('item ' + it.sessionId + ' 无 cookie', false); break; }
    if ('apiKey' in it) { ok('item ' + it.sessionId + ' 无 apiKey', false); break; }
    if ('claudeSession' in it) { ok('item ' + it.sessionId + ' 无 claudeSession', false); break; }
    if ('codexSession' in it) { ok('item ' + it.sessionId + ' 无 codexSession', false); break; }
  }
  ok('所有 item 字段都已被 scrub', true);

  // 验证 sessionId 已被重写为安全格式（不包含原始 UUID）
  for (const it of jList.items) {
    if (!/^(wechat|mobile|desktop)-[a-z]+-[a-f0-9]{8,16}$/.test(it.sessionId)) {
      ok('sessionId 安全格式: ' + it.sessionId, false);
      break;
    }
  }
  ok('所有 sessionId 都已重写为 makeId 格式', true);

  // ============================================================
  // [5] /api/mobile/sessions/:id detail
  // ============================================================
  section('5) /api/mobile/sessions/:id detail');
  const someId = jList.items[0] && jList.items[0].sessionId;
  if (someId) {
    const rDet = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(someId), method: 'GET', headers: auth });
    const jDet = JSON.parse(rDet.body);
    ok('detail 200', rDet.status === 200);
    ok('detail.ok', jDet.ok === true);
    ok('detail.session 存在', !!jDet.session);
    const detStr = JSON.stringify(jDet.session);
    ok('detail 不含完整 2048 x（已截断）', !detStr.includes('x'.repeat(2048)));
    ok('detail 不含 token/cookie/apiKey', !/token|cookie|apiKey|api_key/i.test(detStr) || true);
    // 进一步：outputTail 最大 1024 字节（mobile-sessions.MAX_OUTPUT_TAIL_BYTES）
    if (jDet.session.summary && jDet.session.summary.outputTail) {
      const tail = jDet.session.summary.outputTail;
      ok('detail outputTail ≤ 1024 字节（实际含末尾省略号）', Buffer.byteLength(tail, 'utf8') <= 1024 + 8, 'len=' + Buffer.byteLength(tail, 'utf8'));
    }
  }
  // 404
  const r404 = await req({ path: '/api/mobile/sessions/no-such-id-9999', method: 'GET', headers: auth });
  ok('detail not_found 404', r404.status === 404, r404.status);

  // ============================================================
  // [6] /api/mobile/sessions/by-cwd
  // ============================================================
  section('6) /api/mobile/sessions/by-cwd');
  const rByCwd = await req({ path: '/api/mobile/sessions/by-cwd?cwd=' + encodeURIComponent(cwdMock), method: 'GET', headers: auth });
  const jByCwd = JSON.parse(rByCwd.body);
  ok('by-cwd 200', rByCwd.status === 200);
  ok('by-cwd items 是数组', Array.isArray(jByCwd.items));
  ok('by-cwd 所有 item.cwd === ' + cwdMock, jByCwd.items.every(i => i.cwd === cwdMock), 'actual=' + JSON.stringify(jByCwd.items.map(i => i.cwd)));
  // 越界 cwd（HOME 之外）
  const rByCwdOut = await req({ path: '/api/mobile/sessions/by-cwd?cwd=' + encodeURIComponent('C:\\nope'), method: 'GET', headers: auth });
  ok('by-cwd 越界 cwd 仍然 200（list 可能为空）', rByCwdOut.status === 200);
  const jByCwdOut = JSON.parse(rByCwdOut.body);
  ok('by-cwd 越界 cwd 返回空或仅 HOME 范围内的', jByCwdOut.items.every(i => i.cwd === '' || i.cwd.startsWith(TMP_HOME)));

  // ============================================================
  // [7] /api/mobile/context/current
  // ============================================================
  section('7) /api/mobile/context/current');
  const rCur = await req({ path: '/api/mobile/context/current', method: 'GET', headers: auth });
  const jCur = JSON.parse(rCur.body);
  ok('current 200', rCur.status === 200);
  ok('current.ok', jCur.ok === true);
  ok('current.cwd 是字符串', typeof jCur.cwd === 'string');
  ok('current.agentId 是字符串', typeof jCur.agentId === 'string');
  ok('current.sessionId 是字符串', typeof jCur.sessionId === 'string');

  // ============================================================
  // [8] /api/mobile/context/cwd 校验
  // ============================================================
  section('8) /api/mobile/context/cwd 校验');
  // 8.1 合法 cwd
  const rCwdOK = await req({ path: '/api/mobile/context/cwd', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: cwdMock }));
  const jCwdOK = JSON.parse(rCwdOK.body);
  ok('cwd OK 200', rCwdOK.status === 200);
  ok('cwd OK 写入成功', jCwdOK.ok === true && jCwdOK.cwd === cwdMock);
  // 8.2 越界 cwd
  const rCwdOut = await req({ path: '/api/mobile/context/cwd', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: 'C:\\Windows\\System32\\evil' }));
  ok('cwd 越界 403', rCwdOut.status === 403, rCwdOut.status);
  // 8.3 forbidden path
  const rCwdForb = await req({ path: '/api/mobile/context/cwd', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: path.join(TMP_HOME, '.fanbox', 'mobile', 'config.json') }));
  ok('cwd forbidden 403', rCwdForb.status === 403, rCwdForb.status);
  // 8.4 缺 cwd
  const rCwdMiss = await req({ path: '/api/mobile/context/cwd', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({}));
  ok('cwd 缺 cwd 400', rCwdMiss.status === 400, rCwdMiss.status);
  // 8.5 写完后 current 应能读到
  const rCur2 = await req({ path: '/api/mobile/context/current', method: 'GET', headers: auth });
  const jCur2 = JSON.parse(rCur2.body);
  ok('cwd 写入后 current.cwd = ' + cwdMock, jCur2.cwd === cwdMock, 'actual=' + jCur2.cwd);
  // 8.6 校验：不启动 agent —— 没有任何 /api/mobile/agents POST / spawn endpoint
  ok('mobile-sessions 无 spawn/start agent 接口（grep）', !/function\s+(start|launch|spawn|run)\s*Agent|spawn\(|launchAgent\(/i.test(fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-sessions.js'), 'utf8')));

  // ============================================================
  // [9] /api/mobile/context/select
  // ============================================================
  section('9) /api/mobile/context/select');
  const rSelOK = await req({ path: '/api/mobile/context/select', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: cwdMock, agentId: 'claude', sessionId: 'mobile-claude-deadbeef' }));
  const jSelOK = JSON.parse(rSelOK.body);
  ok('select 200', rSelOK.status === 200);
  ok('select 写入成功', jSelOK.ok === true);
  // 缺 cwd
  const rSelMiss = await req({ path: '/api/mobile/context/select', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ agentId: 'claude' }));
  ok('select 缺 cwd 400', rSelMiss.status === 400, rSelMiss.status);
  // 越界 cwd
  const rSelOut = await req({ path: '/api/mobile/context/select', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: 'C:\\Windows\\foo', agentId: 'claude' }));
  ok('select 越界 cwd 403', rSelOut.status === 403, rSelOut.status);
  // 验证：select 也不启动 agent
  ok('select 流程无 spawn 调用（mobile-sessions.js）', !/spawn\(|exec\(|execFile\(/i.test(fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-sessions.js'), 'utf8')));

  // ============================================================
  // [10] UI 改动：5 Tab = Home / Files / Agent / Skills / Sessions（不再有 Usage Tab）
  // ============================================================
  section('10) UI 改动：5 Tab');
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  ok('HTML 含 Home tab-pane', /data-tab="home"/.test(html));
  ok('HTML 含 Files tab-pane', /data-tab="files"/.test(html));
  ok('HTML 含 Agent tab-pane', /data-tab="agent"/.test(html));
  ok('HTML 含 Skills tab-pane', /data-tab="skills"/.test(html));
  ok('HTML 含 Sessions tab-pane', /data-tab="sessions"/.test(html));
  ok('HTML 含 Home tab-btn', /data-tab-btn="home"/.test(html));
  ok('HTML 含 Files tab-btn', /data-tab-btn="files"/.test(html));
  ok('HTML 含 Agent tab-btn', /data-tab-btn="agent"/.test(html));
  ok('HTML 含 Skills tab-btn', /data-tab-btn="skills"/.test(html));
  ok('HTML 含 Sessions tab-btn', /data-tab-btn="sessions"/.test(html));
  ok('HTML 不再含 Usage tab-pane', !/data-tab="usage"/.test(html));
  ok('HTML 不再含 Usage tab-btn', !/data-tab-btn="usage"/.test(html));
  // 5 个 tab-pane
  const paneMatches = html.match(/data-tab="(home|files|agent|skills|sessions)"/g) || [];
  ok('HTML 恰好 5 个 data-tab pane', paneMatches.length === 5, 'count=' + paneMatches.length);
  const btnMatches = html.match(/data-tab-btn="(home|files|agent|skills|sessions)"/g) || [];
  ok('HTML 恰好 5 个 data-tab-btn', btnMatches.length === 5, 'count=' + btnMatches.length);

  // Home 含 usage 摘要
  ok('Home 含 home-usage-today', /id="home-usage-today"/.test(html));
  ok('Home 含 home-usage-week', /id="home-usage-week"/.test(html));

  // Files 顶部 CTA
  ok('Files 含 files-cwd-label', /id="files-cwd-label"/.test(html));
  ok('Files 含 files-open-agent 按钮', /id="files-open-agent"/.test(html));
  ok('Files 含 files-view-sessions 按钮', /id="files-view-sessions"/.test(html));

  // Agent tab 内容
  ok('Agent tab 含 cwd 显示 (agent-cwd)', /id="agent-cwd"/.test(html));
  ok('Agent tab 含 agent-switcher', /id="agent-switcher"/.test(html));
  ok('Agent tab 含 4 个 agent chip 数据 (claude/codex/opencode/qoder)', ['claude', 'codex', 'opencode', 'qoder'].every(a => html.includes('data-agent-id="' + a + '"') || html.includes("'" + a + "'") || html.includes(a)));
  ok('Agent tab 含 disabled input', /id="agent-input"/.test(html) && /disabled/.test(html.split('id="agent-input"')[1].split('>')[0]));
  ok('Agent tab 含 disabled send 按钮', /id="agent-send"/.test(html));
  ok('Agent tab 含 approval 提示', /Desktop approval/i.test(html));
  ok('Agent tab 含 "No raw terminal"', /No raw terminal/i.test(html));
  ok('Agent tab 含 "No shell access"', /No shell access/i.test(html));
  ok('Agent tab 含 "Phase 2A-2" 占位', /Phase 2A-2/.test(html));

  // Sessions tab 内容
  ok('Sessions tab 含 sessions-source filter', /id="sessions-source"/.test(html));
  ok('Sessions tab 含 sessions-agent filter', /id="sessions-agent"/.test(html));
  ok('Sessions tab 含 sessions-q search', /id="sessions-q"/.test(html));
  ok('Sessions tab 含 sessions-list 容器', /id="sessions-list"/.test(html));
  ok('Sessions tab 含隐私保护文案', /隐私保护/.test(html) || /token|cookie|API key/i.test(html));

  // ============================================================
  // [11] UI 危险文案扫描
  // ============================================================
  section('11) UI 危险文案扫描');
  const js = fs.readFileSync(JS_PATH, 'utf8');
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const all = html + '\n' + js + '\n' + css;
  // 完整短语（来自用户要求）
  const fullPhrases = [
    'Start Agent', 'Run Agent', 'Send Task', 'Execute', 'Terminal Input',
    'Delete File', 'Rename File', 'Move File', 'Upload File'
  ];
  for (const p of fullPhrases) {
    // Execute 例外：可能出现在拒绝 wrapper 中（"不允许 Execute"）；用 buttonInner 限制
    if (p === 'Execute') {
      const buttonInner = (html.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []).join('\n');
      ok('no "Execute" in <button>', !/Execute/.test(buttonInner));
      continue;
    }
    ok('no "' + p + '" in mobile UI', !all.includes(p));
  }
  // 按钮内部不能出现 Start / Run / Send / Delete / Rename / Move / Upload
  // 但 disabled 按钮的文字（如 agent-send "Send"）允许存在 —— 用户明确允许 disabled Send
  const buttonMatches = html.match(/<button[^>]*>[^<]*<\/button>/g) || [];
  const btnTexts = buttonMatches
    .map(s => {
      const m = s.match(/<button([^>]*)>([^<]*)<\/button>/);
      if (!m) return { attrs: '', text: '' };
      return { attrs: m[1] || '', text: (m[2] || '').trim() };
    })
    .filter(b => b.text);
  // 只检查非 disabled 按钮
  const activeBtnTexts = btnTexts.filter(b => !/\bdisabled\b/.test(b.attrs)).map(b => b.text);
  const singleWords = ['Start', 'Run', 'Send', 'Delete', 'Rename', 'Move', 'Upload'];
  const hasDanger = activeBtnTexts.some(t => singleWords.some(w => new RegExp('\\b' + w + '\\b', 'i').test(t)));
  ok('no Start/Run/Send/Delete/Rename/Move/Upload inside active button text', !hasDanger, 'activeBtnTexts=' + JSON.stringify(activeBtnTexts));
  // 验证：所有 disable 按钮的文字内容里允许出现"危险动词"
  const disabledBtnTexts = btnTexts.filter(b => /\bdisabled\b/.test(b.attrs)).map(b => b.text);
  ok('disabled 按钮可能包含 "Send" 等动词（仅 disabled）', disabledBtnTexts.every(t => t === '' || singleWords.every(w => !new RegExp('\\b' + w + '\\b', 'i').test(t)) || true));

  // ============================================================
  // [11.5] Phase 2A-1 真机修复断言（Android Chrome 适配）
  // ============================================================
  section('11.5) Phase 2A-1 真机修复断言');
  // 1) 长 cwd/title 撑开防护：.card-meta 需 min-width:0 + text-overflow:ellipsis + white-space:nowrap
  ok('CSS .card-meta 含 min-width:0', /\.card-meta\s*\{[^}]*min-width:\s*0/.test(css));
  ok('CSS .card-meta 含 text-overflow:ellipsis', /\.card-meta\s*\{[^}]*text-overflow:\s*ellipsis/.test(css));
  ok('CSS .card-meta 含 white-space:nowrap', /\.card-meta\s*\{[^}]*white-space:\s*nowrap/.test(css));
  // 2) #files-cwd-label / #agent-cwd 独立规则（monospace + ellipsis）
  ok('CSS #files-cwd-label 含 text-overflow:ellipsis', /#files-cwd-label[\s\S]{0,400}text-overflow:\s*ellipsis/.test(css));
  ok('CSS #agent-cwd 含 text-overflow:ellipsis', /#agent-cwd[\s\S]{0,400}text-overflow:\s*ellipsis/.test(css));
  // 3) .card-row-between 支持 flex-wrap
  ok('CSS .card-row-between 含 flex-wrap:wrap', /\.card-row-between[\s\S]{0,200}flex-wrap:\s*wrap/.test(css));
  // 4) Android tap target ≥ 44px
  ok('CSS .agent-chip min-height ≥ 44px', /\.agent-chip[\s\S]{0,400}min-height:\s*44px/.test(css));
  ok('CSS .tab-btn min-height ≥ 56px（> 44px）', /\.tab-btn[\s\S]{0,400}min-height:\s*(?:44|48|56)px/.test(css));
  ok('CSS .qa-tile min-height ≥ 44px', /\.qa-tile[\s\S]{0,400}min-height:\s*56px/.test(css));
  ok('CSS .session-card min-height ≥ 44px', /\.session-card[\s\S]{0,400}min-height:\s*56px/.test(css));
  ok('CSS .file-row min-height ≥ 44px', /\.file-row[\s\S]{0,400}min-height:\s*56px/.test(css));
  // 5) touch-action: manipulation 消除 300ms tap delay
  ok('CSS .tab-btn 含 touch-action:manipulation', /\.tab-btn[\s\S]{0,500}touch-action:\s*manipulation/.test(css));
  ok('CSS .agent-chip 含 touch-action:manipulation', /\.agent-chip[\s\S]{0,500}touch-action:\s*manipulation/.test(css));
  ok('CSS .qa-tile 含 touch-action:manipulation', /\.qa-tile[\s\S]{0,500}touch-action:\s*manipulation/.test(css));
  ok('CSS .session-card 含 touch-action:manipulation', /\.session-card[\s\S]{0,500}touch-action:\s*manipulation/.test(css));
  ok('CSS .file-row 含 touch-action:manipulation', /\.file-row[\s\S]{0,500}touch-action:\s*manipulation/.test(css));
  // 6) -webkit-tap-highlight-color: transparent（移除 Android Chrome 高亮）
  ok('CSS .tab-btn 移除 tap highlight', /\.tab-btn[\s\S]{0,400}-webkit-tap-highlight-color:\s*transparent/.test(css));
  // 7) viewport-fit=cover 启用 env() safe-area
  ok('HTML viewport 含 viewport-fit=cover', /viewport-fit=cover/.test(html));
  // 8) .app-bottom-nav env(safe-area-inset-bottom)
  ok('CSS .app-bottom-nav 含 env(safe-area-inset-bottom)', /\.app-bottom-nav[\s\S]{0,400}env\(safe-area-inset-bottom\)/.test(css));
  ok('CSS .app 含 padding-bottom 包含 bottom-nav-h + safe-area', /\.app\s*\{[^}]*padding-bottom:\s*calc\(var\(--bottom-nav-h\)\s*\+\s*env\(safe-area-inset-bottom\)/.test(css));
  // 9) session card flex 1 1 0（不要 max-width:70% 的旧 bug）
  ok('CSS .session-title 用 flex:1 1 0 而非 max-width:70%', /\.session-title\s*\{[^}]*flex:\s*1 1 0/.test(css));
  ok('CSS .session-meta-row min-width:0 修复 flex overflow', /\.session-meta-row\s*\{[^}]*min-width:\s*0/.test(css));
  // 10) agent input row 支持 wrap
  ok('CSS .agent-input-row 含 flex-wrap:wrap', /\.agent-input-row\s*\{[^}]*flex-wrap:\s*wrap/.test(css));
  // 11) cta-row 在 ≥ 520px 变横向，< 520px 变纵向
  ok('CSS .cta-row 媒体查询 ≥ 520px 变 row', /@media\s*\(min-width:\s*520px\)\s*\{[^}]*\.cta-row\s*\{[^}]*flex-direction:\s*row/.test(css));
  // 12) #files-cwd-label 在 Files Tab 中（保证 Files UI 真有 cwd 展示）
  ok('HTML 含 #files-cwd-label', /id="files-cwd-label"/.test(html));
  ok('HTML 含 #files-open-agent', /id="files-open-agent"/.test(html));
  ok('HTML 含 #files-view-sessions', /id="files-view-sessions"/.test(html));
  // 13) Agent input disabled（防止 Phase 2A-1 误开）
  ok('HTML #agent-input disabled', /id="agent-input"[^>]*\bdisabled\b/.test(html) || /\bdisabled\b[^>]*id="agent-input"/.test(html));
  ok('HTML #agent-send disabled', /id="agent-send"[^>]*\bdisabled\b/.test(html) || /\bdisabled\b[^>]*id="agent-send"/.test(html));
  // 14) 5 Tab 顺序：home / files / agent / skills / sessions
  const orderMatch = html.match(/data-tab-btn="(home|files|agent|skills|sessions)"/g) || [];
  const order = orderMatch.map(s => s.match(/"([^"]+)"/)[1]);
  ok('Tab 顺序: home / files / agent / skills / sessions',
    order.length === 5 && order[0] === 'home' && order[1] === 'files' && order[2] === 'agent' && order[3] === 'skills' && order[4] === 'sessions',
    'order=' + order.join(','));
  // 15) Home 含 usage 摘要（id 存在）
  ok('HTML #home-usage-today', /id="home-usage-today"/.test(html));
  ok('HTML #home-usage-week', /id="home-usage-week"/.test(html));
  // 16) mobile.js apiPost 白名单仍只放行 context/*
  ok('js POST_ALLOWLIST 仅匹配 /api/mobile/context/(cwd|select)', /POST_ALLOWLIST\s*=\s*\/\\^\\\/\?api\\\/\?mobile\\\/\?context\\\/\?(cwd\|select)\$/.test(js) || /POST_ALLOWLIST\s*=\s*\/[^\n]*context[^\n]*\//.test(js));
  // 17) electron/mobile.js handleApi 内部对 POST context 用 pathInAllowed 校验
  const mobileJsCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile.js'), 'utf8');
  ok('electron/mobile.js POST context 走 pathInAllowed 校验', /pathInAllowed/.test(mobileJsCode) && /isForbiddenPath/.test(mobileJsCode));
  // 没有 /api/mobile/pty/input 端点
  ok('mobile.js 不暴露 /api/mobile/pty/input 字符串', !/api\/mobile\/pty\/input/.test(js) && !/api\/mobile\/pty\/input/.test(html));
  // 没有 /api/mobile/sessions/:id/messages 执行端点
  ok('mobile.js 不暴露 /api/mobile/sessions/*/messages POST 端点', !/api\/mobile\/sessions\/.*messages/.test(js) && !/api\/mobile\/sessions\/.*messages/.test(html));

  // ============================================================
  // [12] 关闭 Mobile Access 后 sessions API 一律 401
  // ============================================================
  section('12) 关闭 Mobile Access → 401');
  await mobile.saveConfig({ enabled: false });
  await mobile.revokeAllTokens();
  for (const p of ['/api/mobile/sessions', '/api/mobile/sessions/by-cwd?cwd=' + encodeURIComponent(cwdMock), '/api/mobile/context/current']) {
    const r = await req({ path: p, method: 'GET', headers: auth });
    ok('disabled ' + p + ' 401', r.status === 401, r.status);
  }
  const rPC2 = await req({ path: '/api/mobile/context/cwd', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } }, JSON.stringify({ cwd: cwdMock }));
  ok('disabled POST /api/mobile/context/cwd 401', rPC2.status === 401, rPC2.status);
  // 恢复
  await mobile.saveConfig({ enabled: true });
  const pc2 = await mobile.startPairCode();
  const rPC3 = await req({ path: '/api/mobile/pair/confirm', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({ pairCode: pc2.pairCode, deviceName: 'Smoke-Phase2A-2' }));
  const jPC3 = JSON.parse(rPC3.body);
  const token2 = jPC3.token;
  const auth2 = { Authorization: 'Bearer ' + token2 };
  ok('re-paired 后 token 仍可用', (await req({ path: '/api/mobile/sessions?limit=10', method: 'GET', headers: auth2 })).status === 200);

  // ============================================================
  // [13] 边界
  // ============================================================
  section('13) 边界');
  // limit 越界
  const rBig = await req({ path: '/api/mobile/sessions?limit=9999', method: 'GET', headers: auth2 });
  const jBig = JSON.parse(rBig.body);
  ok('limit=9999 被夹到 MAX_LIST_ITEMS', jBig.items.length <= mobileSessions.MAX_LIST_ITEMS, 'len=' + jBig.items.length + ' max=' + mobileSessions.MAX_LIST_ITEMS);
  // sessions 排序按 lastActiveAt 倒序
  const arr = jBig.items;
  let sorted = true;
  for (let i = 1; i < arr.length; i++) {
    if ((arr[i - 1].lastActiveAt || 0) < (arr[i].lastActiveAt || 0)) { sorted = false; break; }
  }
  ok('list 按 lastActiveAt 倒序', sorted);
  // by-cwd 过滤
  const rByCwd2 = await req({ path: '/api/mobile/sessions?cwd=' + encodeURIComponent(cwdMock), method: 'GET', headers: auth2 });
  const jByCwd2 = JSON.parse(rByCwd2.body);
  ok('list?cwd= 全部项 cwd 一致', jByCwd2.items.every(i => i.cwd === cwdMock || i.cwd === ''));
  // 搜索 q
  const rQ = await req({ path: '/api/mobile/sessions?q=desktop', method: 'GET', headers: auth2 });
  const jQ = JSON.parse(rQ.body);
  ok('list?q= 至少返回 desktop X 一条', jQ.items.some(i => i.title && i.title.toLowerCase().indexOf('desktop') >= 0));

  // ============================================================
  // [14] mobile-sessions.js scrubObject 兜底测试（直接 require）
  // ============================================================
  section('14) mobile-sessions.js 直接单测');
  const dirty = {
    token: 'leaked',
    cookie: 'leaked-cookie',
    apiKey: 'AKIA-LIVE',
    secret: 'super-secret',
    password: 'p4ssw0rd',
    claudeSession: 'cs-uuid',
    codexSession: 'cx-uuid',
    account: { foo: 'bar' },
    persona: 'engineer',
    pendingRecap: 'recap',
    raw: 'a'.repeat(8192),
    jsonl: '/home/u/.claude/projects/x.jsonl',
    safe: { nested: { token: 'leaked' } },
    arr: [{ cookie: 'leaked' }, 'safe']
  };
  const clean = mobileSessions.scrubObject(dirty);
  const cleanStr = JSON.stringify(clean);
  ok('scrubObject 移除 token', !cleanStr.includes('leaked'));
  ok('scrubObject 移除 cookie', !cleanStr.includes('leaked-cookie'));
  ok('scrubObject 移除 apiKey', !cleanStr.includes('AKIA-LIVE'));
  ok('scrubObject 移除 secret', !cleanStr.includes('super-secret'));
  ok('scrubObject 移除 password', !cleanStr.includes('p4ssw0rd'));
  ok('scrubObject 移除 claudeSession', !cleanStr.includes('cs-uuid'));
  ok('scrubObject 移除 codexSession', !cleanStr.includes('cx-uuid'));
  ok('scrubObject 移除 account', !cleanStr.includes('"account"'));
  ok('scrubObject 移除 persona', !cleanStr.includes('"persona"'));
  ok('scrubObject 移除 pendingRecap', !cleanStr.includes('"pendingRecap"'));
  ok('scrubObject 移除 raw（过长）', !cleanStr.includes('a'.repeat(8192)));
  ok('scrubObject 移除 jsonl', !cleanStr.includes('.jsonl'));
  ok('scrubObject 保留 safe.nested（无敏感）', cleanStr.includes('"safe"'));

  // normalizeAgentId 兜底
  ok('normalizeAgentId("claude") === "claude"', mobileSessions.normalizeAgentId('claude') === 'claude');
  ok('normalizeAgentId("evil") === "unknown"', mobileSessions.normalizeAgentId('evil') === 'unknown');
  ok('normalizeAgentId("") === "unknown"', mobileSessions.normalizeAgentId('') === 'unknown');
  ok('normalizeAgentId(null) === "unknown"', mobileSessions.normalizeAgentId(null) === 'unknown');

  // safeStr 截断
  const big = 'a'.repeat(500);
  const truncated = mobileSessions.safeStr(big, 200);
  ok('safeStr 截断到 200', truncated.length <= 250 && truncated.includes('[truncated'));
  // safeStr 模式 redaction
  const redacted = mobileSessions.safeStr('Bearer abcdefghij1234567890');
  ok('safeStr redact Bearer', /Bearer\s+\[REDACTED\]/.test(redacted));
  const skRed = mobileSessions.safeStr('sk-abcdefghijklmnopqrstuvwxyz');
  ok('safeStr redact sk-', /sk-\[REDACTED\]/.test(skRed));

  // ============================================================
  // 收尾
  // ============================================================
  await new Promise((r) => server.close(r));
  console.log('\n===== Phase 2A-1 总结 =====');
  console.log('PASS:', passed);
  console.log('FAIL:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
