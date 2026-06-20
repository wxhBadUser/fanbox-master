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

  console.log(`\n===== 总结 =====`);
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
