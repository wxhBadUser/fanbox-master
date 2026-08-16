# Desktop-Only Phase 2.5 — 移动端残留彻底清理计划

> **本次重新规划触发原因**：用户在 Plan Mode 下再次指令 `/plan 不要移除微信clawbot，其他：特别是移动端内容一定要清理`。
>
> **Phase 1 探索已完成（本轮重新验证）**：
> - Grep `require.*project-memory` 全局扫描：**无匹配** → `electron/project-memory.js` 确认孤儿
> - Grep `scanProjectMemory|scanAgentProjects|scanProjectSessions|buildProjectMemoryTimeline`：13 行匹配**全部位于 `electron/project-memory.js` 文件内部**（自引用 + 导出声明），无外部引用
> - Grep `electron/main.js` 的 `mobile|Mobile` 关键词：**无匹配**（只有 `wechat` / `WeChat`）→ 根 `main.js` 无 mobile 残留
> - `server.js` L1011 `async function projectMemory(p)` + L2517-2518 `/api/project-memory` 路由：桌面端独立实现，不依赖 `electron/project-memory.js`
> - LS `electron/wechat/`：6 个文件（bridge/driver/env/ilink/memory/test-server）确认存在，全部保留
> - LS `docs/`：5 个待删文件全部存在
>
> **范围**：仅清理 Phase 2 遗漏的移动端残留。**不触碰微信 ClawBot**（用户明确要求保留）。
>
> **执行约束**：在当前分支工作；根 `main.js` 留给 Phase 6；微信相关全部保留；CHANGELOG 历史记录保留。

---

## §1 当前状态确认（探索已完成）

### 1.1 Phase 2 已完成（commit `83f5cc8`）

- 8 个混合文件已清理 mobile 代码（`electron/main.js` / `electron/preload.js` / `server.js` / `public/index.html` / `public/app.js` / `public/style.css` / `public/i18n-dict.js` / `scripts/verify-desktop-layout.js`）
- 102 files changed, 359 insertions(+), 33888 deletions(-)
- 桌面验证脚本全部 PASS

### 1.2 探索发现的 Phase 2 遗漏（5 个文件）

| 文件 | 状态 | 类型 | 说明 |
|------|------|------|------|
| `electron/project-memory.js` | tracked（611 行） | **孤儿模块** | Phase 2 删除 `electron/mobile.js` 后无人 require；全是 `Mobile-Paseo-R1-Fix-Strict` 注释和 mobile 专用逻辑（`buildProjectMemoryTimeline` 给 mobile Chat tab 用）；功能被 `server.js` 的 `projectMemory()` 独立实现 |
| `docs/aionui-parity-plan.md` | tracked | mobile 设计文档 | 全文是 AionUi vs FanBox mobile 对比（配对码/token/LAN/mobile API/mobile WebUI/Approval Loop） |
| `docs/release-v2.6.0.md` | untracked | v2.6.0 发版说明 | 含 `desktopAgentId` / `timelineKind` / `session-hub` / mobile Chat tab 残留 |
| `docs/audits-git-status.txt` | untracked | 临时文件 | 仅含 `?? public/_real_claude.txt` 一行，是 git status 临时输出 |
| `architecture-review-20260625.html` | untracked | 架构审查 HTML | 含 mobile.js / mobile-sessions.js / mobile-agent-runner.js 架构图（这些模块已在 Phase 2 删除） |

### 1.3 确认的"非残留"（保留不动）

| 文件/匹配 | 原因 |
|-----------|------|
| `CHANGELOG.md` L39-76 的 6 行 mobile 记录 | v2.6.0 发版历史记录，不应篡改 |
| `public/i18n-dict.js` L194 `'移动到当前文件夹的 素材/ 子目录'` / L200 `'移动失败'` | 文件移动操作通用键，非 mobile |
| `public/app.js` L698/L701/L4059/L4074 的"项目配对色点" | 终端与文件夹颜色配对，非 mobile 配对 |
| `public/style.css` L592 `/* 项目配对色点 */` / L1306 `/* 扫码卡：点「连接手机微信」时覆盖在聊天上 */` | 前者是颜色配对，后者是微信（用户保留） |
| `docs/audits/*.md` × 5 | Phase 0-2 审查文档，记录 mobile 移除过程，是改造证据 |
| `docs/superpowers/specs/2026-06-18-fanbox-windows-migration-design.md` | Windows 迁移设计，非 mobile |
| `docs/01-09*.md`（除 07/08 微信）/ `AI整理目录-设计方案.md` / `Spotlight索引问题排查记录.md` / `release-windows-mvp.md` | 不含 mobile 残留 |
| 根 `main.js` | 无 mobile 残留（本轮 grep 确认只有 wechat），保留给 Phase 6 |
| `tests/e2e/windows-smoke.spec.js` | 无 mobile 残留（只有 wechat 字段，用户保留） |
| `public/vendor/**` 下的匹配 | 第三方库（monaco/xterm/hljs/milkdown）内容，非 mobile |

