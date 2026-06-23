'use strict';
// 检测是否在 Node.js 模式下运行（ELECTRON_RUN_AS_NODE 被设置）
// 如果是，清环境变量后重新 spawn 进程，确保 Electron 以 GUI 模式启动
if (process.env.ELECTRON_RUN_AS_NODE) {
  const execPath = process.execPath;
  const args = process.argv.slice(1);
  delete process.env.ELECTRON_RUN_AS_NODE;
  // 用 execFileSync 启动 Electron GUI 进程
  // 注意：不设置 stdio:'inherit'——Electron.exe 是 GUI 程序（subsystem:windows），
  // 在 Windows 上 inherit stdio 会导致进程行为异常甚至立即退出。
  const { execFileSync } = require('child_process');
  try {
    execFileSync(execPath, args, { env: process.env });
    process.exit(0);
  } catch (e) {
    // 子进程正常处理完业务退出后 execFileSync 也会报 EPIPE/ECONNRESET，
    // 但我们不关心——子进程已成为独立 GUI 进程。
    process.exit(0);
  }
}
/**
 * FanBox — Electron 主进程
 *
 * 复用零依赖后端 server.js（文件能力），叠加 node-pty 内嵌终端，
 * 让 TUI coding agent（Claude Code / Codex / Aider…）在界面里直接跑起来。
 */
const { app, BrowserWindow, ipcMain, shell, nativeImage, Menu, clipboard, dialog, net, session } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { writeJsonAtomicSync, readJsonSafe } = require('./atomic-json');
// Mobile Access（Phase 0A）—— 局域网手机配对 / 独立 HTTP server
const mobile = require('./mobile.js');

// 复用现有后端：require 即 listen 127.0.0.1:PORT，不自动开浏览器
process.env.FANBOX_NO_OPEN = '1';
const PORT = Number(process.env.FANBOX_PORT) || 4567;
require('../server.js');

// node-pty 是原生模块，需 electron-rebuild 编译过；未就绪时终端能力降级但 app 仍可用
let pty = null;
try { pty = require('node-pty'); }
catch (e) { console.error('[fanbox] node-pty 未就绪（跑 npm run rebuild）：', e.message); }

const terminals = new Map();
const termTails = new Map(); // id -> 最近输出尾巴（去 ANSI），给微信 agent 感知别的终端在跑啥/卡哪
const termMeta = new Map();  // id -> { lastActiveAt, createdAt } for B2A desktop continuation read model
let win = null;

// Phase B2A: inject read-only desktop terminal provider into mobile backend.
// mobile.js never touches node-pty directly; it only calls this provider for safe projection.
mobile.setDesktopTerminalProvider(async function desktopTerminalListProvider() {
  const arr = [];
  for (const [id, p] of terminals) {
    const proc = (p && p.process) || '';
    let cwd = '';
    try { cwd = await termCwdByPid(p && p.pid); } catch { cwd = ''; }
    const busy = !!proc && !/^-?(zsh|bash|sh|fish|login)$/i.test(proc);
    const meta = termMeta.get(id) || {};
    arr.push({
      id,
      cwd: cwd || '',
      proc,
      busy,
      tail: termTails.get(id) || '',
      lastActiveAt: meta.lastActiveAt || Date.now()
    });
  }
  return arr;
});

// ---------- 窗口尺寸/位置记忆 ----------
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (b && b.width > 400 && b.height > 300) return b;
  } catch { /* 首次启动无记录 */ }
  return { width: 1320, height: 860 };
}
function saveBounds() {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  try { fs.writeFileSync(stateFile(), JSON.stringify(win.getBounds())); } catch { /* */ }
}

function createWindow() {
  const b = loadBounds();
  const winOpts = {
    width: b.width, height: b.height, x: b.x, y: b.y,
    minWidth: 920, minHeight: 600,
    backgroundColor: '#0b0c0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  // macOS 专属窗口样式：Windows 不传这些属性，避免意外行为
  if (process.platform === 'darwin') {
    winOpts.titleBarStyle = 'hiddenInset';
    winOpts.vibrancy = 'sidebar';
    winOpts.visualEffectState = 'active';
  }
  win = new BrowserWindow(winOpts);
  // 拖动/缩放后防抖记忆，关窗再存一次兜底
  let bt = null;
  const remember = () => { clearTimeout(bt); bt = setTimeout(saveBounds, 400); };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', saveBounds);

  // 等后端起来再加载（首次 listen 有几十毫秒延迟）
  const load = () => win.loadURL(`http://localhost:${PORT}`).catch(() => setTimeout(load, 150));
  setTimeout(load, 250);

  // 外部链接走系统浏览器，不在 app 里开新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  // 开发模式下 macOS 默认显示 Electron 图标——换成翻箱自己的（打包后由 electron-builder 的 icon 接管）
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'))); } catch { /* */ }
  }
  app.setName('FanBox');
  // 后端跑在 localhost，访问它永不该走代理。个别环境（clash 强制系统代理、企业 PAC 把 loopback 也代理）
  // 会把本地请求拦成 502 → 整个界面白屏。给 loopback 显式加旁路；其余（如查更新走 GitHub）仍按系统代理，互不影响。
  session.defaultSession.setProxy({ mode: 'system', proxyBypassRules: 'localhost;127.0.0.1;[::1]' }).catch(() => { /* 设置失败就退回默认行为，不影响启动 */ });
  // 合盖继续运行：恢复上次的开关意图；启动时把残留的禁休眠清掉（防上次崩溃没恢复），有终端跑起来再按需重新生效
  lidIntent = !!readConfig().lidStayAwake;
  wechatStayAwake = !!readConfig().wechatStayAwake;
  if (process.platform === 'darwin') trySetDisableSleep(false);
  buildMenu();
  try {
    const m = Menu.getApplicationMenu();
    const view = m && m.items.find((i) => i.label === M('视图', 'View'));
    console.log('[lid] 视图 子菜单 =', view ? JSON.stringify(view.submenu.items.map((x) => x.label || `<${x.type}>`)) : '没找到视图菜单');
  } catch (e) { console.log('[lid] dump menu 出错:', e.message); }
  createWindow();
  // 临时调试：dev 实例强制抢到最前，避免和正式版搞混
  setTimeout(() => { try { app.focus({ steal: true }); if (win && !win.isDestroyed()) { win.show(); win.focus(); win.setAlwaysOnTop(true); setTimeout(() => win.setAlwaysOnTop(false), 1500); } } catch { /* */ } }, 1200);
  startShotWatch();
  // 启动 6 秒后查一次新版本（不挡启动）；长开会话每 2 小时再查；
  // 窗口重新聚焦也顺手查（30 分钟节流）——否则发版当天老 app 要等满周期才知道有新版
  setTimeout(checkUpdate, 6000);
  setInterval(checkUpdate, 2 * 3600 * 1000);
  app.on('browser-window-focus', () => {
    if (Date.now() - lastAutoCheck > 30 * 60 * 1000) checkUpdate();
  });
});

// ---------- 截图直通车：监听系统截屏落盘，新截图推给渲染层浮出直通卡 ----------
function screenshotDir() {
  try {
    const out = require('child_process').execSync('defaults read com.apple.screencapture location 2>/dev/null', { encoding: 'utf8' }).trim();
    if (out) return out.startsWith('~') ? path.join(os.homedir(), out.slice(1)) : out;
  } catch { /* 未自定义 → 默认桌面 */ }
  return path.join(os.homedir(), 'Desktop');
}
let shotWatcher = null;
const shotSent = new Map(); // path -> t，fs.watch 同一文件会连发多个事件，3s 内去重
function startShotWatch() {
  if (process.platform !== 'darwin' || shotWatcher) return;
  const dir = screenshotDir();
  if (!fs.existsSync(dir)) return;
  try {
    shotWatcher = fs.watch(dir, { persistent: false }, (evt, filename) => {
      const name = filename ? filename.toString() : '';
      // 截屏写盘有「.截屏xxx.png」点前缀的中间态，跳过；只认系统截屏的命名习惯
      if (!/^(截屏|截圖|截图|Screenshot|Screen Shot|CleanShot|SCR-)/i.test(name) || !/\.(png|jpe?g)$/i.test(name)) return;
      const fp = path.join(dir, name);
      // 等写盘「真正完成」再通知：Retina 全屏截图有几 MB，固定等 600ms 可能文件还在写，
      // 缩略图会拿到半截文件生成失败→裂图。改成轮询直到大小连续两次不变（最多 ~3s）。
      const waitStable = (tries, lastSize) => {
        fs.stat(fp, (err, st) => {
          if (err || !st.isFile()) return;
          if (st.size >= 1000 && st.size === lastSize) { // 大小稳定 = 写完
            const last = shotSent.get(fp) || 0;
            if (Date.now() - last < 3000) return;
            shotSent.set(fp, Date.now());
            if (shotSent.size > 50) { const k = shotSent.keys().next().value; shotSent.delete(k); }
            if (win && !win.isDestroyed()) win.webContents.send('shot:new', { path: fp, name, size: st.size });
            return;
          }
          if (tries > 0) setTimeout(() => waitStable(tries - 1, st.size), 250); // 还在涨，再等
        });
      };
      setTimeout(() => waitStable(12, -1), 350);
    });
  } catch { /* 无权限等，静默放弃 */ }
}

