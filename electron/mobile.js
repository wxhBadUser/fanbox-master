// FanBox Mobile Access — Phase 0A 核心模块
// -------------------------------------------------------------
// 职责：
//   1. 持久化 mobile 配置（config.json / tokens.json）到 ~/.fanbox/mobile/
//   2. 提供配对码生成 + 校验（仅保存 SHA256 hash，60s 过期，配对成功立即失效）
//   3. 提供 mobile token 校验（仅保存 SHA256 hash）
//   4. 独立 HTTP server 监听 0.0.0.0:mobilePort，但每个请求都先过 isLanIp
//   5. 不依赖 Electron，方便 node --check
//   6. 不读、不写、不删任何用户文件 —— 唯一文件副作用是 mobile 自己的 config/tokens
// -------------------------------------------------------------

'use strict';

const http = require('http');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fsp = require('fs').promises;
const fs = require('fs');

// Phase 2A-1：session 汇总 + mobile 偏好读写
const mobileSessions = require('./mobile-sessions');

// ---------- 路径 ----------

const HOME = os.homedir();
const MOBILE_DIR = path.join(HOME, '.fanbox', 'mobile');
const CONFIG_FILE = path.join(MOBILE_DIR, 'config.json');
const TOKENS_FILE = path.join(MOBILE_DIR, 'tokens.json');
const THUMB_CACHE_DIR = path.join(MOBILE_DIR, 'thumbs');
// Phase UI-A1：mobile 端 skills enable/disable 状态（只写 mobile 自己的 state，不改真实 skill 文件）
const SKILLS_STATE_FILE = path.join(MOBILE_DIR, 'skills-state.json');

const DEFAULT_PORT = 4580;
const PAIR_TTL_MS = 60_000;
const TOKEN_INACTIVE_MS = 24 * 60 * 60 * 1000; // 24 小时未使用自动失效
const MAX_LIST_ITEMS = 200;

// Phase 0B：只读 API 的硬性限制
const MAX_FILE_READ_DEFAULT = 256 * 1024;        // 256KB
const MAX_FILE_READ_LIMIT = 1024 * 1024;         // 1MB
const MAX_SEARCH_LIMIT_DEFAULT = 50;
const MAX_SEARCH_LIMIT_HARD = 100;
const MAX_SCREENSHOTS_DEFAULT = 20;
const MAX_SCREENSHOTS_HARD = 50;
const MAX_THUMB_WIDTH_DEFAULT = 240;
const MAX_THUMB_WIDTH_HARD = 512;
const SKILL_DESC_CUT_MOBILE = 300;               // 手机端 description 截断
const SEARCH_WALK_TIMEOUT_MS = 3000;             // 单次搜索总时间预算
const SEARCH_WALK_FILE_LIMIT = 5000;             // 单次搜索文件数上限

// Phase 1：Mobile Web UI 静态资源（公开访问，文件落盘，不进 token 校验）
const MOBILE_PUBLIC_DIR = path.join(__dirname, '..', 'public', 'mobile');
const MOBILE_STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
};
const MOBILE_STATIC_MAX = 256 * 1024; // 256KB 上限（防误把大文件当静态资源）

// ---------- LAN IP 判断 ----------

function isLanIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return false;
  // 兼容 IPv4-mapped IPv6
  let ip = rawIp.trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  // 兼容 IPv6 loopback
  if (ip === '::1') return true;
  if (ip === '127.0.0.1' || ip === 'localhost') return true;
  // IPv4 段判断
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = +m[1], b = +m[2], c = +m[3], d = +m[4];
  if (a < 0 || a > 255 || b < 0 || b > 255 || c < 0 || c > 255 || d < 0 || d > 255) return false;
  if (a === 10) return true;                                     // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;              // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                       // 192.168.0.0/16
  if (a === 169 && b === 254) return true;                       // link-local
  if (a === 127) return true;                                    // 127.0.0.0/8
  return false;                                                  // 公网一律拒绝
}

function isLoopbackIp(rawIp) {
  if (!rawIp) return false;
  const ip = rawIp.replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

// ---------- 原子读写 ----------

async function ensureDir() {
  await fsp.mkdir(MOBILE_DIR, { recursive: true });
}

async function readJson(file, fallback) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

let _chain = Promise.resolve();
function withFileLock(file, fallback, mutator) {
  const run = _chain.then(async () => {
    const cur = await readJson(file, fallback);
    const next = await mutator(cur) || cur;
    await ensureDir();
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    try {
      const fh = await fsp.open(tmp, 'w');
      try { await fh.writeFile(JSON.stringify(next, null, 2)); await fh.sync(); } finally { await fh.close(); }
      await fsp.rename(tmp, file);
    } catch (e) { await fsp.unlink(tmp).catch(() => {}); throw e; }
    return next;
  });
  _chain = run.catch(() => {});
  return run;
}

// ---------- 配对码 + token ----------

function genPairCode() {
  // 6 位数字，左侧补 0
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function genToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function genDeviceId() {
  return crypto.randomBytes(8).toString('hex');
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function genServerId() {
  return crypto.randomBytes(8).toString('hex');
}

// ---------- 默认 config ----------

function defaultConfig() {
  return {
    enabled: false,
    port: DEFAULT_PORT,
    serverId: genServerId(),
    pairCodeHash: null,
    pairCodeExpiresAt: 0,
  };
}

async function getConfig() {
  const cfg = await readJson(CONFIG_FILE, null);
  if (!cfg) return defaultConfig();
  return {
    enabled: cfg.enabled === true,
    port: Number.isFinite(cfg.port) ? cfg.port : DEFAULT_PORT,
    serverId: typeof cfg.serverId === 'string' ? cfg.serverId : genServerId(),
    pairCodeHash: typeof cfg.pairCodeHash === 'string' ? cfg.pairCodeHash : null,
    pairCodeExpiresAt: Number.isFinite(cfg.pairCodeExpiresAt) ? cfg.pairCodeExpiresAt : 0,
  };
}

async function saveConfig(patch) {
  return withFileLock(CONFIG_FILE, defaultConfig(), (cur) => ({ ...cur, ...patch }));
}

async function getTokens() {
  const data = await readJson(TOKENS_FILE, { tokens: [] });
  if (!Array.isArray(data.tokens)) return { tokens: [] };
  // 顺手清理 24h 未活跃（仅在读取时，不动磁盘）
  const now = Date.now();
  const cleaned = data.tokens.filter(t => {
    if (t.revoked) return false;
    if (!Number.isFinite(t.lastSeenAt)) return true;
    return (now - t.lastSeenAt) < TOKEN_INACTIVE_MS;
  });
  return { tokens: cleaned };
}

async function listAllTokens() {
  // 包含 revoked/过期 —— 仅给桌面端 status 用
  const data = await readJson(TOKENS_FILE, { tokens: [] });
  if (!Array.isArray(data.tokens)) return [];
  return data.tokens;
}

async function addTokenRecord(rec) {
  return withFileLock(TOKENS_FILE, { tokens: [] }, (cur) => {
    const list = Array.isArray(cur.tokens) ? cur.tokens : [];
    list.push(rec);
    cur.tokens = list;
    return cur;
  });
}

async function updateToken(tokenHash, mutator) {
  return withFileLock(TOKENS_FILE, { tokens: [] }, (cur) => {
    const list = Array.isArray(cur.tokens) ? cur.tokens : [];
    const idx = list.findIndex(t => t.tokenHash === tokenHash);
    if (idx >= 0) {
      const next = mutator(list[idx]) || list[idx];
      list[idx] = next;
    }
    cur.tokens = list;
    return cur;
  });
}

async function revokeAllTokens() {
  return withFileLock(TOKENS_FILE, { tokens: [] }, (cur) => {
    const list = Array.isArray(cur.tokens) ? cur.tokens : [];
    for (const t of list) t.revoked = true;
    cur.tokens = list;
    return cur;
  });
}

// ---------- LAN URLs ----------

// 虚拟接口黑名单：WSL / Hyper-V / Docker / VMware / VirtualBox / VPN / 蓝牙 / Apple awdl 等。
// 这些接口对 LAN 手机不可见，**不能**作为推荐地址返回。
const VIRTUAL_IFACE_PATTERNS = [
  // WSL
  /\bWSL\b/i,
  /\bHyper-?V\b/i,
  /Default Switch/i,
  // Docker
  /DockerNAT/i,
  /^veth[0-9a-f]/i,
  /^br-[a-f0-9]+/i,
  /^docker[0-9]+/i,
  // VMware
  /^VMware/i,
  /VMnet/i,
  // VirtualBox
  /VirtualBox/i,
  /^vboxnet/i,
  // VPN
  /^tun\d*/i,
  /^tap\d*/i,
  /^utun\d*/i,
  /^ppp\d*/i,
  /^ipsec\d*/i,
  /NordVPN/i,
  /WireGuard/i,
  /ExpressVPN/i,
  /Surfshark/i,
  /Tailshark/i,
  /Tailscale/i,
  /OpenVPN/i,
  // Apple wireless direct (低吞吐)
  /^awdl\d*/i,
  /^llw\d*/i,
  /^bridge\d+/i,
  // Misc 虚拟接口
  /vEthernet/i,
  /Internal Adapter/i,
  /Virtual\s+(Adapter|Ethernet)/i,
  /Bluetooth.*Network/i,
];

function isVirtualIface(name) {
  if (!name || typeof name !== 'string') return false;
  for (const re of VIRTUAL_IFACE_PATTERNS) if (re.test(name)) return true;
  return false;
}

// 跨平台「默认路由接口」检测（带 60s 缓存，避免每次 UI 刷新都 exec）
let _cachedDefaultIface = null;
let _cachedDefaultIfaceTime = 0;
const DEFAULT_ROUTE_TTL_MS = 60_000;

function getDefaultRouteIface() {
  try {
    const { execFileSync } = require('child_process');
    if (process.platform === 'win32') {
      // route print 0.0.0.0 —— 列：Network / Netmask / Gateway / Interface / Metric
      // 默认路由行：0.0.0.0  0.0.0.0  <gateway>  <interface_ip>  <metric>
      const out = execFileSync('route', ['print', '0.0.0.0'], { encoding: 'utf8', timeout: 2000, windowsHide: true });
      const lines = out.split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\S+)\s+(\S+)\s+\d+/);
        if (m) {
          const ifaceIp = m[2];
          const ifaces = os.networkInterfaces();
          for (const name of Object.keys(ifaces)) {
            for (const info of ifaces[name] || []) {
              if (info.family === 'IPv4' && info.address === ifaceIp) return name;
            }
          }
        }
      }
    } else if (process.platform === 'darwin') {
      // route -n get default —— 含 "interface: en0"
      const out = execFileSync('route', ['-n', 'get', 'default'], { encoding: 'utf8', timeout: 2000 });
      const m = out.match(/interface:\s*(\S+)/);
      if (m) return m[1];
    } else {
      // Linux: ip -4 route show default —— "default via 192.168.1.1 dev wlan0 ..."
      const out = execFileSync('ip', ['-4', 'route', 'show', 'default'], { encoding: 'utf8', timeout: 2000 });
      const m = out.match(/dev\s+(\S+)/);
      if (m) return m[1];
    }
  } catch (e) { /* 命令缺失/超时/解析失败 —— 静默回退到 score 排序 */ }
  return null;
}

