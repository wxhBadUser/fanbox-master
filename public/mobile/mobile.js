/* ============================================================
   FanBox Mobile · Mobile Console
   Phase 1 · LAN + Token
   Phase 2A-1 · Sessions + Agent Workspace Shell
   Phase UI-A1 · AionUi-like Command Agent Workspace
     - Agent 页面替代原 5 Tab 结构（Home / Agent / Files / Skills）
     - 手机 / 浏览器可直接对 Agent 说话；redline 仅写 audit
     - 不再要求 desktop approval
   ============================================================ */
(function () {
  'use strict';

  // ---------------- Token 存储 ----------------
  var TOKEN_KEY = 'fanbox.mobile.token';

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t || ''); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  // ---------------- API 包装（GET + Bearer） ----------------
  async function api(path, opts) {
    opts = opts || {};
    if (opts.method && opts.method !== 'GET' && opts.method !== 'HEAD') {
      // Phase UI-A1：mobile UI 的 POST 走 apiPost() 并走白名单；api() 仅做 GET
      throw new Error('api() 仅支持 GET；POST 请用 apiPost 并走白名单');
    }
    var t = getToken();
    if (!t) throw new Error('no_token');
    var r = await fetch(path, {
      method: opts.method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + t,
        'Accept': 'application/json'
      }
    });
    var j = null;
    try { j = await r.json(); } catch (e) { j = { ok: false, error: 'bad_response' }; }
    if (r.status === 401) { clearToken(); showPair('会话已失效，请重新配对'); throw new Error('unauthorized'); }
    if (!j || !j.ok) throw new Error((j && j.error) || ('http_' + r.status));
    return j;
  }

  // Phase UI-A1：POST 白名单（最小集 + 显式）
  // 包含：偏好写入（cwd/select）、mobile session draft/send、skills state
  // 明确不包含：上传/删除/移动/重命名/裸写文件/裸 pty/裸 shell
  var POST_ALLOWLIST = [
    /^\/api\/mobile\/context\/(cwd|select)$/,
    /^\/api\/mobile\/sessions\/draft$/,
    /^\/api\/mobile\/sessions\/[A-Za-z0-9._\-+:]+\/messages$/,
    /^\/api\/mobile\/skills-state$/
  ];
  function isAllowedPost(path) {
    if (!path) return false;
    for (var i = 0; i < POST_ALLOWLIST.length; i++) {
      if (POST_ALLOWLIST[i].test(path)) return true;
    }
    return false;
  }
  async function apiPost(path, body) {
    if (!isAllowedPost(path)) {
      throw new Error('POST 端点不在白名单：' + path);
    }
    var t = getToken();
    if (!t) throw new Error('no_token');
    var r = await fetch(path, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + t,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body || {})
    });
    var j = null;
    try { j = await r.json(); } catch (e) { j = { ok: false, error: 'bad_response' }; }
    if (r.status === 401) { clearToken(); showPair('会话已失效，请重新配对'); throw new Error('unauthorized'); }
    if (!j || !j.ok) throw new Error((j && j.error) || ('http_' + r.status));
    return j;
  }

  // ---------------- 安全 DOM 工具 ----------------
  // 把任意值安全转成 Node，杜绝 appendChild(string) 抛错
  function asNode(v) {
    if (v == null) return document.createTextNode('');
    if (v instanceof Node) return v;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      return document.createTextNode(String(v));
    }
    return document.createTextNode(String(v));
  }
  function appendNodes(parent, children) {
    if (children == null) return;
    var arr = Array.isArray(children) ? children : [children];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] == null) continue;
      try { parent.appendChild(asNode(arr[i])); } catch (e) { /* swallow one bad child */ }
    }
  }
  function clearChildren(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }

  // ---------------- 通用工具 ----------------
  function $(s) { return document.querySelector(s); }
  function $all(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    if (kids != null) appendNodes(n, kids);
    return n;
  }
  // 简化：文字 span，避免 [el, 'text'] 这种不安全模式
  function tspan(text, cls) {
    var s = document.createElement('span');
    if (cls) s.className = cls;
    s.textContent = text == null ? '' : String(text);
    return s;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function fmtSize(n) {
    if (n == null) return '—';
    var u = ['B', 'KB', 'MB', 'GB'];
    var i = 0; var v = Number(n) || 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (i === 0 ? v.toFixed(0) : v.toFixed(1)) + ' ' + u[i];
  }
  function fmtTokens(n) {
    if (n == null) return '—';
    var v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(v);
  }
  function fmtTime(ms) {
    if (!ms) return '—';
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '—';
    var p = function (x) { return x < 10 ? '0' + x : '' + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function relPath(p) {
    if (!p) return '';
    var s = String(p).replace(/\\/g, '/');
    var parts = s.split('/');
    if (parts.length <= 3) return s;
    return '…/' + parts.slice(-3).join('/');
  }
  // 兼容 API 返回结构：data.items / data.skills / data.results / data.agents / []
  function pickList(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.skills)) return data.skills;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.agents)) return data.agents;
    return [];
  }
  function safeCall(fn) {
    try { return fn(); } catch (e) { return undefined; }
  }

  // ---------------- Icons（inline SVG） ----------------
  var ICONS = {
    home:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5L12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>',
    files:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
    skills: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
    agents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9z"/><path d="M3 9h2M3 15h2M19 9h2M19 15h2M9 3v2M15 3v2M9 19v2M15 19v2"/></svg>',
    approval: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.39 0 4.56.93 6.18 2.45"/></svg>',
    sessions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    usage:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
  };
  function paintIcons() {
    $all('[data-i]').forEach(function (n) {
      var k = n.getAttribute('data-i');
      if (ICONS[k]) n.innerHTML = ICONS[k];
    });
  }

  // ---------------- Tab 切换 ----------------
  // Phase UI-A1：主入口只剩 home / agent / files / skills；sessions 已并入 home
  function showTab(name) {
    var allowed = ['home', 'agent', 'files', 'skills'];
    if (allowed.indexOf(name) < 0) name = 'home';
    $all('.tab-pane').forEach(function (p) {
      p.hidden = p.getAttribute('data-tab') !== name;
    });
    $all('.tab-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-tab-btn') === name);
    });
    // Phase UI-A3：切 tab 时关闭手机 drawer
    if (typeof closeHomeDrawer === 'function') closeHomeDrawer();
    var renderers = { home: renderHome, files: renderFiles, agent: renderAgent, skills: renderSkills };
    if (renderers[name]) {
      try { renderers[name](); } catch (e) { console.error('render', name, e); }
    }
  }

  // ---------------- 状态点 helper ----------------
  function statusPill(text, kind) {
    // kind: 'ok' | 'empty' | 'unknown'
    var cls = 'usage-pill';
    if (kind === 'empty') cls += ' usage-pill-empty';
    if (kind === 'unknown') cls += ' usage-pill-unknown';
    var dotCls = 'status-dot';
    if (kind === 'ok') dotCls += ' status-dot-ok';
    else if (kind === 'empty') dotCls += ' status-dot-empty';
    else dotCls += ' status-dot-unknown';
    return el('span', { class: cls }, [
      el('span', { class: dotCls }),
      tspan(text)
    ]);
  }

  // ---------------- Home (Phase UI-A3 · AionUi-like Home Workspace) ----------------
  // 桌面（≥900px）：两栏 —— 左 sidebar（品牌 / New Chat / 历史 sessions） + 右 main（greeting / agent chips / 大输入框）
  // 手机（<900px）：左 sidebar 折叠为 drawer，通过 topbar 菜单按钮展开
  async function renderHome() {
    paintHomeHeroGreet();
    paintHomeAgentChips();
    paintHomeCwd();
    paintHomeModel();
    paintHomeEffort();
    paintHomeStatusPill();
    paintHomeCards();
    // 1) agents（获取每个 agent 的 model / effort）
    var agentsP = api('/api/mobile/agents').then(function (j) {
      var items = pickList(j);
      items.forEach(function (a) {
        agentState.installedMap[a.id] = !!a.installed;
        agentState.agentMeta[a.id] = {
          label: a.label || a.id,
          model: a.model || 'default',
          effort: a.effort || 'normal'
        };
      });
      paintHomeAgentChips();
      paintHomeModel();
      paintHomeEffort();
    }).catch(function () { /* ignore */ });
    // 2) sessions（电脑+手机+微信，统一 index）
    var sessionsP = api('/api/mobile/sessions?limit=50').then(function (j) {
      var items = pickList(j);
      paintHomeSessions(items);
    }).catch(function () { /* ignore */ });

    try { await Promise.all([agentsP, sessionsP]); } catch (e) { /* */ }
    updateHomeSendButtonState();
  }

  // ---------------- Home sidebar：sessions 列表（按日期分组） ----------------
  function paintHomeSessions(items) {
    var box = $('#home-sessions');
    if (!box) return;
    clearChildren(box);
    if (!items || !items.length) {
      box.appendChild(emptyBlock('No sessions yet', '点击 New Chat 开始，或在 Files 选 cwd'));
      return;
    }
    // 按日期分组
    var groups = groupSessionsByDate(items);
    var order = ['Today', 'Yesterday', 'Last 7 Days', 'Older'];
    order.forEach(function (g) {
      if (!groups[g] || !groups[g].length) return;
      box.appendChild(el('div', { class: 'home-sidebar-h', text: g }));
      groups[g].forEach(function (s) {
        box.appendChild(buildHomeSessionItem(s));
      });
    });
    if (groups['__other__'] && groups['__other__'].length) {
      box.appendChild(el('div', { class: 'home-sidebar-h', text: 'Other' }));
      groups['__other__'].forEach(function (s) { box.appendChild(buildHomeSessionItem(s)); });
    }
  }

  // Phase UI-A3：单条 session row（左侧图标 + 标题 + meta + 状态 dot）
  function buildHomeSessionItem(s) {
    var title = (s.title || (s.summary && s.summary.title) || '').toString().trim() || autoSessionTitle(s);
    var agent = (s.agentId || '').toString();
    var agentLabel = (AGENT_CHIPS.find(function (a) { return a.id === agent; }) || {}).label || agent || 'agent';
    var time = fmtTime(s.lastActiveAt || s.startedAt);
    var status = (s.status || 'unknown').toString();
    var isActive = agentState.sessionId && s.sessionId === agentState.sessionId;

    var item = el('button', {
      class: 'home-session-item' + (isActive ? ' is-active' : ''),
      type: 'button',
      role: 'listitem',
      'data-session-id': s.sessionId || '',
      'data-agent-id': agent,
      'data-status': status
    });
    // icon (message bubble)
    var iconSpan = el('span', { class: 'home-session-icon' });
    iconSpan.innerHTML =
      '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M3 5 a2 2 0 0 1 2 -2 h10 a2 2 0 0 1 2 2 v7 a2 2 0 0 1 -2 2 H8 l-3 3 v-3 H5 a2 2 0 0 1 -2 -2 z"/>' +
      '</svg>';
    item.appendChild(iconSpan);
    // body (title + meta)
    var body = el('div', { class: 'home-session-body' });
    body.appendChild(el('div', { class: 'home-session-title', text: title }));
    var meta = el('div', { class: 'home-session-meta' });
    meta.appendChild(tspan(agentLabel));
    meta.appendChild(tspan('·'));
    meta.appendChild(tspan(time));
    body.appendChild(meta);
    item.appendChild(body);
    // status dot
    item.appendChild(el('span', {
      class: 'home-session-status session-status-' + status,
      title: status
    }));

    item.addEventListener('click', function () { onPickHomeSession(s); });
    return item;
  }

  // 自动生成简短标题（无 title 时用）
  function autoSessionTitle(s) {
    var preview = (s.summary && s.summary.lastMessagePreview) || (s.summary && s.summary.title) || '';
    if (preview) {
      var t = String(preview).replace(/\s+/g, ' ').trim();
      if (t.length > 28) t = t.substring(0, 28) + '…';
      return t;
    }
    var dt = new Date(s.startedAt || Date.now());
    var hh = dt.getHours().toString().padStart(2, '0');
    var mm = dt.getMinutes().toString().padStart(2, '0');
    return 'Session ' + hh + ':' + mm;
  }

  // 按日期分组：Today / Yesterday / Last 7 Days / Older
  function groupSessionsByDate(items) {
    var groups = { 'Today': [], 'Yesterday': [], 'Last 7 Days': [], 'Older': [], '__other__': [] };
    var now = Date.now();
    var dayMs = 24 * 3600 * 1000;
    items.forEach(function (s) {
      var t = s.lastActiveAt || s.startedAt;
      if (!t) { groups['__other__'].push(s); return; }
      var d = new Date(t).getTime();
      if (isNaN(d)) { groups['__other__'].push(s); return; }
      var diff = now - d;
      if (diff < dayMs) groups['Today'].push(s);
      else if (diff < 2 * dayMs) groups['Yesterday'].push(s);
      else if (diff < 7 * dayMs) groups['Last 7 Days'].push(s);
      else groups['Older'].push(s);
    });
    return groups;
  }

  // Phase UI-A3：点击 Home sidebar 中的历史 session → 跳到 Agent 独立页
  function onPickHomeSession(s) {
    if (!s || !s.sessionId) return;
    agentState.sessionId = s.sessionId;
    if (s.agentId) agentState.agentId = s.agentId;
    if (s.cwd) agentState.cwd = s.cwd;
    agentLoadedOnce = true;
    // 同步后端偏好（best effort）
    try {
      apiPost('/api/mobile/context/select', {
        cwd: agentState.cwd || '',
        agentId: agentState.agentId || '',
        sessionId: agentState.sessionId || ''
      });
    } catch (e) { /* ignore */ }
    // 跳到 Agent 独立页
    showTab('agent');
    // 关掉手机 drawer
    closeHomeDrawer();
  }

  // ---------------- Phase UI-A3：New Chat ----------------
  // 行为：创建 draft session（不发送任何 prompt），默认 agent = 当前选中 agent
  //       → 跳到 Agent 独立页，由 Agent 页接管对话
  async function onNewChat() {
    if (!agentState.cwd) {
      // 没选 cwd 时：先提示用户去 Files
      showTab('files');
      return;
    }
    if (!agentState.agentId) agentState.agentId = 'claude';
    try {
      var r = await apiPost('/api/mobile/sessions/draft', {
        cwd: agentState.cwd,
        agentId: agentState.agentId
      });
      if (r && r.ok && r.sessionId) {
        agentState.sessionId = r.sessionId;
      } else {
        agentState.sessionId = '';
      }
    } catch (e) {
      agentState.sessionId = '';
    }
    // 同步偏好
    try {
      await apiPost('/api/mobile/context/select', {
        cwd: agentState.cwd || '',
        agentId: agentState.agentId,
        sessionId: agentState.sessionId || ''
      });
    } catch (e) { /* ignore */ }
    // 清空 Home 输入框
    var homeInput = $('#home-input');
    if (homeInput) homeInput.value = '';
    // 跳到 Agent 独立页
    showTab('agent');
    closeHomeDrawer();
  }

  // ---------------- Phase UI-A3：Home 底部 4 张 quick cards（不喧宾夺主） ----------------
  var HOME_CARDS = [
    { id: 'opencode', label: 'Open this folder in OpenCode', prompt: '请帮我看看当前目录的代码结构，并列出可改进的地方：' },
    { id: 'review',   label: 'Review current folder',         prompt: '请审查当前目录的代码，重点关注安全、正确性、可维护性：' },
    { id: 'doc',      label: 'Create README',                prompt: '请为这个项目写一份简介文档：' },
    { id: 'tests',    label: 'Find broken tests',            prompt: '请找出当前目录的失败测试 / 编译错误，并给出修复建议：' }
  ];

  function paintHomeCards() {
    var box = $('#home-cards');
    if (!box) return;
    clearChildren(box);
    HOME_CARDS.forEach(function (c) {
      var card = el('button', { class: 'home-card', type: 'button', title: c.label }, [
        el('span', { class: 'home-card-text', text: c.label })
      ]);
      card.addEventListener('click', function () { onPickHomeCard(c); });
      box.appendChild(card);
    });
  }

  function onPickHomeCard(c) {
    var input = $('#home-input');
    if (!input) return;
    var cur = (input.value || '').trim();
    var sep = cur && !cur.endsWith('\n') ? '\n' : '';
    input.value = cur + sep + (c.prompt || '');
    input.focus();
    updateHomeSendButtonState();
    try { input.scrollIntoView({ block: 'center' }); } catch (_) {}
  }

  // ---------------- Phase UI-A3：手机 drawer 切换 ----------------
  function isHomeDrawerOpen() {
    var s = document.getElementById('home-sidebar');
    return !!(s && s.classList.contains('is-open'));
  }
  function openHomeDrawer() {
    var s = document.getElementById('home-sidebar');
    if (s) s.classList.add('is-open');
    ensureHomeDrawerScrim();
    var ov = document.getElementById('home-drawer-scrim');
    if (ov) ov.classList.add('is-open');
  }
  function closeHomeDrawer() {
    var s = document.getElementById('home-sidebar');
    if (s) s.classList.remove('is-open');
    var ov = document.getElementById('home-drawer-scrim');
    if (ov) ov.classList.remove('is-open');
  }
  function toggleHomeDrawer() {
    if (isHomeDrawerOpen()) closeHomeDrawer();
    else openHomeDrawer();
  }
  function ensureHomeDrawerScrim() {
    var ov = document.getElementById('home-drawer-scrim');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'home-drawer-scrim';
    ov.className = 'home-drawer-scrim';
    ov.addEventListener('click', closeHomeDrawer);
    document.body.appendChild(ov);
    return ov;
  }

  function paintHomeHeroGreet() {
    var greet = $('#home-hero-greet');
    var sub = $('#home-hero-sub');
    var now = new Date();
    var hr = now.getHours();
    var time = (hr < 12) ? 'Good morning' : (hr < 18) ? 'Good afternoon' : 'Good evening';
    if (greet) greet.textContent = time + ", what's your plan for today?";
    if (sub) sub.textContent = 'Type a message below to start, or pick a recent session to continue.';
  }

  // 统一的 agent chip 构造器（Home + Agent 共用）
  // Phase UI-A3：含 inline SVG icon（不依赖 CDN）
  function makeAgentChip(a) {
    var installed = agentState.installedMap[a.id];
    var installedKnown = (typeof installed === 'boolean');
    var btn = el('button', {
      class: 'agent-chip' +
        (agentState.agentId === a.id ? ' is-active' : '') +
        (installedKnown ? (installed ? ' is-installed' : ' is-missing') : ''),
      type: 'button',
      'data-agent-id': a.id,
      'aria-label': a.label
    });
    // 用 innerHTML 注入 SVG icon
    if (a.icon) btn.innerHTML = a.icon + '<span class="agent-chip-label">' + a.label + '</span>';
    else btn.appendChild(el('span', { class: 'agent-chip-dot' }), tspan(a.label));
    btn.addEventListener('click', function () { onPickAgent(a.id); });
    return btn;
  }

  function paintHomeAgentChips() {
    var box = $('#home-agent-chips');
    if (!box) return;
    clearChildren(box);
    AGENT_CHIPS.forEach(function (a) {
      box.appendChild(makeAgentChip(a));
    });
  }

  function paintHomeCwd() {
    var cwdEl = $('#home-cwd');
    if (cwdEl) cwdEl.textContent = agentState.cwd ? ('Work in: ' + relPath(agentState.cwd)) : 'Work in: —';
  }

  function paintHomeModel() {
    var el1 = $('#home-model');
    if (!el1) return;
    var meta = agentState.agentId ? agentState.agentMeta[agentState.agentId] : null;
    el1.textContent = 'Model: ' + (meta ? meta.model : (agentState.model || 'default'));
  }

  function paintHomeEffort() {
    var el1 = $('#home-effort');
    if (!el1) return;
    var meta = agentState.agentId ? agentState.agentMeta[agentState.agentId] : null;
    el1.textContent = 'Effort: ' + (meta ? meta.effort : (agentState.effort || 'normal'));
  }

  function paintHomeStatusPill() {
    var box = $('#home-status-pill');
    if (!box) return;
    clearChildren(box);
    var ready = !!(agentState.cwd && agentState.agentId);
    var text = ready ? 'ready' : (agentState.cwd ? 'pick agent' : 'pick folder');
    var kind = ready ? 'ok' : 'empty';
    box.appendChild(statusPill(text, kind));
  }

  // 用户在 Home 顶部点 root：仅作"切到 Files 页"提示（不直接改 cwd，避免绕过 files open agent）
  function onHomePickRoot(r) {
    if (!r || !r.path) return;
    // 切到 Files 页加载该 root
    showTab('files');
    // 尝试把 root 写到 filesState.root，下次 files 页 render 会用它
    try { filesState.root = r.path; } catch (e) {}
  }

  function paintHomeRunningSessions(items) {
    var box = $('#home-running-sessions');
    if (!box) return;
    clearChildren(box);
    if (!items.length) {
      box.appendChild(emptyBlock('No running sessions', 'send a message from Agent Tab to start'));
      return;
    }
    items.forEach(function (s) { box.appendChild(buildSessionCard(s)); });
  }

  function paintHomeRecentSessions(items) {
    var box = $('#home-recent-sessions');
    if (!box) return;
    clearChildren(box);
    if (!items.length) {
      box.appendChild(emptyBlock('No sessions yet', 'send a message from Agent Tab to start'));
      return;
    }
    items.forEach(function (s) { box.appendChild(buildSessionCard(s)); });
  }

  function paintSidebarRecentSessions(items) {
    var box = $('#sidebar-recent-sessions');
    if (!box) return;
    clearChildren(box);
    if (!items.length) return;
    items.forEach(function (s) {
      var row = el('div', { class: 'sidebar-recent-item' }, [
        el('div', { text: s.title || (s.agentId || '?') }),
        el('div', { class: 'sidebar-recent-meta', text: (s.cwdLabel || relPath(s.cwd)) + ' · ' + (s.status || '?') })
      ]);
      row.addEventListener('click', function () { onPickSession(s); });
      box.appendChild(row);
    });
  }

  // ---------------- Files (Phase UI-A2 · Phone File Manager) ----------------
  // 状态：
  //   - filesState.path：当前所在目录
  //   - filesState.root：根目录（不可越过）
  //   - filesState.history：导航历史（用于 back）
  //   - filesState.items：当前目录下的 items（dir/file）
  //   - filesState.q：搜索关键字（仅在当前 path 下做模糊匹配）
  var filesState = {
    root: '',
    path: '',
    history: [],
    items: [],
    q: '',
    lastPicked: null,
    currentObjectUrl: null
  };

  // 取所有可访问的 roots（由后端 /api/mobile/roots 返回），并选第一个作为 filesState.root
  async function loadFilesRoots() {
    if (filesState.root) return filesState.root;
    try {
      var r = await api('/api/mobile/roots');
      var roots = pickList(r.roots);
      if (!roots.length) return '';
      filesState.root = roots[0].path;
      return filesState.root;
    } catch (e) { return ''; }
  }

  // 进入一个目录（dirPath 必须存在）
  async function cdInto(dirPath) {
    if (!dirPath) return;
    if (filesState.path) filesState.history.push(filesState.path);
    filesState.path = dirPath;
    filesState.items = [];
    filesState.q = '';
    var q = $('#files-q'); if (q) q.value = '';
    await refreshFilesList();
    paintFilesBreadcrumb();
  }

  // 返回上级
  async function cdUp() {
    if (!filesState.path || !filesState.root) return;
    if (filesState.path === filesState.root) {
      // 已在根，不能再 up
      return;
    }
    // 简单做法：取 parent
    var sep = filesState.path.indexOf('\\') >= 0 ? '\\' : '/';
    var idx = filesState.path.lastIndexOf(sep);
    if (idx <= 0) return;
    var parent = filesState.path.substring(0, idx);
    filesState.history.push(filesState.path);
    filesState.path = parent;
    filesState.items = [];
    filesState.q = '';
    var q = $('#files-q'); if (q) q.value = '';
    await refreshFilesList();
    paintFilesBreadcrumb();
  }

  // 拉取当前目录 items
  async function refreshFilesList() {
    var list = $('#files-list');
    var meta = $('#files-meta');
    if (!list) return;
    if (!filesState.path) {
      clearChildren(list);
      list.appendChild(emptyBlock('No folder selected', '请在 desktop 端配置 allowedRoots'));
      return;
    }
    clearChildren(list);
    list.appendChild(el('div', { class: 'skeleton', style: 'height: 56px; margin-bottom: 8px;' }));
    list.appendChild(el('div', { class: 'skeleton', style: 'height: 56px; margin-bottom: 8px;' }));
    try {
      var r = await api('/api/mobile/files?path=' + encodeURIComponent(filesState.path));
      if (!r.ok) throw new Error(r.error || 'files_failed');
      filesState.items = Array.isArray(r.items) ? r.items : [];
      paintFilesList();
      if (meta) meta.textContent = filesState.items.length + ' items';
    } catch (e) {
      clearChildren(list);
      list.appendChild(emptyBlock('Failed to load folder', String(e && e.message || e)));
      if (meta) meta.textContent = '';
    }
  }

  // 渲染文件列表（手机文件管理器样式：竖向一行一项）
  function paintFilesList() {
    var list = $('#files-list');
    if (!list) return;
    var items = (filesState.items || []).slice().sort(function (a, b) {
      // 文件夹优先；同类型按名字排序
      if (!!a.isDir !== !!b.isDir) return a.isDir ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    // 应用搜索过滤
    var q = (filesState.q || '').toLowerCase();
    if (q) {
      items = items.filter(function (it) { return (it.name || '').toLowerCase().indexOf(q) >= 0; });
    }
    clearChildren(list);
    if (!items.length) {
      list.appendChild(emptyBlock(q ? 'No matching items' : 'This folder is empty', q ? '试试清空搜索框' : ''));
      return;
    }
    items.forEach(function (it) {
      var isDir = !!it.isDir;
      var row = el('button', { class: 'fm-row' + (isDir ? ' fm-row-dir' : ' fm-row-file'), type: 'button' }, [
        el('span', { class: 'fm-icon' + (isDir ? ' fm-icon-dir' : ' fm-icon-file') }, [tspan(isDir ? '▸' : '◇')]),
        el('div', { class: 'fm-body' }, [
          el('div', { class: 'fm-name', text: it.name || '(unnamed)' }),
          el('div', { class: 'fm-meta' }, [
            tspan(isDir ? 'folder' : (it.kind || 'file')),
            tspan('·'),
            tspan(fmtSize(it.size)),
            tspan('·'),
            tspan(fmtTime(it.mtime))
          ])
        ])
      ]);
      // 桌面双击 / 手机单击 → 进入或预览
      row.addEventListener('click', function () { onFilesRowClick(it); });
      row.addEventListener('dblclick', function () { onFilesRowClick(it); });
      list.appendChild(row);
    });
  }

  function onFilesRowClick(it) {
    if (!it) return;
    if (it.isDir) {
      cdInto(it.path);
    } else {
      pickFile(it);
    }
  }

  // 当前路径 breadcrumb
  function paintFilesBreadcrumb() {
    var el1 = $('#files-path');
    if (!el1) return;
    el1.textContent = filesState.path ? relPath(filesState.path) : '/';
  }

  async function renderFiles() {
    if (!filesState.root) await loadFilesRoots();
    // 第一次进入且无 path 时：定位到 root
    if (!filesState.path) filesState.path = filesState.root;
    paintFilesBreadcrumb();
    paintFilesCwd();
    if (!filesState.items.length) await refreshFilesList();
  }

  // "当前文件夹" + "Ask AI in this folder" CTA
  function paintFilesCwd() {
    var label = $('#files-cwd-label');
    var openBtn = $('#files-open-agent');
    var backBtn = $('#files-back');
    var path = filesState.path || '';
    if (label) label.textContent = path ? relPath(path) : '未选择';
    if (openBtn) openBtn.disabled = !path;
    if (backBtn) backBtn.disabled = !path || !filesState.root || path === filesState.root;
  }

  // 用户在 Files 页面点 "Ask AI in this folder"
  async function onFilesOpenAgent() {
    var cwd = filesState.path || '';
    if (!cwd) return;
    try {
      await apiPost('/api/mobile/context/cwd', { cwd: cwd });
    } catch (e) {
      console.warn('set context cwd failed', e);
    }
    agentState.cwd = cwd;
    // 默认选择 claude（如果未选）；切到 Agent 页
    if (!agentState.agentId) agentState.agentId = 'claude';
    agentState.sessionId = '';
    agentLoadedOnce = true;
    // 同步偏好
    try {
      await apiPost('/api/mobile/context/select', {
        cwd: cwd, agentId: agentState.agentId, sessionId: ''
      });
    } catch (e) { /* ignore */ }
    showTab('agent');
  }

  // ---------------- 受保护图片：fetch + token + blob URL ----------------
  var imageRegistry = [];
  function registerObjectUrl(url) {
    if (!url) return;
    imageRegistry.push(url);
  }
  function revokeAllObjectUrls() {
    while (imageRegistry.length) {
      var u = imageRegistry.pop();
      try { URL.revokeObjectURL(u); } catch (e) {}
    }
    if (filesState.currentObjectUrl) {
      try { URL.revokeObjectURL(filesState.currentObjectUrl); } catch (e) {}
      filesState.currentObjectUrl = null;
    }
  }
  async function loadAuthImage(url) {
    var t = getToken();
    if (!t) throw new Error('no_token');
    var r = await fetch(url, { method: 'GET', headers: { 'Authorization': 'Bearer ' + t } });
    if (!r.ok) throw new Error('image_http_' + r.status);
    var blob = await r.blob();
    return URL.createObjectURL(blob);
  }

  // 文件预览（点文件后）
  async function pickFile(it) {
    filesState.lastPicked = it;
    if (filesState.currentObjectUrl) {
      try { URL.revokeObjectURL(filesState.currentObjectUrl); } catch (e) {}
      filesState.currentObjectUrl = null;
    }
    var box = $('#files-preview');
    var nameEl = $('#files-preview-name');
    var metaEl = $('#files-preview-meta');
    var body = $('#files-preview-body');
    if (!box || !nameEl || !metaEl || !body) return;
    nameEl.textContent = it.name;
    metaEl.textContent = relPath(it.path) + ' · ' + fmtSize(it.size) + ' · ' + fmtTime(it.mtime);
    clearChildren(body);
    body.appendChild(el('div', { class: 'skeleton', style: 'height: 16px; width: 60%;' }));
    box.hidden = false;
    try {
      var j = await api('/api/mobile/file?path=' + encodeURIComponent(it.path) + '&max=262144');
      renderFilePreview(j, body);
    } catch (e) {
      clearChildren(body);
      body.appendChild(emptyBlock('Preview failed', String(e && e.message || e)));
    }
    try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }

  function renderFilePreview(j, body) {
    clearChildren(body);
    if (!j || !j.ok) {
      body.appendChild(emptyBlock('Preview unavailable', (j && j.error) || 'unknown'));
      return;
    }
    if (j.previewTooLarge) {
      var d = el('div', { class: 'preview-too-large' });
      d.appendChild(el('strong', { text: 'File is too large to preview' }));
      d.appendChild(document.createTextNode('Size: ' + fmtSize(j.size) + ' · Max preview: ' + fmtSize(j.max) + ' · Kind: ' + (j.kind || '?')));
      body.appendChild(d);
      return;
    }
    if (j.kind === 'image' && j.thumbUrl) {
      body.appendChild(el('div', { class: 'preview-loading', text: '图片加载中…' }));
      loadAuthImage(j.thumbUrl).then(function (objectUrl) {
        if (body !== $('#files-preview-body')) {
          try { URL.revokeObjectURL(objectUrl); } catch (e) {}
          return;
        }
        clearChildren(body);
        var img = el('img', { class: 'preview-thumb', alt: j.name || 'image' });
        img.dataset.objectUrl = objectUrl;
        img.src = objectUrl;
        img.addEventListener('error', function () {
          clearChildren(body);
          body.appendChild(emptyBlock('图片预览失败', '可返回文件列表重试'));
        });
        body.appendChild(img);
        filesState.currentObjectUrl = objectUrl;
        registerObjectUrl(objectUrl);
      }).catch(function (e) {
        clearChildren(body);
        body.appendChild(emptyBlock('图片预览失败', '可返回文件列表重试 (' + (e && e.message) + ')'));
      });
      return;
    }
    if (j.kind === 'text' && typeof j.text === 'string') {
      var lines = j.text.split('\n').slice(0, 200);
      var pre = el('pre', { class: 'preview-pre' });
      pre.textContent = lines.join('\n');
      body.appendChild(pre);
      if (j.text.split('\n').length > 200) {
        body.appendChild(el('div', { class: 'preview-empty', text: '…已截断显示前 200 行' }));
      }
      return;
    }
    if (j.kind === 'pdf') {
      body.appendChild(el('div', { class: 'preview-empty', text: 'PDF 暂不支持移动端内嵌预览（仅 metadata）' }));
      return;
    }
    body.appendChild(el('div', { class: 'preview-empty', text: 'Binary file · 不提供内嵌预览' }));
  }

  // ---------------- Skills ----------------
  var skillsState = { items: [], states: {}, q: '' };

  async function renderSkills() {
    var list = $('#skills-list');
    clearChildren(list);
    list.appendChild(el('div', { class: 'skeleton', style: 'height: 64px; margin-bottom: 10px;' }));
    // 拉 skills + 本地 enabled state
    try {
      var j = await api('/api/mobile/skills');
      skillsState.items = pickList(j);
    } catch (e) {
      skillsState.items = [];
      paintSkills(String(e && e.message || e));
      return;
    }
    // 拉 mobile skills state
    try {
      var s = await api('/api/mobile/skills-state');
      skillsState.states = (s && s.states && typeof s.states === 'object') ? s.states : {};
    } catch (e) {
      skillsState.states = {};
    }
    paintSkills();
  }

  function paintSkills(errMsg) {
    var list = $('#skills-list');
    var q = ($('#skills-q') && $('#skills-q').value || '').trim().toLowerCase();
    var items = (skillsState.items || []).filter(function (x) {
      if (q) {
        var name = (x.name || '').toLowerCase();
        var desc = (x.description || '').toLowerCase();
        if (name.indexOf(q) < 0 && desc.indexOf(q) < 0) return false;
      }
      return true;
    });
    clearChildren(list);
    if (errMsg) {
      list.appendChild(emptyBlock('Failed to load skills', errMsg));
      return;
    }
    if (!items.length) {
      list.appendChild(emptyBlock('No skills available', skillsState.items.length ? '没有匹配名称或描述的 skill' : '~/.claude/skills 暂为空'));
      return;
    }
    items.forEach(function (s) {
      var id = s.id || s.name || '';
      var sEntry = skillsState.states[id];
      var enabled = (sEntry && typeof sEntry.enabled === 'boolean') ? sEntry.enabled : (typeof s.enabled === 'boolean' ? s.enabled : true);
      var hits = (typeof s.hits === 'number') ? s.hits : 0;
      var lastUsed = s.lastUsed || '';
      var card = el('div', { class: 'skill-card' }, [
        el('div', { class: 'skill-head' }, [
          el('div', { class: 'skill-name', text: s.name || '(unnamed)' }),
          el('span', { class: 'pill pill-blue', text: s.source || '?' })
        ]),
        el('p', { class: 'skill-desc', text: s.description || 'No description' }),
        el('div', { class: 'skill-foot' }, [
          tspan('hits ' + hits + (lastUsed ? (' · ' + fmtTime(lastUsed)) : '')),
          el('button', {
            class: 'pill ' + (enabled ? 'pill-ok' : 'pill-empty'),
            type: 'button',
            'data-skill-id': id,
            'data-enabled': enabled ? '1' : '0'
          }, [tspan(enabled ? 'enabled' : 'disabled')])
        ])
      ]);
      var btn = card.querySelector('button[data-skill-id]');
      if (btn) btn.addEventListener('click', function () { onToggleSkill(id, enabled); });
      list.appendChild(card);
    });
  }

  // Phase UI-A1：toggle skill（写 mobile state）
  async function onToggleSkill(skillId, currentEnabled) {
    try {
      var r = await apiPost('/api/mobile/skills-state', { skillId: skillId, enabled: !currentEnabled });
      if (r && r.ok) {
        skillsState.states[skillId] = { enabled: !!r.enabled, updatedAt: r.updatedAt || Date.now() };
        paintSkills();
      }
    } catch (e) { /* 静默失败 */ }
  }

  // ---------------- Agents ----------------
  // 即使 API 失败或返回空，也至少显示 4 张只读卡片（绝不显示 "No agent detected" 阻断感）
  var AGENT_FALLBACK = [
    { id: 'claude',   label: 'Claude Code', command: 'claude' },
    { id: 'codex',    label: 'Codex',       command: 'codex' },
    { id: 'opencode', label: 'OpenCode',    command: 'opencode' },
    { id: 'qoder',    label: 'Qoder CLI',   command: 'qodercli' }
  ];

  async function renderAgents() {
    var list = $('#agents-list');
    clearChildren(list);
    for (var i = 0; i < 4; i++) list.appendChild(el('div', { class: 'skeleton', style: 'height: 84px;' }));
    var items = [];
    var errMsg = null;
    try {
      var j = await api('/api/mobile/agents');
      items = pickList(j);
    } catch (e) {
      errMsg = String(e && e.message || e);
      items = [];
    }
    paintAgents(items, errMsg);
  }

  function paintAgents(items, errMsg) {
    var list = $('#agents-list');
    clearChildren(list);
    // 合并：API 返回的优先；不足 4 个用 fallback 补齐；不暴露启动/发送任务
    var seen = {};
    var merged = [];
    items.forEach(function (a) { if (a && a.id && !seen[a.id]) { seen[a.id] = 1; merged.push(a); } });
    AGENT_FALLBACK.forEach(function (f) {
      if (merged.length >= 4) return;
      if (!seen[f.id]) { merged.push({ id: f.id, label: f.label, command: f.command, installed: false, hint: '探测失败' }); }
    });
    // 若 API 完全没返回 4 个也没有 fallback 标记 → 仍然 4 张 unknown
    if (merged.length < 4) {
      var have = {};
      merged.forEach(function (m) { have[m.id] = 1; });
      AGENT_FALLBACK.forEach(function (f) {
        if (merged.length >= 4) return;
        if (!have[f.id]) merged.push({ id: f.id, label: f.label, command: f.command, installed: false, hint: '探测失败' });
      });
    }
    merged.forEach(function (a) {
      var known = (typeof a.installed === 'boolean');
      var kind = known ? (a.installed ? 'ok' : 'empty') : 'unknown';
      var statusText = known ? (a.installed ? 'detected' : 'not found') : 'unknown';
      var card = el('div', { class: 'agent-card' }, [
        el('div', { class: 'agent-head' }, [
          el('div', { class: 'agent-name', text: a.label || a.id || 'agent' }),
          statusPill(statusText, kind)
        ]),
        el('div', { class: 'agent-cmd', text: 'command: ' + (a.command || a.id || '?') }),
        a.hint ? el('div', { class: 'agent-hint', text: a.hint }) : null
      ]);
      list.appendChild(card);
    });
  }

  // ---------------- Usage ----------------
  async function renderUsage() {
    var todayEl = $('#usage-today');
    var weekEl = $('#usage-week');
    var list = $('#usage-list');
    todayEl.textContent = '—';
    weekEl.textContent = '—';
    clearChildren(list);
    list.appendChild(el('div', { class: 'skeleton', style: 'height: 44px;' }));
    list.appendChild(el('div', { class: 'skeleton', style: 'height: 44px; margin-top: 8px;' }));
    var j = null; var errMsg = null;
    try {
      j = await api('/api/mobile/usage');
    } catch (e) {
      errMsg = String(e && e.message || e);
    }
    paintUsage(j, errMsg);
  }

  function paintUsage(j, errMsg) {
    var todayEl = $('#usage-today');
    var weekEl = $('#usage-week');
    var list = $('#usage-list');
    var summary = (j && j.summary) || {};
    todayEl.textContent = fmtTokens(summary.todayTokens);
    weekEl.textContent = fmtTokens(summary.weekTokens);
    clearChildren(list);
    var items = pickList(j && (j.agents || j.items));
    if (errMsg && !items.length) {
      list.appendChild(emptyBlock('暂无用量数据', '加载失败：' + errMsg));
      return;
    }
    if (!items.length) {
      list.appendChild(emptyBlock('暂无用量数据', 'Claude/Codex 暂未上报事件'));
      return;
    }
    items.forEach(function (a) {
      var known = (typeof a.available === 'boolean');
      var kind = known ? (a.available ? 'ok' : 'empty') : 'unknown';
      var statusText = known ? (a.available ? 'available' : 'no data') : 'unknown';
      var row = el('div', { class: 'usage-row' }, [
        el('div', null, [
          el('div', { class: 'usage-name', text: a.label || a.id }),
          el('div', { class: 'usage-meta', text: 'today ' + fmtTokens(a.todayTokens) + ' · week ' + fmtTokens(a.weekTokens) })
        ]),
        statusPill(statusText, kind)
      ]);
      list.appendChild(row);
    });
  }

  // ---------------- Phase UI-A3：4 agent SVG icons（inlined，便于 currentColor） ----------------
  // 不依赖在线 CDN；SVG 与 public/mobile/assets/agents/*.svg 视觉一致
  var AGENT_ICONS = {
    claude:
      '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M10 2 L17 6.5 L17 13.5 L10 18 L3 13.5 L3 6.5 Z" stroke-width="1.4"/>' +
        '<circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none"/>' +
        '<path d="M10 2 L10 7.5 M17 6.5 L12.5 9 M17 13.5 L12.5 11 M10 18 L10 12.5 M3 13.5 L7.5 11 M3 6.5 L7.5 9"/>' +
      '</svg>',
    codex:
      '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M6.5 3.5 L3 6.5 L3 13.5 L6.5 16.5"/>' +
        '<path d="M13.5 3.5 L17 6.5 L17 13.5 L13.5 16.5"/>' +
        '<line x1="11" y1="6" x2="9" y2="14"/>' +
      '</svg>',
    opencode:
      '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<polyline points="5,7 2.5,10 5,13"/>' +
        '<polyline points="15,7 17.5,10 15,13"/>' +
        '<line x1="12" y1="5" x2="8" y2="15"/>' +
      '</svg>',
    qoder:
      '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="3" y="3" width="6" height="6" rx="1"/>' +
        '<rect x="11" y="3" width="6" height="6" rx="1"/>' +
        '<rect x="3" y="11" width="6" height="6" rx="1"/>' +
        '<circle cx="14" cy="14" r="2.0" fill="#fff"/>' +
        '<line x1="15.4" y1="15.4" x2="17.5" y2="17.5"/>' +
      '</svg>'
  };

  // 4 个固定 agent：claude / codex / opencode / qoder（fallback 占位）
  // 顶部：当前 agent label (Claude Code / Codex / OpenCode / Qoder) + cwd + model + effort
  // 中部：消息流（user / agent / system 气泡）
  // 底部：textarea + Send
  var AGENT_CHIPS = [
    { id: 'claude',   label: 'Claude Code', icon: AGENT_ICONS.claude },
    { id: 'codex',    label: 'Codex',       icon: AGENT_ICONS.codex },
    { id: 'opencode', label: 'OpenCode',    icon: AGENT_ICONS.opencode },
    { id: 'qoder',    label: 'Qoder',       icon: AGENT_ICONS.qoder }
  ];
  var agentState = {
    cwd: '',
    agentId: '',
    sessionId: '',
    sessions: [],
    installedMap: {},   // agentId -> bool
    agentMeta: {},      // agentId -> { label, model, effort }
    usage: null,
    // Phase UI-A2：mobile send path 直接走 runner；redline 仅写 audit，不再走 desktop approval
    runStatus: '',      // running / done / failed / '' (idle)
    model: 'default',
    effort: 'normal'
  };

  // Phase UI-A2：mobile send path 直接走 runner；redline 仅写 audit，不再走 desktop approval
  var RUN_STATUS_TEXT = {
    running: 'Agent is running…',
    done:    'Done.',
    failed:  'Failed.'
  };

  // 把"当前 Agent Tab 是否被实际切换过"记下来，避免 user 选完 root 后重复拉
  var agentLoadedOnce = false;

  // 当前页（用于 Send 按钮 / onSendMessage）
  // 'home' 表示从 Home 顶部对话框发出；'agent' 表示从 Agent 独立页发出
  var sendSource = 'agent';

  async function renderAgent() {
    sendSource = 'agent';
    paintAgentHeaderName();
    paintAgentHeaderStatus();
    paintAgentHeaderMeta();
    paintAgentSwitcher();
    paintAgentCwd();
    paintAgentMessages();
    // 第一次进入：拉一次 context + sessions
    if (!agentLoadedOnce) {
      agentLoadedOnce = true;
      try {
        var ctx = await api('/api/mobile/context/current');
        agentState.cwd = ctx.cwd || '';
        agentState.agentId = ctx.agentId || '';
        agentState.sessionId = ctx.sessionId || '';
        paintAgentCwd();
        paintAgentHeaderMeta();
        paintAgentSwitcher();
        paintAgentHeaderName();
      } catch (e) { /* ignore */ }
    }
    // 拉 agent 安装情况 + 元数据
    try {
      var r = await api('/api/mobile/agents');
      var items = pickList(r);
      items.forEach(function (a) {
        agentState.installedMap[a.id] = !!a.installed;
        agentState.agentMeta[a.id] = {
          label: a.label || a.id,
          model: a.model || 'default',
          effort: a.effort || 'normal'
        };
      });
      paintAgentSwitcher();
      paintAgentHeaderName();
      paintAgentHeaderMeta();
    } catch (e) { /* ignore */ }
    // 拉 sessions（如果 cwd 非空）
    if (agentState.cwd) {
      await refreshAgentSessions();
    } else {
      paintAgentSessionsEmpty('请先在 Files 选择 cwd');
    }
    updateSendButtonState();
  }

  // 顶部 agent 名称（左上角"Claude Code / Codex / OpenCode / Qoder"）
  function paintAgentHeaderName() {
    var name = $('#agent-header-name');
    if (!name) return;
    var meta = agentState.agentId ? agentState.agentMeta[agentState.agentId] : null;
    var label = (meta && meta.label) || (AGENT_CHIPS.find(function (a) { return a.id === agentState.agentId; }) || {}).label || agentState.agentId || 'Agent';
    name.textContent = label || 'Agent';
  }
  function paintAgentHeaderStatus() {
    var el1 = $('#agent-header-status');
    if (!el1) return;
    if (agentState.runStatus === 'running') {
      el1.textContent = 'running…';
      el1.className = 'agent-header-status is-running';
    } else if (agentState.runStatus === 'failed') {
      el1.textContent = 'failed';
      el1.className = 'agent-header-status is-failed';
    } else {
      el1.textContent = 'ready';
      el1.className = 'agent-header-status';
    }
  }
  function paintAgentHeaderMeta() {
    var cwdEl = $('#agent-meta-cwd');
    var modelEl = $('#agent-meta-model');
    var effortEl = $('#agent-meta-effort');
    if (cwdEl) cwdEl.textContent = agentState.cwd ? relPath(agentState.cwd) : '—';
    if (modelEl) {
      var meta = agentState.agentId ? agentState.agentMeta[agentState.agentId] : null;
      modelEl.textContent = meta ? meta.model : (agentState.model || 'default');
    }
    if (effortEl) {
      var meta2 = agentState.agentId ? agentState.agentMeta[agentState.agentId] : null;
      effortEl.textContent = meta2 ? meta2.effort : (agentState.effort || 'normal');
    }
  }

  // 保留：assistant / skill cards（UI-A1 风格）—— Phase UI-A2 暂时不在 Agent 页渲染（结构变成 ChatGPT-like）
  // 保留 ASSISTANT_CARDS 常量，方便 Home 后续扩展
  var ASSISTANT_CARDS = [
    { id: 'cowork',   icon: '⚡', title: 'Cowork',          prompt: '请帮我在当前目录完成协作任务：' },
    { id: 'review',   icon: '◇', title: 'Code Review',     prompt: '请审查当前目录的代码，重点关注安全、正确性、可维护性：' },
    { id: 'fix',      icon: '✦', title: 'Fix Bug',         prompt: '请帮我定位并修复当前目录的 bug：' },
    { id: 'explain',  icon: '◈', title: 'Explain Project', prompt: '请帮我解释这个项目的结构和用途：' },
    { id: 'doc',      icon: '§', title: 'Create Doc',      prompt: '请为这个项目写一份简介文档：' },
    { id: 'summary',  icon: '≡', title: 'Summarize Files', prompt: '请总结当前目录的关键文件：' },
    { id: 'ppt',      icon: '◧', title: 'PPT Creator',     prompt: '请为当前目录设计一个 PPT 提纲：' },
    { id: 'word',     icon: '¶', title: 'Word Helper',     prompt: '请把当前目录的内容整理为 Word 文档大纲：' }
  ];

  function paintAgentCwd() {
    var cwdEl = $('#agent-cwd');
    if (cwdEl) cwdEl.textContent = agentState.cwd ? ('Work in: ' + relPath(agentState.cwd)) : 'Work in: —';
  }

  function paintAgentSwitcher() {
    var box = $('#agent-switcher');
    if (!box) return;
    clearChildren(box);
    AGENT_CHIPS.forEach(function (a) {
      box.appendChild(makeAgentChip(a));
    });
  }

  function paintAgentStatus() {
    var el1 = $('#agent-session-status');
    var el2 = $('#agent-status-pill');
    if (el1) {
      if (agentState.sessionId) el1.textContent = 'session ' + agentState.sessionId;
      else el1.textContent = agentState.cwd ? 'no session yet' : 'no folder yet';
    }
    if (el2) {
      clearChildren(el2);
      var kind = agentState.sessionId ? 'ok' : 'unknown';
      var text = agentState.sessionId ? 'ready' : 'no session';
      el2.appendChild(statusPill(text, kind));
    }
  }

  // ChatGPT-like 消息流渲染
  function paintAgentMessages() {
    var box = $('#agent-messages');
    if (!box) return;
    clearChildren(box);
    var cur = agentState.sessions.find(function (s) { return s.sessionId === agentState.sessionId; });
    if (!cur) {
      if (!agentState.cwd) {
        box.appendChild(emptyBlock('请先在 Files 选择 cwd', 'cwd → agent → session'));
        return;
      } else if (agentState.sessions.length === 0) {
        box.appendChild(emptyBlock('No messages yet', 'Type a message below to start a conversation with this agent.'));
        return;
      } else {
        box.appendChild(emptyBlock('No session selected', 'pick a recent session on Home, or type a message to start a new one'));
        return;
      }
    }
    // v1：detail 不暴露 messages 全文（mobile-sessions.js scrubSessionDetail）
    // 这里给一个安全摘要气泡
    var preview = (cur.summary && cur.summary.lastMessagePreview) || '';
    if (preview) {
      var b = el('div', { class: 'chat-bubble chat-bubble-agent' }, [
        el('div', { class: 'chat-bubble-role', text: ((cur.agentId || 'agent') + ' · ' + (cur.status || 'unknown')) }),
        el('div', { class: 'chat-bubble-text', text: preview })
      ]);
      box.appendChild(b);
    } else {
      box.appendChild(emptyBlock('No messages yet', 'Type a message below to start a conversation with this agent.'));
    }
  }

  function paintAgentSessionsEmpty(sub) {
    agentState.sessions = [];
    var box = $('#agent-messages');
    if (box) {
      clearChildren(box);
      box.appendChild(emptyBlock('No messages yet', sub || 'Type a message below to start a conversation with this agent.'));
    }
  }

  async function refreshAgentSessions() {
    if (!agentState.cwd) {
      paintAgentSessionsEmpty('请先在 Files 选择 cwd');
      return;
    }
    try {
      var j = await api('/api/mobile/sessions?cwd=' + encodeURIComponent(agentState.cwd) + '&limit=50');
      var items = pickList(j);
      agentState.sessions = items;
      // 选最近一个匹配的 session（按 agentId 过滤）
      var sameAgent = items.find(function (s) { return s.agentId === agentState.agentId; });
      if (sameAgent) {
        agentState.sessionId = sameAgent.sessionId;
      } else if (!agentState.sessionId && items[0]) {
        agentState.sessionId = items[0].sessionId;
      }
      paintAgentStatus();
      paintAgentMessages();
    } catch (e) {
      // 静默失败 —— 不显示错误，避免阻断
      paintAgentSessionsEmpty('加载失败：' + (e && e.message || e));
    }
  }

  // 用户在 Agent 页面点 chip
  async function onPickAgent(agentId) {
    agentState.agentId = agentId;
    agentState.sessionId = '';
    paintAgentSwitcher();
    paintAgentHeaderName();
    paintAgentHeaderMeta();
    paintAgentStatus();
    paintHomeAgentChips();
    paintHomeModel();
    paintHomeEffort();
    paintHomeStatusPill();
    // 同步偏好到后端
    try {
      await apiPost('/api/mobile/context/select', {
        cwd: agentState.cwd || '',
        agentId: agentId,
        sessionId: ''
      });
    } catch (e) { /* 偏好写失败不阻断 UI */ }
    if (agentState.cwd) await refreshAgentSessions();
    else paintAgentMessages();
  }

  // 保留兼容：Agent 页面 "选择文件夹"
  function onAgentPickCwd() {
    showTab('files');
  }

  // ---------------- Send (Phase UI-A2) ----------------
  // 普通消息 → stub runner → done
  // 红线消息 → audit → runner → done
  // 来源：'home'（Home 顶部对话框）或 'agent'（Agent 独立页）
  async function onSendMessage(source) {
    var src = source || sendSource || 'agent';
    var inputSel = (src === 'home') ? '#home-input' : '#agent-input';
    var btnSel   = (src === 'home') ? '#home-send'  : '#agent-send';
    var input = $(inputSel);
    var btn = $(btnSel);
    if (!input || !btn) return;
    var text = (input.value || '').trim();
    if (!text) {
      flashInputError(input, '请输入任务内容');
      return;
    }
    if (text.length > 4000) {
      flashInputError(input, '输入不能超过 4000 字符');
      return;
    }
    if (!agentState.cwd) {
      flashInputError(input, '请先在 Files 选择 cwd');
      return;
    }
    if (!agentState.agentId) {
      flashInputError(input, '请先选择 agent');
      return;
    }
    if (agentState.runStatus === 'running') {
      flashInputError(input, 'Agent 正在运行，请等待完成');
      return;
    }
    btn.disabled = true;
    agentState.runStatus = 'running';
    paintAgentStatus();
    paintAgentHeaderStatus();
    try {
      // 1) 找/创建 sessionId
      var sessionId = agentState.sessionId;
      if (!sessionId) {
        var d = await apiPost('/api/mobile/sessions/draft', {
          cwd: agentState.cwd,
          agentId: agentState.agentId
        });
        if (!d || !d.ok || !d.sessionId) throw new Error('draft_failed');
        sessionId = d.sessionId;
        agentState.sessionId = sessionId;
      }
      // 2) POST /messages（后端直接跑 runner；redline 仅 audit）
      var r = await apiPost('/api/mobile/sessions/' + encodeURIComponent(sessionId) + '/messages', {
        text: text,
        cwd: agentState.cwd,
        agentId: agentState.agentId,
        contextFiles: []
      });
      if (!r || !r.ok) throw new Error((r && r.error) || 'send_failed');
      // 3) 红线也走 runner；UI 不再显示 approval bar
      input.value = '';
      agentState.runStatus = (r.status === 'failed') ? 'failed' : (r.status || 'done');
      paintAgentStatus();
      paintAgentHeaderStatus();
      // 拉一次 events 显示 agent bubble
      try { await refreshEvents(); } catch (_) {}
      // 跑完后刷新 Home sessions 列表（Running / Recent）
      try { if (typeof renderHome === 'function') await renderHome(); } catch (_) {}
      // 如果用户在 Agent 独立页：刷新 messages
      if (src === 'agent') {
        await refreshAgentSessions();
      }
    } catch (e) {
      agentState.runStatus = 'failed';
      paintAgentStatus();
      paintAgentHeaderStatus();
    } finally {
      btn.disabled = false;
      if (src === 'home') updateHomeSendButtonState(); else updateSendButtonState();
    }
  }

  async function refreshEvents() {
    if (!agentState.sessionId) return;
    try {
      var r = await api('/api/mobile/sessions/' + encodeURIComponent(agentState.sessionId) + '/events?limit=20');
      if (!r || !r.ok) return;
      // 把 agent message 渲染到 messages 列表
      paintEvents(r);
    } catch (_) {}
  }

  function paintEvents(payload) {
    if (!payload || !Array.isArray(payload.messages)) return;
    var box = $('#agent-messages');
    if (!box) return;
    // 在 ChatGPT-like 容器中追加 messages（不清空 existing session summary）
    payload.messages.forEach(function (m) {
      var div = document.createElement('div');
      var role = m.role || 'system';
      div.className = 'chat-bubble chat-bubble-' + role;
      var role1 = document.createElement('div');
      role1.className = 'chat-bubble-role';
      role1.textContent = role === 'user' ? 'You' : (role === 'agent' ? 'Agent' : 'System');
      var body = document.createElement('div');
      body.className = 'chat-bubble-text';
      body.textContent = m.text || '';
      var meta = document.createElement('div');
      meta.className = 'chat-bubble-meta';
      meta.textContent = m.status || '';
      div.appendChild(role1);
      div.appendChild(body);
      div.appendChild(meta);
      box.appendChild(div);
    });
  }

  function flashInputError(input, msg) {
    input.style.borderColor = '#EF4444';
    if (input.value === '') input.placeholder = msg;
    setTimeout(function () { input.style.borderColor = ''; }, 1500);
  }

  function updateSendButtonState() {
    var btn = $('#agent-send');
    var input = $('#agent-input');
    if (!btn || !input) return;
    var text = (input.value || '').trim();
    var ok = !!agentState.cwd && !!agentState.agentId && text.length > 0 && text.length <= 4000 && agentState.runStatus !== 'running';
    btn.disabled = !ok;
  }

  // Home 顶部对话框 send button state
  function updateHomeSendButtonState() {
    var btn = $('#home-send');
    var input = $('#home-input');
    if (!btn || !input) return;
    var text = (input.value || '').trim();
    var ok = !!agentState.cwd && !!agentState.agentId && text.length > 0 && text.length <= 4000 && agentState.runStatus !== 'running';
    btn.disabled = !ok;
  }

  // Phase UI-A1：删除 approval bar / approval polling 相关函数（保留以免外部引用报错）
  function paintApprovalBar() { /* noop: UI-A1 移除 approval bar */ }
  function startApprovalPolling() { /* noop */ }
  function stopApprovalPolling() { /* noop */ }

  // Phase UI-A1：sessions tab 已并入 home；保留 buildSessionCard / onPickSession
  // 供 home / sidebar 调用；不再有独立 renderSessions / paintSessions 入口。
  function buildSessionCard(s) {
    var src = s.source || 'desktop';
    var srcLabel = src === 'wechat' ? 'wechat' : (src === 'mobile' ? 'mobile' : 'desktop');
    var status = (s.status || 'unknown');
    var preview = (s.summary && s.summary.lastMessagePreview) || '';
    // Phase 2B：duration / usage 小摘要（仅 mobile source 显示）
    var durText = '';
    if (src === 'mobile') {
      var dur = (s.usage && typeof s.usage.durationMs === 'number') ? s.usage.durationMs : 0;
      if (dur > 0) durText = (Math.round(dur / 100) / 10) + 's';
    }
    var card = el('button', { class: 'session-card', type: 'button' }, [
      el('div', { class: 'session-head' }, [
        el('div', { class: 'session-title', text: s.title || srcLabel, title: s.title || '' }),
        el('span', { class: 'session-source session-source-' + src, text: srcLabel })
      ]),
      preview ? el('div', { class: 'session-preview', text: preview }) : null,
      el('div', { class: 'session-foot' }, [
        el('div', { class: 'session-meta-row' }, [
          tspan(s.agentId || 'unknown'),
          tspan('·'),
          tspan(s.cwdLabel || relPath(s.cwd)),
          tspan('·'),
          tspan(fmtTime(s.lastActiveAt)),
          durText ? tspan('·') : null,
          durText ? tspan('⏱ ' + durText) : null
        ]),
        el('span', { class: 'session-status session-status-' + status, text: status })
      ])
    ]);
    card.addEventListener('click', function () { onPickSession(s); });
    return card;
  }

  // 用户点 session 卡片 → 切到 Agent + 设置偏好
  async function onPickSession(s) {
    try {
      await apiPost('/api/mobile/context/select', {
        cwd: s.cwd || '',
        agentId: s.agentId || 'unknown',
        sessionId: s.sessionId || ''
      });
    } catch (e) { /* ignore */ }
    agentState.cwd = s.cwd || '';
    agentState.agentId = s.agentId || '';
    agentState.sessionId = s.sessionId || '';
    agentLoadedOnce = true;
    showTab('agent');
  }

  // ---------------- Empty ----------------
  function emptyBlock(title, sub) {
    var n = el('div', { class: 'empty' });
    if (title) n.appendChild(el('div', { class: 'empty-strong', text: title }));
    if (sub) n.appendChild(el('div', { text: sub }));
    return n;
  }

  // ---------------- 配对 ----------------
  function showPair(msg) {
    var p = document.getElementById('pair-screen');
    var a = document.getElementById('app');
    if (p) p.hidden = false;
    if (a) a.hidden = true;
    if (msg) {
      var m = document.getElementById('pair-msg');
      if (m) { m.textContent = msg; m.className = 'msg msg-err'; }
    }
  }
  function showApp() {
    var p = document.getElementById('pair-screen');
    var a = document.getElementById('app');
    if (p) p.hidden = true;
    if (a) a.hidden = false;
    // 清掉配对卡上残留的 "配对中…" 状态，避免 UI 不一致
    var pm = document.getElementById('pair-msg');
    if (pm) { pm.textContent = ''; pm.className = 'msg'; }
    paintIcons();
    // Phase UI-A2：配对成功 → App Shell → 默认 Home
    showTab('home');
  }

  async function doPair() {
    var code = (document.getElementById('pair-code').value || '').trim();
    var name = (document.getElementById('pair-device').value || '').trim() || 'Mobile Device';
    var msg = document.getElementById('pair-msg');
    var btn = document.getElementById('pair-btn');
    if (!/^\d{6}$/.test(code)) {
      msg.textContent = '配对码必须是 6 位数字';
      msg.className = 'msg msg-err';
      return;
    }
    btn.disabled = true;
    msg.textContent = '配对中…';
    msg.className = 'msg';
    try {
      var r = await fetch('/api/mobile/pair/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairCode: code, deviceName: name })
      });
      var j = null; try { j = await r.json(); } catch (e) { j = { ok: false }; }
      if (!j.ok) throw new Error(j.error || ('http_' + r.status));
      // 1) 先存 token
      setToken(j.token);
      // 2) 立即切到主应用（不要再让用户点一次）
      //    不用 setTimeout，避免「以为卡死」的感觉
      showApp();
    } catch (e) {
      msg.textContent = '配对失败：' + (e && e.message || e);
      msg.className = 'msg msg-err';
    } finally {
      btn.disabled = false;
    }
  }

  // ---------------- 事件绑定 (Phase UI-A3) ----------------
  function bind() {
    // bottom nav
    $all('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab-btn')); });
    });
    // top refresh
    var refresh = document.getElementById('app-refresh');
    if (refresh) refresh.addEventListener('click', function () {
      var active = document.querySelector('.tab-btn.is-active');
      showTab(active ? active.getAttribute('data-tab-btn') : 'home');
    });
    // Phase UI-A3：topbar 菜单按钮（手机 drawer 开关）
    var appMenu = document.getElementById('app-menu');
    if (appMenu) appMenu.addEventListener('click', toggleHomeDrawer);
    // Phase UI-A3：sidebar close 按钮（仅 mobile 显示）
    var sidebarClose = document.getElementById('home-sidebar-close');
    if (sidebarClose) sidebarClose.addEventListener('click', closeHomeDrawer);
    // Phase UI-A3：sidebar Settings 链接
    $all('.home-sidebar-link').forEach(function (b) {
      b.addEventListener('click', function () {
        var go = b.getAttribute('data-go');
        if (go) showTab(go);
        closeHomeDrawer();
      });
    });
    // Phase UI-A3：New Chat 按钮
    var newChatBtn = document.getElementById('home-new-chat');
    if (newChatBtn) newChatBtn.addEventListener('click', onNewChat);

    // Phase UI-A3: Home 顶部对话框
    var homeInput = document.getElementById('home-input');
    if (homeInput) {
      homeInput.addEventListener('input', updateHomeSendButtonState);
      homeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSendMessage('home');
        }
      });
    }
    var homeSend = document.getElementById('home-send');
    if (homeSend) homeSend.addEventListener('click', function () { onSendMessage('home'); });

    // Agent 独立页：Send
    var agentInput = document.getElementById('agent-input');
    if (agentInput) {
      agentInput.addEventListener('input', updateSendButtonState);
      agentInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSendMessage('agent');
        }
      });
    }
    var agentSend = document.getElementById('agent-send');
    if (agentSend) agentSend.addEventListener('click', function () { onSendMessage('agent'); });
    // Agent 顶部 Back → Home
    var agentBack = document.getElementById('agent-header-back');
    if (agentBack) agentBack.addEventListener('click', function () { showTab('home'); });

    // Files (Phase UI-A2 · Phone File Manager)
    var filesQ = document.getElementById('files-q');
    if (filesQ) {
      filesQ.addEventListener('input', function () {
        filesState.q = filesQ.value || '';
        paintFilesList();
      });
    }
    var filesBack = document.getElementById('files-back');
    if (filesBack) filesBack.addEventListener('click', function () { cdUp(); });
    var filesRefresh = document.getElementById('files-refresh');
    if (filesRefresh) filesRefresh.addEventListener('click', function () { refreshFilesList(); });
    var filesPreviewClose = document.getElementById('files-preview-close');
    if (filesPreviewClose) filesPreviewClose.addEventListener('click', function () {
      revokeAllObjectUrls();
      var p = document.getElementById('files-preview');
      if (p) p.hidden = true;
    });
    var filesOpenAgent = document.getElementById('files-open-agent');
    if (filesOpenAgent) filesOpenAgent.addEventListener('click', onFilesOpenAgent);

    // skills filter
    var skillsQ = document.getElementById('skills-q');
    if (skillsQ) skillsQ.addEventListener('input', paintSkills);

    // pair
    var pairBtn = document.getElementById('pair-btn');
    if (pairBtn) pairBtn.addEventListener('click', doPair);

    // 离开页面时回收所有 objectURL
    window.addEventListener('beforeunload', revokeAllObjectUrls);
    window.addEventListener('pagehide', revokeAllObjectUrls);
    // Phase UI-A3：Esc 关 drawer
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isHomeDrawerOpen()) closeHomeDrawer();
    });
  }

  // ---------------- 启动 ----------------
  function boot() {
    paintIcons();
    bind();
    if (getToken()) {
      api('/api/mobile/roots').then(function () { showApp(); }).catch(function () { showPair(); });
    } else {
      showPair();
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  // ---------------- 测试导出（仅在 Node 环境） ----------------
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      // 核心安全工具
      asNode: asNode,
      appendNodes: appendNodes,
      clearChildren: clearChildren,
      el: el,
      tspan: tspan,
      // 适配器
      pickList: pickList,
      // 渲染函数
      emptyBlock: emptyBlock,
      statusPill: statusPill,
      paintSkills: paintSkills,
      paintAgents: paintAgents,
      paintUsage: paintUsage,
      renderFilePreview: renderFilePreview,
      // Phase 2A-1
      paintAgentSwitcher: paintAgentSwitcher,
      buildSessionCard: buildSessionCard,
      onFilesOpenAgent: onFilesOpenAgent,
      onPickSession: onPickSession,
      onPickAgent: onPickAgent,
      onToggleSkill: onToggleSkill,
      // 状态
      skillsState: skillsState,
      filesState: filesState,
      agentState: agentState,
      AGENT_FALLBACK: AGENT_FALLBACK,
      AGENT_CHIPS: AGENT_CHIPS,
      ASSISTANT_CARDS: ASSISTANT_CARDS,
      POST_ALLOWLIST: POST_ALLOWLIST,
      isAllowedPost: isAllowedPost,
      // API（mock 时可换）
      api: api,
      apiPost: apiPost
    };
  }
})();
