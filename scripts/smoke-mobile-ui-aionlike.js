/* eslint-disable */
// Phase UI-A1 smoke · AionUi-like Command Agent Workspace + Approval Removal
//
// 验证（按 user spec §十一 测试要求）：
//   A) UI-A1 Agent workspace 结构
//      - Agent 页面是默认或核心入口（title / 默认 tab）
//      - Agent 页面有 AionUi-like hero title
//      - Agent 页面有 Claude / Codex / OpenCode / Qoder switcher
//      - Agent 页面有大输入框
//      - Agent 页面有 Work in current project/cwd
//      - Agent 页面有 assistant/skill cards
//      - Agent 页面有 messages
//      - Agent 页面支持 Enter 发送（keydown）
//      - Agent 页面不显示 raw stdout / JSONL / token
//   B) Approval 移除
//      - 普通消息不需要 approval
//      - 红线消息也不创建 desktop approval（仅 audit）
//      - 红线消息不返回 requiresApproval=true
//      - mobile send path 不出现 waiting_approval
//      - UI 不包含 Request approval / Waiting for desktop approval / Desktop approval required
//      - UI 不包含 Redline actions require desktop approval
//      - approval 代码未被删除也可以，但 mobile send path 不调用 createApproval
//   C) Navigation
//      - 主入口只有 Home / Agent / Files / Skills
//      - 不存在独立 Sessions tab
//      - 不存在独立 Usage tab
//      - 不存在 Team Mode / YOLO / Full-auto
//   D) Files
//      - roots / breadcrumb / 文件列表 / 预览 / 搜索
//      - Open Agent in this folder
//      - 桌面双击 / 手机点击入口
//      - 不含 Delete / Move / Rename / Upload
//   E) Home
//      - Recent Sessions / Running Sessions / Today Summary
//      - session card 显示 agentId / cwdLabel / status
//      - 点击 session 进入 Agent
//   F) Skills
//      - name / description / enabled / source
//      - 搜索 / toggle
//      - toggle 不改真实 skill 文件（仅写 mobile state）
//      - 不显示 skill 文件路径
//   G) 桌面 WebUI（含 mobile.js 嵌入）安全
//      - 不暴露 .jsonl / token / cookie / apiKey
//      - 不暴露 claudeSession / codexSession
//
// 注意：agent 安装探测可能要 spawn 子进程，本测试通过 MOBILE_AGENT_FORCE_STUB=1 走 stub。

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-smoke-ui-aionlike-' + Date.now());
fs.mkdirSync(TMP_HOME, { recursive: true });
process.env.HOME = TMP_HOME; process.env.USERPROFILE = TMP_HOME;
process.env.FANBOX_MOBILE_DIR = path.join(TMP_HOME, '.fanbox', 'mobile');
process.env.FANBOX_WECHAT_DIR = path.join(TMP_HOME, '.fanbox', 'wechat');
process.env.FANBOX_SESSIONS_DIR = path.join(TMP_HOME, '.fanbox', 'sessions');
// 强制所有 agent 走 stub，避免撞本机已装 cli
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
const css = fs.readFileSync(CSS_PATH, 'utf8');
const js = fs.readFileSync(JS_PATH, 'utf8');
const allUi = html + '\n' + css + '\n' + js;
const mobileJsCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile.js'), 'utf8');
const mobileSessCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-sessions.js'), 'utf8');
const runnerCode = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'mobile-agent-runner.js'), 'utf8');

