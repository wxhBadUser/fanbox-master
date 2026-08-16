# FanBox Desktop-Only 最终体积报告与对抗性审查

> 日期：2026-08-16
> 分支：`refactor/desktop-phase6`（基于 master `aae75c9`，回退点 `archive/pre-cleanroom-20260816`）
> 目标：Windows 桌面端本地 AI Coding Cockpit，**保留微信 ClawBot**，移除移动端 + 开发资产 + 加固安全/稳定

---

## 一、最终体积对比

| 指标 | 改造前（基线） | 改造后 | 变化 |
|---|---|---|---|
| Windows portable EXE | 101.85 MB | *未完整打包*（winCodeSign 权限限制未产出 portable 外壳） | — |
| **app.asar**（实际生产代码包） | **68.33 MB** | **20 MB** | **-48.33 MB (-71%)** |
| app.asar 文件数 | 大量（含实验/文档/移动端） | 948 | — |
| win-unpacked | — | 314 MB（含 Electron/Chromium runtime） | — |

> 说明：改造后 EXE 未能完整打包成 portable 单文件（本机构建环境 winCodeSign 符号链接权限问题），
> 用 `electron-builder --win --dir` 产出的 `app.asar` 验证。app.asar 是真正的生产代码包，
> 71% 缩减来自移除移动端/开发资产 + vendor 瘦身 + 白名单。

**app.asar 体积拆解（改造后 20MB）：**

| 部分 | 大小 | 说明 |
|---|---|---|
| `vs/language/typescript`（tsWorker.js） | 5.7 MB | 必需：TS/JS 语言服务 worker（FanBox `mona.lang()` 支持 .ts/.js/.tsx/.jsx） |
| `vs/editor/editor.main.js` | 3.8 MB | 必需：Monaco 核心 |
| milkdown（含 KaTeX） | 3.9 MB | 必需：Milkdown 编辑器（KaTeX 公式渲染，`milkdown.css/js` 均引用） |
| node-pty（unpacked） | ~25 MB（unpack 区） | 必需：终端 PTY 原生模块 |
| monaco 其余 + xterm + hljs + marked | ~1.7 MB | 必需 |
| 应用代码（electron/ + public/ 自写） | ~几百 KB | 必需 |

**Runtime dependencies：6**（`@xterm/*` ×4 + `node-pty` + `qrcode`）。qrcode 是**微信登录二维码必需**，因保留微信而保留。改造前依赖数同为 5（无 qrcode 版是旧计划的"删微信"假设）。

---

## 二、体积来源拆解与归属

- **Electron / Chromium runtime（win-unpacked 大部分，~200-250MB）**：固有下限，不迁移 Tauri 无法消除。当前 win-unpacked 314MB 主要为此。
- **node-pty native（~25MB）**：必需，无法压缩（原生二进制）。
- **public/vendor（~16.5MB）**：monaco 12M + milkdown 3.9M + xterm/hljs/marked <1M。已被瘦身（monaco 14→12M），剩余为编辑器功能刚性体积。
- **应用代码**：`electron/` + `public/` 自写代码约几百 KB，占比极小。

**已成功删除：**
- 移动端 runtime + 文档 + 测试（`public/mobile/`、mobile 相关）
- 开发/过程资产出包（`.trae`/`design-demos`/`experiments`/`docs`/`tests`/`src-vendor`/`素材`，白名单排除）
- 根目录废弃 `main.js`（865 行）
- 未使用的 monaco locale（10 个） + 未映射语言（56 个）

**仍较大（有意保留）：**
- monaco：编辑器核心（3.8M） + TS worker（5.7M），运营商 TS/JS/大量语言的完整编辑体验
- **微信 ClawBot（`electron/wechat/` 6 文件 + qrcode）**：按用户要求保留

**是否迁移 Tauri？** 不迁移。理由：①重写成本高，破坏当前桌面稳定性；②Electron runtime 虽大但用户安装为一次性；③当前体积已通过瘦身显著下降，Electron 的成熟生态（node-pty 原生终端、clipboard、系统集成）是当前产品的支柱。保留 Tauri 作为未来考量。

---

## 三、最终对抗性审查

### 3.1 微信 ClawBot 完整性（用户明确要求保留）

| 检查项 | 结果 |
|---|---|
| `electron/wechat/` 6 文件 | ✅ 保留 + 进包（asar 实测存在） |
| `wechat:*` IPC | ✅ 保留（12 个 handler） |
| preload `fanboxWechat` | ✅ 保留 |
| public 微信 UI（index/app/css） | ✅ 保留 |
| `qrcode` 依赖 | ✅ 保留（登录二维码） |
| `.gitignore` 微信规则 | ✅ 保留 |
| `docs/07`、`docs/08` 微信文档 | ✅ 保留 |

### 3.2 移动端清除

| 检查项 | 结果 |
|---|---|
| 生产代码 mobile 引用 | ✅ 0（`server.js`/`electron/`/`public/` grep 无命中） |
| `public/mobile/` | ✅ 空壳已删 |
| 打包入 asar | ✅ `public/mobile/` 不在 asar |

### 3.3 出包污染防护

| 检查项 | 结果 |
|---|---|
| electron-builder `build.files` 白名单 | ✅ 已加 |
| 垃圾进 asar（.trae/design-demos/experiments/docs/tests/src-vendor/素材） | ✅ 全部排除（asar 实测） |
| `verify:desktop` 守卫 | ✅ 已加（必须存在+必须不存在断言） |
| Windows CI | ✅ 已加（`.github/workflows/windows-desktop.yml`） |

### 3.4 安全与稳定性（Phase 4/5）

| 检查项 | 结果 |
|---|---|
| Claude OAuth 出网请求 | ✅ 已移除（api.anthropic.com 生产代码零引用） |
| 终端录制默认关闭 | ✅（recordingEnabled 默认 false） |
| 高权限 IPC sender 校验 | ✅ 21 处 assertTrustedSender |
| IPC 参数校验 | ✅ 6 个 validator |
| CSP | ✅ 已加（含 worker-src blob:） |
| 新窗口拒绝非 http(s) | ✅ |
| PTY 缓冲上限 / 终端数上限 | ✅ 64KB / 10 |
| 跨盘移动 / 路径边界（safe-path） | ✅ |

### 3.5 桌面核心功能回归

| 检查项 | 结果 |
|---|---|
| verify-desktop-layout | ✅ PASS 100/0 |
| verify-soft-terminal-colors | ✅ PASS 34/0 |
| 核心文件语法（server/electron/app/preload） | ✅ node --check 全过 |

---

## 四、结论

**PASS**（保留微信版）

- 微信 ClawBot 全套完整保留（用户要求），未误删
- 移动端 runtime 彻底清除，生产代码零引用，不进发布包
- 开发/过程资产由白名单挡在发布包外
- 发布包 app.asar 从 68.33MB 降至 20MB（-71%）
- 安全（OAuth 出网移除、IPC 加固、CSP）与稳定性（缓冲/终端/跨盘/路径）已加固
- 桌面核心功能验证全绿

**遗留 / 未验证：**
- Windows portable 单文件 EXE 未完整打包（winCodeSign 符号链接权限问题，环境限制非代码问题）；`app.asar` 已验证，portable 外壳需在正常 Windows 环境或 CI 复验
- 浏览器内实际编辑体验（Monaco worker 经 CSP `worker-src blob:` 放行）需真实启动 app 复验，静态分析已确认配置正确
- `docs/audits/desktop-only-baseline.md` 等历史审计文档保留（改造证据），不删除

*报告与审查由 grep/asar 实测数据支撑，2026-08-16。*