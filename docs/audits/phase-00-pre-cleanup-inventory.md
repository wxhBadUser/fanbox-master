# Phase 00 — 改造前工作区清单

> 记录时间：2026-07-21  
> 分支：master  
> HEAD：`8150afc`（Release v2.6.0: desktop sidebar/terminal/soft-theme iteration + mobile project-memory timeline）

## 1. 环境基线

| 项 | 值 |
|---|---|
| 操作系统 | Windows |
| Node.js | v24.11.1 |
| npm | 11.17.0 |
| Python | 3.13.12（注意：计划写 3.11，实际机器装的是 3.13，需在 rebuild 时确认可用） |
| 当前分支 | `master` |
| HEAD commit | `8150afc` |

## 2. 已修改未提交（2 个文件，不丢弃）

| 文件 | 处理策略 |
|---|---|
| `electron/mobile-agent-runner.js` | Phase 2 随 Mobile Access 一起删除 |
| `scripts/smoke-mobile-agent-stream.js` | Phase 2 随移动端测试脚本一起删除 |

## 3. 未跟踪文件分类

### 3.1 随本次改造删除（共 49 项）

#### 3.1.1 移动端 / 微信相关计划文档（`.trae/documents/`，11 个）
- `.trae/documents/android-native-mobile-rewrite_plan.md`
- `.trae/documents/mobile-b2c-followup-input_plan.md`
- `.trae/documents/mobile-b3a-session-draft_plan.md`
- `.trae/documents/mobile-b3b-start-draft-runner_plan.md`
- `.trae/documents/mobile-paseo-r1-fix-backend-final-verify.md`
- `.trae/documents/mobile-paseo-r1-fix-finalize.md`
- `.trae/documents/mobile-paseo-r1-fix-titles-chat-terminal.md`
- `.trae/documents/mobile-ui1a-contract-home_plan.md`
- `.trae/documents/mobile-ux-reframe-verification-commit_plan.md`
- `.trae/documents/mobile-ux-reframe_plan.md`
- `.trae/specs/`（整个目录，移动端 paseo r1 修复规范）

> 例外：`.trae/documents/desktop-only-hardening-refactor_plan.md`（本计划文件本身，保留）

#### 3.1.2 外部 Flutter 项目脚手架（根目录 `_m3-*/_m4-*/_m5-*`，31 个）
- `_m3-comprehensive-fix.js`
- `_m3-copy-dart.js`
- `_m3-docs.js`
- `_m3-error-code-fix.js`
- `_m3-fix-import.js`
- `_m3-flutter-ui.js`
- `_m3-fullid-fix.js`
- `_m3-resolve-fix.js`
- `_m3-reviews.js`
- `_m3-safeerror-fix.js`
- `_m3-test-assertions-fix.js`
- `_m3-write-sessions-screen.js`
- `_m3_commit_msg.txt`
- `_m3_main.dart`
- `_m3_realtime_client.dart`
- `_m3_sessions_screen.dart`
- `_m4-copy-verify.js`
- `_m4-deps-fix.js`
- `_m4-fix-cap-wt.js`
- `_m4-fix-index.js`
- `_m4-fix-m1-flutter-test.js`
- `_m4-fix-regex.js`
- `_m4-git-idempotent.js`
- `_m4-green.js`
- `_m4-reviews-docs.js`
- `_m4-rewrite-m1-flutter-test.js`
- `_m4-ws-fix.js`
- `_m4_verify.js`
- `_m5-fix-null-pem.js`
- `_m5-fix-test.js`
- `_m5-green.js`
- `_m5-reviews-docs.js`

> 判定依据：命名前缀 `_m3_*/_m4_*/_m5_*` 与 `flutter/dart/m1` 关键词显示这是另一 Flutter 移动项目脚手架，与 FanBox Electron 桌面无关。会污染生产包白名单，必须删除。

#### 3.1.3 移动端 / 微信文档与运行时（5 项）
- `architecture-review-20260625.html`（改造前快照，归档到 `docs/archive/`）
- `docs/mobile-v2/`（整个目录，8 个未跟踪移动端规划文档）
- `docs/release-v2.6.0.md`（v2.6.0 发布说明，含移动端/微信，归档到 `docs/archive/`）
- `electron/mobile-contract.js`（未跟踪，Phase 2 直接删除）
- `experiments/mobile-qa0/`（未跟踪移动端实验）

