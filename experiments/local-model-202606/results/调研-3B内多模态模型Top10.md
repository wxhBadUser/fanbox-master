# ≤3B 开源视觉-语言小模型调研报告（截至 2026 年 6 月）

> 由独立调研 agent 完成（36 次检索），所有关键数据带来源；查不到的明确标注，无编造。
> 场景：macOS 桌面应用（翻箱）内置本地 VLM，截图打标 + 图片描述辅助搜索（OCR + UI 理解 + 中文），Apple Silicon + Ollama。

## 一、结论

1. **最值得实测的 2-3 个**：Qwen3.5-2B（首选）、LFM2.5-VL-1.6B（速度优先备选）、Gemma 4 E2B（第三候选）。
2. **qwen3.5:0.8b 的位置**：本批模型里视觉能力垫底的通用模型（MMMU-Pro 仅 25.8，同家族 2B 是 56.9）。
3. **11-19 秒慢的主因可能不是模型，而是 Ollama 的视觉 prefill 路径**。RTX 5090 跑 Qwen3-VL 处理 512×375 图也要 32.8 秒（[ollama#14548](https://github.com/ollama/ollama/issues/14548)）。Ollama 0.19（2026.03）起 Apple Silicon 改用 MLX runner（[来源](https://codersera.com/blog/apple-silicon-llms-complete-guide-2026/)）——本机已是 0.24.0。降低送图分辨率（768px 通常够）收益可能大于换模型。

## 二、Top 10 排序表

排序依据：官方视觉 benchmark（MMMU/OCRBench/OmniDocBench/ScreenSpot）+ 社区口碑 + 截图打标场景适配度综合。OpenCompass 动态榜未能直接抓取，**排序为跨信源综合判断**，1-2 名与 3-4 名内部先后有争议空间。

| # | 模型 | 参数量 | 量化体积 | 视觉强项 | 中文 | 运行时 | 许可证 |
|---|------|--------|---------|---------|------|--------|--------|
| 1 | **Qwen3.5-2B**（2026.03） | 2B | Ollama 2.7GB | OCRBench 84.5、OmniDocBench 79.8、**ScreenSpot Pro 54.5（UI理解）**、MMMU 64.2 | 强（201语言） | Ollama / llama.cpp / MLX | Apache 2.0 |
| 2 | **Gemma 4 E2B**（2026.04） | 2.3B有效（含嵌入5.1B，入选标准有争议） | 4bit 约需 5GB 内存 | 文档OCR、bounding box、MMMU-Pro 44.2、支持音频 | 140+语言，中文专项未查到 | Ollama（gemma4:e2b）/ llama.cpp | HF称 Apache 2.0（建议复核模型卡） |
| 3 | **Moondream 3 Preview** | 9B总参/**2B激活**（MoE，按总参超标） | Mac 需≥16GB 内存 | **ScreenSpot UI F1@0.5 60.3（UI定位最强）**、grounding SOTA级 | 弱（英文为主） | Moondream Station（MLX）；**不支持 Ollama** | BSL 1.1+附加授权（多数商用免费，不得做竞品） |
| 4 | **LFM2.5-VL-1.6B**（Liquid AI） | 1.6B | GGUF 可用 | **低延迟设计**（官方称同档最快、1024px 任务快2倍）；OCRBench 742（前代数据） | 多语言，中文深度未知 | Ollama（hf.co GGUF 直拉）/ llama.cpp | LFM License（年营收<$10M 免费商用） |
| 5 | **Qwen3-VL-2B**（2025.10） | 2B | Ollama 1.9GB | OCR 32语言、GUI视觉代理、2D/3D grounding | 强 | Ollama（≥0.12.7） | Apache 2.0 |
| 6 | **InternVL3.5-2B**（2025.08） | 2B | GGUF 生态弱 | OCR/图表/文档 9项均分76.7 | 强 | vLLM 为主，**Mac 不顺** | Apache 2.0 |
| 7 | **DeepSeek-OCR-2**（2026.01） | 3B | OCR-2 包体积未查到 | **文档/文字专精**：OmniDocBench v1.5 91.09% | 强 | llama.cpp / MLX-VLM | MIT（前代如此，请复核） |
| 8 | **PaddleOCR-VL** | 0.9B | Paddle/vLLM 生态 | 文档解析专精 OmniDocBench 92.6 | 极强 | **无 Ollama 路径**，Mac 不友好 | Apache 2.0 |
| 9 | **Qwen3.5-0.8B**（在用） | 0.8B | Ollama 1.0GB | 通用描述尚可；MMMU-Pro 仅 25.8 | 可用但弱 | Ollama | Apache 2.0 |
| 10 | **SmolVLM2-2.2B** | 2.2B | 小 | 通用描述，完全开源（含训练数据） | 弱（无中文） | llama.cpp / MLX | Apache 2.0 |

**落选但需要知道**：Apple FastVLM-0.5B/1.5B 速度极快（TTFT 快85倍）但许可证 apple-amlr **禁止商用/产品集成**（[LICENSE](https://huggingface.co/apple/FastVLM-0.5B/blob/main/LICENSE)）。MiniCPM-V 4.0（4.1B）、Gemma 4 E4B、Ministral-3-3B 超 3B 线。

## 三、速度表现（Apple Silicon，仅列查到的硬数据）

| 模型/场景 | 机器 | 数据 | 来源 |
|---|---|---|---|
| Moondream 3（MLX 原生） | M1 Max 64GB | 35+ tok/s | [官方博客](https://moondream.ai/blog/moondream-station-m3-preview) |
| Qwen3-4B + 图（vllm-mlx） | M4 Max | 159 tok/s；单图延迟 21.7s，**图像缓存命中后 0.78s** | [arXiv 2601.19139](https://arxiv.org/html/2601.19139v2) |
| Gemma 4 E2B Q4（纯文本） | M1 8GB | 15-20 tok/s | gemma4-ai.com（非官方，可信度中等） |
| Qwen3-VL 单图（Ollama） | RTX 5090（参照） | 512×375 图 32.8s | [ollama#14548](https://github.com/ollama/ollama/issues/14548) |
| LFM2-VL | GPU（厂商口径） | 同档最快再快2倍 | [Liquid AI](https://www.liquid.ai/blog/lfm2-vl-efficient-vision-language-models) |
| Qwen3.5-2B / Gemma 4 E2B / InternVL3.5-2B 的 Mac 单图延迟 | — | **无公开数据** | — |

## 四、实测建议

1. **Qwen3.5-2B（首选）**：唯一同时有 OCRBench + ScreenSpot Pro 分数、中文一流、Apache 2.0、就在 Ollama 工作流里。注意：该系列 thinking 模式输出 token 偏多（[Artificial Analysis](https://artificialanalysis.ai/articles/qwen3-5-small-models)），打标务必关 thinking。
2. **LFM2.5-VL-1.6B（速度优先）**：名单里唯一以端侧低延迟为设计目标且可商用的。需验证中文标签质量。
3. **Gemma 4 E2B（第三）**：文档 OCR + bounding box 实用，但无 UI 专项分数。
4. 跳出 Ollama 的对照组：Moondream 3 UI 定位最强 + M1 Max 35tok/s 实测，但中文弱、需单独集成 MLX。

**诚实声明**：前三候选在 Apple Silicon 的单图打标延迟均无公开实测，最终以本机 A/B 为准；Gemma 4 与 DeepSeek-OCR-2 的许可证需落地前二次确认。

## 五、主要信源

- Qwen3.5：[模型卡](https://huggingface.co/Qwen/Qwen3.5-2B) / [Ollama](https://ollama.com/library/qwen3.5) / [Artificial Analysis](https://artificialanalysis.ai/articles/qwen3-5-small-models)
- Gemma 4：[HF 博客](https://huggingface.co/blog/gemma4) / [模型卡](https://ai.google.dev/gemma/docs/core/model_card_4) / [Unsloth](https://unsloth.ai/docs/models/gemma-4)
- Moondream 3：[发布博客](https://moondream.ai/blog/moondream-3-preview) / [Mac 实测](https://moondream.ai/blog/moondream-station-m3-preview)
- LFM2.5-VL：[Liquid AI](https://www.liquid.ai/blog/lfm2-vl-efficient-vision-language-models) / [License](https://www.liquid.ai/lfm-license)
- DeepSeek-OCR-2：[GitHub](https://github.com/deepseek-ai/DeepSeek-OCR-2)
- InternVL3.5：[arXiv](https://arxiv.org/abs/2508.18265)
- Ollama 视觉慢问题：[#14548](https://github.com/ollama/ollama/issues/14548) / [#14579](https://github.com/ollama/ollama/issues/14579)
- FastVLM 许可限制：[LICENSE](https://huggingface.co/apple/FastVLM-0.5B/blob/main/LICENSE)
