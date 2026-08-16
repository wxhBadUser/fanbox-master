# FanBox Desktop-Only 收缩与生产级加固改造计划

> 计划版本：1.0  
> 日期：2026-07-21  
> 分支策略：`refactor/desktop-only-hardening`（自 master 切出）  
> 回退标签：`archive/full-v2.6.0-mobile-wechat`  
> 目标：彻底删除 Mobile Access + 微信 ClawBot，加固桌面端安全与稳定性，显著缩小 Windows 安装包。

---

## 一、Summary 概述

本计划对 FanBox 仓库执行一次"产品面收缩 + 工程加固"：删除所有移动端 / 微信远程控制功能（运行时代码、测试、文档、依赖），同时加固桌面端的安全边界、稳定性与可复现性，并显著缩小 Windows portable 安装包体积。不重写 UI、不迁移 Tauri、不改变桌面核心能力（文件浏览 / 终端 / Agent CLI 启动 / Monaco / Milkdown / 截图 / 录像 / 自动更新）。

执行严格分阶段：先建立基线 → 切分支打标签 → 逐阶段删除 → 每阶段对抗性审查 → 独立 commit。每个阶段都有可验证的成功标准与守卫脚本。

---

## 二、Current State Analysis 当前状态分析

### 2.1 仓库结构（基于 Phase 1 探索）

| 区域 | 文件数 | 状态 |
|---|---|---|
| 桌面运行时 | `electron/main.js`（1428 行）+ `electron/preload.js`（119 行）+ `server.js`（2700+ 行）+ `electron/atomic-json.js` + `electron/project-memory.js` + `public/{index.html,app.js,style.css,i18n*.js}` | 桌面核心 |
| 移动端运行时 | `electron/mobile.js`（4548 行）+ `electron/mobile-sessions.js`（1839 行）+ `electron/mobile-agent-runner.js`（732 行）+ `electron/mobile-contract.js`（141 行）+ `public/mobile/{index.html,mobile.js,mobile.css,assets/}` | 删除 |
| 微信运行时 | `electron/wechat/{bridge.js,driver.js,env.js,ilink.js,memory.js,test-server.js}` | 删除（env.js 需特殊处理） |
| 验证脚本 | `scripts/verify-*.js` + `scripts/smoke-mobile-*.js` + `scripts/test-mobile-render.js` | 部分删 / 部分改 |
| 实验 | `experiments/mobile-*/`（11 个目录）+ `experiments/{bugfix-202606,drag-path-test,local-model-202606,readme-shots}` | 部分删 |
| 设计 demo | `design-demos/wechat-clawbot-*.{html,png}`（6 个）+ 3 个桌面设计 | 部分删 |
| 文档 | `docs/mobile-*` / `docs/07-微信ClawBot*` / `docs/08-微信ClawBot*` / `docs/mobile-v2/` | 删除 + 改 |
| 根目录脚本 | `_m3-*.js` / `_m3_*.dart` / `_m4-*.js` / `_m5-*.js`（共 31 个） | 删除（外部 Flutter 项目脚手架，与 FanBox 桌面无关） |
| 根目录 main.js | 仓库根 `main.js`（不在 package.json.main） | 删除（确认无引用后） |

### 2.2 当前体积基线（待 Phase 1 构建后填入实际数字）

README 记录 v2.4.0 时 Windows portable EXE 约 **95.43 MB**。当前 v2.6.0 未实测，需 Phase 1 重新构建后填入。

### 2.3 已发现的隐私 / 稳定性 / 安全问题（Phase 1 探索已确认）

| 类别 | 问题 | 位置 |
|---|---|---|
| 隐私 | `claudeOAuthToken()` 读取 `~/.claude/.credentials.json`，curl 请求 `api.anthropic.com/api/oauth/usage` | `server.js:1945-1996` |
| 安全 | 主窗口 `app.focus({ steal: true })` + `setAlwaysOnTop(true)` 无条件执行（仅 dev 应启用） | `electron/main.js:250-251` |
| 安全 | `setWindowOpenHandler` 只 deny `https?:`，未拦截 `javascript:` / `file:` / `data:` / `blob:` / 未知协议 | `electron/main.js:222-225` |
| 安全 | 无 `will-navigate` 拦截，主窗口可被导航到任意 origin | `electron/main.js`（缺失） |
| 安全 | 无 CSP | `electron/main.js`（缺失） |
| 安全 | 所有 IPC 都无 `sender` 校验 | `electron/main.js` 全文 |
| 安全 | PTY / 文件 / 剪贴板 IPC 参数无运行时校验（仅 `fs:trash` 有最小校验） | `electron/main.js` |
| 稳定性 | 主进程 `outputBuf += data` 无硬上限（`termTails` 已有 4KB 上限，但 B2B 事件缓冲 outputBuf 未限） | `electron/main.js:657-674` |
| 稳定性 | 渲染层 `s.outputBuffer += data` 已有 2048 字符上限（保留最近 1024） | `public/app.js:4579-4582`（OK，保留） |
| 稳定性 | `MAX_TERMINAL_SESSIONS = 10` 只在前端，主进程未限制 | `public/app.js:3750` |
| 稳定性 | `0.0.0.0:4580` mobile server 监听（待删除） | `electron/mobile.js:4408` |
| 安全 | 路径 containment 用 `target.startsWith(homeDir)`（在 `clip:save-paste-text`） | `electron/main.js:907` |
| 安全 | HTML 预览白名单未做 realpath 校验（symlink 绕过） | `server.js`（待查） |
| 稳定性 | 跨盘目录移动 EXDEV 处理（待查 server.js `move` 实现） | `server.js`（待查） |

### 2.4 当前 `package.json` 关键信息

- `main`: `electron/main.js`（唯一入口，OK）
- 根目录 `main.js` 不在 package.json.main，疑似废弃 → 待 Phase 1 确认
- `dependencies`: `@xterm/*`、`node-pty`、`qrcode`（仅微信用，可删）
- `devDependencies`: `electron`、`electron-builder`、`esbuild`、`@electron/rebuild`、`playwright-core`、`marked`、`highlight.js`、`monaco-editor`、`@milkdown/crepe`
- `build.files`: **未配置** —— 当前 electron-builder 默认把整个仓库打入 asar，这是体积过大的根因
- `build.asarUnpack`: `["**/node_modules/node-pty/**"]`（OK）

### 2.5 工作区状态（Phase 1 已确认）

- 分支：`master`
- HEAD：`8150afc`（Release v2.6.0）
- 已修改未提交：`electron/mobile-agent-runner.js`、`scripts/smoke-mobile-agent-stream.js`（2 个文件）
- 未跟踪文件：`_m3-*/_m4-*/_m5-*`（31 个根目录脚本）、`architecture-review-20260625.html`、`docs/mobile-v2/`、`docs/release-v2.6.0.md`、`electron/mobile-contract.js`、`experiments/mobile-qa0/`、`public/_e2e_check.html`、`public/_real_check*.html`、`public/_real_claude.txt`、`.trae/documents/*mobile*`、`.trae/specs/`

