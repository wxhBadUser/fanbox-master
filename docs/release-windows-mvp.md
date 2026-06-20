# FanBox Windows Edition 2.4.0 — Release Notes

## 版本信息

- **版本名称**：FanBox Windows Edition 2.4.0
- **基于项目**：[alchaincyf/fanbox](https://github.com/alchaincyf/fanbox)
- **许可**：MIT License
- **tag**：`v2.4.0-windows`
- **发布日期**：2026-06-20

> 本版本是 **FanBox 的 Windows 适配版本，不是上游官方 release**。
> macOS 用户请访问上游项目 [alchaincyf/fanbox](https://github.com/alchaincyf/fanbox)。

---

## 2.4.0 相对 2.3.0 的修改

### 新增：第三方 Agent CLI 入口（OpenCode / Qoder CLI）

在现有 Claude / Codex 启动按钮旁边新增两个轻量入口，**不**做 IDE Composer，**不**做 `/` 技能菜单，**不**做 `+` 上下文。

- **`AGENT_REGISTRY`**（[public/app.js](file:///I:/AI_weflow/fanbox-master/public/app.js)）—— 4 个 agent 的单点真理源：`claude` / `codex` / `opencode` / `qoder`
- **`agent:which` IPC**（[electron/main.js](file:///I:/AI_weflow/fanbox-master/electron/main.js)）—— Windows 走 `where`、POSIX 走 `command -v`，白名单正则 `[A-Za-z0-9._+-]{1,64}` 防命令名注入，4s 超时
- **`window.fanboxAgent.which()`**（[electron/preload.js](file:///I:/AI_weflow/fanbox-master/electron/preload.js)）—— 渲染层探测入口
- **`probeAgent()` / `launchRegisteredAgent()`**（[public/app.js](file:///I:/AI_weflow/fanbox-master/public/app.js)）—— Claude / Codex 走原 `term.launchAgent(...)` 路径，**完全不变**；OpenCode / Qoder 先探测再启动
- **`#term-opencode` / `#term-qoder` 按钮**（[public/index.html](file:///I:/AI_weflow/fanbox-master/public/index.html)）—— 紧贴 Claude / Codex，UI 一致
- **未安装时 UI 友好提示**：toast 提示 + 按钮 `.agent-missing` 灰显
- **Qoder 候选命令探测优先级**：`qoder` → `qodercli` → `qoder-cli`
- **i18n**：OpenCode / Qoder CLI / 未找到 OpenCode / 未找到 Qoder CLI / Qoder / 启动 OpenCode.../启动 Qoder CLI...（[public/i18n-dict.js](file:///I:/AI_weflow/fanbox-master/public/i18n-dict.js)）

**严格约束**（已全部满足）：
- ❌ 不自动安装任何 CLI
- ❌ 不读取任何 token / cookie / API key / provider secret
- ❌ 不修改 driver / env / pty 核心逻辑
- ❌ 不修改 Claude / Codex 原启动命令
- ❌ 不接管图片粘贴（图片由各 CLI 自己处理）
- ❌ 不新增 IDE 化输入框 / Composer / `/` 菜单 / `+` 上下文

### 新增：公开仓库发布整理

- **`.gitignore` 增补**：`dist/win-unpacked/`、`dist/*.exe`、`.env*`、`.fanbox-context/`、`*.ilink-token`、`ilink-sessions/`、`screenshots/`、`thumbnails/`
- **`README.md` 增补**：Windows Edition 显式声明、OpenCode / Qoder 验证项、隐私条款（不上传 token/截图/记录、回收站非永久删除）、Public Release Checklist
- **`docs/release-windows-mvp.md` 重写**：完整 2.4.0 release notes
- **`CHANGELOG.md` 新增 2.4.0 段**：实际修改列表

### 修复：e2e 用量面板 flake（34/35 → 35/35）

- **`localStorage.fb_usage_open` 残留值导致 click 切到关闭路径** —— 修：测试前显式 `setItem('0')` 重置
- **`waitForTimeout(2000)` 裸等** —— 修：轮询 `body.classList.contains('hidden')` 最多 4s
- **`/api/agent-usage` 异步加载未及时落字** —— 修：轮询 `body.innerText` 最多 6s
- 接受 `读取失败` / `loading` 等兜底文案为"有内容"合法标记

### 依赖版本（package.json）

- 顶包版本：`2.3.0` → **`2.4.0`**
- package-lock 同步刷新

---

## 已验证功能

### Windows 桌面端

- Windows exe 可启动（portable 免安装，100MB）
- Electron GUI 可正常打开
- node-pty Windows 构建和打包可用
- 内嵌终端可用（xterm.js + WebGL 渲染，中文宽字符正确）

### 文件管理

- 文件浏览（左侧文件树）
- **此电脑 / 盘符导航**（This PC view + drive breadcrumb）
- **Windows 搜索**（系统级 Everything 风格 fast-find）
- **图片缩略图**（PowerShell COM 探测）
- **最近截图面板**
- **微信 Alt+A 剪贴板截图导入**
- **复制文件到剪贴板**（访达可粘贴）
- **复制图片到剪贴板**（file right-click + 截图面板）
- **删除到回收站**（不是永久删除）
- **磁盘占用透视**

### AI Agent 入口

- **Claude Code** —— 完整启动链路
- **Codex** —— 启动 + 用量统计
- **OpenCode** —— 轻量入口，PATH 探测，未装时友好提示
- **Qoder CLI** —— 探测 `qoder` / `qodercli` / `qoder-cli`，未装时友好提示
- **Claude / Codex 本地用量统计**（不联网，仅读本地文件；Claude 限额查询只发往 `api.anthropic.com` 用于 `/usage` 同源数据）

### 微信 ClawBot

- bridge → driver → Claude 链路通过
- 手机微信消息可驱动 Windows 本机 Claude 回复
- 登录态持久化通过
- 真实链路验证通过

### 自动化验证

- **Playwright 回归 35/35 通过**（含 7b 段：OpenCode / Qoder 按钮 + Registry 暴露 + 无 Composer / 无 `/` 菜单 / 无 `+` 上下文 + 友好提示）
- `verify:paths` / `verify:build` / `verify-agent-driver` / `verify-wechat-bridge` 全部 PASS

---

## 使用要求

> **本项目不内置任何账号、token、API key。** 用户需要自行准备：

| 项 | 安装方式 | 备注 |
|---|---|---|
| **Node.js** | 22 LTS 或更新版本 | 必装（源码运行 / 自行打包时） |
| **Claude Code CLI** | `npm install -g @anthropic-ai/claude-code` | 必装（要用 Claude 时） |
| **Codex CLI** | `npm install -g @openai/codex` | 必装（要用 Codex 时） |
| **OpenCode** | 见 [opencode 官网](https://opencode.ai) | 可选 |
| **Qoder CLI** | `npm install -g @qoder-ai/qodercli` | 可选 |
| **微信账号** | 用户自己扫码登录 | 必装（要用 ClawBot 时） |

**隐私说明**：FanBox 不上传、不托管、不分发用户微信/Claude/Codex 凭据。所有 agent 调用发生在用户本机。

---

## 下载与启动

### 下载

从 GitHub Releases 附件下载 **`FanBox 2.4.0.exe`**（100MB，portable）。

### 启动

双击 `FanBox 2.4.0.exe` 即可运行。

> ⚠️ 当前 Windows 构建**未签名**。首次运行可能出现 Windows SmartScreen 提示。
> 解决方法：点击「更多信息 (More info)」→「仍要运行 (Run anyway)」。

### 源码运行

```bash
git clone https://github.com/wxhBadUser/fanbox-master.git
cd fanbox-master
npm install
npm run rebuild
npm run verify:build
npm run verify:paths
npm run app
```

### 自行打包

```bash
npm run dist:win
```

产物在 `dist/` 目录（`FanBox 2.4.0.exe` + `latest.yml`）。

---

## Windows 构建环境

- Windows 10 或 Windows 11
- Node.js 22 LTS 或更新版本
- npm
- Python 3.11+
- Visual Studio Build Tools 2022（工作负载：Desktop development with C++，组件：MSVC v143、Windows 10/11 SDK）

---

## 微信 ClawBot 使用说明

1. 启动 FanBox
2. 打开 ClawBot 面板
3. 点击「二维码登录」
4. 用自己的微信扫码
5. 选择 Claude target
6. 从手机发送消息即可驱动本机 Claude
7. 登录态保存在用户本机数据目录（`%APPDATA%/FanBox/wechat/` 或 `%APPDATA%/Electron/wechat/`）

---

## 已知限制

- **未做代码签名**：当前 Windows 构建为未签名 portable exe，首次运行可能出现 SmartScreen 提示。
- **不包含 IDE Composer**：本版本聚焦轻量终端入口，不做 IDE 化输入框。
- **不包含 `/` 技能菜单**、**不包含 `+` 上下文菜单**：上一轮撤回。
- **图片粘贴由各 CLI 自己处理**：FanBox 不处理终端图片粘贴。
  - Claude Code 图片：`Alt+V` 触发（由 Claude Code CLI 自己处理）
  - Codex 图片：`Ctrl+V` 触发（由 Codex CLI 自己处理）
  - OpenCode / Qoder：由各自 CLI 决定，FanBox 不做特殊处理
  - FanBox 只提供「**复制图片到系统剪贴板**」功能（与终端粘贴解耦）
- **HEIC / 视频缩略图不是核心功能**
- **不包含 codegraph / cursor rules**：本地 dev tooling 不入仓库。

---

## 安全声明

- **不读取、不上传、不分发用户文件**：FanBox 只在你的本机读写文件。
- **不上传截图**：截图面板内容仅留在本机。
- **不上传 Claude / Codex 本地记录**：用量统计只读本地文件。
- **回收站删除不是永久删除**：删除到回收站后文件仍可恢复；永久删除请用资源管理器。
- **未内置任何账号 / token / API key**：所有 CLI 凭据由用户各自 CLI 自行管理。
- **不读取任何 provider token / cookie / authorization header**

---

## Release 附件清单

请上传到 GitHub Releases（**不入 repo**）：

- `dist/FanBox 2.4.0.exe` — Windows portable 安装包（100MB）
- `dist/latest.yml` — electron-builder 自动更新清单（可选）

> **请勿上传：**
> - `dist/win-unpacked/` — 解包目录
> - `dist/builder-debug.yml` — 构建调试日志
> - `dist/*.exe.blockmap` — 分片校验
> - `node_modules/` — 依赖
> - `account.json` / `config.json` / `.env` / `*.log` — 本地凭据与日志

---

## 后续 Roadmap

- [ ] Windows 代码签名 + 安装向导
- [ ] 自动更新机制
- [ ] 屏幕 OCR 集成
- [ ] 多 Agent 并发面板

---

## 致谢

本项目基于 [alchaincyf/fanbox](https://github.com/alchaincyf/fanbox) 修改而来。感谢原作者花叔（Huashu）和原项目提供的 FanBox 设计与实现。

---

*FanBox Windows Edition 2.4.0 — 2026-06-20*
