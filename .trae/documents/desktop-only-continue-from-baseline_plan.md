# FanBox Desktop-Only 改造 — 继续执行计划（从 Phase 0 收尾到完成）

> 计划版本：3.0  
> 日期：2026-07-21  
> 上游计划：`.trae/documents/desktop-only-hardening-refactor_plan.md`（1056 行，已获用户批准）  
> 当前任务：从 Phase 0 收尾点恢复，按上游计划执行至全部完成

---

## 一、当前状态（实测确认）

### 1.1 已完成

| 项 | 状态 | 说明 |
|---|---|---|
| 仓库探索 | ✅ | Mobile + WeChat 完整依赖图已建立 |
| 上游计划文件 | ✅ | `.trae/documents/desktop-only-hardening-refactor_plan.md`（1056 行） |
| 工作区清单 | ✅ | `docs/audits/phase-00-pre-cleanup-inventory.md`（180 行，未跟踪） |
| 基线报告 | ✅ | `docs/audits/desktop-only-baseline.md`（483 行，18 节真实数据，未跟踪） |
| 回退标签 | ✅ | `archive/full-v2.6.0-mobile-wechat` 打在 master HEAD `8150afc` |
| `npm ci` | ✅ | 599 包安装成功 |
| `npm run rebuild` | ✅ | Rebuild Complete（修复 GetVer.bat 后） |
| `npm run verify:build` | ✅ | 全部检查通过 |
| `npm run dist:win` | ✅ | 生成 `dist/FanBox 2.6.0.exe` 101.85 MB |
| `scripts/rebuild-win.js` GetVer.bat 修复 | ✅ | 第 21/77/79 行已改 `@cd shared && UpdateGenVersion.bat %*`（未提交） |

### 1.2 待完成（本次执行）

| 项 | 当前状态 | 处理 |
|---|---|---|
| 切分支 `refactor/desktop-only-hardening` | ❌ 仍在 master | Phase 0 commit 前切 |
| Phase 0 commit `chore: capture desktop-only baseline` | ❌ 未提交 | 切分支后立即提交 |
| Phase 0 对抗性审查 `docs/audits/phase-01-baseline-review.md` | ❌ 不存在 | Phase 0 commit 后生成 |
| Phase 1-11 全部 | ❌ 未执行 | 按上游计划顺序执行 |

### 1.3 工作区状态（git status 实测）

**已修改未提交（3 个）**：
- `electron/mobile-agent-runner.js` — 留到 Phase 2 一起删（不单独 revert）
- `scripts/rebuild-win.js` — Phase 0 commit 提交（含 GetVer.bat 修复）
- `scripts/smoke-mobile-agent-stream.js` — 留到 Phase 2 一起删（不单独 revert）

**未跟踪（关键）**：
- `docs/audits/desktop-only-baseline.md` — Phase 0 commit
- `docs/audits/phase-00-pre-cleanup-inventory.md` — Phase 0 commit
- `docs/audits-git-status.txt` — 评估后决定是否提交
- `architecture-review-20260625.html` — Phase 1 归档到 `docs/archive/`
- `docs/release-v2.6.0.md` — Phase 10 评估（含移动端/微信内容，归档到 `docs/archive/`）
- `docs/mobile-v2/`（8 个文件）— Phase 2 删
- `electron/mobile-contract.js` — Phase 2 删
- `experiments/mobile-qa0/` — Phase 2 删
- `public/_e2e_check.html` / `public/_real_check*.html` / `public/_real_claude.txt` — Phase 2 删（开发期临时验证文件）
- `_m3-*/_m4-*/_m5-*`（31 个）— Phase 2 删（外部 Flutter 脚手架）
- `.trae/documents/*mobile*`（10 个）— Phase 2 删
- `.trae/specs/`（整个目录）— Phase 2 删

**移动端 + 微信代码全部还在**：
- `electron/mobile.js`、`mobile-sessions.js`、`mobile-agent-runner.js`、`mobile-contract.js`
- `electron/wechat/` 整个目录（bridge.js / driver.js / env.js / ilink.js / memory.js / test-server.js）
- `public/mobile/` 整个目录

---

## 二、Phase 0 收尾（切分支 + commit + 对抗性审查）

### 2.1 切分支

```powershell
git checkout -b refactor/desktop-only-hardening
```

**说明**：`git checkout -b` 会保留工作区所有已修改和未跟踪文件。标签 `archive/full-v2.6.0-mobile-wechat` 已打在原 master HEAD `8150afc`，作为回退点。

### 2.2 Phase 0 commit

```powershell
git add docs/audits/phase-00-pre-cleanup-inventory.md
git add docs/audits/desktop-only-baseline.md
git add scripts/rebuild-win.js
git commit -m "chore: capture desktop-only baseline"
```

**说明**：仅提交基线报告 + 工作区清单 + rebuild-win.js 修复。已修改的两个 mobile 文件（`electron/mobile-agent-runner.js`、`scripts/smoke-mobile-agent-stream.js`）**不**在本 commit 中，留到 Phase 2 一起随文件删除处理。

