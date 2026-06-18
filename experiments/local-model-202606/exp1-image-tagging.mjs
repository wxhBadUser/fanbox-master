// 实验1：本地小模型给真实截图打标 — 质量 / 速度 / 相对 Spotlight OCR 的增量
// 用法：node exp1-image-tagging.mjs [图片目录] ；环境变量 MODEL / N 可覆盖
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const MODEL = process.env.MODEL || 'qwen3.5:0.8b';
const N = Number(process.env.N || 20);
const SRC = process.argv[2] || path.join(os.homedir(), 'Desktop');
const OUT = path.join(import.meta.dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });

const PROMPT = `你在为本地文件搜索系统建立图片索引。看图输出 JSON：
desc：一句话描述画面内容（中文，不超过40字，要具体：什么界面/什么物体/什么场景）
tags：5个检索标签（中文名词，要具体可搜，如"终端"、"配色方案"、"聊天记录"，避免"图片"、"屏幕"这种废词）
text：画面里最显眼的一段文字，原样抄写（没有就空字符串）`;

const FORMAT = {
  type: 'object',
  properties: {
    desc: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    text: { type: 'string' },
  },
  required: ['desc', 'tags', 'text'],
};

// 均匀取样：截屏优先，不够再补其它图
const all = fs.readdirSync(SRC).filter((f) => /\.(png|jpe?g)$/i.test(f));
const shots = all.filter((f) => f.startsWith('截屏')).sort();
const pool = shots.length >= N ? shots : all.sort();
const step = Math.max(1, Math.floor(pool.length / N));
const sample = pool.filter((_, i) => i % step === 0).slice(0, N);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exp1-'));
const rows = [];
let totalMs = 0;

const chat = (body, ms) => fetch('http://127.0.0.1:11434/api/chat', {
  method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ms),
}).then((r) => r.json());

// 预热：先把模型拉上 GPU，避免首批请求在加载窗口超时
console.log('预热模型…');
try { await chat({ model: MODEL, stream: false, messages: [{ role: 'user', content: 'hi' }], options: { num_predict: 5 } }, 120000); }
catch (e) { console.log('预热失败（继续尝试）:', e.message); }

for (const [i, f] of sample.entries()) {
  const full = path.join(SRC, f);
  // 模拟 app 内的预处理：缩到 1024 边长 jpeg（降低编码与推理负担）
  const small = path.join(tmp, i + '.jpg');
  try { execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', '1024', full, '--out', small], { stdio: 'ignore' }); }
  catch { continue; }
  const b64 = fs.readFileSync(small).toString('base64');
  const t0 = Date.now();
  let parsed = null, err = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      const j = await chat({
        model: MODEL, stream: false,
        messages: [{ role: 'user', content: PROMPT, images: [b64] }],
        format: FORMAT,
        options: { temperature: 0.1 },
      }, 90000); // 无超时的 fetch 会在请求被丢时永远挂死（首跑实测翻车）
      if (j.error) throw new Error(j.error);
      parsed = JSON.parse(j.message.content);
      err = null;
    } catch (e) { err = e.message; }
  }
  const ms = Date.now() - t0;
  totalMs += ms;
  rows.push({ file: f, ms, ...(parsed || {}), error: err || undefined });
  console.log(`[${i + 1}/${sample.length}] ${ms}ms ${f}`);
  if (parsed) console.log(`   ${parsed.desc}\n   #${(parsed.tags || []).join(' #')}${parsed.text ? '\n   文字: ' + parsed.text.slice(0, 60) : ''}`);
  else console.log(`   ✗ ${err}`);
}

const ok = rows.filter((r) => !r.error);
const avg = ok.length ? Math.round(ok.reduce((a, b) => a + b.ms, 0) / ok.length) : 0;
const summary = {
  model: MODEL, sampled: sample.length, succeeded: ok.length,
  avgMsPerImage: avg, firstMs: rows[0]?.ms, // 首张含模型加载
  estimatedFor1000: `${Math.round((avg * 1000) / 60000)} 分钟`,
};
fs.writeFileSync(path.join(OUT, 'exp1-results.json'), JSON.stringify({ summary, rows }, null, 2));
console.log('\n== 汇总 ==', JSON.stringify(summary, null, 2));
