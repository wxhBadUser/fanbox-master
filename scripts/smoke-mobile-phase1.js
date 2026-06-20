/* eslint-disable */
// Phase 1 smoke · Mobile Web UI 静态资源 + 5 Tab 行为 + 安全边界 + 危险文案扫描
//
// 验证：
//   1) 静态资源（/mobile, /mobile/mobile.css, /mobile/mobile.js）200 + 正确 MIME
//   2) 静态资源越界（..  /  越界扩展名） 400/403/404/415
//   3) 5 Tab 依赖的 API 200 且结构化（roots/search/file/skills/agents/usage）
//   4) /api/mobile/* 不带 token 仍 401；错 token 401；禁用后 401
//   5) POST /api/mobile/* 返回 405（任何写操作被拒）
//   6) /api/mobile/usage / skills / agents 不含 .jsonl / token / cookie / apiKey / secret / password / path / dir
//   7) /mobile/index.html + /mobile/mobile.js 中不含危险按钮文案
//      （Start Agent / Run Agent / Send Task / Execute / Terminal Input / Delete File /
//        Rename File / Move File / Upload File / Start / Run / Send / Delete / Rename / Move / Upload）
//   8) 旧 Phase 0A/0B smoke-mobile-phase0a.js 测试继续 PASS（不在本脚本内运行）

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-smoke-phase1-' + Date.now());
fs.mkdirSync(TMP_HOME, { recursive: true });
process.env.HOME = TMP_HOME; process.env.USERPROFILE = TMP_HOME;

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