### 2.3 Phase 0 对抗性审查

**文件**：`docs/audits/phase-01-baseline-review.md`

**审查项**（按用户原始指令第十五节对抗性审查要求）：

| # | 审查项 | 实测方法 | 通过标准 |
|---|---|---|---|
| 1 | 基线数字是否真实（非占位符） | 检查 `desktop-only-baseline.md` 每个数字是否来自实测命令 | 所有数字均来自 PowerShell 实测 |
| 2 | 是否漏掉未跟踪文件分类 | 对照 `git status` 与 `phase-00-pre-cleanup-inventory.md` | 全部 49 个未跟踪文件已分类 |
| 3 | rebuild 修复是否真正可复现 | 检查 `scripts/rebuild-win.js` 修复 + `verify:build` 通过记录 | GetVer.bat 由脚本自动生成，winpty.gyp 在 finally 块恢复，无手动复制 .node |
| 4 | 是否存在伪造的"优化前体积" | 检查基线报告体积来源声明 | 全部来自 2026-07-21 实测，无伪造 |
| 5 | 工作区状态是否完整记录 | 对照 `git status` 与基线报告 §16 | 3 已修改 + 49 未跟踪 + 1 标签全部记录 |
| 6 | 是否存在 P0 问题（影响后续阶段） | 综合判断 | 无 P0 问题 |

**结论**：只能是 PASS / REVISE / REJECT。如 PASS 则进入 Phase 1；如 REVISE 则修正后重新审查；如 REJECT 则回退标签重新开始。

**Commit**：`docs: add phase-01 baseline review`

---

## 三、Phase 1：移动端 + 微信端依赖图核对

**目标**：基于已有探索结果，生成待删除/待修改清单文件。

**输出**：`docs/audits/phase-01-removal-inventory.md`

**内容**（引用上游计划 §Phase 1）：

### 3.1 待删除文件清单

#### 3.1.1 移动端运行时（4 个）
- `electron/mobile.js`（4548 行）
- `electron/mobile-sessions.js`（1839 行）
- `electron/mobile-agent-runner.js`（732 行，已修改未提交）
- `electron/mobile-contract.js`（141 行，未跟踪）

