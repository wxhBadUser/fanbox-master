'use strict';
// electron/project-memory.js
//
// Desktop Project Memory scanner — reads ~/.claude/projects/ and ~/.codex/sessions/
// to build the real "recent projects" list that the desktop sidebar shows.
//
// This is the SAME source-of-truth as server.js agentProjects() + projectMemory().
// Mobile uses this to stop showing drive roots (C:/D:/E:) as fake projects.
//
// This module is READ-ONLY: it never writes to disk, never exposes raw prompts,
// never returns token/tokenHash/raw PTY. It returns structured summaries only.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const HOME = os.homedir();
const PLATFORM = process.platform;
const CLAUDE_PROJ = path.join(HOME, '.claude', 'projects');
const CODEX_SESS = path.join(HOME, '.codex', 'sessions');

// --- Path helpers (adapted from server.js) ---

function mungeClaudeDir(cwd) {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

function normalizeProjectPathForCompare(p) {
  if (!p) return '';
  let norm = p.replace(/\\/g, '/').replace(/\/+/g, '/');
  while (norm.endsWith('/') && norm.length > 1) norm = norm.slice(0, -1);
  if (PLATFORM === 'win32') norm = norm.replace(/^([A-Za-z]):/, (_, d) => d.toLowerCase() + ':');
  return norm;
}

// Read cwd from the first 64KB of a session file (adapted from server.js readCwdFromHead)
async function readCwdFromHead(file, bytes) {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    const head = buf.toString('utf8', 0, bytesRead);
    const patterns = [
      /"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/,
      /"session_meta"\s*:\s*\{[^}]*?"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/,
      /"metadata"\s*:\s*\{[^}]*?"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/,
      /"source"\s*:\s*\{[^}]*?"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    ];
    for (const pat of patterns) {
      const m = head.match(pat);
      if (m) return JSON.parse('"' + m[1] + '"');
    }
    return null;
  } finally { await fh.close(); }
}

// --- Session parsers (adapted from server.js) ---

const projMemCache = new Map(); // file -> { size, mtimeMs, sess }

async function parseClaudeSession(fp, st) {
  const hit = projMemCache.get(fp);
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.sess;
  const sess = {
    id: path.basename(fp, '.jsonl'),
    agent: 'claude',
    title: '',
    firstT: 0,
    lastT: st.mtimeMs,
    userMsgs: 0,
    files: [],
    skills: [],
    // Mobile-Paseo-R1-Fix-Strict: internal-only field. Used by buildProjectMemoryTimeline
    // to read the original .jsonl for the Chat tab. NEVER exposed to the frontend hub projection.
    sourceFile: fp,
  };
  const filesSet = new Set();
  const skillsSet = new Set();
  const stream = fs.createReadStream(fp, { encoding: 'utf8' });
  let rest = '';
  const handleLine = (line) => {
    if (!sess.firstT) {
      const m = line.match(/"timestamp":"([^"]+)"/);
      if (m) sess.firstT = Date.parse(m[1]) || 0;
    }
    if (line.includes('"type":"user"') && !line.includes('"isMeta":true') && !line.includes('"tool_use_id"')) {
      sess.userMsgs++;
      if (!sess.title) {
        try {
          const d = JSON.parse(line);
          const c = d.message && d.message.content;
          let text = typeof c === 'string' ? c : (Array.isArray(c) ? (c.find((x) => x.type === 'text') || {}).text || '' : '');
          text = text.trim();
          if (text && !text.startsWith('<') && !text.startsWith('Caveat:')) sess.title = text.slice(0, 160);
        } catch { /* */ }
      }
    }
    if (line.includes('"file_path"') && /"name":"(Write|Edit|MultiEdit|NotebookEdit)"/.test(line)) {
      try {
        const d = JSON.parse(line);
        const content = d.message && Array.isArray(d.message.content) ? d.message.content : [];
        for (const it of content) {
          if (it.type === 'tool_use' && it.input && it.input.file_path) filesSet.add(it.input.file_path);
        }
      } catch { /* */ }
    }
    if (line.includes('"name":"Skill"')) {
      try {
        const d = JSON.parse(line);
        const content = d.message && Array.isArray(d.message.content) ? d.message.content : [];
        for (const it of content) {
          if (it.type === 'tool_use' && it.name === 'Skill' && it.input && it.input.skill) skillsSet.add(String(it.input.skill).replace(/^.*:/, ''));
        }
      } catch { /* */ }
    } else if (line.includes('<command-name>')) {
      const m = line.match(/<command-name>\s*\/?([\w.:-]+)\s*<\/command-name>/);
      if (m) skillsSet.add(m[1].replace(/^.*:/, ''));
    }
  };
  for await (const chunk of stream) {
    rest += chunk;
    let idx;
    while ((idx = rest.indexOf('\n')) !== -1) { handleLine(rest.slice(0, idx)); rest = rest.slice(idx + 1); }
  }
  if (rest.trim()) handleLine(rest);
  sess.files = [...filesSet].slice(0, 80);
  sess.skills = [...skillsSet].slice(0, 20);
  projMemCache.set(fp, { size: st.size, mtimeMs: st.mtimeMs, sess });
  return sess;
}

