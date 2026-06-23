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
