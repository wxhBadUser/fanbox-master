# Mobile Backend Contract

## Scope

Mobile-B1 的目标是把 FanBox 现有 mobile backend 收束成稳定合同，让后续 mobile UI 可以按同一套模型取数，而不是直接追随桌面端内部结构。

本阶段只做 backend contract 和验证脚本：

- 不重写现有 mobile UI。
- 不引入 React、Vue、Expo、React Native 或大依赖。
- 不引入 relay、E2EE、公网访问或跨设备协同。
- 不删除旧 API，不破坏桌面端和 WeChat ClawBot 相关链路。
- Paseo 仅作为架构和合同参考；本仓库未复制 Paseo 代码。

## Current Capability Map

| Area | Existing FanBox capability | B1 gap | B1 contract |
| --- | --- | --- | --- |
| Pairing | `/api/mobile/info`, `/api/mobile/pair/status`, `/api/mobile/pair/confirm`, token auth | 页面启动时缺少统一状态入口 | `GET /api/mobile/info`, `GET /api/mobile/app-state` |
| Status | `/api/mobile/status` | 只适合诊断，不适合首页聚合 | `GET /api/mobile/app-state`, `GET /api/mobile/dashboard` |
| Files | `/api/mobile/files`, `/api/mobile/file`, `/api/mobile/search`, `/api/mobile/thumb` | 缺少最近文件列表 | `GET /api/mobile/files/recent` |
| Projects | `/api/mobile/projects` | 可复用，后续补 mobile project summary | 保持旧 API，模型纳入 `MobileProject` |
| Sessions | `/api/mobile/sessions`, `/api/mobile/sessions/:id`, `/api/mobile/sessions/:id/messages`, `/api/mobile/sessions/:id/events` | 缺少 append-only timeline 投影 | `GET /api/mobile/sessions/:id/timeline` |
| Agents | `/api/mobile/agents`, `/api/mobile/agent/send`, `/api/mobile/agent/stream` | 运行态需要进入 dashboard 汇总 | `GET /api/mobile/dashboard` |
| Approvals | `/api/mobile/approvals`, `/api/mobile/approvals/:id` | 首页和 dashboard 需要 pending count | `GET /api/mobile/app-state`, `GET /api/mobile/dashboard` |
| Devices | pair token store | 缺少设备列表安全投影 | `GET /api/mobile/devices` |
| Audit | audit append exists in session layer | 缺少只读审计查询 | `GET /api/mobile/audit` |
| Usage | `/api/mobile/usage` | dashboard 缺少 summary 入口 | `GET /api/mobile/dashboard` |

## Future Mobile Pages

| Page | Data needed | Primary contract |
| --- | --- | --- |
| Home / Dashboard | server state, current context, running agents, active sessions, pending approvals, recent files, usage summary | `GET /api/mobile/app-state`, `GET /api/mobile/dashboard` |
| Agents | agent list, status, provider, model, current session, last activity | `GET /api/mobile/agents`, future `MobileAgent` summary |
| Agent Detail | agent status, current task, stream state, approvals, usage | `GET /api/mobile/dashboard`, `/api/mobile/agent/stream` |
| Sessions | recent sessions, cwd label, agent id, status, last message | `GET /api/mobile/sessions` |
| Session Detail | session metadata, messages, approvals, cwd, runner state | `GET /api/mobile/sessions/:id`, `GET /api/mobile/sessions/:id/timeline` |
| Timeline | ordered user/assistant/tool/approval/system events, stable ids, cursors | `GET /api/mobile/sessions/:id/timeline`, future stream event `session.timeline.appended` |
| Files | roots, recent files, browse entries, search results, thumbnails | `GET /api/mobile/files/recent`, `GET /api/mobile/files`, `GET /api/mobile/search`, `GET /api/mobile/thumb` |
| Skills | available skills, active skill state | `GET /api/mobile/skills`, `GET /api/mobile/skills-state` |
| Projects | project list, cwd, labels, recent sessions | `GET /api/mobile/projects` |
| Approvals | pending and historical decisions, decision action | `GET /api/mobile/approvals`, `POST /api/mobile/approvals/:id` |
| Devices | paired devices, current device, revoked state, last seen | `GET /api/mobile/devices` |
| Audit | recent mobile actions, device id, decision metadata, blocked reasons | `GET /api/mobile/audit` |
| Settings / Pairing | server id, auth state, LAN state, pairing status | `GET /api/mobile/app-state`, `/api/mobile/pair`, `/api/mobile/pair/confirm` |

## API Contract

All endpoints stay under the existing LAN-only mobile server and require the existing mobile token unless the pairing flow already allows unauthenticated access.

All Mobile-B1 timestamps are Unix epoch milliseconds (`number`). New read-model endpoints use the same stable error envelope:

```json
{
  "ok": false,
  "error": {
    "code": "unauthorized",
    "message": "A valid mobile bearer token is required."
  }
}
```

Successful Mobile-B1 endpoints include `meta` with safe debug information such as the contract name, projection source, and response timestamp. `meta` must not include tokens, token hashes, secrets, raw prompts, raw stdout, PTY output, or forbidden paths.

### `GET /api/mobile/info`

Purpose: LAN-only public compatibility wrapper for the existing pair screen and token restore path.

Auth: no token required. If a bearer token is supplied, it is validated and a safe `auth` summary is returned. Invalid supplied tokens return the stable `unauthorized` error so stale clients can re-pair.

Response fields:

- `server`: public server summary, including `lanOnly: true`.
- `pairing`: active pair-code state and expiry timestamp.
- `auth`: safe current-device summary when a valid token is supplied; otherwise unpaired.
- `features`: feature flags.
- `connection`: `http+sse` capabilities.
- `meta`: safe contract metadata.

Security: never returns raw token, token hash, secret, or password.

### `GET /api/mobile/app-state`

Purpose: first-load bootstrap for mobile clients.

Response:

