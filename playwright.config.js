/**
 * Playwright 配置 — FanBox Windows E2E 测试
 *
 * 使用 playwright-core + _electron.launch() 驱动真实 Electron App，
 * 不下载浏览器二进制，不依赖外部服务。
 */
const path = require('path');

const ROOT = path.resolve(__dirname);

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './tests/e2e',
  timeout: 90000,
  expect: { timeout: 10000 },
  retries: 0,
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'windows-smoke',
      testMatch: /windows-smoke\.spec\.js/,
    },
  ],
};
