// FanBox Mobile — Phase 2A-2.2 安全 Agent Runner 适配层
//
// 设计目标：让手机端 Agent 普通消息走真实 Claude / Codex，**完全避开** WeChat 桥里那种
// shell 模板拼接 + auto-approval flag 的路径。每一条安全约束都直接对应 spec 里的禁止项。
//
// 严格安全约束（spec §三）：
//   1. agentId 白名单：claude / codex / opencode / qoder
//   2. 本轮真实执行只允许 claude / codex；opencode / qoder 继续 stub
//   3. cwd 必须固定为 session.cwd（调用方负责校验 allowed roots）
//   4. contextFiles 必须都在 allowed roots 内（调用方负责校验）
//   5. 不允许用户控制 executable
//   6. 不允许用户控制 args 模板
//   7. 不允许 shell 解释器模式
//   8. 不允许 pty
//   9. 不允许 auto-approval / unattended mode
//  10. 不允许 claude 跳过权限 / codex 绕过审批
//  11. 输出 scrub
//  12. 输出截断到 MAX_OUTPUT_CHARS
//  13. 失败时不返回 raw stdout/stderr
//  14. 单条 agent message 最多 MAX_OUTPUT_CHARS 字符
//  15. 强制超时（DEFAULT_TIMEOUT_MS）
//  16. claude/codex 内部 session id 不暴露给调用方
//  17. text 永远走 stdin，不进 argv

'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');

// ---------- 白名单与配置 ----------
const ALLOWED_AGENT_IDS = ['claude', 'codex', 'opencode', 'qoder'];
const REAL_RUNNER_IDS = ['claude', 'codex']; // 本轮真实接入
const STUB_RUNNER_IDS = ['opencode', 'qoder']; // 本轮继续 stub

const MAX_OUTPUT_CHARS = 4000;
const DEFAULT_TIMEOUT_MS = 120000; // 2 分钟；手机端单轮不能太久
const MAX_INPUT_CHARS = 4000; // 与 mobile-sessions 的输入上限对齐

// ---------- 安全提示（spec §四） ----------
const SAFETY_PROMPT = [
  'You are running from FanBox Mobile in a scoped workspace.',
  'Work only inside the current cwd.',
  'Do not perform redline actions without explicit desktop approval.',
  'Do not delete files or directories.',
  'Do not rewrite git history.',
  'Do not push, deploy, publish, submit forms, send third-party messages, upload sensitive data, modify secrets, modify .env, or change CI/CD/database/schema/migration/production data.',
  'If the user asks for a redline action, refuse and explain that desktop approval is required.'
].join('\n');

// ---------- 工具函数 ----------
function safeStr(s, max) {
  let out = String(s == null ? '' : s);
  if (max && out.length > max) out = out.slice(0, max) + '…';
  return out;
}

// 找一个 PATH 里的可执行文件；bin 名字硬编码，绝不接受用户输入
function whichBin(bin) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const child = spawn('where', [bin], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d.toString('utf8'); });
      child.on('error', () => resolve(null));
      child.on('close', (code) => {
        if (code === 0 && out.trim()) {
          // 取第一行
          const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null;
          resolve(first);
        } else {
          resolve(null);
        }
      });
    } else {
      const child = spawn('command', ['-v', bin], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d.toString('utf8'); });
      child.on('error', () => resolve(null));
      child.on('close', (code) => {
        if (code === 0 && out.trim()) {
          const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null;
          resolve(first);
        } else {
          resolve(null);
        }
      });
    }
  });
}