```json
{
  "ok": true,
  "server": {
    "serverId": "fanbox-mobile",
    "name": "FanBox Mobile",
    "version": "0.1",
    "lanOnly": true,
    "primaryLanUrl": "http://192.168.1.2:4580/mobile"
  },
  "auth": {
    "paired": true,
    "deviceId": "device-1",
    "deviceName": "Phone"
  },
  "features": {
    "pairing": true,
    "files": true,
    "sessions": true,
    "agents": true,
    "approvals": true,
    "audit": true,
    "relay": false,
    "e2ee": false
  },
  "connection": {
    "transport": "http+sse",
    "state": "connected",
    "capabilities": {
      "rest": true,
      "sse": true,
      "webSocket": false,
      "relay": false,
      "e2ee": false,
      "lanOnly": true,
      "pairCode": true,
      "tokenAuth": true
    }
  },
  "currentContext": {
    "cwd": "I:\\AI_weflow\\fanbox-master",
    "cwdLabel": "fanbox-master"
  },
  "counts": {
    "sessions": 2,
    "activeSessions": 1,
    "pendingApprovals": 0,
    "devices": 1,
    "recentFiles": 4,
    "desktopContinuableAgents": 0,
    "runningDesktopAgents": 0
  },
  "meta": {
    "contract": "mobile-b1",
    "source": "app-state-projection",
    "timestamp": 1782226276107
  }
}
```

### `GET /api/mobile/dashboard`

Purpose: compact operational overview for the mobile home page.

Response fields:

- `activeSessions`: `MobileSession[]`
- `runningAgents`: `MobileAgent[]` (session-derived, retained for backward compatibility)
- `desktopContinuableAgents`: `MobileDesktopAgent[]` — B2A read model of desktop-running or recently-active terminal agents
- `pendingApprovals`: `MobileApproval[]`
- `recentFiles`: `MobileFileEntry[]`
- `usageSummary`: `MobileUsageSummary`
- `recentAuditEntries`: `MobileAuditEntry[]`
- `meta`: includes `runningAgentsSource: "session-derived"`, `desktopAgentsSource: "desktop-terminal-provider"`, and `approvalEnforcement: "redline_detected_but_not_blocked"`

B2A adds `desktopContinuableAgents` from the injected desktop terminal provider. `runningAgents` remains session-derived for backward compatibility. When no terminal provider is injected (standalone/test mode), `desktopContinuableAgents` is an empty array.

### `GET /api/mobile/sessions/:id/timeline`

Purpose: stable append-only projection for the session detail page.

Query:

- `limit`: optional integer, default `100`, max `500`.
- `cursor`: reserved for B2; currently `null`.

Response:

```json
{
  "ok": true,
  "sessionId": "session-1",
  "status": "running",
  "agentId": "codex",
  "cwd": "I:\\AI_weflow\\fanbox-master",
  "cwdLabel": "fanbox-master",
  "events": [
    {
      "id": "session-1:message:0",
      "type": "message",
      "role": "user",
      "text": "hello",
      "status": "completed",
      "timestamp": 1782226273966,
      "createdAt": 1782226273966,
      "agentId": "codex",
      "source": "message"
    }
  ],
  "nextCursor": null,
  "hasMore": false,
  "meta": {
    "contract": "mobile-b1",
    "source": "messages-projection",
    "timestamp": 1782226276107
  }
}
```

B1 fixes `text` as the renderable event body field. `content` is not used in this contract. The current source is still a scrubbed messages projection, but events reserve fields for future `tool`, `approval`, `file`, `status`, and `system` events.

### `GET /api/mobile/desktop-agents/:id/timeline` (B2A stub, B2B full)

Purpose: read-only timeline for a desktop continuable agent. B2A provides a minimal safe stub; B2B will add richer events.

Design decision (B2B): Use a **dedicated endpoint** (`/api/mobile/desktop-agents/:id/timeline`) rather than mapping to synthetic sessions. Rationale:

- Desktop terminals have a different lifecycle than mobile sessions (no persistent JSON message store, PTY-only).
- Mapping to synthetic sessions would require fabricating session records that don't exist in the mobile session store.
- A dedicated endpoint keeps the contract honest: `source: "desktop-terminal"` events come from terminal state, not from session messages.
- When B2C adds follow-up sending, the response can naturally evolve to include input prompts without polluting the session timeline model.

B2A response (stub):

```json
{
  "ok": true,
  "desktopAgentId": "term-abc123",
  "status": "running",
  "agentId": "claude",
  "cwd": "I:\\AI_weflow\\fanbox-master",
  "events": [
    {
      "id": "term-abc123:status:0",
      "type": "status",
      "status": "running",
      "text": "Agent is running in fanbox-master",
      "timestamp": 1782226276107,
      "source": "desktop-terminal"
    }
  ],
  "nextCursor": null,
  "hasMore": false,
  "meta": {
    "contract": "mobile-b2a",
    "source": "desktop-terminal-timeline-stub",
    "timestamp": 1782226276107
  }
}
```

B2A security:

- Only returns `status`, `output_tail` (as `type: "status"` event with truncated text), and `recent_files` (as `type: "file"` events).
- Does NOT return raw log, raw PTY buffer, internal session tokens, or resume tokens.
- When the terminal provider is missing or the agent id is unknown, returns `{ ok: true, events: [] }` with a 404-style status.
- Events never contain secrets, tokens, keys, or full environment variables.
- `canSendFollowup` is not present in timeline events (B2C will add input capability separately).

### `GET /api/mobile/files/recent`

Purpose: recent file candidates for the mobile files page and dashboard.

Query:

- `limit`: optional integer, default `20`, max `100`.

Security:

- Must reuse existing allowed-root and forbidden-path checks.
- Must not return files outside mobile allowed roots.
- Each item includes `path`, `name`, `kind`, `size`, `mtime`, `source`, and `reason`.
- `kind` is fixed to `"file"` or `"directory"`; file subtype remains in `type`.
- Missing files are skipped safely.

