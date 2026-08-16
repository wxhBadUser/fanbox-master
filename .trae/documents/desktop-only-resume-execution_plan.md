# FanBox Desktop-Only 改造 — 恢复执行计划

> 计划版本：2.0（恢复执行）  
> 日期：2026-07-21  
> 上游计划：`.trae/documents/desktop-only-hardening-refactor_plan.md`（1056 行，已获用户批准）  
> 当前任务：从 Phase 0 卡住点恢复，按上游计划继续执行至完成

---

## 一、当前状态

### 1.1 已完成（Phase 0 部分）

| 项 | 状态 | 说明 |
|---|---|---|
| 仓库探索 | ✅ | 两个 search agent 已建立 Mobile + WeChat 完整依赖图 |
| 上游计划文件 | ✅ | `.trae/documents/desktop-only-hardening-refactor_plan.md`（1056 行） |
| 工作区清单 | ✅ | `docs/audits/phase-00-pre-cleanup-inventory.md` |
| 回退标签 | ✅ | `archive/full-v2.6.0-mobile-wechat` 打在 master HEAD `8150afc` |
| `npm ci` | ✅ | 599 包安装成功（2 分钟） |
| `scripts/rebuild-win.js` 第 36 行修复 | ✅ | `NEW_GET` 从 `'.\\GetCommitHash.bat'` 改为 `'.\\shared\\GetCommitHash.bat'` |

### 1.2 卡住点（Phase 0 未完成）

| 项 | 状态 | 说明 |
|---|---|---|
| 分支 `refactor/desktop-only-hardening` | ⏸️ | 用户三次跳过切分支命令，我尊重决定，直接在 master 上继续 |
| `npm run rebuild` | ❌ | 第二次失败：`error C1083: 无法打开包括文件: "GenVersion.h"` |
| `npm run verify:build` | ❌ | 未运行（依赖 rebuild） |
| `npm run dist:win` | ❌ | 未运行 |
| 基线报告 `docs/audits/desktop-only-baseline.md` | ❌ | 未生成 |
| Phase 0 commit | ❌ | 未提交 |

### 1.3 卡住根因诊断（已确认）

**位置**：`node_modules/node-pty/deps/winpty/src/GetVer.bat`（由 `scripts/rebuild-win.js` 第 79 行生成）

**当前内容**：
```bat
@call shared\UpdateGenVersion.bat %*
```

**问题**：`call` 不改变工作目录。`UpdateGenVersion.bat` 中的 `mkdir ..\gen` 和 `>..\gen\GenVersion.h` 相对于当前工作目录（`src/`）而非 `src/shared/`，导致：
- `GenVersion.h` 被创建到 `deps/winpty/gen/`（错误位置）
- `deps/winpty/src/gen/` 目录不存在（应该在这里）
- MSBuild 的 `include_dirs` 指向 `gen`（相对 src 解析为 `src/gen/`），找不到头文件

**已验证证据**：
- `node_modules/node-pty/deps/winpty/gen/GenVersion.h` 存在（208 字节，错误位置）
- `node_modules/node-pty/deps/winpty/src/gen/` 目录不存在

---

## 二、Phase 0 恢复执行步骤

### 2.1 修复 `GetVer.bat` 生成逻辑

**文件**：`scripts/rebuild-win.js`

**修改 1**（第 77 行 + 第 79 行）：将 `GetVer.bat` 内容从 `@call shared\UpdateGenVersion.bat %*` 改为 `@cd shared && UpdateGenVersion.bat %*`

```javascript
// 修改前（第 77 行）：
if (cur === '@call shared\\UpdateGenVersion.bat %*') return;
// 修改后：
if (cur === '@cd shared && UpdateGenVersion.bat %*') return;

// 修改前（第 79 行）：
fs.writeFileSync(GETVER_BAT, '@call shared\\UpdateGenVersion.bat %*\r\n', 'utf8');
// 修改后：
fs.writeFileSync(GETVER_BAT, '@cd shared && UpdateGenVersion.bat %*\r\n', 'utf8');
```