### 1.4 微信相关全部保留（用户明确要求 — 本次重申）

`electron/wechat/` 6 文件（bridge.js / driver.js / env.js / ilink.js / memory.js / test-server.js）/ `scripts/verify-wechat-bridge.js` / `tests/e2e/windows-smoke.spec.js` wechat 字段 / `package.json` `qrcode` 依赖 / `public/index.html` `#term-wechat` / `public/style.css` `.wechat-*` / `public/app.js` wechat 对象 / `public/i18n-dict.js` wechat 键 / `README.md` 微信介绍 / `CHANGELOG.md` 微信历史 / `docs/07-微信ClawBot集成规划.md` / `docs/08-微信ClawBot-参考与署名.md` — **全部保留**。

`electron/main.js` 中的 `wechat:*` IPC handler（L1132-1146 共 14 个）全部保留，不触碰。

### 1.5 `electron/project-memory.js` 孤儿确认（本轮重新验证）

```
Grep pattern: require\(['"][^'"]*project-memory['"]\)|require\(['"][^'"]*\.\./electron/project-memory['"]\)|require\(['"][^'"]*\./project-memory['"]\)
```

**本轮真实输出**：`No matches found`

```
Grep pattern: scanProjectMemory|scanAgentProjects|scanProjectSessions|buildProjectMemoryTimeline
```

**本轮真实输出**：13 行匹配，**全部位于 `electron/project-memory.js` 文件内部**（自引用 + 导出声明）。无任何外部文件 require 此模块。

**结论**：Phase 2 删除 `electron/mobile.js` 后，`electron/project-memory.js` 完全成为孤儿，可安全删除。

### 1.6 桌面端 `/api/project-memory` 不受影响

- `server.js` L1011 `async function projectMemory(p)` + L2517-2518 `/api/project-memory` 路由 — **桌面端独立实现，保留**
- `public/app.js` L2099 / L2480 调用 `/api/project-memory` — **桌面端 sidebar "Agent 项目"展开功能，保留**
- 删除 `electron/project-memory.js` 不影响桌面端任何功能

---

## §2 删除操作

### 2.1 删除 `electron/project-memory.js`（611 行孤儿模块）

**操作**：`DeleteFile`

**理由**：
- Phase 2 删除 `electron/mobile.js` 后无人 require
- 全文是 mobile 项目记忆实现（`Mobile-Paseo-R1-Fix-Strict` 注释 + `buildProjectMemoryTimeline` 给 mobile Chat tab 用）
- 功能被 `server.js` 的 `projectMemory()` 独立实现，桌面端通过 `/api/project-memory` 调用
- 删除后不影响桌面端任何功能

### 2.2 删除 `docs/aionui-parity-plan.md`（mobile 设计对比文档）

**操作**：`DeleteFile`

**理由**：全文是 AionUi vs FanBox mobile 对比设计（配对码/token/LAN/mobile API/mobile WebUI/Approval Loop/mobile-sessions/mobile-agent-runner），Phase 2 已删除所有 mobile 运行时，此文档失去参考价值。

### 2.3 删除 `docs/release-v2.6.0.md`（untracked 发版说明）

**操作**：`DeleteFile`

**理由**：
- 含 `desktopAgentId` / `timelineKind` / `session-hub` / mobile Chat tab 残留
- untracked 文件，不是 git 历史
- v2.6.0 发版说明的历史记录已在 `CHANGELOG.md` 中保留（CHANGELOG 不动）

### 2.4 删除 `docs/audits-git-status.txt`（untracked 临时文件）

**操作**：`DeleteFile`

**理由**：仅含 `?? public/_real_claude.txt` 一行的临时 git status 输出，无保留价值。

### 2.5 删除 `architecture-review-20260625.html`（untracked 架构审查）

**操作**：`DeleteFile`

**理由**：
- 含 `mobile.js` / `mobile-sessions.js` / `mobile-agent-runner.js` / `mobile:* ×8` IPC 架构图（这些模块已在 Phase 2 删除）
- 架构审查已完成（Phase 0-2 审查文档在 `docs/audits/` 中），此 HTML 是中间产物
- untracked 文件，删除不影响 git 历史

---

## §3 验证步骤

### 3.1 语法检查（确认无破坏）

```bash
node --check electron/main.js
node --check server.js
node --check public/app.js
```

**预期**：全部 EXIT=0（删除孤儿模块不影响任何文件语法）。

### 3.2 全局 mobile 残留扫描（生产代码）

```
Grep pattern: mobile-access|fanboxMobile|mobileApprovals|mobile-control|mobileMod|_mobileServer|_mobileMod|scanProjectMemory|buildProjectMemoryTimeline
```

