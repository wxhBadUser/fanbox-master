/**
 * ai-memory.js — FanBox symbiotic memory thin bridge
 *
 * Narrow responsibilities:
 *  1. Locate ai-memory executable (PATH / %LOCALAPPDATA% / homedir)
 *  2. Query version
 *  3. Return status summary
 *  4. setup() — run official install-mcp + install-hooks per agent
 *  5. setEnabled(on) — write FanBox config.json memoryEnabled field
 *  6. resolveLaunch() — construct controlled managed-run argv (no arbitrary command/args)
 *  7. Read enabled state from config
 *
 * Security:
 *  - Renderer cannot pass arbitrary executable / args
 *  - Agent allowlist hardcoded: claude, codex, opencode
 *  - All spawns use shell:false
 */
'use strict';
const { execFile } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { writeJsonAtomicSync, readJsonSafe } = require('./atomic-json');

const CONFIG = path.join(os.homedir(), '.fanbox', 'config.json');

// Agent allowlist
const ALLOWED_AGENTS = new Set(['claude', 'codex', 'opencode']);

// Workstream name regex (matches ai-memory constraints)
const WORKSTREAM_RE = /^[A-Za-z0-9._-]{1,128}$/;

function findExecutableCandidates() {
  const candidates = [];
  if (process.env.PATH) {
    const sep = process.platform === 'win32' ? ';' : ':';
    const dirs = process.env.PATH.split(sep);
    for (const d of dirs) {
      const name = process.platform === 'win32' ? 'ai-memory.exe' : 'ai-memory';
      candidates.push(path.join(d, name));
    }
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.push(path.join(localAppData, 'ai-memory', 'ai-memory.exe'));
  }
  candidates.push(path.join(os.homedir(), '.local', 'bin', 'ai-memory'));
  return candidates;
}

let _cachedExe = null;
let _cachedExeChecked = false;

function findExecutable() {
  if (_cachedExeChecked) return _cachedExe;
  _cachedExeChecked = true;
  for (const c of findExecutableCandidates()) {
    try {
      if (fs.existsSync(c)) { _cachedExe = c; return _cachedExe; }
    } catch { /* skip */ }
  }
  return null;
}

function getVersion(exe) {
  return new Promise((resolve) => {
    execFile(exe, ['--version'], { timeout: 5000, windowsHide: true, shell: false }, (err, stdout) => {
      if (err) return resolve(null);
      const v = String(stdout || '').trim().split(/\s+/)[0] || null;
      resolve(v);
    });
  });
}

function readFanboxConfig() { return readJsonSafe(CONFIG, {}); }

function writeFanboxConfig(patch) {
  const c = readFanboxConfig();
  Object.assign(c, patch);
  writeJsonAtomicSync(CONFIG, c);
}

async function status() {
  const exe = findExecutable();
  if (!exe) {
    return { installed: false, executable: null, version: null, enabled: readFanboxConfig().memoryEnabled === true, error: null };
  }
  const version = await getVersion(exe);
  const cfg = readFanboxConfig();
  return { installed: true, executable: exe, version, enabled: cfg.memoryEnabled === true, error: null };
}

function setEnabled(on) {
  try {
    writeFanboxConfig({ memoryEnabled: !!on });
    return { ok: true, enabled: !!on };
  } catch (e) {
    return { ok: false, enabled: !on, error: e.code || e.message };
  }
}

async function setup() {
  const exe = findExecutable();
  if (!exe) return { ok: false, error: 'ai-memory not installed' };
  const agents = ['claude-code', 'codex', 'opencode'];
  const results = [];
  for (const agent of agents) {
    const mcpResult = await new Promise((resolve) => {
      execFile(exe, ['install-mcp', '--client', agent, '--apply'],
        { timeout: 30000, windowsHide: true, shell: false }, (err, stdout, stderr) => {
          resolve({ ok: !err, agent, step: 'install-mcp', stdout: String(stdout || ''), stderr: String(stderr || ''), err: err ? err.message : null });
        });
    });
    results.push(mcpResult);
    const hooksResult = await new Promise((resolve) => {
      execFile(exe, ['install-hooks', '--agent', agent, '--apply', '--project-strategy', 'repo-root'],
        { timeout: 30000, windowsHide: true, shell: false }, (err, stdout, stderr) => {
          resolve({ ok: !err, agent, step: 'install-hooks', stdout: String(stdout || ''), stderr: String(stderr || ''), err: err ? err.message : null });
        });
    });
    results.push(hooksResult);
  }
  const allOk = results.every((r) => r.ok);
  if (allOk) writeFanboxConfig({ memoryEnabled: true });
  return { ok: allOk, results };
}

function resolveLaunch({ workstream, firstLaunch, agent, yolo } = {}) {
  const exe = findExecutable();
  if (!agent || !ALLOWED_AGENTS.has(agent)) {
    return { ok: false, error: 'agent not in allowlist' };
  }
  if (!workstream || !WORKSTREAM_RE.test(workstream)) {
    return { ok: false, error: 'invalid workstream name' };
  }
  const argv = ['run', firstLaunch ? '--new' : '--workstream', workstream];
  if (yolo) argv.push('--yolo');
  argv.push(agent);
  return { ok: true, argv, executable: exe, installed: !!exe };
}

module.exports = { status, setEnabled, setup, resolveLaunch, findExecutable };