#### 3.1.2 移动端 UI（整个目录）
- `public/mobile/`（index.html / mobile.js / mobile.css / assets/agents/*.svg）

#### 3.1.3 移动端测试脚本（13 个）
- `scripts/smoke-mobile-*.js`（11 个）
- `scripts/test-mobile-render.js`
- `scripts/verify-mobile-ui-smoke.js`
- `scripts/verify-mobile-backend-contract.js`

#### 3.1.4 移动端实验目录（9 个）
- `experiments/mobile-qa0/` ~ `experiments/mobile-paseo-r1-fix/`

#### 3.1.5 移动端文档（13+ 个）
- `docs/fanbox-mobile-current-map.md`
- `docs/mobile-backend-contract.md`
- `docs/mobile-convergence-roadmap.md`
- `docs/mobile-gap-to-paseo.md`
- `docs/paseo-mobile-reference-map.md`
- `docs/mobile-v2/`（整个目录）
- `.trae/documents/*mobile*`（10 个）
- `.trae/specs/`（整个目录）

#### 3.1.6 微信运行时（6 个，整个 `electron/wechat/`）
- `bridge.js` / `driver.js` / `env.js` / `ilink.js` / `memory.js` / `test-server.js`

#### 3.1.7 微信测试与设计 demo（7 个）
- `scripts/verify-wechat-bridge.js`
- `design-demos/wechat-clawbot-*.{html,png}`（6 个）

#### 3.1.8 微信文档（2 个）
- `docs/07-微信ClawBot集成规划.md`
- `docs/08-微信ClawBot-参考与署名.md`

#### 3.1.9 开发期临时文件（5 个）
- `experiments/_ansi_shot.png`
- `public/_e2e_check.html`
- `public/_real_check.html`
- `public/_real_check2.html`
- `public/_real_claude.txt`

#### 3.1.10 外部 Flutter 脚手架（31 个）
- `_m3-*.js` / `_m3_*.dart` / `_m3_commit_msg.txt`（13 个）
- `_m4-*.js` / `_m4_verify.js`（10 个）
- `_m5-*.js`（4 个）

#### 3.1.11 待评估归档（3 个）
- `architecture-review-20260625.html` → `docs/archive/`
- `docs/release-v2.6.0.md` → `docs/archive/`
- `docs/audits-git-status.txt` → 评估后删除或归档

### 3.2 待修改文件清单（混合文件）

按上游计划 §Phase 2.5 + §Phase 3.4 + §Phase 4 + §Phase 5：

| 文件 | Phase | 修改要点 |
|---|---|---|
| `electron/main.js` | 2 | 删 `require('./mobile.js')`、删 `mobile.setDesktopTerminalProvider` 整块、删 `safeTermHashForWrite`、删 `teardownMobile` 调用、删 Mobile Access IPC 段（L34, L98-120, L122-175, L562, L1289-1429） |
| `electron/main.js` | 3 | 删微信 bridge require + IPC handler |
| `electron/main.js` | 4 | CSP、`will-navigate`、`setWindowOpenHandler` 加严、`assertTrustedSender` 工具、IPC 参数验证 |
| `electron/main.js` | 5 | PTY 输出缓冲硬上限、`MAX_PTY_SESSIONS=10` 主进程限制、退出清理、跨盘移动 |
| `electron/preload.js` | 2 | 删 `fanboxMobile` + `fanboxMobileApproval`（L81-96） |
| `electron/preload.js` | 3 | 删 `fanboxWechat` |
| `server.js` | 2 | 删 `_mobileMod` 懒加载 + `_mobileServer` + `/api/mobile-control/*` 路由块 |
| `server.js` | 4 | 删 `claudeOAuthToken()` 整块（L1945-1996）、HTML 预览白名单 realpath 校验 |
| `server.js` | 5 | JSONL 流式读取、跨盘目录移动 EXDEV 修复、`realpath` + `path.relative` containment |
| `public/index.html` | 2 | 删 Mobile Access sidebar 块（L55-119）、删 `#term-wechat` 块（Phase 3） |
| `public/app.js` | 2 | 删 `SIDEBAR_SECTION_DEFAULTS.mobile`、删 `mobileAccess.bind()`、删 `mobileApprovals` + `mobileAccess` 对象（L1233, L1262-1265, L3136, L4949-5284） |
| `public/app.js` | 3 | 删微信相关代码 |
| `public/app.js` | 4 | OAuth UI 显示"仅显示本地使用记录" |
| `public/style.css` | 2 | 删 `.mobile-access*`、`.mobile-icon`、`.mobile-device-*`、`.mobile-approval-*` 规则 |
| `public/i18n-dict.js` | 2 | 删移动端 i18n 键（L25-51） |
| `scripts/verify-desktop-layout.js` | 2 | 删 `'mobile'` 项（L102, L107） |
| `tests/e2e/windows-smoke.spec.js` | 2+3 | 删 mobile + wechat 桥接断言，9→7 |
| `package.json` | 3 | 删 `qrcode` 依赖 |
| `package.json` | 6 | 添加 `build.files` 严格白名单 |

### 3.3 待删除 IPC 通道
- 8 个 `mobile:*` IPC（Phase 2）
- 14 个 `wechat:*` IPC（Phase 3）

### 3.4 待删除 HTTP 路由
- 35+ 个 `/api/mobile/*`（Phase 2）
- 5 个 `/api/mobile-control/*`（Phase 2）

### 3.5 待删除 npm 依赖
- `qrcode`（仅微信用，Phase 3）

**Commit**：`docs: capture removal inventory`

---

## 四、Phase 2：彻底移除 Mobile Access

**按上游计划 §Phase 2 执行**，不重写。

### 4.1 删除文件（DELETE）
- 4 个移动端运行时
- `public/mobile/` 整个目录
- 13 个测试脚本
- 9 个实验目录
- 13 个文档（含 `.trae/documents/*mobile*`、`.trae/specs/`）
- 5 个开发期临时文件
- 31 个外部 Flutter 脚手架

### 4.2 编辑文件（EDIT）
按上游计划 §Phase 2.5 表格逐项执行。

### 4.3 验证
```powershell
# 1. 主进程可加载
node -e "try { require('./electron/main.js') } catch(e) { if (!String(e).includes('Cannot find module')) throw e }"

# 2. 移动端代码全清
rg -i "mobile" electron/ public/ scripts/ --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=docs -l

# 3. 不监听 0.0.0.0 和 4580
netstat -ano | findstr "0.0.0.0:4580"
netstat -ano | findstr ":4580"

# 4. verify:build 通过
npm run verify:build

# 5. dist:win 通过
npm run dist:win
```

### 4.4 对抗性审查
**文件**：`docs/audits/phase-02-mobile-removal-review.md`

审查项（按用户指令第十五节）：
- 是否仅隐藏 UI 而未删运行时
- 是否仍有 `require('./mobile')` 残留
- 是否仍有 `mobile:*` IPC 注册
- 是否仍有 `/api/mobile-control/*` 路由
- 是否监听 0.0.0.0
- 是否存在死 IPC（preload 暴露但 main 无 handler）
- 是否存在死 CSS
- 是否存在死 i18n 键
- `verify-desktop-layout.js` 是否还有 `'mobile'` 残留
- 是否误删桌面核心功能

**Commit**：`refactor: remove mobile access runtime`

---

## 五、Phase 3：彻底移除微信 ClawBot

**按上游计划 §Phase 3 执行**。

### 5.1 删除文件
- `electron/wechat/` 整个目录（6 个文件）
- `scripts/verify-wechat-bridge.js`
- `design-demos/wechat-clawbot-*.{html,png}`（6 个）
- `docs/07-微信ClawBot集成规划.md`
- `docs/08-微信ClawBot-参考与署名.md`

### 5.2 编辑文件
- `electron/main.js`：删微信 bridge require + IPC handler + `termTails` 注释中的微信引用
- `electron/preload.js`：删 `fanboxWechat`
- `public/index.html`：删 `#term-wechat` 块
- `public/app.js`：删微信相关代码
- `package.json`：删 `qrcode` 依赖
- `tests/e2e/windows-smoke.spec.js`：删 wechat 桥接断言

### 5.3 验证
```powershell
# 微信代码全清
rg -i "wechat|clawbot|ilink" electron/ public/ scripts/ --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=docs -l

# package.json 无 qrcode
rg "qrcode" package.json

# 安装包不含 electron/wechat/
npx asar list "dist/win-unpacked/resources/app.asar" | findstr "wechat"
```

### 5.4 对抗性审查
**文件**：`docs/audits/phase-03-wechat-removal-review.md`

**Commit**：`refactor: remove wechat clawbot runtime`

---

## 六、Phase 4：修复隐私与安全问题

**按上游计划 §Phase 4 执行**。

### 6.1 不再读取 Claude OAuth Token
- `server.js` L1945-1996：删 `claudeOAuthToken()` 整块
- 删 `~/.claude/.credentials.json` 读取
- 删 Keychain Claude credentials 读取
- 删 curl 请求 `api.anthropic.com/api/oauth/usage`
- UI 改为显示"仅显示本地使用记录"

### 6.2 终端录制默认关闭
- `electron/main.js`：默认 `recordingEnabled = false`
- 设置页加显式开关 + 持续可见状态
- 默认不记录用户输入
- 提供一键清除
- 显示磁盘占用
- 默认上限 20 文件 / 200 MB

### 6.3 Electron 新窗口默认拒绝
- `electron/main.js`：`setWindowOpenHandler` 默认 `deny`
- 拦截 `javascript:` / `file:` / `data:` / `blob:` / 未知协议
- 增加 `will-navigate` 拦截
- 主窗口只能停留在 FanBox 自己的可信 origin
- `shell.openExternal` 加 HTTPS allowlist

### 6.4 添加 CSP
- `electron/main.js`：`onHeadersReceived` 注入 CSP
- CSP：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`
- 如 Monaco/Milkdown/xterm 需要额外权限，最小化添加并注释原因

### 6.5 IPC sender 验证
- `electron/main.js`：新增 `assertTrustedSender(event)` 工具函数
- 所有高权限 IPC（PTY spawn/input/kill、文件删除/写入、剪贴板、拖拽落盘、录像、外部链接、系统打开、Agent CLI 探测、更新）都加 sender 校验

### 6.6 IPC 参数验证
- `electron/main.js`：新增统一 validator
- ID 格式、路径字符串、cwd 目录存在、cols/rows 上下限、终端总数限制、Buffer 上限、文件名限制、禁止空字节、禁止危险协议、写入最大长度

### 6.7 对抗性审查
**文件**：`docs/audits/phase-04-security-review.md`

**Commit**：`security: harden desktop electron boundaries`

---

## 七、Phase 5：修复稳定性问题

**按上游计划 §Phase 5 执行**。

### 7.1 PTY 输出缓冲硬上限
- `electron/main.js` L657-674：`outputBuf = (outputBuf + data).slice(-MAX_OUTPUT_BUFFER)`
- `MAX_OUTPUT_BUFFER = 64 * 1024`

### 7.2 服务端限制终端数量
- 主进程 `MAX_PTY_SESSIONS = 10`
- 防止重复 ID 覆盖
- 限制 cols/rows 上下限
- 校验 cwd
- 退出时完整清理 Map、Timer、Recorder、监听器

### 7.3 大型 JSONL 改为流式读取
- `server.js`：Claude/Codex 用量扫描改逐行流式
- 最大文件读取预算（如 50 MB）
- 最大扫描文件数（如 500）
- 超时
- 截断结果提示
- 必要时放入 Worker Thread

### 7.4 修复跨盘目录移动
- `server.js`：区分普通文件/目录/符号链接
- 目录跨盘移动递归复制后删除源
- 失败时不删除源目录

### 7.5 统一路径边界检查
- 新增 `electron/path-utils.js`：`realpath` + `path.relative` + Windows 大小写归一化 + 盘符归一化 + 符号链接解析
- 替换所有 `target.startsWith(homeDir)`
- HTML 预览白名单也用真实路径校验

### 7.6 Windows 打开文件改用安全 API
- 优先 `shell.openPath()` / `shell.showItemInFolder()`
- `spawn(..., { shell: false })`
- 减少 `start` / `cmd /K` / `explorer /select` 拼接

### 7.7 对抗性审查
**文件**：`docs/audits/phase-05-stability-review.md`（上游计划命名为 `phase-05-packaging-review.md`，但实际是稳定性 — 在此澄清为稳定性审查）

**Commit**：`perf: reduce runtime caches and blocking scans`

---

## 八、Phase 6：缩小生产安装包

**按上游计划 §Phase 6 执行**。

### 8.1 添加严格的 electron-builder `files` 白名单

**文件**：`package.json`

**白名单结构**（基于实测的运行时依赖）：
```json
{
  "build": {
    "asar": true,
    "compression": "normal",
    "files": [
      "electron/main.js",
      "electron/preload.js",
      "electron/atomic-json.js",
      "electron/project-memory.js",
      "electron/path-utils.js",
      "server.js",
      "public/**",
      "package.json",
      "!public/mobile/**",
      "!public/_*.html",
      "!public/_*.txt",
      "!electron/mobile*.js",
      "!electron/wechat/**",
      "!docs/**",
      "!experiments/**",
      "!design-demos/**",
      "!src-vendor/**",
      "!scripts/**",
      "!tests/**",
      "!docs/**",
      "!.trae/**",
      "!.codegraph/**",
      "!.tmp/**",
      "!assets/**",
      "!素材/**",
      "!main.js",
      "!_m3-*/**",
      "!_m4-*/**",
      "!_m5-*/**",
      "!_m3_*/**",
      "!architecture-review-*.html",
      "!playwright.config.js",
      "!*.log",
      "!.icon.html",
      "!CHANGELOG.md",
      "!**/*.map",
      "!**/*.md",
      "!**/*.test.js",
      "!**/*.spec.js",
      "!**/screenshots/**",
      "!**/fixtures/**",
      "!node_modules/**/prebuilds/win32-arm64/**",
      "!node_modules/**/prebuilds/darwin-*/**",
      "!node_modules/**/third_party/conpty/*/win10-arm64/**",
      "!node_modules/**/deps/**",
      "!node_modules/**/src/**",
      "!node_modules/**/scripts/**",
      "!node_modules/**/node-addon-api/**",
      "!node_modules/**/build/obj/**",
      "!node_modules/**/build/Release/*.pdb",
      "!node_modules/**/build/Release/*.iobj",
      "!node_modules/**/build/Release/*.ipdb",
      "!node_modules/**/build/Release/*.lib",
      "!node_modules/**/build/Release/*.exp"
    ]
  }
}
```

### 8.2 删除废弃根目录 `main.js`
- 确认无引用后删除
- `package.json.main` 已指向 `electron/main.js`

### 8.3 清理 dependencies
- 删 `qrcode`（Phase 3 已删）
- 运行 `npm install` + `npm dedupe` + `npm prune`

### 8.4 审计 `public/vendor`
- 统计 Monaco / Milkdown / xterm / marked / highlight.js 体积
- 只保留实际加载的运行时文件
- 删未使用的 locale（保留 zh + en）
- 删未使用的主题
- 删 source map

### 8.5 不依赖 maximum compression 制造假优化
- 测试 `compression: normal` vs `maximum`
- 记录构建时间和体积差
- 主要优化必须来自删除产品面 + 白名单 + 依赖清理 + vendor 清理

### 8.6 验证
```powershell
# 1. 干净构建
Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue
npm run dist:win

