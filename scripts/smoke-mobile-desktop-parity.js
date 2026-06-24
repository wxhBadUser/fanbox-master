/* eslint-disable */
/**
 * FanBox Mobile · Phase UI-A8-11 smoke
 * Mobile Desktop Parity Bridge
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-smoke-desktop-parity-' + Date.now());
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

const ROOT_DIR = path.join(__dirname, '..');
const mobile = require(path.join(ROOT_DIR, 'electron', 'mobile.js'));
const mobileSessions = require(path.join(ROOT_DIR, 'electron', 'mobile-sessions.js'));

const PUBLIC_MOBILE = path.join(ROOT_DIR, 'public', 'mobile');
const html = fs.readFileSync(path.join(PUBLIC_MOBILE, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC_MOBILE, 'mobile.css'), 'utf8');
const js = fs.readFileSync(path.join(PUBLIC_MOBILE, 'mobile.js'), 'utf8');
const mobileJsCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile.js'), 'utf8');
const runnerCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-agent-runner.js'), 'utf8');

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
function section(title) {
  console.log('\n[' + title + ']');
}

const port = 14711;
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

function parseSse(body) {
  const events = [];
  String(body || '').split(/\n\n+/).forEach((block) => {
    let type = '';
    let data = '';
    block.split(/\n/).forEach((line) => {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      if (line.startsWith('data:')) data += line.slice(5).trim();
    });
    if (!type) return;
    let parsed = {};
    try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = {}; }
    events.push({ type, data: parsed });
  });
  return events;
}

(async () => {
  section('0) fixture + auth');
  const cwdMock = path.join(TMP_HOME, 'fanbox-cwd-A8-11');
  fs.mkdirSync(cwdMock, { recursive: true });
  fs.writeFileSync(path.join(cwdMock, 'README.md'), '# A8-11\n', 'utf8');
  for (const d of ['Desktop', 'Downloads', 'Documents', 'Pictures', 'Music', 'Videos']) {
    fs.mkdirSync(path.join(TMP_HOME, d), { recursive: true });
  }

  const claudeSkill = path.join(TMP_HOME, '.claude', 'skills', 'review');
  fs.mkdirSync(claudeSkill, { recursive: true });
  fs.writeFileSync(path.join(claudeSkill, 'SKILL.md'), [
    '---',
    'name: review',
    'description: Review code and explain risks clearly.',
    '---',
    '',
    '# Review'
  ].join('\n'), 'utf8');
  const codexSkill = path.join(TMP_HOME, '.codex', 'skills', 'triage');
  fs.mkdirSync(codexSkill, { recursive: true });
  fs.writeFileSync(path.join(codexSkill, 'SKILL.md'), [
    '---',
    'description: Triage issues into actionable agent briefs.',
    '---'
  ].join('\n'), 'utf8');
  const claudeCommand = path.join(TMP_HOME, '.claude', 'commands');
  fs.mkdirSync(claudeCommand, { recursive: true });
  fs.writeFileSync(path.join(claudeCommand, 'commit.md'), 'Commit helper command.', 'utf8');

  const desktopIndex = {
    sessions: {
      desktop1: {
        sessionId: 'desktop1',
        source: 'desktop',
        agentId: 'codex',
        cwd: cwdMock,
        cwdLabel: 'fanbox-cwd-A8-11',
        title: 'Desktop existing session',
        status: 'done',
        createdAt: Date.now() - 2000,
        updatedAt: Date.now() - 1000,
        lastActiveAt: Date.now() - 1000,
        messageCount: 2,
        summary: { lastMessagePreview: 'desktop preview' }
      }
    }
  };
  fs.writeFileSync(path.join(process.env.FANBOX_SESSIONS_DIR, 'index.json'), JSON.stringify(desktopIndex, null, 2), 'utf8');

  const server = mobile.startMobileServer({ port });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise((r) => setTimeout(r, 20));
  ok('mobile server listening', server.listening);
  await mobile.saveConfig({ enabled: true });
  const pc = await mobile.startPairCode();
  const rPair = await req({
    path: '/api/mobile/pair/confirm',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ pairCode: pc.pairCode, deviceName: 'Smoke-A8-11' }));
  const token = JSON.parse(rPair.body).token;
  const auth = { Authorization: 'Bearer ' + token };
  ok('paired token', !!token);

  section('1) Files roots desktop parity');
  const rRoots = await req({ path: '/api/mobile/roots', method: 'GET', headers: auth });
  const jRoots = JSON.parse(rRoots.body);
  const rootsItems = jRoots.items || jRoots.roots || jRoots.drives || jRoots.list || [];
  ok('/api/mobile/roots 200', rRoots.status === 200);
  ok('roots response exposes items array', Array.isArray(jRoots.items), JSON.stringify(Object.keys(jRoots)));
  ok('roots includes 此电脑 virtual item', rootsItems.some((x) => x.type === 'this-pc' && x.path === '__fanbox_this_pc__'));
  ok('roots includes Home/Desktop/Documents fallback', ['Home', 'Desktop', 'Documents'].every((name) => rootsItems.some((x) => x.name === name)));
  ok('roots items do not expose dangerous actions', !/(delete|move|rename|upload)/i.test(JSON.stringify(jRoots)));
  ok('mobile.js handles data.items/data.roots/data.drives/data.list',
    /data\.items/.test(js) && /data\.roots/.test(js) && /data\.drives/.test(js) && /data\.list/.test(js));
  ok('mobile.js knows this-pc virtual root', /__fanbox_this_pc__/.test(js));

  section('2) Skills desktop registry bridge');
  const rSkills = await req({ path: '/api/mobile/skills', method: 'GET', headers: auth });
  const jSkills = JSON.parse(rSkills.body);
  const skills = jSkills.items || jSkills.skills || jSkills.list || [];
  ok('/api/mobile/skills 200', rSkills.status === 200);
  ok('skills response exposes items array', Array.isArray(jSkills.items));
  ok('skills response exposes scannedRoots diagnostics', Array.isArray(jSkills.scannedRoots));
  ok('skills includes .claude/skills item', skills.some((s) => s.id === 'review' || s.name === 'review'));
  ok('skills includes .codex/skills item', skills.some((s) => s.id === 'triage' || s.name === 'triage'));
  ok('skills includes .claude/commands item', skills.some((s) => s.id === 'commit' || s.name === 'commit'));
  ok('skill item has cnDescription/agentScope/category/source', skills.every((s) => 'cnDescription' in s && 'agentScope' in s && 'category' in s && 'source' in s));
  ok('skills response hides real paths', !/(SKILL\.md|\.claude[\\\/]skills|\.codex[\\\/]skills|\.agents[\\\/]skills)/i.test(JSON.stringify(jSkills)));
  ok('skills-list mobile one column desktop max two', /\.skills-list\s*\{[^}]*grid-template-columns:\s*1fr/.test(css) && /@media\s*\(min-width:\s*1024px\)[\s\S]{0,500}\.skills-list[\s\S]{0,200}1fr\s+1fr/.test(css));
  ok('skills empty state can show scannedRoots', /scannedRoots|scanned roots|扫描/.test(js));

  section('3) Sessions / Projects desktop sync');
  const rSessions = await req({ path: '/api/mobile/sessions?limit=200', method: 'GET', headers: auth });
  const jSessions = JSON.parse(rSessions.body);
  const sessions = jSessions.items || jSessions.sessions || [];
  ok('sessions includes desktop source', sessions.some((s) => s.source === 'desktop' && s.title === 'Desktop existing session'));
  ok('sidebar has recent sessions container', /id="sidebar-sessions"/.test(html));
  ok('sidebar groups recent 7/30 days', /最近 7 天/.test(js) && /最近 30 天/.test(js));
  ok('continueSession restores sessionId/agent/cwd/messages without draft', /function\s+continueSession[\s\S]{0,3500}S\.sessionId\s*=\s*sid/.test(js) && /agentIdForUi/.test(js) && !/continueSession[\s\S]{0,3500}\/sessions\/draft/.test(js));

  const rProjects = await req({ path: '/api/mobile/projects', method: 'GET', headers: auth });
  const jProjects = JSON.parse(rProjects.body);
  ok('/api/mobile/projects 200', rProjects.status === 200);
  ok('projects exposes groups recent7d/recent30d/fallback', jProjects.groups && Array.isArray(jProjects.groups.recent7d) && Array.isArray(jProjects.groups.recent30d) && Array.isArray(jProjects.groups.fallback));
  ok('projects includes desktop project', (jProjects.items || []).some((p) => p.source === 'desktop-project' && p.cwd === cwdMock));
  ok('projects includes fallback roots', (jProjects.groups.fallback || []).length > 0);
  ok('projects response hides raw logs/session internals', !/(\.jsonl|claudeSession|codexSession|token|cookie|apiKey)/i.test(JSON.stringify(jProjects)));

  section('4) Codex-like stream timeline + persistence');
  const rStream = await req({
    path: '/api/mobile/agent/stream',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth }
  }, JSON.stringify({ agentId: 'claude', cwd: cwdMock, message: '请用 markdown 回复 **bold**', skillId: 'review', skillName: 'review' }));
  const events = parseSse(rStream.body);
  const types = events.map((e) => e.type);
  ok('stream 200 event-stream', rStream.status === 200 && /text\/event-stream/.test(rStream.headers['content-type'] || ''));
  ok('stream emits thought/skill/tool/command_output/delta/done', ['thought', 'skill', 'tool', 'command_output', 'delta', 'done'].every((t) => types.includes(t)), types.join(','));
  ok('runner emits public thought before final', runnerCode.indexOf("emit('thought'") >= 0 && runnerCode.indexOf("emit('thought'") < runnerCode.indexOf("emit('delta'"));
  const sidEvent = events.find((e) => e.type === 'session');
  const sid = sidEvent && sidEvent.data && sidEvent.data.sessionId;
  ok('stream emitted session id', !!sid);
  const msgResult = sid ? await mobileSessions.getSessionMessages(sid) : { messages: [] };
  ok('stream persisted user+assistant messages', msgResult.messages && msgResult.messages.some((m) => m.role === 'user') && msgResult.messages.some((m) => m.role === 'agent'));
  ok('stream done refreshes sessions/projects in frontend', /loadRecentSessions\(\)/.test(js) && /loadAllProjects\(\)/.test(js));
  ok('final answer uses markdown renderer, not raw pre-wrap only', /renderMarkdownSafe|safeMarkdown|markdownToHtml/.test(js) && /run-final/.test(js));
  ok('final renderer escapes HTML before markdown', /htmlEscape|escapeHtml/.test(js) && /renderMarkdownSafe|safeMarkdown|markdownToHtml/.test(js));
  ok('stream UI has required sections', ['run-thinking', 'run-skill', 'run-tools', 'run-command', 'run-command-output', 'run-final'].every((cls) => css.includes('.' + cls) || js.includes(cls)));
  ok('stream UI hides raw JSON/stdout/stack trace', !/(raw stdout|stack trace|\.jsonl)/i.test(html + js + css));

  try { server.close(); } catch (_) {}
  section('DONE');
  console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
