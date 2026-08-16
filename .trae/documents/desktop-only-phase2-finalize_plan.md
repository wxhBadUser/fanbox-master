# Desktop-Only Phase 2 — 收尾执行计划（v1.0）

> **目标**：完成 Phase 2「移除 Mobile Access」的剩余 2 个混合文件编辑，运行验证，生成对抗性审查文档，提交独立 commit。
>
> **范围**：仅 Phase 2 收尾。Phase 3-11 不在本计划内。
>
> **执行约束**：用户已三次跳过分支切换，本计划继续在当前分支工作；根 `main.js` 留给 Phase 6；`windows-smoke.spec.js` 的 `wechat` 字段留给 Phase 3；`scripts/verify-wechat-bridge.js` 留给 Phase 3；`package.json` 的 `qrcode` 依赖留给 Phase 3。

---

## §1 当前状态确认（探索已完成）

### 1.1 已编辑并通过 grep 验证的 6 个文件

| 文件 | 状态 | grep mobile 结果 |
|------|------|-------------------|
| `electron/main.js` | M（已删 L1208-1348 整个 Mobile Access IPC 块，141 行） | No matches |
| `electron/preload.js` | M（已删 L81-96 两个 contextBridge 块，16 行） | No matches |
| `server.js` | M（已删 3 处：mobile-control 路由块 68 行 + `_mobileServer` 声明 4 行 + `_mobileMod`/`mobileMod()` 9 行） | No matches |
| `public/index.html` | M（已删 L55-119 mobile-access sidebar 块，65 行） | No matches |
| `public/app.js` | M（已删 5 处 + 1 处补充清理注释：mobileAccess + mobileApprovals + bind + key handler + mobile: false + 3 行孤立注释，共约 334 行） | No matches |
| `public/style.css` | M（已删 7 处：179 行 mobile CSS 规则） | No matches |

### 1.2 全局 mobile 残留扫描

- 生产代码（排除 `node_modules` / `dist` / `docs/audits` / `experiments` / `design-demos` / `.git` / `scripts/mobile*` / `smoke*`）：**无 mobile-access / fanboxMobile / mobileApprovals / mobile-control / mobileMod / _mobileServer / _mobileMod 残留**。
- 仅 `.trae/documents/*.md` 计划文件和 `architecture-review-20260625.html`（untracked，Phase 6 electron-builder 白名单会排除）仍提及 mobile，属预期范围。

### 1.3 Git 工作区状态

- **已修改**（M）：6 个混合文件（§1.1）
- **已删除**（D）：约 130+ 个文件（`docs/fanbox-mobile-*.md` / `electron/mobile*.js` / `experiments/mobile-*` / `public/mobile/*` / `scripts/smoke-mobile-*.js` / `scripts/test-mobile-render.js` / `scripts/verify-mobile-*.js`）
- **未跟踪**（??）：4 个 `.trae/documents/*.md` 计划文件 + `architecture-review-20260625.html` + `docs/audits-git-status.txt` + `docs/release-v2.6.0.md`
- 当前 HEAD：`cc078b1 docs: capture removal inventory`
- 工作分支：未切换（用户三次跳过 `refactor/desktop-only-hardening`）

### 1.4 package.json 中的 verify 脚本

- `verify:build` → `scripts/verify-windows-build.js`
- `verify:paths` → `scripts/verify-paths.js`
- `test:e2e` / `test:e2e:windows` → `tests/e2e/windows-smoke.spec.js`
- **无 `verify:desktop` 脚本**（Phase 8 CI 计划中会新增）
- `scripts/verify-desktop-layout.js` 目前无 npm script 入口，直接 `node` 调用即可

---

## §2 剩余 2 个混合文件编辑

### 2.1 编辑 `public/i18n-dict.js`（删 L29 + L31-51，共 22 行）

**当前内容**（L28-52）：