**修改 2**（第 21 行注释更新）：
```javascript
// 修改前：
* GetVer.bat 内容：@call shared\UpdateGenVersion.bat %*
// 修改后：
* GetVer.bat 内容：@cd shared && UpdateGenVersion.bat %*（cd 改变工作目录，确保 GenVersion.h 生成到 src/gen/）
```

**修改 3**（第 36 行 `NEW_GET` 已修复，无需再改）。

### 2.2 清理错误的 build 残留

```powershell
# 删除错误位置的 GenVersion.h
Remove-Item node_modules\node-pty\deps\winpty\gen -Recurse -Force -ErrorAction SilentlyContinue
# 清理 node-pty build 目录（强制重新构建）
Remove-Item node_modules\node-pty\build -Recurse -Force -ErrorAction SilentlyContinue
```

### 2.3 删除当前错误的 GetVer.bat（让 rebuild-win.js 重新生成）

```powershell
Remove-Item node_modules\node-pty\deps\winpty\src\GetVer.bat -Force -ErrorAction SilentlyContinue
```

### 2.4 重新运行 rebuild

```powershell
npm run rebuild
```

**预期**：
- `GetVer.bat` 被重新创建，内容为 `@cd shared && UpdateGenVersion.bat %*`
- `cd shared` 进入 shared 子目录
- `UpdateGenVersion.bat` 在 `shared/` 中执行，`mkdir ..\gen` 创建 `src/gen/`，`>..\gen\GenVersion.h` 写入正确位置
- `echo gen` 输出 include dir（相对 src 是 `gen`）
- MSBuild 找到 `GenVersion.h`，winpty.dll + pty.node 编译成功
- finally 恢复 `winpty.gyp` 原始内容

### 2.5 降级方案（若 2.4 仍失败）

如果 rebuild 仍然失败，使用 `prebuilds/win32-x64/` 中的预构建二进制作为 fallback：

```powershell
# 验证 prebuilds 完整性
Get-ChildItem node_modules\node-pty\prebuilds\win32-x64 | Select Name,Length
# 预期：
#   conpty.node (312KB)
#   pty.node (303KB)
#   winpty.dll (256KB)
#   winpty-agent.exe (307KB)
#   conpty_console_list.node (134KB)

# 复制到 build/Release/
Copy-Item node_modules\node-pty\prebuilds\win32-x64\pty.node node_modules\node-pty\build\Release\
Copy-Item node_modules\node-pty\prebuilds\win32-x64\winpty.dll node_modules\node-pty\build\Release\
Copy-Item node_modules\node-pty\prebuilds\win32-x64\winpty-agent.exe node_modules\node-pty\build\Release\
```

**注意**：这是 fallback，不是首选。优先尝试 2.4 的真正 rebuild。`prebuilds` 是 node-pty npm 包自带的、由 maintainer 在发布时构建的二进制，Electron 33 ABI 兼容性需在 `verify:build` 中确认。

### 2.6 验证 native 模块

```powershell
npm run verify:build
```

**预期输出**：`scripts/verify-windows-build.js` 加载 `build/Release/{conpty,pty}.node` + `winpty.dll`，输出 OK。

### 2.7 基线构建

```powershell
npm run dist:win
```

**预期**：生成 `dist/FanBox 2.6.0.exe` + `dist/win-unpacked/`。

### 2.8 生成基线报告

**文件**：`docs/audits/desktop-only-baseline.md`

报告内容（必须填真实数字，不用占位符）：
- Git commit `8150afc`、Node v24.11.1、npm 11.17.0、Python 3.13.12
- Electron 33.x、electron-builder 25.x、node-pty 1.1.0
- `dist/FanBox 2.6.0.exe` 体积（PowerShell `Get-Item` Length 字节）
- `dist/win-unpacked/` 总体积（`Get-ChildItem -Recurse | Measure-Object -Sum Length`）
- `dist/win-unpacked/resources/app.asar` 体积
- `dist/win-unpacked/resources/app.asar.unpacked/` 体积
- `npx asar list dist/win-unpacked/resources/app.asar` 顶层文件列表
- 各主要目录体积（electron/、public/、node_modules/、docs/、experiments/、scripts/、design-demos/、src-vendor/、tests/）
- 当前生产依赖清单（package.json dependencies：5 个）
- 当前监听端口（4567 loopback + 4580 0.0.0.0 mobile）
- 当前移动端代码清单（引用 phase-00 inventory，33+ 文件）
- 当前微信代码清单（14+ 文件）
- 体积最大的 30 个文件（`Get-ChildItem -Recurse | Sort Length -Desc | Select -First 30`）
- 体积最大的 20 个目录

