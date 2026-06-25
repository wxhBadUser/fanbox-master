/* eslint-disable */
'use strict';

// ============================================================================
// FanBox Mobile UI Smoke Test — Mobile-Paseo-R1 (Phase D)
// ----------------------------------------------------------------------------
// Harness: in-process mobile server (electron/mobile.js) + plain HTTP fetch of
// the served /mobile HTML/CSS/JS assets + substring/regex assertions against
// the source code + API contract checks against GET /api/mobile/session-hub.
// No jsdom/playwright/puppeteer — the existing harness never used them; the new
// Paseo IA is verified via (a) static source structure (element ids, function
// names, tab bar) and (b) the in-process session-hub projection returning real
// fixture data (a fanbox-master project with a session row).
// Layout assertions (no horizontal overflow at 390×844) use the CSS-grep
// approach: assert html/body enforce overflow-x:hidden AND the new view
// containers use max-width:100% / box-sizing:border-box.
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

// --- TMP_HOME: isolated test HOME so no real user data is touched ----------
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
    console.log('  \u2713 ' + name);
  } else {
    failed++;
    console.log('  \u2717 ' + name + (extra ? ' :: ' + extra : ''));
  }
}
function section(name) { console.log('\n[' + name + ']'); }

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

// True when a project name/cwd looks like a bare drive root (C:\ D:\ E:\) or a
// user-folder project (Downloads / Desktop / Pictures / Documents).
function isDriveRootOrUserFolder(p) {
  if (!p) return false;
  const name = (p.name || '').trim();
  const cwd = (p.cwd || '').trim();
  if (/^[C-Z]:\\?$/.test(name) || /^[C-Z]:\\?$/.test(cwd)) return true;
  if (['Downloads', 'Desktop', 'Pictures', 'Documents', 'Music', 'Videos'].includes(name)) return true;
  return false;
}