function getDefaultRouteIfaceCached() {
  const now = Date.now();
  if (_cachedDefaultIfaceTime && (now - _cachedDefaultIfaceTime) < DEFAULT_ROUTE_TTL_MS) {
    return _cachedDefaultIface;
  }
  _cachedDefaultIface = getDefaultRouteIface();
  _cachedDefaultIfaceTime = now;
  return _cachedDefaultIface;
}

function scoreIface(info, name, defaultIface) {
  let score = 0;
  if (defaultIface && name === defaultIface) score += 1000; // 默认路由接口
  if (/^192\.168\./.test(info.address)) score += 200;       // 家庭网段最常见
  if (/^10\./.test(info.address)) score += 100;            // 企业内网
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(info.address)) score += 50; // 172.16-31 私网
  if (isVirtualIface(name)) score -= 1000;                  // 虚拟接口一律后置
  if (info.address.startsWith('169.254.')) score -= 100;   // link-local
  return score;
}

function makeUrlObj(c, port) {
  return {
    url: `http://${c.info.address}:${port}/mobile`,
    iface: c.name,
    address: c.info.address,
    score: c.score,
  };
}

// 核心：扫描所有 IPv4 接口，按"默认路由 > 192.168 > 10 > 172.16-31 > 排除虚拟"打分。
// 返回 { primary, others, fallback } —— primary 永远非 null（即便 fallback 也给个最佳猜测）。
function pickBestLanUrls(port) {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family !== 'IPv4') continue;
      if (info.internal) continue; // 127.0.0.1 跳过
      candidates.push({ name, info });
    }
  }
  const defaultIface = getDefaultRouteIfaceCached();
  for (const c of candidates) c.score = scoreIface(c.info, c.name, defaultIface);
  // 倒序：分数高 → 优先
  candidates.sort((a, b) => b.score - a.score);

  // 过滤掉负分（虚拟 + link-local）
  const good = candidates.filter(c => c.score >= 0);
  if (good.length > 0) {
    return {
      primary: makeUrlObj(good[0], port),
      others: good.slice(1).map(c => makeUrlObj(c, port)),
      fallback: false,
    };
  }
  // 全部被过滤（极少见：只有虚拟接口）—— 返回原列表 + fallback 标记
  return {
    primary: candidates[0] ? makeUrlObj(candidates[0], port) : null,
    others: candidates.slice(1).map(c => makeUrlObj(c, port)),
    fallback: true,
  };
}

function listLanUrls(port) {
  // 向后兼容：返回扁平 URL 数组（primary 在前）
  const pick = pickBestLanUrls(port);
  const out = [];
  if (pick.primary) out.push(pick.primary.url);
  for (const o of pick.others) out.push(o.url);
  return out;
}

// ---------- HTTP 工具 ----------

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  try {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    });
  } catch {}
  try { res.end(body); } catch {}
}

function sendText(res, code, text, type = 'text/plain; charset=utf-8') {
  try {
    res.writeHead(code, {
      'Content-Type': type,
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
    });
  } catch {}
  try { res.end(text); } catch {}
}

function getClientIp(req) {
  // 优先取 socket 真实地址（mobile server 是直连，无 reverse proxy）
  const sock = req.socket || req.connection;
  return (sock && (sock.remoteAddress || sock.address && sock.address && sock.address().address)) || '';
}

function getAuthToken(req) {
  const a = req.headers['authorization'];
  if (a && typeof a === 'string' && a.toLowerCase().startsWith('bearer ')) {
    return a.slice(7).trim();
  }
  const x = req.headers['x-fanbox-mobile-token'];
  if (typeof x === 'string') return x.trim();
  return '';
}

async function readJsonBody(req, max = 8 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > max) { reject(new Error('body_too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

// ---------- 配对码 + token 中间件 ----------

async function ensurePairCode() {
  const cfg = await getConfig();
  const now = Date.now();
  if (cfg.pairCodeHash && cfg.pairCodeExpiresAt > now) {
    return { ok: true, expiresAt: cfg.pairCodeExpiresAt };
  }
  return { ok: false, expiresAt: cfg.pairCodeExpiresAt || 0 };
}

async function startPairCode() {
  const code = genPairCode();
  const hash = sha256(code);
  const expiresAt = Date.now() + PAIR_TTL_MS;
  await saveConfig({ pairCodeHash: hash, pairCodeExpiresAt: expiresAt });
  return { pairCode: code, expiresAt, expiresIn: PAIR_TTL_MS / 1000 };
}

async function consumePairCode(code, deviceName) {
  const cfg = await getConfig();
  const now = Date.now();
  if (!cfg.pairCodeHash || !cfg.pairCodeExpiresAt) return { ok: false, error: 'no_pair_code' };
  if (cfg.pairCodeExpiresAt <= now) return { ok: false, error: 'pair_code_expired' };
  if (sha256(code) !== cfg.pairCodeHash) return { ok: false, error: 'invalid_pair_code' };
  // 立即清空（一次性）
  await saveConfig({ pairCodeHash: null, pairCodeExpiresAt: 0 });
  const token = genToken();
  const deviceId = genDeviceId();
  await addTokenRecord({
    id: deviceId,
    tokenHash: sha256(token),
    deviceName: (deviceName || 'Phone').slice(0, 60),
    pairedAt: now,
    lastSeenAt: now,
    scopes: ['read:status', 'read:files'],
    revoked: false,
  });
  return { ok: true, token, deviceId, scopes: ['read:status', 'read:files'] };
}

async function revokeToken(deviceId) {
  return withFileLock(TOKENS_FILE, { tokens: [] }, (cur) => {
    const list = Array.isArray(cur.tokens) ? cur.tokens : [];
    for (const t of list) {
      if (t.id === deviceId) t.revoked = true;
    }
    cur.tokens = list;
    return cur;
  });
}

// token 校验：返回 { ok, device, tokenHash } 或 { ok: false, reason }
async function validateToken(plainToken) {
  if (!plainToken) return { ok: false, reason: 'missing' };
  const hash = sha256(plainToken);
  const { tokens } = await getTokens();
  const rec = tokens.find(t => t.tokenHash === hash);
  if (!rec) return { ok: false, reason: 'invalid' };
  // 更新 lastSeenAt
  await updateToken(hash, (t) => { t.lastSeenAt = Date.now(); return t; });
  return { ok: true, device: rec, tokenHash: hash };
}

// ---------- 安全文件列表 ----------

// Phase 0A 允许的根：用户 HOME + FanBox 项目根 + 显式额外根
function allowedRoots() {
  const out = [HOME];
  // 兼容：尝试把当前 cwd 作为允许根（Electron 启动时为应用目录）
  try {
    const cwd = process.cwd();
    if (cwd && cwd !== HOME) out.push(cwd);
  } catch {}
  return out;
}

function normalizePath(p) {
  if (!p || typeof p !== 'string') return '';
  // 拒绝路径穿越 —— Phase 0A 只允许绝对路径且必须在 allowedRoots 内
  const trimmed = p.trim();
  if (!trimmed) return '';
  return path.resolve(trimmed);
}

function pathInAllowed(p) {
  const norm = normalizePath(p);
  if (!norm) return false;
  const roots = allowedRoots();
  return roots.some(r => {
    const rn = path.resolve(r);
    return norm === rn || norm.startsWith(rn + path.sep);
  });
}

// Phase 0B：在 allowedRoots 之上再叠加显式黑名单。即便路径落在 HOME 之内，
// 命中下列名单的文件也一律拒绝（保证手机端拿不到 FanBox 自己的 mobile/ 配置、
// .env、Claude/Codex 原始会话日志、Windows 系统目录等敏感数据）。
function isForbiddenPath(norm) {
  if (!norm || typeof norm !== 'string') return false;
  const n = path.resolve(norm);
  const low = n.toLowerCase();

  // 1) ~/.fanbox/mobile/ —— mobile 自己 config.json / tokens.json / 缩略图缓存
  const mobDir = path.resolve(MOBILE_DIR);
  if (n === mobDir || n.startsWith(mobDir + path.sep)) return true;

  // 2) ~/.fanbox/config.json 与 ~/.fanbox/account.json —— FanBox 自己的配置/账号
  for (const fname of ['config.json', 'account.json']) {
    if (low === path.join(HOME, '.fanbox', fname).toLowerCase()) return true;
  }

  // 3) HOME 根目录下的 .env / .env.* —— 项目级 env 也常放 HOME
  const homeEnv = path.join(HOME, '.env');
  if (low === homeEnv.toLowerCase() || low.startsWith(homeEnv.toLowerCase() + '.')) return true;
  // 任意目录下名为 .env 的文件直接禁（保守策略，避免 leak）
  const baseLower = path.basename(low);
  if (baseLower === '.env' || /^\.env\..+$/.test(baseLower)) return true;

  // 4) Claude / Codex 原始会话日志（绝不让手机看到这些 JSONL 路径）
  const claudeProj = path.resolve(path.join(HOME, '.claude', 'projects'));
  if (n === claudeProj || n.startsWith(claudeProj + path.sep)) return true;
  const codexSess = path.resolve(path.join(HOME, '.codex', 'sessions'));
  if (n === codexSess || n.startsWith(codexSess + path.sep)) return true;

  // 5) Windows 系统目录（C:\Windows、C:\Program Files 等）—— 全平台
  if (process.platform === 'win32') {
    const sysRoots = [
      path.resolve(process.env.windir || 'C:\\Windows'),
      path.resolve('C:\\Program Files'),
      path.resolve('C:\\Program Files (x86)'),
      path.resolve('C:\\ProgramData'),
    ];
    for (const r of sysRoots) {
      if (n === r || n.startsWith(r + path.sep)) return true;
    }
  }

  return false;
}

// 综合判定：必须在 allowedRoots 之内、且不在 forbidden 之列。
// 越界、命中黑名单一律返回 false（由调用方决定 403 还是 400）。
function pathAllowedSafe(p) {
  if (!p) return false;
  const norm = normalizePath(p);
  if (!norm) return false;
  if (isForbiddenPath(norm)) return false;
  return pathInAllowed(norm);
}

async function listDirSafe(p) {
  const norm = normalizePath(p);
  if (!norm) return { ok: false, error: 'invalid_path' };
  if (isForbiddenPath(norm)) return { ok: false, error: 'forbidden_path' };
  if (!pathInAllowed(norm)) return { ok: false, error: 'path_not_allowed' };
  let st;
  try { st = await fsp.stat(norm); } catch { return { ok: false, error: 'not_found' }; }
  if (!st.isDirectory()) return { ok: false, error: 'not_directory' };
  let entries;
  try { entries = await fsp.readdir(norm, { withFileTypes: true }); } catch { return { ok: false, error: 'unreadable' }; }
  const items = [];
  for (const e of entries.slice(0, MAX_LIST_ITEMS)) {
    try {
      const full = path.join(norm, e.name);
      const s = await fsp.stat(full).catch(() => null);
      items.push({
        name: e.name,
        path: full,
        isDir: e.isDirectory(),
        kind: e.isDirectory() ? 'dir' : 'file',
        size: s ? s.size : 0,
        mtime: s ? s.mtimeMs : 0,
      });
    } catch {}
  }
  return { ok: true, path: norm, items };
}

// ---------- Phase 0B：扩展名 / 类型 / MIME ----------

const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json', 'json5',
  'html', 'htm', 'css', 'scss', 'less', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'h', 'cpp', 'hpp', 'cc', 'm', 'mm', 'sh', 'bash', 'zsh', 'fish', 'sql', 'yml',
  'yaml', 'toml', 'ini', 'conf', 'xml', 'svg', 'vue', 'astro', 'php', 'lua',
  'r', 'dart', 'gradle', 'properties', 'gitignore', 'dockerfile', 'makefile', 'log',
  'csv', 'tsv', 'gql', 'graphql', 'prisma', 'plist', 'tex', 'rtf', 'srt', 'vtt', 'ass',
]);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic', 'heif', 'tiff', 'tif']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);
const PDF_EXT = new Set(['pdf']);
const ARCHIVE_EXT = new Set(['zip', 'jar', 'tar', 'tgz', 'gz', 'bz2', 'xz', '7z', 'rar']);

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
  ogv: 'video/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', pdf: 'application/pdf',
  md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8',
};

