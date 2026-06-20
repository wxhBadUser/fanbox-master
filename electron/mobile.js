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

// ---------- 路径 ----------

const HOME = os.homedir();
const MOBILE_DIR = path.join(HOME, '.fanbox', 'mobile');
const CONFIG_FILE = path.join(MOBILE_DIR, 'config.json');
const TOKENS_FILE = path.join(MOBILE_DIR, 'tokens.json');

const DEFAULT_PORT = 4580;
const PAIR_TTL_MS = 60_000;
const TOKEN_INACTIVE_MS = 24 * 60 * 60 * 1000; // 24 小时未使用自动失效
const MAX_LIST_ITEMS = 200;

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

async function listDirSafe(p) {
  const norm = normalizePath(p);
  if (!norm) return { ok: false, error: 'invalid_path' };
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

// ---------- Mobile HTTP Server ----------

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

  // -------- 公开端点：/mobile 静态页 --------
  if (req.method === 'GET' && (pathOnly === '/mobile' || pathOnly === '/mobile/')) {
    return serveMobilePage(req, res);
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
      const code_ = r.error === 'path_not_allowed' ? 403 : 400;
      return sendJson(res, code_, { ok: false, error: r.error });
    }
    return sendJson(res, 200, { ok: true, path: r.path, items: r.items });
  }

  return sendJson(res, 404, { ok: false, error: 'not_found' });
}

function serveMobilePage(req, res) {
  // Phase 0A：极简 HTML，自己带 inline JS（不引新依赖）
  const html = `<!doctype html>
<html lang="zh"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>FanBox Mobile</title>
<style>
  body { font: 14px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; margin: 0; background: #f4f4f4; color: #222; }
  main { max-width: 480px; margin: 0 auto; padding: 24px 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.note { color: #666; margin: 0 0 16px; font-size: 13px; }
  .card { background: #fff; border-radius: 10px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.05); margin-bottom: 12px; }
  label { display: block; font-size: 12px; color: #555; margin: 12px 0 4px; }
  input { width: 100%; box-sizing: border-box; padding: 10px; font-size: 15px; border: 1px solid #ccc; border-radius: 6px; }
  button { margin-top: 16px; width: 100%; padding: 12px; font-size: 15px; background: #2c2c2c; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
  button[disabled] { background: #999; cursor: not-allowed; }
  .ok { color: #1b7a3a; font-weight: 600; }
  .err { color: #b21e1e; }
  code { background: #eee; padding: 1px 6px; border-radius: 3px; font-size: 12px; word-break: break-all; }
  .pairing { background: #fff8e1; border: 1px solid #f0d577; }
</style></head><body>
<main>
  <h1>FanBox Mobile</h1>
  <p class="note">Phase 0A · 安全配对 · 仅局域网</p>

  <div class="card" id="statusCard">
    <div>当前状态：<span id="statusText">检查中…</span></div>
  </div>

  <div class="card" id="pairCard">
    <label>设备名</label>
    <input id="deviceName" placeholder="例如 John Phone" maxlength="60">
    <label>6 位配对码</label>
    <input id="pairCode" placeholder="6 位数字" inputmode="numeric" maxlength="6">
    <button id="pairBtn">配对</button>
    <div id="pairMsg" style="margin-top:12px;"></div>
  </div>

  <div class="card" id="tokenCard" style="display:none;">
    <div class="ok">配对成功</div>
    <p>以下 token 已保存到本机 localStorage，仅显示一次。请妥善保存。</p>
    <code id="tokenShow" style="display:block; padding:8px; margin:8px 0;"></code>
    <button id="testStatusBtn">测试 /api/mobile/status</button>
    <button id="testFilesBtn">测试 /api/mobile/files</button>
    <pre id="apiOut" style="background:#f4f4f4; padding:8px; font-size:12px; overflow:auto; max-height:240px;"></pre>
  </div>
</main>
<script>
(function () {
  var tokenKey = 'fanbox.mobile.token';
  var deviceIdKey = 'fanbox.mobile.deviceId';
  function getToken() { return localStorage.getItem(tokenKey) || ''; }
  function setToken(t, id) {
    localStorage.setItem(tokenKey, t);
    if (id) localStorage.setItem(deviceIdKey, id);
  }
  function clearToken() { localStorage.removeItem(tokenKey); localStorage.removeItem(deviceIdKey); }

  function $(id) { return document.getElementById(id); }

  function refreshStatus() {
    fetch('/api/mobile/pair/status').then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok && j.pairing) {
        $('statusText').innerHTML = '<span class="ok">可配对</span> · 过期 ' + new Date(j.expiresAt).toLocaleTimeString();
      } else {
        $('statusText').innerHTML = '<span class="err">未在配对中</span> · 请回到电脑端生成配对码';
      }
    }).catch(function () { $('statusText').textContent = '无法连接'; });
  }

  function callApi(path) {
    var t = getToken();
    if (!t) return Promise.resolve({ ok: false, error: 'no_token' });
    return fetch(path, { headers: { 'Authorization': 'Bearer ' + t } }).then(function (r) { return r.json(); });
  }

  $('pairBtn').addEventListener('click', function () {
    var code = $('pairCode').value.trim();
    var name = $('deviceName').value.trim() || 'Phone';
    $('pairMsg').textContent = '提交中…';
    $('pairMsg').className = '';
    fetch('/api/mobile/pair/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairCode: code, deviceName: name })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok) {
        setToken(j.token, j.deviceId);
        $('pairMsg').innerHTML = '<span class="ok">配对成功</span>';
        $('tokenCard').style.display = '';
        $('tokenShow').textContent = j.token;
        $('pairCode').value = '';
      } else {
        $('pairMsg').innerHTML = '<span class="err">失败：' + (j && j.error || 'unknown') + '</span>';
        $('pairMsg').className = 'err';
      }
    }).catch(function (e) {
      $('pairMsg').innerHTML = '<span class="err">网络错误</span>';
      $('pairMsg').className = 'err';
    });
  });

  $('testStatusBtn') && $('testStatusBtn').addEventListener('click', function () {
    callApi('/api/mobile/status').then(function (j) {
      $('apiOut').textContent = JSON.stringify(j, null, 2);
    });
  });
  $('testFilesBtn') && $('testFilesBtn').addEventListener('click', function () {
    callApi('/api/mobile/files').then(function (j) {
      $('apiOut').textContent = JSON.stringify(j, null, 2);
    });
  });

  refreshStatus();
  setInterval(refreshStatus, 10000);
  if (getToken()) {
    $('tokenCard').style.display = '';
    $('tokenShow').textContent = getToken();
  }
})();
</script>
</body></html>`;
  sendText(res, 200, html, 'text/html; charset=utf-8');
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
  DEFAULT_PORT,
  PAIR_TTL_MS,
  TOKEN_INACTIVE_MS,
  MAX_LIST_ITEMS,
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
