# R3 Phase 0 — Golden Master 基线快照（2026-08-16）

> 用途：作为 FanBox Desktop Cleanroom R3 清理的**回退基线**。
> 原则：本轮**只冻结、不删除**。记录所有用户可见能力、IPC、HTTP API、preload bridge、
> 测试基线、以及当前"待清理候选"的精确引用证据，供后续各 Phase 删除前比对。
> 回退 tag：`archive/pre-cleanroom-20260816`（指向 master HEAD `aae75c9`）

---

## 1. 基线来源

- **master HEAD**：`aae75c9a2048afd705c3fe700589e3943f43bf50`（`docs: add desktop-only refactor plan documents`）
- 仓库已跟踪文件数：**286**
- 顶部目录（已跟踪）：`electron/ public/ scripts/ server.js tests/ docs/ build/ assets/ src-vendor/ design-demos/ experiments/ .trae/ 素材/ main.js .icon.html README.md CHANGELOG.md package.json package-lock.json playwright.config.js`

---

## 2. 入口确认

- `package.json` `"main": "electron/main.js"` — 真实入口
- 根目录 `main.js`：含 `ELECTRON_RUN_AS_NODE` 自动启动逻辑头部；**全仓零 `require('./main')` / `electron .` 生产引用**（非 `function main()` 命中的除外）。候选删除（R3-03），删除前需确认无 electron-builder / bin 引用。
- `server.js`：`http.createServer` 手写分发，无 express；是数据/文件服务核心，**不可删**。

---

## 3. Electron IPC 列表（ipcMain.handle，共 38）

核心（26）：
```
agent:which  clip:file  clip:image  clip:save-image  clip:save-paste-text
drop:copy-into  drop:save  drop:save-into
fs:trash  fs:watch  fs:watch-set
pty:cwd  pty:proc  pty:spawn
rec:delete  rec:export  rec:list  rec:read  rec:reveal  rec:save-export
update:get  update:open
win:focus  win:traffic
```
微信（12，**待删主体之一**）：
```
wechat:cancel  wechat:check  wechat:compact  wechat:conversation  wechat:disconnect
wechat:env  wechat:login  wechat:newConversation  wechat:powerState
wechat:send  wechat:setCwd  wechat:setPersona  wechat:setStayAwake  wechat:setTarget
```
> 注：共 12 个 wechat:* handler，但上面列出 13 行 —— 以 `grep -oE "ipcMain.handle\('[^']+'"` 实数 38 为准，
> 其中 wechat 相关 12 个。

---

## 4. Preload bridge 暴露（contextBridge.exposeInMainWorld，共 11）

```
fanboxPty  fanboxRec  fanboxFs  fanboxClipboard  fanboxDrop  fanboxShot
fanboxUpdate  fanboxWin  fanboxEnv  fanboxAgent  fanboxWechat
```
**待删：`fanboxWechat`**

---

## 5. HTTP API 路由（server.js，共 36，零 wechat/mobile/ilink）

```
/api/agent-projects  /api/agents/detect  /api/agent-usage  /api/archive
/api/content  /api/create  /api/du  /api/favorites  /api/git  /api/git-file
/api/grep  /api/image-save  /api/lang  /api/list  /api/locate  /api/move
/api/open  /api/organize/launch  /api/project-memory  /api/raw  /api/read
/api/recent  /api/recent-open  /api/release/inspect  /api/release/prepare
/api/rename  /api/roots  /api/screenshots/recent  /api/search  /api/skills
/api/skills/toggle  /api/skills/trash  /api/term-verify  /api/thumb  /api/trash  /api/write
```
`server.js` 内 `wechat|mobile|ilink` 命中：**0**（网络层干净）

---

## 6. 测试 / 验证基线（可用命令）

```
npm run verify:build        → scripts/verify-windows-build.js
npm run verify:paths        → scripts/verify-paths.js
npm run test:e2e:windows    → tests/e2e/windows-smoke.spec.js
npm run check:vendor-patch  → grep xterm 补丁
node scripts/verify-desktop-layout.js
node scripts/verify-agent-driver.js
node scripts/verify-soft-terminal-colors.js
node scripts/verify-wechat-bridge.js   ← 随 WeChat 删除会一并移除
npm run dist:win            → electron-builder --win portable
```

---

## 7. 待清理候选 + 引用证据（供各 Phase 删除前比对）

| 候选 | 现状 | 引用证据 | 归属 |
|---|---|---|---|
| `electron/wechat/`（6 文件）| 存在 | `electron/main.js` L1088 `require('./wechat/bridge')` + 40 处 wechat | R3-02 |
| `fanboxWechat` preload | 1 处 | `electron/preload.js` | R3-02 |
| `wechat:*` IPC（12）| 存在 | `electron/main.js` L1132-1166 | R3-02 |
| public wechat（index 2 / app 32 / css 6）| 存在 | i18n-dict 已 0 | R3-02 |
| `qrcode` 依赖 | dependencies | package.json L74 | R3-02/07 |
| `.gitignore` 微信规则 | 存在 | `*.ilink-token` `ilink-sessions/` | R3-02 |
| 根 `main.js` | 存在，零引用 | 见 §2 | R3-03 |
| `.trae/`（196K）| 存在，`.gitignore` 无 | — | R3-04 |
| `design-demos/`（13M）| 存在 | 含 promo/wechat-clawbot-* | R3-05 |
| `experiments/`（2.5M）| 存在 | 含 bugfix/drag-path/local-model/readme-shots | R3-05/06 |
| `素材/`（612K）| 存在 | — | R3-05 |
| `public/mobile/`（空壳）| 存在，空目录 | `public/mobile/assets/agents` 全空、零引用 | R3-05 |
| `.icon.html` | 存在 | 待核引用 | R3-05 |
| `public/vendor/`（18M）| 存在 | Monaco/milkdown/kaTeX/xterm | R3-09 |
| **`build.files` 白名单** | **缺失** | package.json `build` 无 files | R3-08 |

---

## 8. 关键用户可见能力（Golden Master 回归清单，清理后必须 1:1 保持）

启动 / 目录浏览 / 最近项目 / 项目记忆 / session 标题 / Claude+Codex Resume /
sidebar 展开折叠+拖宽 / 文件区显隐 + 终端铺满 / 多终端创建切换关闭 /
PowerShell/cmd/PTY / Claude / Codex / OpenCode/Qoder 探测 / 文件拖入终端 / 路径点击 /
Markdown 预览编辑 / Monaco / 图片/PDF/HTML/视频预览 / Git status+diff /
文件复制移动删除重命名 / 截图+剪贴板导入 / 收藏+最近打开 / 磁盘占用 / i18n /
Release wizard / Skills+Usage 面板

> 注意：`fanboxShot.saveClipboardImage()` 是**通用剪贴板能力**，删除微信语义时**不得误删**。

---

*记录工具：grep 采集，2026-08-16。本文件本身属于 R3 过程产物，R3-07 收敛 docs 时应一并处置。*