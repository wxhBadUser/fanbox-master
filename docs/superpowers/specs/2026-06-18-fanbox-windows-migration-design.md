# FanBox Windows 迁移设计文档

版本 v1.0 · 2026-06-18

> **核心原则**：核心功能优先 — 文件浏览/搜索/预览、内嵌终端、Claude Code/Codex 联动、微信 ClawBot、编辑/预览/ Git diff 在 Windows 上一等公民。macOS 独有功能（截图直通车、合盖不休眠）跳过不实现。

---

## 1. 前提与边界

### 1.1 最终目标

FanBox 桌面版（Electron + node-pty）在 Windows 上可完整运行，覆盖 macOS 版 **所有跨平台功能**，以 `npm install && npm run app` 为验收入口。

### 1.2 不改的内容

| 范畴 | 明细 | 原因 |
|---|---|---|
| **全部前端代码** | `public/` 下的 app.js、style.css、index.html、i18n.js/dict.js | 纯浏览器端渲染，不依赖任何平台 API |
| **前端 vendor** | xterm.js + addons、Monaco Editor、Milkdown Crepe、highlight.js、marked | 已打包为静态资源，不依赖平台 |
| **后端核心** | server.js 文件/搜索 API、静态服务、缩略图、项目识别 | 已覆盖 Windows 分支（面包屑、open/start） |
| **录制器** | rec:* IPC 全部 handler（list/read/delete/reveal/save-export/export） | 纯 Node 文件 IO，ffmpeg 路径适配见下方 |
| **微信 ClawBot 协议层** | bridge.js（编排）、ilink.js（iLink HTTP 客户端）、memory.js（记忆模块） | HTTP 协议跨平台，无平台依赖 |
| **更新检测** | checkUpdate、fetchLatestRelease、update:* IPC | `net.fetch` 跨平台 |
| **preload.js** | 全部 IPC 桥暴露 | 后端 handler 有/无已由 `process.platform` 守卫，preload 只路由 |
| **server.js 系统代理** | `curlSysProxyLine()` 的 `scutil` 部分（macOS 专用） | 需要添加 Windows 分支，见下方 |
| **文档** | README.md、docs/* | 项目本身已跨平台描述 |

### 1.3 最终可交付状态

```
npm install && npm run app
```

| # | 功能 | Windows 状态 |
|---|------|-------------|
| 1 | Electron 窗口打开，界面布局完整 | ✅ |
| 2 | 左侧文件浏览/搜索/预览 | ✅ |
| 3 | 右侧内嵌终端（xterm.js + node-pty）| ✅ 通过 PowerShell |
| 4 | 终端里跑 Claude Code / Codex | ✅ 通过 powershell -Command |
| 5 | 编辑器（Monaco 代码、Milkdown Markdown）| ✅ |
| 6 | 文件 fs.watch / 自动刷新 / 跟随模式 | ✅ |
| 7 | 系统代理自动读取，claude/codex 子进程联网 | ✅ 注册表方式 |
| 8 | Claude Code 官方用量查询 | ✅ |
| 9 | 剪贴板复制图片/文件 | ✅ |
| 10 | 拖拽文件进终端/文件区 | ✅ |
| 11 | 截图直通车 | ⏭️ 跳过 |
| 12 | 合盖不休眠 / 离开不待机 | ⏭️ 跳过 |
| 13 | `npm run dist` 打包 Windows 安装包 | ✅ NSIS .exe |

---

## 2. `electron/main.js` — 主进程修改

### 2.1 窗口创建 (行 41-73)

**现状：**

```js
win = new BrowserWindow({
  width: b.width, height: b.height, x: b.x, y: b.y,
  minWidth: 920, minHeight: 600,
  titleBarStyle: 'hiddenInset',              // macOS Only
  backgroundColor: '#0b0c0a',
  vibrancy: 'sidebar',                       // macOS Only
  visualEffectState: 'active',               // macOS Only
  webPreferences: { preload, contextIsolation, nodeIntegration },
});
```

**改后：**

```js
win = new BrowserWindow({
  width: b.width, height: b.height, x: b.x, y: b.y,
  minWidth: 920, minHeight: 600,
  ...(process.platform === 'darwin' ? {
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
  } : {
    frame: true,  // Windows 用标准窗口边框
  }),
  backgroundColor: '#0b0c0a',
  webPreferences: { preload, contextIsolation, nodeIntegration },
});
```

**说明：** Windows 上保留标准窗口边框（`frame: true` 是默认值，不写也行）。不实现自绘标题栏——标准 Windows 标题栏可接受，且减少大量前端改动量（CSS drag 区 + 窗口控制按钮等）。代价是 Windows 标题栏占用 ~30px 顶部空间，与 macOS 沉浸式有视觉差异，但不影响功能。

### 2.2 截图直通车 (行 108-147) — 跳过

**策略：** 删除 `startShotWatch()` 函数体；抹掉 `app.whenReady().then(...)` 中的第 98 行调用 `startShotWatch()`。删除 `screenshotDir()` 函数。

保留 preload.js 中的 `fanboxShot.onNew` 桥接（只注册监听器，主进程不发事件即无害）。

**删除范围：**

| 函数/变量 | 操作 |
|-----------|------|
| `screenshotDir()` (109-115) | 删除 |
| `shotWatcher` (116) | 删除声明 |
| `shotSent` (117) | 删除声明 |
| `startShotWatch()` (118-147) | 删除函数体 |
| 第 98 行 `startShotWatch()` 调用 | 条件化为 `if (process.platform === 'darwin')` 或直接删除 |

### 2.3 合盖不休眠 (行 244-377) — 跳过

**策略：** 所有相关函数已有 `process.platform !== 'darwin'` 首行守卫，Windows 不会执行。菜单中"合盖后继续运行"复选框已包裹在 `isMac` 条件中。

**保持不动：** 变量 `lidIntent`/`lidActive`/`wechatStayAwake`/`wechatConnected` 的声明和 `refreshLidGuard` 调用不删除——函数本身首行返回，不影响。

**清理建议（可选）：** 将整段 `# 合盖继续运行` 代码块（行 243-346）包裹在 `if (process.platform === 'darwin') { ... }` 块内，减少 Windows 上的无效执行路径。`refreshLidGuard()` 在 pty 创建/退出处的调用（行 490/501/561）可条件化为 `if (process.platform === 'darwin') refreshLidGuard()`。

### 2.4 菜单 (行 348-381)

已有 `const isMac = process.platform === 'darwin'` 守卫，FanBox 应用菜单（行 351-358）仅在 macOS 显示，合盖菜单项（行 372-377）已包裹在 `...(isMac ? [...] : [])` 中。**不修改。**

### 2.5 终端 PTY (行 468-506)

已有正确分支：`shellPath` 的 `process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh'`（行 470），`shellArgs` 的 `process.platform === 'win32' ? [] : ['-l']`（行 475）。**不修改。**

但需验证 `node-pty` 在 Windows 上的原生模块编译：

```bash
npm run rebuild   # electron-rebuild -f -w node-pty
```

`package.json` 脚本保持不动。

### 2.6 终端 CWD 获取 — `termCwdByPid()` (行 712-728)

**问题：** `lsof -a -p ${pid} -d cwd -Fn` 是 macOS/Linux 工具。

**方案：** 双分支实现。

```js
function termCwdByPid(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve('');
    if (process.platform === 'win32') {
      const { execFile } = require('child_process');
      execFile('powershell.exe', [
        '-NoProfile', '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").ExecutablePath`
      ], { timeout: 3000 }, (err, stdout) => {
        if (err) return resolve('');
        const p = (stdout || '').trim();
        resolve(p ? require('path').dirname(p) : '');
      });
    } else {
      // 原 macOS/Linux lsof 逻辑保持不变（行714-721）
      require('child_process').exec(
        `lsof -a -p ${pid} -d cwd -Fn`,
        { env: { ...process.env, LC_ALL: 'en_US.UTF-8' }, timeout: 3000 },
        (err, stdout) => { ... }
      );
    }
  });
}
```

**注意：** `Get-CimInstance Win32_Process` 返回的是进程启动时的工作目录（`ExecutablePath` 的所在目录），不是实时 `cwd`。Windows 上进程的实时工作目录无法从外部可靠读取。这是已知限制——`termCwdByPid` 返回的是终端 shell 的启动目录，不是 `cd` 之后的实时目录。对微信 agent 跨终端感知来说精确度够用。

### 2.7 剪贴板文件复制 — `clip:file` (行 512-516)

**问题：** `osascript -e 'set the clipboard to (POSIX file ...)'` 是 macOS 专用。

**方案：** 双分支实现。

```js
ipcMain.handle('clip:file', async (e, { path: p }) => {
  if (process.platform === 'win32') {
    try {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; ` +
        `[System.Windows.Forms.Clipboard]::SetFileDropList(` +
        `(Get-Item '${String(p).replace(/'/g, "''")}').FullName)`;
      require('child_process').execFileSync(
        'powershell.exe', ['-NoProfile', '-Command', ps]
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  // 原 macOS osascript 逻辑保持不变（行513-516）
  return new Promise((resolve) => { /* ... */ });
});
```

### 2.8 FFmpeg 路径 — `findFfmpeg()` (行 626-628)

**问题：** 硬编码 `/opt/homebrew/bin/ffmpeg` 等 Homebrew 路径。

**方案：** 在末尾追加 PATH 搜索退路。

```js
function findFfmpeg() {
  for (const c of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) {
    try { if (fs.existsSync(c)) return c; } catch { /* */ }
  }
  // 跨平台退路：PATH 搜索
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const out = require('child_process')
      .execSync(`${which} ffmpeg 2>/dev/null`, { encoding: 'utf8' })
      .trim().split('\n')[0];
    if (out) return out;
  } catch { /* */ }
  return null;
}
```

### 2.9 `wechat:setStayAwake` (行 782-801) — 前端优雅降级

已有 `process.platform !== 'darwin'` 首行守卫，Windows 下返回 `{ ok: false, error: 'macOS only' }`。**不改。**

前端 `app.js:2254` 已根据 `platform` 隐藏按钮：

```js
const mac = (this.platform || ...) === 'darwin';
btn.classList.toggle('hidden', !mac);
```

## 3. `electron/wechat/driver.js` — CLI 驱动器

### 3.1 `run()` 函数 (行 12-30)

**问题：** `spawn(loginShell(), ['-lc', cmd], ...)` 中 `-lc` 是 Unix shell 参数，Windows PowerShell 不支持。`child.kill('SIGKILL')` 在 Windows 上无效。

**方案：**

```js
async function run(cmd, stdinText, cwd, timeoutMs = 180000, onLine = null) {
  const env = await fullEnv();
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const child = isWin
      ? spawn('powershell.exe', ['-NoProfile', '-Command', cmd], {
          cwd: cwd || process.env.USERPROFILE || process.env.HOME, env
        })
      : spawn(loginShell(), ['-lc', cmd], {
          cwd: cwd || env.HOME || process.env.HOME, env
        });
    let out = '', err = '', done = false, lineBuf = '';
    const finish = (r) => { if (done) return; done = true; resolve(r); };
    const timer = setTimeout(() => {
      try { child.kill(isWin ? 'SIGTERM' : 'SIGKILL'); } catch { /* */ }
      finish({ ok: false, out, err: err + '\n[超时]' });
    }, timeoutMs);
    // ... stdout/stderr/error/close 处理不变（行19-27）
  });
}
```

**关键点：**
- `-lc` → `-NoProfile -Command`
- `HOME` → `USERPROFILE`（`process.env.USERPROFILE` 是 Windows 主目录）
- `'SIGKILL'` → `'SIGTERM'`（Windows 只支持 SIGINT/SIGTERM/SIGBREAK）

### 3.2 `which()` 函数 (行 64-66)

```js
function which(bin) {
  const cmd = process.platform === 'win32'
    ? `where ${bin} 2>nul || echo.`
    : `command -v ${bin} || true`;
  return run(cmd, '', null, 8000).then((r) => !!(r.out || '').trim());
}
```

### 3.3 `warmEnv()` (行 151)

调用 `fullEnv()`。Windows 下 `env.js` 返回 `{}`（不 shell 偷环境），不影响。**不改。**

## 4. `electron/wechat/env.js` — 环境复刻

### 4.1 `dumpShellEnv()` (行 14-32)

Windows 分支已写 `return resolve({})`。**不改。**

Windows 上 dotfiles 环境偷取概念不存在，Electron 的 `process.env` 已包含完整系统/用户环境变量。

### 4.2 `sysProxyEnv()` (行 34-49)

**问题：** 使用 macOS 的 `scutil --proxy` 读取系统代理设置。

**方案：** Windows 分支读注册表。注意 `reg query` 一次仅支持一个 `/v` 参数，两个分开查或用 PowerShell 替代。

```js
function sysProxyEnv() {
  return new Promise((resolve) => {
    if (process.platform === 'darwin') {
      // 原 scutil 逻辑保持不变（行38-48）
    } else if (process.platform === 'win32') {
      // 方案 A：两次 reg query（分两次查 ProxyEnable 和 ProxyServer）
      // 方案 B（推荐）：PowerShell 单次查询
      const { execFile } = require('child_process');
      execFile('powershell.exe', [
        '-NoProfile', '-Command',
        '$ie = Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"; ' +
        'if ($ie.ProxyEnable) { $ie.ProxyServer } else { "" }'
      ], { timeout: 3000 }, (err, stdout) => {
        if (err) return resolve({});
        const server = (stdout || '').trim();
        if (!server) return resolve({});
        const url = server.includes('://') ? server : `http://${server}`;
        resolve({
          http_proxy: url, https_proxy: url,
          HTTP_PROXY: url, HTTPS_PROXY: url,
          all_proxy: url, ALL_PROXY: url,
        });
      });
    } else {
      resolve({}); // Linux: 依赖环境变量
    }
  });
}
```

### 4.3 `build()` (行 52-57)

不改。Windows 上：
- `shellEnv = {}`
- `sysProxyEnv` = 注册表读取的代理（经上述修改后）
- `process.env` 打底

```js
// 行56 LANG 兜底对 Windows 同样适用，不改
```

## 5. `server.js` — 后端

### 5.1 `findAgentBin()` — zsh 问题

搜索 `findAgentBin` 函数或 `command -v claude` / `command -v gh` 出现的位置。Windows 上用 `where.exe` 替代。

```
macOS: /bin/zsh -lc 'command -v claude || true'
Win32: where.exe claude 2>nul
```

**需要读取 server.js 确认具体行号。**

### 5.2 `curlSysProxyLine()` (行 1526-1538)

同 4.2 `sysProxyEnv` 方案，Windows 分支读注册表：

```js
async function curlSysProxyLine() {
  if (['https_proxy', ...].some(k => process.env[k])) return '';
  if (PLATFORM === 'darwin') {
    // 原 macOS scutil 逻辑
  } else if (PLATFORM === 'win32') {
    try {
      const out = await new Promise((resolve, reject) => {
        execFile('powershell.exe', [
          '-NoProfile', '-Command',
          '$ie = Get-ItemProperty \"HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\"; ' +
          'if ($ie.ProxyEnable) { $ie.ProxyServer } else { \"\" }'
        ], { timeout: 3000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
      });
      const server = (out || '').trim();
      if (!server) return '';
      return `proxy = \"http://${server}\"\n`;
    } catch { return ''; }
  }
  return '';
}
```

### 5.3 默认根目录 — `defaultRoots()` (行 1134-1147)

中文 Windows 系统上 "Desktop" 可能是 "桌面"、"Documents" 可能是 "文档"、"Downloads" 可能是 "下载"。

**方案：** 在 Windows 上额外检查本地化路径名。

```js
function defaultRoots() {
  const candidates = [['主目录', HOME]];
  if (PLATFORM === 'win32') {
    const known = ['Desktop', '桌面', 'Documents', '文档', 'Downloads', '下载'];
    const seen = new Set();
    for (const name of known) {
      const p = path.join(HOME, name);
      if (!seen.has(p)) {
        seen.add(p);
        candidates.push([name, p]);
      }
    }
  } else {
    candidates.push(['桌面', path.join(HOME, 'Desktop')], ...);
  }
  candidates.push(['代码 / Code', path.join(HOME, 'Code')], ...);
  return candidates.filter(([, p]) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
}
```

已存在的 filter 会过滤掉不存在的路径，所以同时放两个名字是安全的。

### 5.4 Spotlight 搜索 (行 1004) — 不动

已有 `process.platform === 'darwin'` 守卫。

## 6. `public/app.js` — 前端

### 6.1 初始 platform 默认值 (行 186)

```js
// 改前
const state = { cwd: null, home: null, platform: 'darwin', sep: '/' };

// 改后
const state = {
  cwd: null, home: null,
  platform: (window.fanboxEnv && window.fanboxEnv.platform) || 'darwin',
  sep: '/',
};
```

**说明：** `loadRoots()` 从 `/api/roots` 获取真实 platform 后会覆盖 `state.platform`，所以启动后行为和原来一样。这个修改只是消除初始态的误导性，非必须。

### 6.2 合盖开关按钮 (行 2253-2254) — 不动

```js
const mac = (this.platform || (window.fanboxEnv && window.fanboxEnv.platform)) === 'darwin';
btn.classList.toggle('hidden', !mac);
```

`this.platform` 会被 `/api/roots` 返回的 `platform: 'win32'` 覆盖，按钮自动隐藏。

### 6.3 快捷键 — 不动

所有快捷键使用 `e.metaKey || e.ctrlKey`，Electron 自动映射：macOS Cmd → `metaKey`，Windows Ctrl → `ctrlKey`。

### 6.4 `isNoisyChange()` — 需检查

`public/app.js` 中的 `isNoisyChange` 函数需检查其路径列表。如果写死了 `~/Library` 等 macOS 路径，Windows 下需补充 `%TEMP%`、`%APPDATA%` 等。

**等实现阶段读取确认。**

## 7. `electron/preload.js` — 零修改

逐桥分析确认：

| 桥 | 后端 | Windows 行为 | 改？ |
|----|------|-------------|------|
| `fanboxPty` | `pty:spawn` | 已正确 win32 分支 | 不改 |
| `fanboxRec` | `rec:*` | 纯文件操作 | 不改 |
| `fanboxFs` | `fs:watch` | 跨平台 `fs.watch` | 不改 |
| `fanboxClipboard` | `clip:image` | Electron 跨平台 | 不改 |
| `fanboxClipboard` | `clip:file` | 需加 Win 分支（已在 main.js 改）| 不改 |
| `fanboxDrop` | `drop:*` | 纯文件操作 | 不改 |
| `fanboxShot` | `shot:new` | 后端不发事件 | 不改 |
| `fanboxUpdate` | `update:*` | HTTP 跨平台 | 不改 |
| `fanboxWin` | `win:traffic` | 后端已有 `typeof` guard | 不改 |
| `fanboxEnv` | `platform` | `process.platform` 自动正确 | 不改 |
| `fanboxWechat` | `wechat:*`| HTTP + 后端 guard | 不改 |

**结论：`preload.js` 中没有任何一行需要修改。**

## 8. `package.json` — 构建配置

### 8.1 新增 Windows 构建配置

```json
"build": {
  // 保留 mac 现有配置不变
  "mac": { /* 不变 */ },

  // 新增 win 配置
  "win": {
    "icon": "build/icon.ico",
    "target": [
      { "target": "nsis", "arch": ["x64"] }
    ]
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "installerIcon": "build/icon.ico",
    "uninstallerIcon": "build/icon.ico"
  }
}
```

### 8.2 构建脚本

```json
"dist": "electron-builder --mac --win",
"dist:mac": "electron-builder --mac",
"dist:win": "electron-builder --win"
```

### 8.3 图标文件

| 平台 | 文件 | 来源 |
|------|------|------|
| macOS | `build/icon.icns` | 已有 |
| Windows | `build/icon.ico` | 从 `build/icon.png` 转换（`npx png-to-ico build/icon.png > build/icon.ico`）或使用在线转换工具 |

### 8.4 依赖检查

`node-pty`（依赖行 60）: Windows 原生支持。需确保 `npm run rebuild` 在 Windows 上正确执行：

```
electron-rebuild -f -w node-pty
```

其余依赖（electron, xterm, qrcode, milkdown 等）纯 JS，跨平台。

## 9. 修改文件总表

| 文件 | 修改范围 | 难度 | 优先级 |
|------|---------|------|--------|
| `electron/main.js` | 窗口创建条件化 + 截图功能删除 + termCwdByPid lsof→wmic + clip:file osascript→PS + findFfmpeg PATH 搜索 | 中等 (~80行) | P0 |
| `electron/wechat/driver.js` | run() 的 -lc→PowerShell、which() 的 command -v→where、kill SIGKILL→SIGTERM | 简单 (~15行) | P0 |
| `electron/wechat/env.js` | sysProxyEnv() 添加 Windows 注册表分支 | 中等 (~25行) | P0 |
| `server.js` | curlSysProxyLine() Win 分支 + defaultRoots() 中文路径后备 + findAgentBin zsh→where | 中等 (~40行) | P1 |
| `public/app.js` | 初始 platform 动态获取 + isNoisyChange 路径检查（待确认）| 简单 (~3行) | P2 |
| `package.json` | 添加 build.win + NSIS 配置 + dist 脚本 | 简单 (~15行) | P0 |
| `build/icon.ico` | 新增 Windows 图标文件 | 资源 | P1 |
| `electron/preload.js` | **零修改** | - | - |
| `public/vendor/*` | **零修改** | - | - |

## 10. 功能 vs 平台映射

### 完全可用的核心功能 (Windows 上一等公民)

| 功能组 | 实现方式 | 平台依赖 |
|--------|---------|----------|
| 文件浏览/搜索/预览 | server.js HTTP API | 无（Node 跨平台） |
| 文件徽章/项目识别 | server.js 文件系统扫描 | 无 |
| 全局模糊搜索 | server.js walk + fuzzyScore | 无 |
| 全文内容搜索 (grep) | server.js walk + 文件内容 grep | 无 |
| Markdown/HTML 预览 | frontend marked/highlight.js | 无（纯前端） |
| 图片/视频/PDF 预览 | iframe / `<video>` / `<img>` | 无 |
| 内嵌终端 | node-pty + xterm.js | node-pty 原生 Win32 |
| 终端跑 Claude Code | powershell -Command claude ... | Claude Code CLI 已支持 Win |
| 终端跑 Codex | powershell -Command codex ... | Codex CLI 已支持 Win |
| 终端路径可点击 | 正则匹配 + stat 验证 | 无 |
| 拖文件进终端 | Electron IPC + preload | 无 |
| Monaco 代码编辑器 | 前端 vendor | 无 |
| Milkdown Markdown 编辑器 | 前端 vendor（esbuild 打包）| 无 |
| Git diff 视图 | Monaco DiffEditor | 无 |
| 图片标注/格式转换 | Canvas + 前端 | 无 |
| 未保存退出守卫 | 前端 + IPC | 无 |
| 项目记忆 | 文件 IO | 无 |
| 会话回放 | 文件 IO + asciinema 格式 | 无 |
| 变更收件箱 | 文件 IO + fs.watch | 无 |
| 微信 ClawBot (iLink) | HTTP 协议（ilink.js）| 无 |
| 桌面输入框 ↔ 大脑 | driver.js (已改造) | powershell -Command |
| AI 整理 | 文件元数据 + agent CLI | 无 |
| Skills 透视 | 文件扫描 | 无 |
| Agent 用量 | HTTP API + 本地 jsonl | 无 |
| 磁盘占用透视 | du/dir 命+ shell | 需用 `dir /s` 替代 `du` |
| 更新检测 | net.fetch + GitHub API | 无 |
| 多皮肤 | 前端 CSS | 无 |

### 跳过的 macOS 独有功能

| 功能 | 原因 | 替代方案 |
|------|------|---------|
| 截图直通车 | Windows 截图命名/保存机制不同，非核心 | 用户手动拖入 |
| 合盖继续运行 (`pmset`) | Windows 电源管理机制不同，非核心 | 电源和睡眠设置 → 从不睡眠 |
| 离开不待机 (`pmset`) | 同上，且需管理员权限 | Windows 电源设置 |
| 毛玻璃/vibrancy 视觉效果 | Windows 不支持 Electro 毛玻璃 | 标准背景色 |

## 11. 遗留风险与注意事项

| # | 风险 | 说明 | 缓解措施 |
|---|------|------|---------|
| 1 | `node-pty` 原生编译 | Windows 上需 MSVC build tools 编译 C++ 原生模块 | `electron-rebuild` 自动处理；失败的降级行为已存在（main.js 行 19-21） |
| 2 | Windows 终端 CWD 不实时 | `Win32_Process.ExecutablePath` 只有启动目录，`cd` 后不更新 | 已知限制，对微信 agent 跨终端感知够用 |
| 3 | Claude Code/Codex CLI Windows 兼容性 | 需要确认 Claude Code 和 Codex 在 Windows 上可通过 CLI 用 stdout 模式驱动 | 两个 CLI 都已支持 Windows |
| 4 | 中文 Windows 路径本地化 | "Desktop" → "桌面"、"Documents" → "文档" | `defaultRoots()` 中同时放两个名字，`statSync` 过滤不存在的 |
| 5 | `shellQuote()` 单引号在 Windows 不工作 | cmd.exe 不识别单引号 | 已确认 server.js 中所有 Windows 路径都不经过 `shellQuote()`，均使用内联双引号 |
| 6 | Terminal 录制导出的 ffmpeg 路径 | Windows 上 ffmpeg 安装方式不同 | `findFfmpeg()` 已追加 `where ffmpeg` PATH 搜索 |
| 7 | 系统代理读取兼容性 | Clash Verge/v2rayN/其他代理工具注册表行为不同 | 使用通用的 HKCU\Internet Settings 路径，与 Electron/Chromium 默认代理读取方式一致 |

---

## 12. 验收流程

### 12.1 功能验收清单

每项修改后运行 `npm run app`（Electron 桌面版）：

1. **窗口**：Electron 窗口在 Windows 上正常打开，无白屏、无错误弹窗
2. **文件浏览**：左侧文件树浏览正常，网格/列表视图切换，面包屑导航正常
3. **文件搜索**：⌘K / Ctrl+K 搜索正常工作，内容搜索可切换
4. **文件预览**：Markdown 渲染、HTML 实时、代码高亮、图片/视频/PDF 内嵌
5. **终端**：右侧内嵌终端打开，输入输出正常，色彩/ANSI 正确
6. **终端跑 Claude Code**：在终端中输入 `claude -p "hi"` 得到回复
7. **终端跑 Codex**：在终端中输入 `codex exec --help` 得到帮助信息
8. **文件自动刷新**：在其他窗口中修改文件，FanBox 中预览自动更新
9. **编辑器**：Monaco 编辑器打开代码文件，Milkdown 打开 Markdown
10. **剪贴板**：复制图片到系统剪贴板、复制文件（可在资源管理器粘贴）
11. **拖拽**：从文件列表拖文件进终端生效
12. **Claude 用量**：Claude Code 官方限额正常显示
13. **Web 版（无 Electron）**：`node server.js` 浏览器打开正常工作
14. **打包**：`npm run dist:win` 打出 Windows 安装包

### 12.2 不验收项

- 截图直通车功能（跳过）
- 合盖继续运行功能（跳过）
- macOS vibrancy 毛玻璃效果
- 快捷键与 macOS 完全一致（Windows 用 Ctrl 替代 Cmd）

---

## 13. 附录：agent 1 报告 — server.js 与 env.js 详细分析

### 13.1 `server.js`

#### A. 系统代理读取 — `curlSysProxyLine()` (行 1526-1538)

**Windows 方案：** `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings /v ProxyEnable /v ProxyServer`

This format is used when both `/v ProxyEnable` and `/v ProxyServer` are passed to reg query, only the LAST `/v` flag is used on most Windows versions. 需要两个独立查询或用 PowerShell 简化。

推荐的 PowerShell 替代：

```powershell
powershell -NoProfile -Command "$ie = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'; if ($ie.ProxyEnable) { $ie.ProxyServer }"
```

#### B. Claude OAuth Token (行 1505-1522)

**Windows 方案：** 不改。`.credentials.json` 文件后备已足够。

```js
// 行 1520 文件后备已跨平台
try { return pick(await fsp.readFile(path.join(HOME, '.claude', '.credentials.json'), 'utf8')); }
catch { return null; }
```

Keychain 是 macOS 优先路径（行 1510-1518），有 `PLATFORM === 'darwin'` 守卫。

#### C. Spotlight / mdfind 搜索 (行 1004)

已有 `process.platform === 'darwin'` 守卫。**不改。**

#### D. `openInOS` — 终端 (行 1088-1089)

已有 Windows 分支：

```js
else if (PLATFORM === 'win32') cmd = `start "" cmd /K cd /d "${dir}"`;
```

**建议增强：** 优先使用 Windows Terminal (`wt -d "${dir}"`)，fallback 到 cmd。

#### E. `openDefault` (行 1116-1118)

已有 Windows 分支：

```js
else if (PLATFORM === 'win32') {
  if (withApp === 'reveal') cmd = `explorer /select,"${target}"`;
  else cmd = `start "" "${target}"`;
}
```

**确认：** 双引号内联使用（非 `shellQuote` 单引号）在 cmd.exe 中正确。

#### F. `defaultRoots()` (行 1134-1147)

Windows 上 "Desktop" 可能存为 "桌面"。建议：

```js
// 在 Windows 上添加本地化路径名
if (PLATFORM === 'win32') {
  const addIfExists = (name) => { try { if (fs.statSync(path.join(HOME, name)).isDirectory()) candidates.push([name, path.join(HOME, name)]); } catch {} };
  addIfExists('Desktop');
  addIfExists('桌面');
  addIfExists('Documents');
  addIfExists('文档');
  addIfExists('Downloads');
  addIfExists('下载');
}
```

#### G. 面包屑 (行 194-196)

已正确：`PLATFORM === 'win32' ? parts[0] + path.sep : path.sep`

#### H. `shellQuote()` (行 1130)

所有 Windows 路径调用均使用内联双引号，不经过 `shellQuote`。**不改。**

### 13.2 `electron/wechat/env.js`

#### A. `dumpShellEnv()` (行 14-32)

Windows 分支 `resolve({})`。**不改。**

#### B. `sysProxyEnv()` (行 34-49)

需添加 Windows 注册表分支（详见 4.2）。

#### C. `build()` (行 52-57)

不改。Windows 上 `shellEnv={}` + `sysProxyEnv`（注册表）+ `process.env` 打底。

---

## 14. 附录：agent 3 报告 — driver.js、preload.js、app.js、package.json

### 14.1 `driver.js`

`run()` 函数的 `-lc` 参数 Windows 下改为 PowerShell `-NoProfile -Command`。
`which()` 函数的 `command -v` 改为 `where ... 2>nul || echo.`。
`child.kill('SIGKILL')` 改为 `'SIGTERM'`（Windows 不支持 SIGKILL）。
`warmEnv()` 不变（调用 `fullEnv`，Windows 返回 `{}`）。

### 14.2 `preload.js`

**零修改。** 所有 IPC 桥的后端 handler 在 Windows 上要么有正确分支（pty:spawn），要么已 guard（setStayAwake / trafficLights），要么不会触发（shot:new）。platform 由 `process.platform` 自动返回正确值。

### 14.3 `public/app.js`

- 行 186 `platform: 'darwin'` → 动态获取
- 行 2253 合盖按钮已正确条件隐藏
- 快捷键已正确双条件
- `isNoisyChange()` 需在实现阶段确认 macOS 特有路径过滤

### 14.4 `package.json`

添加 `build.win` + `nsis` 配置。添加 `dist:win` 脚本。新增 `build/icon.ico` 图标文件。

---

## 15. 附录：agent 2 报告 — main.js 详细分析

（报告完整内容已在第 2 节覆盖，此处仅列出未在前文展开的要点）

- `titleBarStyle: 'hiddenInset'` → 条件包裹（Windows 保留标准边框）
- `vibrancy/visualEffectState` → 条件包裹
- 截图直通车 → 删除函数体
- 合盖不休眠整套 → 函数已有 `process.platform` guard
- 菜单 → 已有 `isMac` 条件
- pty:spawn → 已有正确 win32 分支
- `termCwdByPid` lsof → wmic / PowerShell
- `clip:file` osascript → PowerShell .NET 调用
- `findFfmpeg` → + PATH 搜索
- `wechat:setStayAwake` → 前端已条件隐藏按钮
- `window-all-closed` app.quit → 已有正确跨平台逻辑
