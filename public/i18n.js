'use strict';
/**
 * FanBox i18n —— 集中式翻译层。
 * 词典在 i18n-dict.js（中文原文为键）；中文是源语言，zh 模式下本文件几乎不做事。
 * EN 模式机制：MutationObserver 在微任务时机翻译新增/变更的文本节点和 title/placeholder 属性，
 * 绘制前完成、无闪烁，app.js 不需要散布翻译调用。用户内容区（预览/编辑器/终端）一律不碰。
 */
(() => {
  const saved = localStorage.getItem('fb_lang');
  const sys = (navigator.language || 'en').toLowerCase();
  const lang = saved === 'zh' || saved === 'en' ? saved : (sys.startsWith('zh') ? 'zh' : 'en');
  window.fanboxLang = lang;

  // 语言切换：记到 localStorage（渲染层）+ config.json（Electron 菜单读），刷新生效
  window.fanboxSetLang = (l) => {
    localStorage.setItem('fb_lang', l);
    fetch('/api/lang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: l }) })
      .catch(() => {}).finally(() => location.reload());
  };
  const wireToggle = () => {
    const el = document.getElementById('lang-toggle');
    if (!el) return;
    el.textContent = lang === 'zh' ? 'EN' : '中文';
    el.title = lang === 'zh' ? 'Switch to English' : '切换为中文';
    el.onclick = () => window.fanboxSetLang(lang === 'zh' ? 'en' : 'zh');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireToggle);
  else wireToggle();

  if (lang === 'zh') { window.t = (s) => s; return; }

  const HAN = /[㐀-鿿「」（）：；！？…·]/;
  const dict = () => window.FANBOX_DICT || {};
  const rules = () => window.FANBOX_DICT_RULES || [];
  const trOne = (core) => {
    const hit = dict()[core];
    if (hit !== undefined) return hit;
    for (const [re, rep] of rules()) {
      const m = core.match(re);
      if (m) {
        try { return typeof rep === 'function' ? rep(m) : rep; } catch { /* 规则异常不挡显示 */ }
      }
    }
    return null;
  };
  const tr = (s) => {
    if (!s || !HAN.test(s)) return s;
    const core = s.trim();
    const whole = trOne(core);
    if (whole !== null) return s.replace(core, whole);
    // 复合文案（「刚刚 · 12 条消息 · 改了 16 个文件」）整段匹配不上：按 · 分段逐段翻
    if (core.includes('·')) {
      const segs = core.split('·').map((x) => x.trim()).filter(Boolean);
      const parts = segs.map((x) => trOne(x) ?? x);
      if (parts.some((x, i) => x !== segs[i])) {
        const joined = parts.join(' · ') + (/·\s*$/.test(core) ? ' · ' : '');
        return s.replace(core, joined);
      }
    }
    return s;
  };
  window.t = tr;

  // 用户内容区不翻译：文件预览正文、三种编辑器、终端、灯箱
  const SKIP = '#preview-body, #ed-host, .xterm, .milkdown, .lightbox, .cp-name, .cp-dir';
  const ATTRS = ['title', 'placeholder'];
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const p = node.parentElement;
      if (p && p.closest(SKIP)) return;
      const out = tr(node.nodeValue);
      if (out !== node.nodeValue) node.nodeValue = out;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.closest(SKIP)) return;
    for (const a of ATTRS) {
      const v = node.getAttribute(a);
      if (v) { const out = tr(v); if (out !== v) node.setAttribute(a, out); }
    }
    for (const c of [...node.childNodes]) visit(c);
  };
  const ob = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData' || m.type === 'attributes') visit(m.target.nodeType ? m.target : m.target);
      else m.addedNodes.forEach(visit);
    }
  });
  const start = () => {
    visit(document.body);
    ob.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    document.documentElement.lang = 'en';
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
