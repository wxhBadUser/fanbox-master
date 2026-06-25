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

console.log('[1] 搜索框放回 sidebar（R1B 修正）');
assert('#cmdk-trigger 在 sidebar 内', isInside('cmdk-trigger', 'aside', 'sidebar'), '不在 sidebar');
assert('#cmdk-trigger 不在 topbar 内', !isInside('cmdk-trigger', 'header', 'topbar'), '仍在 topbar');
// 搜索框在 brand 之后、agentProjects 之前
const brandPos = HTML.indexOf('class="brand"');
const cmdkPos = posOf('cmdk-trigger');
const agentProjPos = HTML.indexOf('data-sidebar-section="agentProjects"');
assert('#cmdk-trigger 在 brand 之后', cmdkPos > brandPos && brandPos !== -1, '不在 brand 之后');
assert('#cmdk-trigger 在 agentProjects 之前', cmdkPos < agentProjPos && agentProjPos !== -1, '不在 agentProjects 之前');

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

console.log('\n[8] topbar 恢复单行（R1B：搜索已回 sidebar）');
assert('topbar 不含 .topbar-search-row', HTML.indexOf('topbar-search-row') === -1, '仍有 topbar-search-row');
assert('#breadcrumb 仍在 topbar 内', isInside('breadcrumb', 'header', 'topbar') || isInside('breadcrumb', 'nav', 'topbar'), 'breadcrumb 不在 topbar');
assert('.nav-buttons 仍在 topbar 内', HTML.indexOf('nav-buttons') !== -1 && posOf('topbar') < HTML.indexOf('nav-buttons'), 'nav-buttons 不在 topbar');
assert('.topbar-actions 仍在 topbar 内', HTML.indexOf('topbar-actions') !== -1 && posOf('topbar') < HTML.indexOf('topbar-actions'), 'topbar-actions 不在 topbar');
// topbar 不再纵向堆叠搜索行（恢复单行 flex）
const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
assert('style.css topbar 不再 flex-direction: column', !/#topbar\s*\{[^}]*flex-direction:\s*column/.test(CSS), 'topbar 仍纵向堆叠');

console.log('\n[9] 左侧项目 session 展开（R1C：所有项目可展开 + 单行紧凑 + 无 agent 文字）');
assert('agentProjects 仍在 sidebar', order.includes('agentProjects'), 'agentProjects 丢失');
assert('app.js 含 project session 容器', APP.indexOf('project-session-list') !== -1 || APP.indexOf('data-project-sessions') !== -1, '无 session 容器');
assert('app.js 含「更多记忆」入口', APP.indexOf('更多记忆') !== -1, '无更多记忆');
assert('app.js 含续上入口', APP.indexOf('续上') !== -1, '无续上');
assert('app.js 复用 /api/project-memory', APP.indexOf('/api/project-memory') !== -1, '未复用 project-memory');
assert('app.js 含 claude --resume 续上命令', /claude[^]*--resume/.test(APP), '无 claude resume');
assert('app.js 含 codex resume 续上命令', /codex\s+resume/.test(APP), '无 codex resume');
assert('app.js session 默认显示 5 条', /slice\(\s*0\s*,\s*5\s*\)/.test(APP) || APP.indexOf('PROJECT_SESS_PAGE') !== -1, '无 5 条限制');
assert('app.js 默认展开当前项目', APP.indexOf('expandDefaultProject') !== -1 || APP.indexOf('defaultExpand') !== -1 || /autoExpand|expandCurrent/.test(APP), '无默认展开逻辑');
assert('app.js 更多记忆打开 memoryPanel', /更多记忆[^]*memoryPanel|memoryPanel[^]*更多记忆/.test(APP.replace(/\s+/g, ' ')) || APP.indexOf('memoryPanel') !== -1, '更多记忆未复用 memoryPanel');
// R1C 新增：所有项目可展开（toggle 绑定到每个项目，不只默认项目）
assert('app.js 每个项目绑定 toggle（forEach 内 toggleProjectSessions）', /forEach\([^)]*\)[^]*toggleProjectSessions/.test(APP.replace(/\s+/g, ' ')), '未对每个项目绑定 toggle');
assert('app.js 项目行点击也能展开（不只箭头）', /li\.onclick|addEventListener\(['"]click/.test(APP) && APP.indexOf('toggleProjectSessions') !== -1, '项目行点击未触发展开');
// R1C 新增：session 单行紧凑（不再有 sess-meta 第二行 / 不再写 agent 文字）
assert('app.js session 不再渲染 sess-agent 文字', APP.indexOf('sess-agent') === -1, '仍渲染 agent 文字第二行');
assert('app.js session 单行结构（sess-row 或 sess-title+sess-time 同级）', APP.indexOf('sess-row') !== -1 || /sess-title[^]*sess-time/.test(APP.replace(/\s+/g, ' ')), '非单行结构');
assert('app.js session 仍含时间', APP.indexOf('sess-time') !== -1, '无时间');
assert('app.js session 仍含续上按钮', APP.indexOf('sess-resume') !== -1, '无续上按钮');
assert('app.js session 仍含图标', APP.indexOf('sess-icon') !== -1, '无图标');

console.log('\n[11] R2 工作台布局增强');
// A. SKILLS 透视标题前有图标
const skillsSec = HTML.indexOf('data-sidebar-section="skills"');
assert('SKILLS 透视 section 有 section-title-icon 或 svg', skillsSec !== -1 && /section-title-icon|<svg/.test(HTML.slice(skillsSec, skillsSec + 400)), 'SKILLS 无图标');
// B. session 用量：app.js 含 tokens 格式化 + session 行显示 tokens
assert('app.js 含 tokens 格式化函数', APP.indexOf('formatTokens') !== -1 || APP.indexOf('fmtTok') !== -1, '无 tokens 格式化');
assert('app.js session 行支持 tokens 显示', APP.indexOf('sess-tokens') !== -1 || APP.indexOf('sess-usage') !== -1, 'session 无 tokens 显示');
assert('server.js parseClaudeSession 返回 tokens 字段', fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').indexOf('tokens') !== -1, 'server 无 tokens 字段');
// C. AGENT 用量含总用量
assert('app.js AGENT 用量含总用量文案', APP.indexOf('总量') !== -1 || APP.indexOf('total') !== -1, '无总用量');
// D. 文件区隐藏/展开
assert('index.html 含文件区隐藏按钮', HTML.indexOf('file-pane-toggle') !== -1 || HTML.indexOf('toggle-file-pane') !== -1 || HTML.indexOf('btn-filepane') !== -1, '无文件区隐藏按钮');
assert('app.js 含 file-pane localStorage key', /localStorage.*(file.?pane|fm.?collapse|file.?hidden)/i.test(APP) || APP.indexOf('fb_file_pane') !== -1, '无 file-pane localStorage');
// E. 终端网格布局
assert('app.js 含终端布局模式', APP.indexOf('term-grid') !== -1 || APP.indexOf('terminal-layout') !== -1 || APP.indexOf('grid-') !== -1, '无终端布局模式');
assert('app.js 最多 4 个终端限制仍存在', /sessions\.length\s*>=\s*4/.test(APP), '无 4 终端限制');

console.log('\n[10] Settings 回归保护');
assert('settings-panel 仍存在', posOf('settings-panel') !== -1, 'settings-panel 丢失');
assert('#theme-switch 在 settings-panel 内', isInside('theme-switch', 'div', 'settings-panel'), '皮肤未进 settings');
assert('#toggle-hidden 在 settings-panel 内', isInside('toggle-hidden', 'input', 'settings-panel') || isInside('toggle-hidden', 'div', 'settings-panel'), '隐藏文件未进 settings');
assert('#sort-seg 在 settings-panel 内', isInside('sort-seg', 'div', 'settings-panel'), '排序未进 settings');
assert('#view-seg 在 settings-panel 内', isInside('view-seg', 'div', 'settings-panel'), '视图未进 settings');

console.log('\n=== PASS: ' + PASS + ' / FAIL: ' + FAIL + ' ===');
process.exit(FAIL === 0 ? 0 : 1);
