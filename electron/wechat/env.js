// 复刻用户终端环境
//   macOS/Linux：跑一次交互式登录 shell 抓完整环境（PATH/代理/ANTHROPIC_BASE_URL 等自定义变量）
//   Windows：cmd.exe /d /s /c set 抓环境变量（打包后从开始菜单启动能拿到系统 PATH）

const { execFile } = require('child_process');

let cached = null; // Promise<env 对象>，只算一次

const userShell = () => process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh');
const PROXY_KEYS = ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY'];

// 跑 `$SHELL -ilc 'env'` 抓交互式登录 shell 的完整环境变量（PATH/代理/BASE_URL 等）
// 用独特分隔符包住 env 输出，把 .zshrc 里 echo/插件打印的噪声挡在外面
function dumpShellEnv() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // 用 cmd 的 set 命令获取环境变量（简单稳定，PATH 准确）
      execFile(process.env.COMSPEC || process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'set'], { timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        const out = String(stdout || '');
        const env = {};
        for (const line of out.split('\n').map((l) => l.trim()).filter(Boolean)) {
          const i = line.indexOf('=');
          if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
        }
        resolve(env);
      });
      return;
    }
    const marker = '__FANBOX_ENV_8f3a__';
    const cmd = `printf '%s\\n' '${marker}'; env; printf '%s\\n' '${marker}'`;
    execFile(userShell(), ['-ilc', cmd], { timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      const out = String(stdout || '');
      const seg = out.split(marker)[1] || ''; // 取两个 marker 之间的纯 env 段
      const env = {};
      for (const line of seg.split('\n')) {
        const i = line.indexOf('=');
        if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
      }
      resolve(env); // 抓不到（err 且无输出）→ 空对象，退回 process.env 打底
    });
  });
}

// 读 macOS 系统代理，转成 {https_proxy,...}；非 darwin / 没开代理 → 空对象
// TODO(win): Windows 代理检测暂未实现（可读注册表/IE 代理设置），目前返回空对象
function sysProxyEnv() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve({});
    execFile('scutil', ['--proxy'], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve({});
      const out = String(stdout || '');
      const grab = (k) => (out.match(new RegExp(`\\b${k} : (\\S+)`)) || [])[1];
      let url = '';
      if (grab('HTTPSEnable') === '1') url = `http://${grab('HTTPSProxy')}:${grab('HTTPSPort')}`;
      else if (grab('HTTPEnable') === '1') url = `http://${grab('HTTPProxy')}:${grab('HTTPPort')}`;
      else if (grab('SOCKSEnable') === '1') url = `socks5h://${grab('SOCKSProxy')}:${grab('SOCKSPort')}`;
      if (!url) return resolve({});
      resolve({ http_proxy: url, https_proxy: url, HTTP_PROXY: url, HTTPS_PROXY: url, all_proxy: url, ALL_PROXY: url });
    });
  });
}

async function build() {
  const shellEnv = await dumpShellEnv();
  const env = { ...process.env, ...shellEnv }; // process.env 打底，shell 导入的覆盖（PATH/代理/BASE_URL/key 等）
  if (!PROXY_KEYS.some((k) => env[k])) Object.assign(env, await sysProxyEnv()); // 仍无代理 → 系统代理兜底，不覆盖已有
  if (!/UTF-8/i.test(env.LC_ALL || env.LC_CTYPE || env.LANG || '')) env.LANG = 'en_US.UTF-8'; // claude/codex 含中文，保 UTF-8
  return env;
}

// 复刻后的完整环境（含代理兜底），只算一次后缓存
function fullEnv() {
  if (!cached) cached = build();
  return cached;
}

module.exports = { fullEnv };
