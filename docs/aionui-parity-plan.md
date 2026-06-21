# FanBox × AionUi Parity Plan

> 创建日期：2026-06-21
> 状态：Phase R1A 实施完成（已落盘于 commit `32364a1` 系列）
> Phase UI-A1 实施完成（已落盘于 UI-A1 commit）
> **Phase UI-A2 实施完成（Home-first Agent Workspace）**
> 参考仓库：`I:\AI_weflow\AionUi-ref`（仅做研究，不修改、不复制代码）

---

## 0. 摘要

本文档记录 FanBox 在「远程协作（Remote Cowork）」方向上对标 AionUi 的研究结论和路线图。

**核心定位**：

```
AionUi 的远程指挥能力
+
FanBox 的文件管理器 / Skills / Usage / Screenshots / Windows-first
```

**核心原则**：

1. **不复制 AionUi 代码**，只借鉴架构思想（WebUI / Channel / Session / Agent / Skills）。
2. **不引入 Team Mode**（复杂度高，单用户场景不需要）。
3. **不引入 YOLO / Full-Auto**（安全风险大，FanBox 是 Windows-first 本地文件系统）。
4. **不内置公网 relay**（默认 local-first + LAN）。
5. **统一产品规则**（UI-A1 调整后）：
   - 普通非红线消息 → 直接执行
   - 红线消息 → **写 audit 后直接执行**（不阻断；保留安全边界）
   - 不引入"每条消息确认"开关
   - 不引入 desktop approval gate 阻断手机 send path

---

## 1. AionUi 可借鉴能力

AionUi 是 Electron + Vite + React + Bun 的 Cowork 平台（`https://github.com/iOfficeAI/AionUi`）。通过研究其源码（`readme.md` / `docs/prds/` / `.aionui/` / `mobile/` / `packages/web-host/`），梳理出可借鉴的 5 大架构能力：

### 1.1 WebUI 架构

| 项 | AionUi 做法 | FanBox 借鉴点 |
|---|---|---|
| 启动方式 | `AionUi --webui` / `--remote` flag | 已有独立 mobile.js HTTP server（端口 4580） |
| 端口 | 默认 25808 | 已用 4580 |
| 登录 | 密码 + JWT + QR token（5min 一次性） | 配对码 60s + token 24h + LAN 限制（更严格） |
| 手机访问 | SPA + PWA + React Native App | 已有 mobile Web UI |
| Session 可见 | 状态机 active/idle/error/disconnected | 已有 idle/running/done/failed/waiting_approval/approved/rejected/timeout |

### 1.2 Channel 架构

| 项 | AionUi 做法 | FanBox 当前 | 借鉴点 |
|---|---|---|---|
| 三层架构 | Plugin → Gateway → Agent | 暂无 | R3+ 引入 |
| 统一消息格式 | `IUnifiedIncomingMessage` / `IUnifiedOutgoingMessage` | 暂无 | R3+ 引入 |
| 事件总线 | `ChannelEventBus` | 暂无 | R3+ 引入 |
| 内置渠道 | Telegram / Lark / DingTalk / WeChat / WeCom | 微信 ClawBot（规划中） | 先做微信 |

### 1.3 Session 架构

| 项 | AionUi 做法 | FanBox 当前 | 借鉴点 |
|---|---|---|---|
| 持久化 | SQLite | 3 套 JSON（mobile/wechat/sessions） | R5+ 统一 store |
| 状态机 | active/idle/error/disconnected | 已有 8 状态 | 已对齐 |
| 空闲释放 | 5min 自动释放 | 手动 | R2+ 引入 |
| 全局共享 | main process 单一 SQLite | 三套 JSON 合并 | 保持三源合并 |

### 1.4 Agent 架构

| 项 | AionUi 做法 | FanBox 当前 | 借鉴点 |
|---|---|---|---|
| 自动检测 | 19+ CLI | 4 个（claude/codex/opencode/qoder） | 保持精简 |
| 统一接口 | 7 能力 interface | 直接调用 | R2 引入 |
| 内置 Agent | 有（API key 即用） | 无 | 不学（走 CLI 适配） |
| 并行 session | SessionManager 多 session | 单 session | R2+ 引入 |
| Team Mode | Leader/Teammate + mailbox + task board | 无 | **不学** |
| YOLO 模式 | F-PERM-03 免确认 | 无 | **不学** |

