/**
 * atomic-json.js — JSON 文件原子读写（避免写入中断造成文件损坏）
 *
 * 写入：temp → fsync → rename（读不到半截文件）
 * 读取：失败返回 fallback（不吞静默清空配置）
 *
 * 用法：
 *   const { writeJsonAtomic, readJsonSafe } = require('./atomic-json');
 *   await writeJsonAtomic('/path/to/config.json', { key: 'value' });
 *   const cfg = readJsonSafe('/path/to/config.json', { default: true });
 */
const fs = require('fs');
const path = require('path');

/**
 * 同步原子写入 JSON 文件（适合 Electron 主进程的同步场景）
 * 流程：写临时文件 → fsync → rename → 删临时文件（失败时回滚）
 */
function writeJsonAtomicSync(file, data) {
  const dir = path.dirname(file);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    // Windows 上 fsync 对写入稳定性重要
    const fd = fs.openSync(tmp, 'r');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmp, file);
  } catch (e) {
    // 写入失败 → 删除临时文件，不破坏旧文件
    try { fs.unlinkSync(tmp); } catch { /* 临时文件可能没创建成功 */ }
    throw e;
  }
}

/**
 * 安全读取 JSON 文件，失败返回 fallback
 */
function readJsonSafe(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback !== undefined ? fallback : null;
  }
}

/**
 * 异步原子写入 JSON 文件（适合 server.js 的 async 场景）
 */
async function writeJsonAtomic(file, data) {
  const dir = path.dirname(file);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    const fd = await fs.promises.open(tmp, 'r');
    try { await fd.sync(); } finally { await fd.close(); }
    await fs.promises.rename(tmp, file);
  } catch (e) {
    try { await fs.promises.unlink(tmp).catch(() => {}); } catch { /* */ }
    throw e;
  }
}

module.exports = { writeJsonAtomicSync, readJsonSafe, writeJsonAtomic };