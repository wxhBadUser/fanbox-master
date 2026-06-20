// FanBox Mobile Sessions — Phase 2A-1 安全 session 汇总
// -------------------------------------------------------------
// 职责：只读读取 desktop / mobile / wechat 三类 session 来源，
//       统一格式 + 严格裁剪敏感字段，返回给 /api/mobile/sessions*。
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

// ---------- 硬限制 ----------

const SCHEMA_VERSION = 2;
const MAX_LIST_ITEMS = 100;
const MAX_LIST_PREVIEW_CHARS = 200;
const MAX_MESSAGE_TEXT_CHARS = 2000;
const MAX_MESSAGES_PER_SESSION = 50;
const MAX_OUTPUT_TAIL_BYTES = 1024;
const MAX_TITLE_CHARS = 80;
const MAX_INPUT_HASH_LEN = 80;

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
  const all = await listAllSessions();
  // sessionId 不暴露 backend UUID，所以这里只能按 makeId 重算匹配
  const target = String(id || '');
  for (const s of all) {
    if (s.sessionId === target) return scrubSessionDetail(s);
  }
  return null;
}

function scrubSessionDetail(s) {
  const sum = scrubSessionSummary(s, s.source);
  // v1 detail = summary + 简化的 messages（最多 50 条，单条 2000 字符）
  // 由于 v1 不持久化 messages 全文，这里给一个"无 messages"标记 + 提示
  // 后续 Phase 2A-2 接入 approval / send_message 后再拉真实 messages
  sum.messages = [];
  sum.messageCountHint = (s.messageCount != null) ? s.messageCount : 0;
  return sum;
}

// ---------- mobile session 写入（仅在 mobileState 同步时） ----------

async function writeMobileSessions(sessionsObj) {
  const fsp = require('fs').promises;
  await fsp.mkdir(MOBILE_DIR, { recursive: true });
  // 写入前 scrub 全部
  const clean = { schemaVersion: SCHEMA_VERSION, updatedAt: nowMs(), sessions: {} };
  for (const sid of Object.keys(sessionsObj || {})) {
    const s = sessionsObj[sid];
    if (!s || typeof s !== 'object') continue;
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

// ---------- 暴露给 mobile.js ----------

module.exports = {
  // 路径常量（测试可读）
  MOBILE_SESSIONS_FILE,
  WECHAT_CONVOS_FILE,
  DESKTOP_INDEX_FILE,
  PREFS_FILE,
  // 硬限制
  SCHEMA_VERSION,
  MAX_LIST_ITEMS,
  MAX_LIST_PREVIEW_CHARS,
  MAX_MESSAGE_TEXT_CHARS,
  MAX_MESSAGES_PER_SESSION,
  MAX_OUTPUT_TAIL_BYTES,
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
  readWechatSessions,
  readDesktopSessions,
  writeMobileSessions,
  getContext,
  setContextCwd,
  setContextSelect,
  // 兼容测试
  applyFilters
};
