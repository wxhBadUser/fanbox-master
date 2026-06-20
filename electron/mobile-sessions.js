// FanBox Mobile Sessions — Phase 2A-1 安全 session 汇总
// -------------------------------------------------------------
// 职责：只读读取 desktop / mobile / wechat 三类 session 来源，
//       统一格式 + 严格裁剪敏感字段，返回给 /api/mobile/sessions*。
//
// Phase 2A-2.1 扩展：approval request loop（只创建审批 / 不启动 agent）
//
// 硬约束（违反任意一条都视为 bug）：
//   1. 不暴露 raw stdout / pty buffer / xterm.scrollback
//   2. 不暴露 .jsonl / .cast / .log 路径
//   3. 不暴露 claudeSession / codexSession / sessionId 完整 UUID
//   4. 不暴露 token / cookie / API key / secret / password
//   5. 不暴露 account.json / persona / pendingRecap / pendingInput
//   6. 不写任何用户文件（仅追加 audit log）
//   7. 不启动任何 agent
//   8. 不发送任何任务
//   9. 不暴露 pty input / 任何 shell
//  10. messages 全文截断 2000 字符，list preview 截断 200 字符
//  11. approval input 原文绝不落盘 audit；只存 hash + len + preview
//  12. approval approve 后不启动 agent；只是打通确认链路
// -------------------------------------------------------------

'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs').promises;

// ---------- 路径（可被环境变量覆盖，方便测试隔离） ----------

const HOME = os.homedir();
const MOBILE_DIR = process.env.FANBOX_MOBILE_DIR || path.join(HOME, '.fanbox', 'mobile');
const WECHAT_DIR = process.env.FANBOX_WECHAT_DIR || path.join(HOME, '.fanbox', 'wechat');
const SESSIONS_DIR = process.env.FANBOX_SESSIONS_DIR || path.join(HOME, '.fanbox', 'sessions');

const MOBILE_SESSIONS_FILE = path.join(MOBILE_DIR, 'sessions.json');
const WECHAT_CONVOS_FILE = path.join(WECHAT_DIR, 'conversations.json');
const DESKTOP_INDEX_FILE = path.join(SESSIONS_DIR, 'index.json');

// Phase 2A-2.1：approval + audit 存储
const APPROVALS_FILE = path.join(MOBILE_DIR, 'approvals.json');
const AUDIT_FILE = path.join(MOBILE_DIR, 'audit.jsonl');

// ---------- 硬限制 ----------

const SCHEMA_VERSION = 2;
const MAX_LIST_ITEMS = 100;
const MAX_LIST_PREVIEW_CHARS = 200;
const MAX_MESSAGE_TEXT_CHARS = 2000;
const MAX_MESSAGES_PER_SESSION = 50;
const MAX_OUTPUT_TAIL_BYTES = 1024;
const MAX_TITLE_CHARS = 80;
const MAX_INPUT_HASH_LEN = 80;

// Phase 2A-2.1：approval + input 限制
const APPROVAL_TTL_MS = 60 * 1000;            // 默认 60s 过期
const MAX_APPROVALS_KEPT = 200;                // approvals.json 最多保留条数
const MAX_INPUT_CHARS = 4000;                  // 用户输入最大字符
const MAX_CONTEXT_FILES = 5;                   // contextFiles 最多 5 个
const RATE_WINDOW_MS = 10 * 60 * 1000;         // 限流窗口 10 min
const RATE_LIMIT_PER_DEVICE = 10;              // 每 device 最多 10 次 / 10 min
const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'timeout', 'cancelled'];
const ALLOWED_AGENT_IDS = new Set(['claude', 'codex', 'opencode', 'qoder']);

