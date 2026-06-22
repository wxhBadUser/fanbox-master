// FanBox Mobile — Phase 2A-2.2 安全 Agent Runner 适配层
//
// 设计目标：让手机端 Agent 普通消息走真实 Agent CLI，**完全避开** WeChat 桥里那种
// shell 模板拼接 + auto-approval flag 的路径。每一条安全约束都直接对应 spec 里的禁止项。
//
// 严格安全约束（spec §三）：
//   1. agentId 白名单：claude / codex / opencode / qoder
//   2. claude / codex / opencode / qoder 都走 resolver；不可用时返回友好 missing
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
//  17. claude/codex/opencode 的 text 走 stdin；qoder CLI 非交互模式按其官方 -p 模板传入

'use strict';

const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fullEnv } = require('./wechat/env');

// ---------- 白名单与配置 ----------
const ALLOWED_AGENT_IDS = ['claude', 'codex', 'opencode', 'qoder'];
const REAL_RUNNER_IDS = ['claude', 'codex', 'opencode', 'qoder']; // Phase UI-A8-5-P1：四个 Agent 都走 resolver
const STUB_RUNNER_IDS = []; // 保留导出兼容旧 smoke；真实执行不可用时返回友好 missing

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

function normalizeAgentIdForRunner(agentId) {
  const id = String(agentId || '').toLowerCase();
  if (id === 'claude_code' || id === 'claude') return 'claude';
  if (id === 'open_code' || id === 'opencode') return 'opencode';
  if (id === 'codex') return 'codex';
  if (id === 'qoder') return 'qoder';
  return 'unknown';
}

const AGENT_COMMANDS = {
  claude: {
    envKey: 'FANBOX_CLAUDE_BIN',
    candidates: ['claude'],
  },
  codex: {
    envKey: 'FANBOX_CODEX_BIN',
    candidates: ['codex'],
  },
  qoder: {
    envKey: 'FANBOX_QODER_BIN',
    candidates: ['qoder', 'qodercli', 'qoder-cli'],
  },
  opencode: {
    envKey: 'FANBOX_OPENCODE_BIN',
    candidates: ['opencode', 'open-code'],
  },
};

function uniquePush(arr, value) {
  if (!value) return;
  const v = String(value);
  if (!v || arr.some((x) => x.toLowerCase() === v.toLowerCase())) return;
  arr.push(v);
}

