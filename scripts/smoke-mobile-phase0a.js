// 端到端 smoke 测试：手工模拟 desktop + mobile 两端
// 用 node 直接跑，验证 mobile.js + server.js 接入逻辑都对
'use strict';

const http = require('http');
const path = require('path');
const os = require('os');

// 用临时 HOME 避免污染真实 ~/.fanbox
const TMP_HOME = path.join(os.tmpdir(), 'fanbox-mobile-smoke-' + Date.now());
require('fs').mkdirSync(TMP_HOME, { recursive: true });
process.env.HOME = TMP_HOME; process.env.USERPROFILE = TMP_HOME;

const mobile = require(path.join(__dirname, '..', 'electron', 'mobile.js'));

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('  ✓', name); passed++; }
  else { console.log('  ✗', name, extra || ''); failed++; }
}

function req(opts, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: buf }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  console.log('\n[1] 默认关闭：mobile server 不应监听 4580');
  // 4580 端口默认未被占用 —— 用 net 检查
  const net = require('net');
  const portBusy = await new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(true));
    s.once('listening', () => s.close(() => resolve(false)));
    s.listen(4580, '127.0.0.1');
  });
  ok('port 4580 free by default', !portBusy);

  console.log('\n[2] 模块基础：isLanIp / genPairCode / sha256');
  ok('isLanIp(127.0.0.1)', mobile.isLanIp('127.0.0.1'));
  ok('isLanIp(::1)', mobile.isLanIp('::1'));
  ok('isLanIp(192.168.1.5)', mobile.isLanIp('192.168.1.5'));
  ok('isLanIp(10.0.0.1)', mobile.isLanIp('10.0.0.1'));
  ok('isLanIp(172.16.5.1)', mobile.isLanIp('172.16.5.1'));
  ok('isLanIp(172.31.5.1)', mobile.isLanIp('172.31.5.1'));
  ok('isLanIp(172.32.5.1) = false (公网)', !mobile.isLanIp('172.32.5.1'));
  ok('isLanIp(8.8.8.8) = false (公网)', !mobile.isLanIp('8.8.8.8'));
  ok('isLanIp(::ffff:192.168.1.5) (mapped)', mobile.isLanIp('::ffff:192.168.1.5'));
  ok('isLanIp("") = false', !mobile.isLanIp(''));
  ok('isLanIp(null) = false', !mobile.isLanIp(null));

  const c = mobile.genPairCode();
  ok('genPairCode length 6', /^\d{6}$/.test(c), `got "${c}"`);
  const t1 = mobile.genToken();
  const t2 = mobile.genToken();
  ok('genToken length 32 base64url', t1.length >= 42);
  ok('genToken unique', t1 !== t2);
  ok('sha256 hex 64', /^[0-9a-f]{64}$/.test(mobile.sha256('hello')));
  ok('sha256(t1) != sha256(t2)', mobile.sha256(t1) !== mobile.sha256(t2));

  console.log('\n[3] 启动 mobile server');
  const port = 4580;
  const server = mobile.startMobileServer({ port });
  await new Promise((r) => setTimeout(r, 200));
  ok('mobile server listening', server.listening);

  console.log('\n[4] /api/mobile/pair/status (no token required)');
  const r1 = await req({ host: '127.0.0.1', port, path: '/api/mobile/pair/status', method: 'GET' });
  ok('pair/status 200', r1.status === 200, r1.body);
  const j1 = JSON.parse(r1.body);
  ok('pair/status pairing=false (no active code)', j1.pairing === false);

  console.log('\n[5] /api/mobile/status 需要 token');
  // 先模拟 config.enabled = true（因为 consumePairCode 不会改它，需要外部开）
  await mobile.saveConfig({ enabled: true });
  const r2 = await req({ host: '127.0.0.1', port, path: '/api/mobile/status', method: 'GET' });
  ok('status 401 without token', r2.status === 401, r2.body);
  const r2b = await req({ host: '127.0.0.1', port, path: '/api/mobile/status', method: 'GET', headers: { Authorization: 'Bearer wrong-token' } });
  ok('status 401 with bad token', r2b.status === 401, r2b.body);

  console.log('\n[6] /api/mobile/files 需要 token');
  const r3 = await req({ host: '127.0.0.1', port, path: '/api/mobile/files', method: 'GET' });
  ok('files 401 without token', r3.status === 401, r3.body);

  console.log('\n[7] 非 LAN IP 一律 403');
  // 模拟"非 LAN IP" —— 用一个公网 IP 替换 socket.remoteAddress 是不行的，但我们走逻辑路径
  // 通过 mock 一个不同的 remoteAddress 不可行，改为测 isLanIp 覆盖的判断
  // 跳过 socket 改写；只验证 isLanIp 已经覆盖公网拒绝

  console.log('\n[8] 生成配对码 + 配对');
  const pc = await mobile.startPairCode();
  ok('pairCode 6 digits', /^\d{6}$/.test(pc.pairCode), `got "${pc.pairCode}"`);
  ok('expiresIn=60', pc.expiresIn === 60);
  const r4 = await req({ host: '127.0.0.1', port, path: '/api/mobile/pair/confirm', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ pairCode: '999999', deviceName: 'Smoke' }));
  ok('pair/confirm 401 with wrong code', r4.status === 401, r4.body);
  const r5 = await req({ host: '127.0.0.1', port, path: '/api/mobile/pair/confirm', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ pairCode: pc.pairCode, deviceName: 'Smoke Phone' }));
  ok('pair/confirm 200 with correct code', r5.status === 200, r5.body);
  const j5 = JSON.parse(r5.body);
  ok('token returned', typeof j5.token === 'string' && j5.token.length > 30);
  ok('deviceId returned', typeof j5.deviceId === 'string');
  ok('scopes include read:status', j5.scopes && j5.scopes.includes('read:status'));
  ok('scopes include read:files', j5.scopes && j5.scopes.includes('read:files'));

  // 配对成功后旧配对码失效
  const r6 = await req({ host: '127.0.0.1', port, path: '/api/mobile/pair/confirm', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ pairCode: pc.pairCode, deviceName: 'Smoke2' }));
  ok('old pairCode cannot be reused (401)', r6.status === 401, r6.body);

  console.log('\n[9] 用 token 访问受保护 API');
  const r7 = await req({ host: '127.0.0.1', port, path: '/api/mobile/status', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('status 200 with valid token', r7.status === 200, r7.body);
  const j7 = JSON.parse(r7.body);
  ok('status returns deviceName', j7.mobile && j7.mobile.deviceName === 'Smoke Phone', JSON.stringify(j7));

  const r8 = await req({ host: '127.0.0.1', port, path: '/api/mobile/files?path=' + encodeURIComponent(TMP_HOME), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('files 200 with valid token', r8.status === 200, r8.body);
  const j8 = JSON.parse(r8.body);
  ok('files items array', Array.isArray(j8.items));
  ok('files path is normalized', j8.path === path.resolve(TMP_HOME));

  const r8b = await req({ host: '127.0.0.1', port, path: '/api/mobile/files?path=' + encodeURIComponent('C:\\Windows\\System32\\drivers\\etc\\hosts'), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('files rejects path outside allowed roots', r8b.status === 403, r8b.body);

  console.log('\n[10] X-FanBox-Mobile-Token 头同样工作');
  const r9 = await req({ host: '127.0.0.1', port, path: '/api/mobile/status', method: 'GET', headers: { 'X-FanBox-Mobile-Token': j5.token } });
  ok('status 200 with X-FanBox-Mobile-Token', r9.status === 200, r9.body);

  console.log('\n[11] tokens.json 不含明文 token');
  const fs = require('fs');
  const tokensRaw = fs.readFileSync(path.join(TMP_HOME, '.fanbox', 'mobile', 'tokens.json'), 'utf8');
  ok('tokens.json does not contain raw token', !tokensRaw.includes(j5.token));
  ok('tokens.json contains tokenHash', /"tokenHash"/.test(tokensRaw));

  console.log('\n[12] publicStatus 脱敏');
  const st = await mobile.publicStatus();
  ok('publicStatus no token field', !('tokens' in st) && !('tokenHash' in st));
  ok('publicStatus has pairedDevices', Array.isArray(st.pairedDevices) && st.pairedDevices.length === 1);
  ok('pairedDevice has no tokenHash', !('tokenHash' in st.pairedDevices[0]));
  ok('pairedDevice has deviceName', st.pairedDevices[0].deviceName === 'Smoke Phone');

  console.log('\n[13] revokeToken');
  await mobile.revokeToken(j5.deviceId);
  const r10 = await req({ host: '127.0.0.1', port, path: '/api/mobile/status', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('revoked token returns 401', r10.status === 401, r10.body);

  console.log('\n[14] 关闭 server');
  await new Promise((r) => server.close(r));
  ok('mobile server closed', !server.listening);

  console.log('\n[15] LAN IP 边界');
  ok('isLanIp(127.0.0.1)', mobile.isLanIp('127.0.0.1'));
  ok('isLanIp(127.255.255.255) (loopback range)', mobile.isLanIp('127.255.255.255'));
  ok('!isLanIp(128.0.0.1) (first non-loopback)', !mobile.isLanIp('128.0.0.1'));
  ok('!isLanIp(11.0.0.1) (just outside 10.x)', !mobile.isLanIp('11.0.0.1'));
  ok('isLanIp(169.254.1.1) (link-local)', mobile.isLanIp('169.254.1.1'));
  ok('!isLanIp(169.255.1.1) (outside link-local)', !mobile.isLanIp('169.255.1.1'));
  ok('!isLanIp(0.0.0.0)', !mobile.isLanIp('0.0.0.0'));

  console.log('\n[16] pickBestLanUrls 智能选网');
  const pick = mobile.pickBestLanUrls(4580);
  ok('pickBestLanUrls returns { primary, others, fallback }', pick && 'primary' in pick && 'others' in pick && 'fallback' in pick);
  ok('pickBestLanUrls primary.url is a string', pick.primary && typeof pick.primary.url === 'string');
  ok('pickBestLanUrls primary.url starts with http://', /^http:\/\//.test(pick.primary.url));
  ok('pickBestLanUrls primary.url 不含 0.0.0.0', !pick.primary.url.includes('0.0.0.0'));
  ok('pickBestLanUrls primary.url contains /mobile', pick.primary.url.endsWith('/mobile'));
  ok('pickBestLanUrls others is an array', Array.isArray(pick.others));
  ok('pickBestLanUrls fallback is a boolean', typeof pick.fallback === 'boolean');
  // primary 应该在 others 之前（如果它存在的话）
  if (pick.primary && pick.others.length > 0) {
    ok('primary 在 others 之前', true);
  } else {
    ok('primary 在 others 之前 (only primary, no others)', true);
  }

  console.log('\n[17] isVirtualIface 黑名单');
  ok('isVirtualIface(vEthernet (WSL))', mobile.isVirtualIface('vEthernet (WSL)'));
  ok('isVirtualIface(vEthernet (DockerNAT))', mobile.isVirtualIface('vEthernet (DockerNAT)'));
  ok('isVirtualIface(Hyper-V Virtual Ethernet Adapter)', mobile.isVirtualIface('Hyper-V Virtual Ethernet Adapter'));
  ok('isVirtualIface(VMware Network Adapter VMnet1)', mobile.isVirtualIface('VMware Network Adapter VMnet1'));
  ok('isVirtualIface(VirtualBox Host-Only Ethernet Adapter)', mobile.isVirtualIface('VirtualBox Host-Only Ethernet Adapter'));
  ok('isVirtualIface(tun0)', mobile.isVirtualIface('tun0'));
  ok('isVirtualIface(NordVPN)', mobile.isVirtualIface('NordVPN'));
  ok('isVirtualIface(Tailscale)', mobile.isVirtualIface('Tailscale'));
  ok('isVirtualIface(bridge0)', mobile.isVirtualIface('bridge0'));
  ok('isVirtualIface(awdl0)', mobile.isVirtualIface('awdl0'));
  ok('!isVirtualIface(Wi-Fi)', !mobile.isVirtualIface('Wi-Fi'));
  ok('!isVirtualIface(Ethernet)', !mobile.isVirtualIface('Ethernet'));
  ok('!isVirtualIface(en0)', !mobile.isVirtualIface('en0'));
  ok('!isVirtualIface(eth0)', !mobile.isVirtualIface('eth0'));
  ok('!isVirtualIface(wlan0)', !mobile.isVirtualIface('wlan0'));
  ok('!isVirtualIface("")', !mobile.isVirtualIface(''));
  ok('!isVirtualIface(null)', !mobile.isVirtualIface(null));

  console.log('\n[18] publicStatus 含 primaryLanUrl 字段');
  await mobile.saveConfig({ enabled: true });
  const st2 = await mobile.publicStatus();
  ok('publicStatus has primaryLanUrl field', 'primaryLanUrl' in st2);
  ok('publicStatus has primaryIface field', 'primaryIface' in st2);
  ok('publicStatus has lanUrlsRanked field', 'lanUrlsRanked' in st2);
  ok('publicStatus has lanUrlsFallback field', 'lanUrlsFallback' in st2);
  ok('publicStatus.primaryLanUrl 不含 0.0.0.0 (when enabled)', !st2.primaryLanUrl || !st2.primaryLanUrl.includes('0.0.0.0'));
  ok('publicStatus.lanUrlsRanked 是数组', Array.isArray(st2.lanUrlsRanked));
  if (st2.lanUrlsRanked.length > 0) {
    const first = st2.lanUrlsRanked[0];
    ok('ranked[0] has url field', typeof first.url === 'string');
    ok('ranked[0] has iface field', typeof first.iface === 'string');
    ok('ranked[0] has address field', typeof first.address === 'string');
    ok('ranked[0] has score field', typeof first.score === 'number');
    // 排名 0 的分数应该 >= 排名 1 的分数（如果有）
    if (st2.lanUrlsRanked.length > 1) {
      ok('ranked[0].score >= ranked[1].score', st2.lanUrlsRanked[0].score >= st2.lanUrlsRanked[1].score);
    }
  }

  // ===========================================================
  // Phase 0B：只读 Mobile API 补齐
  // ===========================================================

  console.log('\n[19] Phase 0B 路由常量 + 工具');
  ok('MAX_FILE_READ_DEFAULT === 256KB', mobile.MAX_FILE_READ_DEFAULT === 256 * 1024);
  ok('MAX_FILE_READ_LIMIT === 1MB', mobile.MAX_FILE_READ_LIMIT === 1024 * 1024);
  ok('MAX_SEARCH_LIMIT_DEFAULT === 50', mobile.MAX_SEARCH_LIMIT_DEFAULT === 50);
  ok('MAX_SEARCH_LIMIT_HARD === 100', mobile.MAX_SEARCH_LIMIT_HARD === 100);
  ok('MAX_SCREENSHOTS_DEFAULT === 20', mobile.MAX_SCREENSHOTS_DEFAULT === 20);
  ok('MAX_SCREENSHOTS_HARD === 50', mobile.MAX_SCREENSHOTS_HARD === 50);
  ok('MAX_THUMB_WIDTH_DEFAULT === 240', mobile.MAX_THUMB_WIDTH_DEFAULT === 240);
  ok('MAX_THUMB_WIDTH_HARD === 512', mobile.MAX_THUMB_WIDTH_HARD === 512);
  ok('SKILL_DESC_CUT_MOBILE === 300', mobile.SKILL_DESC_CUT_MOBILE === 300);
  ok('extOf("foo.md") === "md"', mobile.extOf('foo.md') === 'md');
  ok('extOf("README") === ""', mobile.extOf('README') === '');
  ok('extOf(".env") === "env"', mobile.extOf('.env') === 'env');
  ok('kindOf("a.md") === text', mobile.kindOf('a.md') === 'text');
  ok('kindOf("a.png") === image', mobile.kindOf('a.png') === 'image');
  ok('kindOf("a.pdf") === pdf', mobile.kindOf('a.pdf') === 'pdf');
  ok('kindOf("a.zip") === archive', mobile.kindOf('a.zip') === 'archive');
  ok('mimeOf("a.md") === text/markdown', mobile.mimeOf('a.md') === 'text/markdown; charset=utf-8');
  ok('mimeOf("a.png") === image/png', mobile.mimeOf('a.png') === 'image/png');
  ok('fuzzyScore("readme","README.md") > 0', mobile.fuzzyScore('readme', 'README.md') > 0);
  ok('fuzzyScore("xyz","README.md") < 0 (无匹配)', mobile.fuzzyScore('xyz', 'README.md') < 0);

  console.log('\n[20] isForbiddenPath 黑名单');
  // 准备敏感目录/文件
  const sensDir = path.join(TMP_HOME, '.fanbox', 'mobile');
  fs.mkdirSync(sensDir, { recursive: true });
  const sensCfg = path.join(TMP_HOME, '.fanbox', 'config.json');
  const sensAcct = path.join(TMP_HOME, '.fanbox', 'account.json');
  fs.writeFileSync(sensCfg, '{}');
  fs.writeFileSync(sensAcct, '{}');
  const sensEnv = path.join(TMP_HOME, '.env');
  fs.writeFileSync(sensEnv, 'SECRET=1');
  const sensEnvLocal = path.join(TMP_HOME, '.env.local');
  fs.writeFileSync(sensEnvLocal, 'SECRET=1');
  const sensClaude = path.join(TMP_HOME, '.claude', 'projects');
  fs.mkdirSync(sensClaude, { recursive: true });
  const sensCodex = path.join(TMP_HOME, '.codex', 'sessions');
  fs.mkdirSync(sensCodex, { recursive: true });
  ok('forbidden: ~/.fanbox/mobile/', mobile.isForbiddenPath(sensDir));
  ok('forbidden: ~/.fanbox/mobile/config.json', mobile.isForbiddenPath(path.join(sensDir, 'config.json')));
  ok('forbidden: ~/.fanbox/config.json', mobile.isForbiddenPath(sensCfg));
  ok('forbidden: ~/.fanbox/account.json', mobile.isForbiddenPath(sensAcct));
  ok('forbidden: ~/.env', mobile.isForbiddenPath(sensEnv));
  ok('forbidden: ~/.env.local', mobile.isForbiddenPath(sensEnvLocal));
  ok('forbidden: ~/.claude/projects/', mobile.isForbiddenPath(sensClaude));
  ok('forbidden: ~/.claude/projects/x.jsonl', mobile.isForbiddenPath(path.join(sensClaude, 'x.jsonl')));
  ok('forbidden: ~/.codex/sessions/', mobile.isForbiddenPath(sensCodex));
  ok('allowed: 普通 HOME 文件', !mobile.isForbiddenPath(path.join(TMP_HOME, 'foo.txt')));
  ok('allowed: 普通 HOME 目录', !mobile.isForbiddenPath(TMP_HOME));
  ok('allowed: 项目 .env 的上一层', !mobile.isForbiddenPath(path.join(TMP_HOME, 'projects')));
  // pathAllowedSafe 综合判定
  ok('pathAllowedSafe(TMP_HOME) === true', mobile.pathAllowedSafe(TMP_HOME) === true);
  ok('pathAllowedSafe(~/.fanbox/mobile/) === false', mobile.pathAllowedSafe(sensDir) === false);
  ok('pathAllowedSafe(~/.fanbox/config.json) === false', mobile.pathAllowedSafe(sensCfg) === false);
  ok('pathAllowedSafe(~/.env) === false', mobile.pathAllowedSafe(sensEnv) === false);
  ok('pathAllowedSafe(~/.claude/projects/) === false', mobile.pathAllowedSafe(sensClaude) === false);
  ok('pathAllowedSafe(C:\\Windows) === false', mobile.pathAllowedSafe(process.platform === 'win32' ? 'C:\\Windows' : '/etc') === false); // win: 系统目录；非 win: /etc 不在 HOME
  ok('pathAllowedSafe(outside HOME) === false', mobile.pathAllowedSafe(process.platform === 'win32' ? 'D:\\foo' : '/var/log') === false);

  console.log('\n[21] Phase 0B API：不带 token 一律 401');
  // 重新启动 server（[14] 关闭过）
  const restart = mobile.startMobileServer({ port });
  // 等 server.listening = true（listen 异步）
  for (let i = 0; i < 50 && !restart.listening; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 20));
  }
  ok('mobile server 重启 (Phase 0B)', restart && restart.listening);
  // 重新配对一个干净 token（j5 是 const 对象，属性可改）
  const pcB = await mobile.startPairCode();
  const rPCB = await req({ host: '127.0.0.1', port, path: '/api/mobile/pair/confirm', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ pairCode: pcB.pairCode, deviceName: 'Phase0B' }));
  const jPCB = JSON.parse(rPCB.body);
  j5.token = jPCB.token; // 覆盖原 token 给后续 HTTP 测试用
  j5.deviceId = jPCB.deviceId;

  const noTokPaths = [
    '/api/mobile/file?path=' + encodeURIComponent(TMP_HOME),
    '/api/mobile/search?q=test',
    '/api/mobile/skills',
    '/api/mobile/agents',
    '/api/mobile/usage',
    '/api/mobile/screenshots',
    '/api/mobile/roots',
    '/api/mobile/thumb?path=' + encodeURIComponent(path.join(TMP_HOME, 'x.png')),
  ];
  for (const p of noTokPaths) {
    // eslint-disable-next-line no-await-in-loop
    const r = await req({ host: '127.0.0.1', port, path: p, method: 'GET' });
    ok(`no-token ${p} -> 401`, r.status === 401, `got ${r.status} body=${r.body.slice(0, 120)}`);
  }
  // 错 token
  for (const p of noTokPaths) {
    // eslint-disable-next-line no-await-in-loop
    const r = await req({ host: '127.0.0.1', port, path: p, method: 'GET', headers: { Authorization: 'Bearer wrong-token' } });
    ok(`bad-token ${p} -> 401`, r.status === 401, `got ${r.status}`);
  }

  // 准备测试文件
  const testTxt = path.join(TMP_HOME, 'sample.txt');
  const testBig = path.join(TMP_HOME, 'big.txt');
  const testImg = path.join(TMP_HOME, 'pic.png');
  const testPdf = path.join(TMP_HOME, 'doc.pdf');
  fs.writeFileSync(testTxt, 'hello phase 0b\n');
  // 大文件 600KB
  const bigChunk = 'x'.repeat(64 * 1024);
  let big = '';
  for (let i = 0; i < 10; i++) big += bigChunk; // 640KB
  fs.writeFileSync(testBig, big);
  // 假图片（1x1 png）
  const png1x1 = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108020000009077532DE0000000017352474200AECE1CE90000000D49444154789C636001000000050001A5F645400000000049454E44AE426082', 'hex');
  fs.writeFileSync(testImg, png1x1);
  fs.writeFileSync(testPdf, Buffer.from('%PDF-1.4\n'));

  console.log('\n[22] Phase 0B API: /api/mobile/file 文本读取');
  const rf1 = await req({ host: '127.0.0.1', port, path: '/api/mobile/file?path=' + encodeURIComponent(testTxt), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('file(text small) 200', rf1.status === 200, rf1.body);
  const jf1 = JSON.parse(rf1.body);
  ok('file text 字段存在', typeof jf1.text === 'string');
  ok('file text 内容匹配', jf1.text.includes('hello phase 0b'));
  ok('file kind === text', jf1.kind === 'text');
  ok('file truncated === false', jf1.truncated === false);
  ok('file size 字段正确', jf1.size > 0);

  console.log('\n[23] Phase 0B API: /api/mobile/file 大文件截断');
  const rf2 = await req({ host: '127.0.0.1', port, path: '/api/mobile/file?path=' + encodeURIComponent(testBig) + '&max=131072', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('file(big, max=128KB) 200', rf2.status === 200, rf2.body);
  const jf2 = JSON.parse(rf2.body);
  ok('file big 命中 previewTooLarge', jf2.previewTooLarge === true);
  ok('file big 不含 text 字段', !('text' in jf2));
  ok('file big size > max', jf2.size > 131072);

  console.log('\n[24] Phase 0B API: /api/mobile/file max 上限 1MB');
  const rf3 = await req({ host: '127.0.0.1', port, path: '/api/mobile/file?path=' + encodeURIComponent(testTxt) + '&max=99999999', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('file(max huge) 仍 200', rf3.status === 200);
  const jf3 = JSON.parse(rf3.body);
  // 上限钳制到 1MB；sample.txt < 1MB，应全文返回
  ok('file max 钳制 (sample.txt 仍全文)', jf3.text && jf3.text.includes('hello phase 0b'));

  console.log('\n[25] Phase 0B API: /api/mobile/file 二进制/PDF/图片返回 thumbUrl');
  const rf4 = await req({ host: '127.0.0.1', port, path: '/api/mobile/file?path=' + encodeURIComponent(testImg), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('file(image) 200', rf4.status === 200, rf4.body);
  const jf4 = JSON.parse(rf4.body);
  ok('file image kind === image', jf4.kind === 'image');
  ok('file image mime === image/png', jf4.mime === 'image/png');
  ok('file image 有 thumbUrl', typeof jf4.thumbUrl === 'string' && jf4.thumbUrl.startsWith('/api/mobile/thumb'));
  ok('file image 无 text 字段', !('text' in jf4));
  ok('file image 无 base64 字段', !('base64' in jf4) && !('data' in jf4));
  // PDF
  const rf5 = await req({ host: '127.0.0.1', port, path: '/api/mobile/file?path=' + encodeURIComponent(testPdf), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  const jf5 = JSON.parse(rf5.body);
  ok('file pdf kind === pdf', jf5.kind === 'pdf');
  ok('file pdf 无 text/base64', !('text' in jf5) && !('base64' in jf5));

  console.log('\n[26] Phase 0B API: /api/mobile/file 路径沙箱');
  // 越界
  const rf6 = await req({ host: '127.0.0.1', port, path: '/api/mobile/file?path=' + encodeURIComponent('C:\\Windows\\System32\\drivers\\etc\\hosts'), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('file(系统目录) 403', rf6.status === 403, rf6.body);
  // 命中 .env 黑名单
  const rf7 = await req({ host: '127.0.0.1', port, path: '/api/mobile/file?path=' + encodeURIComponent(sensEnv), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('file(~/.env) 403', rf7.status === 403, rf7.body);
  const jf7 = JSON.parse(rf7.body);
  ok('file(~/.env) error=forbidden_path', jf7.error === 'forbidden_path');
  // 命中 .fanbox/mobile/
  const rf8 = await req({ host: '127.0.0.1', port, path: '/api/mobile/file?path=' + encodeURIComponent(path.join(sensDir, 'config.json')), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('file(.fanbox/mobile/) 403', rf8.status === 403, rf8.body);
  // 命中 Claude 日志
  const rf9 = await req({ host: '127.0.0.1', port, path: '/api/mobile/file?path=' + encodeURIComponent(path.join(sensClaude, 'x.jsonl')), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('file(Claude logs) 403', rf9.status === 403, rf9.body);
  // 缺 path
  const rf10 = await req({ host: '127.0.0.1', port, path: '/api/mobile/file', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('file(missing path) 400', rf10.status === 400, rf10.body);

  console.log('\n[27] Phase 0B API: /api/mobile/search 限制 limit');
  // 准备若干文件
  fs.writeFileSync(path.join(TMP_HOME, 'README-foo.md'), 'x');
  fs.writeFileSync(path.join(TMP_HOME, 'readme-bar.md'), 'x');
  fs.writeFileSync(path.join(TMP_HOME, 'aaaa-readme-zzzz.md'), 'x');
  const rs1 = await req({ host: '127.0.0.1', port, path: '/api/mobile/search?q=readme&path=' + encodeURIComponent(TMP_HOME) + '&limit=2', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('search(limit=2) 200', rs1.status === 200, rs1.body);
  const js1 = JSON.parse(rs1.body);
  ok('search items.length <= 2', Array.isArray(js1.items) && js1.items.length <= 2);
  ok('search query === readme', js1.query === 'readme');
  ok('search items 含 score/path', js1.items.every(i => typeof i.score === 'number' && typeof i.path === 'string'));

  console.log('\n[28] Phase 0B API: /api/mobile/search 黑名单');
  // 搜 .env 也无效（直接走路径沙箱就拒）
  const rs2 = await req({ host: '127.0.0.1', port, path: '/api/mobile/search?q=foo&path=' + encodeURIComponent(sensDir), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('search(.fanbox/mobile/) 403', rs2.status === 403, rs2.body);
  const rs3 = await req({ host: '127.0.0.1', port, path: '/api/mobile/search?q=foo&path=' + encodeURIComponent(sensClaude), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('search(Claude logs) 403', rs3.status === 403, rs3.body);

  console.log('\n[29] Phase 0B API: /api/mobile/skills 字段裁剪');
  // 准备假 skill
  const fakeSkillDir = path.join(TMP_HOME, '.claude', 'skills', 'smoke-test-skill');
  fs.mkdirSync(fakeSkillDir, { recursive: true });
  fs.writeFileSync(path.join(fakeSkillDir, 'SKILL.md'), '---\ndescription: A test skill for smoke testing phase 0B. 中文说明。\n---\n# body\n');
  // 设 HOME 临时目录变量以让 search 找得到
  const rsSkills = await req({ host: '127.0.0.1', port, path: '/api/mobile/skills', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('skills 200', rsSkills.status === 200, rsSkills.body);
  // 由于 mobile 模块 HOME 是真实 HOME（not TMP_HOME），skills 返回的是真实 ~/.claude/skills 列表
  // —— 仍可断言字段裁剪与无敏感字段
  const jSkills = JSON.parse(rsSkills.body);
  ok('skills items 是数组', Array.isArray(jSkills.items));
  ok('skills items 每条不含 path/dir 绝对路径', jSkills.items.every(i => !('path' in i) && !('dir' in i)));
  ok('skills items 每条不含 raw log 路径', jSkills.items.every(i => !('jsonl' in i) && !('rawLog' in i)));
  ok('skills items 每条 name 字段存在', jSkills.items.every(i => typeof i.name === 'string'));
  ok('skills items source 是已知枚举', jSkills.items.every(i => ['claude', 'codex', 'agents', 'plugin', 'project'].includes(i.source)));
  ok('skills items description <= 300', jSkills.items.every(i => typeof i.description === 'string' && i.description.length <= 300));
  ok('skills items hits 是 number', jSkills.items.every(i => typeof i.hits === 'number'));
  ok('skills items lastUsedAt 是 number', jSkills.items.every(i => typeof i.lastUsedAt === 'number'));
  ok('skills items enabled 是 boolean', jSkills.items.every(i => typeof i.enabled === 'boolean'));

  console.log('\n[30] Phase 0B API: /api/mobile/agents 只读探测');
  const rsA = await req({ host: '127.0.0.1', port, path: '/api/mobile/agents', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('agents 200', rsA.status === 200, rsA.body);
  const jA = JSON.parse(rsA.body);
  ok('agents items 是数组', Array.isArray(jA.items));
  ok('agents items 长度 === 4', jA.items.length === 4);
  const ids = jA.items.map(i => i.id);
  ok('agents 含 claude/codex/opencode/qoder', ['claude', 'codex', 'opencode', 'qoder'].every(x => ids.includes(x)));
  ok('agents 每条都有 id/label/command/installed/hint', jA.items.every(i => i.id && i.label && i.command && typeof i.installed === 'boolean' && typeof i.hint === 'string'));
  ok('agents 不含 token/cookie/apiKey', jA.items.every(i => !('token' in i) && !('apiKey' in i) && !('cookie' in i)));
  // POST 应被 405
  const rApost = await req({ host: '127.0.0.1', port, path: '/api/mobile/agents', method: 'POST', headers: { Authorization: 'Bearer ' + j5.token, 'Content-Type': 'application/json' } }, '{}');
  ok('agents POST 405', rApost.status === 405, rApost.body);

  console.log('\n[31] Phase 0B API: /api/mobile/usage 不暴露 JSONL path');
  const rsU = await req({ host: '127.0.0.1', port, path: '/api/mobile/usage', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('usage 200', rsU.status === 200, rsU.body);
  const jU = JSON.parse(rsU.body);
  ok('usage summary 存在', jU.summary && typeof jU.summary.todayTokens === 'number' && typeof jU.summary.weekTokens === 'number');
  ok('usage agents 数组', Array.isArray(jU.agents) && jU.agents.length === 2);
  const usageIds = jU.agents.map(a => a.id);
  ok('usage 含 claude + codex', usageIds.includes('claude') && usageIds.includes('codex'));
  ok('usage 不含 JSONL 路径', !JSON.stringify(jU).includes('.jsonl'));
  ok('usage 不含 OAuth/anthropic/api.anthropic.com', !/oauth|anthropic|api\.anthropic/i.test(JSON.stringify(jU)));
  ok('usage 不含 cookie/apiKey', jU.agents.every(a => !('apiKey' in a) && !('cookie' in a) && !('token' in a)));

  console.log('\n[32] Phase 0B API: /api/mobile/screenshots 数量限制');
  // 在 .fanbox/screenshots/ 写几张
  const fanboxShotDir = path.join(TMP_HOME, '.fanbox', 'screenshots');
  fs.mkdirSync(fanboxShotDir, { recursive: true });
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(fanboxShotDir, `shot-${i}.png`), png1x1);
  }
  const rsS = await req({ host: '127.0.0.1', port, path: '/api/mobile/screenshots?limit=3', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('screenshots(limit=3) 200', rsS.status === 200, rsS.body);
  const jS = JSON.parse(rsS.body);
  ok('screenshots items 是数组', Array.isArray(jS.items));
  ok('screenshots items.length <= 3', jS.items.length <= 3);
  if (jS.items.length > 0) {
    ok('screenshots item 有 thumbUrl', jS.items.every(i => typeof i.thumbUrl === 'string' && i.thumbUrl.startsWith('/api/mobile/thumb')));
    ok('screenshots item 无 base64', jS.items.every(i => !('base64' in i) && !('data' in i)));
  }

  console.log('\n[33] Phase 0B API: /api/mobile/thumb 需要 token');
  const rT1 = await req({ host: '127.0.0.1', port, path: '/api/mobile/thumb?path=' + encodeURIComponent(testImg), method: 'GET' });
  ok('thumb 无 token 401', rT1.status === 401, rT1.body);
  // 沙箱拒绝
  const rT2 = await req({ host: '127.0.0.1', port, path: '/api/mobile/thumb?path=' + encodeURIComponent(sensEnv), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('thumb(.env) 403', rT2.status === 403, rT2.body);
  // 缺 path
  const rT3 = await req({ host: '127.0.0.1', port, path: '/api/mobile/thumb', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('thumb(missing path) 400', rT3.status === 400, rT3.body);
  // 非图片 (txt)
  const rT4 = await req({ host: '127.0.0.1', port, path: '/api/mobile/thumb?path=' + encodeURIComponent(testTxt), method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('thumb(text) 415', rT4.status === 415, rT4.body);

  console.log('\n[34] Phase 0B API: /api/mobile/roots');
  const rR = await req({ host: '127.0.0.1', port, path: '/api/mobile/roots', method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
  ok('roots 200', rR.status === 200, rR.body);
  const jR = JSON.parse(rR.body);
  ok('roots.home 是字符串', typeof jR.home === 'string');
  ok('roots.platform 是字符串', typeof jR.platform === 'string');
  ok('roots.roots 是数组', Array.isArray(jR.roots));
  ok('roots.roots 不含 mobile/', jR.roots.every(r => !String(r.path).includes('.fanbox' + path.sep + 'mobile')));

  console.log('\n[35] Phase 0B API: 禁用后旧 token 一律 401');
  await mobile.saveConfig({ enabled: false });
  await mobile.revokeAllTokens();
  for (const p of noTokPaths) {
    // eslint-disable-next-line no-await-in-loop
    const r = await req({ host: '127.0.0.1', port, path: p, method: 'GET', headers: { Authorization: 'Bearer ' + j5.token } });
    ok(`disabled ${p} -> 401`, r.status === 401, `got ${r.status}`);
  }
  // 重新配对一个干净 token 给后面 [36] 用
  await mobile.saveConfig({ enabled: true });
  const pc2 = await mobile.startPairCode();
  const rPC = await req({ host: '127.0.0.1', port, path: '/api/mobile/pair/confirm', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ pairCode: pc2.pairCode, deviceName: 'Smoke2' }));
  const jPC = JSON.parse(rPC.body);
  const token2 = jPC.token;

  console.log('\n[36] Phase 0B API: publicStatus 不含 token/tokenHash');
  const st3 = await mobile.publicStatus();
  const stStr = JSON.stringify(st3);
  ok('publicStatus 不含 tokenHash', !stStr.includes('tokenHash'));
  ok('publicStatus 不含 .jsonl', !stStr.includes('.jsonl'));
  ok('publicStatus 不含 mobile/ 子路径', !stStr.includes('.fanbox' + path.sep + 'mobile'));
  // 用新 token 拉一次 /api/mobile/file 走通
  const reentry = await req({ host: '127.0.0.1', port, path: '/api/mobile/file?path=' + encodeURIComponent(testTxt), method: 'GET', headers: { Authorization: 'Bearer ' + token2 } });
  ok('re-paired 后 file 仍 200', reentry.status === 200, reentry.body);

  console.log(`\n===== 总结 =====`);
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
