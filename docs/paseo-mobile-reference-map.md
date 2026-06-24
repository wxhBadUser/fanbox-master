# Mobile-R0 Paseo Mobile Reference Map

> Scope: 本文只研究 `I:\AI_weflow\ref\paseo-main` 的 mobile/daemon/client/protocol/relay 设计，不复制 Paseo 源码，不建议在 FanBox 当前阶段实现 relay 或公网控制。

## Executive Summary

Paseo mobile 的核心不是某一套手机 UI，而是一个清晰的 daemon + clients 架构：daemon 是 agent、workspace、timeline、permission、terminal、file access 的 source of truth；mobile、desktop、web、CLI 都只是 WebSocket client。手机继续桌面任务时，手机并不是接管桌面 UI，而是连接同一个 daemon，重新拉取 agent directory、workspace、authoritative timeline，并订阅 live stream。

FanBox 可以借鉴的是这套 contract 和 lifecycle 思维：统一 app state、agent/session/workspace/timeline 模型、permission request/resolution、连接状态与设备安全面。FanBox 当前阶段不适合直接搬 Paseo app/runtime，也不适合复制 relay/E2EE 实现；Paseo 仓库声明 AGPL-3.0，FanBox 是 MIT，直接复制实现代码会带来许可证传染风险。

## Source Map

| Area | Paseo source path | What it contributes |
| --- | --- | --- |
| Product entry and package map | `README.md` | Cross-device premise, daemon/client package roles, AGPL-3.0 license |
| Security model | `SECURITY.md` | direct vs relay, E2EE relay, Host header/DNS rebinding guard, password auth |
| System architecture | `docs/architecture.md` | daemon responsibilities, WebSocket protocol, app/client/server/protocol package split |
| Timeline correctness | `docs/timeline-sync.md` | live stream vs authoritative history, cursor catch-up invariants |
| Agent lifecycle | `docs/agent-lifecycle.md` | status transitions, archive semantics, subagent/detached behavior |
| Data model | `docs/data-model.md` | `$PASEO_HOME`, agent records, workspace identity, daemon keypair |
| Mobile app shell | `packages/app` | Expo Router app, screens, HostRuntimeController, SessionContext, stores |
| Client SDK | `packages/client` | `DaemonClient`, `PaseoClient`, typed handles for workspaces/agents/timeline |
| Protocol schemas | `packages/protocol` | WebSocket messages, agent timeline events, permission models, binary frames |
| Daemon | `packages/server` | WebSocket server, session RPCs, agent manager, timeline persistence |
| Desktop daemon management | `packages/desktop`, `packages/app/src/desktop` | desktop starts/manages local daemon and exposes pairing |
| Relay reference | `packages/relay` | E2E relay channel design; research only for FanBox now |

## Mobile Pages And Entrypoints

Paseo mobile uses the same cross-platform app as desktop/web, with mobile-specific layout and navigation behavior.

| Mobile surface | Representative source path | Required daemon data |
| --- | --- | --- |
| Startup / host selection | `packages/app/src/runtime/host-runtime.ts`, `packages/app/src/components/add-host-modal.tsx`, `packages/app/src/components/pair-link-modal.tsx` | saved host profiles, connection candidates, server id, connection state, daemon server info |
| Sessions / history | `packages/app/src/screens/sessions-screen.tsx`, `packages/app/src/components/agent-list.tsx` | active and recent agents, workspace/project placement, last activity, status, archived state |
| Projects | `packages/app/src/screens/projects-screen.tsx`, `packages/app/src/components/sidebar-workspace-list.tsx` | project/workspace descriptors, host errors, workspace status, recent activity |
| Workspace | `packages/app/src/screens/workspace/workspace-screen.tsx`, `packages/app/src/screens/workspace/workspace-pane-content.tsx` | workspace descriptor, active agents, tabs, terminals, git/diff status, file explorer state |
| Agent detail | `packages/app/src/components/message.tsx`, `packages/app/src/composer`, `packages/app/src/contexts/session-context.tsx` | agent snapshot, timeline entries, stream events, pending permissions, usage/model/mode metadata |
| Permission cards | `packages/app/src/components/question-form-card.tsx` | `AgentPermissionRequest`, pending permission map, permission response RPC |
| Files | `packages/app/src/components/file-explorer-pane.tsx`, `packages/app/src/components/file-pane.tsx` | workspace root, directory listings, file preview/download tokens, workspace/file scope |
| Settings / host / pairing | `packages/app/src/screens/settings/host-page.tsx`, `packages/app/src/desktop/components/pair-device-section.tsx`, `packages/app/src/desktop/components/pair-device-modal.tsx` | daemon pairing offer, host profile, direct/relay endpoints, QR content |

## Data Ownership Model

Paseo data ownership is intentionally daemon-centered.

