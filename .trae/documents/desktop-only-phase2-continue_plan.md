# FanBox Desktop-Only 改造 — Phase 2 继续执行计划

> 计划版本：4.0（Phase 2 精确继续）
> 日期：2026-07-21
> 上游计划：
>   - `.trae/documents/desktop-only-hardening-refactor_plan.md`（1056 行）
>   - `.trae/documents/desktop-only-resume-execution_plan.md`（661 行）
>   - `.trae/documents/desktop-only-continue-from-baseline_plan.md`（18 节）
> 当前任务：完成 Phase 2 移除 Mobile Access 的混合文件编辑 + 验证 + 对抗性审查 + commit

---

## 一、当前状态

### 1.1 已完成（前序 commit）

| commit | 内容 |
|---|---|
| `e45a87a` | Phase 0 基线 + rebuild 修复（GetVer.bat 工作目录修复） |
| `6a37635` | Phase 0 对抗性审查 `docs/audits/phase-01-baseline-review.md` PASS |
| `cc078b1` | Phase 1 移除清单 `docs/audits/phase-01-removal-inventory.md` |

### 1.2 Phase 2 已完成（工作区未提交，git status D）

- `electron/mobile.js`、`electron/mobile-sessions.js`、`electron/mobile-agent-runner.js`（D）
- `public/mobile/` 整个目录（D）
- `scripts/smoke-mobile-*.js` 13 个（D）
- `scripts/test-mobile-render.js`、`scripts/verify-mobile-*.js` 2 个（D）
- `experiments/mobile-*` 9 个目录（D）
- `docs/fanbox-mobile-*.md`、`docs/mobile-*.md`、`docs/paseo-mobile-*.md`、`docs/mobile-v2/`（D）

### 1.3 Phase 2 待完成（混合文件编辑，基于真实行号）

`electron/mobile-contract.js` 已不存在（Glob 确认无 `electron/mobile*.js` 残留）。

**8 个混合文件待编辑**（行号已通过 Grep/Read 实际确认）：

| 文件 | 待删除范围 | 行数 |
|---|---|---|
| `electron/main.js` | L1208-1348（Mobile Access IPC 块整段） | 141 |
| `electron/preload.js` | L81-96（`fanboxMobile` + `fanboxMobileApproval` 两个 contextBridge） | 16 |
| `server.js` | L18-24（`_mobileMod` + `mobileMod()` 函数）+ L2434（注释）+ L2436（`_mobileServer` 声明）+ L2605-2672（5 个 `/api/mobile-control/*` 路由） | 80 |
| `public/index.html` | L55-119（整个 `<div class="mobile-access sidebar-section">` 块） | 65 |
| `public/app.js` | L1233（`mobile: false,` 一行）+ L1262-1265（`if (key === 'mobile'...)` 4 行）+ L3136（`mobileAccess.bind();` 一行）+ L4952-5071（`const mobileApprovals = {...}` 块 120 行）+ L5073-5284（`const mobileAccess = {...}` 块 212 行） | 339 |
| `public/style.css` | L156（`.mobile-access-row .btn` 软主题规则）+ L398-403（6 行 soft 主题）+ L567-649（83 行 `.mobile-access*` 主规则）+ L736（`.mobile-access-count` 单行） | 94 |
| `public/i18n-dict.js` | L29（1 行）+ L31-51（21 行 mobile i18n 键） | 22 |
| `scripts/verify-desktop-layout.js` | L6（注释尾部 `/ Mobile`）+ L102（`want` 数组移除 `'mobile'`）+ L107（删除 `assert('sidebar 含 mobile', ...)`）+ L112（修改断言文本去掉 `Mobile`） | 4 处 |

**根目录 `main.js`**：仍存在（Glob 确认 `i:\AI_weflow\fanbox-master\main.js`）。根据上游计划，根 `main.js` 是 `electron/main.js` 的副本（含完整 mobile + wechat 代码块），但它是废弃入口（`package.json.main` 指向 `electron/main.js`）。**Phase 2 不处理根 `main.js`，留给 Phase 6 彻底删除**——避免 Phase 2 与 Phase 6 编辑目标重叠，也避免 Phase 2 commit 范围扩散。

---

