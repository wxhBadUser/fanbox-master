# Mobile-R0 FanBox Mobile Current Map

> Scope: 本文只描述 `I:\AI_weflow\fanbox-master` 当前 mobile backend/UI/runner 状态，不提出功能代码修改。

## Executive Summary

FanBox 当前 mobile 是 Electron app 内置的 LAN-only HTTP gateway + static Web/PWA UI。它已经有较丰富的 REST API、SSE agent stream、pair token、allowed roots、file/search/skills/usage/screenshots、mobile sessions、approvals、audit、以及一批 Mobile-B1 contract endpoint。最大差距不在“没有端点”，而在 source of truth 不统一：桌面 Agent、mobile session、runner output、approval、timeline、recent files 还没有形成一个稳定的统一协议层，UI 也仍主要消费旧的分散 endpoint。

当前最应该保护的能力是安全边界：LAN-only、token pairing、allowed roots、forbidden path、输出 scrub、audit allowlist、runner 白名单、无 raw PTY 暴露、无 auto-approval。这些能力在后续 UI 重写时不能被破坏。

## Source Map

| Area | FanBox source path | What it contributes |
| --- | --- | --- |
| Mobile server/router | `electron/mobile.js` | LAN gate, token auth, static `/mobile`, REST endpoints, SSE stream, B1 contract helpers |
| Mobile session store | `electron/mobile-sessions.js` | session summaries, messages, context prefs, approvals, audit, usage, unified session index |
| Mobile runner | `electron/mobile-agent-runner.js` | safe runner adapters for Claude/Codex/OpenCode/Qoder, output scrub, timeouts, no shell template |
| Electron integration | `electron/main.js` | IPC enable/disable mobile server, pair code, token revoke, desktop approval IPC |
| Mobile UI JS | `public/mobile/mobile.js` | pair screen, home chat, files, skills, sessions/projects UI, SSE chat consumption |
| Mobile UI CSS | `public/mobile/mobile.css` | existing mobile presentation for home/files/skills/sessions/projects |
| Backend contract doc | `docs/mobile-backend-contract.md` | already documents Mobile-B1 endpoint goals and unified `Mobile*` models |
| Contract verifier | `scripts/verify-mobile-backend-contract.js` | starts mobile server, pairs device, checks B1 endpoint shapes and redaction |

The user-provided prompt mentioned these paths, but they are not present in the current repo snapshot:

- `docs/mobile-control-architecture.md`
- `docs/remote-paseo-architecture-study.md`
- `scripts/verify-mobile-gateway.js`

The current equivalents are `docs/mobile-backend-contract.md` and `scripts/verify-mobile-backend-contract.js`.

## Current Mobile API Inventory

All protected mobile APIs are behind LAN checks and token auth, except pairing/static resources as noted.

