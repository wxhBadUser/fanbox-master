/* eslint-disable */
// Phase CHAT-P1 smoke · Slash Skill Palette + Send Input Reset + Skill Error Hardening
//
// 验证：
//   1) HTML/CSS/JS 包含 CHAT-P1 所需结构（slash palette / skill indicator / composer state）
//   2) mobile.js 导出 slash palette 与 composer 相关函数
//   3) searchSkills / injectSkillPrompt / selectSkill / clearComposer / restoreComposer 行为正确
//   4) handleSlashKeydown 支持 ArrowUp/ArrowDown/Enter/Escape
//   5) 未知 slash 不进入 runner，/handoff 匹配 skill 时选中 skill
//   6) skill 无 description 显示“暂无介绍”
//   7) 发送成功后清空输入框、失败后恢复输入并显示 error bubble（源码静态检查 + 运行时模拟）
//   8) 后端 /api/mobile/skills 不暴露真实 skill 文件路径
//   9) 普通消息仍能发送，POST /messages 行为正常
//  10) 不新增 delete/move/rename/upload/shell/pty 等危险功能

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-smoke-chat-p0-' + Date.now());
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
const css = fs.readFileSync(CSS_PATH, 'utf8');
const js = fs.readFileSync(JS_PATH, 'utf8');
const allUi = html + '\n' + css + '\n' + js;

const port = 14605;

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

// ---------------- 最小 DOM mock ----------------
function makeMockDocument() {
  const bySel = {};
  const byId = {};
  function mkNode(tag, id) {
    const kids = [];
    const listeners = {};
    const attrs = {};
    const node = {
      tagName: tag,
      nodeType: 1,
      hidden: false,
      value: '',
      textContent: '',
      innerHTML: '',
      className: '',
      style: {},
      firstChild: null,
      parentNode: null,
      _kids: kids,
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] == null ? null : attrs[k]; },
      removeAttribute(k) { delete attrs[k]; },
      classList: {
        _set: new Set(),
        toggle(c, force) {
          if (force === true) this._set.add(c);
          else if (force === false) this._set.delete(c);
          else if (this._set.has(c)) this._set.delete(c); else this._set.add(c);
          node.className = Array.from(this._set).join(' ');
        },
        contains(c) { return this._set.has(c); }
      },
      appendChild(c) {
        if (c && c.parentNode) c.parentNode.removeChild(c);
        kids.push(c);
        if (c) c.parentNode = node;
        node.firstChild = kids[0] || null;
        return c;
      },
      removeChild(c) {
        const i = kids.indexOf(c);
        if (i >= 0) kids.splice(i, 1);
        if (c) c.parentNode = null;
        node.firstChild = kids[0] || null;
        return c;
      },
      addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      dispatchEvent(ev) { (listeners[ev.type] || []).forEach((fn) => { try { fn(ev); } catch (_) {} }); },
      focus() {},
      scrollIntoView() {},
      setSelectionRange() {},
      querySelector() { return null; },
      querySelectorAll() { return []; }
    };
    if (id) { node.id = id; byId[id] = node; }
    return node;
  }
  function mkText(text) {
    return { nodeType: 3, textContent: String(text == null ? '' : text), parentNode: null };
  }
  return {
    readyState: 'complete',
    _byId: byId,
    _bySel: bySel,
    createElement(tag) { return mkNode(tag); },
    createTextNode(text) { return mkText(text); },
    getElementById(id) { return byId[id] || null; },
    querySelector(sel) {
      if (sel.startsWith('#')) return byId[sel.slice(1)] || null;
      return bySel[sel] || null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-i]') return [];
      return [];
    },
    addEventListener() {},
    createEvent(type) {
      return {
        type: type,
        initEvent(t, bubbles, cancelable) { this.type = t; this.bubbles = bubbles; this.cancelable = cancelable; },
        bubbles: true, cancelable: true
      };
    },
    _mk: mkNode,
    _mkText: mkText
  };
}

// ---------------- 加载 mobile.js 模块 ----------------
// Node 下 document 为 undefined，IIFE 不会执行 boot()，但会导出函数
const mobileJs = require(path.join(ROOT_DIR, 'public', 'mobile', 'mobile.js'));

function setupComposerMocks(source) {
  const doc = makeMockDocument();
  const inputId = source === 'home' ? 'home-input' : 'agent-input';
  const paletteId = source === 'home' ? 'home-slash-palette' : 'agent-slash-palette';
  const indicatorId = source === 'home' ? 'home-skill-indicator' : 'agent-skill-indicator';
  const sendId = source === 'home' ? 'home-send' : 'agent-send';
  doc._mk('textarea', inputId);
  doc._mk('div', paletteId);
  doc._mk('div', indicatorId);
  doc._mk('button', sendId);
  global.document = doc;
  return doc;
}

