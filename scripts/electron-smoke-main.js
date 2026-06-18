/**
 * Electron smoke test — 验证 Electron 进程里 app.whenReady() 是否正常
 *
 * 用法：
 *   # 正常 Electron 模式（关掉 ELECTRON_RUN_AS_NODE）：
 *   set ELECTRON_RUN_AS_NODE= && npx electron scripts/electron-smoke-main.js
 *
 *   或者在 PowerShell：
 *   $env:ELECTRON_RUN_AS_NODE=""; npx electron scripts/electron-smoke-main.js
 *
 * 如果此脚本能打开窗口并在控制台输出 [smoke] OK，说明 Electron 本身可用；
 * 否则说明 Electron 安装或运行环境有问题。
 */
const { app, BrowserWindow } = require('electron');

console.log('[smoke] electron app type:', typeof app);
console.log('[smoke] app.whenReady type:', typeof app?.whenReady);

if (!app || typeof app.whenReady !== 'function') {
  console.error('[smoke] FATAL: app.whenReady is not a function — ELECTRON_RUN_AS_NODE is likely set');
  console.error('[smoke] Run: set ELECTRON_RUN_AS_NODE= && npx electron scripts/electron-smoke-main.js');
  process.exit(1);
}

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 600, height: 400 });
  win.loadURL('data:text/html,<h1 style="font-family:sans-serif;text-align:center;margin-top:40vh">Electron Smoke OK</h1>');
  console.log('[smoke] OK — Electron窗口已打开，app.whenReady() 正常');
  console.log('[smoke] 可通过 npx electron . 或 npm run app 继续验证完整应用');
});