**处理策略**：开始前先把所有未跟踪文件分类——属于本次要删除范围的（`_m3-*/_m4-*/_m5-*`、`docs/mobile-v2/`、`electron/mobile-contract.js`、`experiments/mobile-qa0/`、`public/_real_check*`、`public/_e2e_check.html`、`public/_real_claude.txt`、`.trae/documents/*mobile*`、`.trae/specs/rebuild-mobile-paseo-r1/`）一次性提交到 `archive/pre-cleanup` commit；已修改的两个 mobile 文件直接随移动端删除阶段一起处理。`architecture-review-20260625.html` 与 `docs/release-v2.6.0.md` 评估后决定是否保留。

---

## 三、Proposed Changes 详细变更方案

### Phase 0：Phase 0 前置准备与基线建立

**目标**：建立可回退点 + 基线报告，**不修改任何业务代码**。

#### 0.1 工作区整理
- `git status` 记录当前所有未跟踪 / 已修改文件，写入 `docs/audits/phase-00-pre-cleanup-inventory.md`（新建）
- 分类：可随本次改造删除的 vs 需保留的
- **不丢弃任何用户修改**——已修改的两个 mobile 文件留到 Phase 2 一起删

#### 0.2 切分支 + 打标签
- `git checkout -b refactor/desktop-only-hardening`
- `git tag archive/full-v2.6.0-mobile-wechat`（若已存在则跳过）
- 标签打在 `master` 的 HEAD（`8150afc`）上，不含工作区修改

#### 0.3 基线构建
```bash
npm ci
npm run rebuild          # node-pty Windows 构建（scripts/rebuild-win.js）
npm run verify:build     # 验证 native 模块可加载
npm run dist:win          # 生成 dist/win-unpacked/ + FanBox-Setup-2.6.0.exe
```

#### 0.4 生成基线报告 `docs/audits/desktop-only-baseline.md`
报告必须包含：
- Git commit、Node.js 版本、npm 版本
- Electron 版本、electron-builder 版本、node-pty 版本
- `dist/FanBox-2.6.0.exe` 大小
- `dist/win-unpacked/` 总大小（`Get-ChildItem -Recurse | Measure-Object -Sum Length`）
- `dist/win-unpacked/resources/app.asar` 大小
- `dist/win-unpacked/resources/app.asar.unpacked/` 大小
- `npx asar list dist/win-unpacked/resources/app.asar` 顶层文件列表
- 各主要目录体积（`electron/`、`public/`、`node_modules/`、`docs/`、`experiments/`、`scripts/`、`design-demos/`、`src-vendor/`、`tests/`）
- 当前生产依赖清单（`package.json` dependencies）
- 当前监听端口（4567 loopback + 4580 0.0.0.0 mobile）
- 当前移动端代码清单（33+ 文件，引用 Phase 1 搜索 agent 结果）
- 当前微信代码清单（14+ 文件）
- 体积最大的 30 个文件（`Get-ChildItem -Recurse | Sort Length -Desc | Select -First 30`）
- 体积最大的 20 个目录

**验证**：
- 基线构建成功（EXE 生成）
- `npm run verify:build` 通过
- 基线报告文件存在且填满真实数字（非占位符）

**Commit**：`chore: capture desktop-only baseline`

#### 0.5 对抗性审查 `docs/audits/phase-01-baseline-review.md`
审查内容：基线数字是否真实、是否含伪造的"优化前体积"、是否漏掉未跟踪文件分类。

---

### Phase 1：移动端 + 微信端依赖图核对

**目标**：基于 Phase 1 探索结果（两个搜索 agent 报告），生成一份"待删除 / 待修改"清单文件，作为后续阶段的执行依据。

**输出**：`docs/audits/phase-01-removal-inventory.md`