## 二、Phase 2 执行步骤

### 2.1 编辑 `electron/main.js`（删 L1208-1348）

整段删除 141 行：
- L1208-1210：`// ---------- Mobile Access（Phase 0A）----------` 注释 + `let _mobileHttpServer = null;`
- L1212-1220：`(async function reconcileMobileOnBoot() {...})()`
- L1222-1338：8 个 `ipcMain.handle('mobile:*', ...)` 处理器
  - `mobile:status` / `mobile:enable` / `mobile:disable` / `mobile:pair-start` / `mobile:tokens-revoke`
  - `mobile:approvals-list` / `mobile:approval-decide` / `mobile:approval-get`
- L1340-1346：`function teardownMobile() {...}`
- L1347-1348：尾注释

**前置条件确认**：之前的 3 处编辑（删除 `require('./mobile.js')`、`setDesktopTerminalProvider` 块、`teardownMobile()` 调用）已生效，无需重复。

**编辑方式**：用 `Edit` 工具，`old_string` 选取 L1208 到 L1348 整段连续文本（注意保留 L1349 之后的 `ipcMain.handle('fs:trash', ...)` 等内容不被影响）。

### 2.2 编辑 `electron/preload.js`（删 L81-96）

删除两个 `contextBridge.exposeInMainWorld` 块（共 16 行）：
- L81-88：`// Mobile Access（Phase 0A）` 注释 + `fanboxMobile`
- L90-96：`// Phase 2A-2.1：Mobile Approval Loop` 注释 + `fanboxMobileApproval`

**保留 L98-119 的 `fanboxWechat`**（Phase 3 处理）。

**编辑方式**：两次 `Edit`，分别删除两个块；中间空行也一并清理。

### 2.3 编辑 `server.js`（4 处）

**2.3.1 L18-24**：删除 `let _mobileMod = null;` + `function mobileMod() {...}` 函数（7 行）

**2.3.2 L2434**：删除注释 `// 默认关闭，仅在用户主动调用 /api/mobile-control/enable 时启动。`

**2.3.3 L2436**：删除 `let _mobileServer = null;`

**2.3.4 L2605-2672**：删除整个 `if (p.startsWith('/api/mobile-control/')) {...}` 块（68 行）
- 包含 5 个路由：`status` / `enable` / `disable` / `pair/start` / `tokens/revoke`
- 包含 loopback 校验、`mobileMod()` 调用、`_mobileServer` 启停逻辑

**编辑方式**：4 次 `Edit`，按从后往前顺序（先删 L2605-2672，再删 L2436、L2434、L18-24），避免行号偏移。

### 2.4 编辑 `public/index.html`（删 L55-119）

删除整个 `<div class="mobile-access sidebar-section" id="mobile-access"...>` 块（65 行）。
- 包含 `mobile-access-head`、`mobile-access-body`、URL 块、配对码、设备列表、approvals 区
- **保留 L54 的 `<div id="usage-body"...>`** 和 **L120 的 `<button id="settings-btn"...>`** 不受影响

**编辑方式**：单次 `Edit`，`old_string` 从 L55 `<div class="mobile-access` 到 L119 `</div>`（含尾随换行）。

### 2.5 编辑 `public/app.js`（5 处）

**2.5.1 L1233**：删除 `  mobile: false,` 一行（SIDEBAR_SECTION_DEFAULTS 中）

**2.5.2 L1262-1265**：删除 `if (key === 'mobile' && typeof mobileAccess !== 'undefined') {...}` 4 行

**2.5.3 L3136**：删除 `  mobileAccess.bind();` 一行

**2.5.4 L4952-5071**：删除 `const mobileApprovals = {...}` 块（120 行）

**2.5.5 L5073-5284**：删除 `const mobileAccess = {...}` 块（212 行）

**编辑方式**：5 次 `Edit`，按从后往前顺序（先删 L5073-5284，再删 L4952-5071，再删 L3136、L1262-1265、L1233）。

### 2.6 编辑 `public/style.css`（4 处）

**2.6.1 L156**：`[data-theme="soft"] .mobile-access-row .btn,` 单行（注意可能跨行到 L157，需读确认）

**2.6.2 L398-403**：`[data-theme="soft"] .mobile-access {...}` 等 6 行 soft 主题规则

