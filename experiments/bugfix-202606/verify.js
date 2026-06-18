// 2026-06 批量修复的自动化验收：Playwright 驱动 Electron（假 HOME，不碰真实数据，不影响正在跑的翻箱）。
// 覆盖：①冷启动 PTY 列宽 ②IME CapsLock 双写 ③通知误报四场景 ④标签项目识别/双击定位/Claude 按钮
// ⑤滚动失同步（隐藏期灌行后能滚到底）⑥裸文件名回扫定位（带同名诱饵）⑦CSRF Origin 校验。共 16 项断言。
const { _electron } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 对运行中的服务端发裸 HTTP POST（Node 能自由设 Origin，浏览器 fetch 不行），测 CSRF 拦截
function postWrite(origin, target, content) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ path: target, content });
    const req = http.request({ host: '127.0.0.1', port: 4640, path: '/api/write', method: 'POST',
      headers: Object.assign({ 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) }, origin ? { Origin: origin } : {}) },
      (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode, body: d })); });
    req.on('error', (e) => resolve({ status: 0, body: String(e) }));
    req.write(body); req.end();
  });
}
const ROOT = path.resolve(__dirname, '../..');
const HOME = '/tmp/fb-verify-home';
let fails = 0;
const check = (ok, name, detail) => { console.log((ok ? 'PASS' : 'FAIL') + ': ' + name + (detail ? ' — ' + detail : '')); if (!ok) fails++; };
setTimeout(() => { console.error('FAIL: watchdog 超时'); process.exit(2); }, 240000);

