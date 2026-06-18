// 速度剖析：定位 0.8b 看图慢在哪 — 图片尺寸 × 结构化输出(grammar) 的矩阵
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const MODEL = process.env.MODEL || 'qwen3.5:0.8b';
const SRC = process.argv[2] || path.join(os.homedir(), 'Desktop');
const img = fs.readdirSync(SRC).filter((f) => f.startsWith('截屏') && f.endsWith('.png'))[3];
console.log('测试图:', img);

const PROMPT = '一句话描述画面（中文≤40字），再给5个检索标签。';
const FORMAT = { type: 'object', properties: { desc: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['desc', 'tags'] };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'));

const variants = [
  { name: '1024px+json格式', size: 1024, format: true },
  { name: '1024px 自由文本', size: 1024, format: false },
  { name: '768px +json格式', size: 768, format: true },
  { name: '512px +json格式', size: 512, format: true },
  { name: '512px 自由文本', size: 512, format: false },
];

// 预热
await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', body: JSON.stringify({ model: MODEL, stream: false, messages: [{ role: 'user', content: 'hi' }], options: { num_predict: 3 } }) });

for (const v of variants) {
  const small = path.join(tmp, `${v.size}.jpg`);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', String(v.size), path.join(SRC, img), '--out', small], { stdio: 'ignore' });
  const b64 = fs.readFileSync(small).toString('base64');
  const times = [];
  let detail = '';
  for (let run = 0; run < 2; run++) {
    const t0 = Date.now();
    const r = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: MODEL, stream: false,
        messages: [{ role: 'user', content: PROMPT, images: [b64] }],
        ...(v.format ? { format: FORMAT } : {}),
        options: { temperature: 0.1, num_predict: 200 },
      }),
      signal: AbortSignal.timeout(120000),
    });
    const j = await r.json();
    times.push(Date.now() - t0);
    if (run === 1) {
      const pe = j.prompt_eval_count, pd = Math.round(j.prompt_eval_duration / 1e6);
      const ec = j.eval_count, ed = Math.round(j.eval_duration / 1e6);
      detail = `prefill ${pe}tok/${pd}ms (${Math.round(pe / (pd / 1000))}tok/s) · decode ${ec}tok/${ed}ms (${Math.round(ec / (ed / 1000))}tok/s)`;
    }
  }
  console.log(`${v.name}: 第2次 ${times[1]}ms ｜ ${detail}`);
}
