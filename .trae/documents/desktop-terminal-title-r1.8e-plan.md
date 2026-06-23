# Desktop UI-R1.8E 终端会话标题修正计划

## 1. Summary

根据图 1 反馈与上一轮 R1.8D 的后续调整，当前终端会话下拉里仍有标题被压缩成无意义单字（如 "I · wxh10"）的情况。本计划目标：

1. 标题必须根据用户在该终端会话里的**第一句真实输入**生成。
2. 当无法提取出"初始化 CLAUDE.md"这类关键字标题时，**回退显示原句截断**（用户已确认）。
3. 标题后始终拼接 `· 工作目录/项目名称`，第二行显示 Agent 名（Claude Code / Codex / Terminal 等）。
4. 不扩大范围：仅修改 `public/app.js` 的标题生成与显示逻辑，不动 CSS、终端架构、后端接口。

## 2. Current State Analysis

相关代码位于 `public/app.js`：

- `titleFromFirstUserMessage(text)`（349–459 行）：当前已有关键字规则，但英文 fallback 在没有识别到动词时，会直接把首单词当作标题（如 "I"），导致无意义标题。
- `finalizeInputLine(s)`（4088–4100 行）：在 xterm `onData` 链路里捕获第一行非启动命令输入，写入 `s.firstUserMessage` 和 `s.chatTitle`。
- `sessionDisplayTitle(s)`（4050–4058 行）：已拆分为 `getConversationTitle(s) + ' · ' + getSessionCwdLabel(s)`，格式正确。
- `renderSessionMenu()`（4111 行起）：下拉第一行使用 `sessionDisplayTitle(s)`，第二行使用 `sessionAgentLabel(s)`，结构正确。

问题核心：`titleFromFirstUserMessage` 的 fallback 策略不够好，没有把"提取失败"回退到原句截断。

## 3. Proposed Changes

### 3.1 重构 `titleFromFirstUserMessage`

文件：`public/app.js`（349–459 行）

修改内容：

1. **保留高优先级关键字规则**：中文/英文的 CLAUDE.md、项目结构分析、修复、优化、Git 等规则保持不变，继续优先命中。
2. **新增"有效标题"校验**：
   - 如果高优先级规则或 actionMap 生成的标题是空字符串、纯停用词、或只剩 1 个字符/1 个无意义单词，视为提取失败。
   - 中文停用词示例：我、你、他、这、那、的、了、吗 等。
   - 英文停用词示例：I, we, you, it, a, an, the, this, that, is, am, are 等。
3. **失败后回退原句截断**：
   - 中文：取 `raw` 前 18 个字符，超出加 `…`。
   - 英文：取 `raw` 前 6 个有效单词，超出加 `…`；总长度不超过 48。
4. **保留文件路径显示**：当输入包含具体文件路径时，仍优先生成"修复 public/app.js" / "Fix public/app.js" 等关键字标题。
5. **保持多语言独立处理**：中文走中文规则，英文走英文规则，不混用。

### 3.2 调整最小捕获长度（可选）

文件：`public/app.js`（4091 行）

当前 `if (!line || line.length < 2) return;` 会把单个字母 "I" 直接丢弃。若希望单字母也被记录并显示为原句，可放宽为 `< 1`。但为了避免误把回车/空行当作输入，保持 `< 2` 更稳妥。建议保持现状，因为真正问题在生成逻辑，不在捕获门槛。

### 3.3 验证显示链路无需改动

`sessionDisplayTitle` 已经返回 `标题 · 工作目录`，`renderSessionMenu` 也已正确分两行显示标题和 Agent。本计划不修改这两处。

## 4. Assumptions & Decisions

- 用户已确认：当无法生成关键字标题时，显示原句截断而非默认标题。
- 只修改 `public/app.js`。
- 不改动 CSS、xterm 主题、会话捕获机制、后端接口。
- 保持对 agent 启动命令（claude/codex/qoder/opencode 及 headroom/npx 等 wrapper）的忽略。

## 5. Verification Steps

1. 语法检查：`node -c public/app.js`
2. 单元验证：用临时脚本验证以下输入的标题生成：
   - `"I want to create a CLAUDE.md file."` → `Create CLAUDE.md · wxh10`
   - `"I don't know what to do"` → 原句截断（如 `"I don't know what to..." · wxh10`）
   - `"请你帮我修复 follow diff 路径加载失败的问题。"` → `修复 follow diff 路径 · wxh10`
   - `"分析项目架构"` → `项目结构分析 · wxh10`
3. Electron Smoke：启动应用，新建 Claude Code 会话，输入首句，打开下拉，确认：
   - 第一行为"标题 · 工作目录"
   - 第二行为 Agent 名
   - 标题不是无意义单字
4. git 检查：`git diff --stat`、`git diff --check`、`git status --short`