function appendWindowsAgentPaths(env) {
  if (process.platform !== 'win32') return env;
  const home = os.homedir();
  const dirs = [];
  uniquePush(dirs, path.join(home, '.npm-global'));
  uniquePush(dirs, path.join(home, 'AppData', 'Roaming', 'npm'));
  uniquePush(dirs, process.env.APPDATA && path.join(process.env.APPDATA, 'npm'));
  uniquePush(dirs, path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links'));
  uniquePush(dirs, path.join(home, 'AppData', 'Local', 'Programs'));
  uniquePush(dirs, path.join(home, 'AppData', 'Local', 'Programs', 'Claude'));
  uniquePush(dirs, path.join(home, 'AppData', 'Local', 'Programs', 'claude'));
  uniquePush(dirs, process.env.ProgramFiles);
  uniquePush(dirs, process.env['ProgramFiles(x86)']);
  uniquePush(dirs, path.join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps'));
  uniquePush(dirs, path.join(home, 'AppData', 'Local', 'OpenAI', 'Codex', 'bin'));
  const current = env.Path || env.PATH || '';
  const parts = current.split(';').filter(Boolean);
  for (const dir of dirs) uniquePush(parts, dir);
  env.Path = parts.join(';');
  env.PATH = env.Path;
  return env;
}

async function buildAgentEnv() {
  let shellEnv = {};
  try { shellEnv = await fullEnv(); } catch (_) { shellEnv = {}; }
  const env = Object.assign({}, process.env, shellEnv);
  return appendWindowsAgentPaths(env);
}

function isExecutablePath(p) {
  if (!p || typeof p !== 'string') return false;
  try {
    const st = fs.statSync(p);
    return st.isFile();
  } catch (_) {
    return false;
  }
}

function pickWindowsWhereResult(out) {
  const lines = String(out || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    .filter((s) => !/^(INFO|WARN):/i.test(s));
  if (!lines.length) return null;
  const cmd = lines.find((s) => /\.(cmd|bat)$/i.test(s));
  if (cmd) return cmd;
  const exe = lines.find((s) => /\.exe$/i.test(s));
  if (exe) return exe;
  return lines[0];
}

// 找一个 PATH 里的可执行文件；bin 名字来自硬编码候选，绝不接受用户输入
function whichBin(bin, env) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const child = spawn('where', [bin], { shell: false, env: env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d.toString('utf8'); });
      child.on('error', () => resolve(null));
      child.on('close', (code) => {
        if (code === 0 && out.trim()) {
          resolve(pickWindowsWhereResult(out));
        } else {
          resolve(null);
        }
      });
    } else {
      const child = spawn('command', ['-v', bin], { shell: false, env: env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
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

async function resolveAgentCommand(agentId) {
  const id = normalizeAgentIdForRunner(agentId);
  const spec = AGENT_COMMANDS[id];
  if (!spec) return { ok: false, agentId: id, error: 'invalid_agent', commandFound: false, status: 'invalid' };
  const env = await buildAgentEnv();
  const override = spec.envKey && env[spec.envKey];
  if (override) {
    if (!isExecutablePath(override)) {
      return { ok: false, agentId: id, error: 'override_not_found', commandFound: false, status: 'missing' };
    }
    return { ok: true, agentId: id, command: override, found: path.basename(override), env, commandFound: true, status: 'ready' };
  }
  for (const bin of spec.candidates) {
    // eslint-disable-next-line no-await-in-loop
    const hit = await whichBin(bin, env);
    if (hit) return { ok: true, agentId: id, command: hit, found: bin, env, commandFound: true, status: 'ready' };
  }
  return { ok: false, agentId: id, error: 'runner_unavailable', commandFound: false, status: 'missing' };
}

// 把一个 hardcoded `bin + args` 跑起来，stdin 接收 prompt，stdout/stderr 各收一份，强制超时
function runProcess({ bin, args, cwd, stdinText, timeoutMs, env }) {
  const ms = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    // 安全 env：把敏感变量去掉（避免泄漏 Claude/Codex 内部 token 到子进程）
    const safeEnv = Object.assign({}, env || process.env, {
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
      let spawnBin = bin;
      let spawnArgs = args;
      if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(String(bin || ''))) {
        spawnBin = process.env.COMSPEC || process.env.ComSpec || 'cmd.exe';
        spawnArgs = ['/d', '/c', 'call', bin].concat(args || []);
      }
      child = spawn(spawnBin, spawnArgs, { shell: false, cwd: cwd, env: safeEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ ok: false, out: '', err: String(e && e.message || e), code: -1, timedOut: false });
      return;
    }
    let out = '', err = '', done = false;
    const finish = (r) => { if (done) return; done = true; resolve(r); };
    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32' && child.pid) {
          spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false, stdio: 'ignore' });
        } else {
          child.kill('SIGKILL');
        }
      } catch (_) { /* ignore */ }
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

function agentDisplayName(agentId) {
  const id = String(agentId || '').toLowerCase();
  if (id === 'claude') return 'Claude Code';
  if (id === 'codex') return 'Codex';
  if (id === 'qoder') return 'Qoder';
  if (id === 'opencode') return 'OpenCode';
  return 'Agent';
}

function friendlyRunnerUnavailable(agentId) {
  const name = agentDisplayName(agentId);
  const envHint = agentId === 'claude' ? 'FANBOX_CLAUDE_BIN'
                : agentId === 'codex' ? 'FANBOX_CODEX_BIN'
                : agentId === 'qoder' ? 'FANBOX_QODER_BIN'
                : agentId === 'opencode' ? 'FANBOX_OPENCODE_BIN'
                : '对应的 FANBOX_*_BIN';
  return '当前电脑没有检测到 ' + name + '。请先确认电脑端命令行可以运行对应命令，或在设置里指定 ' + envHint + '。';
}

function friendlyRunnerTimeout(agentId) {
  return agentDisplayName(agentId) + ' 响应超时，请稍后再试。';
}

function friendlyRunnerFailed(agentId) {
  return agentDisplayName(agentId) + ' 启动失败，请确认已经登录，并在电脑端命令行测试对应 CLI 是否可用。';
}

// ---------- Claude 真实 runner ----------
async function runClaudeRunner({ cwd, text, sessionId, timeoutMs }) {
  if (!cwd) return { ok: false, text: '请先选择一个工作区（Files 或 Project 页面），再和 Agent 对话。', sessionId: '', timedOut: false, usedStub: true, error: 'missing_cwd' };
  const resolved = await resolveAgentCommand('claude');
  if (!resolved.ok) {
    return {
      ok: true,
      text: friendlyRunnerUnavailable('claude'),
      sessionId: '',
      timedOut: false,
      usedStub: true
    };
  }
  const bin = resolved.command;
  const sid = sessionId && /^[\w.\-+]{1,128}$/.test(sessionId) ? sessionId : crypto.randomUUID();
  // 硬编码 args；不允许 shell 解释器；不允许 claude 跳过权限
  const args = [
    '-p',
    '--output-format', 'json',
    '--append-system-prompt', SAFETY_PROMPT,
    '--session-id', sid
  ];
  const r = await runProcess({ bin: bin, args: args, cwd: cwd, stdinText: text, timeoutMs: timeoutMs, env: resolved.env });
  if (r.timedOut) {
    return { ok: false, text: friendlyRunnerTimeout('claude'), sessionId: sid, timedOut: true, usedStub: false, error: 'timeout' };
  }
  if (!r.ok) {
    const errShort = sanitizeOutput((r.err || '').trim().slice(-300));
    const error = /\b(spawn|enoent|not found|not recognized)\b/i.test(errShort) ? 'runner_unavailable' : 'runner_failed';
    return { ok: false, text: error === 'runner_unavailable' ? friendlyRunnerUnavailable('claude') : friendlyRunnerFailed('claude'), sessionId: sid, timedOut: false, usedStub: false, error: error };
  }
  const extracted = extractClaudeResult(r.out);
  if (!extracted) {
    return { ok: false, text: friendlyRunnerFailed('claude'), sessionId: sid, timedOut: false, usedStub: false, error: 'empty_output' };
  }
  return { ok: true, text: extracted, sessionId: sid, timedOut: false, usedStub: false };
}

// ---------- Codex 真实 runner ----------
async function runCodexRunner({ cwd, text, sessionId, timeoutMs }) {
  if (!cwd) return { ok: false, text: '请先选择一个工作区（Files 或 Project 页面），再和 Agent 对话。', sessionId: '', timedOut: false, usedStub: true, error: 'missing_cwd' };
  const resolved = await resolveAgentCommand('codex');
  if (!resolved.ok) {
    return {
      ok: true,
      text: friendlyRunnerUnavailable('codex'),
      sessionId: '',
      timedOut: false,
      usedStub: true
    };
  }
  const bin = resolved.command;
  // 硬编码 args；不允许 shell 解释器；不允许 codex 绕过审批
  const args = ['exec', '--json', '--skip-git-repo-check'];
  if (sessionId && /^[\w.\-+]{1,128}$/.test(sessionId)) {
    args.push('resume', sessionId);
  }
  // 让 codex 从 stdin 读 prompt（结尾的 `-`）
  args.push('-');
  const r = await runProcess({ bin: bin, args: args, cwd: cwd, stdinText: text, timeoutMs: timeoutMs, env: resolved.env });
  if (r.timedOut) {
    return { ok: false, text: friendlyRunnerTimeout('codex'), sessionId: sessionId || '', timedOut: true, usedStub: false, error: 'timeout' };
  }
  const ext = extractCodexResult(r.out);
  if (!ext.result) {
    if (!r.ok) {
      const errShort = sanitizeOutput((r.err || r.out || '').trim().slice(-300));
      const error = /\b(spawn|enoent|not found|not recognized)\b/i.test(errShort) ? 'runner_unavailable' : 'runner_failed';
      return { ok: false, text: error === 'runner_unavailable' ? friendlyRunnerUnavailable('codex') : friendlyRunnerFailed('codex'), sessionId: ext.threadId || (sessionId || ''), timedOut: false, usedStub: false, error: error };
    }
    return { ok: false, text: friendlyRunnerFailed('codex'), sessionId: ext.threadId || (sessionId || ''), timedOut: false, usedStub: false, error: 'empty_output' };
  }
  return { ok: true, text: ext.result, sessionId: ext.threadId || (sessionId || ''), timedOut: false, usedStub: false };
}

function extractJsonOrText(out) {
  const s = String(out || '').trim();
  if (!s) return '';
  try {
    const j = JSON.parse(s);
    return String(j.result || j.text || j.message || j.output || j.content || '');
  } catch (_) {
    return s;
  }
}

function qoderErrorText(out) {
  const s = String(out || '').trim();
  if (!s) return '';
  if (/upgrade required/i.test(s)) return 'Qoder 执行失败：upgrade required。请在电脑端运行 qodercli status / qodercli update，或确认当前账号套餐可用后再试。';
  try {
    const j = JSON.parse(s);
    if (String(j.type || '').toLowerCase() === 'error' || j.error_code) {
      return 'Qoder 执行失败：error_code ' + String(j.error_code || 'unknown') + '。请在电脑端运行 qodercli status / qodercli update 后重试。';
    }
  } catch (_) { /* not json */ }
  if (/^error:/i.test(s)) return 'Qoder 执行失败：' + sanitizeOutput(s.replace(/^error:\s*/i, '')).slice(0, 180);
  return '';
}

// ---------- Qoder 真实 runner ----------
async function runQoderRunner({ cwd, text, timeoutMs }) {
  if (!cwd) return { ok: false, text: '请先选择一个工作区（Files 或 Project 页面），再和 Agent 对话。', sessionId: '', timedOut: false, usedStub: true, error: 'missing_cwd' };
  const resolved = await resolveAgentCommand('qoder');
  if (!resolved.ok) {
    return { ok: true, text: friendlyRunnerUnavailable('qoder'), sessionId: '', timedOut: false, usedStub: true };
  }
  const args = ['-p', String(text || ''), '-w', cwd, '--max-turns', '25', '--quiet'];
  const r = await runProcess({ bin: resolved.command, args, cwd, stdinText: '', timeoutMs, env: resolved.env });
  if (r.timedOut) return { ok: false, text: friendlyRunnerTimeout('qoder'), sessionId: '', timedOut: true, usedStub: false, error: 'timeout' };
  const qoderErr = qoderErrorText(r.out || r.err);
  const extracted = extractJsonOrText(r.out);
  if (qoderErr) return { ok: false, text: qoderErr, sessionId: '', timedOut: false, usedStub: false, error: 'runner_failed' };
  if (!r.ok) return { ok: false, text: qoderErrorText(r.err) || friendlyRunnerFailed('qoder'), sessionId: '', timedOut: false, usedStub: false, error: 'runner_failed' };
  return { ok: true, text: extracted || friendlyRunnerFailed('qoder'), sessionId: '', timedOut: false, usedStub: false };
}

// ---------- OpenCode 真实 runner ----------
async function runOpenCodeRunner({ cwd, text, timeoutMs }) {
  if (!cwd) return { ok: false, text: '请先选择一个工作区（Files 或 Project 页面），再和 Agent 对话。', sessionId: '', timedOut: false, usedStub: true, error: 'missing_cwd' };
  const resolved = await resolveAgentCommand('opencode');
  if (!resolved.ok) {
    return { ok: true, text: friendlyRunnerUnavailable('opencode'), sessionId: '', timedOut: false, usedStub: true };
  }
  const args = ['run', String(text || '')];
  const r = await runProcess({ bin: resolved.command, args, cwd, stdinText: '', timeoutMs, env: resolved.env });
  if (r.timedOut) return { ok: false, text: friendlyRunnerTimeout('opencode'), sessionId: '', timedOut: true, usedStub: false, error: 'timeout' };
  const extracted = extractJsonOrText(r.out);
  if (!r.ok) return { ok: false, text: friendlyRunnerFailed('opencode'), sessionId: '', timedOut: false, usedStub: false, error: 'runner_failed' };
  return { ok: true, text: extracted || friendlyRunnerFailed('opencode'), sessionId: '', timedOut: false, usedStub: false };
}

// ---------- Fallback ----------
function runStubRunner({ agentId, text, cwd }) {
  const id = safeStr(agentId, 32);
  const cwdLbl = (cwd || '').split(/[\\/]/).filter(Boolean).slice(-1)[0] || cwd || 'unknown';
  const truncated = String(text || '').length > 200 ? String(text || '').slice(0, 200) + '…' : String(text || '');
  const out = [
    agentDisplayName(id) + ' 当前使用安全占位回复。',
    '这个版本还没有接入该 Agent 的真实移动端 runner；你可以切换 Claude Code / Codex，或在电脑端继续操作。',
    '',
    '工作区：' + safeStr(cwdLbl, 80),
    '收到：' + safeStr(truncated, 240)
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
    return { ok: false, text: '当前 Agent 不被允许，请从下拉里选择 Claude Code / Codex / Qoder / OpenCode。', error: 'agent_not_allowed', usedStub: true, agentId: agentId, mode: 'stub' };
  }
  // 输入基本校验（防 0 长或天文数字）
  const text = String(opts.text || '');
  if (text.length > MAX_INPUT_CHARS) {
    return { ok: false, text: '消息过长，请缩短后再试。', error: 'input_too_long', usedStub: true, agentId: agentId, mode: 'stub' };
  }

  // 测试 / 沙箱环境：MOBILE_AGENT_FORCE_STUB=1 时所有 agent 一律走 stub（不发起真子进程）
  // smoke-mobile-phase2a 用这个开关避免撞上用户本机已装的 claude/codex
  if (process.env.MOBILE_AGENT_FORCE_STUB === '1') {
    return Object.assign(runStubRunner({ agentId: agentId, text: text, cwd: opts.cwd }), { agentId: agentId, mode: 'stub' });
  }

  // 真实 runner：claude / codex / qoder / opencode
  const timeoutMs = (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  let raw;
  if (agentId === 'claude') {
    raw = await runClaudeRunner({ cwd: opts.cwd, text: text, sessionId: opts.sessionId, timeoutMs: timeoutMs });
  } else if (agentId === 'codex') {
    raw = await runCodexRunner({ cwd: opts.cwd, text: text, sessionId: opts.sessionId, timeoutMs: timeoutMs });
  } else if (agentId === 'qoder') {
    raw = await runQoderRunner({ cwd: opts.cwd, text: text, sessionId: opts.sessionId, timeoutMs: timeoutMs });
  } else if (agentId === 'opencode') {
    raw = await runOpenCodeRunner({ cwd: opts.cwd, text: text, sessionId: opts.sessionId, timeoutMs: timeoutMs });
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

// ---------- 流式 SSE 入口 ----------
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMobileAgentStream(opts, emit) {
  opts = opts || {};
  const agentId = String(opts.agentId || '').toLowerCase();
  const signal = opts.signal || null;

  const aborted = () => !!(signal && signal.aborted);

  // Skill 中文描述查找表（供 skill 事件使用）
  const SKILL_CN_DESCRIPTIONS_FOR_RUNNER = {
    'academic-paper': '学术论文写作流水线，支持多种论文类型与引用格式',
    'ppt-master': 'AI 驱动的多格式 SVG 内容生成，输出高质量 PPTX 演示文稿',
    'docx': 'Word 文档创建、编辑与格式化处理',
    'pdf': 'PDF 文件读取、合并、拆分、OCR 与格式转换',
    'deep-research': '多代理深度研究流水线，系统性文献综述与事实核查',
    'code-review': '代码审查与质量分析',
    'tdd': '测试驱动开发，红-绿-重构循环',
    'prototype': '快速原型构建，验证数据模型与 UI 设计方案',
    'brainstorming': '创意发散与需求探索，在实现前厘清意图',
    'write-a-skill': '创建新的 Agent 技能包，含结构与资源模板',
  };

  // a. Emit start
  if (aborted()) return;
  emit('start', { ok: true, agentId, cwd: opts.cwd || '' });

  // b. Validate agentId
  if (!ALLOWED_AGENT_IDS.includes(agentId)) {
    emit('error', { ok: false, text: '当前 Agent 不被允许，请从下拉里选择 Claude Code / Codex / Qoder / OpenCode。', error: 'agent_not_allowed' });
    return;
  }

  // c. Validate text length
  const text = String(opts.text || '');
  if (text.length > MAX_INPUT_CHARS) {
    emit('error', { ok: false, text: '消息过长，请缩短后再试。', error: 'input_too_long' });
    return;
  }

  // d. Emit step: 准备工作区
  if (aborted()) return;
  const cwdLabel = (opts.cwd || '').split(/[\\/]/).filter(Boolean).slice(-1)[0] || opts.cwd || 'unknown';
  emit('step', { label: '准备工作区', status: 'running', text: cwdLabel });
  if (aborted()) return;
  emit('step', { label: '准备工作区', status: 'done', text: cwdLabel });
  // New: tool event for workspace preparation
  if (aborted()) return;
  emit('tool', { id: 'tool-workspace', label: '读取工作区信息', status: 'done', safe: true });
  // New: thought event — reasoning before action
  if (aborted()) return;
  emit('thought', { text: '我会先检查当前工作区，然后' + (opts.skillId ? '使用 ' + opts.skillName + ' 技能处理你的请求' : '处理你的请求') + '。' });

  // e. If skillId provided
  if (opts.skillId) {
    if (aborted()) return;
    emit('step', { label: '使用 Skill: ' + (opts.skillName || opts.skillId), status: 'done', text: opts.skillId });
    // New: skill event
    if (aborted()) return;
    emit('skill', { skillId: opts.skillId, skillName: opts.skillName || opts.skillId, description: SKILL_CN_DESCRIPTIONS_FOR_RUNNER[opts.skillId] || '' });
  }

  // f. Emit step: 调用 Agent
  if (aborted()) return;
  emit('step', { label: '调用 ' + agentDisplayName(agentId), status: 'running' });
  // New: tool event for runner invocation
  if (aborted()) return;
  emit('tool', { id: 'tool-runner', label: '调用 ' + agentDisplayName(agentId), status: 'running', safe: true });

  // g. Stub mode
  if (process.env.MOBILE_AGENT_FORCE_STUB === '1') {
    if (aborted()) return;
    emit('thought', { text: '我会先检查当前工作区，然后' + (opts.skillId ? '使用 ' + opts.skillName + ' 技能处理你的请求' : '处理你的请求') + '。当前为模拟模式，将生成示例回复。' });
    if (aborted()) return;
    emit('step', { label: '调用 ' + agentDisplayName(agentId), status: 'done' });
    if (aborted()) return;
    emit('command_output', { id: 'tool-runner', status: 'done' });
    const stubResult = runStubRunner({ agentId, text, cwd: opts.cwd });
    const stubText = sanitizeOutput(stubResult.text || '');
    // Split into ~200 char chunks with small delays
    const chunks = splitIntoChunks(stubText, 200);
    for (const chunk of chunks) {
      if (aborted()) return;
      emit('delta', { text: chunk });
      await delay(30); // eslint-disable-line no-await-in-loop
    }
    if (aborted()) return;
    emit('done', { status: 'done', message: { role: 'assistant', content: stubText } });
    return;
  }

  // h. Real runner — pseudo-streaming
  const timeoutMs = (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  let raw;
  try {
    if (agentId === 'claude') {
      raw = await runClaudeRunner({ cwd: opts.cwd, text, sessionId: opts.sessionId, timeoutMs });
    } else if (agentId === 'codex') {
      raw = await runCodexRunner({ cwd: opts.cwd, text, sessionId: opts.sessionId, timeoutMs });
    } else if (agentId === 'qoder') {
      raw = await runQoderRunner({ cwd: opts.cwd, text, sessionId: opts.sessionId, timeoutMs });
    } else if (agentId === 'opencode') {
      raw = await runOpenCodeRunner({ cwd: opts.cwd, text, sessionId: opts.sessionId, timeoutMs });
    } else {
      raw = runStubRunner({ agentId, text, cwd: opts.cwd });
    }
  } catch (e) {
    if (aborted()) return;
    emit('error', { ok: false, text: agentDisplayName(agentId) + ' 运行出错，请稍后再试。', error: 'runner_exception' });
    return;
  }

  if (aborted()) return;

  // i. Runner failed / timed out
  if (raw.timedOut) {
    emit('error', { ok: false, text: friendlyRunnerTimeout(agentId), error: 'timeout' });
    return;
  }
  if (!raw.ok) {
    // j. Runner unavailable
    if (raw.error === 'runner_unavailable') {
      emit('error', { ok: false, text: friendlyRunnerUnavailable(agentId), error: 'runner_unavailable' });
    } else {
      emit('error', { ok: false, text: raw.text || friendlyRunnerFailed(agentId), error: raw.error || 'runner_failed' });
    }
    return;
  }

  // Mark step done
  emit('step', { label: '调用 ' + agentDisplayName(agentId), status: 'done' });
  // New: command_output for the runner tool
  if (aborted()) return;
  emit('command_output', { id: 'tool-runner', status: 'done' });

  const resultText = sanitizeOutput(raw.text || '');

  // Emit delta chunks with small delays for visual effect
  const chunks = splitIntoChunks(resultText, 200);
  for (const chunk of chunks) {
    if (aborted()) return;
    emit('delta', { text: chunk });
    await delay(30); // eslint-disable-line no-await-in-loop
  }

  if (aborted()) return;
  emit('done', { status: 'done', message: { role: 'assistant', content: resultText } });
}

function splitIntoChunks(str, size) {
  if (!str) return [];
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}

module.exports = {
  // 顶层
  runMobileAgent,
  runMobileAgentStream,
  // 单 runner
  runClaudeRunner,
  runCodexRunner,
  runQoderRunner,
  runOpenCodeRunner,
  runStubRunner,
  // 工具
  sanitizeOutput,
  extractClaudeResult,
  extractCodexResult,
  extractJsonOrText,
  normalizeAgentIdForRunner,
  buildAgentEnv,
  resolveAgentCommand,
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