### 1.5 Skills 架构

| 项 | AionUi 做法 | FanBox 当前 | 借鉴点 |
|---|---|---|---|
| Skill 分层 | Builtin / Custom / Extension | skillsView 只读透视 | R5 升级 |
| Session 绑定 | 创建时绑定，首条消息自动注入 | 无 | R5 引入 |
| Office Skills | pptx / docx / xlsx（配合 OfficeCLI） | 无 | R5+ 考虑 |

---

## 2. FanBox 当前状态

### 2.1 已完成能力（Phase 0A → Phase 2A-2.2）

| 模块 | 状态 | 关键文件 |
|---|---|---|
| Mobile Access 配对 + token + LAN | ✅ | `electron/mobile.js` |
| Mobile API（读 + 写） | ✅ | `electron/mobile.js` |
| Mobile Web UI（5 Tab） | ✅ | `public/mobile/index.html` + `mobile.js` + `mobile.css` |
| Windows 文件管理器 | ✅ | `public/app.js` + `electron/main.js` |
| Claude/Codex/OpenCode/Qoder 检测 | ✅ | `public/app.js` `AGENT_REGISTRY` |
| redline detector（10 条规则） | ✅ | `electron/mobile-sessions.js` `REDLINE_RULES` |
| Stub runner | ✅ | `electron/mobile-sessions.js` `runStubAgent` |
| Real runner（claude/codex） | ✅ | `electron/mobile-agent-runner.js` |
| Mobile Approval Loop | ✅ | `electron/mobile-sessions.js` `createApproval` / `decideApproval` |
| session status 字段 | ✅ | `electron/mobile-sessions.js` `setSessionStatus` |
| Usage panel | ✅ | `public/app.js` `usagePanel` |
| Screenshots + copy image | ✅ | `public/app.js` |
| long text paste | ✅ | `public/mobile/mobile.js` |
| safe session scrub | ✅ | `electron/mobile-sessions.js` `scrubObject` / `FORBIDDEN_KEYS` |

### 2.2 验证数据

```
smoke phase0a: 228/228 PASS
smoke phase1:  116/116 PASS
smoke phase2a: 379/379 PASS
verify:paths:  PASS
verify:build:  PASS
verify-agent-driver:    PASS
verify-wechat-bridge:   PASS
e2e windows:   35/35 PASS
```

### 2.3 关键测试覆盖（`scripts/smoke-mobile-phase2a.js`）

- auth / LAN 边界（no token / bad token / disabled）
- session list / detail / by-cwd 结构化
- 敏感字段 100% scrub（token / cookie / apiKey / .jsonl / claudeSession / codexSession）
- redline detector 24 个用例
- 红线消息 → waiting_approval，不调用 runner
- 普通非红线消息 → 直接走 runner → done / failed
- approval decide（approve / reject / timeout）
- 真实 Claude/Codex runner 安全断言（shell: false / 无 pty / 无 dangerously / 无 YOLO）
- UI 危险文案扫描（无 YOLO / 无 Full-auto / 无 Start Agent / 无 Execute Shell 等）
- Mobile UI 包含 "Redline actions require desktop approval"

---

## 3. FanBox 独有优势（vs AionUi）

| 能力 | 描述 | AionUi 对应 |
|---|---|---|
| Windows-first 文件管理器 | 集成 node-pty + xterm + Monaco 的真实桌面级文件管理 | 无（Web-only / Mac） |
| redline detector 10 条规则 | 中英文混合 + 短文本过滤 | 只有 5 个 permissions 概念 |
| Screenshots + copy image | 桌面截图一键复制 | 无 |
| long text paste | 长文本粘贴支持 | 弱 |
| safe session scrub | 22 个 FORBIDDEN_KEYS 递归脱敏 | 部分（scrub 不完整） |
| LAN 限制默认严格 | `isLanIp` 拦截非局域网 | `--remote` flag 显式开启 |
| 配对码 60s + token 24h | 双重时效控制 | QR token 5min |
| mobile + desktop 双向 | mobile 发消息，desktop 端同时看到 approval | 同一 Electron app |

---

## 4. 路线图 Phase R1-R5

### Phase R1：WebUI Remote Parity（**当前阶段 R1A 已完成**）

**目标**：

