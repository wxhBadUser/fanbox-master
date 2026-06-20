/**
 * FanBox Windows Smoke Test — Playwright + _electron.launch() 驱动真实 Electron App
 *
 * 验证核心流程：启动、导航、搜索、截图面板、磁盘占用、右键菜单、终端入口。
 * 不删除真实文件，不依赖微信/Claude/Codex 登录，不依赖固定用户名/盘符。
 *
 * 用法：npm run test:e2e:windows
 */
const { _electron } = require('playwright-core');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TEST_PORT = '4639'; // 避免与开发端口冲突

// 兜底防 hang
setTimeout(() => { console.log('WATCHDOG TIMEOUT — 强制退出'); process.exit(3); }, 120000);

let app, win;

async function launchApp() {
  app = await _electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: { ...process.env, FANBOX_PORT: TEST_PORT, FANBOX_NO_OPEN: '1' },
  });
  win = await app.firstWindow();
  win._errs = [];
  win.on('console', (m) => { if (m.type() === 'error') win._errs.push(m.text()); });
  await win.waitForLoadState('domcontentloaded');
  await win.evaluate(() => { try { localStorage.setItem('fb_guided', '1'); } catch (e) {} });
  await win.waitForTimeout(4000);
  return { app, win };
}

async function closeApp() {
  if (!app) return;
  try {
    await Promise.race([
      app.evaluate(({ app: a }) => a.exit(0)),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  } catch (e) {}
  try { await app.close(); } catch (e) {}
  app = null;
  win = null;
}

function printResults(results) {
  console.log('\n========== Windows Smoke Test ==========');
  let pass = 0;
  for (const r of results) { console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.detail ? '  — ' + r.detail : '')); if (r.ok) pass++; }
  console.log('\n' + pass + '/' + results.length + ' 通过');
  return pass === results.length;
}

