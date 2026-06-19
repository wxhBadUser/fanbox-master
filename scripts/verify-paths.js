/**
 * verify-paths.js — 验证所有数据路径的统一性和一致性。
 * 在不修改代码的情况下，输出完整的路径表。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const APP_ROOT = path.resolve(__dirname, '..');

const PASS = '  ✓';
const FAIL = '  ✗';

// ============================================================
// 1. 默认配置路径约定
// ============================================================
const userDataElectron = path.join(HOME, 'AppData', 'Roaming', 'FanBox'); // app.getPath('userData') 在 Windows Electron 打包版下的典型值
const userDataElectronDev = path.join(HOME, 'AppData', 'Roaming', 'Electron'); // npm run app 开发版

const fanboxConfig = path.join(HOME, '.fanbox');
const wechatDataElectron = path.join(userDataElectron, 'wechat');
const wechatDataFallback = path.join(fanboxConfig, 'wechat');
const memoryData = path.join(fanboxConfig, 'memory');
const recordingsDataElectron = path.join(userDataElectron, 'recordings');
const windowStateElectron = path.join(userDataElectron, 'window-state.json');
const fanboxUserConfig = path.join(fanboxConfig, 'config.json');
const serverConfigDir = fanboxConfig; // server.js 用 ~/.fanbox
const claudeMemory = path.join(HOME, '.claude', 'memory');

console.log('');
console.log('=== 验证所有数据路径 ==============================');
console.log(`  主机: ${os.hostname()}`);
console.log(`  平台: ${process.platform}`);
console.log(`  用户: ${HOME}`);
console.log(`  CWD:  ${process.cwd()}`);
console.log('');

// ============================================================
// 2. 电子打包版路径（编译后 app.getPath('userData') 的典型值）
// ============================================================
console.log(`--- 打包版路径 (productName: FanBox) ---`);
console.log(`  app.getPath('userData') -> ${userDataElectron}`);
console.log(`  存在: ${fs.existsSync(userDataElectron) ? PASS : FAIL}`);

// ============================================================
// 3. 电子开发版路径（Electron 而非 FanBox）
// ============================================================
console.log(`--- 开发版路径 (npm run app) ---`);
console.log(`  app.getPath('userData') -> ${userDataElectronDev}`);

// ============================================================
// 4. ~/.fanbox 路径
// ============================================================
console.log(`--- 脚本 / fallback 路径 (~/.fanbox) ---`);
console.log(`  全局配置目录: ${fanboxConfig}`);
console.log(`  存在: ${fs.existsSync(fanboxConfig) ? PASS : FAIL}`);
if (fs.existsSync(fanboxConfig)) {
  const entries = fs.readdirSync(fanboxConfig, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(fanboxConfig, e.name);
    console.log(`    ├─ ${e.name}${e.isDirectory() ? '/' : ''}`);
  }
}

// ============================================================
// 5. 具体数据路径检查
// ============================================================
console.log('\n--- 数据路径检查 ---');

const checks = [
  // { label: '描述', devPath: '开发版路径', pkgPath: '打包版路径', fallbackPath: '脚本/fallback 路径', configPath: 'config 路径' }
  {
    label: '微信 account.json',
    devPath: path.join(userDataElectronDev, 'wechat', 'account.json'),
    pkgPath: path.join(userDataElectron, 'wechat', 'account.json'),
    fallbackPath: path.join(wechatDataFallback, 'account.json'),
    configPath: '', // bridge.js 中根据是否加载 electron 决定
    persist: true,
    sensitive: true,
  },
  {
    label: '微信会话状态',
    devPath: path.join(userDataElectronDev, 'wechat'),
    pkgPath: path.join(userDataElectron, 'wechat'),
    fallbackPath: path.join(wechatDataFallback),
    configPath: '',
    persist: true,
    sensitive: true,
  },
  {
    label: 'bridge session',
    devPath: path.join(userDataElectronDev, 'wechat'),
    pkgPath: path.join(userDataElectron, 'wechat'),
    fallbackPath: path.join(wechatDataFallback),
    configPath: '',
    persist: true,
    sensitive: false,
  },
  {
    label: 'Claude session ID',
    devPath: '', // 在 Claude 自身 session 中，不存 FanBox
    pkgPath: '',
    fallbackPath: '',
    configPath: '',
    persist: false,
    sensitive: false,
  },
  {
    label: 'memory 文件',
    devPath: memoryData,
    pkgPath: memoryData,
    fallbackPath: memoryData,
    configPath: '', // memory.js 固定使用 ~/.fanbox/memory
    persist: true,
    sensitive: false,
  },
  {
    label: 'terminal recordings',
    devPath: path.join(userDataElectronDev, 'recordings'),
    pkgPath: recordingsDataElectron,
    fallbackPath: path.join(fanboxConfig, 'recordings'),
    configPath: '',
    persist: true,
    sensitive: false,
  },
  {
    label: 'screenshots',
    devPath: path.join(os.homedir(), 'Desktop'), // 截图监听桌面
    pkgPath: path.join(os.homedir(), 'Desktop'),
    fallbackPath: path.join(os.homedir(), 'Desktop'),
    configPath: '',
    persist: false, // 截图临时文件，用户已保存
    sensitive: false,
  },
  {
    label: 'logs',
    devPath: '', // 当前没有专用日志目录
    pkgPath: '',
    fallbackPath: '',
    configPath: '',
    persist: true,
    sensitive: false,
  },
  {
    label: 'thumbnail cache',
    devPath: '',
    pkgPath: '',
    fallbackPath: '',
    configPath: '',
    persist: false,
    sensitive: false,
  },
  {
    label: 'user settings',
    devPath: fanboxUserConfig,
    pkgPath: fanboxUserConfig,
    fallbackPath: fanboxUserConfig,
    configPath: '', // main.js 硬编码 ~/.fanbox/config.json
    persist: true,
    sensitive: false,
  },
  {
    label: 'server.js config dir',
    devPath: serverConfigDir,
    pkgPath: serverConfigDir,
    fallbackPath: serverConfigDir,
    configPath: '',
    persist: true,
    sensitive: false,
  },
];

const header = [
  '数据项'.padEnd(24),
  '当前路径'.padEnd(62),
  '是否存在',
].join('');
const separator = '-'.repeat(header.length);
console.log(header);
console.log(separator);

for (const c of checks) {
  // 确定实际路径
  const paths = [];
  if (c.devPath) paths.push(c.devPath);
  if (c.pkgPath && c.pkgPath !== c.devPath) paths.push(c.pkgPath);
  if (c.fallbackPath && !paths.includes(c.fallbackPath)) paths.push(c.fallbackPath);
  const primaryPath = paths[0] || '(未指定)';
  const exists = fs.existsSync(primaryPath) ? PASS : FAIL;
  console.log(`${c.label.padEnd(24)} ${primaryPath.padEnd(62)} ${exists}`);
}

// ============================================================
// 6. 路径一致性分析
// ============================================================
console.log('\n--- 路径一致性分析 ---');

// 微信数据：bridge.js 动态切换 electron / fallback
const wechatPaths = new Set([
  path.join(userDataElectronDev, 'wechat'),
  path.join(userDataElectron, 'wechat'),
  wechatDataFallback,
]);
console.log(`  微信数据路径数: ${wechatPaths.size}${wechatPaths.size === 1 ? ' ✓ 唯一' : ' ✗ 存在多个路径'}`);
for (const wp of wechatPaths) {
  console.log(`    - ${wp}${fs.existsSync(wp) ? ' 存在' : ''}`);
}

// memory：始终使用 ~/.fanbox/memory，一致
console.log(`  memory 路径: ${memoryData}${fs.existsSync(memoryData) ? ' 存在' : ''}`);
console.log(`  user config 路径: ${fanboxUserConfig}${fs.existsSync(fanboxUserConfig) ? ' 存在' : ''}`);

// recordings
const recPaths = new Set([
  path.join(userDataElectronDev, 'recordings'),
  recordingsDataElectron,
]);
console.log(`  recordings 路径数: ${recPaths.size}${recPaths.size === 1 ? ' ✓ 唯一' : ' ✗ 存在多个路径'}`);
for (const rp of recPaths) {
  console.log(`    - ${rp}${fs.existsSync(rp) ? ' 存在' : ''}`);
}

// 窗口状态
console.log(`  window-state.json: ${windowStateElectron}${fs.existsSync(windowStateElectron) ? ' 存在' : ''}`);

// ============================================================
// 7. 主要数据文件是否存在
// ============================================================
console.log('\n--- 主要数据文件存在性 ---');
const dataFiles = [
  { label: 'account.json (packaged)', path: path.join(userDataElectron, 'wechat', 'account.json') },
  { label: 'account.json (dev)', path: path.join(userDataElectronDev, 'wechat', 'account.json') },
  { label: 'account.json (fallback)', path: path.join(wechatDataFallback, 'account.json') },
  { label: '~/.fanbox/config.json', path: fanboxUserConfig },
  { label: 'window-state.json (packaged)', path: windowStateElectron },
  { label: 'window-state.json (dev)', path: path.join(userDataElectronDev, 'window-state.json') },
  { label: '~/.claude/memory/', path: claudeMemory },
  { label: '~/.fanbox/memory/', path: memoryData },
];
for (const f of dataFiles) {
  const exists = fs.existsSync(f.path) ? PASS : FAIL;
  console.log(`  ${f.label.padEnd(36)} ${f.path.padEnd(72)} ${exists}`);
}

// ============================================================
// 8. 总结
// ============================================================
console.log('\n=== 路径验证完成 =================================');
console.log('');

// 如果 find 命令可用，扫描残留 .fanbox 目录
try {
  const { execSync } = require('child_process');
  const scan = execSync('find /c/Users -maxdepth 3 -name ".fanbox" -type d 2>nul || echo "N/A"', { encoding: 'utf8' }).trim();
  if (scan && scan !== 'N/A') {
    console.log(`>> 发现额外 .fanbox 目录:\n${scan}`);
  }
} catch { /* ok, no find on Windows */ }