# 2. 验证 app.asar 不含移动端/微信/文档/实验
npx asar list "dist/win-unpacked/resources/app.asar" | findstr "mobile"
npx asar list "dist/win-unpacked/resources/app.asar" | findstr "wechat"
npx asar list "dist/win-unpacked/resources/app.asar" | findstr "docs/"
npx asar list "dist/win-unpacked/resources/app.asar" | findstr "experiments/"
npx asar list "dist/win-unpacked/resources/app.asar" | findstr "design-demos/"

# 3. 验证关键运行时文件存在
npx asar list "dist/win-unpacked/resources/app.asar" | findstr "electron/main.js"
npx asar list "dist/win-unpacked/resources/app.asar" | findstr "electron/preload.js"
npx asar list "dist/win-unpacked/resources/app.asar" | findstr "server.js"
npx asar list "dist/win-unpacked/resources/app.asar" | findstr "public/index.html"

# 4. 验证应用可启动
npm run app

# 5. 体积对比
Get-Item "dist\FanBox 2.6.0.exe" | Select Length
Get-ChildItem "dist\win-unpacked" -Recurse -File | Measure-Object -Sum Length
Get-Item "dist\win-unpacked\resources\app.asar" | Select Length
```

### 8.7 对抗性审查
**文件**：`docs/audits/phase-05-packaging-review.md`

**Commit**：`build: add strict electron-builder file whitelist`

---

## 九、Phase 7：运行时磁盘占用优化

**按上游计划 §Phase 7 执行**。

### 9.1 缩略图缓存
- 默认上限 150 MB
- 设置页显示占用
- 提供一键清理
- 保留 LRU
- 清理失败不影响主程序

### 9.2 终端录像
- 默认关闭（Phase 4 已做）
- 开启后上限 200 MB / 20 文件
- 设置页一键清理
- 显示当前占用

### 9.3 临时拖拽文件
- `fanbox-drops` 启动时清理过期文件
- 只清理 FanBox 自己的临时目录
- 不误删用户文件
- 默认保留不超过 24 小时

**Commit**：`perf: optimize runtime disk usage`

---

## 十、Phase 8：构建可复现性 + 守卫脚本

**按上游计划 §Phase 8 执行**。

### 10.1 GitHub Actions Windows CI

**文件**：`.github/workflows/windows-desktop.yml`

**步骤**：
```yaml
- runs-on: windows-latest
- Node.js 22
- npm ci
- npm run rebuild
- npm test
- npm run verify:build
- npm run dist:win
- node scripts/verify-desktop-package.js
```

**CI 检查项**：
- node-pty 可加载
- .node 文件架构正确
- Electron 可启动
- 主窗口可加载
- 无 Mobile Access
- 无微信 UI
- 无 0.0.0.0 监听
- 无 4580 端口
- app.asar 不含移动端/微信/docs/experiments/design-demos
- 安装包大小低于门槛（如 85 MB）

### 10.2 生产包内容守卫脚本

**文件**：`scripts/verify-desktop-package.js`

**断言**：
- 不存在：`electron/mobile.js`、`electron/mobile-`、`electron/wechat/`、`public/mobile/`、`experiments/`、`design-demos/`、`docs/`、`smoke-mobile`、`verify-mobile`、`ClawBot`、`ilink`、`mobile-control`
- 存在：`electron/main.js`、`electron/preload.js`、`server.js`、`public/index.html`、`public/app.js`、`public/style.css`、`node_modules/node-pty`
- 输出：EXE 体积、app.asar 体积、app.asar.unpacked 体积、win-unpacked 体积、最大 20 个打包文件

### 10.3 对抗性审查
**文件**：`docs/audits/phase-06-final-adversarial-review.md`（上游计划命名）

**Commit**：`ci: add windows desktop build and package guard`

---

## 十一、Phase 9：扩展桌面回归测试

**按上游计划 §Phase 9 执行**。

新增 `tests/e2e/desktop-only.spec.js`，覆盖：
- 启动：单主窗口、无 Mobile Access、无微信、不强制抢焦点（除非 `FANBOX_DEV=1`）
- 文件：浏览 C 盘、中文路径、空格路径、创建/重命名/同盘移动/跨盘移动/删除到回收站、不能删盘符根
- 预览：Markdown、HTML、图片、PDF、音频、视频、HTML 不能访问主 API、symlink 不能绕过白名单
- 终端：新建/最多 10 个/第 11 个被拒/PowerShell/中文/Claude/Codex/OpenCode 友好提示/Qoder 友好提示/关闭确认/PTY 高吞吐不泄漏
- Skills：列表/启用/禁用/回收站删除/只允许操作扫描结果目录
- 缓存：录像默认关/缩略图上限/一键清理/临时拖拽文件清理

**Commit**：`test: add desktop-only regression tests`

---

## 十二、Phase 10：文档更新

**按上游计划 §Phase 10 执行**。

### 12.1 更新 README
- 删除：Mobile Access 介绍、手机浏览器控制、微信 ClawBot、微信扫码、手机远程、Mobile 配对、移动端路线图
- 明确：FanBox 是 Windows 桌面端本地 AI Coding Cockpit，不提供手机端/局域网远程/微信控制/不内置 Agent/不自动安装 CLI/不读取 Claude/Codex Token
- 版本号从 `package.json` 自动获取或保持单一事实源

### 12.2 CHANGELOG
- 新增 v2.7.0 条目：desktop-only 改造、移除 Mobile Access、移除微信 ClawBot、安全加固、稳定性修复、安装包体积下降

### 12.3 归档历史文档
- `architecture-review-20260625.html` → `docs/archive/`
- `docs/release-v2.6.0.md` → `docs/archive/`
- `docs/release-v2.6.0.md` 含移动端/微信内容 → 归档

**Commit**：`docs: update for desktop-only product`

---

## 十三、Phase 11：最终体积报告 + 最终对抗性审查

### 13.1 最终体积报告

**文件**：`docs/audits/desktop-only-final-report.md`

**对比表**：

| 指标 | 改造前 | 改造后 | 变化 |
|---|---|---|---|
| EXE | 101.85 MB | 实测 | 实测差 |
| win-unpacked | 361.85 MB | 实测 | 实测差 |
| app.asar | 68.33 MB | 实测 | 实测差 |
| app.asar.unpacked | 25.45 MB | 实测 | 实测差 |
| production dependencies | 6 | 实测 | 实测差 |
| app.asar 文件数 | 1402 | 实测 | 实测差 |
| 启动监听端口数 | 3 | 实测 | 实测差 |
| Electron 主进程代码量 | 1428 行 | 实测 | 实测差 |
| preload API 数量 | 实测 | 实测 | 实测差 |
| 移动端代码文件数 | 33+ | 0 | -33+ |
| 微信代码文件数 | 14+ | 0 | -14+ |

**体积来源拆解**：
- Electron / Chromium Runtime（固有下限 ~270 MB）
- node-pty native files
- public/vendor
- desktop application code
- images and icons
- other

**解释**：
- 哪些体积是 Electron 固有下限
- 哪些体积已经成功删除
- 哪些资源仍然较大
- 是否值得未来迁移技术栈
- 当前不迁移 Tauri 的理由

### 13.2 最终对抗性审查

**文件**：`docs/audits/phase-06-final-adversarial-review.md`

**审查项**（按用户指令第十五节）：
1. 是否只是隐藏 UI，没有删除运行时代码
2. 是否仍有移动端模块被间接引用
3. 是否仍有微信模块进入安装包
4. 是否误删桌面核心功能
5. 是否因为打包白名单导致运行时缺文件
6. 是否存在死 IPC
7. 是否存在死 CSS
8. 是否存在死翻译项
9. 是否存在 package.json 中的废弃依赖
10. 是否存在 lockfile 残留
11. 是否存在监听 0.0.0.0 的服务
12. 是否存在 OAuth Token 读取
13. 是否存在默认终端录制
14. 是否存在不受控的新窗口
15. 是否存在没有 sender 校验的高权限 IPC
16. 是否存在只在开发机可构建的问题
17. 是否存在文档声称和代码行为不一致
18. 是否真实缩小安装包，而不是仅改变压缩格式

**结论**：PASS / REVISE / REJECT。存在 P0 问题时不得给 PASS。

**Commit**：`docs: add desktop-only final report`

---

## 十四、最终验收条件（按用户指令第十八节）

执行完毕后必须全部满足：

- [x] 已创建 desktop-only 分支（Phase 0 commit 时切）
- [x] 当前完整版本可以回退（标签已打）
- [ ] Mobile Access UI 已删除（Phase 2）
- [ ] Mobile IPC 已删除（Phase 2）
- [ ] Mobile HTTP server 已删除（Phase 2）
- [ ] Mobile Web UI 已删除（Phase 2）
- [ ] Mobile tests/experiments 已从生产包排除（Phase 2 + Phase 6）
- [ ] 微信 ClawBot UI 已删除（Phase 3）
- [ ] 微信 IPC 已删除（Phase 3）
- [ ] 微信 bridge/iLink 已删除（Phase 3）
- [ ] qrcode 等微信专属依赖已删除（Phase 3）
- [ ] 不读取 Claude OAuth Token（Phase 4）
- [ ] 终端录像默认关闭（Phase 4）
- [ ] Electron 新窗口默认拒绝（Phase 4）
- [ ] CSP 已启用（Phase 4）
- [ ] 高权限 IPC 有 sender 校验（Phase 4）
- [ ] PTY 有主进程数量限制（Phase 5）
- [ ] PTY 输出缓冲有硬上限（Phase 5）
- [ ] 大型 JSONL 使用流式读取（Phase 5）
- [ ] 路径 containment 使用 realpath + relative（Phase 5）
- [ ] 跨盘目录移动正确（Phase 5）
- [ ] 根目录废弃 main.js 已清理（Phase 6）
- [ ] electron-builder 使用严格生产白名单（Phase 6）
- [ ] app.asar 不含 docs（Phase 6 验证）
- [ ] app.asar 不含 experiments（Phase 6 验证）
- [ ] app.asar 不含 design-demos（Phase 6 验证）
- [ ] app.asar 不含 public/mobile（Phase 6 验证）
- [ ] app.asar 不含 electron/mobile（Phase 6 验证）
- [ ] app.asar 不含 electron/wechat（Phase 6 验证）
- [ ] Windows npm ci 可复现（Phase 8 CI）
- [ ] Windows node-pty rebuild 可复现（Phase 8 CI）
- [ ] Windows EXE 可以正常启动（Phase 8 + Phase 9）
- [ ] 桌面核心功能回归通过（Phase 9）
- [ ] 安装包体积显著下降（Phase 11 报告）
- [ ] 已生成前后体积报告（Phase 11）
- [ ] 已完成最终对抗性审查（Phase 11）

---

## 十五、最终回复格式

执行完毕后，按用户指令第二十节格式回复，包含 17 节：

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

必须附上真实测试输出和真实安装包体积，不得仅提供修改建议。

---

## 十六、关键决策（已确定，不再询问）

1. **切分支**：`refactor/desktop-only-hardening` 自当前 master HEAD 切出，保留工作区修改
2. **回退标签**：`archive/full-v2.6.0-mobile-wechat` 已打在 master HEAD `8150afc`，不重复创建
3. **已修改的两个 mobile 文件**：留到 Phase 2 一起删，不在 Phase 0 commit 中 revert
4. **不迁移 Tauri**：明确禁止
5. **不重写 UI**：明确禁止
6. **不绕过测试**：明确禁止
7. **不复制 .node 伪造构建**：明确禁止
8. **不读取 Claude/Codex Token**：明确禁止
9. **不自动安装 Agent CLI**：明确禁止
10. **每阶段独立 commit**：严格分阶段提交
11. **每阶段对抗性审查**：每阶段输出审查文件，结论 PASS/REVISE/REJECT
12. **不依赖 maximum compression 制造假优化**：主要优化必须来自删除产品面 + 白名单 + 依赖清理

---

## 十七、执行顺序总览

```
Phase 0 收尾
  ├─ 切分支 refactor/desktop-only-hardening
  ├─ Phase 0 commit: chore: capture desktop-only baseline
  ├─ 生成 docs/audits/phase-01-baseline-review.md
  └─ docs commit: docs: add phase-01 baseline review

