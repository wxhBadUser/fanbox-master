// README 实拍截图：Playwright 驱动 Electron，三套皮肤各一张。
// 用假 HOME（/tmp/fb-home）跑，避免把真实收藏/最近打开拍进公开截图。
const { _electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
const FAKE_HOME = '/tmp/fb-home';

(async () => {
  for (const d of ['Desktop', 'Documents', 'Downloads']) fs.mkdirSync(path.join(FAKE_HOME, d), { recursive: true });
  const app = await _electron.launch({
    args: [ROOT], cwd: ROOT,
    env: { ...process.env, HOME: FAKE_HOME, FANBOX_PORT: '4621' },
  });
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setSize(1560, 950); w.center();
  });
  await win.waitForTimeout(2200);
  // 跳过首次引导弹窗
  await win.evaluate(() => { localStorage.setItem('fb_guided', '1'); document.querySelector('.guide-overlay')?.remove(); });
  // 进入 fanbox 仓库本身（吃自己的狗粮）
  await win.evaluate((p) => navigate(p), ROOT);
  await win.waitForTimeout(1000);
  // 开终端（dock 在右），跑两条真实命令
  await win.evaluate(() => { term.setDock && term.setDock('right'); });
  await win.evaluate(() => { term.open ? term.open() : $('#btn-terminal')?.click(); });
  await win.waitForTimeout(2000);
  await win.evaluate(() => window.fanboxPty.input(term.active, 'git log --oneline -6\r'));
  await win.waitForTimeout(1200);
  await win.evaluate(() => window.fanboxPty.input(term.active, 'ls public/\r'));
  await win.waitForTimeout(1200);
  // 预览 README
  await win.evaluate(() => { const e = state.entries.find((x) => x.name === 'README.md'); if (e) openPreview(e); });
  await win.waitForTimeout(1500);
  for (const name of ['终端', '档案', '索引']) {
    await win.evaluate((n) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === n); if (b) b.click(); }, name);
    await win.waitForTimeout(900);
    await win.evaluate(() => document.querySelector('.guide-overlay')?.remove());
    await win.screenshot({ path: path.join(ROOT, 'assets', `screenshot-${name}.png`) });
    console.log('shot', name);
  }
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