内容包含（直接来自搜索 agent 报告）：
- 待删除文件清单（runtime + tests + experiments + docs + design-demos）
- 待修改文件清单（main.js / preload.js / server.js / public/index.html / public/app.js / public/style.css / i18n-dict.js / verify-desktop-layout.js）
- 待删除 IPC 通道清单（8 个 mobile:* + 14 个 wechat:*）
- 待删除 HTTP 路由清单（35+ 个 /api/mobile/* + 5 个 /api/mobile-control/*）
- 待删除 npm 依赖（`qrcode`）
- `env.js` 共享文件的处理策略（移动到 `electron/shell-env.js`，更新 `mobile-agent-runner.js` 的 require——但 mobile-agent-runner.js 本身也要删，所以 env.js 直接随 mobile 模块一起删）
- `verify-desktop-layout.js` 的 `'mobile'` 项移除（L102、L107）
- `tests/e2e/windows-smoke.spec.js` 的 `wechat` 桥接检查移除（L72、L78 计数 9→7）

**Commit**：`docs: capture removal inventory`

---

### Phase 2：彻底移除 Mobile Access

**目标**：删除所有移动端运行时、IPC、HTTP 路由、UI、测试、文档。**仅删除 + 编辑，不重构桌面逻辑**。

#### 2.1 删除运行时文件（DELETE）
- `electron/mobile.js`
- `electron/mobile-sessions.js`
- `electron/mobile-agent-runner.js`
- `electron/mobile-contract.js`（未跟踪文件，直接 rm）
- `public/mobile/`（整个目录）
  - `public/mobile/index.html`
  - `public/mobile/mobile.js`
  - `public/mobile/mobile.css`
  - `public/mobile/assets/agents/{claude,codex,opencode,qoder}.svg`

#### 2.2 删除测试脚本（DELETE）
- `scripts/smoke-mobile-phase0a.js`
- `scripts/smoke-mobile-phase1.js`
- `scripts/smoke-mobile-phase2a.js`
- `scripts/smoke-mobile-chat-p0.js`
- `scripts/smoke-mobile-chat-send.js`
- `scripts/smoke-mobile-agent-stream.js`
- `scripts/smoke-mobile-agent-chat-p2.js`
- `scripts/smoke-mobile-desktop-parity.js`
- `scripts/smoke-mobile-projects-real.js`
- `scripts/smoke-mobile-ui-aionlike.js`
- `scripts/test-mobile-render.js`
- `scripts/verify-mobile-ui-smoke.js`
- `scripts/verify-mobile-backend-contract.js`

#### 2.3 删除实验目录（DELETE）
- `experiments/mobile-qa0/`（未跟踪）
- `experiments/mobile-qa1/`（含 `logs/manual-checklist.md`、`logs/qa1.log`、`screenshot-smoke.js`）
- `experiments/mobile-ui1a/`
- `experiments/mobile-ui1b/`
- `experiments/mobile-reframe-r2/`
- `experiments/mobile-ux-reframe/`
- `experiments/mobile-ux-polish/`
- `experiments/mobile-paseo-r1/`
- `experiments/mobile-paseo-r1-fix/`

#### 2.4 删除文档（DELETE）
- `docs/fanbox-mobile-current-map.md`
- `docs/mobile-backend-contract.md`
- `docs/mobile-convergence-roadmap.md`
- `docs/mobile-gap-to-paseo.md`
- `docs/paseo-mobile-reference-map.md`
- `docs/mobile-v2/`（整个目录，未跟踪，含 8 个文件）
- `.trae/documents/android-native-mobile-rewrite_plan.md`（未跟踪）
- `.trae/documents/mobile-b2c-followup-input_plan.md`（未跟踪）
- `.trae/documents/mobile-b3a-session-draft_plan.md`（未跟踪）
- `.trae/documents/mobile-b3b-start-draft-runner_plan.md`（未跟踪）
- `.trae/documents/mobile-paseo-r1-fix-backend-final-verify.md`（未跟踪）
- `.trae/documents/mobile-paseo-r1-fix-finalize.md`（未跟踪）
- `.trae/documents/mobile-paseo-r1-fix-titles-chat-terminal.md`（未跟踪）
- `.trae/documents/mobile-ui1a-contract-home_plan.md`（未跟踪）
- `.trae/documents/mobile-ux-reframe-verification-commit_plan.md`（未跟踪）
- `.trae/documents/mobile-ux-reframe_plan.md`（未跟踪）
- `.trae/specs/rebuild-mobile-paseo-r1/`（整个目录，未跟踪）
- `.trae/documents/mobile-b2c-followup-input_plan.md`

#### 2.5 编辑运行时文件（EDIT）

**`electron/main.js`**（移除范围按行号引用 Phase 1 搜索结果）：
- L34：移除 `const mobile = require('./mobile.js');`
- L98-120：移除 `mobile.setDesktopTerminalProvider(...)` 整块
- L122-175：移除 `function safeTermHashForWrite(...)` 和 `mobile.setDesktopTerminalWriteProvider({...})` 整块
- L562：移除 `if (typeof teardownMobile === 'function') teardownMobile();` 调用（保留 `trySetDisableSleep(false)`）
- L1289-1429：移除整个 Mobile Access IPC 段（`_mobileHttpServer`、`reconcileMobileOnBoot`、8 个 IPC handler、`teardownMobile` 函数）
- 保留：所有 PTY、录像、剪贴板、文件监听、更新检测、合盖逻辑

**`electron/preload.js`**：
- L81-88：移除 `contextBridge.exposeInMainWorld('fanboxMobile', {...})` 整块
- L90-96：移除 `contextBridge.exposeInMainWorld('fanboxMobileApproval', {...})` 整块

**`server.js`**：
- L16-24：移除 `mobileMod()` 懒加载函数和 `_mobileMod` 变量
- L2434：移除 `let _mobileServer = null;`
- L2605-2672：移除整个 `/api/mobile-control/*` 路由块（5 个端点）
- 保留：`server.listen(PORT, '127.0.0.1', ...)` 主监听不动

**`public/index.html`**：
- L55-119：移除整个 `<div class="mobile-access sidebar-section" id="mobile-access" ...>` 块
- 保留：L179 的 `#term-wechat`（那是微信，Phase 3 处理）

**`public/app.js`**：
- L1233：移除 `SIDEBAR_SECTION_DEFAULTS` 中的 `mobile: false,` 单键
- L1262-1265：移除 `if (key === 'mobile' && typeof mobileAccess !== 'undefined') {...}` 整块
- L3136：移除 `mobileAccess.bind();`
- L4949-5071：移除 `const mobileApprovals = {...}` 整块（~123 行）
- L5073-5284：移除 `const mobileAccess = {...}` 整块（~212 行）
- 保留：`#term-wechat` 相关代码（Phase 3 处理）

**`public/style.css`**：
- 移除所有 `.mobile-access*`、`.mobile-icon`、`.mobile-device-*`、`.mobile-approval-*` 规则（L156、L398、L401-403、L483、L567-736）

**`public/i18n-dict.js`**：
- 移除 L25-51 全部移动端相关 i18n 键（~22 条）

**`scripts/verify-desktop-layout.js`**：
- L102：从 `want` 数组移除 `'mobile'`
- L107：移除 `assert('sidebar 含 mobile', ...)` 整行

**`tests/e2e/windows-smoke.spec.js`**：
- L72：从 `bridges` 对象移除 `wechat` 字段（Phase 3 一并处理）
- L78：把 `9 个 IPC 桥接全暴露` 改为 `7 个 IPC 桥接全暴露`（移除 mobile 和 wechat 后剩 7 个：pty/fs/clip/drop/rec/shot/win/update——wait, that's 8. Let me count again: fanboxPty, fanboxFs, fanboxClipboard, fanboxDrop, fanboxRec, fanboxShot, fanboxUpdate, fanboxWin, fanboxEnv, fanboxAgent = 10. After removing fanboxMobile + fanboxMobileApproval + fanboxWechat = 7. Actually: `bridges` object only checks 9 fields: pty/fs/clip/drop/rec/shot/win/wechat/update. After removing wechat: 8. Need to recount in implementation.)

#### 2.6 验证
- `node -e "require('./electron/main.js')"` 不抛异常（或跑 npm run app 启动到主窗口）
- `grep -ri "mobile" electron/ public/ scripts/ --exclude-dir=node_modules --exclude-dir=dist` 仅剩 CHANGELOG / docs 历史记录
- `npm run verify:build` 通过
- `npm test`（即 `tests/e2e/windows-smoke.spec.js`）通过（删除 mobile 断言后）
- 不监听 4580 端口（`netstat -ano | findstr :4580` 空）
- 不监听 0.0.0.0（`netstat -ano | findstr "0.0.0.0:4580"` 空）

**Commit**：`refactor: remove mobile access runtime`

#### 2.7 对抗性审查 `docs/audits/phase-02-mobile-removal-review.md`
审查内容：
- 是否仅隐藏 UI 而未删运行时
- 是否仍有 `require('./mobile')` 残留
- 是否仍有 `mobile:*` IPC 注册
- 是否仍有 `/api/mobile-control/*` 路由
- 是否监听 0.0.0.0
- 是否存在死 IPC（preload 暴露但 main 无 handler）
- 是否存在死 CSS（无对应 DOM）
- 是否存在死 i18n 键
- `verify-desktop-layout.js` 是否还有 `'mobile'` 残留

---

### Phase 3：彻底移除微信 ClawBot

**目标**：删除所有微信 / iLink / bridge / persona 运行时与 UI。

#### 3.1 删除运行时文件（DELETE）
- `electron/wechat/bridge.js`
- `electron/wechat/driver.js`
- `electron/wechat/ilink.js`
- `electron/wechat/memory.js`
- `electron/wechat/test-server.js`
- `electron/wechat/env.js`（注意：`electron/mobile-agent-runner.js` 在 Phase 2 已删，所以 env.js 的唯一引用者也消失了，env.js 可以直接删）
- 删除整个 `electron/wechat/` 目录

#### 3.2 删除测试 / 设计 demo（DELETE）
- `scripts/verify-wechat-bridge.js`
- `design-demos/wechat-clawbot-A-im.html`
- `design-demos/wechat-clawbot-A-im.png`
- `design-demos/wechat-clawbot-B-hara.html`
- `design-demos/wechat-clawbot-B-hara.png`
- `design-demos/wechat-clawbot-C-native.html`
- `design-demos/wechat-clawbot-C-native.png`

#### 3.3 删除文档（DELETE）
- `docs/07-微信ClawBot集成规划.md`
- `docs/08-微信ClawBot-参考与署名.md`

#### 3.4 编辑运行时文件（EDIT）

**`electron/main.js`**（在 Phase 2 基础上继续编辑）：
- L47：清理 `termTails` 注释中的"给微信 agent"措辞（保留代码）
- L410-411：移除 `let wechatStayAwake = false; let wechatConnected = false;`
- L241：移除 `wechatStayAwake = !!readConfig().wechatStayAwake;`
- L459-471：修改 `refreshLidGuard()`——
  ```js
  function refreshLidGuard() {
    if (process.platform !== 'darwin') return;
    const want = (lidIntent && terminals.size > 0);
    if (want === lidActive) return;
    const ok = trySetDisableSleep(want);
    if (want && !ok) { lidIntent = false; writeConfig({ lidStayAwake: false }); }
    lidActive = want && ok;
    buildMenu();
  }
  ```
- L679：清理 `termTails.set(id, tail)` 的"给微信 agent 看"注释
- L866：清理 `clip:save-image` 的"微信 Alt+A"注释（保留代码）
- L1166-1247：移除整个微信 ClawBot 段（`wechatBridge` require、`wechatInited`、`ensureWechat()`、14 个 `wechat:*` IPC handler、`wechat:setStayAwake` 对话框、`wechat:powerState`）

**`electron/preload.js`**：
- L98-119：移除整个 `contextBridge.exposeInMainWorld('fanboxWechat', {...})` 块

**`public/index.html`**：
- L179：移除 `<button id="term-wechat" ...>` 按钮（含 SVG 图标 + `#wechat-dot`）
- L191-192：移除 `<!-- 微信 ClawBot 面板 -->` 注释 + `<div id="wechat-view" class="wechat-view hidden"></div>`

**`public/app.js`**：
- L642：移除 `if (window.fanboxWechat) window.fanboxWechat.setCwd(state.cwd)` hook
- L2805-3140：移除整个 `const wechatView = {...}` 对象（~336 行）
- L3104：移除 `$('#term-wechat').onclick = () => wechatView.toggle();`
- L3106：移除 `if (window.fanboxWechat) window.fanboxWechat.env().then(...)`
- L3111、L3112、L3114、L3115、L3139：移除 5 处 `wechatView.close()` 调用（在 claude/codex/opencode/qoder/newtab 按钮处理中）
- L3798：移除 `if (typeof wechatView !== 'undefined' && wechatView.shown()) wechatView.close();`

**`public/style.css`**：
- L1400-1402：移除 `.wechat-view`、`.wechat-view.hidden`
- L1496-1501：移除 `.wx-persona*` 全部
- L1508-1511：移除 `.wechat-btn`、`.wechat-dot`

**`package.json`**：
- L74：移除 `"qrcode": "^1.5.4"`

**`package-lock.json`**：
- 由 `npm install` 自动重生成（删除 qrcode 节点及其独占传递依赖）

**`.gitignore`**：
- L59-61：移除 `# 微信 ClawBot 运行时登录态` 注释 + `*.ilink-token` + `ilink-sessions/`

**`tests/e2e/windows-smoke.spec.js`**（与 Phase 2 合并处理）：
- L72：移除 `bridges.wechat` 字段
- L78：调整计数（移除 wechat 后剩 8 个 bridges）

**`electron/mobile-sessions.js`**：已在 Phase 2 删除（其 wechat 引用随之消失）

#### 3.5 依赖清理
- 运行 `npm install`（重生成 lockfile，移除 qrcode）
- 运行 `npm dedupe`
- 运行 `npm prune`

#### 3.6 验证
- `node -e "require('./electron/main.js')"` 不抛异常
- `grep -ri "wechat\|ClawBot\|ilink" electron/ public/ scripts/ --exclude-dir=node_modules --exclude-dir=dist` 仅剩历史 CHANGELOG / docs 引用
- 启动应用后无 `wechatBridge` require 错误
- 不创建 `%APPDATA%/FanBox/wechat/` 目录（启动后检查）
- `npm run verify:build` 通过
- `npm test` 通过

**Commit**：`refactor: remove wechat clawbot runtime`

#### 3.7 对抗性审查 `docs/audits/phase-03-wechat-removal-review.md`
审查内容：
- 是否还有 `require('./wechat/`
- 是否还有 `wechat:*` IPC 注册
- 是否还有 `window.fanboxWechat` 暴露
- `package.json` 是否还有 `qrcode`
- `node_modules/qrcode` 是否已删
- `refreshLidGuard` 是否已正确简化
- `wechatConnected` / `wechatStayAwake` 是否还有残留引用
- 是否误删了桌面 lid guard 功能
- 是否误删了普通终端能力

---

### Phase 4：修复隐私与安全问题

#### 4.1 不再读取 Claude OAuth Token
**`server.js`**：
- L1945-1996：移除 `claudeOAuthToken()` 函数
- 移除 `curlSysProxyLine()`（仅服务 OAuth）
- 移除所有调用 `claudeOAuthToken()` 的地方（搜索 `claudeOAuthToken` 全部引用）
- 移除对 `api.anthropic.com/api/oauth/usage` 的请求
- 在 `/api/agent-usage` 端点中：仅返回 Claude / Codex 本地 JSONL 统计
- UI 显示明确标识「仅显示本地使用记录」（修改 `public/app.js` 用量面板文案）
- 不伪造官方额度

**验证**：`grep -r "credentials.json\|api.anthropic.com\|claudeAiOauth" --exclude-dir=node_modules --exclude-dir=dist` 仅剩 CHANGELOG 历史记录

#### 4.2 终端录制默认关闭
**`electron/main.js`**：
- L569：`function recEnabled() { return process.env.FANBOX_NO_RECORD !== '1'; }` 改为：
  ```js
  function recEnabled() {
    try { return readConfig().recordingEnabled === true; }  // 默认 false
    catch { return false; }
  }
  ```
- L580：`MAX_FILES` 从 60 改为 20，`MAX_BYTES` 从 800MB 改为 200MB
- L588 `recStart`：默认不记录用户输入——只记录输出。在 `recEvent` 调用处区分 `'i'`（input）和 `'o'`（output），input 默认不写
- 新增 IPC `rec:clear`：一键清除所有录像
- 新增 IPC `rec:stats`：返回当前录像目录占用字节数 + 文件数
- 新增 IPC `rec:set-enabled`：开关录制（写入 config）
- `public/app.js` 设置页新增「终端录制」开关 + 「一键清除」按钮 + 占用显示

**兼容已有用户配置**：旧用户 `recordingEnabled` 未设置时默认 false（符合默认关闭语义）

#### 4.3 Electron 新窗口默认拒绝
**`electron/main.js`**：
- L222-225：替换 `setWindowOpenHandler`：
  ```js
  const ALLOWED_EXTERNAL = /^https:\/\/(github\.com|nodejs\.org|go\.dev|www\.python\.org|visualstudio\.microsoft\.com|electronjs\.org)\//;
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (ALLOWED_EXTERNAL.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'deny' };  // 默认全拒
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!/^http:\/\/localhost:\d+/.test(url)) e.preventDefault();
  });
  ```
- 拒绝 `javascript:` / `file:` / `data:` / `blob:` / 未知协议（在 `setWindowOpenHandler` 默认 deny 中已覆盖）

#### 4.4 添加 CSP
**`electron/main.js`** 在 `createWindow` 之前：
```js
session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
  cb({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' http://localhost:* http://127.0.0.1:*",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
      ].join('; ')
    }
  });
});
```

**注释说明**：`connect-src` 包含 localhost 是因为渲染层 fetch 后端（4567 端口）；`style-src 'unsafe-inline'` 是因为 Monaco / Milkdown 内联样式需要；`img-src blob:` 是因为截图缩略图走 blob URL。

#### 4.5 IPC sender 验证
**`electron/main.js`** 新增：
```js
function assertTrustedSender(event, allowedOrigins) {
  const url = event.senderFrame ? event.senderFrame.url : '';
  const allowed = allowedOrigins || [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
  if (!url || !allowed.some(o => url.startsWith(o))) {
    throw new Error('untrusted_sender');
  }
}
```
在高权限 IPC 处理器首行调用：
- `pty:spawn`、`pty:input`、`pty:resize`、`pty:kill`
- `fs:trash`、`fs:watch-set`、`fs:watch`
- `clip:image`、`clip:file`、`clip:save-image`、`clip:save-paste-text`
- `drop:save`、`drop:save-into`、`drop:copy-into`
- `rec:read`、`rec:delete`、`rec:save-export`、`rec:export`
- `update:open`
- `agent:which`

#### 4.6 IPC 参数验证
**`electron/main.js`** 新增轻量 validator（不引入 schema 库）：
```js
const validators = {
  id: (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v),
  pathStr: (v) => typeof v === 'string' && v.length > 0 && v.length < 4096 && !v.includes('\0'),
  cols: (v) => Number.isInteger(v) && v >= 10 && v <= 400,
  rows: (v) => Number.isInteger(v) && v >= 2 && v <= 200,
  bufLen: (v) => typeof v === 'string' && v.length <= 50 * 1024 * 1024,  // 50MB
  filename: (v) => typeof v === 'string' && v.length > 0 && v.length < 255 && !/[<>:"/\\|?*\x00]/.test(v),
};
```
在 `pty:spawn` 校验 id / cols / rows / cwd（存在且是目录），在 `pty:input` 校验 id / data 长度，在 `drop:save-into` 校验 buf 大小，等。

**Commit**：`security: harden desktop electron boundaries`

#### 4.7 对抗性审查 `docs/audits/phase-04-security-review.md`
审查内容：
- 是否仍读 OAuth token
- 是否仍有默认开启的录像
- 是否仍有未校验 sender 的高权限 IPC
- CSP 是否过于宽松（`*`）
- 是否仍能通过 `will-navigate` 跳转

---

### Phase 5：修复稳定性问题

#### 5.1 PTY 输出缓冲硬上限
**`electron/main.js`** L657-674：把
```js
let outputBuf = '';
// ...
outputBuf += data;
```
改为：
```js
const MAX_OUTPUT_BUFFER = 64 * 1024;
let outputBuf = '';
// ...
outputBuf = (outputBuf + data).slice(-MAX_OUTPUT_BUFFER);
```

#### 5.2 主进程终端数量限制
**`electron/main.js`** 新增：
```js
const MAX_TERMINALS = 10;
```
在 `pty:spawn` handler 开头：
```js
if (terminals.size >= MAX_TERMINALS) {
  return { ok: false, error: 'max_terminals_reached' };
}
```
校验 `id` 不重复：
```js
if (terminals.has(id)) return { ok: false, error: 'duplicate_id' };
```

#### 5.3 退出时完整清理
**`electron/main.js`** `window-all-closed` / `before-quit`：
- 遍历 `terminals` kill + delete
- 遍历 `termTails`、`termMeta`、`termEvents` delete
- 遍历 `recorders`：`stream.end()` + delete
- 遍历 `watchers`：`w.close()` + delete
- 清 `outputFlushTimer` 等 timer

#### 5.4 大型 JSONL 流式读取
**`electron/project-memory.js`** 或读取 Claude/Codex JSONL 的地方：
- 搜索 `Buffer.alloc(fileSize)` 或 `readFile` 整文件读取的位置
- 改用 `readline` 模块逐行流式读取
- 加最大文件读取预算（如 50MB）
- 加最大扫描文件数（如 200）
- 加超时（5s）
- 截断结果提示

#### 5.5 跨盘目录移动
**`server.js`** `move` 路由：搜索 `EXDEV` 处理
- 区分文件 / 目录 / 符号链接
- 目录跨盘移动：递归复制（`fs.cpSync` 或自实现）+ 全部成功后删源
- 失败时不删源
- 符号链接：重建而非复制

#### 5.6 统一路径边界检查
**`electron/main.js`** 新增工具 `electron/safe-path.js`：
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
```
替换 `electron/main.js:907` 的 `absDir.startsWith(homeDir)` 为 `isInside(absDir, homeDir)`
HTML 预览白名单（`server.js`）也用 `isInside`

#### 5.7 Windows 安全打开 API
**`electron/main.js`** `shell.openPath` / `shell.showItemInFolder` 替代 `start` / `explorer /select`，`spawn` 用 `shell: false`

**Commit**：`perf: reduce runtime caches and blocking scans`

#### 5.8 对抗性审查 `docs/audits/phase-05-stability-review.md`
审查内容：
- 是否仍有 `Buffer.alloc(fileSize)` 整读
- 是否仍有 `startsWith` 路径检查
- 跨盘移动是否正确
- 主进程终端限制是否生效
- 退出时是否泄漏 timer / watcher

---

### Phase 6：缩小生产安装包

#### 6.1 添加严格的 electron-builder files 白名单
**`package.json`** `build` 字段：
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
  "mac": { ... 保持不变 ... },
  "win": { ... 保持不变 ... },
  "dmg": { ... 保持不变 ... }
}
```

**运行时验证**：实际启动一次 `dist/win-unpacked/FanBox.exe`，确认：
- 主窗口打开
- 文件浏览可用
- 终端可 spawn
- Markdown 预览可用（milkdown vendor 加载）
- 代码高亮可用（hljs vendor 加载）
- Monaco 编辑器可用
- xterm 可用
- 缩略图可用

#### 6.2 删除废弃根目录 main.js
- 搜索根目录 `main.js` 引用：`grep -rn "require.*'./main'\|require.*'./main.js'" --exclude-dir=node_modules --exclude-dir=dist`
- 若无引用，删除 `i:\AI_weflow\fanbox-master\main.js`
- 确认 `package.json.main` 唯一指向 `electron/main.js`

#### 6.3 清理 dependencies
**`package.json`**：
- 移除 `qrcode`（Phase 3 已删）
- 检查 `dependencies` 每项是否运行时必需：
  - `@xterm/*`、`node-pty` —— 桌面运行时必需，保留
  - `qrcode` —— 已删
- 检查 `devDependencies` 是否误放在 `dependencies`：无
- 运行 `npm install` → `npm dedupe` → `npm prune`

#### 6.4 审计 public/vendor
- `public/vendor/monaco/vs/basic-languages/`：保留 powershell、bat、javascript、typescript、json、css、html、markdown、python、shell、yaml 等 ~15 种桌面实际用到的语言，删除其他 60+ 种未使用语言
- `public/vendor/monaco/vs/language/`：保留 cssWorker、htmlWorker、jsonWorker、tsWorker，删除其他
- `public/vendor/monaco/vs/nls.messages.*.js`：保留 `zh-cn`，删除其他 7 种 locale（de/es/fr/it/ja/ko/ru/zh-tw）
- `public/vendor/milkdown/KaTeX_*`：若 Milkdown Crepe 不渲染 LaTeX 公式，可全部删除（需先验证 Markdown 预览是否触发 KaTeX）
- `public/vendor/hljs/styles/`：保留 github-dark + github，删除其他

**验证**：删除后启动应用，确认 Monaco / Milkdown / hljs 仍正常工作。

#### 6.5 不依赖 maximum compression 制造假优化
- 测试 `compression: normal` vs `compression: maximum`，记录构建时间和体积差
- 若 maximum 体积差 < 1MB 且构建时间增加 > 50%，保持 normal

**Commit**：`build: add strict electron-builder file whitelist`

#### 6.6 对抗性审查 `docs/audits/phase-06-packaging-review.md`
审查内容：
- 白名单是否过严导致运行时缺文件
- 白名单是否过松导致 docs / experiments / tests 进入
- `app.asar` 顶层是否还有 `electron/mobile*` / `electron/wechat/` / `public/mobile/`
- node-pty 是否正确 unpack
- vendor 是否误删桌面必需资源

---

### Phase 7：运行时磁盘占用优化

#### 7.1 缩略图缓存
**`server.js`** 缩略图缓存：
- 默认上限 400MB → 150MB
- 新增 IPC `cache:thumb-stats` 返回当前占用
- 新增 IPC `cache:thumb-clear` 一键清理
- 清理失败不影响主程序
- 设置页显示占用 + 一键清理按钮

#### 7.2 终端录像（与 Phase 4.2 整合）
- 默认关闭
- 开启后上限 200MB / 20 文件（已在 Phase 4.2 调整）
- 设置页一键清理 + 占用显示（已在 Phase 4.2 实现）

#### 7.3 临时拖拽文件 `fanbox-drops`
**`electron/main.js`** 启动时：
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
- 只清理 `fanbox-drops` 自己的目录，不误删用户文件

**Commit**：`perf: cap runtime caches and drop temp`

---

### Phase 8：构建可复现性 + CI

#### 8.1 验证 node-pty 可复现
```bash
rm -rf node_modules
npm ci
npm run rebuild
npm run verify:build
```
确认干净环境可复现。

#### 8.2 新增 GitHub Actions Windows CI
**`.github/workflows/windows-desktop.yml`**：
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

#### 8.3 生产包内容守卫 `scripts/verify-desktop-package.js`（新增）
脚本功能：
- 读取 `dist/win-unpacked/resources/app.asar`（用 `npx asar list`）
- 断言以下路径**不存在**：
  - `electron/mobile.js` / `electron/mobile-` / `electron/wechat/`
  - `public/mobile/`
  - `experiments/` / `design-demos/` / `docs/`
  - `smoke-mobile` / `verify-mobile` / `ClawBot` / `ilink` / `mobile-control`
- 断言以下路径**存在**：
  - `electron/main.js` / `electron/preload.js`
  - `server.js`
  - `public/index.html` / `public/app.js` / `public/style.css`
  - `node_modules/node-pty`
- 输出：
  - EXE 体积
  - app.asar 体积
  - app.asar.unpacked 体积
  - win-unpacked 体积
  - 最大 20 个打包文件
- 退出码 0 / 1

#### 8.4 在 `package.json` 添加脚本
```json
"scripts": {
  ...
  "verify:desktop": "node scripts/verify-desktop-package.js"
}
```

**Commit**：`test: add desktop-only packaging assertions + windows CI`

---

### Phase 9：桌面端回归测试

扩展 `tests/e2e/windows-smoke.spec.js` 增加新断言（不删旧断言）：
- 启动后只有一个主窗口
- 不出现 Mobile Access 元素（`#mobile-access` 不存在）
- 不出现微信按钮（`#term-wechat` 不存在）
- 不强制 always-on-top（生产模式）：检查 `app.focus({ steal: true })` 只在 `FANBOX_DEV=1` 时调用
- 终端最多 10 个：尝试 spawn 第 11 个被主进程拒绝
- PTY 输出高吞吐时内存不持续增长（spawn 一个 `yes` 命令 5 秒，检查主进程内存增量 < 50MB）
- 跨盘移动文件（在 C: → D: 测试，若无 D: 跳过）
- symlink 不能绕过预览白名单（创建 symlink 指向 `~/.ssh`，预览应拒绝）
- 录像默认关闭：检查 `~/.fanbox/config.json` 中 `recordingEnabled !== true`，或新终端 spawn 后 `recordings/` 目录无新 `.cast` 文件
- 缩略图缓存上限：检查 `thumbnails/` 总大小 ≤ 150MB（或可配置）

**Commit**：`test: extend desktop regression for security and stability`

---

### Phase 10：文档更新

#### 10.1 更新 `README.md`
**移除**：
- L30：「微信 ClawBot 手机控制」描述
- L43：「微信 ClawBot Windows 运行验证」
- L82-83：微信 Alt+A / 复制文件相关的微信部分（保留剪贴板本身）
- L101-106：微信 bridge / ClawBot 链路验证通过条目
- L119：「使用微信 ClawBot 需要...」
- L120：「微信凭据」描述
- L172：微信 ClawBot 相关条目
- L232-237：「微信二维码无法登录」FAQ
- L248：架构表中的「微信」行
- L260-263：架构图中的 `wechat/` 子目录
- L275：scripts 列表中的 `verify-wechat-bridge.js`
- L293-295：Roadmap 中的微信 ClawBot 已完成项

**新增 / 修改**：
- L16：Release badge 改为 `2.7.0`（或新版本号）
- L30：标语改为「文件浏览 + 搜索 · 内嵌终端 · Claude Code / Codex / OpenCode / Qoder · 本地优先」
- 新增「不提供」段落：「FanBox 是 Windows 桌面端本地 AI Coding Cockpit。不提供手机端。不提供局域网远程控制。不提供微信控制。不内置任何 Agent。不自动安装任何 CLI。不读取 Claude/Codex Token。」
- L169：「不上传 Claude/Codex 本地记录」改为「不读取 Claude/Codex OAuth Token。用量统计仅读本地 JSONL 文件，不联网。」
- 版本号字段统一从 `package.json` 自动读取或保持单一事实源

#### 10.2 更新 `CHANGELOG.md`
- `[Unreleased]` 段新增 `Removed` 子段，列出本次删除的移动端 + 微信模块
- 修正 v2.6.0 段中的 mobile/wechat 历史条目（保留作为历史记录，不删——但要在新版本里声明已撤销）

#### 10.3 更新 `docs/release-v2.6.0.md`
- 若文件存在，加注「此版本含移动端 + 微信，已在 v2.7.0 移除」
- 或直接归档到 `docs/archive/release-v2.6.0.md`

#### 10.4 删除 `architecture-review-20260625.html` 或归档
- 此文件未跟踪，含大量 mobile/wechat 架构引用
- 决策：移到 `docs/archive/architecture-review-20260625.html`，加 README 说明这是改造前的快照

**Commit**：`docs: update desktop-only documentation`

---

### Phase 11：最终体积报告与对抗性审查

#### 11.1 最终体积报告 `docs/audits/desktop-only-final-report.md`

报告必须包含改造前后对比表格：

| 指标 | 改造前 | 改造后 | 变化 |
|---|---|---|---|
| EXE | （Phase 0 实测） | （Phase 6 实测） | -X MB (-Y%) |
| win-unpacked | | | |
| app.asar | | | |
| app.asar.unpacked | | | |
| production dependencies 数 | 5 | 4 | -1 (qrcode) |
| app.asar 文件数 | | | |
| 启动监听端口数 | 2 (4567 loopback + 4580 0.0.0.0) | 1 (4567 loopback) | -1 |
| Electron 主进程代码量 | 1428 行 | ~1100 行 | -328 行 |
| preload API 数量 | 12 (含 mobile/wechat) | 9 | -3 |
| 移动端代码文件数 | 33+ | 0 | -33 |
| 微信代码文件数 | 14+ | 0 | -14 |

体积来源拆解：
- Electron / Chromium Runtime（固有下限，~80MB+）
- node-pty native files（~2-5MB）
- public/vendor（monaco / milkdown / xterm / hljs / marked，清理后预估 ~10-15MB）
- desktop application code（~500KB）
- images and icons（~1MB）
- other

**必须解释**：
- 哪些体积是 Electron 固有下限（不迁移 Tauri 无法消除）
- 哪些体积已成功删除（mobile + wechat + 测试 + docs + experiments + vendor 清理）
- 哪些资源仍较大（vendor monaco）
- 是否值得未来迁移技术栈（保留 Tauri 选项作为未来考量）
- 当前不迁移 Tauri 的理由（重写成本高，破坏桌面稳定性）

#### 11.2 最终对抗性审查 `docs/audits/phase-06-final-adversarial-review.md`

完整核对 §18 验收清单的 40+ 项。结论只能是 PASS / REVISE / REJECT。存在 P0 问题时不得给 PASS。

**Commit**：`docs: final report and adversarial review`

---

## 四、Assumptions & Decisions 假设与决策

### 4.1 假设
1. `npm ci` + `npm run rebuild` + `npm run dist:win` 在干净 Windows 环境（Node 22 + Python 3.11 + VS Build Tools 2022）可成功复现
2. `electron/mobile-contract.js` 是未跟踪文件且无任何 `require('./mobile-contract')` 引用，可直接删
3. `electron/wechat/env.js` 唯一非微信引用者是 `electron/mobile-agent-runner.js:32`，而该文件在 Phase 2 已删，所以 env.js 在 Phase 3 可直接删
4. `public/vendor/monaco/vs/basic-languages/` 中 60+ 种语言文件，桌面实际只用 ~15 种
5. `Milkdown KaTeX_*` 字体只在 Markdown 渲染 LaTeX 公式时使用，可安全删除（需先验证）
6. 根目录 `main.js` 不在 `package.json.main`，是废弃文件
7. `architecture-review-20260625.html` 是改造前的快照，归档即可
8. `_m3-*/_m4-*/_m5-*` 31 个根目录脚本是外部 `fanbox-mobile-v2` Flutter 项目脚手架，不属于 FanBox 桌面，可直接删

### 4.2 决策
1. **不重写 UI**：保留现有桌面 SPA，仅删除 mobile/wechat DOM 子树
2. **不迁移 Tauri**：保持 Electron 33，体积下限由 Chromium Runtime 决定，不为了数字破坏稳定性
3. **不引入 schema 库**：IPC 参数校验手写 validator，避免 `ajv` 等依赖增加体积
4. **CSP `style-src 'unsafe-inline'`**：Monaco / Milkdown 需要内联样式，无法避免（在代码中加注释说明）
5. **CSP `connect-src 'self' http://localhost:*`**：渲染层 fetch 后端必须放行 localhost，加注释说明
6. **保留 `verify:paths.js`**：但需更新其内容，删除微信路径相关条目
7. **保留 `architecture-review-20260625.html`**：移到 `docs/archive/`，不删除历史
8. **保留 `CHANGELOG.md` v2.6.0 段中的 mobile/wechat 条目**：作为历史记录不删，但在新版本 `[Unreleased]` 段明确声明已撤销
9. **`docs/mobile-v2/` 整个目录删除**：未跟踪文件，纯规划文档
10. **`_m3-*/_m4-*/_m5-*` 全部删除**：与 FanBox 桌面无关，且会污染生产包白名单
11. **`experiments/{bugfix-202606,drag-path-test,local-model-202606,readme-shots}` 保留**：不是移动端
12. **`scripts/{verify-agent-driver.js,verify-paths.js,verify-soft-terminal-colors.js,verify-desktop-layout.js,electron-smoke-main.js,rebuild-win.js,run-app.js}` 保留**：桌面必需
13. **`public/_e2e_check.html` / `_real_check*.html` / `_real_claude.txt`**：未跟踪的开发临时文件，删除
14. **`docs/release-v2.6.0.md`**：未跟踪，归档到 `docs/archive/`
15. **`docs/09-FanBox-Agent架构设计-记忆上下文自进化.md`**：保留，但编辑 L68/L83 移除 wechat bridge 引用
16. **`docs/aionui-parity-plan.md`**：保留，编辑 L46/L47/L283/L367/L487 移除 mobile/wechat 对比
17. **`docs/superpowers/specs/2026-06-18-fanbox-windows-migration-design.md`**：保留，编辑移除 wechat 章节

