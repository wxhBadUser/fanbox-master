/* eslint-disable */
/**
 * FanBox Mobile · Phase UI-A8-6 smoke
 * True Streaming Agent Response
 *
 * 覆盖：
 *   - Backend stream endpoint (POST /api/mobile/agent/stream)
 *   - Event protocol (mobile-agent-runner.js)
 *   - Frontend stream (public/mobile/mobile.js)
 *   - UI CSS (public/mobile/mobile.css)
 *   - Skill integration
 *   - Security (禁止项)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-smoke-agent-stream-' + Date.now());
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

const port = 14694;

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
  }, JSON.stringify({ pairCode: pc.pairCode, deviceName: 'Smoke-UI-A8-6' }));
  const jPC = JSON.parse(rPC.body);
  const token = jPC.token;
  const auth = { Authorization: 'Bearer ' + token };
  ok('pair/confirm 200', rPC.status === 200);
  ok('token 取得', !!token && token.length > 30);

  // 注入一个允许的 cwd
  const cwdMock = path.join(TMP_HOME, 'fanbox-cwd-A8-6');
  fs.mkdirSync(cwdMock, { recursive: true });
  fs.writeFileSync(path.join(cwdMock, 'README.md'), '# A8-6 test\n', 'utf8');

  // ============================================================
  // [1] Backend stream endpoint
  // ============================================================
  section('1) Backend stream endpoint');

  // 1) POST /api/mobile/agent/stream exists in code
  ok('#1 backend: electron/mobile.js 注册 POST /api/mobile/agent/stream',
    /req\.method\s*===\s*'POST'[\s\S]{0,80}pathOnly\s*===\s*'\/api\/mobile\/agent\/stream'/.test(mobileJsCode));

  // 2) Returns text/event-stream Content-Type
  ok('#2 backend: stream endpoint 设置 Content-Type: text/event-stream',
    /Content-Type.*text\/event-stream/.test(mobileJsCode));

  // 3) Token + LAN still works (200 with valid token)
  const rStream1 = await req({
    path: '/api/mobile/agent/stream', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: '你好' }));
  ok('#3 valid token → 200', rStream1.status === 200, 'status=' + rStream1.status);
  ok('#3a Content-Type is text/event-stream',
    /text\/event-stream/.test(rStream1.headers['content-type'] || ''),
    'ct=' + rStream1.headers['content-type']);

  // 4) No token → 401
  const rNoAuth = await req({
    path: '/api/mobile/agent/stream', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: 'hi' }));
  ok('#4 无 token 401', rNoAuth.status === 401);

  // 5) Bad token → 401
  const rBadAuth = await req({
    path: '/api/mobile/agent/stream', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer WRONG' },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: 'hi' }));
  ok('#5 错 token 401', rBadAuth.status === 401);

  // 6) CWD out of bounds → 403
  const rBadCwd = await req({
    path: '/api/mobile/agent/stream', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'claude', cwd: 'Z:\\__definitely_not_allowed_xxx__', message: 'hi' }));
  ok('#6 cwd 越界 403', rBadCwd.status === 403, 'status=' + rBadCwd.status);

  // 7) Non-whitelisted agent → 400
  const rBadAgent = await req({
    path: '/api/mobile/agent/stream', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'shell', cwd: cwdMock, message: 'hi' }));
  ok('#7 非白名单 agent 400', rBadAgent.status === 400, 'status=' + rBadAgent.status);

  // 8) GET method not supported (not 200)
  const rGet = await req({
    path: '/api/mobile/agent/stream', method: 'GET',
    headers: auth,
  });
  ok('#8 GET /api/mobile/agent/stream 不返回 200', rGet.status !== 200, 'status=' + rGet.status);

  // 9) No 405 errors
  ok('#9 stream endpoint 不返回 405',
    rStream1.status !== 405, 'status=' + rStream1.status);

  // 10) No raw JSON error exposure
  ok('#10 stream 响应不含 raw JSON error (非 SSE 格式)',
    !/^\s*\{.*"error"\s*:/.test(rStream1.body.split('\n').filter(l => !l.startsWith('event:') && !l.startsWith('data:')).join('')));

  // ============================================================
  // [2] Event protocol (code-level checks on mobile-agent-runner.js)
  // ============================================================
  section('2) Event protocol (mobile-agent-runner.js)');

  // 11) Has start event emission
  ok('#11 runner: emit start 事件',
    /emit\(\s*'start'/.test(runnerCode));

  // 12) Has session event emission — session is emitted in mobile.js, not runner
  ok('#12 backend: session 事件在 mobile.js stream handler 中 emit',
    /sseEmit\(\s*'session'/.test(mobileJsCode));

  // 13) Has step event emission
  ok('#13 runner: emit step 事件',
    /emit\(\s*'step'/.test(runnerCode));

  // 14) Has done event emission
  ok('#14 runner: emit done 事件',
    /emit\(\s*'done'/.test(runnerCode));

  // 15) Runner unavailable → error event
  ok('#15 runner: runner_unavailable → emit error 事件',
    /emit\(\s*'error'[\s\S]{0,200}runner_unavailable/.test(runnerCode));

  // 16) Step contains label/status/text
  ok('#16 runner: step 事件含 label + status + text',
    /emit\(\s*'step'[\s\S]{0,100}label[\s\S]{0,100}status[\s\S]{0,100}text/.test(runnerCode));

  // 17) Delta can appear multiple times
  ok('#17 runner: delta 事件可多次 emit (循环内 emit delta)',
    /for\s*\(.*chunk.*\)[\s\S]{0,200}emit\(\s*'delta'/.test(runnerCode));

  // 18) Done contains final message
  ok('#18 runner: done 事件含 message (role + content)',
    /emit\(\s*'done'[\s\S]{0,200}message[\s\S]{0,200}role[\s\S]{0,200}content/.test(runnerCode));

  // 19) Error contains friendly Chinese
  ok('#19 runner: error 事件含友好中文 (请稍后再试)',
    /emit\(\s*'error'[\s\S]{0,300}请稍后再试/.test(runnerCode));

  // 20) No raw stdout/JSONL/token exposure in runner stream output
  ok('#20 runner: stream 不暴露 raw stdout/JSONL/token',
    !/emit\([\s\S]{0,100}(stdout|jsonl|scrollback|Bearer\s+[A-Za-z0-9]{10,})/.test(runnerCode));

  // ============================================================
  // [3] Live stream SSE verification
  // ============================================================
  section('3) Live stream SSE 验证');

  // Make a real stream request and verify SSE events
  const rLive = await req({
    path: '/api/mobile/agent/stream', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: '测试流式响应' }));
  ok('#3a live stream 200', rLive.status === 200, 'status=' + rLive.status);
  ok('#3b live stream Content-Type: text/event-stream',
    /text\/event-stream/.test(rLive.headers['content-type'] || ''));
  ok('#3c live stream body 含 event: start',
    /event:\s*start/.test(rLive.body));
  ok('#3d live stream body 含 event: session',
    /event:\s*session/.test(rLive.body));
  ok('#3e live stream body 含 event: step',
    /event:\s*step/.test(rLive.body));
  ok('#3f live stream body 含 event: delta',
    /event:\s*delta/.test(rLive.body));
  ok('#3g live stream body 含 event: done',
    /event:\s*done/.test(rLive.body));
  ok('#3h live stream body 不含 raw stdout/JSONL/token',
    !/(jsonl|scrollback|Bearer\s+[A-Za-z0-9]{10,})/i.test(rLive.body));

  // ============================================================
  // [4] Frontend stream (code-level checks on public/mobile/mobile.js)
  // ============================================================
  section('4) Frontend stream (public/mobile/mobile.js)');

  // 21) Home Send prioritizes /api/mobile/agent/stream
  ok('#21 mobile.js: doSend 优先调用 doSendStream',
    /doSendStream\s*\(/.test(js) && /await\s+doSendStream\s*\(/.test(js));

  // 22) Uses fetch ReadableStream
  ok('#22 mobile.js: doSendStream 使用 fetch ReadableStream (getReader)',
    /getReader\s*\(/.test(js));

  // 23) Parses SSE
  ok('#23 mobile.js: 有 parseSSEEvent 函数',
    /function\s+parseSSEEvent\s*\(/.test(js));

  // 24) Creates assistant bubble on start
  ok('#24 mobile.js: doSend 创建 pendingAssistant bubble',
    /pendingAssistant\s*=\s*\{[\s\S]{0,300}role:\s*['"]assistant['"]/.test(js));

  // 25) Step updates same bubble
  ok('#25 mobile.js: handleStreamEvent step 更新 pendingAssistant.trace',
    /handleStreamEvent[\s\S]{0,500}case\s+'step'[\s\S]{0,500}pendingAssistant\.trace/.test(js));

  // 26) Delta appends to same bubble
  ok('#26 mobile.js: handleStreamEvent delta 追加到 pendingAssistant._streamDelta',
    /handleStreamEvent[\s\S]{0,2000}case\s+'delta'[\s\S]{0,500}pendingAssistant\._streamDelta/.test(js));

  // 27) Done completes same bubble
  ok('#27 mobile.js: handleStreamEvent done 完成 pendingAssistant',
    /handleStreamEvent[\s\S]{0,2000}case\s+'done'[\s\S]{0,500}pendingAssistant\.status\s*=\s*['"]done['"]/.test(js));

  // 28) Error writes to same bubble
  ok('#28 mobile.js: handleStreamEvent error 写入 pendingAssistant.content',
    /handleStreamEvent[\s\S]{0,2000}case\s+'error'[\s\S]{0,500}pendingAssistant\.content/.test(js));

  // 29) No second textarea created
  ok('#29 mobile.js: 不创建第二个 textarea',
    !/document\.createElement\(\s*['"]textarea['"]\s*\)/.test(js));

  // 30) No second Send button
  ok('#30 mobile.js: 不创建第二个 Send 按钮',
    !/document\.createElement\(\s*['"]button['"]\s*\)[\s\S]{0,200}send/i.test(js));

  // 31) No multiple assistant status bubbles
  ok('#31 mobile.js: 不创建多个 assistant status bubble',
    (js.match(/home-status-pill/g) || []).length > 0 &&
    !/createElement[\s\S]{0,100}status-pill/.test(js));

  // 32) Switch Agent aborts stream (S._streamAbort)
  ok('#32 mobile.js: switchAgent 中止 S._streamAbort',
    /switchAgent[\s\S]{0,500}S\._streamAbort[\s\S]{0,100}\.abort\(\)/.test(js));

  // 33) New Chat aborts stream
  ok('#33 mobile.js: newChat 中止 S._streamAbort',
    /function\s+newChat\s*\([\s\S]{0,500}S\._streamAbort[\s\S]{0,100}\.abort\(\)/.test(js));

  // 34) Fallback to /api/mobile/agent/send exists
  ok('#34 mobile.js: doSendFallback 函数存在',
    /function\s+doSendFallback\s*\(/.test(js));
  ok('#34a mobile.js: doSendFallback 调用 /api/mobile/agent/send',
    /doSendFallback[\s\S]{0,500}\/api\/mobile\/agent\/send/.test(js));

  // ============================================================
  // [5] UI CSS (code-level checks on public/mobile/mobile.css)
  // ============================================================
  section('5) UI CSS (public/mobile/mobile.css)');

  // 35) Has .stream-steps
  ok('#35 CSS: .stream-steps 存在',
    /\.stream-steps\s*\{/.test(css));

  // 36) Has .stream-step.is-running
  ok('#36 CSS: .stream-step.is-running 存在',
    /\.stream-step\.is-running/.test(css));

  // 37) Has .stream-step.is-done
  ok('#37 CSS: .stream-step.is-done 存在',
    /\.stream-step\.is-done/.test(css));

  // 38) Has .stream-step.is-failed
  ok('#38 CSS: .stream-step.is-failed 存在',
    /\.stream-step\.is-failed/.test(css));

  // 39) No raw JSON display
  ok('#39 CSS: 不含 raw JSON 显示样式 (无 .raw-json / .json-output)',
    !/\.(raw-json|json-output|json-display)\s*\{/.test(css));

  // 40) No stack trace display
  ok('#40 CSS: 不含 stack trace 显示样式 (无 .stack-trace / .trace-display)',
    !/\.(stack-trace|trace-display|error-trace)\s*\{/.test(css));

  // 41) No spawn ENOENT display
  ok('#41 CSS: 不含 spawn ENOENT 显示样式',
    !/\.(spawn-error|enoent-display)\s*\{/.test(css));

  // 42) No horizontal scroll (overflow-x: hidden on html/body)
  ok('#42 CSS: html/body overflow-x: hidden',
    /overflow-x\s*:\s*hidden/.test(css));

  // ============================================================
  // [6] Skill integration
  // ============================================================
  section('6) Skill integration');

  // 43) Selected skill → stream payload includes skillId
  ok('#43 mobile.js: doSendStream payload 含 skillId',
    /doSendStream[\s\S]{0,500}skillId/.test(js));

  // 44) Stream step shows Skill usage
  ok('#44 runner: step 事件显示 Skill 使用 (使用 Skill)',
    /emit\(\s*'step'[\s\S]{0,200}使用 Skill/.test(runnerCode));

  // 45) Skill only affects current turn (not persisted in session state)
  ok('#45 mobile.js: skill 不持久锁定 (selectedSkill 仅在 doSend 内使用)',
    !/S\.currentSkill\s*=\s*selectedSkill/.test(js) ||
    /S\.currentSkill\s*=\s*null/.test(js));

  // 46) After send, skill not permanently locked
  ok('#46 mobile.js: 发送后 skill 不永久锁定 (newChat 清空 currentSkill)',
    /newChat[\s\S]{0,500}S\.currentSkill\s*=\s*null/.test(js));

  // ============================================================
  // [7] Security (禁止项)
  // ============================================================
  section('7) Security (禁止项)');

  // 47) No Delete operation
  ok('#47 stream endpoint 不暴露 Delete 操作',
    !/body\.delete\s*[=:]/i.test(mobileJsCode) &&
    !/\/api\/mobile\/(delete|file-delete)/i.test(js));

  // 48) No Move operation
  ok('#48 stream endpoint 不暴露 Move 操作',
    !/body\.move\s*[=:]/i.test(mobileJsCode) &&
    !/\/api\/mobile\/(move|file-move)/i.test(js));

  // 49) No Rename operation
  ok('#49 stream endpoint 不暴露 Rename 操作',
    !/body\.rename\s*[=:]/i.test(mobileJsCode) &&
    !/\/api\/mobile\/(rename|file-rename)/i.test(js));

  // 50) No Upload operation
  ok('#50 stream endpoint 不暴露 Upload 操作',
    !/body\.upload\s*[=:]/i.test(mobileJsCode) &&
    !/\/api\/mobile\/(upload|file-upload)/i.test(js));

  // 51) No shell:true
  ok('#51 stream endpoint 不使用 shell:true',
    !/shell\s*:\s*true/.test(mobileJsCode));

  // 52) No pty input
  ok('#52 stream endpoint 不接受 pty 输入',
    !/body\.(pty|stdin|terminal)\s*[=:]/i.test(mobileJsCode));

  // 53) No token/cookie/API key exposure
  ok('#53 stream 响应不含 token/cookie/API key',
    !/(Bearer\s+[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{8,}|apiKey\s*[:=])/.test(rStream1.body));

  // 54) No claudeSession/codexSession exposure
  ok('#54 stream 响应不含 claudeSession/codexSession',
    !/(claudeSession|codexSession|opencodeSession)/.test(rStream1.body));

  section('DONE');
  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
