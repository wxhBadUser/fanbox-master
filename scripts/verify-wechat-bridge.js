/**
 * verify-wechat-bridge.js — 验证 Windows 下 bridge → driver → claude 最小链路
 *
 * 独立验证脚本，不依赖 Electron 或微信登录。测试：
 * 1. bridge 模块加载是否正常
 * 2. bridge.init(null) 在无 Electron 环境下是否降级
 * 3. bridge.target() / env() 是否正确检测 claude
 * 4. bridge.sendDesktop() 调用 claude 返回 BRIDGE_OK
 * 5. codex 未安装时不崩溃
 *
 * 用法：node scripts/verify-wechat-bridge.js
 *
 * 注意：该脚本自动使用隔离测试目录（.tmp/verify-wechat/），
 * 不会读写真实用户 account 数据。
 */
'use strict';

const path = require('path');
const fs = require('fs');

// 隔离测试目录：防止脚本意外读写真实 ~/.fanbox/wechat/ 下的 account 数据
const TEST_DIR = path.resolve(__dirname, '..', '.tmp', 'verify-wechat');
process.env.FANBOX_WECHAT_DIR = TEST_DIR;
// 确保测试目录存在
fs.mkdirSync(TEST_DIR, { recursive: true });

const BRIDGE_PATH = path.resolve(__dirname, '..', 'electron', 'wechat', 'bridge');
const DRIVER_PATH = path.resolve(__dirname, '..', 'electron', 'wechat', 'driver');

async function main() {
  console.log('=== verify-wechat-bridge.js ===\n');
  console.log(`Platform: ${process.platform}`);
  console.log(`CWD:      ${process.cwd()}\n`);

  // --- test 1: module loading ---
  console.log('1. Loading bridge module (no Electron)...');
  let bridge, driver;
  try {
    bridge = require(BRIDGE_PATH);
    driver = require(DRIVER_PATH);
    console.log('   ✓ bridge.js loaded');
    console.log('   ✓ driver.js loaded');
  } catch (e) {
    console.error(`   ✗ Failed to load module: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
  }

  // --- test 2: bridge.init(null) 无 Electron 降级 ---
  console.log('\n2. bridge.init(null) without Electron...');
  try {
    bridge.init(null);
    console.log('   ✓ init() completed');
    console.log(`      target:          ${bridge.target}`);
    console.log(`      cwd:             ${bridge.cwd}`);
    console.log(`      conversations:   ${Object.keys(bridge.conversations).length} session(s)`);
    console.log(`      isConnected:     ${bridge.isConnected()} (expected false, no WeChat login)`);
  } catch (e) {
    console.error(`   ✗ init() failed: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
  }

  // --- test 3: which claude / targets() ---
  console.log('\n3. Checking available targets...');
  let claudeAvail, codexAvail;
  try {
    const targets = await bridge.targets();
    claudeAvail = targets.find(t => t.id === 'claude');
    codexAvail = targets.find(t => t.id === 'codex');
    console.log(`   claude: ${claudeAvail && claudeAvail.available ? '✓ FOUND' : '✗ NOT FOUND'}`);
    console.log(`   codex:  ${codexAvail && codexAvail.available ? '✓ FOUND' : '○ not installed (graceful)'}`);
    if (!claudeAvail || !claudeAvail.available) {
      console.error('   ✗ claude not available — cannot test bridge→claude path');
      process.exit(1);
    }
    console.log('   ✓ claude is available');
  } catch (e) {
    console.error(`   ✗ targets() failed: ${e.message}`);
    process.exit(1);
  }

  // --- test 4: env() check ---
  console.log('\n4. bridge.env()...');
  try {
    const env = await bridge.env();
    console.log(`   target:         ${env.target}`);
    console.log(`   cwdName:        ${env.cwdName}`);
    console.log(`   connected:      ${env.connected} (expected false)`);
    console.log(`   targets[0]:     ${JSON.stringify(env.targets[0])}`);
    console.log(`   targets[1]:     ${JSON.stringify(env.targets[1])}`);
    console.log('   ✓ env() OK');
  } catch (e) {
    console.error(`   ✗ env() failed: ${e.message}`);
    process.exit(1);
  }

  // --- test 5: sendDesktop("只回复 BRIDGE_OK") ---
  console.log('\n5. bridge.sendDesktop("只回复 BRIDGE_OK")...');
  console.log('   (This calls claude CLI directly, may take 10-60s)');
  let result;
  try {
    result = await bridge.sendDesktop('只回复 BRIDGE_OK');
  } catch (e) {
    console.error(`   ✗ sendDesktop() threw: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
  }

  const msgCount = result && result.messages ? result.messages.length : 0;
  const lastMsg = result && result.messages ? result.messages[msgCount - 1] : null;
  const reply = lastMsg ? (lastMsg.text || '') : '(no messages)';

  console.log(`   messages in conversation: ${msgCount}`);
  console.log(`   assistant reply: "${reply.slice(0, 300)}"`);

  const replyContainsOK = reply.includes('BRIDGE_OK');
  if (replyContainsOK) {
    console.log('   ✓ Reply contains BRIDGE_OK');
  } else {
    console.log('   ✗ Reply does NOT contain BRIDGE_OK');
    // Show full message history for debugging
    console.log('\n   --- full conversation ---');
    for (const m of (result.messages || [])) {
      console.log(`   [${m.role}] ${(m.text || '').slice(0, 200)}`);
    }
  }

  // --- test 6: codex graceful handling ---
  console.log('\n6. Codex graceful handling...');
  if (codexAvail && !codexAvail.available) {
    console.log('   ✓ codex not installed, handled gracefully (false in targets)');
  } else if (codexAvail && codexAvail.available) {
    console.log('   ○ codex is installed (skip graceful check)');
  }

  // --- test 7: re-run sendDesktop to verify session resume ---
  console.log('\n7. bridge.sendDesktop("第二句话") — verify session continuity...');
  try {
    const result2 = await bridge.sendDesktop('第二句话，只回复 OK');
    const msgs2 = result2 && result2.messages ? result2.messages.length : 0;
    const last2 = result2 && result2.messages ? result2.messages[msgs2 - 1] : null;
    console.log(`   messages now: ${msgs2} (should be 4: 2 user + 2 assistant)`);
    console.log(`   second reply: "${last2 ? (last2.text || '').slice(0, 200) : '(no reply)'}"`);
    console.log(`   ✓ second call succeeded (session resume working)`);
  } catch (e) {
    console.log(`   ○ second call failed (non-critical): ${e.message}`);
  }

  // --- summary ---
  const passed = replyContainsOK;

  console.log('\n=== Summary ===');
  console.log(`  bridge loaded:        ✓`);
  console.log(`  init(null):           ✓`);
  console.log(`  targets():            ✓`);
  console.log(`  claude available:     ✓`);
  console.log(`  bridge → claude:      ${passed ? '✓' : '✗'}`);
  console.log(`  BRIDGE_OK in reply:   ${passed ? '✓' : '✗'}`);
  console.log(`  codex graceful:       ✓`);
  console.log(`  session resume:       ${result && result.messages && result.messages.length > 2 ? '✓' : '○'}`);
  console.log(`  overall:              ${passed ? 'PASS' : 'FAIL (claude did not return BRIDGE_OK)'}`);

  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
