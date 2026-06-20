/* ============================================================
   FanBox Mobile · Mobile Console
   Phase 1 · 5 Tab · 只读 · LAN + Token
   ============================================================ */
(function () {
  'use strict';

  // ---------------- Token 存储 ----------------
  var TOKEN_KEY = 'fanbox.mobile.token';

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t || ''); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  // ---------------- API 包装（强制 GET + Bearer） ----------------
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

  // ---------------- 工具 ----------------
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
    if (kids) for (var i = 0; i < kids.length; i++) if (kids[i]) n.appendChild(kids[i]);
    return n;
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

  // ---------------- Icons（inline SVG） ----------------
  var ICONS = {
    home:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5L12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>',
    files:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
    skills: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
    agents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9z"/><path d="M3 9h2M3 15h2M19 9h2M19 15h2M9 3v2M15 3v2M9 19v2M15 19v2"/></svg>',
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
    var renderers = { home: renderHome, files: renderFiles, skills: renderSkills, agents: renderAgents, usage: renderUsage };
    if (renderers[name]) {
      try { renderers[name](); } catch (e) { console.error('render', name, e); }
    }
  }

  // ---------------- Home ----------------
  async function renderHome() {
    var rootsBox = $('#home-roots');
    try {
      var r = await api('/api/mobile/roots');
      rootsBox.innerHTML = '';
      if (!r.roots || !r.roots.length) {
        rootsBox.appendChild(emptyBlock('No roots available', 'allowedRoots 列表为空'));
        return;
      }
      r.roots.forEach(function (x) {
        var row = el('div', { class: 'root-row' }, [
          el('div', { class: 'root-name', text: x.name || 'root' }),
          el('div', { class: 'root-path', text: relPath(x.path), title: x.path || '' })
        ]);
        rootsBox.appendChild(row);
      });
    } catch (e) {
      rootsBox.innerHTML = '';
      rootsBox.appendChild(emptyBlock('Failed to load roots', String(e && e.message || e)));
    }
  }

  // ---------------- Files ----------------
  var filesState = { root: '', q: '', lastResults: [], lastPicked: null, aborter: null };

  async function loadRoots() {
    var sel = $('#files-root');
    if (!sel) return;
    if (sel.options.length > 0) return;
    sel.innerHTML = '<option>Loading…</option>';
    try {
      var r = await api('/api/mobile/roots');
      sel.innerHTML = '';
      (r.roots || []).forEach(function (x) {
        var o = el('option', { value: x.path, text: x.name || x.path });
        sel.appendChild(o);
      });
      if ((r.roots || []).length) {
        sel.value = r.roots[0].path;
        filesState.root = r.roots[0].path;
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
      list.innerHTML = '';
      list.appendChild(emptyBlock('输入关键字开始搜索', 'Root + 关键字 = 模糊文件名匹配'));
      meta.textContent = '';
      return;
    }
    if (filesState.aborter) try { filesState.aborter.abort(); } catch (e) {}
    filesState.aborter = new AbortController();
    meta.textContent = '搜索中…';
    list.innerHTML = '';
    var sk = el('div', { class: 'skeleton', style: 'height: 56px; margin-bottom: 8px;' });
    list.appendChild(sk);
    try {
      var url = '/api/mobile/search?q=' + encodeURIComponent(q) + '&path=' + encodeURIComponent(root) + '&limit=50';
      var t = getToken();
      var r = await fetch(url, { method: 'GET', headers: { 'Authorization': 'Bearer ' + t, 'Accept': 'application/json' }, signal: filesState.aborter.signal });
      var j = null; try { j = await r.json(); } catch (e) { j = { ok: false }; }
      list.innerHTML = '';
      if (!j.ok) throw new Error(j.error || ('http_' + r.status));
      filesState.lastResults = j.items || [];
      meta.textContent = (j.items || []).length + ' results' + (j.truncated ? ' (truncated)' : '');
      if (!j.items.length) {
        list.appendChild(emptyBlock('No files found', '没有匹配的文件名'));
        return;
      }
      j.items.forEach(function (it) {
        var row = el('button', { class: 'file-row', type: 'button' }, [
          el('div', { class: 'file-name', text: it.name }),
          el('div', { class: 'file-path', text: relPath(it.path), title: it.path || '' }),
          el('div', { class: 'file-meta' }, [
            el('span', { class: 'pill' + (it.kind && it.kind !== 'text' ? '' : ' pill-blue'), text: it.kind || 'file' }),
            el('span', { text: fmtSize(it.size) }),
            el('span', { text: fmtTime(it.mtime) })
          ])
        ]);
        row.addEventListener('click', function () { pickFile(it); });
        list.appendChild(row);
      });
    } catch (e) {
      if (String(e && e.name) === 'AbortError') return;
      list.innerHTML = '';
      list.appendChild(emptyBlock('Search failed', String(e && e.message || e)));
      meta.textContent = '';
    }
  }

  async function pickFile(it) {
    filesState.lastPicked = it;
    var box = $('#files-preview');
    var nameEl = $('#files-preview-name');
    var metaEl = $('#files-preview-meta');
    var body = $('#files-preview-body');
    nameEl.textContent = it.name;
    metaEl.textContent = relPath(it.path) + ' · ' + fmtSize(it.size) + ' · ' + fmtTime(it.mtime);
    body.innerHTML = '';
    body.appendChild(el('div', { class: 'skeleton', style: 'height: 16px; width: 60%;' }));
    box.hidden = false;
    try {
      var j = await api('/api/mobile/file?path=' + encodeURIComponent(it.path) + '&max=262144');
      renderFilePreview(j, body);
    } catch (e) {
      body.innerHTML = '';
      body.appendChild(emptyBlock('Preview failed', String(e && e.message || e)));
    }
    try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }

  function renderFilePreview(j, body) {
    body.innerHTML = '';
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
      var img = el('img', { class: 'preview-thumb', src: j.thumbUrl, alt: j.name || 'image' });
      body.appendChild(img);
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
    if (!filesState.lastResults.length) {
      runSearch();
    }
  }

  // ---------------- Skills ----------------
  var skillsState = { items: [], q: '' };

  async function renderSkills() {
    var list = $('#skills-list');
    list.innerHTML = '';
    list.appendChild(el('div', { class: 'skeleton', style: 'height: 64px; margin-bottom: 10px;' }));
    try {
      var j = await api('/api/mobile/skills');
      skillsState.items = j.items || [];
      paintSkills();
    } catch (e) {
      list.innerHTML = '';
      list.appendChild(emptyBlock('No skills available', String(e && e.message || e)));
    }
  }

  function paintSkills() {
    var list = $('#skills-list');
    var q = ($('#skills-q').value || '').trim().toLowerCase();
    var items = skillsState.items.filter(function (x) { return !q || (x.name || '').toLowerCase().indexOf(q) >= 0; });
    list.innerHTML = '';
    if (!items.length) {
      list.appendChild(emptyBlock('No skills available', skillsState.items.length ? '没有匹配名称的 skill' : '~/.claude/skills 暂为空'));
      return;
    }
    items.forEach(function (s) {
      var card = el('div', { class: 'skill-card' }, [
        el('div', { class: 'skill-head' }, [
          el('div', { class: 'skill-name', text: s.name || '(unnamed)' }),
          el('span', { class: 'pill pill-blue', text: s.source || '?' })
        ]),
        el('p', { class: 'skill-desc', text: s.description || 'No description' }),
        el('div', { class: 'skill-foot' }, [
          el('span', { text: s.enabled ? 'enabled' : 'disabled' }),
          el('span', { class: s.enabled ? 'usage-pill' : 'usage-pill usage-pill-empty' }, [
            el('span', { class: 'status-dot ' + (s.enabled ? 'status-dot-ok' : 'status-dot-empty') }),
            s.enabled ? 'available' : 'unavailable'
          ])
        ])
      ]);
      list.appendChild(card);
    });
  }

  // ---------------- Agents ----------------
  var AGENT_ICONS = {
    claude: '◆', codex: '◇', opencode: '⬡', qoder: '◈'
  };

  async function renderAgents() {
    var list = $('#agents-list');
    list.innerHTML = '';
    for (var i = 0; i < 4; i++) list.appendChild(el('div', { class: 'skeleton', style: 'height: 84px;' }));
    try {
      var j = await api('/api/mobile/agents');
      list.innerHTML = '';
      (j.items || []).forEach(function (a) {
        var status = a.installed
          ? el('span', { class: 'usage-pill' }, [el('span', { class: 'status-dot status-dot-ok' }), 'detected'])
          : el('span', { class: 'usage-pill usage-pill-empty' }, [el('span', { class: 'status-dot status-dot-empty' }), 'not found']);
        var card = el('div', { class: 'agent-card' }, [
          el('div', { class: 'agent-head' }, [
            el('div', { class: 'agent-name', text: a.label || a.id || 'agent' }),
            status
          ]),
          el('div', { class: 'agent-cmd', text: 'command: ' + (a.command || a.id || '?') }),
          a.hint ? el('div', { class: 'agent-hint', text: a.hint }) : null
        ]);
        list.appendChild(card);
      });
      if (!(j.items || []).length) {
        list.appendChild(emptyBlock('No agent detected', '无 agent 信息'));
      }
    } catch (e) {
      list.innerHTML = '';
      list.appendChild(emptyBlock('No agent detected', String(e && e.message || e)));
    }
  }

  // ---------------- Usage ----------------
  async function renderUsage() {
    var todayEl = $('#usage-today');
    var weekEl = $('#usage-week');
    var list = $('#usage-list');
    todayEl.textContent = '—';
    weekEl.textContent = '—';
    list.innerHTML = '<div class="skeleton" style="height: 44px;"></div><div class="skeleton" style="height: 44px; margin-top: 8px;"></div>';
    try {
      var j = await api('/api/mobile/usage');
      todayEl.textContent = fmtTokens(j.summary && j.summary.todayTokens);
      weekEl.textContent = fmtTokens(j.summary && j.summary.weekTokens);
      list.innerHTML = '';
      (j.agents || []).forEach(function (a) {
        var pill = a.available
          ? el('span', { class: 'usage-pill' }, [el('span', { class: 'status-dot status-dot-ok' }), 'available'])
          : el('span', { class: 'usage-pill usage-pill-empty' }, [el('span', { class: 'status-dot status-dot-empty' }), 'no data']);
        var row = el('div', { class: 'usage-row' }, [
          el('div', null, [
            el('div', { class: 'usage-name', text: a.label || a.id }),
            el('div', { class: 'usage-meta', text: 'today ' + fmtTokens(a.todayTokens) + ' · week ' + fmtTokens(a.weekTokens) })
          ]),
          pill
        ]);
        list.appendChild(row);
      });
      if (!(j.agents || []).length) {
        list.appendChild(emptyBlock('No usage data yet', 'Claude/Codex 暂未上报事件'));
      }
    } catch (e) {
      todayEl.textContent = '—';
      weekEl.textContent = '—';
      list.innerHTML = '';
      list.appendChild(emptyBlock('No usage data yet', String(e && e.message || e)));
    }
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
    document.getElementById('pair-screen').hidden = false;
    document.getElementById('app').hidden = true;
    if (msg) {
      var m = document.getElementById('pair-msg');
      m.textContent = msg;
      m.className = 'msg msg-err';
    }
  }
  function showApp() {
    document.getElementById('pair-screen').hidden = true;
    document.getElementById('app').hidden = false;
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
    if (filesRoot) filesRoot.addEventListener('change', function () { if (filesState.q) runSearch(); });
    var filesPreviewClose = document.getElementById('files-preview-close');
    if (filesPreviewClose) filesPreviewClose.addEventListener('click', function () {
      document.getElementById('files-preview').hidden = true;
    });
    // skills filter
    var skillsQ = document.getElementById('skills-q');
    if (skillsQ) skillsQ.addEventListener('input', paintSkills);
    // pair
    var pairBtn = document.getElementById('pair-btn');
    if (pairBtn) pairBtn.addEventListener('click', doPair);
  }

  // ---------------- 启动 ----------------
  function boot() {
    paintIcons();
    bind();
    if (getToken()) {
      // 轻校验：调 roots，能通则进 app
      api('/api/mobile/roots').then(function () { showApp(); }).catch(function () { showPair(); });
    } else {
      showPair();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