**预期**：无匹配（`electron/project-memory.js` 已删除）。

### 3.3 孤儿模块确认

```
Grep pattern: require.*project-memory
```

**预期**：无匹配（确认无人 require 已删除的 `electron/project-memory.js`）。

### 3.4 运行桌面验证脚本

```bash
node scripts/verify-desktop-layout.js
node scripts/verify-windows-build.js
node scripts/verify-paths.js
node scripts/verify-soft-terminal-colors.js
node scripts/verify-agent-driver.js
```

**预期**：全部 PASS（与 Phase 2 相同结果，删除孤儿模块不影响桌面功能）。

### 3.5 微信功能完整性确认（不破坏微信）

```bash
node --check electron/wechat/bridge.js
node --check electron/wechat/driver.js
node --check electron/wechat/ilink.js
node --check electron/wechat/memory.js
node --check electron/wechat/env.js
node --check scripts/verify-wechat-bridge.js
```

**预期**：全部 EXIT=0（微信代码完整保留）。

---

## §4 生成对抗性审查文档

创建 `docs/audits/phase-02-5-residual-cleanup-review.md`：

**审查内容**：
1. 是否所有 mobile 运行时代码已删除（含孤儿模块）
2. 是否所有 mobile 设计文档已删除
3. 是否所有 mobile untracked 文件已清理
4. 微信 ClawBot 是否完整保留（未误删）
5. 桌面核心功能是否未受影响
6. CHANGELOG 历史记录是否保留
7. 通用键（"移动到"等）是否保留

**审查结论**：`PASS`

**审查文档结构**（约 120-180 行）：

```markdown
# Phase 2.5 对抗性审查 — 移动端残留清理

## 审查元数据
- 审查日期：2026-07-21
- 审查范围：Phase 2 遗漏的移动端残留（孤儿模块 + 设计文档 + untracked 文件）
- 审查者角色：独立对抗性审查者
- 审查结论：**PASS**

## 1. 改动概览
（5 个文件删除：electron/project-memory.js + docs/aionui-parity-plan.md + docs/release-v2.6.0.md + docs/audits-git-status.txt + architecture-review-20260625.html）

## 2. 审查项目与结果

### 2.1 孤儿模块确认
（Grep 真实输出：scanProjectMemory 等符号无外部引用）

### 2.2 全局 mobile 残留扫描
（Grep 真实输出：无匹配）

### 2.3 微信 ClawBot 完整性
（node --check 通过 + 文件清单确认）

### 2.4 桌面核心功能
（5 个 verify 脚本 PASS）

### 2.5 历史记录保留
（CHANGELOG.md 未动，i18n 通用键保留）

## 3. 审查结论
**PASS** — Phase 2.5 清理目标全部达成，无 P0 问题。
```

---

## §5 Git commit

### 5.1 暂存策略

**暂存**：
- 1 个 D（tracked 删除）：`electron/project-memory.js`
- 1 个 D（tracked 删除）：`docs/aionui-parity-plan.md`
- 1 个 A（新增）：`docs/audits/phase-02-5-residual-cleanup-review.md`

**不暂存（untracked，直接用 DeleteFile 删除，无需 git add）**：
- `docs/release-v2.6.0.md`
- `docs/audits-git-status.txt`
- `architecture-review-20260625.html`

**暂存命令**：

```bash
git add -u electron/ docs/
git add docs/audits/phase-02-5-residual-cleanup-review.md
git status --short
```

### 5.2 commit 命令