- ✅ 手机/浏览器能看到当前 sessions
- ✅ 能看到正在 running 的 Agent
- ✅ 普通非红线消息直接执行（不引入 confirmation）
- ✅ 红线消息走 desktop approval
- ✅ token + LAN 保留
- ✅ 不做公网 relay

**R1A 已交付**（commits `32364a1` → `ec3db6e`）：

- R1.1 session status 字段：8 状态机 idle/running/done/failed/waiting_approval/approved/rejected/timeout
- R1.2 真实 Claude/Codex runner：`mobile-agent-runner.js` 安全接入
- R1.3 mobile→approval→desktop approve→runner 链路
- R1.4 普通非红线消息直接执行（**不引入** `autoApproveNonRedline` 开关）
- R1.5 token + LAN 限制保留

### Phase R2：Real Agent Runner 强化

**目标**：

- Claude/Codex 真实 runner 流式输出
- OpenCode/Qoder stub（保持）
- session 持久化（统一 store，替换 3 套 JSON）
- cwd 绑定 + redline gate
- Usage 统计接入

**触发条件**：R1A 在真机稳定运行 1 周后。

### Phase R3：Chat Channels

**目标**：

- 先接个人微信 ClawBot（走 OpenClaw 中转）
- channel 三层架构（Plugin → Gateway → Agent）
- 统一消息格式 + ChannelEventBus
- 飞书 / 钉钉 / 企业微信 / Telegram 设计稿（不实现）

**触发条件**：R2 完成、微信 ClawBot OpenClaw 通路验证。

### Phase R4：Public Remote / Cross-network

**目标**：

- 不直接暴露电脑端口
- relay / tunnel 设计稿
- 密码 / 二维码登录（可选）
- device revoke + audit
- 默认仍然 local-first

**触发条件**：用户明确提出"出差需要"。

### Phase R5：Skills / Assistants Upgrade

**目标**：

- Skills 从"查看"升级为"可选上下文"
- 每个 session 可启用 skills
- mobile 端显示 active skills
- skills 和 Agent prompt 关联
- usage 按 skill / agent / session 展示

**触发条件**：R2 session 持久化稳定。

---

## 5. 当前阶段 R1A 详细说明

### 5.1 产品规则（**已修正**）

| 消息类型 | 处理方式 | session 状态 |
|---|---|---|
| 普通非红线 | 直接执行 runner | running → done / failed |
| 红线 | 必须 desktop approval | waiting_approval → approved / rejected / timeout |

**不要实现**：

- ❌ "每条消息确认"（破坏体验）
- ❌ `autoApproveNonRedline=false` 时普通消息也走 approval（违反产品规则）
- ❌ `autoApproveNonRedline=true` 自动批准档（本轮不引入）

### 5.2 Redline 规则（10 条）

| # | 规则 ID | 触发样例 |
|---|---|---|
| 1 | delete_file | `rm -rf`, `del /f`, `删除`, `delete file` |
| 2 | git_history_overwrite | `git push --force`, `rebase`, `reset --hard`, `filter-branch` |
| 3 | secret_or_env | `.env`, `secrets`, `password`, `api key`, `token`, `密钥`, `口令` |
| 4 | cicd_config | `.github/workflows`, `CI/CD`, `github actions` |
| 5 | database_migration | `database migration`, `RLS policy`, `ALTER TABLE`, `数据库 迁移` |
| 6 | install_global | `npm install -g`, `brew install`, `sudo`, `chmod 777` |
| 7 | production_deploy | `production deploy`, `go live`, `发布 到`, `生产 环境` |
| 8 | publish_or_payment | `publish post`, `real payment`, `发文章`, `支付` |
| 9 | external_send | `send message to user`, `third-party`, `submit form`, `发送 给`, `上传 敏感` |
| 10 | system_config | `modify system config`, `注册表 编辑` |

### 5.3 安全约束（runner 12 项）

