// FanBox Mobile Sessions — Phase 2A-1 安全 session 汇总
// -------------------------------------------------------------
// 职责：只读读取 desktop / mobile / wechat 三类 session 来源，
//       统一格式 + 严格裁剪敏感字段，返回给 /api/mobile/sessions*。
//
// Phase 2A-2.1 扩展：approval request loop（只创建审批 / 不启动 agent）
// Phase 2A-2.2 扩展：普通非红线消息走 runMobileAgent（claude/codex 真实 / opencode/qoder stub）
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
const fsSync = require('fs');

// ---------- Phase 2A-2.2：claude/codex 真实 runner（安全适配） ----------
const mobileRunner = require('./mobile-agent-runner');

// ---------- 路径（可被环境变量覆盖，方便测试隔离） ----------

const HOME = os.homedir();
const MOBILE_DIR = process.env.FANBOX_MOBILE_DIR || path.join(HOME, '.fanbox', 'mobile');
const WECHAT_DIR = process.env.FANBOX_WECHAT_DIR || path.join(HOME, '.fanbox', 'wechat');
const SESSIONS_DIR = process.env.FANBOX_SESSIONS_DIR || path.join(HOME, '.fanbox', 'sessions');

const MOBILE_SESSIONS_FILE = path.join(MOBILE_DIR, 'sessions.json');
const WECHAT_CONVOS_FILE = path.join(WECHAT_DIR, 'conversations.json');
const DESKTOP_INDEX_FILE = path.join(SESSIONS_DIR, 'index.json');

// Phase 2B（R2 第一部分）：统一 session index + mobile runner usage
// 统一 session index: ~/.fanbox/sessions/index.json
// mobile runner usage: ~/.fanbox/mobile/usage.json
// 注意：本轮 mobile sessions 仍写 MOBILE_SESSIONS_FILE；这里只额外写一份到统一 index，供 mobile / browser / desktop 三端共享。
// 后续 Phase 才会彻底把 3 套 JSON 合并成 SQLite。
const UNIFIED_INDEX_FILE = process.env.FANBOX_UNIFIED_INDEX_FILE || path.join(SESSIONS_DIR, 'index.json');
const MOBILE_USAGE_FILE = path.join(MOBILE_DIR, 'usage.json');

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

// Phase 2B：统一 session index 限制
const UNIFIED_INDEX_SCHEMA_VERSION = 1;
const UNIFIED_INDEX_MAX_SESSIONS = 500;        // index 最多保留 500 条；超出按 lastActiveAt 截断
// mobile runner usage 限制
const MOBILE_USAGE_SCHEMA_VERSION = 1;
const MOBILE_USAGE_MAX_RUNS = 200;             // usage 最多保留 200 条
const MOBILE_USAGE_MAX_INPUT_CHARS = 8000;     // 单条 inputChars 上限（与 MAX_INPUT_CHARS 对齐）
const MOBILE_USAGE_MAX_OUTPUT_CHARS = 8000;    // 单条 outputChars 上限

// ========== Phase 2A-2.1：redline detector（纯函数）==========
// 命中红线的请求必须先在 desktop 端 Approve 才能继续。
// 规则：宁可保守（误报无害），但不要把"解释/检查/总结"误判。
// 注意：中文关键词不要求前后是空白/标点（中文文本里很少见这种边界）
const REDLINE_RULES = [
  { id: 'delete_file', re: /(?:rm\s+-rf|rm\s+-r|rmdir|del\s+\/f|del\s+\/s|删除|删掉|remove\s+file|delete\s+file|delete\s+dir|rm\s+--force|unlink)/i, weight: 1 },
  { id: 'git_history_overwrite', re: /\b(?:git\s+push(?:\s+--force(?:d)?)?|push\s+--force|push\s+-f|force[\s-]*push|rebase(?:\s|-[if])?|reset\s+--hard|reset\s+--hard\s+HEAD|push\s+origin\s+--force|filter-branch|reflog\s+expire)\b/i, weight: 1 },
  { id: 'secret_or_env', re: /(?:\.env(?:\.[\w\-]+)?|\bsecrets?\b|\bpassword\b|\bapi[\s_-]?key\b|\btoken\b|密钥|密鈅|口令|凭据|凭據)/i, weight: 1 },
  { id: 'cicd_config', re: /(?:\.github\/workflows?|\bci\/cd\b|\bcicd\b|\bci\s+config\b|github\s+actions?|workflow\s+dispatch)/i, weight: 1 },
  { id: 'database_migration', re: /(?:\bdatabase\s+migration\b|\bschema\s+migration\b|\bRLS\s+policy\b|\brow[\s-]*level\s+security\b|\bmigration\s+script\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b|\bTRUNCATE\b|数据库\s*迁移|数据库\s*改|表结构|线上数据)/i, weight: 1 },
  { id: 'install_global', re: /\b(?:npm\s+install\s+-g|pnpm\s+add\s+-g|yarn\s+global\s+add|yarn\s+global\s+install|brew\s+install|apt[\s-]get\s+install|sudo\s+|chown|chmod\s+777)\b/i, weight: 1 },
  { id: 'production_deploy', re: /(?:\bproduction\s+deploy\b|\bprod\s+deploy\b|\bdeploy\s+to\s+prod\b|\bgo\s+live\b|发布\s*到|生产\s*环境|线上\s*发布|生产\s*部署)/i, weight: 1 },
  { id: 'publish_or_payment', re: /(?:\bpublish\s+(?:post|article|message)\b|\breal\s+payment\b|\bcharge\s+\$|\bpayment\s+intent\b|发文章|发贴|支付\s*\d|扣款|真实\s*付款)/i, weight: 1 },
  { id: 'external_send', re: /(?:\bsend\s+message\s+to\s+user\b|\bthird[\s-]*party\s+(?:api|service|message|upload)\b|\bexternal\s+upload\b|\bsubmit\s+form\s+to\b|发送\s*消息\s*给|向\s*第三方|提交\s*表单|上传\s*敏感|公开\s*发送)/i, weight: 1 },
  { id: 'system_config', re: /(?:\bmodify\s+system\s+config\b|\bchange\s+system\s+settings\b|修改\s*系统\s*配置|改\s*注册表|注册表\s*编辑)/i, weight: 1 }
];

