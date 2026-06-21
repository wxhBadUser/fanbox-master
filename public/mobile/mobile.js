/* ============================================================
   FanBox Mobile · Mobile Console
   Phase 1 · 5 Tab · 只读 · LAN + Token
   Phase 1 修复 · 真实手机运行时硬化
   Phase 2A-1 · Sessions + Agent Workspace Shell（只读外壳 + 偏好写入）
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
      throw new Error('mobile UI 强制只读，不允许 ' + opts.method);
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

  // Phase 2A-1：POST 包装（仅限 mobile 偏好写入；不暴露任意写端点）
  // 白名单：仅 /api/mobile/context/* 允许 POST
  var POST_ALLOWLIST = /^\/api\/mobile\/context\/(cwd|select)$/;
  async function apiPost(path, body) {
    if (!POST_ALLOWLIST.test(path)) {
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
  function showTab(name) {
    $all('.tab-pane').forEach(function (p) {
      p.hidden = p.getAttribute('data-tab') !== name;
    });
    $all('.tab-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-tab-btn') === name);
    });
    var renderers = { home: renderHome, files: renderFiles, agent: renderAgent, skills: renderSkills, sessions: renderSessions };
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
    var rootsBox = $('#home-roots');
    var todayEl = $('#home-usage-today');
    var weekEl = $('#home-usage-week');
    clearChildren(rootsBox);
    if (todayEl) todayEl.textContent = '—';
    if (weekEl) weekEl.textContent = '—';
    // 并行：roots + usage
    var rootsP = api('/api/mobile/roots').then(function (r) {
      var roots = pickList(r.roots);
      if (!roots.length) {
        rootsBox.appendChild(emptyBlock('No roots available', 'allowedRoots 列表为空'));
        return;
      }
      roots.forEach(function (x) {
        var row = el('div', { class: 'root-row' }, [
          el('div', { class: 'root-name', text: x.name || 'root' }),
          el('div', { class: 'root-path', text: relPath(x.path), title: x.path || '' })
        ]);
        rootsBox.appendChild(row);
      });
    }).catch(function (e) {
      clearChildren(rootsBox);
      rootsBox.appendChild(emptyBlock('Failed to load roots', String(e && e.message || e)));
    });
    var usageP = api('/api/mobile/usage').then(function (j) {
      var s = (j && j.summary) || {};
      if (todayEl) todayEl.textContent = fmtTokens(s.todayTokens);
      if (weekEl) weekEl.textContent = fmtTokens(s.weekTokens);
      // Phase 2B：mobile runner runs（today/week）
      var todayRunsEl = $('#home-runs-today');
      var weekRunsEl = $('#home-runs-week');
      if (todayRunsEl) todayRunsEl.textContent = (typeof s.todayRuns === 'number') ? String(s.todayRuns) : '0';
      if (weekRunsEl) weekRunsEl.textContent = (typeof s.weekRuns === 'number') ? String(s.weekRuns) : '0';
      // mobile runner recent（最近 5 条）
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
          var row = el('div', { class: 'root-row' }, [
            el('div', { class: 'root-name', text: lbl }),
            el('div', { class: 'root-path', text: fmtTime(r.startedAt) })
          ]);
          recentEl.appendChild(row);
        });
      }
    }).catch(function () { /* 用量失败不阻断 Home */ });
    try { await Promise.all([rootsP, usageP]); } catch (e) { /* */ }
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
  var skillsState = { items: [], q: '' };

  async function renderSkills() {
    var list = $('#skills-list');
    clearChildren(list);
    list.appendChild(el('div', { class: 'skeleton', style: 'height: 64px; margin-bottom: 10px;' }));
    try {
      var j = await api('/api/mobile/skills');
      skillsState.items = pickList(j);
    } catch (e) {
      skillsState.items = [];
      paintSkills(String(e && e.message || e));
      return;
    }
    paintSkills();
  }

  function paintSkills(errMsg) {
    var list = $('#skills-list');
    var q = ($('#skills-q').value || '').trim().toLowerCase();
    var items = (skillsState.items || []).filter(function (x) { return !q || (x.name || '').toLowerCase().indexOf(q) >= 0; });
    clearChildren(list);
    if (!items.length) {
      var sub = errMsg
        ? ('加载失败：' + errMsg)
        : (skillsState.items.length ? '没有匹配名称的 skill' : '~/.claude/skills 暂为空');
      list.appendChild(emptyBlock('No skills available', sub));
      return;
    }
    items.forEach(function (s) {
      var enabled = !!s.enabled;
      var card = el('div', { class: 'skill-card' }, [
        el('div', { class: 'skill-head' }, [
          el('div', { class: 'skill-name', text: s.name || '(unnamed)' }),
          el('span', { class: 'pill pill-blue', text: s.source || '?' })
        ]),
        el('p', { class: 'skill-desc', text: s.description || 'No description' }),
        el('div', { class: 'skill-foot' }, [
          tspan(enabled ? 'enabled' : 'disabled'),
          statusPill(enabled ? 'available' : 'unavailable', enabled ? 'ok' : 'empty')
        ])
      ]);
      list.appendChild(card);
    });
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
    // Phase 2A-2.1：approval + scoped chat
    pendingApprovalId: '',
    pendingApprovalExpiresAt: 0,
    pendingApprovalStatus: '',     // pending / approved / rejected / timeout / error
    approvalIntervalId: null,
    runStatus: '',                 // running / done / failed / waiting_approval / '' (idle)
    runText: '',
    redlineReasons: []
  };

  // Phase 2A-2.1：状态文案
  var APPROVAL_STATUS_TEXT = {
    pending:  'Waiting for desktop approval. Redline detected.',
    approved: 'Approved. Agent execution is not enabled in Phase 2A-2.1.',
    rejected: 'Rejected by desktop.',
    timeout:  'Approval timed out.',
    error:    'Send failed.'
  };
  var RUN_STATUS_TEXT = {
    running:           'Agent is running...',
    done:              'Done.',
    failed:            'Failed.',
    waiting_approval:  'This request requires desktop approval.'
  };

  // 把"当前 Agent Tab 是否被实际切换过"记下来，避免 user 选完 root 后重复拉
  var agentLoadedOnce = false;

  async function renderAgent() {
    paintAgentSwitcher();
    paintAgentStatus();
    paintAgentCwd();
    paintAgentMessages();
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

  // 用户在 Files 页面点"查看此文件夹 Sessions"
  async function onFilesViewSessions() {
    var root = $('#files-root') ? $('#files-root').value : (filesState.root || '');
    if (!root) return;
    var qEl = $('#sessions-q');
    if (qEl) qEl.value = '';
    showTab('sessions');
    // 触发一次刷新
    await renderSessions();
  }

  // 用户在 Agent 页面点"选择文件夹" —— 简化：直接复用 Files 的 root select（暂不实现 picker）
  function onAgentPickCwd() {
    // 切到 Files 页面，让用户在那里选 root
    showTab('files');
  }

  // ---------------- Phase 2A-2.1：Send (redline-aware) ----------------
  // 普通消息 → stub runner → done
  // 红线消息 → approval → waiting_approval → 轮询 approved / rejected / timeout

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
    if (agentState.pendingApprovalId && agentState.pendingApprovalStatus === 'pending') {
      flashInputError(input, '已有 pending 审批，请等待结果');
      return;
    }
    if (agentState.runStatus === 'running') {
      flashInputError(input, 'Agent 正在运行，请等待完成');
      return;
    }
    btn.disabled = true;
    var oldText = btn.textContent;
    btn.textContent = '发送中…';
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
      // 2) POST /messages（后端自动 redline 检测）
      var r = await apiPost('/api/mobile/sessions/' + encodeURIComponent(sessionId) + '/messages', {
        text: text,
        cwd: agentState.cwd,
        agentId: agentState.agentId,
        contextFiles: []
      });
      if (!r || !r.ok) throw new Error((r && r.error) || 'send_failed');
      // 清空 input
      input.value = '';
      // 3) 根据后端响应分支
      if (r.requiresApproval === true) {
        // 红线 → waiting_approval
        agentState.pendingApprovalId = r.approvalId;
        agentState.pendingApprovalExpiresAt = r.expiresAt || 0;
        agentState.pendingApprovalStatus = 'pending';
        agentState.runStatus = 'waiting_approval';
        agentState.redlineReasons = Array.isArray(r.redlineReasons) ? r.redlineReasons : [];
        paintApprovalBar();
        startApprovalPolling();
      } else {
        // 普通消息 → 立即 done / failed（stub 是同步）
        agentState.pendingApprovalId = '';
        agentState.pendingApprovalStatus = '';
        agentState.runStatus = (r.status === 'failed') ? 'failed' : 'done';
        agentState.runText = '';
        paintApprovalBar();
        // 普通消息成功后立即拉一次 events 拿到 agent bubble
        try { await refreshEvents(); } catch (_) {}
      }
    } catch (e) {
      agentState.pendingApprovalStatus = 'error';
      agentState.runStatus = 'failed';
      paintApprovalBar('error: ' + (e && e.message || e));
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
      updateSendButtonState();
    }
  }

  async function refreshEvents() {
    if (!agentState.sessionId) return;
    try {
      var r = await apiGet('/api/mobile/sessions/' + encodeURIComponent(agentState.sessionId) + '/events?limit=20');
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
    var hasPending = agentState.pendingApprovalId && agentState.pendingApprovalStatus === 'pending';
    var ok = !!agentState.cwd && !!agentState.agentId && text.length > 0 && text.length <= 4000 && !hasPending;
    btn.disabled = !ok;
  }

  function paintApprovalBar(errMsg) {
    var bar = $('#agent-approval-bar');
    var text = $('#agent-approval-text');
    var meta = $('#agent-approval-meta');
    var icon = $('#agent-approval-icon');
    if (!bar || !text) return;
    if (errMsg) {
      agentState.pendingApprovalStatus = 'error';
    }
    var status = agentState.pendingApprovalStatus;
    if (!status) { bar.hidden = true; return; }
    bar.hidden = false;
    // 清除旧 class
    bar.className = 'approval-bar is-' + status;
    if (icon) {
      icon.className = 'approval-icon approval-icon-' + status;
    }
    text.textContent = errMsg || APPROVAL_STATUS_TEXT[status] || status;
    if (meta) {
      var bits = [];
      if (agentState.pendingApprovalId) bits.push('id ' + agentState.pendingApprovalId);
      if (status === 'pending' && agentState.pendingApprovalExpiresAt) {
        var remain = Math.max(0, agentState.pendingApprovalExpiresAt - Date.now());
        bits.push('剩 ' + Math.ceil(remain / 1000) + 's');
      }
      meta.textContent = bits.join(' · ');
    }
  }

  function startApprovalPolling() {
    stopApprovalPolling();
    agentState.approvalIntervalId = setInterval(pollApprovalStatus, 2000);
    // 立刻跑一次
    setTimeout(pollApprovalStatus, 50);
  }

  function stopApprovalPolling() {
    if (agentState.approvalIntervalId) {
      clearInterval(agentState.approvalIntervalId);
      agentState.approvalIntervalId = null;
    }
  }

  async function pollApprovalStatus() {
    if (!agentState.pendingApprovalId) { stopApprovalPolling(); return; }
    try {
      var r = await api('/api/mobile/approvals/' + encodeURIComponent(agentState.pendingApprovalId));
      if (!r || !r.ok || !r.approval) {
        stopApprovalPolling();
        return;
      }
      var a = r.approval;
      if (a.status && a.status !== agentState.pendingApprovalStatus) {
        agentState.pendingApprovalStatus = a.status;
        if (a.expiresAt) agentState.pendingApprovalExpiresAt = a.expiresAt;
        paintApprovalBar();
        // 终止态：停止轮询 + 清空 pendingApprovalId
        if (a.status === 'approved' || a.status === 'rejected' || a.status === 'timeout' || a.status === 'cancelled') {
          stopApprovalPolling();
          // approved / rejected 后清掉，让用户可以继续提交
          // timeout 保留 1.5s 再清掉，让用户看清文案
          if (a.status === 'timeout') {
            setTimeout(function () {
              if (agentState.pendingApprovalStatus === 'timeout') {
                agentState.pendingApprovalId = '';
                agentState.pendingApprovalStatus = '';
                paintApprovalBar();
                updateSendButtonState();
              }
            }, 4000);
          } else {
            setTimeout(function () {
              if (agentState.pendingApprovalStatus === a.status) {
                agentState.pendingApprovalId = '';
                agentState.pendingApprovalStatus = '';
                paintApprovalBar();
                updateSendButtonState();
              }
            }, 2000);
          }
        }
      } else {
        // pending：只刷新倒计时
        paintApprovalBar();
      }
    } catch (e) {
      // 401 等：让 api() 自己处理；这里静默
    }
  }

  // ---------------- Phase 2A-1：Sessions Tab ----------------
  var sessionsState = { items: [], source: '', agent: '', q: '', loaded: false };

  async function renderSessions() {
    var list = $('#sessions-list');
    if (list) {
      clearChildren(list);
      list.appendChild(el('div', { class: 'skeleton', style: 'height: 84px; margin-bottom: 8px;' }));
      list.appendChild(el('div', { class: 'skeleton', style: 'height: 84px; margin-bottom: 8px;' }));
    }
    sessionsState.source = ($('#sessions-source') && $('#sessions-source').value) || '';
    sessionsState.agent  = ($('#sessions-agent')  && $('#sessions-agent').value)  || '';
    sessionsState.q      = ($('#sessions-q')      && $('#sessions-q').value)      || '';
    var qs = [];
    if (sessionsState.source) qs.push('source=' + encodeURIComponent(sessionsState.source));
    if (sessionsState.agent)  qs.push('agentId=' + encodeURIComponent(sessionsState.agent));
    if (sessionsState.q)      qs.push('q=' + encodeURIComponent(sessionsState.q));
    qs.push('limit=50');
    try {
      var j = await api('/api/mobile/sessions?' + qs.join('&'));
      sessionsState.items = pickList(j);
      sessionsState.loaded = true;
      paintSessions();
    } catch (e) {
      sessionsState.items = [];
      sessionsState.loaded = true;
      paintSessions(String(e && e.message || e));
    }
  }

  function paintSessions(errMsg) {
    var list = $('#sessions-list');
    if (!list) return;
    clearChildren(list);
    if (errMsg) {
      list.appendChild(emptyBlock('加载失败', errMsg));
      return;
    }
    if (!sessionsState.items.length) {
      list.appendChild(emptyBlock('No sessions', 'desktop / mobile / wechat 三类来源暂无数据'));
      return;
    }
    sessionsState.items.forEach(function (s) {
      list.appendChild(buildSessionCard(s));
    });
  }

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
    // Phase 2A-1：Files → Agent / Sessions
    var filesOpenAgent = document.getElementById('files-open-agent');
    if (filesOpenAgent) filesOpenAgent.addEventListener('click', onFilesOpenAgent);
    var filesViewSessions = document.getElementById('files-view-sessions');
    if (filesViewSessions) filesViewSessions.addEventListener('click', onFilesViewSessions);
    // Phase 2A-1：Agent tab
    var agentPickCwd = document.getElementById('agent-pick-cwd');
    if (agentPickCwd) agentPickCwd.addEventListener('click', onAgentPickCwd);
    // Phase 2A-2.1：Agent → Request approval
    var agentInput = document.getElementById('agent-input');
    if (agentInput) {
      agentInput.addEventListener('input', updateSendButtonState);
    }
    var agentSend = document.getElementById('agent-send');
    if (agentSend) {
      agentSend.addEventListener('click', onSendMessage);
    }
    // Phase 2A-1：Sessions filters
    var sessionsSource = document.getElementById('sessions-source');
    if (sessionsSource) sessionsSource.addEventListener('change', renderSessions);
    var sessionsAgent = document.getElementById('sessions-agent');
    if (sessionsAgent) sessionsAgent.addEventListener('change', renderSessions);
    var sessionsQ = document.getElementById('sessions-q');
    if (sessionsQ) {
      var st = null;
      sessionsQ.addEventListener('input', function () {
        if (st) clearTimeout(st);
        st = setTimeout(renderSessions, 300);
      });
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
      paintSessions: paintSessions,
      buildSessionCard: buildSessionCard,
      onFilesOpenAgent: onFilesOpenAgent,
      onFilesViewSessions: onFilesViewSessions,
      onPickSession: onPickSession,
      onPickAgent: onPickAgent,
      // 状态
      skillsState: skillsState,
      filesState: filesState,
      agentState: agentState,
      sessionsState: sessionsState,
      AGENT_FALLBACK: AGENT_FALLBACK,
      AGENT_CHIPS: AGENT_CHIPS,
      POST_ALLOWLIST: POST_ALLOWLIST,
      // API（mock 时可换）
      api: api,
      apiPost: apiPost
    };
  }
})();