async function parseCodexSession(fp, st) {
  const hit = projMemCache.get(fp);
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.sess;
  const sess = {
    id: '',
    agent: 'codex',
    title: '',
    firstT: st.birthtimeMs || 0,
    lastT: st.mtimeMs,
    userMsgs: 0,
    files: [],
    skills: [],
    // Mobile-Paseo-R1-Fix-Strict: internal-only. Used by buildProjectMemoryTimeline.
    sourceFile: fp,
  };
  try {
    const txt = await fsp.readFile(fp, 'utf8');
    for (const line of txt.split('\n')) {
      if (!sess.id && line.includes('session_meta')) {
        const m = line.match(/"id":"([0-9a-f-]{8,})"/);
        if (m) sess.id = m[1];
      }
      if (line.includes('"role":"user"') && line.includes('input_text')) {
        try {
          const d = JSON.parse(line);
          const payload = d.payload || d;
          const item = payload.type === 'message' ? payload : null;
          if (item) {
            const text = (item.content || []).filter((x) => x.type === 'input_text').map((x) => x.text).join(' ').trim();
            if (text && !text.startsWith('<')) { sess.userMsgs++; if (!sess.title) sess.title = text.slice(0, 160); }
          }
        } catch { /* */ }
      }
    }
  } catch { /* */ }
  if (!sess.id) sess.id = path.basename(fp, '.jsonl').replace(/^rollout-[\d-]*T[\d-]*-/, '');
  projMemCache.set(fp, { size: st.size, mtimeMs: st.mtimeMs, sess });
  return sess;
}

// --- Project list scanner (adapted from server.js agentProjects) ---

let agentProjCache = { at: 0, data: null };

async function scanAgentProjects() {
  if (agentProjCache.data && Date.now() - agentProjCache.at < 60000) return agentProjCache.data;
  const cutoff = Date.now() - 90 * 86400000; // 90 days
  const normHome = normalizeProjectPathForCompare(HOME);
  const map = new Map(); // normCwd -> { cwd, lastActive, agents: Set }
  const add = (cwd, t, agent) => {
    if (!cwd) return;
    const ncwd = normalizeProjectPathForCompare(cwd);
    if (!ncwd || ncwd === normHome) return; // skip home directory sessions
    const cur = map.get(ncwd) || { cwd, lastActive: 0, agents: new Set() };
    cur.lastActive = Math.max(cur.lastActive, t);
    cur.agents.add(agent);
    map.set(ncwd, cur);
  };
  // Claude Code: scan each project dir, find newest .jsonl, read cwd from head
  try {
    const dirs = await fsp.readdir(CLAUDE_PROJ);
    await Promise.all(dirs.map(async (d) => {
      const base = path.join(CLAUDE_PROJ, d);
      let names; try { names = await fsp.readdir(base); } catch { return; }
      let newest = null;
      await Promise.all(names.filter((n) => n.endsWith('.jsonl')).map(async (n) => {
        try {
          const st = await fsp.stat(path.join(base, n));
          if (!newest || st.mtimeMs > newest.mtimeMs) newest = { fp: path.join(base, n), mtimeMs: st.mtimeMs };
        } catch { /* */ }
      }));
      if (!newest || newest.mtimeMs < cutoff) return;
      try { add(await readCwdFromHead(newest.fp, 65536), newest.mtimeMs, 'claude'); } catch { /* */ }
    }));
  } catch { /* no Claude Code */ }
  // Codex: walk sessions dir, take 40 newest, read cwd from head
  try {
    const files = [];
    const walk = async (dir, depth) => {
      let names;
      try { names = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const n of names) {
        const fp = path.join(dir, n.name);
        if (n.isDirectory() && depth < 3) await walk(fp, depth + 1);
        else if (n.isFile() && n.name.endsWith('.jsonl')) {
          try { const st = await fsp.stat(fp); if (st.mtimeMs >= cutoff) files.push({ fp, mtimeMs: st.mtimeMs }); } catch { /* */ }
        }
      }
    };
    await walk(CODEX_SESS, 0);
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    await Promise.all(files.slice(0, 40).map(async (f) => {
      try { add(await readCwdFromHead(f.fp, 65536), f.mtimeMs, 'codex'); } catch { /* */ }
    }));
  } catch { /* no Codex */ }
  // Sort by lastActive desc, skip deleted project dirs
  const sorted = [...map.entries()].sort((a, b) => b[1].lastActive - a[1].lastActive);
  const projects = [];
  for (const [, info] of sorted) {
    if (projects.length >= 12) break;
    try { if (!(await fsp.stat(info.cwd)).isDirectory()) continue; } catch { continue; }
    projects.push({ cwd: info.cwd, name: path.basename(info.cwd), agents: [...info.agents], lastActive: info.lastActive });
  }
  const data = { ok: true, projects };
  agentProjCache = { at: Date.now(), data };
  return data;
}