### 2.9 Phase 0 commit

```bash
git add docs/audits/phase-00-pre-cleanup-inventory.md docs/audits/desktop-only-baseline.md scripts/rebuild-win.js
git commit -m "chore: capture desktop-only baseline"
```

**注意**：只 commit 基线相关文件，不提交 mobile/wechat 删除（那是 Phase 2/3 的事）。`electron/mobile-agent-runner.js` 和 `scripts/smoke-mobile-agent-stream.js` 的已修改内容留到 Phase 2 一起随文件删除处理。

### 2.10 Phase 0 对抗性审查

**文件**：`docs/audits/phase-01-baseline-review.md`

审查内容：
- 基线数字是否真实（非占位符）
- 是否漏掉未跟踪文件分类
- rebuild 修复是否真正可复现（不是手动复制 .node 伪造）
- 结论只能是 PASS / REVISE / REJECT

---

## 三、Phase 1-11 执行步骤摘要

### Phase 1：移动端 + 微信端依赖图核对

**输出**：`docs/audits/phase-01-removal-inventory.md`

基于上游计划 §三 Phase 1 的探索结果，生成"待删除/待修改"清单文件。Commit：`docs: capture removal inventory`。

### Phase 2：彻底移除 Mobile Access

**删除**（4 runtime + 1 UI 目录 + 13 测试 + 9 实验 + 5 文档 + 8 未跟踪文档）：
- `electron/mobile.js`、`electron/mobile-sessions.js`、`electron/mobile-agent-runner.js`、`electron/mobile-contract.js`
- `public/mobile/`（整个目录）
- `scripts/smoke-mobile-*.js`（13 个）、`scripts/test-mobile-render.js`、`scripts/verify-mobile-*.js`（2 个）
- `experiments/mobile-*`（9 个目录）
- `docs/fanbox-mobile-*.md`、`docs/mobile-*.md`、`docs/paseo-mobile-*.md`、`docs/mobile-v2/`
- `.trae/documents/*mobile*`、`.trae/specs/`

**编辑**（8 文件，按上游计划行号）：
- `electron/main.js`：L34, L98-120, L122-175, L562, L1289-1429 移除 mobile 引用
- `electron/preload.js`：L81-88, L90-96 移除 fanboxMobile/fanboxMobileApproval
- `server.js`：L16-24, L2434, L2605-2672 移除 mobile 模块加载和 /api/mobile-control/* 路由
- `public/index.html`：L55-119 移除 mobile-access sidebar
- `public/app.js`：L1233, L1262-1265, L3136, L4949-5071, L5073-5284 移除 mobileApprovals/mobileAccess
- `public/style.css`：移除 .mobile-access* 规则
- `public/i18n-dict.js`：L25-51 移除移动端 i18n 键
- `scripts/verify-desktop-layout.js`：L102, L107 移除 'mobile' 项

**验证**：
- `node -e "require('./electron/main.js')"` 不抛异常
- `grep -ri "mobile" electron/ public/ scripts/ --exclude-dir=node_modules --exclude-dir=dist` 仅剩 CHANGELOG
- `npm run verify:build` 通过
- `npm test` 通过
- `netstat -ano | findstr ":4580 "` 空
- `netstat -ano | findstr "0.0.0.0:4580"` 空

**Commit**：`refactor: remove mobile access runtime`

**对抗性审查**：`docs/audits/phase-02-mobile-removal-review.md`

### Phase 3：彻底移除微信 ClawBot

**删除**（6 runtime + 7 测试/demo + 2 文档）：
- `electron/wechat/`（整个目录，6 文件：bridge/driver/env/ilink/memory/test-server）
- `scripts/verify-wechat-bridge.js`
- `design-demos/wechat-clawbot-*.{html,png}`（6 个）
- `docs/07-微信ClawBot*.md`、`docs/08-微信ClawBot*.md`

**编辑**（8 文件）：
- `electron/main.js`：L47, L241, L410-411, L459-471（refreshLidGuard 简化）, L679, L866, L1166-1247（移除 wechatBridge + 14 个 wechat:* IPC）
- `electron/preload.js`：L98-119 移除 fanboxWechat
- `public/index.html`：L179 移除 #term-wechat 按钮，L191-192 移除 #wechat-view
- `public/app.js`：L642, L2805-3140, L3104, L3106, L3111-3115, L3139, L3798 移除 wechatView
- `public/style.css`：L1400-1402, L1496-1501, L1508-1511 移除 .wechat-view/.wx-persona*/.wechat-btn
- `package.json`：L74 移除 `"qrcode": "^1.5.4"`
- `.gitignore`：L59-61 移除微信 ilink-token 条目
- `tests/e2e/windows-smoke.spec.js`：L72 移除 bridges.wechat，L78 调整计数