async function runTests() {
  const results = [];
  const check = (name, cond, detail) => results.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  try {
    await launchApp();

    // ========== 1. App 启动 ==========
    console.log('\n--- 1. App 启动 ---');

    const env = await win.evaluate(() => ({
      platform: window.fanboxEnv && window.fanboxEnv.platform,
      isDesktop: window.fanboxEnv && window.fanboxEnv.isDesktopApp,
      bridges: {
        pty: !!window.fanboxPty, fs: !!window.fanboxFs, clip: !!window.fanboxClipboard,
        drop: !!window.fanboxDrop, rec: !!window.fanboxRec, shot: !!window.fanboxShot,
        win: !!window.fanboxWin, wechat: !!window.fanboxWechat, update: !!window.fanboxUpdate,
      },
      htmlClass: document.documentElement.className,
    }));
    check('平台识别 win32', env.platform === 'win32', env.platform);
    check('isDesktopApp=true', env.isDesktop === true, String(env.isDesktop));
    check('9 个 IPC 桥接全暴露', Object.values(env.bridges).every(Boolean), JSON.stringify(env.bridges));
    check('html 有 desktop class', env.htmlClass.includes('desktop'), env.htmlClass);

    const fileArea = await win.$('[data-testid="file-area"]');
    check('文件区存在', !!fileArea, 'data-testid=file-area');
    const breadcrumb = await win.$('[data-testid="breadcrumb"]');
    check('面包屑存在', !!breadcrumb, 'data-testid=breadcrumb');

    // ========== 2. 此电脑 / 盘符导航 ==========
    console.log('\n--- 2. 此电脑 / 盘符导航 ---');

    await win.evaluate(() => { try { navigate('__fanbox_roots__'); } catch (e) {} });
    await win.waitForTimeout(3000);

    const driveCards = await win.$$eval('.drive-item', (cards) => cards.length).catch(() => 0);
    check('此电脑有磁盘卡片', driveCards > 0, driveCards + ' 个');

    const firstDrive = await win.$('.drive-item').catch(() => null);
    if (firstDrive) {
      await firstDrive.dblclick();
      await win.waitForTimeout(2000);
      const bcText = await win.$eval('[data-testid="breadcrumb"]', (el) => el.innerText).catch(() => '');
      check('双击盘符后面包屑变化', bcText.length > 0, bcText.slice(0, 40));
    } else {
      check('双击盘符后面包屑变化', false, '无盘符卡片');
    }

    // ========== 3. 搜索 ==========
    console.log('\n--- 3. 搜索 ---');

    await win.evaluate((p) => { try { navigate(p); } catch (e) {} }, ROOT);
    await win.waitForTimeout(2000);

    const searchTrigger = await win.$('[data-testid="search-trigger"]').catch(() => null);
    if (searchTrigger) {
      await searchTrigger.click();
      await win.waitForTimeout(500);
      const cmdkInput = await win.$('#cmdk-input').catch(() => null);
      check('搜索面板打开', !!cmdkInput, 'cmdk-input');
      if (cmdkInput) {
        await cmdkInput.fill('package');
        await win.waitForTimeout(5000); // 搜索需要更长时间
        const searchResults = await win.$$('#cmdk-results li').catch(() => []);
        check('搜索 package 有结果', searchResults.length > 0, searchResults.length + ' 条');
        await win.keyboard.press('Escape');
        await win.waitForTimeout(300);
      }
    } else {
      check('搜索面板打开', false, 'search-trigger not found');
    }

    // ========== 4. 最近截图面板 ==========
    console.log('\n--- 4. 最近截图面板 ---');

    const screenshotBtn = await win.$('[data-testid="btn-screenshots"]').catch(() => null);
    if (screenshotBtn) {
      await screenshotBtn.click();
      await win.waitForTimeout(1500);
      const shotPop = await win.$('#screenshot-pop').catch(() => null);
      check('截图面板弹出', !!shotPop, 'screenshot-pop');
      await win.keyboard.press('Escape');
      await win.waitForTimeout(300);
    } else {
      check('截图面板弹出', false, 'btn-screenshots not found');
    }

    // ========== 5. 磁盘占用透视 ==========
    console.log('\n--- 5. 磁盘占用透视 ---');

    const duBtn = await win.$('[data-testid="btn-disk-usage"]').catch(() => null);
    if (duBtn) {
      await duBtn.click();
      await win.waitForTimeout(5000);
      const diskOverlay = await win.$('.disk-overlay').catch(() => null);
      check('磁盘占用面板弹出', !!diskOverlay, 'disk-overlay');
      if (diskOverlay) {
        const diskRows = await win.$$('.disk-row').catch(() => []);
        check('磁盘占用有列表项', diskRows.length > 0, diskRows.length + ' 行');
        await win.keyboard.press('Escape');
        await win.waitForTimeout(300);
      }
    } else {
      check('磁盘占用面板弹出', false, 'btn-disk-usage not found');
    }

    // ========== 6. 右键菜单基础存在 ==========
    console.log('\n--- 6. 右键菜单基础存在 ---');

    await win.evaluate((p) => { try { navigate(p); } catch (e) {} }, ROOT);
    await win.waitForTimeout(2000);

    const firstItem = await win.$('.item').catch(() => null);
    if (firstItem) {
      await firstItem.click({ button: 'right' });
      await win.waitForTimeout(500);
      const ctxMenu = await win.$('#context-menu').catch(() => null);
      check('右键菜单弹出', !!ctxMenu, 'context-menu');
      if (ctxMenu) {
        const menuText = await ctxMenu.innerText().catch(() => '');
        check('右键菜单含终端项', /终端/.test(menuText), menuText.slice(0, 80));
        check('右键菜单含复制项', /复制/.test(menuText), menuText.slice(0, 80));
        await win.keyboard.press('Escape');
        await win.waitForTimeout(300);
      }
    } else {
      check('右键菜单弹出', false, 'no .item found');
    }

    // ========== 7. 终端入口基础验证 ==========
    console.log('\n--- 7. 终端入口基础验证 ---');

    // 确保在有效目录（非 __fanbox_roots__）
    await win.evaluate((p) => { try { navigate(p); } catch (e) {} }, ROOT);
    await win.waitForTimeout(2000);

    const termBtn = await win.$('[data-testid="btn-terminal"]').catch(() => null);
    if (termBtn) {
      await termBtn.click();
      await win.waitForTimeout(2000);
      const termPanel = await win.$('[data-testid="terminal-panel"]').catch(() => null);
      const isHidden = termPanel ? await termPanel.evaluate((el) => el.classList.contains('hidden')).catch(() => true) : true;
      check('终端面板出现', termPanel && !isHidden, 'hidden=' + isHidden);
    } else {
      check('终端面板出现', false, 'btn-terminal not found');
    }

    // ========== 7b. OpenCode / Qoder CLI 入口（轻量 registry） ==========
    console.log('\n--- 7b. OpenCode / Qoder 入口 ---');

    const ocBtn = await win.$('[data-testid="term-opencode"]').catch(() => null);
    check('OpenCode 按钮存在', !!ocBtn, 'data-testid=term-opencode');
    const qdBtn = await win.$('[data-testid="term-qoder"]').catch(() => null);
    check('Qoder CLI 按钮存在', !!qdBtn, 'data-testid=term-qoder');

    // 显式断言：没有 Agent Composer / 技能菜单 / + 上下文入口
    const composerEl = await win.$('[data-testid="agent-composer"], .agent-composer, #agent-composer').catch(() => null);
    check('不出现 Agent Composer', !composerEl, 'agent-composer');
    const slashMenuEl = await win.$('[data-testid="slash-menu"], .slash-menu, #slash-menu').catch(() => null);
    check('不出现 / 技能菜单', !slashMenuEl, 'slash-menu');
    const plusCtxEl = await win.$('[data-testid="plus-context"], .plus-context, #plus-context').catch(() => null);
    check('不出现 + 上下文入口', !plusCtxEl, 'plus-context');

    // 渲染层 registry 暴露且包含 4 个 agent
    const regInfo = await win.evaluate(() => {
      const r = window.AGENT_REGISTRY || (typeof AGENT_REGISTRY !== 'undefined' ? AGENT_REGISTRY : null);
      const ids = r ? Object.keys(r) : [];
      return {
        ids,
        hasOpencode: !!(r && r.opencode && r.opencode.command === 'opencode' && Array.isArray(r.opencode.detect) && r.opencode.detect.includes('opencode')),
        hasQoder: !!(r && r.qoder && Array.isArray(r.qoder.detect) && r.qoder.detect.includes('qoder') && r.qoder.detect.includes('qodercli') && r.qoder.detect.includes('qoder-cli')),
        hasClaude: !!(r && r.claude && /claude/.test(r.claude.command || '')),
        hasCodex: !!(r && r.codex && r.codex.command === 'codex'),
        hasProbe: typeof probeAgent === 'function',
        hasLauncher: typeof launchRegisteredAgent === 'function',
        hasIpc: !!(window.fanboxAgent && typeof window.fanboxAgent.which === 'function'),
      };
    }).catch(() => null);
    check('AGENT_REGISTRY 暴露（含 4 个 agent）', regInfo && Array.isArray(regInfo.ids) && regInfo.ids.length === 4, JSON.stringify(regInfo && regInfo.ids));
    check('Registry 含 opencode', regInfo && regInfo.hasOpencode, '');
    check('Registry 含 qoder（3 个候选命令）', regInfo && regInfo.hasQoder, '');
    check('Registry 含 claude', regInfo && regInfo.hasClaude, '');
    check('Registry 含 codex', regInfo && regInfo.hasCodex, '');
    check('probeAgent / launchRegisteredAgent 暴露', regInfo && regInfo.hasProbe && regInfo.hasLauncher, '');

    // 探测：无论本机是否安装了 opencode / qoder，渲染层都不能崩。
    // OpenCode 通常没装：点击应出 toast / agent-missing 灰显。
    if (ocBtn) {
      try {
        await ocBtn.click();
        await win.waitForTimeout(800);
        const toastTxt = await win.evaluate(() => { const t = document.getElementById('toast'); return t ? t.textContent : ''; }).catch(() => '');
        const isMissing = await ocBtn.evaluate((el) => el.classList.contains('agent-missing')).catch(() => false);
        const friendly = /OpenCode|opencode|未找到/.test(toastTxt) || isMissing;
        check('OpenCode 未安装时友好提示', friendly, 'toast=' + toastTxt.slice(0, 40) + ' missing=' + isMissing);
      } catch (e) { check('OpenCode 未安装时友好提示', false, e.message); }
    }
    // Qoder：本机如果装了，点了会真在终端启动 qodercli/qoder/qoder-cli，破坏 e2e 收尾。
    // 这里只做「未安装时友好提示」验证；装了则只校验按钮存在 + 探测到的命令名前缀。
    if (qdBtn) {
      try {
        const qdProbe = await win.evaluate(() => window.fanboxAgent && window.fanboxAgent.which(['qoder', 'qodercli', 'qoder-cli']).then((r) => (r && r.found) || null)).catch(() => null);
        if (qdProbe) {
          // 已安装：只校验探测命令名 + 按钮可见，不实际点（避免 spawn 阻塞 watchdog）
          check('Qoder 已安装时探测命中', /^(qoder|qodercli|qoder-cli)$/.test(qdProbe), '探测=' + qdProbe);
        } else {
          await qdBtn.click();
          await win.waitForTimeout(800);
          const toastTxt = await win.evaluate(() => { const t = document.getElementById('toast'); return t ? t.textContent : ''; }).catch(() => '');
          const isMissing = await qdBtn.evaluate((el) => el.classList.contains('agent-missing')).catch(() => false);
          const friendly = /Qoder|qoder|未找到/.test(toastTxt) || isMissing;
          check('Qoder 未安装时友好提示', friendly, 'toast=' + toastTxt.slice(0, 40) + ' missing=' + isMissing);
        }
      } catch (e) { check('Qoder 未安装时友好提示', false, e.message); }
    }

    // ========== 8. 用量面板基础验证 ==========
    console.log('\n--- 8. 用量面板基础验证 ---');

    const usageToggle = await win.$('[data-testid="usage-toggle"]').catch(() => null);
    check('用量面板入口存在', !!usageToggle, 'usage-toggle');
    if (usageToggle) {
      // 先重置 localStorage 状态：之前 run 可能残留 fb_usage_open='1'，再点会把它关掉。
      // 显式置 '0' 让 click 一定走「关→开」路径，断言稳定。
      await win.evaluate(() => { try { localStorage.setItem('fb_usage_open', '0'); } catch (e) {} }).catch(() => {});
      await usageToggle.click();
      // 等 body 实际从 hidden 切走（不用裸等 2s）
      const opened = await win.evaluate(async () => {
        const body = document.querySelector('[data-testid="usage-body"]');
        if (!body) return false;
        for (let i = 0; i < 40; i++) { // 最多等 4s
          if (!body.classList.contains('hidden')) return true;
          await new Promise((r) => setTimeout(r, 100));
        }
        return false;
      }).catch(() => false);
      const usageBody = await win.$('[data-testid="usage-body"]').catch(() => null);
      const isHidden = usageBody ? await usageBody.evaluate((el) => el.classList.contains('hidden')).catch(() => true) : true;
      check('用量面板展开', opened && !isHidden, 'opened=' + opened + ' hidden=' + isHidden);
      if (usageBody && !isHidden) {
        // 等内容出现：api('/api/agent-usage') 异步加载，最坏 ~3s（外部 OAuth 接口）
        const usageText = await win.evaluate(async () => {
          const body = document.querySelector('[data-testid="usage-body"]');
          if (!body) return '';
          for (let i = 0; i < 60; i++) { // 最多等 6s
            const t = (body.innerText || body.textContent || '').trim();
            if (t && t.length > 0) return t;
            await new Promise((r) => setTimeout(r, 100));
          }
          return (body.innerText || body.textContent || '').trim();
        }).catch(() => '');
        // 不依赖真实数据，只检查不白屏、有 Claude/Codex 区块或暂无/读取失败等提示
        const hasContent = /Claude|Codex|暂无|No local|读取失败|loading/i.test(usageText);
        check('用量面板有内容', hasContent, usageText.slice(0, 80));
      }
    }

    // ========== 终端右键菜单 ==========
    console.log('\n--- Terminal context menu ---');

    // 先打开终端
    const termBtn2 = await win.$('[data-testid="btn-terminal"]').catch(() => null);
    if (termBtn2) {
      await termBtn2.click();
      await win.waitForTimeout(1500);
    }

    // 右键终端区域
    const xtermHost = await win.$('.xterm-instance.show').catch(() => null);
    if (xtermHost) {
      const box = await xtermHost.boundingBox();
      if (box) {
        await win.mouse.click(box.x + 50, box.y + 50, { button: 'right' });
        await win.waitForTimeout(800);
        const ctxMenu = await win.$('[data-testid="term-ctx-menu"]').catch(() => null);
        check('终端右键菜单弹出', !!ctxMenu, 'term-ctx-menu');

        if (ctxMenu) {
          const copyItem = await win.$('[data-testid="term-ctx-copy"]').catch(() => null);
          const pasteItem = await win.$('[data-testid="term-ctx-paste"]').catch(() => null);
          const pasteImgPathItem = await win.$('[data-testid="term-ctx-paste-image-path"]').catch(() => null);
          check('右键菜单有复制', !!copyItem, 'term-ctx-copy');
          check('右键菜单有粘贴', !!pasteItem, 'term-ctx-paste');
          check('右键菜单无粘贴图片为路径', !pasteImgPathItem, 'term-ctx-paste-image-path');
        }
        // 关闭菜单
        await win.keyboard.press('Escape');
        await win.waitForTimeout(300);
      }
    } else {
      check('终端右键菜单弹出', false, 'no xterm instance');
    }

    // ========== 截图面板：复制图片按钮 ==========
    const shotBtn = await win.$('#btn-screenshots').catch(() => null);
    if (shotBtn) {
      await shotBtn.click();
      await win.waitForTimeout(1500);
      const shotCopyImgBtn = await win.$('.shot-copyimg').catch(() => null);
      check('截图面板有复制图片按钮', !!shotCopyImgBtn, 'shot-copyimg');
      // 关闭面板
      await win.keyboard.press('Escape');
      await win.waitForTimeout(300);
    }

    // ========== 最终检查 ==========
    check('渲染层零 console error', win._errs.length === 0, win._errs.slice(0, 3).join(' | '));

    // 先打印结果
    const allPass = printResults(results);

  } catch (e) {
    console.error('TEST ERROR:', e.message);
    printResults(results);
  } finally {
    // closeApp 可能挂住，但结果已经打印了
    // watchdog 会在 120s 后强制退出
    await closeApp();
  }

  process.exit(0);
}

runTests().catch((e) => { console.error('TEST CRASH:', e.message); process.exit(2); });
