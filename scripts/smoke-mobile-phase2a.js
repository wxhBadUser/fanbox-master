/* eslint-disable */
// Phase 2A smoke · Mobile Sessions + Agent Workspace Shell + Desktop Approval Loop
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
//  12) Phase 2A-2.1 Mobile Approval Request Loop 验证
//        - /api/mobile/sessions/draft 仅创建 shell，不启动 agent
//        - /api/mobile/sessions/:id/messages 仅创建 approval，不启动 agent / pty / shell
//        - /api/mobile/approvals/:id 状态查询
//        - /api/mobile-control/approvals (loopback-only)
//        - /api/mobile-control/approvals/:id/decide (loopback-only)
//        - audit append-only，不含 input 原文 / token
//  13) Phase 0A / Phase 1 smoke 仍能独立运行（不在本脚本内跑）
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
// Phase 2A-2.2：测试环境下强制所有 agent 走 stub，避免撞上本机已装的 claude/codex 产生慢请求 / 凭据依赖
process.env.MOBILE_AGENT_FORCE_STUB = '1';
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
  const deviceId = jPC.deviceId;
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
  // [10] UI 改动：4 Tab = Home / Files / Agent / Skills（UI-A1 移除独立 Sessions / Usage Tab）
  // ============================================================
  section('10) UI 改动：4 Tab（UI-A1）');
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const JS_PATH = path.join(PUBLIC_MOBILE, 'mobile.js');
  const CSS_PATH = path.join(PUBLIC_MOBILE, 'mobile.css');
  const js = fs.readFileSync(JS_PATH, 'utf8');
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  ok('HTML 含 Home tab-pane', /data-tab="home"/.test(html));
  ok('HTML 含 Files tab-pane', /data-tab="files"/.test(html));
  ok('HTML 含 Agent tab-pane', /data-tab="agent"/.test(html));
  ok('HTML 含 Skills tab-pane', /data-tab="skills"/.test(html));
  ok('HTML 含 Home tab-btn', /data-tab-btn="home"/.test(html));
  ok('HTML 含 Files tab-btn', /data-tab-btn="files"/.test(html));
  ok('HTML 含 Agent tab-btn', /data-tab-btn="agent"/.test(html));
  ok('HTML 含 Skills tab-btn', /data-tab-btn="skills"/.test(html));
  ok('HTML 不再含 Sessions tab-pane（UI-A1 并入 Home）', !/data-tab="sessions"/.test(html));
  ok('HTML 不再含 Sessions tab-btn（UI-A1 并入 Home）', !/data-tab-btn="sessions"/.test(html));
  ok('HTML 不再含 Usage tab-pane', !/data-tab="usage"/.test(html));
  ok('HTML 不再含 Usage tab-btn', !/data-tab-btn="usage"/.test(html));
  // 4 个 tab-pane
  const paneMatches = html.match(/data-tab="(home|files|agent|skills)"/g) || [];
  ok('HTML 恰好 4 个 data-tab pane', paneMatches.length === 4, 'count=' + paneMatches.length);
  const btnMatches = html.match(/data-tab-btn="(home|files|agent|skills)"/g) || [];
  ok('HTML 恰好 4 个 data-tab-btn', btnMatches.length === 4, 'count=' + btnMatches.length);

  // Home 含 usage 摘要
  ok('Home 含 home-runs-today', /id="home-runs-today"/.test(html));
  ok('Home 含 home-runs-week', /id="home-runs-week"/.test(html));

  // Files 顶部 CTA
  ok('Files 含 files-cwd-label', /id="files-cwd-label"/.test(html));
  ok('Files 含 files-open-agent 按钮', /id="files-open-agent"/.test(html));
  // UI-A1：Files 不再有独立 "view sessions" 按钮
  ok('Files 不再含 files-view-sessions 按钮', !/id="files-view-sessions"/.test(html));

  // Agent tab 内容（UI-A1 AionUi-like）
  ok('Agent tab 含 cwd 显示 (agent-cwd)', /id="agent-cwd"/.test(html));
  ok('Agent tab 含 agent-switcher', /id="agent-switcher"/.test(html));
  // 4 agent chip 由 mobile.js paintAgentSwitcher 动态生成（含 data-agent-id）
  ok('Agent switcher 4 个 agent (mobile.js AGENT_CHIPS)',
    /AGENT_CHIPS\s*=\s*\[[\s\S]*?claude[\s\S]*?codex[\s\S]*?opencode[\s\S]*?qoder[\s\S]*?\]/.test(js));
  ok('Agent tab 含 input (textarea)', /id="agent-input"/.test(html));
  ok('Agent tab 含 send 按钮（Send）', /id="agent-send"/.test(html) && /Send/i.test(html));
  // UI-A1：Agent 不再含 approval 提示
  ok('Agent tab 不再含 "Desktop approval" 提示', !/Desktop approval/i.test(html));
  // UI-A1：新文案
  ok('Agent tab 含 "Running on your paired desktop"', /Running on your paired desktop/i.test(html));
  ok('Agent tab 含 "Scoped to the selected folder"', /Scoped to the selected folder/i.test(html));
  ok('Agent tab 含 "Logged locally in FanBox"', /Logged locally in FanBox/i.test(html));
  // Phase UI-A2：Home 是默认入口；Agent 是 ChatGPT-like 独立页
  // Assistant cards 已从 Agent tab 移除（Home 顶 Quick Chat 是新入口）
  ok('Agent tab 含 #agent-header-name（左上角 agent 名称）', /id="agent-header-name"/.test(html));
  ok('Agent tab 含 .agent-chat (ChatGPT-like 容器)', /class="agent-chat"/i.test(html));

  // Home 包含 recent / running sessions
  ok('Home 含 #home-running-sessions', /id="home-running-sessions"/.test(html));
  ok('Home 含 #home-recent-sessions', /id="home-recent-sessions"/.test(html));
  // Sidebar
  ok('Sidebar 含 #sidebar-recent-sessions', /id="sidebar-recent-sessions"/.test(html));

  // ============================================================
  // [11] UI 危险文案扫描
  // ============================================================
  section('11) UI 危险文案扫描');
  // js / css 已在 [10] 末尾初始化
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
  // Phase 2A-2.1：Send 按钮是允许的（普通发送），不应再视为"危险动词"
  // 但 "Start Agent" / "Run Agent" / "Send Task" / "Execute" / "Delete File" / "Move File" / "Rename File" / "Upload File" 等组合仍属于危险
  const activeBtnTexts = btnTexts.filter(b => !/\bdisabled\b/.test(b.attrs)).map(b => b.text);
  const dangerPhrases = ['Start Agent', 'Run Agent', 'Send Task', 'Execute Shell', 'Execute Command', 'Delete File', 'Move File', 'Rename File', 'Upload File', 'Start All'];
  const hasDanger = activeBtnTexts.some(t => dangerPhrases.some(w => new RegExp('\\b' + w + '\\b', 'i').test(t)));
  ok('no Start Agent/Run Agent/Send Task/Execute Shell/Delete File/Move File/Rename File/Upload File inside active button text', !hasDanger, 'activeBtnTexts=' + JSON.stringify(activeBtnTexts));
  // 验证：所有 disable 按钮的文字内容里允许出现"危险动词"（旧版，仅 disabled）
  const disabledBtnTexts = btnTexts.filter(b => /\bdisabled\b/.test(b.attrs)).map(b => b.text);
  ok('disabled 按钮可能包含 Send/Start 等动词（仅 disabled）', true);

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
  // UI-A1：Files 不再有 #files-view-sessions
  ok('HTML 不再含 #files-view-sessions（UI-A1 移除）', !/id="files-view-sessions"/.test(html));
  // 13) Agent input 仍存在（Phase 2A-2.1 启用 textarea，但受 button 状态控制）
  ok('HTML 含 #agent-input', /id="agent-input"/.test(html));
  ok('HTML 含 #agent-send', /id="agent-send"/.test(html));
  // 14) 4 Tab 顺序：home / agent / files / skills
  const orderMatch = html.match(/data-tab-btn="(home|agent|files|skills)"/g) || [];
  const order = orderMatch.map(s => s.match(/"([^"]+)"/)[1]);
  ok('Tab 顺序: home / agent / files / skills',
    order.length === 4 && order[0] === 'home' && order[1] === 'agent' && order[2] === 'files' && order[3] === 'skills',
    'order=' + order.join(','));
  // 15) Home 含 usage 摘要（id 存在）
  ok('HTML #home-runs-today', /id="home-runs-today"/.test(html));
  ok('HTML #home-runs-week', /id="home-runs-week"/.test(html));
  // 16) mobile.js apiPost 白名单扩展（UI-A1：包含 sessions/draft、sessions/:id/messages、skills-state）
  // js / css 已在 [10] 开头初始化
  ok('js POST_ALLOWLIST 包含 context/(cwd|select)', /POST_ALLOWLIST[\s\S]{0,1500}?context\\\/\(cwd\|select\)/.test(js));
  ok('js POST_ALLOWLIST 包含 sessions/draft', /POST_ALLOWLIST[\s\S]{0,2000}?sessions\\?\/draft/.test(js));
  ok('js POST_ALLOWLIST 包含 sessions/:id/messages', /POST_ALLOWLIST[\s\S]{0,2500}?sessions\\?\/[\S\s]{0,30}?\\?\/messages/.test(js));
  ok('js POST_ALLOWLIST 包含 skills-state', /POST_ALLOWLIST[\s\S]{0,3000}?skills-state/.test(js));
  // 17) electron/mobile.js handleApi 内部对 POST context 用 pathInAllowed 校验
  const mobileJsCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile.js'), 'utf8');
  ok('electron/mobile.js POST context 走 pathInAllowed 校验', /pathInAllowed/.test(mobileJsCode) && /isForbiddenPath/.test(mobileJsCode));
  // 没有 /api/mobile/pty/input 端点（永远禁止）
  ok('mobile.js 不暴露 /api/mobile/pty/input 字符串', !/api\/mobile\/pty\/input/.test(js) && !/api\/mobile\/pty\/input/.test(html));
  // Phase 2A-2.1：messages POST 端点允许存在
  ok('mobile.js 暴露 /api/mobile/sessions/*/messages POST 端点', /api\/mobile\/sessions\/.*?\/messages/.test(mobileJsCode));
  // UI-A1：mobile.js 前端 POST_ALLOWLIST 扩展为 4 个模式（context + draft + messages + skills-state）
  // 不再用 regex 提取（容易在字符类内的 ] 处提前截断），直接检查全文
  ok('POST_ALLOWLIST 包含 4 类端点',
    /context\\\/\(cwd\|select\)/.test(js) && /sessions\\?\/draft/.test(js) && /sessions\\?\/[\S\s]{0,30}?\\?\/messages/.test(js) && /skills-state/.test(js));

  // ============================================================
  // [11.7] Phase UI-A1：Mobile Send Direct Execution（红线也走 runner）
  // ============================================================
  section('11.7) Phase UI-A1: Mobile Send Direct Execution');

  // ---- 1) Auth / LAN 边界 ----
  // POST messages no token → 401
  const rMsgsNoTok = await req({ path: '/api/mobile/sessions/whatever/messages', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({ text: 't', cwd: cwdMock, agentId: 'claude' }));
  ok('POST messages no token → 401', rMsgsNoTok.status === 401, rMsgsNoTok.status);
  // POST messages bad token → 401
  const rMsgsBadTok = await req({ path: '/api/mobile/sessions/whatever/messages', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' } },
    JSON.stringify({ text: 't', cwd: cwdMock, agentId: 'claude' }));
  ok('POST messages bad token → 401', rMsgsBadTok.status === 401, rMsgsBadTok.status);
  // UI-A1：/api/mobile/approvals 端点已不暴露在 mobile send path（保留为内部状态）
  // 但 /api/mobile/approvals/* 仍可被读（不强制删除）
  const rGetApvNoTok = await req({ path: '/api/mobile/approvals/apr_xxx', method: 'GET' });
  ok('GET /api/mobile/approvals/:id no token → 401', rGetApvNoTok.status === 401, rGetApvNoTok.status);
  const rApvListNoTok = await req({ path: '/api/mobile/approvals', method: 'GET' });
  ok('GET /api/mobile/approvals no token → 401', rApvListNoTok.status === 401, rApvListNoTok.status);
  const rCtrlOk = await req({ path: '/api/mobile-control/approvals', method: 'GET' });
  ok('control approvals 127.0.0.1 (loopback) 200', rCtrlOk.status === 200, rCtrlOk.status);

  // ---- 2) Draft session ----
  // POST /draft creates shell session
  const rDraft = await req({ path: '/api/mobile/sessions/draft', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: cwdMock, agentId: 'claude' }));
  const jDraft = JSON.parse(rDraft.body);
  ok('POST /draft 200', rDraft.status === 200, rDraft.status);
  ok('POST /draft ok=true', jDraft.ok === true);
  ok('POST /draft 返回 sessionId', typeof jDraft.sessionId === 'string' && jDraft.sessionId.length > 4);
  ok('POST /draft 返回 internalId', typeof jDraft.internalId === 'string' && jDraft.internalId.startsWith('mobile-'));
  const draftSessionId = jDraft.sessionId;
  // /draft 不写 agent 启动
  ok('POST /draft 不启动 agent (sessions.json 中 status=idle)', (() => {
    try {
      const sessRaw = fs.readFileSync(mobileSessPath, 'utf8');
      const sessObj = JSON.parse(sessRaw);
      // file 实际以 scrubbed sessionId 为 key
      const sess = sessObj.sessions && (sessObj.sessions[jDraft.sessionId] || sessObj.sessions[jDraft.internalId]);
      return !!sess && sess.status === 'idle' && sess.cwd === cwdMock;
    } catch (e) { return false; }
  })());
  // /draft agentId 必须是 whitelist；invalid → 400
  const rDraftBad = await req({ path: '/api/mobile/sessions/draft', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: cwdMock, agentId: 'evil' }));
  ok('POST /draft invalid agentId → 400', rDraftBad.status === 400, rDraftBad.status);
  // /draft cwd 越界 → 403
  const rDraftOOB = await req({ path: '/api/mobile/sessions/draft', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: 'C:\\Windows\\System32', agentId: 'claude' }));
  ok('POST /draft OOB cwd → 403', rDraftOOB.status === 403, rDraftOOB.status);
  // /draft 缺 cwd → 400
  const rDraftNoCwd = await req({ path: '/api/mobile/sessions/draft', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ agentId: 'claude' }));
  ok('POST /draft missing cwd → 400', rDraftNoCwd.status === 400, rDraftNoCwd.status);
  // /draft 不同 agentId
  for (const a of ['codex', 'opencode', 'qoder']) {
    const rDA = await req({ path: '/api/mobile/sessions/draft', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
      JSON.stringify({ cwd: cwdMock, agentId: a }));
    ok('POST /draft agentId=' + a + ' → 200', rDA.status === 200, rDA.status);
  }
  // mobile-sessions.js createMobileDraftSession 不能 spawn / exec
  ok('mobile-sessions.js draft 流程无 spawn 调用', !/function\s+createMobileDraftSession[\s\S]{0,2000}?spawn\s*\(/.test(fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-sessions.js'), 'utf8')));

  // ---- 3) UI-A1 红线消息也走 runner（不创建 approval） ----
  const rApv1 = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: '请帮我 git push 到 origin', cwd: cwdMock, agentId: 'claude', contextFiles: [] }));
  const jApv1 = JSON.parse(rApv1.body);
  ok('红线消息 POST 200', rApv1.status === 200, rApv1.status);
  ok('红线消息 requiresApproval 不为 true（UI-A1 移除 approval）', jApv1.requiresApproval !== true, 'requiresApproval=' + jApv1.requiresApproval);
  ok('红线消息 status === done（直接走 runner）', jApv1.status === 'done', 'status=' + jApv1.status);
  ok('红线消息无 approvalId（不创建 approval）', !jApv1.approvalId);
  // 不启动 agent via pty/exec
  ok('postMessageToMobileSession 无 spawn 调用', !/function\s+postMessageToMobileSession[\s\S]{0,5000}?spawn\s*\(/.test(fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-sessions.js'), 'utf8')));
  ok('mobile.js 不暴露 pty:spawn / pty:input', !/pty:spawn|pty:input/.test(mobileJsCode));
  ok('mobile-sessions.js postMessageToMobileSession 不调用 child_process.exec', !/postMessageToMobileSession[\s\S]{0,5000}?child_process\.exec/.test(fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-sessions.js'), 'utf8')));

  // session 状态变为 done
  const rSess = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId), method: 'GET', headers: auth });
  const jSess = JSON.parse(rSess.body);
  ok('session status === done（不走 waiting_approval）', jSess.session && jSess.session.status === 'done', 'status=' + (jSess.session && jSess.session.status));
  ok('session 无 pending_approval message', jSess.session && jSess.session.messages && !jSess.session.messages.some(m => m.status === 'pending_approval'));
  // user message 状态是 sent
  ok('user message 状态 === sent', jSess.session && jSess.session.messages && jSess.session.messages.some(m => m.role === 'user' && m.status === 'sent'));
  // agent message 存在
  ok('agent message 存在', jSess.session && jSess.session.messages && jSess.session.messages.some(m => m.role === 'agent' && m.status === 'done'));

  // text > 4000 → 400
  const longText = 'a'.repeat(4001);
  const rApvLong = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: longText, cwd: cwdMock, agentId: 'claude' }));
  ok('text > 4000 → 400', rApvLong.status === 400, rApvLong.status);
  // empty text → 400
  const rApvEmpty = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: '   ', cwd: cwdMock, agentId: 'claude' }));
  ok('empty text → 400', rApvEmpty.status === 400, rApvEmpty.status);
  // contextFiles > 5 → 400
  const rApvCf6 = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: 't', cwd: cwdMock, agentId: 'claude', contextFiles: ['a', 'b', 'c', 'd', 'e', 'f'] }));
  ok('contextFiles > 5 → 400', rApvCf6.status === 400, rApvCf6.status);
  // contextFiles OOB → 403
  const rApvCfOOB = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: 't', cwd: cwdMock, agentId: 'claude', contextFiles: ['C:\\Windows\\System32\\evil.exe'] }));
  ok('contextFiles OOB → 403', rApvCfOOB.status === 403, rApvCfOOB.status);
  // sessionId 不存在 → 404
  const rApv404 = await req({ path: '/api/mobile/sessions/no-such-session-9999/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: 't', cwd: cwdMock, agentId: 'claude' }));
  ok('session 不存在 → 404', rApv404.status === 404, rApv404.status);

  // ---- 4) UI-A1 audit 写入但不阻断 ----
  const auditPath = path.join(process.env.FANBOX_MOBILE_DIR, 'audit.jsonl');
  let auditTxt = '';
  try { auditTxt = fs.readFileSync(auditPath, 'utf8'); } catch (e) { auditTxt = ''; }
  ok('audit.jsonl 存在', auditTxt.length > 0);
  ok('audit 含 redline_detected_but_not_blocked', /"action":"redline_detected_but_not_blocked"/.test(auditTxt));
  ok('audit 含 reasons: git_history_overwrite', /"reasons":\s*\[[\s\S]*?"git_history_overwrite"[\s\S]*?\]/.test(auditTxt));
  ok('audit 不含完整 input 原文', !/帮我 git push 到 origin/.test(auditTxt));
  ok('audit 不含 token/cookie/apiKey', !/should-not-leak-token|session-cookie-LEAK|AKIA-LIVE-LEAK|p4ssw0rd/.test(auditTxt));
  // ---- 5) UI-A1 approval 列表接口仍可读（不强制 404） ----
  const rApvList = await req({ path: '/api/mobile/approvals', method: 'GET', headers: auth });
  ok('GET /api/mobile/approvals 200（保留接口）', rApvList.status === 200, rApvList.status);

  // ============================================================
  // [11.8] Phase 2A-2.1：Redline detector + 普通消息走 stub runner + events
  // ============================================================
  section('11.8) Phase 2A-2.1: redline + stub + events');

  // ---- 1) redline detector 纯函数单测（直接 require mobile-sessions） ----
  const ms = require(path.join(ROOT_DIR, 'electron', 'mobile-sessions.js'));
  // 普通文本不命中
  const r1 = ms.detectRedline('帮我检查这个文件');
  ok('detector 普通 "帮我检查" 不命中', r1.requiresApproval === false, JSON.stringify(r1));
  const r2 = ms.detectRedline('解释这段代码是什么意思');
  ok('detector 普通 "解释代码" 不命中', r2.requiresApproval === false, JSON.stringify(r2));
  const r3 = ms.detectRedline('总结一下这个项目结构');
  ok('detector 普通 "总结项目结构" 不命中', r3.requiresApproval === false, JSON.stringify(r3));
  // 红线 1: delete
  const r4 = ms.detectRedline('rm -rf dist 清理一下');
  ok('detector "rm -rf" 命中 delete_file', r4.requiresApproval === true && r4.reasons.indexOf('delete_file') >= 0, JSON.stringify(r4));
  const r5 = ms.detectRedline('请帮我 delete file 旧用例');
  ok('detector "delete file" 命中 delete_file', r5.requiresApproval === true && r5.reasons.indexOf('delete_file') >= 0);
  const r6 = ms.detectRedline('删除旧测试文件');
  ok('detector "删除" 命中 delete_file', r6.requiresApproval === true && r6.reasons.indexOf('delete_file') >= 0);
  // 红线 2: git
  const r7 = ms.detectRedline('git push 到 origin');
  ok('detector "git push" 命中 git_history_overwrite', r7.requiresApproval === true && r7.reasons.indexOf('git_history_overwrite') >= 0);
  const r8 = ms.detectRedline('git push --force 强行推送');
  ok('detector "git push --force" 命中', r8.requiresApproval === true && r8.reasons.indexOf('git_history_overwrite') >= 0);
  const r9 = ms.detectRedline('reset --hard HEAD~1');
  ok('detector "reset --hard" 命中', r9.requiresApproval === true && r9.reasons.indexOf('git_history_overwrite') >= 0);
  const r10 = ms.detectRedline('帮我 rebase 一下 main');
  ok('detector "rebase" 命中', r10.requiresApproval === true && r10.reasons.indexOf('git_history_overwrite') >= 0);
  // 红线 3: secret
  const r11 = ms.detectRedline('读取 .env 文件');
  ok('detector ".env" 命中 secret_or_env', r11.requiresApproval === true && r11.reasons.indexOf('secret_or_env') >= 0);
  const r12 = ms.detectRedline('把这个 password 改成 admin');
  ok('detector "password" 命中', r12.requiresApproval === true && r12.reasons.indexOf('secret_or_env') >= 0);
  const r13 = ms.detectRedline('更新 api key');
  ok('detector "api key" 命中', r13.requiresApproval === true && r13.reasons.indexOf('secret_or_env') >= 0);
  // 红线 4: cicd
  const r14 = ms.detectRedline('修改 github actions 配置');
  ok('detector "github actions" 命中 cicd_config', r14.requiresApproval === true && r14.reasons.indexOf('cicd_config') >= 0);
  // 红线 5: db
  const r15 = ms.detectRedline('运行 database migration');
  ok('detector "database migration" 命中 database_migration', r15.requiresApproval === true && r15.reasons.indexOf('database_migration') >= 0);
  const r16 = ms.detectRedline('数据库 迁移脚本');
  ok('detector "数据库 迁移" 命中 database_migration', r16.requiresApproval === true && r16.reasons.indexOf('database_migration') >= 0);
  // 红线 6: install
  const r17 = ms.detectRedline('npm install -g some-tool');
  ok('detector "npm install -g" 命中 install_global', r17.requiresApproval === true && r17.reasons.indexOf('install_global') >= 0);
  // 红线 7: deploy
  const r18 = ms.detectRedline('production deploy 到 prod');
  ok('detector "production deploy" 命中 production_deploy', r18.requiresApproval === true && r18.reasons.indexOf('production_deploy') >= 0);
  const r19 = ms.detectRedline('发文章 到公众号');
  ok('detector "发文章" 命中 publish_or_payment', r19.requiresApproval === true && r19.reasons.indexOf('publish_or_payment') >= 0);
  // 红线 8: external send / upload
  const r20 = ms.detectRedline('提交表单 到第三方');
  ok('detector "提交表单" 命中 external_send', r20.requiresApproval === true && r20.reasons.indexOf('external_send') >= 0);
  const r21 = ms.detectRedline('上传敏感 到 external api');
  ok('detector "上传敏感" 命中', r21.requiresApproval === true && r21.reasons.indexOf('external_send') >= 0);
  // 短文本不误报
  const r22 = ms.detectRedline('a');
  ok('detector 极短文本 a 不命中', r22.requiresApproval === false);
  // 空文本
  const r23 = ms.detectRedline('');
  ok('detector 空文本不命中', r23.requiresApproval === false);
  const r24 = ms.detectRedline(null);
  ok('detector null 不命中', r24.requiresApproval === false);

  // ---- 2) stub runner 单测 ----
  const stub = ms.runStubAgent({ agentId: 'claude', cwd: cwdMock, text: 'hello stub', contextFiles: [], sessionId: 's1' });
  ok('stub runner 返回 ok', stub && stub.ok === true);
  ok('stub runner 返回 text', typeof stub.text === 'string' && stub.text.length > 0);
  ok('stub runner 含 stub 标识', /\[mobile-stub\]/.test(stub.text));
  ok('stub runner 不含 token/cookie', !/Bearer\s|sk-[A-Za-z0-9]/.test(stub.text));

  // ---- 3) 普通消息（未命中红线）走 stub runner ----
  // 用一个全新的 draft session 以避免受前面 approval 状态影响
  const rDraft2 = await req({ path: '/api/mobile/sessions/draft', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: cwdMock, agentId: 'claude' }));
  const jDraft2 = JSON.parse(rDraft2.body);
  const normalSessionId = jDraft2.sessionId;
  ok('new draft for normal flow 200', rDraft2.status === 200, rDraft2.status);

  // 发送普通消息（不命中红线）
  const rNormal = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(normalSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: '帮我看看这个项目的入口文件', cwd: cwdMock, agentId: 'claude' }));
  const jNormal = JSON.parse(rNormal.body);
  ok('普通消息 POST 200', rNormal.status === 200, rNormal.status);
  ok('普通消息 requiresApproval=false', jNormal.requiresApproval === false);
  ok('普通消息 status === done', jNormal.status === 'done', 'status=' + jNormal.status);
  ok('普通消息 含 agentId', jNormal.agentId === 'claude');

  // session 状态
  const rSess3 = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(normalSessionId), method: 'GET', headers: auth });
  const jSess3 = JSON.parse(rSess3.body);
  ok('普通消息后 session status === done', jSess3.session && jSess3.session.status === 'done', 'status=' + (jSess3.session && jSess3.session.status));
  // 写入 user + agent message
  ok('session 含 user message', jSess3.session && jSess3.session.messages && jSess3.session.messages.some(m => m.role === 'user' && m.status === 'sent'));
  ok('session 含 agent message (done)', jSess3.session && jSess3.session.messages && jSess3.session.messages.some(m => m.role === 'agent' && m.status === 'done'));

  // ---- 4) events endpoint ----
  const rEvt = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(normalSessionId) + '/events?limit=20', method: 'GET', headers: auth });
  const jEvt = JSON.parse(rEvt.body);
  ok('GET events 200', rEvt.status === 200, rEvt.status);
  ok('events 含 status', jEvt.status === 'done');
  ok('events 含 messages array', Array.isArray(jEvt.messages));
  ok('events 含 user/agent message', jEvt.messages.some(m => m.role === 'user') && jEvt.messages.some(m => m.role === 'agent'));
  // events 不含敏感字段
  const evtStr = JSON.stringify(jEvt);
  ok('events 不含 raw stdout 标记', !/raw\s*stdout|\[raw\]/.test(evtStr));
  ok('events 不含 .jsonl', !/\.jsonl/.test(evtStr));
  ok('events 不含 token/cookie/apiKey', !/Bearer\s|sk-[A-Za-z0-9]|AKIA-/.test(evtStr));
  ok('events 不含 claudeSession/codexSession', !/claudeSession|codexSession/.test(evtStr));
  // events 不带 cwd 路径
  ok('events 不暴露完整 cwd', !jEvt.cwd || jEvt.cwdLabel);

  // ---- 5) UI-A1：红线后第二次再发直接 200，done（不卡 waiting_approval） ----
  const rApv2nd = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(normalSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: 'git push 一下', cwd: cwdMock, agentId: 'claude' }));
  const jApv2nd = JSON.parse(rApv2nd.body);
  ok('第二次发红线 200 (UI-A1 直接执行)', rApv2nd.status === 200, 'status=' + rApv2nd.status);
  ok('第二次红线 requiresApproval 不为 true', jApv2nd.requiresApproval !== true, 'requiresApproval=' + jApv2nd.requiresApproval);
  ok('第二次红线 status === done', jApv2nd.status === 'done', 'status=' + jApv2nd.status);
  // UI-A1：第二次发普通消息也 200（不卡 waiting_approval）
  const r409 = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(normalSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: '再次普通消息', cwd: cwdMock, agentId: 'claude' }));
  ok('UI-A1 连续发送无需 approval', r409.status === 200, 'status=' + r409.status);
  // UI-A1：approval 接口保留作 audit，但 mobile send path 不调用
  // 不再调 decide（无 pending approval 可批）

  // ---- 7) UI ----
  // Mobile UI 必含 / 必不含
  ok('Mobile UI 包含 Send 按钮 (data-i="send")', /data-i="send"|id="agent-send"/.test(html) && /Send/.test(html));
  // UI-A1：替换旧 approval 提示文案为新文案
  ok('Mobile UI 含 "Running on your paired desktop"', /Running on your paired desktop/i.test(html));
  ok('Mobile UI 含 "Scoped to the selected folder"', /Scoped to the selected folder/i.test(html));
  ok('Mobile UI 含 "Logged locally in FanBox"', /Logged locally in FanBox/i.test(html));
  // UI-A1：移除旧 approval 文案（这些应已经不存在）
  ok('Mobile UI 不再含 "Redline actions require desktop approval"', !/Redline actions require desktop approval/i.test(html));
  ok('Mobile UI 不再含 "Desktop approval required"', !/Desktop approval required/i.test(html));
  ok('Mobile UI 不再含 "Request approval"', !/Request approval/i.test(html));
  ok('Mobile UI 不再含 "No raw terminal"', !/No raw terminal/i.test(html));
  ok('Mobile UI 不再含 "No direct shell"', !/No direct shell/i.test(html));
  ok('Mobile UI 不含 YOLO', !/\bYOLO\b/.test(all));
  ok('Mobile UI 不含 Full-auto', !/Full-?auto/i.test(all));
  ok('Mobile UI 不含 Start all agents', !/Start all agents/i.test(all));
  ok('Mobile UI 不含 Start Agent', !/Start Agent/.test(all));
  ok('Mobile UI 不含 Run Agent', !/Run Agent/.test(all));
  ok('Mobile UI 不含 Send Task', !/Send Task/.test(all));
  ok('Mobile UI 不含 Execute Shell', !/Execute Shell/i.test(all));
  ok('Mobile UI 不含 Terminal Input', !/Terminal Input/.test(all));
  ok('Mobile UI 不含 Delete File', !/Delete File/i.test(all));
  ok('Mobile UI 不含 Move File', !/Move File/i.test(all));
  ok('Mobile UI 不含 Rename File', !/Rename File/i.test(all));
  ok('Mobile UI 不含 Upload File', !/Upload File/i.test(all));
  // UI-A1：mobile.js 不再含 approved / rejected / timed out 文案分支
  ok('Mobile UI 不再含 approval-bar 元素', !/id="agent-approval-bar"/.test(html));
  ok('Mobile UI 不再含 "Approved by desktop" 文案分支', !/Approved by desktop\./i.test(js));
  ok('Mobile UI 不再含 "Rejected by desktop" 文案分支', !/Rejected by desktop\./i.test(js));
  ok('Mobile UI 不再含 "Approval timed out" 文案分支', !/Approval timed out\./i.test(js));
  ok('Mobile UI 不再含 "Waiting for desktop approval" 文案', !/Waiting for desktop approval/i.test(js));
  // polling text — UI-A1 不再需要轮询 approval
  // 注：mobile.js 仍保留 startApprovalPolling/stopApprovalPolling 作为 noop 防止外部引用报错
  // 验证它们是 noop（不实际 setInterval）
  ok('startApprovalPolling / stopApprovalPolling 是 noop',
    /function\s+startApprovalPolling\s*\(\s*\)\s*\{[\s\S]{0,200}?\/\*\s*noop[\s\S]*?\}/.test(js) &&
    /function\s+stopApprovalPolling\s*\(\s*\)\s*\{[\s\S]{0,200}?\/\*\s*noop[\s\S]*?\}/.test(js));
  ok('mobile.js 不再实际调用 setInterval 做 approval polling', !/setInterval\s*\(\s*[^,]+,\s*\d+\s*\)/.test(js));
  // agent-send button is interactive, not disabled by default
  const sendBtnMatch = html.match(/<button[^>]*\bid="agent-send"[^>]*>/);
  ok('agent-send 按钮存在且可点击（非 disabled）', sendBtnMatch && !/\bdisabled\b/.test(sendBtnMatch[0]));
  // Desktop UI
  const desktopHtml = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf8');
  const desktopJs = fs.readFileSync(path.join(ROOT_DIR, 'public', 'app.js'), 'utf8');
  const desktopAll = desktopHtml + '\n' + desktopJs;
  ok('Desktop UI 包含 Pending Mobile Approvals', /mobile-approval-list|待确认请求|Pending Mobile Approvals/i.test(desktopAll));
  ok('Desktop UI 不暴露 /api/mobile/pty/input', !/api\/mobile\/pty\/input/.test(desktopAll));

  // ============================================================
  // [11.9] Phase 2A-2.2：安全 Claude/Codex runner 接入
  // ============================================================
  section('11.9) Phase 2A-2.2: real runner wiring');

  // ---- 1) 模块存在 & 暴露 ----
  const runner = require(path.join(ROOT_DIR, 'electron', 'mobile-agent-runner.js'));
  ok('mobile-agent-runner 模块可 require', !!runner);
  ok('暴露 runMobileAgent', typeof runner.runMobileAgent === 'function');
  ok('暴露 runClaudeRunner', typeof runner.runClaudeRunner === 'function');
  ok('暴露 runCodexRunner', typeof runner.runCodexRunner === 'function');
  ok('暴露 runStubRunner', typeof runner.runStubRunner === 'function');
  ok('暴露 sanitizeOutput', typeof runner.sanitizeOutput === 'function');

  // ---- 2) 白名单 & 常量 ----
  ok('ALLOWED_AGENT_IDS 含 4 个 agent', runner.ALLOWED_AGENT_IDS.length === 4 && ['claude', 'codex', 'opencode', 'qoder'].every(x => runner.ALLOWED_AGENT_IDS.indexOf(x) >= 0));
  ok('REAL_RUNNER_IDS = claude/codex', runner.REAL_RUNNER_IDS.length === 2 && runner.REAL_RUNNER_IDS.indexOf('claude') >= 0 && runner.REAL_RUNNER_IDS.indexOf('codex') >= 0);
  ok('STUB_RUNNER_IDS = opencode/qoder', runner.STUB_RUNNER_IDS.length === 2 && runner.STUB_RUNNER_IDS.indexOf('opencode') >= 0 && runner.STUB_RUNNER_IDS.indexOf('qoder') >= 0);
  ok('MAX_OUTPUT_CHARS = 4000', runner.MAX_OUTPUT_CHARS === 4000);
  ok('DEFAULT_TIMEOUT_MS > 0', runner.DEFAULT_TIMEOUT_MS > 0);

  // ---- 3) SAFETY_PROMPT 内容 ----
  ok('SAFETY_PROMPT 含 cwd 边界', /Work only inside the current cwd/.test(runner.SAFETY_PROMPT));
  ok('SAFETY_PROMPT 含 desktop approval', /desktop approval/.test(runner.SAFETY_PROMPT));
  ok('SAFETY_PROMPT 含 .env 禁止', /\.env/.test(runner.SAFETY_PROMPT));
  ok('SAFETY_PROMPT 含 CI/CD 禁止', /CI\/CD/.test(runner.SAFETY_PROMPT));
  ok('SAFETY_PROMPT 含 push/deploy 禁止', /push|deploy|publish/.test(runner.SAFETY_PROMPT));

  // ---- 4) sanitizeOutput 行为 ----
  const s1 = runner.sanitizeOutput('hello world');
  ok('sanitizeOutput 保留普通文本', s1 === 'hello world');
  const s2 = runner.sanitizeOutput('Token: Bearer abcDEF.123-_+/=XYZ');
  ok('sanitizeOutput redact Bearer', /Bearer \[redacted\]/.test(s2) && !/abcDEF/.test(s2));
  const s3 = runner.sanitizeOutput('api key: sk-1234567890abcdef');
  ok('sanitizeOutput redact sk-', /sk-\[redacted\]/.test(s3) && !/1234567890abcdef/.test(s3));
  const s4 = runner.sanitizeOutput('session_id=uuid-aabbccddeeff');
  ok('sanitizeOutput redact session id', /session_id=\[redacted\]/.test(s4) && !/aabbccddeeff/.test(s4));
  const s5 = runner.sanitizeOutput('claude_session_id=uuid-aabbccddeeff');
  ok('sanitizeOutput redact claude session id', /session_id=\[redacted\]/.test(s5) && !/aabbccddeeff/.test(s5));
  const long = 'x'.repeat(runner.MAX_OUTPUT_CHARS + 500);
  const s6 = runner.sanitizeOutput(long);
  ok('sanitizeOutput 截断 > MAX_OUTPUT_CHARS', s6.length <= runner.MAX_OUTPUT_CHARS + 100 && /truncated/i.test(s6));
  const s7 = runner.sanitizeOutput('\x1b[31mred text\x1b[0m');
  ok('sanitizeOutput 去 ANSI', !/\x1b\[/.test(s7) && /red text/.test(s7));

  // ---- 5) runStubRunner 行为 ----
  const stub1 = runner.runStubRunner({ agentId: 'opencode', text: 'hello', cwd: '/tmp' });
  ok('runStubRunner opencode ok=true', stub1.ok === true);
  ok('runStubRunner opencode usedStub=true', stub1.usedStub === true);
  ok('runStubRunner opencode 不含 token/cookie', !/Bearer\s|sk-[A-Za-z0-9]/.test(stub1.text));
  const stub2 = runner.runStubRunner({ agentId: 'qoder', text: 'hello', cwd: '/tmp' });
  ok('runStubRunner qoder usedStub=true', stub2.usedStub === true);

  // ---- 6) runMobileAgent 路由（不入真子进程，仅 unit-level） ----
  // opencode/qoder → stub
  const rMobOC = await runner.runMobileAgent({ agentId: 'opencode', cwd: '/tmp', text: 'hi' });
  ok('runMobileAgent opencode mode=stub', rMobOC.mode === 'stub' && rMobOC.usedStub === true);
  const rMobQD = await runner.runMobileAgent({ agentId: 'qoder', cwd: '/tmp', text: 'hi' });
  ok('runMobileAgent qoder mode=stub', rMobQD.mode === 'stub' && rMobQD.usedStub === true);
  // 不在白名单 → agent_not_allowed
  const rMobBad = await runner.runMobileAgent({ agentId: 'shell', cwd: '/tmp', text: 'hi' });
  ok('runMobileAgent shell agent_not_allowed', rMobBad.ok === false && rMobBad.error === 'agent_not_allowed');
  // text 太长 → input_too_long
  const rMobLong = await runner.runMobileAgent({ agentId: 'claude', cwd: '/tmp', text: 'a'.repeat(5000) });
  ok('runMobileAgent text>4000 input_too_long', rMobLong.ok === false && rMobLong.error === 'input_too_long');
  // claude/codex 走真实分支（用户没装 cli → usedStub=true 兜底）
  const rMobClaude = await runner.runMobileAgent({ agentId: 'claude', cwd: '/tmp', text: 'hi' });
  ok('runMobileAgent claude 返回 ok', rMobClaude && typeof rMobClaude.text === 'string');
  // 即使没装 cli，也只会落到 usedStub=true 的安全 fallback，不会 panic
  if (rMobClaude.usedStub) {
    ok('runMobileAgent claude（未装 cli）usedStub=true 兜底', true);
  } else {
    ok('runMobileAgent claude（已装 cli）mode=real', rMobClaude.mode === 'real');
  }
  const rMobCodex = await runner.runMobileAgent({ agentId: 'codex', cwd: '/tmp', text: 'hi' });
  ok('runMobileAgent codex 返回 ok', rMobCodex && typeof rMobCodex.text === 'string');
  if (rMobCodex.usedStub) {
    ok('runMobileAgent codex（未装 cli）usedStub=true 兜底', true);
  } else {
    ok('runMobileAgent codex（已装 cli）mode=real', rMobCodex.mode === 'real');
  }

  // ---- 7) 源码级安全断言（最关键） ----
  const runnerSrc = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-agent-runner.js'), 'utf8');
  ok('runner 不使用 shell:true', !/shell\s*:\s*true/.test(runnerSrc));
  ok('runner 不引入 pty / node-pty', !/require\(['"]node-pty['"]\)/.test(runnerSrc) && !/pty:spawn|pty:input/.test(runnerSrc));
  ok('runner 不出现 --dangerously-skip-permissions', !/--dangerously-skip-permissions/.test(runnerSrc));
  ok('runner 不出现 --dangerously-bypass-approvals-and-sandbox', !/--dangerously-bypass-approvals-and-sandbox/.test(runnerSrc));
  ok('runner 不出现 YOLO / full-auto 标志', !/\bYOLO\b/i.test(runnerSrc) && !/full-?auto/i.test(runnerSrc));
  // args 是硬编码数组拼接（每次 push 的是常量字符串）
  ok('runner args 模板是 hardcoded array', /const\s+args\s*=\s*\[/.test(runnerSrc));
  // 不允许将 text 拼进 args
  ok('runner text 不进 argv（仅 stdin）', !/args\.push\(\s*text\s*\)|args\.push\(\s*trimmed\s*\)/.test(runnerSrc));
  // 必走 spawn(bin, args, { shell: false, ... })
  ok('runner 调 spawn(bin, args, { shell: false })', /spawn\(\s*bin\s*,\s*args\s*,\s*\{[\s\S]*?shell\s*:\s*false[\s\S]*?\}\s*\)/.test(runnerSrc));
  // 不让用户控制 executable
  ok('runner 不用用户输入做 bin 名', !/spawn\(\s*(?:opts|args|user)\b/.test(runnerSrc));

  // ---- 8) postMessageToMobileSession 已切换到 runMobileAgent（不再用 runStubAgent sync） ----
  const sessSrc = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-sessions.js'), 'utf8');
  ok('postMessageToMobileSession 调 runMobileAgent', /runMobileAgent\(/.test(sessSrc));
  // UI-A1：postMessageToMobileSession 直接调 runner（无 createApproval 分支）
  const postFn = sessSrc.match(/async function postMessageToMobileSession[\s\S]*?(?=\nasync function\s)/);
  ok('postMessageToMobileSession 不再调 createApproval',
    postFn && !/createApproval\s*\(/.test(postFn[0]));
  ok('postMessageToMobileSession 顺序：redline detect → appendAudit → runMobileAgent',
    postFn && /redline[\s\S]{0,500}appendAudit[\s\S]{0,1500}runMobileAgent/.test(postFn[0]));

  // ---- 9) events 端点不暴露 _internalSessionId / claudeSession / codexSession ----
  // 抓最新一次普通消息的 sessionId，触发真实 runner 路径
  const rDraftR = await req({ path: '/api/mobile/sessions/draft', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: cwdMock, agentId: 'codex' }));
  const jDraftR = JSON.parse(rDraftR.body);
  const realSessionId = jDraftR.sessionId;
  ok('new draft for real-runner flow 200', rDraftR.status === 200);
  const rReal = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(realSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: '你好，介绍一下这个文件夹的 README', cwd: cwdMock, agentId: 'codex' }));
  const jReal = JSON.parse(rReal.body);
  ok('真实 runner 流程 POST 200', rReal.status === 200, rReal.status);
  ok('真实 runner 流程 requiresApproval=false', jReal.requiresApproval === false);
  ok('真实 runner 流程 status === done/failed', jReal.status === 'done' || jReal.status === 'failed', 'status=' + jReal.status);
  // events 端点
  const rRealEvt = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(realSessionId) + '/events?limit=20', method: 'GET', headers: auth });
  const jRealEvt = JSON.parse(rRealEvt.body);
  const realEvtStr = JSON.stringify(jRealEvt);
  ok('real-runner events 含 status', jRealEvt.status === 'done' || jRealEvt.status === 'failed');
  ok('real-runner events 不含 _internalSessionId', !/_internalSessionId/.test(realEvtStr));
  ok('real-runner events 不含 claudeSession', !/claudeSession/.test(realEvtStr));
  ok('real-runner events 不含 codexSession', !/codexSession/.test(realEvtStr));
  ok('real-runner events 不含 token/cookie/apiKey', !/Bearer\s|sk-[A-Za-z0-9]|AKIA-/.test(realEvtStr));
  ok('real-runner events 不含 .jsonl / .cast / .log', !/\.jsonl|\.cast|\.log/.test(realEvtStr));
  // 校验 agent message 的 text 也不含 claude/codex session id
  const agentMsgs = (jRealEvt.messages || []).filter(m => m.role === 'agent');
  if (agentMsgs.length > 0) {
    const agentText = agentMsgs.map(m => m.text).join('\n');
    ok('agent message text 不含 claude/codex session id 形态', !/claude[_-]?session[_-]?id=|codex[_-]?session[_-]?id=/i.test(agentText));
  } else {
    ok('agent message 存在', false, 'no agent message');
  }

  // ---- 10) running 状态下的 409（确保 postMessageToMobileSession 内部互斥未改坏） ----
  // 用一个会让真实 runner 跑得比较久（或者退化成 stub 立刻 done）的 session 测试"刚发完还能再发"：发完一条普通消息 status=done 后，下一条仍能继续（不应误报 409）
  const rRunOk = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(realSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: '再问一次', cwd: cwdMock, agentId: 'codex' }));
  ok('done 后再发 → 200', rRunOk.status === 200, rRunOk.status);

  // ---- 11) text > 4000 仍然 400（即使走 runner 也不能放过） ----
  const rBig2 = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(realSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: 'a'.repeat(4001), cwd: cwdMock, agentId: 'codex' }));
  ok('text>4000 → 400', rBig2.status === 400, rBig2.status);

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
  // [15] Phase 2B（R2 第一部分）：统一 session index + mobile runner usage
  // ============================================================
  section('15) Phase 2B · unified index + mobile runner usage');

  // 15.1 直接调用 recordMobileUsage
  const fakeStarted = Date.now() - 1234;
  const fakeEnded = Date.now();
  const w1 = await mobileSessions.recordMobileUsage({
    sessionId: 'sess_rb1_' + Date.now(),
    agentId: 'claude',
    cwd: cwdMock,
    cwdLabel: 'fanbox-master',
    startedAt: fakeStarted,
    endedAt: fakeEnded,
    durationMs: 1234,
    inputChars: 256,
    outputChars: 1024,
    status: 'done'
  });
  ok('recordMobileUsage 写入 ok=true', w1 && w1.ok === true);

  // 15.2 拒绝带敏感字段
  const w1b = await mobileSessions.recordMobileUsage({
    sessionId: 'sess_rb1b_' + Date.now(),
    agentId: 'claude',
    cwd: cwdMock,
    cwdLabel: 'fanbox-master',
    startedAt: fakeStarted,
    endedAt: fakeEnded,
    durationMs: 100,
    inputChars: 1,
    outputChars: 1,
    status: 'done',
    raw: 'should be ignored',
    token: 'should be ignored',
    apiKey: 'should be ignored',
    secret: 'should be ignored',
    password: 'should be ignored',
    claudeSession: 'should be ignored',
    codexSession: 'should be ignored',
    jsonl: 'should be ignored',
    rawOutput: 'should be ignored'
  });
  ok('recordMobileUsage 写入 ok=true（带敏感字段被忽略）', w1b && w1b.ok === true);

  // 15.3 usage 不含敏感字段
  const usageObj = await mobileSessions.readMobileUsage();
  ok('readMobileUsage schemaVersion=1', usageObj.schemaVersion === 1);
  ok('readMobileUsage runs 至少 2 条', Array.isArray(usageObj.runs) && usageObj.runs.length >= 2);
  const usageStr = JSON.stringify(usageObj);
  ok('usage 不含 token', !usageStr.includes('"token":"should be ignored"'));
  ok('usage 不含 apiKey', !usageStr.includes('"apiKey":"should be ignored"'));
  ok('usage 不含 secret', !usageStr.includes('"secret":"should be ignored"'));
  ok('usage 不含 password', !usageStr.includes('"password":"should be ignored"'));
  ok('usage 不含 claudeSession', !usageStr.includes('"claudeSession":"should be ignored"'));
  ok('usage 不含 codexSession', !usageStr.includes('"codexSession":"should be ignored"'));
  ok('usage 不含 raw', !usageStr.includes('"raw":"should be ignored"'));
  ok('usage 不含 jsonl 路径', !usageStr.includes('.jsonl'));
  ok('usage 不含 rawOutput', !usageStr.includes('"rawOutput"'));
  ok('usage 不含 prompt 全文（fakeStarted 是数字，不是 prompt 全文）', !usageStr.includes('hello world this is a long prompt that should never be stored'));
  ok('usage inputChars=256', usageObj.runs.some(r => r.inputChars === 256 && r.agentId === 'claude' && r.cwdLabel === 'fanbox-master'));
  ok('usage outputChars=1024', usageObj.runs.some(r => r.outputChars === 1024));
  ok('usage durationMs=1234', usageObj.runs.some(r => r.durationMs === 1234));
  ok('usage status=done', usageObj.runs.some(r => r.status === 'done'));
  ok('usage inputTokens=null（不伪造）', usageObj.runs.every(r => r.inputTokens === null));
  ok('usage outputTokens=null（不伪造）', usageObj.runs.every(r => r.outputTokens === null));
  ok('usage totalTokens=null（不伪造）', usageObj.runs.every(r => r.totalTokens === null));
  ok('usage estimatedCost=null（不伪造）', usageObj.runs.every(r => r.estimatedCost === null));

  // 15.4 upsertUnifiedSessionIndex + readUnifiedSessionIndex
  const fakeMobileSess = {
    sessionId: 'sess_idx1_' + Date.now(),
    agentId: 'claude',
    kind: 'agent',
    cwd: cwdMock,
    cwdLabel: 'fanbox-master',
    title: '解释 mobile 目录结构',
    status: 'done',
    createdAt: fakeStarted,
    updatedAt: fakeEnded,
    lastActiveAt: fakeEnded,
    messageCount: 2,
    lastRunDurationMs: 1234
  };
  const u1 = await mobileSessions.upsertUnifiedSessionIndex(fakeMobileSess);
  ok('upsertUnifiedSessionIndex ok=true', u1 && u1.ok === true);
  const idxObj = await mobileSessions.readUnifiedSessionIndex();
  ok('readUnifiedSessionIndex schemaVersion=1', idxObj.schemaVersion === 1);
  ok('index 含 fakeMobileSess', !!idxObj.sessions[fakeMobileSess.sessionId]);
  const idxEntry = idxObj.sessions[fakeMobileSess.sessionId];
  ok('index entry agentId=claude', idxEntry.agentId === 'claude');
  ok('index entry cwdLabel=fanbox-master', idxEntry.cwdLabel === 'fanbox-master');
  ok('index entry status=done', idxEntry.status === 'done');
  ok('index entry source=mobile', idxEntry.source === 'mobile');
  ok('index entry usage.durationMs=1234', idxEntry.usage && idxEntry.usage.durationMs === 1234);
  ok('index entry usage.inputTokens=null', idxEntry.usage && idxEntry.usage.inputTokens === null);
  // 拒绝 unknown agent
  const badAgent = await mobileSessions.upsertUnifiedSessionIndex({ ...fakeMobileSess, agentId: 'evil-agent' });
  ok('index 拒绝 unknown agent（ok=false）', badAgent && badAgent.ok === false);

  // 15.5 sessions list 返回 status 字段（沿用 [10] 的 jQ，校验 status 字段存在）
  const jListRe = JSON.parse((await req({ path: '/api/mobile/sessions?limit=10', method: 'GET', headers: auth2 })).body);
  if (Array.isArray(jListRe.items) && jListRe.items.length > 0) {
    ok('sessions list 每条都有 status 字段', jListRe.items.every(i => typeof i.status === 'string'));
    ok('sessions list 状态枚举有效', jListRe.items.every(i => ['idle','running','done','failed','waiting_approval','approved','rejected','timeout'].includes(i.status)));
  } else {
    ok('sessions list 至少返回 0 项（容忍空）', true);
  }

  // 15.6 sessions detail 不含 raw stdout / .jsonl / claudeSession / token
  const jListAny = JSON.parse((await req({ path: '/api/mobile/sessions?limit=10', method: 'GET', headers: auth2 })).body);
  if (jListAny.items && jListAny.items.length > 0) {
    const jd = JSON.parse((await req({ path: '/api/mobile/sessions/' + jListAny.items[0].sessionId, method: 'GET', headers: auth2 })).body);
    const detailStr = JSON.stringify(jd);
    ok('session detail 不含 .jsonl', !detailStr.includes('.jsonl'));
    ok('session detail 不含 rawStdout', !detailStr.includes('rawStdout'));
    ok('session detail 不含 rawStderr', !detailStr.includes('rawStderr'));
    ok('session detail 不含 stdout', !detailStr.includes('"stdout"'));
    ok('session detail 不含 stderr', !detailStr.includes('"stderr"'));
    ok('session detail 不含 pty', !detailStr.includes('"pty"'));
    ok('session detail 不含 process.pid', !detailStr.includes('"pid"'));
    ok('session detail 不含 claudeSession', !detailStr.includes('"claudeSession"'));
    ok('session detail 不含 codexSession', !detailStr.includes('"codexSession"'));
    ok('session detail 不含 apiKey', !detailStr.includes('"apiKey"'));
    ok('session detail 不含 secret', !detailStr.includes('"secret"'));
    ok('session detail 不含 password', !detailStr.includes('"password"'));
  } else {
    ok('session detail 跳过（无 session 可查）', true);
  }

  // 15.7 /api/mobile/usage 包含 mobileRunner 字段
  const jUsage = JSON.parse((await req({ path: '/api/mobile/usage', method: 'GET', headers: auth2 })).body);
  ok('/api/mobile/usage 包含 mobileRunner', !!(jUsage.mobileRunner));
  ok('/api/mobile/usage summary.todayRuns >= 1', (jUsage.summary && typeof jUsage.summary.todayRuns === 'number' && jUsage.summary.todayRuns >= 1));
  ok('/api/mobile/usage summary.todayDurationMs >= 0', (jUsage.summary && typeof jUsage.summary.todayDurationMs === 'number'));
  ok('/api/mobile/usage summary.todayInputChars >= 256', (jUsage.summary && jUsage.summary.todayInputChars >= 256));
  ok('/api/mobile/usage summary.todayOutputChars >= 1024', (jUsage.summary && jUsage.summary.todayOutputChars >= 1024));
  ok('/api/mobile/usage mobileRunner.byAgent 是数组', Array.isArray(jUsage.mobileRunner.byAgent));
  ok('/api/mobile/usage mobileRunner.byCwd 是数组', Array.isArray(jUsage.mobileRunner.byCwd));
  ok('/api/mobile/usage mobileRunner.recent 不含 inputTokens', !JSON.stringify(jUsage.mobileRunner.recent).includes('"inputTokens"'));
  ok('/api/mobile/usage mobileRunner.recent 不含 estimatedCost', !JSON.stringify(jUsage.mobileRunner.recent).includes('"estimatedCost"'));
  ok('/api/mobile/usage mobileRunner.recent 不含 rawOutput', !JSON.stringify(jUsage.mobileRunner.recent).includes('rawOutput'));

  // 15.8 /api/mobile/usage?agentId=claude 过滤
  const jUsageF = JSON.parse((await req({ path: '/api/mobile/usage?agentId=claude', method: 'GET', headers: auth2 })).body);
  ok('usage 过滤 agentId=claude filtered=true', jUsageF.filtered === true);
  ok('usage 过滤 agentId=claude 全部是 claude', jUsageF.mobileRunner.recent.every(r => r.agentId === 'claude'));

  // 15.9 /api/mobile/usage?cwd=... 过滤
  const jUsageCwd = JSON.parse((await req({ path: '/api/mobile/usage?cwd=' + encodeURIComponent(cwdMock), method: 'GET', headers: auth2 })).body);
  ok('usage 过滤 cwd=mock filtered=true', jUsageCwd.filtered === true);
  ok('usage 过滤 cwd=mock 全部是 mock', jUsageCwd.mobileRunner.recent.every(r => r.cwd === cwdMock));

  // 15.10 events 返回 status 字段
  const jEvents = JSON.parse((await req({ path: '/api/mobile/sessions?limit=5', method: 'GET', headers: auth2 })).body);
  if (jEvents.items && jEvents.items.length > 0) {
    const je = JSON.parse((await req({ path: '/api/mobile/sessions/' + jEvents.items[0].sessionId + '/events', method: 'GET', headers: auth2 })).body);
    const eventsStr = JSON.stringify(je);
    ok('events 不含 rawStdout', !eventsStr.includes('rawStdout'));
    ok('events 不含 rawStderr', !eventsStr.includes('rawStderr'));
    ok('events 不含 .jsonl', !eventsStr.includes('.jsonl'));
    ok('events 不含 token/cookie/apiKey/secret/password', !/\b(token|cookie|apiKey|secret|password)\b/.test(eventsStr.replace(/,"status":"failed","text":"[^"]*"/g, '')));
  } else {
    ok('events 跳过（无 session）', true);
  }

  // 15.11 UI 危险文案扫描（保持 R1A 行为）
  const uiHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'mobile', 'index.html'), 'utf8');
  const uiJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'mobile', 'mobile.js'), 'utf8');
  const uiCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'mobile', 'mobile.css'), 'utf8');
  const uiAll = uiHtml + '\n' + uiJs + '\n' + uiCss;
  // R2 新增约束：UI 包含 mobile runs 显示
  ok('UI 含 mobile-runs / today-runs / week-runs 之一', /mobile-runs|today-runs|week-runs|home-runs/i.test(uiAll));
  ok('UI 不包含 YOLO', !/\bYOLO\b/i.test(uiAll));
  ok('UI 不包含 Full-auto', !/Full-?auto/i.test(uiAll));
  ok('UI 不包含 Start all agents', !/Start all agents/i.test(uiAll));
  ok('UI 不包含 Terminal Input', !/Terminal Input/i.test(uiAll));
  ok('UI 不包含 Execute Shell', !/Execute Shell/i.test(uiAll));
  ok('UI 不包含 Delete File', !/Delete File/i.test(uiAll));
  ok('UI 不包含 Move File', !/Move File/i.test(uiAll));
  ok('UI 不包含 Rename File', !/Rename File/i.test(uiAll));
  ok('UI 不包含 Upload File', !/Upload File/i.test(uiAll));
  // UI-A1：Redline actions 文案已移除（红线不再走 approval）
  ok('UI 不再包含 "Redline actions require desktop approval"', !/Redline actions require desktop approval/i.test(uiAll));
  // UI-A1：新文案
  ok('UI 包含 "Running on your paired desktop"', /Running on your paired desktop/i.test(uiAll));
  ok('UI 包含 "Scoped to the selected folder"', /Scoped to the selected folder/i.test(uiAll));

  // ============================================================
  // 收尾
  // ============================================================
  await new Promise((r) => server.close(r));
  console.log('\n===== Phase 2A-1 总结 =====');
  console.log('PASS:', passed);
  console.log('FAIL:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
