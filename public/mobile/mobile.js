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
    if (allowed.indexOf(name) < 0) name = 'agent';
    $all('.tab-pane').forEach(function (p) {
      p.hidden = p.getAttribute('data-tab') !== name;
    });
    $all('.tab-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-tab-btn') === name);
    });
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

  // ---------------- Home ----------------
  async function renderHome() {
    var todayEl = $('#home-usage-today');
    var weekEl = $('#home-usage-week');
    if (todayEl) todayEl.textContent = '—';
    if (weekEl) weekEl.textContent = '—';
    // 1) usage（mobile runner summary）
    var usageP = api('/api/mobile/usage').then(function (j) {
      var s = (j && j.summary) || {};
      // Phase UI-A1：mobile usage 不暴露 token；只显示 runs 计数
      if (todayEl) todayEl.textContent = (typeof s.todayRuns === 'number') ? String(s.todayRuns) : '0';
      if (weekEl) weekEl.textContent = (typeof s.weekRuns === 'number') ? String(s.weekRuns) : '0';
      var todayRunsEl = $('#home-runs-today');
      var weekRunsEl = $('#home-runs-week');
      var durEl = $('#home-runs-duration');
      if (todayRunsEl) todayRunsEl.textContent = (typeof s.todayRuns === 'number') ? String(s.todayRuns) : '0';
      if (weekRunsEl) weekRunsEl.textContent = (typeof s.weekRuns === 'number') ? String(s.weekRuns) : '0';
      if (durEl) durEl.textContent = (typeof s.todayDurationMs === 'number') ? (Math.round(s.todayDurationMs / 100) / 10) + 's' : '0s';
      var recentEl = $('#home-runs-recent');
      if (recentEl) {
        clearChildren(recentEl);
        var mr = (j && j.mobileRunner && Array.isArray(j.mobileRunner.recent)) ? j.mobileRunner.recent : [];
        if (!mr.length) {
          recentEl.appendChild(emptyBlock('No mobile runs yet', 'send a message from Agent Tab to start'));
          return;
        }
        mr.slice(0, 5).forEach(function (r) {
          var dur = (typeof r.durationMs === 'number') ? (Math.round(r.durationMs / 100) / 10) + 's' : '—';
          var lbl = (r.agentId || '?') + ' · ' + (r.cwdLabel || '?') + ' · ' + dur + ' · ' + (r.status || '?');
          recentEl.appendChild(el('div', { class: 'root-row' }, [
            el('div', { class: 'root-name', text: lbl }),
            el('div', { class: 'root-path', text: fmtTime(r.startedAt) })
          ]));
        });
      }
    }).catch(function () { /* 不阻断 */ });

    // 2) sessions（recent + running from unified index）
    var sessionsP = api('/api/mobile/sessions?limit=50').then(function (j) {
      var items = pickList(j);
      paintHomeRunningSessions(items.filter(function (s) { return s.status === 'running' || s.status === 'waiting_approval'; }));
      paintHomeRecentSessions(items.slice(0, 10));
      paintSidebarRecentSessions(items.slice(0, 8));
    }).catch(function () { /* 不阻断 */ });

    try { await Promise.all([usageP, sessionsP]); } catch (e) { /* */ }
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

  // ---------------- Files ----------------
  var filesState = { root: '', q: '', lastResults: [], lastPicked: null, aborter: null, currentObjectUrl: null };

  async function loadRoots() {
    var sel = $('#files-root');
    if (!sel) return;
    if (sel.options.length > 0) return;
    sel.innerHTML = '<option>Loading…</option>';
    try {
      var r = await api('/api/mobile/roots');
      sel.innerHTML = '';
      var roots = pickList(r.roots);
      roots.forEach(function (x) {
        var o = el('option', { value: x.path, text: x.name || x.path });
        sel.appendChild(o);
      });
      if (roots.length) {
        sel.value = roots[0].path;
        filesState.root = roots[0].path;
      }
    } catch (e) {
      sel.innerHTML = '<option>No roots</option>';
    }
  }

  async function runSearch() {
    var q = ($('#files-q').value || '').trim();
    var root = $('#files-root').value || filesState.root;
    filesState.q = q;
    filesState.root = root;
    var list = $('#files-list');
    var meta = $('#files-meta');
    if (!q) {
      clearChildren(list);
      list.appendChild(emptyBlock('输入关键字开始搜索', 'Root + 关键字 = 模糊文件名匹配'));
      meta.textContent = '';
      return;
    }
    if (filesState.aborter) try { filesState.aborter.abort(); } catch (e) {}
    filesState.aborter = new AbortController();
    meta.textContent = '搜索中…';
    clearChildren(list);
    list.appendChild(el('div', { class: 'skeleton', style: 'height: 56px; margin-bottom: 8px;' }));
    try {
      var url = '/api/mobile/search?q=' + encodeURIComponent(q) + '&path=' + encodeURIComponent(root) + '&limit=50';
      var t = getToken();
      var r = await fetch(url, { method: 'GET', headers: { 'Authorization': 'Bearer ' + t, 'Accept': 'application/json' }, signal: filesState.aborter.signal });
      var j = null; try { j = await r.json(); } catch (e) { j = { ok: false }; }
      clearChildren(list);
      if (!j.ok) throw new Error(j.error || ('http_' + r.status));
      var items = pickList(j);
      filesState.lastResults = items;
      meta.textContent = items.length + ' results' + (j.truncated ? ' (truncated)' : '');
      if (!items.length) {
        list.appendChild(emptyBlock('No files found', '没有匹配的文件名'));
        return;
      }
      items.forEach(function (it) {
        var row = el('button', { class: 'file-row', type: 'button' }, [
          el('div', { class: 'file-name', text: it.name }),
          el('div', { class: 'file-path', text: relPath(it.path), title: it.path || '' }),
          el('div', { class: 'file-meta' }, [
            el('span', { class: 'pill' + (it.kind && it.kind !== 'text' ? '' : ' pill-blue'), text: it.kind || 'file' }),
            tspan(fmtSize(it.size)),
            tspan(fmtTime(it.mtime))
          ])
        ]);
        row.addEventListener('click', function () { pickFile(it); });
        list.appendChild(row);
      });
    } catch (e) {
      if (String(e && e.name) === 'AbortError') return;
      clearChildren(list);
      list.appendChild(emptyBlock('Search failed', String(e && e.message || e)));
      meta.textContent = '';
    }
  }

  // ---------------- 受保护图片：fetch + token + blob URL ----------------
  var imageRegistry = []; // 跟踪本次会话所有 objectURL，关闭预览时回收
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

  async function pickFile(it) {
    filesState.lastPicked = it;
    // 关闭旧预览时回收上次的 objectURL
    if (filesState.currentObjectUrl) {
      try { URL.revokeObjectURL(filesState.currentObjectUrl); } catch (e) {}
      filesState.currentObjectUrl = null;
    }
    var box = $('#files-preview');
    var nameEl = $('#files-preview-name');
    var metaEl = $('#files-preview-meta');
    var body = $('#files-preview-body');
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
      // 不直接 <img src="/api/mobile/thumb?...">：浏览器不会带 Authorization。
      // 走 fetch + Bearer + blob URL，关闭时 revoke。
      body.appendChild(el('div', { class: 'preview-loading', text: '图片加载中…' }));
      loadAuthImage(j.thumbUrl).then(function (objectUrl) {
        // 二次校验：确保用户没有切到其它文件
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

  async function renderFiles() {
    await loadRoots();
    paintFilesCwd();
    if (!filesState.lastResults.length) {
      runSearch();
    }
  }

  // Phase 2A-1：Files "current folder" CTA —— 显示当前 root + 启用按钮
  function paintFilesCwd() {
    var label = $('#files-cwd-label');
    var openBtn = $('#files-open-agent');
    var sessBtn = $('#files-view-sessions');
    var root = $('#files-root') ? $('#files-root').value : (filesState.root || '');
    if (label) label.textContent = root ? relPath(root) : '未选择';
    if (openBtn) openBtn.disabled = !root;
    if (sessBtn) sessBtn.disabled = !root;
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

  // ---------------- Phase 2A-1：Agent Workspace Shell ----------------
  // 4 个固定 agent：claude / codex / opencode / qoder（fallback 占位）
  var AGENT_CHIPS = [
    { id: 'claude',   label: 'Claude Code' },
    { id: 'codex',    label: 'Codex' },
    { id: 'opencode', label: 'OpenCode' },
    { id: 'qoder',    label: 'Qoder' }
  ];
  var agentState = {
    cwd: '',
    agentId: '',
    sessionId: '',
    sessions: [],
    installedMap: {}, // agentId -> bool
    usage: null,
    // Phase UI-A1：移除 desktop approval；保留 runStatus 供 Send 按钮控制
    runStatus: ''                 // running / done / failed / '' (idle)
  };

  // Phase UI-A1：移除 approval 文案（红线仅写 audit，不再走 approval）
  var RUN_STATUS_TEXT = {
    running: 'Agent is running…',
    done:    'Done.',
    failed:  'Failed.'
  };

  // 把"当前 Agent Tab 是否被实际切换过"记下来，避免 user 选完 root 后重复拉
  var agentLoadedOnce = false;

  async function renderAgent() {
    paintAgentSwitcher();
    paintAgentStatus();
    paintAgentCwd();
    paintAgentMessages();
    paintAgentHero();
    paintAgentAssistantCards();
    paintAgentRunsSummary();
    paintAgentUsage();
    paintAgentContext();
    // 第一次进入：拉一次 context + sessions
    if (!agentLoadedOnce) {
      agentLoadedOnce = true;
      try {
        var ctx = await api('/api/mobile/context/current');
        agentState.cwd = ctx.cwd || '';
        agentState.agentId = ctx.agentId || '';
        agentState.sessionId = ctx.sessionId || '';
        paintAgentCwd();
        paintAgentSwitcher();
      } catch (e) { /* ignore */ }
    }
    // 拉 agent 安装情况（不强制失败；不阻塞 UI）
    try {
      var r = await api('/api/mobile/agents');
      var items = pickList(r);
      items.forEach(function (a) { agentState.installedMap[a.id] = !!a.installed; });
      paintAgentSwitcher();
    } catch (e) { /* ignore */ }
    // 拉 sessions（如果 cwd 非空）
    if (agentState.cwd) {
      await refreshAgentSessions();
    } else {
      paintAgentSessionsEmpty('请先在 Files 选择 cwd');
    }
  }

  // Phase UI-A1：AionUi-like hero greet（按时间动态）
  function paintAgentHero() {
    var greet = $('#agent-hero-greet');
    var sub = $('#agent-hero-sub');
    var now = new Date();
    var hr = now.getHours();
    var time = (hr < 12) ? 'Good morning' : (hr < 18) ? 'Good afternoon' : 'Good evening';
    if (greet) greet.textContent = time + ", what's your plan for today?";
    if (sub) sub.textContent = 'Type a message, ask an agent to work in this folder, or pick a skill below.';
  }

  // Phase UI-A1：AionUi-like assistant / skill cards（点击 → 填入 input）
  // Phase UI-A1：assistant cards 用纯文字+SVG icon（避免 unicode emoji 触发安全扫描）
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

  function paintAgentAssistantCards() {
    var box = $('#agent-assistant-cards');
    if (!box) return;
    clearChildren(box);
    ASSISTANT_CARDS.forEach(function (c) {
      var card = el('button', { class: 'agent-assistant-card', type: 'button', title: c.prompt }, [
        el('span', { class: 'agent-assistant-card-icon', text: c.icon }),
        tspan(c.title)
      ]);
      card.addEventListener('click', function () { onPickAssistant(c); });
      box.appendChild(card);
    });
  }

  function onPickAssistant(card) {
    var input = $('#agent-input');
    if (!input) return;
    var cur = (input.value || '').trim();
    var sep = cur && !cur.endsWith('\n') ? '\n' : '';
    input.value = cur + sep + (card.prompt || '');
    input.focus();
    updateSendButtonState();
    try { input.scrollIntoView({ block: 'center' }); } catch (_) {}
  }

  function paintAgentRunsSummary() {
    var box = $('#agent-runs-summary');
    if (!box) return;
    clearChildren(box);
    api('/api/mobile/usage').then(function (j) {
      var s = (j && j.summary) || {};
      var today = (typeof s.todayRuns === 'number') ? s.todayRuns : 0;
      var week = (typeof s.weekRuns === 'number') ? s.weekRuns : 0;
      var durMs = (typeof s.todayDurationMs === 'number') ? s.todayDurationMs : 0;
      var dur = (Math.round(durMs / 100) / 10) + 's';
      clearChildren(box);
      box.appendChild(el('div', { class: 'agent-runs-row' }, [tspan('Today'), tspan(String(today))]));
      box.appendChild(el('div', { class: 'agent-runs-row' }, [tspan('This week'), tspan(String(week))]));
      box.appendChild(el('div', { class: 'agent-runs-row' }, [tspan('Today duration'), tspan(dur)]));
    }).catch(function () { /* ignore */ });
  }

  function paintAgentCwd() {
    var cwdEl = $('#agent-cwd');
    if (cwdEl) cwdEl.textContent = agentState.cwd ? relPath(agentState.cwd) : '未选择';
  }

  function paintAgentSwitcher() {
    var box = $('#agent-switcher');
    if (!box) return;
    clearChildren(box);
    AGENT_CHIPS.forEach(function (a) {
      var installed = agentState.installedMap[a.id];
      var installedKnown = (typeof installed === 'boolean');
      var chip = el('button', {
        class: 'agent-chip' +
          (agentState.agentId === a.id ? ' is-active' : '') +
          (installedKnown ? (installed ? ' is-installed' : ' is-missing') : ''),
        type: 'button',
        'data-agent-id': a.id
      }, [
        el('span', { class: 'agent-chip-dot' }),
        tspan(a.label)
      ]);
      chip.addEventListener('click', function () { onPickAgent(a.id); });
      box.appendChild(chip);
    });
  }

  function paintAgentStatus() {
    var el1 = $('#agent-session-status');
    var el2 = $('#agent-status-pill');
    if (el1) {
      if (agentState.sessionId) el1.textContent = 'session ' + agentState.sessionId;
      else el1.textContent = agentState.cwd ? '未选择 session' : '未选择 cwd';
    }
    if (el2) {
      clearChildren(el2);
      var kind = agentState.sessionId ? 'ok' : 'unknown';
      var text = agentState.sessionId ? 'ready' : 'no session';
      el2.appendChild(statusPill(text, kind));
    }
  }

  function paintAgentMessages() {
    var box = $('#agent-messages');
    if (!box) return;
    clearChildren(box);
    var cur = agentState.sessions.find(function (s) { return s.sessionId === agentState.sessionId; });
    if (!cur) {
      if (!agentState.cwd) {
        box.appendChild(emptyBlock('请先在 Files 选择 cwd', 'cwd → agent → session'));
      } else if (agentState.sessions.length === 0) {
        box.appendChild(emptyBlock('当前 cwd 暂无 session', '可在 Sessions 页面查看其他来源'));
      } else {
        box.appendChild(emptyBlock('未选择 session', '点击下方最近 session，或切换 agent'));
      }
      return;
    }
    // v1：detail 不暴露 messages 全文（mobile-sessions.js scrubSessionDetail）
    // 这里给一个安全摘要气泡
    var preview = (cur.summary && cur.summary.lastMessagePreview) || '';
    // Phase 2B：附 status + duration 小摘要（仅 mobile source）
    var durText = '';
    if (cur.source === 'mobile') {
      var dur = (cur.usage && typeof cur.usage.durationMs === 'number') ? cur.usage.durationMs : 0;
      if (dur > 0) durText = (Math.round(dur / 100) / 10) + 's';
    }
    var statusLine = ' · ' + (cur.status || 'unknown') + (durText ? (' · ⏱ ' + durText) : '');
    if (preview) {
      var b = el('div', { class: 'message-bubble message-bubble-agent' }, [
        el('span', { class: 'message-role', text: (cur.summary.lastRole || 'agent') + ' · ' + (cur.agentId || 'unknown') + statusLine }),
        tspan(preview)
      ]);
      box.appendChild(b);
    } else {
      box.appendChild(emptyBlock('无 preview 内容', 'session ' + cur.sessionId + statusLine));
    }
    if (cur.context && (cur.context.files || cur.context.skills)) {
      var files = (cur.context.files || []).slice(0, 3);
      var skills = (cur.context.skills || []).slice(0, 3);
      if (files.length || skills.length) {
        var meta = el('div', { class: 'message-bubble message-bubble-system' });
        if (files.length) meta.appendChild(tspan('files: ' + files.map(relPath).join(', ') + '\n'));
        if (skills.length) meta.appendChild(tspan('skills: ' + skills.join(', ')));
        box.appendChild(meta);
      }
    }
  }

  function paintAgentSessionsEmpty(sub) {
    agentState.sessions = [];
    var box = $('#agent-messages');
    if (box) {
      clearChildren(box);
      box.appendChild(emptyBlock('当前 cwd 暂无 session', sub || '可在 Sessions 页面查看其他来源'));
    }
  }

  function paintAgentUsage() {
    var t = $('#agent-usage-today');
    var w = $('#agent-usage-week');
    if (!t || !w) return;
    if (agentState.usage && agentState.usage.summary) {
      t.textContent = fmtTokens(agentState.usage.summary.todayTokens);
      w.textContent = fmtTokens(agentState.usage.summary.weekTokens);
    } else {
      t.textContent = '—';
      w.textContent = '—';
    }
  }

  function paintAgentContext() {
    var f = $('#agent-context-files');
    var s = $('#agent-skill-suggestions');
    if (!f || !s) return;
    var cur = agentState.sessions.find(function (x) { return x.sessionId === agentState.sessionId; });
    if (cur && cur.context) {
      var files = (cur.context.files || []).map(relPath).join(' · ') || '—';
      var skills = (cur.context.skills || []).join(' · ') || '—';
      f.textContent = files;
      s.textContent = skills;
    } else {
      f.textContent = '—';
      s.textContent = '—';
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
      paintAgentContext();
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
    paintAgentStatus();
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

  // 用户在 Files 页面点"在此文件夹打开 Agent"
  async function onFilesOpenAgent() {
    var root = $('#files-root') ? $('#files-root').value : (filesState.root || '');
    if (!root) return;
    try {
      await apiPost('/api/mobile/context/cwd', { cwd: root });
    } catch (e) {
      console.warn('set context cwd failed', e);
    }
    agentState.cwd = root;
    // 选择后端记忆的 lastAgent（如果有），否则默认 claude
    agentState.agentId = 'claude';
    agentState.sessionId = '';
    agentLoadedOnce = true;
    showTab('agent');
  }

  // 用户在 Agent 页面点"选择文件夹" —— 简化：直接复用 Files 的 root select（暂不实现 picker）
  function onAgentPickCwd() {
    // 切到 Files 页面，让用户在那里选 root
    showTab('files');
  }

  // ---------------- Phase 2A-2.1：Send (redline-aware) ----------------
  // 普通消息 → stub runner → done
  // 红线消息 → approval → waiting_approval → 轮询 approved / rejected / timeout

  // Phase UI-A1：mobile send path 直接走 runner；redline 仅写 audit，不再走 desktop approval
  // 原 onSendMessage 里的 approval 流程已删除。
  async function onSendMessage() {
    var input = $('#agent-input');
    var btn = $('#agent-send');
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
      // 拉一次 events 显示 agent bubble
      try { await refreshEvents(); } catch (_) {}
      // 跑完后刷新 Home sessions 列表（Running / Recent）
      try { if (typeof renderHome === 'function') await renderHome(); } catch (_) {}
    } catch (e) {
      agentState.runStatus = 'failed';
      paintAgentStatus('error: ' + (e && e.message || e));
    } finally {
      btn.disabled = false;
      updateSendButtonState();
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
    // 简单做法：把 messages 渲染到 #agent-messages 容器
    var box = $('#agent-messages');
    if (!box) return;
    box.innerHTML = '';
    for (var i = 0; i < payload.messages.length; i++) {
      var m = payload.messages[i];
      var div = document.createElement('div');
      div.className = 'bubble bubble-' + (m.role || 'system');
      var role = document.createElement('div');
      role.className = 'bubble-role';
      role.textContent = m.role === 'user' ? 'You' : (m.role === 'agent' ? 'Agent' : 'System');
      var body = document.createElement('div');
      body.className = 'bubble-text';
      body.textContent = m.text || '';
      var meta = document.createElement('div');
      meta.className = 'bubble-meta';
      meta.textContent = m.status || '';
      div.appendChild(role);
      div.appendChild(body);
      div.appendChild(meta);
      box.appendChild(div);
    }
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
    paintIcons();
    // Phase UI-A1：Agent 为默认核心入口
    showTab('agent');
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
      setToken(j.token);
      msg.textContent = '配对成功';
      msg.className = 'msg msg-ok';
      setTimeout(showApp, 200);
    } catch (e) {
      msg.textContent = '配对失败：' + (e && e.message || e);
      msg.className = 'msg msg-err';
    } finally {
      btn.disabled = false;
    }
  }

  // ---------------- 事件绑定 ----------------
  function bind() {
    // bottom nav
    $all('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab-btn')); });
    });
    // quick access
    $all('.qa-tile').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-go')); });
    });
    // top refresh
    var refresh = document.getElementById('app-refresh');
    if (refresh) refresh.addEventListener('click', function () {
      var active = document.querySelector('.tab-btn.is-active');
      showTab(active ? active.getAttribute('data-tab-btn') : 'home');
    });
    // Phase UI-A1：Sidebar New Chat → 切到 Agent + 清空 input
    var newChat = document.getElementById('sidebar-new-chat');
    if (newChat) newChat.addEventListener('click', function () {
      var input = document.getElementById('agent-input');
      if (input) input.value = '';
      showTab('agent');
    });
    // Sidebar Search → 切到 Files（搜索栏在 Files 页面）
    var sbSearch = document.getElementById('sidebar-search');
    if (sbSearch) sbSearch.addEventListener('click', function () { showTab('files'); });
    // files
    var filesGo = document.getElementById('files-go');
    if (filesGo) filesGo.addEventListener('click', runSearch);
    var filesQ = document.getElementById('files-q');
    if (filesQ) {
      var t = null;
      filesQ.addEventListener('input', function () {
        if (t) clearTimeout(t);
        t = setTimeout(runSearch, 300);
      });
      filesQ.addEventListener('keydown', function (e) { if (e.key === 'Enter') runSearch(); });
    }
    var filesRoot = document.getElementById('files-root');
    if (filesRoot) filesRoot.addEventListener('change', function () { paintFilesCwd(); if (filesState.q) runSearch(); });
    var filesPreviewClose = document.getElementById('files-preview-close');
    if (filesPreviewClose) filesPreviewClose.addEventListener('click', function () {
      revokeAllObjectUrls();
      var p = document.getElementById('files-preview');
      if (p) p.hidden = true;
    });
    // Phase 2A-1：Files → Agent
    var filesOpenAgent = document.getElementById('files-open-agent');
    if (filesOpenAgent) filesOpenAgent.addEventListener('click', onFilesOpenAgent);
    // Phase 2A-1：Agent tab
    var agentPickCwd = document.getElementById('agent-pick-cwd');
    if (agentPickCwd) agentPickCwd.addEventListener('click', onAgentPickCwd);
    // Phase 2A-2.1：Agent → Send
    var agentInput = document.getElementById('agent-input');
    if (agentInput) {
      agentInput.addEventListener('input', updateSendButtonState);
      // Phase UI-A1：Enter 发送；Shift+Enter 换行
      agentInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!e.target.disabled) onSendMessage();
        }
      });
    }
    var agentSend = document.getElementById('agent-send');
    if (agentSend) {
      agentSend.addEventListener('click', onSendMessage);
    }
    // skills filter
    var skillsQ = document.getElementById('skills-q');
    if (skillsQ) skillsQ.addEventListener('input', paintSkills);
    // pair
    var pairBtn = document.getElementById('pair-btn');
    if (pairBtn) pairBtn.addEventListener('click', doPair);
    // 离开页面时回收所有 objectURL
    window.addEventListener('beforeunload', revokeAllObjectUrls);
    window.addEventListener('pagehide', revokeAllObjectUrls);
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
