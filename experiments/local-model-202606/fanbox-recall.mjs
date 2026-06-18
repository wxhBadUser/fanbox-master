#!/usr/bin/env node
// fanbox-recall：给 coding agent 用的本地检索入口（实验3原型）
// 用法：node fanbox-recall.mjs "模糊的自然语言查询" [--root 目录]
// 输出：语义命中（embedding）+ 关键词命中（Spotlight），纯文本，方便 agent 直接读
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const EMBED_MODEL = process.env.EMBED_MODEL || 'qwen3-embedding:0.6b';
const VEC_FILE = path.join(import.meta.dirname, 'results', 'exp2-vectors.json');
const ARCHIVE_ROOT = '/Users/alchain/Documents/写作/01-公众号写作/_archive';

const argv = process.argv.slice(2);
const ri = argv.indexOf('--root');
const root = ri >= 0 ? argv.splice(ri, 2)[1] : process.env.HOME;
const query = argv.join(' ').trim();
if (!query) { console.log('用法：fanbox-recall "想找什么（自然语言）" [--root 目录]'); process.exit(1); }

// 1) 语义检索：embedding 索引（当前覆盖公众号存档，实验阶段）
let semantic = [];
try {
  const { model, docs } = JSON.parse(fs.readFileSync(VEC_FILE, 'utf8'));
  const r = await fetch('http://127.0.0.1:11434/api/embed', {
    method: 'POST', body: JSON.stringify({ model, input: [query] }),
  });
  const q = (await r.json()).embeddings[0];
  const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return s / (Math.sqrt(na) * Math.sqrt(nb)); };
  semantic = docs.map((d) => ({ rel: d.rel, s: cos(q, d.vec) })).sort((a, b) => b.s - a.s).slice(0, 5);
} catch { /* 索引或 ollama 不可用则只走 Spotlight */ }

// 2) 关键词检索：Spotlight（全文 + OCR）
// 分词后逐词 AND（每词命中文件名或正文即可）；整句子串匹配对自然语言查询必然零命中
let keyword = [], kwNote = '';
try {
  // Intl.Segmenter 真分词（中英混合都行），去停用词，按词长优先取前 6 个
  const STOP = new Set(['一下', '那张', '那个', '这个', '帮我', '我的', '之前', '写过', '界面', '一张', '文件', '图片']);
  const seg = new Intl.Segmenter('zh', { granularity: 'word' });
  const terms = [...new Set([...seg.segment(query.replace(/[\\"*]/g, ''))]
    .filter((s) => s.isWordLike).map((s) => s.segment.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t)))]
    .sort((a, b) => b.length - a.length).slice(0, 6);
  if (terms.length) {
    // 逐词查询，按「命中词数 > 修改时间」排序：比硬 AND 更抗分词噪音
    const score = new Map();
    for (const t of terms) {
      const out = execFileSync('mdfind', ['-onlyin', root, `(kMDItemTextContent == "*${t}*"cd) || (kMDItemDisplayName == "*${t}*"cd)`], { timeout: 6000 }).toString();
      for (const p of out.split('\n')) {
        if (!p || /\/(node_modules|\.git|Library)\//.test(p)) continue;
        score.set(p, (score.get(p) || 0) + 1);
      }
    }
    const all = [...score.entries()]
      .map(([p, n]) => { try { return { p, n, mtime: fs.statSync(p).mtimeMs }; } catch { return null; } })
      .filter(Boolean).sort((a, b) => b.n - a.n || b.mtime - a.mtime);
    keyword = all.slice(0, 8);
    kwNote = `检索词 [${terms.join(' / ')}]` + (all.length > 8 ? `，共 ${all.length} 个命中只显示前 8（可加词缩小范围）` : '');
  } else kwNote = '查询里没有可用的关键词（词都太短）';
} catch (e) { kwNote = 'Spotlight 检索失败: ' + e.message; }

const inRoot = (p) => p.startsWith(path.resolve(root) + path.sep) || path.resolve(root) === process.env.HOME;
const semShown = semantic.filter((m) => inRoot(path.join(ARCHIVE_ROOT, m.rel)));
console.log('【语义相关】（覆盖范围：公众号存档；相似度<0.55属弱相关）');
if (semShown.length) for (const m of semShown) console.log(`  ${m.s.toFixed(3)}${m.s < 0.55 ? '⚠' : ' '} ${path.join(ARCHIVE_ROOT, m.rel)}`);
else console.log(semantic.length ? '  （命中都在 --root 范围外，已过滤）' : '  0 命中（或 ollama/索引不可用）');
console.log('【关键词命中】（Spotlight 全文+图片OCR）' + (kwNote ? ' ' + kwNote : ''));
if (keyword.length) for (const k of keyword) console.log(`  命中${k.n}词  ${k.p}`);
else console.log('  0 命中');