**依赖清理**：
```bash
npm install         # 重生成 lockfile，移除 qrcode
npm dedupe
npm prune
```

**验证**：
- `node -e "require('./electron/main.js')"` 不抛异常
- `grep -ri "wechat\|ClawBot\|ilink" electron/ public/ scripts/ --exclude-dir=node_modules --exclude-dir=dist` 仅剩历史
- `npm run verify:build` 通过
- `npm test` 通过

**Commit**：`refactor: remove wechat clawbot runtime`

**对抗性审查**：`docs/audits/phase-03-wechat-removal-review.md`

### Phase 4：修复隐私与安全问题

**4.1 不再读取 Claude OAuth Token**（`server.js` L1945-1996）：
- 移除 `claudeOAuthToken()` 函数
- 移除 `curlSysProxyLine()`
- 移除对 `api.anthropic.com/api/oauth/usage` 的请求
- `/api/agent-usage` 仅返回 Claude/Codex 本地 JSONL 统计
- UI 显示「仅显示本地使用记录」标识

**4.2 终端录制默认关闭**（`electron/main.js` L569, L580, L588）：
- `recEnabled()` 改为读 `readConfig().recordingEnabled === true`（默认 false）
- `MAX_FILES` 从 60 改为 20，`MAX_BYTES` 从 800MB 改为 200MB
- 默认只记录输出，不记录用户输入
- 新增 IPC：`rec:clear`、`rec:stats`、`rec:set-enabled`
- 设置页新增「终端录制」开关 + 「一键清除」按钮 + 占用显示

**4.3 Electron 新窗口默认拒绝**（`electron/main.js` L222-225）：
- 替换 `setWindowOpenHandler` 为默认 deny
- HTTPS allowlist 仅允许 github.com / nodejs.org / go.dev / www.python.org / visualstudio.microsoft.com / electronjs.org
- 增加 `will-navigate` 拦截，主窗口只能停留在 localhost
- 拒绝 `javascript:` / `file:` / `data:` / `blob:` / 未知协议

**4.4 添加 CSP**（`electron/main.js` createWindow 前）：
```js
session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
  cb({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",  // Monaco/Milkdown 内联样式需要
        "img-src 'self' data: blob:",         // 截图缩略图走 blob URL
        "font-src 'self'",
        "connect-src 'self' http://localhost:* http://127.0.0.1:*",  // 渲染层 fetch 后端
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
      ].join('; ')
    }
  });
});
```

**4.5 IPC sender 验证**（`electron/main.js` 新增 `assertTrustedSender`）：
- 在 pty:spawn/input/resize/kill、fs:trash/watch-set/watch、clip:image/file/save-image/save-paste-text、drop:save/save-into/copy-into、rec:read/delete/save-export/export、update:open、agent:which 调用