function extOf(name) {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  return name.slice(i + 1).toLowerCase();
}

function kindOf(name) {
  const e = extOf(name);
  if (IMAGE_EXT.has(e)) return 'image';
  if (VIDEO_EXT.has(e)) return 'video';
  if (AUDIO_EXT.has(e)) return 'audio';
  if (PDF_EXT.has(e)) return 'pdf';
  if (ARCHIVE_EXT.has(e)) return 'archive';
  if (TEXT_EXT.has(e) || /^(dockerfile|makefile|readme|license|\.[a-z]+rc)$/i.test(name)) return 'text';
  return 'other';
}

function mimeOf(name) {
  return MIME[extOf(name)] || 'application/octet-stream';
}

// 把后端任意抛出的错误归一成 4xx + 结构化 JSON，绝不漏 stack 给手机
function badReq(res, code, error) {
  return sendJson(res, code, { ok: false, error: error || 'bad_request' });
}

// 移动端 allowedRoots 列表（专用：给 /api/mobile/roots 用，不复用 desktop 语义）
function mobileAllowedRoots() {
  const out = [];
  for (const r of allowedRoots()) {
    try {
      const s = fs.statSync(r);
      if (s.isDirectory()) out.push({ name: path.basename(r) || r, path: r });
    } catch { /* skip */ }
  }
  return out;
}

// ============================================================
// Phase 0B API 1: GET /api/mobile/file
// 只读 + sandbox + size cap；图片/PDF/二进制不直接 base64。
// ============================================================
async function readFileMobile(p, maxRaw) {
  const norm = normalizePath(p);
  if (!norm) return { ok: false, error: 'invalid_path' };
  if (isForbiddenPath(norm)) return { ok: false, error: 'forbidden_path' };
  if (!pathInAllowed(norm)) return { ok: false, error: 'path_not_allowed' };

  let st;
  try { st = await fsp.stat(norm); } catch { return { ok: false, error: 'not_found' }; }
  if (!st.isFile()) return { ok: false, error: 'not_file' };

  const name = path.basename(norm);
  const kind = kindOf(name);
  const mime = mimeOf(name);
  const info = {
    ok: true,
    path: norm,
    name,
    kind,
    mime,
    size: st.size,
    mtime: st.mtimeMs,
  };

  // 二进制 / 图片 / PDF：只返回 metadata + thumbUrl + rawUrl
  // 手机端本轮不暴露 raw 字节流（rawUrl 留口子给 Phase 1，但 handler 里暂不实现 /api/mobile/file/raw）
  if (kind !== 'text' || kind === 'other') {
    info.thumbUrl = `/api/mobile/thumb?path=${encodeURIComponent(norm)}&w=240`;
    // 文本类小文件也补一个 thumbUrl（图标兜底用）
    if (kind === 'text' && st.size > 0) info.thumbUrl = `/api/mobile/thumb?path=${encodeURIComponent(norm)}&w=240`;
    return info;
  }

  // 文本类：按 max 读
  const wantMax = Math.max(1024, Math.min(MAX_FILE_READ_LIMIT, Number(maxRaw) || MAX_FILE_READ_DEFAULT));
  if (st.size > wantMax) {
    // 仅返回 metadata + previewTooLarge 标志
    info.previewTooLarge = true;
    info.max = wantMax;
    info.size = st.size;
    info.thumbUrl = `/api/mobile/thumb?path=${encodeURIComponent(norm)}&w=240`;
    return info;
  }

  // 全文返回（UTF-8）
  let text;
  try { text = await fsp.readFile(norm, 'utf8'); } catch { return { ok: false, error: 'unreadable' }; }
  info.text = text;
  info.truncated = false;
  return info;
}

// ============================================================
// Phase 0B API 2: GET /api/mobile/search
// 轻量 fuzzy 搜索：只走 HOME + 跳过重目录 + 时间预算。
// ============================================================
const SEARCH_IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache', '.venv', 'venv',
  '__pycache__', '.DS_Store', 'Pods', '.gradle', 'target', '.idea', '.vscode-test',
  'DerivedData', '.expo', '.turbo', 'vendor', '.svn', '.hg',
  'AppData', 'Local Settings', 'Application Data', '$Recycle.Bin',
  'System Volume Information', '.fanbox', '.claude', '.codex', '.agents',
]);

function fuzzyScore(q, t) {
  const ql = q.toLowerCase(), tl = t.toLowerCase();
  let qi = 0, score = 0, last = -1, streak = 0;
  for (let ti = 0; ti < tl.length && qi < ql.length; ti++) {
    if (tl[ti] === ql[qi]) {
      let pts = 10;
      if (ti === last + 1) { streak++; pts += streak * 8; } else streak = 0;
      if (ti === 0 || /[\/_\-. ]/.test(tl[ti - 1])) pts += 15;
      pts += Math.max(0, 8 - ti * 0.1);
      score += pts;
      last = ti; qi++;
    }
  }
  if (qi < ql.length) return -1;
  score -= (tl.length - ql.length) * 0.2;
  return score;
}