// ---------- 更新检测：查 GitHub Releases，有新版本通知渲染层引导下载 ----------
// 现阶段只做「检测 + 引导」：Apple Development 签名过不了 Squirrel.Mac 的校验，
// electron-updater 全自动更新要等升级 Developer ID 后再换
function cmpVer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}
const REL_PAGE = 'https://github.com/wxhBadUser/fanbox-master/releases/latest';
async function fetchLatestRelease() {
  // 先走 API（信息全）；代理共享出口 IP 很容易吃 GitHub API 的未认证限流（60 次/小时/IP，403），
  // 失败就退回抓 releases/latest 网页重定向——重定向后的 URL 自带 tag，且不占 API 配额
  try {
    const res = await net.fetch('https://api.github.com/repos/wxhBadUser/fanbox-master/releases/latest', {
      headers: { 'User-Agent': 'fanbox-app', Accept: 'application/vnd.github+json' },
    });
    if (res.ok) {
      const rel = await res.json();
      if (rel.tag_name) return { tag: rel.tag_name, url: rel.html_url || REL_PAGE };
    }
  } catch { /* 走兜底 */ }
  const res = await net.fetch(REL_PAGE, { headers: { 'User-Agent': 'fanbox-app' } });
  const m = String(res.url || '').match(/\/releases\/tag\/([^/?#]+)/);
  if (m) return { tag: decodeURIComponent(m[1]), url: res.url };
  return null;
}
let pendingUpdate = null; // 渲染层晚注册监听也能拉到（启动 6 秒的推送 vs init 加载大目录，谁先谁后说不准）
let updRetry = 0;
let lastAutoCheck = 0;
async function checkUpdate(opts) {
  const manual = !!(opts && opts.manual);
  if (!manual) lastAutoCheck = Date.now();
  let info = null;
  try { info = await fetchLatestRelease(); } catch { info = null; }
  if (!info) {
    if (manual) {
      dialog.showMessageBoxSync(win && !win.isDestroyed() ? win : undefined, {
        type: 'warning', buttons: [M('好', 'OK')], message: M('检查更新失败', 'Update check failed'),
        detail: M('没连上 GitHub（网络问题或接口限流），稍后再试。', 'Could not reach GitHub (network issue or rate limit). Try again later.'),
      });
    } else if (updRetry < 3) { updRetry++; setTimeout(checkUpdate, 10 * 60 * 1000); } // 失败别干等 12 小时
    return;
  }
  updRetry = 0;
  const newer = cmpVer(info.tag, app.getVersion()) > 0;
  if (newer) {
    pendingUpdate = { version: info.tag.replace(/^v/, ''), url: info.url };
    if (win && !win.isDestroyed()) win.webContents.send('update:available', pendingUpdate);
  }
  if (manual) {
    const owner = win && !win.isDestroyed() ? win : undefined;
    if (newer) {
      const c = dialog.showMessageBoxSync(owner, {
        type: 'info', buttons: [M('去下载', 'Download'), M('取消', 'Cancel')], defaultId: 0, cancelId: 1,
        message: M(`发现新版本 v${pendingUpdate.version}`, `New version v${pendingUpdate.version} available`),
        detail: M(`当前版本 v${app.getVersion()}。点「去下载」打开发布页，下载后替换 /Applications 里的旧版即可。`, `You are on v${app.getVersion()}. "Download" opens the release page; replace the old app in /Applications.`),
      });
      if (c === 0) shell.openExternal(pendingUpdate.url);
    } else {
      dialog.showMessageBoxSync(owner, {
        type: 'info', buttons: [M('好', 'OK')], message: M('已是最新版本', 'You are up to date'),
        detail: M(`当前版本 v${app.getVersion()} 就是最新发布版。`, `v${app.getVersion()} is the latest release.`),
      });
    }
  }
}
ipcMain.handle('update:open', (e, { url }) => { if (/^https:\/\/github\.com\//.test(String(url))) shell.openExternal(url); });
ipcMain.handle('update:get', () => pendingUpdate);

// 点完成通知把 app 拉到前台（渲染层 window.focus() 唤不醒最小化/被遮挡的窗口）
ipcMain.handle('win:focus', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

// 预览全屏时藏掉左上角红黄绿系统按钮——它和右侧自家关闭图标太像，容易让人误点
ipcMain.handle('win:traffic', (e, { show }) => {
  if (!win || win.isDestroyed() || typeof win.setWindowButtonVisibility !== 'function') return;
  win.setWindowButtonVisibility(!!show);
});

// 界面语言：用户手动选过的存在 ~/.fanbox/config.json（渲染层切换时写入），没选过跟随系统
function uiLang() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.fanbox', 'config.json'), 'utf8'));
    if (c.lang === 'zh' || c.lang === 'en') return c.lang;
  } catch { /* 没配置过 */ }
  return String(app.getLocale() || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
const M = (zh, en) => (uiLang() === 'zh' ? zh : en);

// ---------- 合盖继续运行（禁用合盖休眠）----------
// macOS 的「合盖休眠」是独立机制，caffeinate / powerSaveBlocker 这类 power assertion 都挡不住，
// 唯一手段是 `pmset -a disablesleep 1`（需 root）。为避免智能模式反复弹密码，首次开启时装一条
// 仅限 pmset disablesleep 0/1 的 sudoers 免密规则，之后静默切换。
// 智能模式：只有「开关开 且 有终端在跑」才真正禁休眠；终端全退/退出 app 立即恢复，绝不让 Mac 一直不睡。
const CONFIG = path.join(os.homedir(), '.fanbox', 'config.json');
function readConfig() { return readJsonSafe(CONFIG, {}); }
function writeConfig(patch) {
  try { const c = readConfig(); Object.assign(c, patch); writeJsonAtomicSync(CONFIG, c); }
  catch { /* 写失败不致命，下次再写 */ }
}
let lidIntent = false; // 用户意图（菜单勾选），跨会话持久
let lidActive = false; // 当前是否已对系统下达禁休眠
let wechatStayAwake = false; // 「离开不待机」开关（微信 ClawBot 面板），跨会话持久
let wechatConnected = false; // 微信 ClawBot 当前是否连着（bridge 回调更新）

// 用 sudo -n（非交互）切换；sudoers 没装好就直接失败、绝不在后台弹密码
function trySetDisableSleep(on) {
  if (process.platform !== 'darwin') return false;
  // stdio 全静音：免密规则没装时 `sudo -n` 会往 stderr 喷「a password is required」，无害但会误导
  try { require('child_process').execFileSync('/usr/bin/sudo', ['-n', 'pmset', '-a', 'disablesleep', on ? '1' : '0'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

// 首次开启时弹一次系统管理员框，装仅限本用户、仅限 pmset disablesleep 0/1 的免密规则
function installSudoers() {
  return new Promise((resolve) => {
    const user = (os.userInfo().username || '').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!user) return resolve(false);
    const sh = [
      '#!/bin/sh', 'set -e',
      'f=/etc/sudoers.d/fanbox-pmset',
      "cat > \"$f\" <<'EOF'",
      `${user} ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 0, /usr/bin/pmset -a disablesleep 1`,
      'EOF',
      'chown root:wheel "$f"',
      'chmod 440 "$f"',
      '/usr/sbin/visudo -cf "$f" || { rm -f "$f"; exit 1; }',
      '',
    ].join('\n');
    let tmp;
    try { tmp = path.join(app.getPath('temp'), 'fanbox-sudoers-install.sh'); fs.writeFileSync(tmp, sh, { mode: 0o700 }); }
    catch { return resolve(false); }
    const apple = `do shell script "/bin/sh " & quoted form of "${tmp}" with administrator privileges`;
    console.log('[lid] running osascript admin prompt, tmp =', tmp);
    require('child_process').execFile('/usr/bin/osascript', ['-e', apple], (err, stdout, stderr) => {
      console.log('[lid] osascript done. err =', err && err.message, '| stderr =', stderr);
      try { fs.unlinkSync(tmp); } catch { /* */ }
      resolve(!err); // 用户取消 → err（-128）→ false
    });
  });
}

// 确保 pmset 免密规则就位（探针：设 0 无害；不行就装一次规则）。两个开关共用。
async function ensurePmsetRule() {
  if (process.platform !== 'darwin') return false;
  if (trySetDisableSleep(false)) return true; // 已有免密规则
  return installSudoers();
}

// 按「意图 × 触发条件」结算系统状态，幂等。终端起落、微信连断、开关变化都调它。
//  两条独立诉求 OR 起来：① 合盖继续跑（要有终端在跑）② 离开不待机（微信连着就保持唤醒，断开自动恢复）
function refreshLidGuard() {
  if (process.platform !== 'darwin') return;
  const want = (lidIntent && terminals.size > 0) || (wechatStayAwake && wechatConnected);
  if (want === lidActive) return;
  const ok = trySetDisableSleep(want);
  if (want && !ok) { // 免密规则丢了，两个开关都退回关闭，别让用户以为还护着
    lidIntent = false; wechatStayAwake = false;
    writeConfig({ lidStayAwake: false, wechatStayAwake: false });
    if (win && !win.isDestroyed()) win.webContents.send('wechat:power', { stayAwake: false, active: false });
  }
  lidActive = want && ok;
  buildMenu();
}

// 菜单勾选/取消的入口
async function setLidIntent(on) {
  console.log('[lid] setLidIntent called, on =', on);
  if (process.platform !== 'darwin') return;
  if (on) {
    const choice = dialog.showMessageBoxSync(win && !win.isDestroyed() ? win : undefined, {
      type: 'warning', buttons: [M('开启', 'Enable'), M('取消', 'Cancel')], defaultId: 0, cancelId: 1,
      message: M('合盖后继续运行', 'Keep running with lid closed'),
      detail: M('开启后，只要还有终端会话在跑，合上盖子也不会休眠——agent 任务能接着干。\n\n注意：合盖期间持续耗电发热，建议接电源。终端全部退出或退出翻箱时自动恢复正常休眠。\n\n首次开启需输入一次管理员密码（装一条仅限电源设置的免密规则）。',
        'While any terminal session is running, closing the lid won\'t sleep the Mac — your agent tasks keep going.\n\nNote: it keeps drawing power and heat while closed; stay plugged in. Normal sleep is restored once all terminals exit or you quit FanBox.\n\nFirst time needs your admin password once (installs a power-only passwordless rule).'),
    });
    console.log('[lid] warning dialog choice =', choice, '(0=开启)');
    if (choice !== 0) { buildMenu(); return; } // 取消 → 复位勾选
    // 探针：能否免密 sudo（设 0 无害）。不行就装规则。
    const probe = trySetDisableSleep(false);
    console.log('[lid] sudo probe ok =', probe, '→', probe ? '已有免密规则' : '需安装');
    if (!probe) {
      const installed = await installSudoers();
      console.log('[lid] installSudoers result =', installed);
      if (!installed) { buildMenu(); return; } // 装失败/取消 → 保持关闭
    }
  }
  lidIntent = on;
  writeConfig({ lidStayAwake: on });
  refreshLidGuard();
  buildMenu();
}

// 原生菜单——关键是 Edit role，终端里的 ⌘C/⌘V 才生效
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ label: 'FanBox', submenu: [
      { role: 'about', label: M('关于 FanBox', 'About FanBox') },
      { label: M('检查更新…', 'Check for Updates…'), click: () => checkUpdate({ manual: true }) },
      { type: 'separator' },
      { role: 'hide', label: M('隐藏 FanBox', 'Hide FanBox') }, { role: 'hideOthers', label: M('隐藏其他', 'Hide Others') }, { role: 'unhide', label: M('全部显示', 'Show All') },
      { type: 'separator' },
      { role: 'quit', label: M('退出 FanBox', 'Quit FanBox') },
    ] }] : []),
    { label: M('文件', 'File'), submenu: [
      ...(isMac ? [] : [{ label: M('检查更新…', 'Check for Updates…'), click: () => checkUpdate({ manual: true }) }, { type: 'separator' }]),
      isMac ? { role: 'close' } : { role: 'quit' },
    ] },
    { label: M('编辑', 'Edit'), submenu: [
      { role: 'undo', label: M('撤销', 'Undo') }, { role: 'redo', label: M('重做', 'Redo') }, { type: 'separator' },
      { role: 'cut', label: M('剪切', 'Cut') }, { role: 'copy', label: M('复制', 'Copy') }, { role: 'paste', label: M('粘贴', 'Paste') },
      { role: 'selectAll', label: M('全选', 'Select All') },
    ] },
    { label: M('视图', 'View'), submenu: [
      { role: 'reload', label: M('重新加载', 'Reload') }, { role: 'toggleDevTools', label: M('开发者工具', 'Developer Tools') },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen', label: M('全屏', 'Full Screen') },
      ...(isMac ? [{ type: 'separator' }, {
        // 合盖后继续运行：仅在有终端跑着时真正生效（智能模式）；勾选状态反映用户意图
        label: lidActive ? M('合盖后继续运行（生效中）', 'Keep running with lid closed (active)') : M('合盖后继续运行', 'Keep running with lid closed'),
        type: 'checkbox', checked: lidIntent,
        click: (item) => { setLidIntent(item.checked); },
      }] : []),
    ] },
    { role: 'window', label: M('窗口', 'Window'), submenu: [{ role: 'minimize', label: M('最小化', 'Minimize') }, { role: 'zoom' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
// ⌘Q 兜底：还有终端在跑时（agent 任务），退出前确认，避免手滑全灭
let quitConfirmed = false;
app.on('before-quit', (e) => {
  if (quitConfirmed || terminals.size === 0) return;
  e.preventDefault();
  const choice = dialog.showMessageBoxSync(win && !win.isDestroyed() ? win : undefined, {
    type: 'warning',
    buttons: [M('取消', 'Cancel'), M('退出', 'Quit')],
    defaultId: 0,
    cancelId: 0,
    message: M(`还有 ${terminals.size} 个终端会话在运行`, `${terminals.size} terminal session(s) still running`),
    detail: M('退出会终止正在运行的 agent 任务，确定退出？', 'Quitting will terminate running agent tasks. Quit anyway?'),
  });
  if (choice === 1) { quitConfirmed = true; app.quit(); }
});
app.on('window-all-closed', () => {
  terminals.forEach((p) => { try { p.kill(); } catch { /* */ } });
  terminals.clear();
  if (lidActive) { trySetDisableSleep(false); lidActive = false; } // 终端没了，别让 Mac 一直不睡
  recorders.forEach((r) => { try { r.stream.end(); } catch { /* */ } }); // 收尾刷盘，别丢最后几行
  recorders.clear();
  if (process.platform !== 'darwin') app.quit();
});
// 退出兜底：无论怎么退（⌘Q、崩溃前的正常退出），都恢复系统休眠，绝不留禁休眠的烂摊子
app.on('will-quit', () => { if (process.platform === 'darwin') trySetDisableSleep(false); if (typeof teardownMobile === 'function') teardownMobile(); });

// ---------- 终端录制（黑匣子）：把 PTY 字节流旁路成 asciinema v2 .cast ----------
// 设计铁律：录制器是一根哑管子——只异步旁路字节，全程 try/catch，写失败就静默自废，
// 绝不把异常抛回 PTY 数据通路。所有「聪明」（压缩/变速/导出）都推迟到回放层做。
const recorders = new Map(); // id -> { stream, start, path }
const REC_DIR = () => path.join(app.getPath('userData'), 'recordings');
function recEnabled() { return process.env.FANBOX_NO_RECORD !== '1'; }
// 常开录制不能让磁盘无限涨：保留最近 60 个 / 总量 800MB，超了从最旧删起（正在录的跳过）
function recPrune() {
  try {
    const dir = REC_DIR();
    if (!fs.existsSync(dir)) return;
    const live = new Set([...recorders.values()].map((r) => r.path));
    const files = fs.readdirSync(dir).filter((n) => n.endsWith('.cast'))
      .map((n) => path.join(dir, n)).filter((f) => !live.has(f))
      .map((f) => { try { return { f, st: fs.statSync(f) }; } catch { return null; } }).filter(Boolean)
      .sort((a, b) => a.st.mtimeMs - b.st.mtimeMs); // 旧→新
    const MAX_FILES = 60, MAX_BYTES = 800 * 1024 * 1024;
    let total = files.reduce((s, x) => s + x.st.size, 0), count = files.length;
    for (const x of files) {
      if (count <= MAX_FILES && total <= MAX_BYTES) break;
      try { fs.rmSync(x.f, { force: true }); total -= x.st.size; count--; } catch { /* */ }
    }
  } catch { /* */ }
}
function recStart(id, { cols, rows, cwd, theme }) {
  if (!recEnabled()) return;
  try {
    const dir = REC_DIR();
    fs.mkdirSync(dir, { recursive: true });
    recPrune();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `${stamp}-${id}.cast`);
    const stream = fs.createWriteStream(file, { flags: 'a' });
    stream.on('error', () => { try { recorders.delete(id); } catch { /* */ } }); // 盘满/权限等：自废，不连累终端
    const header = {
      version: 2, width: cols || 80, height: rows || 24,
      timestamp: Math.floor(Date.now() / 1000), env: { TERM: 'xterm-256color' },
      // fanbox 私有元信息：回放/列表用，asciinema 标准解析器会忽略未知字段
      fanbox: { cwd: cwd || '', cols: cols || 80, rows: rows || 24, startedAt: Date.now(), theme: theme || '' },
    };
    stream.write(JSON.stringify(header) + '\n');
    recorders.set(id, { stream, start: Date.now(), path: file });
  } catch { /* 录制失败静默自废 */ }
}
function recEvent(id, code, data) {
  const r = recorders.get(id);
  if (!r) return;
  try { r.stream.write(JSON.stringify([(Date.now() - r.start) / 1000, code, data]) + '\n'); }
  catch { /* */ }
}
function recStop(id) {
  const r = recorders.get(id);
  if (!r) return;
  recorders.delete(id);
  try { r.stream.end(); } catch { /* */ }
}

// ---------- 终端 IPC（node-pty）----------
ipcMain.handle('pty:spawn', (e, { id, cwd, cols, rows, theme }) => {
  if (!pty) return { ok: false, error: 'node-pty 未编译，跑：npm run rebuild' };
  const shellPath = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh');
  const startCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
  // login shell（-l）：GUI 启动的进程只继承精简 PATH，不读 .zprofile/.zlogin，
  // 用户在那里配的 Homebrew/nvm/npm 全局路径（claude 等）就丢了 → 「普通终端能找到、fanbox 找不到」。
  // 走 login shell 把这些路径带进来。Windows 的 powershell 无此机制，保持空参数。
  const shellArgs = process.platform === 'win32' ? [] : ['-l'];
  // GUI 启动的 app 不继承 shell 的 locale，zsh 会把中文路径按字节转义成 \M-^@ 乱码 → 兜底 UTF-8
  const env = { ...process.env, TERM: 'xterm-256color', FANBOX: '1' };
  if (!/UTF-8/i.test(env.LC_ALL || env.LC_CTYPE || env.LANG || '')) env.LANG = 'zh_CN.UTF-8';
  let p;
  try {
    p = pty.spawn(shellPath, shellArgs, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: startCwd,
      env,
    });
  } catch (err) { return { ok: false, error: err.message }; }
  terminals.set(id, p);
  termMeta.set(id, { createdAt: Date.now(), lastActiveAt: Date.now() });
  refreshLidGuard(); // 开关开着时，第一个终端起来即生效
  recStart(id, { cols, rows, cwd: startCwd, theme });
  p.onData((data) => {
    if (win && !win.isDestroyed()) win.webContents.send('pty:data', { id, data });
    recEvent(id, 'o', data);
    const tail = ((termTails.get(id) || '') + data.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b[()][AB0]|\r/g, '')).slice(-4000);
    termTails.set(id, tail); // 留最后 ~4KB，给微信 agent 看「最近输出」
    const meta = termMeta.get(id);
    if (meta) { meta.lastActiveAt = Date.now(); }
  });
  p.onExit(({ exitCode }) => {
    terminals.delete(id);
    termTails.delete(id);
    termMeta.delete(id);
    refreshLidGuard(); // 最后一个终端退出即恢复休眠
    recStop(id);
    if (win && !win.isDestroyed()) win.webContents.send('pty:exit', { id, exitCode });
  });
  return { ok: true, cwd: startCwd };
});
// ---------- Agent CLI 探测：OpenCode / Qoder 等第三方终端 agent 的 which ----------
// 只探测 PATH 里有没有这个命令，不安装、不读 token、不读配置文件、不登录。
// candidates 是按优先级排好的命令名数组（Qoder 可能是 qoder / qodercli / qoder-cli）。
// 命中第一条就返回该命令名（不是绝对路径——保持「原命令启动」语义），未命中返回 null。
ipcMain.handle('agent:which', (e, { candidates }) => {
  try {
    const list = Array.isArray(candidates) ? candidates.filter((x) => typeof x === 'string' && /^[A-Za-z0-9._+-]{1,64}$/.test(x)) : [];
    if (!list.length) return { ok: true, found: null };
    const isWin = process.platform === 'win32';
    const { execFile } = require('child_process');
    return new Promise((resolve) => {
      // Windows: where <bin1> <bin2> ...（多条候选一次性问）
      // POSIX:   command -v <bin1> <bin2> ... || true（不会失败退出）
      const cmd = isWin ? 'where' : 'command';
      const args = isWin ? list : ['-v'].concat(list).concat(['||', 'true']); // POSIX 不会真用 || true，但保留 escape
      // POSIX 的 || 不能跨 execFile args，传 shell:false 时 command -v 多参数会报「too many arguments」，
      // 改用单候选循环 + which 风格：每个候选单独问。
      const probeOne = (bin) => new Promise((res) => {
        const oneArgs = isWin ? [bin] : ['-v', bin];
        execFile(cmd, oneArgs, { timeout: 4000, windowsHide: true, shell: false }, (err, stdout) => {
          if (err) return res(null);
          const first = String(stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null;
          // where 在 Windows 可能输出「INFO: Could not find files for the given pattern(s).」之类提示，过滤掉
          if (!first || /^(INFO|WARN):/i.test(first)) return res(null);
          res(first);
        });
      });
      (async () => {
        for (const bin of list) {
          // eslint-disable-next-line no-await-in-loop
          const hit = await probeOne(bin);
          if (hit) return resolve({ ok: true, found: bin, resolved: hit });
        }
        resolve({ ok: true, found: null });
      })().catch(() => resolve({ ok: true, found: null }));
    });
  } catch (err) {
    return { ok: false, error: err.message, found: null };
  }
});
// ---------- 剪贴板：复制图片本体 / 复制文件（访达可粘贴）----------
ipcMain.handle('clip:image', (e, { path: p }) => {
  try { const img = nativeImage.createFromPath(p); if (img.isEmpty()) return { ok: false, error: '不是可读图片' }; clipboard.writeImage(img); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('clip:file', async (e, args) => {
  // 兼容 { path } 和 { paths } 两种参数格式，避免旧调用点 regress
  const raw = (args && args.paths) || (args && args.path) || [];
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  // 安全校验
  if (!list.length) return { ok: false, error: '路径为空' };
  for (const p of list) {
    if (typeof p !== 'string' || !p.trim()) return { ok: false, error: '无效路径' };
    if (p === '__fanbox_roots__') return { ok: false, error: '不支持复制虚拟节点' };
    try { if (!fs.existsSync(p)) return { ok: false, error: `文件不存在` }; } catch { return { ok: false, error: `路径无效` }; }
  }
  if (list.length > 20) return { ok: false, error: '最多同时复制 20 个文件' };

  if (process.platform === 'win32') {
    // 用 PowerShell + .NET Windows.Forms SetFileDropList 把文件本体写入 Windows 剪贴板，
    // 资源管理器/桌面/微信聊天等可 Ctrl+V 粘贴。
    // 路径以 JSON 数组编码进环境变量 FB_CLIP_PATHS，避免 shell 注入；
    // PowerShell 必须 -STA（Single-Threaded Apartment）才能操作剪贴板。
    const psCode = [
      'try {',
      '  Add-Type -AssemblyName System.Windows.Forms;',
      '  $json = [Environment]::GetEnvironmentVariable("FB_CLIP_PATHS","Process");',
      '  $paths = $json | ConvertFrom-Json;',
      '  $sc = New-Object System.Collections.Specialized.StringCollection;',
      '  foreach ($p in $paths) { $sc.Add($p) | Out-Null };',
      '  [System.Windows.Forms.Clipboard]::SetFileDropList($sc);',
      '} catch { exit 2 }',
    ].join(' ');
    const { execFile } = require('child_process');
    const run = () => new Promise((resolve) =>
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-STA', '-Command', psCode], {
        env: { ...process.env, FB_CLIP_PATHS: JSON.stringify(list) },
        windowsHide: true,
        timeout: 8000,
      }, (err) => resolve(err))
    );
    let err = await run();
    if (err) { await new Promise((r) => setTimeout(r, 250)); err = await run(); } // 剪贴板被占用则重试一次
    return { ok: !err, count: list.length, error: err ? '剪贴板被其它程序占用，请重试' : undefined };
  }

  // macOS：用 osascript 写入 Finder 可粘贴的文件引用（仅支持单文件）
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    const p = list[0];
    execFile('osascript', ['-e', 'on run argv', '-e', 'set the clipboard to (POSIX file (item 1 of argv))', '-e', 'end run', p], (err) => resolve({ ok: !err, count: err ? 0 : 1, error: err && err.message }));
  });
});
// ---------- 删除到回收站（shell.trashItem，非永久删除）----------
ipcMain.handle('fs:trash', async (e, { path: p }) => {
  // 安全校验
  if (!p || typeof p !== 'string' || !p.trim()) return { ok: false, error: '路径为空' };
  if (p === '__fanbox_roots__') return { ok: false, error: '不支持删除虚拟节点' };
  // 阻止盘符根目录（C:\ D:\ 等）
  if (/^[A-Za-z]:\\?$/.test(p)) return { ok: false, error: '不支持删除磁盘根目录' };
  // 阻止项目根目录
  try {
    const projRoot = path.resolve(__dirname, '..');
    if (path.resolve(p) === projRoot) return { ok: false, error: '不支持删除项目根目录' };
  } catch { /* */ }
  // 路径必须存在
  try { if (!fs.existsSync(p)) return { ok: false, error: '文件不存在' }; } catch { return { ok: false, error: '路径无效' }; }

  // 优先使用 Electron shell.trashItem（Electron 20+，当前 33.x）
  if (shell.trashItem) {
    try {
      await shell.trashItem(p);
      return { ok: true };
    } catch (err) {
      // shell.trashItem 失败时 fallback 到 PowerShell（仅 Windows）
      if (process.platform !== 'win32') {
        return { ok: false, error: err.message || String(err) };
      }
      // Windows fallback：继续走下面的 PowerShell 方案
    }
  }
  // Fallback：Windows PowerShell + Microsoft.VisualBasic
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      let isDir = false;
      try { isDir = fs.lstatSync(p).isDirectory(); } catch { return resolve({ ok: false, error: '文件不存在' }); }
      const method = isDir ? 'DeleteDirectory' : 'DeleteFile';
      const ps = p.replace(/'/g, "''");
      const cmd = `powershell -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${method}('${ps}','OnlyErrorDialogs','SendToRecycleBin')"`;
      require('child_process').exec(cmd, { windowsHide: true, timeout: 15000 }, (err) => {
        if (!err) return resolve({ ok: true });
        resolve({ ok: false, error: err.message || String(err) });
      });
    });
  }
  // 非 Windows 且 shell.trashItem 不可用
  return { ok: false, error: '当前平台不支持删除到回收站' };
});
// ---------- 剪贴板截图导入（微信 Alt+A 等存入 ~/.fanbox/screenshots）----------
const FANBOX_SHOTS_DIR = path.join(os.homedir(), '.fanbox', 'screenshots');
ipcMain.handle('clip:save-image', async () => {
  try {
    const img = clipboard.readImage();
    if (img.isEmpty()) return { ok: false, reason: 'empty' };
    const buf = img.toPNG();
    if (!buf || !buf.length) return { ok: false, reason: 'empty' };
    // 用内容 hash 去重
    const hash = crypto.createHash('md5').update(buf).digest('hex');
    const ts = new Date().toISOString().replace(/[T:.]/g, '').slice(0, 15); // 20260619-153012
    const name = `clipboard-${ts}-${hash.slice(0, 8)}.png`;
    const dir = FANBOX_SHOTS_DIR;
    const fsp = fs.promises;
    await fsp.mkdir(dir, { recursive: true });
    // 检查 hash 是否已被存过（去重）
    let existingNames;
    try { existingNames = await fsp.readdir(dir); } catch { existingNames = []; }
    for (const f of existingNames) {
      if (f.includes(hash.slice(0, 8))) {
        const existingPath = path.join(dir, f);
        let st; try { st = await fsp.stat(existingPath); } catch { continue; }
        return { ok: true, path: existingPath, name: f, deduped: true };
      }
    }
    const dest = path.join(dir, name);
    await fsp.writeFile(dest, buf);
    return { ok: true, path: dest, name, deduped: false };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ---------- 终端粘贴：保存长文本到项目目录 ----------
ipcMain.handle('clip:save-paste-text', (e, { dir, name, content }) => {
  try {
    const homeDir = os.homedir();
    let absDir;
    if (dir && typeof dir === 'string' && dir.length > 0) {
      absDir = path.resolve(dir);
    } else {
      absDir = path.join(homeDir, '.fanbox', 'paste');
    }
    if (!absDir.startsWith(homeDir)) absDir = path.join(homeDir, '.fanbox', 'paste');
    const pasteDir = path.join(absDir, '.fanbox-paste');
    fs.mkdirSync(pasteDir, { recursive: true });
    const safeName = String(name || 'clipboard.md').replace(/[/\\:]/g, '-');
    const dest = path.join(pasteDir, safeName);
    fs.writeFileSync(dest, content, 'utf8');
    const gitignore = path.join(absDir, '.gitignore');
    let gi = '';
    try { gi = fs.readFileSync(gitignore, 'utf8'); } catch { /* */ }
    if (!gi.includes('.fanbox-paste')) {
      fs.appendFileSync(gitignore, (gi && !gi.endsWith('\n') ? '\n' : '') + '.fanbox-paste/\n', 'utf8');
    }
    return { ok: true, path: dest, relative: '.fanbox-paste/' + safeName };
  } catch (err) { return { ok: false, error: err.message }; }
});

// 拖拽落盘：file-promise 类拖入（截图浮窗等）没有真实路径，把字节写进临时目录换路径
ipcMain.handle('drop:save', (e, { name, buf }) => {
  try {
    const dir = path.join(app.getPath('temp'), 'fanbox-drops');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(name || '拖入文件.png').replace(/[/\\:]/g, '_');
    let dest = path.join(dir, safe);
    if (fs.existsSync(dest)) dest = path.join(dir, `${Date.now()}-${safe}`);
    fs.writeFileSync(dest, Buffer.from(buf));
    return { ok: true, path: dest };
  } catch (err) { return { ok: false, error: err.message }; }
});
// 同名不覆盖：foo.png 已存在就退而求其次 foo 2.png（仿访达）
function uniqueDest(dest) {
  if (!fs.existsSync(dest)) return dest;
  const d = path.dirname(dest), ext = path.extname(dest), base = path.basename(dest, ext);
  for (let i = 2; i < 1000; i++) { const c = path.join(d, `${base} ${i}${ext}`); if (!fs.existsSync(c)) return c; }
  return path.join(d, `${Date.now()}-${base}${ext}`);
}
// 拖进文件区：把没路径的拖入内容（截图浮窗等）写进目标目录
ipcMain.handle('drop:save-into', (e, { dir, name, buf }) => {
  try {
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { ok: false, error: '目标目录无效' };
    const safe = String(name || '拖入文件').replace(/[/\\:]/g, '_');
    const dest = uniqueDest(path.join(dir, safe));
    fs.writeFileSync(dest, Buffer.from(buf));
    return { ok: true, path: dest };
  } catch (err) { return { ok: false, error: err.message }; }
});
// 拖进文件区：把已有路径的文件（Finder 文件）复制进目标目录
ipcMain.handle('drop:copy-into', (e, { srcPath, dir }) => {
  try {
    if (!srcPath || !fs.existsSync(srcPath)) return { ok: false, error: '源文件不存在' };
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { ok: false, error: '目标目录无效' };
    const dest = uniqueDest(path.join(dir, path.basename(srcPath)));
    if (path.resolve(srcPath) === path.resolve(dest)) return { ok: true, path: dest }; // 原地拖入，无需复制
    fs.copyFileSync(srcPath, dest);
    return { ok: true, path: dest };
  } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.on('pty:input', (e, { id, data }) => {
  const p = terminals.get(id);
  if (p) {
    p.write(data);
    recEvent(id, 'i', data);
    const meta = termMeta.get(id);
    if (meta) { meta.lastActiveAt = Date.now(); }
  }
});
ipcMain.on('pty:resize', (e, { id, cols, rows }) => { const p = terminals.get(id); if (p) { try { p.resize(cols, rows); } catch { /* */ } recEvent(id, 'r', `${cols}x${rows}`); } });
ipcMain.on('pty:kill', (e, { id }) => {
  const p = terminals.get(id);
  if (p) { try { p.kill(); } catch { /* */ } }
  terminals.delete(id);
  termTails.delete(id);
  termMeta.delete(id);
  refreshLidGuard();
  recStop(id);
});

// ---------- 录制文件管理 IPC ----------
// 列表：读每个 .cast 的头行拿元信息 + 文件大小/时长（末事件时间），按新→旧。失败的文件跳过不报错。
ipcMain.handle('rec:list', () => {
  try {
    const dir = REC_DIR();
    if (!fs.existsSync(dir)) return { ok: true, items: [] };
    const live = new Set([...recorders.values()].map((r) => r.path));
    const items = [];
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.cast')) continue;
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        // 「打开但没干活」的空终端会留下几百字节的壳（提示符+括号粘贴开关），是噪音：
        // 非正在录且体量过小的直接不进列表，省得满屏空录像
        if (st.size < 700 && !live.has(full)) continue;
        const head = readFirstLine(full);
        const meta = head ? JSON.parse(head) : {};
        items.push({
          name, path: full, size: st.size, mtime: st.mtimeMs,
          width: meta.width || 80, height: meta.height || 24,
          cwd: (meta.fanbox && meta.fanbox.cwd) || '',
          startedAt: (meta.fanbox && meta.fanbox.startedAt) || (meta.timestamp ? meta.timestamp * 1000 : st.birthtimeMs),
          duration: readLastEventTime(full, st.size), // 原始时长（末事件时间），列表里给用户选片参考
          recording: live.has(full), // 还在录的会话
        });
      } catch { /* 损坏的文件跳过 */ }
    }
    items.sort((a, b) => b.startedAt - a.startedAt);
    return { ok: true, items };
  } catch (err) { return { ok: false, error: err.message, items: [] }; }
});
ipcMain.handle('rec:read', (e, { path: p }) => {
  try {
    if (!isInRecDir(p)) return { ok: false, error: '非录制目录' };
    return { ok: true, text: fs.readFileSync(p, 'utf8') };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('rec:delete', (e, { path: p }) => {
  try {
    if (!isInRecDir(p)) return { ok: false, error: '非录制目录' };
    fs.rmSync(p, { force: true });
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('rec:reveal', (e, { path: p }) => {
  try { shell.showItemInFolder(isInRecDir(p) ? p : REC_DIR()); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
});
// 把导出好的视频/GIF 字节落进录制目录旁，返回真实路径供「在访达显示」
ipcMain.handle('rec:save-export', (e, { name, buf }) => {
  try {
    const dir = path.join(REC_DIR(), 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(name || 'export.webm').replace(/[/\\:]/g, '_');
    const dest = uniqueDest(path.join(dir, safe));
    fs.writeFileSync(dest, Buffer.from(buf));
    return { ok: true, path: dest };
  } catch (err) { return { ok: false, error: err.message }; }
});
// 导出：渲染层录出的永远是 WebM；要 MP4/GIF 就用本机 ffmpeg 转一道（检测不到 ffmpeg 优雅退回 WebM）。
function findFfmpeg() {
  for (const c of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) { try { if (fs.existsSync(c)) return c; } catch { /* */ } }
  return null;
}
ipcMain.handle('rec:export', async (e, { name, buf, format }) => {
  const { execFile } = require('child_process');
  const crypto = require('crypto');
  try {
    const dir = path.join(REC_DIR(), 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const base = String(name || 'export').replace(/[/\\:]/g, '_').replace(/\.[a-z0-9]+$/i, '').slice(0, 120);
    const tmp = path.join(dir, '.tmp-' + process.pid + '-' + crypto.randomBytes(3).toString('hex') + '.webm');
    fs.writeFileSync(tmp, Buffer.from(buf));
    const saveWebm = (reason) => { const d = uniqueDest(path.join(dir, base + '.webm')); fs.renameSync(tmp, d); return { ok: true, path: d, format: 'webm', fellBack: reason || null }; };
    if (format === 'webm') return saveWebm();
    const ff = findFfmpeg();
    if (!ff) return saveWebm('未检测到 ffmpeg，已存 WebM');
    const run = (args) => new Promise((res, rej) => execFile(ff, args, { timeout: 180000 }, (err, so, se) => (err ? rej(new Error((se || err.message || '').slice(0, 300))) : res())));
    try {
      if (format === 'mp4') {
        const dest = uniqueDest(path.join(dir, base + '.mp4'));
        // 偶数宽高（yuv420p 要求）+ faststart（边下边播）
        await run(['-y', '-i', tmp, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dest]);
        fs.rmSync(tmp, { force: true });
        return { ok: true, path: dest, format: 'mp4' };
      }
      if (format === 'gif') {
        const dest = uniqueDest(path.join(dir, base + '.gif'));
        const pal = tmp + '.png';
        // 两遍调色板，GIF 才不糊不抖；宽度封到 900，15fps，体积友好
        await run(['-y', '-i', tmp, '-vf', 'fps=15,scale=900:-1:flags=lanczos,palettegen=stats_mode=diff', pal]);
        await run(['-y', '-i', tmp, '-i', pal, '-lavfi', 'fps=15,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3', dest]);
        fs.rmSync(tmp, { force: true }); fs.rmSync(pal, { force: true });
        return { ok: true, path: dest, format: 'gif' };
      }
    } catch (convErr) { try { return saveWebm('转码失败（' + convErr.message + '），已存 WebM'); } catch { /* */ } }
    return saveWebm();
  } catch (err) { return { ok: false, error: err.message }; }
});
function isInRecDir(p) {
  try { const r = path.resolve(REC_DIR()); return p && path.resolve(p).startsWith(r + path.sep); }
  catch { return false; }
}
// 只读文件头一行（.cast 头），不把整个大文件读进内存
function readFirstLine(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const s = buf.slice(0, n).toString('utf8');
    const nl = s.indexOf('\n');
    return nl >= 0 ? s.slice(0, nl) : s;
  } finally { fs.closeSync(fd); }
}
// 读文件尾，取最后一条事件的时间戳 = 原始时长（不把大文件整读进内存）
function readLastEventTime(file, size) {
  try {
    const len = Math.min(4096, size);
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, Math.max(0, size - len));
      const lines = buf.toString('utf8').split('\n').map((l) => l.trim()).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try { const v = JSON.parse(lines[i]); if (Array.isArray(v) && typeof v[0] === 'number') return v[0]; } catch { /* 末行可能被截断，往前找 */ }
      }
    } finally { fs.closeSync(fd); }
  } catch { /* */ }
  return 0;
}

// lsof 在非 UTF-8 locale 下会把中文路径按字节转义成 \xe8 字面量（GUI 启动的 app 不继承 shell 的 locale，
// 正中这个坑：标签标题乱码、双击定位失效）。调 lsof 时显式给 UTF-8 locale，这里再留一层 \xNN 解码兜底
function decodeLsofPath(s) {
  if (!/\\x[0-9a-fA-F]{2}/.test(s)) return s;
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === 'x' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 2, i + 4))) {
      bytes.push(parseInt(s.slice(i + 2, i + 4), 16));
      i += 3;
    } else {
      for (const b of Buffer.from(s[i], 'utf8')) bytes.push(b);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}
// 取某终端 shell 的真实当前目录（用 lsof 查 pty 子进程的 cwd）
function termCwdByPid(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve('');
    require('child_process').exec(`lsof -a -p ${pid} -d cwd -Fn`, { env: { ...process.env, LC_ALL: 'en_US.UTF-8' }, timeout: 3000 }, (err, stdout) => {
      if (err) return resolve('');
      const line = (stdout || '').split('\n').find((l) => l.startsWith('n'));
      resolve(line ? decodeLsofPath(line.slice(1)) : '');
    });
  });
}
// 取某终端 shell 的真实当前目录，实现「定位到终端目录」
ipcMain.handle('pty:cwd', async (e, { id }) => {
  const p = terminals.get(id);
  if (!p || !p.pid) return { ok: false };
  const cwd = await termCwdByPid(p.pid);
  return cwd ? { ok: true, cwd } : { ok: false };
});

// 取终端前台进程名（node-pty 维护）：判断当前是裸 shell 还是正跑着 claude/codex 等程序
ipcMain.handle('pty:proc', (e, { id }) => {
  const p = terminals.get(id);
  return p ? { ok: true, proc: p.process || '' } : { ok: false };
});

// ---------- 微信 ClawBot：不经 openclaw，直连腾讯 iLink 协议 + 本机 claude/codex 无头实例 ----------
// 编排见 electron/wechat/bridge.js（iLink 客户端 ilink.js + 本机 CLI 驱动 driver.js）。
// 参考的开源项目与署名见 docs/08-微信ClawBot-参考与署名.md。
const wechatBridge = require('./wechat/bridge');
let wechatInited = false;
function ensureWechat() {
  if (wechatInited) return;
  wechatInited = true;
  // 微信连/断 → 更新电源守卫（开了「离开不待机」时，连着才保持唤醒，断开自动恢复休眠）
  wechatBridge.onConnChange = (on) => { wechatConnected = !!on; refreshLidGuard(); };
  // 跨终端感知 + 控制：把本机其他 pty 终端的状态/写入能力交给微信 agent（手机上看电脑在跑啥、并能遥控）
  wechatBridge.termControl = {
    async list() {
      const arr = [];
      for (const [id, p] of terminals) {
        const proc = (p && p.process) || '';
        const cwd = await termCwdByPid(p && p.pid);
        const busy = !!proc && !/^-?(zsh|bash|sh|fish|login)$/i.test(proc); // 前台不是裸 shell = 正跑着东西
        const meta = termMeta.get(id) || {};
        arr.push({
          id,
          cwd,
          name: cwd ? path.basename(cwd) : '',
          proc,
          busy,
          tail: termTails.get(id) || '',
          lastActiveAt: meta.lastActiveAt || Date.now()
        });
      }
      return arr;
    },
    send(id, text) {
      const p = terminals.get(id);
      if (!p) return { ok: false, error: 'no such terminal' };
      try {
        p.write(text);
        recEvent(id, 'i', text);
        const meta = termMeta.get(id);
        if (meta) { meta.lastActiveAt = Date.now(); }
        return { ok: true };
      }
      catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
  };
  try { wechatBridge.init(win); } catch (e) { console.error('[wechat] init failed', e); }
  try { wechatConnected = wechatBridge.isConnected(); refreshLidGuard(); } catch { /* */ }
}
ipcMain.handle('wechat:env', async () => { ensureWechat(); return wechatBridge.env(); });
ipcMain.handle('wechat:setTarget', (e, { target } = {}) => { ensureWechat(); return wechatBridge.setTarget(target); });
ipcMain.handle('wechat:setCwd', (e, { dir } = {}) => { ensureWechat(); return wechatBridge.setCwd(dir); });
ipcMain.handle('wechat:setPersona', (e, { persona } = {}) => { ensureWechat(); return wechatBridge.setPersona(persona); });
ipcMain.handle('wechat:send', async (e, { text } = {}) => { ensureWechat(); return wechatBridge.sendDesktop(text); });
ipcMain.handle('wechat:conversation', (e, { id } = {}) => { ensureWechat(); return wechatBridge.conversation(id); });
ipcMain.handle('wechat:newConversation', async (e, { id } = {}) => { ensureWechat(); return wechatBridge.newConversation(id); });
ipcMain.handle('wechat:compact', async (e, { id } = {}) => { ensureWechat(); return wechatBridge.compact(id, false); });
ipcMain.handle('wechat:login', async () => { ensureWechat(); return wechatBridge.login(); });
ipcMain.handle('wechat:disconnect', async () => { ensureWechat(); return wechatBridge.disconnect(); });
ipcMain.handle('wechat:cancel', () => ({ ok: true }));
ipcMain.handle('wechat:check', async () => { ensureWechat(); return wechatBridge.check(); }); // 主动探活，返回 { state }

// 「离开不待机」开关：开启时（首次需管理员密码装免密规则）+ 微信连着 → 禁休眠，息屏/合盖也能远程操控
ipcMain.handle('wechat:setStayAwake', async (e, { on } = {}) => {
  ensureWechat();
  if (process.platform !== 'darwin') return { ok: false, error: 'macOS only' };
  if (on) {
    const choice = dialog.showMessageBoxSync(win && !win.isDestroyed() ? win : undefined, {
      type: 'warning', buttons: [M('开启', 'Enable'), M('取消', 'Cancel')], defaultId: 0, cancelId: 1,
      message: M('离开电脑也能用微信遥控', 'Keep controllable via WeChat while away'),
      detail: M('开启后，只要微信 ClawBot 还连着，合盖 / 息屏也不休眠——你能一直用手机微信遥控本机的 Claude Code / Codex。\n\n注意：持续耗电发热，建议接电源。断开微信、或关掉这个开关，自动恢复正常休眠。\n\n首次开启需输入一次管理员密码（装一条仅限电源设置的免密规则）。',
        'While WeChat ClawBot stays connected, closing the lid / screen off won\'t sleep the Mac — you can keep remote-controlling Claude Code / Codex from your phone.\n\nNote: it keeps drawing power and heat; stay plugged in. Disconnecting WeChat or turning this off restores normal sleep.\n\nFirst time needs your admin password once (installs a power-only passwordless rule).'),
    });
    if (choice !== 0) return { ok: false, error: 'cancelled', on: wechatStayAwake };
    const ruleOk = await ensurePmsetRule();
    if (!ruleOk) return { ok: false, error: 'setup-cancelled', on: wechatStayAwake };
  }
  wechatStayAwake = !!on;
  writeConfig({ wechatStayAwake });
  try { wechatConnected = wechatBridge.isConnected(); } catch { /* */ }
  refreshLidGuard();
  return { ok: true, on: wechatStayAwake, active: lidActive, connected: wechatConnected };
});
ipcMain.handle('wechat:powerState', () => ({ ok: true, stayAwake: wechatStayAwake, active: lidActive, platform: process.platform }));

// ---------- 文件监听（agent 改文件 → 自动刷新 + 跨项目变更收件箱）----------
// 多目录监听：浏览目录 + 每个终端会话所在的项目目录。一下午开多个项目跑 agent 时，
// 不在前台的项目也能感知变更。前端发来期望监听集，这里做增量 diff（关掉多余、补上新增）。
const watchers = new Map(); // dir -> FSWatcher
function startWatch(dir) {
  if (watchers.has(dir) || !dir || !fs.existsSync(dir)) return;
  try {
    // macOS(FSEvents)/Windows 原生递归；Linux 递归不可靠，降级为非递归监听当前目录
    const recursive = process.platform !== 'linux';
    const w = fs.watch(dir, { persistent: false, recursive }, (evt, filename) => {
      if (!win || win.isDestroyed()) return;
      const name = filename ? filename.toString() : null;
      // FSEvents 连「文件只是被读了一下」（atime/元数据更新）都报：agent cat/Read 个文件、
      // Spotlight 扫一遍都会触发。mtime/ctime 都不新鲜 = 内容根本没动过，丢弃；
      // stat 失败 = 刚被删，是真变更，照常转发
      if (name) {
        try {
          const st = fs.statSync(path.join(dir, name));
          const now = Date.now();
          if (now - st.mtimeMs > 3000 && now - st.ctimeMs > 3000) return;
        } catch { /* 已删除/无权限：当真变更转发 */ }
      }
      win.webContents.send('fs:changed', { dir, filename: name });
    });
    watchers.set(dir, w);
  } catch { /* 无权限等，跳过该目录 */ }
}
ipcMain.handle('fs:watch-set', (e, { dirs }) => {
  const want = new Set((dirs || []).filter(Boolean));
  for (const [dir, w] of watchers) { if (!want.has(dir)) { try { w.close(); } catch { /* */ } watchers.delete(dir); } }
  for (const dir of want) startWatch(dir);
  return { ok: true, count: watchers.size };
});
// 兼容旧单目录接口：等价于「只监听这一个目录」
ipcMain.handle('fs:watch', (e, { dir }) => {
  for (const [d, w] of watchers) { if (d !== dir) { try { w.close(); } catch { /* */ } watchers.delete(d); } }
  startWatch(dir);
  return { ok: true };
});

// ---------- Mobile Access（Phase 0A）----------
// 独立的 mobile HTTP server 引用：默认 null；enable 时启动，disable 时关闭
let _mobileHttpServer = null;
// 应用启动时读取 config —— 如果上次崩溃前 enabled = true 但 server 实际没起来，自动停掉避免悬挂状态
(async function reconcileMobileOnBoot() {
  try {
    const cfg = await mobile.getConfig();
    if (cfg && cfg.enabled === false) {
      // 桌面启动时永远不自动开 mobile：上次开着，这次默认关，用户需手动再点「开启」
      // 这是 Mobile Access 的强约束 —— 不允许「自启」。
    }
  } catch (e) { /* ignore */ }
})();

ipcMain.handle('mobile:status', async () => {
  return { ok: true, ...(await mobile.publicStatus()), running: !!_mobileHttpServer };
});

ipcMain.handle('mobile:enable', async () => {
  const cfg = await mobile.getConfig();
  await mobile.saveConfig({ enabled: true });
  if (!_mobileHttpServer) {
    _mobileHttpServer = mobile.startMobileServer({
      port: cfg.port || mobile.DEFAULT_PORT,
      onError: (e) => {
        console.error('[fanbox] mobile server 错误：', e.message);
        _mobileHttpServer = null;
      },
    });
  }
  return { ok: true, ...(await mobile.publicStatus()), running: true };
});

ipcMain.handle('mobile:disable', async () => {
  if (_mobileHttpServer) {
    try { _mobileHttpServer.close(); } catch {}
    _mobileHttpServer = null;
  }
  await mobile.revokeAllTokens();
  await mobile.saveConfig({ enabled: false, pairCodeHash: null, pairCodeExpiresAt: 0 });
  return { ok: true, ...(await mobile.publicStatus()), running: false };
});

ipcMain.handle('mobile:pair-start', async () => {
  const cfg = await mobile.getConfig();
  if (!cfg.enabled) return { ok: false, error: 'mobile_disabled' };
  if (!_mobileHttpServer) {
    // 用户还没开 mobile 入口但要生成配对码 —— 强制要求先 enable
    return { ok: false, error: 'mobile_not_running' };
  }
  const r = await mobile.startPairCode();
  const urls = mobile.listLanUrls(cfg.port || mobile.DEFAULT_PORT);
  const pick = mobile.pickBestLanUrls(cfg.port || mobile.DEFAULT_PORT);
  return {
    ok: true,
    pairCode: r.pairCode,
    expiresIn: r.expiresIn,
    expiresAt: r.expiresAt,
    lanUrls: urls,
    primaryLanUrl: pick.primary ? pick.primary.url : null,
    primaryIface: pick.primary ? pick.primary.iface : null,
  };
});

ipcMain.handle('mobile:tokens-revoke', async (e, { deviceId }) => {
  if (!deviceId || typeof deviceId !== 'string') return { ok: false, error: 'missing_deviceId' };
  await mobile.revokeToken(deviceId);
  return { ok: true, ...(await mobile.publicStatus()) };
});

// ---------- Phase 2A-2.1：Mobile Approval Loop (desktop IPC) ----------
// 注意：renderer → IPC → main 是安全的（main 是唯一拥有 IPC 通道的进程）。
// 这里直接调用 mobile.mobileSessions.* 等价于走 loopback HTTP，但省一层 HTTP 开销。

ipcMain.handle('mobile:approvals-list', async (e, { status, agentId, limit } = {}) => {
  try {
    const items = await mobile.mobileSessions.listApprovals({
      status: status || undefined,
      limit: limit || 100
    });
    let filtered = items;
    if (agentId) {
      filtered = filtered.filter(function (x) { return x.agentId === agentId; });
    }
    return { ok: true, items: filtered };
  } catch (err) {
    return { ok: false, error: 'list_failed', message: String(err && err.message || err) };
  }
});

ipcMain.handle('mobile:approval-decide', async (e, { approvalId, decision } = {}) => {
  if (!approvalId || typeof approvalId !== 'string') {
    return { ok: false, error: 'missing_approvalId' };
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    return { ok: false, error: 'invalid_decision' };
  }
  // 二次确认 desktop 状态：mobile access 必须开启
  const cfg = await mobile.getConfig();
  if (!cfg.enabled) {
    return { ok: false, error: 'mobile_disabled' };
  }
  try {
    const r = await mobile.mobileSessions.decideApproval(approvalId, decision, 'desktop');
    if (!r.ok) {
      return { ok: false, error: r.error, status: r.status || 400 };
    }
    return {
      ok: true,
      approvalId: r.approvalId,
      status: r.status,
      decision: r.decision,
      note: r.note || ''
    };
  } catch (err) {
    return { ok: false, error: 'decide_failed', message: String(err && err.message || err) };
  }
});

ipcMain.handle('mobile:approval-get', async (e, { approvalId } = {}) => {
  if (!approvalId || typeof approvalId !== 'string') {
    return { ok: false, error: 'missing_approvalId' };
  }
  try {
    const a = await mobile.mobileSessions.getApprovalById(approvalId);
    if (!a) return { ok: false, error: 'not_found' };
    return { ok: true, approval: a };
  } catch (err) {
    return { ok: false, error: 'get_failed', message: String(err && err.message || err) };
  }
});

// 应用退出兜底：保证 mobile server 不留悬挂 socket
function teardownMobile() {
  if (_mobileHttpServer) {
    try { _mobileHttpServer.close(); } catch {}
    _mobileHttpServer = null;
  }
}
// 注意：will-quit 在 electron/main.js 已有处理器（恢复 Mac 禁睡眠），这里仅在原处理器中追加 teardownMobile 调用。
// 实际整合见文件末尾追加段。
