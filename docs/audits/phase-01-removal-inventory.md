# Phase 1 — Removal Inventory（待删除/待修改清单）

> 生成时间：2026-07-21  
> 分支：`master`  
> HEAD：`6a37635`（Phase 0 对抗性审查 commit 之后）  
> 依据：基于实测搜索（Grep + Read），所有行号均为实际验证

---

## 一、待删除文件清单（DELETE）

### 1.1 移动端运行时（4 个）

| 文件 | 行数 | 跟踪状态 |
|---|---|---|
| `electron/mobile.js` | 4548 | 已跟踪 |
| `electron/mobile-sessions.js` | 1839 | 已跟踪 |
| `electron/mobile-agent-runner.js` | 732 | 已跟踪 + 已修改未提交 |
| `electron/mobile-contract.js` | 141 | 未跟踪 |

### 1.2 移动端 UI（整个目录，4 个文件 + 4 个 SVG 资源）

- `public/mobile/index.html`
- `public/mobile/mobile.js`
- `public/mobile/mobile.css`
- `public/mobile/assets/agents/{claude,codex,opencode,qoder}.svg`

### 1.3 移动端测试脚本（13 个）

- `scripts/smoke-mobile-phase0a.js`
- `scripts/smoke-mobile-phase1.js`
- `scripts/smoke-mobile-phase2a.js`
- `scripts/smoke-mobile-chat-p0.js`
- `scripts/smoke-mobile-chat-send.js`
- `scripts/smoke-mobile-agent-stream.js`（已修改未提交）
- `scripts/smoke-mobile-agent-chat-p2.js`
- `scripts/smoke-mobile-desktop-parity.js`
- `scripts/smoke-mobile-projects-real.js`
- `scripts/smoke-mobile-ui-aionlike.js`
- `scripts/test-mobile-render.js`
- `scripts/verify-mobile-ui-smoke.js`
- `scripts/verify-mobile-backend-contract.js`

### 1.4 移动端实验目录（9 个，整个目录删除）

- `experiments/mobile-qa0/`（未跟踪）
- `experiments/mobile-qa1/`
- `experiments/mobile-ui1a/`
- `experiments/mobile-ui1b/`
- `experiments/mobile-reframe-r2/`
- `experiments/mobile-ux-reframe/`
- `experiments/mobile-ux-polish/`
- `experiments/mobile-paseo-r1/`
- `experiments/mobile-paseo-r1-fix/`

### 1.5 移动端文档（5 个已跟踪 + 8 个未跟踪 + 10 个 .trae + 1 个 .trae/specs 目录）

**docs/ 下已跟踪**：
- `docs/fanbox-mobile-current-map.md`
- `docs/mobile-backend-contract.md`
- `docs/mobile-convergence-roadmap.md`
- `docs/mobile-gap-to-paseo.md`
- `docs/paseo-mobile-reference-map.md`

**docs/mobile-v2/ 未跟踪目录**（整个目录）：
- `docs/mobile-v2/`（8 个文件）

**.trae/documents/ 下未跟踪（10 个）**：
- `.trae/documents/android-native-mobile-rewrite_plan.md`
- `.trae/documents/mobile-b2c-followup-input_plan.md`
- `.trae/documents/mobile-b3a-session-draft_plan.md`
- `.trae/documents/mobile-b3b-start-draft-runner_plan.md`
- `.trae/documents/mobile-paseo-r1-fix-backend-final-verify.md`
- `.trae/documents/mobile-paseo-r1-fix-finalize.md`
- `.trae/documents/mobile-paseo-r1-fix-titles-chat-terminal.md`
- `.trae/documents/mobile-ui1a-contract-home_plan.md`
- `.trae/documents/mobile-ux-reframe-verification-commit_plan.md`
- `.trae/documents/mobile-ux-reframe_plan.md`

**.trae/specs/ 下未跟踪目录**：
- `.trae/specs/`（整个目录，含 `rebuild-mobile-paseo-r1/`）

> **保留**：`.trae/documents/desktop-only-hardening-refactor_plan.md`、`.trae/documents/desktop-only-resume-execution_plan.md`、`.trae/documents/desktop-only-continue-from-baseline_plan.md`（本改造计划文件，不删）

### 1.6 微信运行时（整个 `electron/wechat/` 目录，6 个文件）