### `GET /api/mobile/devices`

Purpose: safe projection of paired mobile devices.

Security:

- Must not expose raw tokens or token hashes.
- Exposes `deviceId`, `deviceName`, `pairedAt`, `lastActiveAt`, `lastIp`, `revoked`, `scopes`, and whether it is the current device.
- Current mobile backend does not implement mobile-side revoke/rename. `capabilities.revoke` and `capabilities.rename` are `false`.

### `GET /api/mobile/audit`

Purpose: mobile-readable recent audit feed.

Query:

- `limit`: optional integer, default `50`, max `200`.

Security:

- Must not expose tokens, secrets, raw prompts, or full private message bodies.
- May expose action metadata, ids, timestamps, decisions, hashes, lengths, and blocked reasons.
- If the audit file does not exist, returns `ok:true` with an empty `items` array.
- If the audit file exists but cannot be read, returns the stable error envelope with `code:"audit_read_failed"`.

Approval enforcement status: Mobile-B1 records redline detection as `redline_detected_but_not_blocked`. It does not implement full blocking, approval recovery, or mobile approval decisions. Those remain Mobile-Safety / Mobile-B2 work.

## Unified Models

### `MobileContractMeta`

```ts
type MobileContractMeta = {
  contract: "mobile-b1";
  source: string;
  timestamp: number;
  [key: string]: unknown;
};
```

### `MobileAppState`

```ts
type MobileAppState = {
  ok: true;
  server: MobileServerInfo;
  auth: MobileAuthState;
  features: MobileFeatureFlags;
  connection: MobileConnectionState;
  currentContext: MobileContext;
  counts: {
    sessions: number;
    activeSessions: number;
    pendingApprovals: number;
    devices: number;
    recentFiles: number;
    desktopContinuableAgents: number;
    runningDesktopAgents: number;
  };
  meta: MobileContractMeta;
};
```

### `MobileDashboard`

```ts
type MobileDashboard = {
  ok: true;
  activeSessions: MobileSession[];
  runningAgents: MobileAgent[];
  desktopContinuableAgents: MobileDesktopAgent[];
  pendingApprovals: MobileApproval[];
  recentFiles: MobileFileEntry[];
  usageSummary: MobileUsageSummary;
  recentAuditEntries: MobileAuditEntry[];
  meta: MobileContractMeta;
};
```

### `MobileAgent`

```ts
type MobileAgent = {
  id: string;
  name: string;
  provider?: string;
  model?: string;
  status: "idle" | "initializing" | "running" | "waiting_approval" | "error" | "closed";
  sessionId?: string | null;
  cwd?: string | null;
  cwdLabel?: string | null;
  lastActivityAt?: number | null;
  source: string;
  usage?: MobileUsageSummary | null;
};
```

### `MobileDesktopAgent` (B2A)

B2A read-only projection of a desktop terminal session running or recently active.

```ts
type MobileDesktopAgent = {
  id: string;                    // safe opaque id (hash of terminal id), not raw pty id
  source: "desktop-terminal";    // fixed for B2A
  agentId: "claude" | "codex" | "qoder" | "opencode" | "unknown";
  label: string;                 // human-readable label e.g. "Claude Code · fanbox-master"
  cwd: string;                   // working directory (must pass allowedRoots + forbiddenPath)
  projectName: string;           // basename of cwd
  status: "running" | "idle" | "waiting_input" | "exited" | "unknown";
  busy: boolean;                 // true if foreground process is not a bare shell
  lastActiveAt: number;          // unix epoch ms of last terminal output
  outputTail: string;            // scrubbed, ANSI-stripped, length-limited tail (~500 chars)
  outputTailRedacted: boolean;   // true if secrets/keys were scrubbed from tail
  recentFiles: MobileFileEntry[]; // up to 5 recently modified files in cwd (safe)
  canOpen: boolean;              // true if cwd is within mobile allowed roots
  canSendFollowup: false;        // B2A: always false (follow-up in B2C)
  reason: string;                // why this agent is visible or what it's doing
  terminalId?: string;           // opaque terminal id hash (safe, not raw pty pid)
  sessionId?: string | null;     // fanbox mobile session id if mapped, else null
  riskFlags: string[];           // e.g. ["cwd_outside_roots"] if not accessible
};
```

Security rules for `MobileDesktopAgent`:

- `outputTail` is capped at `DESKTOP_AGENT_TAIL_MAX = 500` characters after ANSI stripping and secret scrubbing.
- `outputTail` must NOT contain: raw PTY buffer, ANSI escape sequences, tokens, API keys, cookies, environment variables, Claude/Codex resume tokens or internal session IDs.
- `cwd` must pass `isForbiddenPath()` and `pathInAllowed()` checks; if not, `canOpen` is `false` and `riskFlags` includes `"cwd_outside_roots"`.
- `terminalId` is a SHA256 hash prefix of the raw terminal id, never the raw id or pid.
- `canSendFollowup` is always `false` in B2A. Follow-up command sending is B2C work.
- No raw stdout, no JSONL content, no shell history is exposed.

### `DesktopAgentTimelineEvent` (B2B)

B2B adds a ring-buffered event stream for each desktop terminal agent. Events are read-only, scrubbed, and ANSI-stripped.