**4.6 IPC 参数验证**（`electron/main.js` 新增 validators）：
- id: `/^[a-zA-Z0-9_-]{1,64}$/`
- pathStr: 字符串、长度 < 4096、无空字节
- cols: 10-400 整数
- rows: 2-200 整数
- bufLen: ≤ 50MB
- filename: 长度 < 255、无 `<>:"/\\|?*\x00`

**验证**：`grep -r "credentials.json\|api.anthropic.com\|claudeAiOauth" --exclude-dir=node_modules --exclude-dir=dist` 仅剩 CHANGELOG

**Commit**：`security: harden desktop electron boundaries`

**对抗性审查**：`docs/audits/phase-04-security-review.md`

### Phase 5：修复稳定性问题

**5.1 PTY 输出缓冲硬上限**（`electron/main.js` L657-674）：
```js
const MAX_OUTPUT_BUFFER = 64 * 1024;
outputBuf = (outputBuf + data).slice(-MAX_OUTPUT_BUFFER);
```

**5.2 主进程终端数量限制**（`electron/main.js`）：
- `const MAX_TERMINALS = 10;`
- `pty:spawn` 开头检查 `terminals.size >= MAX_TERMINALS` 返回 `{ ok: false, error: 'max_terminals_reached' }`
- 检查 `terminals.has(id)` 返回 `{ ok: false, error: 'duplicate_id' }`

**5.3 退出时完整清理**（`window-all-closed` / `before-quit`）：
- 遍历 terminals kill + delete
- 遍历 termTails、termMeta、termEvents delete
- 遍历 recorders：stream.end() + delete
- 遍历 watchers：w.close() + delete
- 清 outputFlushTimer 等 timer

**5.4 大型 JSONL 流式读取**（`electron/project-memory.js` 或相关读取位置）：
- 改用 `readline` 模块逐行流式读取
- 最大文件读取预算 50MB
- 最大扫描文件数 200
- 超时 5s
- 截断结果提示

**5.5 跨盘目录移动**（`server.js` move 路由）：
- 区分文件 / 目录 / 符号链接
- 目录跨盘移动：递归复制（fs.cpSync）+ 全部成功后删源
- 失败时不删源
- 符号链接：重建而非复制

**5.6 统一路径边界检查**（新建 `electron/safe-path.js`）：
```js
const fs = require('fs');
const path = require('path');
function realpath(p) { try { return fs.realpathSync(p); } catch { return null; } }
function isInside(target, base) {
  const t = realpath(target); const b = realpath(base);
  if (!t || !b) return false;
  const rel = path.relative(b, t);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}
module.exports = { realpath, isInside };
```
- 替换 `electron/main.js:907` 的 `absDir.startsWith(homeDir)` 为 `isInside(absDir, homeDir)`
- HTML 预览白名单（`server.js`）也用 `isInside`

**5.7 Windows 安全打开 API**：
- `shell.openPath()` / `shell.showItemInFolder()` 替代 `start` / `explorer /select`
- `spawn(...)` 用 `shell: false`

**Commit**：`perf: reduce runtime caches and blocking scans`

**对抗性审查**：`docs/audits/phase-05-stability-review.md`

### Phase 6：缩小生产安装包

**6.1 严格 electron-builder files 白名单**（`package.json` build 字段）：
```json
"build": {
  "appId": "com.huashu.fanbox",
  "productName": "FanBox",
  "directories": { "buildResources": "build", "output": "dist" },
  "asar": true,
  "compression": "normal",
  "npmRebuild": false,
  "asarUnpack": ["**/node_modules/node-pty/**"],
  "files": [
    "electron/main.js",
    "electron/preload.js",
    "electron/atomic-json.js",
    "electron/project-memory.js",
    "electron/safe-path.js",
    "server.js",
    "public/index.html",
    "public/app.js",
    "public/style.css",
    "public/i18n.js",
    "public/i18n-dict.js",
    "public/assets/**",
    "public/vendor/**",
    "package.json",
    "!**/*.map",
    "!**/*.md",
    "!**/*.test.js",
    "!**/*.spec.js"
  ],
  "mac": { ... },
  "win": { ... },
  "dmg": { ... }
}
```