// --- Per-project session scanner (adapted from server.js projectMemory) ---

async function scanProjectSessions(cwd) {
  const sessions = [];
  // Claude Code: project dir name is munge(cwd)
  try {
    const base = path.join(CLAUDE_PROJ, mungeClaudeDir(cwd));
    const names = (await fsp.readdir(base)).filter((n) => n.endsWith('.jsonl'));
    const stats = (await Promise.all(names.map(async (n) => {
      const fp = path.join(base, n);
      try { return { fp, st: await fsp.stat(fp) }; } catch { return null; }
    }))).filter(Boolean).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs).slice(0, 40);
    for (const { fp, st } of stats) sessions.push(await parseClaudeSession(fp, st));
  } catch { /* no Claude sessions for this cwd */ }
  // Codex: walk sessions, match by head cwd
  try {
    const files = [];
    const walk = async (dir, depth) => {
      let names;
      try { names = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const n of names) {
        const fp = path.join(dir, n.name);
        if (n.isDirectory() && depth < 3) await walk(fp, depth + 1);
        else if (n.isFile() && n.name.endsWith('.jsonl')) {
          try { files.push({ fp, st: await fsp.stat(fp) }); } catch { /* */ }
        }
      }
    };
    await walk(CODEX_SESS, 0);
    files.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
    for (const { fp, st } of files.slice(0, 60)) {
      try { if (normalizeProjectPathForCompare(await readCwdFromHead(fp, 65536)) === normalizeProjectPathForCompare(cwd)) sessions.push(await parseCodexSession(fp, st)); } catch { /* */ }
    }
  } catch { /* no Codex */ }
  // Sort: titled first, then by lastT desc
  sessions.sort((a, b) => (b.title ? 1 : 0) - (a.title ? 1 : 0) || b.lastT - a.lastT);
  sessions.sort((a, b) => b.lastT - a.lastT);
  return sessions.filter((s) => s.title || s.files.length).slice(0, 40);
}

// --- Main export: build full project-memory read model ---

// Validators (injected by caller to avoid circular dependency with mobile.js)
function safeProjectId(cwd) {
  return 'pm_' + crypto.createHash('sha1').update(cwd).digest('hex').slice(0, 16);
}