```ts
type DesktopAgentTimelineEvent = {
  id: string;                   // stable event id: "ev-{termHash}-{seq}"
  type:
    | "status_snapshot"         // current state snapshot (always included as most recent)
    | "status_change"           // process started / status transition
    | "output_tail"             // throttled output tail snippet
    | "waiting_input"           // (reserved for future) process is waiting for input
    | "process_exit"            // terminal process exited
    | "recent_files"            // recent files in cwd (periodic or on-demand)
    | "error";                  // internal error (safe message only)
  timestamp: number;            // unix epoch ms
  agentId: "claude" | "codex" | "qoder" | "opencode" | "unknown";
  desktopAgentId: string;       // safe hash id of the desktop agent
  source: "desktop-terminal";   // fixed
  title?: string;               // short human-readable title
  text?: string;                // scrubbed, ANSI-stripped, length-limited content
  status?: "running" | "idle" | "waiting_input" | "exited" | "unknown";
  redacted?: boolean;           // true if content was scrubbed for secrets
  meta?: {                      // safe metadata only — no pids, no tokens, no raw handles
    exitCode?: number;
    projectName?: string;
    fileCount?: number;
    outputLength?: number;
  };
};
```

Forbidden event types (must never appear):

- `raw_input` — user keystrokes / command text are never recorded
- `raw_pty` — raw PTY buffer is never included
- `raw_env` — environment variables are never included
- `raw_resume_token` — Claude/Codex resume handles are never included

Ring buffer parameters:

- Max events per terminal: `DESKTOP_EVENT_RING_MAX = 100`
- Max text length per `output_tail` event: `DESKTOP_AGENT_TAIL_MAX = 500` chars (post-scrub)
- Output throttling: minimum `DESKTOP_OUTPUT_THROTTLE_MS = 1800` ms between `output_tail` events per terminal

### B2B timeline endpoint response

```json
{
  "ok": true,
  "id": "term-abc123",
  "source": "desktop-terminal",
  "agentId": "claude",
  "label": "Claude Code · fanbox-master",
  "status": "running",
  "canSendFollowup": false,
  "events": [ ... ],
  "eventCount": 42,
  "meta": {
    "limit": 50,
    "since": null,
    "hasMore": false,
    "timelineSource": "desktop-terminal-ring-buffer"
  }
}
```

### `MobileProject`

```ts
type MobileProject = {
  id: string;
  name: string;
  cwd: string;
  cwdLabel: string;
  lastOpenedAt?: number | null;
  sessionCount?: number;
};
```

### `MobileSession`

```ts
type MobileSession = {
  id: string;
  title?: string;
  agentId?: string | null;
  status: "idle" | "running" | "waiting_approval" | "error" | "closed";
  cwd?: string | null;
  cwdLabel?: string | null;
  createdAt?: number;
  updatedAt?: number;
  lastMessage?: string | null;
};
```

### `MobileTimelineEvent`

```ts
type MobileTimelineEvent = {
  id: string;
  type: "message" | "tool" | "approval" | "status" | "system";
  role?: "user" | "assistant" | "system" | "tool";
  text?: string;
  status?: "pending" | "running" | "completed" | "failed" | "blocked";
  timestamp: number;
  createdAt?: number;
  agentId?: string | null;
  approvalId?: string | null;
  source?: string;
  redacted?: boolean;
};
```

### `MobileApproval`

```ts
type MobileApproval = {
  id: string;
  sessionId?: string | null;
  agentId?: string | null;
  status: "pending" | "approved" | "denied" | "expired";
  title?: string;
  body?: string;
  createdAt: number;
  decidedAt?: number | null;
};
```

### `MobileDevice`

```ts
type MobileDevice = {
  id: string;
  name: string;
  deviceId: string;
  deviceName: string;
  pairedAt?: number | null;
  lastSeenAt?: number | null;
  lastActiveAt?: number | null;
  lastIp?: string;
  revoked: boolean;
  active: boolean;
  isCurrent: boolean;
  scopes: string[];
};
```

### `MobileAuditEntry`

```ts
type MobileAuditEntry = {
  id: string;
  timestamp: number;
  ts?: number;
  action: string;
  deviceId?: string | null;
  sessionId?: string | null;
  agentId?: string | null;
  cwdLabel?: string | null;
  decision?: string | null;
  actor?: string | null;
  inputHash?: string | null;
  inputLen?: number | null;
  reasons?: string[];
};
```

### `MobileFileEntry`

```ts
type MobileFileEntry = {
  id: string;
  name: string;
  path: string;
  kind: "file" | "directory";
  type?: string;
  source?: "workspace" | "session" | "screenshot";
  reason: string;
  size?: number;
  mtime?: number | null;
  lastAccessedAt?: number | null;
  thumbUrl?: string | null;
};
```

### `MobileUsageSummary`

```ts
type MobileUsageSummary = {
  requests?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};
```

### `MobileConnectionState`

```ts
type MobileConnectionState = {
  transport: "http+sse";
  state: "connected" | "degraded" | "offline";
  lastSeenAt?: number | null;
  capabilities: {
    rest: boolean;
    sse: boolean;
    webSocket: boolean;
    relay: boolean;
    e2ee: boolean;
    lanOnly: boolean;
    pairCode: boolean;
    tokenAuth: boolean;
  };
};
```

## Future Event Model

B1 keeps the existing REST plus SSE shape. B2 can make the stream more explicit with these event names:

| Event | Payload | Use |
| --- | --- | --- |
| `connection.heartbeat` | `MobileConnectionState` | liveness and reconnect UI |
| `agent.updated` | `MobileAgent` | agent list/detail refresh |
| `session.created` | `MobileSession` | session list insert |
| `session.updated` | `MobileSession` | status/title/cwd refresh |
| `session.timeline.appended` | `MobileTimelineEvent` | append live timeline item |
| `terminal.updated` | `{ sessionId, status }` | terminal state badge |
| `terminal.output_tail` | `{ sessionId, text, cursor }` | optional log tail |
| `approval.created` | `MobileApproval` | pending approval banner |
| `approval.decided` | `MobileApproval` | remove or update approval item |
| `file.changed` | `MobileFileEntry` | recent file refresh |
| `device.revoked` | `MobileDevice` | force re-auth UX |
| `audit.appended` | `MobileAuditEntry` | audit page live append |
| `usage.updated` | `MobileUsageSummary` | dashboard usage refresh |
| `security.blocked` | `{ reason, path?, action? }` | blocked file/action feedback |
| `desktop.agent_updated` | `MobileDesktopAgent` | desktop terminal agent state refresh |
| `desktop.agent_output_tail` | `{ desktopAgentId, text }` | desktop terminal output tail append |