#### 3.1.4 开发期临时验证文件（4 项）
- `experiments/_ansi_shot.png`
- `public/_e2e_check.html`
- `public/_real_check.html`
- `public/_real_check2.html`
- `public/_real_claude.txt`

### 3.2 保留（已跟踪 + 未跟踪但属于桌面）

所有已跟踪文件默认保留。未跟踪文件保留项：
- `.trae/documents/desktop-only-hardening-refactor_plan.md`（本计划文件）
- `experiments/{bugfix-202606,drag-path-test,local-model-202606,readme-shots,bugfix-202606}`（非移动端实验）

## 4. 已确认待删除范围（来自 Phase 1 探索）

### 4.1 移动端运行时（4 个，已跟踪 + 未跟踪）
- `electron/mobile.js`（已跟踪）
- `electron/mobile-sessions.js`（已跟踪）
- `electron/mobile-agent-runner.js`（已跟踪，已修改未提交）
- `electron/mobile-contract.js`（未跟踪）

### 4.2 移动端 UI（整个目录）
- `public/mobile/`（含 `index.html` / `mobile.js` / `mobile.css` / `assets/agents/*.svg`）

### 4.3 移动端测试脚本（13 个）
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

### 4.4 移动端实验目录（11 个）
- `experiments/mobile-qa0/`（未跟踪）
- `experiments/mobile-qa1/`
- `experiments/mobile-ui1a/`
- `experiments/mobile-ui1b/`
- `experiments/mobile-reframe-r2/`
- `experiments/mobile-ux-reframe/`
- `experiments/mobile-ux-polish/`
- `experiments/mobile-paseo-r1/`
- `experiments/mobile-paseo-r1-fix/`

### 4.5 移动端文档（5 个 + 8 个未跟踪）
- `docs/fanbox-mobile-current-map.md`
- `docs/mobile-backend-contract.md`
- `docs/mobile-convergence-roadmap.md`
- `docs/mobile-gap-to-paseo.md`
- `docs/paseo-mobile-reference-map.md`
- `docs/mobile-v2/`（整个目录，8 个未跟踪文件）

### 4.6 微信运行时（整个目录，6 个）
- `electron/wechat/bridge.js`
- `electron/wechat/driver.js`
- `electron/wechat/ilink.js`
- `electron/wechat/memory.js`
- `electron/wechat/test-server.js`
- `electron/wechat/env.js`

### 4.7 微信测试与设计 demo（7 个）
- `scripts/verify-wechat-bridge.js`
- `design-demos/wechat-clawbot-A-im.html`
- `design-demos/wechat-clawbot-A-im.png`
- `design-demos/wechat-clawbot-B-hara.html`
- `design-demos/wechat-clawbot-B-hara.png`
- `design-demos/wechat-clawbot-C-native.html`
- `design-demos/wechat-clawbot-C-native.png`

### 4.8 微信文档（2 个）
- `docs/07-微信ClawBot集成规划.md`
- `docs/08-微信ClawBot-参考与署名.md`

## 5. 处理顺序

1. **Phase 0 本步**：仅创建清单文件，**不删除任何文件**
2. **Phase 0 下一步**：`git checkout -b refactor/desktop-only-hardening` + `git tag archive/full-v2.6.0-mobile-wechat`
3. **Phase 0 基线构建**：`npm ci` → `npm run rebuild` → `npm run verify:build` → `npm run dist:win`
4. **Phase 0 commit**：把本清单文件 + `.trae/documents/desktop-only-hardening-refactor_plan.md` 一起提交为 `chore: capture desktop-only baseline`
5. **Phase 2**：删除移动端运行时 + 测试 + 实验 + 文档，并编辑混合文件
6. **Phase 3**：删除微信运行时 + 测试 + 设计 demo + 文档，并编辑混合文件 + 移除 qrcode 依赖

## 6. 安全约束

- **不丢弃用户修改**：`electron/mobile-agent-runner.js` 和 `scripts/smoke-mobile-agent-stream.js` 已修改未提交，留到 Phase 2 一起随文件删除处理，不在 Phase 0 单独 revert。
- **不强行 reset**：所有未跟踪文件不动，只在 Phase 2/3 按分类删除。
- **标签打在 master HEAD**：标签 `archive/full-v2.6.0-mobile-wechat` 指向 `8150afc`，不含工作区修改。
- **分支自 master 切出**：`refactor/desktop-only-hardening` 自当前 `master` HEAD 切出，保留工作区状态。