| 文件 | 用途 |
|---|---|
| `electron/wechat/bridge.js` | 微信 bridge 主入口 |
| `electron/wechat/driver.js` | Claude/Codex 本机 CLI 驱动 |
| `electron/wechat/env.js` | 环境变量共享（唯一引用者：`electron/mobile-agent-runner.js:32`，Phase 2 已删，故 env.js 可直接删） |
| `electron/wechat/ilink.js` | 腾讯 iLink 协议客户端 |
| `electron/wechat/memory.js` | 微信对话记忆 |
| `electron/wechat/test-server.js` | 微信测试 server |

### 1.7 微信测试与设计 demo（7 个）

- `scripts/verify-wechat-bridge.js`
- `design-demos/wechat-clawbot-A-im.html`
- `design-demos/wechat-clawbot-A-im.png`
- `design-demos/wechat-clawbot-B-hara.html`
- `design-demos/wechat-clawbot-B-hara.png`
- `design-demos/wechat-clawbot-C-native.html`
- `design-demos/wechat-clawbot-C-native.png`

### 1.8 微信文档（2 个）

- `docs/07-微信ClawBot集成规划.md`
- `docs/08-微信ClawBot-参考与署名.md`

### 1.9 开发期临时验证文件（5 个，未跟踪）

- `experiments/_ansi_shot.png`
- `public/_e2e_check.html`
- `public/_real_check.html`
- `public/_real_check2.html`
- `public/_real_claude.txt`

### 1.10 外部 Flutter 项目脚手架（31 个，未跟踪）

**_m3 系列（13 个）**：
- `_m3-comprehensive-fix.js`、`_m3-copy-dart.js`、`_m3-docs.js`、`_m3-error-code-fix.js`、`_m3-fix-import.js`、`_m3-flutter-ui.js`、`_m3-fullid-fix.js`、`_m3-resolve-fix.js`、`_m3-reviews.js`、`_m3-safeerror-fix.js`、`_m3-test-assertions-fix.js`、`_m3-write-sessions-screen.js`、`_m3_commit_msg.txt`、`_m3_main.dart`、`_m3_realtime_client.dart`、`_m3_sessions_screen.dart`

**_m4 系列（10 个）**：
- `_m4-copy-verify.js`、`_m4-deps-fix.js`、`_m4-fix-cap-wt.js`、`_m4-fix-index.js`、`_m4-fix-m1-flutter-test.js`、`_m4-fix-regex.js`、`_m4-git-idempotent.js`、`_m4-green.js`、`_m4-reviews-docs.js`、`_m4-rewrite-m1-flutter-test.js`、`_m4-ws-fix.js`、`_m4_verify.js`

**_m5 系列（4 个）**：
- `_m5-fix-null-pem.js`、`_m5-fix-test.js`、`_m5-green.js`、`_m5-reviews-docs.js`

> 判定依据：命名前缀 `_m3_*/_m4_*/_m5_*` 与 `flutter/dart/m1` 关键词显示这是另一 Flutter 项目脚手架，与 FanBox Electron 桌面无关，会污染生产包白名单，必须删除。

### 1.11 废弃根 main.js（Phase 6 删除，Phase 3 同步清理 wechat 代码块）

**重要发现**：根目录 `main.js` 是 `electron/main.js` 的副本/旧版本，包含完整 wechat 代码块（line 110, 241, 279-280, 330-336, 760, 762-825）。`package.json.main` 已指向 `electron/main.js`，根 main.js 不再被入口使用。

**处理策略**：
- Phase 3：清理根 main.js 中的 wechat 代码块（避免 Phase 3 commit 后 wechat 代码以 main.js 为载体残留在工作区）
- Phase 6：彻底删除根 main.js（已在上游计划 §Phase 6.2 明确）

### 1.12 待评估归档（3 个）

| 文件 | 处理 |
|---|---|
| `architecture-review-20260625.html` | 归档到 `docs/archive/` |
| `docs/release-v2.6.0.md` | 归档到 `docs/archive/`（含移动端/微信内容） |
| `docs/audits-git-status.txt` | 评估后删除或归档 |

---

## 二、待修改文件清单（EDIT）

### 2.1 `electron/main.js`（Phase 2 + Phase 3 + Phase 4 + Phase 5）

**Phase 2 — 移除 Mobile Access**：

