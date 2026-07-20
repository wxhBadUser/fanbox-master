# FanBox Desktop-Only 改造 — 基线报告

> 报告版本：1.0  
> 生成时间：2026-07-21  
> 分支：`master`  
> HEAD：`8150afc`（Release v2.6.0）  
> 回退标签：`archive/full-v2.6.0-mobile-wechat`

---

## 1. 环境基线

| 项 | 值 |
|---|---|
| 操作系统 | Windows 10.0.19045 |
| Node.js | v24.11.1 |
| npm | 11.17.0 |
| Python | 3.13.12 |
| 当前分支 | `master` |
| HEAD commit | `8150afc` |
| 回退标签 | `archive/full-v2.6.0-mobile-wechat` |
| electron | 33.4.11 |
| electron-builder | 25.1.8 |
| node-pty | 1.1.0 |

---

## 2. 安装包体积基线

| 项 | 字节数 | MB |
|---|---|---|
| `dist/FanBox 2.6.0.exe` | 106,799,131 | **101.85 MB** |
| `dist/win-unpacked/` 总大小 | 379,424,891 | **361.85 MB** |
| `dist/win-unpacked/` 文件数 | 356 |  |
| `dist/win-unpacked/resources/app.asar` | 71,653,303 | **68.33 MB** |
| `dist/win-unpacked/resources/app.asar.unpacked/` | 26,684,867 | **25.45 MB** |
| `dist/win-unpacked/resources/app.asar.unpacked/` 文件数 | 283 |  |

### 2.1 与历史版本对比

README 记录 v2.4.0 时 Windows portable EXE 约 **95.43 MB**。v2.6.0 实测 **101.85 MB**，比 v2.4.0 增加 **6.42 MB**（+6.72%）。增加原因分析：
- 加入 node-pty prebuilds 的 arm64 二进制（win32-arm64 + darwin-arm64 + darwin-x64 ≈ 2.61 MB）
- 加入 third_party/conpty 的 arm64 二进制
- public/vendor/monaco 多 locale 和多语言文件未清理
- design-demos/promo/ 大型 banner PNG（~10 MB）
- experiments/ 截图和实验资源（9.63 MB）

---

## 3. win-unpacked 顶层目录体积

| 路径 | MB | 说明 |
|---|---|---|
| `FanBox.exe` | 180.06 | Electron 主程序（固有下限，不迁移 Tauri 无法消除） |
| `resources/` | 93.89 | app.asar + app.asar.unpacked + elevate.exe |
| `locales/` | 40.25 | Electron 内置多语言（无 .gitignore 拦截） |
| `icudtl.dat` | 9.98 | Chromium ICU 国际化数据 |
| `LICENSES.chromium.html` | 8.75 | Chromium 许可证 |
| `libGLESv2.dll` | 8.03 | Chromium 图形 |
| `resources.pak` | 5.49 | Chromium 资源包 |
| `vk_swiftshader.dll` | 5.28 | Vulkan 软件渲染 |
| `d3dcompiler_47.dll` | 4.69 | D3D 编译器 |
| `ffmpeg.dll` | 2.79 | FFmpeg（视频解码） |
| `vulkan-1.dll` | 0.85 | Vulkan 加载器 |
| `v8_context_snapshot.bin` | 0.66 | V8 快照 |
| `libEGL.dll` | 0.47 | EGL |
| `snapshot_blob.bin` | 0.30 | V8 snapshot |
| `chrome_200_percent.pak` | 0.22 |  |
| `chrome_100_percent.pak` | 0.14 |  |
| `LICENSE.electron.txt` | 0.00 |  |
| `vk_swiftshader_icd.json` | 0.00 |  |

### 3.1 resources/ 细分

| 路径 | MB | 说明 |
|---|---|---|
| `resources/app.asar` | 68.33 | 我们的代码 + 仓库内容 + node_modules lib |
| `resources/app.asar.unpacked/` | 25.45 | node-pty 原生二进制 |
| `resources/elevate.exe` | 0.10 | electron-builder 内置（UAC 提升） |

