// 实验2：md 语义关联 — embedding 找「相关文章」，对照关键词重合 baseline
// 用法：node exp2-md-relations.mjs [md目录] ；环境变量 EMBED_MODEL / LIMIT 可覆盖
import fs from 'node:fs';
import path from 'node:path';

const EMBED_MODEL = process.env.EMBED_MODEL || 'qwen3-embedding:0.6b';
const LIMIT = Number(process.env.LIMIT || 100);
const SRC = process.argv[2] || '/Users/alchain/Documents/写作/01-公众号写作/_archive';
const OUT = path.join(import.meta.dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });

// 收集 md（每个项目文件夹只取主要文章：>2KB 的 md，排除 README/brief/调研）
const docs = [];
(function walk(dir, depth) {
  if (depth > 4 || docs.length >= LIMIT * 3) return;
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/^(node_modules|\.git|配图|素材|images)$/.test(e.name)) walk(full, depth + 1); continue; }
    if (!e.name.endsWith('.md') || /^(README|brief|调研|大纲)/i.test(e.name)) continue;
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (st.size < 2048 || st.size > 200 * 1024) continue;
    const rel = path.relative(SRC, full);
    docs.push({ path: full, name: e.name.replace(/\.md$/, ''), rel, proj: rel.split(path.sep)[0], mtime: st.mtimeMs });
  }
})(SRC, 0);

// 每个项目只取最新一篇主文，保证样本覆盖更多项目（同项目草稿互相关联是废话）
const byProj = new Map();
for (const d of docs.sort((a, b) => b.mtime - a.mtime)) if (!byProj.has(d.proj)) byProj.set(d.proj, d);
const picked = [...byProj.values()].slice(0, LIMIT);
console.log(`收集到 ${docs.length} 篇 / ${byProj.size} 个项目，每项目取主文，共 ${picked.length} 篇`);

// 文章级 embedding：标题 + 正文前 1500 字
for (const d of picked) {
  const body = fs.readFileSync(d.path, 'utf8').replace(/^---[\s\S]*?---/, '').replace(/[#>*`\[\]()!-]/g, ' ');
  d.text = d.name + '\n' + body.slice(0, 1500);
}

console.log(`embedding 模型: ${EMBED_MODEL}，开始批量计算…`);
const t0 = Date.now();
const vecs = [];
for (let i = 0; i < picked.length; i += 10) {
  const batch = picked.slice(i, i + 10);
  const r = await fetch('http://127.0.0.1:11434/api/embed', {
    method: 'POST',
    body: JSON.stringify({ model: EMBED_MODEL, input: batch.map((d) => d.text) }),
  });
  const j = await r.json();
  if (j.error) { console.error('embed 失败:', j.error); process.exit(1); }
  vecs.push(...j.embeddings);
  process.stdout.write(`\r${vecs.length}/${picked.length}`);
}
const embedMs = Date.now() - t0;
console.log(`\nembedding 总耗时 ${embedMs}ms（均 ${Math.round(embedMs / picked.length)}ms/篇）`);

const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return s / (Math.sqrt(na) * Math.sqrt(nb)); };

// 关键词 baseline：标题分词（2-gram 覆盖中文）重合度
const grams = (s) => { const g = new Set(); const t = s.replace(/[^一-龥a-zA-Z0-9]/g, ''); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
const jac = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); };
picked.forEach((d) => { d.g = grams(d.name); });

// 取 10 篇探针，各出 embedding top5 vs 关键词 top5
const probes = picked.filter((_, i) => i % Math.floor(picked.length / 10 || 1) === 0).slice(0, 10);
let report = `# 实验2：相关文章对照（embedding vs 标题关键词）\n\n模型 ${EMBED_MODEL} · ${picked.length} 篇 · embedding 共 ${Math.round(embedMs / 1000)}s\n\n请人工判断：每组里 embedding 找到的关联是否比关键词 baseline 更有洞察（尤其跨项目/跨时间的关联）。\n`;
for (const p of probes) {
  const pi = picked.indexOf(p);
  const byVec = picked.map((d, i) => ({ d, s: d.proj === p.proj ? -1 : cos(vecs[pi], vecs[i]) })).sort((a, b) => b.s - a.s).slice(0, 5);
  const byKw = picked.map((d) => ({ d, s: d.proj === p.proj ? -1 : jac(p.g, d.g) })).sort((a, b) => b.s - a.s).slice(0, 5);
  const label = (d) => `${d.proj.slice(0, 28)}`;
  report += `\n## ${p.proj} ／ ${p.name.slice(0, 24)}\n\n| embedding 相关（跨项目） | 相似度 | 关键词 baseline | 重合度 |\n|---|---|---|---|\n`;
  for (let i = 0; i < 5; i++) report += `| ${label(byVec[i].d)} | ${byVec[i].s.toFixed(3)} | ${label(byKw[i].d)} | ${byKw[i].s.toFixed(3)} |\n`;
}
fs.writeFileSync(path.join(OUT, 'exp2-report.md'), report);
fs.writeFileSync(path.join(OUT, 'exp2-vectors.json'), JSON.stringify({ model: EMBED_MODEL, docs: picked.map((d, i) => ({ rel: d.rel, vec: vecs[i] })) }));
console.log('报告已写入 results/exp2-report.md');