**运行时验证**：实际启动 `dist/win-unpacked/FanBox.exe`，确认主窗口/文件浏览/终端/Markdown预览/Monaco/xterm/缩略图均工作。

**6.2 删除废弃根目录 main.js**：
- 搜索 `require.*'./main'` 引用
- 若无，删除根目录 `main.js`
- 确认 `package.json.main` 唯一指向 `electron/main.js`

**6.3 清理 dependencies**：
- 移除 `qrcode`（Phase 3 已删，但需确认 lockfile 已更新）
- 检查每个 dependency 是否运行时必需
- `npm install` → `npm dedupe` → `npm prune`

**6.4 审计 public/vendor**：
- `public/vendor/monaco/vs/basic-languages/`：保留 ~15 种桌面实际用到的语言（powershell/bat/javascript/typescript/json/css/html/markdown/python/shell/yaml 等），删除其他 60+ 种
- `public/vendor/monaco/vs/language/`：保留 cssWorker/htmlWorker/jsonWorker/tsWorker，删除其他
- `public/vendor/monaco/vs/nls.messages.*.js`：保留 `zh-cn`，删除其他 7 种 locale
- `public/vendor/milkdown/KaTeX_*`：若不渲染 LaTeX 公式，可全删（需先验证）
- `public/vendor/hljs/styles/`：保留 github-dark + github，删除其他

**6.5 compression 测试**：
- 测试 `compression: normal` vs `maximum`，记录构建时间和体积差
- 若 maximum 体积差 < 1MB 且构建时间增加 > 50%，保持 normal

**Commit**：`build: add strict electron-builder file whitelist`

**对抗性审查**：`docs/audits/phase-06-packaging-review.md`

### Phase 7：运行时磁盘占用优化

**7.1 缩略图缓存**（`server.js`）：
- 默认上限 400MB → 150MB
- 新增 IPC `cache:thumb-stats` 返回当前占用
- 新增 IPC `cache:thumb-clear` 一键清理
- 清理失败不影响主程序
- 设置页显示占用 + 一键清理按钮

**7.2 终端录像**（与 Phase 4.2 整合）：
- 默认关闭（已在 Phase 4.2 实现）
- 开启后上限 200MB / 20 文件
- 设置页一键清理 + 占用显示

**7.3 临时拖拽文件 `fanbox-drops`**（`electron/main.js` 启动时）：
```js
const dropDir = path.join(app.getPath('temp'), 'fanbox-drops');
fs.readdirSync(dropDir).forEach(name => {
  const fp = path.join(dropDir, name);
  try {
    const st = fs.statSync(fp);
    if (Date.now() - st.mtimeMs > 24 * 3600 * 1000) fs.rmSync(fp, { force: true });
  } catch {}
});
```

**Commit**：`perf: cap runtime caches and drop temp`

### Phase 8：CI + 守卫脚本

**8.1 验证 node-pty 可复现**：
```bash
rm -rf node_modules
npm ci
npm run rebuild
npm run verify:build
```

**8.2 新增 GitHub Actions Windows CI**（`.github/workflows/windows-desktop.yml`）：
```yaml
name: Windows Desktop CI
on:
  push:
    branches: [master, refactor/desktop-only-hardening]
  pull_request:
    branches: [master]
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - uses: microsoft/setup-msbuild@v2
      - run: npm ci
      - run: npm run rebuild
      - run: npm run verify:build
      - run: npm run verify:paths
      - run: npm test
      - run: node scripts/verify-desktop-package.js
      - run: npm run dist:win
      - uses: actions/upload-artifact@v4
        with:
          name: fanbox-win-exe
          path: dist/*.exe
```