Phase 1
  ├─ 生成 docs/audits/phase-01-removal-inventory.md
  └─ docs commit: docs: capture removal inventory

Phase 2
  ├─ 删除移动端运行时/UI/测试/实验/文档
  ├─ 编辑 electron/main.js + preload.js + server.js + public/* + scripts/*
  ├─ 验证
  ├─ 生成 docs/audits/phase-02-mobile-removal-review.md
  └─ refactor commit: refactor: remove mobile access runtime

Phase 3
  ├─ 删除 electron/wechat/ + 测试 + 设计 demo + 文档
  ├─ 编辑 main.js + preload.js + index.html + app.js + package.json
  ├─ npm install + npm dedupe + npm prune
  ├─ 验证
  ├─ 生成 docs/audits/phase-03-wechat-removal-review.md
  └─ refactor commit: refactor: remove wechat clawbot runtime

Phase 4
  ├─ 删 OAuth Token 读取
  ├─ 录像默认关
  ├─ 新窗口 deny + will-navigate
  ├─ CSP
  ├─ IPC sender 校验
  ├─ IPC 参数验证
  ├─ 验证
  ├─ 生成 docs/audits/phase-04-security-review.md
  └─ security commit: security: harden desktop electron boundaries

Phase 5
  ├─ PTY 缓冲上限
  ├─ 主进程终端数量限制
  ├─ JSONL 流式读取
  ├─ 跨盘目录移动修复
  ├─ realpath + relative 路径校验
  ├─ shell.openPath 安全 API
  ├─ 验证
  ├─ 生成 docs/audits/phase-05-stability-review.md
  └─ perf commit: perf: reduce runtime caches and blocking scans

Phase 6
  ├─ 添加 electron-builder files 白名单
  ├─ 删废弃根 main.js
  ├─ 清理 public/vendor（保留实际加载文件）
  ├─ 测试 compression normal vs maximum
  ├─ 干净构建
  ├─ 验证 app.asar 内容
  ├─ 生成 docs/audits/phase-05-packaging-review.md
  └─ build commit: build: add strict electron-builder file whitelist

Phase 7
  ├─ 缩略图缓存上限 150 MB
  ├─ 终端录像上限 200 MB / 20 文件
  ├─ fanbox-drops 24h 清理
  └─ perf commit: perf: optimize runtime disk usage

Phase 8
  ├─ 添加 .github/workflows/windows-desktop.yml
  ├─ 添加 scripts/verify-desktop-package.js
  ├─ 生成 docs/audits/phase-06-final-adversarial-review.md
  └─ ci commit: ci: add windows desktop build and package guard

Phase 9
  ├─ 添加 tests/e2e/desktop-only.spec.js
  └─ test commit: test: add desktop-only regression tests

Phase 10
  ├─ 更新 README
  ├─ 更新 CHANGELOG
  ├─ 归档历史文档
  └─ docs commit: docs: update for desktop-only product

Phase 11
  ├─ 生成 docs/audits/desktop-only-final-report.md
  ├─ 完成最终对抗性审查
  └─ docs commit: docs: add desktop-only final report
```

**总 commit 数**：约 12-14 个（含 docs 审查文件）

**预期安装包体积**：从 101.85 MB 下降到 ~75-80 MB（基于基线报告 §14 估算）

---

## 十八、关键约束重申

1. **不绕过测试**：如果某个测试因移动端删除而失败，必须更新测试以匹配新状态，不能跳过
2. **不复制 .node 伪造构建**：node-pty 必须真正通过 `npm run rebuild` 构建
3. **不读取/上传/分发 Token**：Phase 4 必须彻底删除 OAuth 读取逻辑
4. **每阶段独立 commit**：不把所有修改塞进一个巨大 commit
5. **每阶段对抗性审查**：审查文件必须真实检查，结论只能 PASS/REVISE/REJECT
6. **不修改 Claude/Codex/OpenCode/Qoder 启动语义**
7. **不自动安装任何 Agent CLI**
8. **不创建第二套状态系统**
9. **不为重构而大规模重写工作正常的桌面逻辑**
10. **遇到问题不回避**：不通过跳过测试解决