### 4.3 风险与降级
1. **风险**：Phase 6.1 白名单过严，运行时缺文件
   - **降级**：每删一类文件都先启动应用验证，回退最后一次删除
2. **风险**：Phase 6.4 删了 vendor 后 Monaco/Milkdown 报错
   - **降级**：先在测试 build 验证，若报错把删除范围缩小
3. **风险**：Phase 5.4 流式读取改写后 JSONL 解析行为变化
   - **降级**：保留旧实现作为 fallback，新实现加 feature flag
4. **风险**：Phase 4.3 强 deny 导致某些桌面功能（如 Monaco worker）打开新窗口失败
   - **降级**：先用 `console.log` 打印所有被 deny 的 URL，跑一遍桌面核心流程收集真实需求，再调整 allowlist

---

## 五、Verification Steps 验证步骤

### 5.1 每阶段验证（强制）
每个 Phase 结束后必须运行：
```bash
npm run verify:build         # node-pty 加载
node -e "require('./electron/main.js')" 2>&1 | head  # 语法检查（Ctrl+C 退出）
npm test                     # e2e smoke
grep -ri "<phase-keyword>" electron/ public/ scripts/ --exclude-dir=node_modules --exclude-dir=dist
```

### 5.2 最终验收清单（§18 全部满足才算完成）