| API | Method | Current purpose | Main source |
| --- | --- | --- | --- |
| `/mobile`, `/mobile/*` | GET | Serve static mobile UI | `electron/mobile.js`, `public/mobile/*` |
| `/api/mobile/pair/status` | GET | Check active pair-code window | `electron/mobile.js` |
| `/api/mobile/pair/confirm` | POST | Pair device and issue bearer token | `electron/mobile.js` |
| `/api/mobile/status` | GET | Diagnostic mobile server status | `electron/mobile.js` |
| `/api/mobile/app-state` | GET | B1 bootstrap: server/auth/features/connection/context/counts | `electron/mobile.js` |
| `/api/mobile/dashboard` | GET | B1 home aggregate: sessions/agents/approvals/files/usage/audit | `electron/mobile.js` |
| `/api/mobile/projects` | GET | Project list from sessions plus fallback roots | `electron/mobile.js` |
| `/api/mobile/roots` | GET | Allowed mobile roots | `electron/mobile.js` |
| `/api/mobile/files` | GET | Browse directory under allowed roots | `electron/mobile.js` |
| `/api/mobile/file` | GET | Read safe file preview | `electron/mobile.js` |
| `/api/mobile/search` | GET | Recursive search under allowed root | `electron/mobile.js` |
| `/api/mobile/files/recent` | GET | B1 recent files projection from sessions/workspaces/screenshots | `electron/mobile.js` |
| `/api/mobile/thumb` | GET | Thumbnail for safe file path | `electron/mobile.js` |
| `/api/mobile/skills` | GET | List available skills | `electron/mobile.js` |
| `/api/mobile/skills-state` | GET/POST | Mobile-only enabled/disabled state; does not edit real skill files | `electron/mobile.js` |
| `/api/mobile/agents` | GET | Agent availability/list | `electron/mobile.js` |
| `/api/mobile/usage` | GET | Claude/Codex usage plus mobile runner usage | `electron/mobile.js` |
| `/api/mobile/screenshots` | GET | Recent screenshots with thumb URLs | `electron/mobile.js` |
| `/api/mobile/sessions` | GET | Safe session summaries | `electron/mobile.js`, `electron/mobile-sessions.js` |
| `/api/mobile/sessions/by-cwd` | GET | Sessions filtered by cwd | `electron/mobile.js` |
| `/api/mobile/sessions/:id` | GET | Session metadata | `electron/mobile.js` |
| `/api/mobile/sessions/draft` | POST | Create idle mobile session shell | `electron/mobile.js`, `electron/mobile-sessions.js` |
| `/api/mobile/sessions/:id/messages` | GET/POST | Read messages or send a prompt to a mobile session | `electron/mobile.js`, `electron/mobile-sessions.js` |
| `/api/mobile/sessions/:id/events` | GET | Legacy scrubbed message/event projection | `electron/mobile.js` |
| `/api/mobile/sessions/:id/timeline` | GET | B1 timeline projection from scrubbed messages | `electron/mobile.js` |
| `/api/mobile/approvals` | GET | List approvals | `electron/mobile.js`, `electron/mobile-sessions.js` |
| `/api/mobile/approvals/:id` | GET | Get one approval for same device | `electron/mobile.js`, `electron/mobile-sessions.js` |
| `/api/mobile/context/current` | GET | Current mobile cwd/agent/session preference | `electron/mobile.js`, `electron/mobile-sessions.js` |
| `/api/mobile/context/cwd` | POST | Set current cwd only | `electron/mobile.js`, `electron/mobile-sessions.js` |
| `/api/mobile/context/select` | POST | Set cwd/agent/session preference | `electron/mobile.js`, `electron/mobile-sessions.js` |
| `/api/mobile/agent/send` | POST | Non-streaming mobile agent run | `electron/mobile.js`, `electron/mobile-sessions.js` |
| `/api/mobile/agent/stream` | POST | SSE mobile agent run | `electron/mobile.js`, `electron/mobile-agent-runner.js` |
| `/api/mobile/devices` | GET | B1 safe paired device list | `electron/mobile.js` |
| `/api/mobile/audit` | GET | B1 safe recent audit feed | `electron/mobile.js`, `electron/mobile-sessions.js` |
| `/api/mobile-control/approvals` | GET | Loopback-only desktop approval list | `electron/mobile.js`, `electron/main.js` |
| `/api/mobile-control/approvals/:id/decide` | POST | Loopback-only desktop decision; does not start agent | `electron/mobile.js`, `electron/main.js` |

## Current UI Pages And State

`public/mobile/mobile.js` is a single-page static app. It stores token/device/agent/cwd/session in `localStorage` and uses a small internal state object.

| UI area | Current APIs consumed | Current behavior |
| --- | --- | --- |
| Pair screen | `/api/mobile/info`, `/api/mobile/pair/confirm` | Pair by device name and pair code; note `/api/mobile/info` was not found in current server routes |
| Home chat | `/api/mobile/agent/stream`, fallback `/api/mobile/agent/send` | Sends prompt to selected agent and cwd/session; renders SSE pseudo-stream events |
| Files | `/api/mobile/files`, `/api/mobile/roots`, `/api/mobile/search`, `/api/mobile/file`, `/api/mobile/context/cwd` | Browse allowed roots, search, preview, set current cwd for agent |
| Skills | `/api/mobile/skills`, `/api/mobile/skills-state` | List/filter/toggle mobile-only skill enabled state |
| Projects | `/api/mobile/projects`, `/api/mobile/sessions?limit=200` | Group sessions into projects, show project detail and recent sessions |
| Session detail | `/api/mobile/sessions/:id/messages?limit=200` | Loads scrubbed messages, not the newer `/timeline` endpoint |
| Dashboard-style state | mostly not consumed yet | B1 endpoints exist but UI does not appear to use `app-state`, `dashboard`, `files/recent`, `devices`, or `audit` as primary models |

## Session Lifecycle

FanBox mobile sessions are local JSON-backed summaries, not daemon-owned process records.

1. UI chooses cwd/agent/session through files/projects/home flow.
2. If no session exists, backend can create a draft via `createMobileDraftSession`.
3. Message submission validates session/device/agent/cwd/text/context files.
4. Session status becomes `running`.
5. `mobile-agent-runner.js` runs the selected CLI adapter or returns a friendly unavailable/stub result in test mode.
6. Backend appends user/agent messages to the message store and updates session summary.
7. Backend records mobile runner usage and appends audit metadata.
8. Session ends as `done` or `failed`.

Storage files are under user-local FanBox directories, primarily:

