# Mobile-R0 Mobile Convergence Roadmap

> Goal: Let FanBox mobile converge toward the useful parts of Paseo mobile experience through backend-first, safety-first phases. This roadmap is a planning artifact only; it does not authorize implementation.

## Principles

- Do not rewrite mobile UI before the backend contract is stable.
- Keep current LAN-only boundary until safety work is complete.
- Add APIs; do not delete or break old mobile endpoints.
- Preserve existing file/root/token/audit/runner redaction boundaries.
- Treat Paseo as architecture reference, not source code.
- Do not copy AGPL Paseo implementation into MIT FanBox.
- Remote command requires approval, audit, device revoke, and a threat model first.

## Phase Mobile-B1: Backend Contract Hardening

**Goal**

Stabilize the first mobile backend contract so the current or future UI can consume one predictable state shape. In this repo snapshot, most B1 endpoints already exist, so this phase is hardening and alignment, not a from-zero build.

**Files**

- Modify only if needed: `electron/mobile.js`
- Modify only if needed: `electron/mobile-sessions.js`
- Modify only if needed: `docs/mobile-backend-contract.md`
- Modify only if needed: `scripts/verify-mobile-backend-contract.js`

**APIs**

- `GET /api/mobile/app-state`
- `GET /api/mobile/dashboard`
- `GET /api/mobile/sessions/:id/timeline`
- `GET /api/mobile/files/recent`
- `GET /api/mobile/devices`
- `GET /api/mobile/audit`

**Do Not Do**

- Do not rewrite `public/mobile/mobile.js`.
- Do not implement relay, public access, E2EE, or WebSocket.
- Do not delete old endpoints.
- Do not expose raw token, token hash, raw prompt, raw stdout, PTY output, `.env`, or forbidden paths.

**Acceptance Criteria**

- `node scripts\verify-mobile-backend-contract.js` passes.
- Contract doc and implementation agree on field names and timestamp types.
- All six B1 endpoints return `ok: true` with stable top-level keys.
- Devices and audit responses contain no raw token/hash/secret/prompt.
- Timeline response can be rendered without calling `/messages`.

**Risks**

- Existing `docs/mobile-backend-contract.md` examples use ISO timestamps in places where implementation returns numeric timestamps.
- UI still consumes older endpoints; B1 success does not equal improved mobile UX yet.

**Rollback**

- Revert only B1 endpoint/helper/doc/verifier changes.
- Old mobile API and static UI should remain intact because B1 is additive.

## Phase Mobile-B2: Continue Desktop Agent On Phone

**Goal**

When an agent is running or recently active on the desktop, phone can see project cwd, status, output tail, recent files, and can send a follow-up when allowed.

**Files**

- `electron/mobile.js`
- `electron/mobile-sessions.js`
- Desktop session/index producer files only after locating the actual active-session writer, likely around `electron/main.js` and existing terminal/session modules.
- Minimal UI consumption only if necessary: `public/mobile/mobile.js`

**APIs**

- Extend `GET /api/mobile/dashboard` with desktop-continuable agents.
- Extend `GET /api/mobile/sessions/:id/timeline` with status/output/file/approval events.
- Add or extend a safe agent detail endpoint only if timeline cannot cover the need.

**Do Not Do**

- Do not expose raw PTY or raw terminal logs.
- Do not give phone arbitrary shell access.
- Do not implement public relay.
- Do not make redline requests bypass approval.

**Acceptance Criteria**

- Phone can identify current desktop-running agents with cwd, agent id, status, last activity, and safe output tail.
- Phone can open one running/recent agent and render a unified timeline.
- Phone can send one follow-up to an allowed agent/session with cwd validation.
- Recent changed/relevant files are visible without leaving allowed roots.

**Risks**

- Desktop sessions may not currently have enough structured metadata to resume safely.
- Claude/Codex internal session ids must remain internal and not leak to mobile.

**Rollback**

- Disable new desktop-continuation fields behind backend flags or remove only the additive projection.
- Existing mobile chat/session flow remains usable.

## Phase Mobile-B3: Start New Agent From Phone

**Goal**

Phone can choose a project, choose Claude/Codex/OpenCode/Qoder, enter a prompt, create a session, watch timeline, inspect files, and cancel or handle approval.

**Files**

- `electron/mobile.js`
- `electron/mobile-sessions.js`
- `electron/mobile-agent-runner.js` only for narrow runner contract fixes.
- `public/mobile/mobile.js`
- `public/mobile/mobile.css`

**APIs**