执行顺序：
1. `git checkout refactor/desktop-only-hardening` → 验证分支存在
2. `git tag | grep archive/full-v2.6.0` → 验证回退标签存在
3. 启动 `dist/win-unpacked/FanBox.exe`：
   - 主窗口正常
   - 只有一个窗口
   - 不出现 `#mobile-access`
   - 不出现 `#term-wechat`
   - 不强制 always-on-top
4. 文件能力：C 盘浏览 / 中文路径 / 空格路径 / 文本编辑 / 文件创建 / 重命名 / 同盘移动 / 跨盘移动 / 删除到回收站
5. 预览：Markdown / HTML 隔离 / 图片 / PDF
6. 终端：新建 / 最多 10 个（第 11 被拒）/ PowerShell / 中文输出 / Claude 探测 / Codex 探测 / OpenCode 友好提示 / Qoder 友好提示
7. Skills 透视：列表 / 启用 / 禁用
8. 缓存：录像默认关闭 / 缩略图 ≤ 150MB / 一键清理 / 临时拖拽文件清理
9. `node scripts/verify-desktop-package.js` PASS
10. `npx asar list dist/win-unpacked/resources/app.asar | grep -E "mobile|wechat|docs|experiments"` 空
11. `netstat -ano | findstr ":4580 "` 空
12. `netstat -ano | findstr "0.0.0.0:4580"` 空
13. `grep -r "credentials.json\|api.anthropic.com" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git` 仅剩 CHANGELOG 历史记录
14. EXE 体积显著下降（目标 < 80MB，硬下限由 Electron Runtime 决定）
15. `docs/audits/desktop-only-final-report.md` 存在且填满真实数字
16. 6 份对抗性审查报告全部 PASS

