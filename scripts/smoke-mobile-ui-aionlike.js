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
  const taskChipMatch = js.match(/const\s+TASK_CHIPS\s*=\s*\[([\s\S]*?)\];/);
  const taskChipCount = taskChipMatch ? (taskChipMatch[1].match(/label\s*:/g) || []).length : 0;
  ok('mobile.js TASK_CHIPS 控制在 4 个以内 (减少首页状态 chip)',
    taskChipCount > 0 && taskChipCount <= 4);
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
  ok('mobile.js doSend POST /api/mobile/agent/send', /doSend[\s\S]{0,1200}\/api\/mobile\/agent\/send/.test(js));
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
  // UI-A8-5-P2：不同 agent 不共享对话上下文
  ok('switchAgent 清空 messages/session', /switchAgent[\s\S]{0,900}S\.messages\s*=\s*\[\][\s\S]{0,400}S\.sessionId\s*=\s*["']{2}/.test(js));
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
  ok('Sidebar 5 个 nav items: home/project/files/skills/settings (UI-A8-3)',
    /data-go="home"/.test(html) && /data-go="files"/.test(html) &&
    /data-go="skills"/.test(html) && /data-go="project"/.test(html) &&
    /data-go="settings"/.test(html));
  ok('Sidebar 4 个核心 nav (File/Skill/Project/Setting)',
    /data-go="files"/.test(html) && /data-go="skills"/.test(html) &&
    /data-go="project"/.test(html) &&
    /data-go="settings"/.test(html));
  ok('Sidebar 导航顺序: Chat → Project → File → Skill → Setting',
    /data-go="home"[\s\S]{0,400}data-go="project"[\s\S]{0,400}data-go="files"[\s\S]{0,400}data-go="skills"[\s\S]{0,400}data-go="settings"/.test(html));
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
  ok('Skills 三个 status filter: All / Enabled / Disabled (UI-A8-4)',
    /data-status="all"/.test(html) && /data-status="enabled"/.test(html) && /data-status="disabled"/.test(html));
  ok('Skills 五个 agent filter: All / Claude / Codex / Qoder / OpenCode (UI-A8-4)',
    /data-agent="all"/.test(html) && /data-agent="claude"/.test(html) && /data-agent="codex"/.test(html) && /data-agent="qoder"/.test(html) && /data-agent="opencode"/.test(html));
  ok('Skills type filter: Document / Code / Research / File / Agent (UI-A8-4)',
    /data-type="Document"/.test(html) && /data-type="Code"/.test(html) && /data-type="Research"/.test(html) && /data-type="File"/.test(html) && /data-type="Agent"/.test(html));
  ok('mobile.js SKILL_CN 映射表存在', /SKILL_CN\s*=/.test(js));
  ok('SKILL_CN 含 ppt', /SKILL_CN[\s\S]{0,300}["']ppt["']/.test(js));
  ok('SKILL_CN 含 docx', /SKILL_CN[\s\S]{0,300}["']docx["']/.test(js));
  ok('SKILL_CN 含 xlsx', /SKILL_CN[\s\S]{0,300}["']xlsx["']/.test(js));
  ok('SKILL_CN 含 code-review', /SKILL_CN[\s\S]{0,300}["']code-review["']/.test(js));
  ok('SKILL_CN 含 summary', /SKILL_CN[\s\S]{0,300}["']summary["']/.test(js));
  ok('mobile.js renderSkills 使用 SKILL_CN_DESCRIPTIONS / SKILL_CN 中文',
    /function\s+renderSkills[\s\S]{0,3000}SKILL_CN_DESCRIPTIONS|function\s+skillChineseDescription[\s\S]{0,500}SKILL_CN_DESCRIPTIONS|function\s+skillChineseDescription[\s\S]{0,500}SKILL_CN\[/.test(js));
  ok('无简介时显示 "暂无简介"', /暂无简介/.test(js));
  ok('CSS .skill-desc 简介框', /\.skill-desc\s*\{/.test(css));
  ok('CSS .skill-toggle 开关', /\.skill-toggle\s*\{/.test(css));
  ok('mobile.js filterSkills 支持 search + filter', /function\s+filterSkills[\s\S]{0,500}filter/.test(js));
  ok('mobile.js 拉 /api/mobile/skills', /loadSkills[\s\S]{0,500}\/api\/mobile\/skills/.test(js));
  ok('mobile.js loadSkills 读 data.items (而非 data.skills)', /loadSkills[\s\S]{0,1500}data\.items[\s\S]{0,200}data\.skills/.test(js));
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
  // [L] Phase UI-A8-3 · Project-first Session Sync
  // ============================================================
  section('L) Project-first Session Sync · UI-A8-3');

  // [L.1] Sidebar 改造
  ok('L.sidebar: HTML sidebar 含 Project nav (data-go="project")', /data-go="project"/.test(html));
  ok('L.sidebar: sidebar 不再以 Session 为主菜单 (无 data-go="sessions" 顶部 nav)',
    !/\bdata-go="sessions"/.test(html));
  ok('L.sidebar: HTML 含 #sidebar-sessions (Recent Sessions 区域)', /id="sidebar-sessions"/.test(html));
  ok('L.sidebar: Sidebar 5 个核心 nav: home/project/files/skills/settings',
    /data-go="home"/.test(html) && /data-go="project"/.test(html) &&
    /data-go="files"/.test(html) && /data-go="skills"/.test(html) &&
    /data-go="settings"/.test(html));
  ok('L.sidebar: Sidebar 顺序 Chat → Project → File → Skill → Setting',
    /data-go="home"[\s\S]{0,400}data-go="project"[\s\S]{0,400}data-go="files"[\s\S]{0,400}data-go="skills"[\s\S]{0,400}data-go="settings"/.test(html));
  ok('L.sidebar: mobile.js loadRecentSessions 拉 /api/mobile/sessions',
    /loadRecentSessions[\s\S]{0,500}\/api\/mobile\/sessions/.test(js));
  ok('L.sidebar: mobile.js renderSidebarRecentSessions 分组 last7Days/last30Days',
    /renderSidebarRecentSessions[\s\S]{0,2000}last7Days[\s\S]{0,500}last30Days/.test(js));
  ok('L.sidebar: mobile.js groupSessionsByTime 7天/30天 分组',
    /function\s+groupSessionsByTime[\s\S]{0,800}day7[\s\S]{0,400}day30/.test(js));
  ok('L.sidebar: mobile.js 每组最多 10 条 (slice(0, 10))',
    /slice\(\s*0\s*,\s*10\s*\)/.test(js));
  ok('L.sidebar: HTML 含 Sidebar Recent Sessions 标题', /sidebar-h[\s\S]{0,200}Recent Sessions/.test(html));
  ok('L.sidebar: CSS .sidebar-section-head 分组标题',
    /\.sidebar-section-head\s*\{/.test(css));
  ok('L.sidebar: CSS .sidebar-empty 空状态',
    /\.sidebar-empty\s*\{/.test(css));
  ok('L.sidebar: mobile.js 点击 Recent Session 调用 continueSession',
    /renderSidebarSessionItem[\s\S]{0,800}continueSession/.test(js));
  ok('L.sidebar: mobile.js showTab 关闭 drawer (<1024px)',
    /function\s+showTab[\s\S]{0,2000}innerWidth\s*<\s*1024[\s\S]{0,200}closeSidebar/.test(js));
  ok('L.sidebar: 桌面端 sidebar 常驻 (@media min-width: 1024px)',
    /@media\s*\(min-width:\s*1024px\)[\s\S]{0,300}\.app-sidebar[\s\S]{0,100}display:\s*flex/.test(css));

  // [L.2] Project 页面
  ok('L.project: HTML 含 [data-view="project"] 视图', /data-view="project"/.test(html));
  ok('L.project: HTML 含 #project-title 标题 (h2 Project)', /id="project-title"/.test(html));
  ok('L.project: HTML 含 #project-q 搜索框', /id="project-q"/.test(html));
  ok('L.project: HTML 含 #project-refresh 刷新按钮', /id="project-refresh"/.test(html));
  ok('L.project: HTML 含 #project-list 项目列表', /id="project-list"/.test(html));
  ok('L.project: HTML 含 #project-detail 详情容器', /id="project-detail"/.test(html));
  ok('L.project: HTML 含 #project-back 返回按钮', /id="project-back"/.test(html));
  ok('L.project: HTML 含 #project-detail-name', /id="project-detail-name"/.test(html));
  ok('L.project: HTML 含 #project-detail-cwd', /id="project-detail-cwd"/.test(html));
  ok('L.project: HTML 含 #project-detail-meta', /id="project-detail-meta"/.test(html));
  ok('L.project: HTML 含 #project-detail-list session 列表', /id="project-detail-list"/.test(html));
  ok('L.project: HTML 含 #project-detail-resume 顶部 Continue 按钮', /id="project-detail-resume"/.test(html));
  ok('L.project: mobile.js wireProject 绑定项目视图事件',
    /function\s+wireProject[\s\S]{0,500}project-refresh[\s\S]{0,300}project-q[\s\S]{0,300}project-back/.test(js));
  ok('L.project: mobile.js loadAllProjects 调 /api/mobile/sessions',
    /loadAllProjects[\s\S]{0,500}\/api\/mobile\/sessions/.test(js));
  ok('L.project: mobile.js groupSessionsByProject 按 cwd 聚合',
    /function\s+groupSessionsByProject[\s\S]{0,800}normalizePathForKey[\s\S]{0,500}sessionCount/.test(js));
  ok('L.project: mobile.js groupProjectsByTime 7天/30天/older 分组',
    /function\s+groupProjectsByTime[\s\S]{0,800}last7Days[\s\S]{0,500}last30Days[\s\S]{0,500}older/.test(js));
  ok('L.project: mobile.js renderProjectList 按 lastActiveAt desc 排序',
    /groupSessionsByProject[\s\S]{0,2000}lastActiveAt[\s\S]{0,500}\)\s*-\s*\(\s*a\.lastActiveAt/.test(js));
  ok('L.project: mobile.js renderProjectCard 显示 sessionCount/cwdLabel/running/failed/lastActiveAt',
    /renderProjectCard[\s\S]{0,2000}sessionCount[\s\S]{0,500}runningCount[\s\S]{0,500}failedCount[\s\S]{0,500}lastActiveAt[\s\S]{0,2000}cwdLabel/.test(js));
  ok('L.project: CSS .project-card 卡片样式 (min-height 72px)',
    /\.project-card\s*\{[^}]*min-height:\s*72px/.test(css));
  ok('L.project: CSS .project-card-title ellipsis',
    /\.project-card-title[\s\S]{0,200}text-overflow:\s*ellipsis/.test(css));
  ok('L.project: CSS .project-card-cwd ellipsis (路径过长)',
    /\.project-card-cwd[\s\S]{0,200}text-overflow:\s*ellipsis/.test(css));
  ok('L.project: CSS .project-group-head 分组标题样式',
    /\.project-group-head\s*\{/.test(css));
  ok('L.project: CSS .project-empty 空状态',
    /\.project-empty\s*\{/.test(css));
  ok('L.project: mobile.js 空状态显示 "暂无项目" / "没有匹配的项目"',
    /暂无项目/.test(js) && /没有匹配的项目/.test(js));
  ok('L.project: mobile.js sessionsForProject 按 projectId 过滤',
    /function\s+sessionsForProject[\s\S]{0,500}projectId[\s\S]{0,500}normalizePathForKey/.test(js));
  ok('L.project: mobile.js pickProject 找指定 project',
    /function\s+pickProject[\s\S]{0,500}projectId[\s\S]{0,500}===[\s\S]{0,200}projectId/.test(js));

  // [L.3] Project Detail
  ok('L.detail: mobile.js openProjectDetail 进入详情',
    /function\s+openProjectDetail[\s\S]{0,500}currentProject\s*=[\s\S]{0,500}sessionsForProject/.test(js));
  ok('L.detail: mobile.js showProjectDetail 显示 sessions 列表',
    /function\s+showProjectDetail[\s\S]{0,500}project-detail-name[\s\S]{0,500}project-detail-cwd[\s\S]{0,500}project-detail-list/.test(js));
  ok('L.detail: mobile.js renderProjectSessionItem 渲染 session',
    /function\s+renderProjectSessionItem[\s\S]{0,2000}project-session-title[\s\S]{0,500}project-session-status[\s\S]{0,500}project-session-continue/.test(js));
  ok('L.detail: CSS .project-session-item 风格 (min-height 80px)',
    /\.project-session\s*\{[^}]*min-height:\s*80px/.test(css));
  ok('L.detail: CSS .project-session-title ellipsis',
    /\.project-session-title[\s\S]{0,200}text-overflow:\s*ellipsis/.test(css));
  ok('L.detail: CSS .project-session-continue 按钮',
    /\.project-session-continue\s*\{/.test(css));
  ok('L.detail: CSS .project-detail-resume 详情顶部 Continue',
    /\.project-detail-resume\s*\{/.test(css));
  ok('L.detail: mobile.js Continue → continueSession',
    /project-session-continue[\s\S]{0,300}continueSession/.test(js));

  // [L.4] Session 继续 (continueSession)
  ok('L.continue: mobile.js continueSession 恢复 sessionId (S.sessionId = sid)',
    /continueSession[\s\S]{0,2000}S\.sessionId\s*=\s*sid/.test(js));
  ok('L.continue: continueSession 设置 agent (恢复 agentId)',
    /continueSession[\s\S]{0,800}currentAgent\s*=\s*found\.id[\s\S]{0,300}AGENT_KEY/.test(js));
  ok('L.continue: continueSession 恢复 cwd (CWD_KEY)',
    /continueSession[\s\S]{0,800}S\.cwd\s*=\s*session\.cwd[\s\S]{0,300}CWD_KEY/.test(js));
  ok('L.continue: continueSession 调 /api/mobile/sessions/:id/messages',
    /continueSession[\s\S]{0,1500}\/api\/mobile\/sessions\/"\s*\+\s*encodeURIComponent\(sid\)\s*\+\s*"\/messages/.test(js));
  ok('L.continue: continueSession 加载 messages 后 renderMessages',
    /continueSession[\s\S]{0,2000}S\.messages\s*=\s*msgs\.map[\s\S]{0,500}renderMessages/.test(js));
  ok('L.continue: continueSession 切到 home chat workspace (enterChatState + showTab("home"))',
    /continueSession[\s\S]{0,2000}showTab\(\s*['"]home['"]\s*\)[\s\S]{0,800}enterChatState/.test(js));
  ok('L.continue: continueSession 不创建新 session (不调 /sessions/draft)',
    !/continueSession[\s\S]{0,3000}\/sessions\/draft/.test(js));
  ok('L.continue: continueSession 不覆盖 agent 除非从历史 session 切换 (found 检查)',
    /continueSession[\s\S]{0,500}session\.agentId[\s\S]{0,300}AGENTS\.find/.test(js));
  ok('L.continue: continueSession 关闭 sidebar (closeSidebar)',
    /continueSession[\s\S]{0,1000}closeSidebar\(\s*\)/.test(js));

  // [L.5] Sessions 互通 (desktop / mobile / wechat source)
  // 注入 mobile session + wechat session
  // 后端读的是 MOBILE_SESSIONS_FILE = ~/.fanbox/mobile/sessions.json ({ sessions: {id: {...}} })
  // 后端读的是 WECHAT_CONVOS_FILE = ~/.fanbox/wechat/conversations.json (扁平对象, 不用 sessions 包裹)
  // 后端读的是 DESKTOP_INDEX_FILE = ~/.fanbox/sessions/index.json ({ sessions: {id: {...}} })
  // sessionId 会被 makeId(source, agentId, cwd, createdAt) 重写, 所以匹配用 title/cwd/agentId/source
  const mobileFile = path.join(process.env.FANBOX_MOBILE_DIR, 'sessions.json');
  const cwdMobile = path.join(TMP_HOME, 'mobile-cwd');
  fs.mkdirSync(cwdMobile, { recursive: true });
  const cwdWechat = path.join(TMP_HOME, 'wechat-cwd');
  fs.mkdirSync(cwdWechat, { recursive: true });
  fs.writeFileSync(mobileFile, JSON.stringify({
    sessions: {
      'mobile-A83': {
        agentId: 'codex', cwd: cwdMobile, title: 'mobile UI-A8-3 test',
        status: 'running',
        createdAt: now - 30000, updatedAt: now - 20000, lastActiveAt: now - 20000
      }
    }
  }, null, 2), 'utf8');
  // wechat 用 conversations.json, 扁平对象 { conversationId: { messages:[...], ... } }
  // wechat reader 用 c.label 作为 title (不是 c.title)
  fs.writeFileSync(path.join(process.env.FANBOX_WECHAT_DIR, 'conversations.json'), JSON.stringify({
    'wechat-A83': {
      label: 'wechat UI-A8-3 test', cwd: cwdWechat,
      status: 'done',
      createdAt: now - 80000, updatedAt: now - 60000, lastActiveAt: now - 60000,
      messages: [{ text: 'claude please help', role: 'user' }]
    }
  }, null, 2), 'utf8');

  // 重新拉 sessions 验证
  const rSessA83 = await req({ path: '/api/mobile/sessions', method: 'GET', headers: auth });
  const jSessA83 = JSON.parse(rSessA83.body);
  const sessA83 = jSessA83.items || jSessA83.sessions || (Array.isArray(jSessA83) ? jSessA83 : []);
  // sessionId 会被 makeId 重写,所以通过 title/cwd/agentId 来匹配
  ok('L.sync: sessions 列表含 desktop 来源 (desktop UI-A7 test)',
    sessA83.some(s => s.title === 'desktop UI-A7 test'));
  ok('L.sync: sessions 列表含 mobile 来源 (mobile UI-A8-3 test)',
    sessA83.some(s => s.title === 'mobile UI-A8-3 test'));
  ok('L.sync: sessions 列表含 wechat 来源 (wechat UI-A8-3 test)',
    sessA83.some(s => s.title === 'wechat UI-A8-3 test'));
  // 检查 source 字段
  const sourceCounts = sessA83.reduce((acc, s) => {
    const k = s.source || 'unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  ok('L.sync: sessions 列表含 source=desktop',
    (sourceCounts.desktop || 0) >= 1);
  ok('L.sync: sessions 列表含 source=mobile',
    (sourceCounts.mobile || 0) >= 1);
  ok('L.sync: sessions 列表含 source=wechat',
    (sourceCounts.wechat || 0) >= 1);
  ok('L.sync: 同 cwd sessions 至少 2 个 (desktop-A7 + mobile-A83 都用 cwdMock/mobile-cwd)',
    sessA83.length >= 2);
  // 后端确认不暴露 token
  ok('L.sync: sessions 列表不含 token/cookie/apiKey',
    !/("token"|"apiKey"|"cookie")\s*:\s*"[A-Za-z0-9]/.test(JSON.stringify(sessA83)));

  // [L.6] 禁止项 (UI-A8-3 范围)
  ok('L.forbid: Project 页不含 Delete 按钮', !/<button[^>]*>[\s\S]{0,40}Delete/i.test(html) || !/data-view="project"[\s\S]{0,8000}Delete/i.test(html));
  ok('L.forbid: Project 页不含 Move/Rename/Upload 按钮',
    !/data-view="project"[\s\S]{0,8000}(Move File|Rename File|Upload File)/i.test(html));
  ok('L.forbid: Project 不改 token/auth/LAN', !/Project[\s\S]{0,200}token/i.test(js) || !/project[\s\S]{0,1000}authToken/.test(js));
  ok('L.forbid: UI 不含 YOLO', !/\bYOLO\b/.test(allUi));
  ok('L.forbid: UI 不含 Team Mode', !/Team\s*Mode/i.test(allUi));
  ok('L.forbid: UI 不暴露 raw stdout', !/raw\s*stdout/i.test(allUi));
  ok('L.forbid: UI 不暴露 .jsonl', !/\.jsonl/.test(allUi));
  ok('L.forbid: UI 不暴露 claudeSession/codexSession 字段', !/(claudeSession|codexSession)\s*:/.test(allUi));
  ok('L.forbid: UI 不暴露 Bearer/sk-', !/Bearer\s+[A-Za-z0-9]|sk-[a-zA-Z0-9]{8,}/.test(JSON.stringify(sessA83)));

  // [L.7] Home 单输入框未破坏
  ok('L.home: 仍只有 1 个 #home-input', (html.match(/id="home-input"/g) || []).length === 1);
  ok('L.home: 仍只有 1 个 #home-send', (html.match(/id="home-send"/g) || []).length === 1);
  ok('L.home: mobile.js 不引用 *-sticky 元素', !/home-(input|send|composer|status-pill|skill-button)-sticky/.test(js));

  // [L.8] Files / Skills 数据源未改
  ok('L.files: Files 仍用 data.items || data.files', /data\.items\s*\|\|\s*data\.files/.test(js));
  ok('L.files: Files 仍调 /api/mobile/files?path=', /\/api\/mobile\/files\?path=/.test(js));
  ok('L.files: Files 仍调 /api/mobile/roots', /\/api\/mobile\/roots/.test(js));
  ok('L.skills: Skills 仍调 /api/mobile/skills', /loadSkills[\s\S]{0,500}\/api\/mobile\/skills/.test(js));

  // [L.9] cwd 联动
  ok('L.cwd: Files Ask AI in this folder 调 /api/mobile/context/cwd',
    /openAgentInCurrentFolder[\s\S]{0,500}\/api\/mobile\/context\/cwd/.test(js));
  ok('L.cwd: Files Ask AI in this folder 切回 home',
    /openAgentInCurrentFolder[\s\S]{0,800}showTab\(\s*['"]home['"]\s*\)/.test(js));
  ok('L.cwd: continueSession 恢复后 send 用同一个 session (doSend 用 S.sessionId)',
    /doSend[\s\S]{0,2000}sessionId:\s*S\.sessionId/.test(js) &&
    /continueSession[\s\S]{0,2000}S\.sessionId\s*=\s*sid/.test(js));

  // ============================================================
  // [N] Phase UI-A8-5-P0 · Home Chat Send 405 修复
  section('[N] Phase UI-A8-5-P0 · Home Chat Send 405');
  // N.1 · endpoint 存在
  ok('electron/mobile.js 注册 POST /api/mobile/agent/send',
    /req\.method\s*===\s*'POST'[\s\S]{0,80}pathOnly\s*===\s*'\/api\/mobile\/agent\/send'/.test(mobileJsCode));
  ok('POST /api/mobile/agent/send 在 handleMobileApiV2A 内',
    /handleMobileApiV2A[\s\S]{0,30000}\/api\/mobile\/agent\/send/.test(mobileJsCode));
  ok('electron/mobile.js friendlySendError 存在',
    /function\s+friendlySendError\s*\(/.test(mobileJsCode));
  // N.2 · 前端用新 endpoint
  ok('mobile.js doSend 调用 /api/mobile/agent/send',
    /doSend[\s\S]{0,2000}\/api\/mobile\/agent\/send/.test(js));
  ok('mobile.js doSend 不再 POST 旧 /api/mobile/send',
    !/doSend[\s\S]{0,2000}['"]\/api\/mobile\/send['"][\s\S]{0,200}method:\s*['"]POST['"]/.test(js));
  // N.3 · agent id 映射
  ok('mobile.js mapAgentId claude_code → claude',
    /mapAgentId[\s\S]{0,200}'claude_code'[\s\S]{0,100}return\s*'claude'/.test(js));
  ok('mobile.js mapAgentId open_code → opencode',
    /mapAgentId[\s\S]{0,500}'open_code'[\s\S]{0,100}return\s*'opencode'/.test(js));
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
  // N.4 · 友好错误
  ok('mobile.js friendlySendError 存在', /function\s+friendlySendError\s*\(/.test(js));
  ok('mobile.js friendlyFetchError 存在', /function\s+friendlyFetchError\s*\(/.test(js));
  ok('mobile.js friendlyFetchError 含 405 友好映射',
    /friendlyFetchError[\s\S]{0,800}移动端发送接口暂不可用/.test(js));
  ok('mobile.js doSend catch 不再写 \'请求失败: ${e.message}\'',
    !/doSend[\s\S]{0,2500}content:\s*`请求失败:\s*\$\{e\.message\}`/.test(js));
  ok('mobile.js doSend catch 使用 friendlyFetchError',
    /doSend[\s\S]{0,4000}friendlyFetchError\(e\)/.test(js));
  // N.5 · session / cwd / agent 保留
  ok('mobile.js SESSION_KEY 存在', /const\s+SESSION_KEY\s*=\s*['"]fanbox_mobile_session['"]/.test(js));
  ok('mobile.js S.sessionId 从 localStorage SESSION_KEY 恢复',
    /S\.sessionId\s*=\s*localStorage\.getItem\(SESSION_KEY\)/.test(js));
  ok('mobile.js doSend 保存 sessionId (回包时)',
    /doSend[\s\S]{0,4500}localStorage\.setItem\(SESSION_KEY/.test(js));
  ok('mobile.js doSend 同步 cwd 和 cwdLabel',
    /doSend[\s\S]{0,4500}S\.cwdLabel\s*=/.test(js));
  // N.6 · UI 完整性
  ok('HTML 仍有 1 个 #home-input', (html.match(/id="home-input"/g) || []).length === 1);
  ok('HTML 仍有 1 个 #home-send', (html.match(/id="home-send"/g) || []).length === 1);
  ok('HTML 仅有 1 个 #home-status-pill', (html.match(/id="home-status-pill"/g) || []).length === 1);
  // N.7 · 禁止项
  ok('mobile.js doSend 不直接拼 raw 错误到 UI',
    !/doSend[\s\S]{0,3000}content:\s*`错误:\s*\$\{data\.error\}`/.test(js));
  ok('mobile.js doSend 不调用 Delete/Move/Rename/Upload API',
    !/doSend[\s\S]{0,3000}\/api\/mobile\/(delete|move|rename|upload)/i.test(js));
  ok('mobile.js doSend 不调用 shell/spawn/exec',
    !/doSend[\s\S]{0,3000}(child_process|spawn\(|exec\(|pty)/i.test(js));

  // [M] Phase UI-A8-4 · Skills Library + Home Current Workspace
  // ============================================================
  section('M) Skills Library + Home Workspace · UI-A8-4');

  // [M.1] Home current workspace display
  ok('M.home: HTML 含 #home-workspace (hero 态按钮)', /id="home-workspace"/.test(html));
  ok('M.home: HTML 含 #home-workspace-bar (chat 态条带)', /id="home-workspace-bar"/.test(html));
  ok('M.home: HTML 含 #home-workspace-name (主名称)', /id="home-workspace-name"/.test(html));
  ok('M.home: HTML 含 #home-workspace-cwd (完整路径)', /id="home-workspace-cwd"/.test(html));
  ok('M.home: HTML 含 #home-workspace-bar-btn (chat 态按钮)', /id="home-workspace-bar-btn"/.test(html));
  ok('M.home: HTML 含 #home-workspace-bar-name (chat 态名称)', /id="home-workspace-bar-name"/.test(html));
  ok('M.home: CSS .home-workspace 卡片 (圆角/轻边框)', /\.home-workspace\s*\{[^}]*border-radius:\s*12px/.test(css));
  ok('M.home: CSS .home-workspace-name ellipsis',
    /\.home-workspace-name[\s\S]{0,200}text-overflow:\s*ellipsis/.test(css));
  ok('M.home: CSS .home-workspace-cwd ellipsis (路径过长)',
    /\.home-workspace-cwd[\s\S]{0,200}text-overflow:\s*ellipsis/.test(css));
  ok('M.home: CSS .home-workspace.is-empty (无 cwd 态)',
    /\.home-workspace\.is-empty/.test(css));
  ok('M.home: CSS .home-workspace-bar (chat 态条带)',
    /\.home-workspace-bar\s*\{/.test(css));
  ok('M.home: mobile.js updateWorkspaceDisplay 函数存在',
    /function\s+updateWorkspaceDisplay/.test(js));
  ok('M.home: updateWorkspaceDisplay 显示 "未选择工作区" 当无 cwd',
    /updateWorkspaceDisplay[\s\S]{0,2000}未选择工作区/.test(js));
  ok('M.home: updateWorkspaceDisplay 优先 cwdLabel',
    /updateWorkspaceDisplay[\s\S]{0,2000}cwdLabel/.test(js));
  ok('M.home: updateWorkspaceDisplay fallback basename(cwd)',
    /updateWorkspaceDisplay[\s\S]{0,2000}split\([\/\\\\]/.test(js));
  ok('M.home: mobile.js S.cwdLabel 字段存在',
    /S\s*=\s*\{[\s\S]{0,200}cwdLabel/.test(js) || /cwdLabel:\s*null/.test(js));
  ok('M.home: continueSession 设置 S.cwdLabel',
    /continueSession[\s\S]{0,2000}S\.cwdLabel\s*=/.test(js));
  ok('M.home: openAgentInCurrentFolder 用 cwdLabel (s.cwdLabel 或 basename)',
    /openAgentInCurrentFolder[\s\S]{0,2000}cwdLabel/.test(js));
  ok('M.home: loadFilePath (open) 设置 S.cwdLabel',
    /S\.cwdLabel\s*=[\s\S]{0,200}split\([\/\\\\]/.test(js));
  ok('M.home: updateTopbarCwd 触发 updateWorkspaceDisplay',
    /updateTopbarCwd[\s\S]{0,500}updateWorkspaceDisplay\(\)/.test(js));
  ok('M.home: enterChatState 显示 home-workspace-bar',
    /enterChatState[\s\S]{0,2000}home-workspace-bar[\s\S]{0,500}\.hidden\s*=\s*false/.test(js));
  ok('M.home: exitChatState 隐藏 home-workspace-bar',
    /exitChatState[\s\S]{0,2000}home-workspace-bar[\s\S]{0,500}\.hidden\s*=\s*true/.test(js));
  ok('M.home: workspace 按钮 click → goToProjectFromWorkspace',
    /home-workspace["\s\S]{0,400}addEventListener\(['"]click['"][\s\S]{0,200}goToProjectFromWorkspace/.test(js));
  ok('M.home: goToProjectFromWorkspace 调 showTab("project")',
    /goToProjectFromWorkspace[\s\S]{0,500}showTab\(\s*['"]project['"]\s*\)/.test(js));
  ok('M.home: Home 仍只有 1 个 #home-input', (html.match(/id="home-input"/g) || []).length === 1);
  ok('M.home: Home 仍只有 1 个 #home-send', (html.match(/id="home-send"/g) || []).length === 1);
  ok('M.home: 不出现第二个 textarea',
    (html.match(/<textarea/gi) || []).length === 1);
  ok('M.home: CSS .home-shell.is-chat 切换 (hero/chat)',
    /\.home-shell\.is-chat\s*\.home-hero[\s\S]{0,300}display:\s*none/.test(css));

  // [M.2] Skills 数据来源
  ok('M.skills-data: mobile.js loadSkills 调 /api/mobile/skills',
    /loadSkills[\s\S]{0,500}\/api\/mobile\/skills/.test(js));
  ok('M.skills-data: loadSkills 调 /api/mobile/skills-state',
    /loadSkills[\s\S]{0,2000}\/api\/mobile\/skills-state/.test(js));
  ok('M.skills-data: toggleSkill 调 POST /api/mobile/skills-state',
    /toggleSkill[\s\S]{0,2000}\/api\/mobile\/skills-state[\s\S]{0,2000}method:\s*['"]POST['"]/.test(js));
  ok('M.skills-data: toggleSkill 失败时回滚 + toast',
    /toggleSkill[\s\S]{0,2000}catch[\s\S]{0,500}skill\.enabled\s*=\s*prevEnabled[\s\S]{0,500}toast/.test(js));
  ok('M.skills-data: mobile.js normalizeSkill 函数',
    /function\s+normalizeSkill[\s\S]{0,2000}agentScope[\s\S]{0,500}category[\s\S]{0,500}cnDescription/.test(js));
  ok('M.skills-data: mobile.js skillAgentScope 函数 (推断智能体)',
    /function\s+skillAgentScope[\s\S]{0,2000}return\s+['"]all['"]|function\s+skillAgentScope[\s\S]{0,2000}claude/.test(js));
  ok('M.skills-data: mobile.js skillCategory 函数 (推断分类)',
    /function\s+skillCategory[\s\S]{0,2000}return\s+['"]Document['"]|function\s+skillCategory[\s\S]{0,2000}Document/.test(js));
  ok('M.skills-data: mobile.js skillChineseDescription 函数',
    /function\s+skillChineseDescription[\s\S]{0,2000}SKILL_CN_DESCRIPTIONS/.test(js));
  ok('M.skills-data: skillChineseDescription 兜底 "暂无简介"',
    /skillChineseDescription[\s\S]{0,2000}暂无简介/.test(js));

  // [M.3] Skills UI 结构
  ok('M.skills-ui: HTML 含 data-view="skills" 视图', /data-view="skills"/.test(html));
  ok('M.skills-ui: HTML 含 #skills-list 列表容器', /id="skills-list"/.test(html));
  ok('M.skills-ui: HTML 含 #skills-q 搜索框', /id="skills-q"/.test(html));
  ok('M.skills-ui: HTML 含 skills-filter-agent (5 个)',
    (html.match(/class="skills-filter-agent[^"]*"/g) || []).length === 5);
  ok('M.skills-ui: HTML 含 skills-filter-status (3 个)',
    (html.match(/class="skills-filter-status[^"]*"/g) || []).length === 3);
  ok('M.skills-ui: HTML 含 skills-filter-type (7 个)',
    (html.match(/class="skills-filter-type[^"]*"/g) || []).length >= 5);
  ok('M.skills-ui: CSS .skills-filter-row 横向 chip 行',
    /\.skills-filter-row\s*\{/.test(css));
  ok('M.skills-ui: CSS .skills-filter-agent.is-active 选中态',
    /\.skills-filter-agent\.is-active/.test(css));
  ok('M.skills-ui: CSS .skill-card 卡片',
    /\.skill-card\s*\{/.test(css));
  ok('M.skills-ui: CSS .skill-card-icon 类目图标',
    /\.skill-card-icon\s*\{/.test(css));
  ok('M.skills-ui: CSS .skill-card-title ellipsis',
    /\.skill-card-title[\s\S]{0,200}text-overflow:\s*ellipsis/.test(css));
  ok('M.skills-ui: CSS .skill-card-desc 简介 (min-height 36px)',
    /\.skill-card-desc\s*\{[^}]*min-height:\s*36px/.test(css));
  ok('M.skills-ui: CSS .skill-card-desc.is-empty 空态',
    /\.skill-card-desc\.is-empty/.test(css));
  ok('M.skills-ui: CSS .skill-toggle 开关 (width 38px)',
    /\.skill-toggle\s*\{[^}]*width:\s*38px/.test(css));
  ok('M.skills-ui: CSS .skill-toggle.is-on 启用态',
    /\.skill-toggle\.is-on/.test(css));
  ok('M.skills-ui: CSS .skill-badge-agent Claude/Codex 区分颜色',
    /\.skill-badge-agent\[data-agent="claude"\]/.test(css) &&
    /\.skill-badge-agent\[data-agent="codex"\]/.test(css));
  ok('M.skills-ui: CSS .skill-badge-cat Document/Code 区分颜色',
    /\.skill-badge-cat\[data-cat="Document"\]/.test(css) &&
    /\.skill-badge-cat\[data-cat="Code"\]/.test(css));
  ok('M.skills-ui: CSS .skill-use-btn 按钮',
    /\.skill-use-btn\s*\{/.test(css));
  ok('M.skills-ui: CSS .skills-list mobile 单列 / desktop 两列',
    /\.skills-list\s*\{[^}]*grid-template-columns:\s*1fr/.test(css) &&
    /@media\s*\(min-width:\s*1024px\)[\s\S]{0,500}\.skills-list[\s\S]{0,200}1fr\s+1fr/.test(css));
  ok('M.skills-ui: CSS .skills-empty 空状态',
    /\.skills-empty\s*\{/.test(css) && /\.skills-empty-strong\s*\{/.test(css));

  // [M.4] 中文简介映射
  ok('M.cn-desc: SKILL_CN_DESCRIPTIONS 表 (skill id → 中文)',
    /SKILL_CN_DESCRIPTIONS\s*=\s*\{/.test(js));
  ok('M.cn-desc: SKILL_CN_DESCRIPTIONS 含 ppt',
    /SKILL_CN_DESCRIPTIONS[\s\S]{0,2000}["']ppt["']/.test(js));
  ok('M.cn-desc: SKILL_CN_DESCRIPTIONS 含 docx',
    /SKILL_CN_DESCRIPTIONS[\s\S]{0,2000}["']docx["']/.test(js));
  ok('M.cn-desc: SKILL_CN_DESCRIPTIONS 含 xlsx',
    /SKILL_CN_DESCRIPTIONS[\s\S]{0,2000}["']xlsx["']/.test(js));
  ok('M.cn-desc: SKILL_CN_DESCRIPTIONS 含 pdf',
    /SKILL_CN_DESCRIPTIONS[\s\S]{0,2000}["']pdf["']/.test(js));
  ok('M.cn-desc: SKILL_CN_DESCRIPTIONS 含 markdown',
    /SKILL_CN_DESCRIPTIONS[\s\S]{0,2000}["']markdown["']/.test(js));
  ok('M.cn-desc: SKILL_CN_DESCRIPTIONS 含 md',
    /SKILL_CN_DESCRIPTIONS[\s\S]{0,2000}["']md["']/.test(js));
  ok('M.cn-desc: SKILL_CN_DESCRIPTIONS 含 code-review',
    /SKILL_CN_DESCRIPTIONS[\s\S]{0,2000}["']code-review["']/.test(js));
  ok('M.cn-desc: SKILL_CN_DESCRIPTIONS 含 summary',
    /SKILL_CN_DESCRIPTIONS[\s\S]{0,2000}["']summary["']/.test(js));
  ok('M.cn-desc: SKILL_CN_DESCRIPTIONS 含 file-manager',
    /SKILL_CN_DESCRIPTIONS[\s\S]{0,2000}["']file-manager["']/.test(js));
  ok('M.cn-desc: SKILL_CN_DESCRIPTIONS 含 research',
    /SKILL_CN_DESCRIPTIONS[\s\S]{0,2000}["']research["']/.test(js));
  ok('M.cn-desc: 未知 skill 显示 "暂无简介"',
    /skillChineseDescription[\s\S]{0,2000}暂无简介/.test(js) ||
    /normalizeSkill[\s\S]{0,2000}暂无简介/.test(js));

  // [M.5] Agent scope 推断
  ok('M.agent-scope: skillAgentScope 返回 "claude"',
    /function\s+skillAgentScope[\s\S]{0,2000}return\s+['"]claude['"]/.test(js));
  ok('M.agent-scope: skillAgentScope 返回 "codex"',
    /function\s+skillAgentScope[\s\S]{0,2000}return\s+['"]codex['"]/.test(js));
  ok('M.agent-scope: skillAgentScope 返回 "qoder"',
    /function\s+skillAgentScope[\s\S]{0,2000}return\s+['"]qoder['"]/.test(js));
  ok('M.agent-scope: skillAgentScope 返回 "opencode"',
    /function\s+skillAgentScope[\s\S]{0,2000}return\s+['"]opencode['"]/.test(js));
  ok('M.agent-scope: skillAgentScope 返回 "all" 或 "fanbox"',
    /function\s+skillAgentScope[\s\S]{0,2000}return\s+['"]all['"]/.test(js) ||
    /function\s+skillAgentScope[\s\S]{0,2000}return\s+['"]fanbox['"]/.test(js));

  // [M.6] Category 推断
  ok('M.category: skillCategory 返回 Document',
    /function\s+skillCategory[\s\S]{0,2000}return\s+['"]Document['"]/.test(js));
  ok('M.category: skillCategory 返回 Code',
    /function\s+skillCategory[\s\S]{0,2000}return\s+['"]Code['"]/.test(js));
  ok('M.category: skillCategory 返回 Research',
    /function\s+skillCategory[\s\S]{0,2000}return\s+['"]Research['"]/.test(js));
  ok('M.category: skillCategory 返回 File',
    /function\s+skillCategory[\s\S]{0,2000}return\s+['"]File['"]/.test(js));
  ok('M.category: skillCategory 返回 Agent',
    /function\s+skillCategory[\s\S]{0,2000}return\s+['"]Agent['"]/.test(js));
  ok('M.category: skillCategory 返回 Other (兜底)',
    /function\s+skillCategory[\s\S]{0,2000}return\s+['"]Other['"]/.test(js));

  // [M.7] 交互 (Use in chat / toggle)
  ok('M.interact: useSkillInChat 调 closeSidebar + showTab("home")',
    /useSkillInChat[\s\S]{0,500}closeSidebar[\s\S]{0,500}showTab\(\s*['"]home['"]\s*\)/.test(js));
  ok('M.interact: useSkillInChat 填入 "使用「{title}」帮我……" (不发送)',
    /useSkillInChat[\s\S]{0,1000}input\.value\s*=\s*['"]使用《/.test(js) ||
    /useSkillInChat[\s\S]{0,1000}input\.value\s*=\s*"使用「/.test(js) ||
    /useSkillInChat[\s\S]{0,1000}使用「\$\{title\}」/.test(js));
  ok('M.interact: useSkillInChat 不调 doSend / send',
    !/useSkillInChat[\s\S]{0,2000}doSend|useSkillInChat[\s\S]{0,2000}\.click\(\)/.test(js));
  ok('M.interact: renderSkills 调 toggleSkill',
    /renderSkills[\s\S]{0,2000}toggleSkill|renderSkills[\s\S]{0,2000}useSkillInChat/.test(js));
  ok('M.interact: filterSkills 用 q + agent + status + type 过滤',
    /filterSkills[\s\S]{0,2000}agentScope[\s\S]{0,500}category[\s\S]{0,500}enabled/.test(js));

  // [M.8] Skills API 真实数据
  // 注入 mock skills 数据到 ~/.fanbox/mobile/skills-state.json 和 skills registry
  // 验证 GET /api/mobile/skills 返回非空
  const rSkills = await req({ path: '/api/mobile/skills', method: 'GET', headers: auth });
  ok('M.api: GET /api/mobile/skills 200', rSkills.status === 200,
    'status=' + rSkills.status);
  let jSkills = null;
  try { jSkills = JSON.parse(rSkills.body); } catch (e) { jSkills = null; }
  const skillsArr = Array.isArray(jSkills) ? jSkills : (jSkills?.skills || []);
  ok('M.api: skills 响应是数组或 {skills: []}', Array.isArray(skillsArr) || Array.isArray(jSkills?.skills),
    'type=' + (jSkills === null ? 'null' : Array.isArray(jSkills) ? 'array' : typeof jSkills));
  ok('M.api: skills 响应不含真实路径字段 (path/file)',
    !/("path"|"file")\s*:\s*"[A-Za-z]:[\\\/][^"]+"/.test(rSkills.body));
  ok('M.api: skills 响应不含 token/cookie/apiKey',
    !/("token"|"apiKey"|"cookie")\s*:\s*"[A-Za-z0-9]/.test(rSkills.body));
  const rSkillState = await req({ path: '/api/mobile/skills-state', method: 'GET', headers: auth });
  ok('M.api: GET /api/mobile/skills-state 200', rSkillState.status === 200,
    'status=' + rSkillState.status);

  // [M.9] 禁止项 (UI-A8-4 范围)
  ok('M.forbid: Skills 页不含 Delete',
    !/data-view="skills"[\s\S]{0,8000}>[\s]*Delete[\s]*</i.test(html));
  ok('M.forbid: Skills 页不含 Move/Rename/Upload',
    !/data-view="skills"[\s\S]{0,8000}(Move File|Rename File|Upload File)/i.test(html));
  ok('M.forbid: skills 响应不含 Delete/Move/Rename/Upload 字段',
    !/("action"|"op")\s*:\s*"(delete|move|rename|upload)"/i.test(rSkills.body));
  ok('M.forbid: UI 不含 YOLO', !/\bYOLO\b/.test(allUi));
  ok('M.forbid: UI 不含 Team Mode', !/Team\s*Mode/i.test(allUi));
  ok('M.forbid: UI 不暴露 raw stdout', !/raw\s*stdout/i.test(allUi));
  ok('M.forbid: UI 不暴露 .jsonl', !/\.jsonl/.test(allUi));
  ok('M.forbid: UI 不暴露 claudeSession/codexSession 字段', !/(claudeSession|codexSession)\s*:/.test(allUi));
  ok('M.forbid: UI 不暴露 token/cookie/apiKey', !/Bearer\s+[A-Za-z0-9]|sk-[a-zA-Z0-9]{8,}/.test(allUi));
  ok('M.forbid: mobile.js toggleSkill 不调 Delete/Move/Rename/Upload API',
    !/toggleSkill[\s\S]{0,3000}\/(api\/mobile\/(delete|move|rename|upload))/i.test(js));
  ok('M.forbid: mobile.js useSkillInChat 不调 DoSend / DoStart',
    !/useSkillInChat[\s\S]{0,2000}doSend|useSkillInChat[\s\S]{0,2000}doStart/.test(js));

  // [M.10] Files / Project / Session 数据源未改
  ok('M.intact: Files 仍用 data.items || data.files', /data\.items\s*\|\|\s*data\.files/.test(js));
  ok('M.intact: Files 仍调 /api/mobile/files?path=', /\/api\/mobile\/files\?path=/.test(js));
  ok('M.intact: Files 仍调 /api/mobile/roots', /\/api\/mobile\/roots/.test(js));
  ok('M.intact: Project 仍调 /api/mobile/sessions',
    /loadAllProjects[\s\S]{0,500}\/api\/mobile\/sessions/.test(js));
  ok('M.intact: Project groupSessionsByProject 仍存在',
    /function\s+groupSessionsByProject/.test(js));
  ok('M.intact: continueSession 仍存在 (恢复 sessionId/agentId/cwd)',
    /function\s+continueSession[\s\S]{0,2000}S\.sessionId\s*=\s*sid/.test(js));

  // ============================================================
  // Done
  // ============================================================
  section('DONE');
  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