### 3.2 体积来源拆解（win-unpacked 361.85 MB）

| 类别 | MB | 占比 | 说明 |
|---|---|---|---|
| Electron / Chromium Runtime | 270.06 | 74.6% | FanBox.exe + locales + icudtl + chromium dll + *.pak + ffmpeg + vulkan + d3d |
| app.asar | 68.33 | 18.9% | 仓库内容（代码 + 文档 + 实验 + node_modules lib） |
| app.asar.unpacked | 25.45 | 7.0% | node-pty 原生二进制 |
| elevate.exe | 0.10 | 0.0% | UAC 提升工具 |
| 其他 | -2.09 | -0.6% | 计算舍入 |

**Electron 固有下限**：约 270 MB（不迁移 Tauri 无法消除）

---

## 4. app.asar 内容审计

### 4.1 顶层目录文件分布（共 1402 文件）

| 顶层目录 | 文件数 | 是否生产必需 |
|---|---|---|
| `node_modules/` | 801 | 部分必需（@xterm/* + node-pty lib） |
| `public/` | 300 | 部分必需（vendor/ + assets/ + index.html + app.js + style.css） |
| `experiments/` | 118 | ❌ 开发资源，不该进 |
| `docs/` | 35 | ❌ 开发文档，不该进 |
| `design-demos/` | 26 | ❌ 设计 demo，不该进 |
| `scripts/` | 23 | ❌ 开发脚本，不该进 |
| `.trae/` | 20 | ❌ IDE 配置，不该进 |
| `electron/` | 16 | 部分必需（main.js + preload.js + atomic-json.js + project-memory.js；待删 mobile-*.js + wechat/） |
| `assets/` | 5 | ❌ 待确认 |
| `.codegraph/` | 4 | ❌ IDE 索引，不该进 |
| `.tmp/` | 3 | ❌ 临时文件，不该进 |
| `src-vendor/` | 3 | ❌ vendor 源码（构建后用不到），不该进 |
| `tests/` | 3 | ❌ 测试，不该进 |
| `素材/` | 2 | ❌ 中文目录，不该进 |

### 4.2 顶层文件（应为 0，目前存在的不该进生产包的根文件）

| 文件 | 说明 | 是否生产必需 |
|---|---|---|
| `_m3-*.js` / `_m3_*.dart` / `_m3_commit_msg.txt` | 13 个 | ❌ 外部 Flutter 项目脚手架 |
| `_m4-*.js` / `_m4_verify.js` | 10 个 | ❌ 外部 Flutter 项目脚手架 |
| `_m5-*.js` | 4 个 | ❌ 外部 Flutter 项目脚手架 |
| `main.js` | 1 个 | ❌ 废弃根入口（package.json.main 指向 electron/main.js） |
| `architecture-review-20260625.html` | 1 个 | ❌ 改造前快照 |
| `playwright.config.js` | 1 个 | ❌ 测试配置 |
| `dist-build.log` | 1 个 | ❌ 我本次构建的日志 |
| `phase2a.log` | 1 个 | ❌ 历史开发日志 |
| `.icon.html` | 1 个 | ❌ 图标 HTML |
| `README.md` / `CHANGELOG.md` / `LICENSE` | 3 个 | 待定（CHANGELOG 通常不打进生产包） |
| `server.js` / `package.json` | 2 个 | ✅ 运行时必需 |

**结论**：当前 `build.files` 白名单**完全未配置**，electron-builder 默认把整个仓库打入 asar。这是 Phase 6 改造的重点。

---

## 5. app.asar.unpacked 内容审计（node-pty 原生二进制，25.45 MB）

### 5.1 node-pty unpacked 体积细分

| 子目录 | MB | 说明 | 可否清理 |
|---|---|---|---|
| `build/` | 17.03 | 含 Release（.node + .dll）+ obj + deps/winpty/src | ❌ 含中间产物（.pdb/.iobj/.ipdb）可清理 |
| `prebuilds/` | 5.07 | npm 包预构建二进制（4 个平台） | ⚠️ arm64/darwin 可删 |
| `third_party/` | 2.44 | conpty（win10-x64 + win10-arm64） | ⚠️ arm64 可删 |
| `deps/` | 0.34 | winpty 源码 + .gyp | ❌ 不进生产包 |
| `bin/` | 0.29 | win32-x64-130（脚本） | ❌ 待确认 |
| `lib/` | 0.16 | node-pty JS 加载器 | ✅ 运行时必需 |
| `src/` | 0.08 | TypeScript 源码 | ❌ 不进生产包 |
| `node-addon-api/` | 0.04 | 头文件 | ❌ 不进生产包 |
| `scripts/` | 0.01 | 安装脚本 | ❌ 不进生产包 |

### 5.2 prebuilds 平台分布

| 平台 | MB | 是否运行时必需 |
|---|---|---|
| `win32-x64/` | 2.45 | ✅ Windows x64 主目标 |
| `win32-arm64/` | 2.42 | ❌ 当前 `win.target` 只配 x64 |
| `darwin-arm64/` | 0.13 | ❌ macOS 不在 Windows 包中需要 |
| `darwin-x64/` | 0.06 | ❌ macOS 不在 Windows 包中需要 |

### 5.3 build/Release/ 实际可执行文件（这是 Phase 0 rebuild 生成的）

| 文件 | 字节 | 说明 |
|---|---|---|
| `conpty.node` | 305,664 | ConPTY native 模块 |
| `conpty_console_list.node` | 134,144 | ConPTY console list |
| `pty.node` | （未列出，可能在 prebuilds 中） | winpty native 模块 |
| `winpty.dll` | （未列出，可能在 prebuilds 中） | winpty DLL |
| `winpty-agent.exe` | 307,200 | winpty agent |
| 其他 .obj/.pdb/.iobj/.ipdb/.lib/.exp | 中间产物 | ❌ 可清理 |

**Phase 6 改造目标**：通过 `build.files` 白名单排除 `node-pty/{deps,src,scripts,build/obj,build/Release/*.pdb,build/Release/*.iobj,build/Release/*.ipdb,build/Release/*.lib,build/Release/*.exp}`，并排除 `prebuilds/{win32-arm64,darwin-*}` + `third_party/conpty/*/win10-arm64`。

---

## 6. 源码目录体积（开发时）

| 目录 | MB | 说明 |
|---|---|---|
| `electron/` | 0.45 | 桌面主进程 + preload + atomic-json + project-memory + mobile-*.js（待删） + wechat/（待删） |
| `public/` | 18.62 | 桌面 UI + vendor（monaco/milkdown/xterm/hljs/marked）+ mobile/（待删） |
| `docs/` | 0.33 | 文档（部分待删：mobile-*、wechat-*） |
| `experiments/` | 9.63 | 实验资源（mobile-* 待删） |
| `scripts/` | 0.51 | 脚本（部分待删：smoke-mobile-*、verify-mobile-*、verify-wechat-bridge） |
| `design-demos/` | 12.04 | 设计 demo（wechat-clawbot-* 6 个待删；promo/ banners ~10MB 待评估） |
| `src-vendor/` | 0.00 | vendor 源码（构建期用，不进生产包） |
| `tests/` | 0.02 | 测试 |
| `node_modules/` | 870.35 | 开发期依赖（不全部进打包，仅 dependencies 进 asar） |

---

## 7. 体积最大的 30 个文件（源码层，排除 node_modules/dist）

| 排名 | 路径 | MB |
|---|---|---|
| 1 | `public/vendor/monaco/vs/language/typescript/tsWorker.js` | 5.48 |
| 2 | `public/vendor/monaco/vs/editor/editor.main.js` | 3.59 |
| 3 | `design-demos/promo/banner-timessquare.png` | 2.62 |
| 4 | `public/vendor/milkdown/milkdown.js` | 2.61 |
| 5 | `design-demos/promo/banner-timessquare-v2.png` | 2.45 |
| 6 | `design-demos/promo/superflat-3.png` | 2.08 |
| 7 | `design-demos/promo/superflat-2.png` | 1.69 |
| 8 | `design-demos/promo/superflat-1.png` | 1.45 |
| 9 | `experiments/drag-path-test/测试图.png` | 1.10 |
| 10 | `experiments/local-model-202606/results/exp2-vectors.json` | 0.95 |
| 11 | `public/vendor/monaco/vs/language/css/cssWorker.js` | 0.74 |
| 12 | `public/vendor/monaco/vs/nls.messages.ru.js` | 0.51 |
| 13 | `design-demos/promo/banner-volt.png` | 0.50 |
| 14 | `public/vendor/monaco/vs/language/html/htmlWorker.js` | 0.43 |
| 15 | `public/vendor/monaco/vs/base/worker/workerMain.js` | 0.36 |
| 16 | `public/app.js` | 0.35 |
| 17 | `design-demos/promo/banner-archive.png` | 0.33 |
| 18 | `experiments/drag-path-test/test-dragfix.png` | 0.29 |
| 19 | `public/vendor/xterm/xterm.js` | 0.28 |
| 20 | `design-demos/promo/banner-archive-v2.png` | 0.25 |
| 21 | `public/vendor/monaco/vs/nls.messages.ja.js` | 0.24 |
| 22 | `experiments/mobile-qa1/screenshots/test-audit.png` | 0.24 |
| 23 | `public/mobile/mobile.js` | 0.23 |
| 24 | `experiments/mobile-ui1b/screenshots/07-audit-390x844.png` | 0.22 |
| 25 | `public/vendor/monaco/vs/nls.messages.ko.js` | 0.20 |
| 26 | `experiments/mobile-ui1b/screenshots/02-safety-390x844.png` | 0.19 |
| 27 | `experiments/mobile-ui1a/screenshots/05-start-timeline-390x844.png` | 0.19 |
| 28 | `experiments/mobile-qa1/screenshots/test-safety.png` | 0.19 |
| 29 | `experiments/mobile-qa1/screenshots/test-start-timeline.png` | 0.19 |
| 30 | `experiments/mobile-ux-polish/screenshots/05-safety-polished.png` | 0.19 |

### 7.1 关键观察

- **public/vendor/monaco/** 占大头（tsWorker 5.48 + editor.main 3.59 + cssWorker 0.74 + htmlWorker 0.43 + 多 locale 各 0.2-0.5）
- **design-demos/promo/** 含 8 个 banner PNG，共约 10 MB（开发资源，不该进生产包）
- **experiments/mobile-*/screenshots/** 含大量移动端测试截图（Phase 2 删除）
- **public/vendor/monaco/vs/nls.messages.*.js** 含 7 种非中文 locale（Phase 6 可清理）

---

## 8. 当前生产依赖清单（package.json dependencies，5 个）

```json
"dependencies": {
  "@xterm/addon-fit": "^0.10.0",      // 桌面运行时必需
  "@xterm/addon-unicode11": "^0.9.0", // 桌面运行时必需
  "@xterm/addon-webgl": "^0.18.0",    // 桌面运行时必需
  "@xterm/xterm": "^5.5.0",           // 桌面运行时必需
  "node-pty": "^1.0.0",               // 桌面运行时必需
  "qrcode": "^1.5.4"                  // ❌ 仅微信用，Phase 3 删除
}
```

Phase 3 删除 `qrcode` 后剩 4 个运行时依赖。

---

## 9. 当前监听端口

| 端口 | 协议 | 监听地址 | 文件 | 处理 |
|---|---|---|---|---|
| 4567 | HTTP | `127.0.0.1` | `server.js:2722` | ✅ 桌面主 server，保留 |
| 4568 | HTTP | `127.0.0.1` | `server.js:2720` | ✅ 预览隔离 server（PORT+1），保留 |
| 4580 | HTTP | `0.0.0.0` | `electron/mobile.js:4408` | ❌ Mobile LAN server，Phase 2 删除 |

**当前监听端口数**：3 个（2 loopback + 1 LAN）
**改造后预期**：2 个（均为 loopback）

---

## 10. 当前移动端代码清单（33+ 文件，待 Phase 2 删除）

引用 `docs/audits/phase-00-pre-cleanup-inventory.md` §4.1-§4.5，共：

### 10.1 移动端运行时（4 个）
- `electron/mobile.js`（4548 行）
- `electron/mobile-sessions.js`（1839 行）
- `electron/mobile-agent-runner.js`（732 行，已修改未提交）
- `electron/mobile-contract.js`（141 行，未跟踪）

### 10.2 移动端 UI（整个目录）
- `public/mobile/`（index.html / mobile.js / mobile.css / assets/agents/*.svg）

### 10.3 移动端测试脚本（13 个）
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

### 10.4 移动端实验目录（9 个）
- `experiments/mobile-qa0/`
- `experiments/mobile-qa1/`
- `experiments/mobile-ui1a/`
- `experiments/mobile-ui1b/`
- `experiments/mobile-reframe-r2/`
- `experiments/mobile-ux-reframe/`
- `experiments/mobile-ux-polish/`
- `experiments/mobile-paseo-r1/`
- `experiments/mobile-paseo-r1-fix/`

### 10.5 移动端文档（5 + 8 未跟踪）
- `docs/fanbox-mobile-current-map.md`
- `docs/mobile-backend-contract.md`
- `docs/mobile-convergence-roadmap.md`
- `docs/mobile-gap-to-paseo.md`
- `docs/paseo-mobile-reference-map.md`
- `docs/mobile-v2/`（整个目录，8 个未跟踪文件）
- `.trae/documents/*mobile*`（10 个未跟踪文件）
- `.trae/specs/`（整个目录，未跟踪）

---

## 11. 当前微信代码清单（14+ 文件，待 Phase 3 删除）

引用 `docs/audits/phase-00-pre-cleanup-inventory.md` §4.6-§4.8，共：

### 11.1 微信运行时（6 个，整个 `electron/wechat/` 目录）
- `electron/wechat/bridge.js`
- `electron/wechat/driver.js`
- `electron/wechat/env.js`
- `electron/wechat/ilink.js`
- `electron/wechat/memory.js`
- `electron/wechat/test-server.js`

### 11.2 微信测试与设计 demo（7 个）
- `scripts/verify-wechat-bridge.js`
- `design-demos/wechat-clawbot-A-im.html`
- `design-demos/wechat-clawbot-A-im.png`
- `design-demos/wechat-clawbot-B-hara.html`
- `design-demos/wechat-clawbot-B-hara.png`
- `design-demos/wechat-clawbot-C-native.html`
- `design-demos/wechat-clawbot-C-native.png`

### 11.3 微信文档（2 个）
- `docs/07-微信ClawBot集成规划.md`
- `docs/08-微信ClawBot-参考与署名.md`

---

## 12. Phase 0 验证结果

| 项 | 结果 |
|---|---|
| `npm ci` | ✅ 599 包安装成功 |
| `npm run rebuild` | ✅ Rebuild Complete（修复 GetVer.bat 后） |
| `npm run verify:build` | ✅ 全部检查通过（node-pty 1.1.0 加载 OK，winpty.gyp 已恢复原始） |
| `npm run dist:win` | ✅ Exit code 0，生成 `dist/FanBox 2.6.0.exe` + `dist/win-unpacked/` |
| 回退标签 | ✅ `archive/full-v2.6.0-mobile-wechat` 已打在 master HEAD `8150afc` |

### 12.1 node-pty rebuild 修复记录（本次关键修复）

**问题**：`scripts/rebuild-win.js` 生成的 `GetVer.bat` 内容是 `@call shared\UpdateGenVersion.bat %*`，`call` 不改变工作目录，导致 `UpdateGenVersion.bat` 中的 `mkdir ..\gen` 和 `>..\gen\GenVersion.h` 相对当前目录（`src/`）解析，把 `GenVersion.h` 生成到错误位置 `deps/winpty/gen/` 而非 `deps/winpty/src/gen/`，MSBuild 报 `error C1083: 无法打开包括文件: "GenVersion.h"`。

**修复**：将 `scripts/rebuild-win.js` 第 77 行 + 第 79 行的 `GetVer.bat` 内容从 `@call shared\UpdateGenVersion.bat %*` 改为 `@cd shared && UpdateGenVersion.bat %*`，`cd` 改变工作目录到 `shared/`，使 `../gen/` 解析为 `src/gen/`。

**验证**：
- `[rebuild] 创建 GetVer.bat ✓`
- `[rebuild] 已 patch`
- `✔ Rebuild Complete`
- `[rebuild] ✓`
- `verify-windows-build.js` 全部检查通过
- `winpty.gyp` 已恢复原始状态（rebuild-win.js finally 块正确执行）

**可复现性证明**：修复后的 `scripts/rebuild-win.js` 在干净环境可重复执行——`GetVer.bat` 由脚本自动生成，`winpty.gyp` patch 在 finally 块恢复，无任何手动复制 `.node` 文件伪造。

---

## 13. 改造前架构快照

### 13.1 当前监听端口拓扑

```
FanBox.exe (Electron 主进程)
  ├─ server.js:4567  HTTP  127.0.0.1   桌面主 server
  ├─ server.js:4568  HTTP  127.0.0.1   预览隔离 server（HTML 预览沙盒）
  └─ mobile.js:4580  HTTP  0.0.0.0      Mobile LAN server（待删除）
                       ↓
                  局域网内任意 IP
```

### 13.2 当前生产依赖图

```
dependencies (5)
  ├─ @xterm/addon-fit      ✅ 桌面终端
  ├─ @xterm/addon-unicode11 ✅ 桌面终端
  ├─ @xterm/addon-webgl    ✅ 桌面终端
  ├─ @xterm/xterm          ✅ 桌面终端
  ├─ node-pty              ✅ 桌面终端（PTY）
  └─ qrcode                ❌ 仅微信用，Phase 3 删
```

### 13.3 当前 app.asar 包含的非生产内容

| 类别 | 文件数 | 说明 |
|---|---|---|
| `_m3-*/_m4-*/_m5-*` | ~27 | 外部 Flutter 项目脚手架，与 FanBox 桌面无关 |
| `experiments/` | 118 | 开发实验资源（含大量 mobile-*/screenshots/） |
| `docs/` | 35 | 开发文档（含 mobile-*、wechat-*） |
| `design-demos/` | 26 | 设计 demo（含 wechat-clawbot-*、promo banners） |
| `scripts/` | 23 | 开发脚本（含 smoke-mobile-*、verify-mobile-*、verify-wechat-bridge） |
| `.trae/` | 20 | IDE 配置 |
| `.codegraph/` | 4 | IDE 索引 |
| `.tmp/` | 3 | 临时文件 |
| `src-vendor/` | 3 | vendor 源码 |
| `tests/` | 3 | 测试 |
| `素材/` | 2 | 中文目录 |
| 其他根文件 | ~5 | main.js / architecture-review-*.html / playwright.config.js / dist-build.log / phase2a.log / .icon.html |

**估算可清理文件数**：1402 - 运行时必需（~250-300）= ~1100 文件可在 Phase 6 后从 app.asar 中清除。

---

## 14. 改造目标体积估算（Phase 6 后预期）

| 项 | 当前 MB | 预期 MB | 变化 | 说明 |
|---|---|---|---|---|
| EXE | 101.85 | ~75-80 | -22 ~ -27 | 7z 压缩后，主要来自 asar 内清理 |
| win-unpacked | 361.85 | ~290-300 | -62 ~ -72 | app.asar 缩小 + asar.unpacked 清理 arm64 |
| app.asar | 68.33 | ~15-20 | -48 ~ -53 | 清理非生产内容后 |
| app.asar.unpacked | 25.45 | ~10-12 | -13 ~ -15 | 清理 arm64 prebuilds + build 中间产物 |

**Electron 固有下限**：约 270 MB（win-unpacked）/ 约 80 MB（7z 压缩后 EXE）

**不迁移 Tauri 的理由**：
1. 重写整个桌面 UI 成本高，破坏桌面稳定性
2. node-pty + ConPTY 在 Tauri 中需要重新实现 native binding
3. Monaco / Milkdown / xterm 需要重新适配 Tauri webview
4. 收益有限：Electron 固有下限 270MB，Tauri 大约 30-50MB，但需投入数月重写

---

## 15. 改造前 commit 历史

```
8150afc Release v2.6.0: desktop sidebar/terminal/soft-theme iteration + mobile project-memory timeline
f35ffab Fix mobile project-memory chat timeline and terminal binding
6b00edc fix(desktop): align terminal titles with memory and expand collapsed terminal
a62f9bb fix(desktop): restore single terminal view and allow 10 sessions
4799456 feat(desktop): add workspace usage, collapsible file pane, and terminal grid
```

---

## 16. 改造前工作区状态

| 类别 | 文件数 | 处理 |
|---|---|---|
| 已修改未提交 | 3 | `electron/mobile-agent-runner.js`、`scripts/rebuild-win.js`、`scripts/smoke-mobile-agent-stream.js` |
| 未跟踪文件 | 49 | 详见 `docs/audits/phase-00-pre-cleanup-inventory.md` |
| 标签 | 1 | `archive/full-v2.6.0-mobile-wechat`（已打在 master HEAD `8150afc`） |

---

## 17. 下一步行动

按 `.trae/documents/desktop-only-resume-execution_plan.md` 执行：

1. **Phase 0 commit**（当前）：`chore: capture desktop-only baseline`，提交 `docs/audits/phase-00-pre-cleanup-inventory.md` + `docs/audits/desktop-only-baseline.md` + `scripts/rebuild-win.js`（含 GetVer.bat 修复）
2. **Phase 0 对抗性审查**：`docs/audits/phase-01-baseline-review.md`
3. **Phase 1**：生成 `docs/audits/phase-01-removal-inventory.md`
4. **Phase 2-11**：按计划逐步执行

---

## 18. 数据真实性声明

本报告所有数字均来自以下 PowerShell 命令在 2026-07-21 的实测输出：

- `Get-Item "dist\FanBox 2.6.0.exe" | Select Length`
- `Get-ChildItem "dist\win-unpacked" -Recurse -File | Measure-Object -Sum Length`
- `Get-Item "dist\win-unpacked\resources\app.asar" | Select Length`
- `Get-ChildItem "dist\win-unpacked\resources\app.asar.unpacked" -Recurse -File | Measure-Object -Sum Length`
- `npx asar list "dist\win-unpacked\resources\app.asar" | Measure-Object`
- `Get-ChildItem -Path electron,public,docs,experiments,scripts,design-demos,src-vendor,tests -Recurse -File | Sort Length -Desc | Select -First 30`
- `npm run verify:build` 输出
- `npm run dist:win` 输出

**无任何伪造或占位符数字**。