async function searchFilesMobile(query, rootPath, limitRaw) {
  const q = (query || '').trim();
  if (!q || q.length < 1) return { ok: true, query: '', items: [], truncated: false };
  const limit = Math.max(1, Math.min(MAX_SEARCH_LIMIT_HARD, Number(limitRaw) || MAX_SEARCH_LIMIT_DEFAULT));
  const root = normalizePath(rootPath) || HOME;
  if (!root) return { ok: false, error: 'invalid_path' };
  if (isForbiddenPath(root)) return { ok: false, error: 'forbidden_path' };
  if (!pathInAllowed(root)) return { ok: false, error: 'path_not_allowed' };

  const matches = [];
  const queue = [root];
  const deadline = Date.now() + SEARCH_WALK_TIMEOUT_MS;
  let fileCount = 0;
  let truncated = false;

  while (queue.length) {
    if (Date.now() > deadline || fileCount >= SEARCH_WALK_FILE_LIMIT) { truncated = true; break; }
    const dir = queue.shift();
    let dirents;
    try { dirents = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const d of dirents) {
      if (d.name.startsWith('.DS_Store')) continue;
      const full = path.join(dir, d.name);
      // 拒绝敏感路径
      if (isForbiddenPath(full)) continue;
      try {
        if (d.isSymbolicLink()) continue; // 拒绝符号链接防逃逸
        if (d.isDirectory()) {
          if (SEARCH_IGNORE_DIRS.has(d.name)) continue;
          queue.push(full);
        } else if (d.isFile()) {
          fileCount++;
          const s = fuzzyScore(q, d.name);
          if (s > 0) {
            let st; try { st = await fsp.stat(full); } catch { continue; }
            matches.push({
              name: d.name, path: full, isDir: false,
              kind: kindOf(d.name),
              size: st.size, mtime: st.mtimeMs,
              score: s,
            });
          }
        }
      } catch { /* */ }
      if (Date.now() > deadline || fileCount >= SEARCH_WALK_FILE_LIMIT) { truncated = true; break; }
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return { ok: true, query: q, items: matches.slice(0, limit), truncated };
}

// ============================================================
// Phase 0B API 3: GET /api/mobile/skills
// 只读扫描 3 个官方 skills 根目录，提取 name/source/description（截 300 字）。
// 不返回 skill 绝对路径、文件全文；不返回 hits/lastUsedAt 真实值（防 JSONL 路径暴露）。
// ============================================================
function skillFrontmatterMobile(txt) {
  const m = txt.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = m[1];
  const dm = fm.match(/(?:^|\r?\n)description\s*:\s*([\s\S]*?)(?=\r?\n[\w-]+\s*:|\s*$)/);
  let desc = dm ? dm[1].trim() : '';
  desc = desc.replace(/^[|>][+-]?\s*/, '').replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
  return { desc };
}

async function scanSkillDirMobile(root, source, label, out, disabled) {
  let names;
  try { names = await fsp.readdir(root, { withFileTypes: true }); } catch { return; }
  for (const n of names) {
    if (n.name.startsWith('.') || n.name === '_archive' || n.name === '_backups') continue;
    const fp = path.join(root, n.name);
    if (n.name === '_disabled') {
      if (n.isDirectory() && !disabled) await scanSkillDirMobile(fp, source, label, out, true);
      continue;
    }
    if (!n.isDirectory()) continue; // 残留在 root 的 .md 不计
    let desc = '', mtime = 0;
    try {
      const sm = path.join(fp, 'SKILL.md');
      const st = await fsp.stat(sm);
      mtime = st.mtimeMs;
      const fh = await fsp.open(sm, 'r');
      try {
        const buf = Buffer.alloc(Math.min(st.size, 8192));
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
        const head = buf.toString('utf8', 0, bytesRead);
        const fm = skillFrontmatterMobile(head);
        if (fm && fm.desc) desc = fm.desc.slice(0, SKILL_DESC_CUT_MOBILE);
      } finally { await fh.close(); }
    } catch { /* 缺 SKILL.md：description 留空 */ }
    out.push({
      name: n.name,
      source,
      enabled: !disabled,
      description: desc,
      // 不返回 path / dir / dir 索引（防路径暴露）
      // 不返回真实 hits/lastUsedAt（避免暴露 Claude/Codex JSONL 路径）
      hits: 0,
      lastUsedAt: 0,
    });
  }
}

async function readSkillsMobile() {
  const out = [];
  // 只扫三个公开根；不扫 plugin / project 级（避免路径膨胀）
  await scanSkillDirMobile(path.join(HOME, '.claude', 'skills'), 'claude', '~/.claude', out, false);
  await scanSkillDirMobile(path.join(HOME, '.codex', 'skills'), 'codex', '~/.codex', out, false);
  await scanSkillDirMobile(path.join(HOME, '.agents', 'skills'), 'agents', '~/.agents', out, false);
  return { ok: true, items: out };
}

// ============================================================
// Phase 0B API 4: GET /api/mobile/agents
// 同步探测 Claude/Codex/OpenCode/Qoder 四个 CLI 是否在 PATH 内。
// 不读 .env / config / token；不安装；不启动。
// ============================================================
const MOBILE_AGENTS = [
  { id: 'claude',   label: 'Claude Code', command: 'claude',   detect: ['claude'] },
  { id: 'codex',    label: 'Codex',       command: 'codex',    detect: ['codex'] },
  { id: 'opencode', label: 'OpenCode',    command: 'opencode', detect: ['opencode'] },
  { id: 'qoder',    label: 'Qoder CLI',   command: 'qoder',    detect: ['qoder', 'qodercli', 'qoder-cli'] },
];

function probeOne(bin) {
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where' : 'command';
    const args = isWin ? [bin] : ['-v', bin];
    execFile(cmd, args, { timeout: 4000, windowsHide: true, shell: false }, (err, stdout) => {
      if (err) return resolve(null);
      const first = String(stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || null;
      if (!first || /^(INFO|WARN):/i.test(first)) return resolve(null);
      return resolve(first);
    });
  });
}

async function readAgentsMobile() {
  const items = [];
  for (const a of MOBILE_AGENTS) {
    let found = null;
    for (const bin of a.detect) {
      // eslint-disable-next-line no-await-in-loop
      const hit = await probeOne(bin);
      if (hit) { found = bin; break; }
    }
    items.push({
      id: a.id,
      label: a.label,
      command: a.command,
      installed: !!found,
      hint: found ? '' : `未找到 ${a.command}，请先安装并加入 PATH。`,
    });
  }
  return { ok: true, items };
}

// ============================================================
// Phase 0B API 5: GET /api/mobile/usage
// 只返回 today/week 聚合 token；不返回原始 JSONL 路径、OAuth、API key。
// ============================================================
async function readClaudeUsageMobile() {
  const projDir = path.join(HOME, '.claude', 'projects');
  let dirs;
  try { dirs = await fsp.readdir(projDir); } catch { return null; }
  const now = Date.now();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const cutoff = dayStart.getTime();
  const weekCut = now - 7 * 86400000;
  let today = 0, week = 0, lastSeen = 0, found = false;
  // 只读最近 7 天改动的 jsonl 文件，控制 IO
  const files = [];
  await Promise.all(dirs.map(async (d) => {
    let names;
    try { names = await fsp.readdir(path.join(projDir, d)); } catch { return; }
    await Promise.all(names.filter(n => n.endsWith('.jsonl')).map(async (n) => {
      const fp = path.join(projDir, d, n);
      try {
        const st = await fsp.stat(fp);
        if (st.mtimeMs >= weekCut) files.push({ fp, st });
      } catch { /* */ }
    }));
  }));
  for (const { fp, st } of files) {
    let txt;
    try {
      const fh = await fsp.open(fp, 'r');
      try {
        // 限制读最近 512KB（足够覆盖新事件）
        const len = Math.min(st.size, 512 * 1024);
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, st.size - len);
        txt = buf.toString('utf8');
      } finally { await fh.close(); }
    } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
      let d; try { d = JSON.parse(line); } catch { continue; }
      const m = d && d.message, u = m && m.usage;
      if (!u || d.type !== 'assistant' || m.model === '<synthetic>') continue;
      const t = Date.parse(d.timestamp || '') || st.mtimeMs;
      if (t > lastSeen) lastSeen = t;
      const tot = (u.input_tokens || 0) + (u.output_tokens || 0)
                + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      if (t >= cutoff) today += tot;
      if (t >= weekCut) week += tot;
      found = true;
    }
  }
  return found ? { today, week, lastSeen } : null;
}

async function readCodexUsageMobile() {
  const sessDir = path.join(HOME, '.codex', 'sessions');
  const now = Date.now();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const cutoff = dayStart.getTime();
  const weekCut = now - 7 * 86400000;
  const files = [];
  const walk = async (dir, depth) => {
    if (depth > 3) return;
    let names;
    try { names = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const n of names) {
      const fp = path.join(dir, n.name);
      if (n.isDirectory()) await walk(fp, depth + 1);
      else if (n.isFile() && n.name.endsWith('.jsonl')) {
        try { const st = await fsp.stat(fp); files.push({ fp, st }); } catch { /* */ }
      }
    }
  };
  await walk(sessDir, 0);
  if (!files.length) return null;
  let today = 0, week = 0, lastSeen = 0, found = false;
  for (const { fp, st } of files) {
    if (st.mtimeMs < weekCut) continue;
    let txt;
    try {
      const fh = await fsp.open(fp, 'r');
      try {
        const buf = Buffer.alloc(Math.min(st.size, 512 * 1024));
        await fh.read(buf, 0, buf.length, st.size - buf.length);
        txt = buf.toString('utf8');
      } finally { await fh.close(); }
    } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line.includes('"token_count"')) continue;
      let d; try { d = JSON.parse(line); } catch { continue; }
      const tc = d && d.payload && d.payload.token_count;
      if (!tc) continue;
      const t = Date.parse(d.timestamp || '') || st.mtimeMs;
      if (t > lastSeen) lastSeen = t;
      const tot = (tc.input_tokens || 0) + (tc.output_tokens || 0);
      if (t >= cutoff) today += tot;
      if (t >= weekCut) week += tot;
      found = true;
    }
  }
  return found ? { today, week, lastSeen } : null;
}

async function readUsageMobile() {
  const [claude, codex] = await Promise.all([
    readClaudeUsageMobile().catch(() => null),
    readCodexUsageMobile().catch(() => null),
  ]);
  const claudeOut = claude
    ? { id: 'claude', label: 'Claude Code', todayTokens: claude.today, weekTokens: claude.week, available: true, lastSeenAt: claude.lastSeen || 0 }
    : { id: 'claude', label: 'Claude Code', todayTokens: 0, weekTokens: 0, available: false, lastSeenAt: 0 };
  const codexOut = codex
    ? { id: 'codex', label: 'Codex', todayTokens: codex.today, weekTokens: codex.week, available: true, lastSeenAt: codex.lastSeen || 0 }
    : { id: 'codex', label: 'Codex', todayTokens: 0, weekTokens: 0, available: false, lastSeenAt: 0 };

  // Phase 2B（R2 第一部分）：mobile runner usage（每次 mobile 端调用 runner 的本地记录）
  // 字段：runs（最近 N 条）、todayRuns、weekRuns、todayDurationMs、weekDurationMs
  // 显式不暴露：inputTokens / outputTokens / totalTokens / estimatedCost（无真实来源）
  const mobileRunner = await readMobileRunnerUsageMobile().catch(() => null);

  return {
    ok: true,
    summary: {
      todayTokens: claudeOut.todayTokens + codexOut.todayTokens,
      weekTokens: claudeOut.weekTokens + codexOut.weekTokens,
      // 新增：mobile runner 计数（与 token 解耦）
      todayRuns: mobileRunner ? mobileRunner.todayRuns : 0,
      weekRuns: mobileRunner ? mobileRunner.weekRuns : 0,
      todayDurationMs: mobileRunner ? mobileRunner.todayDurationMs : 0,
      weekDurationMs: mobileRunner ? mobileRunner.weekDurationMs : 0,
      todayInputChars: mobileRunner ? mobileRunner.todayInputChars : 0,
      todayOutputChars: mobileRunner ? mobileRunner.todayOutputChars : 0,
    },
    agents: [claudeOut, codexOut],
    // 新增：mobile runner usage 详情（无 token / cost / 原始 stdout）
    mobileRunner: mobileRunner || {
      ok: true,
      updatedAt: 0,
      todayRuns: 0,
      weekRuns: 0,
      todayDurationMs: 0,
      weekDurationMs: 0,
      todayInputChars: 0,
      todayOutputChars: 0,
      byAgent: [],
      byCwd: [],
      recent: []
    }
  };
}