**8.3 生产包内容守卫**（新建 `scripts/verify-desktop-package.js`）：
- 读取 `dist/win-unpacked/resources/app.asar`（用 `npx asar list`）
- 断言以下路径**不存在**：`electron/mobile.js`、`electron/mobile-`、`electron/wechat/`、`public/mobile/`、`experiments/`、`design-demos/`、`docs/`、`smoke-mobile`、`verify-mobile`、`ClawBot`、`ilink`、`mobile-control`
- 断言以下路径**存在**：`electron/main.js`、`electron/preload.js`、`server.js`、`public/index.html`、`public/app.js`、`public/style.css`、`node_modules/node-pty`
- 输出：EXE 体积、app.asar 体积、app.asar.unpacked 体积、win-unpacked 体积、最大 20 个打包文件
- 退出码 0 / 1

**8.4 在 `package.json` 添加脚本**：
```json
"verify:desktop": "node scripts/verify-desktop-package.js"
```

**Commit**：`test: add desktop-only packaging assertions + windows CI`

### Phase 9：桌面端回归测试

扩展 `tests/e2e/windows-smoke.spec.js` 增加新断言（不删旧断言）：
- 启动后只有一个主窗口
- 不出现 Mobile Access 元素（`#mobile-access` 不存在）
- 不出现微信按钮（`#term-wechat` 不存在）
- 不强制 always-on-top（生产模式）
- 终端最多 10 个：第 11 个被主进程拒绝
- PTY 输出高吞吐时内存不持续增长
- 跨盘移动文件
- symlink 不能绕过预览白名单
- 录像默认关闭
- 缩略图缓存上限

**Commit**：`test: extend desktop regression for security and stability`

### Phase 10：文档更新

**10.1 更新 `README.md`**：
- 移除微信 ClawBot 介绍、微信 Alt+A、微信 bridge 验证、微信凭据、微信 FAQ、架构表中的微信行、架构图中的 wechat/ 子目录、scripts 列表中的 verify-wechat-bridge.js、Roadmap 中的微信 ClawBot 已完成项
- 新增「不提供」段落：FanBox 是 Windows 桌面端本地 AI Coding Cockpit。不提供手机端/局域网远程控制/微信控制。不内置任何 Agent。不自动安装任何 CLI。不读取 Claude/Codex Token。
- 版本号字段统一从 `package.json` 自动读取

**10.2 更新 `CHANGELOG.md`**：
- `[Unreleased]` 段新增 `Removed` 子段，列出本次删除的移动端 + 微信模块
- 保留 v2.6.0 段中的 mobile/wechat 历史条目作为历史记录

**10.3 归档**：
- `docs/release-v2.6.0.md` → `docs/archive/release-v2.6.0.md`（加注「此版本含移动端 + 微信，已在 v2.7.0 移除」）
- `architecture-review-20260625.html` → `docs/archive/architecture-review-20260625.html`

**10.4 编辑保留文档**：
- `docs/09-FanBox-Agent架构设计-记忆上下文自进化.md`：L68/L83 移除 wechat bridge 引用
- `docs/aionui-parity-plan.md`：L46/L47/L283/L367/L487 移除 mobile/wechat 对比
- `docs/superpowers/specs/2026-06-18-fanbox-windows-migration-design.md`：移除 wechat 章节

**Commit**：`docs: update desktop-only documentation`

### Phase 11：最终体积报告与对抗性审查

**11.1 最终体积报告**（`docs/audits/desktop-only-final-report.md`）：

| 指标 | 改造前 | 改造后 | 变化 |
|---|---|---|---|
| EXE | （Phase 0 实测） | （Phase 6 实测） | -X MB (-Y%) |
| win-unpacked | | | |
| app.asar | | | |
| app.asar.unpacked | | | |
| production dependencies 数 | 5 | 4 | -1 (qrcode) |
| app.asar 文件数 | | | |
| 启动监听端口数 | 2 (4567 + 4580 0.0.0.0) | 1 (4567 loopback) | -1 |
| Electron 主进程代码量 | 1428 行 | ~1100 行 | -328 行 |
| preload API 数量 | 12 | 9 | -3 |
| 移动端代码文件数 | 33+ | 0 | -33 |
| 微信代码文件数 | 14+ | 0 | -14 |

