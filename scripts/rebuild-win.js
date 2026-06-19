#!/usr/bin/env node
/**
 * rebuild-win.js — Windows 可复现的 electron-rebuild 包装
 *
 * == 问题 ==
 * node-pty 的 deps/winpty/src/winpty.gyp 用 <!() 执行 batch 文件：
 *   '<!(cmd /c "cd shared && GetCommitHash.bat")'
 *
 * 此命令有双重缺陷：
 *   ① `cd shared` 后 cmd.exe 不解析 .bat 文件名（cmd 固有行为）
 *   ② .\ 前缀中的 \U 触发 Python eval() unicode escape 错误（Python ≥3.12）
 *
 * == 修复 ==
 * 做两件事：
 *   ① 在 deps/winpty/src/ 下创建 GetVer.bat 作为 UpdateGenVersion.bat 的
 *      包装（避免 \U 出现在 .gyp 文件中）
 *   ② 临时 patch winpty.gyp 将两处命令改为直接 .\bat 调用
 *   ③ 运行 electron-rebuild
 *   ④ 恢复 winpty.gyp 原始内容
 *
 * GetVer.bat 内容：@call shared\UpdateGenVersion.bat %*
 *
 * == 不影响 ==
 * macOS / Linux：直接透传 electron-rebuild，完全不做任何操作。
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MODULE = 'node-pty';
const ROOT = path.join(__dirname, '..');
const PTY_DIR = path.join(ROOT, 'node_modules', MODULE);
const WINPTY_GYP = path.join(PTY_DIR, 'deps', 'winpty', 'src', 'winpty.gyp');
const GETVER_BAT = path.join(PTY_DIR, 'deps', 'winpty', 'src', 'GetVer.bat');
const OLD_GET = 'cd shared && GetCommitHash.bat';
const NEW_GET = '.\\GetCommitHash.bat';
const OLD_UPD = 'cd shared && UpdateGenVersion.bat';
const NEW_UPD = '.\\GetVer.bat';

function main() {
  const isWin = process.platform === 'win32';
  if (!fs.existsSync(PTY_DIR)) {
    console.error('[rebuild] node-pty 未安装');
    process.exit(1);
  }
  if (!isWin) {
    console.log('[rebuild] 非 Windows，透传 electron-rebuild');
    runRebuild();
    return;
  }

  // 1. 创建 GetVer.bat（UpdateGenVersion.bat 的包装，避免 \U 出现在 .gyp 中）
  ensureGetVerBat();

  // 2. 备份 + patch + rebuild
  const original = fs.readFileSync(WINPTY_GYP, 'utf8');
  let prevEnv = process.env.ELECTRON_RUN_AS_NODE;

  try {
    patchFile(original);
    delete process.env.ELECTRON_RUN_AS_NODE;
    runRebuild();
    console.log('[rebuild] ✓');
  } catch (err) {
    console.error('[rebuild] ✗', err.message);
    process.exit(1);
  } finally {
    try { fs.writeFileSync(WINPTY_GYP, original, 'utf8'); } catch {}
    if (prevEnv !== undefined) process.env.ELECTRON_RUN_AS_NODE = prevEnv;
  }
}

function ensureGetVerBat() {
  if (!fs.existsSync(path.dirname(GETVER_BAT))) return;
  if (fs.existsSync(GETVER_BAT)) {
    const cur = fs.readFileSync(GETVER_BAT, 'utf8').trim();
    if (cur === '@call shared\\UpdateGenVersion.bat %*') return; // 已存在且正确
  }
  fs.writeFileSync(GETVER_BAT, '@call shared\\UpdateGenVersion.bat %*\r\n', 'utf8');
  console.log('[rebuild] 创建 GetVer.bat ✓');
}

function patchFile(original) {
  let patched = original;
  if (!patched.includes(OLD_GET) && patched.includes(NEW_GET)) {
    console.log('[rebuild] 已 patch');
    return;
  }
  if (patched.includes(OLD_GET)) patched = patched.replace(OLD_GET, NEW_GET);
  if (patched.includes(OLD_UPD)) patched = patched.replace(OLD_UPD, NEW_UPD);
  if (patched !== original) {
    fs.writeFileSync(WINPTY_GYP, patched, 'utf8');
    console.log('[rebuild] patched');
  }
}

function runRebuild() {
  for (const name of ['electron-rebuild.cmd', 'electron-rebuild']) {
    const fp = path.join(ROOT, 'node_modules', '.bin', name);
    if (fs.existsSync(fp)) {
      execSync(`"${fp}" -f -w ${MODULE}`, { cwd: ROOT, stdio: 'inherit', env: process.env, shell: 'cmd.exe' });
      return;
    }
  }
  execSync(`npx electron-rebuild -f -w ${MODULE}`, { cwd: ROOT, stdio: 'inherit', env: process.env });
}

main();
