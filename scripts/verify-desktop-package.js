// 生产包内容守卫：验证 dist/win-unpacked/resources/app.asar 只含应该含的东西
// - 断言「必须存在」：微信链路 + 核心文件（保留微信版）
// - 断言「必须不存在」：垃圾/开发资产/移动端残留
// 用法：node scripts/verify-desktop-package.js
// 退出码：0 = 通过，1 = 失败
'use strict';
const fs = require('fs');
const path = require('path');
const { listPackage } = require('@electron/asar');

const ROOT = path.join(__dirname, '..');
const ASAR = path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar');

function fail(msg) { console.error('  ✗ ' + msg); process.exitCode = 1; }
function pass(msg) { console.log('  ✓ ' + msg); }

function asarList() {
  try {
    // 用 @electron/asar 读文件列表
    return listPackage(ASAR).map((l) => l.replace(/^\\/, '').replace(/\\/g, '/'));
  } catch (e) {
    console.error('  ✗ 无法读取 app.asar：' + e.message);
    console.error('    请先 npm run dist:win（或 dist:win 产物在 dist/win-unpacked/resources/app.asar）');
    process.exit(1);
  }
}

function sizeMB(bytes) { return (bytes / 1024 / 1024).toFixed(2) + ' MB'; }
function dirSizeMB(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  const walk = (d) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else total += st.size; } };
  walk(dir);
  return total;
}

console.log('\n=== 生产包内容守卫 (保留微信版) ===');
if (!fs.existsSync(ASAR)) { fail('app.asar 不存在：' + ASAR); process.exit(1); }
const list = asarList();
const has = (p) => list.some((l) => l === p || l.startsWith(p + '/') || l.startsWith(p + '\\'));

console.log('\n【必须存在】');
const mustExist = [
  'electron/main.js', 'electron/preload.js', 'electron/atomic-json.js', 'electron/safe-path.js',
  'electron/wechat/bridge.js', 'electron/wechat/driver.js', 'electron/wechat/env.js',
  'electron/wechat/ilink.js', 'electron/wechat/memory.js', 'electron/wechat/test-server.js',
  'server.js', 'public/index.html', 'public/app.js', 'public/style.css',
  'node_modules/node-pty',
];
let exOk = true;
for (const p of mustExist) { has(p) ? pass(p) : (fail(p), exOk = false); }

console.log('\n【必须不存在（垃圾/开发资产/移动端残留）】');
const mustNotExist = [
  'trae/', 'design-demos/', 'experiments/', 'docs/', 'tests/',
  'src-vendor/', 'public/mobile/', '.icon.html', '素材/',
  'smoke-mobile', 'verify-mobile',
];
// 顶层 main.js（electron/main.js 是正确入口，允许存在）
const hasTopLevelMain = list.some((l) => l === 'main.js');
let nxOk = true;
for (const p of mustNotExist) {
  if (list.some((l) => l.includes(p))) { fail(p + '（混入）'); nxOk = false; }
  else pass(p);
}
if (hasTopLevelMain) { fail('main.js（顶层残留）'); nxOk = false; }
else pass('main.js（顶层）');

console.log('\n【体积报告】');
const winUnpacked = path.join(ROOT, 'dist', 'win-unpacked');
const exeFiles = fs.existsSync(winUnpacked) ? fs.readdirSync(winUnpacked).filter((n) => /\.exe$/i.test(n)) : [];
const exeSize = exeFiles.reduce((s, n) => s + (fs.existsSync(path.join(winUnpacked, n)) ? fs.statSync(path.join(winUnpacked, n)).size : 0), 0);
console.log('  win-unpacked 总大小:  ' + sizeMB(dirSizeMB(winUnpacked)));
console.log('  app.asar 大小:        ' + sizeMB(fs.statSync(ASAR).size));
const unpacked = path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar.unpacked');
console.log('  app.asar.unpacked:    ' + sizeMB(dirSizeMB(unpacked)));
if (exeSize) console.log('  FanBox.exe:            ' + sizeMB(exeSize));
console.log('  app.asar 文件数:      ' + list.length);

console.log('\n【最大 20 个打包文件】');
const sized = list.map((l) => {
  try { return { p: l, s: fs.statSync(path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar.unpacked', l)).size }; } catch { return { p: l, s: 0 }; }
}).sort((a, b) => b.s - a.s).slice(0, 20);
for (const x of sized) console.log('  ' + sizeMB(x.s).padStart(10) + '  ' + x.p);

console.log(exOk && nxOk ? '\n守卫通过 ✓' : '\n守卫失败 ✗');
process.exit(exOk && nxOk ? 0 : 1);