// Phase 2B：读 mobile runner usage 并按 today / week / agent / cwd 聚合
// 路径与 schema 由 mobile-sessions.js 的 MOBILE_USAGE_FILE 决定
async function readMobileRunnerUsageMobile(filter) {
  const sessions = require('./mobile-sessions.js');
  const obj = await sessions.readMobileUsage();
  const runs = Array.isArray(obj.runs) ? obj.runs : [];
  const now = Date.now();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const todayCut = dayStart.getTime();
  const weekCut = now - 7 * 86400000;

  // 可选过滤
  const agentFilter = (filter && typeof filter.agentId === 'string') ? filter.agentId : null;
  const cwdFilter = (filter && typeof filter.cwd === 'string') ? filter.cwd : null;

  const filtered = runs.filter(r => {
    if (!r || typeof r !== 'object') return false;
    if (agentFilter && r.agentId !== agentFilter) return false;
    if (cwdFilter && r.cwd !== cwdFilter) return false;
    return true;
  });

  // 聚合
  let todayRuns = 0, weekRuns = 0, todayDurationMs = 0, weekDurationMs = 0;
  let todayInputChars = 0, todayOutputChars = 0;
  const byAgentMap = new Map();
  const byCwdMap = new Map();

  for (const r of filtered) {
    const ts = (typeof r.startedAt === 'number') ? r.startedAt : 0;
    const dur = (typeof r.durationMs === 'number') ? r.durationMs : 0;
    if (ts >= todayCut) {
      todayRuns += 1;
      todayDurationMs += dur;
      todayInputChars += (typeof r.inputChars === 'number') ? r.inputChars : 0;
      todayOutputChars += (typeof r.outputChars === 'number') ? r.outputChars : 0;
    }
    if (ts >= weekCut) {
      weekRuns += 1;
      weekDurationMs += dur;
    }
    // 按 agent 聚合（week）
    if (ts >= weekCut) {
      const ak = r.agentId || 'unknown';
      const av = byAgentMap.get(ak) || { agentId: ak, runs: 0, durationMs: 0 };
      av.runs += 1;
      av.durationMs += dur;
      byAgentMap.set(ak, av);
    }
    // 按 cwd 聚合（week）
    if (ts >= weekCut) {
      const ck = (r.cwdLabel && typeof r.cwdLabel === 'string') ? r.cwdLabel : 'unknown';
      const cv = byCwdMap.get(ck) || { cwdLabel: ck, runs: 0, durationMs: 0 };
      cv.runs += 1;
      cv.durationMs += dur;
      byCwdMap.set(ck, cv);
    }
  }

  return {
    ok: true,
    updatedAt: (typeof obj.updatedAt === 'number') ? obj.updatedAt : 0,
    todayRuns: todayRuns,
    weekRuns: weekRuns,
    todayDurationMs: todayDurationMs,
    weekDurationMs: weekDurationMs,
    todayInputChars: todayInputChars,
    todayOutputChars: todayOutputChars,
    byAgent: Array.from(byAgentMap.values()).sort((a, b) => b.runs - a.runs),
    byCwd: Array.from(byCwdMap.values()).sort((a, b) => b.runs - a.runs),
    // recent 仅返回白名单字段；不暴露 token / cost / raw output
    recent: filtered.slice(0, 20).map(r => ({
      runId: r.runId,
      sessionId: r.sessionId,
      agentId: r.agentId,
      cwdLabel: r.cwdLabel,
      cwd: r.cwd,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationMs: r.durationMs,
      inputChars: r.inputChars,
      outputChars: r.outputChars,
      status: r.status
      // 显式不返回：inputTokens / outputTokens / totalTokens / estimatedCost
    }))
  };
}

// ============================================================
// Phase 0B API 6: GET /api/mobile/screenshots
// 扫描已知截图目录，返回最近 N 张。返回 thumbUrl（不返回 base64）。
// ============================================================
const SHOT_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp']);

function findScreenshotDirsMobile() {
  const dirs = [];
  if (process.platform === 'win32') {
    const candidates = [
      path.join(HOME, 'Pictures', 'Screenshots'),
      path.join(HOME, 'OneDrive', 'Pictures', 'Screenshots'),
    ];
    for (const d of candidates) { try { if (fs.statSync(d).isDirectory()) dirs.push(d); } catch { /* */ } }
  } else if (process.platform === 'darwin') {
    const d = path.join(HOME, 'Desktop');
    try { if (fs.statSync(d).isDirectory()) dirs.push(d); } catch { /* */ }
  } else {
    const d = path.join(HOME, 'Pictures', 'Screenshots');
    try { if (fs.statSync(d).isDirectory()) dirs.push(d); } catch { /* */ }
  }
  // FanBox 自己的剪贴板截图缓存
  const shotDir = path.join(HOME, '.fanbox', 'screenshots');
  try { if (fs.statSync(shotDir).isDirectory() && !dirs.includes(shotDir)) dirs.push(shotDir); } catch { /* */ }
  return dirs;
}

async function readScreenshotsMobile(limitRaw) {
  const limit = Math.max(1, Math.min(MAX_SCREENSHOTS_HARD, Number(limitRaw) || MAX_SCREENSHOTS_DEFAULT));
  const dirs = findScreenshotDirsMobile();
  if (!dirs.length) return { ok: true, items: [], dirs: [] };
  const items = [];
  const deadline = Date.now() + 1500;
  for (const dir of dirs) {
    let names;
    try { names = await fsp.readdir(dir); } catch { continue; }
    for (const name of names) {
      if (!SHOT_EXT.has(extOf(name))) continue;
      const full = path.join(dir, name);
      try {
        const st = await fsp.stat(full);
        if (st.isFile()) {
          items.push({
            name, path: full,
            size: st.size, mtime: st.mtimeMs,
            thumbUrl: `/api/mobile/thumb?path=${encodeURIComponent(full)}&w=240`,
          });
        }
      } catch { /* */ }
      if (Date.now() > deadline) break;
    }
    if (Date.now() > deadline) break;
  }
  items.sort((a, b) => b.mtime - a.mtime);
  return { ok: true, items: items.slice(0, limit), dirs };
}

// ============================================================
// Phase 0B API 7: GET /api/mobile/thumb
// 生成图片缩略图：Windows 走 PowerShell System.Drawing；macOS 走 sips。
// 失败/不支持/非图片 → 404 + JSON 错误（不返回原图）。
// ============================================================
const THUMB_IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

let _mobilePsScript = null;
function mobilePsThumbScript() {
  if (_mobilePsScript) return _mobilePsScript;
  try { fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true }); } catch { /* */ }
  const file = path.join(THUMB_CACHE_DIR, '_thumb.ps1');
  const script = `param([string]$src,[string]$out,[int]$size,[string]$fmt)
$ErrorActionPreference='Stop'
try {
  Add-Type -AssemblyName System.Drawing
  $img=[System.Drawing.Image]::FromFile($src)
  try {
    $w=[int]$img.Width; $h=[int]$img.Height
    if($w -ge $h){ $nw=$size; $nh=[Math]::Max(1,[int]([double]$h*$size/$w)) } else { $nh=$size; $nw=[Math]::Max(1,[int]([double]$w*$size/$h)) }
    $bmp=New-Object System.Drawing.Bitmap($nw,$nh)
    try {
      $g=[System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($img,0,0,$nw,$nh)
        if($fmt -eq 'png'){ $bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::Png) }
        else {
          $enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object{$_.MimeType -eq 'image/jpeg'}
          $ep=New-Object System.Drawing.Imaging.EncoderParameters(1)
          $ep.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing]::Drawing.Imaging.Encoder::Quality,82L)
          $bmp.Save($out,$enc,$ep)
        }
      } finally { $g.Dispose() }
    } finally { $bmp.Dispose() }
  } finally { $img.Dispose() }
} catch { exit 1 }
`;
  try {
    fs.writeFileSync(file, script);
    _mobilePsScript = file;
    return file;
  } catch { return null; }
}

function runPowerShellThumb(src, out, size, fmt) {
  return new Promise((resolve, reject) => {
    const script = mobilePsThumbScript();
    if (!script) return reject(new Error('ps_script_unavailable'));
    const { execFile } = require('child_process');
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-src', src, '-out', out, '-size', String(size), '-fmt', fmt],
      { timeout: 20000, windowsHide: true }, (e) => (e ? reject(e) : resolve()));
  });
}

function runSipsThumb(src, out, size, fmt) {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    execFile('sips', ['-s', 'format', fmt, '-Z', String(size), src, '--out', out],
      { timeout: 20000 }, (e) => (e ? reject(e) : resolve()));
  });
}

async function generateMobileThumb(src, size, cacheFile, isPng) {
  await fsp.mkdir(THUMB_CACHE_DIR, { recursive: true });
  const fmt = isPng ? 'png' : 'jpeg';
  if (process.platform === 'win32') {
    await runPowerShellThumb(src, cacheFile, size, fmt);
    return;
  }
  if (process.platform === 'darwin') {
    await runSipsThumb(src, cacheFile, size, fmt);
    return;
  }
  throw new Error('thumb_unsupported_on_platform');
}

async function serveMobileThumb(req, res, p, sizeRaw) {
  const norm = normalizePath(p);
  if (!norm) { sendJson(res, 400, { ok: false, error: 'invalid_path' }); return; }
  if (isForbiddenPath(norm)) { sendJson(res, 403, { ok: false, error: 'forbidden_path' }); return; }
  if (!pathInAllowed(norm)) { sendJson(res, 403, { ok: false, error: 'path_not_allowed' }); return; }
  const size = Math.max(48, Math.min(MAX_THUMB_WIDTH_HARD, Number(sizeRaw) || MAX_THUMB_WIDTH_DEFAULT));
  let st;
  try { st = await fsp.stat(norm); } catch { sendJson(res, 404, { ok: false, error: 'not_found' }); return; }
  if (!st.isFile()) { sendJson(res, 404, { ok: false, error: 'not_file' }); return; }
  const e = extOf(norm);
  const isImg = THUMB_IMG_EXT.has(e);
  if (!isImg) { sendJson(res, 415, { ok: false, error: 'thumb_not_supported' }); return; }
  const isPng = e === 'png' || e === 'gif' || e === 'webp';
  const key = crypto.createHash('md5').update(norm + ':' + st.mtimeMs + ':' + size).digest('hex');
  const cacheFile = path.join(THUMB_CACHE_DIR, key + (isPng ? '.png' : '.jpg'));
  const sendCache = () => {
    const type = isPng ? 'image/png' : 'image/jpeg';
    try {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=604800' });
      const rs = fs.createReadStream(cacheFile);
      rs.on('error', () => { try { res.destroy(); } catch { /* */ } });
      rs.pipe(res);
    } catch { try { res.end(); } catch { /* */ } }
  };
  if (fs.existsSync(cacheFile)) return sendCache();
  try {
    await generateMobileThumb(norm, size, cacheFile, isPng);
    sendCache();
  } catch {
    // 缩略图生成失败：返回 JSON 错误（不返回原图，绝不降级到 base64）
    sendJson(res, 415, { ok: false, error: 'thumb_generation_failed' });
  }
}

// ============================================================
// 通用 wrapper：受保护端点的 token + LAN 校验
// ============================================================
async function requireMobileAuth(req, res) {
  if (!isLanIp(getClientIp(req))) {
    sendJson(res, 403, { ok: false, error: 'lan_only' });
    return null;
  }
  const t = await validateToken(getAuthToken(req));
  if (!t.ok) {
    sendJson(res, 401, { ok: false, error: 'unauthorized' });
    return null;
  }
  return t;
}

