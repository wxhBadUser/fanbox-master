# FanBox Windows Edition 2.4.0 — Release Notes

> **这是 FanBox 的 Windows 适配版本，不是上游官方 release。**
> macOS 用户请访问上游项目 [alchaincyf/fanbox](https://github.com/alchaincyf/fanbox)。

## 2.4.0 相对 2.3.0 的改动

### ✨ 新增

- **OpenCode 启动入口** — 点击后在当前目录启动 `opencode`，未装时 toast 提示
- **Qoder CLI 启动入口** — 自动探测 `qoder` / `qodercli` / `qoder-cli` 三个候选命令，未装时 toast 提示
- **轻量 `AGENT_REGISTRY`**（`public/app.js`）—— 4 个 agent 单点真理源
- **`agent:which` IPC**（`electron/main.js`）—— Windows `where` / POSIX `command -v`，白名单正则防注入，4s 超时
- **e2e 回归 7b 段**（`tests/e2e/windows-smoke.spec.js`）—— 按钮存在 / 无 Composer / 无 `/` 菜单 / 无 `+` 上下文 / 友好提示
- **i18n**：OpenCode / Qoder CLI / 未找到 OpenCode / 未找到 Qoder CLI / Qoder 等 6 条键

### 🔧 修复

- **e2e 用量面板 flake（34/35 → 35/35）** —— `localStorage.fb_usage_open` 残留值 + 裸等 2s 导致偶发失败
  - 改：测试前显式 `setItem('0')` 重置
  - 改：轮询 `body.classList.contains('hidden')` 最多 4s
  - 改：轮询 `body.innerText` 最多 6s 让 `/api/agent-usage` 异步加载落字

### 📦 其他

- 顶包版本 `2.3.0` → `2.4.0`
- README badge / 下载链接 / Public Release Checklist 全部 2.4.0 化
- `.gitignore` 增补：`dist/win-unpacked/`、`.env*`、`*.ilink-token`、`ilink-sessions/`、`screenshots/`、`thumbnails/`
- 重建 Windows portable exe：`FanBox 2.4.0.exe`（95.43 MB）

## 🚫 不变量（仍然全部满足）

- ❌ 不自动安装任何 CLI
- ❌ 不读取任何 token / cookie / API key
- ❌ 不修改 Claude / Codex 原启动命令
- ❌ 不接管图片粘贴（Claude Alt+V / Codex Ctrl+V / OpenCode & Qoder 由各自 CLI 决定）
- ❌ 不新增 IDE Composer / `/` 技能菜单 / `+` 上下文

## ✅ 验证

- `verify:paths` / `verify:build` / `verify-agent-driver` / `verify-wechat-bridge` 全部 PASS
- `test:e2e:windows` **35/35 通过**

## 📥 下载

`FanBox 2.4.0.exe`（95.43 MB）见本 Release Assets 附件。

- SHA256：`D024C7C4C8FF0C95C27C4E7E005D5EC25B47249BB8BF66204DB5DDB52F3D0241`
- 未签名。首次运行若出现 SmartScreen，点「更多信息」→「仍要运行」。

## 🙏 致谢

基于 [alchaincyf/fanbox](https://github.com/alchaincyf/fanbox) 修改而来。原作者花叔（Huashu）。
