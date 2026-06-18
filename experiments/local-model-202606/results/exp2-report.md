# 实验2：相关文章对照（embedding vs 标题关键词）

模型 qwen3-embedding:0.6b · 78 篇 · embedding 共 14s

请人工判断：每组里 embedding 找到的关联是否比关键词 baseline 更有洞察（尤其跨项目/跨时间的关联）。

## 2026.05-觅游社区 ／ 美团供应商入驻-公司简介与主营业务

| embedding 相关（跨项目） | 相似度 | 关键词 baseline | 重合度 |
|---|---|---|---|
| 2026.04-Kimi-MultiClaw龙虾群聊 | 0.425 | 2026.04-Kimi-MultiClaw龙虾群聊 | 0.000 |
| 2026.03-阿里国际站 | 0.424 | 2026.05-国富论与AI分配 | 0.000 |
| 2026.04-lovart合作 | 0.421 | 2026.05-Anthropic创始人手册翻译 | 0.000 |
| 2026.05-WorkBuddy专家团 | 0.410 | 2026.05-微信读书skill推荐 | 0.000 |
| 2026.04-黄峥skill对话 | 0.387 | 2026.05-LibTV团队版 | 0.000 |

## 2026.05-Codex-ClaudeCode评测 ／ 草稿

| embedding 相关（跨项目） | 相似度 | 关键词 baseline | 重合度 |
|---|---|---|---|
| 2026.02-Opus46-vs-Codex53 | 0.719 | 2026.05-国富论与AI分配 | 1.000 |
| 2026.03-Claude Code源码解构 | 0.675 | 2026.05-微信读书skill推荐 | 1.000 |
| 2026.03-Boris15条CC技巧 | 0.661 | 2026.05-LibTV团队版 | 1.000 |
| 2026.05-ClaudeCode-AgentView | 0.648 | 2026.05-AI让失败变便宜 | 1.000 |
| 2026.04-Claude-Code-Orange-B | 0.634 | 2026.05-ClaudeCode-AgentView | 1.000 |

## 2026.05-md生产html消费 ／ 小红书长文

| embedding 相关（跨项目） | 相似度 | 关键词 baseline | 重合度 |
|---|---|---|---|
| 2026.05-Codex-ClaudeCode评测 | 0.551 | 2026.05-觅游社区 | 0.000 |
| 2026.04-知识星球-skill长文档反共识 | 0.547 | 2026.04-Kimi-MultiClaw龙虾群聊 | 0.000 |
| 2026.03-Claude Code源码解构 | 0.545 | 2026.05-国富论与AI分配 | 0.000 |
| 2026.04-harness-optimizer-sk | 0.535 | 2026.05-Anthropic创始人手册翻译 | 0.000 |
| 2026.05-huashu-design老外实测 | 0.530 | 2026.05-微信读书skill推荐 | 0.000 |

## 2026.04-LMArena评测争议 ／ 草稿

| embedding 相关（跨项目） | 相似度 | 关键词 baseline | 重合度 |
|---|---|---|---|
| 2026.03-Cursor底裤 | 0.564 | 2026.05-国富论与AI分配 | 1.000 |
| 2026.05-MiniMax技术解读 | 0.520 | 2026.05-微信读书skill推荐 | 1.000 |
| 2026.03-林俊旸智能体思考 | 0.505 | 2026.05-LibTV团队版 | 1.000 |
| 2026.04-DeepSeekV4解读 | 0.504 | 2026.05-Codex-ClaudeCode评测 | 1.000 |
| 2026.03-林俊旸Apple猜测 | 0.496 | 2026.05-AI让失败变便宜 | 1.000 |

## 2026.04-GPT-5.5 ／ gpt-5.5-openai-style-ani

| embedding 相关（跨项目） | 相似度 | 关键词 baseline | 重合度 |
|---|---|---|---|
| 2026.04-豆包Seed2.0Lite-全模态 | 0.652 | 2026.04-moxt-brand-animation | 0.176 |
| 2026.03-GPT54 | 0.642 | 2026.04-Claude-Code源码泄露社区玩法 | 0.050 |
| 2026.03-GLM-5V-Turbo | 0.607 | image-to-slides-如何生成sharp结论- | 0.039 |
| 2026.04-huashu-design发布 | 0.600 | 2026.02-Opus46-vs-Codex53 | 0.032 |
| 2026.03-LibTV | 0.584 | 2026.04-GPT-Image-2-Lovart | 0.029 |

