import { chromium } from "file:///Users/alchain/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => { localStorage.setItem('fb_guided', '1'); localStorage.setItem('fb_theme', 'warm'); });
const page = await ctx.newPage();
await page.goto('http://localhost:4568', { waitUntil: 'networkidle' });
await page.evaluate(() => navigate('/Users/alchain/Documents/_开发项目/fanbox/experiments/drag-path-test'));
await page.waitForTimeout(1500);

// 1. dragstart payload 测试：图片卡片应带 text/html 的文件路径 img
const dragPayload = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#file-area [draggable="true"]')];
  const imgCard = cards.find(c => c.textContent.includes('测试图'));
  if (!imgCard) return { error: 'card not found, cards=' + cards.length };
  const dt = new DataTransfer();
  imgCard.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  return { html: dt.getData('text/html'), plain: dt.getData('text/plain') };
});
console.log('DRAG:', JSON.stringify(dragPayload));

// 2. 打开测试.md（md 预览即编辑），检查两张本地路径图片是否最终加载成功
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#file-area .name, #file-area [draggable="true"]')];
  const md = [...document.querySelectorAll('#file-area [draggable="true"]')].find(c => c.textContent.includes('测试.md'));
  md.click();
});
await page.waitForTimeout(4000);
const imgs = await page.evaluate(() => [...document.querySelectorAll('#preview-body img')].map(i => ({
  src: i.src.slice(0, 90), loaded: i.complete && i.naturalWidth > 0
})));
console.log('IMGS:', JSON.stringify(imgs, null, 1));
await page.screenshot({ path: 'test-dragfix.png' });
await browser.close();