## Paseo Mapping

| Paseo practice | FanBox borrow? | FanBox adaptation | License risk | B1 implementation |
| --- | --- | --- | --- | --- |
| Local daemon is the source of truth and mobile/desktop/CLI are clients | Yes | Keep FanBox Electron mobile server as local authority | Low, architectural idea only | `app-state` and `dashboard` expose server-centered state |
| Shared protocol package owns message schemas | Yes | Document FanBox mobile models first; later extract shared schema if needed | Low | This document defines `Mobile*` models |
| WebSocket protocol with hello and capabilities | Partial | FanBox keeps REST+SSE; exposes capabilities through app state | Low | `connection.capabilities` and feature flags |
| Client reconnect/liveness state | Yes | Model as `MobileConnectionState` without changing transport | Low | `app-state.connection` |
| Agent lifecycle states | Yes | Map current runner/session state to mobile status strings | Low | `dashboard.runningAgents`, `MobileAgent.status` |
| Append-only timeline and separate live stream | Yes | Add read-side timeline projection; keep existing session events for live updates | Low | `/api/mobile/sessions/:id/timeline` |
| Permission request and resolution events | Yes | Reuse existing approvals; add event names for future stream | Low | `pendingApprovals`, future `approval.*` events |
| Workspace identity separated from cwd | Partial | Keep cwd as stable current identity, expose `cwdLabel` for UI | Low | `MobileContext`, `MobileProject`, `MobileSession` |
| Relay and E2EE | No for B1 | Explicitly out of scope; LAN-only remains required | Low because not implemented | `features.relay=false`, `features.e2ee=false` |
| React Native app runtime | No | FanBox does not add RN or rewrite UI in B1 | Low | Backend-only contract and verifier |

## Compatibility Rules

- New endpoints must be additive.
- Existing mobile endpoints must keep their current paths and payloads.
- New models may add fields, but mobile clients should tolerate missing optional fields.
- Security-sensitive fields such as tokens, token hashes, raw prompts, secrets, and private full message bodies must not be added to `devices` or `audit`.
- Future stream events should be append-only: add new event names instead of changing existing semantics.

## Verification

B1 verification is encoded in:

```powershell
node scripts\verify-mobile-backend-contract.js
```

The verifier starts the mobile server in-process, pairs a test device, creates a sample session/message/audit entry where possible, then checks:

- `GET /api/mobile/app-state`
- `GET /api/mobile/dashboard`
- `GET /api/mobile/sessions/:id/timeline`
- `GET /api/mobile/files/recent`
- `GET /api/mobile/devices`
- `GET /api/mobile/audit`
- sensitive fields are not exposed from devices or audit responses

## Phase B2C — Safe Mobile Follow-up Input

Phase B2C adds a minimal safe write capability: a paired mobile device with the `desktop_control` scope can send a text follow-up to an existing live desktop agent terminal. It does **not** add arbitrary shell access, public network endpoints, WebSockets, relay, or E2EE.

### Device scopes

Each paired device carries a `scopes: string[]` array. Known scopes:

| Scope | Meaning | Granted by default? |
| --- | --- | --- |
| `read:status` | Read app-state, dashboard, connection state | Yes (pairing) |
| `read:files` | Read recent files and file tree scoped to allowed roots | Yes (pairing) |
| `desktop_control` | Send follow-up text input to a running desktop agent terminal | **No** — must be granted explicitly via a future desktop-side approval UI |

Legacy devices paired before B2C only carry `['read:status', 'read:files']` and cannot send input. They continue to work for reads.

### `canSendFollowup` rule

A desktop agent reported through `GET /api/mobile/app-state`, `GET /api/mobile/dashboard`, or `GET /api/mobile/desktop-agents/:id/timeline` sets `canSendFollowup: true` only when **all** of the following hold:

1. The agent `canOpen` (its cwd resolves inside an allowed root).
2. The current device (request token) includes the `desktop_control` scope.
3. The write provider has been registered (desktop main process is live and wired).
4. The agent is in a writable state (terminal is alive and not exited).

Otherwise `canSendFollowup` is `false`.

### `DesktopTerminalWriteProvider` (in-process provider, not over HTTP)

The desktop main process injects a write provider into `mobile.js`. `mobile.js` never accesses PTY handles, raw terminal ids, or pids directly.

```ts
type DesktopTerminalWriteProvider = {
  sendInput(
    desktopAgentId: string,
    text: string,
    options?: { appendNewline?: boolean }
  ): Promise<{ ok: true } | { ok: false; error: string }>;
};
```

Contract invariants:

- `desktopAgentId` is the safe hashed id (the same string returned in `MobileDesktopAgent.id`), never a raw terminal id.
- The provider is responsible for mapping `desktopAgentId` back to the internal PTY instance (by iterating terminals and matching `safeTermIdHash(rawId)`).
- `text` is pre-validated by `mobile.js` (type, length, ANSI/NUL/control-char filtering) before the provider is called.
- If `options.appendNewline !== false`, the provider appends a single `\n` before writing (so a single press of "send" submits the follow-up).
- The provider must not throw. All errors are returned via the `{ ok:false, error }` envelope.
- The provider must push a `input_sent` event to the agent's ring buffer after a successful write. The event `text` field **must not** contain the raw input; it must be the fixed string `"Mobile follow-up sent"`, with `meta.inputLength` carrying the character length.

### `POST /api/mobile/desktop-agents/:id/input`

Request:

```json
{
  "text": "继续完善刚才的功能",
  "appendNewline": true
}
```

Request constraints (enforced by `mobile.js` before calling the provider):