// 敏感字符串（命中后 redact；优先级高于截断）
const SENSITIVE_PATTERNS = [
  // Bearer / Authorization
  { re: /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/g, repl: 'Bearer [REDACTED]' },
  // sk- / sk_ / sk. + token
  { re: /\bsk-[A-Za-z0-9_\-]{12,}/g, repl: 'sk-[REDACTED]' },
  // cookie:
  { re: /\bcookie\s*[:=]\s*[^\s,;}"']{6,}/gi, repl: 'cookie=[REDACTED]' },
  // token=...（query / form）
  { re: /\btoken\s*=\s*[^\s,;}"']{6,}/gi, repl: 'token=[REDACTED]' },
  // apiKey / api_key
  { re: /\bapi[_-]?key\s*[:=]\s*[^\s,;}"']{6,}/gi, repl: 'apiKey=[REDACTED]' },
  // secret / password
  { re: /\b(secret|password)\s*[:=]\s*[^\s,;}"']{6,}/gi, repl: '$1=[REDACTED]' },
];

// agent id 白名单（拒绝 / 规范化到这一组）
const AGENT_IDS = new Set(['claude', 'codex', 'opencode', 'qoder', 'shell', 'unknown']);

function normalizeAgentId(v) {
  if (v == null) return 'unknown';
  const s = String(v).toLowerCase().trim();
  if (AGENT_IDS.has(s)) return s;
  return 'unknown';
}

function safeStr(v, max) {
  if (v == null) return '';
  let s = String(v);
  for (const p of SENSITIVE_PATTERNS) s = s.replace(p.re, p.repl);
  if (max && s.length > max) s = s.slice(0, max) + '…[truncated ' + (String(v).length - max) + ' chars]';
  return s;
}

function safeStrBytes(s, maxBytes) {
  // 字节级截断（不破坏多字节字符），总输出 ≤ maxBytes
  const ELLIPSIS = '…'; // 3 bytes in UTF-8
  const ellBytes = Buffer.byteLength(ELLIPSIS, 'utf8');
  const target = Math.max(1, maxBytes - ellBytes);
  const buf = Buffer.from(s || '', 'utf8');
  if (buf.length <= maxBytes) return buf.toString('utf8');
  return buf.slice(0, target).toString('utf8') + ELLIPSIS;
}

function relPath(p, base) {
  if (!p) return '';
  let s = String(p).replace(/\\/g, '/');
  if (base) {
    const b = String(base).replace(/\\/g, '/').replace(/\/+$/, '');
    if (s.toLowerCase().startsWith(b.toLowerCase() + '/')) s = '…/' + s.slice(b.length + 1);
  }
  const parts = s.split('/');
  if (parts.length <= 3) return s;
  return '…/' + parts.slice(-3).join('/');
}

function makeId(prefix, agentId, cwd, ts) {
  // 不暴露 backend UUID；用 hash(cwd + agentId + ts) 截短
  const crypto = require('crypto');
  const h = crypto.createHash('sha256').update(String(cwd || '') + '|' + String(agentId || '') + '|' + String(ts || Date.now())).digest('hex').slice(0, 10);
  return prefix + '-' + String(agentId || 'unknown') + '-' + h;
}

function nowMs() { return Date.now(); }

// ---------- 文件读取（带 fallback） ----------

async function readJsonSafe(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// ---------- 敏感字段黑名单（绝不返回） ----------

const FORBIDDEN_KEYS = new Set([
  'token', 'tokens', 'tokenHash', 'tokenhash', 'bearer', 'authorization',
  'cookie', 'cookies', 'sessionCookie',
  'apiKey', 'api_key', 'apikey',
  'secret', 'password', 'passwd', 'pwd',
  'claudeSession', 'claude_session', 'claudeSessionId',
  'codexSession', 'codex_session', 'codexSessionId',
  'sessionId', 'session_id', 'ptyId', 'pty_id', 'procId',
  'account', 'accountJson', 'account_json',
  'persona', 'pendingRecap', 'pendingInput', 'pendingSystemPrompt',
  'context_token', 'contextToken', 'ctxToken',
  'raw', 'rawStdout', 'ptyBuffer', 'xtermBuffer', 'scrollback',
  'jsonl', 'castPath', 'logPath', 'logFile', 'log_path',
  'env', 'processEnv', 'shellEnv',
  'privateKey', 'private_key', 'sshKey', 'ssh_key',
  'inbox', 'outbox',                  // 微信原始内容
  'mediaKey', 'media_key', 'm.item',
  'cursor', 'buf'                     // 微信 raw 轮询
]);

function scrubObject(obj) {
  // 递归移除敏感键，保留其余。返回新对象。
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(scrubObject);
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    out[k] = scrubObject(obj[k]);
  }
  return out;
}

// ---------- wechat source ----------

async function readWechatSessions() {
  const obj = await readJsonSafe(WECHAT_CONVOS_FILE, {});
  const sessions = [];
  for (const cid of Object.keys(obj || {})) {
    const c = obj[cid];
    if (!c || typeof c !== 'object') continue;
    // agentId: 微信 conversations 不存 agentId；只能推断
    let agentId = 'unknown';
    if (c.claudeSession) agentId = 'claude';
    else if (c.codexSession) agentId = 'codex';
    // 但 claudeSession/codexSession 是禁止字段，不能读
    // 退而求其次：仅根据 messages 里是否提到 'claude'/'codex' 推断（弱）
    if (agentId === 'unknown' && Array.isArray(c.messages)) {
      for (const m of c.messages) {
        if (typeof m.text === 'string') {
          if (m.text.toLowerCase().indexOf('claude') >= 0) { agentId = 'claude'; break; }
          if (m.text.toLowerCase().indexOf('codex') >= 0) { agentId = 'codex'; break; }
        }
      }
    }
    const msgs = Array.isArray(c.messages) ? c.messages : [];
    const last = msgs[msgs.length - 1];
    const lastText = (last && typeof last.text === 'string') ? safeStr(last.text, MAX_LIST_PREVIEW_CHARS) : '';
    const title = (c.label && typeof c.label === 'string') ? safeStr(c.label, MAX_TITLE_CHARS) : (cid === 'desktop' ? '桌面直连会话' : ('微信会话 ' + cid));
    const updatedAt = (typeof c.updatedAt === 'number' && c.updatedAt > 0) ? c.updatedAt : nowMs();
    const lastActiveAt = (typeof c.lastActiveAt === 'number' && c.lastActiveAt > 0) ? c.lastActiveAt : updatedAt;
    sessions.push({
      sessionId: makeId('wechat', agentId, cid, updatedAt),
      source: 'wechat',
      agentId,
      kind: 'agent',
      cwd: '',                 // wechat conversations 顶层不存 cwd（全局在 bridge.cwd）
      cwdLabel: 'wechat',
      title,
      status: 'unknown',
      createdAt: updatedAt,
      updatedAt,
      lastActiveAt,
      unread: false,
      canContinue: false,
      messageCount: msgs.length,
      tokenEstimate: 0,
      approvalState: 'none',
      summary: {
        lastMessagePreview: lastText,
        outputTail: '',
        lastRole: (last && (last.role === 'user' || last.role === 'agent' || last.role === 'system')) ? last.role : 'agent'
      },
      context: { files: [], skills: [] }
    });
  }
  return sessions;
}

// ---------- mobile source ----------

async function readMobileSessionsObj() {
  // 返回原始 sessions 对象 { [internalId]: sessionObj }
  // 与 readMobileSessions() 不同：本函数返回对象（不 scrub），供内部写入使用
  const obj = await readJsonSafe(MOBILE_SESSIONS_FILE, null);
  if (!obj) return { schemaVersion: SCHEMA_VERSION, updatedAt: 0, sessions: {} };
  if (!obj.sessions || typeof obj.sessions !== 'object') obj.sessions = {};
  return obj;
}

async function readMobileSessions() {
  const obj = await readJsonSafe(MOBILE_SESSIONS_FILE, null);
  if (!obj) return [];
  const sessions = obj.sessions && typeof obj.sessions === 'object' ? obj.sessions : obj;
  const out = [];
  for (const sid of Object.keys(sessions)) {
    const s = sessions[sid];
    if (!s || typeof s !== 'object') continue;
    // 仅保留安全字段
    out.push(scrubSessionSummary(s, 'mobile'));
  }
  return out;
}

// ---------- desktop source ----------

async function readDesktopSessions() {
  const obj = await readJsonSafe(DESKTOP_INDEX_FILE, null);
  if (!obj) return [];
  const sessions = obj.sessions && typeof obj.sessions === 'object' ? obj.sessions : obj;
  const out = [];
  for (const sid of Object.keys(sessions)) {
    const s = sessions[sid];
    if (!s || typeof s !== 'object') continue;
    out.push(scrubSessionSummary(s, 'desktop'));
  }
  return out;
}

// ---------- 统一摘要 ----------

function scrubSessionSummary(s, fallbackSource) {
  const agentId = normalizeAgentId(s.agentId);
  const cwd = (typeof s.cwd === 'string') ? s.cwd : '';
  const cwdLabel = (typeof s.cwdLabel === 'string') ? s.cwdLabel : relPath(cwd);
  const title = safeStr(s.title, MAX_TITLE_CHARS);
  const source = (s.source === 'desktop' || s.source === 'mobile' || s.source === 'wechat') ? s.source : fallbackSource;
  const kind = (s.kind === 'agent' || s.kind === 'shell' || s.kind === 'recording') ? s.kind : 'agent';
  const status = (s.status && typeof s.status === 'string') ? s.status : 'unknown';
  const createdAt = (typeof s.createdAt === 'number' && s.createdAt > 0) ? s.createdAt : nowMs();
  const updatedAt = (typeof s.updatedAt === 'number' && s.updatedAt > 0) ? s.updatedAt : createdAt;
  const lastActiveAt = (typeof s.lastActiveAt === 'number' && s.lastActiveAt > 0) ? s.lastActiveAt : updatedAt;
  const messageCount = (typeof s.messageCount === 'number') ? Math.max(0, Math.floor(s.messageCount)) : 0;
  const tokenEstimate = (typeof s.tokenEstimate === 'number') ? Math.max(0, Math.floor(s.tokenEstimate)) : 0;
  const unread = !!s.unread;
  const canContinue = !!s.canContinue;
  const approvalState = (s.approvalState && typeof s.approvalState === 'string') ? s.approvalState : 'none';

  // summary
  const sum = (s.summary && typeof s.summary === 'object') ? s.summary : {};
  const lastMessagePreview = safeStr(sum.lastMessagePreview, MAX_LIST_PREVIEW_CHARS);
  const outputTail = safeStrBytes(sum.outputTail, MAX_OUTPUT_TAIL_BYTES);
  const lastRole = (sum.lastRole === 'user' || sum.lastRole === 'agent' || sum.lastRole === 'system') ? sum.lastRole : 'agent';

  // context
  const ctx = (s.context && typeof s.context === 'object') ? s.context : {};
  const files = Array.isArray(ctx.files) ? ctx.files.slice(0, 5).map(p => (typeof p === 'string' ? p : '')).filter(Boolean) : [];
  const skills = Array.isArray(ctx.skills) ? ctx.skills.slice(0, 5).map(p => (typeof p === 'string' ? p : '')).filter(Boolean) : [];

  // sessionId 强制重写为安全格式
  const sessionId = makeId(source, agentId, cwd, createdAt);

  return {
    sessionId,
    source,
    agentId,
    kind,
    cwd,
    cwdLabel,
    title,
    status,
    createdAt,
    updatedAt,
    lastActiveAt,
    unread,
    canContinue,
    messageCount,
    tokenEstimate,
    approvalState,
    summary: { lastMessagePreview, outputTail, lastRole },
    context: { files, skills }
  };
}

// ---------- 合并 / 过滤 / 排序 ----------

async function listAllSessions() {
  const [wechat, mobile, desktop] = await Promise.all([
    readWechatSessions().catch(() => []),
    readMobileSessions().catch(() => []),
    readDesktopSessions().catch(() => [])
  ]);
  return [...wechat, ...mobile, ...desktop];
}

function applyFilters(list, opts) {
  let arr = list.slice();
  if (opts.cwd) {
    const c = String(opts.cwd).replace(/\\/g, '/').toLowerCase();
    arr = arr.filter(s => (s.cwd || '').replace(/\\/g, '/').toLowerCase() === c);
  }
  if (opts.agentId) {
    const a = normalizeAgentId(opts.agentId);
    arr = arr.filter(s => s.agentId === a);
  }
  if (opts.source) {
    const src = String(opts.source);
    if (['desktop', 'mobile', 'wechat'].indexOf(src) >= 0) {
      arr = arr.filter(s => s.source === src);
    }
  }
  if (opts.q) {
    const q = String(opts.q).toLowerCase().trim();
    if (q) {
      arr = arr.filter(s =>
        (s.title || '').toLowerCase().indexOf(q) >= 0 ||
        (s.summary.lastMessagePreview || '').toLowerCase().indexOf(q) >= 0 ||
        (s.cwdLabel || '').toLowerCase().indexOf(q) >= 0
      );
    }
  }
  arr.sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
  return arr;
}

// ---------- 公共 API ----------

async function listSessions(opts) {
  const all = await listAllSessions();
  const filtered = applyFilters(all, opts || {});
  return {
    ok: true,
    items: filtered.slice(0, Math.min(MAX_LIST_ITEMS, Math.max(1, Number(opts.limit) || 50))),
    total: filtered.length,
    truncated: filtered.length > (Number(opts.limit) || 50)
  };
}

async function getSessionById(id) {
  const target = String(id || '');
  // 1) 先在 mobile sessions 中按 sessionId 找（保留 messages）
  const mobileRaw = await readMobileSessionsObj();
  for (const k of Object.keys(mobileRaw.sessions || {})) {
    const s = mobileRaw.sessions[k];
    if (s && (s.sessionId === target || k === target)) {
      // Phase 2A-2.1：把 messages 从单独 store 注入
      const store = await readMobileMessagesStore();
      s.messages = Array.isArray(store.messages[target]) ? store.messages[target] : [];
      return scrubSessionDetail(s);
    }
  }
  // 2) 再去 wechat / desktop 列表里找
  const all = await listAllSessions();
  for (const s of all) {
    if (s.sessionId === target) return scrubSessionDetail(s);
  }
  return null;
}

function scrubSessionDetail(s) {
  // Phase 2A-2.1：暴露 messages（已 scrubbed），最多 50 条，每条 2000 字符
  // 必须先从原始 s 读取 messages，再 scrub summary
  const rawMessages = Array.isArray(s.messages) ? s.messages : [];
  const last = rawMessages.slice(-MAX_MESSAGES_PER_SESSION);
  const safeMessages = last.map(function (m) {
    return {
      role: (m && (m.role === 'user' || m.role === 'agent' || m.role === 'system')) ? m.role : 'system',
      text: safeStr((m && m.text) || '', MAX_MESSAGE_TEXT_CHARS),
      status: (m && typeof m.status === 'string') ? m.status : 'sent',
      ts: (m && typeof m.ts === 'number') ? m.ts : 0,
      approvalId: (m && typeof m.approvalId === 'string') ? m.approvalId : ''
    };
  });
  const sum = scrubSessionSummary(s, s.source);
  sum.messages = safeMessages;
  sum.messageCountHint = (s.messageCount != null) ? s.messageCount : safeMessages.length;
  return sum;
}

// ---------- mobile session 写入（仅在 mobileState 同步时） ----------

// Phase 2A-2.1：messages 单独存盘（避免被 writeMobileSessions 的 scrub 抹掉）
const MOBILE_MESSAGES_FILE = path.join(MOBILE_DIR, 'session-messages.json');

async function readMobileMessagesStore() {
  try {
    const txt = await fs.readFile(MOBILE_MESSAGES_FILE, 'utf8');
    const j = JSON.parse(txt);
    if (!j || typeof j !== 'object') return { messages: {} };
    if (!j.messages || typeof j.messages !== 'object') j.messages = {};
    return j;
  } catch (e) {
    return { messages: {} };
  }
}

async function writeMobileMessagesStore(obj) {
  await fs.mkdir(MOBILE_DIR, { recursive: true });
  await fs.writeFile(MOBILE_MESSAGES_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

async function writeMobileSessions(sessionsObj) {
  const fsp = require('fs').promises;
  await fsp.mkdir(MOBILE_DIR, { recursive: true });
  // 写入前 scrub 全部
  // sessionsObj 可以是 { [sessionId]: sessionObj } 或 { schemaVersion, updatedAt, sessions: { [sessionId]: sessionObj } }
  const inner = (sessionsObj && sessionsObj.sessions && typeof sessionsObj.sessions === 'object') ? sessionsObj.sessions : sessionsObj;
  const clean = { schemaVersion: SCHEMA_VERSION, updatedAt: nowMs(), sessions: {} };
  for (const sid of Object.keys(inner || {})) {
    const s = inner[sid];
    if (!s || typeof s !== 'object') continue;
    // 只接受 session 对象（必须包含 sessionId/agentId/cwd 至少一个）
    if (!s.sessionId && !s.agentId && !s.cwd) continue;
    const scrub = scrubSessionSummary(s, 'mobile');
    clean.sessions[scrub.sessionId] = scrub;
  }
  await fsp.writeFile(MOBILE_SESSIONS_FILE, JSON.stringify(clean, null, 2), 'utf8');
  return { ok: true, count: Object.keys(clean.sessions).length };
}

// ---------- mobile 偏好（lastAgentMap / lastSessionMap） ----------

const PREFS_FILE = path.join(MOBILE_DIR, 'prefs.json');

async function readPrefs() {
  return await readJsonSafe(PREFS_FILE, { schemaVersion: 1, lastAgentMap: {}, lastSessionMap: {}, current: null });
}

async function writePrefs(p) {
  const fsp = require('fs').promises;
  await fsp.mkdir(MOBILE_DIR, { recursive: true });
  const clean = scrubObject(p);
  clean.schemaVersion = 1;
  clean.updatedAt = nowMs();
  await fsp.writeFile(PREFS_FILE, JSON.stringify(clean, null, 2), 'utf8');
  return { ok: true };
}

async function getContext() {
  const p = await readPrefs();
  const cur = (p.current && typeof p.current === 'object') ? p.current : {};
  return {
    ok: true,
    cwd: typeof cur.cwd === 'string' ? cur.cwd : '',
    agentId: normalizeAgentId(cur.agentId),
    sessionId: typeof cur.sessionId === 'string' ? cur.sessionId : ''
  };
}

async function setContextCwd(cwd) {
  if (!cwd || typeof cwd !== 'string') return { ok: false, error: 'missing_cwd' };
  if (cwd.length > 4096) return { ok: false, error: 'cwd_too_long' };
  // 不在这里做 allowed-roots 校验（mobile.js 在调进来前已经验证过）
  const p = await readPrefs();
  const cur = (p.current && typeof p.current === 'object') ? p.current : {};
  cur.cwd = cwd;
  // cwd 改变 → 清掉 agentId / sessionId 偏好（避免串 session）
  cur.agentId = '';
  cur.sessionId = '';
  p.current = cur;
  p.lastAgentMap = (p.lastAgentMap && typeof p.lastAgentMap === 'object') ? p.lastAgentMap : {};
  p.lastSessionMap = (p.lastSessionMap && typeof p.lastSessionMap === 'object') ? p.lastSessionMap : {};
  await writePrefs(p);
  return { ok: true, cwd };
}

async function setContextSelect(opts) {
  if (!opts || typeof opts !== 'object') return { ok: false, error: 'missing_body' };
  const cwd = (typeof opts.cwd === 'string') ? opts.cwd : '';
  const agentId = normalizeAgentId(opts.agentId);
  const sessionId = (typeof opts.sessionId === 'string') ? opts.sessionId : '';
  if (!cwd) return { ok: false, error: 'missing_cwd' };
  if (!agentId || agentId === 'unknown') return { ok: false, error: 'invalid_agent' };
  if (cwd.length > 4096) return { ok: false, error: 'cwd_too_long' };
  const p = await readPrefs();
  p.current = { cwd, agentId, sessionId };
  p.lastAgentMap = (p.lastAgentMap && typeof p.lastAgentMap === 'object') ? p.lastAgentMap : {};
  p.lastSessionMap = (p.lastSessionMap && typeof p.lastSessionMap === 'object') ? p.lastSessionMap : {};
  p.lastAgentMap[cwd] = agentId;
  if (sessionId) p.lastSessionMap[cwd + '|' + agentId] = sessionId;
  await writePrefs(p);
  return { ok: true, cwd, agentId, sessionId };
}

// =====================================================================
// Phase 2A-2.1：Approval Request Loop
//   - createApproval / getApprovalById / listApprovals / listPendingApprovals
//   - decideApproval / cancelApproval / expireApprovals
//   - createMobileDraftSession / appendMessageToMobileSession / setSessionStatus / getSessionMessages
//   - appendAudit
// 硬约束：
//   1. 不启动 agent
//   2. 不执行 shell
//   3. 不调用 pty
//   4. 不发送任务
//   5. 不暴露 input 原文（仅 preview 80 字 + hash + len）
//   6. audit 不写 input / output / token / cookie / apiKey
//   7. append-only 写 audit（不删不改）
// =====================================================================

function _safeKey(s) {
  return String(s || '').replace(/[^A-Za-z0-9._\-+:]/g, '').slice(0, 128);
}

function _auditObjectForLog(o) {
  // 深度过滤 audit 字段；任何不在白名单的字段都会被丢弃
  const allow = new Set(['ts', 'action', 'approvalId', 'sessionId', 'deviceId', 'deviceName',
    'agentId', 'cwd', 'cwdLabel', 'inputHash', 'inputLen', 'inputPreview',
    'decision', 'actor', 'reason', 'error']);
  const out = {};
  for (const k of Object.keys(o || {})) {
    if (allow.has(k)) out[k] = o[k];
  }
  return out;
}

async function appendAudit(entry) {
  // append-only；写失败仅 warn，不抛
  try {
    const clean = _auditObjectForLog(entry);
    clean.ts = clean.ts || Date.now();
    const line = JSON.stringify(clean) + '\n';
    await fs.appendFile(AUDIT_FILE, line, 'utf8');
    return { ok: true };
  } catch (e) {
    try { console.warn('[mobile-sessions] appendAudit failed:', e && e.message || e); } catch (_) {}
    return { ok: false, error: 'audit_failed' };
  }
}

async function readApprovals() {
  try {
    const txt = await fs.readFile(APPROVALS_FILE, 'utf8');
    const j = JSON.parse(txt);
    if (!j || typeof j !== 'object') return { schemaVersion: 1, updatedAt: 0, approvals: {} };
    if (!j.approvals || typeof j.approvals !== 'object') j.approvals = {};
    return j;
  } catch (e) {
    return { schemaVersion: 1, updatedAt: 0, approvals: {} };
  }
}

async function writeApprovals(obj) {
  obj.schemaVersion = 1;
  obj.updatedAt = Date.now();
  await fs.mkdir(path.dirname(APPROVALS_FILE), { recursive: true });
  await fs.writeFile(APPROVALS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

async function _trimApprovals(obj) {
  // 保留最近 MAX_APPROVALS_KEPT 条
  const arr = Object.values(obj.approvals);
  if (arr.length <= MAX_APPROVALS_KEPT) return;
  arr.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  const drop = arr.length - MAX_APPROVALS_KEPT;
  const dropIds = new Set(arr.slice(0, drop).map(x => x.approvalId));
  for (const id of dropIds) delete obj.approvals[id];
}

function _normalizeCwdLabel(cwd) {
  if (!cwd || typeof cwd !== 'string') return '';
  // 取最后一段（basename）作为显示
  const parts = cwd.split(/[\\\/]+/).filter(Boolean);
  return safeStr(parts.length ? parts[parts.length - 1] : cwd, 80);
}

function _hashInput(text) {
  // 极简 FNV-1a 64 模拟 sha256 摘要（避免引入 crypto；输入仅用于审计 fingerprint）
  // 输出形如 'fnv64:0123456789abcdef'
  const s = String(text || '');
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return 'fnv64:' + h.toString(16).padStart(16, '0');
}

function _previewInput(text) {
  return safeStr(String(text || '').trim().slice(0, 80), 80);
}

function _isContextFilesShape(arr) {
  if (!Array.isArray(arr)) return false;
  if (arr.length > MAX_CONTEXT_FILES) return false;
  for (const x of arr) {
    if (typeof x !== 'string') return false;
    if (x.length > 1024) return false;
  }
  return true;
}

function _scrubApprovalSummary(a) {
  // 返回给前端的 approval summary：不能包含 input 原文、token、cookie、apiKey 等
  if (!a) return null;
  return {
    approvalId: a.approvalId,
    sessionId: a.sessionId,
    deviceId: a.deviceId,
    deviceName: safeStr(a.deviceName || '', 80),
    agentId: a.agentId,
    cwd: a.cwd,
    cwdLabel: a.cwdLabel,
    inputPreview: a.inputPreview,
    inputHash: a.inputHash,
    inputLen: a.inputLen,
    contextFiles: Array.isArray(a.contextFiles) ? a.contextFiles.map(safeStr).filter(Boolean).slice(0, MAX_CONTEXT_FILES) : [],
    status: a.status,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    expiresAt: a.expiresAt,
    decidedAt: a.decidedAt || 0,
    decision: a.decision || ''
  };
}

async function expireApprovals() {
  const obj = await readApprovals();
  const now = Date.now();
  let changed = false;
  for (const id of Object.keys(obj.approvals)) {
    const a = obj.approvals[id];
    if (a.status === 'pending' && a.expiresAt && now > a.expiresAt) {
      a.status = 'timeout';
      a.decidedAt = now;
      a.updatedAt = now;
      a.decision = '';
      changed = true;
      await appendAudit({ action: 'approval_timeout', approvalId: id, sessionId: a.sessionId, agentId: a.agentId });
    }
  }
  if (changed) await writeApprovals(obj);
  return obj;
}

// ---------- Mobile Session shell (draft) ----------

async function createMobileDraftSession(opts) {
  opts = opts || {};
  const cwd = String(opts.cwd || '');
  const agentId = normalizeAgentId(opts.agentId);
  const deviceId = _safeKey(opts.deviceId || 'unknown');
  if (!cwd) {
    return { ok: false, error: 'missing_cwd' };
  }
  if (!ALLOWED_AGENT_IDS.has(agentId)) {
    return { ok: false, error: 'invalid_agent' };
  }
  // 写入 mobile/sessions.json
  const data = await readMobileSessionsObj();
  const internalId = 'mobile-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 0xfff).toString(16);
  const now = Date.now();
  // sessionId 必须与 scrubSessionSummary 内部 makeId('mobile', agentId, cwd, createdAt) 形式一致
  const sessionId = makeId('mobile', agentId, cwd, now);
  const obj = {
    sessionId: sessionId,
    internalId: internalId,
    agentId: agentId,
    kind: 'agent',
    cwd: cwd,
    cwdLabel: _normalizeCwdLabel(cwd),
    title: safeStr('Agent ' + agentId, MAX_TITLE_CHARS),
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    messageCount: 0,
    tokenEstimate: 0,
    summary: { lastMessagePreview: '', outputTail: '', lastRole: 'system' },
    context: { files: [], skills: [] },
    messages: [],
    _deviceId: deviceId
  };
  data.sessions[internalId] = obj;
  await writeMobileSessions(data);
  await appendAudit({ action: 'mobile_draft_created', sessionId, deviceId, agentId, cwd });
  return { ok: true, sessionId, internalId };
}

async function appendMessageToMobileSession(sessionId, msg) {
  // 找到 internal key
  const data = await readMobileSessionsObj();
  const entries = Object.entries(data.sessions);
  const entry = entries.find(([k, v]) => v && v.sessionId === sessionId)
              || entries.find(([k, v]) => k === sessionId);
  if (!entry) return { ok: false, error: 'not_found' };
  const [internalId, s] = entry;
  if (!Array.isArray(s.messages)) s.messages = [];
  s.messages.push(msg);
  if (s.messages.length > MAX_MESSAGES_PER_SESSION) {
    s.messages = s.messages.slice(s.messages.length - MAX_MESSAGES_PER_SESSION);
  }
  s.messageCount = (s.messageCount || 0) + 1;
  s.updatedAt = Date.now();
  s.lastActiveAt = s.updatedAt;
  if (msg && msg.text) {
    s.summary = s.summary || {};
    s.summary.lastMessagePreview = safeStr(String(msg.text).slice(0, MAX_LIST_PREVIEW_CHARS), MAX_LIST_PREVIEW_CHARS);
    s.summary.lastRole = msg.role || 'user';
  }
  // Phase 2A-2.1：把 messages 单独存盘（避免被 writeMobileSessions 的 scrub 抹掉）
  const store = await readMobileMessagesStore();
  store.messages[sessionId] = s.messages.slice(-MAX_MESSAGES_PER_SESSION).map(function (m) {
    return {
      role: m.role || 'system',
      text: String(m.text || ''),
      status: m.status || 'sent',
      ts: typeof m.ts === 'number' ? m.ts : 0,
      approvalId: m.approvalId || ''
    };
  });
  await writeMobileMessagesStore(store);
  await writeMobileSessions(data);
  return { ok: true, internalId };
}

async function setSessionStatus(sessionId, status, extra) {
  const data = await readMobileSessionsObj();
  const entries = Object.entries(data.sessions);
  const entry = entries.find(([k, v]) => v && v.sessionId === sessionId)
              || entries.find(([k, v]) => k === sessionId);
  if (!entry) return { ok: false, error: 'not_found' };
  const [internalId, s] = entry;
  s.status = status;
  s.updatedAt = Date.now();
  s.lastActiveAt = s.updatedAt;
  if (extra && typeof extra === 'object') {
    for (const k of Object.keys(extra)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      s[k] = extra[k];
    }
  }
  await writeMobileSessions(data);
  return { ok: true, internalId };
}

async function getSessionMessages(sessionId, limit) {
  const data = await readMobileSessionsObj();
  const entries = Object.entries(data.sessions);
  const entry = entries.find(([k, v]) => v && v.sessionId === sessionId)
              || entries.find(([k, v]) => k === sessionId);
  if (!entry) return null;
  const [, s] = entry;
  const max = Math.max(1, Math.min(MAX_MESSAGES_PER_SESSION, limit || MAX_MESSAGES_PER_SESSION));
  // Phase 2A-2.1：从单独 store 读 messages（避免被 writeMobileSessions 的 scrub 抹掉）
  const store = await readMobileMessagesStore();
  const rawMsgs = Array.isArray(store.messages[sessionId]) ? store.messages[sessionId] : [];
  const msgs = rawMsgs.slice(-max).map(function (m) {
    return {
      role: m.role || 'system',
      text: safeStr(m.text || '', MAX_MESSAGE_TEXT_CHARS),
      status: m.status || 'sent',
      ts: m.ts || 0,
      approvalId: m.approvalId || ''
    };
  });
  return { status: s.status, messages: msgs };
}

// ---------- Approval CRUD ----------

async function createApproval(opts) {
  opts = opts || {};
  const sessionId = _safeKey(opts.sessionId);
  const deviceId = _safeKey(opts.deviceId || 'unknown');
  const deviceName = safeStr(opts.deviceName || 'Mobile Device', 80);
  const agentId = normalizeAgentId(opts.agentId);
  const cwd = String(opts.cwd || '');
  const text = String(opts.text || '');
  const contextFiles = Array.isArray(opts.contextFiles) ? opts.contextFiles : [];

  // ---- 1) 校验 ----
  if (!sessionId) return { ok: false, status: 400, error: 'missing_sessionId' };
  if (!ALLOWED_AGENT_IDS.has(agentId)) return { ok: false, status: 400, error: 'invalid_agent' };
  if (!cwd) return { ok: false, status: 400, error: 'missing_cwd' };
  if (typeof text !== 'string') return { ok: false, status: 400, error: 'invalid_text' };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, status: 400, error: 'empty_text' };
  if (trimmed.length > MAX_INPUT_CHARS) return { ok: false, status: 400, error: 'text_too_long' };
  if (!_isContextFilesShape(contextFiles)) return { ok: false, status: 400, error: 'invalid_contextFiles' };

  // ---- 2) 限流 ----
  const obj = await readApprovals();
  await expireApprovals();
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  let recentByDevice = 0;
  for (const a of Object.values(obj.approvals)) {
    if (a.deviceId === deviceId && (a.createdAt || 0) >= windowStart) recentByDevice++;
  }
  if (recentByDevice >= RATE_LIMIT_PER_DEVICE) {
    return { ok: false, status: 429, error: 'rate_limited' };
  }

  // ---- 3) 同一 session 同时只能 1 个 pending ----
  for (const a of Object.values(obj.approvals)) {
    if (a.sessionId === sessionId && a.status === 'pending') {
      return { ok: false, status: 409, error: 'session_already_pending', approvalId: a.approvalId };
    }
  }

  // ---- 4) 创建 ----
  const approvalId = 'apr_' + Date.now().toString(36) + Math.floor(Math.random() * 0xfffff).toString(16);
  const inputHash = _hashInput(trimmed);
  const inputLen = trimmed.length;
  const inputPreview = _previewInput(trimmed);
  const expiresAt = now + APPROVAL_TTL_MS;
  const approval = {
    approvalId: approvalId,
    sessionId: sessionId,
    deviceId: deviceId,
    deviceName: deviceName,
    agentId: agentId,
    cwd: cwd,
    cwdLabel: _normalizeCwdLabel(cwd),
    inputPreview: inputPreview,
    inputHash: inputHash,
    inputLen: inputLen,
    contextFiles: contextFiles.map(function (x) { return safeStr(String(x), 1024); }),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    expiresAt: expiresAt,
    decidedAt: 0,
    decision: ''
  };
  obj.approvals[approvalId] = approval;
  await _trimApprovals(obj);
  await writeApprovals(obj);

  // ---- 5) 更新 mobile session 状态 + 追加 user message ----
  await setSessionStatus(sessionId, 'waiting_approval', { pendingApprovalId: approvalId });
  await appendMessageToMobileSession(sessionId, {
    role: 'user',
    text: trimmed,
    status: 'pending_approval',
    ts: now,
    approvalId: approvalId
  });

  await appendAudit({
    action: 'approval_created',
    approvalId: approvalId,
    sessionId: sessionId,
    deviceId: deviceId,
    agentId: agentId,
    cwd: cwd,
    inputHash: inputHash,
    inputLen: inputLen
  });

  return {
    ok: true,
    approvalId: approvalId,
    sessionId: sessionId,
    status: 'waiting_approval',
    expiresAt: expiresAt
  };
}

async function getApprovalById(id) {
  const aid = _safeKey(id);
  if (!aid) return null;
  const obj = await expireApprovals();
  const a = obj.approvals[aid];
  if (!a) return null;
  return _scrubApprovalSummary(a);
}

async function listApprovals(opts) {
  opts = opts || {};
  const obj = await expireApprovals();
  let arr = Object.values(obj.approvals).map(_scrubApprovalSummary).filter(Boolean);
  if (opts.sessionId) {
    const sid = _safeKey(opts.sessionId);
    arr = arr.filter(function (x) { return x.sessionId === sid; });
  }
  if (opts.deviceId) {
    const did = _safeKey(opts.deviceId);
    arr = arr.filter(function (x) { return x.deviceId === did; });
  }
  if (opts.status) {
    const s = String(opts.status);
    arr = arr.filter(function (x) { return x.status === s; });
  }
  arr.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  if (opts.limit) arr = arr.slice(0, Math.min(arr.length, Math.max(1, +opts.limit || 50)));
  return arr;
}

async function listPendingApprovals(opts) {
  return await listApprovals(Object.assign({}, opts || {}, { status: 'pending' }));
}

async function decideApproval(id, decision, actor) {
  const aid = _safeKey(id);
  if (!aid) return { ok: false, status: 400, error: 'missing_id' };
  if (decision !== 'approved' && decision !== 'rejected') {
    return { ok: false, status: 400, error: 'invalid_decision' };
  }
  const obj = await expireApprovals();
  const a = obj.approvals[aid];
  if (!a) return { ok: false, status: 404, error: 'not_found' };
  if (a.status !== 'pending') {
    // 已决定（approved / rejected / timeout / cancelled）
    return { ok: true, approvalId: aid, status: a.status, decision: a.decision, note: 'already_decided' };
  }
  const now = Date.now();
  a.status = decision;
  a.decision = decision;
  a.decidedAt = now;
  a.updatedAt = now;
  await writeApprovals(obj);

  // ---- 关键：approve 后不启动 agent；只更新 session 状态 + 追加 agent placeholder message ----
  const sessionStatus = decision === 'approved' ? 'approved' : 'rejected';
  const placeholderText = decision === 'approved'
    ? 'Approved by desktop. Agent execution is not enabled in Phase 2A-2.1.'
    : 'Rejected by desktop.';
  await setSessionStatus(a.sessionId, sessionStatus, { lastDecision: decision });
  await appendMessageToMobileSession(a.sessionId, {
    role: 'agent',
    text: placeholderText,
    status: sessionStatus,
    ts: now,
    approvalId: aid
  });

  await appendAudit({
    action: 'approval_decided',
    approvalId: aid,
    sessionId: a.sessionId,
    decision: decision,
    actor: safeStr(actor || 'desktop', 80)
  });

  return {
    ok: true,
    approvalId: aid,
    status: decision,
    note: decision === 'approved' ? 'Agent execution is not enabled in Phase 2A-2.1.' : ''
  };
}

async function cancelApproval(id, reason) {
  const aid = _safeKey(id);
  if (!aid) return { ok: false, status: 400, error: 'missing_id' };
  const obj = await readApprovals();
  const a = obj.approvals[aid];
  if (!a) return { ok: false, status: 404, error: 'not_found' };
  if (a.status !== 'pending') {
    return { ok: true, approvalId: aid, status: a.status, note: 'already_decided' };
  }
  a.status = 'cancelled';
  a.decidedAt = Date.now();
  a.updatedAt = a.decidedAt;
  a.decision = '';
  a.cancelReason = safeStr(reason || '', 80);
  await writeApprovals(obj);
  await setSessionStatus(a.sessionId, 'idle');
  await appendAudit({ action: 'approval_cancelled', approvalId: aid, sessionId: a.sessionId, reason: a.cancelReason });
  return { ok: true, approvalId: aid, status: 'cancelled' };
}

// ---------- 暴露给 mobile.js ----------

module.exports = {
  // 路径常量（测试可读）
  MOBILE_SESSIONS_FILE,
  WECHAT_CONVOS_FILE,
  DESKTOP_INDEX_FILE,
  PREFS_FILE,
  APPROVALS_FILE,
  AUDIT_FILE,
  // 硬限制
  SCHEMA_VERSION,
  MAX_LIST_ITEMS,
  MAX_LIST_PREVIEW_CHARS,
  MAX_MESSAGE_TEXT_CHARS,
  MAX_MESSAGES_PER_SESSION,
  MAX_OUTPUT_TAIL_BYTES,
  APPROVAL_TTL_MS,
  MAX_APPROVALS_KEPT,
  MAX_INPUT_CHARS,
  MAX_CONTEXT_FILES,
  RATE_WINDOW_MS,
  RATE_LIMIT_PER_DEVICE,
  APPROVAL_STATUSES,
  ALLOWED_AGENT_IDS,
  // 工具
  normalizeAgentId,
  safeStr,
  safeStrBytes,
  relPath,
  makeId,
  scrubObject,
  scrubSessionSummary,
  scrubSessionDetail,
  // API
  listSessions,
  getSessionById,
  readMobileSessions,
  readMobileSessionsObj,
  readWechatSessions,
  readDesktopSessions,
  writeMobileSessions,
  getContext,
  setContextCwd,
  setContextSelect,
  // Phase 2A-2.1
  createMobileDraftSession,
  appendMessageToMobileSession,
  setSessionStatus,
  getSessionMessages,
  createApproval,
  getApprovalById,
  listApprovals,
  listPendingApprovals,
  decideApproval,
  cancelApproval,
  expireApprovals,
  readApprovals,
  appendAudit,
  // 兼容测试
  applyFilters
};
