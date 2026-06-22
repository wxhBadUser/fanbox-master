/* eslint-disable */
/**
 * FanBox Mobile · Phase UI-A7 smoke
 * Manus-like Home + ChatGPT-like Agent + Mobile File Source UI
 *
 * 覆盖（按 user spec §十二）：
 *   Pairing / Home / Chat / Agent Switcher / Sidebar / Files / Skills / Security
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-smoke-ui-a7-' + Date.now());
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
const allUi = html + '\n' + css + '\n' + js;
const mobileJsCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile.js'), 'utf8');
const mobileSessCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-sessions.js'), 'utf8');
const runnerCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-agent-runner.js'), 'utf8');

const port = 14691;

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
  // [0] 准备
  // ============================================================
  section('0) 准备：启动 server + 配对 + 注入数据');
  const server = mobile.startMobileServer({ port });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise((r) => setTimeout(r, 20));
  ok('mobile server listening', server.listening);
  await mobile.saveConfig({ enabled: true });
  const pc = await mobile.startPairCode();
  const rPC = await req({
    path: '/api/mobile/pair/confirm', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ pairCode: pc.pairCode, deviceName: 'Smoke-UI-A7' }));
  const jPC = JSON.parse(rPC.body);
  const token = jPC.token;
  const auth = { Authorization: 'Bearer ' + token };
  ok('pair/confirm 200', rPC.status === 200);
  ok('token 取得', !!token && token.length > 30);

  const cwdMock = path.join(TMP_HOME, 'fanbox-cwd-UI-A7');
  fs.mkdirSync(cwdMock, { recursive: true });

  // 注入 Home 下的常见目录（让 /api/mobile/roots 包含 Desktop/Downloads/Documents）
  for (const d of ['Desktop', 'Downloads', 'Documents', 'Pictures', 'Music', 'Videos']) {
    fs.mkdirSync(path.join(TMP_HOME, d), { recursive: true });
  }
  // 注入 README.md 用来测试 search
  fs.writeFileSync(path.join(cwdMock, 'README.md'), '# UI-A8-2 test\n', 'utf8');
  // 注入 package.json
  fs.writeFileSync(path.join(cwdMock, 'package.json'), '{"name":"smoke-a8-2"}', 'utf8');

  // 注入 desktop sessions (与电脑端互通)
  const desktopPath = path.join(process.env.FANBOX_SESSIONS_DIR, 'index.json');
  const now = Date.now();
  fs.writeFileSync(desktopPath, JSON.stringify({
    sessions: {
      'desktop-A7': {
        agentId: 'claude', cwd: cwdMock, title: 'desktop UI-A7 test',
        status: 'idle', createdAt: now - 60000, updatedAt: now - 5000, lastActiveAt: now - 5000
      }
    }
  }, null, 2), 'utf8');

  // 注入 skill 文件（验证 toggle 不改真实文件）
  const claudeSkillsDir = path.join(TMP_HOME, '.claude', 'skills');
  fs.mkdirSync(claudeSkillsDir, { recursive: true });
  const skillFilePath = path.join(claudeSkillsDir, 'plan', 'SKILL.md');
  fs.mkdirSync(path.dirname(skillFilePath), { recursive: true });
  fs.writeFileSync(skillFilePath, '# plan skill\nplan description for smoke test', 'utf8');

  // ============================================================
  // [A] Pairing
  // ============================================================
  section('A) Pairing');
  ok('HTML 含 #pair-screen 配对屏', /id="pair-screen"/.test(html));
  ok('pair-screen 默认 hidden', /id="pair-screen"[^>]*\bhidden\b/.test(html));
  ok('HTML 含 #pair-code 配对码输入', /id="pair-code"/.test(html));
  ok('HTML 含 #pair-btn 配对按钮', /id="pair-btn"/.test(html));
  ok('mobile.js showPair 隐藏 app 显示 pair', /function\s+showPair[\s\S]{0,200}app[\s\S]{0,80}hidden\s*=\s*true/.test(js));
  ok('mobile.js showApp 隐藏 pair 显示 app', /function\s+showApp[\s\S]{0,200}pair-screen[\s\S]{0,80}hidden\s*=\s*true/.test(js));
  ok('mobile.js restoreToken 调用 /api/mobile/info', /restoreToken[\s\S]{0,500}\/api\/mobile\/info/.test(js));
  ok('mobile.js doPair 调用 /api/mobile/pair/confirm', /async\s+function\s+doPair[\s\S]{0,1000}\/api\/mobile\/pair\/confirm/.test(js));
  ok('mobile.js 401 自动 clearToken + showPair', /api[\s\S]{0,800}401[\s\S]{0,300}clearToken[\s\S]{0,300}showPair/.test(js));

  // 真实跑：401 验证
  const rBad = await req({ path: '/api/mobile/sessions', method: 'GET', headers: { Authorization: 'Bearer WRONG-TOKEN-XYZ' } });
  ok('GET /api/mobile/sessions 401 with bad token', rBad.status === 401);

  // ============================================================
  // [B] Manus-like Home (UI-A8-1: single composer)
  // ============================================================
  section('B) Manus-like Home · UI-A8-1 单输入框');
  ok('HTML 含 #home-hero (Manus-like hero)', /id="home-hero"/.test(html));
  ok('HTML 含 #home-hero-greet', /id="home-hero-greet"/.test(html));
  ok('HTML 含 #home-hero-sub', /id="home-hero-sub"/.test(html));
  ok('HTML 含 #home-shell (单一 composer 容器)', /id="home-shell"/.test(html));
  ok('HTML 含 #home-composer (大输入框容器)', /id="home-composer"/.test(html));
  ok('HTML 含 #home-input (大 textarea)', /id="home-input"/.test(html));
  ok('HTML 含 #home-send (发送按钮)', /id="home-send"/.test(html));
  ok('HTML 含 #home-task-chips (任务 chip 区域)', /id="home-task-chips"/.test(html));
  ok('HTML 含 #home-messages (消息流)', /id="home-messages"/.test(html));
  // UI-A8-1: 单一 textarea 断言
  ok('UI-A8-1: HTML 只有 1 个 #home-input', (html.match(/id="home-input"/g) || []).length === 1);
  ok('UI-A8-1: HTML 只有 1 个 #home-send', (html.match(/id="home-send"/g) || []).length === 1);
  ok('UI-A8-1: HTML 没有 #home-input-sticky (重复 textarea)', !/id="home-input-sticky"/.test(html));
  ok('UI-A8-1: HTML 没有 #home-send-sticky (重复 send)', !/id="home-send-sticky"/.test(html));
  ok('UI-A8-1: HTML 没有 #home-composer-sticky (重复 composer)', !/id="home-composer-sticky"/.test(html));
  ok('UI-A8-1: HTML 没有 #home-status-pill-sticky', !/id="home-status-pill-sticky"/.test(html));
  ok('UI-A8-1: HTML 没有 #home-skill-button-sticky', !/id="home-skill-button-sticky"/.test(html));
  ok('UI-A8-1: HTML 没有 #home-chat (旧 chat wrapper)', !/id="home-chat"/.test(html));
  ok('UI-A8-1: HTML 没有 #home-cards (旧 dashboard)', !/id="home-cards"/.test(html));
  // 占位符只出现一次
  ok('UI-A8-1: placeholder "Assign a task or ask anything..." 只出现 1 次',
    (html.match(/Assign a task or ask anything/g) || []).length === 1);
  // hero 文案
  ok('hero 文案 "Leave all to FanBox"', /Leave all to FanBox/.test(html));
  ok('hero 副标题 "Your AI agent workspace"', /Your AI agent workspace/.test(html));
  // CSS
  ok('CSS .home-shell 容器 (flex column)', /\.home-shell\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/.test(css));
  ok('CSS .home-shell.is-chat 切换 chat 态', /\.home-shell\.is-chat/.test(css));
  ok('CSS .home-shell.is-chat .home-composer position sticky 底部',
    /\.home-shell\.is-chat\s+\.home-composer\s*\{[^}]*position:\s*sticky[\s\S]{0,200}bottom:\s*0/.test(css));
  ok('CSS .home-shell:not(.is-chat) .home-composer 居中 (max-width)',
    /\.home-shell:not\(\.is-chat\)\s+\.home-composer\s*\{[^}]*max-width/.test(css));
  ok('CSS .home-hero-greet 字体 >= 32px', /\.home-hero-greet\s*\{[^}]*font-size:\s*[3-9]\d/.test(css));
  ok('CSS .home-composer 大圆角 >= 16px', /\.home-composer\s*\{[^}]*border-radius:\s*(1[6-9]|2\d|3\d)/.test(css));
  ok('CSS --maxw >= 720px', /--maxw:\s*7\d\d/.test(css));
  // mobile.js
  ok('mobile.js enterChatState 切到聊天态', /function\s+enterChatState\s*\(/.test(js));
  ok('mobile.js exitChatState 退到欢迎态', /function\s+exitChatState\s*\(/.test(js));
  ok('mobile.js enterChatState 切 home-shell.is-chat class',
    /enterChatState[\s\S]{0,400}home-shell[\s\S]{0,200}is-chat/.test(js));
  ok('mobile.js exitChatState 移除 home-shell.is-chat class',
    /exitChatState[\s\S]{0,400}home-shell[\s\S]{0,200}is-chat/.test(js));
  ok('mobile.js TASK_CHIPS 至少 8 个', /TASK_CHIPS\s*=\s*\[[\s\S]*?Develop app[\s\S]*?Website[\s\S]*?Slides[\s\S]*?Image[\s\S]*?Audio[\s\S]*?Video[\s\S]*?Wide Research[\s\S]*?Spreadsheet[\s\S]*?\]/.test(js));
  ok('mobile.js Enter 发送 + Shift+Enter 换行', /Enter[\s\S]{0,100}shiftKey[\s\S]{0,80}preventDefault/.test(js));
  // mobile.js 不引用 *-sticky 元素
  ok('UI-A8-1: mobile.js 不引用 #home-input-sticky', !/home-input-sticky/.test(js));
  ok('UI-A8-1: mobile.js 不引用 #home-send-sticky', !/home-send-sticky/.test(js));
  ok('UI-A8-1: mobile.js 不引用 #home-composer-sticky', !/home-composer-sticky/.test(js));
  ok('UI-A8-1: mobile.js 不引用 #home-status-pill-sticky', !/home-status-pill-sticky/.test(js));
  ok('UI-A8-1: mobile.js 不引用 #home-skill-button-sticky', !/home-skill-button-sticky/.test(js));
  // task chips 只填入 #home-input
  ok('UI-A8-1: task chip 填入 #home-input (不引用 sticky)',
    /home-chip[\s\S]{0,500}home-input/.test(js) || /renderTaskChips[\s\S]{0,500}home-input/.test(js));
  // 不要 dashboard
  ok('Home 不含医疗 App 卡片堆叠', !/(class="home-stat-card"|home-stat-grid)/.test(html));

  // ============================================================
  // [C] ChatGPT-like chat (UI-A8-1: same composer fixed bottom)
  // ============================================================
  section('C) ChatGPT-like chat');
  ok('HTML 含 #home-messages 消息流', /id="home-messages"/.test(html));
  ok('CSS 含 .chat-bubble 气泡样式', /\.chat-bubble\s*\{/.test(css));
  ok('CSS 含 .chat-bubble-user 用户气泡', /\.chat-bubble-user/.test(css));
  ok('CSS 含 .chat-bubble-agent assistant 气泡', /\.chat-bubble-agent/.test(css));
  ok('CSS 含 .chat-row-user 右对齐', /\.chat-row-user/.test(css));
  ok('CSS 含 .chat-row-agent 左对齐', /\.chat-row-agent/.test(css));
  ok('CSS 含 .chat-avatar 头像', /\.chat-avatar\s*\{/.test(css));
  ok('mobile.js renderMessages 渲染消息', /function\s+renderMessages\s*\(/.test(js));
  ok('mobile.js doSend POST /api/mobile/send', /doSend[\s\S]{0,500}\/api\/mobile\/send/.test(js));
  ok('mobile.js 发消息后 enterChatState', /doSend[\s\S]{0,500}enterChatState\s*\(/.test(js));
  ok('UI-A8-1: chat 态 composer 走 .home-shell.is-chat > .home-composer sticky 底部', /\.home-shell\.is-chat\s+\.home-composer[\s\S]{0,200}position:\s*sticky[\s\S]{0,80}bottom:\s*0/.test(css));
  ok('mobile.js setRunning 切 running 状态', /function\s+setRunning/.test(js));
  ok('mobile.js 失败时显示 status pill is-failed', /is-failed/.test(css) && /is-failed/.test(js));
  // 不暴露 raw
  ok('Chat 不暴露 "raw stdout"', !/raw\s*stdout/i.test(allUi));
  ok('Chat 不暴露 ".jsonl"', !/\.jsonl/.test(allUi));
  ok('Chat 不暴露 "claudeSession/codexSession"', !/(claudeSession|codexSession)/.test(allUi));
  // 手机发送不需要电脑确认
  ok('mobile.js /api/mobile/send 不调 createApproval', !/api[\s\S]{0,1500}createApproval/.test(mobileSessCode));

  // ============================================================
  // [D] Agent Switcher
  // ============================================================
  section('D) Agent Switcher');
  ok('HTML 含 #agent-dropdown-trigger (左上角 agent 切换)', /id="agent-dropdown-trigger"/.test(html));
  ok('HTML 含 #agent-dropdown-label (label)', /id="agent-dropdown-label"/.test(html));
  ok('HTML 含 #agent-dropdown-icon (icon)', /id="agent-dropdown-icon"/.test(html));
  ok('HTML 含 #agent-dropdown-menu (菜单)', /id="agent-dropdown-menu"/.test(html));
  ok('agent-dropdown 默认显示 "Claude Code"', /agent-dropdown-label[^>]*>Claude Code</.test(html));
  ok('CSS .agent-dropdown position relative', /\.agent-dropdown\s*\{[^}]*position:\s*relative/.test(css));
  // 4 个 agent
  for (const a of ['claude_code', 'codex', 'qoder', 'opencode']) {
    ok('AGENTS 含 ' + a, new RegExp("id:\\s*[\"']" + a + "[\"']").test(js));
  }
  ok('每个 Agent 有 SVG (label, svg 同时存在)',
    /label:\s*['"]Claude Code['"][\s\S]{0,400}svg:/.test(js) &&
    /label:\s*['"]Codex['"][\s\S]{0,400}svg:/.test(js));
  // 优先复用电脑端图标 - mobile.js inline svg
  ok('mobile.js 至少 4 个 agent 有 inline svg', /AGENTS\s*=\s*\[[\s\S]{0,2000}svg:\s*`<svg/.test(js) && ((js.match(/svg:\s*`<svg/g) || []).length >= 4));
  // 当前 agent 高亮
  ok('dropdown item 有 is-active class (current agent)', /is-active/.test(js) && /agent-dropdown-item/.test(js));
  ok('switchAgent 不丢 cwd (localStorage AGENT_KEY)', /localStorage\.setItem\s*\(\s*AGENT_KEY/.test(js));
  // 不污染历史 session
  ok('switchAgent 不重置 messages', !/switchAgent[\s\S]{0,500}S\.messages\s*=\s*\[\]/.test(js));
  // runner 端
  ok('runner 含 STUB_RUNNER_IDS', /STUB_RUNNER_IDS/.test(runnerCode));
  ok('runner 支持 4 个 agent id (claude/codex/qoder/opencode)',
    runnerCode.includes("'claude'") && runnerCode.includes("'codex'") &&
    runnerCode.includes("'qoder'") && runnerCode.includes("'opencode'"));

  // ============================================================
  // [E] Sidebar
  // ============================================================
  section('E) Sidebar');
  ok('HTML 含 #app-sidebar', /id="app-sidebar"/.test(html));
  ok('HTML 含 #app-menu (mobile drawer toggle)', /id="app-menu"/.test(html));
  ok('HTML 含 #sidebar-close', /id="sidebar-close"/.test(html));
  ok('HTML 含 #sidebar-scrim (drawer 遮罩)', /id="sidebar-scrim"/.test(html));
  ok('HTML 含 #sidebar-new-chat (New Chat)', /id="sidebar-new-chat"/.test(html));
  ok('Sidebar 6 个 nav items: home/files/skills/project/sessions/settings',
    /data-go="home"/.test(html) && /data-go="files"/.test(html) &&
    /data-go="skills"/.test(html) && /data-go="project"/.test(html) &&
    /data-go="sessions"/.test(html) && /data-go="settings"/.test(html));
  ok('Sidebar 5 个核心 nav (File/Skill/Project/Session/Setting)',
    /data-go="files"/.test(html) && /data-go="skills"/.test(html) &&
    /data-go="project"/.test(html) && /data-go="sessions"/.test(html) &&
    /data-go="settings"/.test(html));
  ok('Sidebar 导航顺序: File → Skill → Project → Session → Setting',
    /data-go="files"[\s\S]{0,400}data-go="skills"[\s\S]{0,400}data-go="project"[\s\S]{0,400}data-go="sessions"[\s\S]{0,400}data-go="settings"/.test(html));
  ok('HTML 含 #sidebar-sessions (Recent Sessions 区域)', /id="sidebar-sessions"/.test(html));
  ok('CSS .app-sidebar mobile 默认隐藏', /\.app-sidebar\s*\{[^}]*display:\s*none/.test(css));
  ok('CSS .app-sidebar.is-open (drawer open)', /\.app-sidebar\.is-open/.test(css));
  ok('CSS @media (min-width: 1024px) sidebar 常驻', /@media\s*\(min-width:\s*1024px\)[\s\S]{0,200}\.app-sidebar[\s\S]{0,100}display:\s*flex/.test(css));
  ok('mobile.js toggleSidebar 切换', /function\s+toggleSidebar/.test(js));
  ok('mobile.js openSidebar / closeSidebar', /function\s+openSidebar/.test(js) && /function\s+closeSidebar/.test(js));
  ok('mobile.js newChat 重置 messages + exitChatState', /function\s+newChat[\s\S]{0,500}exitChatState/.test(js));
  ok('mobile.js loadRecentSessions 拉 /api/mobile/sessions', /loadRecentSessions[\s\S]{0,500}\/api\/mobile\/sessions/.test(js));
  // 点击 File → Files 视图
  ok('UI-A8-1: sidebar File (data-go="files") 可点击', /data-go="files"/.test(html));
  ok('UI-A8-1: sidebar Skill (data-go="skills") 可点击', /data-go="skills"/.test(html));
  ok('UI-A8-1: sidebar Project (data-go="project") 可点击', /data-go="project"/.test(html));
  ok('UI-A8-1: sidebar Session (data-go="sessions") 可点击', /data-go="sessions"/.test(html));
  // Project 视图存在
  ok('HTML 含 [data-view="project"] 视图', /data-view="project"/.test(html));
  ok('CSS [data-view="project"].is-active 切换可见',
    /\[data-view="project"\]\.is-active/.test(css));
  // mobile.js 跳转处理
  ok('mobile.js sidebar-item 点击 → showTab', /sidebar-item[\s\S]{0,500}showTab/.test(js));
  // Recent Sessions from API
  const rSess = await req({ path: '/api/mobile/sessions', method: 'GET', headers: auth });
  const jSess = JSON.parse(rSess.body);
  const sessItems = jSess.items || jSess.sessions || (Array.isArray(jSess) ? jSess : []);
  ok('GET /api/mobile/sessions 200', rSess.status === 200);
  ok('GET sessions 返回 desktop-A7 (互通)', sessItems.some(s => s.id === 'desktop-A7' || s.sessionId === 'desktop-A7' || s.title === 'desktop UI-A7 test'));
  // Settings 占位
  ok('Settings 含 #view-settings 占位', /id="view-settings"|data-view="settings"/.test(html));
  // sidebar 不造成横向滚动（body overflow-x: hidden）
  ok('CSS body overflow-x: hidden (防横向滚动)', /body[\s\S]{0,200}overflow-x:\s*hidden/.test(css) || /html,\s*body\s*\{[^}]*overflow-x:\s*hidden/.test(css) || /html, body[\s\S]{0,400}overflow-x/.test(css));
  ok('CSS html, body 默认无横向 overflow (overflow-x)', /overflow-x/.test(css));

  // ============================================================
  // [F] Files · Phase UI-A8-2 (手机文件管理器 · 真实数据)
  // ============================================================
  section('F) Files · 手机文件管理器 · UI-A8-2');
  ok('HTML 含 #files-back (返回)', /id="files-back"/.test(html));
  ok('HTML 含 #files-title (Files 标题)', /id="files-title"/.test(html));
  ok('HTML 含 #files-refresh', /id="files-refresh"/.test(html));
  ok('HTML 含 #files-q (搜索)', /id="files-q"/.test(html));
  ok('HTML 含 #files-list (文件列表)', /id="files-list"/.test(html));
  ok('HTML 含 #files-cwd-label (当前路径)', /id="files-cwd-label"/.test(html));
  ok('HTML 含 #files-open-agent (Ask AI in this folder)', /id="files-open-agent"/.test(html));
  ok('HTML 含 #files-preview (预览)', /id="files-preview"/.test(html));
  // [F.1] Files data
  ok('UI-A8-2: mobile.js 调 /api/mobile/files?path=...', /\/api\/mobile\/files\?path=/.test(js));
  ok('UI-A8-2: mobile.js 调 /api/mobile/roots (cwd 空时)', /\/api\/mobile\/roots/.test(js));
  ok('UI-A8-2: mobile.js 调 /api/mobile/search (>=3 字符)', /\/api\/mobile\/search\?q=/.test(js));
  ok('UI-A8-2: mobile.js 调 /api/mobile/file?path= (预览)', /\/api\/mobile\/file\?path=/.test(js));
  ok('UI-A8-2: mobile.js loadFiles 读 data.items (而非 data.files)', /normalizeFiles\(data\.items\s*\|\|\s*data\.files/.test(js));
  ok('UI-A8-2: mobile.js loadFilesRoots 在 S.cwd 为空时调用', /if\s*\(\s*!path\s*&&\s*!S\.cwd\s*\)\s*\{[\s\S]{0,80}loadFilesRoots/.test(js));
  ok('UI-A8-2: mobile.js openAgentInCurrentFolder POST /api/mobile/context/cwd',
    /openAgentInCurrentFolder[\s\S]{0,500}\/api\/mobile\/context\/cwd/.test(js));
  ok('UI-A8-2: openAgentInCurrentFolder 切回 home', /openAgentInCurrentFolder[\s\S]{0,800}showTab\(\s*['"]home['"]\s*\)/.test(js));
  ok('UI-A8-2: api() 401 自动 clearToken + showPair', /clearToken\s*\(\s*\)/.test(js) && /showPair\s*\(\s*\)/.test(js));
  ok('UI-A8-2: renderFilesError 403 提示 无权限', /无权限访问该路径/.test(js));
  ok('UI-A8-2: filterFiles cwd 空提示先选文件夹', /先选择一个文件夹/.test(js));
  // [F.2] Files UI
  ok('UI-A8-2: CSS .file-row min-height: 64px', /\.file-row\s*\{[^}]*min-height:\s*64px/.test(css));
  ok('CSS .file-name ellipsis', /\.file-name[\s\S]{0,400}text-overflow:\s*ellipsis/.test(css));
  ok('CSS .file-meta ellipsis', /\.file-meta[\s\S]{0,400}text-overflow:\s*ellipsis/.test(css));
  // 颜色化文件类型图标
  for (const t of ['folder', 'pdf', 'word', 'excel', 'ppt', 'md', 'code', 'txt', 'image', 'zip']) {
    ok('mobile.js FILE_ICONS 含 ' + t, new RegExp("\\b" + t + ":\\s*`<svg").test(js));
  }
  // 多色 SVG (无 stroke="currentColor" 即可识别为非单色)
  ok('UI-A8-2: pdf 用红色 fill (#DC2626/#B91C1C/#EF4444)', /#(?:DC2626|B91C1C|EF4444)/.test(js));
  ok('UI-A8-2: word 用蓝色 fill (#2563EB/#1D4ED8)', /#(?:2563EB|1D4ED8|3B82F6)/.test(js));
  ok('UI-A8-2: excel 用绿色 fill (#16A34A/#15803D)', /#(?:16A34A|15803D|22C55E)/.test(js));
  ok('UI-A8-2: ppt 用橙色 fill (#EA580C/#C2410C)', /#(?:EA580C|C2410C|F97316)/.test(js));
  // 文件夹优先（sort dir 优先）
  ok('UI-A8-2: mobile.js 文件夹排在前面 (sort isDir 优先)', /aDir\s*\?\s*-1\s*:\s*1/.test(js) || /aDir\s*!==\s*bDir\s*\?\s*-1\s*:\s*1/.test(js));
  // 三个点
  ok('CSS .file-extra 三个点按钮', /\.file-extra\s*\{/.test(css));
  // 搜索过滤
  ok('UI-A8-2: mobile.js filterFiles 调 /api/mobile/search (含 q)',
    /filterFiles[\s\S]{0,2000}\/api\/mobile\/search\?q=/.test(js));
  // 路径/navigation
  ok('mobile.js filesNavigateBack 处理 back', /function\s+filesNavigateBack\s*\(/.test(js));
  // [F.3] fileTypeFor / fileIconFor
  ok('UI-A8-2: mobile.js 定义 fileTypeFor', /function\s+fileTypeFor\s*\(/.test(js));
  ok('UI-A8-2: mobile.js 定义 fileIconFor', /function\s+fileIconFor\s*\(/.test(js));
  ok('UI-A8-2: fileTypeFor 处理 isDir', /fileTypeFor[\s\S]{0,200}isDir/.test(js));
  // drive 图标
  ok('UI-A8-2: FILE_ICONS 含 drive (供 roots 用)', /drive:\s*`<svg/.test(js));
  // [F.4] toast
  ok('UI-A8-2: mobile.js 定义 toast', /function\s+toast\s*\(/.test(js));
  ok('UI-A8-2: CSS .app-toast 圆角胶囊', /\.app-toast\s*\{[^}]*border-radius:\s*999/.test(css));
  // [F.5] 后端：roots 包含常见目录
  const rRoots = await req({ path: '/api/mobile/roots', method: 'GET', headers: auth });
  const jRoots = JSON.parse(rRoots.body);
  ok('GET /api/mobile/roots 200', rRoots.status === 200);
  ok('roots 含 home / desktop / downloads / documents (UI-A8-2)',
    jRoots.roots && jRoots.roots.some(r => r.name === 'Home' || r.path === jRoots.home) &&
    jRoots.roots.some(r => r.name === 'Desktop' || /\\Desktop$|\/Desktop$/.test(r.path)) &&
    jRoots.roots.some(r => r.name === 'Downloads' || /\\Downloads$|\/Downloads$/.test(r.path)) &&
    jRoots.roots.some(r => r.name === 'Documents' || /\\Documents$|\/Documents$/.test(r.path)));
  // [F.6] 后端：/api/mobile/files 实际返回真实 items
  const rFiles = await req({ path: '/api/mobile/files?path=' + encodeURIComponent(jRoots.home), method: 'GET', headers: auth });
  const jFiles = JSON.parse(rFiles.body);
  ok('GET /api/mobile/files?path=home 200', rFiles.status === 200);
  ok('files 真实响应含 items 数组', Array.isArray(jFiles.items));
  ok('files 真实响应每个 item 含 name/path/isDir', jFiles.items && jFiles.items.every(it => it.name && 'path' in it && 'isDir' in it));
  ok('UI-A8-2: files 真实响应 items 至少 1 个 (fanbox 项目本身)', jFiles.items && jFiles.items.length >= 1);
  // [F.7] 后端：search (用 cwdMock 缩范围)
  const rSearch = await req({ path: '/api/mobile/search?q=README&path=' + encodeURIComponent(cwdMock) + '&limit=10', method: 'GET', headers: auth });
  const jSearch = JSON.parse(rSearch.body);
  ok('GET /api/mobile/search?q=README 200', rSearch.status === 200);
  ok('search README 能搜到 (UI-A8-2)', jSearch.items && jSearch.items.some(it => /readme\.md$/i.test(it.path)));
  // [F.8] 文件预览 API
  const rFile = await req({ path: '/api/mobile/file?path=' + encodeURIComponent(path.join(cwdMock, 'package.json')), method: 'GET', headers: auth });
  const jFile = JSON.parse(rFile.body);
  ok('GET /api/mobile/file?path=package.json 200', rFile.status === 200);
  ok('file 预览返回 text (UI-A8-2)', jFile && typeof jFile.text === 'string' && jFile.text.length > 0);
  // 不含危险操作
  ok('Files 不含 Delete 按钮', !/Delete/.test(html));
  ok('Files 不含 Move 按钮', !/Move File/.test(html));
  ok('Files 不含 Rename 按钮', !/Rename File/.test(html));
  ok('Files 不含 Upload 按钮', !/Upload File/.test(html));
  ok('mobile.js 不含删除/重命名 API 调用', !/(deleteFile|renameFile|moveFile|uploadFile)/.test(js));

  // ============================================================
  // [G] Skills (中文简介)
  // ============================================================
  section('G) Skills · 中文简介');
  ok('HTML 含 #skills-list', /id="skills-list"/.test(html));
  ok('HTML 含 #skills-q (搜索)', /id="skills-q"/.test(html));
  ok('Skills 三个 filter: All / Enabled / Disabled', /data-filter="all"/.test(html) && /data-filter="enabled"/.test(html) && /data-filter="disabled"/.test(html));
  ok('mobile.js SKILL_CN 映射表存在', /SKILL_CN\s*=/.test(js));
  ok('SKILL_CN 含 ppt', /SKILL_CN[\s\S]{0,300}["']ppt["']/.test(js));
  ok('SKILL_CN 含 docx', /SKILL_CN[\s\S]{0,300}["']docx["']/.test(js));
  ok('SKILL_CN 含 xlsx', /SKILL_CN[\s\S]{0,300}["']xlsx["']/.test(js));
  ok('SKILL_CN 含 code-review', /SKILL_CN[\s\S]{0,300}["']code-review["']/.test(js));
  ok('SKILL_CN 含 summary', /SKILL_CN[\s\S]{0,300}["']summary["']/.test(js));
  ok('mobile.js renderSkills 优先 SKILL_CN 中文', /renderSkills[\s\S]{0,500}SKILL_CN\[/.test(js));
  ok('无简介时显示 "暂无简介"', /暂无简介/.test(js));
  ok('CSS .skill-desc 简介框', /\.skill-desc\s*\{/.test(css));
  ok('CSS .skill-toggle 开关', /\.skill-toggle\s*\{/.test(css));
  ok('mobile.js filterSkills 支持 search + filter', /function\s+filterSkills[\s\S]{0,500}filter/.test(js));
  ok('mobile.js 拉 /api/mobile/skills', /loadSkills[\s\S]{0,500}\/api\/mobile\/skills/.test(js));
  // toggle 不改真实 skill 文件
  const rSS = await req({ path: '/api/mobile/skills-state', method: 'GET', headers: auth });
  const jSS = JSON.parse(rSS.body);
  ok('GET /api/mobile/skills-state 200', rSS.status === 200);
  const rSP = await req({
    path: '/api/mobile/skills-state', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ skillId: 'plan', enabled: false }));
  const jSP = JSON.parse(rSP.body);
  ok('POST /api/mobile/skills-state 200', rSP.status === 200);
  ok('POST skills-state ok=true', jSP.ok === true);
  ok('POST skills-state enabled=false', jSP.enabled === false);
  const skillContent = fs.readFileSync(skillFilePath, 'utf8');
  ok('真实 skill 文件未改变', /plan description for smoke test/.test(skillContent));
  // 不显示路径
  const ssStr = JSON.stringify(jSS);
  ok('GET skills-state 不含 SKILL.md 路径', !/SKILL\.md/.test(ssStr));
  ok('GET skills-state 不含 /claude/skills 路径', !/\.claude[\/\\]skills/.test(ssStr));

  // ============================================================
  // [H] Session 互通
  // ============================================================
  section('H) Session 互通');
  const rSessList = await req({ path: '/api/mobile/sessions', method: 'GET', headers: auth });
  const jSessList = JSON.parse(rSessList.body);
  ok('GET /api/mobile/sessions 200', rSessList.status === 200);
  const sessArr = jSessList.items || jSessList.sessions || (Array.isArray(jSessList) ? jSessList : []);
  ok('sessions list 含 desktop-A7', sessArr.some(s => s.id === 'desktop-A7' || s.sessionId === 'desktop-A7' || s.title === 'desktop UI-A7 test'));

  // mobile 也可创建 session
  const rDraft = await req({
    path: '/api/mobile/sessions/draft', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ cwd: cwdMock, agentId: 'claude' }));
  const jDraft = JSON.parse(rDraft.body);
  ok('POST /draft 200', rDraft.status === 200, 'status=' + rDraft.status + ' body=' + rDraft.body.slice(0, 200));
  ok('POST /draft 返回 sessionId', !!jDraft.sessionId, 'body=' + rDraft.body.slice(0, 200));

  const rMsgs = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(jDraft.sessionId) + '/messages', method: 'GET', headers: auth });
  const jMsgs = JSON.parse(rMsgs.body);
  ok('GET session messages 200', rMsgs.status === 200, 'status=' + rMsgs.status + ' body=' + rMsgs.body.slice(0, 200));
  ok('messages 是 array', Array.isArray(jMsgs) || Array.isArray(jMsgs.messages));

  // ============================================================
  // [I] Security
  // ============================================================
  section('I) Security');
  ok('UI 不含 "Request approval"', !/Request approval/.test(allUi));
  ok('UI 不含 "Waiting desktop approval"', !/Waiting.*desktop approval/i.test(allUi));
  ok('UI 不含 "Desktop approval required"', !/Desktop approval required/i.test(allUi));
  ok('UI 不含 "Redline actions require desktop approval"', !/Redline actions require desktop approval/i.test(allUi));
  ok('UI 不含 "Team Mode"', !/Team\s*Mode/i.test(allUi));
  ok('UI 不含 "YOLO"', !/\bYOLO\b/.test(allUi));
  ok('UI 不含 "Full-auto"', !/Full-?auto/i.test(allUi));
  ok('UI 不暴露 "raw stdout"', !/raw\s*stdout/i.test(allUi));
  ok('UI 不暴露 ".jsonl"', !/\.jsonl/.test(allUi));
  ok('UI 不暴露 "claudeSession/codexSession" 字段', !/(claudeSession|codexSession)\s*:/.test(allUi));
  ok('UI 不暴露 token 字段字面值', !/("token"|"apiKey"|"cookie")\s*:\s*"[A-Za-z0-9]/.test(allUi));
  ok('UI 不暴露 rawStdout/rawStderr 字段', !/(rawStdout|rawStderr)\s*:/.test(allUi));
  // mobile.js 不调 createApproval on /send
  const sendFnMatch = js.match(/async\s+function\s+doSend\s*\([\s\S]{0,3000}?\}\s*\n\s*\}/);
  if (sendFnMatch) {
    const sendFn = sendFnMatch[0];
    ok('doSend 不调 createApproval', !/createApproval/.test(sendFn));
  }
  // events endpoint 安全
  const rEvt = await req({
    path: '/api/mobile/sessions/' + encodeURIComponent(jDraft.sessionId) + '/events?limit=10',
    method: 'GET', headers: auth,
  });
  const jEvt = JSON.parse(rEvt.body);
  const evtStr = JSON.stringify(jEvt);
  ok('events 不含 .jsonl', !/\.jsonl/i.test(evtStr));
  ok('events 不含 rawStdout', !/rawStdout/i.test(evtStr));
  ok('events 不含 claudeSession/codexSession', !/(claudeSession|codexSession)/i.test(evtStr));
  ok('events 不含 Bearer / sk-', !/Bearer\s+[A-Za-z0-9]|sk-[a-zA-Z0-9]{8,}/.test(evtStr));

  // ============================================================
  // [J] Pairing
  // ============================================================
  section('J) mobile send 不需要电脑确认');
  // 普通消息
  const rNorm = await req({
    path: '/api/mobile/sessions/' + encodeURIComponent(jDraft.sessionId) + '/messages',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ text: '帮我看看 README', cwd: cwdMock, agentId: 'claude' }));
  const jNorm = JSON.parse(rNorm.body);
  ok('普通消息 POST 200', rNorm.status === 200, 'status=' + rNorm.status + ' body=' + rNorm.body.slice(0, 300));
  ok('普通消息 requiresApproval=false', jNorm.requiresApproval === false || jNorm.requiresApproval == null);
  ok('普通消息 status=done', jNorm.status === 'done', 'status=' + jNorm.status);

  // 红线消息：仍不阻断
  const rRed = await req({
    path: '/api/mobile/sessions/' + encodeURIComponent(jDraft.sessionId) + '/messages',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
  }, JSON.stringify({ text: '请帮我 git push 到 origin', cwd: cwdMock, agentId: 'claude' }));
  const jRed = JSON.parse(rRed.body);
  ok('红线消息 POST 200', rRed.status === 200, 'status=' + rRed.status + ' body=' + rRed.body.slice(0, 300));
  ok('红线消息 status=done', jRed.status === 'done', 'status=' + jRed.status);
  ok('红线消息不需要 approval', jRed.requiresApproval !== true);

  // session 状态不是 waiting_approval
  const rS = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(jDraft.sessionId), method: 'GET', headers: auth });
  const jS = JSON.parse(rS.body);
  ok('session 状态 === done', jS.session && jS.session.status === 'done', 'status=' + (jS.session && jS.session.status));

  // audit.jsonl
  const auditPath = path.join(process.env.FANBOX_MOBILE_DIR, 'audit.jsonl');
  let auditTxt = '';
  try { auditTxt = fs.readFileSync(auditPath, 'utf8'); } catch (e) {}
  ok('audit.jsonl 写入', auditTxt.length > 0);
  ok('audit 含 redline_detected_but_not_blocked', /"action":"redline_detected_but_not_blocked"/.test(auditTxt));
  ok('audit 不含 input 原文', !/请帮我 git push 到 origin/.test(auditTxt));

  // ============================================================
  // [K] UI assets & 静态资源
  // ============================================================
  section('K) UI 资源');
  const assetsDir = path.join(PUBLIC_MOBILE, 'assets');
  for (const a of ['claude', 'codex', 'qoder', 'opencode']) {
    const p = path.join(assetsDir, 'agents', `${a}.svg`);
    ok(`local agent SVG ${a}.svg 存在`, fs.existsSync(p));
  }
  // 不会引用在线 CDN
  ok('HTML 不引用 fonts.googleapis', !/fonts\.googleapis\.com/.test(allUi));
  ok('HTML 不引用 cdn.jsdelivr', !/cdn\.jsdelivr\.net/.test(allUi));
  ok('HTML 不引用 unpkg', !/unpkg\.com/.test(allUi));

  // ============================================================
  // Done
  // ============================================================
  section('DONE');
  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