### 5.3 最终回复格式
按用户 §20 要求的 17 节格式输出，必须包含真实测试输出和真实安装包体积。

---

## 六、执行顺序总览

| Phase | 名称 | Commit | 审查文件 |
|---|---|---|---|
| 0 | 前置准备与基线 | `chore: capture desktop-only baseline` | `phase-01-baseline-review.md` |
| 1 | 依赖图核对 | `docs: capture removal inventory` | （含在 01） |
| 2 | 移除 Mobile Access | `refactor: remove mobile access runtime` | `phase-02-mobile-removal-review.md` |
| 3 | 移除 WeChat ClawBot | `refactor: remove wechat clawbot runtime` | `phase-03-wechat-removal-review.md` |
| 4 | 隐私与安全加固 | `security: harden desktop electron boundaries` | `phase-04-security-review.md` |
| 5 | 稳定性修复 | `perf: reduce runtime caches and blocking scans` | `phase-05-stability-review.md` |
| 6 | 生产打包白名单 + 依赖清理 | `build: add strict electron-builder file whitelist` | `phase-06-packaging-review.md` |
| 7 | 运行时磁盘占用优化 | `perf: cap runtime caches and drop temp` | （含在 06） |
| 8 | CI + 守卫脚本 | `test: add desktop-only packaging assertions + windows CI` | （含在 06） |
| 9 | 桌面回归测试扩展 | `test: extend desktop regression for security and stability` | （含在 06） |
| 10 | 文档更新 | `docs: update desktop-only documentation` | （含在 06） |
| 11 | 最终体积报告 + 最终审查 | `docs: final report and adversarial review` | `phase-06-final-adversarial-review.md` |

