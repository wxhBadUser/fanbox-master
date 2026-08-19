/**
 * Feature regression tests — symbiotic memory, unlimited sessions, go-up navigation
 *
 * These tests run outside Electron (no playwright) and validate:
 *  - ai-memory bridge module loads, finds executable (or reports missing), validates inputs
 *  - Session limit constant is fully removed from source
 *  - Go-up button exists in HTML, goUp function exists in app.js
 *  - Package.json build whitelist includes ai-memory.js
 *  - Verify script includes ai-memory.js
 *
 * Usage: node tests/features.spec.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  if (ok) pass++; else fail++;
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ===== 1. ai-memory bridge module =====
console.log('\n--- ai-memory bridge module ---');
try {
  const mem = require('../electron/ai-memory');
  check('ai-memory module exports status', typeof mem.status === 'function', typeof mem.status);
  check('ai-memory module exports setEnabled', typeof mem.setEnabled === 'function', typeof mem.setEnabled);
  check('ai-memory module exports setup', typeof mem.setup === 'function', typeof mem.setup);
  check('ai-memory module exports resolveLaunch', typeof mem.resolveLaunch === 'function', typeof mem.resolveLaunch);
  check('ai-memory module exports findExecutable', typeof mem.findExecutable === 'function', typeof mem.findExecutable);

  // status() should not throw even when ai-memory is not installed
  mem.status().then((s) => {
    check('status() returns object', s && typeof s === 'object', JSON.stringify(s));
    check('status() has installed field', 'installed' in s, String(s.installed));
    check('status() has version field', 'version' in s, String(s.version));
    check('status() has enabled field', 'enabled' in s, String(s.enabled));
  }).catch((e) => check('status() does not throw', false, e.message));

  // resolveLaunch validation
  const r1 = mem.resolveLaunch({ agent: 'claude', workstream: 'test-ws', firstLaunch: true });
  check('resolveLaunch: valid claude firstLaunch returns ok', r1.ok === true, JSON.stringify(r1));
  check('resolveLaunch: argv contains --new', r1.argv && r1.argv.includes('--new'), JSON.stringify(r1.argv));
  check('resolveLaunch: argv contains claude', r1.argv && r1.argv.includes('claude'), JSON.stringify(r1.argv));

  const r2 = mem.resolveLaunch({ agent: 'codex', workstream: 'test-ws', firstLaunch: false });
  check('resolveLaunch: valid codex returns --workstream', r2.ok === true && r2.argv && r2.argv.includes('--workstream'), JSON.stringify(r2.argv));

  const r3 = mem.resolveLaunch({ agent: 'rm -rf /', workstream: 'ws' });
  check('resolveLaunch: injection agent rejected', r3.ok === false, JSON.stringify(r3));

  const r4 = mem.resolveLaunch({ agent: 'claude', workstream: '../../etc/passwd' });
  check('resolveLaunch: path-injection workstream rejected', r4.ok === false, JSON.stringify(r4));

  const r5 = mem.resolveLaunch({ agent: 'unknown-cli', workstream: 'ws' });
  check('resolveLaunch: non-allowlisted agent rejected', r5.ok === false, JSON.stringify(r5));

  const r6 = mem.resolveLaunch({ agent: 'claude' });
  check('resolveLaunch: missing workstream rejected', r6.ok === false, JSON.stringify(r6));

  // setEnabled returns correct shape
  const en = mem.setEnabled(true);
  check('setEnabled(true) returns object with enabled field', en && typeof en === 'object' && ('enabled' in en), JSON.stringify(en));
  check('setEnabled(true) ok=true or ok=false with error', (en.ok === true) || (en.ok === false && en.error), JSON.stringify(en));
  const dis = mem.setEnabled(false);
  check('setEnabled(false) returns ok+error shape', dis && typeof dis === 'object' && ('ok' in dis) && ('enabled' in dis), JSON.stringify(dis));
  check('setEnabled(false) ok=true or ok=false with error', (dis.ok === true && dis.enabled === false) || (dis.ok === false && dis.error), JSON.stringify(dis));
} catch (e) {
  check('ai-memory module loads', false, e.message);
}

// ===== 2. Session limit fully removed =====
console.log('\n--- Session limit removal ---');
try {
  const mainSrc = readFile('electron/main.js');
  check('main.js: no MAX_TERMINALS constant', !mainSrc.includes('const MAX_TERMINALS'), 'still present');
  check('main.js: no max_terminals_reached', !mainSrc.includes('max_terminals_reached'), 'still present');

  const appSrc = readFile('public/app.js');
  check('app.js: no MAX_TERMINAL_SESSIONS constant', !appSrc.includes('MAX_TERMINAL_SESSIONS'), 'still present');
  check('app.js: no "最多同时打开 10 个" toast', !appSrc.includes('最多同时打开 10 个'), 'still present');
  check('app.js: no "最多 10 个" toast', !appSrc.includes('最多 10 个'), 'still present');
} catch (e) {
  check('Session limit source scan', false, e.message);
}

// ===== 3. Go-up navigation =====
console.log('\n--- Go-up navigation ---');
try {
  const html = readFile('public/index.html');
  check('HTML: btn-up button exists', html.includes('id="btn-up"'), 'missing');
  check('HTML: btn-up has Backspace title', html.includes('返回上一级'), 'missing');

  const appSrc = readFile('public/app.js');
  check('app.js: goUp function defined', /function goUp\(/.test(appSrc), 'missing');
  check('app.js: renderBtnUp function defined', /function renderBtnUp\(/.test(appSrc), 'missing');
  check('app.js: renderBtnUp called from render', /renderBtnUp\(\)/.test(appSrc), 'missing');
  check('app.js: Backspace calls goUp', /goUp\(\)/.test(appSrc), 'missing');
  check('app.js: btn-up onclick bound', /btn-up.*onclick|onclick.*btn-up/.test(appSrc), 'missing');
} catch (e) {
  check('Go-up navigation source scan', false, e.message);
}

// ===== 4. Session menu shows count =====
console.log('\n--- Session menu count ---');
try {
  const appSrc = readFile('public/app.js');
  check('app.js: session count in title', appSrc.includes('· ${count}') || appSrc.includes('. ${count}'), 'missing');
  check('app.js: session count in menu head', appSrc.includes('当前打开的终端 ·'), 'missing');
} catch (e) {
  check('Session menu count scan', false, e.message);
}

// ===== 5. Memory IPC in main.js =====
console.log('\n--- Memory IPC handlers ---');
try {
  const mainSrc = readFile('electron/main.js');
  check('main.js: imports ai-memory', mainSrc.includes("require('./ai-memory')"), 'missing');
  check('main.js: memory:status handler', mainSrc.includes("ipcMain.handle('memory:status'"), 'missing');
  check('main.js: memory:set-enabled handler', mainSrc.includes("ipcMain.handle('memory:set-enabled'"), 'missing');
  check('main.js: memory:setup handler', mainSrc.includes("ipcMain.handle('memory:setup'"), 'missing');
  check('main.js: memory:resolve-launch handler', mainSrc.includes("ipcMain.handle('memory:resolve-launch'"), 'missing');
} catch (e) {
  check('Memory IPC source scan', false, e.message);
}

// ===== 6. Preload memory bridge =====
console.log('\n--- Preload memory bridge ---');
try {
  const preload = readFile('electron/preload.js');
  check('preload: fanboxMemory exposed', preload.includes('fanboxMemory'), 'missing');
  check('preload: fanboxMemory.status', preload.includes('memory:status'), 'missing');
  check('preload: fanboxMemory.setup', preload.includes('memory:setup'), 'missing');
  check('preload: fanboxMemory.setEnabled', preload.includes('memory:set-enabled'), 'missing');
  check('preload: fanboxMemory.resolveLaunch', preload.includes('memory:resolve-launch'), 'missing');
} catch (e) {
  check('Preload memory bridge scan', false, e.message);
}

// ===== 7. Packaging whitelist =====
console.log('\n--- Packaging whitelist ---');
try {
  const pkg = JSON.parse(readFile('package.json'));
  check('package.json: ai-memory.js in build.files', pkg.build.files.includes('electron/ai-memory.js'), JSON.stringify(pkg.build.files.filter(f => f.includes('memory'))));
} catch (e) {
  check('Packaging whitelist scan', false, e.message);
}

// ===== 8. Verify script includes ai-memory =====
console.log('\n--- Verify script ---');
try {
  const verify = readFile('scripts/verify-desktop-package.js');
  check('verify-desktop-package: ai-memory.js asserted', verify.includes('electron/ai-memory.js'), 'missing');
} catch (e) {
  check('Verify script scan', false, e.message);
}

// ===== 9. Static: no leftover TODOs/placeholders =====
console.log('\n--- Static quality checks ---');
try {
  const mainSrc = readFile('electron/main.js');
  const appSrc = readFile('public/app.js');
  const memSrc = readFile('electron/ai-memory.js');
  check('No "TODO implement later" in ai-memory.js', !memSrc.includes('TODO implement later'), 'found');
  check('No "placeholder" in ai-memory.js', !memSrc.toLowerCase().includes('placeholder'), 'found');
  check('No "mock" in ai-memory.js', !memSrc.toLowerCase().includes('mock'), 'found');
  check('No "fake memory" in ai-memory.js', !memSrc.toLowerCase().includes('fake memory'), 'found');
} catch (e) {
  check('Static quality scan', false, e.message);
}

// ===== 10. WeChat ClawBot preserved =====
console.log('\n--- WeChat ClawBot preservation ---');
try {
  const mainSrc = readFile('electron/main.js');
  check('main.js: wechat bridge still required', mainSrc.includes("require('./wechat/bridge')"), 'missing');
  check('main.js: wechat IPC handlers still present', mainSrc.includes("ipcMain.handle('wechat:env'"), 'missing');
} catch (e) {
  check('WeChat preservation scan', false, e.message);
}

// ===== 11. Session workstream mapping =====
console.log('\n--- Session workstream mapping ---');
try {
  const appSrc = readFile('public/app.js');
  check('app.js: sessCounter variable declared', appSrc.includes('let sessCounter'), 'missing');
  check('app.js: session has memory field with workstream', /sess\.memory\s*=\s*\{\s*workstream:/.test(appSrc), 'missing');
  check('app.js: memory.initialized defaults to false', /memory.*initialized:\s*false/.test(appSrc), 'missing');
  check('app.js: launchAgent calls fanboxMemory.resolveLaunch', appSrc.includes('fanboxMemory.resolveLaunch'), 'missing');
  check('app.js: launchAgent checks memory.enabled', appSrc.includes('memStatus') && appSrc.includes('enabled'), 'missing');
  check('app.js: firstLaunch uses !sess.memory.initialized', appSrc.includes('firstLaunch: !sess.memory.initialized'), 'missing');
  check('app.js: memory.initialized set true after resolve', appSrc.includes('sess.memory.initialized = true'), 'missing');
} catch (e) {
  check('Session workstream mapping scan', false, e.message);
}

// ===== 12. Memory settings UI =====
console.log('\n--- Memory settings UI ---');
try {
  const html = readFile('public/index.html');
  check('HTML: memory-status-section exists', html.includes('id="memory-status-section"'), 'missing');
  check('HTML: memory-toggle checkbox exists', html.includes('id="memory-toggle"'), 'missing');
  check('HTML: memory-setup-btn exists', html.includes('id="memory-setup-btn"'), 'missing');
  check('HTML: memory-status-text exists', html.includes('id="memory-status-text"'), 'missing');
  check('HTML: memory-version-text exists', html.includes('id="memory-version-text"'), 'missing');
  check('HTML: memory-detail exists', html.includes('id="memory-detail"'), 'missing');

  const appSrc = readFile('public/app.js');
  check('app.js: refreshMemoryStatus function defined', /function refreshMemoryStatus/.test(appSrc), 'missing');
  check('app.js: memory-toggle change handler', appSrc.includes('memory-toggle'), 'missing');
  check('app.js: memory-setup-btn click handler', appSrc.includes('memory-setup-btn'), 'missing');
  check('app.js: refreshMemoryStatus called from toggleSettings', /toggleSettings[^]*refreshMemoryStatus/.test(appSrc.replace(/\s+/g, ' ')), 'missing');
} catch (e) {
  check('Memory settings UI scan', false, e.message);
}

// ===== 13. Memory badge in session dropdown =====
console.log('\n--- Memory session badge ---');
try {
  const appSrc = readFile('public/app.js');
  check('app.js: memBadge in renderSessionMenu', appSrc.includes('memBadge'), 'missing');
  check('app.js: session-menu-memory class', appSrc.includes('session-menu-memory'), 'missing');

  const css = readFile('public/style.css');
  check('style.css: session-menu-memory style', css.includes('.session-menu-memory'), 'missing');
} catch (e) {
  check('Memory session badge scan', false, e.message);
}

// ===== Results =====
console.log('\n========== Feature Regression Tests ==========');
let p = 0;
for (const r of results) {
  console.log((r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.detail ? '  — ' + r.detail : ''));
  if (r.ok) p++;
}
console.log('\n' + p + '/' + results.length + ' passed');
process.exit(fail > 0 ? 1 : 0);