async function main() {
  console.log('FanBox Mobile UI Smoke Test — Paseo IA');
  console.log('TMP_HOME=' + TMP_HOME);

  // --- Start in-process server + enable mobile ----------------------------
  await mobile.saveConfig({ enabled: true });
  const server = mobile.startMobileServer({ port });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise(r => setTimeout(r, 20));

  // --- Pair a device + grant scopes (mirror backend verifier) --------------
  const pair = await mobile.startPairCode();
  const pairRes = await request({
    path: '/api/mobile/pair/confirm',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ pairCode: pair.pairCode, deviceName: 'UI Smoke Phone' }));
  const pairData = asJson(pairRes);
  const token = pairData && pairData.token;
  const auth = { Authorization: 'Bearer ' + token };

  // Grant read + session:start so the hub + chat follow-up paths are usable.
  if (pairData && pairData.deviceId && typeof mobile.updateToken === 'function') {
    const tokenHash = mobile.sha256(token);
    await mobile.updateToken(tokenHash, (rec) => {
      rec.scopes = ['read:status', 'read:files', 'session:start', 'desktop_control'];
      return rec;
    });
  }

  // --- Seed fixture: .claude/projects/<munge>/session.jsonl ----------------
  // So GET /api/mobile/session-hub returns a real fanbox-master project with
  // at least one session row. Mirrors verify-mobile-backend-contract.js R2.
  const now = Date.now();
  const fixtureProjectCwd = path.join(TMP_HOME, 'fanbox-master');
  fs.mkdirSync(fixtureProjectCwd, { recursive: true });
  fs.writeFileSync(path.join(fixtureProjectCwd, 'README.md'), '# fanbox\n', 'utf8');

  const claudeProjRoot = path.join(TMP_HOME, '.claude', 'projects');
  fs.mkdirSync(claudeProjRoot, { recursive: true });
  const mungeClaudeDir = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, '-');
  const claudeProjectDir = path.join(claudeProjRoot, mungeClaudeDir(fixtureProjectCwd));
  fs.mkdirSync(claudeProjectDir, { recursive: true });
  const claudeSessionFile = path.join(claudeProjectDir, 'paseo-sess-001.jsonl');
  const claudeSessionContent = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'Fix the auth bug' }, timestamp: new Date(now - 3600000).toISOString(), cwd: fixtureProjectCwd }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu1', name: 'Edit', input: { file_path: path.join(fixtureProjectCwd, 'fix.js') } }] } }),
  ].join('\n') + '\n';
  fs.writeFileSync(claudeSessionFile, claudeSessionContent, 'utf8');
  const fileTime = Math.floor((now - 3600000) / 1000);
  try { fs.utimesSync(claudeSessionFile, fileTime, fileTime); } catch (_) {}

  // Give the projection a moment to pick up the fixture file.
  await new Promise(r => setTimeout(r, 150));

  // --- Fetch static assets + session-hub contract --------------------------
  const htmlRes = await request({ path: '/mobile', method: 'GET' });
  const cssRes = await request({ path: '/mobile/mobile.css', method: 'GET' });
  const jsRes = await request({ path: '/mobile/mobile.js', method: 'GET' });
  const hubRes = await request({ path: '/api/mobile/session-hub', method: 'GET', headers: auth });
  const hubData = asJson(hubRes);
  const html = htmlRes.body;
  const css = cssRes.body;
  const js = jsRes.body;

  // Always read JS from disk too for syntax validation (server-served copy is
  // identical but the filesystem read is what the old harness used).
  const jsOnDisk = fs.readFileSync(path.join(__dirname, '..', 'public', 'mobile', 'mobile.js'), 'utf8');
  const cssOnDisk = fs.readFileSync(path.join(__dirname, '..', 'public', 'mobile', 'mobile.css'), 'utf8');

  // ==========================================================================
  section('A0: Assets + contract baseline');
  // ==========================================================================
  ok('GET /mobile returns 200', htmlRes.status === 200, 'status=' + htmlRes.status);
  ok('GET /mobile/mobile.css returns 200', cssRes.status === 200, 'status=' + cssRes.status);
  ok('GET /mobile/mobile.js returns 200', jsRes.status === 200, 'status=' + jsRes.status);
  ok('GET /api/mobile/session-hub returns 200', hubRes.status === 200, 'status=' + hubRes.status + ' body=' + (hubRes.body || '').substring(0, 200));
  ok('session-hub ok=true', !!(hubData && hubData.ok === true), JSON.stringify(hubData).substring(0, 120));

  // JS parses as valid JavaScript (syntax guard)
  try {
    new Function(jsOnDisk);
    ok('mobile.js parses as valid JavaScript', true);
  } catch (e) {
    ok('mobile.js parses as valid JavaScript', false, e.message);
  }

  // ==========================================================================
  section('P1-Paseo: Sessions hub is the default IA');
  // ==========================================================================

  // (1) Home title is "Sessions" — the sessions-hub view's heading text.
  ok('P1. sessions-hub view exists in HTML', html.includes('data-view="sessions-hub"'), 'missing sessions-hub view');
  ok('P1. hub heading text is "Sessions"',
    /<h1[^>]*class="[^"]*hub-heading[^"]*"[^>]*>\s*Sessions\s*<\/h1>/.test(html),
    'hub heading missing or wrong text');

  // (2) No Home/Safety/Projects/Files/Legacy/Skills as PRIMARY nav. The default
  //     active view must be sessions-hub; the legacy sidebar nav (sb-more-nav)
  //     must be collapsed/hidden, not the primary surface.
  ok('P2. default active view is sessions-hub',
    /<section[^>]*class="view view-sessions is-active"[^>]*data-view="sessions-hub"/.test(html),
    'sessions-hub not default active');
  ok('P2. legacy sidebar nav (sb-more-nav) is collapsed by default',
    html.includes('id="sb-more-nav"') && html.includes('id="sb-more-nav" hidden'),
    'sb-more-nav not hidden');
  ok('P2. Home/Safety/Projects/Files/Skills are inside sb-more-nav (not primary)',
    /id="sb-more-nav"[^]*data-go="home-cockpit"[^]*data-go="safety"[^]*data-go="projects"[^]*data-go="files"[^]*data-go="skills"/.test(html),
    'legacy items not in collapsed nav');

  // (3) Host online status present — #hub-host-name element exists.
  ok('P3. host status element #hub-host-name exists', html.includes('id="hub-host-name"'), 'missing #hub-host-name');
  ok('P3. host online dot element exists', html.includes('id="hub-host-dot"'), 'missing #hub-host-dot');

  // (4) Session list present — #hub-projects container exists AND (with fixture)
  //     the hub returns >=1 project with >=1 session.
  ok('P4. #hub-projects container exists in HTML', html.includes('id="hub-projects"'), 'missing #hub-projects');
  const hubProjects = (hubData && Array.isArray(hubData.projects)) ? hubData.projects : [];
  ok('P4. session-hub returns >=1 project', hubProjects.length >= 1,
    'projects=' + JSON.stringify(hubProjects.map(p => p.name)).substring(0, 120));
  if (hubProjects.length > 0) {
    const projWithSessions = hubProjects.find(p => Array.isArray(p.sessions) && p.sessions.length > 0);
    ok('P4. at least one project has >=1 session row', !!projWithSessions,
      'sessions per project=' + JSON.stringify(hubProjects.map(p => (p.sessions || []).length)));
  } else {
    ok('P4. at least one project has >=1 session row', false, 'no projects returned');
  }

  // (5) Does NOT display C:/D:/E: drive-root projects, nor Downloads/Desktop/
  //     Pictures user-folder projects. The hub endpoint already filters these.
  const driveRootLeaks = hubProjects.filter(isDriveRootOrUserFolder);
  ok('P5. no drive-root / user-folder projects leaked',
    driveRootLeaks.length === 0,
    'leaked=' + JSON.stringify(driveRootLeaks.map(p => ({ name: p.name, cwd: p.cwd }))).substring(0, 200));

  // (6) Session row is clickable — JS renders rows with data-session-id and
  //     wires a click handler that calls openSessionDetail.
  ok('P6. JS renders session rows with data-session-id attr', js.includes('data-session-id'), 'missing data-session-id');
  ok('P6. JS has openSessionDetail function', /function\s+openSessionDetail\s*\(/.test(js), 'missing openSessionDetail');
  ok('P6. JS wires click -> openSessionDetail on session rows',
    /addEventListener\s*\(\s*["']click["'][^]*openSessionDetail/.test(js),
    'no click handler -> openSessionDetail');

  // (7) Opening a session navigates to session-detail — openSessionDetail calls
  //     switchContractView("session-detail").
  ok('P7. openSessionDetail navigates to session-detail view',
    /function\s+openSessionDetail\s*\([^)]*\)\s*\{[^]*switchContractView\s*\(\s*["']session-detail["']/.test(js),
    'openSessionDetail does not switch to session-detail');

  // (8) session-detail has the 4 tabs: Chat, Terminal, Files, Changes.
  ok('P8. session-detail view exists', html.includes('data-view="session-detail"'), 'missing session-detail view');
  ok('P8. tab bar has Chat tab (data-tab="chat")',
    /<button[^>]*class="[^"]*sd-tab[^"]*"[^>]*data-tab="chat"[^>]*>\s*Chat\s*<\/button>/.test(html),
    'missing Chat tab');
  ok('P8. tab bar has Terminal tab (data-tab="terminal")',
    /<button[^>]*class="[^"]*sd-tab[^"]*"[^>]*data-tab="terminal"[^>]*>\s*Terminal\s*<\/button>/.test(html),
    'missing Terminal tab');
  ok('P8. tab bar has Files tab (data-tab="files")',
    /<button[^>]*class="[^"]*sd-tab[^"]*"[^>]*data-tab="files"[^>]*>\s*Files\s*<\/button>/.test(html),
    'missing Files tab');
  ok('P8. tab bar has Changes tab (data-tab="changes")',
    /<button[^>]*class="[^"]*sd-tab[^"]*"[^>]*data-tab="changes"[^>]*>\s*Changes\s*<\/button>/.test(html),
    'missing Changes tab');
  ok('P8. JS has switchSessionDetailTab function', /function\s+switchSessionDetailTab\s*\(/.test(js), 'missing switchSessionDetailTab');

  // (9) Chat tab has a messages area (#sd-messages) AND an input (#sd-input).
  ok('P9. Chat tab has #sd-messages area', html.includes('id="sd-messages"'), 'missing #sd-messages');
  ok('P9. Chat tab has #sd-input textarea', html.includes('id="sd-input"'), 'missing #sd-input');
  ok('P9. JS has loadChatTab function', /function\s+loadChatTab\s*\(/.test(js) || /\bloadChatTab\s*\(/.test(js), 'missing loadChatTab');

  // (10) Terminal tab has a terminal surface (#sd-term-out) with monospace/
  //      dark styling class (.terminal-surface).
  ok('P10. Terminal tab has #sd-term-out surface', html.includes('id="sd-term-out"'), 'missing #sd-term-out');
  ok('P10. #sd-term-out uses terminal-surface class',
    /<div[^>]*class="[^"]*terminal-surface[^"]*"[^>]*id="sd-term-out"/.test(html),
    'terminal-surface class not on #sd-term-out');
  ok('P10. CSS .terminal-surface has monospace font',
    /\.terminal-surface\s*\{[^}]*(font-family:\s*[^;]*monospace)/.test(css),
    '.terminal-surface missing monospace font');
  ok('P10. CSS .terminal-surface has dark background',
    /\.terminal-surface\s*\{[^}]*(background:\s*#0[0-9a-f]{5})/i.test(css),
    '.terminal-surface missing dark background');
  ok('P10. JS has loadTerminalTab function', /function\s+loadTerminalTab\s*\(/.test(js) || /\bloadTerminalTab\s*\(/.test(js), 'missing loadTerminalTab');

  // (11) Files tab has a workspace file tree container (#sd-file-tree).
  ok('P11. Files tab has #sd-file-tree container', html.includes('id="sd-file-tree"'), 'missing #sd-file-tree');
  ok('P11. JS has loadFilesTab function', /function\s+loadFilesTab\s*\(/.test(js) || /\bloadFilesTab\s*\(/.test(js), 'missing loadFilesTab');

  // (12) Changes tab has a changes container (#sd-changes-list) and shows either
  //      changes OR the empty-state text "暂无文件变更".
  ok('P12. Changes tab has #sd-changes-list container', html.includes('id="sd-changes-list"'), 'missing #sd-changes-list');
  ok('P12. JS loadChangesTab renders empty-state text "暂无文件变更"',
    js.includes('暂无文件变更'),
    'missing 暂无文件变更 empty-state');
  ok('P12. JS has loadChangesTab function', /function\s+loadChangesTab\s*\(/.test(js) || /\bloadChangesTab\s*\(/.test(js), 'missing loadChangesTab');

  // (13) Settings view has host AND permissions sections.
  ok('P13. Settings view exists', html.includes('data-view="settings"'), 'missing settings view');
  ok('P13. Settings has Host section heading',
    /data-view="settings"[^]*<h3[^>]*>\s*Host\s*<\/h3>/.test(html),
    'missing Host section');
  ok('P13. Settings has Permissions section heading',
    /data-view="settings"[^]*<h3[^>]*>\s*Permissions\s*<\/h3>/.test(html),
    'missing Permissions section');
  ok('P13. JS has populateSettings function', /function\s+populateSettings\s*\(/.test(js), 'missing populateSettings');

  // (14) Does NOT display token/tokenHash anywhere in the rendered DOM. The
  //      harness does not execute JS, so we assert (a) the JS source does not
  //      write token/tokenHash into innerHTML, and (b) the hub + app-state API
  //      responses do not contain the literal token string / "tokenHash".
  ok('P14a. JS does not write tokenHash into innerHTML',
    !/tokenHash[^;]*\.innerHTML|\.innerHTML[^;]*tokenHash/i.test(js),
    'JS may leak tokenHash via innerHTML');
  ok('P14b. JS does not write raw token into innerHTML',
    !/\.innerHTML\s*=\s*[^;]*\btoken\b/i.test(js),
    'JS may leak token via innerHTML');
  const hubText = JSON.stringify(hubData || {});
  ok('P14c. session-hub response does not contain tokenHash field',
    !/"tokenHash"\s*:/.test(hubText), 'hub leaked tokenHash');
  ok('P14d. session-hub response does not contain Bearer token',
    !/Bearer\s/i.test(hubText), 'hub leaked Bearer');
  ok('P14e. session-hub response does not echo raw token string',
    !hubText.includes(token || '__NO_TOKEN__'), 'hub leaked raw token');

  // (15) At 390×844 viewport there's no horizontal overflow. Harness uses the
  //      CSS-grep approach (no real layout engine): assert html/body enforce
  //      overflow-x:hidden AND the new view containers use max-width:100% /
  //      box-sizing:border-box. The view containers receive max-width:100% via
  //      a grouped overflow-guard selector (see mobile.css ~line 4805), so the
  //      assertion matches any CSS rule block whose selector list contains the
  //      container class AND whose body grants max-width:100%.
  ok('P15a. CSS enforces overflow-x:hidden on html/body',
    /html\s*,\s*body\s*\{[^}]*overflow-x:\s*hidden/.test(css),
    'html/body missing overflow-x:hidden');
  ok('P15b. CSS has universal box-sizing:border-box',
    /\*\s*\{\s*box-sizing:\s*border-box/.test(css),
    'missing universal box-sizing:border-box');
  ok('P15c. .view-sessions is granted max-width:100% (via grouped guard)',
    /\.view-sessions\b[^{}]*\{[^}]*max-width:\s*100%/.test(css),
    '.view-sessions not granted max-width:100%');
  ok('P15d. .view-session-detail is granted max-width:100% (via grouped guard)',
    /\.view-session-detail\b[^{}]*\{[^}]*max-width:\s*100%/.test(css),
    '.view-session-detail not granted max-width:100%');
  ok('P15e. .hub-projects container uses max-width:100%',
    /\.hub-projects\s*\{[^}]*max-width:\s*100%/.test(css),
    '.hub-projects missing max-width:100%');
  ok('P15f. .terminal-surface enforces overflow-x:hidden',
    /\.terminal-surface\s*\{[^}]*overflow-x:\s*hidden/.test(css),
    '.terminal-surface missing overflow-x:hidden');

  // ==========================================================================
  section('P1-Paseo: fixture project + session detail sanity');
  // ==========================================================================

  // Fixture project fanbox-master must appear in the hub so P4 is meaningful.
  const fanboxProj = hubProjects.find(p => p.name === 'fanbox-master' || p.cwd === fixtureProjectCwd);
  ok('P-FX. fixture project fanbox-master appears in hub',
    !!fanboxProj,
    'projects=' + JSON.stringify(hubProjects.map(p => p.name)).substring(0, 120));

  // If fanbox-master has a session, assert its fields (proves the row the UI
  // would render is well-formed and clickable).
  if (fanboxProj && Array.isArray(fanboxProj.sessions) && fanboxProj.sessions.length > 0) {
    const sess = fanboxProj.sessions[0];
    ok('P-FX. fixture session has id (string)', typeof sess.id === 'string' && sess.id.length > 0, 'id=' + sess.id);
    ok('P-FX. fixture session has title (string)', typeof sess.title === 'string', 'title=' + JSON.stringify(sess.title));
    ok('P-FX. fixture session has agentId', typeof sess.agentId === 'string', 'agentId=' + sess.agentId);
    ok('P-FX. fixture session has status', typeof sess.status === 'string', 'status=' + sess.status);
    ok('P-FX. fixture session has canResume (boolean)', typeof sess.canResume === 'boolean', 'canResume=' + sess.canResume);
  }

  // ==========================================================================
  section('R1-Fix: Paseo R1 frontend fixes (formatApiError + timelineKind routing)');
  // ==========================================================================

  // (R1-1) formatApiError helper is defined in the served JS source.
  ok('R1-1. served mobile.js defines formatApiError(error, fallback)',
    /function\s+formatApiError\s*\(/.test(js),
    'no formatApiError definition');

  // (R1-2) cApi formats object/bare-string errors via formatApiError — no more
  //        `msg = j.error` (object) -> `throw new Error(msg)` -> "[object Object]".
  ok('R1-2a. cApi !r.ok branch formats errors via formatApiError(j && j.error, ...)',
    /formatApiError\(j\s*&\&\s*j\.error/.test(js),
    'cApi !r.ok branch not using formatApiError(j && j.error, ...)');
  ok('R1-2b. cApi data.ok===false branch formats errors via formatApiError(data && data.error, ...)',
    /formatApiError\(data\s*&\&\s*data\.error/.test(js),
    'cApi data.ok===false branch not using formatApiError(data && data.error, ...)');

  // (R1-3) loadChatTab routes by timelineKind (not sess.source) and uses
  //        sess.desktopAgentId for the desktop-agent timeline call (not sess.id).
  ok('R1-3a. loadChatTab branches on sess.timelineKind (desktop-terminal/desktop-agent)',
    /sess\.timelineKind\s*===\s*["']desktop-terminal["']/.test(js) &&
    /sess\.timelineKind\s*===\s*["']desktop-agent["']/.test(js),
    'loadChatTab not routing by timelineKind');
  ok('R1-3b. desktop-agent timeline call uses sess.desktopAgentId (not sess.id)',
    /desktop-agents\/\$\{encodeURIComponent\(sess\.desktopAgentId/.test(js),
    'desktop-agent timeline call not using sess.desktopAgentId');

  // (R1-4) loadTerminalTab guards on !sess.desktopAgentId before fetching and
  //        uses sess.desktopAgentId (not sess.id) in the desktop-agent URL.
  ok('R1-4a. loadTerminalTab guards on !sess.desktopAgentId before the fetch',
    /if\s*\(\s*!\s*sess\.desktopAgentId\s*\)/.test(js),
    'no !sess.desktopAgentId guard in loadTerminalTab');
  ok('R1-4b. loadTerminalTab desktop-agent URL uses sess.desktopAgentId',
    /desktop-agents\/\$\{encodeURIComponent\(sess\.desktopAgentId\)\}/.test(js),
    'loadTerminalTab desktop-agent URL not using sess.desktopAgentId');

  // (R1-5) Friendly empty-state strings present in the served JS.
  ok('R1-5a. served JS contains chat empty-state "这个历史会话暂无可显示消息"',
    js.includes('这个历史会话暂无可显示消息'),
    'missing chat empty-state string');
  ok('R1-5b. served JS contains terminal empty-state "这个历史会话没有可连接的实时终端"',
    js.includes('这个历史会话没有可连接的实时终端'),
    'missing terminal empty-state string');

  // (R1-6) session-hub fixture returns a session with titleSource ===
  //        "first-message" whose title is the fixture first-message string
  //        (NOT a synthesized "Claude/Codex session · <date>" form). The hub
  //        is fetched above with the paired token (hubRes/hubData).
  const r1Sessions = (fanboxProj && Array.isArray(fanboxProj.sessions)) ? fanboxProj.sessions : [];
  const titledSess = r1Sessions.find(s => s && s.titleSource === 'first-message');
  ok('R1-6a. fixture session has titleSource === "first-message"',
    !!titledSess,
    'sessions titleSource=' + JSON.stringify(r1Sessions.map(s => s && s.titleSource)).substring(0, 120));
  ok('R1-6b. fixture session title is the first-message string (not Claude/Codex session timestamp)',
    !!titledSess &&
      typeof titledSess.title === 'string' &&
      titledSess.title === 'Fix the auth bug' &&
      !/(Claude|Codex) session · \d{4}-\d{2}-\d{2}/.test(titledSess.title),
    'title=' + JSON.stringify(titledSess && titledSess.title));

  // (R1-7) Re-affirm: no token/tokenHash leak in served JS (mirrors P14a/P14b).
  ok('R1-7a. (reaffirm) JS does not write tokenHash into innerHTML',
    !/tokenHash[^;]*\.innerHTML|\.innerHTML[^;]*tokenHash/i.test(js),
    'JS may leak tokenHash via innerHTML');
  ok('R1-7b. (reaffirm) JS does not write raw token into innerHTML',
    !/\.innerHTML\s*=\s*[^;]*\btoken\b/i.test(js),
    'JS may leak token via innerHTML');

  // (R1-8) Re-affirm: 390x844 no-overflow CSS guards (mirrors P15a/P15b).
  ok('R1-8a. (reaffirm) CSS enforces overflow-x:hidden on html/body',
    /html\s*,\s*body\s*\{[^}]*overflow-x:\s*hidden/.test(css),
    'html/body missing overflow-x:hidden');
  ok('R1-8b. (reaffirm) CSS has universal box-sizing:border-box',
    /\*\s*\{\s*box-sizing:\s*border-box/.test(css),
    'missing universal box-sizing:border-box');

  // (R1-9) Mobile-Paseo-R1-Fix-Strict: Chat tab must show REAL project-memory
  //        history, not a friendly empty state. The backend timeline endpoint must
  //        return non-empty events for a project-memory session whose fixture jsonl
  //        has messages. And the served JS must render tool/system event types
  //        (so safe summaries like "修改了 fix.js" actually appear in the Chat tab).
  const r1PmSess = r1Sessions.find(s => s && s.source === 'desktop-project-memory' && s.timelineId);
  let r1PmTimeline = null;
  if (r1PmSess) {
    const r1PmTlRes = await request({
      path: '/api/mobile/sessions/' + encodeURIComponent(r1PmSess.timelineId) + '/timeline?limit=100',
      method: 'GET',
      headers: auth,
    });
    r1PmTimeline = asJson(r1PmTlRes);
  }
  ok('R1-9a. project-memory session timeline endpoint returns 200 ok:true',
    !!r1PmTimeline && r1PmTimeline.ok === true,
    'timeline=' + JSON.stringify(r1PmTimeline || {}).substring(0, 200));
  ok('R1-9b. project-memory session timeline returns NON-empty events (real history, not empty state)',
    !!r1PmTimeline && Array.isArray(r1PmTimeline.events) && r1PmTimeline.events.length > 0,
    'events length=' + (r1PmTimeline && Array.isArray(r1PmTimeline.events) ? r1PmTimeline.events.length : 'N/A'));
  ok('R1-9c. project-memory timeline events all have source === "desktop-project-memory"',
    !!r1PmTimeline && Array.isArray(r1PmTimeline.events) && r1PmTimeline.events.length > 0 &&
      r1PmTimeline.events.every((e) => e && e.source === 'desktop-project-memory'),
    'bad sources=' + JSON.stringify((r1PmTimeline && r1PmTimeline.events || []).map((e) => e && e.source)).substring(0, 120));
  ok('R1-9d. served JS renders tool/system event types with ev.text body (so safe summaries appear in Chat)',
    /type === ["']tool["']|type === ["']system["']/.test(js) &&
      /tl-event-body[^)]*ev\.text/.test(js.replace(/\s+/g, ' ')),
      'missing tool/system render branch with ev.text');
  ok('R1-9e. served JS does NOT echo raw tool_use JSON in Chat (no "tool_use_id" string concat)',
    !/innerHTML[^;]*tool_use_id/.test(js) && !/ev\.text[^;]*tool_use_id/.test(js),
    'JS may echo raw tool_use JSON');

  // ==========================================================================
  console.log('\n===== Mobile UI Smoke Test (Paseo IA) =====');
  console.log('PASS: ' + passed);
  console.log('FAIL: ' + failed);

  await new Promise((resolve) => server.close(resolve));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
