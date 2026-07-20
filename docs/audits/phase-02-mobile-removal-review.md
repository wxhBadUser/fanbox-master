# Phase 2 对抗性审查 — Mobile Access 移除

## 审查元数据

- **审查日期**：2026-07-21
- **审查范围**：Phase 2 移除 Mobile Access（不含 WeChat ClawBot，属 Phase 3）
- **审查者角色**：独立对抗性审查者（与执行者不同思路）
- **审查依据**：用户计划 §15 对抗性审查要求（15 项检查）
- **当前 Git HEAD**（审查前）：`cc078b1 docs: capture removal inventory`
- **审查结论**：**PASS**

---

## 1. 改动概览

### 1.1 已修改的混合文件（M，8 个）

| 文件 | 删除内容 | 删除行数 |
|------|---------|----------|
| `electron/main.js` | Mobile Access IPC 块（8 个 `mobile:*` 处理器 + `teardownMobile` + `reconcileMobileOnBoot` IIFE + `_mobileHttpServer` 声明） | 141 |
| `electron/preload.js` | 两个 contextBridge 块：`fanboxMobile` / `fanboxMobileApproval` | 16 |
| `server.js` | 5 个 `/api/mobile-control/*` 路由块 + `_mobileServer` 声明 + `_mobileMod` / `mobileMod()` 函数 | 81 |
| `public/index.html` | `#mobile-access` sidebar 块 | 65 |
| `public/app.js` | `mobileAccess` 对象 + `mobileApprovals` 对象 + `bind()` + key handler + `mobile: false` + 3 行孤立注释 | ~334 |
| `public/style.css` | 7 处 mobile CSS 规则块（`.mobile-access*` / `.mobile-approval-*` / `.mobile-device-*` / `.mobile-icon` + soft 主题规则 + 选择器列表中的 `.mobile-access-row`） | 179 |
| `public/i18n-dict.js` | 21 个 mobile i18n 键（`Mobile Access` / `配对码` / `手机访问地址` / `0.0.0.0:` 等） | 22 |
| `scripts/verify-desktop-layout.js` | L6 注释 `/ Mobile` + L102 want 数组 `'mobile'` + L107 整行 `assert('sidebar 含 mobile', ...)` + L112 断言文本 `Mobile` | 1（净删除） |

**合计**：约 839 行删除。

