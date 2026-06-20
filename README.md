<div align="center">

# 📦 FanBox

> **FanBox — the cockpit for coding agents. Command Claude, Codex, OpenCode or Qoder, watch every file and line they change, and take over anytime.**

</div>

<p align="center">
  <img src="assets/screenshot-volt.png" alt="FanBox · Volt skin · file browser on the left, README preview at the bottom, embedded terminal on the right" width="100%">
</p>

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Release](https://img.shields.io/badge/Release-2.4.0-blue)](https://github.com/wxhBadUser/fanbox-master/releases/latest)
[![Platform](https://img.shields.io/badge/Windows-win64-black?logo=windows)](https://github.com/wxhBadUser/fanbox-master/releases/latest)
[![Runtime](https://img.shields.io/badge/Runtime-no--build-blueviolet)](#architecture)

</div>

<br>

<div align="center">

**本地优先 · AI Coding Cockpit · Electron 桌面端**

<br>

文件浏览 + 搜索 · 内嵌终端 · Claude Code / Codex / OpenCode / Qoder · 微信 ClawBot 手机控制

<br>

所有 agent 调用发生在**用户本机**。

</div>

---

## 这是什么

本项目基于 [alchaincyf/fanbox](https://github.com/alchaincyf/fanbox) 修改而来，重点进行 **Windows 适配**：
Windows 打包、node-pty 构建、Claude Code / Codex / OpenCode / Qoder CLI 链路验证、微信 ClawBot Windows 运行验证。
原项目遵循 MIT License，本仓库保留原项目版权声明和许可条款。

> **macOS 用户请访问上游项目** [alchaincyf/fanbox](https://github.com/alchaincyf/fanbox)。
> **本仓库主要面向 Windows 平台。**

---

## Why FanBox · 为什么做这个

GitHub 上写代码的工具有两路极端：一路是 IDE，沉、插件多、要配置；另一路是终端 CLI，灵活、快、但上下文全靠你自己记。写代码本身的工作量越来越不是瓶颈，瓶颈变成了**在它们之间搬运注意力**——「我刚才在哪个 tab、哪个文件、哪条命令、哪段对话里有这段上下文」。你打开一个文件树，里面只有路径；你打开终端，里面只有日志；你打开 Chat，里面只有 reply。三个东西之间没有任何关联。

FanBox 想做的就是把这条路打通：

- 同一个窗口里看见文件、终端、agent 跑出来的 diff 和用量进度条；
- 选一个文件点右键就能丢给本机 agent 接着干；
- 看完哪段不满意能立刻 fork 那条命令、即时改参数再跑；
- 切到手机微信，发条消息，回到 Windows 桌面前 Claude 已经动完文件了。

你不再被任何一件工具绑架。**文件管理器、终端、agent、Web —— 它们都是 FanBox 里的一个面板**。哪个 panel 顺手用哪个，需要新工具就加一个 panel，不要重新学一个 App。

这是设计 FanBox 的出发点，也是所有 feature / skin / shortcut 的取舍基准。

---

## Windows 版已验证能力

- ✅ Windows exe 可启动（portable 免安装）
- ✅ Electron GUI 可正常打开
- ✅ node-pty Windows 构建和打包可用（ConPTY）
- ✅ 内嵌终端可用（xterm.js + WebGL + unicode11，中文宽字符正确）
- ✅ **Claude Code** CLI 可识别和调用（`claude --dangerously-skip-permissions`）
- ✅ **Codex** CLI 可识别和调用（`codex`）+ 本地用量统计
- ✅ **OpenCode** 启动入口（PATH 探测 `opencode`，未装时友好提示）
- ✅ **Qoder CLI** 启动入口（探测 `qoder` / `qodercli` / `qoder-cli`，未装时友好提示）
- ✅ **Windows 搜索**：`Ctrl+K` 打开命令面板，系统级 fast-find
- ✅ **图片缩略图**：PowerShell COM 探测，缩略图缓存自动裁剪
- ✅ **此电脑 / 盘符导航**：双击盘符卡片直接进入 C: / D: / E: …
- ✅ **最近截图面板**：自动扫描本机最近图片
- ✅ **微信 Alt+A 剪贴板截图导入**
- ✅ **复制文件到剪贴板**（访达可粘贴）
- ✅ **复制图片到剪贴板**（file 右键 + 截图面板）
- ✅ **删除到回收站**（调用 Windows Recycle API，不是永久删除）
- ✅ **磁盘占用透视**（`/api/du`）
- ✅ **拖放导入**（`/api/drop`）
- ✅ **拖图片直接发图给 agent**（由各 CLI 自己处理粘贴）
- ✅ **长文本自动保存**：粘贴 ≥ 8000 字符自动落 `.fanbox-paste/clipboard-*.md`
- ✅ **HTML 预览隔离**：独立端口 + sandbox + 主目录白名单 + 点目录黑名单
- ✅ **收藏夹**（最多 50 项）+ **最近打开**（30 条）
- ✅ **文件移动 / 重命名 / 创建**（右键 / 工具栏）
- ✅ **Git 集成**：仓库状态 + Monaco 渲染 diff
- ✅ **归档列表**：读 zip / tar / tar.gz 内部清单
- ✅ **路径定位**（`/api/locate` 多根搜索）
- ✅ **项目发版一条龙**：版本号→CHANGELOG→打包→push→Release
- ✅ **中英双语**（`/api/lang`）
- ✅ **终端录制（.cast）** + 回放 + 导出 / 删除
- ✅ **防休眠 / 笔记本盖检测**：笔记本合盖时按需唤醒，避免消息丢失
- ✅ **自动更新检测**：检测到 GitHub 新 Release 时右下角提示，不强更
- ✅ bridge → driver → Claude 链路通过
- ✅ 微信 ClawBot 真实链路验证通过
- ✅ 手机微信消息可驱动 Windows 本机 Claude / Codex 回复
- ✅ **微信 ClawBot 记忆系统**（memory-flush：要点落盘，吐 ≤150 字摘要续场）
- ✅ **微信 ClawBot 多 persona 切换**
- ✅ 登录态持久化通过（`%APPDATA%/FanBox/wechat/`）
- ✅ 打包版 exe 通过（`FanBox 2.4.0.exe` 95.43 MB）
- ✅ Claude / Codex 本地用量统计（不联网，仅读本地文件）
- ✅ Playwright 回归（**35/35 通过**）

## 使用前提

> ⚠️ **重要说明**

- **FanBox 不内置 Claude**。使用 Claude 功能需要用户本机自行安装并登录 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/overview)。
- 使用 Codex 功能需要用户本机自行安装 [Codex CLI](https://github.com/openai/codex)。
- 使用 OpenCode 功能需要用户本机自行安装 [OpenCode](https://opencode.ai)（启动命令 `opencode`）。
- 使用 Qoder CLI 功能需要用户本机自行安装 [Qoder CLI](https://www.qoder.com)（`npm install -g @qoder-ai/qodercli`）。
- 使用微信 ClawBot 需要用户**自己扫码登录**自己的微信账号。
- **FanBox 不上传、不托管、不分发用户微信/Claude/Codex 凭据**。所有数据存储在用户本机。
- **FanBox 不内置任何账号、token、API key**。
- **OpenCode / Qoder CLI 不自动安装**。未装时点击入口会弹 toast 提示，不会偷偷帮你装。

## Windows 构建环境

- Windows 10 或 Windows 11
- [Node.js](https://nodejs.org/) 22 LTS 或更新版本
- npm（随 Node.js 安装）
- [Python 3.11+](https://www.python.org/downloads/)
- [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
  - 工作负载：**Desktop development with C++**
  - 组件：MSVC v143、Windows 10/11 SDK

> `npm run rebuild` 会调用 `node scripts/rebuild-win.js`，自动配置 node-pty 的 Windows 构建环境。

### 打包

```bash
npm run dist:win   # 产物在 dist/（FanBox 2.4.0.exe + win-unpacked/）
```

> ⚠️ 当前 Windows 构建**未签名**。首次运行可能出现 Windows SmartScreen 提示。
> 解决方法：点击「更多信息 (More info)」→「仍要运行 (Run anyway)」。
> 内置更新提醒：检测到 GitHub 上有新 Release 时，右下角会弹提示，不强更、可对单个版本「不再提醒」。

---

## 🎨 Three skins · 三套皮肤

界面在 [huashu-design](https://github.com/wxhBadUser/huashu-design) 辅助下设计。三套皮肤不是换个主题色——配色、字体、图标、代码高亮、终端 ANSI 主题整体随之变化。

| | |
|---|---|
| <img src="assets/screenshot-volt.png" alt="Volt skin / 终端皮肤"> | **终端 · Volt** · 荧光绿 × 炭黑 × 等宽字，工业仪器面板感（默认）<br>**Volt** · neon green × charcoal × monospace, industrial instrument panel (default) |
| <img src="assets/screenshot-archive.png" alt="Archive skin / 档案皮肤"> | **档案 · Archive** · 奶油纸 × 赤陶橙 × 衬线，温暖纸感档案馆<br>**Archive** · cream paper × terracotta × serif, a warm paper archive |
| <img src="assets/screenshot-index.png" alt="Index skin / 索引皮肤"> | **索引 · Index** · 黑白 × 信号红/绿 × 巨号字，编辑式索引日报<br>**Index** · black & white × signal red/green × oversized type, editorial index daily |

---

## 🔒 数据与隐私

- **本地优先**：所有数据存储在本机，不上传云端。
- **不上传 Claude/Codex/微信凭据**：凭据仅在用户本机用于 API 调用。
- **不内置任何账号**：FanBox 不要求注册或登录。
- **不内置任何 API key、token、cookie**：所有 CLI 凭据由用户各自 CLI 自行管理。
- **agent 调用发生在用户本机**：所有 Claude/Codex/OpenCode/Qoder 进程在用户本机运行。
- **不读取、不上传、不分发用户文件**：FanBox 只在你的本机读写文件。
- **不上传截图**：截图面板内容仅留在本机；不外发。
- **不上传 Claude/Codex 本地记录**：用量统计只读本地文件，不联网（Claude 限额查询只发往 `api.anthropic.com` 用于 `/usage` 同源数据）。
- **回收站删除不是永久删除**：删除到回收站后文件仍可恢复；永久删除请用资源管理器。
- **HTML 预览隔离**：独立端口 + sandbox + 主目录白名单 + 点目录黑名单（防读 `~/.ssh` 等点目录）。
- **不自动安装任何 CLI**：OpenCode / Qoder 未装时只弹 toast 提示，不替用户装东西。
- **不读取任何 provider token / cookie / authorization header**
- **验证脚本使用 `.tmp/verify-wechat/` 隔离目录**：不读写真实 account。
- **不要提交 `account.json`、`config.json`、logs、recordings、`dist/`、`node_modules/`** 到版本控制。

---

## ❓ 常见问题

### Electron 被当成 Node 启动

如果运行 `npm run app` 后只显示 Node 终端而没有窗口：

```bash
npm install
npx electron --version
```

### node-pty rebuild 失败

确保已安装 Visual Studio Build Tools 2022，然后运行：

```bash
npm run rebuild
```

如果仍然失败，检查：
- Python 3.11+ 是否在 PATH 中
- MSVC v143 是否安装
- Windows 10/11 SDK 是否安装

### Claude / Codex / OpenCode / Qoder 找不到

```bash
# Claude
npm install -g @anthropic-ai/claude-code
claude --version

# Codex
npm install -g @openai/codex
codex --version

# OpenCode: 见 https://opencode.ai
# Qoder CLI
npm install -g @qoder-ai/qodercli
qoder --version
```

未装时点击 FanBox 入口会弹 toast 提示，**FanBox 不自动安装**。

### Windows SmartScreen 提示

当前构建未签名。点击「更多信息」→「仍要运行」。

### 打包版无法打开

1. Windows 10 或更高版本（不支持 Windows 7/8）
2. 没有安全软件拦截
3. 尝试以管理员身份运行

### 微信二维码无法登录

1. 确保本机网络可以访问微信服务器
2. 二维码有时效性，过期后点击重新生成
3. 检查 ClawBot 面板连接状态

---

## 🏗 Architecture · 技术架构

| 层 | 技术 |
|---|---|
| 后端 | 零依赖 Node.js `server.js`（24+ REST API：文件、Git、回收站、归档、用量、统计、发版流…） |
| 桌面壳 | Electron 33 + node-pty（asarUnpack 原生模块） |
| 终端 | xterm.js + WebGL + unicode11 |
| 编辑器 | Monaco（代码 / JSON / Git diff）+ Milkdown Crepe（Markdown） |
| 微信 | 自研 ilink 协议 + bridge → driver → Claude / Codex |
| 打包 | electron-builder → Windows portable exe |
| 验证 | Playwright（35/35 e2e + 4 个 verify 脚本） |

```
fanbox/
├── server.js                      # 零依赖 Node 后端（24+ API）
├── electron/
│   ├── main.js                    # 主进程（38 个 IPC handler）
│   ├── preload.js                 # 暴露 fanboxPty / fanboxFs / fanboxClipboard / fanboxAgent
│   ├── atomic-json.js             # 原子 JSON 读写
│   └── wechat/
│       ├── bridge.js              # 微信 ClawBot 桥接
│       ├── driver.js              # Claude/Codex driver
│       ├── ilink.js               # iLink 协议
│       └── memory.js              # 微信记忆
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js                     # 前端单页应用
│   ├── i18n-dict.js               # 中英双语
│   └── vendor/                    # xterm / monaco / milkdown 本地资源
├── scripts/
│   ├── rebuild-win.js             # Windows node-pty 构建
│   ├── verify-windows-build.js
│   ├── verify-paths.js
│   ├── verify-agent-driver.js
│   ├── verify-wechat-bridge.js
│   └── run-app.js
├── build/                         # 图标 + entitlements
├── docs/                          # 设计文档
└── experiments/                   # 实验脚本
```

---

## 🛣 Roadmap

### 已完成
- [x] Windows 路径治理
- [x] Windows node-pty 构建（ConPTY）
- [x] Windows exe 打包
- [x] Claude Code CLI Windows 链路验证
- [x] Codex CLI 启动 + 本地用量统计
- [x] OpenCode / Qoder CLI 启动入口（轻量注册表 + 探测）
- [x] 微信 ClawBot Windows 运行验证（手机 → 本机 Claude / Codex）
- [x] 微信 ClawBot 记忆系统（memory-flush）
- [x] 微信 ClawBot 多 persona 切换
- [x] Windows 搜索（Ctrl+K 命令面板）
- [x] Windows 缩略图（PowerShell COM 探测 + 自动裁剪）
- [x] Windows 截图直通车（截图面板 + Alt+A 导入 + 复制图片按钮）
- [x] 防休眠 / 笔记本盖检测
- [x] 回收站（Windows Recycle API）
- [x] 磁盘占用透视
- [x] 中英双语
- [x] 拖放导入 + 拖图片发图给 agent
- [x] Git 集成（状态 / diff）
- [x] 收藏夹 / 最近打开
- [x] 文件移动 / 重命名 / 创建
- [x] 归档列表（zip / tar）
- [x] 路径定位（多根搜索）
- [x] 终端录制（.cast）
- [x] 自动更新检测
- [x] HTML 预览隔离（独立端口 + sandbox）
- [x] Playwright e2e 35/35

### 待办
- [ ] Windows 代码签名（消除 SmartScreen 提示）
- [ ] 安装体验优化（MSI / NSIS 安装向导）
- [ ] 自动更新机制（electron-updater）
- [ ] 屏幕 OCR 集成
- [ ] 多 Agent 并发面板
- [ ] IDE 化输入框 / Composer（**当前明确不做**）
- [ ] `/` 技能菜单（**当前明确不做**）
- [ ] `+` 上下文菜单（**当前明确不做**）

---

## 🙏 Standing on the shoulders of giants

| 项目 | 用在哪 | License |
|---|---|---|
| [Electron](https://www.electronjs.org/) | 桌面壳 | MIT |
| [node-pty](https://github.com/microsoft/node-pty) | 伪终端 | MIT |
| [xterm.js](https://xtermjs.org/) | 终端渲染 | MIT |
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | 代码/JSON/Git diff | MIT |
| [Milkdown](https://milkdown.dev/) (Crepe) | Markdown 所见即所得 | MIT |
| [marked](https://marked.js.org/) | Markdown 预览 | MIT |
| [highlight.js](https://highlightjs.org/) | 代码高亮 | BSD-3-Clause |
| [esbuild](https://esbuild.github.io/) | vendor 打包 | MIT |
| [electron-builder](https://www.electron.build/) | 打包 exe | MIT |
| [Playwright](https://playwright.dev/) | UI 验证 | Apache-2.0 |

---

## 🙏 Credits · 致谢

本项目基于 [alchaincyf/fanbox](https://github.com/alchaincyf/fanbox) 修改而来。
感谢原作者花叔（Huashu）和原项目提供的 FanBox 设计与实现。
界面设计在 [huashu-design](https://github.com/wxhBadUser/huashu-design) 辅助下完成。

---

## 👤 Author · 关于原作者

**花叔 Huashu** — AI Native Coder，独立开发者。代表作：小猫补光灯（App Store 付费榜 Top1）。

## 👤 About Me · 关于作者

**wxh** — 中国科学技术大学（USTC）在读博士生，方向是深度学习图像处理、大模型开发与 AI Agent 应用。

做 FanBox 的初衷很简单：每天在文件管理器、终端、浏览器之间来回切太累了，想做一个把所有 agent 工作流收进一个窗口的工具。选择了 Fork 而非从零造轮子，因为花叔的 FanBox 已经有很好的设计基底，我主要做 Windows 适配和链路验证。

如果这个项目对你有帮助，**点个 Star ⭐** 就是最大的鼓励。感谢关注！

## 免责声明

项目目前处于 MVP 阶段，功能稳定但仍有不完善之处。欢迎各位大佬提交 PR 共同改进，我会尽快 review 和合并。

---

## 📜 License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