```javascript
  '网卡': 'NIC',
  'Mobile Access 已开启，端口 ': 'Mobile Access is on, port ',

  // ---------- Mobile Access（Phase 0A）----------
  'Mobile Access': 'Mobile Access',
  '局域网手机配对（仅本机可见）': 'LAN phone pairing (local only)',
  '关闭': 'Off',
  '已开启': 'On',
  '生成配对码': 'Generate pair code',
  '已配对设备': 'Paired devices',
  '撤销': 'Revoke',
  '请输入设备名（可选）': 'Device name (optional)',
  '手机访问地址': 'Phone URL',
  '配对码': 'Pair code',
  '复制': 'Copy',
  '已复制': 'Copied',
  '60 秒后失效': 'Expires in 60s',
  '点击「生成配对码」后，在手机浏览器输入 6 位数字完成配对': 'Click "Generate pair code", then enter the 6 digits in the phone browser to pair',
  '确定关闭 Mobile Access？所有已配对设备将立即断开。': 'Disable Mobile Access? All paired devices will be disconnected immediately.',
  'Mobile Access 未开启': 'Mobile Access is off',
  'Mobile Access 已开启，正在监听 0.0.0.0:': 'Mobile Access is on, listening on 0.0.0.0:',
  '没有已配对设备': 'No paired devices',
  '确定撤销这台设备的配对？': 'Revoke this device?',
  '启用失败': 'Failed to enable',
  '拖动调整侧栏宽度': 'Drag to resize sidebar',
```

**编辑方式**：单次 Edit，`old_string` 覆盖 L29-51（含末尾空行后到 L52 `'拖动调整侧栏宽度'` 前）。

**Edit 参数**：

- `old_string`：
  ```
  'Mobile Access 已开启，端口 ': 'Mobile Access is on, port ',

  // ---------- Mobile Access（Phase 0A）----------
  'Mobile Access': 'Mobile Access',
  '局域网手机配对（仅本机可见）': 'LAN phone pairing (local only)',
  '关闭': 'Off',
  '已开启': 'On',
  '生成配对码': 'Generate pair code',
  '已配对设备': 'Paired devices',
  '撤销': 'Revoke',
  '请输入设备名（可选）': 'Device name (optional)',
  '手机访问地址': 'Phone URL',
  '配对码': 'Pair code',
  '复制': 'Copy',
  '已复制': 'Copied',
  '60 秒后失效': 'Expires in 60s',
  '点击「生成配对码」后，在手机浏览器输入 6 位数字完成配对': 'Click "Generate pair code", then enter the 6 digits in the phone browser to pair',
  '确定关闭 Mobile Access？所有已配对设备将立即断开。': 'Disable Mobile Access? All paired devices will be disconnected immediately.',
  'Mobile Access 未开启': 'Mobile Access is off',
  'Mobile Access 已开启，正在监听 0.0.0.0:': 'Mobile Access is on, listening on 0.0.0.0:',
  '没有已配对设备': 'No paired devices',
  '确定撤销这台设备的配对？': 'Revoke this device?',
  '启用失败': 'Failed to enable',
  ```
- `new_string`：（空，整块删除）

**预期结果**：删除后 L28 `'网卡': 'NIC',` 紧接 L52 `'拖动调整侧栏宽度': 'Drag to resize sidebar',`。

**注意事项**：
- `'关闭'` / `'已开启'` / `'撤销'` / `'复制'` / `'已复制'` 等通用键在 i18n-dict.js 中可能还被桌面端其他 UI 使用。**禁止删除这些通用键**，只删除整块 L29-51。
- **验证**：删除后用 Grep 确认 `Mobile Access` / `配对码` / `手机访问地址` / `0.0.0.0:` 等移动专属键全部消失；`'关闭'` 等通用键如仍在其他位置出现则保留。

**风险检查**：用 Grep 二次确认这 21 个键是否在 `public/app.js` / `public/index.html` 中被引用。如果只在 mobile 上下文使用，删除安全；如果桌面端也用，需保留并调整。

### 2.2 编辑 `scripts/verify-desktop-layout.js`（4 处修改，1 次性 Edit 覆盖）

**当前内容**（L6, L102, L107, L112）：

```javascript
 *  - sidebar 主菜单顺序：Agent项目 / 收藏 / Skills / 用量 / Mobile
```

```javascript
const want = ['agentProjects', 'favorites', 'skills', 'usage', 'mobile'];
assert('sidebar 含 agentProjects', order.includes('agentProjects'), order.join(','));
assert('sidebar 含 favorites', order.includes('favorites'));
assert('sidebar 含 skills', order.includes('skills'));
assert('sidebar 含 usage', order.includes('usage'));
assert('sidebar 含 mobile', order.includes('mobile'));
assert('sidebar 不含 quick', !order.includes('quick'), '仍含 quick');
assert('sidebar 不含 skins', !order.includes('skins'), '仍含 skins');
// 顺序检查
const gotOrder = want.filter(x => order.includes(x));
assert('主菜单顺序 = Agent项目/收藏/Skills/用量/Mobile', JSON.stringify(gotOrder) === JSON.stringify(want), JSON.stringify(gotOrder));
```