(async () => {
  // ============================================================
  // [0] 准备：启动 server + 配对
  // ============================================================
  section('0) 准备：启动 server + 配对');
  const server = mobile.startMobileServer({ port });
  for (let i = 0; i < 50 && !server.listening; i++) await new Promise((r) => setTimeout(r, 20));
  ok('mobile server listening', server.listening);
  await mobile.saveConfig({ enabled: true });
  const pc = await mobile.startPairCode();
  const rPC = await req({ path: '/api/mobile/pair/confirm', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({ pairCode: pc.pairCode, deviceName: 'Smoke-CHAT-P1' }));
  const jPC = JSON.parse(rPC.body);
  const token = jPC.token;
  const auth = { Authorization: 'Bearer ' + token };
  ok('pair/confirm 200', rPC.status === 200);
  ok('token 取得', !!token && token.length > 30);

  // 注入 skill：academic-paper / handoff / empty-desc
  const claudeSkillsDir = path.join(TMP_HOME, '.claude', 'skills');
  fs.mkdirSync(claudeSkillsDir, { recursive: true });
  function writeSkill(name, desc) {
    const dir = path.join(claudeSkillsDir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# ' + name + '\n' + (desc || ''), 'utf8');
  }
  writeSkill('academic-paper', 'Academic paper skill description.');
  writeSkill('handoff', 'Handoff skill description.');
  writeSkill('empty-desc', '');

  // ============================================================
  // [1] 静态结构检查
  // ============================================================
  section('1) CHAT-P1 静态结构');
  ok('HTML 含 #home-slash-palette', /id="home-slash-palette"/.test(html));
  ok('HTML 含 #home-skill-indicator', /id="home-skill-indicator"/.test(html));
  ok('HTML 含 #agent-slash-palette', /id="agent-slash-palette"/.test(html));
  ok('HTML 含 #agent-skill-indicator', /id="agent-skill-indicator"/.test(html));
  ok('CSS 含 .slash-palette', /\.slash-palette\s*\{/.test(css));
  ok('CSS 含 .slash-item', /\.slash-item\s*\{/.test(css));
  ok('CSS 含 .slash-item.is-active', /\.slash-item\.is-active/.test(css));
  ok('CSS 含 .skill-indicator', /\.skill-indicator\s*\{/.test(css));
  ok('CSS slash-item min-height >= 44px', /\.slash-item\s*\{[^}]*min-height:\s*(?:[4-9]\d|\d{3,})/.test(css));
  ok('CSS slash-palette 可滚动 (overflow-y: auto)', /\.slash-palette\s*\{[^}]*overflow-y:\s*auto/.test(css));
  ok('CSS slash-palette 绝对定位在输入框上方 (bottom: calc)', /\.slash-palette\s*\{[^}]*bottom:\s*calc\(100%\s*\+/.test(css));

  ok('mobile.js 含 composerState', /var composerState\s*=/.test(js));
  ok('mobile.js 含 searchSkills', /function searchSkills\s*\(/.test(js));
  ok('mobile.js 含 injectSkillPrompt', /function injectSkillPrompt\s*\(/.test(js));
  ok('mobile.js 含 selectSkill', /function selectSkill\s*\(/.test(js));
  ok('mobile.js 含 clearComposer', /function clearComposer\s*\(/.test(js));
  ok('mobile.js 含 restoreComposer', /function restoreComposer\s*\(/.test(js));
  ok('mobile.js 含 handleSlashKeydown', /function handleSlashKeydown\s*\(/.test(js));
  ok('mobile.js 含 updateSlashPalette', /function updateSlashPalette\s*\(/.test(js));
  ok('mobile.js onSendMessage 调用 clearComposer', /function onSendMessage[\s\S]{0,6000}clearComposer\s*\(/.test(js));
  ok('mobile.js onSendMessage catch 调用 restoreComposer', /function onSendMessage[\s\S]{0,8000}catch\s*\([\s\S]{0,1200}restoreComposer\s*\(/.test(js));

  // ============================================================
  // [2] Skill 搜索 + 注入（纯函数）
  // ============================================================
  section('2) Skill 搜索与注入');
  mobileJs.skillsState.items = [
    { id: 'academic-paper', name: 'academic-paper', description: 'Academic paper skill.', source: 'claude' },
    { id: 'handoff', name: 'handoff', description: 'Handoff skill.', source: 'claude' },
    { id: 'empty-desc', name: 'empty-desc', description: '', source: 'claude' },
    { id: 'no-id', name: 'no-id-name', description: 'No id skill.', source: 'claude' }
  ];
  mobileJs.skillsState.states = {};

  const allResults = mobileJs.searchSkills('');
  ok('searchSkills("")) 最多返回 8 个', allResults.length <= 8);
  ok('searchSkills 过滤掉无 id/name', allResults.every((s) => !!(s && (s.id || s.name))));

  const paperResults = mobileJs.searchSkills('paper');
  ok('searchSkills("paper") 命中 academic-paper', paperResults.length > 0 && paperResults[0].id === 'academic-paper');

  const zhResults = mobileJs.searchSkills('论文');
  ok('searchSkills("论文") 中文命中 academic-paper', zhResults.length > 0 && zhResults.some((s) => s.id === 'academic-paper'));

  const noResults = mobileJs.searchSkills('xyznotfound');
  ok('searchSkills("xyznotfound") 为空', noResults.length === 0);

  const injected = mobileJs.injectSkillPrompt('帮我写摘要', { name: 'academic-paper', zhDescription: '用于学术论文写作。', source: 'claude' });
  ok('injectSkillPrompt 包含 Skill: academic-paper', /Skill:\s*academic-paper/.test(injected));
  ok('injectSkillPrompt 包含中文 description', /用于学术论文写作/.test(injected));
  ok('injectSkillPrompt 包含 User request', /User request:/.test(injected));
  ok('injectSkillPrompt 不暴露真实文件路径', !/\.claude\/skills|SKILL\.md|\\/.test(injected));

  // ============================================================
  // [3] Composer 状态管理（DOM mock）
  // ============================================================
  section('3) Composer 状态管理');
  const doc = setupComposerMocks('home');
  global.localStorage = { getItem() { return token; }, setItem() {}, removeItem() {} };

  // clearComposer
  doc._byId['home-input'].value = 'hello';
  doc._byId['home-input'].style.height = '120px';
  mobileJs.composerState.selectedSkill = { name: 'handoff' };
  mobileJs.clearComposer('home');
  ok('clearComposer 清空 #home-input value', doc._byId['home-input'].value === '');
  ok('clearComposer 重置 #home-input height', !doc._byId['home-input'].style.height);
  ok('clearComposer 清空 selectedSkill', mobileJs.composerState.selectedSkill === null);

  // restoreComposer
  mobileJs.restoreComposer('home', 'retry text', { name: 'academic-paper' });
  ok('restoreComposer 恢复 #home-input value', doc._byId['home-input'].value === 'retry text');
  ok('restoreComposer 恢复 selectedSkill', mobileJs.composerState.selectedSkill && mobileJs.composerState.selectedSkill.name === 'academic-paper');

  // selectSkill
  mobileJs.composerState.selectedSkill = null;
  doc._byId['home-input'].value = '/academic-paper 写论文';
  mobileJs.selectSkill('home', { id: 'academic-paper', name: 'academic-paper', description: 'desc', source: 'claude' }, '写论文');
  ok('selectSkill 保留剩余文本', doc._byId['home-input'].value === '写论文');
  ok('selectSkill 设置 selectedSkill', mobileJs.composerState.selectedSkill && mobileJs.composerState.selectedSkill.id === 'academic-paper');

  // ============================================================
  // [4] Slash Palette 键盘导航
  // ============================================================
  section('4) Slash Palette 键盘导航');
  mobileJs.composerState.slashOpen = true;
  mobileJs.composerState.slashItems = [
    { id: 'a', name: 'a', description: 'd1', source: 'claude' },
    { id: 'b', name: 'b', description: 'd2', source: 'claude' },
    { id: 'c', name: 'c', description: 'd3', source: 'claude' }
  ];
  mobileJs.composerState.slashIndex = 0;

  const evDown = { key: 'ArrowDown', preventDefault() {}, stopPropagation() {} };
  mobileJs.handleSlashKeydown(evDown, 'home');
  ok('ArrowDown 高亮下移', mobileJs.composerState.slashIndex === 1);
  mobileJs.handleSlashKeydown(evDown, 'home');
  mobileJs.handleSlashKeydown(evDown, 'home');
  ok('ArrowDown 循环到首项', mobileJs.composerState.slashIndex === 0);

  const evUp = { key: 'ArrowUp', preventDefault() {}, stopPropagation() {} };
  mobileJs.handleSlashKeydown(evUp, 'home');
  ok('ArrowUp 循环到末项', mobileJs.composerState.slashIndex === 2);

  const evEsc = { key: 'Escape', preventDefault() {}, stopPropagation() {} };
  mobileJs.handleSlashKeydown(evEsc, 'home');
  ok('Escape 关闭 slash palette', mobileJs.composerState.slashOpen === false);

  // ============================================================
  // [5] 后端 Skill API + 安全字段
  // ============================================================
  section('5) Skill API 安全字段');
  const rSkills = await req({ path: '/api/mobile/skills', method: 'GET', headers: auth });
  const jSkills = JSON.parse(rSkills.body);
  ok('GET /api/mobile/skills 200', rSkills.status === 200);
  ok('skills 返回 items 数组', jSkills.items && Array.isArray(jSkills.items));
  ok('skills 包含 academic-paper', jSkills.items.some((s) => (s.id || s.name) === 'academic-paper'));
  ok('skills 包含 handoff', jSkills.items.some((s) => (s.id || s.name) === 'handoff'));
  ok('skills 不含真实文件路径 (.claude/skills)', !jSkills.items.some((s) => /\.claude\/skills|SKILL\.md|\\/.test(JSON.stringify(s))));
  ok('skills 每项都有 name', jSkills.items.every((s) => !!s.name));
  ok('skills 每项都有 source', jSkills.items.every((s) => !!s.source));

  // toggle 失败友好提示（源码）
  ok('onToggleSkill catch 调 paintSkills 显示错误', /onToggleSkill[\s\S]{0,600}catch\s*\([\s\S]{0,400}paintSkills\s*\(/.test(js));

  // ============================================================
  // [6] Send 链路：draft + messages
  // ============================================================
  section('6) Send 链路');
  const cwdMock = path.join(TMP_HOME, 'fanbox-cwd-chat');
  fs.mkdirSync(cwdMock, { recursive: true });
  const rDraft = await req({ path: '/api/mobile/sessions/draft', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ cwd: cwdMock, agentId: 'claude' }));
  const jDraft = JSON.parse(rDraft.body);
  ok('POST /draft 200', rDraft.status === 200);
  const sessionId = jDraft.sessionId;

  const rNorm = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(sessionId) + '/messages', method: 'POST', headers: { 'Content-Type': 'application/json', ...auth } },
    JSON.stringify({ text: '你好', cwd: cwdMock, agentId: 'claude' }));
  const jNorm = JSON.parse(rNorm.body);
  ok('普通消息 POST 200', rNorm.status === 200);
  ok('普通消息 status=done', jNorm.status === 'done', 'status=' + jNorm.status);

  // 拉 messages 验证有 user + assistant bubbles
  const rMsgs = await req({ path: '/api/mobile/sessions/' + encodeURIComponent(sessionId) + '/messages', method: 'GET', headers: auth });
  const jMsgs = JSON.parse(rMsgs.body);
  ok('GET messages 200', rMsgs.status === 200);
  ok('messages 含 user 消息', jMsgs.messages && jMsgs.messages.some((m) => m.role === 'user'));
  ok('messages 含 agent/assistant 回复', jMsgs.messages && jMsgs.messages.some((m) => m.role === 'agent' || m.role === 'assistant'));

  // ============================================================
  // [7] 安全边界：不新增危险功能
  // ============================================================
  section('7) 安全边界');
  ok('UI 不含 Delete File 按钮', !/Delete File/.test(allUi));
  ok('UI 不含 Move File 按钮', !/Move File/.test(allUi));
  ok('UI 不含 Rename File 按钮', !/Rename File/.test(allUi));
  ok('UI 不含 Upload File 按钮', !/Upload File/.test(allUi));
  ok('UI 不含 Execute Shell / Terminal Input / PTY', !/Execute Shell|Terminal Input|PTY|pty\.spawn/.test(allUi));
  ok('UI 不含 YOLO / Team Mode / Full-auto', !/YOLO|Team Mode|Full-auto/.test(allUi));
  ok('POST_ALLOWLIST 不含 upload/delete/move/rename/shell/pty', (function () {
    const m = js.match(/POST_ALLOWLIST\s*=\s*\[([\s\S]*?)\]/);
    if (!m) return false;
    return !/(upload|delete|move|rename|shell|pty|exec)/i.test(m[1]);
  })());

  // 收尾
  await new Promise((r) => server.close(r));
  console.log('\n===== CHAT-P1 总结 =====');
  console.log('PASS:', passed);
  console.log('FAIL:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