体积来源拆解：Electron/Chromium Runtime / node-pty native / public/vendor / desktop code / images / other

**必须解释**：Electron 固有下限 / 已删除体积 / 仍较大资源 / 是否值得迁移 Tauri / 当前不迁移的理由

**11.2 最终对抗性审查**（`docs/audits/phase-06-final-adversarial-review.md`）：
- 完整核对 §18 验收清单 40+ 项
- 结论只能是 PASS / REVISE / REJECT
- 存在 P0 问题时不得给 PASS

**Commit**：`docs: final report and adversarial review`

---

## 四、最终回复格式

按用户 §20 要求的 17 节格式输出，必须包含真实测试输出和真实安装包体积：

1. 完成结论
2. 改造前后架构差异
3. 删除的移动端模块
4. 删除的微信模块
5. 保留的桌面功能
6. 安全修复
7. 稳定性修复
8. 安装包体积对比
9. app.asar 内容审计
10. 依赖变化
11. 测试结果
12. CI 结果
13. 对抗性审查结果
14. 尚存风险
15. 修改文件清单
16. 删除文件清单
17. Git commit 清单

---

## 五、关键约束（重申）

- **不修改业务代码直到 Phase 0 基线完成**
- **不丢弃用户修改**（`electron/mobile-agent-runner.js` 和 `scripts/smoke-mobile-agent-stream.js` 已修改未提交，留到 Phase 2 一起随文件删除处理）
- **不手动复制 .node 文件伪造 node-pty 成功**（除非 2.4 真正 rebuild 失败，才使用 prebuilds fallback，且明确记录）
- **不修改 Claude/Codex/OpenCode/Qoder 启动语义**
- **不读取用户凭据**
- **不把开发文档/实验截图/测试 fixture 放进生产包**
- **每个 Phase 独立 commit**
- **每个 Phase 输出对抗性审查文件**
- **遇到测试失败不跳过，修复根因或回退**

---

## 六、执行顺序总览

| Phase | 名称 | Commit | 审查文件 | 状态 |
|---|---|---|---|---|
| 0 | 前置准备与基线 | `chore: capture desktop-only baseline` | `phase-01-baseline-review.md` | 🔄 恢复中 |
| 1 | 依赖图核对 | `docs: capture removal inventory` | （含在 01） | ⏳ 待执行 |
| 2 | 移除 Mobile Access | `refactor: remove mobile access runtime` | `phase-02-mobile-removal-review.md` | ⏳ 待执行 |
| 3 | 移除 WeChat ClawBot | `refactor: remove wechat clawbot runtime` | `phase-03-wechat-removal-review.md` | ⏳ 待执行 |
| 4 | 隐私与安全加固 | `security: harden desktop electron boundaries` | `phase-04-security-review.md` | ⏳ 待执行 |
| 5 | 稳定性修复 | `perf: reduce runtime caches and blocking scans` | `phase-05-stability-review.md` | ⏳ 待执行 |
| 6 | 生产打包白名单 | `build: add strict electron-builder file whitelist` | `phase-06-packaging-review.md` | ⏳ 待执行 |
| 7 | 运行时磁盘优化 | `perf: cap runtime caches and drop temp` | （含在 06） | ⏳ 待执行 |
| 8 | CI + 守卫脚本 | `test: add desktop-only packaging assertions + windows CI` | （含在 06） | ⏳ 待执行 |
| 9 | 桌面回归测试 | `test: extend desktop regression for security and stability` | （含在 06） | ⏳ 待执行 |
| 10 | 文档更新 | `docs: update desktop-only documentation` | （含在 06） | ⏳ 待执行 |
| 11 | 最终报告 + 审查 | `docs: final report and adversarial review` | `phase-06-final-adversarial-review.md` | ⏳ 待执行 |

---

## 七、上游计划参考

本恢复执行计划是上游计划 `.trae/documents/desktop-only-hardening-refactor_plan.md`（1056 行，已获用户批准）的精简执行版。所有具体行号、文件路径、代码片段均引用上游计划。如需查看完整上下文，请参阅上游计划文件。