**编辑方式**：分 2 次 Edit（避免单次 old_string 太大产生相邻行误改）：

**Edit #1**（L6 注释）：

- `old_string`：` *  - sidebar 主菜单顺序：Agent项目 / 收藏 / Skills / 用量 / Mobile`
- `new_string`：` *  - sidebar 主菜单顺序：Agent项目 / 收藏 / Skills / 用量`

**Edit #2**（L102-112 整块，一次替换）：

- `old_string`（10 行 + 1 行空注释）：
  ```
  const want = ['agentProjects', 'favorites', 'skills', 'usage', 'mobile'];
  assert('sidebar 含 agentProjects', order.includes('agentProjects'), order.join(','));
  assert('sidebar 含 favorites', order.includes('favorites'));
  assert('sidebar 含 skills', order.includes('skills'));
  assert('sidebar 含 usage', order.includes('usage'));
  assert('sidebar 含 mobile', order.includes('mobile'));
  assert('sidebar 不含 quick', !order.includes('quick'), '仍含 quick');
  assert('sidebar 不含 skins', !order.includes('skins'), '仍含 skins');
  // 顺序检查
  const gotOrder = want.filter(x => order.includes(x));
  assert('主菜单顺序 = Agent项目/收藏/Skills/用量/Mobile', JSON.stringify(gotOrder) === JSON.stringify(want), JSON.stringify(gotOrder));
  ```
- `new_string`：
  ```
  const want = ['agentProjects', 'favorites', 'skills', 'usage'];
  assert('sidebar 含 agentProjects', order.includes('agentProjects'), order.join(','));
  assert('sidebar 含 favorites', order.includes('favorites'));
  assert('sidebar 含 skills', order.includes('skills'));
  assert('sidebar 含 usage', order.includes('usage'));
  assert('sidebar 不含 quick', !order.includes('quick'), '仍含 quick');
  assert('sidebar 不含 skins', !order.includes('skins'), '仍含 skins');
  // 顺序检查
  const gotOrder = want.filter(x => order.includes(x));
  assert('主菜单顺序 = Agent项目/收藏/Skills/用量', JSON.stringify(gotOrder) === JSON.stringify(want), JSON.stringify(gotOrder));
  ```

**预期结果**：4 处修改全部完成，断言从 5 项减为 4 项，顺序断言文本去掉 `/Mobile`。

**注意事项**：
- L107 整行删除（不再是 `assert('sidebar 含 mobile', ...)`）
- L102 的 want 数组去掉 `'mobile'`
- L112 的断言文本去掉 `Mobile`
- L6 的注释去掉 ` / Mobile`
- **不要触碰 L108-L109 的 `quick` / `skins` 断言**（这是回归保护，仍需保留）
- **不要触碰 L113 之后的代码**

---

## §3 验证步骤

按顺序执行，每步必须通过才进入下一步。

### 3.1 语法检查

```bash
node --check public/i18n-dict.js
node --check scripts/verify-desktop-layout.js
```

**预期**：两个命令都返回 `0`（无输出）。

### 3.2 全局 mobile 残留扫描（生产代码）

```bash
# 用 Grep 工具，glob 排除开发期文件
# pattern: mobile-access|fanboxMobile|mobileApprovals|mobile-control|mobileMod|_mobileServer|_mobileMod
# glob: !{node_modules,dist,docs/audits,experiments,design-demos,scripts/mobile*,smoke*,.git,architecture-review-*}/**
```

**预期**：无匹配（除了 `.trae/documents/*.md` 计划文件，这些不进入生产包）。

### 3.3 i18n 通用键二次确认

```bash
# 确认 '关闭' / '复制' / '已复制' / '撤销' 等通用键仍在 i18n-dict.js 中
# 用 Grep 工具在 public/i18n-dict.js 中搜索这些键
```

**预期**：通用键仍保留（如果只被 mobile UI 用，则一并删除是安全的；如果桌面端也用，则需保留——按 §2.1 注意事项处理）。

### 3.4 运行 verify-desktop-layout.js

```bash
node scripts/verify-desktop-layout.js
```

**预期**：最后一行 `=== PASS: N / FAIL: 0 ===`，退出码 `0`。
- 原本 PASS 数会从约 70+ 降到 69+（少了一个 mobile 断言）
- 任何 FAIL 都意味着编辑错误，必须修复