| # | 约束 | 实现位置 |
|---|---|---|
| 1 | agentId 白名单 | `mobile-agent-runner.js:31` `ALLOWED_AGENT_IDS` |
| 2 | 真实 runner 只允许 claude/codex | `mobile-agent-runner.js:32` `REAL_RUNNER_IDS` |
| 3 | OpenCode/Qoder 仍 stub | `mobile-agent-runner.js:33` `STUB_RUNNER_IDS` |
| 4 | cwd 固定为 session.cwd | 移动端调用前校验 allowed roots |
| 5 | contextFiles 限 5 个 + allowed roots | `mobile-sessions.js:63-64` `MAX_CONTEXT_FILES` |
| 6 | 不允许用户控制 executable | `whichBin('claude'/'codex')` 硬编码 |
| 7 | 不允许用户控制 args 模板 | `args = ['-p', '--output-format', 'json', ...]` 硬编码数组 |
| 8 | 不允许 shell 解释器模式 | `spawn(bin, args, { shell: false })` |
| 9 | 不允许 pty | 无 `require('node-pty')` |
| 10 | 不允许 auto-approval / YOLO | 无 `--dangerously-skip-permissions` |
| 11 | 输出 scrub | `sanitizeOutput` (Bearer / sk- / session_id / 截断) |
| 12 | 失败时只返回安全摘要 | sanitize + slice(-300) |

### 5.4 不做的事（明确排除）

1. ❌ 飞书 / 钉钉 / 企业微信 / Telegram（R3+ 才考虑）
2. ❌ 公网 relay / 服务器部署（R4 才考虑）
3. ❌ 密码 / JWT 登录重构（R4 才考虑）
4. ❌ 统一 SQLite store（R2 才考虑）
5. ❌ Team Mode（**永远不做**）
6. ❌ YOLO / Full-Auto（**永远不做**）
7. ❌ Skills toggle（R5 才考虑）
8. ❌ MCP（R5+ 才考虑）
9. ❌ 文件写入 / 上传 / 删除 / 移动 / 重命名 API（**永远不做**）
10. ❌ 改 token / pairCode / auth / LAN 白名单
11. ❌ 复制 AionUi 源码

---

## 6. 不复制 AionUi 代码的边界

| 可以借鉴 | 不能复制 |
|---|---|
| WebUI 状态机思想 | AionUi 的 SQLite schema |
| Channel 三层架构 | AionUi 的 Plugin SDK |
| 统一消息格式概念 | AionUi 的 IUnifiedIncomingMessage TS 定义 |
| Session 持久化思路 | AionUi 的 SessionManager 代码 |
| 统一 Agent interface 概念 | AionUi 的 7 能力 interface TS 定义 |
| Skills 分层思路 | AionUi 的 skill 加载器代码 |

**FanBox 的实现方式**：保持 Node.js 现有栈（无 TS / 无 SQLite），用现有 JSON store + Node child_process 安全模式实现等价能力。

---

## 7. 后续阶段触发条件

| 阶段 | 触发条件 | 工作量估计 |
|---|---|---|
| R2 | R1A 真机稳定 1 周 | 中 |
| R3 | R2 完成 + OpenClaw 微信通路验证 | 大 |
| R4 | 用户明确提出"出差需要" | 中 |
| R5 | R2 session 持久化稳定 | 中 |

**当前优先级**：R1A 已完成，**等待真机验收 + 用户反馈**。

---

## 8. 文档维护

- 本文档随 Phase R1A 完成创建。
- 每次 Phase 推进时更新「路线图」「当前状态」两节。
- 任何引入新概念（YOLO、Team Mode 等）需先在本文档更新，再实施。

---

## 9. Phase UI-A1 实施完成（AionUi-like Command Agent Workspace）

> 落盘：UI-A1 commit（见 `git log --oneline`）
> 范围：仅 mobile WebUI 重构 + 后端 messages 路径简化

### 9.1 视觉重构

| 元素 | 实施 |
|---|---|
| 主入口 | 4 个 Tab：Home / Agent / Files / Skills（移除独立 Sessions / Usage） |
| Sidebar | `app-sidebar`（New Chat / Search / Projects / Recent Sessions / Skills / Settings）≥900px 显示 |
| Agent Hero | `.agent-hero`（time-based greeting "Good morning/afternoon/evening" + "what's your plan today"） |
| Agent Switcher | Claude / Codex / OpenCode / Qoder 4 个 chip（opencode/qoder 显示 stub） |
| 大输入框 | `.agent-composer-input`（min-height 88px，白色卡片，Enter 发送，Shift+Enter 换行） |
| Assistant Cards | 8 张：Cowork / Code Review / Fix Bug / Explain Project / Create Doc / Summarize Files / PPT Creator / Word Helper（点击填入 input） |
| Runs Summary | 显示今日/本周 mobile runs 数 + duration |
| Safety Tips | "Running on your paired desktop" / "Scoped to the selected folder" / "Logged locally in FanBox" |