- `text` must be a string.
- `text.trim()` must be non-empty.
- `text.length` must be between 1 and `4096` (after trim is non-empty; raw length cap is 4096).
- `text` must not contain `\x1b` (ANSI escape), `\x00` (NUL), or an excessive ratio of control characters (after excluding `\n` and `\t`, control chars count must be ≤ 10% of length and ≤ 20 absolute).
- `appendNewline` defaults to `true`; when truthy a single `\n` is appended by the provider.
- Request body size is capped at 8 KB by the HTTP layer.

Success response:

```json
{
  "ok": true,
  "id": "term-<hash>",
  "accepted": true,
  "canSendFollowup": true,
  "meta": {
    "inputLength": 8,
    "appendNewline": true,
    "auditWritten": true
  }
}
```

Success response must **not** contain: the raw input text, raw terminal id, pid, token, tokenHash, resumeToken, PTY handle, or any session-internal identifier other than the safe `desktopAgentId`.

Error responses (stable envelope):

```json
{ "ok": false, "error": { "code": "<errorCode>", "message": "Human-readable reason." } }
```

Error codes:

| Code | HTTP status | Meaning |
| --- | --- | --- |
| `unauthorized` | 401 | Missing/invalid bearer token. |
| `desktop_control_scope_required` | 403 | Device token is valid but lacks `desktop_control` scope. |
| `write_provider_unavailable` | 503 | Desktop main process has not registered a write provider (electron not running or IPC not wired). |
| `desktop_agent_not_found` | 404 | No desktop agent with that `desktopAgentId`, or agent not `canOpen`. |
| `input_empty` | 400 | `text` missing or empty after trim. |
| `input_too_long` | 400 | `text.length > 4096`. |
| `input_rejected_control_chars` | 400 | `text` contains ANSI escape, NUL, or too many control characters. |
| `rate_limited` | 429 | Too many inputs from this device to this agent within the rate-limit window. |

Other transient provider failures (e.g. PTY write threw after terminal exited) are surfaced as HTTP 502/500 with a generic error code; they must not leak raw terminal ids or internal error stacks.

### Rate limit

- Key: `${deviceId}:${desktopAgentId}`.
- Window: `1000 ms` minimum gap between accepted inputs on the same key.
- When exceeded, respond with `rate_limited` and do **not** call the write provider.
- Rate-limit state is held in-memory in `mobile.js` and resets on process restart (acceptable for LAN-only).

### Input sent timeline event

`DesktopAgentTimelineEvent.type` adds the value `input_sent`.

```json
{
  "id": "tev-...",
  "type": "input_sent",
  "timestamp": 1730000000000,
  "agentId": "claude",
  "desktopAgentId": "term-<hash>",
  "source": "desktop-terminal",
  "title": "Mobile follow-up",
  "text": "Mobile follow-up sent",
  "meta": { "inputLength": 12 }
}
```

Hard rules:

- The `text` field is the fixed literal `"Mobile follow-up sent"`. It must never echo the user's input.
- `meta.inputLength` records the character count of the accepted input (numeric).
- `meta.deviceId` must NOT be present (to avoid leaking device identifiers into a multi-consumer timeline).

### Audit entries

Each input attempt writes an append-only audit entry via `mobileSessions.appendAudit(...)`:

- Accepted: `action: "desktop_agent.input.accepted"`
- Rejected (validation/auth/scope/provider/agent): `action: "desktop_agent.input.rejected"` with `reason: <errorCode>`
- Rate limited: `action: "desktop_agent.input.rate_limited"`

Audit fields (safe subset only):

```ts
{
  action: string;                // one of the three actions above
  ts: number;
  deviceId: string;              // safe device id (already present on all audit entries)
  desktopAgentId: string;        // safe hashed agent id
  agentId?: string;              // "claude" | "codex" | ... if known
  inputLength?: number;          // character length of text (accepted path only)
  reason?: string;               // errorCode on rejected/rate_limited
  result?: "accepted" | "rejected" | "rate_limited";
}
```

Audit entries must **never** contain:

- raw input text
- token, tokenHash
- secret, API key, resume token
- raw terminal id, pid
- PTY file descriptor or internal handle

### Out of scope for B2C