// ============================================================
// Phase 0B 路由分发器（与 Phase 0A 同层，在 handleRequest 末尾追加）
// ============================================================
async function handleMobileApiV2(req, res, url) {
  const pathOnly = url.split('?')[0];
  const u = new URL(url, 'http://x');
  const qp = u.searchParams;

  if (req.method !== 'GET') {
    // Phase 0B 全 GET —— 任何非 GET 一律 405
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  // /api/mobile/roots —— allowedRoots 摘要
  if (pathOnly === '/api/mobile/roots') {
    const t = await requireMobileAuth(req, res); if (!t) return;
    return sendJson(res, 200, {
      ok: true,
      home: HOME,
      platform: process.platform,
      sep: path.sep,
      roots: mobileAllowedRoots(),
    });
  }

  // /api/mobile/file?path=&max=
  if (pathOnly === '/api/mobile/file') {
    const t = await requireMobileAuth(req, res); if (!t) return;
    const p = qp.get('path');
    if (!p) return badReq(res, 400, 'missing_path');
    const max = qp.get('max');
    const r = await readFileMobile(p, max ? parseInt(max, 10) : MAX_FILE_READ_DEFAULT);
    if (!r.ok) {
      const code = r.error === 'forbidden_path' || r.error === 'path_not_allowed' ? 403 : 400;
      return sendJson(res, code, r);
    }
    return sendJson(res, 200, r);
  }

  // /api/mobile/search?q=&path=&root=&limit=
  if (pathOnly === '/api/mobile/search') {
    const t = await requireMobileAuth(req, res); if (!t) return;
    const q = qp.get('q') || '';
    const root = qp.get('path') || qp.get('root') || HOME;
    const limit = qp.get('limit') ? parseInt(qp.get('limit'), 10) : MAX_SEARCH_LIMIT_DEFAULT;
    const r = await searchFilesMobile(q, root, limit);
    if (!r.ok) {
      const code = r.error === 'forbidden_path' || r.error === 'path_not_allowed' ? 403 : 400;
      return sendJson(res, code, r);
    }
    return sendJson(res, 200, r);
  }

  // /api/mobile/skills
  if (pathOnly === '/api/mobile/skills') {
    const t = await requireMobileAuth(req, res); if (!t) return;
    return sendJson(res, 200, await readSkillsMobile());
  }

  // /api/mobile/agents
  if (pathOnly === '/api/mobile/agents') {
    const t = await requireMobileAuth(req, res); if (!t) return;
    return sendJson(res, 200, await readAgentsMobile());
  }

  // /api/mobile/usage[?agentId=&cwd=]
  // Phase 2B：mobile runner usage 增加 agentId / cwd 过滤
  if (pathOnly === '/api/mobile/usage') {
    const t = await requireMobileAuth(req, res); if (!t) return;
    const filter = {
      agentId: qp.get('agentId') || '',
      cwd: qp.get('cwd') || ''
    };
    const hasFilter = !!filter.agentId || !!filter.cwd;
    if (hasFilter) {
      const runner = await readMobileRunnerUsageMobile(filter);
      return sendJson(res, 200, { ok: true, filtered: true, filter, mobileRunner: runner });
    }
    return sendJson(res, 200, await readUsageMobile());
  }

  // /api/mobile/screenshots?limit=
  if (pathOnly === '/api/mobile/screenshots') {
    const t = await requireMobileAuth(req, res); if (!t) return;
    const limit = qp.get('limit') ? parseInt(qp.get('limit'), 10) : MAX_SCREENSHOTS_DEFAULT;
    return sendJson(res, 200, await readScreenshotsMobile(limit));
  }

  // /api/mobile/thumb?path=&w=（直接返回 image/jpeg bytes，不走 JSON）
  if (pathOnly === '/api/mobile/thumb') {
    const t = await requireMobileAuth(req, res); if (!t) return;
    const p = qp.get('path');
    if (!p) return badReq(res, 400, 'missing_path');
    return serveMobileThumb(req, res, p, qp.get('w') ? parseInt(qp.get('w'), 10) : MAX_THUMB_WIDTH_DEFAULT);
  }

  return false; // 未命中：让调用方走 404
}


// ============================================================
// Phase 2A-1 路由分发器：sessions + context（只读 session + 偏好写入）
// 硬约束：
//   1. 全部走 requireMobileAuth（token + LAN）
//   2. GET /api/mobile/sessions* 只读
//   3. POST /api/mobile/context/* 只改 mobile 偏好（lastAgentMap / lastSessionMap / current）
//   4. 不启动 agent；不发送任务；不暴露 pty input / shell / 写文件
//   5. 不暴露 raw stdout / JSONL / token / cookie / API key / claudeSession / codexSession
//   6. 不新增 cancel / approval / send_message / WebSocket 端点
// ============================================================
async function handleMobileApiV2A(req, res, url) {
  const pathOnly = url.split('?')[0];
  const u = new URL(url, 'http://x');
  const qp = u.searchParams;

  // -------- GET /api/mobile/sessions --------
  // 支持：?cwd=&agentId=&source=&q=&limit=
  if (req.method === 'GET' && pathOnly === '/api/mobile/sessions') {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    const limit = qp.get('limit') ? parseInt(qp.get('limit'), 10) : 50;
    const r = await mobileSessions.listSessions({
      cwd: qp.get('cwd') || '',
      agentId: qp.get('agentId') || '',
      source: qp.get('source') || '',
      q: qp.get('q') || '',
      limit: limit
    });
    return sendJson(res, 200, r), true;
  }

  // -------- GET /api/mobile/sessions/by-cwd?cwd=... --------
  // 等价于 /api/mobile/sessions?cwd=...
  if (req.method === 'GET' && pathOnly === '/api/mobile/sessions/by-cwd') {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    const cwd = qp.get('cwd') || '';
    if (!cwd) return badReq(res, 400, 'missing_cwd'), true;
    const r = await mobileSessions.listSessions({ cwd, limit: 100 });
    return sendJson(res, 200, r), true;
  }

  // -------- GET /api/mobile/sessions/:id --------
  if (req.method === 'GET' && /^\/api\/mobile\/sessions\/[A-Za-z0-9._\-+]{1,128}$/.test(pathOnly)) {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    const id = pathOnly.split('/').pop();
    // 排除 :id 落到 /draft / messages / approvals / events 的情况
    if (id === 'draft' || id === 'messages' || id === 'events') {
      return false;
    }
    const s = await mobileSessions.getSessionById(id);
    if (!s) return sendJson(res, 404, { ok: false, error: 'not_found' }), true;
    return sendJson(res, 200, { ok: true, session: s }), true;
  }

  // -------- POST /api/mobile/sessions/draft --------
  // body: { cwd, agentId } —— 只创建 mobile session shell，不启动 agent
  // 必须在 :id 之前匹配
  if (req.method === 'POST' && pathOnly === '/api/mobile/sessions/draft') {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    let body;
    try { body = await readJsonBody(req); } catch { return badReq(res, 400, 'bad_body'), true; }
    const cwd = (body && typeof body.cwd === 'string') ? body.cwd : '';
    if (!cwd) return badReq(res, 400, 'missing_cwd'), true;
    const norm = path.resolve(cwd);
    if (isForbiddenPath(norm)) return sendJson(res, 403, { ok: false, error: 'forbidden_path' }), true;
    if (!pathInAllowed(norm)) return sendJson(res, 403, { ok: false, error: 'path_not_allowed' }), true;
    const r = await mobileSessions.createMobileDraftSession({
      cwd: norm,
      agentId: body.agentId,
      deviceId: t.device && t.device.id
    });
    if (!r.ok) return badReq(res, 400, r.error || 'bad_draft'), true;
    return sendJson(res, 200, { ok: true, sessionId: r.sessionId, internalId: r.internalId }), true;
  }

  // -------- POST /api/mobile/sessions/:id/messages --------
  // body: { text, cwd, agentId, contextFiles }
  // Phase 2A-2.1：先 redline detector
  //   - 命中红线 → 创建 approval，session 进入 waiting_approval，不执行 agent
  //   - 未命中红线 → 写入 user message，session running → 跑 stub runner → done/failed
  if (req.method === 'POST' && /^\/api\/mobile\/sessions\/[A-Za-z0-9._\-+]{1,128}\/messages$/.test(pathOnly)) {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    const m = pathOnly.match(/^\/api\/mobile\/sessions\/([A-Za-z0-9._\-+]{1,128})\/messages$/);
    const sessionId = m ? m[1] : '';
    let body;
    try { body = await readJsonBody(req); } catch { return badReq(res, 400, 'bad_body'), true; }
    const text = (body && typeof body.text === 'string') ? body.text : '';
    const cwd = (body && typeof body.cwd === 'string') ? body.cwd : '';
    const agentId = (body && typeof body.agentId === 'string') ? body.agentId : '';
    const contextFiles = (body && Array.isArray(body.contextFiles)) ? body.contextFiles : [];
    if (!text) return badReq(res, 400, 'missing_text'), true;
    if (!cwd) return badReq(res, 400, 'missing_cwd'), true;
    if (!agentId) return badReq(res, 400, 'missing_agentId'), true;
    // 校验 cwd
    const norm = path.resolve(cwd);
    if (isForbiddenPath(norm)) return sendJson(res, 403, { ok: false, error: 'forbidden_path' }), true;
    if (!pathInAllowed(norm)) return sendJson(res, 403, { ok: false, error: 'path_not_allowed' }), true;
    // 校验 contextFiles
    if (contextFiles.length > 0) {
      if (contextFiles.length > 5) return badReq(res, 400, 'too_many_contextFiles'), true;
      for (const cf of contextFiles) {
        if (typeof cf !== 'string') return badReq(res, 400, 'invalid_contextFile'), true;
        if (isForbiddenPath(path.resolve(cf)) || !pathInAllowed(path.resolve(cf))) {
          return sendJson(res, 403, { ok: false, error: 'contextFile_not_allowed' }), true;
        }
      }
    }
    // 验证 session 存在
    const sess = await mobileSessions.getSessionById(sessionId);
    if (!sess) {
      return sendJson(res, 404, { ok: false, error: 'session_not_found' }), true;
    }
    // Phase 2A-2.1：分发（redline vs 普通）
    const r = await mobileSessions.postMessageToMobileSession({
      sessionId: sessionId,
      deviceId: t.device && t.device.id,
      deviceName: t.device && t.device.deviceName,
      agentId: agentId,
      cwd: norm,
      text: text,
      contextFiles: contextFiles
    });
    if (!r.ok) {
      const code_ = r.status || 400;
      return sendJson(res, code_, { ok: false, error: r.error }), true;
    }
    return sendJson(res, 200, r), true;
  }

  // -------- GET /api/mobile/sessions/:id/events --------
  // Phase 2A-2.1：scrubbed messages + session status（无 raw stdout / jsonl / token）
  if (req.method === 'GET' && /^\/api\/mobile\/sessions\/[A-Za-z0-9._\-+]{1,128}\/events$/.test(pathOnly)) {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    const m = pathOnly.match(/^\/api\/mobile\/sessions\/([A-Za-z0-9._\-+]{1,128})\/events$/);
    const sessionId = m ? m[1] : '';
    const u = new URL(url, 'http://x');
    const limit = Math.max(1, Math.min(50, parseInt(u.searchParams.get('limit') || '20', 10) || 20));
    const sess = await mobileSessions.getSessionById(sessionId);
    if (!sess) return sendJson(res, 404, { ok: false, error: 'session_not_found' }), true;
    const msgs = await mobileSessions.getSessionMessages(sessionId, limit);
    // 二次 scrub：防止泄漏敏感字段
    const cleanMsgs = (msgs && Array.isArray(msgs.messages) ? msgs.messages : []).map(function (m) {
      return {
        role: m.role,
        text: mobileSessions.safeStr(m.text || '', 2000),
        status: m.status,
        ts: m.ts,
        approvalId: m.approvalId || '',
        agentId: m.agentId || ''
      };
    });
    return sendJson(res, 200, {
      ok: true,
      sessionId: sess.sessionId,
      status: sess.status,
      agentId: sess.agentId,
      cwdLabel: sess.cwdLabel,
      messages: cleanMsgs
    }), true;
  }

  // -------- GET /api/mobile/approvals/:id --------
  if (req.method === 'GET' && /^\/api\/mobile\/approvals\/[A-Za-z0-9._\-+]{1,128}$/.test(pathOnly)) {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    const id = pathOnly.split('/').pop();
    const a = await mobileSessions.getApprovalById(id);
    if (!a) return sendJson(res, 404, { ok: false, error: 'not_found' }), true;
    // 限制：只返回同 device 的 approval
    if (a.deviceId && t.device && t.device.id && a.deviceId !== t.device.id) {
      return sendJson(res, 403, { ok: false, error: 'forbidden' }), true;
    }
    return sendJson(res, 200, { ok: true, approval: a }), true;
  }

  // -------- GET /api/mobile/approvals --------
  if (req.method === 'GET' && pathOnly === '/api/mobile/approvals') {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    const u = new URL(url, 'http://x');
    const sessionId = u.searchParams.get('sessionId') || '';
    const status = u.searchParams.get('status') || '';
    const r = await mobileSessions.listApprovals({
      deviceId: t.device && t.device.id,
      sessionId: sessionId || undefined,
      status: status || undefined,
      limit: 50
    });
    return sendJson(res, 200, { ok: true, items: r }), true;
  }

  // -------- GET /api/mobile/skills-state --------
  // Phase UI-A1：mobile 端 skills toggle。读 ~/.fanbox/mobile/skills-state.json
  if (req.method === 'GET' && pathOnly === '/api/mobile/skills-state') {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    return sendJson(res, 200, await readSkillsState()), true;
  }

  // -------- POST /api/mobile/skills-state --------
  // body: { skillId, enabled } —— 写 ~/.fanbox/mobile/skills-state.json
  // 绝不修改 ~/.claude / ~/.codex / ~/.agents 下的真实 skill 文件
  if (req.method === 'POST' && pathOnly === '/api/mobile/skills-state') {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    let body;
    try { body = await readJsonBody(req); } catch { return badReq(res, 400, 'bad_body'), true; }
    const skillId = ((body && body.skillId) || '').toString().replace(/[^A-Za-z0-9._\-+:]/g, '').slice(0, 128);
    const enabled = !!(body && body.enabled);
    if (!skillId) return sendJson(res, 400, { ok: false, error: 'missing_skillId' }), true;
    const r = await writeSkillsState(skillId, enabled);
    return sendJson(res, r.ok ? 200 : 400, r), true;
  }

  // -------- GET /api/mobile/context/current --------
  if (req.method === 'GET' && pathOnly === '/api/mobile/context/current') {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    const r = await mobileSessions.getContext();
    return sendJson(res, 200, r), true;
  }

  // -------- POST /api/mobile/context/cwd --------
  // body: { cwd: "I:\\..." }  —— 只改 prefs.json.current.cwd；不启动 agent
  if (req.method === 'POST' && pathOnly === '/api/mobile/context/cwd') {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    let body;
    try { body = await readJsonBody(req); } catch { return badReq(res, 400, 'bad_body'), true; }
    const cwd = (body && typeof body.cwd === 'string') ? body.cwd : '';
    if (!cwd) return badReq(res, 400, 'missing_cwd'), true;
    // 校验 cwd 在 allowed roots 内（不允许任意路径）
    const norm = path.resolve(cwd);
    if (isForbiddenPath(norm)) return sendJson(res, 403, { ok: false, error: 'forbidden_path' }), true;
    if (!pathInAllowed(norm)) return sendJson(res, 403, { ok: false, error: 'path_not_allowed' }), true;
    const r = await mobileSessions.setContextCwd(norm);
    if (!r.ok) return badReq(res, 400, r.error || 'bad_cwd'), true;
    return sendJson(res, 200, { ok: true, cwd: r.cwd }), true;
  }

  // -------- POST /api/mobile/context/select --------
  // body: { cwd, agentId, sessionId } —— 只改 prefs.json
  if (req.method === 'POST' && pathOnly === '/api/mobile/context/select') {
    const t = await requireMobileAuth(req, res); if (!t) return true;
    let body;
    try { body = await readJsonBody(req); } catch { return badReq(res, 400, 'bad_body'), true; }
    const cwd = (body && typeof body.cwd === 'string') ? body.cwd : '';
    if (!cwd) return badReq(res, 400, 'missing_cwd'), true;
    const norm = path.resolve(cwd);
    if (isForbiddenPath(norm)) return sendJson(res, 403, { ok: false, error: 'forbidden_path' }), true;
    if (!pathInAllowed(norm)) return sendJson(res, 403, { ok: false, error: 'path_not_allowed' }), true;
    const r = await mobileSessions.setContextSelect({
      cwd: norm,
      agentId: body.agentId,
      sessionId: body.sessionId
    });
    if (!r.ok) return badReq(res, 400, r.error || 'bad_select'), true;
    return sendJson(res, 200, { ok: true, cwd: r.cwd, agentId: r.agentId, sessionId: r.sessionId }), true;
  }

  return false; // 未命中
}


// =====================================================================
// Phase 2A-2.1：handleMobileControlApi
//   - 仅 loopback 访问（调用方在 handleRequest 中已用 isLoopbackIp 校验）
//   - 不需要 mobile token（loopback 是 desktop 本机，IPC 桥）
//   - 不暴露 pty / shell / agent 启动
//   - approve 后不启动 agent；只更新 status
// =====================================================================
async function handleMobileControlApi(req, res, url) {
  const pathOnly = (url || '/').split('?')[0];

  // -------- GET /api/mobile-control/approvals --------
  if (req.method === 'GET' && pathOnly === '/api/mobile-control/approvals') {
    const u = new URL(url, 'http://x');
    const status = u.searchParams.get('status') || '';
    const agentId = u.searchParams.get('agentId') || '';
    const r = await mobileSessions.listApprovals({
      status: status || undefined,
      limit: 100
    });
    let items = r;
    if (agentId) items = items.filter(function (x) { return x.agentId === agentId; });
    return sendJson(res, 200, { ok: true, items: items }), true;
  }

  // -------- POST /api/mobile-control/approvals/:id/decide --------
  // body: { decision: "approved" | "rejected" }
  if (req.method === 'POST' && /^\/api\/mobile-control\/approvals\/[A-Za-z0-9._\-+]{1,128}\/decide$/.test(pathOnly)) {
    const m = pathOnly.match(/^\/api\/mobile-control\/approvals\/([A-Za-z0-9._\-+]{1,128})\/decide$/);
    const id = m ? m[1] : '';
    let body;
    try { body = await readJsonBody(req); } catch { return badReq(res, 400, 'bad_body'), true; }
    const decision = (body && typeof body.decision === 'string') ? body.decision : '';
    if (decision !== 'approved' && decision !== 'rejected') {
      return badReq(res, 400, 'invalid_decision'), true;
    }
    const r = await mobileSessions.decideApproval(id, decision, 'desktop');
    if (!r.ok) {
      const code_ = r.status || 400;
      return sendJson(res, code_, { ok: false, error: r.error }), true;
    }
    return sendJson(res, 200, {
      ok: true,
      approvalId: r.approvalId,
      status: r.status,
      decision: r.decision,
      note: r.note || ''
    }), true;
  }

  return false; // 未命中
}



function createMobileServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch((e) => {
      // 最后兜底 —— 不要把 stack 暴露出去
      sendJson(res, 500, { ok: false, error: 'internal_error' });
    });
  });
}