**2.6.3 L567-649**：83 行 `.mobile-access*` 主规则块

**2.6.4 L736**：`.mobile-access-count {...}` 单行规则

**编辑方式**：4 次 `Edit`，从后往前顺序。每处先 Read 确认完整边界（含闭合 `}`）。

### 2.7 编辑 `public/i18n-dict.js`（删 L29, L31-51）

- L29：`'Mobile Access 已开启，端口 ': 'Mobile Access is on, port ',`
- L31-51：21 行 mobile i18n 键（注释 `// ---------- Mobile Access（Phase 0A）----------` + 20 个键值对）

**编辑方式**：先 Read L25-55 确认完整边界，再单次或两次 `Edit` 删除。

### 2.8 编辑 `scripts/verify-desktop-layout.js`（4 处）

**2.8.1 L6**：注释尾部 ` / Mobile` 改为去掉 `/ Mobile`

**2.8.2 L102**：`const want = ['agentProjects', 'favorites', 'skills', 'usage', 'mobile'];` 改为去掉 `'mobile'`：`['agentProjects', 'favorites', 'skills', 'usage']`

**2.8.3 L107**：删除 `assert('sidebar 含 mobile', order.includes('mobile'));` 一行

**2.8.4 L112**：`assert('主菜单顺序 = Agent项目/收藏/Skills/用量/Mobile', ...)` 改为 `assert('主菜单顺序 = Agent项目/收藏/Skills/用量', ...)`

**编辑方式**：4 次 `Edit`，先 Read L1-120 确认上下文。

---

## 三、验证步骤（Phase 2 收尾）

### 3.1 静态验证（无运行时启动）

```powershell
# 1. mobile 关键词扫描（应只剩 CHANGELOG 和历史 commit 引用）
rg -i "mobile:|fanboxMobile|fanboxMobileApproval|mobileAccess|mobileApprovals|_mobileHttpServer|_mobileServer|mobileMod|reconcileMobileOnBoot|teardownMobile|setDesktopTerminalProvider|setDesktopTerminalWriteProvider" electron/ public/ server.js scripts/ --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=docs
# 期望输出：空

# 2. /api/mobile-control/* 路由扫描
rg "/api/mobile-control/" server.js electron/ public/ --exclude-dir=node_modules --exclude-dir=dist
# 期望输出：空

# 3. 0.0.0.0 / 4580 端口扫描
rg "0\.0\.0\.0|:4580" electron/ server.js public/ --exclude-dir=node_modules --exclude-dir=dist
# 期望输出：空

# 4. require('./electron/mobile.js') 扫描
rg "require\(['\"]\./electron/mobile|require\(['\"]\./mobile" electron/ server.js --exclude-dir=node_modules --exclude-dir=dist
# 期望输出：空
```

### 3.2 模块加载验证

```powershell
# server.js 可独立加载（无 require error）
node -e "require('./server.js'); console.log('server.js OK')"
# 期望输出：server.js OK

# electron/main.js 可解析（无语法错误）
node --check electron/main.js
node --check electron/preload.js
node --check public/app.js
node --check public/i18n-dict.js
node --check scripts/verify-desktop-layout.js
```

### 3.3 桌面布局验证

```powershell
node scripts/verify-desktop-layout.js
# 期望：sidebar 主菜单 = Agent项目/收藏/Skills/用量，无 mobile
```

### 3.4 桌面核心功能回归（可选，无 Electron 启动时跳过）

```powershell
# 已有 verify:build（验证 node-pty native 加载）
npm run verify:build
```

### 3.5 对抗性审查

生成 `docs/audits/phase-02-mobile-removal-review.md`，结论只能是 `PASS` / `REVISE` / `REJECT`。审查项：