- `GET /api/mobile/projects`
- `POST /api/mobile/sessions/draft`
- `POST /api/mobile/sessions/:id/messages`
- `POST /api/mobile/agent/stream`
- `GET /api/mobile/sessions/:id/timeline`

**Do Not Do**

- Do not add new agent ids outside the existing whitelist unless separately approved.
- Do not change real skill files from mobile.
- Do not allow cwd outside mobile allowed roots.

**Acceptance Criteria**

- Project -> agent -> prompt -> session -> timeline is one coherent flow.
- The API returns session id before or during stream start.
- Refreshing the phone can reload the same session from backend state.
- Runner unavailable/timeouts produce safe user-facing messages.

**Risks**

- Long-running real CLI processes can exceed phone patience and current timeout model.
- SSE pseudo-stream is not a true provider stream for all runners.

**Rollback**

- Keep existing Home chat path as fallback.
- Revert new project/session UI while preserving backend endpoints.

## Phase Mobile-Safety: Devices, Revoke, Audit, QR Pairing

**Goal**

Make mobile a trusted control surface with visible device and audit operations before any public remote control.

**Files**

- `electron/mobile.js`
- `electron/mobile-sessions.js`
- `electron/main.js`
- `public/mobile/mobile.js`
- `public/mobile/mobile.css`
- `scripts/verify-mobile-backend-contract.js`
- New or updated safety smoke scripts if needed.

**APIs**

- `GET /api/mobile/devices`
- Add mobile-safe device rename/revoke endpoints only with confirmation and current-device behavior defined.
- `GET /api/mobile/audit`
- Pairing status/QR endpoints around existing pair-code flow.

**Do Not Do**

- Do not expose token hashes.
- Do not allow a revoked device to continue using old token.
- Do not implement remote command.

**Acceptance Criteria**

- User can view current and paired devices.
- User can revoke a non-current device and verifier proves token no longer works.
- Audit viewer shows recent mobile actions without prompts/secrets.
- Pairing has expiry and clear current LAN URL/QR flow.

**Risks**

- Revoking the current device can strand the user; behavior must be explicit.
- Audit taxonomy can become noisy if every transient event is logged.

**Rollback**

- Remove revoke/rename routes and keep existing desktop IPC revoke as the control path.
- Existing pair-code/token flow remains unchanged.

## Phase Mobile-UI1: Contract-Based Mobile UI Redesign

**Goal**

Redesign the mobile UI around five real scenarios: Home, Agent Detail, Projects, Files, Safety.

**Files**

- `public/mobile/mobile.js`
- `public/mobile/mobile.css`
- `public/mobile/index.html`

**APIs**

- Consume B1/B2/B3/Safety endpoints instead of directly stitching old endpoint responses in UI.

**Do Not Do**

- Do not copy Paseo React Native components.
- Do not add React/Vue/Expo unless a separate decision approves a framework migration.
- Do not nest new UI assumptions into backend code.

**Acceptance Criteria**

- Home shows current computer/mobile server state, running agents, pending approvals, recent files.
- Agent Detail shows timeline, output tail, tool/status events, approvals, continue input.
- Projects supports project selection, recent sessions, and new agent start.
- Files supports tree/search/preview under allowed roots.
- Safety supports devices/audit/pairing/revoke.

**Risks**

- Static JS file is already large; a UI rewrite can become risky without backend contracts.
- Visual inspiration from Paseo can accidentally become code copying.

**Rollback**

- Keep old UI assets available until contract-based UI passes smoke tests.
- Because backend is additive, old endpoints can keep old UI running.

## Phase Mobile-WS: Local WebSocket / Timeline Event Layer

**Goal**

Add a local real-time event layer for timeline and state updates once REST contract is stable.

**Files**

- `electron/mobile.js`
- Possibly a new mobile transport module if the existing file becomes too large.
- `public/mobile/mobile.js`

**APIs**

- Add local WebSocket or named SSE event stream for `connection.heartbeat`, `agent.updated`, `session.timeline.appended`, `approval.created`, `approval.decided`, `file.changed`, `audit.appended`.

**Do Not Do**

- Do not replace REST reads; WebSocket/SSE is live-update transport only.
- Do not implement relay.

**Acceptance Criteria**

- UI can recover from reconnect by calling authoritative REST endpoints.
- Live events are append-only and can be ignored safely by older clients.
- Heartbeat is liveness, not timeline correctness.

**Risks**

- Recreating Paseo protocol too early would overfit and increase maintenance.

**Rollback**

- Disable WS/SSE event stream and keep REST polling/manual refresh.