**关键约束**：
- 每个 Phase 完成后必须运行 §5.1 验证
- 每个 Phase 必须独立 commit，不混合
- 每个 Phase 必须输出对应的对抗性审查文件
- 遇到测试失败不跳过，修复根因或回退
- 不手动复制 `.node` 文件伪造 node-pty 成功
- 不修改 Claude Code / Codex / OpenCode / Qoder 启动语义

---

## 七、Out of Scope 不在本次范围

- 不迁移 Tauri / Flutter / Qt / Neutralino
- 不重新设计桌面 UI
- 不改变 FanBox 桌面产品定位
- 不删除文件浏览 / 预览 / 终端 / Agent 启动等核心功能
- 不创建第二套状态系统
- 不大规模重写工作正常的桌面逻辑
- 不修改 Claude / Codex / OpenCode / Qoder 启动命令
- 不自动安装任何 Agent CLI
- 不读取 / 上传 / 分发用户凭据
- 不把开发文档 / 实验截图 / 测试 fixture 放进生产包

---

## 八、Phase 1 探索参考资料

本计划基于以下 Phase 1 探索结果：

### 8.1 已读关键文件
- `package.json`（87 行）
- `electron/main.js`（1428 行）
- `electron/preload.js`（119 行）
- `server.js`（前 600 行 + 关键 grep）
- `README.md`（371 行）
- `CHANGELOG.md`（前 100 行）
- `scripts/rebuild-win.js`（107 行）
- `scripts/verify-windows-build.js`（151 行）
- `scripts/verify-paths.js`（258 行）
- `tests/e2e/windows-smoke.spec.js`（378 行）
- `.gitignore`（64 行）