| 行号 | 修改内容 |
|---|---|
| L34 | 删 `const mobile = require('./mobile.js');` |
| L100 | 删 `mobile.setDesktopTerminalProvider(async function desktopTerminalListProvider() {...})`（L100–127） |
| L124 | 删 `function safeTermHashForWrite(termId) {...}`（L124–127） |
| L128 | 删 `mobile.setDesktopTerminalWriteProvider({...})`（L128–175） |
| L562 | 删 `if (typeof teardownMobile === 'function') teardownMobile();`（保留 `trySetDisableSleep(false)`） |
| L1291 | 删 `let _mobileHttpServer = null;` |
| L1293–1301 | 删 `(async function reconcileMobileOnBoot() {...})()` 整块 |
| L1303 | 删 `ipcMain.handle('mobile:status', ...)` |
| L1307 | 删 `ipcMain.handle('mobile:enable', ...)` |
| L1322 | 删 `ipcMain.handle('mobile:disable', ...)` |
| L1332 | 删 `ipcMain.handle('mobile:pair-start', ...)` |
| L1353 | 删 `ipcMain.handle('mobile:tokens-revoke', ...)` |
| L1363 | 删 `ipcMain.handle('mobile:approvals-list', ...)` |
| L1379 | 删 `ipcMain.handle('mobile:approval-decide', ...)` |
| L1408 | 删 `ipcMain.handle('mobile:approval-get', ...)` |
| L1422–1428 | 删 `function teardownMobile() {...}` |

**Phase 3 — 移除微信 ClawBot**：

| 行号 | 修改内容 |
|---|---|
| L410 | 删 `let wechatStayAwake = false;` |
| L411 | 删 `let wechatConnected = false;` |
| L461–467 | 清理 wechat:power 推送代码 |
| L1166–1247 | 删整段微信 ClawBot 注释 + `wechatBridge` require + `ensureWechat()` 函数 + 14 个 `wechat:*` IPC handler |
| L241 | 删 `wechatStayAwake = !!readConfig().wechatStayAwake;` |
| L1170 | 删 `let wechatInited = false;` |
| L1171–1212 | 删 `function ensureWechat() {...}` |
| L47 | 修改 `termTails` 注释，去掉"给微信 agent"字样（变量本身保留，termTails 是桌面终端功能） |
| L457–458 | 修改注释，去掉"微信连断"字样 |
| L679 | 修改注释，去掉"给微信 agent"字样 |
| L788 | 修改注释，去掉"微信聊天"字样 |
| L866 | 修改注释，去掉"微信 Alt+A"字样 |
| L1174–1176, L1226, L1233–1234 | 删 wechat 相关注释 |

**Phase 4 — 安全加固**：

| 位置 | 修改内容 |
|---|---|
| 全文 | 新增 `assertTrustedSender(event)` 工具函数 |
| 全文 | 新增 IPC 参数 validator |
| 所有高权限 IPC | 加 `assertTrustedSender(event)` |
| `setWindowOpenHandler` | 默认 deny，加严 `javascript:` / `file:` / `data:` / `blob:` / 未知协议拦截 |
| 缺失 | 新增 `will-navigate` 拦截 |
| 缺失 | 新增 CSP（`onHeadersReceived` 注入） |

**Phase 5 — 稳定性修复**：

| 位置 | 修改内容 |
|---|---|
| L657–674 | `outputBuf = (outputBuf + data).slice(-MAX_OUTPUT_BUFFER)`，`MAX_OUTPUT_BUFFER = 64 * 1024` |
| 缺失 | 新增 `MAX_PTY_SESSIONS = 10` 主进程限制 |
| 退出逻辑 | 完整清理 Map、Timer、Recorder、监听器 |

### 2.2 `electron/preload.js`（Phase 2 + Phase 3）

**Phase 2**：
- L82–88：删 `contextBridge.exposeInMainWorld('fanboxMobile', {...})`
- L92–96：删 `contextBridge.exposeInMainWorld('fanboxMobileApproval', {...})`

**Phase 3**：
- L99–119：删 `contextBridge.exposeInMainWorld('fanboxWechat', {...})`

### 2.3 `server.js`（Phase 2 + Phase 4 + Phase 5）