## Phase Remote-R3: Relay Prototype, Read-Only

**Goal**

Prototype remote visibility without remote agent command.

**Files**

- New design doc and threat model first.
- Implementation files only after approval.

**APIs**

- Read-only app-state/dashboard/session timeline through a relay-like channel.

**Do Not Do**

- Do not allow remote prompt send.
- Do not expose port `4580` or mobile port directly to the public internet.
- Do not copy Paseo relay code.

**Acceptance Criteria**

- Threat model reviewed.
- Relay cannot read secrets beyond explicitly accepted metadata.
- Remote client can view state but cannot start/continue agents.

**Risks**

- Public transport without E2EE and revoke/audit can become a remote-control vulnerability.

**Rollback**

- Disable relay prototype and keep LAN-only.

## Phase Remote-R4: Public Remote Agent Command

**Goal**

Allow remote command only after safety controls are real and verified.

**Files**

- To be planned after Remote-R3 results and threat model.

**APIs**

- Remote command endpoints or events gated by device trust, approval policy, audit, and revoke.

**Do Not Do**

- Do not bypass approval for high-risk actions.
- Do not allow command from devices without revocation path.
- Do not ship without audit viewer.

**Acceptance Criteria**

- Remote command requires authenticated, revocable device identity.
- Approval policy is enforced for dangerous actions.
- Audit records every command/decision without leaking raw secrets.
- User can revoke a device and prove it loses command ability.

**Risks**

- Highest-risk phase; failures here can expose the user's machine and codebase.

**Rollback**

- Feature flag remote command off.
- Revoke all remote tokens.
- Fall back to Remote-R3 read-only or LAN-only.

## Recommended Next Codex Prompt: Mobile-B1

```text
任务名称：Mobile-B1: Harden FanBox Mobile Backend Contract

你现在在 FanBox 项目中工作。Mobile-R0 调研已确认：FanBox 已经有 Mobile-B1 endpoint 雏形和 `scripts/verify-mobile-backend-contract.js`，所以本任务不是从零实现，而是把这些后端 contract 对齐、硬化、验证，为后续 mobile UI 消费做准备。

重要边界：

- 只做 backend contract 和验证脚本，不重写 UI。
- 不实现 relay、WebSocket、公网访问或 E2EE。
- 不开放 4580 或 mobile 端口到公网。
- 不复制 Paseo 源码。
- 不删除旧 mobile API。
- 保持 LAN-only、token auth、allowed roots、forbidden path、runner output scrub、audit redaction。

请先阅读：

- `docs/paseo-mobile-reference-map.md`
- `docs/fanbox-mobile-current-map.md`
- `docs/mobile-gap-to-paseo.md`
- `docs/mobile-convergence-roadmap.md`
- `docs/mobile-backend-contract.md`
- `electron/mobile.js`
- `electron/mobile-sessions.js`
- `electron/mobile-agent-runner.js`
- `scripts/verify-mobile-backend-contract.js`

目标：

稳定以下 API，让 mobile UI 可以直接消费：

- `GET /api/mobile/app-state`
- `GET /api/mobile/dashboard`
- `GET /api/mobile/sessions/:id/timeline`
- `GET /api/mobile/files/recent`
- `GET /api/mobile/devices`
- `GET /api/mobile/audit`

执行要求：

1. 对照 `docs/mobile-backend-contract.md` 和当前实现，找出字段命名、timestamp 类型、status 值、redaction、错误返回的实际不一致。
2. 只做必要的后端 contract 对齐；如果文档应跟随现有安全实现，优先改文档；如果实现明显破坏 contract 或 verifier，才改实现。
3. 补强 `scripts/verify-mobile-backend-contract.js`，覆盖：
   - 六个 API 都返回稳定 top-level keys；
   - `devices` 不返回 token/tokenHash；
   - `audit` 不返回 raw prompt/token/secret；
   - `files/recent` 不返回 forbidden path；
   - `timeline` 可以独立渲染，不依赖 `/messages`；
   - `dashboard` 聚合 active sessions/running agents/pending approvals/recent files/usage/audit。
4. 不改 `public/mobile/mobile.js`，除非发现它调用了不存在 endpoint 且会阻塞验证；如必须改 UI，先停下说明原因。

验收命令：

```powershell
node scripts\verify-mobile-backend-contract.js
```

交付：

- 简短说明实际改了哪些文件；
- 说明六个 API 的最终 contract；
- 粘贴验证命令和结果；
- 标出仍未解决、留给 Mobile-B2/B3/Safety 的问题。
```