function detectRedline(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { requiresApproval: false, reasons: [], matched: [] };
  }
  const reasons = [];
  const matched = [];
  for (const rule of REDLINE_RULES) {
    if (rule.re.test(text)) {
      reasons.push(rule.id);
      matched.push({ id: rule.id, weight: rule.weight });
    }
    // 必须重置 lastIndex（g flag 之外一般用 test 也行；这里统一显式）
    if (rule.re.global) rule.re.lastIndex = 0;
  }
  // 故意做二次过滤：短文本（< 12 chars）且无强匹配时不报警（避免误报"删"字等单字）
  if (text.length < 12 && reasons.length === 0) {
    return { requiresApproval: false, reasons: [], matched: [] };
  }
  return { requiresApproval: reasons.length > 0, reasons: reasons, matched: matched };
}

// ========== Phase 2A-2.1：mobile stub runner（不接 pty / shell）==========
// 真实 runner 接入计划在 Phase 2A-2.2；本轮只输出可控、安全、可截断的 stub 回复。
const STUB_RUNNER_NOTE = '[mobile-stub] This is a safe scoped mobile agent stub. Real runner integration will be added later.';
const MAX_STUB_OUTPUT_CHARS = 800;

function runStubAgent({ agentId, cwd, text, contextFiles, sessionId }) {
  const id = (agentId || 'unknown');
  const cwdLbl = (cwd || '').split(/[\\/]/).filter(Boolean).slice(-1)[0] || cwd || 'unknown';
  const ctx = Array.isArray(contextFiles) && contextFiles.length
    ? '\n\nContext files:\n' + contextFiles.map(function (f) { return '  - ' + safeStr(f, 200); }).join('\n')
    : '';
  const truncated = text.length > 240 ? text.slice(0, 240) + '…' : text;
  const out = [
    STUB_RUNNER_NOTE,
    '',
    'Agent: ' + safeStr(id, 32),
    'Folder: ' + safeStr(cwdLbl, 80),
    'Session: ' + safeStr(sessionId || '', 80),
    '',
    'You asked:',
    '  ' + truncated.split('\n').join('\n  '),
    ctx,
    '',
    'In Phase 2A-2.1 this is a placeholder. The actual agent driver is intentionally NOT wired to mobile chat yet.',
    'If your request hits a redline (delete, git push --force, .env, deploy, payment, etc.), it is queued for desktop approval and will NOT run.'
  ].join('\n');
  return {
    ok: true,
    text: safeStr(out, MAX_STUB_OUTPUT_CHARS),
    agentId: id,
    truncated: out.length > MAX_STUB_OUTPUT_CHARS
  };
}

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
  const source = (s.source === 'desktop' || s.source === 'mobile' || s.source === 'wechat' || s.source === 'mobile-draft') ? s.source : fallbackSource;
  const kind = (s.kind === 'agent' || s.kind === 'shell' || s.kind === 'recording') ? s.kind : 'agent';
  const status = (s.status && typeof s.status === 'string') ? s.status : 'unknown';
  const createdAt = (typeof s.createdAt === 'number' && s.createdAt > 0) ? s.createdAt : nowMs();
  const updatedAt = (typeof s.updatedAt === 'number' && s.updatedAt > 0) ? s.updatedAt : createdAt;
  const lastActiveAt = (typeof s.lastActiveAt === 'number' && s.lastActiveAt > 0) ? s.lastActiveAt : updatedAt;
  const messageCount = (typeof s.messageCount === 'number') ? Math.max(0, Math.floor(s.messageCount)) : 0;
  const tokenEstimate = (typeof s.tokenEstimate === 'number') ? Math.max(0, Math.floor(s.tokenEstimate)) : 0;
  const unread = !!s.unread;
  const canContinue = !!s.canContinue;
  const canStart = s.canStart === false ? false : undefined;
  const initialMessageLength = (typeof s.initialMessageLength === 'number') ? s.initialMessageLength : 0;
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

  // sessionId 强制重写为安全格式（mobile-draft 仍使用 mobile 前缀保持 ID 稳定）
  // 注意：如果 s 已有合法 sessionId，保留它（避免 ID 在 agentId/cwd 修改后变化导致 session 找不到）
  let sessionId;
  if (s.sessionId && typeof s.sessionId === 'string' && /^[A-Za-z0-9._\-+:]+$/.test(s.sessionId) && s.sessionId.length <= 200) {
    sessionId = s.sessionId;
  } else {
    const idPrefix = (source === 'mobile-draft') ? 'mobile' : source;
    sessionId = makeId(idPrefix, agentId, cwd, createdAt);
  }

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
    canStart,
    initialMessageLength,
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
  // Phase 2A-2.1：保留已有 messages 字段（来自 appendMessageToMobileSession 的本地 s.messages）
  // 注意：scrub 后的 session 不会再含 messages，真正持久化由 MOBILE_MESSAGES_FILE 承担
  for (const sid of Object.keys(inner || {})) {
    const s = inner[sid];
    if (!s || typeof s !== 'object') continue;
    // 只接受 session 对象（必须包含 sessionId/agentId/cwd 至少一个）
    if (!s.sessionId && !s.agentId && !s.cwd) continue;
    const scrub = scrubSessionSummary(s, 'mobile');
    // 保留内部授权字段（这些字段以 _ 开头，不会通过 scrubSessionDetail 暴露给 API）
    if (s._deviceId) scrub._deviceId = s._deviceId;
    if (s.internalId) scrub.internalId = s.internalId;
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
    'agentId', 'cwd', 'cwdLabel', 'inputHash', 'inputLen', 'inputLength',
    'initialMessageLength', 'titleLength', 'result',
    'decision', 'actor', 'reason', 'error',
    'reasons'  // Phase UI-A1：redline 触发时记录 reason 列表便于安全审计；不含 input 原文
  ]);
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

