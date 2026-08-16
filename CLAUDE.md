# FanBox — Windows 桌面 AI Coding Cockpit

## 一句话
Windows 桌面端本地 AI 编码驾驶舱：文件浏览/搜索、内嵌终端（node-pty）、Claude Code / Codex / OpenCode / Qoder 会话，叠加微信 ClawBot 手机遥控（**有意保留**）。移动端工作区已移除。

## 怎么跑
- 开发模式：`npm run app`（Electron + 本地 server）
- 纯后端调试：`npm start`（监听 127.0.0.1:4567，不自动开浏览器）
- 完整打包：`npm run rebuild` → `npm run dist:win`（产物在 `dist/`）
- 验证：`npm run verify:build` / `verify:paths` / `verify:desktop`（打包守卫）

## 技术栈
- Electron 33 + `electron/main.js`（真入口，根目录无 main.js）+ node-pty 原生终端
- `server.js`：零依赖后端（`http.createServer` 手写路由，非 express），主进程 `require('../server.js')`
- 前端：原生 JS（`public/app.js`），Monaco / Milkdown / xterm / hljs / marked 全部本地 vendor（离线）
- 构建：electron-builder → Windows portable EXE

## 目录与约定
- `electron/`：主进程 + preload + `atomic-json.js`（原子写）+ `safe-path.js`（路径边界）
- `electron/wechat/`：微信 ClawBot（**保留，勿删**，`qrcode` 依赖同为微信必需）
- `public/`：前端，`vendor/` 为离线资源（已按 `mona.lang()` 映射瘦身）
- `docs/`、`.trae/documents/`：历史计划/审计文档（`docs/audits/desktop-only-final-report.md` 为收尾报告）
- `scripts/verify-*.js`：回归门禁；`verify-desktop-package.js` 检查打包产物（微信进包、垃圾排除）

## 关键红线（打包/构建）
- **`dist:win` 已加 `--config.win.signAndEditExecutable=false`**：项目不签名，跳过 winCodeSign（否则 Windows 无管理员权限解压会崩）
- **Defender 会锁定 `dist/` 的 EXE**：打包被锁时换输出目录 `npm run dist:win -- --config.directories.output=xxx`
- **`NoDefaultCurrentDirectoryInExePath=1`**（本机 session 变量）会让 `npm run rebuild` 的 `GetVer.bat` 失败，需 `env -u NoDefaultCurrentDirectoryInExePath npm run rebuild`
- 新文件进 `electron/` 必须在 package.json `build.files` 白名单里 + `scripts/verify-desktop-package.js` 断言，否则打包后启动即崩

## 当前状态（2026-08-16）
- master 已完成 desktop-only 清理（删 root main.js、monaco 瘦身、白名单、安全/稳定加固、CI/守卫、文档），**12 个 commit 领先 origin 未推送**
- 微信 ClawBot 全套保留；移动端彻底移除；app.asar 68.33MB → 19.7MB
- 最新可运行 EXE：`dist-fixed/FanBox 2.6.0.exe`（safe-path 修复版）
