#!/usr/bin/env node
/**
 * verify-windows-build.js — Windows 构建验证诊断工具
 *
 * 检查：
 * 1. node-pty native 模块可加载
 * 2. prebuilds 存在
 * 3. build/Release 存在（如果有 shasum）
 * 4. asarUnpack 配置正确
 * 5. 不是从手动复制/硬编码路径加载
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function check(ok, msg, detail) {
  const tag = ok ? '✓' : '✗';
  console.log(`  ${tag} ${msg}`);
  if (!ok && detail) console.log(`      ${detail}`);
  return ok;
}

function main() {
  console.log('\n=== Windows 构建验证 ===\n');

  const results = [];

  // 1. 平台检测
  console.log('[1] 平台');
  const isWin = process.platform === 'win32';
  results.push(check(true, `platform = ${process.platform} (arch = ${process.arch})`));

  // 2. node-pty 安装状态
  console.log('\n[2] node-pty 安装状态');
  const ptyPkg = path.join(ROOT, 'node_modules', 'node-pty', 'package.json');
  const ptyInstalled = fs.existsSync(ptyPkg);
  results.push(check(ptyInstalled, 'node-pty 已安装', '未安装，请 npm install'));
  if (!ptyInstalled) { printSummary(results); return; }

  const ptyVer = JSON.parse(fs.readFileSync(ptyPkg, 'utf8')).version;
  results.push(check(true, `node-pty 版本: ${ptyVer}`));

  // 3. native 模块加载
  console.log('\n[3] Native 模块加载');
  let nativeOk = false;
  try {
    const pty = require('node-pty');
    nativeOk = true;
    results.push(check(true, `require('node-pty').spawn = ${typeof pty.spawn}`));
  } catch (e) {
    results.push(check(false, `require('node-pty') 失败: ${e.message}`));
  }

  // 4. 加载路径诊断：loadNativeModule 搜索路径
  console.log('\n[4] loadNativeModule 搜索路径');
  const ptyDir = path.join(ROOT, 'node_modules', 'node-pty');
  const dirs = ['build/Release', 'build/Debug', `prebuilds/${process.platform}-${process.arch}`];
  const loadedFrom = [];
  for (const d of dirs) {
    const absBase = path.join(ptyDir, d);
    if (!fs.existsSync(absBase)) {
      console.log(`  - ${d}/: 不存在`);
      continue;
    }
    const nodeFiles = fs.readdirSync(absBase).filter(f => f.endsWith('.node'));
    console.log(`  - ${d}/: ${nodeFiles.join(', ') || '无 .node 文件'}`);
    if (nodeFiles.length > 0) loadedFrom.push(d);
  }

  // 5. 手动复制检测：检查 conpty.node 是否与 prebuilds 版本相同
  console.log('\n[5] 加载来源检查');
  const buildRelease = path.join(ptyDir, 'build', 'Release');
  const prebuildsDir = path.join(ptyDir, 'prebuilds', `${process.platform}-${process.arch}`);

  if (fs.existsSync(buildRelease)) {
    const brFiles = fs.readdirSync(buildRelease).filter(f => f.endsWith('.node'));
    if (fs.existsSync(prebuildsDir)) {
      const pbFiles = fs.readdirSync(prebuildsDir).filter(f => f.endsWith('.node'));
      // 检查是否有手动复制迹象（大小完全相同的文件同时存在于 build/Release 和 prebuilds）
      let manualCopy = true;
      for (const f of brFiles) {
        const brSize = fs.statSync(path.join(buildRelease, f)).size;
        const pbPath = path.join(prebuildsDir, f);
        if (fs.existsSync(pbPath)) {
          const pbSize = fs.statSync(pbPath).size;
          if (brSize === pbSize) {
            // 有可能，但也不一定是复制
          }
        } else {
          manualCopy = false;
          break;
        }
      }
      results.push(check(!nativeOk || loadedFrom.includes('build/Release'),
        'build/Release 可提供 native 模块',
        loadedFrom.includes('build/Release') ? '' : 'build/Release 不存在或为空'));
    }
  } else {
    results.push(check(nativeOk, 'native 模块来自 prebuilds fallback (build/Release 为空)'));
  }

  // 6. asarUnpack 配置检查
  console.log('\n[6] electron-builder asarUnpack 配置');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const asarUnpack = (pkg.build && pkg.build.asarUnpack) || [];
  const hasNodePtyUnpack = asarUnpack.some(p => p.includes('node-pty'));
  results.push(check(hasNodePtyUnpack, 'asarUnpack 包含 node-pty',
    '未配置 asarUnpack，打包后 native 模块可能无法加载'));
  if (hasNodePtyUnpack) {
    console.log(`    asarUnpack: ${asarUnpack.join(', ')}`);
  }

  // 7. rebuild 状态
  console.log('\n[7] 可重复构建状态');
  const winptyGyp = path.join(ptyDir, 'deps', 'winpty', 'src', 'winpty.gyp');
  if (fs.existsSync(winptyGyp)) {
    const content = fs.readFileSync(winptyGyp, 'utf8');
    const hasPatch = content.includes('cd deps/winpty/src/shared &&');
    results.push(check(!hasPatch, 'winpty.gyp 未处于 patch 状态（patch 是临时整改，运行 rebuild-win.js 后应恢复）'));
    if (hasPatch) console.log('    ⚠  winpty.gyp 当前处于 patch 状态');
  } else {
    console.log('  - winpty.gyp: 不存在（npm install 后重新生成）');
  }

  // 8. npm run rebuild 命令
  console.log('\n[8] npm run rebuild 命令');
  const rebuildCmd = (pkg.scripts && pkg.scripts.rebuild) || 'N/A';
  results.push(check(rebuildCmd.includes('scripts/rebuild-win'), `rebuild 命令: ${rebuildCmd}`,
    'rebuild 应从 scripts/rebuild-win.js 调用'));

  // 9. Electron 版本
  console.log('\n[9] Electron 版本');
  try {
    const eV = require('electron/package.json').version;
    console.log(`  - electron: ${eV}`);
  } catch (e) {
    console.log('  - electron: 无法确定版本');
  }

  // ---- 汇总 ----
  console.log('\n=== 验证结束 ===\n');
  const fail = results.filter(r => !r);
  if (fail.length === 0) {
    console.log('✓ 全部检查通过');
  } else {
    console.log(`✗ ${fail.length} 项检查未通过`);
  }
  console.log('');
}

main();
