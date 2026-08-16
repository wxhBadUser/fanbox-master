// 路径边界检查：用 realpath 规范化后判断 target 是否在 base 之内，
// 防止 `~/../etc` 或符号链接绕过前缀判断（Phase 5.6）。
const fs = require('fs');
const path = require('path');

function realpath(p) { try { return fs.realpathSync(p); } catch { return null; } }
function isInside(target, base) {
  const t = realpath(target); const b = realpath(base);
  if (!t || !b) return false;
  const rel = path.relative(b, t);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

module.exports = { realpath, isInside };
