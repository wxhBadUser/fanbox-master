# FanBox Windows Edition 2.3.0 MVP — Release Notes

## 版本信息

- **版本名称**：FanBox Windows Edition 2.3.0 MVP
- **基于项目**：[alchaincyf/fanbox](https://github.com/alchaincyf/fanbox)
- **许可**：MIT License
- **发布日期**：2026-06-19

## 已验证功能

- ✅ Windows exe 可启动（portable 免安装）
- ✅ Electron GUI 可正常打开
- ✅ node-pty Windows 构建和打包可用
- ✅ 内嵌终端可用（xterm.js + WebGL 渲染，中文宽字符正确）
- ✅ Claude Code CLI 可识别和调用
- ✅ bridge → driver → Claude 链路通过
- ✅ 微信 ClawBot 真实链路验证通过
- ✅ 手机微信消息可驱动 Windows 本机 Claude 回复
- ✅ 登录态持久化通过
- ✅ 打包版 exe（dist/FanBox 2.3.0.exe）通过
- ✅ Codex 未安装时优雅降级
- ✅ 验证脚本使用 `.tmp/verify-wechat/` 隔离目录，不读写真实 account

## 使用前提

> **⚠️ 用户需要自行准备的账号/工具：**

- **Claude Code CLI**：使用 Claude 功能需要用户本机自行安装并登录 Claude Code CLI（`npm install -g @anthropic-ai/claude-code`）
- **Codex CLI**：使用 Codex 功能需要用户本机自行安装（当前 Windows 版主要验证了 Claude 链路，Codex 完整链路仍在完善）
- **微信账号**：使用微信 ClawBot 需要用户自己扫码登录

**隐私说明**：FanBox 不上传、不托管、不分发用户微信/Claude/Codex 凭据。所有 agent 调用发生在用户本机，凭据仅在用户本机使用。

## 下载与启动

### 下载

从 GitHub Releases 附件下载 `FanBox 2.3.0.exe`。

### 启动

双击 `FanBox 2.3.0.exe` 即可运行。

> ⚠️ 当前 Windows 构建未签名。首次运行可能出现 Windows SmartScreen 提示。
>
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

### 打包

```bash
npm run dist:win
```

产物在 `dist/` 目录。

## Windows 构建环境

- Windows 10 或 Windows 11
- Node.js 22 LTS 或更新版本
- npm
- Python 3.11+
- Visual Studio Build Tools 2022（工作负载：Desktop development with C++，组件：MSVC v143、Windows 10/11 SDK）

## 微信 ClawBot 使用说明

1. 启动 FanBox
2. 打开 ClawBot 面板
3. 点击「二维码登录」
4. 用自己的微信扫码
5. 选择 Claude target
6. 从手机发送消息即可驱动本机 Claude
7. 登录态保存在用户本机数据目录

## 已知限制

- **Codex 完整链路尚未验证**：当前 Windows 版主要验证了 Claude 链路（Claude 是底层主力模型），Codex 的端到端驱动仍在完善中。
- **Windows 搜索/缩略图/防休眠/截图直通车仍在完善**：这些功能目前是占位或 macOS 优先实现的状态。
- **安装包未签名**：当前 Windows 构建为未签名 portable exe，首次运行时可能出现 SmartScreen 提示。
- **Windows 版目前是 MVP**：核心链路稳定可用，但部分 UI 和功能细节还有完善空间。推荐先将本项目作为桌面入口、配合 Claude Code CLI 和微信 ClawBot 使用。
- **macOS 原功能不保证全部已在 Windows 等价实现**：macOS 版的一些功能（如 Spotlight 搜索、macOS 特有快捷键、截图直通车）尚未移植到 Windows。

## Release 附件

请上传：

- `dist/FanBox 2.3.0.exe` — Windows portable 安装包

> **请勿上传：**
>
> - `dist/win-unpacked/` — 解包目录，不是分发包
> - `dist/builder-debug.yml` — 构建调试日志
> - 各 `.exe.blockmap` 文件

## 后续 Roadmap

- [ ] Codex Windows 链路验证
- [ ] Windows 搜索结果集成
- [ ] Windows 缩略图缓存
- [ ] Windows 截图直通车
- [ ] Windows 防休眠
- [ ] 安装体验优化（签名、安装向导）
- [ ] 签名/发布流程规范化
- [ ] 自动更新机制

## 致谢

本项目基于 [alchaincyf/fanbox](https://github.com/alchaincyf/fanbox) 修改而来。感谢原作者花叔（Huashu）和原项目提供的 FanBox 设计与实现。

---

*FanBox Windows Edition 2.3.0 MVP — 2026-06-19*