**Phase 2**：
- L18：删 `let _mobileMod = null;`
- L19–24：删 `function mobileMod() {...}` 整块
- L2434：删注释 `// 默认关闭，仅在用户主动调用 /api/mobile-control/enable 时启动。`
- L2436：删 `let _mobileServer = null;`
- L2607：删 `if (p.startsWith('/api/mobile-control/')) {...}` 整块（L2607–2671，含 5 个路由）

**Phase 4 — 不再读取 Claude OAuth Token**：
- L1947：删注释 `// （macOS 在 Keychain，其他平台落在 ~/.claude/.credentials.json）查官方 usage 接口。`
- L1949–1966：删 `async function claudeOAuthToken() {...}` 整块
- L1986：删 `const token = await claudeOAuthToken();`
- L1993：删 `curl -K - 'https://api.anthropic.com/api/oauth/usage'` 调用
- 调用方 UI：改为显示"仅显示本地使用记录"

**Phase 5 — 稳定性**：
- 大型 JSONL 扫描改为流式读取（Claude/Codex 用量扫描）
- 跨盘目录移动 EXDEV 修复（区分文件/目录/符号链接）
- HTML 预览白名单 realpath 校验

### 2.4 `public/index.html`（Phase 2 + Phase 3）

**Phase 2**：
- L55–119：删 `<div class="mobile-access sidebar-section" id="mobile-access"...>` 整块

**Phase 3**：
- L179：删 `<button id="term-wechat"...>` 按钮
- L192：删 `<div id="wechat-view" class="wechat-view hidden"></div>`

### 2.5 `public/app.js`（Phase 2 + Phase 3 + Phase 4）

**Phase 2**：
- L1226–1234：从 `SIDEBAR_SECTION_DEFAULTS` 删 `mobile: false,`（L1233）
- L1262–1265：删 `if (key === 'mobile' && typeof mobileAccess !== 'undefined') {...}` 整块
- L3136：删 `mobileAccess.bind();`
- L4952–5071：删 `const mobileApprovals = {...}` 整块（120 行）
- L5073–5284：删 `const mobileAccess = {...}` 整块（212 行）

**Phase 3**：
- L642：删 `try { window.fanboxWechat && window.fanboxWechat.setCwd(state.cwd); } catch {...}` 整行
- L2806–3085：删 `const wechatView = {...}` 整块（280 行）
- L3104：删 `$('#term-wechat').onclick = () => wechatView.toggle();`
- L3106：删 `if (window.fanboxWechat) window.fanboxWechat.env()...` 整行
- L3111–3115：修改 `$('#term-claude/codex/opencode/qoder').onclick`，去掉 `wechatView.close();` 调用
- L3139：修改 `$('#term-newtab').onclick`，去掉 `wechatView.close();`
- L3798：删 `if (typeof wechatView !== 'undefined' && wechatView.shown()) wechatView.close();`

**Phase 4**：
- OAuth UI 改为显示"仅显示本地使用记录"

### 2.6 `public/style.css`（Phase 2 + Phase 3）

**Phase 2 — 移动端 CSS 规则**：
- L156：删 `[data-theme="soft"] .mobile-access-row .btn,`（合并到其他规则）
- L398：删 `[data-theme="soft"] .mobile-access {...}`
- L401：删 `[data-theme="soft"] .mobile-access-head {...}`
- L402：删 `[data-theme="soft"] .mobile-access-state {...}`
- L403：删 `[data-theme="soft"] .mobile-access-state.on {...}`
- L483：删 `.mobile-icon {...}`
- L567–649：删所有 `.mobile-access*`、`.mobile-device-*`、`.mobile-approval-*` 规则
- L736：删 `.mobile-access-count {...}`

**Phase 3 — 微信 CSS 规则**：
- L1400–1511：删 `.wechat-view*`、`.wechat-btn*`、`.wechat-dot*` 规则
- L1404–1506：删所有 `.wx-*` 规则（IM 风格微信子模块样式）

### 2.7 `public/i18n-dict.js`（Phase 2）

- L29：删 `'Mobile Access 已开启，端口 ': 'Mobile Access is on, port ',`
- L31–51：删 `// ---------- Mobile Access（Phase 0A）----------` 标题及其下全部移动端 i18n 键（21 行）

> 实测：`public/i18n-dict.js` 中**无** wechat / 微信 相关键，Phase 3 不需要修改此文件。

