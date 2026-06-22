/* ============================================================
   scripts/test-mobile-render.js
   Phase 1 真实手机运行时硬化 · 渲染单元测试
   目的：抓 appendChild(string) 等真实运行时错误，
         而不只是静态 smoke。
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const MOBILE_JS = path.join(ROOT, 'public', 'mobile', 'mobile.js');
const MOBILE_HTML = path.join(ROOT, 'public', 'mobile', 'index.html');
const MOBILE_CSS = path.join(ROOT, 'public', 'mobile', 'mobile.css');

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push({ name, detail: detail || '' }); console.log('  ✗ ' + name + (detail ? ' :: ' + detail : '')); }
}
function section(title) { console.log('\n[' + title + ']'); }

// ---------------- 最小 DOM stub ----------------
function makeElFactory(NodeClass, TextClass, HTMLElementClass) {
  return function makeEl(tag) {
    const node = new HTMLElementClass(tag);
    node.childNodes = [];
    node.children = [];
    node._attrs = {};
    node._className = '';
    node._innerHTML = '';
    node._textContent = '';
    node._value = '';
    node._hidden = false;
    node._dataset = {};
    node._options = [];
    node.classList = {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, v) { if (v === undefined ? !this._set.has(c) : v) this._set.add(c); else this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    };
    node.addEventListener = function() {};
    node.appendChild = function(c) {
      if (c == null) return c;
      if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
        // 真实浏览器会抛 "Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'"
        throw new TypeError("Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'.");
      }
      if (c && c.nodeType != null) { this.childNodes.push(c); this.children.push(c); return c; }
      throw new TypeError("Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'.");
    };
    node.setAttribute = function(k, v) { this._attrs[k] = String(v); };
    node.getAttribute = function(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; };
    node.removeAttribute = function(k) { delete this._attrs[k]; };
    Object.defineProperty(node, 'className', { get() { return this._className; }, set(v) { this._className = String(v); }, configurable: true });
    Object.defineProperty(node, 'innerHTML', { get() { return this._innerHTML; }, set(v) { this._innerHTML = String(v); this.childNodes = []; this.children = []; }, configurable: true });
    Object.defineProperty(node, 'textContent', {
      get() { if (this.childNodes.length) return this.childNodes.map(c => c.textContent || '').join(''); return this._textContent; },
      set(v) { this._textContent = String(v); this.childNodes = []; this.children = []; },
      configurable: true
    });
    Object.defineProperty(node, 'hidden', { get() { return this._hidden; }, set(v) { this._hidden = !!v; }, configurable: true });
    Object.defineProperty(node, 'value', { get() { return this._value; }, set(v) { this._value = String(v); }, configurable: true });
    Object.defineProperty(node, 'firstChild', { get() { return this.childNodes[0] || null; }, configurable: true });
    Object.defineProperty(node, 'dataset', { get() { return this._dataset; }, configurable: true });
    Object.defineProperty(node, 'options', { get() { return this._options; }, configurable: true });
    node.removeChild = function(c) {
      const i = this.childNodes.indexOf(c);
      if (i >= 0) this.childNodes.splice(i, 1);
      const j = this.children.indexOf(c);
      if (j >= 0) this.children.splice(j, 1);
      return c;
    };
    node.querySelector = function() { return null; };
    node.querySelectorAll = function() { return []; };
    return node;
  };
}

function makeDocument(NodeClass, TextClass, HTMLElementClass, elements) {
  if (!elements) elements = {};
  const makeEl = makeElFactory(NodeClass, TextClass, HTMLElementClass);
  return {
    createElement: makeEl,
    createTextNode(t) { return new TextClass(t); },
    getElementById(id) { return elements[id] || null; },
    querySelector(sel) {
      if (sel && sel[0] === '#') return elements[sel.slice(1)] || null;
      if (sel === '.tab-btn.is-active') return elements._activeTab || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.tab-pane') return Object.values(elements).filter(e => e._attrs && e._attrs['data-tab']);
      if (sel === '.tab-btn') return Object.values(elements).filter(e => e._attrs && e._attrs['data-tab-btn']);
      if (sel === '.qa-tile') return Object.values(elements).filter(e => e._attrs && e._attrs['data-go']);
      if (sel && sel.startsWith('[data-i]')) return Object.values(elements).filter(e => e._attrs && 'data-i' in e._attrs);
      return [];
    },
    addEventListener() {},
    readyState: 'complete',
    register(id, el) { elements[id] = el; },
    _elements: elements
  };
}

function makeLocalStorage() {
  const data = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
    clear() { for (const k in data) delete data[k]; },
    _data: data
  };
}

function makeSandbox() {
  const ls = makeLocalStorage();
  const elements = {};
  // Node / Text / HTMLElement 必须先于 makeDocument 定义
  const Node = class { constructor() { this.nodeType = 1; this.childNodes = []; } };
  const Text = class extends Node { constructor(v) { super(); this.nodeType = 3; this.textContent = String(v == null ? '' : v); } };
  const HTMLElement = class extends Node { constructor(tag) { super(); this.tagName = String(tag || '').toUpperCase(); } };
  Node.TEXT_NODE = 3;
  Node.ELEMENT_NODE = 1;
  const document = makeDocument(Node, Text, HTMLElement, elements);
  const sandbox = {
    document,
    localStorage: ls,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise,
    AbortController: class { constructor() { this.signal = { aborted: false }; this.abort = () => { this.signal.aborted = true; }; } },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    Blob: class { constructor(parts) { this.parts = parts; this.size = (parts || []).reduce((a, p) => a + (p.length || 0), 0); this.type = ''; } },
    fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, items: [] }), text: () => Promise.resolve(''), blob: () => Promise.resolve({ size: 0, type: 'image/png' }) }),
    module: { exports: {} },
    exports: {}
  };
  const winListeners = {};
  const windowObj = {
    addEventListener(type, cb) { (winListeners[type] = winListeners[type] || []).push(cb); },
    removeEventListener(type, cb) { if (winListeners[type]) winListeners[type] = winListeners[type].filter(x => x !== cb); },
    dispatchEvent(type) { (winListeners[type] || []).forEach(cb => { try { cb({ type }); } catch (e) {} }); },
    _listeners: winListeners
  };
  sandbox.window = windowObj;
  sandbox.Node = Node;
  sandbox.Text = Text;
  sandbox.HTMLElement = HTMLElement;
  return { sandbox, elements, document, ls };
}

// 加载 mobile.js 到 sandbox
function loadMobile(overrides) {
  overrides = overrides || {};
  const src = fs.readFileSync(MOBILE_JS, 'utf8');
  const { sandbox, elements, document, ls } = makeSandbox();
  // 预注册关键 DOM 元素
  const ids = [
    'pair-screen','pair-code','pair-device','pair-btn','pair-msg',
    'app','app-sub','app-refresh',
    'home-roots',
    'files-root','files-q','files-go','files-list','files-meta',
    'files-preview','files-preview-name','files-preview-meta','files-preview-body','files-preview-close',
    'skills-q','skills-list',
    'agents-list',
    'usage-today','usage-week','usage-list'
  ];
  ids.forEach(id => { elements[id] = document.createElement('div'); elements[id].id = id; });
  // 模拟 input value
  ['files-q','skills-q','files-root','pair-code','pair-device'].forEach(id => {
    const el = elements[id];
    el.tagName = id === 'files-q' || id === 'skills-q' || id === 'pair-code' || id === 'pair-device' ? 'INPUT' : el.tagName;
    Object.defineProperty(el, 'value', { get() { return el._value || ''; }, set(v) { el._value = String(v); }, configurable: true });
  });
  // select
  elements['files-root'].tagName = 'SELECT';

  if (overrides.fetch) sandbox.fetch = overrides.fetch;
  if (overrides.URL) sandbox.URL = overrides.URL;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'mobile.js' });
  return sandbox.module.exports || sandbox.exports;
}

function run() {
  console.log('=== Phase 1 渲染硬化测试 ===');

  // 1. 加载并导出
  section('1) 加载 mobile.js + 导出');
  const M = loadMobile();
  check('M 对象存在', !!M, '');
  check('M.asNode 存在', typeof M.asNode === 'function', '');
  check('M.appendNodes 存在', typeof M.appendNodes === 'function', '');
  check('M.el 存在', typeof M.el === 'function', '');
  check('M.tspan 存在', typeof M.tspan === 'function', '');
  check('M.pickList 存在', typeof M.pickList === 'function', '');
  check('M.statusPill 存在', typeof M.statusPill === 'function', '');
  check('M.emptyBlock 存在', typeof M.emptyBlock === 'function', '');
  check('M.paintSkills 存在', typeof M.paintSkills === 'function', '');
  check('M.paintAgents 存在', typeof M.paintAgents === 'function', '');
  check('M.paintUsage 存在', typeof M.paintUsage === 'function', '');
  check('M.renderFilePreview 存在', typeof M.renderFilePreview === 'function', '');
  check('M.AGENT_FALLBACK 4 项', M.AGENT_FALLBACK && M.AGENT_FALLBACK.length === 4, '');
  check('AGENT_FALLBACK 含 claude/codex/opencode/qoder',
    M.AGENT_FALLBACK.map(a => a.id).join(',') === 'claude,codex,opencode,qoder', '');

  // 2. asNode 行为
  section('2) asNode / appendNodes 行为');
  const doc = makeDocument();
  const sandbox = makeSandbox().sandbox;
  // 在新 sandbox 重新跑 mobile.js 但用更原始的 document
  const { sandbox: s2, elements: e2 } = makeSandbox();
  vm.createContext(s2);
  vm.runInContext(fs.readFileSync(MOBILE_JS, 'utf8'), s2, { filename: 'mobile.js' });
  const M2 = s2.module.exports;
  const tn = s2.document.createTextNode('x');
  check('asNode(string) → Text node', M2.asNode('hello') && M2.asNode('hello').nodeType === 3, '');
  check('asNode(null) → Text node', M2.asNode(null) && M2.asNode(null).nodeType === 3, '');
  check('asNode(undefined) → Text node', M2.asNode(undefined) && M2.asNode(undefined).nodeType === 3, '');
  check('asNode(number) → Text node', M2.asNode(42) && M2.asNode(42).textContent === '42', '');
  check('asNode(Node) → 同一 Node', M2.asNode(tn) === tn, '');
  const p = s2.document.createElement('p');
  // 传 6 个，null/undefined 被跳过，实际期望 4 个有效子节点
  M2.appendNodes(p, ['a', null, 'b', 123, tn, undefined]);
  check('appendNodes 混合类型不抛错', p.childNodes.length === 4, 'got=' + p.childNodes.length);
  check('appendNodes 文本内容正确', p.textContent === 'ab123x', 'got=' + JSON.stringify(p.textContent));

  // 3. el() 安全
  section('3) el() 调用安全');
  check('el("span", {text:"x"}, []) 不抛错', (() => { try { const n = M2.el('span', { text: 'x' }, []); return n; } catch (e) { return null; } })() !== null, '');
  const pill = M2.el('span', { class: 'usage-pill' }, [
    M2.el('span', { class: 'status-dot status-dot-ok' }),
    'available'
  ]);
  check('el("span", {class}, [el, "string"]) 不抛错', pill && pill.childNodes.length === 2, '这是导致手机端 appendChild 报错的根源');
  // 这是真实手机 bug 的核心：旧代码会在这里抛 TypeError
  check('pill 第一子是 Node', pill.childNodes[0] && pill.childNodes[0].nodeType === 1, '');
  check('pill 第二子是 TextNode', pill.childNodes[1] && pill.childNodes[1].nodeType === 3, '');

  // 4. statusPill
  section('4) statusPill');
  const okPill = M2.statusPill('available', 'ok');
  const emptyPill = M2.statusPill('no data', 'empty');
  const unkPill = M2.statusPill('unknown', 'unknown');
  check('statusPill("ok") 不抛错', !!okPill, '');
  check('statusPill("empty") 不抛错', !!emptyPill, '');
  check('statusPill("unknown") 不抛错', !!unkPill, '');
  check('statusPill 含 status-dot + text span', okPill && okPill.childNodes.length === 2, '');

  // 5. paintSkills
  section('5) paintSkills 真实渲染（直接调内部函数，stub #skills-list）');
  const { sandbox: s3, elements: e3, document: d3 } = makeSandbox();
  // 预注册 skills-list + skills-q
  ['skills-list', 'skills-q'].forEach(id => {
    e3[id] = d3.createElement('div');
    if (id === 'skills-q') e3[id].tagName = 'INPUT';
    Object.defineProperty(e3[id], 'value', { get() { return e3[id]._value || ''; }, set(v) { e3[id]._value = String(v); }, configurable: true });
  });
  vm.createContext(s3);
  vm.runInContext(fs.readFileSync(MOBILE_JS, 'utf8'), s3, { filename: 'mobile.js' });
  const M3 = s3.module.exports;
  M3.skillsState.items = []; // 空数组
  try { M3.paintSkills(); check('paintSkills([]) 不抛错', true, ''); }
  catch (e) { check('paintSkills([]) 不抛错', false, e.message); }
  check('paintSkills([]) → empty block', e3['skills-list'].childNodes.length === 1, 'len=' + e3['skills-list'].childNodes.length);

  M3.skillsState.items = [{ name: 'commit', source: 'claude', description: 'git commit helper', enabled: true, hits: 0, lastUsedAt: 0 }];
  try { M3.paintSkills(); check('paintSkills([1 skill]) 不抛错', true, ''); }
  catch (e) { check('paintSkills([1 skill]) 不抛错', false, e.message); }
  check('paintSkills([1 skill]) → 1 卡片', e3['skills-list'].childNodes.length === 1, 'len=' + e3['skills-list'].childNodes.length);
  check('卡片含 status-pill (ok)', e3['skills-list'].childNodes[0].textContent.indexOf('available') >= 0, '');

  M3.skillsState.items = [{ name: 'review', source: 'claude', description: 'review pr', enabled: false, hits: 0, lastUsedAt: 0 }];
  try { M3.paintSkills(); check('paintSkills(disabled skill) 不抛错', true, ''); }
  catch (e) { check('paintSkills(disabled skill) 不抛错', false, e.message); }

  // 6. paintAgents
  section('6) paintAgents 真实渲染');
  const { sandbox: s4, elements: e4, document: d4 } = makeSandbox();
  e4['agents-list'] = d4.createElement('div');
  vm.createContext(s4);
  vm.runInContext(fs.readFileSync(MOBILE_JS, 'utf8'), s4, { filename: 'mobile.js' });
  const M4 = s4.module.exports;
  try { M4.paintAgents([], null); check('paintAgents([]) 不抛错', true, ''); }
  catch (e) { check('paintAgents([]) 不抛错', false, e.message); }
  check('paintAgents([]) → 4 张 fallback 卡片', e4['agents-list'].childNodes.length === 4, 'len=' + e4['agents-list'].childNodes.length);
  const labels = e4['agents-list'].childNodes.map(n => n.textContent).join('|');
  check('fallback 含 Claude Code', labels.indexOf('Claude Code') >= 0, '');
  check('fallback 含 Codex', labels.indexOf('Codex') >= 0, '');
  check('fallback 含 OpenCode', labels.indexOf('OpenCode') >= 0, '');
  check('fallback 含 Qoder CLI', labels.indexOf('Qoder') >= 0, '');

  try { M4.paintAgents([{id:'claude',label:'Claude Code',command:'claude',installed:true}], null); check('paintAgents([claude]) 不抛错', true, ''); }
  catch (e) { check('paintAgents([claude]) 不抛错', false, e.message); }
  // 1 个 API + 3 个 fallback = 4
  check('paintAgents([claude]) → 4 张 (1 API + 3 fallback)', e4['agents-list'].childNodes.length === 4, 'len=' + e4['agents-list'].childNodes.length);

  try { M4.paintAgents([{id:'claude',label:'Claude Code',command:'claude',installed:true},{id:'codex',label:'Codex',command:'codex',installed:false}], null); check('paintAgents([claude+codex]) 不抛错', true, ''); }
  catch (e) { check('paintAgents([claude+codex]) 不抛错', false, e.message); }
  // 不应包含 launch / send / execute 按钮文案
  const agentTxt = e4['agents-list'].textContent;
  check('agent 卡片不含 Start Agent', agentTxt.indexOf('Start Agent') < 0, '');
  check('agent 卡片不含 Send Task', agentTxt.indexOf('Send Task') < 0, '');
  check('agent 卡片不含 Run Agent', agentTxt.indexOf('Run Agent') < 0, '');

  // 7. paintUsage
  section('7) paintUsage 真实渲染');
  const { sandbox: s5, elements: e5, document: d5 } = makeSandbox();
  ['usage-today', 'usage-week', 'usage-list'].forEach(id => { e5[id] = d5.createElement('div'); });
  vm.createContext(s5);
  vm.runInContext(fs.readFileSync(MOBILE_JS, 'utf8'), s5, { filename: 'mobile.js' });
  const M5 = s5.module.exports;
  try { M5.paintUsage(null, 'http_500'); check('paintUsage(null, err) 不抛错', true, ''); }
  catch (e) { check('paintUsage(null, err) 不抛错', false, e.message); }
  check('paintUsage(null, err) → empty block', e5['usage-list'].childNodes.length === 1, '');

  try {
    M5.paintUsage({
      ok: true,
      summary: { todayTokens: 1234, weekTokens: 56789 },
      agents: [
        { id: 'claude', label: 'Claude Code', todayTokens: 1000, weekTokens: 50000, available: true },
        { id: 'codex',  label: 'Codex',       todayTokens: 234,  weekTokens: 6789,  available: false }
      ]
    }, null);
    check('paintUsage(2 agents) 不抛错', true, '');
  } catch (e) { check('paintUsage(2 agents) 不抛错', false, e.message); }
  check('paintUsage(2 agents) → 2 行', e5['usage-list'].childNodes.length === 2, 'len=' + e5['usage-list'].childNodes.length);
  check('usage-today 显示 token', e5['usage-today'].textContent === '1.2K' || e5['usage-today'].textContent === '1234', 'got=' + e5['usage-today'].textContent);
  check('usage-week 显示 token', e5['usage-week'].textContent === '56.8K' || e5['usage-week'].textContent === '56789', 'got=' + e5['usage-week'].textContent);

  // 8. renderFilePreview
  section('8) renderFilePreview 行为');
  const { sandbox: s6, elements: e6, document: d6 } = makeSandbox();
  e6['files-preview-body'] = d6.createElement('div');
  vm.createContext(s6);
  vm.runInContext(fs.readFileSync(MOBILE_JS, 'utf8'), s6, { filename: 'mobile.js' });
  const M6 = s6.module.exports;
  const body = e6['files-preview-body'];
  // text
  try { M6.renderFilePreview({ ok: true, kind: 'text', text: 'line1\nline2\nline3', name: 'a.txt', size: 100, max: 1000 }, body); check('text preview 不抛错', true, ''); }
  catch (e) { check('text preview 不抛错', false, e.message); }
  check('text preview body 含 <pre>', body.children.some(c => c.tagName === 'PRE'), '');
  // pdf
  body.childNodes = []; body.children = [];
  try { M6.renderFilePreview({ ok: true, kind: 'pdf', name: 'a.pdf', size: 1000, max: 1000 }, body); check('pdf preview 不抛错', true, ''); }
  catch (e) { check('pdf preview 不抛错', false, e.message); }
  // too large
  body.childNodes = []; body.children = [];
  try { M6.renderFilePreview({ ok: true, previewTooLarge: true, size: 999999, max: 1000, kind: 'text' }, body); check('previewTooLarge 不抛错', true, ''); }
  catch (e) { check('previewTooLarge 不抛错', false, e.message); }
  // image - 这是关键: 不应该直接 <img src="/api/mobile/thumb">
  body.childNodes = []; body.children = [];
  // 用一个独立 sandbox + 自定义 fetch
  const imgSandboxPack = makeSandbox();
  const sImg = imgSandboxPack.sandbox;
  const eImg = imgSandboxPack.elements;
  const dImg = imgSandboxPack.document;
  eImg['files-preview-body'] = dImg.createElement('div');
  // 预置 token
  imgSandboxPack.ls.setItem('fanbox.mobile.token', 'test-token-123');
  let fetchCalled = null;
  sImg.fetch = (url, opts) => {
    fetchCalled = { url: String(url), hasAuth: !!(opts && opts.headers && opts.headers.Authorization), headers: opts && opts.headers };
    return Promise.resolve({
      ok: true,
      status: 200,
      blob: () => Promise.resolve({ size: 1024, type: 'image/png' })
    });
  };
  vm.createContext(sImg);
  vm.runInContext(fs.readFileSync(MOBILE_JS, 'utf8'), sImg, { filename: 'mobile.js' });
  const MImg = sImg.module.exports;
  const imgBody = eImg['files-preview-body'];
  MImg.renderFilePreview({ ok: true, kind: 'image', thumbUrl: '/api/mobile/thumb?path=foo.png', name: 'foo.png' }, imgBody);
  // 同步检查：renderFilePreview 内部第一行 appendChild 了 'preview-loading'，调用瞬间就有
  const loadingAtStart = imgBody.childNodes.some(c => c.textContent && c.textContent.indexOf('加载中') >= 0);
  check('image preview 初始状态含 loading (同步)', loadingAtStart, '');
  // loadAuthImage 是 async, 等下一个 microtask
  return new Promise(resolve => {
    setTimeout(() => {
      check('image preview 调用 fetch (loadAuthImage)', fetchCalled !== null, 'fetch 没被调用 — 仍是直接 img src');
      check('image preview fetch 带 Authorization header', fetchCalled && fetchCalled.hasAuth, 'fetch 缺 Authorization, got=' + JSON.stringify(fetchCalled));
      check('image preview 不直接 <img src=thumbUrl>', !imgBody.innerHTML.includes('src="/api/mobile/thumb'), '检测到直接 img src!');
      // 加载完成后 body 应有 IMG
      const hasImg = imgBody.children && imgBody.children.some(c => c.tagName === 'IMG');
      check('image preview 完成后含 <img>', hasImg, 'body children: ' + (imgBody.children || []).map(c => c.tagName).join(','));
      resolve(runEnd());
    }, 30);
  });

  function runEnd() {
    // 9. 静态检查
    section('9) 静态检查（防止 appendChild(string) 回归）');
    const src = fs.readFileSync(MOBILE_JS, 'utf8');
    const html = fs.readFileSync(MOBILE_HTML, 'utf8');
    const css = fs.readFileSync(MOBILE_CSS, 'utf8');
    // 1) 必须有 asNode 和 appendNodes
    check('mobile.js 含 function asNode', /function\s+asNode\s*\(/.test(src), '');
    check('mobile.js 含 function appendNodes', /function\s+appendNodes\s*\(/.test(src), '');
    // 2) 不能有 "appendChild(" 直接传字符串变量的可疑模式（[el, 'string']）
    // 我们允许 appendChild(var) 但不允许 appendChild('string') 或 appendChild("string")
    const badAppendChildString = /appendChild\(\s*(['"])/.test(src);
    check('mobile.js 不含 appendChild("string") 字面量', !badAppendChildString, '');
    // 3) 不应再出现 [el(...), 'available'] 模式
    const oldBuggyPattern = /\[\s*el\s*\([^)]+\)\s*,\s*['"][a-zA-Z]+['"]\s*\]/g;
    const oldMatches = src.match(oldBuggyPattern) || [];
    check('mobile.js 不再含 [el, "string"] 危险模式', oldMatches.length === 0, 'matches=' + JSON.stringify(oldMatches.slice(0,3)));
    // 4) el() 应使用 appendNodes 而不是直接 appendChild on kids
    const elFuncMatch = src.match(/function\s+el\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
    check('el() 使用 appendNodes (而非裸 appendChild)', elFuncMatch && /appendNodes\(/.test(elFuncMatch[0]), '');

    // 5) image preview 不用 <img src="/api/mobile/thumb...">
    const directImg = /<img\s+[^>]*src\s*=\s*["']\/api\/mobile\/thumb/.test(html);
    check('index.html 不含 <img src="/api/mobile/thumb...">', !directImg, '');
    // JS 中也不应有 thumbUrl 直接赋给 img.src
    const directImgInJs = /\.src\s*=\s*j\.thumbUrl|\.src\s*=\s*['"]\/api\/mobile\/thumb/.test(src);
    check('mobile.js 不直接把 thumbUrl 赋给 img.src', !directImgInJs, '');

    // 6) loadAuthImage 使用 fetch + Authorization + blob URL
    check('mobile.js 含 loadAuthImage 函数', /function\s+loadAuthImage\s*\(/.test(src), '');
    check('loadAuthImage 调用 fetch', /loadAuthImage[\s\S]{0,200}fetch/.test(src), '');
    check('loadAuthImage 带 Authorization header', /loadAuthImage[\s\S]{0,400}Authorization/.test(src), '');
    check('loadAuthImage 使用 URL.createObjectURL', /loadAuthImage[\s\S]{0,400}createObjectURL/.test(src), '');
    check('mobile.js 包含 URL.revokeObjectURL', /revokeObjectURL/.test(src), '');

    // 7) pickList 兼容多结构
    check('mobile.js 含 pickList 适配器', /function\s+pickList\s*\(/.test(src), '');
    check('pickList 支持 data.items', /data\.items/.test(src), '');
    check('pickList 支持 data.skills', /data\.skills/.test(src), '');
    check('pickList 支持 data.agents', /data\.agents/.test(src), '');

    // 8) agents 至少 4 项 fallback
    check('AGENT_FALLBACK 含 4 项', /AGENT_FALLBACK\s*=\s*\[[\s\S]{0,500}id:\s*['"]claude['"][\s\S]{0,500}id:\s*['"]codex['"][\s\S]{0,500}id:\s*['"]opencode['"][\s\S]{0,500}id:\s*['"]qoder['"]/.test(src), '');

    // 9) 危险按钮文案扫描（不回归）— 只看 <button> / [type=button] 元素
    const dangerBtns = ['Start Agent', 'Run Agent', 'Send Task', 'Execute', 'Terminal Input', 'Delete File', 'Rename File', 'Move File', 'Upload File'];
    dangerBtns.forEach(text => {
      // 匹配 <button ...> ... <text> ... </button> 或带 [type=button]
      const re = new RegExp('<button[^>]*>[^<]*' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^<]*</button>', 'i');
      check('index.html 不含 <button> 文案 "' + text + '"', !re.test(html), '');
    });

    // 10) CSS 细节
    check('mobile.css 含 .preview-loading 样式', /\.preview-loading\s*\{/.test(css), '');
    check('mobile.css 含 .usage-pill-unknown', /\.usage-pill-unknown\s*\{/.test(css), '');
    check('mobile.css 含 .status-dot-unknown', /\.status-dot-unknown\s*\{/.test(css), '');
    check('mobile.css .preview-pre 有 overflow-x:auto', /\.preview-pre\s*\{[^}]*overflow-x\s*:\s*auto/.test(css), '');
    check('mobile.css .app padding-bottom 含 bottom-nav', /\.app\s*\{[^}]*padding-bottom\s*:[^;}]*bottom-nav-h/.test(css), '');

    // 11) 关键安全文案仍存在
    check('index.html 含 "Raw logs are never exposed on mobile"', /Raw logs are never exposed on mobile/.test(html), '');
    check('index.html 含 "Read-only detection only"', /Read-only detection only/.test(html), '');

    // 12) 不应把 token 放进 URL
    check('mobile.js 不在 URL query 中放 token', !/['"]\?[^'"]*[?&]token=/.test(src), '');

    // ---- 总结 ----
    console.log('\n===== test-mobile-render 总结 =====');
    console.log('PASS: ' + pass);
    console.log('FAIL: ' + fail);
    if (fail) {
      console.log('\n失败项：');
      failures.forEach(f => console.log('  ✗ ' + f.name + (f.detail ? ' :: ' + f.detail : '')));
    }
    process.exit(fail ? 1 : 0);
  }
}

run();