- 是否仍有 `mobile:` IPC 通道残留（rg 扫描）
- 是否仍有 `require('./electron/mobile.js')` 残留
- 是否仍有 `_mobileHttpServer` / `mobileMod()` / `_mobileServer` / `teardownMobile` / `reconcileMobileOnBoot` 残留
- 是否仍有 `/api/mobile-control/*` 路由残留
- 是否仍有 `fanboxMobile` / `fanboxMobileApproval` contextBridge 残留
- 是否仍有 `.mobile-access` CSS 规则残留
- 是否仍有 mobile i18n 键残留
- 是否仍有 `<div class="mobile-access` HTML 残留
- 是否仍有 `mobileAccess.bind()` / `mobileApprovals.refresh()` JS 调用残留
- `verify-desktop-layout.js` 是否同步更新（`want` 数组、assert 文本）
- 是否有 P0 问题（运行时崩、IPC 调用死代码、require 失败）

### 3.6 commit

```bash
git add electron/main.js electron/preload.js server.js public/index.html public/app.js public/style.css public/i18n-dict.js scripts/verify-desktop-layout.js
git add -u electron/mobile.js electron/mobile-sessions.js electron/mobile-agent-runner.js
git add -u public/mobile/
git add -u scripts/smoke-mobile-*.js scripts/test-mobile-render.js scripts/verify-mobile-*.js
git add -u experiments/mobile-*
git add -u docs/fanbox-mobile-*.md docs/mobile-*.md docs/paseo-mobile-*.md docs/mobile-v2/
git add docs/audits/phase-02-mobile-removal-review.md
git commit -m "refactor: remove mobile access runtime

- Delete electron/mobile.js, mobile-sessions.js, mobile-agent-runner.js
- Delete public/mobile/ web UI
- Delete scripts/smoke-mobile-*.js (13), verify-mobile-*.js (2), test-mobile-render.js
- Delete experiments/mobile-* (9 dirs)
- Delete docs/fanbox-mobile-*, docs/mobile-*, docs/paseo-mobile-*, docs/mobile-v2/
- Edit electron/main.js: remove 8 mobile:* IPC handlers + teardownMobile + reconcileMobileOnBoot (141 lines)
- Edit electron/preload.js: remove fanboxMobile + fanboxMobileApproval contextBridge (16 lines)
- Edit server.js: remove mobileMod() + _mobileServer + 5 /api/mobile-control/* routes (80 lines)
- Edit public/index.html: remove mobile-access sidebar section (65 lines)
- Edit public/app.js: remove SIDEBAR_SECTION_DEFAULTS.mobile + mobileAccess.bind + mobileApprovals + mobileAccess (339 lines)
- Edit public/style.css: remove .mobile-access* rules (94 lines)
- Edit public/i18n-dict.js: remove mobile i18n keys (22 lines)
- Edit scripts/verify-desktop-layout.js: drop 'mobile' from want array and assertions
- Adversarial review: docs/audits/phase-02-mobile-removal-review.md PASS"
```

**提交策略**：单一 commit 包含所有 Phase 2 变更（文件删除 + 混合文件编辑 + 对抗性审查文件）。`git add -u` 用于已跟踪的删除文件，避免遗漏；混合文件用 `git add <path>` 显式添加。

---

## 四、后续 Phase 提示（不在本计划范围内）

完成 Phase 2 commit 后，按上游计划顺序执行：

- **Phase 3**：移除 WeChat ClawBot（electron/wechat/ 6 文件 + bridge.js + driver.js + ilink.js + memory.js + persona + 14 个 wechat:* IPC + fanboxWechat contextBridge + #term-wechat 按钮 + #wechat-view + .wechat-* CSS + qrcode 依赖）
- **Phase 4**：修复隐私与安全（删除 Claude OAuth Token 读取 + 终端录制默认关闭 + Electron 新窗口默认 deny + CSP + IPC sender 校验 + IPC 参数校验）
- **Phase 5**：修复稳定性（PTY 输出缓冲硬上限 + 主进程终端数量限制 + 大型 JSONL 流式读取 + 跨盘目录移动 + realpath 路径边界 + shell.openPath）
- **Phase 6**：缩小安装包（electron-builder files 白名单 + 删根 main.js + 清理 dependencies + 审计 public/vendor）
- **Phase 7**：运行时磁盘优化（缩略图 150MB + 录像 200MB/20 文件 + fanbox-drops 24h 清理）
- **Phase 8**：CI + 守卫脚本（GitHub Actions Windows CI + verify-desktop-package.js）
- **Phase 9**：扩展桌面回归测试
- **Phase 10**：文档更新（README + CHANGELOG + 归档）
- **Phase 11**：最终体积报告 + 最终对抗性审查