(async () => {
  for (const d of ['Desktop', 'Documents', 'Downloads']) fs.mkdirSync(path.join(HOME, d), { recursive: true });
  // ⑥ 定位测试的文件布景：真身在视频项目目录，同名诱饵出现得更早，终端 cwd 与两者无关
  const proj = path.join(HOME, 'Documents/写作/03-视频创作/项目/2026.06-Fable5发布视频');
  const decoy = path.join(HOME, 'Documents/decoy');
  const cwdDir = path.join(HOME, '.claude/skills/lovart-api');
  for (const d of [proj, decoy, cwdDir]) fs.mkdirSync(d, { recursive: true });
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  fs.writeFileSync(path.join(proj, 'lovart_2ffda3364d71.png'), png);
  fs.writeFileSync(path.join(decoy, 'lovart_2ffda3364d71.png'), png);
  const app = await _electron.launch({ args: [ROOT], cwd: ROOT, env: { ...process.env, HOME, FANBOX_PORT: '4640' } });
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1560, 950); w.center(); });
  await win.waitForTimeout(2200);
  await win.evaluate(() => { localStorage.setItem('fb_guided', '1'); localStorage.setItem('fb_term_open', '1'); localStorage.setItem('fb_term_dock', 'bottom'); });
  await win.evaluate(() => location.reload()).catch(() => {}); // 复现冷启动恢复路径；上下文销毁属预期
  await win.waitForTimeout(2500);

  // ---------- ① 冷启动列宽：xterm 与 PTY 都必须匹配面板宽度 ----------
  const r1 = await win.evaluate(() => { const s = term.sessions.find((x) => x.id === term.active); return { cols: s.xterm.cols, panelW: document.querySelector('#terminal-panel').clientWidth }; });
  check(r1.cols > 120, '冷启动 xterm 列宽', 'cols=' + r1.cols + ' panelW=' + r1.panelW);
  await win.evaluate(() => term.input(term.active, 'stty size\r'));
  await win.waitForTimeout(900);
  const stty = await win.evaluate(() => { const s = term.sessions.find((x) => x.id === term.active); const b = s.xterm.buffer.active; for (let i = b.length - 1; i >= 0; i--) { const l = b.getLine(i); if (!l) continue; const t = l.translateToString(true).trim(); if (/^\d+ \d+$/.test(t)) return t; } return null; });
  const ptyCols = Number((stty || '0 0').split(' ')[1]);
  check(ptyCols > 120 && ptyCols === r1.cols, '冷启动 PTY 列宽与 xterm 对齐', 'stty=' + stty + ' xterm=' + r1.cols);

  // ---------- ② IME：composition 中按 CapsLock，只应落一次 yaoda ----------
  const ime = await win.evaluate(async () => {
    const s = term.sessions.find((x) => x.id === term.active);
    const cap = [];
    const sub = s.xterm.onData((d) => cap.push(d));
    const ta = s.host.querySelector('.xterm-helper-textarea');
    ta.focus(); ta.value = '';
    ta.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true }));
    ta.value = 'yao da';
    ta.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'yao da', bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    const kd = new KeyboardEvent('keydown', { key: 'CapsLock', code: 'CapsLock', bubbles: true, cancelable: true });
    Object.defineProperty(kd, 'keyCode', { get: () => 20 });
    ta.dispatchEvent(kd);
    ta.value = 'yaoda';
    ta.dispatchEvent(new CompositionEvent('compositionend', { data: 'yaoda', bubbles: true }));
    ta.dispatchEvent(new InputEvent('input', { data: 'yaoda', inputType: 'insertText', bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 30));
    const ku = new KeyboardEvent('keyup', { key: 'CapsLock', bubbles: true });
    Object.defineProperty(ku, 'keyCode', { get: () => 20 });
    ta.dispatchEvent(ku);
    sub.dispose();
    term.input(term.active, '\x15'); // ctrl-u 清掉测试落进 shell 的字符
    return cap.join('');
  });
  check(ime === 'yaoda', 'IME CapsLock 不双写', JSON.stringify(ime));

  // ---------- 通知 hook ----------
  await win.evaluate(() => {
    window.__fired = [];
    window.playChime = (t) => window.__fired.push(t);
    term.notify = (s, title) => window.__fired.push('notify:' + title);
  });

  // ---------- ③A 打字 5 秒 → 停顿：不应响 ----------
  await win.evaluate(() => { window.__fired.length = 0; for (let i = 0; i < 34; i++) setTimeout(() => term.input(term.active, 'a'), i * 150); });
  await win.waitForTimeout(5100 + 4200);
  const a = await win.evaluate(() => ({ fired: window.__fired.slice(), st: term.sessions.find((x) => x.id === term.active).status }));
  check(a.fired.length === 0 && a.st !== 'busy', '打字不算 agent 干活', JSON.stringify(a));
  await win.evaluate(() => term.input(term.active, '\x15'));

  // ---------- ③B 真命令输出 5 秒 → 停顿：应响一次 done ----------
  await win.evaluate(() => { window.__fired.length = 0; term.input(term.active, 'for i in {1..25}; do echo L$i; sleep 0.2; done\r'); });
  await win.waitForTimeout(5600 + 4200);
  const b = await win.evaluate(() => window.__fired.slice());
  check(b.filter((x) => x === 'done').length === 1 && !b.includes('ask'), '真任务完成响一次', JSON.stringify(b));

  // ---------- ③C 停在确认界面：应响 ask 而非 done ----------
  await win.evaluate(() => {
    window.__fired.length = 0;
    const S = term.sessions.find((x) => x.id === term.active);
    const iv = setInterval(() => { S.xterm.write('.'); term.markBusy(S); }, 300);
    setTimeout(() => { clearInterval(iv); S.xterm.write('\r\n Do you want to proceed?\r\n ❯ 1. Yes\r\n   2. No, and tell Claude what to do differently\r\n'); term.markBusy(S); }, 5000);
  });
  await win.waitForTimeout(5000 + 4500);
  const c = await win.evaluate(() => window.__fired.slice());
  check(c.includes('ask') && !c.includes('done'), '等确认识别为「等待你确认」', JSON.stringify(c));

  // ---------- ③D 假静默护栏：esc to interrupt 在页脚时不判收工 ----------
  await win.evaluate(() => {
    window.__fired.length = 0;
    const S = term.sessions.find((x) => x.id === term.active);
    const iv = setInterval(() => { S.xterm.write('.'); term.markBusy(S); }, 300);
    setTimeout(() => { clearInterval(iv); S.xterm.write('\r\n✻ Running… (esc to interrupt)\r\n'); term.markBusy(S); }, 3000);
  });
  await win.waitForTimeout(3000 + 4500);
  const d1 = await win.evaluate(() => ({ fired: window.__fired.slice(), st: term.sessions.find((x) => x.id === term.active).status }));
  check(d1.fired.length === 0 && d1.st === 'busy', '假静默护栏 hold 住', JSON.stringify(d1));
  await win.evaluate(() => { const S = term.sessions.find((x) => x.id === term.active); let t = ''; for (let i = 0; i < 30; i++) t += '\r\n'; S.xterm.write(t + 'done\r\n'); term.markBusy(S); });
  await win.waitForTimeout(4500);
  const d2 = await win.evaluate(() => window.__fired.slice());
  check(d2.includes('done'), '页脚清掉后正常收工', JSON.stringify(d2));

  // ---------- ④ 标签项目识别：cd 后标题对齐真实目录 ----------
  await win.evaluate(() => term.input(term.active, 'cd /tmp\r'));
  await win.waitForTimeout(2000);
  const title = await win.evaluate(() => term.sessions.find((x) => x.id === term.active).title);
  check(title === 'tmp', 'cd 后标签标题跟随', 'title=' + JSON.stringify(title));

  // ---------- ④ 双击标签 → 文件区定位到终端目录 ----------
  await win.evaluate(() => { const t = document.querySelector('#term-tabs .term-tab.active'); t.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  await win.waitForTimeout(1200);
  const cwdNow = await win.evaluate(() => state.cwd);
  check(cwdNow === '/private/tmp' || cwdNow === '/tmp', '双击标签定位文件区', 'state.cwd=' + cwdNow);

  // ---------- ④ Claude 按钮：新开标签 + 带免确认参数 ----------
  const launch = await win.evaluate(async () => {
    const before = term.sessions.length;
    window.__cmds = [];
    const orig = term.input;
    term.input = (id, dd) => window.__cmds.push(dd);
    document.querySelector('#term-claude').click();
    await new Promise((r) => setTimeout(r, 2500));
    term.input = orig;
    return { before, after: term.sessions.length, cmds: window.__cmds };
  });
  check(launch.after === launch.before + 1 && launch.cmds.some((x) => x.includes('claude --dangerously-skip-permissions')), 'Claude 按钮新开标签+免确认参数', JSON.stringify(launch));

  // ---------- ⑤ 滚动失同步：隐藏标签灌 6000 行 → 切回 → 应能滚到底 ----------
  const scroll = await win.evaluate(async () => {
    const ids = term.sessions.map((s) => s.id);
    const target = term.sessions[term.sessions.length - 1];
    term.activate(ids[0]); // 让目标标签 display:none
    await new Promise((r) => setTimeout(r, 300));
    const x = target.xterm;
    for (let i = 0; i < 60; i++) await new Promise((r) => x.write(Array.from({ length: 100 }, (_, j) => 'line ' + (i * 100 + j)).join('\r\n') + '\r\n', r));
    await new Promise((r) => setTimeout(r, 1000)); // 给隐藏期的错误刷新留时间
    term.activate(target.id);
    await new Promise((r) => setTimeout(r, 600));
    x.scrollLines(-200); // 用户上翻一段
    await new Promise((r) => setTimeout(r, 100));
    const vp = target.host.querySelector('.xterm-viewport');
    for (let i = 0; i < 80; i++) { // 真实用户行为：连续滚轮向下（watchdog 在 DOM 假底部时兜底）
      vp.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, deltaMode: 0, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 10));
    }
    await new Promise((r) => setTimeout(r, 500));
    const b = x.buffer.active;
    return { viewportY: b.viewportY, baseY: b.baseY };
  });
  check(scroll.viewportY === scroll.baseY, '隐藏期灌行后能滚到底', JSON.stringify(scroll));

  // ---------- ⑥ 终端裸文件名定位：回扫 scrollback 找全路径（带同名诱饵） ----------
  const loc = await win.evaluate(async ({ proj, decoy, cwdDir }) => {
    await term.newTab(cwdDir);
    await new Promise((r) => setTimeout(r, 600));
    const s = term.sessions.find((x) => x.id === term.active);
    s.xterm.write('checked ' + decoy + '/lovart_2ffda3364d71.png (old copy)\r\n');
    s.xterm.write('Image saved to ' + proj + '/lovart_2ffda3364d71.png\r\n');
    for (let i = 0; i < 60; i++) s.xterm.write('filler ' + i + '\r\n');
    s.xterm.write('│ lovart_2ffda3364d71.png │ 1.2 MB │\r\n');
    await new Promise((r) => setTimeout(r, 400));
    const scanned = term.scanScrollbackFor(term.active, 'lovart_2ffda3364d71.png', s.xterm.buffer.active.length - 1);
    await term.openTermPath(term.active, 'lovart_2ffda3364d71.png', '', s.xterm.buffer.active.length - 1);
    await new Promise((r) => setTimeout(r, 900));
    return { first: scanned.split('\n')[0], cwd: state.cwd, selected: state.selected };
  }, { proj, decoy, cwdDir });
  check(loc.first === proj + '/lovart_2ffda3364d71.png', '回扫首候选=最近出现的全路径', loc.first);
  check((loc.cwd || '').endsWith('2026.06-Fable5发布视频') && (loc.selected || '').endsWith('lovart_2ffda3364d71.png'), '裸文件名点击避开诱饵定位真身', JSON.stringify({ cwd: loc.cwd, sel: loc.selected }));

  // ---------- ⑦ CSRF：跨站 Origin 的写请求必须被拒，回环 Origin 放行 ----------
  const evilTarget = path.join(HOME, 'Desktop', 'csrf-evil.txt');
  const okTarget = path.join(HOME, 'Desktop', 'csrf-ok.txt');
  const evil = await postWrite('https://evil.example.com', evilTarget, 'pwned');
  check(evil.status === 403 && !fs.existsSync(evilTarget), '跨站 Origin 写请求被拒', 'status=' + evil.status + ' wrote=' + fs.existsSync(evilTarget));
  const ok = await postWrite('http://localhost:4640', okTarget, 'hi');
  check(ok.status === 200 && fs.existsSync(okTarget), '回环 Origin 写请求放行', 'status=' + ok.status + ' wrote=' + fs.existsSync(okTarget));

  // ---------- 截图自校验（标签色点/面包屑配对色点） ----------
  fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
  await win.screenshot({ path: path.join(__dirname, 'shots', 'after-fix.png') });

  console.log(fails === 0 ? '\n全部通过 ✅' : '\n有 ' + fails + ' 项失败 ❌');
  // 先杀光 PTY 再退出，否则主进程的「还有终端在运行」确认对话框会挡住 app.close()
  await win.evaluate(() => term.sessions.slice().forEach((s) => { try { window.fanboxPty.kill(s.id); } catch { /* */ } }));
  await win.waitForTimeout(400);
  await app.close().catch(() => {});
  setTimeout(() => process.exit(fails === 0 ? 0 : 1), 1200);
})().catch((e) => { console.error('FAIL: 脚本异常', e); process.exit(1); });