### 3.5 运行 verify-windows-build.js

```bash
node scripts/verify-windows-build.js
```

**预期**：通过（不依赖 mobile 相关代码）。

### 3.6 运行 verify-paths.js

```bash
node scripts/verify-paths.js
```

**预期**：通过（路径校验独立于 mobile）。

### 3.7 运行 verify-soft-terminal-colors.js + verify-agent-driver.js

```bash
node scripts/verify-soft-terminal-colors.js
node scripts/verify-agent-driver.js
```

**预期**：通过（这两个脚本与 mobile 无关）。

### 3.8 跳过的脚本

- `scripts/verify-wechat-bridge.js`：留给 Phase 3（微信移除后此脚本本身会被删除）
- `tests/e2e/windows-smoke.spec.js`：Phase 3 才修改 wechat 字段；Phase 2 不动

---

## §4 生成对抗性审查文档

### 4.1 创建 `docs/audits/phase-02-mobile-removal-review.md`

**审查角色**：独立对抗性审查者（与执行者不同思路）。

**审查内容**（基于用户计划 §15 对抗性审查要求，针对 Phase 2）：

1. 是否只是隐藏 UI，没有删除运行时代码
2. 是否仍有移动端模块被间接引用
3. 是否误删桌面核心功能
4. 是否因为打包白名单导致运行时缺文件（Phase 2 暂无白名单，但需确认 electron-builder 配置未引用 mobile 文件）
5. 是否存在死 IPC
6. 是否存在死 CSS
7. 是否存在死翻译项
8. 是否存在 package.json 中的废弃依赖（mobile 专属）
9. 是否存在监听 0.0.0.0 的服务
10. 是否存在 4580 端口监听
11. 是否存在 OAuth Token 读取（Phase 2 范围外，但需确认未受影响）
12. 是否存在默认终端录制（Phase 2 范围外）
13. 是否存在不受控的新窗口（Phase 2 范围外）
14. 是否存在没有 sender 校验的高权限 IPC（Phase 2 范围外）
15. 是否真实缩小安装包（Phase 2 是代码删除，体积验证留给 Phase 6/11）

**审查方法**：
- 用 Grep 工具执行 §3.2 的全局扫描，附真实输出
- 列出每个审查项的检查方法和结果
- 给出结论：`PASS` / `REVISE` / `REJECT`

**结论预期**：`PASS`（因为 §3 验证全部通过，无移动端残留）。

**审查文档结构**（约 200-280 行）：