async function handleRequest(req, res) {
  const url = req.url || '/';
  const ip = getClientIp(req);

  // 第一道：所有 mobile 请求都过 LAN
  if (!isLanIp(ip)) {
    return sendJson(res, 403, { ok: false, error: 'lan_only' });
  }

  const pathOnly = url.split('?')[0];

  // -------- 公开端点：/mobile 静态资源（不需 token）--------
  // 1) 主页：/mobile 或 /mobile/
  if (req.method === 'GET' && (pathOnly === '/mobile' || pathOnly === '/mobile/')) {
    return serveMobileStatic(req, res, '/mobile');
  }
  // 2) 子资源：/mobile/mobile.css / /mobile/mobile.js 等
  if (req.method === 'GET' && pathOnly.startsWith('/mobile/')) {
    return serveMobileStatic(req, res, pathOnly);
  }

  // -------- 配对：pair/status --------
  if (req.method === 'GET' && pathOnly === '/api/mobile/pair/status') {
    const cfg = await getConfig();
    const expiresAt = cfg.pairCodeExpiresAt || 0;
    const pairing = !!cfg.pairCodeHash && expiresAt > Date.now();
    return sendJson(res, 200, { ok: true, pairing, expiresAt });
  }

  // -------- 配对：pair/confirm --------
  if (req.method === 'POST' && pathOnly === '/api/mobile/pair/confirm') {
    const cfg0 = await getConfig();
    if (!cfg0.enabled) {
      return sendJson(res, 403, { ok: false, error: 'mobile_disabled' });
    }
    let body;
    try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'bad_body' }); }
    const code = String(body.pairCode || '').trim();
    const deviceName = String(body.deviceName || '').trim();
    if (!/^\d{6}$/.test(code)) {
      return sendJson(res, 401, { ok: false, error: 'invalid_pair_code' });
    }
    const result = await consumePairCode(code, deviceName);
    if (!result.ok) {
      const code_ = result.error === 'invalid_pair_code' ? 401 : 401;
      return sendJson(res, code_, { ok: false, error: result.error });
    }
    return sendJson(res, 200, { ok: true, token: result.token, deviceId: result.deviceId, scopes: result.scopes });
  }

  // -------- 受保护：/api/mobile/status --------
  if (req.method === 'GET' && pathOnly === '/api/mobile/status') {
    const t = await validateToken(getAuthToken(req));
    if (!t.ok) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    return sendJson(res, 200, {
      ok: true,
      server: {
        name: 'FanBox Windows Edition',
        version: '2.4.0',
        platform: process.platform,
      },
      mobile: {
        paired: true,
        deviceName: t.device.deviceName,
        deviceId: t.device.id,
      },
    });
  }

  // -------- 受保护：/api/mobile/files --------
  if (req.method === 'GET' && pathOnly === '/api/mobile/files') {
    const t = await validateToken(getAuthToken(req));
    if (!t.ok) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    const u = new URL(url, 'http://x');
    const p = u.searchParams.get('path') || HOME;
    const r = await listDirSafe(p);
    if (!r.ok) {
      const code_ = (r.error === 'forbidden_path' || r.error === 'path_not_allowed') ? 403 : 400;
      return sendJson(res, code_, { ok: false, error: r.error });
    }
    return sendJson(res, 200, { ok: true, path: r.path, items: r.items });
  }

  // -------- Phase 2A-1：sessions + context 路由（先于 V2，因为 V2 强制 GET-only）--------
  const v2a = await handleMobileApiV2A(req, res, url);
  if (v2a !== false) return; // 命中（v2a 已写 res）或短路

  // -------- Phase 2A-2.1：mobile-control 路由（loopback-only）--------
  // 必须在 v2a 之后；必须在 v2 之前；必须过 loopback 校验
  if (pathOnly.startsWith('/api/mobile-control/')) {
    if (!isLoopbackIp(ip)) {
      return sendJson(res, 403, { ok: false, error: 'loopback_only' });
    }
    const ctl = await handleMobileControlApi(req, res, url);
    if (ctl !== false) return;
  }

  // -------- Phase 0B：只读 API 路由 --------
  const v2 = await handleMobileApiV2(req, res, url);
  if (v2 !== false) return; // 命中（v2 已写 res）或短路（401/403/405/400）

  return sendJson(res, 404, { ok: false, error: 'not_found' });
}

