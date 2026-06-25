/**
 * verify-desktop-layout.js — TDD 验证桌面端信息架构重组
 *
 * 解析 public/index.html，断言：
 *  - 搜索框从 sidebar 移到 topbar
 *  - sidebar 主菜单顺序：Agent项目 / 收藏 / Skills / 用量 / Mobile
 *  - sidebar 不再含 快速入口 / 皮肤
 *  - 新增 #settings-btn 在 sidebar 底部
 *  - 新增 #settings-panel 含 皮肤 / 隐藏文件 / 排序 / 视图 / 快捷入口
 *  - app.js 绑定 settings-btn ↔ settings-panel
 *
 * 用法：node scripts/verify-desktop-layout.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

// 找某 id 在文件中的位置（id="X" 首次出现）
function posOf(id) {
  const m = HTML.match(new RegExp('id="' + id + '"'));
  return m ? m.index : -1;
}
// 找带 id 的容器内容范围 [start,end)：收集所有开/闭事件后按位置走深度
function rangeOf(tag, id) {
  const openRe = new RegExp('<' + tag + '\\b[^>]*id="' + id + '"', 'i');
  const om = HTML.match(openRe);
  if (!om) return null;
  const start = om.index;
  const events = [];
  const tagOpen = new RegExp('<' + tag + '\\b', 'gi'); tagOpen.lastIndex = start;
  const tagClose = new RegExp('</' + tag + '>', 'gi'); tagClose.lastIndex = start;
  let m;
  while ((m = tagOpen.exec(HTML)) !== null) { events.push([m.index, 1]); if (m[0].length === 0) tagOpen.lastIndex++; }
  while ((m = tagClose.exec(HTML)) !== null) { events.push([m.index, -1]); if (m[0].length === 0) tagClose.lastIndex++; }
  events.sort((a, b) => a[0] - b[0] || b[1] - a[1]); // 同位置开在前
  let depth = 0;
  for (const [pos, type] of events) {
    if (type === 1) depth++;
    else { depth--; if (depth === 0) return [start, pos + ('</' + tag + '>').length]; }
  }
  return null;
}
function isInside(id, tag, containerId) {
  const p = posOf(id); if (p === -1) return false;
  const r = rangeOf(tag, containerId); if (!r) return false;
  return p > r[0] && p < r[1];
}
// 找带 class 的容器内容范围 [start,end)：按 tag 深度走
function rangeOfClass(tag, className) {
  const openRe = new RegExp('<' + tag + '\\b[^>]*class="[^"]*\\b' + className + '\\b[^"]*"', 'i');
  const om = HTML.match(openRe);
  if (!om) return null;
  const start = om.index;
  const events = [];
  const tagOpen = new RegExp('<' + tag + '\\b', 'gi'); tagOpen.lastIndex = start;
  const tagClose = new RegExp('</' + tag + '>', 'gi'); tagClose.lastIndex = start;
  let m;
  while ((m = tagOpen.exec(HTML)) !== null) { events.push([m.index, 1]); if (m[0].length === 0) tagOpen.lastIndex++; }
  while ((m = tagClose.exec(HTML)) !== null) { events.push([m.index, -1]); if (m[0].length === 0) tagClose.lastIndex++; }
  events.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let depth = 0;
  for (const [pos, type] of events) {
    if (type === 1) depth++;
    else { depth--; if (depth === 0) return [start, pos + ('</' + tag + '>').length]; }
  }
  return null;
}
function isInsideClass(id, tag, className) {
  const p = posOf(id); if (p === -1) return false;
  const r = rangeOfClass(tag, className); if (!r) return false;
  return p > r[0] && p < r[1];
}

let PASS = 0, FAIL = 0;
function assert(name, cond, detail) {
  if (cond) { PASS++; console.log('  PASS  ' + name); }
  else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}

console.log('--- 桌面布局重组 TDD ---\n');

console.log('[1] 搜索框迁移到 topbar');
assert('#cmdk-trigger 不在 sidebar 内', !isInside('cmdk-trigger', 'aside', 'sidebar'), '仍在 sidebar');
assert('#cmdk-trigger 在 topbar 内', isInside('cmdk-trigger', 'header', 'topbar'), '不在 topbar');

console.log('\n[2] sidebar 主菜单顺序');
// sidebar 内 data-sidebar-section 出现顺序
const sbRange = rangeOf('aside', 'sidebar');
const sbText = sbRange ? HTML.slice(sbRange[0], sbRange[1]) : '';
const order = [];
const re = /data-sidebar-section="([^"]+)"/g; let m;
while ((m = re.exec(sbText)) !== null) order.push(m[1]);
const want = ['agentProjects', 'favorites', 'skills', 'usage', 'mobile'];
assert('sidebar 含 agentProjects', order.includes('agentProjects'), order.join(','));
assert('sidebar 含 favorites', order.includes('favorites'));
assert('sidebar 含 skills', order.includes('skills'));
assert('sidebar 含 usage', order.includes('usage'));
assert('sidebar 含 mobile', order.includes('mobile'));
assert('sidebar 不含 quick', !order.includes('quick'), '仍含 quick');
assert('sidebar 不含 skins', !order.includes('skins'), '仍含 skins');
// 顺序检查
const gotOrder = want.filter(x => order.includes(x));
assert('主菜单顺序 = Agent项目/收藏/Skills/用量/Mobile', JSON.stringify(gotOrder) === JSON.stringify(want), JSON.stringify(gotOrder));

console.log('\n[3] Settings 入口与面板');
assert('#settings-btn 存在', posOf('settings-btn') !== -1, '无 settings-btn');
assert('#settings-btn 在 sidebar 内', isInside('settings-btn', 'aside', 'sidebar'), '不在 sidebar');
assert('#settings-panel 存在', posOf('settings-panel') !== -1, '无 settings-panel');

console.log('\n[4] 控件迁入 settings-panel');
assert('#theme-switch 在 settings-panel 内', isInside('theme-switch', 'div', 'settings-panel'), '皮肤未进 settings');
assert('#toggle-hidden 在 settings-panel 内', isInside('toggle-hidden', 'input', 'settings-panel') || isInside('toggle-hidden', 'div', 'settings-panel'), '隐藏文件未进 settings');
assert('#sort-seg 在 settings-panel 内', isInside('sort-seg', 'div', 'settings-panel'), '排序未进 settings');
assert('#view-seg 在 settings-panel 内', isInside('view-seg', 'div', 'settings-panel'), '视图未进 settings');
assert('#roots-list 在 settings-panel 内', isInside('roots-list', 'ul', 'settings-panel') || isInside('roots-list', 'div', 'settings-panel'), '快捷入口未进 settings');

console.log('\n[5] topbar 控件收纳');
assert('#toggle-hidden 不在 topbar', !isInside('toggle-hidden', 'header', 'topbar'), '仍在 topbar');
assert('#sort-seg 不在 topbar', !isInside('sort-seg', 'header', 'topbar'), '仍在 topbar');
assert('#view-seg 不在 topbar', !isInside('view-seg', 'header', 'topbar'), '仍在 topbar');

console.log('\n[6] app.js 绑定 settings-btn');
assert('app.js 引用 settings-btn', APP.indexOf('settings-btn') !== -1, '未引用 settings-btn');
assert('app.js 引用 settings-panel', APP.indexOf('settings-panel') !== -1, '未引用 settings-panel');
assert('app.js 绑定 toggle 逻辑', /settings-btn[^]*settings-panel|settings-panel[^]*settings-btn/.test(APP.replace(/\s+/g, ' ')), '未绑定开关');

console.log('\n[7] 终端未受影响（回归保护）');
assert('#terminal-panel 仍存在', posOf('terminal-panel') !== -1);
assert('#terminal-session-switcher 仍存在', posOf('terminal-session-switcher') !== -1);
assert('TERMINAL_TYPOGRAPHY 未删', APP.indexOf('TERMINAL_TYPOGRAPHY') !== -1);
assert('themes.soft 未删', APP.indexOf('soft: {') !== -1);

console.log('\n[8] topbar 双行布局（搜索框 + 路径）');
assert('topbar 含 .topbar-search-row', HTML.indexOf('topbar-search-row') !== -1, '无 topbar-search-row');
assert('topbar 含 .topbar-path-row', HTML.indexOf('topbar-path-row') !== -1, '无 topbar-path-row');
assert('#cmdk-trigger 在 topbar-search-row 内', isInsideClass('cmdk-trigger', 'div', 'topbar-search-row'), '不在 search-row');
assert('#breadcrumb 在 topbar-path-row 内', isInsideClass('breadcrumb', 'div', 'topbar-path-row'), '不在 path-row');
assert('.nav-buttons 在 topbar-path-row 内', rangeOfClass('div', 'topbar-path-row') && HTML.indexOf('nav-buttons') > rangeOfClass('div', 'topbar-path-row')[0], 'nav-buttons 不在 path-row');
assert('.topbar-actions 在 topbar-path-row 内', rangeOfClass('div', 'topbar-path-row') && HTML.indexOf('topbar-actions') > rangeOfClass('div', 'topbar-path-row')[0], 'topbar-actions 不在 path-row');
// 搜索框在路径行之前
assert('search-row 在 path-row 之前', HTML.indexOf('topbar-search-row') !== -1 && HTML.indexOf('topbar-path-row') !== -1 && HTML.indexOf('topbar-search-row') < HTML.indexOf('topbar-path-row'), '顺序错');
// style.css 让 topbar 纵向堆叠
const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
assert('style.css topbar 纵向布局', /#topbar\s*\{[^}]*flex-direction:\s*column/.test(CSS), 'topbar 未纵向堆叠');

console.log('\n[9] 左侧项目 session 展开容器');
assert('agentProjects 仍在 sidebar', order.includes('agentProjects'), 'agentProjects 丢失');
assert('app.js 含 project session 容器', APP.indexOf('project-session-list') !== -1 || APP.indexOf('data-project-sessions') !== -1, '无 session 容器');
assert('app.js 含查看更多入口', APP.indexOf('查看更多') !== -1, '无查看更多');
assert('app.js 含续上入口', APP.indexOf('续上') !== -1, '无续上');
assert('app.js 复用 /api/project-memory', APP.indexOf('/api/project-memory') !== -1, '未复用 project-memory');
assert('app.js 含 claude --resume 续上命令', /claude[^]*--resume/.test(APP), '无 claude resume');
assert('app.js 含 codex resume 续上命令', /codex\s+resume/.test(APP), '无 codex resume');
assert('app.js session 默认显示 5 条', /slice\(\s*0\s*,\s*5\s*\)/.test(APP) || APP.indexOf('PROJECT_SESS_PAGE') !== -1 || APP.indexOf('sessLimit') !== -1, '无 5 条限制');

console.log('\n[10] Settings 回归保护');
assert('settings-panel 仍存在', posOf('settings-panel') !== -1, 'settings-panel 丢失');
assert('#theme-switch 在 settings-panel 内', isInside('theme-switch', 'div', 'settings-panel'), '皮肤未进 settings');
assert('#toggle-hidden 在 settings-panel 内', isInside('toggle-hidden', 'input', 'settings-panel') || isInside('toggle-hidden', 'div', 'settings-panel'), '隐藏文件未进 settings');
assert('#sort-seg 在 settings-panel 内', isInside('sort-seg', 'div', 'settings-panel'), '排序未进 settings');
assert('#view-seg 在 settings-panel 内', isInside('view-seg', 'div', 'settings-panel'), '视图未进 settings');

console.log('\n=== PASS: ' + PASS + ' / FAIL: ' + FAIL + ' ===');
process.exit(FAIL === 0 ? 0 : 1);
