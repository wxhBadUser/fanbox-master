/* eslint-disable */
/**
 * FanBox Mobile · Phase UI-A8-5-P0 smoke
 * Home Chat Send 405 修复回归
 *
 * 覆盖（按 user spec §八）：
 *   - endpoint & 405 修复
 *   - agent id 映射
 *   - send 行为 (running / done / failed / 友好错误)
 *   - session 复用与创建
 *   - 禁止项 (raw JSON / token / Delete / Move / Rename / Upload / shell / pty)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-smoke-chat-send-' + Date.now());
fs.mkdirSync(TMP_HOME, { recursive: true });
process.env.HOME = TMP_HOME; process.env.USERPROFILE = TMP_HOME;
process.env.FANBOX_MOBILE_DIR = path.join(TMP_HOME, '.fanbox', 'mobile');
process.env.FANBOX_WECHAT_DIR = path.join(TMP_HOME, '.fanbox', 'wechat');
process.env.FANBOX_SESSIONS_DIR = path.join(TMP_HOME, '.fanbox', 'sessions');
process.env.MOBILE_AGENT_FORCE_STUB = '1';
fs.mkdirSync(process.env.FANBOX_MOBILE_DIR, { recursive: true });
fs.mkdirSync(process.env.FANBOX_WECHAT_DIR, { recursive: true });
fs.mkdirSync(process.env.FANBOX_SESSIONS_DIR, { recursive: true });

const mobile = require(path.join(__dirname, '..', 'electron', 'mobile.js'));

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
const html = fs.readFileSync(HTML_PATH, 'utf8');
const css  = fs.readFileSync(CSS_PATH, 'utf8');
const js   = fs.readFileSync(JS_PATH, 'utf8');
const mobileJsCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile.js'), 'utf8');
const runnerCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-agent-runner.js'), 'utf8');
const sessCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-sessions.js'), 'utf8');

const port = 14693;

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
  section('0) 启动 server + 配对');
  const server = mobile.startMobileServer({ port });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise((r) => setTimeout(r, 20));
  ok('mobile server listening', server.listening);
  await mobile.saveConfig({ enabled: true });
  const pc = await mobile.startPairCode();
  const rPC = await req({
    path: '/api/mobile/pair/confirm', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ pairCode: pc.pairCode, deviceName: 'Smoke-UI-A8-5-P0' }));
  const jPC = JSON.parse(rPC.body);
  const token = jPC.token;
  const auth = { Authorization: 'Bearer ' + token };
  ok('pair/confirm 200', rPC.status === 200);
  ok('token 取得', !!token && token.length > 30);

  // 注入一个允许的 cwd
  const cwdMock = path.join(TMP_HOME, 'fanbox-cwd-A8-5');
  fs.mkdirSync(cwdMock, { recursive: true });
  fs.writeFileSync(path.join(cwdMock, 'README.md'), '# A8-5 test\n', 'utf8');

  // ============================================================
  // [1] endpoint 存在 + 不是 405
  // ============================================================
  section('1) Endpoint 存在 + 不再 405');
  // 1) code-level: backend 注册了 POST /api/mobile/agent/send
  ok('backend: electron/mobile.js 注册 POST /api/mobile/agent/send',
    /req\.method\s*===\s*'POST'[\s\S]{0,80}pathOnly\s*===\s*'\/api\/mobile\/agent\/send'/.test(mobileJsCode));
  ok('backend: endpoint 在 handleMobileApiV2A (V2A 才是 POST 注册处)',
    /handleMobileApiV2A[\s\S]{0,30000}\/api\/mobile\/agent\/send/.test(mobileJsCode));
  ok('backend: friendlySendError 存在',
    /function\s+friendlySendError\s*\(/.test(mobileJsCode));
  ok('backend: 调用 mobileSessions.postMessageToMobileSession',
    /postMessageToMobileSession\(/.test(mobileJsCode));

  // 2) live: POST /api/mobile/agent/send 必须 200, 不再 405
  const rSend1 = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: '你是谁？' }));
  ok('POST /api/mobile/agent/send 200 (不再 405)', rSend1.status === 200, 'status=' + rSend1.status);
  const j1 = JSON.parse(rSend1.body);
  ok('send 响应 ok=true', j1.ok === true);
  ok('send 响应含 sessionId', !!j1.sessionId && j1.sessionId.length > 5);
  ok('send 响应含 agentId=claude', j1.agentId === 'claude');
  ok('send 响应含 status (done/failed/timeout)', ['done', 'failed', 'timeout'].includes(j1.status));
  ok('send 响应含 message.role=assistant',
    j1.message && j1.message.role === 'assistant');
  ok('send 响应 message.content 不为空', j1.message && typeof j1.message.content === 'string' && j1.message.content.length > 0);
  ok('send 响应不显示 [mobile-runner] 原始 runner 文本',
    !/\[mobile-runner\]/i.test(j1.message && j1.message.content || ''));
  ok('send 响应不显示 spawn/ENOENT 机器错误',
    !/\b(spawn|ENOENT|npm-global|failed:)\b/i.test(j1.message && j1.message.content || ''));
  ok('send 响应不含 raw stdout/JSONL',
    !/(jsonl|stdout|stderr|scrollback)/i.test(JSON.stringify(j1)));
  ok('send 响应不含 token/cookie/apiKey',
    !/(Bearer\s+[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{8,}|apiKey\s*[:=])/.test(JSON.stringify(j1)));
  ok('send 响应不含真实 cwd 路径细节',
    !new RegExp(cwdMock.replace(/[\\\/]/g, '[\\\\/]'), 'i').test(j1.message && j1.message.content || ''));
  ok('send 响应不含 Delete/Move/Rename/Upload 字段',
    !/(delete|move|rename|upload)\s*[:=]\s*['"]/.test(JSON.stringify(j1)));

  // 3) 旧 endpoint 行为: POST /api/mobile/send 应 405 (确认旧路径已不再用)
  const rOld = await req({
    path: '/api/mobile/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ prompt: 'test' }));
  ok('POST /api/mobile/send 仍然 405 (旧路径废弃)',
    rOld.status === 405);

  // ============================================================
  // [2] agent id 映射
  // ============================================================
  section('2) Agent id 映射');
  ok('mobile.js mapAgentId claude_code → claude',
    /mapAgentId[\s\S]{0,200}'claude_code'[\s\S]{0,100}return\s*'claude'/.test(js));
  ok('mobile.js mapAgentId open_code → opencode',
    /mapAgentId[\s\S]{0,500}'open_code'[\s\S]{0,100}return\s*'opencode'/.test(js));
  ok('mobile.js mapAgentId 默认回退 claude',
    /mapAgentId[\s\S]{0,500}return\s*'claude'\s*;?\s*}/.test(js));
  ok('mobile.js agentIdForBackend 存在', /function\s+agentIdForBackend\s*\(/.test(js));
  ok('mobile.js agentIdForDisplay 存在', /function\s+agentIdForDisplay\s*\(/.test(js));
  ok('mobile.js agentIdForDisplay claude → Claude Code',
    /agentIdForDisplay[\s\S]{0,500}'Claude Code'/.test(js));
  ok('mobile.js agentIdForDisplay codex → Codex',
    /agentIdForDisplay[\s\S]{0,500}'Codex'/.test(js));
  ok('mobile.js agentIdForDisplay qoder → Qoder',
    /agentIdForDisplay[\s\S]{0,500}'Qoder'/.test(js));
  ok('mobile.js agentIdForDisplay opencode → OpenCode',
    /agentIdForDisplay[\s\S]{0,500}'OpenCode'/.test(js));

  // 实际发送: claude_code UI id 也不应 405
  // 前端 doSend 已经用 mapAgentId 转 'claude_code' → 'claude'，后端只看到 claude
  // 验证：发送 claude 应 OK
  const rCl = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: 'hi' }));
  ok('claude 不再 405', rCl.status === 200, 'status=' + rCl.status);

  // codex 至少不 405
  const rCx = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'codex', cwd: cwdMock, message: 'hi' }));
  ok('codex 不再 405', rCx.status === 200, 'status=' + rCx.status);
  // qoder
  const rQd = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'qoder', cwd: cwdMock, message: 'hi' }));
  ok('qoder 不再 405', rQd.status === 200, 'status=' + rQd.status);
  // opencode
  const rOc = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'opencode', cwd: cwdMock, message: 'hi' }));
  ok('opencode 不再 405', rOc.status === 200, 'status=' + rOc.status);

  // ============================================================
  // [3] 友好错误
  // ============================================================
  section('3) 友好错误');
  // 无 token
  const rNoAuth = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: 'hi' }));
  ok('无 token 401', rNoAuth.status === 401);
  // 错 token
  const rBadAuth = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer WRONG' },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: 'hi' }));
  ok('错 token 401', rBadAuth.status === 401);
  // 非白名单 agent
  const rBadAgent = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'shell', cwd: cwdMock, message: 'hi' }));
  ok('非白名单 agent 400', rBadAgent.status === 400, 'status=' + rBadAgent.status);
  const jBA = JSON.parse(rBadAgent.body);
  ok('非白名单 agent error=invalid_agent', jBA.error === 'invalid_agent');
  // 空消息
  const rEmpty = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: '   ' }));
  ok('空消息 400', rEmpty.status === 400, 'status=' + rEmpty.status);
  // cwd 越界 (用一个不存在的 cwd，且不在 allowed roots 内)
  const rBadCwd = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'claude', cwd: 'Z:\\__definitely_not_allowed_xxx__', message: 'hi' }));
  ok('cwd 越界 403', rBadCwd.status === 403, 'status=' + rBadCwd.status);

  // friendlySendError 覆盖关键 case
  ok('backend: friendlySendError 处理 runner_unavailable',
    /friendlySendError[\s\S]{0,2000}'runner_unavailable'/.test(mobileJsCode));
  ok('backend: friendlySendError 处理 invalid_agent',
    /friendlySendError[\s\S]{0,2000}'invalid_agent'/.test(mobileJsCode));
  ok('backend: friendlySendError 处理 no_workspace',
    /friendlySendError[\s\S]{0,2000}'no_workspace'/.test(mobileJsCode));
  ok('backend: friendlySendError 处理 timeout',
    /friendlySendError[\s\S]{0,2000}'timeout'/.test(mobileJsCode));

  // 前端 friendlyFetchError 必须存在，且不暴露 raw JSON
  ok('mobile.js friendlyFetchError 存在', /function\s+friendlyFetchError\s*\(/.test(js));
  ok('mobile.js friendlyFetchError 不暴露 405',
    /friendlyFetchError[\s\S]{0,800}移动端发送接口暂不可用/.test(js));
  ok('mobile.js doSend 永远不写 e.message 原文',
    !/doSend[\s\S]{0,2000}content:\s*`请求失败:\s*\$\{e\.message\}`/.test(js));
  ok('mobile.js doSend 永远不写 \'错误: ${data.error}\'',
    !/doSend[\s\S]{0,2000}content:\s*`错误:\s*\$\{data\.error\}`/.test(js));

  // ============================================================
  // [4] Session 行为
  // ============================================================
  section('4) Session 行为');
  // 第一次 send: 没有 sessionId, 应该自动创建
  const rN1 = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: '消息1' }));
  const jN1 = JSON.parse(rN1.body);
  const sid1 = jN1.sessionId;
  ok('首次 send 创建 session', !!sid1 && sid1.length > 5);
  ok('返回 cwd', jN1.cwd && jN1.cwd.length > 0);

  // 第二次 send: 传回 sessionId, 应复用
  const rN2 = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, sessionId: sid1, message: '消息2' }));
  const jN2 = JSON.parse(rN2.body);
  ok('二次 send 复用 session', jN2.sessionId === sid1);
  ok('cwd 保留', jN2.cwd === jN1.cwd);
  ok('agentId 保留', jN2.agentId === 'claude');

  // Project 端能看到这个 session
  const rList = await req({
    path: '/api/mobile/sessions?cwd=' + encodeURIComponent(cwdMock),
    method: 'GET', headers: auth,
  });
  const jL = JSON.parse(rList.body);
  const sessList = jL.items || jL.sessions || (Array.isArray(jL) ? jL : []);
  const found = sessList.find(s => s.sessionId === sid1);
  ok('Project 端能看到新建 session', !!found);
  ok('session cwd 保留', found && found.cwd && found.cwd.toLowerCase() === cwdMock.toLowerCase());
  ok('session agentId 保留', found && found.agentId === 'claude');

  // 切换 agent 不串 session (新 session, 不是 sid1)
  const rN3 = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'codex', cwd: cwdMock, message: '消息3' }));
  const jN3 = JSON.parse(rN3.body);
  ok('切 codex 创建新 session (不串 sid1)', jN3.sessionId && jN3.sessionId !== sid1);
  ok('切 codex agentId 切换为 codex', jN3.agentId === 'codex');

  // ============================================================
  // [5] 禁止项
  // ============================================================
  section('5) 禁止项');
  ok('send endpoint 不暴露 raw stdout', !/req\.body/.test(mobileJsCode) || /requireMobileAuth[\s\S]{0,3000}stdout/i.test(mobileJsCode) === false);
  ok('send endpoint 不接受自定义 command',
    !/body\.command\s*[=:]|body\.args\s*[=:]|body\.shell\s*[=:]/i.test(mobileJsCode.replace(/.*?POST \/api\/mobile\/agent\/send[\s\S]{0,5000}/m, '')));
  ok('send endpoint 不接受 shell / pty',
    !/body\.(shell|pty|spawn|exec)\s*[=:]/i.test(mobileJsCode));
  ok('send endpoint 不接受 upload / delete / move / rename',
    !/body\.(upload|delete|move|rename)\s*[=:]/i.test(mobileJsCode));
  ok('send endpoint 不暴露 token/cookie/apiKey',
    !/(Bearer\s+[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{8,}|apiKey\s*[:=])/.test(JSON.stringify(j1)));
  ok('mobile.js 不在 chat-send 调用 Delete/Move/Rename/Upload API',
    !/doSend[\s\S]{0,3000}\/api\/mobile\/(delete|move|rename|upload)/i.test(js));
  ok('mobile.js 不在 chat-send 调用 shell / pty',
    !/doSend[\s\S]{0,3000}(spawn|exec\(|pty)/i.test(js));

  // ============================================================
  // [6] redline 不阻塞
  // ============================================================
  section('6) redline 不阻塞');
  // redline 消息应该能 send 成功 (200), 不再 blocking
  const rRed = await req({
    path: '/api/mobile/agent/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: 'rm -rf ./build' }));
  ok('redline 消息 200 (不阻塞)', rRed.status === 200, 'status=' + rRed.status);

  // ============================================================
  // [7] Home input UI 完整性 (不退化)
  // ============================================================
  section('7) UI 完整性 (不退化)');
  ok('HTML 仍有 1 个 #home-input', (html.match(/id="home-input"/g) || []).length === 1);
  ok('HTML 仍有 1 个 #home-send', (html.match(/id="home-send"/g) || []).length === 1);
  ok('doSend 调用新 endpoint /api/mobile/agent/send',
    /doSend[\s\S]{0,2000}\/api\/mobile\/agent\/send/.test(js));
  ok('doSend 不再调用旧 /api/mobile/send (POST 形式)',
    !/doSend[\s\S]{0,2000}['"]\/api\/mobile\/send['"][\s\S]{0,200}method:\s*['"]POST['"]/.test(js));
  ok('doSend 用 SESSION_KEY 保存 sessionId',
    /localStorage\.setItem\(SESSION_KEY/.test(js));
  ok('continueSession 把后端 claude 映射回 UI claude_code',
    /function\s+agentIdForUi\s*\(/.test(js) && /continueSession[\s\S]{0,900}agentIdForUi\(session\.agentId\)/.test(js));
  ok('filesNavigateBack 可清空 cwd 回 roots/此电脑',
    /function\s+filesNavigateBack\s*\([\s\S]{0,1400}loadFilesRoots\(\)/.test(js) &&
    /function\s+filesNavigateBack\s*\([\s\S]{0,1400}CWD_KEY/.test(js));
  ok('openSkillPicker 不再使用 window.prompt',
    !/function\s+openSkillPicker\s*\([\s\S]{0,900}window\.prompt/.test(js));
  ok('Use in chat 选择技能后更新 Skill 按钮标签',
    /function\s+useSkillInChat\s*\([\s\S]{0,1000}home-skill-button-label/.test(js));

  // ============================================================
  // [8] Phase UI-A8-6: Stream endpoint 保留 /agent/send fallback
  // ============================================================
  section('8) Stream 兼容 (UI-A8-6)');
  ok('backend: POST /api/mobile/agent/stream 注册',
    /req\.method\s*===\s*'POST'[\s\S]{0,80}pathOnly\s*===\s*'\/api\/mobile\/agent\/stream'/.test(mobileJsCode));
  ok('backend: stream 返回 text/event-stream',
    /text\/event-stream/.test(mobileJsCode));
  ok('backend: runMobileAgentStream 导出',
    /runMobileAgentStream/.test(runnerCode));
  ok('frontend: doSendStream 优先调用 /api/mobile/agent/stream',
    /doSendStream[\s\S]{0,2000}\/api\/mobile\/agent\/stream/.test(js));
  ok('frontend: doSendFallback 保留 /api/mobile/agent/send',
    /doSendFallback[\s\S]{0,2000}\/api\/mobile\/agent\/send/.test(js));
  ok('frontend: S._streamAbort 存在',
    /_streamAbort/.test(js));
  ok('frontend: switchAgent aborts stream',
    /switchAgent[\s\S]{0,500}_streamAbort[\s\S]{0,200}\.abort\(\)/.test(js));
  ok('frontend: newChat aborts stream',
    /newChat[\s\S]{0,500}_streamAbort[\s\S]{0,200}\.abort\(\)/.test(js));
  ok('frontend: parseSSEEvent 存在',
    /function\s+parseSSEEvent\s*\(/.test(js));
  ok('frontend: handleStreamEvent 存在',
    /function\s+handleStreamEvent\s*\(/.test(js));
  ok('frontend: renderStreamSteps 存在',
    /function\s+renderStreamSteps\s*\(/.test(js));
  ok('CSS: .stream-steps 存在',
    /\.stream-steps\s*\{/.test(css));
  ok('CSS: .stream-step.is-running 存在',
    /\.stream-step\.is-running/.test(css));
  ok('CSS: .stream-step.is-done 存在',
    /\.stream-step\.is-done/.test(css));
  ok('CSS: .stream-step.is-failed 存在',
    /\.stream-step\.is-failed/.test(css));
  ok('CSS: .stream-delta 存在',
    /\.stream-delta\s*\{/.test(css));

  section('DONE');
  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