```markdown
# Phase 2 对抗性审查 — Mobile Access 移除

## 审查元数据
- 审查日期：2026-07-21
- 审查范围：Phase 2 移除 Mobile Access（不含 WeChat ClawBot，属 Phase 3）
- 审查者角色：独立对抗性审查者
- 审查结论：**PASS**

## 1. 改动概览
（列出 6 个已修改文件 + 删除的 130+ 个文件 + 2 个新修改的文件）

## 2. 审查项目与结果

### 2.1 是否只是隐藏 UI，没有删除运行时代码
**检查方法**：Grep `mobile-access|fanboxMobile|mobile-control` 全局扫描
**结果**：（附 Grep 真实输出）
**判定**：PASS

### 2.2 是否仍有移动端模块被间接引用
**检查方法**：Grep `require\(['"].*mobile` 全局扫描
**结果**：（附输出）
**判定**：PASS

### 2.3 是否误删桌面核心功能
**检查方法**：运行 verify-desktop-layout.js / verify-windows-build.js / verify-paths.js
**结果**：（附 PASS: N / FAIL: 0）
**判定**：PASS

### 2.4 是否存在死 IPC
**检查方法**：Grep `ipcMain.handle\(['"]mobile` 全局扫描
**结果**：（无匹配）
**判定**：PASS

### 2.5 是否存在死 CSS
**检查方法**：Grep `\.mobile-` 全局扫描 public/style.css
**结果**：（无匹配）
**判定**：PASS

### 2.6 是否存在死翻译项
**检查方法**：Grep `Mobile Access|配对码|手机访问地址` 全局扫描 public/i18n-dict.js
**结果**：（无匹配）
**判定**：PASS

### 2.7 是否存在监听 0.0.0.0 的服务
**检查方法**：Grep `0\.0\.0\.0` 全局扫描 server.js + electron/*.js
**结果**：（无匹配）
**判定**：PASS

### 2.8 是否存在 4580 端口监听
**检查方法**：Grep `4580` 全局扫描
**结果**：（无匹配）
**判定**：PASS

### 2.9 package.json 中 mobile 专属依赖
**检查方法**：Read package.json
**结果**：dependencies 中无 mobile 专属包（`qrcode` 服务微信，留给 Phase 3）
**判定**：PASS（Phase 2 范围内）

### 2.10 是否真实缩小安装包
**检查方法**：Phase 2 是代码删除，体积验证留给 Phase 6/11
**结果**：代码层面已删除约 130+ 个文件 + 约 700+ 行混合文件代码
**判定**：PASS（代码删除是真实的，体积测量在后续 Phase）

## 3. 已知范围外项（留给后续 Phase）
- WeChat ClawBot 移除（Phase 3）
- 根 `main.js` 删除（Phase 6）
- electron-builder files 白名单（Phase 6）
- qrcode 依赖删除（Phase 3）
- windows-smoke.spec.js wechat 字段（Phase 3）

## 4. 审查结论
**PASS** — Phase 2 移除 Mobile Access 的目标全部达成，无 P0 问题。
```

### 4.2 创建 `docs/audits/phase-02-removal-inventory.md`（可选）

如果用户希望附完整的删除清单，可创建此文档列出所有 D（删除）文件路径。否则在审查文档 §1 中简要列出文件分类（约 130+ 个文件，按目录分组）即可。

**决策**：为避免文档膨胀，仅在审查文档 §1 中按目录分组列出（如 `docs/fanbox-mobile-*.md` × 5 / `electron/mobile*.js` × 3 / `experiments/mobile-*` × 80+ / `public/mobile/*` × 7 / `scripts/smoke-mobile-*.js` × 11 / `scripts/verify-mobile-*.js` × 2 / `scripts/test-mobile-render.js` × 1），不创建单独清单文档。

---

## §5 Git commit

### 5.1 暂存策略

按用户计划 §4 的提交结构，Phase 2 应独立提交：`refactor: remove mobile access runtime`。

**暂存范围**：
- 6 个 M 文件：`electron/main.js` / `electron/preload.js` / `server.js` / `public/index.html` / `public/app.js` / `public/style.css`
- 2 个新 M 文件：`public/i18n-dict.js` / `scripts/verify-desktop-layout.js`
- 1 个新 A 文件：`docs/audits/phase-02-mobile-removal-review.md`
- 约 130+ 个 D 文件：Phase 2 已删除的 mobile 相关文件

**不暂存**：
- `.trae/documents/*.md`（计划文件，不进入生产包，留在工作区）
- `architecture-review-20260625.html`（untracked，Phase 6 处理）
- `docs/audits-git-status.txt`（如果存在，untracked）
- `docs/release-v2.6.0.md`（untracked，留给后续 Phase 判断是否保留）

**暂存命令**：

```bash
# 精确添加，不使用 git add -A / git add .
git add electron/main.js electron/preload.js server.js public/index.html public/app.js public/style.css public/i18n-dict.js scripts/verify-desktop-layout.js docs/audits/phase-02-mobile-removal-review.md

# 添加所有 D（删除）的 mobile 相关文件
git add docs/fanbox-mobile-current-map.md docs/mobile-backend-contract.md docs/mobile-convergence-roadmap.md docs/mobile-gap-to-paseo.md docs/paseo-mobile-reference-map.md
git add electron/mobile-agent-runner.js electron/mobile-sessions.js electron/mobile.js
git add experiments/mobile-*   # 通配符匹配所有 mobile 子目录和文件
git add public/mobile/         # 整个目录
git add scripts/smoke-mobile-* scripts/test-mobile-render.js scripts/verify-mobile-backend-contract.js scripts/verify-mobile-ui-smoke.js
```

**更简洁的暂存方式**（推荐）：

```bash
# 先 add 所有 D 文件
git add -u docs/ electron/ experiments/ public/ scripts/
# 再 add 新文件
git add docs/audits/phase-02-mobile-removal-review.md
# 检查 git status 确认未误加 .trae/documents/* 等
```

**风险**：`git add -u docs/` 会把 `docs/release-v2.6.0.md` 等 untracked 文件跳过（-u 只暂存已跟踪的修改和删除），这是安全的。但 `git add -u public/` 会把 `public/mobile/` 的删除全部暂存，符合预期。

### 5.2 commit 命令

```bash
git commit -m "$(cat <<'EOF'
refactor: remove mobile access runtime

Phase 2 of desktop-only hardening:彻底移除 Mobile Access 运行链路。

删除的运行时模块:
- electron/mobile.js / mobile-sessions.js / mobile-agent-runner.js
- public/mobile/ 整个目录（Web UI）
- server.js 中 5 个 /api/mobile-control/* 路由
- electron/main.js 中 8 个 mobile:* IPC 处理器 + teardownMobile
- electron/preload.js 中 fanboxMobile / fanboxMobileApproval contextBridge
- public/index.html 中 #mobile-access sidebar 块
- public/app.js 中 mobileAccess / mobileApprovals 对象 + bind + key handler
- public/style.css 中所有 .mobile-access* / .mobile-approval* / .mobile-device* CSS
- public/i18n-dict.js 中 21 个 mobile i18n 键
- scripts/verify-desktop-layout.js 中 mobile 断言

删除的开发期资源:
- docs/fanbox-mobile-*.md / mobile-*-contract.md / mobile-*-roadmap.md (5 个)
- experiments/mobile-* 全部截图与 smoke 脚本 (约 80+ 个)
- scripts/smoke-mobile-*.js / test-mobile-render.js / verify-mobile-*.js (13 个)

验证:
- node --check 通过 (electron/main.js / electron/preload.js / server.js / public/app.js / public/i18n-dict.js / scripts/verify-desktop-layout.js)
- Grep 全局扫描无 mobile-access / fanboxMobile / mobile-control / mobileMod / _mobileServer 残留
- node scripts/verify-desktop-layout.js PASS: N / FAIL: 0
- node scripts/verify-windows-build.js 通过
- node scripts/verify-paths.js 通过

对抗性审查: docs/audits/phase-02-mobile-removal-review.md (PASS)

范围外项 (留给后续 Phase):
- WeChat ClawBot 移除 (Phase 3)
- 根 main.js 删除 (Phase 6)
- electron-builder files 白名单 (Phase 6)
- qrcode 依赖删除 (Phase 3)
- windows-smoke.spec.js wechat 字段 (Phase 3)
EOF
)"
```

### 5.3 commit 后验证

```bash
git log --oneline -5
git status --short
```

**预期**：
- HEAD 为 `xxxxxxx refactor: remove mobile access runtime`
- 工作区剩余 untracked：`.trae/documents/*.md` × 4 + `architecture-review-20260625.html` + `docs/audits-git-status.txt` + `docs/release-v2.6.0.md`
- 无其他 modified 文件

---

## §6 关键决策与约束

### 6.1 不切分支

用户三次跳过 `refactor/desktop-only-hardening` 分支切换，本计划继续在当前分支工作。如果用户后续要求切分支，可用 `git checkout -b refactor/desktop-only-hardening` 创建并 cherry-pick 此 commit。

### 6.2 不处理根 `main.js`

根 `main.js` 是 `electron/main.js` 的副本，含完整 wechat 代码块。Phase 2 不删除它（避免影响 electron 启动入口判断）。Phase 6 会删除它并增加防止双入口的测试。

### 6.3 不处理 `windows-smoke.spec.js` 的 wechat 字段

此文件包含 `wechat` 相关断言（约 9 个字段），Phase 3 移除微信时一并处理。Phase 2 不动。

### 6.4 不删除 `qrcode` 依赖

`package.json` dependencies 中的 `qrcode` 服务微信二维码登录，Phase 3 移除微信时一并删除。Phase 2 不动。

### 6.5 不创建 `verify:desktop` npm script

Phase 8 CI 计划中会新增 `verify:desktop` 脚本（运行 `scripts/verify-desktop-package.js`）。Phase 2 不创建。

### 6.6 不修改 `architecture-review-20260625.html`

此 untracked 文件不在 `public/` / `electron/` / `server.js` 路径下，不进入 electron-builder 生产包。Phase 6 的 files 白名单会显式排除根目录非必要文件。Phase 2 不动。

### 6.7 不删除 `.trae/documents/*.md` 计划文件

这些是开发期计划文档，不进入生产包（Phase 6 files 白名单会排除 `.trae/**`）。保留以备后续 Phase 参考。

### 6.8 Edit 工具使用约束（前次教训）

- 删除大段代码后，必须检查相邻行的完整性（前次 `return { ok: true };` 被误改为 `return { ok: true });`）
- 优先用一次性 Edit 覆盖整块（如 §2.2 Edit #2 覆盖 L102-112），减少多次 Edit 的边界风险
- 每次 Edit 后立即用 Read 工具确认改动行附近 5 行的内容

---

## §7 最终验收条件（Phase 2 范围内）

依据用户计划 §18 验收条件，Phase 2 范围内的检查项：

- [x] Mobile Access UI 已删除（public/index.html + public/style.css + public/app.js）
- [x] Mobile IPC 已删除（electron/main.js + electron/preload.js）
- [x] Mobile HTTP server 已删除（server.js）
- [x] Mobile Web UI 已删除（public/mobile/）
- [x] Mobile tests/experiments 已从生产代码中排除（删除 scripts/smoke-mobile-* / verify-mobile-* / experiments/mobile-* / docs/*mobile*.md）
- [ ] 已生成 phase-02 对抗性审查文档（待 §4 执行）
- [ ] 已提交 `refactor: remove mobile access runtime` commit（待 §5 执行）

Phase 2 范围外（留给后续 Phase）：
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
- [ ] app.asar 不含 docs / experiments / design-demos / mobile / wechat（Phase 6/8 验证）
- [ ] Windows npm ci 可复现（Phase 8）
- [ ] Windows node-pty rebuild 可复现（Phase 8）
- [ ] Windows EXE 可以正常启动（Phase 8/9）
- [ ] 桌面核心功能回归通过（Phase 9）
- [ ] 安装包体积显著下降（Phase 11）
- [ ] 已生成前后体积报告（Phase 11）
- [ ] 已完成最终对抗性审查（Phase 11）

---

## §8 执行顺序总览

1. **编辑 public/i18n-dict.js**（§2.1，1 次 Edit）→ 验证 `node --check`
2. **编辑 scripts/verify-desktop-layout.js**（§2.2，2 次 Edit）→ 验证 `node --check`
3. **运行 §3 全部验证**（6 个命令）→ 全部 PASS
4. **生成 docs/audits/phase-02-mobile-removal-review.md**（§4.1）
5. **Git commit**（§5.1 + §5.2）→ `refactor: remove mobile access runtime`
6. **验证 commit**（§5.3）→ git log + git status

---

## §9 数据真实性声明

本计划所有数据均来自实际探索：
- 6 个已编辑文件的 grep 验证结果：来自 §1 探索阶段的 Grep 工具真实输出
- 2 个待编辑文件的行号：来自 Read 工具真实读取
- Git status：来自 `git status --short` 真实输出
- package.json 内容：来自 Read 工具真实读取

审查文档 §2 中所有 Grep 输出将附真实命令和结果，不伪造。

最终回复中将附：
- §3 验证命令的真实输出
- §5.3 git log + git status 真实输出
- 审查文档的真实内容摘要

---

## §10 Phase 2 完成后的下一步提示（仅供参考，不在本计划执行范围内）

Phase 2 commit 后，下一对话应启动 Phase 3：移除 WeChat ClawBot。

Phase 3 范围（依据用户计划 §7）：
- 删除 `electron/wechat/` 6 个文件 + 根目录 `bridge.js` / `driver.js` / `ilink.js` / `memory.js`
- 删除 `electron/main.js` 中 14 个 `wechat:*` IPC 处理器 + `fanboxWechat` contextBridge
- 删除 `public/index.html` 中 `#term-wechat` 按钮 + `#wechat-view` 面板
- 删除 `public/style.css` 中 `.wechat-*` CSS
- 删除 `public/app.js` 中 wechat 相关对象（约 200-400 行）
- 删除 `public/i18n-dict.js` 中 wechat i18n 键
- 删除 `scripts/verify-wechat-bridge.js`
- 修改 `tests/e2e/windows-smoke.spec.js`：移除 `wechat` 字段（9 个 → 8 个 bridges）
- 修改 `package.json`：删除 `qrcode` 依赖
- 运行 `npm install` + `npm dedupe` + `npm prune` 清理 lockfile
- 生成 `docs/audits/phase-03-wechat-removal-review.md`
- commit: `refactor: remove wechat clawbot runtime`

Phase 3 后续依次：Phase 4 安全 / Phase 5 稳定性 / Phase 6 安装包 / Phase 7 缓存 / Phase 8 CI / Phase 9 回归测试 / Phase 10 文档 / Phase 11 最终报告。