| Concept | Paseo model | Source evidence |
| --- | --- | --- |
| Daemon | Local server that manages agent processes and exposes WebSocket API | `docs/architecture.md`, `packages/server/src/server/bootstrap.ts` |
| Client | Mobile/desktop/web/CLI connect to daemon and do not own agent lifecycle | `docs/architecture.md`, `packages/client/src/daemon-client.ts` |
| Agent | Persistent daemon record with provider, cwd, workspaceId, labels, status, runtime info, timeline | `docs/data-model.md`, `packages/protocol/src/agent-types.ts` |
| Workspace | Opaque id, separate from filesystem path; status aggregates by `workspaceId` | `docs/data-model.md`, `docs/agent-lifecycle.md` |
| Timeline | Append-only persisted timeline rows, projected through `fetch_agent_timeline_request` | `docs/timeline-sync.md`, `packages/server/src/server/session.ts` |
| Permission | Typed request/response flow routed through daemon to clients | `packages/protocol/src/agent-types.ts`, `docs/architecture.md` |
| Connection | WebSocket with hello/status, app-level ping/pong, direct or relay transport | `docs/architecture.md`, `packages/protocol/src/messages.ts` |
| Relay identity | Persistent daemon Curve25519 keypair stored under `$PASEO_HOME` | `SECURITY.md`, `docs/data-model.md` |

## Protocol And Client Layer

The protocol package owns shared message schemas. The client package then wraps those schemas into two layers:

- `DaemonClient`: low-level WebSocket driver. It manages connection state, hello handshake, text/binary frames, app-level ping/pong, request/response correlation, and event conversion.
- `PaseoClient`: higher-level facade. It exposes `workspaces.list/open/create/archive/subscribe`, `agents.create/ref/send/archive/detach/timeline.refetch/timeline.subscribe`, provider APIs, and config APIs.

Important protocol patterns for FanBox:

- WebSocket hello includes `clientId`, `clientType`, `protocolVersion`, `appVersion`, and capabilities.
- Outbound daemon messages include `agent_update`, `agent_stream`, `workspace_update`, `agent_permission_request`, `agent_permission_resolved`, `agent_archived`, `agent_status`, and request/response RPC envelopes.
- Terminal I/O uses binary WebSocket frames; this is useful later, but FanBox should not start here.
- Message schemas are append-only. New fields are added without breaking old clients.

## Timeline Contract

Paseo treats live stream and history fetch as two separate correctness layers:

- `agent_stream` is for immediacy.
- `fetch_agent_timeline_request` is authoritative history.
- Catch-up is paged to completion; a client that resumes from a cursor must keep fetching while `hasNewer` is true.
- If no cursor exists, client fetches a latest tail page first; older history is user-driven.

This is the most important Paseo idea for FanBox. FanBox should not make mobile UI infer state from scattered endpoints or transient SSE events. It needs a stable `/timeline` read model first, then optional live append events.

## How Paseo Lets Phone Continue Desktop Tasks

The continuation flow is:

1. Desktop app starts or connects to the local daemon.
2. Desktop creates/runs an agent through daemon RPC.
3. Daemon persists agent state and timeline under `$PASEO_HOME`.
4. Phone connects to the same daemon by saved host, direct endpoint, or relay pairing.
5. Phone hydrates host runtime, agent directory, workspaces, and timeline.
6. Phone subscribes to daemon stream events and can send another user message to the same agent id.

The crucial boundary: mobile does not need desktop to be open as the UI source. Desktop and phone are peer clients.

## Permission And Approval

Paseo permission is a first-class protocol domain:

- Agent/provider emits a permission request.
- Daemon records/broadcasts `agent_permission_request`.
- Client renders a permission UI such as `QuestionFormCard`.
- User responds; client sends decision to daemon.
- Daemon resolves the provider request and broadcasts `agent_permission_resolved`.
- Agent snapshot can mark `requiresAttention` with `attentionReason: "permission"`.

FanBox should borrow this domain shape, but adapt it to its existing approval store and stricter safety posture.

## Connection, Pairing, Device, Relay

Paseo supports direct and relay connection modes:

- Direct mode can use local daemon and optional bearer password.
- Relay mode is designed for untrusted relay with end-to-end encryption.
- Pairing link/QR carries daemon public key in URL fragment.
- Daemon validates Host headers and CORS origins for DNS rebinding defense.

FanBox should not implement relay before device revoke, audit viewer, Host header guard, and a clear threat model are in place. For now, Paseo relay is a reference for future Remote-R3/R4 only.

## Designs Suitable For FanBox

- Daemon/source-of-truth principle, adapted as "FanBox mobile backend is the read model owner" first.
- Unified `app-state` and `dashboard` bootstrap models.
- Authoritative timeline read API separate from live SSE/WS.
- Agent lifecycle vocabulary: `idle`, `running`, `waiting_approval`, `error`, `closed`.
- Permission request/resolution as a domain, not ad hoc UI state.
- Workspace/project identity separated from display path where possible.
- Connection capabilities and feature flags exposed to mobile clients.
- Append-only audit and timeline semantics.

## Designs Not Suitable For FanBox Current Stage

- Copying Expo/React Native app structure.
- Replacing FanBox REST+SSE immediately with Paseo WebSocket.
- Implementing public relay before safety hardening.
- Exposing raw terminal binary stream before mobile contract is stable.
- Treating Paseo workspace id implementation as directly portable.
- Copying provider adapters, timeline reducers, or relay encryption code.

## License And Copy Risk

Paseo is AGPL-3.0 according to `README.md`; FanBox is MIT according to `package.json`. Directly copying Paseo implementation files, reducers, protocol code, relay code, UI components, or provider adapters into FanBox could impose AGPL obligations on FanBox. Low-risk borrowing is limited to ideas, architecture patterns, API shape inspiration, and independently written FanBox-specific contracts.

Recommended rule: no Paseo code reuse without explicit license review and user approval.