### 9.2 后端行为变化（核心）

**旧逻辑（已移除）**：
```
手机 send message
→ detectRedline
→ 命中红线则 createApproval
→ session.status = waiting_approval
→ 等待 desktop approve/reject
→ 才继续
```

**新逻辑（UI-A1）**：
```
手机 / 浏览器 send message
→ token + LAN 校验
→ session/cwd/agentId 校验
→ detectRedline → 仅 appendAudit({ action: 'redline_detected_but_not_blocked', reasons })
→ 直接调 mobileRunner.runMobileAgent
→ session.status = running → done / failed
→ 返回 { ok: true, requiresApproval: false, status: 'done' }
```

**保留的安全边界**：
- `/api/mobile/*` 仍需 token + LAN
- pairCode（60s）+ token（24h）+ token revoke
- cwd allowed roots / agentId 白名单 / pathInAllowed 校验
- 不暴露 token/cookie/apiKey/.jsonl/claudeSession/codexSession/rawStdout
- 不新增 upload/delete/move/rename/write/pty/shell/公网 relay

### 9.3 UI 文案变化

**移除**（旧的 approval 提示）：
- "Waiting for desktop approval"
- "Desktop approval required"
- "Request approval"
- "Redline actions require desktop approval"
- "Approval timed out"
- "Rejected by desktop"
- "Approved by desktop"

**新增**（新的安全提示）：
- "Running on your paired desktop"
- "Scoped to the selected folder"
- "Logged locally in FanBox"

### 9.4 API 端点

| 端点 | 状态 |
|---|---|
| `POST /api/mobile/sessions/draft` | 已有，UI-A1 加入 POST_ALLOWLIST |
| `POST /api/mobile/sessions/:id/messages` | UI-A1：移除 approval 分支，直接 runner |
| `GET /api/mobile/skills-state` | **UI-A1 新增**，读 `~/.fanbox/mobile/skills-state.json` |
| `POST /api/mobile/skills-state` | **UI-A1 新增**，写 mobile state（不修改真实 skill 文件） |
| `POST /api/mobile/approvals/:id/decide` | 保留给未来使用，**mobile send path 不再调用** |
| `GET /api/mobile/approvals` | 保留接口可读 |
| `POST /api/mobile/control/approvals/:id/decide` | 保留给未来使用 |

### 9.5 POST_ALLOWLIST（mobile.js 前端）

```js
var POST_ALLOWLIST = [
  /^\/api\/mobile\/context\/(cwd|select)$/,
  /^\/api\/mobile\/sessions\/draft$/,
  /^\/api\/mobile\/sessions\/[A-Za-z0-9._\-+:]+\/messages$/,
  /^\/api\/mobile\/skills-state$/
];
```

### 9.6 测试覆盖

| 套件 | 状态 |
|---|---|
| `node --check` × 8 文件 | ✅ |
| `smoke-mobile-phase0a.js` | ✅ 228/228 |
| `smoke-mobile-phase1.js` | ✅ 116/116 |
| `smoke-mobile-phase2a.js` | ✅ 433/433 |
| `smoke-mobile-ui-aionlike.js`（**新**） | ✅ 134/134 |
| `verify:build` | ✅ |
| `verify-agent-driver.js` | ✅ |
| `verify-wechat-bridge.js` | ✅ |
| `npm run test:e2e:windows` | ✅ 35/35 |

### 9.7 后续阶段（参考，不在本 commit 范围）

- **R3** 微信 Channel（已暂停）
- **R4** Lark / DingTalk 等渠道（按需）
- **R5** Session 持久化统一 store（可考虑 SQLite）

---

## 10. Phase UI-A2 实施完成（Home-first Agent Workspace）

> 落盘：UI-A2 commit（见 `git log --oneline`）
> 范围：仅 mobile WebUI 信息架构修复 + 后端 `/api/mobile/agents` 增加 model/effort
> 触发：用户反馈 Files / Home / Skills 进不去；session 不出现；产品需要 Home-first 体验

### 10.1 目标

修复 P0 导航问题；将"配对 → 进入 → 对话"路径压到最浅；让 Home = 对话 + 历史，而不是 dashboard。

### 10.2 关键改动