async function readAuditMobile() {
  try {
    const txt = await fs.readFile(AUDIT_FILE, 'utf8');
    const lines = txt.split(/\r?\n/).filter(Boolean);
    const entries = [];
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch (_) {}
    }
    return { ok: true, entries };
  } catch (_) {
    return { ok: true, entries: [] };
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
    decision: a.decision || '',
    // Phase 2A-2.1：redline reasons（不包含 input 原文）
    redlineReasons: Array.isArray(a.redlineReasons) ? a.redlineReasons.slice(0, 10).map(function (r) { return safeStr(String(r), 40); }) : []
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
  const mode = opts.mode === 'draft' ? 'draft' : (opts.mode || 'legacy');
  const titleInput = (opts.title && typeof opts.title === 'string') ? opts.title : '';
  const initialMessage = (opts.initialMessage && typeof opts.initialMessage === 'string') ? opts.initialMessage : '';
  if (!cwd) {
    return { ok: false, error: 'missing_cwd' };
  }
  if (!ALLOWED_AGENT_IDS.has(agentId)) {
    return { ok: false, error: 'invalid_agent' };
  }
  if (mode === 'draft' && titleInput.length > MAX_TITLE_CHARS) {
    return { ok: false, error: 'title_too_long' };
  }
  if (mode === 'draft' && initialMessage.length > MAX_MESSAGE_TEXT_CHARS) {
    return { ok: false, error: 'initial_message_too_long' };
  }
  const data = await readMobileSessionsObj();
  const internalId = 'mobile-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 0xfff).toString(16);
  const now = Date.now();
  const sessionId = makeId('mobile', agentId, cwd, now);
  const isDraft = mode === 'draft';
  const resolvedTitle = safeStr(
    titleInput || ('Agent ' + agentId),
    MAX_TITLE_CHARS
  );
  const obj = {
    sessionId: sessionId,
    internalId: internalId,
    agentId: agentId,
    kind: 'agent',
    cwd: cwd,
    cwdLabel: _normalizeCwdLabel(cwd),
    title: resolvedTitle,
    status: isDraft ? 'draft' : 'idle',
    source: isDraft ? 'mobile-draft' : undefined,
    canStart: isDraft ? false : undefined,
    initialMessageLength: isDraft ? initialMessage.length : 0,
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
  await upsertUnifiedSessionIndex(obj).catch(() => ({ ok: false }));
  if (isDraft && initialMessage) {
    await appendMessageToMobileSession(sessionId, {
      role: 'user',
      text: initialMessage,
      status: 'draft-pending',
      ts: now,
    });
  }
  if (isDraft) {
    await appendAudit({
      action: 'mobile_session.draft.created',
      sessionId, deviceId, agentId, cwd,
      titleLength: resolvedTitle.length,
      initialMessageLength: initialMessage.length,
      result: 'created'
    });
    if (initialMessage) {
      await appendMessageToMobileSession(sessionId, {
        role: 'user',
        text: safeStr(initialMessage, MAX_MESSAGE_TEXT_CHARS),
        status: 'draft-pending',
        ts: now,
        agentId
      });
    }
  } else {
    await appendAudit({ action: 'mobile_draft_created', sessionId, deviceId, agentId, cwd });
  }
  return { ok: true, sessionId, internalId };
}

// ---------- Mobile B3B: Start draft session runner ----------

async function _updateMessageStatus(sessionId, matchFn, newStatus) {
  const store = await readMobileMessagesStore();
  const msgs = Array.isArray(store.messages[sessionId]) ? store.messages[sessionId] : [];
  let changed = false;
  for (let i = 0; i < msgs.length; i++) {
    if (matchFn(msgs[i], i)) {
      msgs[i] = Object.assign({}, msgs[i], { status: newStatus });
      changed = true;
    }
  }
  if (changed) {
    store.messages[sessionId] = msgs;
    await writeMobileMessagesStore(store);
  }
  return { ok: changed };
}

async function startMobileDraftSession(opts) {
  opts = opts || {};
  const sessionId = _safeKey(opts.sessionId);
  const deviceId = _safeKey(opts.deviceId || 'unknown');

  if (!sessionId) {
    return { ok: false, error: 'session_not_found', status: 404 };
  }

  const data = await readMobileSessionsObj();
  const entries = Object.entries(data.sessions || {});
  const entry = entries.find(([, v]) => v && v.sessionId === sessionId);
  if (!entry) {
    return { ok: false, error: 'session_not_found', status: 404 };
  }
  const [internalId, sess] = entry;

  if (sess.status !== 'draft') {
    return { ok: false, error: 'session_not_draft', status: 409 };
  }
  if (sess.source !== 'mobile-draft') {
    return { ok: false, error: 'session_not_draft', status: 409 };
  }
  if (sess._deviceId && sess._deviceId !== deviceId) {
    return { ok: false, error: 'forbidden', status: 403 };
  }

  const cwd = String(sess.cwd || '');
  const agentId = normalizeAgentId(sess.agentId);
  if (!cwd) {
    return { ok: false, error: 'cwd_not_allowed', status: 403 };
  }
  if (!ALLOWED_AGENT_IDS.has(agentId)) {
    return { ok: false, error: 'agent_not_allowed', status: 400 };
  }

  let cwdExists = false;
  try {
    cwdExists = fsSync.statSync(cwd).isDirectory();
  } catch (_) { cwdExists = false; }
  if (!cwdExists) {
    return { ok: false, error: 'cwd_not_allowed', status: 403 };
  }

  const store = await readMobileMessagesStore();
  const msgs = Array.isArray(store.messages[sessionId]) ? store.messages[sessionId].slice() : [];
  const draftMsgIdx = msgs.findIndex(m => m && m.role === 'user' && m.status === 'draft-pending');
  let initialMessage = '';
  if (draftMsgIdx >= 0) {
    initialMessage = String(msgs[draftMsgIdx].text || '');
    msgs[draftMsgIdx] = Object.assign({}, msgs[draftMsgIdx], { status: 'sent' });
  }
  const expectedLen = typeof sess.initialMessageLength === 'number' ? sess.initialMessageLength : 0;
  if (expectedLen > 0 && !initialMessage) {
    return { ok: false, error: 'initial_message_missing', status: 400 };
  }
  store.messages[sessionId] = msgs;
  await writeMobileMessagesStore(store);

  const now = Date.now();
  await setSessionStatus(sessionId, 'running', {
    canStart: false,
    lastRunStartedAt: now,
    source: 'mobile-draft'
  });

  await appendAudit({
    action: 'mobile_session.start.accepted',
    sessionId,
    deviceId,
    agentId,
    cwd,
    initialMessageLength: initialMessage.length,
    result: 'accepted'
  });

  const t0 = Date.now();
  let runResult;
  try {
    runResult = await mobileRunner.runMobileAgent({
      agentId: agentId,
      cwd: cwd,
      text: initialMessage,
      sessionId: sessionId
    });
  } catch (e) {
    runResult = { ok: false, text: 'Agent runner threw an exception.', error: 'runner_failed', usedStub: false };
  }
  const t1 = Date.now();
  const durationMs = t1 - t0;

  await appendMessageToMobileSession(sessionId, {
    role: 'agent',
    text: (runResult && runResult.text) ? runResult.text : 'Agent failed to produce a response.',
    status: (runResult && runResult.ok) ? 'done' : 'failed',
    ts: t1,
    approvalId: '',
    agentId: agentId
  });

  const finalStatus = (runResult && runResult.ok) ? 'done' : 'failed';
  const runnerError = (runResult && runResult.error) || (finalStatus === 'failed' ? 'runner_failed' : '');

  await setSessionStatus(sessionId, finalStatus, {
    lastRunDurationMs: durationMs,
    lastRunAgent: agentId,
    canStart: false
  });

  try {
    const d = await readMobileSessionsObj();
    const found = Object.entries(d.sessions || {}).find(([, v]) => v && v.sessionId === sessionId);
    if (found) await upsertUnifiedSessionIndex(found[1]);
  } catch (_) {}

  const usageInputChars = initialMessage.length;
  const usageOutputChars = (runResult && typeof runResult.text === 'string') ? runResult.text.length : 0;
  await recordMobileUsage({
    sessionId: sessionId,
    agentId: agentId,
    cwd: cwd,
    cwdLabel: (function () { try { return path.basename(String(cwd)); } catch (_e) { return String(cwd).slice(0, 80); } })(),
    startedAt: t0,
    endedAt: t1,
    durationMs: durationMs,
    inputChars: usageInputChars,
    outputChars: usageOutputChars,
    status: (runResult && runResult.timedOut) ? 'timed_out' : finalStatus
  }).catch(() => ({ ok: false }));

  if (finalStatus === 'done') {
    await appendAudit({
      action: 'mobile_session.start.completed',
      sessionId,
      deviceId,
      agentId,
      cwd,
      initialMessageLength: initialMessage.length,
      durationMs: durationMs,
      result: 'completed'
    });
  } else {
    await appendAudit({
      action: 'mobile_session.start.failed',
      sessionId,
      deviceId,
      agentId,
      cwd,
      initialMessageLength: initialMessage.length,
      durationMs: durationMs,
      reason: runnerError,
      result: 'failed'
    });
  }

  const finalSess = await getSessionById(sessionId);
  return {
    ok: true,
    status: 200,
    session: finalSess,
    runnerError: runnerError,
    runnerOk: !!(runResult && runResult.ok),
    usedStub: !!(runResult && runResult.usedStub),
    durationMs: durationMs,
    initialMessageLength: initialMessage.length
  };
}

async function appendMessageToMobileSession(sessionId, msg) {
  // 找到 internal key
  const data = await readMobileSessionsObj();
  const entries = Object.entries(data.sessions);
  const entry = entries.find(([k, v]) => v && v.sessionId === sessionId)
              || entries.find(([k, v]) => k === sessionId);
  if (!entry) return { ok: false, error: 'not_found' };
  const [internalId, s] = entry;
  // Phase 2A-2.1：直接从 messages store 拉取最新 messages（避免被 writeMobileSessions 抹掉）
  const store = await readMobileMessagesStore();
  let allMsgs = Array.isArray(store.messages[sessionId]) ? store.messages[sessionId].slice() : [];
  allMsgs.push(msg);
  if (allMsgs.length > MAX_MESSAGES_PER_SESSION) {
    allMsgs = allMsgs.slice(allMsgs.length - MAX_MESSAGES_PER_SESSION);
  }
  // 更新 session 元数据
  s.messageCount = (s.messageCount || 0) + 1;
  s.updatedAt = Date.now();
  s.lastActiveAt = s.updatedAt;
  if (msg && msg.text) {
    s.summary = s.summary || {};
    s.summary.lastMessagePreview = safeStr(String(msg.text).slice(0, MAX_LIST_PREVIEW_CHARS), MAX_LIST_PREVIEW_CHARS);
    s.summary.lastRole = msg.role || 'user';
  }
  // 写 messages store
  store.messages[sessionId] = allMsgs.map(function (m) {
    return {
      role: m.role || 'system',
      text: String(m.text || ''),
      status: m.status || 'sent',
      ts: typeof m.ts === 'number' ? m.ts : 0,
      approvalId: m.approvalId || '',
      agentId: m.agentId || ''
    };
  });
  await writeMobileMessagesStore(store);
  // 写 sessions 摘要（不带 messages；scrub 会剥掉）
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
    decision: '',
    // Phase 2A-2.1：redline 命中原因（仅 reason 字符串，不含 input 原文）
    redlineReasons: Array.isArray(opts.redlineReasons) ? opts.redlineReasons.slice(0, 10).map(function (r) { return safeStr(String(r), 40); }) : []
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

  // Phase 2B：同步统一 session index（waiting_approval 状态）
  try {
    const data = await readMobileSessionsObj();
    const entries = Object.entries(data.sessions);
    const found = entries.find(([k, v]) => v && (v.sessionId === sessionId || k === sessionId));
    if (found) await upsertUnifiedSessionIndex(found[1]);
  } catch (_) { /* 写失败不影响主流程 */ }

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

// ========== Phase 2A-2.1：普通消息（非红线）走 stub runner；红线走 createApproval ==========
async function postMessageToMobileSession(opts) {
  opts = opts || {};
  const sessionId = _safeKey(opts.sessionId);
  const deviceId = _safeKey(opts.deviceId || 'unknown');
  const deviceName = safeStr(opts.deviceName || 'Mobile Device', 80);
  const agentId = normalizeAgentId(opts.agentId);
  const cwd = String(opts.cwd || '');
  const text = String(opts.text || '');
  const contextFiles = Array.isArray(opts.contextFiles) ? opts.contextFiles : [];

  // ---- 1) 基础校验 ----
  if (!sessionId) return { ok: false, status: 400, error: 'missing_sessionId' };
  if (!ALLOWED_AGENT_IDS.has(agentId)) return { ok: false, status: 400, error: 'invalid_agent' };
  if (!cwd) return { ok: false, status: 400, error: 'missing_cwd' };
  if (typeof text !== 'string') return { ok: false, status: 400, error: 'invalid_text' };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, status: 400, error: 'empty_text' };
  if (trimmed.length > MAX_INPUT_CHARS) return { ok: false, status: 400, error: 'text_too_long' };
  if (!_isContextFilesShape(contextFiles)) return { ok: false, status: 400, error: 'invalid_contextFiles' };

  // ---- 2) session 必须存在且未 running ----
  const data = await readMobileSessionsObj();
  const entries = Object.entries(data.sessions);
  const entry = entries.find(([k, v]) => v && v.sessionId === sessionId)
              || entries.find(([k, v]) => k === sessionId);
  if (!entry) return { ok: false, status: 404, error: 'session_not_found' };
  const [, sess] = entry;
  if (sess.status === 'running') {
    return { ok: false, status: 409, error: 'session_busy' };
  }
  if (sess.status === 'waiting_approval') {
    return { ok: false, status: 409, error: 'session_waiting_approval' };
  }

  // ---- 3) redline 检测：UI-A1 起 redline 仅写 audit，不再阻断 mobile send path ----
  // 原因：用户明确要求删除「手机发指令 → desktop approval → approve 后执行」的产品逻辑
  // 保留：redline detector（内部 warning）、audit 记录（仅 hash + reasons + agentId）
  // 移除：createApproval、waiting_approval 状态、requiresApproval 响应
  const red = detectRedline(trimmed);
  if (red && red.requiresApproval) {
    await appendAudit({
      action: 'redline_detected_but_not_blocked',
      sessionId: sessionId,
      deviceId: deviceId,
      agentId: agentId,
      cwd: cwd,
      reasons: Array.isArray(red.reasons) ? red.reasons.slice(0, 10) : []
    }).catch(() => ({ ok: false }));
  }

  // ---- 4) 普通消息 → running → safe runner（claude/codex 真实；opencode/qoder stub） ----
  //   红线也走 runner；redline 不再创建 approval、不再改 waiting_approval 状态
  const now = Date.now();
  // 写入 user message（status: sent）
  await appendMessageToMobileSession(sessionId, {
    role: 'user',
    text: trimmed,
    status: 'sent',
    ts: now,
    approvalId: ''
  });
  // 标记 running
  await setSessionStatus(sessionId, 'running', { lastRunStartedAt: now });

  // 跑 runner（Phase 2A-2.2：claude/codex 真实 / opencode/qoder stub；不接 pty / shell / YOLO）
  const t0 = Date.now();
  const runResult = await mobileRunner.runMobileAgent({
    agentId: agentId,
    cwd: cwd,
    text: trimmed,
    contextFiles: contextFiles,
    sessionId: sessionId
  });
  const t1 = Date.now();

  // 写 agent message（runner 内部已 scrub + 截断）
  await appendMessageToMobileSession(sessionId, {
    role: 'agent',
    text: runResult && runResult.text ? runResult.text : STUB_RUNNER_NOTE,
    status: runResult && runResult.ok ? 'done' : 'failed',
    ts: t1,
    approvalId: '',
    agentId: agentId
  });

  // 更新 session summary（截断）
  const finalStatus = runResult && runResult.ok ? 'done' : 'failed';
  await setSessionStatus(sessionId, finalStatus, {
    lastRunDurationMs: t1 - t0,
    lastRunAgent: agentId
  });

  // Phase 2B（R2 第一部分）：写 mobile runner usage + 同步统一 session index
  // 1) usage 记录（仅 inputChars / outputChars / durationMs / status；不存 prompt 全文 / 输出全文 / token / cost）
  const inputChars = trimmed.length;
  const outputChars = (runResult && typeof runResult.text === 'string') ? runResult.text.length : 0;
  const finalUsageStatus = (runResult && runResult.timedOut) ? 'timed_out' : finalStatus;
  await recordMobileUsage({
    sessionId: sessionId,
    agentId: agentId,
    cwd: cwd,
    cwdLabel: _normalizeCwdLabel(cwd),
    startedAt: t0,
    endedAt: t1,
    durationMs: t1 - t0,
    inputChars: inputChars,
    outputChars: outputChars,
    status: finalUsageStatus
  }).catch(() => ({ ok: false }));

  // 2) 同步统一 session index（用更新后的 session 元数据）
  try {
    const data = await readMobileSessionsObj();
    const entries = Object.entries(data.sessions);
    const found = entries.find(([k, v]) => v && (v.sessionId === sessionId || k === sessionId));
    if (found) await upsertUnifiedSessionIndex(found[1]);
  } catch (_) { /* 写失败不影响主流程 */ }

  await appendAudit({
    action: 'mobile_message_sent',
    sessionId: sessionId,
    deviceId: deviceId,
    agentId: agentId,
    cwd: cwd,
    inputHash: _hashInput(trimmed),
    inputLen: trimmed.length,
    status: finalStatus,
    runnerMode: runResult && runResult.mode || 'unknown',
    usedStub: !!(runResult && runResult.usedStub)
  });

  return {
    ok: true,
    requiresApproval: false,
    sessionId: sessionId,
    status: finalStatus,
    agentId: agentId,
    durationMs: t1 - t0,
    runnerMode: runResult && runResult.mode || 'unknown',
    usedStub: !!(runResult && runResult.usedStub),
    timedOut: !!(runResult && runResult.timedOut)
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

  // Phase 2B：同步统一 session index（approved/rejected 状态）
  try {
    const data = await readMobileSessionsObj();
    const entries = Object.entries(data.sessions);
    const found = entries.find(([k, v]) => v && (v.sessionId === a.sessionId || k === a.sessionId));
    if (found) await upsertUnifiedSessionIndex(found[1]);
  } catch (_) { /* 写失败不影响主流程 */ }

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
  startMobileDraftSession,
  appendMessageToMobileSession,
  setSessionStatus,
  getSessionMessages,
  createApproval,
  getApprovalById,
  listApprovals,
  listPendingApprovals,
  decideApproval,
  postMessageToMobileSession,
  // Phase 2A-2.1 redline + stub runner
  detectRedline,
  runStubAgent,
  REDLINE_RULES,
  STUB_RUNNER_NOTE,
  MAX_STUB_OUTPUT_CHARS,
  cancelApproval,
  expireApprovals,
  readApprovals,
  readAuditMobile,
  appendAudit,
  // Phase 2B（R2 第一部分）：统一 session index + mobile runner usage
  recordMobileUsage,
  readMobileUsage,
  upsertUnifiedSessionIndex,
  readUnifiedSessionIndex,
  // 常量
  UNIFIED_INDEX_FILE,
  MOBILE_USAGE_FILE,
  UNIFIED_INDEX_SCHEMA_VERSION,
  UNIFIED_INDEX_MAX_SESSIONS,
  MOBILE_USAGE_SCHEMA_VERSION,
  MOBILE_USAGE_MAX_RUNS,
  MOBILE_USAGE_MAX_INPUT_CHARS,
  MOBILE_USAGE_MAX_OUTPUT_CHARS,
  // 兼容测试
  applyFilters
};

// =====================================================================
// Phase 2B（R2 第一部分）：统一 session index + mobile runner usage
//
// 硬约束：
//   1. 不保存 raw stdout / .jsonl / .cast / .log 路径
//   2. 不保存 token / cookie / API key / claudeSession / codexSession
//   3. 不保存 prompt 全文 / 输出全文
//   4. 写失败仅 warn，不抛（不阻断 mobile server）
//   5. 文件路径 = UNIFIED_INDEX_FILE / MOBILE_USAGE_FILE（可被环境变量覆盖）
//   6. 写入前 scrub 全部
// =====================================================================

// ---------- mobile runner usage ----------

async function readMobileUsage() {
  try {
    const txt = await fs.readFile(MOBILE_USAGE_FILE, 'utf8');
    const j = JSON.parse(txt);
    if (!j || typeof j !== 'object') return { schemaVersion: MOBILE_USAGE_SCHEMA_VERSION, updatedAt: 0, runs: [] };
    if (!Array.isArray(j.runs)) j.runs = [];
    return j;
  } catch {
    return { schemaVersion: MOBILE_USAGE_SCHEMA_VERSION, updatedAt: 0, runs: [] };
  }
}

async function _writeMobileUsage(obj) {
  await fs.mkdir(MOBILE_USAGE_FILE.replace(/[\\\/][^\\\/]+$/, ''), { recursive: true });
  await fs.writeFile(MOBILE_USAGE_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

async function recordMobileUsage(entry) {
  // entry = { sessionId, agentId, cwd, cwdLabel, startedAt, endedAt, durationMs, inputChars, outputChars, status }
  // 写失败仅 warn，不抛
  try {
    if (!entry || typeof entry !== 'object') return { ok: false, error: 'invalid_entry' };
    const safeId = String(entry.sessionId || '').replace(/[^A-Za-z0-9._\-+:]/g, '').slice(0, 128);
    if (!safeId) return { ok: false, error: 'missing_sessionId' };
    const agentId = normalizeAgentId(entry.agentId);
    const cwd = safeStr(typeof entry.cwd === 'string' ? entry.cwd : '', 1024);
    const cwdLabel = safeStr(typeof entry.cwdLabel === 'string' ? entry.cwdLabel : _normalizeCwdLabel(cwd), 80);
    const startedAt = (typeof entry.startedAt === 'number' && entry.startedAt > 0) ? entry.startedAt : Date.now();
    const endedAt = (typeof entry.endedAt === 'number' && entry.endedAt > 0) ? entry.endedAt : Date.now();
    const durationMs = (typeof entry.durationMs === 'number' && entry.durationMs >= 0) ? Math.min(86400000, Math.floor(entry.durationMs)) : 0;
    const inputChars = (typeof entry.inputChars === 'number' && entry.inputChars >= 0) ? Math.min(MOBILE_USAGE_MAX_INPUT_CHARS, Math.floor(entry.inputChars)) : 0;
    const outputChars = (typeof entry.outputChars === 'number' && entry.outputChars >= 0) ? Math.min(MOBILE_USAGE_MAX_OUTPUT_CHARS, Math.floor(entry.outputChars)) : 0;
    const status = (entry.status === 'done' || entry.status === 'failed' || entry.status === 'timed_out' || entry.status === 'cancelled') ? entry.status : 'failed';
    const obj = await readMobileUsage();
    obj.runs.push({
      runId: 'run_' + Date.now().toString(36) + Math.floor(Math.random() * 0xfff).toString(16),
      sessionId: safeId,
      agentId: agentId,
      cwd: cwd,
      cwdLabel: cwdLabel,
      startedAt: startedAt,
      endedAt: endedAt,
      durationMs: durationMs,
      inputChars: inputChars,
      outputChars: outputChars,
      // 显式不写：tokens / cost（无真实来源；用户要求不伪造）
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCost: null,
      status: status
    });
    // 截断到 MOBILE_USAGE_MAX_RUNS（按 startedAt 倒序保留最新）
    obj.runs.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    if (obj.runs.length > MOBILE_USAGE_MAX_RUNS) obj.runs = obj.runs.slice(0, MOBILE_USAGE_MAX_RUNS);
    obj.schemaVersion = MOBILE_USAGE_SCHEMA_VERSION;
    obj.updatedAt = Date.now();
    await _writeMobileUsage(obj);
    return { ok: true };
  } catch (e) {
    try { console.warn('[mobile-sessions] recordMobileUsage failed:', e && e.message || e); } catch (_) {}
    return { ok: false, error: 'write_failed' };
  }
}

// ---------- 统一 session index ----------

async function readUnifiedSessionIndex() {
  try {
    const txt = await fs.readFile(UNIFIED_INDEX_FILE, 'utf8');
    const j = JSON.parse(txt);
    if (!j || typeof j !== 'object') return { schemaVersion: UNIFIED_INDEX_SCHEMA_VERSION, updatedAt: 0, sessions: {} };
    if (!j.sessions || typeof j.sessions !== 'object') j.sessions = {};
    return j;
  } catch {
    return { schemaVersion: UNIFIED_INDEX_SCHEMA_VERSION, updatedAt: 0, sessions: {} };
  }
}

async function _writeUnifiedSessionIndex(obj) {
  await fs.mkdir(UNIFIED_INDEX_FILE.replace(/[\\\/][^\\\/]+$/, ''), { recursive: true });
  await fs.writeFile(UNIFIED_INDEX_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

function _buildUnifiedEntry(session) {
  // session 是 mobile session（来自 readMobileSessionsObj 的 sessions[internalId]）
  if (!session || typeof session !== 'object') return null;
  const sessionId = String(session.sessionId || '').slice(0, 128);
  if (!sessionId) return null;
  const agentId = normalizeAgentId(session.agentId);
  if (agentId === 'unknown') return null;  // 不收未识别 agent
  const cwd = safeStr(typeof session.cwd === 'string' ? session.cwd : '', 1024);
  const cwdLabel = safeStr(session.cwdLabel || _normalizeCwdLabel(cwd), 80);
  const title = safeStr(session.title || ('Agent ' + agentId), MAX_TITLE_CHARS);
  const status = (typeof session.status === 'string') ? session.status : 'idle';
  const createdAt = (typeof session.createdAt === 'number' && session.createdAt > 0) ? session.createdAt : Date.now();
  const updatedAt = (typeof session.updatedAt === 'number' && session.updatedAt > 0) ? session.updatedAt : createdAt;
  const lastActiveAt = (typeof session.lastActiveAt === 'number' && session.lastActiveAt > 0) ? session.lastActiveAt : updatedAt;
  const messageCount = (typeof session.messageCount === 'number') ? Math.max(0, Math.floor(session.messageCount)) : 0;
  // usage 来自 session 上的最新一条（如果存在）
  const usage = (session.lastRunDurationMs != null) ? {
    durationMs: Math.max(0, Math.floor(Number(session.lastRunDurationMs) || 0)),
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    estimatedCost: null
  } : { durationMs: 0, inputTokens: null, outputTokens: null, totalTokens: null, estimatedCost: null };
  return {
    schemaVersion: UNIFIED_INDEX_SCHEMA_VERSION,
    sessionId: sessionId,
    source: 'mobile',
    agentId: agentId,
    kind: (session.kind === 'agent' || session.kind === 'shell' || session.kind === 'recording') ? session.kind : 'agent',
    cwd: cwd,
    cwdLabel: cwdLabel,
    title: title,
    status: status,
    createdAt: createdAt,
    updatedAt: updatedAt,
    lastActiveAt: lastActiveAt,
    messageCount: messageCount,
    usage: usage
  };
}

async function upsertUnifiedSessionIndex(session) {
  // 把一个 mobile session 合并进统一 index
  // 写失败仅 warn，不抛
  try {
    const entry = _buildUnifiedEntry(session);
    if (!entry) return { ok: false, error: 'invalid_session' };
    const obj = await readUnifiedSessionIndex();
    obj.sessions[entry.sessionId] = entry;
    // 截断到 UNIFIED_INDEX_MAX_SESSIONS（按 lastActiveAt 倒序）
    const arr = Object.values(obj.sessions);
    if (arr.length > UNIFIED_INDEX_MAX_SESSIONS) {
      arr.sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
      const drop = new Set(arr.slice(UNIFIED_INDEX_MAX_SESSIONS).map(x => x.sessionId));
      for (const id of drop) delete obj.sessions[id];
    }
    obj.schemaVersion = UNIFIED_INDEX_SCHEMA_VERSION;
    obj.updatedAt = Date.now();
    await _writeUnifiedSessionIndex(obj);
    return { ok: true, sessionId: entry.sessionId };
  } catch (e) {
    try { console.warn('[mobile-sessions] upsertUnifiedSessionIndex failed:', e && e.message || e); } catch (_) {}
    return { ok: false, error: 'write_failed' };
  }
}