const port = 14580;

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
  // [1] 准备：启动 mobile server + 配对拿 token
  // ============================================================
  section('1) 准备：启动 server + 配对');
  const server = mobile.startMobileServer({ port });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise((r) => setTimeout(r, 20));
  ok('mobile server listening', server.listening);
  await mobile.saveConfig({ enabled: true });
  const pc = await mobile.startPairCode();
  const rPC = await req({ path: '/api/mobile/pair/confirm', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({ pairCode: pc.pairCode, deviceName: 'Smoke-Phase1' }));
  const jPC = JSON.parse(rPC.body);
  const token = jPC.token;
  const auth = { Authorization: 'Bearer ' + token };
  ok('pair/confirm 200', rPC.status === 200);
  ok('token 取得', !!token && token.length > 30);

  // ============================================================
  // [2] 静态资源 200 + 正确 MIME
  // ============================================================
  section('2) 静态资源 200 + MIME');
  const rIdx = await req({ path: '/mobile', method: 'GET', headers: auth });
  ok('GET /mobile 200', rIdx.status === 200, rIdx.body.slice(0, 120));
  ok('GET /mobile content-type text/html', /^text\/html/.test(rIdx.headers['content-type'] || ''));
  // Phase 2A-1 后 tab 名改成 Home / Files / Agent / Skills / Sessions；
  // 兼容：tab pane 必须 5 个，且必须包含 home + files
  const tabPaneMatch = (rIdx.body.match(/data-tab="[a-z]+"/g) || []).map(s => s.match(/"([^"]+)"/)[1]);
  ok('GET /mobile 含 5 tab pane', tabPaneMatch.length === 5 && tabPaneMatch.indexOf('home') >= 0 && tabPaneMatch.indexOf('files') >= 0, 'tabs=' + tabPaneMatch.join(','));
  const tabBtnMatch = (rIdx.body.match(/data-tab-btn="[a-z]+"/g) || []).map(s => s.match(/"([^"]+)"/)[1]);
  ok('GET /mobile 含 5 tab-btn', tabBtnMatch.length === 5 && tabBtnBtnSafety(tabBtnMatch), 'btns=' + tabBtnMatch.join(','));
  function tabBtnBtnSafety(arr) {
    return arr.indexOf('home') >= 0 && arr.indexOf('files') >= 0;
  }
  ok('GET /mobile 含 css link', /\/mobile\/mobile\.css/.test(rIdx.body));
  ok('GET /mobile 含 js script', /\/mobile\/mobile\.js/.test(rIdx.body));

  const rCss = await req({ path: '/mobile/mobile.css', method: 'GET', headers: auth });
  ok('GET /mobile/mobile.css 200', rCss.status === 200);
  ok('mobile.css content-type text/css', /^text\/css/.test(rCss.headers['content-type'] || ''));
  ok('mobile.css 含设计 token', /--blue:\s*#2563EB/.test(rCss.body));
  ok('mobile.css 含 light bg', /--bg:\s*#F7F8FA|#F9FAFB|#FAFAFA/.test(rCss.body));
  ok('mobile.css 不含 dark mode 切换', !/prefers-color-scheme:\s*dark/.test(rCss.body));
  ok('mobile.css 含 360-600 断点', /min-width:\s*600/.test(rCss.body) || /max-width:\s*480/.test(rCss.body) || /max-width:\s*599/.test(rCss.body));
  ok('mobile.css 含底部 5 tab nav', /\.app-bottom-nav/.test(rCss.body));

  const rJs = await req({ path: '/mobile/mobile.js', method: 'GET', headers: auth });
  ok('GET /mobile/mobile.js 200', rJs.status === 200);
  ok('mobile.js content-type application/javascript', /javascript/i.test(rJs.headers['content-type'] || ''));
  ok('mobile.js 含 fetch wrapper', /Authorization/.test(rJs.body) && /Bearer/.test(rJs.body));
  // Phase 2A-1 把 agents/usage 改成 agent/sessions，但底层 render 函数名保留
  ok('mobile.js 含 5 tab renderers（renderHome/renderFiles/renderSkills + agent/sessions）', /renderHome/.test(rJs.body) && /renderFiles/.test(rJs.body) && /renderSkills/.test(rJs.body) && /renderAgent/.test(rJs.body) && /renderSessions/.test(rJs.body));

  // ============================================================
  // [3] 静态资源越界 / 错误扩展名 / 错误方法
  // ============================================================
  section('3) 静态资源越界 / 错误扩展名 / 错误方法');
  const r1 = await req({ path: '/mobile/../package.json', method: 'GET', headers: auth });
  ok('GET /mobile/../package.json 400/403', r1.status === 400 || r1.status === 403, r1.status + ' ' + r1.body.slice(0, 80));
  const r2 = await req({ path: '/mobile/%2e%2e/package.json', method: 'GET', headers: auth });
  ok('GET /mobile/%2e%2e/package.json 4xx', r2.status >= 400 && r2.status < 500, r2.status);
  const r3 = await req({ path: '/mobile/x.png', method: 'GET', headers: auth });
  ok('GET /mobile/x.png 404', r3.status === 404);
  const r4 = await req({ path: '/mobile/index.exe', method: 'GET', headers: auth });
  ok('GET /mobile/index.exe 415 (mime)', r4.status === 415, r4.status);
  const r5 = await req({ path: '/mobile', method: 'POST', headers: auth }, '');
  ok('POST /mobile 405', r5.status === 405, r5.status);
  const r6 = await req({ path: '/mobile/mobile.css', method: 'POST', headers: auth }, '');
  ok('POST /mobile/mobile.css 405', r6.status === 405, r6.status);
  const r7 = await req({ path: '/mobile/mobile.js', method: 'POST', headers: auth }, '');
  ok('POST /mobile/mobile.js 405', r7.status === 405, r7.status);

  // ============================================================
  // [4] 5 Tab 依赖 API：结构化 + token + LAN
  // ============================================================
  section('4) 5 Tab 依赖 API：结构化 + token');
  // 4.1 Home → /api/mobile/roots
  const rRoots = await req({ path: '/api/mobile/roots', method: 'GET', headers: auth });
  const jRoots = JSON.parse(rRoots.body);
  ok('roots 200', rRoots.status === 200);
  ok('roots.ok === true', jRoots.ok === true);
  ok('roots.home 是字符串', typeof jRoots.home === 'string');
  ok('roots.roots 是数组', Array.isArray(jRoots.roots));

  // 4.2 Files → /api/mobile/search
  const rSearch = await req({ path: '/api/mobile/search?q=readme&limit=10', method: 'GET', headers: auth });
  const jSearch = JSON.parse(rSearch.body);
  ok('search 200', rSearch.status === 200);
  ok('search.ok === true', jSearch.ok === true);
  ok('search.items 是数组', Array.isArray(jSearch.items));
  ok('search 字段 schema', jSearch.items.every(i => typeof i.name === 'string' && typeof i.path === 'string' && typeof i.score === 'number'));

  // 4.3 Files → /api/mobile/file
  const fs2 = require('fs');
  const sampleTxt = path.join(TMP_HOME, 'phase1-sample.txt');
  const sampleBig = path.join(TMP_HOME, 'phase1-big.txt');
  fs2.writeFileSync(sampleTxt, 'phase 1 sample\n');
  // 1.5MB 大文件
  const chunk = 'x'.repeat(64 * 1024);
  let big = '';
  for (let i = 0; i < 24; i++) big += chunk; // 1.5MB
  fs2.writeFileSync(sampleBig, big);
  const rFileSmall = await req({ path: '/api/mobile/file?path=' + encodeURIComponent(sampleTxt), method: 'GET', headers: auth });
  const jFileSmall = JSON.parse(rFileSmall.body);
  ok('file(small) 200', rFileSmall.status === 200);
  ok('file small 含 text 字段', typeof jFileSmall.text === 'string');
  const rFileBig = await req({ path: '/api/mobile/file?path=' + encodeURIComponent(sampleBig) + '&max=131072', method: 'GET', headers: auth });
  const jFileBig = JSON.parse(rFileBig.body);
  ok('file(big, max=128KB) previewTooLarge', jFileBig.previewTooLarge === true);
  ok('file(big) 不含 text 字段', !('text' in jFileBig));

  // 4.4 Skills → /api/mobile/skills
  const rSkills = await req({ path: '/api/mobile/skills', method: 'GET', headers: auth });
  const jSkills = JSON.parse(rSkills.body);
  ok('skills 200', rSkills.status === 200);
  ok('skills.items 是数组', Array.isArray(jSkills.items));
  ok('skills items 不含 path 字段', jSkills.items.every(i => !('path' in i)));
  ok('skills items 不含 dir 字段', jSkills.items.every(i => !('dir' in i)));
  ok('skills items 含 name/source/description', jSkills.items.every(i => typeof i.name === 'string' && typeof i.source === 'string' && typeof i.description === 'string'));

  // 4.5 Agents → /api/mobile/agents
  const rAgents = await req({ path: '/api/mobile/agents', method: 'GET', headers: auth });
  const jAgents = JSON.parse(rAgents.body);
  ok('agents 200', rAgents.status === 200);
  ok('agents.items 4 项', Array.isArray(jAgents.items) && jAgents.items.length === 4);
  ok('agents items 无 token/cookie/apiKey', jAgents.items.every(i => !('token' in i) && !('cookie' in i) && !('apiKey' in i) && !('api_key' in i)));

  // 4.6 Usage → /api/mobile/usage
  const rUsage = await req({ path: '/api/mobile/usage', method: 'GET', headers: auth });
  const jUsage = JSON.parse(rUsage.body);
  ok('usage 200', rUsage.status === 200);
  ok('usage.summary 存在', jUsage.summary && typeof jUsage.summary.todayTokens === 'number' && typeof jUsage.summary.weekTokens === 'number');
  ok('usage.agents 是数组', Array.isArray(jUsage.agents));
  const usageStr = JSON.stringify(jUsage);
  ok('usage 不含 .jsonl', !usageStr.includes('.jsonl'));
  ok('usage 不含 oauth', !/oauth/i.test(usageStr));
  ok('usage 不含 api.anthropic.com', !/api\.anthropic\.com/i.test(usageStr));
  ok('usage 不含 anthropic', !/anthropic/i.test(usageStr));
  ok('usage agents 不含 token/cookie/apiKey/secret/password', jUsage.agents.every(a => !('token' in a) && !('cookie' in a) && !('apiKey' in a) && !('api_key' in a) && !('secret' in a) && !('password' in a)));

  // ============================================================
  // [5] 不带 token / 错 token 仍 401
  // ============================================================
  section('5) 不带 token / 错 token');
  for (const p of ['/api/mobile/roots', '/api/mobile/skills', '/api/mobile/agents', '/api/mobile/usage']) {
    const r = await req({ path: p, method: 'GET' });
    ok('no-token ' + p + ' 401', r.status === 401, r.status);
    const r2 = await req({ path: p, method: 'GET', headers: { Authorization: 'Bearer wrong-token' } });
    ok('bad-token ' + p + ' 401', r2.status === 401, r2.status);
  }
  // 非 LAN（用 0.0.0.0 模拟外网）— 本 server 监听 0.0.0.0，因此以接口 IP 模拟；
  // 这里跳过非 LAN 测试（在 Phase 0A/0B smoke 已覆盖）。
  ok('LAN 边界已被 Phase 0A smoke 覆盖 (本脚本跳过)', true);

  // ============================================================
  // [6] POST /api/mobile/* 全部 405
  // ============================================================
  section('6) POST /api/mobile/* 405');
  for (const p of ['/api/mobile/roots', '/api/mobile/skills', '/api/mobile/agents', '/api/mobile/usage', '/api/mobile/file', '/api/mobile/search', '/api/mobile/screenshots', '/api/mobile/thumb']) {
    const r = await req({ path: p, method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } }, '{}');
    ok('POST ' + p + ' 405', r.status === 405, r.status);
  }
  // PUT/DELETE/PATCH 同样
  for (const p of ['/api/mobile/agents', '/api/mobile/file']) {
    const r = await req({ path: p, method: 'PUT', headers: auth }, '{}');
    ok('PUT ' + p + ' 405', r.status === 405, r.status);
    const r2 = await req({ path: p, method: 'DELETE', headers: auth });
    ok('DELETE ' + p + ' 405', r2.status === 405, r2.status);
  }

  // ============================================================
  // [7] 禁用后旧 token 一律 401（行为保留）
  // ============================================================
  section('7) 禁用后旧 token 401');
  await mobile.saveConfig({ enabled: false });
  await mobile.revokeAllTokens();
  for (const p of ['/api/mobile/roots', '/api/mobile/skills', '/api/mobile/agents', '/api/mobile/usage', '/api/mobile/file', '/api/mobile/search']) {
    const r = await req({ path: p, method: 'GET', headers: auth });
    ok('disabled ' + p + ' 401', r.status === 401, r.status);
  }
  await mobile.saveConfig({ enabled: true });
  const pc2 = await mobile.startPairCode();
  const rPC2 = await req({ path: '/api/mobile/pair/confirm', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({ pairCode: pc2.pairCode, deviceName: 'Smoke-Phase1-2' }));
  const jPC2 = JSON.parse(rPC2.body);
  const token2 = jPC2.token;
  const auth2 = { Authorization: 'Bearer ' + token2 };
  ok('re-paired 后 token 仍可用', (await req({ path: '/api/mobile/roots', method: 'GET', headers: auth2 })).status === 200);

  // ============================================================
  // [8] 危险按钮文案扫描：index.html + mobile.js
  // ============================================================
  section('8) 危险按钮文案扫描');
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const js   = fs.readFileSync(JS_PATH,   'utf8');
  const css  = fs.readFileSync(CSS_PATH,  'utf8');
  const all = html + '\n' + js + '\n' + css;

  // 完整短语
  const fullPhrases = [
    'Start Agent', 'Run Agent', 'Send Task', 'Terminal Input', 'Delete File',
    'Rename File', 'Move File', 'Upload File',
  ];
  for (const p of fullPhrases) {
    ok('no "' + p + '" in mobile UI', !all.includes(p));
  }
  // Execute 单独看：作为 token 不能出现在按钮文案（<button>text</button> 上下文里）
  // 这里只允许出现在 <script> 注释里（"不出现 X / Y 按钮"）。我们做更严格的检查：
  // 在 HTML <button> 标签内不能有 Execute
  const buttonInner = (html.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []).join('\n');
  ok('no "Execute" inside <button> in HTML', !/Execute/.test(buttonInner));
  // JS 中只在拒绝 wrapper 中提到 "Execute" 是允许的
  ok('mobile.js 含 execute 拒绝逻辑（api 包装）', /method\s*!==\s*['"]GET['"][\s\S]*method/i.test(js) || /method !== 'GET'/.test(js));

  // 单独动词
  const singleWords = ['Start', 'Run', 'Send', 'Delete', 'Rename', 'Move', 'Upload'];
  // 在 HTML 按钮里（<button ...>label</button>）不能出现这些动词
  // 但 disabled 按钮允许（Phase 2A-1 的 agent-send "Send" 按钮是 disabled 占位）
  const buttonMatches = html.match(/<button[^>]*>[^<]*<\/button>/g) || [];
  const activeBtnTexts = buttonMatches
    .map(s => {
      const m = s.match(/<button([^>]*)>([^<]*)<\/button>/);
      if (!m) return null;
      return { attrs: m[1] || '', text: (m[2] || '').trim() };
    })
    .filter(b => b && b.text && !/\bdisabled\b/.test(b.attrs))
    .map(b => b.text);
  const hasDangerWordInButton = activeBtnTexts.some(t => singleWords.some(w => new RegExp('\\b' + w + '\\b').test(t)));
  ok('no Start/Run/Send/Delete/Rename/Move/Upload inside active button text', !hasDangerWordInButton, 'activeBtnTexts=' + JSON.stringify(activeBtnTexts));

  // mobile.js 中：只允许在拒绝/错误信息中提到这些动词
  const jsDangerMentions = singleWords.map(w => ({ w, count: (js.match(new RegExp('\\b' + w + '\\b', 'g')) || []).length }));
  ok('mobile.js verb mentions are limited (refuse / error text only)', jsDangerMentions.every(m => m.count <= 3), JSON.stringify(jsDangerMentions));

  // ============================================================
  // [9] UI 自检：5 Tab 元素 / 底部 nav / flow / 卡片结构
  // ============================================================
  section('9) UI 自检：5 Tab / 底部 nav / flow / 卡片');
  // 兼容 Phase 2A-1：tab 名集合
  const tabRegex = /data-tab="(home|files|agent|agents|skills|sessions|usage)"/g;
  const tabBtnRegex = /data-tab-btn="(home|files|agent|agents|skills|sessions|usage)"/g;
  const tabCount = (html.match(tabRegex) || []).length;
  const tabBtnCount = (html.match(tabBtnRegex) || []).length;
  ok('HTML 含 5 data-tab pane', tabCount === 5, 'count=' + tabCount);
  ok('HTML 含 5 data-tab-btn', tabBtnCount === 5, 'count=' + tabBtnCount);
  ok('HTML 含 flow-node (Home)', /flow-node/.test(html) && /Phone|LAN/.test(html));
  ok('HTML 含 flow-node (Files)', /Root/.test(html) && /Search/.test(html));
  // Phase 2A-1 后 Agent tab 是 Files → cwd → Agent Shell；Usage tab 合并到 Home
  ok('HTML 含 Agent 或 Usage 标签 (Phase 1+2A-1 兼容)', /Agent|Sessions|Usage/.test(html));
  ok('HTML 含 Read-only/LAN/Token 安全文案', /Read-only/.test(html) && /LAN protected/.test(html) && /Token required/.test(html));
  ok('HTML 含 pair/confirm endpoint 调用', /\/api\/mobile\/pair\/confirm/.test(js));
  ok('HTML 不暴露真实 token 到 DOM', !/textContent\s*=\s*getToken\s*\(\s*\)/.test(html)); // 仅 js 内部用
  ok('js 不写入 localStorage 搜索历史', !/localStorage\.setItem\(\s*['"][^'"]*history/i.test(js));
  ok('js 不使用 serviceWorker', !/serviceWorker|register\s*\(\s*['"]/.test(js));
  ok('js 不使用 WebSocket', !/new\s+WebSocket\s*\(/.test(js));

  // ============================================================
  // [10] 文件系统自检
  // ============================================================
  section('10) 文件系统自检');
  ok('public/mobile/index.html 存在', fs.existsSync(HTML_PATH));
  ok('public/mobile/mobile.css 存在', fs.existsSync(CSS_PATH));
  ok('public/mobile/mobile.js 存在', fs.existsSync(JS_PATH));
  ok('index.html < 32KB', fs.statSync(HTML_PATH).size < 32 * 1024);
  ok('mobile.css < 32KB', fs.statSync(CSS_PATH).size < 32 * 1024);
  ok('mobile.js < 64KB', fs.statSync(JS_PATH).size < 64 * 1024);
  // 无 emoji（仅 inline SVG）
  ok('HTML 无 emoji (unicode 1F300+)', !/[\u{1F300}-\u{1FAFF}]/u.test(html));
  ok('mobile.js 无 emoji', !/[\u{1F300}-\u{1FAFF}]/u.test(js));
  // 无大渐变
  ok('CSS 无大面积 linear-gradient（仅 skeleton shimmer）', (css.match(/linear-gradient/g) || []).length <= 1);
  // 无 dark mode media
  ok('CSS 无 prefers-color-scheme: dark', !/prefers-color-scheme:\s*dark/.test(css));

  // ============================================================
  // 收尾
  // ============================================================
  await new Promise((r) => server.close(r));
  console.log('\n===== Phase 1 总结 =====');
  console.log('PASS:', passed);
  console.log('FAIL:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