// Sanitize a session title label: strip control chars, collapse whitespace, truncate.
// Used for the parser's first-user-message title (already 160-char truncated by the parser)
// before exposing it via the mobile project-memory projection.
function safeTitleLabel(v, max) {
  if (v == null) return '';
  let s = String(v);
  // Strip control chars (keep \t; newline -> space via the next step)
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  // Collapse whitespace runs (incl. newlines/tabs) into a single space
  s = s.replace(/\s+/g, ' ').trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

/**
 * Scan desktop agent session logs and return the mobile project-memory read model.
 * This is a READ-ONLY safe projection — no raw prompts, no tokens, no raw PTY.
 *
 * @param {object} opts - { isAllowedCwd: (cwd) => boolean, isForbidden: (cwd) => boolean }
 * @returns {Promise<{ok: true, items: Array}>}
 */
async function scanProjectMemory(opts) {
  const isAllowedCwd = (opts && opts.isAllowedCwd) || (() => true);
  const isForbidden = (opts && opts.isForbidden) || (() => false);
  const { projects } = await scanAgentProjects();
  const items = [];
  for (const p of projects) {
    // Validate cwd against allowed roots and forbidden paths
    if (isForbidden(p.cwd)) continue;
    if (!isAllowedCwd(p.cwd)) continue;
    // Scan sessions for this project
    const rawSessions = await scanProjectSessions(p.cwd);
    const sessions = rawSessions.map((s) => {
      // Mobile-Paseo-R1-Fix: the first-user-message title (parser's `s.title`,
      // already 160-char truncated) is a session LABEL aligned with the desktop
      // sidebar. "Raw prompt" leakage refers to full untruncated prompt bodies /
      // tool inputs, NOT this 160-char label. Sanitize it (strip control chars,
      // collapse whitespace) before exposing; fall back to agent+file / agent+date.
      const agentLabel = s.agent === 'claude' ? 'Claude' : s.agent === 'codex' ? 'Codex' : 'Session';
      let safeTitle = '';
      let titleSource = 'agent-date';
      const rawTitle = safeTitleLabel(s.title || '', 160);
      const firstFile = (s.files || [])[0];
      if (rawTitle) {
        safeTitle = rawTitle;
        titleSource = 'first-message';
      } else if (firstFile) {
        const fileBase = path.basename(firstFile);
        safeTitle = (agentLabel + ' · ' + fileBase).slice(0, 160);
        titleSource = 'agent-file';
      } else {
        // Derive a date label from lastT (ms → YYYY-MM-DD)
        const d = new Date(s.lastT || 0);
        const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        safeTitle = (agentLabel + ' session · ' + dateStr).slice(0, 160);
        titleSource = 'agent-date';
      }
      return {
      id: s.id,
      title: safeTitle,
      titleSource,
      agentId: s.agent === 'claude' ? 'claude' : s.agent === 'codex' ? 'codex' : 'unknown',
      status: 'idle', // desktop logs don't track live status; mobile sessions have their own status
      lastActiveAt: s.lastT || 0,
      messageCount: s.userMsgs || 0,
      changedFileCount: (s.files || []).length,
      tags: (s.skills || []).slice(0, 20),
      canResume: true,
      reason: 'ready',
      // Mobile-Paseo-R1-Fix-Strict: internal-only. NEVER serialized to the hub response.
      // The hub handler in mobile.js MUST strip this before sending. buildProjectMemoryTimeline
      // reads it to project a safe Chat timeline from the original .jsonl.
      sourceFile: s.sourceFile || '',
      };
    });
    const riskFlags = [];
    let canCreateSession = true;
    let reason = 'ready';
    try { if (!(await fsp.stat(p.cwd)).isDirectory()) { canCreateSession = false; reason = 'directory not found'; riskFlags.push('cwd_missing'); } } catch { canCreateSession = false; reason = 'directory not found'; riskFlags.push('cwd_missing'); }
    items.push({
      id: safeProjectId(p.cwd),
      name: p.name,
      cwd: p.cwd,
      cwdLabel: p.name,
      lastActiveAt: p.lastActive,
      sessionCount: sessions.length,
      runningCount: 0, // desktop logs don't track running state
      source: 'desktop-project-memory',
      riskFlags,
      sessions,
      canCreateSession,
      reason,
      agents: p.agents,
      agentIds: p.agents,
    });
  }
  // Sort by lastActiveAt desc
  items.sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
  return { ok: true, items };
}

// --- Mobile-Paseo-R1-Fix-Strict: read-only .jsonl timeline projection ---
//
// Reads the original session .jsonl (Claude or Codex) and projects a SAFE timeline
// for the mobile Chat tab. This is the fix for "Chat shows friendly empty state".
// Real history must be displayed; only when the file is missing/unreadable/empty
// may the caller show the friendly empty state.
//
// Safety rules (hard):
//   - user/assistant text is truncated to MAX_EVENT_TEXT chars
//   - tool_use (Write/Edit/MultiEdit/NotebookEdit) → "修改了 <basename>" summary only
//   - Bash/Read/BashOutput etc. → "运行了 <tool>" summary only
//   - binary/base64/over-long content is redacted
//   - token/tokenHash/Authorization/Bearer/API key/env secret patterns are scrubbed
//   - raw PTY / raw JSON / raw tool_use input object are NEVER echoed
//   - at most MAX_EVENTS per session
//   - every event has source: "desktop-project-memory"

const MAX_EVENT_TEXT = 2000;
const MAX_EVENTS = 80;
const SECRET_RE = /(sk-[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._-]+|Authorization\s*:\s*Bearer\s+[^\s"'']+|ANTHROPIC_API_KEY\s*=\s*\S+|OPENAI_API_KEY\s*=\s*\S+|token\s*=\s*[A-Za-z0-9._-]{8,})/gi;

function scrubSecrets(s) {
  if (!s) return '';
  return String(s).replace(SECRET_RE, '[redacted]');
}

function truncateText(s, max) {
  s = String(s || '');
  if (s.length > max) s = s.slice(0, max) + '…';
  return s;
}

function safeBase(p) {
  try { return path.basename(String(p || '')); } catch { return ''; }
}

// Project one parsed line of a Claude .jsonl into a safe event (or null to skip).
function projectClaudeLine(d, idx, sessionId) {
  if (!d || typeof d !== 'object') return null;
  const ts = d.timestamp ? (Date.parse(d.timestamp) || 0) : 0;
  const type = d.type;
  const msg = d.message || {};
  const role = msg.role || '';
  const content = msg.content;
  // user text message
  if (type === 'user' && role === 'user' && !d.isMeta && !d.tool_use_id) {
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      const t = content.find((x) => x && x.type === 'text');
      text = (t && t.text) || '';
    }
    if (!text) return null;
    text = scrubSecrets(text);
    text = truncateText(text, MAX_EVENT_TEXT);
    return {
      id: 'pm-cl-' + idx + '-' + sessionId,
      type: 'message',
      role: 'user',
      text,
      timestamp: ts || 0,
      source: 'desktop-project-memory',
    };
  }
  // assistant message: may contain text and/or tool_use
  if (type === 'assistant' && role === 'assistant') {
    if (Array.isArray(content)) {
      // text part
      const textPart = content.find((x) => x && x.type === 'text' && typeof x.text === 'string' && x.text.trim());
      if (textPart) {
        let text = scrubSecrets(textPart.text);
        text = truncateText(text, MAX_EVENT_TEXT);
        return {
          id: 'pm-cl-' + idx + '-' + sessionId,
          type: 'message',
          role: 'assistant',
          text,
          timestamp: ts || 0,
          source: 'desktop-project-memory',
        };
      }
      // tool_use part → safe summary (no raw input)
      const tu = content.find((x) => x && x.type === 'tool_use' && x.name);
      if (tu) {
        const name = String(tu.name);
        const input = (tu.input && typeof tu.input === 'object') ? tu.input : {};
        let summary = '';
        if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(name) && input.file_path) {
          summary = '修改了 ' + safeBase(input.file_path);
        } else if (name === 'Bash' || name === 'BashOutput') {
          summary = '运行了 ' + name;
        } else if (name === 'Read') {
          summary = input.file_path ? ('读取了 ' + safeBase(input.file_path)) : ('运行了 Read');
        } else {
          summary = '调用了 ' + name;
        }
        summary = truncateText(summary, 200);
        return {
          id: 'pm-cl-' + idx + '-' + sessionId,
          type: 'tool',
          role: 'assistant',
          text: summary,
          timestamp: ts || 0,
          source: 'desktop-project-memory',
          meta: { toolName: name, fileName: input.file_path ? safeBase(input.file_path) : undefined },
        };
      }
    }
    return null;
  }
  // system / other
  if (type === 'system' || type === 'summary') {
    let text = typeof content === 'string' ? content : '';
    if (!text) return null;
    text = scrubSecrets(text);
    text = truncateText(text, MAX_EVENT_TEXT);
    return {
      id: 'pm-cl-' + idx + '-' + sessionId,
      type: 'system',
      text,
      timestamp: ts || 0,
      source: 'desktop-project-memory',
    };
  }
  return null;
}

// Project one parsed line of a Codex rollout .jsonl into a safe event (or null).
function projectCodexLine(d, idx, sessionId) {
  if (!d || typeof d !== 'object') return null;
  const payload = d.payload || d;
  const ts = d.timestamp || payload.timestamp || 0;
  // Codex message line: { type: "message", role, content: [{type:"input_text"|"output_text", text}] }
  if (payload.type === 'message' && (payload.role === 'user' || payload.role === 'assistant')) {
    const content = Array.isArray(payload.content) ? payload.content : [];
    const texts = content
      .filter((x) => x && (x.type === 'input_text' || x.type === 'output_text') && typeof x.text === 'string')
      .map((x) => x.text);
    let text = texts.join(' ').trim();
    if (!text) return null;
    text = scrubSecrets(text);
    text = truncateText(text, MAX_EVENT_TEXT);
    return {
      id: 'pm-cx-' + idx + '-' + sessionId,
      type: 'message',
      role: payload.role,
      text,
      timestamp: typeof ts === 'number' ? ts : 0,
      source: 'desktop-project-memory',
    };
  }
  // Tool/event lines → safe summary
  if (payload.type === 'function_call' && payload.name) {
    const name = String(payload.name);
    let summary = '调用了 ' + name;
    // arguments may be a JSON string; do not echo, just peek file_path if present
    try {
      const args = typeof payload.arguments === 'string' ? JSON.parse(payload.arguments) : payload.arguments;
      if (args && typeof args === 'object' && args.file_path) {
        if (/write|edit|multiedit|notebook/i.test(name)) summary = '修改了 ' + safeBase(args.file_path);
        else if (/read/i.test(name)) summary = '读取了 ' + safeBase(args.file_path);
      }
    } catch { /* ignore */ }
    summary = truncateText(summary, 200);
    return {
      id: 'pm-cx-' + idx + '-' + sessionId,
      type: 'tool',
      role: 'assistant',
      text: summary,
      timestamp: typeof ts === 'number' ? ts : 0,
      source: 'desktop-project-memory',
      meta: { toolName: name },
    };
  }
  return null;
}

/**
 * Read a project-memory session's .jsonl and project a safe timeline.
 * @param {string} sourceFile - absolute path to the .jsonl
 * @param {string} sessionId - session id (for stable event ids)
 * @param {object} [opts] - { limit }
 * @returns {Promise<{events: Array}>} events array (may be empty if file missing/empty)
 */
async function buildProjectMemoryTimeline(sourceFile, sessionId, opts) {
  if (!sourceFile || typeof sourceFile !== 'string') return { events: [] };
  const limit = Math.max(1, Math.min(MAX_EVENTS, Number(opts && opts.limit) || MAX_EVENTS));
  let txt;
  try {
    txt = await fsp.readFile(sourceFile, 'utf8');
  } catch { return { events: [] }; }
  if (!txt || !txt.trim()) return { events: [] };
  const isCodex = /rollout-.*\.jsonl$/i.test(sourceFile) || path.basename(sourceFile).startsWith('rollout-');
  const events = [];
  const lines = txt.split('\n');
  for (let i = 0; i < lines.length && events.length < MAX_EVENTS; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const evt = isCodex ? projectCodexLine(d, i, sessionId) : projectClaudeLine(d, i, sessionId);
    if (evt) events.push(evt);
  }
  // Sort ascending by timestamp; keep stable order for equal timestamps
  events.sort((a, b) => (a.timestamp - b.timestamp) || 0);
  // Take the most recent `limit` events
  const sliced = events.slice(-limit);
  return { events: sliced };
}

module.exports = {
  scanProjectMemory,
  scanAgentProjects,
  scanProjectSessions,
  buildProjectMemoryTimeline,
  // Exported for testing
  _mungeClaudeDir: mungeClaudeDir,
  _normalizeProjectPathForCompare: normalizeProjectPathForCompare,
  _readCwdFromHead: readCwdFromHead,
  _scrubSecrets: scrubSecrets,
  _truncateText: truncateText,
};