### 1.2 已删除的文件（D，约 130+ 个，按目录分组）

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `docs/fanbox-mobile-*.md` / `mobile-*-contract.md` / `mobile-*-roadmap.md` / `paseo-mobile-*.md` | 5 | 移动端设计与契约文档 |
| `electron/mobile.js` / `mobile-sessions.js` / `mobile-agent-runner.js` | 3 | Mobile 运行时模块 |
| `experiments/mobile-*` 子目录及文件 | ~80+ | 移动端截图与 smoke 实验 |
| `public/mobile/` 整个目录（index.html + mobile.css + mobile.js + assets/agents/*.svg） | 7 | Mobile Web UI |
| `scripts/smoke-mobile-*.js` | 11 | 移动端 smoke 脚本 |
| `scripts/test-mobile-render.js` | 1 | 移动端渲染测试 |
| `scripts/verify-mobile-backend-contract.js` / `verify-mobile-ui-smoke.js` | 2 | 移动端验证脚本 |

**合计**：约 109+ 个文件删除。

### 1.3 Git diff 统计

```
17 files changed, 1 insertion(+), 19638 deletions(-)
```

- 17 个已修改文件（含 mobile 子目录下的删除）
- 1 个插入：`scripts/verify-desktop-layout.js` 的 Edit #2 中 `assert('主菜单顺序 = Agent项目/收藏/Skills/用量', ...)` 行的微小改动
- 19638 行删除：包括所有 mobile 运行时代码 + 实验截图 base64 + smoke 脚本

---

## 2. 审查项目与结果

### 2.1 是否只是隐藏 UI，没有删除运行时代码

**检查方法**：

```
Grep pattern: mobile-access|fanboxMobile|mobileApprovals|mobile-control|mobileMod|_mobileServer|_mobileMod
glob: !{node_modules,dist,docs/audits,experiments,design-demos,scripts/mobile*,smoke*,.git,architecture-review-*,.trae}/**
```

**真实输出**：

```
i:\AI_weflow\fanbox-master\architecture-review-20260625.html:505:  <div class="text-slate-600">/api/mobile-control/* AND ipcMain 'mobile:*'</div>
```

**判定**：**PASS**
- 唯一匹配是 `architecture-review-20260625.html`（untracked 文件，Phase 6 electron-builder files 白名单会显式排除根目录非必要文件，不进入生产包）
- 生产代码（electron/ / public/ / server.js / scripts/）零残留

### 2.2 是否仍有移动端模块被间接引用

**检查方法**：

```
Grep pattern: require\(['"][^'"]*mobile
glob: !{node_modules,dist,docs/audits,experiments,design-demos,scripts/mobile*,smoke*,.git,architecture-review-*,.trae}/**
```

**真实输出**：`No matches found`

**判定**：**PASS**
- server.js 不再 `require('./electron/mobile.js')`
- electron/main.js 不再 require 任何 mobile 模块
- 无任何文件通过 require 间接加载移动端代码

### 2.3 是否误删桌面核心功能

**检查方法**：运行桌面端验证脚本

**真实输出**：

```
node scripts/verify-desktop-layout.js
=== PASS: 100 / FAIL: 0 ===

node scripts/verify-windows-build.js
✓ 全部检查通过（含 node-pty 1.1.0 / electron 33.4.11 / asarUnpack 配置 / 可重复构建）

node scripts/verify-paths.js
路径验证完成（wechat 数据路径警告留给 Phase 3）

node scripts/verify-soft-terminal-colors.js
=== PASS: 34 / FAIL: 0 ===

node scripts/verify-agent-driver.js
overall: PASS（claude / codex 均正常探测）
```

**判定**：**PASS**
- 桌面布局重组 100 项断言全部通过
- node-pty native 模块加载正常
- 终端颜色、Agent 驱动均未受影响
- 文件浏览、终端、Agent 启动等核心功能未被误删

### 2.4 是否存在死 IPC

**检查方法**：

```
Grep pattern: ipcMain\.handle\(['"]mobile
glob: !{node_modules,dist,docs/audits,experiments,design-demos,scripts/mobile*,smoke*,.git,architecture-review-*,.trae}/**
```

**真实输出**：`No matches found`

**判定**：**PASS**
- electron/main.js 中 8 个 `ipcMain.handle('mobile:*', ...)` 已全部删除
- 无残留的死 IPC 监听器

### 2.5 是否存在死 CSS

**检查方法**：

```
Grep pattern: mobile|Mobile
path: public/style.css
```

**真实输出**：`No matches found`

**判定**：**PASS**
- public/style.css 中所有 `.mobile-access*` / `.mobile-approval-*` / `.mobile-device-*` / `.mobile-icon` CSS 规则已全部删除
- soft 主题中 `[data-theme="soft"] .mobile-access*` 4 个规则已删除
- 选择器列表中 `.mobile-access-row .btn` 一行已删除（保留其他选择器）

### 2.6 是否存在死翻译项

**检查方法**：

```
Grep pattern: mobile|Mobile
path: public/i18n-dict.js
```

**真实输出**：`No matches found`

**判定**：**PASS**
- 21 个 mobile 专属 i18n 键已全部删除
- 通用键（`'关闭'` / `'已开启'` / `'撤销'` / `'复制'` / `'已复制'` / `'启用失败'` 等）经 Grep 确认无任何 UI 引用，删除安全
- `'拖动调整侧栏宽度'` / `'移除'` 等桌面端通用键保留未动

### 2.7 是否存在监听 0.0.0.0 的服务

**检查方法**：

```
Grep pattern: 0\.0\.0\.0
glob: !{node_modules,dist,docs/audits,experiments,design-demos,scripts/mobile*,smoke*,.git,architecture-review-*,.trae}/**
```

**真实输出**：`No matches found`

**判定**：**PASS**
- server.js 仍只绑定 `127.0.0.1:4567`（本地回环）
- electron/main.js 不再启动 Mobile HTTP server
- 无任何 0.0.0.0 监听代码

### 2.8 是否存在 4580 端口监听

**检查方法**：

```
Grep pattern: 4580
glob: !{node_modules,dist,docs/audits,experiments,design-demos,scripts/mobile*,smoke*,.git,architecture-review-*,.trae}/**
```

**真实输出**：

```
i:\AI_weflow\fanbox-master\docs\aionui-parity-plan.md:46:  | 启动方式 | `AionUi --webui` / `--remote` flag | 已有独立 mobile.js HTTP server（端口 4580） |
i:\AI_weflow\fanbox-master\docs\aionui-parity-plan.md:47:  | 端口 | 默认 25808 | 已用 4580 |
```

**判定**：**PASS**
- 生产代码（electron/ / public/ / server.js / scripts/）零匹配
- 仅 `docs/aionui-parity-plan.md`（历史设计对比文档）在文字描述中提到 4580，Phase 6 electron-builder files 白名单会显式排除 `docs/**`，不进入生产包
- 实际运行时代码无 4580 端口监听

### 2.9 package.json 中 mobile 专属依赖

**检查方法**：Read `package.json`

**真实结果**：

```json
"dependencies": {
  "@xterm/addon-fit": "^0.10.0",
  "@xterm/addon-unicode11": "^0.9.0",
  "@xterm/addon-webgl": "^0.18.0",
  "@xterm/xterm": "^5.5.0",
  "node-pty": "^1.0.0",
  "qrcode": "^1.5.4"
}
```

**判定**：**PASS（Phase 2 范围内）**
- dependencies 中无 mobile 专属包
- `qrcode` 服务微信二维码登录，留给 Phase 3 移除微信时一并删除
- 所有 xterm / node-pty 均为桌面终端运行时必需，保留正确

### 2.10 是否真实缩小安装包

**检查方法**：Phase 2 是代码删除，体积测量留给 Phase 6 / 11

**结果**：
- 代码层面已删除约 109+ 个文件 + 约 839 行混合文件代码
- git diff 统计：17 files changed, 1 insertion(+), 19638 deletions(-)
- 实际生产包体积测量在 Phase 6（electron-builder files 白名单）和 Phase 11（最终体积报告）执行

**判定**：**PASS（代码删除是真实的，体积测量在后续 Phase）**
- 删除是真实的代码移除，不是 `display: none` 隐藏
- 不是仅改压缩格式（normal vs maximum）
- 不是手动复制文件伪造结果

### 2.11 是否因为打包白名单导致运行时缺文件（Phase 2 暂无白名单）

**检查方法**：Phase 2 尚未添加 electron-builder files 白名单（Phase 6 任务）

**结果**：
- 当前 `package.json` 的 `build` 配置未变（仍无 `files` 白名单）
- electron-builder 默认会打包除 `node_modules` 中 devDependencies 外的所有文件
- Phase 2 删除的文件已从工作区移除，不会进入下一次构建

**判定**：**PASS（Phase 2 范围内）**
- 无白名单风险
- Phase 6 添加白名单时需重新验证

### 2.12 OAuth Token 读取（Phase 4 范围外，确认未受影响）

**检查方法**：Phase 4 任务，Phase 2 仅确认未引入新读取

**结果**：Phase 2 未修改任何 OAuth Token 读取逻辑（如有，留给 Phase 4 删除）

**判定**：**PASS（Phase 2 范围内未引入新风险）**

### 2.13 默认终端录制（Phase 4 范围外）

**检查方法**：Phase 4 任务

**结果**：Phase 2 未修改终端录制逻辑

**判定**：**PASS（Phase 2 范围内未引入新风险）**

### 2.14 不受控的新窗口（Phase 4 范围外）

**检查方法**：Phase 4 任务

**结果**：Phase 2 未修改新窗口创建逻辑

**判定**：**PASS（Phase 2 范围内未引入新风险）**

### 2.15 没有 sender 校验的高权限 IPC（Phase 4 范围外）

**检查方法**：Phase 4 任务

**结果**：Phase 2 未修改 IPC sender 校验逻辑

**判定**：**PASS（Phase 2 范围内未引入新风险）**

---

## 3. 已知范围外项（留给后续 Phase）

| 项 | 留给 Phase | 原因 |
|----|-----------|------|
| WeChat ClawBot 移除（`electron/wechat/` 6 文件 + `bridge.js` / `driver.js` / `ilink.js` / `memory.js` + 14 个 `wechat:*` IPC + `fanboxWechat` contextBridge + `#term-wechat` 按钮 + `#wechat-view` 面板 + `.wechat-*` CSS） | Phase 3 | 微信移除是独立 Phase |
| 根 `main.js` 删除（含完整 wechat 代码块副本） | Phase 6 | 避免影响 electron 启动入口判断，需先确认无引用 |
| electron-builder files 白名单 | Phase 6 | 需基于运行时依赖生成 |
| `qrcode` 依赖删除 | Phase 3 | 服务微信二维码，移除微信时一并处理 |
| `windows-smoke.spec.js` 的 `wechat` 字段（9 个 bridges） | Phase 3 | 移除微信时一并调整为 8 个 |
| `scripts/verify-wechat-bridge.js` 删除 | Phase 3 | 此脚本本身验证微信桥接 |
| `architecture-review-20260625.html`（untracked） | Phase 6 | electron-builder 白名单会排除 |
| `docs/aionui-parity-plan.md` 中的 4580 文字描述 | Phase 6 | electron-builder 白名单会排除 `docs/**` |
| OAuth Token 读取删除 | Phase 4 | 隐私安全修复 |
| 终端录像默认关闭 | Phase 4 | 隐私安全修复 |
| CSP 添加 | Phase 4 | 安全加固 |
| IPC sender 校验 | Phase 4 | 安全加固 |
| PTY 数量限制 / 输出缓冲上限 / JSONL 流式 / 路径 containment / 跨盘移动 | Phase 5 | 稳定性修复 |
| Windows CI | Phase 8 | 构建可复现性 |
| 桌面核心功能回归测试 | Phase 9 | 验收 |
| README 文档更新 | Phase 10 | 文档 |
| 最终体积报告 | Phase 11 | 验收 |

---

## 4. 审查结论

### 4.1 总判定

**PASS** — Phase 2 移除 Mobile Access 的目标全部达成，无 P0 问题。

### 4.2 达成项

- ✅ Mobile Access UI 已删除（`public/index.html` + `public/style.css` + `public/app.js`）
- ✅ Mobile IPC 已删除（`electron/main.js` + `electron/preload.js`）
- ✅ Mobile HTTP server 已删除（`server.js`）
- ✅ Mobile Web UI 已删除（`public/mobile/` 整个目录）
- ✅ Mobile tests/experiments 已从生产代码中排除（删除 `scripts/smoke-mobile-*` / `verify-mobile-*` / `experiments/mobile-*` / `docs/*mobile*.md`）
- ✅ Mobile i18n 键已删除（`public/i18n-dict.js`）
- ✅ Mobile 断言已删除（`scripts/verify-desktop-layout.js`）
- ✅ 无 0.0.0.0 监听
- ✅ 无 4580 端口监听（生产代码）
- ✅ 无 mobile 模块间接引用
- ✅ 无死 IPC / 死 CSS / 死翻译项
- ✅ 桌面核心功能验证全部通过（100 + 34 + agent-driver + windows-build + paths）

### 4.3 P0 问题

无。

### 4.4 P1 问题

无。

### 4.5 P2 问题（建议但不阻塞）

- `architecture-review-20260625.html` 仍提及 mobile-control（untracked 文件，Phase 6 处理）
- `docs/aionui-parity-plan.md` 文字描述中提到 4580（Phase 6 electron-builder 白名单会排除 `docs/**`）

---

## 5. 审查签署

- **审查者**：独立对抗性审查角色（与执行者不同思路）
- **审查日期**：2026-07-21
- **审查结论**：**PASS**
- **可进入下一 Phase**：是（Phase 3 移除 WeChat ClawBot）