- `POST /api/mobile/desktop-agents/:id/interrupt` (Ctrl+C) — reserved for a later phase; B2C returns `not_implemented` if ever called, and the verifier does not require it.
- Public network exposure, relay, WebSocket, E2EE.
- Rewriting the mobile UI (no UI changes required; a minimal test entry may exist only inside the verifier's in-process server).
- Sending raw ANSI sequences, binary data, or arbitrary shell commands.

### Why this is not arbitrary shell access

1. **LAN only.** The mobile server is bound to loopback/LAN addresses and already enforces this.
2. **Token auth + scoped permission.** Input requires a paired bearer token that was explicitly granted `desktop_control`; default pairing is read-only.
3. **No process creation.** There is no `/exec`, `/spawn`, `/shell`, `/kill`, `/cwd`, `/env` endpoint. The only write is to an **already-running** agent's PTY stdin.
4. **No terminal selection by raw id.** The client passes only the safe `desktopAgentId` hash; the provider resolves it internally.
5. **Input filtering.** ANSI escapes, NUL, and control-character-heavy payloads are rejected before reaching the PTY. The only control character that reaches the PTY is the optional trailing `\n` (submit).
6. **Rate limiting** (1 req/sec per device+agent) prevents rapid injection.
7. **Audit trail.** Every accepted/rejected/rate-limited attempt is appended to the audit log without storing the input text.
8. **No raw handles exposed.** Responses never leak raw terminal ids, pids, token hashes, resume tokens, or PTY internals.
9. **cwd scoping.** Input is only accepted for agents whose cwd is inside an allowed root (same `canOpen` rule that protects reads).

### B2C verification additions

The verifier (`scripts/verify-mobile-backend-contract.js`) additionally checks:

- B1/B2A/B2B assertions continue to pass unchanged.
- No token → POST input returns 401.
- Token without `desktop_control` → `desktop_control_scope_required`.
- Write provider not registered → `write_provider_unavailable`.
- Unknown agent id → `desktop_agent_not_found`.
- Empty body / empty text → `input_empty`.
- Text longer than 4096 → `input_too_long`.
- Text containing ANSI escape → `input_rejected_control_chars`.
- Valid input is received by the mock write provider exactly once.
- Success response body does not contain the input text.
- Audit entries (via `GET /api/mobile/audit`) do not contain the input text.
- Timeline appends a `input_sent` event whose `text` is the fixed literal (no echo of input).
- `canSendFollowup` is `true` only when scope + provider + canOpen all hold; `false` otherwise.
- Second input within 1 second returns `rate_limited`.
- Success/error responses do not contain raw terminal id, pid, tokenHash, or resumeToken.

---

## Phase B3A — Phone Project Selection + New Agent Session Draft

Phase B3A adds the backend capability for a mobile device to **prepare** a new agent session without actually spawning Claude Code/Codex. The phone can: (1) list startable projects; (2) choose a cwd and agentId; (3) create a draft session with optional title and initial message; (4) receive a sessionId that renders a `session_created` timeline event. B3A does **not** spawn any process, allocate a PTY, call the runner, or execute commands — it only writes to the local session store.

### Scope note

- B3A draft creation requires **no new scope**. A device paired with default read scopes (`read:status`, `read:files`) can create a draft. This is safe because the draft is inert metadata; no code runs.
- B3B (real agent spawn) will require a new scope (e.g. `session:start`) that is **not** granted by default.

### `MobileStartableProject` type

Returned by `GET /api/mobile/projects` (hardened in B3A):

```ts
type MobileStartableProject = {
  id: string;                   // opaque stable string (lowercased normalized cwd for backward compat); clients must treat as opaque
  name: string;                 // basename / human label
  cwd: string;                  // absolute project path (already scoped to allowed roots)
  cwdLabel: string;             // same as name, for UI rendering
  source: "root" | "session-index" | "desktop-project";
  agents: string[];             // agentIds seen in past sessions at this cwd
  agentIds: string[];           // alias for agents, preferred field going forward
  lastActiveAt: number;         // epoch ms; 0 for root-only entries with no sessions
  sessionCount: number;
  latestSessionId: string | null;
  latestSessionTitle: string | null;
  latestMessagePreview: string | null;
  statusSummary: { running: number; done: number; failed: number };
  canCreateSession: boolean;    // true iff cwd is allowed/non-forbidden/dir exists
  reason: string;               // "ready" | "directory not found" | "cwd not in allowed roots"
  riskFlags: string[];          // e.g. ["cwd_missing"]; empty when canCreateSession=true
};
```

Hard rules:

- Every project's `cwd` MUST pass `isForbiddenPath() === false` AND `pathInAllowed() === true` or the project is filtered out (not returned).
- Root directories listed in `mobileAllowedRoots()` are defensively re-validated before being included.
- `fsp.stat(cwd)` failures (directory missing / permission denied) do not crash the endpoint; they set `canCreateSession=false` with `riskFlags: ["cwd_missing"]`.
- Forbidden basenames (`.env`, `.git`, `node_modules`, etc.) never appear.
- If no projects exist the endpoint returns `{ ok: true, items: [], groups: {...} }` — never 404/500.

### `POST /api/mobile/sessions/draft`

Request:

```json
{
  "cwd": "I:/AI_weflow/fanbox-master",
  "agentId": "claude",
  "title": "帮我实现 mobile 新任务",
  "initialMessage": "可选，B3A 只保存为 draft，不启动",
  "mode": "draft"
}
```

Request constraints (enforced before writing):

- `cwd` required, must be a string; after `path.resolve()` must pass `isForbiddenPath() === false` and `pathInAllowed() === true`.
- `agentId` required, must be one of the allowlist (`claude` | `codex` | `opencode` | `qoder`).
- `title` optional; if present must be a string with length ≤ 80.
- `initialMessage` optional; if present must be a string with length ≤ 2000. It is stored as a user message with `status: "draft-pending"` but is NEVER sent to an agent in B3A.
- `mode` optional; if present MUST equal `"draft"` (other values reserved for future phases).
- Request body size is capped at 32 KB by the HTTP layer.

Success response (HTTP 200):

```json
{
  "ok": true,
  "session": {
    "id": "mobile-claude-...",
    "agentId": "claude",
    "cwd": "I:/AI_weflow/fanbox-master",
    "cwdLabel": "fanbox-master",
    "title": "帮我实现 mobile 新任务",
    "status": "draft",
    "createdAt": 1710000000000,
    "source": "mobile-draft",
    "canStart": false
  },
  "timeline": {
    "events": [
      {
        "id": "evt-session-created-...",
        "type": "session_created",
        "timestamp": 1710000000000,
        "sessionId": "mobile-claude-...",
        "agentId": "claude",
        "source": "mobile-draft",
        "title": "Session created",
        "text": "Mobile session draft created",
        "meta": { "initialMessageLength": 21, "titleLength": 14 }
      }
    ],
    "eventCount": 1
  },
  "meta": {
    "willSpawnAgent": false,
    "phase": "B3A",
    "initialMessageLength": 21
  }
}
```

Success response must **not** contain: the raw `initialMessage` text, `internalId`, token, tokenHash, pid, raw terminal id, PTY handle, resume token, or any secrets. `initialMessageLength` is reported in meta; the text is never echoed back.

Error responses (stable envelope):

```json
{ "ok": false, "error": { "code": "<errorCode>", "message": "Human-readable reason." } }
```

Error codes:

| Code | HTTP status | Meaning |
| --- | --- | --- |
| `unauthorized` | 401 | Missing/invalid bearer token. |
| `cwd_required` | 400 | `cwd` missing or not a string. |
| `cwd_not_allowed` | 403 | cwd is forbidden or outside allowed roots. |
| `agent_not_allowed` | 400 | `agentId` is missing or not in the allowlist. |
| `title_too_long` | 400 | `title.length > 80`. |
| `initial_message_too_long` | 400 | `initialMessage.length > 2000`. |
| `invalid_mode` | 400 | `mode` is present and not equal to `"draft"`. |

### Draft session lifecycle

- Session is written to the existing mobile sessions store with `status: "draft"`, `source: "mobile-draft"`, `canStart: false`.
- If `initialMessage` is provided, it is appended as a user message with `status: "draft-pending"`. It is NOT delivered to any runner.
- A session created by B3A never spawns a process, never touches node-pty, never calls `mobile-agent-runner`, and never calls the desktop write provider.
- B3B will later add `POST /api/mobile/sessions/:id/start` (requiring the `session:start` scope) to transition a draft into `running` and actually spawn the agent.

### Session timeline: `session_created` event

When a session has `status === "draft"`, `GET /api/mobile/sessions/:id/timeline` prepends a synthetic `session_created` event to the event array:

```json
{
  "id": "evt-session-created-<sessionId>",
  "type": "session_created",
  "timestamp": <sess.createdAt>,
  "sessionId": "<sessionId>",
  "agentId": "<agentId>",
  "source": "mobile-draft",
  "title": "Session created",
  "text": "Mobile session draft created",
  "meta": {
    "initialMessageLength": <number>,
    "titleLength": <number>
  }
}
```

Hard rules:

- `text` is the fixed literal `"Mobile session draft created"`. It never echoes the title or initial message.
- `meta.initialMessageLength` is numeric (0 if no initialMessage).
- `meta.deviceId` must NOT be present.
- `meta` must NOT contain the raw initial message text.
- Non-draft sessions (running/done/failed/error/waiting_approval/idle) are unaffected — no synthetic event is prepended, preserving B1/B2A backward compatibility.

Draft-pending messages (from the stored initialMessage) are projected by `timelineEventFromMessage` with a safe title/text indicating they have not been sent to the agent yet (e.g. `"Draft message prepared (not sent)"`).

### Audit entries

Draft creation writes one append-only audit entry:

- `action: "mobile_session.draft.created"`

Audit fields (safe subset only):

```ts
{
  action: "mobile_session.draft.created";
  ts: number;
  deviceId: string;
  sessionId: string;
  agentId: string;
  cwd: string;                 // the resolved project cwd (already in allowed roots)
  titleLength: number;
  initialMessageLength: number;
  result: "created";
}
```

Audit entries must **never** contain:

- raw `initialMessage` text
- raw `title` text (length only is safe)
- token, tokenHash
- secret, API key, resume token
- pid, PTY fd, raw terminal id, internal handle

### Out of scope for B3A

- Actually spawning Claude Code / Codex / OpenCode / Qoder (B3B).
- Interrupt (Ctrl+C) for mobile-started sessions.
- Approval UI for session creation.
- Project file browsing beyond what `/api/mobile/roots`, `/api/mobile/file`, `/api/mobile/search` already provide.
- Public network, relay, WebSocket, E2EE.
- New scope grants — B3A does not grant `session:start`.

### Why this does not start an agent

1. **No spawn, no PTY, no runner.** `createMobileDraftSession` only writes to `sessions.json`; it never calls `child_process.spawn`, node-pty, or `mobile-agent-runner`.
2. **No write provider call.** The B2C input path is not invoked.
3. **initialMessage is inert.** It is stored with status `"draft-pending"` and no runner consumes it.
4. **canStart=false.** The response explicitly signals the session cannot be started from mobile yet.
5. **willSpawnAgent=false** in response meta, for client-side guard rails.
6. **cwd is still scoped** by `isForbiddenPath` + `pathInAllowed`.
7. **agentId is allowlisted** to claude/codex/opencode/qoder; no arbitrary commands.
8. **Length caps** (title 80, initialMessage 2000, body 32 KB) prevent resource abuse.
9. **Audit only records lengths**, never raw text.
10. **No new scope granted** — B3B will be the permission gate for real execution.

### B3A verification additions

The verifier (`scripts/verify-mobile-backend-contract.js`) additionally checks:

- B1/B2A/B2B/B2C assertions continue to pass unchanged.
- `GET /api/mobile/projects` returns 200 with `items: []` or array of `MobileStartableProject` shapes.
- Each project item has: id, name, cwd, source, canCreateSession, reason, riskFlags, agentIds, sessionCount, lastActiveAt.
- Projects do not include forbidden paths.
- POST `/api/mobile/sessions/draft` without token → 401 `unauthorized`.
- Missing/empty `cwd` → `cwd_required`.
- cwd outside allowed roots → `cwd_not_allowed`.
- agentId outside allowlist → `agent_not_allowed`.
- title longer than 80 → `title_too_long`.
- initialMessage longer than 2000 → `initial_message_too_long`.
- mode present but not `"draft"` → `invalid_mode`.
- Valid request returns `ok: true` with `session.status === "draft"`, `session.canStart === false`, `meta.willSpawnAgent === false`, `meta.phase === "B3A"`.
- Response contains a `session.id` and `timeline.events` containing a `session_created` event.
- The B2C mock write provider is NOT called (no PTY writes).
- Audit contains `mobile_session.draft.created` entry; audit does NOT contain the raw initialMessage string.
- Subsequent `GET /api/mobile/sessions/:id/timeline` contains the `session_created` event.
- Timeline/audit responses do not contain secrets, tokens, pids, tokenHash.
- `GET /api/mobile/sessions` lists the newly created draft session.
- Final verifier run: PASS / FAIL: 0.

### Paseo reference

B3A does not copy Paseo source code. It extends the existing FanBox mobile architecture symmetrically with prior phases (providers, scrubbed responses, append-only audit), matching the architecture of B2C and prior phases.