| 维度 | 旧（UI-A1） | 新（UI-A2） |
|---|---|---|
| 配对后默认 | `showTab('agent')` | `showTab('home')` |
| Home 顶部 | 4 个 Quick Access tiles | Agent Quick Chat（输入框 + 4 agent switcher + cwd/model/effort） |
| Home 中部 | 最近 session + usage | Running / All Sessions（unified index） |
| Files | select root + 搜索 | 手机文件管理器：竖向文件夹/文件、点击进入、桌面双击兼容、breadcrumb |
| Files 入口 | `#files-root select` | 移除；改为 filesState.root 自动从 `/api/mobile/roots` 拉 |
| Agent tab | AionUi-like cards + run summary | ChatGPT-like 独立对话页（左上角 agent + cwd/model/effort + messages） |
| Agent 顶部 | `agent-hero` + `agent-assistant-cards` | `agent-header`（name + status + meta + switcher） |
| Agent 中部 | 一张 summary card | `.agent-chat`（user/agent/system 气泡） |
| 后端 `/api/mobile/agents` | `{id,label,command,installed,hint}` | + `model, effort`（默认 `default` / `normal`） |

### 10.3 文件变更

- `public/mobile/index.html` 重写：Home 顶部放 `#home-quickchat`、Agent 改 ChatGPT-like、Files 改 file manager
- `public/mobile/mobile.js`：
  - `showApp() → showTab('home')`
  - 新增 `renderHome` / `paintHome*` / `paintAgentHeader*`
  - 重写 `renderFiles` / `loadFilesRoots` / `cdInto` / `cdUp` / `refreshFilesList` / `paintFilesList` / `onFilesOpenAgent`
  - 重写 `renderAgent` / `paintAgentHeaderName` / `paintAgentHeaderMeta` / `paintAgentMessages`
  - `onSendMessage(source)` 支持 `home` / `agent`
- `public/mobile/mobile.css`：新增 `.home-quickchat` / `.home-composer*` / `.agent-header*` / `.agent-chat` / `.chat-bubble*` / `.files-breadcrumb` / `.files-manager-list` / `.fm-row*` / `.card-cta` / `.card-preview` 等
- `electron/mobile.js`：`MOBILE_AGENTS` 增加 `model` / `effort` 字段；`readAgentsMobile` 透出
- `scripts/smoke-mobile-ui-aionlike.js` 新增 H/I/J 三段（Agent 独立页 / Files file manager / Skills 简介）
- `scripts/smoke-mobile-phase1.js` / `smoke-mobile-phase2a.js`：更新过时的 HTML 元素 ID

### 10.4 保留的旧元素

- 4 tab 顺序：`home / agent / files / skills`
- 4 agent：`claude / codex / opencode / qoder`
- 3 条安全文案：`Running on your paired desktop` / `Scoped to the selected folder` / `Logged locally in FanBox`
- Agent session 8-state machine（仍由 `mobile-sessions.js` 维护）
- Redline detector：仍存在但仅写 audit，不阻断

### 10.5 不做的事（明确）

- 不做 R3 微信 Channel
- 不做 Lark / DingTalk / 企业微信 / Telegram
- 不做公网 relay / 服务器部署
- 不做 Team Mode / YOLO / Full-auto
- 不新增 Delete / Move / Rename / Upload
- 不暴露 token / cookie / API key / raw stdout / JSONL
- 不改 token / pairCode / LAN / auth
- 不复制 AionUi 代码

### 10.6 测试覆盖

| 套件 | 状态 |
|---|---|
| `node --check` × 6 文件 | ✅ |
| `smoke-mobile-phase0a.js` | ✅ 228/228 |
| `smoke-mobile-phase1.js` | ✅ 118/118 |
| `smoke-mobile-phase2a.js` | ✅ 433/433 |
| `smoke-mobile-ui-aionlike.js` | ✅ 197/197（H/I/J 段新增 30+ 项） |
| `verify:build` | ✅ |
| `verify-agent-driver.js` | ✅ |
| `verify-wechat-bridge.js` | ✅ |
| `npm run test:e2e:windows` | ✅ 35/35（watchdog timeout 是 pre-existing） |

### 10.7 后续阶段

- **UI-A3**（按需）：把 detail API 真正支持 messages 拉取；当前 v1 只显示 `summary.lastMessagePreview` 摘要气泡
- **UI-A4**（按需）：session 卡片支持状态 chip、source chip、duration chip
- **R3** 微信 Channel（保持暂停）