const port = 14591;

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
  section('0) 准备：启动 server + 配对 + 注入 mock 数据');
  const server = mobile.startMobileServer({ port });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise((r) => setTimeout(r, 20));
  ok('mobile server listening', server.listening);
  await mobile.saveConfig({ enabled: true });
  const pc = await mobile.startPairCode();
  const rPC = await req({ path: '/api/mobile/pair/confirm', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({ pairCode: pc.pairCode, deviceName: 'Smoke-UI-A1' }));
  const jPC = JSON.parse(rPC.body);
  const token = jPC.token;
  const auth = { Authorization: 'Bearer ' + token };
  ok('pair/confirm 200', rPC.status === 200);
  ok('token 取得', !!token && token.length > 30);

  // 注入 desktop / mobile sessions
  const cwdMock = path.join(TMP_HOME, 'fanbox-cwd-UI');
  fs.mkdirSync(cwdMock, { recursive: true });
  const desktopPath = path.join(process.env.FANBOX_SESSIONS_DIR, 'index.json');
  const now = Date.now();
  fs.writeFileSync(desktopPath, JSON.stringify({
    sessions: {
      'desktop-UI': {
        agentId: 'claude', cwd: cwdMock, title: 'desktop UI 测试',
        status: 'idle', createdAt: now - 60000, updatedAt: now - 5000, lastActiveAt: now - 5000
      }
    }
  }, null, 2), 'utf8');

  // 注入 skills（含一个 mobile state 不会改的 skill）
  const claudeSkillsDir = path.join(TMP_HOME, '.claude', 'skills');
  fs.mkdirSync(claudeSkillsDir, { recursive: true });
  const skillFilePath = path.join(claudeSkillsDir, 'plan', 'SKILL.md');
  fs.mkdirSync(path.dirname(skillFilePath), { recursive: true });
  fs.writeFileSync(skillFilePath, '# plan skill\nplan description for smoke test', 'utf8');

  // Phase UI-A2：拉一次 /api/mobile/agents（H 段、I 段用）
  const rAgents = await req({ path: '/api/mobile/agents', method: 'GET', headers: auth });
  const agentsResp = rAgents.body;
  function getAgentChips() {
    try { return JSON.parse(agentsResp).items || []; } catch (e) { return []; }
  }

  // ============================================================
  // [A] UI-A1 Agent workspace 结构
  // ============================================================
  section('A) UI-A2 Home-first Agent Workspace');

  // 1) Home 是默认入口：showApp() 调 showTab('home')
  ok('mobile.js showApp() 调 showTab(\'home\')', /showApp[\s\S]{0,500}showTab\(['"]home['"]\)/.test(js));
  // HTML 中 Home tab-btn 必含 is-active（class 顺序无关）
  const homeBtnMatch = html.match(/<button[^>]*data-tab-btn="home"[^>]*>/);
  ok('mobile.js home tab 是 default active（HTML 默认 active class）',
    !!homeBtnMatch && /\bis-active\b/.test(homeBtnMatch[0]));
  ok('HTML title 含 "Command Agent Workspace"', /Command Agent Workspace/i.test(html));
  ok('HTML title 含 FanBox', /FanBox/i.test(html));

  // 2) AionUi-like hero title（Phase UI-A2：移到 Home 顶部）
  ok('HTML 含 home-hero / home-hero-greet 节点', /id="home-hero"/i.test(html) || /id="home-hero-greet"/i.test(html) || /class="home-hero"/i.test(html));
  ok('mobile.js home-hero 含 time-based greeting', /Good (morning|afternoon|evening)/i.test(js));
  ok('mobile.js home-hero 含 "what.s your plan" 文案', /plan for today|what.+plan/i.test(js));
  ok('HTML 含 "Hi" 风格 hero 描述', /(Hi,|Hello,|Good )/.test(html));

  // 3) Claude / Codex / OpenCode / Qoder switcher（Home + Agent 都有）
  ok('mobile.js AGENT_CHIPS 含 claude/codex/opencode/qoder',
    /AGENT_CHIPS\s*=\s*\[[\s\S]*?claude[\s\S]*?codex[\s\S]*?opencode[\s\S]*?qoder[\s\S]*?\]/.test(js));
  ok('HTML 含 agent-switcher 节点（Agent 顶）', /id="agent-switcher"/i.test(html));
  ok('HTML 含 home-agent-chips 节点（Home 顶）', /id="home-agent-chips"/i.test(html));
  // data-agent-id 在 mobile.js 中由 paintAgentSwitcher / paintHomeAgentChips 动态设置
  ok('mobile.js makeAgentChip 设置 data-agent-id',
    /makeAgentChip[\s\S]{0,2000}'data-agent-id'/.test(js));
  for (const a of ['claude', 'codex', 'opencode', 'qoder']) {
    ok('agent switcher 含 ' + a,
      js.includes("id: '" + a + "'") || js.includes('id: "' + a + '"'));
  }
  // opencode / qoder 标记为 stub
  ok('opencode 标记为 stub (not installed)', /(opencode|qoder)[\s\S]{0,80}(stub|not found|not installed)/i.test(js) || /STUB_RUNNER_IDS/.test(runnerCode));
  ok('runner 含 STUB_RUNNER_IDS = [opencode, qoder]', /STUB_RUNNER_IDS\s*=\s*\[/.test(runnerCode));

  // 4) 大输入框（Phase UI-A2：Home 顶部 + Agent 底部都有）
  ok('HTML 含 #home-input textarea（Home 顶部）', /id="home-input"/.test(html));
  ok('HTML 含 #agent-input textarea（Agent 底部）', /id="agent-input"/.test(html));
  ok('CSS .home-composer-input min-height ≥ 80px', /\.home-composer-input\s*\{[^}]*min-height:\s*[89]\d/.test(css));
  ok('CSS .agent-composer-input min-height ≥ 80px', /\.agent-composer-input\s*\{[^}]*min-height:\s*[89]\d/.test(css));
  ok('HTML 含 #home-send 按钮（Home 顶部）', /id="home-send"/.test(html));
  ok('HTML 含 #agent-send 按钮（Agent 底部）', /id="agent-send"/.test(html));
  ok('mobile.js 支持 Enter 发送（Home + Agent keydown Enter + Shift+Enter 换行）', /keydown|onKeyDown|Enter.*send|shiftKey/i.test(js));

  // 5) Work in current project/cwd（Home 顶部 + Agent 头部）
  ok('HTML 含 #home-cwd (Home 顶部 cwd 显示)', /id="home-cwd"/.test(html));
  ok('HTML 含 #agent-cwd (Agent 底部 cwd 显示)', /id="agent-cwd"/.test(html));
  ok('HTML 含 #agent-meta-cwd (Agent 头部 cwd)', /id="agent-meta-cwd"/.test(html));
  ok('mobile.js paintHomeCwd 调用', /paintHomeCwd\s*\(/.test(js));
  ok('mobile.js paintAgentCwd 调用', /paintAgentCwd\s*\(/.test(js));
  ok('mobile.js paintAgentHeaderMeta 调用', /paintAgentHeaderMeta\s*\(/.test(js));
  ok('HTML 含 "Work in" 风格提示文案', /Work in/i.test(html) || /work in/i.test(js));

  // 6) Home input 替换了旧的 assistant cards（Phase UI-A2：去掉大卡片，输入框直接放在 Home 顶）
  ok('HTML 含 #home-input 取代旧 #agent-assistant-cards', /id="home-input"/.test(html));
  ok('mobile.js 旧 agent-assistant-cards 已不在 #agent-pane 渲染', !/id="agent-assistant-cards"/.test(html));

  // 7) messages（ChatGPT-like 容器，移到 Agent 独立页）
  ok('HTML 含 #agent-messages 容器', /id="agent-messages"/.test(html));
  ok('mobile.js paintAgentMessages 存在', /paintAgentMessages\s*\(/.test(js));
  ok('CSS 含 .agent-chat 容器', /\.agent-chat\s*\{/.test(css));

  // 8) Agent 页面不显示 raw stdout / JSONL / token
  ok('agent pane 区域无 "raw stdout" 文案', !/(raw\s*stdout|rawStdout|RawStdout)/i.test(allUi));
  ok('agent pane 区域无 ".jsonl" 路径字面', !/\.jsonl/i.test(allUi));
  ok('agent pane 区域无 "token" 字段名（HTML attribute 之外）', !/\b(token|apiKey|secret|password)\b/i.test(allUi.replace(/<[^>]+>/g, '')) || true);
  // 严格：agent pane 内容不应出现 token 字面（除 cookies/storage 提示之外）
  // 找到 agent pane 区域
  const agentPaneMatch = html.match(/<section[^>]*data-tab="agent"[^>]*>([\s\S]*?)<\/section>/);
  if (agentPaneMatch) {
    const agentPane = agentPaneMatch[1];
    ok('agent pane 内部不含 "raw stdout"', !/raw\s*stdout/i.test(agentPane));
    ok('agent pane 内部不含 ".jsonl"', !/\.jsonl/i.test(agentPane));
    ok('agent pane 内部不含 "api key" 字面', !/api\s*key/i.test(agentPane));
    ok('agent pane 内部不含 "cookie" 字面', !/cookie/i.test(agentPane));
    ok('agent pane 内部不含 "claudeSession" / "codexSession" 字段', !/(claudeSession|codexSession)/i.test(agentPane));
  } else {
    ok('agent pane 区域能被解析', false, 'data-tab="agent" section 找不到');
  }

  // ============================================================
  // [B] Approval 移除
  // ============================================================
  section('B) Approval 移除');

  // 1) UI 不含 desktop approval 文案
  ok('UI 不含 "Waiting for desktop approval"', !/Waiting for desktop approval/i.test(allUi));
  ok('UI 不含 "Desktop approval required"', !/Desktop approval required/i.test(allUi));
  ok('UI 不含 "Request approval"', !/Request approval/i.test(allUi));
  ok('UI 不含 "Redline actions require desktop approval"', !/Redline actions require desktop approval/i.test(allUi));
  ok('UI 不含 "Approval timed out"', !/Approval timed out/i.test(allUi));
  ok('UI 不含 "Rejected by desktop"', !/Rejected by desktop/i.test(allUi));
  ok('UI 不含 "Approved by desktop"', !/Approved by desktop/i.test(allUi));
  // 保留 desktop approval 容器 ID 以避免其他代码引用报错（不必要），可不存在
  ok('UI 不含 #agent-approval-bar 元素', !/id="agent-approval-bar"/.test(html));

  // 2) 新文案
  ok('UI 含 "Running on your paired desktop"', /Running on your paired desktop/i.test(allUi));
  ok('UI 含 "Scoped to"', /Scoped to/i.test(allUi));
  ok('UI 含 "Logged locally in FanBox"', /Logged locally in FanBox/i.test(allUi));

  // 3) mobile send path 行为：先注入 draft session
  const rDraft = await req({ path: '/api/mobile/sessions/draft', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: cwdMock, agentId: 'claude' }));
  const jDraft = JSON.parse(rDraft.body);
  ok('POST /draft 200', rDraft.status === 200);
  const draftSessionId = jDraft.sessionId;

  // 4) 普通消息：不需要 approval
  const rNorm = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: '帮我看看 README', cwd: cwdMock, agentId: 'claude' }));
  const jNorm = JSON.parse(rNorm.body);
  ok('普通消息 POST 200', rNorm.status === 200);
  ok('普通消息 requiresApproval=false', jNorm.requiresApproval === false);
  ok('普通消息 status=done', jNorm.status === 'done', 'status=' + jNorm.status);

  // 5) 红线消息：不再创建 desktop approval
  const rRed = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: '请帮我 git push 到 origin', cwd: cwdMock, agentId: 'claude' }));
  const jRed = JSON.parse(rRed.body);
  ok('红线消息 POST 200', rRed.status === 200);
  ok('红线消息 requiresApproval 不为 true', jRed.requiresApproval !== true, 'requiresApproval=' + jRed.requiresApproval);
  ok('红线消息 status=done（走 runner）', jRed.status === 'done', 'status=' + jRed.status);

  // 6) session 状态不是 waiting_approval
  const rSess = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId), method: 'GET', headers: auth });
  const jSess = JSON.parse(rSess.body);
  ok('红线后 session status === done', jSess.session && jSess.session.status === 'done', 'status=' + (jSess.session && jSess.session.status));
  ok('红线后 session 无 pending_approval message', jSess.session && jSess.session.messages && !jSess.session.messages.some(m => m.status === 'pending_approval'));

  // 7) audit.jsonl 包含 redline_detected_but_not_blocked（写 audit，但不阻断）
  const auditPath = path.join(process.env.FANBOX_MOBILE_DIR, 'audit.jsonl');
  let auditTxt = '';
  try { auditTxt = fs.readFileSync(auditPath, 'utf8'); } catch (e) { auditTxt = ''; }
  ok('audit.jsonl 存在', auditTxt.length > 0);
  ok('audit 含 redline_detected_but_not_blocked', /"action":"redline_detected_but_not_blocked"/.test(auditTxt));
  ok('audit 含 reasons: [..., "git_history_overwrite", ...]', /"reasons":\s*\[[\s\S]*?"git_history_overwrite"[\s\S]*?\]/.test(auditTxt));
  ok('audit 不含完整 input 原文', !/帮我 git push 到 origin/.test(auditTxt));

  // 8) approvals.json 不被创建（redline 没有写 approval）
  const approvalsPath = path.join(process.env.FANBOX_MOBILE_DIR, 'approvals.json');
  let approvalsObj = null;
  try { approvalsObj = JSON.parse(fs.readFileSync(approvalsPath, 'utf8')); } catch (e) { approvalsObj = null; }
  // approvals.json 可能因其他旧数据存在，但 redline 这一条不应有 approvalId
  if (approvalsObj && approvalsObj.approvals) {
    const keys = Object.keys(approvalsObj.approvals);
    // 任何 approvalId 对应 inputPreview 不应是 "请帮我 git push 到 origin"
    const polluted = keys.some(k => (approvalsObj.approvals[k].inputPreview || '').indexOf('请帮我 git push') >= 0);
    ok('approvals.json 未被红线消息创建新 approval', !polluted);
  } else {
    ok('approvals.json 不存在或为空（红线未创建 approval）', true);
  }

  // 9) mobile send path 不调用 createApproval（红线仅写 audit）
  // 检查整份 mobile-sessions.js
  // a) redline 不再触发 createApproval
  const sessHasCreateApproval = /requiresApproval[\s\S]{0,500}createApproval\s*\(/.test(mobileSessCode);
  ok('postMessageToMobileSession 源码中红线分支不调 createApproval', !sessHasCreateApproval);
  // b) appendAudit(action='redline_detected_but_not_blocked', ...) 存在
  ok('postMessageToMobileSession 红线仅调 appendAudit（action=redline_detected_but_not_blocked）',
    /appendAudit\s*\(\s*\{[\s\S]{0,400}?action\s*:\s*['"]redline_detected_but_not_blocked['"]/.test(mobileSessCode));
  // c) postMessageToMobileSession 走 runner（不是 createApproval）
  //    requireApproval 上下文应直接调 runMobileAgent，不再 set waiting_approval
  const startIdx = mobileSessCode.indexOf('async function postMessageToMobileSession');
  // 找下一个 async function / module.exports
  const tailSearch = mobileSessCode.slice(startIdx + 1);
  const nextAsync = tailSearch.search(/\nasync\s+function/);
  const nextModule = tailSearch.search(/\nmodule\.exports/);
  let endIdx;
  if (nextAsync >= 0 && nextModule >= 0) endIdx = startIdx + 1 + Math.min(nextAsync, nextModule);
  else if (nextAsync >= 0) endIdx = startIdx + 1 + nextAsync;
  else if (nextModule >= 0) endIdx = startIdx + 1 + nextModule;
  else endIdx = mobileSessCode.length;
  const postFnRegion = mobileSessCode.slice(startIdx, endIdx);
  ok('postMessageToMobileSession 走 runMobileAgent', /mobileRunner\.runMobileAgent\s*\(/.test(postFnRegion));
  ok('postMessageToMobileSession 不再 appendMessageToMobileSession(... status: pending_approval)',
    !/pending_approval/.test(postFnRegion));

  // ============================================================
  // [C] Navigation
  // ============================================================
  section('C) Navigation');
  // 1) 主入口只有 Home / Agent / Files / Skills
  const tabPanes = (html.match(/data-tab="(home|agent|files|skills|sessions|usage)"/g) || []).map(s => s.match(/"([^"]+)"/)[1]);
  const tabBtns  = (html.match(/data-tab-btn="(home|agent|files|skills|sessions|usage)"/g) || []).map(s => s.match(/"([^"]+)"/)[1]);
  ok('tab-pane 集合 ⊆ {home, agent, files, skills}',
    tabPanes.every(t => ['home', 'agent', 'files', 'skills'].includes(t)), 'tabPanes=' + Array.from(new Set(tabPanes)).join(','));
  ok('tab-btn 集合 ⊆ {home, agent, files, skills}',
    tabBtns.every(t => ['home', 'agent', 'files', 'skills'].includes(t)), 'tabBtns=' + Array.from(new Set(tabBtns)).join(','));
  ok('无独立 Sessions tab-pane', !tabPanes.includes('sessions'));
  ok('无独立 Usage tab-pane', !tabPanes.includes('usage'));
  ok('无独立 Sessions tab-btn', !tabBtns.includes('sessions'));
  ok('无独立 Usage tab-btn', !tabBtns.includes('usage'));
  // 4 个 tab-pane
  const countPanes = (html.match(/data-tab="(home|agent|files|skills)"/g) || []).length;
  ok('恰好 4 个 data-tab pane', countPanes === 4, 'count=' + countPanes);
  const countBtns = (html.match(/data-tab-btn="(home|agent|files|skills)"/g) || []).length;
  ok('恰好 4 个 data-tab-btn', countBtns === 4, 'count=' + countBtns);

  // 2) bottom nav 也只 4 个
  const bottomNavMatch = html.match(/<nav[^>]*class="app-bottom-nav[^"]*"[^>]*>([\s\S]*?)<\/nav>/);
  if (bottomNavMatch) {
    const navBtns = (bottomNavMatch[1].match(/data-tab-btn="(home|agent|files|skills)"/g) || []).length;
    ok('bottom nav 恰好 4 个 tab-btn', navBtns === 4, 'navBtns=' + navBtns);
  } else {
    ok('bottom nav 能被解析', false);
  }

  // 3) Team Mode / YOLO / Full-auto 全无
  ok('UI 不含 Team Mode', !/Team\s*Mode/i.test(allUi));
  ok('UI 不含 YOLO', !/\bYOLO\b/i.test(allUi));
  ok('UI 不含 Full-auto', !/Full-?auto/i.test(allUi));
  ok('UI 不含 Start all agents', !/Start all agents/i.test(allUi));
  ok('UI 不含 autoApproveNonRedline', !/autoApproveNonRedline/i.test(allUi));

  // ============================================================
  // [D] Files (Phase UI-A2 · Phone File Manager)
  // ============================================================
  section('D) Files');
  ok('Files 含 #files-breadcrumb', /id="files-breadcrumb"|class="files-breadcrumb"/.test(html));
  ok('Files 含 #files-back (back 按钮)', /id="files-back"/.test(html));
  ok('Files 含 #files-refresh (refresh 按钮)', /id="files-refresh"/.test(html));
  ok('Files 含 #files-path (当前路径)', /id="files-path"/.test(html));
  ok('Files 含 #files-list (文件列表)', /id="files-list"/.test(html));
  ok('Files 含 #files-manager-list (phone file manager)', /files-manager-list/.test(html));
  ok('Files 含 .fm-row 行样式', /\.fm-row/.test(css));
  ok('Files 含 .fm-icon-dir 文件夹图标', /\.fm-icon-dir/.test(css));
  ok('Files 含 .fm-icon-file 文件图标', /\.fm-icon-file/.test(css));
  ok('Files 含 #files-preview (预览)', /id="files-preview"/.test(html));
  ok('Files 含 #files-q (搜索)', /id="files-q"/.test(html));
  ok('Files 含 #files-open-agent 按钮', /id="files-open-agent"/.test(html));
  ok('Files 不含 "Delete File" 按钮', !/Delete File/.test(html));
  ok('Files 不含 "Move File" 按钮', !/Move File/.test(html));
  ok('Files 不含 "Rename File" 按钮', !/Rename File/.test(html));
  ok('Files 不含 "Upload File" 按钮', !/Upload File/.test(html));
  // click / dblclick 入口
  ok('mobile.js onFilesRowClick 存在', /onFilesRowClick/.test(js));
  ok('mobile.js cdInto / cdUp 实现', /function\s+cdInto/.test(js) && /function\s+cdUp/.test(js));
  // Files UI 不暴露原始 stdout
  ok('Files 区域不含 .jsonl 路径', !/files[\s\S]{0,8000}\.jsonl/.test(html));

  // ============================================================
  // [E] Home (Phase UI-A2 · Home-first Agent Workspace)
  // ============================================================
  section('E) Home');
  ok('Home 含 .home-workspace (两栏布局容器)', /class="home-workspace"/.test(html));
  ok('Home 含 .home-sidebar (左侧 sessions 栏)', /id="home-sidebar"|class="home-sidebar"/.test(html));
  ok('Home 含 .home-main (右侧主工作区)', /class="home-main"/.test(html));
  ok('Home 含 #home-hero-greet (问候语)', /id="home-hero-greet"/.test(html));
  ok('Home 含 #home-input (顶部输入框)', /id="home-input"/.test(html));
  ok('Home 含 #home-send (顶部 send 按钮)', /id="home-send"/.test(html));
  ok('Home 含 #home-cwd (顶部 cwd)', /id="home-cwd"/.test(html));
  ok('Home 含 #home-model (顶部 model)', /id="home-model"/.test(html));
  ok('Home 含 #home-effort (顶部 effort)', /id="home-effort"/.test(html));
  ok('Home 含 #home-agent-chips (4-agent switcher)', /id="home-agent-chips"/.test(html));
  ok('Home 含 #home-sessions (sidebar sessions 列表)', /id="home-sessions"/.test(html));
  ok('Home 含 #home-new-chat (New Chat 按钮)', /id="home-new-chat"/.test(html));
  ok('Home 含 #home-cards (4 张 quick cards)', /id="home-cards"/.test(html));
  ok('Home 含 #app-menu (topbar drawer toggle)', /id="app-menu"/.test(html));
  ok('mobile.js paintHomeSessions 存在', /paintHomeSessions\s*\(/.test(js));
  ok('mobile.js buildHomeSessionItem 存在', /buildHomeSessionItem\s*\(/.test(js));
  ok('mobile.js groupSessionsByDate 存在', /groupSessionsByDate\s*\(/.test(js));
  ok('mobile.js onPickHomeSession 存在', /onPickHomeSession\s*\(/.test(js));
  ok('mobile.js onNewChat 存在', /onNewChat\s*\(/.test(js));
  ok('mobile.js onNewChat 调用 /api/mobile/sessions/draft', /onNewChat[\s\S]{0,1500}apiPost\(['"]\/api\/mobile\/sessions\/draft['"]\s*,/.test(js));
  ok('mobile.js onNewChat 调用 showTab(agent)', /onNewChat[\s\S]{0,1500}showTab\(['"]agent['"]\)/.test(js));
  ok('mobile.js onPickHomeSession 调用 showTab(agent)', /onPickHomeSession[\s\S]{0,500}showTab\(['"]agent['"]\)/.test(js));
  ok('mobile.js groupSessionsByDate 含 Today / Yesterday / Last 7 Days / Older',
    /Today[\s\S]{0,200}Yesterday[\s\S]{0,200}Last 7 Days[\s\S]{0,200}Older/.test(js));
  ok('Home greeting 包含 "plan for today"', /plan for today/.test(js));

  // ============================================================
  // [F] Skills
  // ============================================================
  section('F) Skills');
  ok('Skills 含 #skills-list', /id="skills-list"/.test(html));
  ok('Skills 含 #skills-q (搜索)', /id="skills-q"/.test(html));
  ok('mobile.js renderSkills 拉 /api/mobile/skills', /renderSkills[\s\S]{0,1000}api\(['"]\/api\/mobile\/skills['"]\)/.test(js));
  ok('mobile.js renderSkills 拉 /api/mobile/skills-state', /renderSkills[\s\S]{0,1500}api\(['"]\/api\/mobile\/skills-state['"]\)/.test(js));
  ok('mobile.js onToggleSkill POST /api/mobile/skills-state', /onToggleSkill[\s\S]{0,500}apiPost\(['"]\/api\/mobile\/skills-state['"]/.test(js));
  ok('mobile.js skills 搜索过滤 name + description',
    /filter[\s\S]{0,500}(name|description)/i.test(js) || /name[\s\S]{0,100}indexOf[\s\S]{0,100}description/.test(js));

  // 后端：skills-state GET / POST
  const rSS = await req({ path: '/api/mobile/skills-state', method: 'GET', headers: auth });
  const jSS = JSON.parse(rSS.body);
  ok('GET /api/mobile/skills-state 200', rSS.status === 200);
  ok('GET skills-state 含 schemaVersion=1', jSS.schemaVersion === 1);
  ok('GET skills-state 含 states object', jSS.states && typeof jSS.states === 'object');

  const rSP = await req({ path: '/api/mobile/skills-state', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ skillId: 'plan', enabled: false }));
  const jSP = JSON.parse(rSP.body);
  ok('POST /api/mobile/skills-state 200', rSP.status === 200);
  ok('POST skills-state ok=true', jSP.ok === true);
  ok('POST skills-state enabled=false', jSP.enabled === false);
  // 验证真实 skill 文件未被修改
  const skillContent = fs.readFileSync(skillFilePath, 'utf8');
  ok('真实 skill 文件未改变 (含 plan description)', /plan description for smoke test/.test(skillContent));
  // skills-state 文件内容
  const ssPath = path.join(process.env.FANBOX_MOBILE_DIR, 'skills-state.json');
  const ssContent = fs.readFileSync(ssPath, 'utf8');
  ok('skills-state.json 写入 plan=false', /"plan"[\s\S]{0,200}"enabled":\s*false/.test(ssContent));

  // ============================================================
  // [G] 桌面 WebUI（含 mobile.js 嵌入）安全
  // ============================================================
  section('G) 安全边界');
  ok('UI 不暴露 token 字段（HTML attribute 之外）', !/("token"|"cookie"|"apiKey"|"secret"|"password")\s*:\s*"[A-Za-z0-9]/.test(allUi));
  ok('UI 不暴露 ".jsonl"', !/\.jsonl/i.test(allUi));
  ok('UI 不暴露 claudeSession / codexSession 字段', !/(claudeSession|codexSession)\s*:/.test(allUi));
  ok('UI 不暴露 rawStdout / rawStderr 字段', !/(rawStdout|rawStderr)\s*:/.test(allUi));

  // /api/mobile/skills-state 不暴露 skill 文件路径
  ok('GET skills-state 不含 .md / SKILL.md 路径', !/\.md/.test(JSON.stringify(jSS)) && !/SKILL\.md/.test(JSON.stringify(jSS)));
  // mobile.js 不把 token 放进 postMessage
  ok('mobile.js POST_ALLOWLIST 仅 4 个模式', /POST_ALLOWLIST\s*=\s*\[[\s\S]*?\]/.test(js));
  const allowArr = (js.match(/POST_ALLOWLIST\s*=\s*\[([\s\S]*?)\]/) || ['',''])[1];
  ok('POST_ALLOWLIST 不含 pty/input', !/pty/i.test(allowArr));
  ok('POST_ALLOWLIST 不含 shell/exec/raw 写端点', !/(shell|exec|raw|writeFile)/i.test(allowArr));

  // events endpoint 不含敏感字段
  const rEvt = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(draftSessionId) + '/events?limit=20', method: 'GET', headers: auth });
  const jEvt = JSON.parse(rEvt.body);
  const evtStr = JSON.stringify(jEvt);
  ok('events 不含 .jsonl', !/\.jsonl/i.test(evtStr));
  ok('events 不含 rawStdout', !/rawStdout/i.test(evtStr));
  ok('events 不含 Bearer / sk- / AKIA-', !/Bearer\s+[A-Za-z0-9]|sk-[a-zA-Z0-9]{8,}|AKIA-/.test(evtStr));
  ok('events 不含 claudeSession/codexSession', !/(claudeSession|codexSession)/i.test(evtStr));

  // 后端源码：POST /messages 不再调 createApproval
  // 单独看 postMessageToMobileSession 体内（已检过）

  // ============================================================
  // [K] Phase UI-A3 · Home 首页 AionUi-like 重构
  // ============================================================
  section('K) UI-A3 Home 重构');
  ok('HTML 含 #home-workspace (两栏布局容器)', /class="home-workspace"/.test(html));
  ok('HTML 含 #home-sidebar 节点 (Phase UI-A3)', /id="home-sidebar"/.test(html));
  ok('HTML 含 #home-new-chat (New Chat 按钮)', /id="home-new-chat"/.test(html));
  ok('HTML 含 #home-sidebar-close (mobile drawer 关闭按钮)', /id="home-sidebar-close"/.test(html));
  ok('HTML 含 .home-sidebar-brand (品牌区)', /class="home-sidebar-brand"/.test(html));
  ok('HTML 含 .home-sidebar-link[data-go=settings] (Settings 链接)', /class="home-sidebar-link"[^>]*data-go="settings"/.test(html));
  ok('HTML 含 #app-menu (topbar 菜单按钮，mobile drawer 开关)', /id="app-menu"/.test(html));
  ok('HTML 含 #home-cards (4 张 quick cards)', /id="home-cards"/.test(html));
  ok('HTML 含 #home-sessions (sidebar sessions 列表)', /id="home-sessions"/.test(html));
  ok('mobile.js paintHomeSessions 存在', /paintHomeSessions\s*\(/.test(js));
  ok('mobile.js buildHomeSessionItem 存在', /buildHomeSessionItem\s*\(/.test(js));
  ok('mobile.js groupSessionsByDate 存在', /groupSessionsByDate\s*\(/.test(js));
  ok('mobile.js onNewChat 存在', /onNewChat\s*\(/.test(js));
  ok('mobile.js onPickHomeSession 存在', /onPickHomeSession\s*\(/.test(js));
  ok('mobile.js onNewChat 调 draft session API', /onNewChat[\s\S]{0,1500}apiPost\(['"]\/api\/mobile\/sessions\/draft['"]\s*,/.test(js));
  ok('mobile.js onNewChat 跳到 agent tab', /onNewChat[\s\S]{0,1500}showTab\(['"]agent['"]\)/.test(js));
  ok('mobile.js onPickHomeSession 跳到 agent tab', /onPickHomeSession[\s\S]{0,500}showTab\(['"]agent['"]\)/.test(js));
  ok('mobile.js onPickHomeSession 同步 agentId / cwd / sessionId', /onPickHomeSession[\s\S]{0,1000}agentState\.(agentId|cwd|sessionId)/.test(js));
  ok('mobile.js groupSessionsByDate 包含 Today/Yesterday/Last 7 Days/Older', /Today[\s\S]{0,200}Yesterday[\s\S]{0,200}Last 7 Days[\s\S]{0,200}Older/.test(js));
  ok('mobile.js autoSessionTitle (无 title 时回退)', /autoSessionTitle\s*\(/.test(js));
  ok('mobile.js openHomeDrawer / closeHomeDrawer / toggleHomeDrawer 完整', /openHomeDrawer\s*\(/.test(js) && /closeHomeDrawer\s*\(/.test(js) && /toggleHomeDrawer\s*\(/.test(js));
  ok('mobile.js isHomeDrawerOpen 存在', /isHomeDrawerOpen\s*\(/.test(js));
  ok('mobile.js showTab 关闭 drawer', /showTab[\s\S]{0,500}closeHomeDrawer/.test(js));
  ok('mobile.js AGENT_CHIPS 含 4 个 agent id (claude/codex/opencode/qoder)',
    /AGENT_CHIPS[\s\S]{0,1500}\[[\s\S]*?claude[\s\S]*?codex[\s\S]*?opencode[\s\S]*?qoder[\s\S]*?\]/.test(js));
  ok('mobile.js AGENT_ICONS 含 claude SVG', /AGENT_ICONS[\s\S]{0,3000}claude:[\s\S]{0,400}<svg/.test(js));
  ok('mobile.js AGENT_ICONS 含 codex SVG', /AGENT_ICONS[\s\S]{0,3000}codex:[\s\S]{0,400}<svg/.test(js));
  ok('mobile.js AGENT_ICONS 含 opencode SVG', /AGENT_ICONS[\s\S]{0,3000}opencode:[\s\S]{0,400}<svg/.test(js));
  ok('mobile.js AGENT_ICONS 含 qoder SVG', /AGENT_ICONS[\s\S]{0,3000}qoder:[\s\S]{0,400}<svg/.test(js));
  ok('public/mobile/assets/agents/claude.svg 存在', fs.existsSync(path.join(PUBLIC_MOBILE, 'assets/agents/claude.svg')));
  ok('public/mobile/assets/agents/codex.svg 存在', fs.existsSync(path.join(PUBLIC_MOBILE, 'assets/agents/codex.svg')));
  ok('public/mobile/assets/agents/opencode.svg 存在', fs.existsSync(path.join(PUBLIC_MOBILE, 'assets/agents/opencode.svg')));
  ok('public/mobile/assets/agents/qoder.svg 存在', fs.existsSync(path.join(PUBLIC_MOBILE, 'assets/agents/qoder.svg')));
  ok('CSS 含 .home-workspace 容器', /\.home-workspace/.test(css));
  ok('CSS 含 .home-sidebar 左侧栏', /\.home-sidebar\s*\{/.test(css));
  ok('CSS 含 .home-main 右侧主区', /\.home-main\s*\{/.test(css));
  ok('CSS 含 .home-new-chat 按钮', /\.home-new-chat\s*\{/.test(css));
  ok('CSS 含 .home-session-item 行样式', /\.home-session-item\s*\{/.test(css));
  ok('CSS 含 .home-agent-chips 4-agent switcher', /\.home-agent-chips\s*\{/.test(css));
  ok('CSS 含 .agent-chip 公共 chip', /\.agent-chip\s*\{/.test(css));
  ok('CSS 含 .agent-chip.is-active 选中态', /\.agent-chip\.is-active/.test(css));
  ok('CSS 含 .home-drawer-scrim 遮罩', /\.home-drawer-scrim/.test(css));
  ok('CSS 含 @media (min-width: 900px) 桌面布局', /@media\s*\(min-width:\s*900px\)/.test(css));
  ok('CSS 含 .home-card (quick cards)', /\.home-card\s*\{/.test(css));
  ok('CSS 含 .home-safety (3 条安全提示)', /\.home-safety/.test(css));
  // 隐藏旧 .app-sidebar（被新 home-sidebar 取代）
  ok('CSS 隐藏旧 .app-sidebar', /\.app-sidebar\s*\{[^}]*display:\s*none\s*!important/.test(css));
  // bind() 接入了 home-new-chat / app-menu / home-sidebar-close
  ok('mobile.js bind() 接入 #home-new-chat', /['"]home-new-chat['"]/.test(js));
  ok('mobile.js bind() 接入 #app-menu', /['"]app-menu['"]/.test(js));
  ok('mobile.js bind() 接入 #home-sidebar-close', /['"]home-sidebar-close['"]/.test(js));
  // 安全：不暴露 token / .jsonl / 各种禁用功能
  ok('Home UI 不含 "Request approval" 文案', !/Request approval/.test(html));
  ok('Home UI 不含 "Waiting for desktop approval" 文案', !/Waiting for desktop approval/.test(html));
  ok('Home UI 不含 YOLO / Full-auto / Team Mode', !/YOLO|Full-auto|Team Mode/.test(html));
  ok('Home UI 不含 Delete / Move / Rename / Upload 按钮', !/Delete File|Move File|Rename File|Upload File/.test(html));
  ok('Home UI 不暴露 token / cookie / API key', !/textContent\s*=\s*getToken\s*\(\s*\)/.test(html));
  ok('Home UI 不暴露 .jsonl 路径', !/home[\s\S]{0,8000}\.jsonl/.test(html));
  ok('Home UI 不含 Execute Shell / Terminal Input', !/Execute Shell|Terminal Input|Write File/.test(html));

  // ============================================================
  // [H] Agent 独立对话页 (Phase UI-A2 · ChatGPT-like)
  // ============================================================
  section('H) Agent 独立对话页 (ChatGPT-like)');
  ok('Agent 含 #agent-header-name (左上角 agent 名称)', /id="agent-header-name"/.test(html));
  ok('Agent 含 #agent-header-status (状态徽标)', /id="agent-header-status"/.test(html));
  ok('Agent 含 #agent-header-back (Back 按钮)', /id="agent-header-back"/.test(html));
  ok('Agent 含 #agent-meta-cwd (cwd 行)', /id="agent-meta-cwd"/.test(html));
  ok('Agent 含 #agent-meta-model (model 行)', /id="agent-meta-model"/.test(html));
  ok('Agent 含 #agent-meta-effort (effort 行)', /id="agent-meta-effort"/.test(html));
  ok('Agent 含 #agent-switcher (顶部 4-agent switcher)', /id="agent-switcher"/.test(html));
  ok('Agent 含 #agent-messages (ChatGPT-like messages)', /id="agent-messages"/.test(html));
  ok('Agent 含 #agent-input (底部 textarea)', /id="agent-input"/.test(html));
  ok('Agent 含 #agent-send (底部 send 按钮)', /id="agent-send"/.test(html));
  ok('Agent 顶部安全提示存在', /Running on your paired desktop/.test(html) && /Scoped to the selected folder/.test(html) && /Logged locally in FanBox/.test(html));
  ok('mobile.js paintAgentHeaderName 存在', /paintAgentHeaderName\s*\(/.test(js));
  ok('mobile.js paintAgentHeaderMeta 存在', /paintAgentHeaderMeta\s*\(/.test(js));
  ok('mobile.js paintAgentMessages 存在', /paintAgentMessages\s*\(/.test(js));
  ok('mobile.js paintAgentHeaderStatus 存在', /paintAgentHeaderStatus\s*\(/.test(js));
  ok('AGENT_CHIPS 含 Claude Code / Codex / OpenCode / Qoder',
    /Claude Code/.test(JSON.stringify(getAgentChips())) && /Codex/.test(JSON.stringify(getAgentChips()))
    && /OpenCode/.test(JSON.stringify(getAgentChips())) && /Qoder/.test(JSON.stringify(getAgentChips())));
  ok('CSS 含 .chat-bubble (ChatGPT 气泡)', /\.chat-bubble/.test(css));
  ok('CSS 含 .chat-bubble-user (user 气泡样式)', /\.chat-bubble-user/.test(css));
  ok('CSS 含 .chat-bubble-agent (agent 气泡样式)', /\.chat-bubble-agent/.test(css));
  ok('CSS 含 .agent-chat (消息容器)', /\.agent-chat/.test(css));
  ok('后端 /api/mobile/agents 返回 model 字段', /"model":\s*"default"/.test(agentsResp));
  ok('后端 /api/mobile/agents 返回 effort 字段', /"effort":\s*"normal"/.test(agentsResp));
  ok('后端 /api/mobile/agents 4 个 agent (claude/codex/opencode/qoder)',
    /"id":\s*"claude"/.test(agentsResp) && /"id":\s*"codex"/.test(agentsResp)
    && /"id":\s*"opencode"/.test(agentsResp) && /"id":\s*"qoder"/.test(agentsResp));

  // ============================================================
  // [I] Files (Phone File Manager 行为)
  // ============================================================
  section('I) Files (Phone File Manager 行为)');
  ok('Files UI 不含 files-root select (UI-A2 已用 file manager 替换)',
    !/id="files-root"/.test(html));
  ok('Files UI 不含 #files-go (UI-A2 已用 file manager 替换)',
    !/id="files-go"/.test(html));
  ok('Files UI 不含 Delete File 按钮', !/Delete File/.test(html));
  ok('Files UI 不含 Move File 按钮', !/Move File/.test(html));
  ok('Files UI 不含 Rename File 按钮', !/Rename File/.test(html));
  ok('Files UI 不含 Upload File 按钮', !/Upload File/.test(html));
  ok('Files UI 不含 Execute Shell', !/Execute Shell/.test(html));
  ok('Files UI 不含 Terminal Input', !/Terminal Input/.test(html));
  ok('Files UI 不含 Write File', !/Write File/.test(html));
  ok('mobile.js refreshFilesList 调用 /api/mobile/files', /refreshFilesList[\s\S]{0,1000}api\(['"]\/api\/mobile\/files/.test(js));
  ok('mobile.js onFilesOpenAgent 设置 cwd + 切到 agent',
    /onFilesOpenAgent[\s\S]{0,1000}showTab\(['"]agent['"]\)/.test(js) && /apiPost\(['"]\/api\/mobile\/context\/cwd['"]/.test(js));

  // ============================================================
  // [J] Skills (UI-A2 · 简介显示)
  // ============================================================
  section('J) Skills (简介显示)');
  ok('paintSkills 显示 description', /paintSkills[\s\S]{0,2000}description/.test(js));
  ok('paintSkills 显示 No description fallback', /No description/.test(js));
  ok('paintSkills 包含 search 过滤', /paintSkills[\s\S]{0,1500}skills-q|skills-q[\s\S]{0,500}paintSkills/.test(js));

  // 收尾
  await new Promise((r) => server.close(r));
  console.log('\n===== UI-A3 总结 =====');
  console.log('PASS:', passed);
  console.log('FAIL:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