### 8.2 已运行搜索
- 两个 `search` agent 分别建立 Mobile Access 和 WeChat ClawBot 完整依赖图（结果见 Phase 1 输出，约 1500+ 行结构化 markdown）
- `grep` 验证 `credentials.json` / `api.anthropic.com` / OAuth usage 位置
- `grep` 验证 `MAX_TERMINAL_SESSIONS` / `outputBuf` 位置
- `git status` 确认工作区状态
- `git log` 确认 HEAD commit

### 8.3 关键发现摘要
- 移动端代码：33+ 文件，含 4 个 runtime（mobile.js 4548 行 + mobile-sessions.js 1839 行 + mobile-agent-runner.js 732 行 + mobile-contract.js 141 行）
- 微信代码：14+ 文件，含 6 个 runtime（bridge/driver/env/ilink/memory/test-server）
- 隐私问题：`server.js:1945-1996` 读取 `~/.claude/.credentials.json` 请求 `api.anthropic.com`
- 安全问题：`main.js:222-225` setWindowOpenHandler 拦截不全；无 will-navigate；无 CSP；IPC 无 sender 校验
- 稳定性：`main.js:657-674` outputBuf 无硬上限；MAX_TERMINAL_SESSIONS 只在前端
- 工作区脏：2 个已修改 mobile 文件 + 大量未跟踪文件
- 当前分支：master，HEAD：8150afc
- node-pty 可复现性：`scripts/rebuild-win.js` 已实现 patch + restore 机制，干净环境可复现
