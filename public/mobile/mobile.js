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

  // ---------------- Phase UI-A3 / UI-A5：Home 底部 4 张 quick cards（不喧宾夺主） ----------------
  // Phase UI-A5：每张 card 配独立 SVG 图标
  var HOME_CARDS = [
    { id: 'opencode', label: 'Explore folder',
      prompt: '请帮我看看当前目录的代码结构，并列出可改进的地方：',
      icon: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5 a2 2 0 0 1 2 -2 h4 l2 2 h4 a2 2 0 0 1 2 2 v8 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 z"/></svg>' },
    { id: 'review',   label: 'Review code',
      prompt: '请审查当前目录的代码，重点关注安全、正确性、可维护性：',
      icon: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="6"/><polyline points="7 10 9 12 13 8"/></svg>' },
    { id: 'doc',      label: 'Write README',
      prompt: '请为这个项目写一份简介文档：',
      icon: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3 h7 l3 3 v11 a1 1 0 0 1 -1 1 H5 a1 1 0 0 1 -1 -1 V4 a1 1 0 0 1 1 -1 z"/><polyline points="12 3 12 6 15 6"/><line x1="7" y1="10" x2="13" y2="10"/><line x1="7" y1="13" x2="13" y2="13"/></svg>' },
    { id: 'tests',    label: 'Find broken tests',
      prompt: '请找出当前目录的失败测试 / 编译错误，并给出修复建议：',
      icon: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4 L16 4 M5 8 L15 8 M5 12 L13 12 M5 16 L11 16"/></svg>' }
  ];

  function paintHomeCards() {
    var box = $('#home-cards');
    if (!box) return;
    clearChildren(box);
    HOME_CARDS.forEach(function (c) {
      var card = el('button', { class: 'home-card', type: 'button', title: c.label }, [
        el('span', { class: 'home-card-icon' }),
        el('span', { class: 'home-card-text', text: c.label })
      ]);
      // 内联 SVG icon（避免 <img> 不支持 currentColor）
      var iconSpan = card.querySelector('.home-card-icon');
      if (iconSpan && c.icon) iconSpan.innerHTML = c.icon;
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
  // Phase UI-A3 / UI-A5：含 inline SVG icon + Stub 标记
  function makeAgentChip(a) {
    var installed = agentState.installedMap[a.id];
    var installedKnown = (typeof installed === 'boolean');
    var isStub = installedKnown ? !installed : false;
    var btn = el('button', {
      class: 'agent-chip' +
        (agentState.agentId === a.id ? ' is-active' : '') +
        (installedKnown ? (installed ? ' is-installed' : ' is-missing') : ''),
      type: 'button',
      'data-agent-id': a.id,
      'aria-label': a.label
    });
    // 用 innerHTML 注入 SVG icon + label + 可选 Stub badge
    var html = (a.icon || '') + '<span class="agent-chip-label">' + a.label + '</span>';
    if (isStub) html += '<span class="agent-chip-stub">Stub</span>';
    btn.innerHTML = html;
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
    if (!cwdEl) return;
    cwdEl.textContent = agentState.cwd ? ('Work in: ' + relPath(agentState.cwd)) : 'Work in: —';
    // Phase UI-A5: 点击 Work in: 跳到 Files，方便选 cwd
    cwdEl.classList.toggle('is-clickable', !!agentState.cwd);
    cwdEl.setAttribute('role', 'button');
    cwdEl.title = 'Tap to open Files';
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
      // Phase UI-A5：手机点击 / 桌面双击 → 文件预览
      previewFile(it);
    }
  }
  // Phase UI-A5：previewFile / openFile 统一入口（避免代码 reader 误读）
  function previewFile(it) { return pickFile(it); }
  function openFile(it) { return pickFile(it); }

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
  var skillsState = { items: [], states: {}, q: '', filter: 'all' };

  // 已知 skill 的中文简介（安全 fallback，不读真实 skill 文件）
  var SKILL_DESC_ZH = {
    'academic-paper': '用于学术论文写作、润色、结构检查和投稿前质量控制。',
    'handoff': '生成会话摘要与上下文交接包，方便把任务交给另一个 agent。',
    'write-a-skill': '帮助创建、编辑和优化 FanBox agent skills。',
    'brainstorming': '在动手写代码或实现功能前，帮助澄清需求、发散方案并收敛设计。',
    'tdd': '用 red-green-refactor 循环指导测试驱动开发。',
    'neat-freak': '会话结束后整理项目文档与 agent 记忆，保持信息同步。',
    'docx': '创建、读取、编辑 Word 文档，支持表格、目录、页眉页脚。',
    'pdf': '读取、合并、拆分、OCR、加密 PDF 文件。',
    'pptx': '创建、读取、编辑 PowerPoint 演示文稿。',
    'xlsx': '读取、写入 Excel 表格，支持公式、样式、多 sheet。',
    'prototype': '快速构建可交互原型以验证设计或数据模型。',
    'diagnose': '用 disciplined loop 诊断难 bug 和性能回归。',
    'deep-research': '通用深度研究，支持文献回顾、系统综述和事实核查。',
    'agent-browser': '用浏览器自动化完成网页交互、截图、表单填写。',
    'agent-reach': '通过多种渠道搜索和读取互联网公开信息。'
  };

  function skillIdOf(s) { return String((s && (s.id || s.name)) || '').trim(); }
  function skillNameOf(s) { return String((s && (s.name || s.id)) || '未命名技能').trim(); }
  function skillDescriptionZh(s) {
    if (!s) return '';
    var id = skillIdOf(s);
    if (SKILL_DESC_ZH[id]) return SKILL_DESC_ZH[id];
    if (s.zhDescription) return String(s.zhDescription);
    return '';
  }
  function skillEnabled(s) {
    if (!s) return true;
    var id = skillIdOf(s);
    var sEntry = skillsState.states[id];
    if (sEntry && typeof sEntry.enabled === 'boolean') return sEntry.enabled;
    if (typeof s.enabled === 'boolean') return s.enabled;
    return true;
  }

  async function renderSkills() {
    var list = $('#skills-list');
    clearChildren(list);
    list.appendChild(el('div', { class: 'skeleton', style: 'height: 64px; margin-bottom: 10px;' }));
    // 拉 skills + 本地 enabled state（分别容错：一个失败不影响另一个）
    var skillsErr = null;
    try {
      var j = await api('/api/mobile/skills');
      skillsState.items = pickList(j).filter(function (x) { return !!(x && (x.id || x.name)); });
    } catch (e) {
      skillsState.items = [];
      skillsErr = userFacingError(e, '技能列表加载失败，请稍后重试');
    }
    try {
      var s = await api('/api/mobile/skills-state');
      skillsState.states = (s && s.states && typeof s.states === 'object') ? s.states : {};
    } catch (e) {
      skillsState.states = {};
      if (!skillsErr) skillsErr = userFacingError(e, '技能状态加载失败，请稍后重试');
    }
    paintSkills(skillsErr);
  }

  function paintSkills(errMsg) {
    var list = $('#skills-list');
    if (!list) return;
    var q = ($('#skills-q') && $('#skills-q').value || '').trim().toLowerCase();
    var filter = skillsState.filter || 'all';
    var items = (skillsState.items || []).filter(function (x) {
      if (!x || (!x.id && !x.name)) return false;
      // 1) search filter（name / description / 中文简介）
      if (q) {
        var name = String(x.name || x.id || '').toLowerCase();
        var desc = String(x.description || '').toLowerCase();
        var zh = String(skillDescriptionZh(x)).toLowerCase();
        if (name.indexOf(q) < 0 && desc.indexOf(q) < 0 && zh.indexOf(q) < 0) return false;
      }
      // 2) enabled/disabled filter
      if (filter === 'enabled' || filter === 'disabled') {
        var en = skillEnabled(x);
        if (filter === 'enabled' && !en) return false;
        if (filter === 'disabled' && en) return false;
      }
      return true;
    });
    clearChildren(list);
    if (errMsg) {
      list.appendChild(emptyBlock('技能列表加载失败', errMsg));
      return;
    }
    if (!items.length) {
      var msg = filter === 'enabled' ? '当前没有启用的技能'
              : filter === 'disabled' ? '当前没有禁用的技能'
              : (q ? '没有找到匹配的技能' : '~/.claude/skills 暂为空');
      list.appendChild(emptyBlock('没有可用的技能', msg));
      return;
    }
    items.forEach(function (s) {
      var id = skillIdOf(s);
      var enabled = skillEnabled(s);
      var hits = (typeof s.hits === 'number') ? s.hits : 0;
      var lastUsed = s.lastUsed || '';
      var desc = String(s.description || '').trim();
      var zh = skillDescriptionZh(s);
      var card = el('div', { class: 'skill-card' }, [
        el('div', { class: 'skill-head' }, [
          el('div', { class: 'skill-name', text: skillNameOf(s) }),
          el('span', { class: 'pill pill-blue', text: s.source || 'skill' })
        ]),
        el('p', { class: 'skill-desc', text: (zh || desc || '暂无介绍') }),
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
      } else {
        throw new Error((r && r.error) || 'toggle_failed');
      }
    } catch (e) {
      paintSkills('切换失败：' + userFacingError(e, '请稍后重试'));
    }
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

  // 顶部 agent 名称 + 图标（左上角"Claude Code / Codex / OpenCode / Qoder"）
  function paintAgentHeaderName() {
    var name = $('#agent-header-name');
    var iconBox = $('#agent-header-icon');
    var meta = agentState.agentId ? agentState.agentMeta[agentState.agentId] : null;
    var fallback = (AGENT_CHIPS.find(function (a) { return a.id === agentState.agentId; }) || {});
    var label = (meta && meta.label) || fallback.label || agentState.agentId || 'Agent';
    if (name) name.textContent = label || 'Agent';
    // 注入 SVG icon
    if (iconBox) {
      var icon = (fallback && fallback.icon) || '';
      if (icon) {
        iconBox.innerHTML = icon;
        iconBox.classList.add('has-icon');
      } else {
        iconBox.innerHTML = '';
        iconBox.classList.remove('has-icon');
      }
    }
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

  // ---------------- Chat bubbles (Phase CHAT-P1) ----------------
  function appendChatBubble(targetSel, role, text, status) {
    var box = $(targetSel);
    if (!box) return;
    // 首次发消息时去掉 empty placeholder
    if (box.querySelector && box.querySelector('.empty')) {
      var empty = box.querySelector('.empty');
      if (empty) empty.remove();
    }
    var bubble = el('div', { class: 'chat-bubble chat-bubble-' + role }, [
      el('div', { class: 'chat-bubble-role', text: role === 'user' ? 'You' : (role === 'agent' ? 'Agent' : 'System') }),
      el('div', { class: 'chat-bubble-text', text: text }),
      status ? el('div', { class: 'chat-bubble-meta', text: status }) : null
    ]);
    box.appendChild(bubble);
  }
  function scrollChatToBottom(targetSel) {
    var box = $(targetSel);
    if (!box) return;
    try { box.scrollTop = box.scrollHeight; } catch (_) {}
  }

  // Phase UI-A5：根据 sessionId 从后端拉 messages 并渲染
  // 走 /api/mobile/sessions/:id/messages（受 mobile-sessions.js scrub 安全过滤）
  async function loadSessionMessages(sessionId) {
    var sid = sessionId || agentState.sessionId;
    if (!sid) return;
    var box = $('#agent-messages');
    if (!box) return;
    try {
      var r = await api('/api/mobile/sessions/' + encodeURIComponent(sid) + '/messages?limit=50');
      if (!r || !r.ok) return;
      var arr = (r && r.messages) || [];
      if (!Array.isArray(arr) || arr.length === 0) return;
      // 把后端 messages 注入到 messages 容器（不清空，append 形式）
      arr.forEach(function (m) {
        var role = m.role || 'agent';
        var text = m.text || m.preview || '';
        if (!text) return;
        var div = document.createElement('div');
        div.className = 'chat-bubble chat-bubble-' + (role === 'user' ? 'user' : 'agent');
        var head = document.createElement('div');
        head.className = 'chat-bubble-role';
        head.textContent = role === 'user' ? 'You' : 'Agent';
        var body1 = document.createElement('div');
        body1.className = 'chat-bubble-text';
        body1.textContent = text;
        div.appendChild(head);
        div.appendChild(body1);
        box.appendChild(div);
      });
    } catch (_) { /* ignore */ }
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
    // Phase UI-A5：拉 messages 全文（受后端 scrub 安全过滤）补充消息流
    if (agentState.sessionId) {
      try { loadSessionMessages(agentState.sessionId); } catch (_) { /* ignore */ }
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

  // ---------------- Slash Skill Palette + Composer State (Phase CHAT-P1) ----------------
  var composerState = {
    selectedSkill: null,
    slashOpen: false,
    slashIndex: 0,
    slashItems: [],
    slashSource: 'home',
    slashError: false
  };

  function searchSkills(query) {
    var q = String(query || '').toLowerCase().trim();
    var items = (skillsState.items || []).filter(function (x) { return !!(x && (x.id || x.name)); });
    if (!q) return items.slice(0, 8);
    var ranked = [];
    for (var i = 0; i < items.length; i++) {
      var s = items[i];
      var id = skillIdOf(s).toLowerCase();
      var name = skillNameOf(s).toLowerCase();
      var desc = String(s.description || '').toLowerCase();
      var zh = String(skillDescriptionZh(s)).toLowerCase();
      var score = 0;
      if (name === q) score += 100;
      else if (name.indexOf(q) === 0) score += 60;
      else if (name.indexOf(q) >= 0) score += 40;
      if (id === q) score += 90;
      else if (id.indexOf(q) === 0) score += 50;
      else if (id.indexOf(q) >= 0) score += 20;
      if (zh.indexOf(q) >= 0) score += 30;
      if (desc.indexOf(q) >= 0) score += 20;
      if (score > 0) ranked.push({ s: s, score: score });
    }
    ranked.sort(function (a, b) { return b.score - a.score; });
    return ranked.slice(0, 8).map(function (x) { return x.s; });
  }

  function slashPaletteSel(source) {
    return (source === 'home') ? '#home-slash-palette' : '#agent-slash-palette';
  }
  function slashInputSel(source) {
    return (source === 'home') ? '#home-input' : '#agent-input';
  }
  function slashIndicatorSel(source) {
    return (source === 'home') ? '#home-skill-indicator' : '#agent-skill-indicator';
  }

  function closeSlashPalette(source) {
    composerState.slashOpen = false;
    composerState.slashItems = [];
    composerState.slashIndex = 0;
    var box = $(slashPaletteSel(source));
    if (box) {
      box.hidden = true;
      clearChildren(box);
    }
  }

  function paintSlashPalette(source) {
    var box = $(slashPaletteSel(source));
    var input = $(slashInputSel(source));
    if (!box || !input) return;
    clearChildren(box);
    if (composerState.slashError) {
      box.hidden = false;
      box.appendChild(el('div', { class: 'slash-empty', text: '技能列表加载失败，请稍后重试' }));
      return;
    }
    var items = composerState.slashItems || [];
    if (!items.length) {
      box.hidden = false;
      box.appendChild(el('div', { class: 'slash-empty', text: '未找到匹配技能' }));
      return;
    }
    box.hidden = false;
    items.forEach(function (s, idx) {
      var id = skillIdOf(s);
      var name = skillNameOf(s);
      var zh = skillDescriptionZh(s);
      var desc = String(s.description || '').trim();
      var enabled = skillEnabled(s);
      var row = el('button', {
        class: 'slash-item' + (idx === composerState.slashIndex ? ' is-active' : ''),
        type: 'button',
        'data-skill-id': id
      }, [
        el('div', { class: 'slash-item-name', text: '/' + name }),
        el('div', { class: 'slash-item-desc', text: (zh || desc || '暂无介绍') }),
        el('div', { class: 'slash-item-meta', text: (s.source || 'skill') + ' · ' + (enabled ? 'enabled' : 'disabled') })
      ]);
      row.addEventListener('click', function () { selectSkill(source, s); });
      box.appendChild(row);
    });
  }

  async function loadSkillsForPalette() {
    if (skillsState.items && skillsState.items.length) return skillsState.items;
    composerState.slashError = false;
    try {
      var j = await api('/api/mobile/skills');
      skillsState.items = pickList(j).filter(function (x) { return !!(x && (x.id || x.name)); });
    } catch (e) {
      skillsState.items = [];
      composerState.slashError = true;
    }
    try {
      var s = await api('/api/mobile/skills-state');
      skillsState.states = (s && s.states && typeof s.states === 'object') ? s.states : {};
    } catch (e) {
      skillsState.states = {};
    }
    return skillsState.items || [];
  }

  async function updateSlashPalette(source) {
    var input = $(slashInputSel(source));
    if (!input) return;
    var text = input.value || '';
    if (text.indexOf('/') !== 0) {
      closeSlashPalette(source);
      return;
    }
    composerState.slashSource = source;
    // 首次打开 palette 时异步加载 skills；失败会在 paintSlashPalette 中展示
    if (!skillsState.items || !skillsState.items.length) {
      await loadSkillsForPalette();
    }
    var query = text.slice(1);
    composerState.slashItems = searchSkills(query);
    composerState.slashIndex = 0;
    paintSlashPalette(source);
  }

  function selectSkill(source, s, remainingText) {
    var input = $(slashInputSel(source));
    if (input) {
      input.value = (remainingText || '').trim();
      input.focus();
      // 触发 autosize / send button 更新
      var ev = document.createEvent('Event');
      ev.initEvent('input', true, true);
      input.dispatchEvent(ev);
    }
    composerState.selectedSkill = {
      id: skillIdOf(s),
      name: skillNameOf(s),
      description: String(s.description || '').trim(),
      zhDescription: skillDescriptionZh(s),
      source: s.source || 'skill'
    };
    closeSlashPalette(source);
    paintSkillIndicator(source);
    updateComposerSendButton(source);
  }

  function paintSkillIndicator(source) {
    var box = $(slashIndicatorSel(source));
    if (!box) return;
    clearChildren(box);
    var sk = composerState.selectedSkill;
    if (!sk) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.appendChild(el('span', { class: 'skill-indicator-chip' }, [
      tspan('Using skill: ' + sk.name)
    ]));
    var clear = el('button', { class: 'skill-indicator-clear', type: 'button', 'aria-label': '清除技能' }, [tspan('×')]);
    clear.addEventListener('click', function () {
      composerState.selectedSkill = null;
      paintSkillIndicator(source);
      updateComposerSendButton(source);
      var input = $(slashInputSel(source));
      if (input) input.focus();
    });
    box.appendChild(clear);
  }

  function updateComposerSendButton(source) {
    if (source === 'home') updateHomeSendButtonState();
    else updateSendButtonState();
  }

  function injectSkillPrompt(text, skill) {
    var sk = skill || composerState.selectedSkill;
    if (!sk) return text;
    var header = 'Use the following FanBox skill for this request:\n' +
                 'Skill: ' + sk.name + '\n' +
                 'Description: ' + (sk.zhDescription || sk.description || '暂无介绍') + '\n';
    if (sk.source) header += 'Source: ' + sk.source + '\n';
    header += '\nUser request:\n' + text;
    return header;
  }

  function clearComposer(source) {
    var input = $(slashInputSel(source));
    if (input) {
      input.value = '';
      input.style.height = '';
    }
    composerState.selectedSkill = null;
    closeSlashPalette(source);
    paintSkillIndicator(source);
    updateComposerSendButton(source);
  }

  function restoreComposer(source, text, skill) {
    var input = $(slashInputSel(source));
    if (input) {
      input.value = text || '';
      input.focus();
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch (_) {}
      var ev = document.createEvent('Event');
      ev.initEvent('input', true, true);
      input.dispatchEvent(ev);
    }
    if (skill) {
      composerState.selectedSkill = skill;
      paintSkillIndicator(source);
      updateComposerSendButton(source);
    }
  }

  function handleSlashKeydown(e, source) {
    if (!composerState.slashOpen) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      composerState.slashIndex = (composerState.slashIndex + 1) % (composerState.slashItems.length || 1);
      paintSlashPalette(source);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      var len = composerState.slashItems.length || 1;
      composerState.slashIndex = (composerState.slashIndex - 1 + len) % len;
      paintSlashPalette(source);
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      var item = composerState.slashItems[composerState.slashIndex];
      if (item) selectSkill(source, item);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSlashPalette(source);
      return true;
    }
    return false;
  }

  // ---------------- Send (Phase UI-A2 + CHAT-P1) ----------------
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

    // Slash skill 处理（CHAT-P1）
    var selectedSkill = composerState.selectedSkill;
    var originalSkill = selectedSkill;
    var originalText = text;
    if (text.indexOf('/') === 0 && !selectedSkill) {
      var afterSlash = text.slice(1);
      var sp = afterSlash.indexOf(' ');
      var slashName = (sp >= 0 ? afterSlash.slice(0, sp) : afterSlash).trim();
      var rest = (sp >= 0 ? afterSlash.slice(sp + 1).trim() : '');
      if (slashName) {
        var matched = searchSkills(slashName);
        if (matched.length) {
          selectedSkill = {
            id: skillIdOf(matched[0]),
            name: skillNameOf(matched[0]),
            description: String(matched[0].description || ''),
            zhDescription: skillDescriptionZh(matched[0]),
            source: matched[0].source || 'skill'
          };
          composerState.selectedSkill = selectedSkill;
          selectSkill(src, matched[0], rest);
          paintSkillIndicator(src);
          updateComposerSendButton(src);
          if (!rest) return;
          text = rest;
          originalText = rest;
        } else {
          appendChatBubble('#agent-messages', 'system', '没有找到名为 /' + esc(slashName) + ' 的技能。你可以从技能菜单中选择一个技能，或直接输入普通消息。', 'failed');
          scrollChatToBottom('#agent-messages');
          return;
        }
      }
    }

    var textToSend = selectedSkill ? injectSkillPrompt(text, selectedSkill) : text;
    var displayText = text;

    // 发送前立即清空 composer，给用户即时反馈；失败后再恢复
    clearComposer(src);
    btn.disabled = true;
    agentState.runStatus = 'running';
    paintAgentStatus();
    paintAgentHeaderStatus();

    // Phase UI-A5：Home 顶部发消息后立刻切到 Agent 独立对话页
    if (src === 'home') {
      try { showTab('agent'); } catch (_) { /* ignore */ }
    }

    // 立即显示 user bubble
    appendChatBubble('#agent-messages', 'user', displayText, 'sending');
    scrollChatToBottom('#agent-messages');

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
        text: textToSend,
        cwd: agentState.cwd,
        agentId: agentState.agentId,
        contextFiles: []
      });
      if (!r || !r.ok) throw new Error((r && r.error) || 'send_failed');
      // 3) 红线也走 runner；UI 不再显示 approval bar
      agentState.runStatus = (r.status === 'failed') ? 'failed' : (r.status || 'done');
      paintAgentStatus();
      paintAgentHeaderStatus();
      // 拉取并渲染完整 messages（replace 避免重复追加）
      var box = $('#agent-messages');
      if (box) clearChildren(box);
      try { await loadSessionMessages(sessionId); } catch (_) {}
      // 跑完后刷新 Home sessions 列表（Running / Recent）
      try { if (typeof renderHome === 'function') await renderHome(); } catch (_) {}
      // 如果用户在 Agent 独立页：刷新 messages
      if (src === 'agent') {
        await refreshAgentSessions();
      }
      scrollChatToBottom('#agent-messages');
    } catch (e) {
      // 失败：恢复原文与 skill，方便用户修改/重试
      restoreComposer(src, originalText);
      composerState.selectedSkill = originalSkill;
      paintSkillIndicator(src);
      agentState.runStatus = 'failed';
      paintAgentStatus();
      paintAgentHeaderStatus();
      appendChatBubble('#agent-messages', 'system', userFacingSendError(e), 'failed');
      scrollChatToBottom('#agent-messages');
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

  // 把底层错误翻译成用户可读中文，避免 TypeError / ENOENT / raw 堆栈直接暴露
  function userFacingError(e, fallback) {
    var msg = String((e && (e.message || e)) || fallback || '未知错误');
    if (/no_token|unauthorized|会话已失效/.test(msg)) return '会话已失效，请重新配对';
    if (/fetch|network|TypeError.*fetch/.test(msg)) return '网络连接失败，请检查 LAN 或稍后重试';
    if (/empty_text/.test(msg)) return '发送内容不能为空';
    if (/text_too_long/.test(msg)) return '发送内容过长';
    if (/invalid_agent|missing_agent/.test(msg)) return '请先选择 agent';
    if (/missing_cwd/.test(msg)) return '请先在 Files 选择工作目录';
    if (/session_busy|running/.test(msg)) return '当前 session 正在运行，请等待完成';
    if (/session_not_found/.test(msg)) return '会话不存在，请新建对话';
    if (/send_failed|draft_failed/.test(msg)) return '发送失败，请稍后重试';
    if (/toggle_failed/.test(msg)) return '切换失败，请稍后重试';
    if (/ENOENT/.test(msg)) return '未找到可执行文件，请检查是否安装';
    return fallback || msg;
  }
  function userFacingSendError(e) { return userFacingError(e, '发送失败，请稍后重试'); }

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
      homeInput.addEventListener('input', function () {
        updateHomeSendButtonState();
        updateSlashPalette('home');
      });
      homeInput.addEventListener('keydown', function (e) {
        if (handleSlashKeydown(e, 'home')) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSendMessage('home');
        }
      });
    }
    var homeSend = document.getElementById('home-send');
    if (homeSend) homeSend.addEventListener('click', function () { onSendMessage('home'); });

    // Phase UI-A5: 点击 Home 的 Work in: 跳到 Files 选 cwd
    var homeCwd = document.getElementById('home-cwd');
    if (homeCwd) {
      homeCwd.addEventListener('click', function () {
        if (agentState.cwd) {
          // 已选 cwd：直接跳 Files（方便切换）
          showTab('files');
        } else {
          showTab('files');
        }
      });
    }
    // Agent 页 cwd 也点得到 Files
    var agentCwd = document.getElementById('agent-cwd');
    if (agentCwd) {
      agentCwd.addEventListener('click', function () { showTab('files'); });
    }

    // Agent 独立页：Send
    var agentInput = document.getElementById('agent-input');
    if (agentInput) {
      agentInput.addEventListener('input', function () {
        updateSendButtonState();
        updateSlashPalette('agent');
      });
      agentInput.addEventListener('keydown', function (e) {
        if (handleSlashKeydown(e, 'agent')) return;
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

    // skills filter (Phase UI-A5)
    var skillsQ = document.getElementById('skills-q');
    if (skillsQ) skillsQ.addEventListener('input', paintSkills);
    $all('.skills-filter-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-filter') || 'all';
        skillsState.filter = f;
        $all('.skills-filter-btn').forEach(function (x) {
          var on = x.getAttribute('data-filter') === f;
          x.classList.toggle('is-active', on);
          x.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        paintSkills();
      });
    });

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
      composerState: composerState,
      filesState: filesState,
      agentState: agentState,
      AGENT_FALLBACK: AGENT_FALLBACK,
      AGENT_CHIPS: AGENT_CHIPS,
      ASSISTANT_CARDS: ASSISTANT_CARDS,
      POST_ALLOWLIST: POST_ALLOWLIST,
      isAllowedPost: isAllowedPost,
      // Phase CHAT-P1
      searchSkills: searchSkills,
      injectSkillPrompt: injectSkillPrompt,
      selectSkill: selectSkill,
      closeSlashPalette: closeSlashPalette,
      updateSlashPalette: updateSlashPalette,
      handleSlashKeydown: handleSlashKeydown,
      clearComposer: clearComposer,
      restoreComposer: restoreComposer,
      // API（mock 时可换）
      api: api,
      apiPost: apiPost
    };
  }
})();