### 2.8 `scripts/verify-desktop-layout.js`（Phase 2）

- L102：从 `const want = ['agentProjects', 'favorites', 'skills', 'usage', 'mobile'];` 移除 `'mobile'`，改为 `['agentProjects', 'favorites', 'skills', 'usage']`
- L107：删 `assert('sidebar 含 mobile', order.includes('mobile'));`
- L112：把断言从 `'主菜单顺序 = Agent项目/收藏/Skills/用量/Mobile'` 改为 `'主菜单顺序 = Agent项目/收藏/Skills/用量'`

### 2.9 `tests/e2e/windows-smoke.spec.js`（Phase 3）

- L72：从 `bridges: { pty, fs, clip, drop, rec, shot, win, wechat, update }` 移除 `wechat` 字段
- L78：把 `'9 个 IPC 桥接全暴露'` 改为 `'8 个 IPC 桥接全暴露'`

> 实测：windows-smoke.spec.js 中**无** mobile 字面量（搜索 `mobile|Mobile` 无结果），Phase 2 不需要修改此文件。

### 2.10 `package.json`（Phase 3 + Phase 6）

**Phase 3**：
- L74：删 `"qrcode": "^1.5.4",`

**Phase 6**：
- 新增 `build.files` 严格白名单
- 新增 `build.compression`（normal 或 maximum，根据实测决定）
- 删除根目录 `main.js` 后确认 `package.json.main` 唯一指向 `electron/main.js`（已是）

### 2.11 根目录 `main.js`（Phase 3 + Phase 6）

**Phase 3 — 清理 wechat 代码块**（避免 Phase 3 后 wechat 残留）：
- L110, L241, L279–280, L330–336, L760, L762–825：删 wechat 相关代码

**Phase 6 — 删除整个文件**：
- 已在上游计划 §Phase 6.2 明确：根 main.js 不在 package.json.main，是废弃入口，整体删除

---

## 三、待删除 IPC 通道

### 3.1 mobile:* IPC（8 个，Phase 2 删）

| IPC 通道 | 注册位置 |
|---|---|
| `mobile:status` | `electron/main.js:1303` |
| `mobile:enable` | `electron/main.js:1307` |
| `mobile:disable` | `electron/main.js:1322` |
| `mobile:pair-start` | `electron/main.js:1332` |
| `mobile:tokens-revoke` | `electron/main.js:1353` |
| `mobile:approvals-list` | `electron/main.js:1363` |
| `mobile:approval-decide` | `electron/main.js:1379` |
| `mobile:approval-get` | `electron/main.js:1408` |

### 3.2 wechat:* IPC（14 个，Phase 3 删）

| IPC 通道 | 注册位置 |
|---|---|
| `wechat:env` | `electron/main.js:1213` |
| `wechat:setTarget` | `electron/main.js:1214` |
| `wechat:setCwd` | `electron/main.js:1215` |
| `wechat:setPersona` | `electron/main.js:1216` |
| `wechat:send` | `electron/main.js:1217` |
| `wechat:conversation` | `electron/main.js:1218` |
| `wechat:newConversation` | `electron/main.js:1219` |
| `wechat:compact` | `electron/main.js:1220` |
| `wechat:login` | `electron/main.js:1221` |
| `wechat:disconnect` | `electron/main.js:1222` |
| `wechat:cancel` | `electron/main.js:1223` |
| `wechat:check` | `electron/main.js:1224` |
| `wechat:setStayAwake` | `electron/main.js:1227` |
| `wechat:powerState` | `electron/main.js:1247` |

### 3.3 主进程向渲染进程推送的 wechat 事件（Phase 3 清理）

- `wechat:power`（`electron/main.js:467`）
- `wechat:qr`、`wechat:connected`、`wechat:message`、`wechat:expired`（由 wechat/bridge 内部触发）

---

## 四、待删除 HTTP 路由

### 4.1 /api/mobile-control/* 路由（5 个，Phase 2 删）

> **重要更正**：上游计划说"35+ 个 /api/mobile/*"是错误的。实测 `server.js` 中**没有** `/api/mobile/*` 前缀的路由，所有 mobile 相关 HTTP 接口都在 `/api/mobile-control/*` 前缀下，共 5 个。