// ---------- Phase 1：Mobile Web UI 静态资源分发 ----------
//
// 设计：
//   - 公开资源：/mobile 与 /mobile/{*.html,*.css,*.js,*.svg,*.ico,*.png,*.jpg} 都不需 token
//   - 文件根：MOBILE_PUBLIC_DIR = public/mobile/，强制在根目录内
//   - 拒绝 .. 与 \ 与越界路径；白名单扩展名
//   - 任何 /api/mobile/* 仍走 token + LAN + 路由分发
//
// Phase 0A 旧版 inline HTML（serveMobilePage 内的硬编码长串）已废弃，
// 改读 public/mobile/index.html 静态文件。

function serveMobileStatic(req, res, urlPath) {
  // urlPath 形如 "/mobile" 或 "/mobile/mobile.css"
  // 1) 限 GET/HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  // 2) 计算相对路径
  let rel = urlPath.replace(/^\/mobile\/?/, '');
  if (rel === '' || rel === '/') rel = 'index.html';
  // 3) 拒绝 .. 与 \ 与 NULL byte
  if (rel.includes('..') || rel.includes('\\') || rel.indexOf('\0') >= 0) {
    sendJson(res, 400, { ok: false, error: 'bad_path' });
    return;
  }
  // 4) 拼绝对路径并校验仍在 MOBILE_PUBLIC_DIR 内
  const rootAbs = path.resolve(MOBILE_PUBLIC_DIR);
  const fp = path.resolve(rootAbs, rel);
  if (!(fp === rootAbs || fp.startsWith(rootAbs + path.sep))) {
    sendJson(res, 403, { ok: false, error: 'forbidden_path' });
    return;
  }
  // 5) 扩展名白名单（先于 stat，避免泄漏文件是否存在）
  const ext = path.extname(fp).toLowerCase();
  const type = MOBILE_STATIC_MIME[ext];
  if (!type) { sendJson(res, 415, { ok: false, error: 'mime_not_allowed' }); return; }
  // 6) 检查文件存在
  let st;
  try { st = fs.statSync(fp); } catch { sendJson(res, 404, { ok: false, error: 'not_found' }); return; }
  if (!st.isFile()) { sendJson(res, 404, { ok: false, error: 'not_found' }); return; }
  // 7) 大小限
  if (st.size > MOBILE_STATIC_MAX) {
    sendJson(res, 413, { ok: false, error: 'file_too_large' });
    return;
  }
  // 8) 读盘发送
  try {
    const buf = fs.readFileSync(fp);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(buf);
  } catch {
    sendJson(res, 500, { ok: false, error: 'read_failed' });
  }
}

function serveMobilePage(req, res, urlPath) {
  // 兼容：原有 handleRequest 中 if (pathOnly === '/mobile' || pathOnly === '/mobile/') 直接调它。
  // 这里直接走静态资源分发，'/' 落到 index.html。
  return serveMobileStatic(req, res, urlPath);
}

// ---------- Phase UI-A1：mobile skills state（仅 mobile 端 toggle，不改真实 skill 文件） ----------
async function readSkillsState() {
  try {
    const txt = await fsp.readFile(SKILLS_STATE_FILE, 'utf8');
    const j = JSON.parse(txt);
    if (!j || typeof j !== 'object') return { ok: true, schemaVersion: 1, states: {}, updatedAt: 0 };
    if (!j.states || typeof j.states !== 'object') j.states = {};
    return { ok: true, schemaVersion: 1, states: j.states, updatedAt: j.updatedAt || 0 };
  } catch {
    return { ok: true, schemaVersion: 1, states: {}, updatedAt: 0 };
  }
}

async function writeSkillsState(skillId, enabled) {
  try {
    if (!skillId) return { ok: false, error: 'missing_skillId' };
    const id = String(skillId).replace(/[^A-Za-z0-9._\-+:]/g, '').slice(0, 128);
    if (!id) return { ok: false, error: 'invalid_skillId' };
    await fsp.mkdir(SKILLS_STATE_FILE.replace(/[\\\/][^\\\/]+$/, ''), { recursive: true });
    let obj;
    try {
      const txt = await fsp.readFile(SKILLS_STATE_FILE, 'utf8');
      obj = JSON.parse(txt);
      if (!obj || typeof obj !== 'object') obj = { schemaVersion: 1, states: {} };
      if (!obj.states || typeof obj.states !== 'object') obj.states = {};
    } catch {
      obj = { schemaVersion: 1, states: {} };
    }
    obj.states[id] = { enabled: !!enabled, updatedAt: Date.now() };
    obj.updatedAt = Date.now();
    obj.schemaVersion = 1;
    await fsp.writeFile(SKILLS_STATE_FILE, JSON.stringify(obj, null, 2), 'utf8');
    return { ok: true, skillId: id, enabled: !!enabled, updatedAt: obj.updatedAt };
  } catch (e) {
    return { ok: false, error: 'write_failed', detail: (e && e.message) || String(e) };
  }
}
// ---------- Server lifecycle ----------

function startMobileServer({ port, onListening, onError }) {
  const server = createMobileServer();
  server.on('error', (e) => {
    if (onError) onError(e);
  });
  // listen on 0.0.0.0; per-request isLanIp() is the actual gate
  server.listen(port, '0.0.0.0', () => {
    if (onListening) onListening();
  });
  return server;
}

// ---------- 公共 API ----------

module.exports = {
  // 路径常量
  MOBILE_DIR,
  CONFIG_FILE,
  TOKENS_FILE,
  THUMB_CACHE_DIR,
  DEFAULT_PORT,
  PAIR_TTL_MS,
  TOKEN_INACTIVE_MS,
  MAX_LIST_ITEMS,
  // Phase 0B 硬性限制常量
  MAX_FILE_READ_DEFAULT,
  MAX_FILE_READ_LIMIT,
  MAX_SEARCH_LIMIT_DEFAULT,
  MAX_SEARCH_LIMIT_HARD,
  MAX_SCREENSHOTS_DEFAULT,
  MAX_SCREENSHOTS_HARD,
  MAX_THUMB_WIDTH_DEFAULT,
  MAX_THUMB_WIDTH_HARD,
  SKILL_DESC_CUT_MOBILE,
  // LAN
  isLanIp,
  isLoopbackIp,
  // 配置/凭证
  getConfig,
  saveConfig,
  ensureDir,
  startPairCode,
  ensurePairCode,
  consumePairCode,
  validateToken,
  revokeToken,
  revokeAllTokens,
  listAllTokens,
  // 网络
  listLanUrls,
  pickBestLanUrls,
  isVirtualIface,
  getDefaultRouteIface,
  // HTTP
  startMobileServer,
  createMobileServer,
  // 工具
  genToken,
  genPairCode,
  genDeviceId,
  genServerId,
  sha256,
  // 工具方法（内部使用，但导出以便测试）
  listDirSafe,
  pathInAllowed,
  allowedRoots,
  isForbiddenPath,
  pathAllowedSafe,
  extOf,
  kindOf,
  mimeOf,
  fuzzyScore,
  // Phase 0B 端点实现
  readFileMobile,
  searchFilesMobile,
  readSkillsMobile,
  readAgentsMobile,
  readUsageMobile,
  readScreenshotsMobile,
  serveMobileThumb,
  handleMobileApiV2,
  // Phase 2A-1
  handleMobileApiV2A,
  mobileSessions,
  // Phase 2A-2.1
  handleMobileControlApi,
  // server 内提供（测试用）
  handleRequest,
  // 状态描述
  publicStatus,
};

// 用于桌面端：脱敏后的状态
async function publicStatus() {
  const cfg = await getConfig();
  const all = await listAllTokens();
  const now = Date.now();
  const active = all.filter(t => !t.revoked && (now - (t.lastSeenAt || t.pairedAt)) < TOKEN_INACTIVE_MS);
  const pick = pickBestLanUrls(cfg.port);
  const ranked = [pick.primary, ...pick.others].filter(Boolean);
  return {
    enabled: cfg.enabled,
    port: cfg.port,
    serverId: cfg.serverId,
    pairing: !!cfg.pairCodeHash && cfg.pairCodeExpiresAt > now,
    pairCodeExpiresAt: cfg.pairCodeExpiresAt || 0,
    // 新增：推荐 LAN URL（不含 0.0.0.0；带默认路由优先 + 192.168 优先 + 虚拟接口过滤）
    primaryLanUrl: pick.primary ? pick.primary.url : null,
    primaryIface: pick.primary ? pick.primary.iface : null,
    // 新增：完整带分数的 URL 列表（仅供 UI 调试用；不外泄任何敏感信息）
    lanUrlsRanked: ranked.map(r => ({ url: r.url, iface: r.iface, address: r.address, score: r.score })),
    lanUrlsFallback: pick.fallback,
    // 兼容旧字段
    lanUrls: ranked.map(r => r.url),
    pairedDevices: active.map(t => ({
      id: t.id,
      deviceName: t.deviceName,
      pairedAt: t.pairedAt,
      lastSeenAt: t.lastSeenAt,
      revoked: !!t.revoked,
    })),
  };
}