// 把一个 hardcoded `bin + args` 跑起来，stdin 接收 prompt，stdout/stderr 各收一份，强制超时
function runProcess({ bin, args, cwd, stdinText, timeoutMs }) {
  const ms = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    // 安全 env：把敏感变量去掉（避免泄漏 Claude/Codex 内部 token 到子进程）
    const safeEnv = Object.assign({}, process.env, {
      CI: '1',
      NO_COLOR: '1',
      // 清掉本进程里可能存在的关键凭据，避免被 echo 出来
      // 注意：这里只清我们确知的几个，Anthropic / OpenAI 真实环境变量
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      CLAUDE_CODE_OAUTH_TOKEN: '',
    });
    let child;
    try {
      child = spawn(bin, args, { shell: false, cwd: cwd, env: safeEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ ok: false, out: '', err: String(e && e.message || e), code: -1, timedOut: false });
      return;
    }
    let out = '', err = '', done = false;
    const finish = (r) => { if (done) return; done = true; resolve(r); };
    const timer = setTimeout(() => {
      try { child.kill(process.platform === 'win32' ? 'SIGTERM' : 'SIGKILL'); } catch (_) { /* ignore */ }
      finish({ ok: false, out: out, err: err + '\n[mobile-runner] Timeout after ' + ms + 'ms', code: -1, timedOut: true });
    }, ms);
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('error', (e) => { clearTimeout(timer); finish({ ok: false, out: out, err: String(e && e.message || e), code: -1, timedOut: false }); });
    child.on('close', (code) => { clearTimeout(timer); finish({ ok: code === 0, code: code, out: out, err: err, timedOut: false }); });
    try { child.stdin.write(stdinText == null ? '' : stdinText); child.stdin.end(); } catch (_) { /* ignore */ }
  });
}

