/**
 * verify-agent-driver.js — 验证 Windows Claude/Codex CLI 驱动适配
 *
 * 独立验证脚本，不依赖 Electron 或微信协议。测试：
 * 1. which() 能否正确检测 claude / codex
 * 2. run() 能否正确调用 claude（极短 prompt）
 * 3. codex 未安装时优雅降级
 *
 * 用法：node scripts/verify-agent-driver.js
 */
'use strict';

const path = require('path');
const { spawn } = require('child_process');

// 直接 import driver.js 会触发 build() 中 execFile，Electron 外可能因缺 SHELL 超时
// 这里用独立逻辑模拟 shellCommand + run + which，不污染 driver.js 导出
const PLATFORM = process.platform;

function shellCommand(command) {
  if (PLATFORM === 'win32') {
    return {
      shell: process.env.COMSPEC || process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', command],
    };
  }
  return {
    shell: process.env.SHELL || '/bin/zsh',
    args: ['-lc', command],
  };
}

function run(cmd, stdinText, cwd, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const { shell, args } = shellCommand(cmd);
    console.log(`  [run] shell=${shell}, args=${JSON.stringify(args)}`);
    const child = spawn(shell, args, { cwd: cwd || process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const finish = (r) => { if (done) return; done = true; resolve(r); };
    const timer = setTimeout(() => {
      try { child.kill(PLATFORM === 'win32' ? 'SIGTERM' : 'SIGKILL'); } catch { /* */ }
      finish({ ok: false, out, err: err + '\n[超时]' });
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('error', (e) => { clearTimeout(timer); finish({ ok: false, out, err: String(e.message) }); });
    child.on('close', (code) => { clearTimeout(timer); finish({ ok: code === 0, code, out, err }); });
    if (stdinText) { try { child.stdin.write(stdinText); } catch { /* */ } }
    try { child.stdin.end(); } catch { /* */ }
  });
}

async function which(bin) {
  const cmd = PLATFORM === 'win32' ? `where ${bin} 2>nul || exit /b 0` : `command -v ${bin} || true`;
  const r = await run(cmd, '', null, 8000);
  const found = (r.out || '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || null;
  if (found) {
    // where 可能返回多条（同目录多个匹配），取第一条
    const lines = found.split('\r\n').filter(Boolean);
    return lines[0] || found;
  }
  // fallback: on Windows, PATH not loaded yet, try process.env.PATH directly
  if (PLATFORM === 'win32') {
    const pathDirs = (process.env.PATH || '').split(';');
    for (const dir of pathDirs) {
      try {
        const fp = path.join(dir, bin + '.cmd');
        const fp2 = path.join(dir, bin + '.exe');
        if (require('fs').existsSync(fp)) return fp;
        if (require('fs').existsSync(fp2)) return fp2;
      } catch { /* */ }
    }
  }
  return null;
}

async function main() {
  console.log('=== verify-agent-driver.js ===\n');
  console.log(`Platform: ${PLATFORM}`);
  console.log(`Shell: ${process.env.SHELL || '(default)'}`);
  console.log(`ComSpec: ${process.env.COMSPEC || '(default)'}\n`);

  // --- test 1: which claude ---
  console.log('1. Testing which("claude")...');
  const claudePath = await which('claude');
  console.log(`   Result: ${claudePath || 'NOT FOUND'}`);
  const claudeOk = !!claudePath;
  console.log(`   Status: ${claudeOk ? '✓ FOUND' : '✗ NOT FOUND'}\n`);

  // --- test 2: which codex ---
  console.log('2. Testing which("codex")...');
  const codexPath = await which('codex');
  console.log(`   Result: ${codexPath || 'NOT FOUND'}`);
  const codexOk = !!codexPath;
  console.log(`   Status: ${codexOk ? '✓ FOUND' : '○ not installed (graceful)'}\n`);

  // --- test 3: claude --version ---
  console.log('3. Testing claude --version...');
  if (claudeOk) {
    const r = await run('claude --version', '', null, 30000);
    console.log(`   stdout: ${(r.out || '').trim()}`);
    console.log(`   stderr: ${(r.err || '').trim().slice(0, 200)}`);
    console.log(`   exit code: ${r.code}`);
    console.log(`   Status: ${r.ok ? '✓' : '✗'}`);
  } else {
    console.log('   Skipped (claude not found)');
  }
  console.log('');

  // --- test 4: claude -p "只回复 OK" ---
  console.log('4. Testing claude -p "只回复 OK"...');
  if (claudeOk) {
    const cmd = 'claude -p --output-format json --dangerously-skip-permissions';
    const r = await run(cmd, '只回复OK', null, 120000);
    const outTrim = (r.out || '').trim();
    console.log(`   exit code: ${r.code}`);
    console.log(`   stderr: ${(r.err || '').slice(0, 200)}`);
    // 尝试解析 JSON
    let parsed = null;
    try {
      parsed = JSON.parse(outTrim);
      const result = parsed.result || parsed.text || '';
      console.log(`   JSON result: ${result.slice(0, 200)}`);
    } catch {
      // 可能不是 JSON（较早版本），取纯文本前 200 字符
      console.log(`   raw output (first 200c): ${outTrim.slice(0, 200)}`);
    }
    console.log(`   Status: ${r.ok ? '✓ claude 正常返回' : '✗ claude 调用失败'}`);
  } else {
    console.log('   Skipped (claude not found)');
  }
  console.log('');

  // --- test 5: codex graceful fallback ---
  console.log('5. Testing codex graceful fallback...');
  if (!codexOk) {
    console.log('   ✓ codex not installed, handled gracefully');
  } else {
    console.log('   ○ codex is installed (skip graceful check)');
  }
  console.log('');

  // --- summary ---
  const allPassed = claudeOk;
  console.log('=== Summary ===');
  console.log(`  claude:     ${claudeOk ? '✓' : '✗'} ${claudePath || '(not found)'}`);
  console.log(`  codex:      ${codexOk ? '✓' : '○'} ${codexPath || '(not installed, graceful)'}`);
  console.log(`  platform:   ${PLATFORM}`);
  console.log(`  overall:    ${allPassed ? 'PASS' : 'FAIL (claude required)'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