---

## 五、关键决策与约束

### 5.1 决策

1. **不切分支**：尊重用户三次跳过 `git checkout -b` 的决定，直接在 `master` 上提交。回退点已由 `archive/full-v2.6.0-mobile-wechat` 标签保证。
2. **根 `main.js` 留给 Phase 6**：避免 Phase 2 编辑范围扩散到根 main.js（其内含 mobile + wechat 完整代码块，需 Phase 3 wechat 一并清理后再整体删除）。
3. **windows-smoke.spec.js 的 `wechat` 字段**：本 Phase 不动，留给 Phase 3 wechat 处理时同步更新（从 9 字段 → 8 字段）。
4. **`mobile-contract.js`**：Glob 确认已不存在，无需处理。
5. **commit 粒度**：Phase 2 单一 commit（包含文件删除 + 混合编辑 + 审查文件），符合上游计划建议结构 `refactor: remove mobile access runtime`。

### 5.2 严格约束（继承自上游计划）

- 禁止仅用 `display: none` 隐藏 UI（必须删 HTML 元素）
- 禁止保留失效 IPC（必须删 `ipcMain.handle` 注册）
- 禁止让 `server.js` 继续 `require('./electron/mobile.js')`
- 禁止保留 `0.0.0.0` 监听
- 禁止保留 4580 端口监听
- 禁止保留 `mobile` 测试/fixture（已通过文件删除完成）
- 禁止误删桌面核心功能（文件浏览、终端、Claude/Codex/OpenCode/Qoder 启动）
- 改完主动验证（rg 扫描 + node --check + verify:build）
- 不绕过测试、不跳过测试

### 5.3 风险与回退

- **风险 1**：编辑 `public/app.js`（5 处，最大单块 212 行）可能误删相邻代码。**缓解**：每处 `Edit` 前先 `Read` 确认完整边界（含闭合 `}` 和空行），用足够长的 `old_string` 保证唯一性。
- **风险 2**：编辑后行号偏移导致后续 Edit 失败。**缓解**：从文件末尾向前编辑，每次 Edit 后用 Grep 重新确认下一处行号。
- **风险 3**：删除 `mobileMod()` 后 `server.js` 启动失败。**缓解**：删除后立即 `node -e "require('./server.js')"` 验证。
- **回退**：若任何步骤失败，`git restore <file>` 单文件回退；若整 Phase 2 失败，`git reset --hard HEAD` 回到 `cc078b1`（Phase 1 commit）。

---

## 六、最终验收条件（Phase 2）

- [ ] 8 个混合文件全部编辑完成
- [ ] `rg -i "mobile:|fanboxMobile|..."` 扫描输出为空（除 CHANGELOG）
- [ ] `node --check` 所有修改文件通过
- [ ] `node scripts/verify-desktop-layout.js` 通过（无 mobile）
- [ ] `npm run verify:build` 通过（node-pty native 仍可加载）
- [ ] `docs/audits/phase-02-mobile-removal-review.md` 生成，结论 PASS
- [ ] commit `refactor: remove mobile access runtime` 提交成功

---

## 七、执行顺序总览

1. Edit electron/main.js（L1208-1348 删除）
2. Edit electron/preload.js（L81-96 删除两个 contextBridge）
3. Edit server.js（4 处：L2605-2672 → L2436 → L2434 → L18-24）
4. Edit public/index.html（L55-119 删除）
5. Edit public/app.js（5 处：L5073-5284 → L4952-5071 → L3136 → L1262-1265 → L1233）
6. Edit public/style.css（4 处：L736 → L567-649 → L398-403 → L156）
7. Edit public/i18n-dict.js（L29 + L31-51）
8. Edit scripts/verify-desktop-layout.js（4 处）
9. 运行验证 3.1-3.4
10. 生成 docs/audits/phase-02-mobile-removal-review.md
11. git add + commit

---

## 八、数据真实性声明

- 本计划所有行号均通过 Grep/Read 实际确认（2026-07-21 当日）
- 已删除文件清单来自 `git status --short`（D 标记）
- 已完成 commit 清单来自 `git log --oneline -10`
- 未使用占位符或假设值