- `%HOME%\.fanbox\mobile\sessions.json`
- `%HOME%\.fanbox\mobile\messages.json`
- `%HOME%\.fanbox\mobile\approvals.json`
- `%HOME%\.fanbox\mobile\audit.jsonl`
- `%HOME%\.fanbox\mobile\usage.json`
- `%HOME%\.fanbox\sessions\index.json`

## Desktop Terminal And Agent State Exposure

FanBox exposes some desktop/mobile continuity through session indexes and project grouping, but it is not equivalent to Paseo daemon continuation:

- Mobile can see sessions and projects derived from mobile session store and unified session index.
- Mobile can run Claude/Codex/OpenCode/Qoder through the runner using cwd/session context.
- Mobile UI sees scrubbed message output and SSE pseudo-stream events.
- Current terminal tail / raw PTY / full desktop agent timeline is intentionally not exposed.
- There is no unified daemon-owned agent state machine shared by desktop and mobile.

This is a reasonable first safety posture, but it is the main reason "电脑端跑到一半，手机继续" is still incomplete.

## Approval Current State

Approval primitives exist, but the product loop is incomplete:

- `createApproval`, `listApprovals`, `getApprovalById`, `decideApproval`, expiry, and audit exist in `electron/mobile-sessions.js`.
- `/api/mobile/approvals` and `/api/mobile/approvals/:id` expose read-side data.
- `/api/mobile-control/approvals/:id/decide` and Electron IPC can decide from desktop.
- Current comments and code say approval decision does not start agent.
- Current send paths detect redline and append audit as `redline_detected_but_not_blocked`; they do not block the message or require approval.

For the user's desired mobile experience, approval must become a real domain contract before public/remote command is considered.

## Files, Skills, Usage, Screenshots

FanBox already has useful, FanBox-specific mobile capabilities:

- Files: browse allowed roots, read safe previews, search, thumbnail image/PDF candidates.
- Recent files: B1 helper builds candidates from session context, workspace directory entries, and screenshots.
- Skills: mobile can list skills and store mobile-only enabled state without editing real skill directories.
- Usage: reads Claude/Codex usage where available and records mobile runner counts/duration/chars.
- Screenshots: scans known screenshot folders and serves thumbnails.

These are good FanBox-native surfaces and should not be overwritten by a blind Paseo-style UI rewrite.

## Strong Current Safety Properties To Preserve

- Mobile access is not auto-started on desktop boot; user must enable it.
- Disabling mobile revokes tokens.
- All mobile routes pass LAN checks.
- Protected API routes require bearer token.
- File access is constrained by allowed roots and forbidden path checks.
- Runner agent ids are whitelisted.
- Runner avoids user-provided shell templates, PTY, auto-approval flags, and raw stdout exposure.
- Output and audit entries are scrubbed.
- Audit is append-only.
- `/api/mobile-control/*` is loopback-only and does not expose shell/PTY/agent start.

## Most Important Backend Gaps

| Gap | Why it matters |
| --- | --- |
| Timeline is only a projection from messages | Tool calls, approval state, terminal tail, file changes, and lifecycle events are not unified |
| Dashboard exists but UI does not consume it as the primary source | Mobile home can drift from backend contract |
| Agent state is session-derived | Cannot reliably represent desktop-running agents as first-class mobile-continuable agents |
| Approval loop is not enforcement | Redline actions are audited but not blocked for approval in the current send path |
| Device list exists without mobile revoke/viewer flow | Security operations are still desktop/IPC-oriented |
| Audit reader exists without full viewer taxonomy | Useful for safety, but not yet an operator-facing control surface |
| Connection state is REST/SSE capability, not liveness model | Mobile cannot reason about reconnect/catch-up like Paseo |
| Projects are cwd/session aggregates | Good enough now, but not a stable workspace identity contract |

## Current Abilities Better Suited To FanBox Than Paseo

- LAN-only first phase matches the current risk level.
- Static mobile UI avoids adding React Native/Expo complexity.
- Runner safety constraints are explicit and narrow.
- Skills integration reflects this user's local agent/skill workflow.
- Allowed-root file browsing is practical for FanBox's desktop companion model.
- Contract verifier already encodes redaction expectations for devices/audit/files.

## Code To Preserve During Future UI Work

Future UI work should preserve these backend files and their safety assumptions:

- `electron/mobile.js`: LAN/auth/router/safe file routes/B1 helpers.
- `electron/mobile-sessions.js`: scrubbed sessions, approval/audit stores, rate constants, redline detector, safe messages.
- `electron/mobile-agent-runner.js`: runner whitelist, no shell template, output scrub, timeout, no auto-approval.
- `scripts/verify-mobile-backend-contract.js`: contract smoke test.
- `docs/mobile-backend-contract.md`: current B1 contract source.

Do not replace these with a UI-first implementation. Tighten contracts first, then let UI consume them.