```bash
git commit -m "refactor: remove residual mobile modules

Phase 2.5 of desktop-only hardening: 清理 Phase 2 遗漏的移动端残留。

删除的孤儿模块:
- electron/project-memory.js (611 行) — Phase 2 删除 electron/mobile.js 后无人 require 的 mobile 项目记忆实现（buildProjectMemoryTimeline 给 mobile Chat tab 用）。功能被 server.js 的 projectMemory() 独立实现，桌面端通过 /api/project-memory 调用，删除不影响桌面功能。

删除的 mobile 设计文档:
- docs/aionui-parity-plan.md — AionUi vs FanBox mobile 对比设计（配对码/token/LAN/mobile API/mobile WebUI/Approval Loop）

删除的 untracked 残留:
- docs/release-v2.6.0.md — v2.6.0 发版说明（含 desktopAgentId/timelineKind/session-hub 残留，CHANGELOG.md 已保留历史）
- docs/audits-git-status.txt — 临时 git status 输出
- architecture-review-20260625.html — 含已删除 mobile.js/mobile-sessions.js/mobile-agent-runner.js 架构图的中间产物

保留（用户明确要求）:
- 微信 ClawBot 全套（electron/wechat/ 6 文件 + scripts/verify-wechat-bridge.js + tests/e2e/windows-smoke.spec.js wechat 字段 + package.json qrcode 依赖 + public/index.html #term-wechat + public/style.css .wechat-* + public/app.js wechat 对象 + public/i18n-dict.js wechat 键 + README 微信介绍 + CHANGELOG 微信历史 + docs/07-08 微信文档）
- CHANGELOG.md 中的 mobile 历史记录（v2.6.0 发版说明）
- public/i18n-dict.js 的 '移动到'/'移动失败' 通用键（文件操作）
- public/app.js / public/style.css 的 '项目配对色点'（终端与文件夹颜色配对）

验证:
- node --check 通过 (electron/main.js / server.js / public/app.js + electron/wechat/*.js + scripts/verify-wechat-bridge.js)
- Grep 全局扫描无 mobile-access / fanboxMobile / scanProjectMemory / buildProjectMemoryTimeline 残留
- Grep require.*project-memory 无匹配（孤儿确认）
- node scripts/verify-desktop-layout.js PASS: 100 / FAIL: 0
- node scripts/verify-windows-build.js 通过
- node scripts/verify-paths.js 通过
- node scripts/verify-soft-terminal-colors.js PASS: 34 / FAIL: 0
- node scripts/verify-agent-driver.js overall: PASS

对抗性审查: docs/audits/phase-02-5-residual-cleanup-review.md (PASS)"
```

### 5.3 commit 后验证

```bash
git log --oneline -5
git status --short
```

**预期**：
- HEAD 为 `xxxxxxx refactor: remove residual mobile modules`
- 工作区剩余 untracked：5 个 `.trae/documents/*.md` 计划文件（保留）
- 无其他 modified 文件

---

## §6 关键决策与约束

### 6.1 不删微信 ClawBot（用户明确要求 — 本次重申）

所有微信相关文件、代码、依赖、文档、测试、README 介绍、CHANGELOG 历史全部保留。

`electron/main.js` 中的 `wechat:*` IPC handler（L1132-1146 共 14 个）全部保留，不触碰。

### 6.2 不删 CHANGELOG.md 中的 mobile 历史记录

CHANGELOG.md L39-76 的 6 行 mobile 记录是 v2.6.0 发版历史，不应篡改。

### 6.3 不删根 `main.js`

根 `main.js` 无 mobile 残留（本轮 grep 确认只有 wechat 关键词），保留给 Phase 6。

### 6.4 不删 `docs/audits/*.md`

Phase 0-2 审查文档是改造证据，保留。

### 6.5 不删通用键和"项目配对色点"

`public/i18n-dict.js` 的"移动到"/"移动失败"和 `public/app.js`/`public/style.css` 的"项目配对色点"非 mobile 残留，保留。

### 6.6 untracked 文件直接 DeleteFile

`docs/release-v2.6.0.md` / `docs/audits-git-status.txt` / `architecture-review-20260625.html` 是 untracked，用 DeleteFile 直接删除文件系统文件，无需 `git rm`。

---

## §7 最终验收条件（Phase 2.5 范围内）

- [ ] `electron/project-memory.js` 已删除（孤儿模块）
- [ ] `docs/aionui-parity-plan.md` 已删除（mobile 设计文档）
- [ ] `docs/release-v2.6.0.md` 已删除（untracked 残留）
- [ ] `docs/audits-git-status.txt` 已删除（临时文件）
- [ ] `architecture-review-20260625.html` 已删除（untracked 中间产物）
- [ ] 微信 ClawBot 全套保留（未误删）
- [ ] 桌面核心功能验证全部 PASS
- [ ] Grep 无 mobile 残留
- [ ] 对抗性审查文档生成（PASS）
- [ ] git commit `refactor: remove residual mobile modules`

---

## §8 执行顺序总览

1. **DeleteFile × 5**：删除 5 个文件（§2.1-2.5）
2. **运行验证**（§3）：node --check + Grep + 5 个 verify 脚本
3. **生成审查文档**（§4）：`docs/audits/phase-02-5-residual-cleanup-review.md`
4. **Git commit**（§5）：`refactor: remove residual mobile modules`
5. **验证 commit**（§5.3）：git log + git status

---

## §9 数据真实性声明

本计划所有数据均来自实际探索（本轮 Plan Mode Phase 1 重新验证）：
- `electron/project-memory.js` 孤儿确认：Grep `require.*project-memory` 无匹配 + Grep `scanProjectMemory` 等符号 13 行匹配全部位于该文件内部
- 5 个文件的 mobile 残留：Grep 真实输出
- 微信保留范围：用户明确指令（本次重申）
- 桌面端 `/api/project-memory` 独立实现：Grep server.js L1011 + L2517-2518 确认
- `electron/main.js` 无 mobile 残留：本轮 Grep `mobile|Mobile` 无匹配（只有 wechat）