## 2026.04-lovart合作 ／ 草稿

| embedding 相关（跨项目） | 相似度 | 关键词 baseline | 重合度 |
|---|---|---|---|
| 2026.04-星流ImageV2 | 0.590 | 2026.05-国富论与AI分配 | 1.000 |
| 2026.05-WorkBuddy专家团 | 0.525 | 2026.05-微信读书skill推荐 | 1.000 |
| 2026.05-LibTV团队版 | 0.517 | 2026.05-LibTV团队版 | 1.000 |
| 2026.04-moxt-brand-animation | 0.476 | 2026.05-Codex-ClaudeCode评测 | 1.000 |
| 2026.03-LibTV | 0.475 | 2026.05-AI让失败变便宜 | 1.000 |

## 2026.04-Claude-Code-Orange-Book-发布 ／ 已发布-公众号文章

| embedding 相关（跨项目） | 相似度 | 关键词 baseline | 重合度 |
|---|---|---|---|
| 2026.03-Claude Code源码解构 | 0.739 | 2026.05-Anthropic创始人手册翻译 | 0.182 |
| 2026.03-Boris15条CC技巧 | 0.723 | 2026.04-女娲开源 | 0.111 |
| 2026.04-知识星球-skill长文档反共识 | 0.687 | 2026.05-觅游社区 | 0.000 |
| 2026.04-harness-optimizer-sk | 0.647 | 2026.04-Kimi-MultiClaw龙虾群聊 | 0.000 |
| 2026.04-生财有术分享 | 0.642 | 2026.05-国富论与AI分配 | 0.000 |

## 2026.03-Claude-Code-Auto-Mode ／ 原文

| embedding 相关（跨项目） | 相似度 | 关键词 baseline | 重合度 |
|---|---|---|---|
| 2026.03-Claude Code源码解构 | 0.592 | 2026.05-觅游社区 | 0.000 |
| 2026.03-Boris15条CC技巧 | 0.582 | 2026.04-Kimi-MultiClaw龙虾群聊 | 0.000 |
| 2026.04-harness-optimizer-sk | 0.577 | 2026.05-国富论与AI分配 | 0.000 |
| 2026.04-Claude-Code-Orange-B | 0.574 | 2026.05-Anthropic创始人手册翻译 | 0.000 |
| 2026.05-ClaudeCode-AgentView | 0.557 | 2026.05-微信读书skill推荐 | 0.000 |

## 2026.04-把自己作为skill ／ 草稿-comedy

| embedding 相关（跨项目） | 相似度 | 关键词 baseline | 重合度 |
|---|---|---|---|
| 2026.04-女娲开源 | 0.825 | 2026.05-国富论与AI分配 | 0.143 |
| 2026.04-生财有术分享 | 0.686 | 2026.05-微信读书skill推荐 | 0.143 |
| 2026.04-AutoSkillOptimizer发布 | 0.640 | 2026.05-LibTV团队版 | 0.143 |
| 2026.04-Kimi-MultiClaw龙虾群聊 | 0.611 | 2026.05-Codex-ClaudeCode评测 | 0.143 |
| 2026.05-微信读书skill推荐 | 0.604 | 2026.05-AI让失败变便宜 | 0.143 |

## 2026.03-Anthropic74次发布 ／ 草稿

| embedding 相关（跨项目） | 相似度 | 关键词 baseline | 重合度 |
|---|---|---|---|
| 2026.04-Claude-Managed-Agent | 0.762 | 2026.05-国富论与AI分配 | 1.000 |
| 2026.03-Anthropic被封杀 | 0.660 | 2026.05-微信读书skill推荐 | 1.000 |
| 2026.04-ClaudeDesign杀死Figma | 0.654 | 2026.05-LibTV团队版 | 1.000 |
| 2026.04-comedy-anthropic-roa | 0.648 | 2026.05-Codex-ClaudeCode评测 | 1.000 |
| 2026.04-Anthropic-Glasswing | 0.627 | 2026.05-AI让失败变便宜 | 1.000 |
