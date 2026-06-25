/**
 * verify-soft-terminal-colors.js — TDD 验证柔白终端彩色对比增强
 *
 * 从 public/app.js 提取 boostSoftAnsiContrast 与 themes.soft，在 Node 沙箱里
 * 用 mock state 跑断言。不依赖 Electron / 浏览器。
 *
 * 用法：node scripts/verify-soft-terminal-colors.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

// 从源码按花括号匹配提取一个块（从 startIdx 找到首个 {，到匹配 }）
function extractBraceBlock(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  if (open === -1) throw new Error('no { found');
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced braces');
}

// 提取 normalizer 块：从 BOOST_SOFT_TERMINAL_ANSI_CONTRAST 到 boostSoftAnsiContrast 函数闭合
function loadNormalizer(theme) {
  const start = APP.indexOf('const BOOST_SOFT_TERMINAL_ANSI_CONTRAST');
  if (start === -1) throw new Error('BOOST_SOFT_TERMINAL_ANSI_CONTRAST not found');
  const fnIdx = APP.indexOf('function boostSoftAnsiContrast', start);
  if (fnIdx === -1) throw new Error('boostSoftAnsiContrast not found');
  const block = extractBraceBlock(APP, fnIdx); // 到函数闭合 }
  // 整块 = 常量声明 + 函数声明
  const full = APP.slice(start, fnIdx) + block;
  const factory = new Function('state', full + '\nreturn boostSoftAnsiContrast;');
  return factory({ theme });
}

// 提取 themes.soft 调色板对象
function loadSoftPalette() {
  const idx = APP.indexOf('soft: {');
  if (idx === -1) throw new Error('themes.soft not found');
  const open = APP.indexOf('{', idx);
  let depth = 0;
  let end = open;
  for (let i = open; i < APP.length; i++) {
    if (APP[i] === '{') depth++;
    else if (APP[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const objLit = APP.slice(open, end + 1);
  return (0, eval)('(' + objLit + ')');
}

// 从 SGR 输出里提取 38;2;r;g;b 的 RGB
function rgbOf(sgr) {
  const m = sgr.match(/38;2;(\d+);(\d+);(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

let PASS = 0, FAIL = 0;
function assert(name, cond, detail) {
  if (cond) { PASS++; console.log('  PASS  ' + name); }
  else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  assert(name, ok, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
}

console.log('--- 柔白终端彩色对比 TDD ---\n');

// ===== 1. 16 色 palette（R4 §6 高对比语义色板）=====
console.log('[1] themes.soft 16 色 palette');
const pal = loadSoftPalette();
eq('background 保持白灰', pal.background, '#fbfbfa');
eq('red #b91c1c', pal.red, '#b91c1c');
eq('green #047857', pal.green, '#047857');
eq('yellow #92400e', pal.yellow, '#92400e');
eq('blue #174ea6', pal.blue, '#174ea6');
eq('magenta #7e22ce', pal.magenta, '#7e22ce');
eq('cyan #006d75', pal.cyan, '#006d75');
eq('brightBlack #4b5563', pal.brightBlack, '#4b5563');
eq('brightRed #dc2626', pal.brightRed, '#dc2626');
eq('brightBlue #1d4ed8', pal.brightBlue, '#1d4ed8');

// ===== 2. TrueColor 语义映射（R4 §8 核心）=====
console.log('\n[2] TrueColor 前景语义映射');
const boost = loadNormalizer('soft');
const tc = (r, g, b) => boost('\x1b[38;2;' + r + ';' + g + ';' + b + 'm');

eq('蓝灰 → 高对比蓝 #174ea6', rgbOf(tc(120, 135, 170)), [23, 78, 166]);
eq('珊瑚红 → 红 #b91c1c', rgbOf(tc(215, 119, 87)), [185, 28, 28]);
eq('绿 → 高对比绿 #047857', rgbOf(tc(100, 160, 120)), [4, 120, 87]);
eq('橙 → 橙 #b45309', rgbOf(tc(160, 120, 80)), [180, 83, 9]);
eq('紫 → 紫 #7e22ce', rgbOf(tc(150, 100, 180)), [126, 34, 206]);
eq('青 → 青 #006d75', rgbOf(tc(80, 160, 160)), [0, 109, 117]);
eq('浅灰 → 可读灰 #4b5563', rgbOf(tc(153, 153, 153)), [75, 85, 99]);

// ===== 3. 极值保留（不破坏 token 块白字 / 已深色）=====
console.log('\n[3] 极值保留');
eq('纯白保留（token 块白字）', rgbOf(tc(255, 255, 255)), [255, 255, 255]);
eq('近白保留', rgbOf(tc(252, 251, 250)), [252, 251, 250]);
eq('深灰保留（已够深）', rgbOf(tc(80, 80, 80)), [80, 80, 80]);

// ===== 4. 真实 Claude Code 样本颜色 =====
console.log('\n[4] 真实 Claude Code 样本色');
eq('珊瑚强调色 → 红', rgbOf(tc(215, 119, 87)), [185, 28, 28]);
eq('灰弱文本 → 可读灰', rgbOf(tc(153, 153, 153)), [75, 85, 99]);
eq('白字 token 保留', rgbOf(tc(255, 255, 255)), [255, 255, 255]);

// ===== 5. 非 soft 主题不处理 =====
console.log('\n[5] 非 soft 主题不处理');
const boostDark = loadNormalizer('terminal');
eq('terminal 主题不增强蓝', rgbOf(boostDark('\x1b[38;2;120;135;170m')), [120, 135, 170]);

// ===== 6. 完整性：背景 / 光标 / 非颜色序列不破坏 =====
console.log('\n[6] 完整性');
const sample = '\x1b[48;2;55;55;55m  \x1b[38;2;255;255;255mSkill(using-superpowers)\x1b[39m\x1b[K\x1b[70C\x1b[m';
const boosted = boost(sample);
assert('背景 48;2 未变', boosted.indexOf('\x1b[48;2;55;55;55m') !== -1);
assert('光标移动 [70C 未变', boosted.indexOf('\x1b[70C') !== -1);
assert('清屏 [K 未变', boosted.indexOf('\x1b[K') !== -1);
assert('reset [m 未变', boosted.indexOf('\x1b[m') !== -1);
assert('using-superpowers 文本保留', boosted.indexOf('using-superpowers') !== -1);
assert('白字未被加深（不含 108;108;108）', boosted.indexOf('108;108;108') === -1);

// ===== 7. 256 色（R4 §7 要求处理 38;5）=====
console.log('\n[7] 256 色前景');
const c256 = (n) => boost('\x1b[38;5;' + n + 'm');
assert('256 蓝(27) 有变化', c256(27) !== '\x1b[38;5;27m');
assert('256 灰(244) 有变化', c256(244) !== '\x1b[38;5;244m');

console.log('\n=== PASS: ' + PASS + ' / FAIL: ' + FAIL + ' ===');
process.exit(FAIL === 0 ? 0 : 1);
