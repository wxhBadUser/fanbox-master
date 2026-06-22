/* eslint-disable */
/**
 * FanBox Mobile · Phase UI-A8-7 smoke
 * Projects API + Frontend + Run Timeline + Security
 *
 * 覆盖：
 *   - Backend /api/mobile/projects (200/401/405, schema, groups, roots)
 *   - Frontend Project page (loadAllProjects, openProjectInChat, continueProjectSession, renderProjectCard)
 *   - Codex-like Run Timeline (runner events, handleStreamEvent, CSS classes)
 *   - Security (no Delete/Move/Rename/Upload, no shell:true, no pty, no token leak)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-smoke-projects-' + Date.now());
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
const CSS_PATH  = path.join(PUBLIC_MOBILE, 'mobile.css');
const JS_PATH   = path.join(PUBLIC_MOBILE, 'mobile.js');
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
  }, JSON.stringify({ pairCode: pc.pairCode, deviceName: 'Smoke-UI-A8-7' }));
  const jPC = JSON.parse(rPC.body);
  const token = jPC.token;
  const auth = { Authorization: 'Bearer ' + token };
  ok('pair/confirm 200', rPC.status === 200);
  ok('token 取得', !!token && token.length > 30);

  // ============================================================
  // [1] Backend /api/mobile/projects
  // ============================================================
  section('1) Backend /api/mobile/projects');

  // 1) GET /api/mobile/projects returns 200 with valid token
  const rProj = await req({
    path: '/api/mobile/projects', method: 'GET', headers: auth,
  });
  ok('#1 GET /api/mobile/projects 200', rProj.status === 200, 'status=' + rProj.status);
  const jProj = JSON.parse(rProj.body);

  // 2) Response has ok=true
  ok('#2 Response ok=true', jProj.ok === true);

  // 3) Response has items array
  ok('#3 Response has items array', Array.isArray(jProj.items));

  // 4) Response has groups object with recent7d and recent30d arrays
  ok('#4 Response has groups.recent7d array', jProj.groups && Array.isArray(jProj.groups.recent7d));
  ok('#4b Response has groups.recent30d array', jProj.groups && Array.isArray(jProj.groups.recent30d));

  // 5) No token → 401
  const rNoAuth = await req({
    path: '/api/mobile/projects', method: 'GET',
  });
  ok('#5 No token → 401', rNoAuth.status === 401, 'status=' + rNoAuth.status);

  // 6) Bad token → 401
  const rBadAuth = await req({
    path: '/api/mobile/projects', method: 'GET',
    headers: { Authorization: 'Bearer WRONG_TOKEN_XYZ' },
  });
  ok('#6 Bad token → 401', rBadAuth.status === 401, 'status=' + rBadAuth.status);

  // 7) POST method → 405
  const rPost = await req({
    path: '/api/mobile/projects', method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  }, JSON.stringify({}));
  ok('#7 POST method → 405', rPost.status === 405, 'status=' + rPost.status);

  // 8) Items have required fields
  if (jProj.items && jProj.items.length > 0) {
    const item = jProj.items[0];
    ok('#8a Item has id', 'id' in item);
    ok('#8b Item has name', 'name' in item);
    ok('#8c Item has cwd', 'cwd' in item);
    ok('#8d Item has cwdLabel', 'cwdLabel' in item);
    ok('#8e Item has source', 'source' in item);
    ok('#8f Item has agents', 'agents' in item && Array.isArray(item.agents));
    ok('#8g Item has lastActiveAt', 'lastActiveAt' in item);
    ok('#8h Item has sessionCount', 'sessionCount' in item);
  } else {
    // Even with no items, verify backend code registers the fields
    ok('#8a Item has id (code-level)', /items\.push\(\{[\s\S]*?id:/.test(mobileJsCode));
    ok('#8b Item has name (code-level)', /items\.push\(\{[\s\S]*?name:/.test(mobileJsCode));
    ok('#8c Item has cwd (code-level)', /items\.push\(\{[\s\S]*?cwd:/.test(mobileJsCode));
    ok('#8d Item has cwdLabel (code-level)', /items\.push\(\{[\s\S]*?cwdLabel:/.test(mobileJsCode));
    ok('#8e Item has source (code-level)', /items\.push\(\{[\s\S]*?source,/.test(mobileJsCode));
    ok('#8f Item has agents (code-level)', /items\.push\(\{[\s\S]*?agents:/.test(mobileJsCode));
    ok('#8g Item has lastActiveAt (code-level)', /items\.push\(\{[\s\S]*?lastActiveAt:/.test(mobileJsCode));
    ok('#8h Item has sessionCount (code-level)', /items\.push\(\{[\s\S]*?sessionCount:/.test(mobileJsCode));
  }

  // 9) Source values are valid
  const validSources = ['desktop-project', 'session-index', 'root'];
  if (jProj.items && jProj.items.length > 0) {
    const allValid = jProj.items.every(i => validSources.includes(i.source));
    ok('#9 Source values are valid', allValid, 'found: ' + [...new Set((jProj.items || []).map(i => i.source))].join(', '));
  } else {
    ok('#9 Source values valid (code-level: desktop-project)', /'desktop-project'/.test(mobileJsCode));
  }

  // 10) Root fallback workspaces exist — at least some root items with source="root"
  const rootItems = (jProj.items || []).filter(i => i.source === 'root');
  ok('#10a Root fallback items exist (source=root)', rootItems.length > 0, 'root items: ' + rootItems.length);
  ok('#10b Root fallback items have cwd', rootItems.every(i => !!i.cwd), 'all have cwd');
  ok('#10c Root fallback items have cwdLabel', rootItems.every(i => !!i.cwdLabel || !!i.name), 'all have cwdLabel/name');

  // 11) No token/cookie/API key in response
  ok('#11 No token/cookie/API key in response',
    !/(Bearer\s+[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{8,}|apiKey\s*[:=])/.test(JSON.stringify(jProj)));

  // 12) No JSONL path in response
  ok('#12 No JSONL path in response',
    !/\.jsonl/i.test(JSON.stringify(jProj)));

  // 13) No claudeSession/codexSession in response
  ok('#13 No claudeSession/codexSession in response',
    !/(claudeSession|codexSession)/.test(JSON.stringify(jProj)));

  // ============================================================
  // [2] Frontend Project page
  // ============================================================
  section('2) Frontend Project page');

  // 14) mobile.js has loadAllProjects function
  ok('#14 mobile.js has loadAllProjects', /function\s+loadAllProjects\s*\(/.test(js));

  // 15) loadAllProjects calls /api/mobile/projects
  ok('#15 loadAllProjects calls /api/mobile/projects',
    /loadAllProjects[\s\S]{0,2000}\/api\/mobile\/projects/.test(js));

  // 16) mobile.js has openProjectInChat function
  ok('#16 mobile.js has openProjectInChat', /function\s+openProjectInChat\s*\(/.test(js));

  // 17) mobile.js has continueProjectSession function
  ok('#17 mobile.js has continueProjectSession', /function\s+continueProjectSession\s*\(/.test(js));

  // 18) mobile.js has renderProjectCard with project-card-btn-open
  ok('#18 mobile.js renderProjectCard has project-card-btn-open',
    /renderProjectCard[\s\S]{0,2000}project-card-btn-open/.test(js));

  // 19) mobile.js has renderProjectCard with project-card-btn-continue
  ok('#19 mobile.js renderProjectCard has project-card-btn-continue',
    /renderProjectCard[\s\S]{0,2000}project-card-btn-continue/.test(js));

  // 20) CSS has .project-card-actions
  ok('#20 CSS has .project-card-actions', /\.project-card-actions\s*\{/.test(css));

  // 21) CSS has .project-card-btn-open
  ok('#21 CSS has .project-card-btn-open', /\.project-card-btn-open/.test(css));

  // 22) CSS has .project-card-btn-continue
  ok('#22 CSS has .project-card-btn-continue', /\.project-card-btn-continue/.test(css));

  // ============================================================
  // [3] Codex-like Run Timeline
  // ============================================================
  section('3) Codex-like Run Timeline');

  // 23) runner: runMobileAgentStream emits 'thought' event
  ok('#23 runner emits thought event',
    /runMobileAgentStream[\s\S]{0,5000}emit\(\s*['"]thought['"]/.test(runnerCode));

  // 24) runner: runMobileAgentStream emits 'skill' event
  ok('#24 runner emits skill event',
    /runMobileAgentStream[\s\S]{0,5000}emit\(\s*['"]skill['"]/.test(runnerCode));

  // 25) runner: runMobileAgentStream emits 'tool' event
  ok('#25 runner emits tool event',
    /runMobileAgentStream[\s\S]{0,5000}emit\(\s*['"]tool['"]/.test(runnerCode));

  // 26) runner: runMobileAgentStream emits 'command_output' event
  ok('#26 runner emits command_output event',
    /runMobileAgentStream[\s\S]{0,5000}emit\(\s*['"]command_output['"]/.test(runnerCode));

  // 27) mobile.js handleStreamEvent handles 'thought'
  ok('#27 handleStreamEvent handles thought',
    /handleStreamEvent[\s\S]{0,2000}case\s+['"]thought['"]/.test(js));

  // 28) mobile.js handleStreamEvent handles 'skill'
  ok('#28 handleStreamEvent handles skill',
    /handleStreamEvent[\s\S]{0,2000}case\s+['"]skill['"]/.test(js));

  // 29) mobile.js handleStreamEvent handles 'tool'
  ok('#29 handleStreamEvent handles tool',
    /handleStreamEvent[\s\S]{0,2000}case\s+['"]tool['"]/.test(js));

  // 30) mobile.js handleStreamEvent handles 'command_output'
  ok('#30 handleStreamEvent handles command_output',
    /handleStreamEvent[\s\S]{0,4000}case\s+['"]command_output['"]/.test(js));

  // 31) CSS has .run-thinking
  ok('#31 CSS has .run-thinking', /\.run-thinking\s*\{/.test(css));

  // 32) CSS has .run-skill
  ok('#32 CSS has .run-skill', /\.run-skill\s*\{/.test(css));

  // 33) CSS has .run-tools
  ok('#33 CSS has .run-tools', /\.run-tools\s*\{/.test(css));

  // 34) CSS has .run-command
  ok('#34 CSS has .run-command', /\.run-command\s*\{/.test(css));

  // 35) CSS has .run-command-output
  ok('#35 CSS has .run-command-output', /\.run-command-output\s*\{/.test(css));

  // 36) CSS has .run-command-output.is-collapsed (collapsible)
  ok('#36 CSS has .run-command-output.is-collapsed', /\.run-command-output\.is-collapsed/.test(css));

  // 37) CSS has .run-final
  ok('#37 CSS has .run-final', /\.run-final\s*\{/.test(css));

  // 38) mobile.js has .run-thinking rendering
  ok('#38 mobile.js has .run-thinking rendering',
    /run-thinking/.test(js));

  // 39) mobile.js has .run-skill rendering
  ok('#39 mobile.js has .run-skill rendering',
    /run-skill/.test(js));

  // 40) mobile.js has .run-tools rendering
  ok('#40 mobile.js has .run-tools rendering',
    /run-tools/.test(js));

  // 41) mobile.js has .run-command rendering
  ok('#41 mobile.js has .run-command rendering',
    /run-command/.test(js));

  // 42) mobile.js has .run-final rendering
  ok('#42 mobile.js has .run-final rendering',
    /run-final/.test(js));

  // ============================================================
  // [4] Security
  // ============================================================
  section('4) Security');

  // 43) No Delete operation
  ok('#43 No Delete operation in /api/mobile/projects handler',
    !/\/api\/mobile\/projects[\s\S]{0,3000}(DELETE|delete|remove)\s*[:=]/i.test(mobileJsCode));
  ok('#43b No Delete operation in frontend project functions',
    !/(loadAllProjects|openProjectInChat|continueProjectSession|renderProjectCard)[\s\S]{0,2000}\/api\/mobile\/(delete|remove)/i.test(js));

  // 44) No Move operation
  ok('#44 No Move operation in /api/mobile/projects handler',
    !/\/api\/mobile\/projects[\s\S]{0,3000}(move|MOVE)\s*[:=]/i.test(mobileJsCode));
  ok('#44b No Move operation in frontend project functions',
    !/(loadAllProjects|openProjectInChat|continueProjectSession|renderProjectCard)[\s\S]{0,2000}\/api\/mobile\/move/i.test(js));

  // 45) No Rename/Upload
  ok('#45a No Rename in /api/mobile/projects handler',
    !/\/api\/mobile\/projects[\s\S]{0,3000}(rename|RENAME)\s*[:=]/i.test(mobileJsCode));
  ok('#45b No Upload in /api/mobile/projects handler',
    !/\/api\/mobile\/projects[\s\S]{0,3000}(upload|UPLOAD)\s*[:=]/i.test(mobileJsCode));
  ok('#45c No Rename/Upload in frontend project functions',
    !/(loadAllProjects|openProjectInChat|continueProjectSession|renderProjectCard)[\s\S]{0,2000}\/api\/mobile\/(rename|upload)/i.test(js));

  // 46) No shell:true
  ok('#46 No shell:true in runner',
    !/shell\s*:\s*true/.test(runnerCode));

  // 47) No pty input
  ok('#47 No pty input in runner',
    !/pty[\s]*[=:]/i.test(runnerCode));

  // 48) No token/cookie/API key exposure
  ok('#48 No token/cookie/API key exposure in projects response',
    !/(Bearer\s+[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{8,}|apiKey\s*[:=])/.test(JSON.stringify(jProj)));
  ok('#48b No token/cookie/API key exposure in frontend project functions',
    !/(loadAllProjects|openProjectInChat|continueProjectSession|renderProjectCard)[\s\S]{0,2000}(Bearer\s+[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{8,}|apiKey\s*[:=])/.test(js));

  section('DONE');
  console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