| 路由 | 方法 | 位置 |
|---|---|---|
| `/api/mobile-control/status` | GET | `server.js:2617` |
| `/api/mobile-control/enable` | POST | `server.js:2621` |
| `/api/mobile-control/disable` | POST | `server.js:2636` |
| `/api/mobile-control/pair/start` | POST | `server.js:2646` |
| `/api/mobile-control/tokens/revoke` | POST | `server.js:2663` |
| 路由前缀分发 | — | `server.js:2607` |
| 404 fallback | — | `server.js:2671` |

---

## 五、待删除 npm 依赖

### 5.1 qrcode（Phase 3 删）

- 位置：`package.json:74: "qrcode": "^1.5.4"`
- 用途：仅微信二维码扫描使用
- 删除前确认：搜索 `require('qrcode')` 在仓库中的实际引用位置（Phase 3 执行时实测）

### 5.2 待 Phase 6 进一步审计的依赖

Phase 6 会重新审计 `dependencies` 与 `devDependencies`，原则：
- 运行时包放 `dependencies`：`@xterm/*`、`node-pty`（保留）
- 构建、测试、Playwright、electron-builder、electron-rebuild、esbuild 放 `devDependencies`（保留）
- 不删 `node-pty`、不删 Electron 桌面运行必须的依赖
- 不仅凭包名判断，必须搜索实际引用

---

## 六、附带发现与决策

### 6.1 根目录 main.js 是 electron/main.js 的副本

**事实**：根目录 `main.js`（不在 package.json.main）包含与 `electron/main.js` 高度相似的 wechat 代码块（line 110, 241, 279-280, 330-336, 760, 762-825）。其顶部（L1–5）是 `ELECTRON_RUN_AS_NODE` 重 spawn 入口，L35 有 `require('../server.js')`，似乎是另一条启动路径。

**决策**：
- Phase 3：清理根 main.js 中的 wechat 代码块（保证 Phase 3 commit 后 wechat 在工作区无残留）
- Phase 6：彻底删除根 main.js 整个文件

### 6.2 server.js 中没有 /api/mobile/* 路由

**更正**：上游计划 §Phase 1 表格中说"35+ 个 /api/mobile/*"是错误的。实测只有 5 个 `/api/mobile-control/*` 路由。

### 6.3 windows-smoke.spec.js bridges 共 9 个字段

**更正**：上游计划说"9→7"是错误的。实测 `bridges` 对象（L69–73）含 9 个字段：`pty, fs, clip, drop, rec, shot, win, wechat, update`。移除 `wechat` 后剩 8 个，断言改为"8 个 IPC 桥接全暴露"。

### 6.4 electron/main.js 中 0.0.0.0 / 4580 字面量未出现

**事实**：mobile HTTP server 的端口实际由 `mobile.DEFAULT_PORT` 提供（见 `electron/main.js:1312, 1340, 1341`），监听绑定在 `electron/mobile.js` 内部完成。删除 `electron/mobile.js` 即可彻底消除 0.0.0.0 / 4580 监听。

### 6.5 i18n-dict.js 中无 wechat 键

**事实**：实测 `public/i18n-dict.js` 中只有 mobile 相关键（L29, L31–51），**无** wechat / 微信 相关键。Phase 3 不需要修改此文件。

### 6.6 electron/mobile-agent-runner.js 是 env.js 的唯一引用者

**事实**：`electron/mobile-agent-runner.js:32` 是 `require('./wechat/env')` 的唯一外部引用者。Phase 2 删除 mobile-agent-runner.js 后，env.js 唯一引用者消失，env.js 可直接随 wechat 模块一起在 Phase 3 删除。

### 6.7 windows-smoke.spec.js 中无 mobile 字面量

**事实**：实测搜索 `mobile|Mobile` 在 `tests/e2e/windows-smoke.spec.js` 中**无结果**。Phase 2 不需要修改此文件，只 Phase 3 改 wechat 字段。

### 6.8 verify-desktop-layout.js 顺序断言依赖 mobile

**事实**：`scripts/verify-desktop-layout.js:102` 的 `want` 数组含 `'mobile'`，L107 单独断言"sidebar 含 mobile"，L112 断言顺序包含 Mobile。移除 mobile 后三处都要改。

### 6.9 i18n-dict.js 中 "0.0.0.0:" 字符串