// 清理输出：去 ANSI / scrub 敏感字段 / 截断
function sanitizeOutput(raw) {
  let s = String(raw == null ? '' : raw);
  // 去 ANSI 控制字符
  s = s.replace(/\x1b\[[0-9;]*m/g, '');
  // 抹掉 Bearer / sk- / API key / session id 之类
  s = s.replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/g, 'Bearer [redacted]');
  s = s.replace(/sk-[A-Za-z0-9_\-+]{8,}/g, 'sk-[redacted]');
  s = s.replace(/session[_-]?id["']?\s*[:=]\s*["']?[A-Za-z0-9._\-+]{8,}/gi, 'session_id=[redacted]');
  s = s.replace(/(?:claude|codex)[_ -]?session[_ -]?id["']?\s*[:=]\s*["']?[A-Za-z0-9._\-+]{8,}/gi, 'session_id=[redacted]');
  // 截断
  if (s.length > MAX_OUTPUT_CHARS) {
    s = s.slice(0, MAX_OUTPUT_CHARS) + '\n\n[mobile-runner] Output truncated to ' + MAX_OUTPUT_CHARS + ' chars';
  }
  return s;
}

// 从 codex JSONL 输出中提取最终 assistant 文本
function extractCodexResult(out) {
  let result = '', threadId = '';
  for (const line of String(out || '').split('\n')) {
    const t = line.trim(); if (!t || t[0] !== '{') continue;
    let o; try { o = JSON.parse(t); } catch (_) { continue; }
    if (o && o.type === 'thread.started' && o.thread_id) threadId = o.thread_id;
    const item = (o && (o.item || o.msg)) || o || {};
    const ty = String(item.type || o.type || '').toLowerCase();
    if (/agent_message|assistant|message\.completed|item\.completed/.test(ty)) {
      const txt = item.text || item.message || (item.content && item.content.text) || '';
      if (txt && typeof txt === 'string') result = txt;
    }
  }
  return { result, threadId };
}

// 从 claude JSON 输出中提取 result 文本
function extractClaudeResult(out) {
  const trimmed = String(out || '').trim();
  if (!trimmed) return '';
  // 优先按 JSON 解析
  try {
    const j = JSON.parse(trimmed);
    return String(j.result || j.text || '');
  } catch (_) { /* not JSON, fall through */ }
  // 兜底：JSONL 流式（逐行找 type=result）
  for (const line of trimmed.split('\n')) {
    const t = line.trim(); if (!t || t[0] !== '{') continue;
    let o; try { o = JSON.parse(t); } catch (_) { continue; }
    if (o && o.type === 'result' && typeof o.result === 'string') return o.result;
  }
  return '';
}

// ---------- Claude 真实 runner ----------
async function runClaudeRunner({ cwd, text, sessionId, timeoutMs }) {
  if (!cwd) return { ok: false, text: '[mobile-runner] missing cwd', sessionId: '', timedOut: false, usedStub: true };
  const bin = await whichBin('claude');
  if (!bin) {
    // CLI 不在 PATH：返回安全 stub 兜底（ok=true，因为用户拿到了一个有效回复；usedStub=true 标记非真实执行）
    return {
      ok: true,
      text: '[mobile-runner] Claude CLI not found in PATH. Falling back to scoped stub. Install Claude Code and ensure `claude` is on PATH to enable real responses.',
      sessionId: '',
      timedOut: false,
      usedStub: true
    };
  }
  const sid = sessionId && /^[\w.\-+]{1,128}$/.test(sessionId) ? sessionId : crypto.randomUUID();
  // 硬编码 args；不允许 shell 解释器；不允许 claude 跳过权限
  const args = [
    '-p',
    '--output-format', 'json',
    '--append-system-prompt', SAFETY_PROMPT,
    '--session-id', sid
  ];
  const r = await runProcess({ bin: bin, args: args, cwd: cwd, stdinText: text, timeoutMs: timeoutMs });
  if (r.timedOut) {
    return { ok: false, text: '[mobile-runner] Claude timed out after ' + (timeoutMs || DEFAULT_TIMEOUT_MS) + 'ms', sessionId: sid, timedOut: true, usedStub: false };
  }
  if (!r.ok) {
    // 失败：返回错误摘要（scrub 后），不返回 raw stdout
    const errShort = sanitizeOutput((r.err || '').trim().slice(-300));
    return { ok: false, text: '[mobile-runner] Claude failed: ' + (errShort || ('exit=' + r.code)), sessionId: sid, timedOut: false, usedStub: false };
  }
  const extracted = extractClaudeResult(r.out);
  if (!extracted) {
    return { ok: false, text: '[mobile-runner] Claude returned no text', sessionId: sid, timedOut: false, usedStub: false };
  }
  return { ok: true, text: extracted, sessionId: sid, timedOut: false, usedStub: false };
}

// ---------- Codex 真实 runner ----------
async function runCodexRunner({ cwd, text, sessionId, timeoutMs }) {
  if (!cwd) return { ok: false, text: '[mobile-runner] missing cwd', sessionId: '', timedOut: false, usedStub: true };
  const bin = await whichBin('codex');
  if (!bin) {
    // CLI 不在 PATH：返回安全 stub 兜底（ok=true）
    return {
      ok: true,
      text: '[mobile-runner] Codex CLI not found in PATH. Falling back to scoped stub. Install Codex CLI and ensure `codex` is on PATH to enable real responses.',
      sessionId: '',
      timedOut: false,
      usedStub: true
    };
  }
  // 硬编码 args；不允许 shell 解释器；不允许 codex 绕过审批
  const args = ['exec', '--json', '--skip-git-repo-check'];
  if (sessionId && /^[\w.\-+]{1,128}$/.test(sessionId)) {
    args.push('resume', sessionId);
  }
  // 让 codex 从 stdin 读 prompt（结尾的 `-`）
  args.push('-');
  const r = await runProcess({ bin: bin, args: args, cwd: cwd, stdinText: text, timeoutMs: timeoutMs });
  if (r.timedOut) {
    return { ok: false, text: '[mobile-runner] Codex timed out after ' + (timeoutMs || DEFAULT_TIMEOUT_MS) + 'ms', sessionId: sessionId || '', timedOut: true, usedStub: false };
  }
  const ext = extractCodexResult(r.out);
  if (!ext.result) {
    if (!r.ok) {
      const errShort = sanitizeOutput((r.err || r.out || '').trim().slice(-300));
      return { ok: false, text: '[mobile-runner] Codex failed: ' + (errShort || ('exit=' + r.code)), sessionId: ext.threadId || (sessionId || ''), timedOut: false, usedStub: false };
    }
    return { ok: false, text: '[mobile-runner] Codex returned no text', sessionId: ext.threadId || (sessionId || ''), timedOut: false, usedStub: false };
  }
  return { ok: true, text: ext.result, sessionId: ext.threadId || (sessionId || ''), timedOut: false, usedStub: false };
}

// ---------- OpenCode / Qoder：仍走 stub ----------
function runStubRunner({ agentId, text, cwd }) {
  const id = safeStr(agentId, 32);
  const cwdLbl = (cwd || '').split(/[\\/]/).filter(Boolean).slice(-1)[0] || cwd || 'unknown';
  const truncated = String(text || '').length > 200 ? String(text || '').slice(0, 200) + '…' : String(text || '');
  const out = [
    '[mobile-runner] This is a safe scoped stub for ' + id + '.',
    'Phase 2A-2.2 only connects Claude / Codex to real runners.',
    '',
    'Agent: ' + id,
    'Folder: ' + safeStr(cwdLbl, 80),
    'Received: ' + safeStr(truncated, 240),
    '',
    'No pty, no shell, no auto-approval. Real runner for this agent is not enabled in this build.'
  ].join('\n');
  return {
    ok: true,
    text: safeStr(out, MAX_OUTPUT_CHARS),
    sessionId: '',
    timedOut: false,
    usedStub: true
  };
}

// ---------- 顶层入口 ----------
async function runMobileAgent(opts) {
  opts = opts || {};
  const agentId = String(opts.agentId || '').toLowerCase();
  if (!ALLOWED_AGENT_IDS.includes(agentId)) {
    return { ok: false, text: '[mobile-runner] agent_not_allowed: ' + safeStr(agentId, 32), error: 'agent_not_allowed', usedStub: true, agentId: agentId, mode: 'stub' };
  }
  // 输入基本校验（防 0 长或天文数字）
  const text = String(opts.text || '');
  if (text.length > MAX_INPUT_CHARS) {
    return { ok: false, text: '[mobile-runner] input_too_long', error: 'input_too_long', usedStub: true, agentId: agentId, mode: 'stub' };
  }

  // 测试 / 沙箱环境：MOBILE_AGENT_FORCE_STUB=1 时所有 agent 一律走 stub（不发起真子进程）
  // smoke-mobile-phase2a 用这个开关避免撞上用户本机已装的 claude/codex
  if (process.env.MOBILE_AGENT_FORCE_STUB === '1') {
    return Object.assign(runStubRunner({ agentId: agentId, text: text, cwd: opts.cwd }), { agentId: agentId, mode: 'stub' });
  }

  if (STUB_RUNNER_IDS.includes(agentId)) {
    return Object.assign(runStubRunner({ agentId: agentId, text: text, cwd: opts.cwd }), { agentId: agentId, mode: 'stub' });
  }

  // 真实 runner：claude / codex
  const timeoutMs = (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  let raw;
  if (agentId === 'claude') {
    raw = await runClaudeRunner({ cwd: opts.cwd, text: text, sessionId: opts.sessionId, timeoutMs: timeoutMs });
  } else if (agentId === 'codex') {
    raw = await runCodexRunner({ cwd: opts.cwd, text: text, sessionId: opts.sessionId, timeoutMs: timeoutMs });
  } else {
    // 兜底（不该走到）
    return Object.assign(runStubRunner({ agentId: agentId, text: text, cwd: opts.cwd }), { agentId: agentId, mode: 'stub' });
  }

  // 输出 scrub + 截断
  const safeText = sanitizeOutput(raw.text || '');
  return {
    ok: !!raw.ok,
    text: safeText,
    // sessionId 是 claude/codex 内部 id，绝不外露给 mobile；调用方只能用作"续上下文"内部分发
    _internalSessionId: raw.sessionId || '',
    timedOut: !!raw.timedOut,
    usedStub: !!raw.usedStub,
    agentId: agentId,
    mode: 'real'
  };
}

module.exports = {
  // 顶层
  runMobileAgent,
  // 单 runner
  runClaudeRunner,
  runCodexRunner,
  runStubRunner,
  // 工具
  sanitizeOutput,
  extractClaudeResult,
  extractCodexResult,
  whichBin,
  runProcess,
  // 常量
  ALLOWED_AGENT_IDS,
  REAL_RUNNER_IDS,
  STUB_RUNNER_IDS,
  MAX_OUTPUT_CHARS,
  MAX_INPUT_CHARS,
  DEFAULT_TIMEOUT_MS,
  SAFETY_PROMPT
};