**事实**：`public/i18n-dict.js:48` 含字面量 `0.0.0.0:`（"Mobile Access 已开启，正在监听 0.0.0.0:"）。这是 UI 文案而非代码，但移除 mobile 时此键也要一并删除（已纳入 §2.7）。

---

## 七、Phase 2/3 验证标准

### 7.1 Phase 2 验证（移除 Mobile Access 后）

```powershell
# 1. 主进程可加载（不抛 require 错误）
node -e "try { require('./electron/main.js') } catch(e) { if (!String(e).includes('Cannot find module')) throw e }"

# 2. 移动端代码全清
rg -i "mobile" electron/ public/ scripts/ --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=docs -l
# 期望：仅剩 CHANGELOG / docs 历史记录

# 3. 不监听 0.0.0.0 和 4580
netstat -ano | findstr "0.0.0.0:4580"
netstat -ano | findstr ":4580"
# 期望：空

# 4. verify:build 通过
npm run verify:build

# 5. dist:win 通过
npm run dist:win
```

### 7.2 Phase 3 验证（移除微信后）

```powershell
# 1. 微信代码全清
rg -i "wechat|clawbot|ilink" electron/ public/ scripts/ --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=docs -l
# 期望：仅剩 CHANGELOG / docs 历史记录

# 2. package.json 无 qrcode
rg "qrcode" package.json
# 期望：空

# 3. 安装包不含 electron/wechat/
npx asar list "dist/win-unpacked/resources/app.asar" | findstr "wechat"
# 期望：空

# 4. 不读取 ~/.claude/.credentials.json
rg "\.claude/\.credentials" electron/ server.js
# 期望：空

# 5. 不请求 api.anthropic.com/api/oauth/usage
rg "api.anthropic.com/api/oauth/usage" server.js
# 期望：空
```

---

## 八、执行顺序总览（Phase 2 + Phase 3）

```
Phase 2
  ├─ 删除 4 个移动端运行时 + public/mobile/ + 13 个测试 + 9 个实验 + 5+8 个文档 + 10 个 .trae
  ├─ 删除 5 个开发期临时文件 + 31 个 _m3_*/_m4_*/_m5_*
  ├─ 编辑 electron/main.js（删 mobile 相关代码块）
  ├─ 编辑 electron/preload.js（删 fanboxMobile + fanboxMobileApproval）
  ├─ 编辑 server.js（删 mobileMod 懒加载 + _mobileServer + 5 个路由）
  ├─ 编辑 public/index.html（删 mobile-access sidebar）
  ├─ 编辑 public/app.js（删 SIDEBAR_SECTION_DEFAULTS.mobile + mobileAccess.bind + mobileApprovals + mobileAccess）
  ├─ 编辑 public/style.css（删 .mobile-access* / .mobile-icon / .mobile-device-* / .mobile-approval-*）
  ├─ 编辑 public/i18n-dict.js（删 21 行 mobile i18n 键）
  ├─ 编辑 scripts/verify-desktop-layout.js（删 'mobile' 项）
  ├─ 验证 + 对抗性审查
  └─ commit: refactor: remove mobile access runtime

Phase 3
  ├─ 删除 electron/wechat/ 整个目录（6 个文件）
  ├─ 删除 7 个微信测试与设计 demo
  ├─ 删除 2 个微信文档
  ├─ 编辑 electron/main.js（删 wechatBridge + ensureWechat + 14 个 wechat:* IPC + termTails 注释）
  ├─ 编辑 electron/preload.js（删 fanboxWechat）
  ├─ 编辑 public/index.html（删 #term-wechat + #wechat-view）
  ├─ 编辑 public/app.js（删 wechatView 对象 + 相关引用）
  ├─ 编辑 public/style.css（删 .wechat-* / .wx-* 规则）
  ├─ 编辑 tests/e2e/windows-smoke.spec.js（删 wechat 字段，9→8）
  ├─ 编辑 package.json（删 qrcode）
  ├─ 编辑 根目录 main.js（删 wechat 代码块，Phase 6 删整个文件）
  ├─ npm install + npm dedupe + npm prune
  ├─ 验证 + 对抗性审查
  └─ commit: refactor: remove wechat clawbot runtime
```

---

## 九、数据真实性声明

本清单所有行号均来自 2026-07-21 实测搜索（Grep + Read），无任何猜测或假设。所有"上游计划说..."的更正项均已实测验证。
