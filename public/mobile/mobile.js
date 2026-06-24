/**
 * FanBox Mobile · Phase UI-A7
 * Manus-like Home + ChatGPT-like Agent + Mobile File Manager
 * Complete rewrite of mobile.js
 */
"use strict";

/* =========================================================
   Constants & Config
   ========================================================= */
const TOKEN_KEY  = "fanbox_mobile_token";
const DEVICE_KEY = "fanbox_mobile_device";
const AGENT_KEY  = "fanbox_mobile_agent";
const CWD_KEY    = "fanbox_mobile_cwd";
const SESSION_KEY = "fanbox_mobile_session";

const TASK_CHIPS = [
  { label: "Develop app", icon: "app" },
  { label: "Website", icon: "web" },
  { label: "Explain project", icon: "info" },
  { label: "Fix bug", icon: "bug" },
];

/** 中文简介映射表 */
const SKILL_CN = {
  "ppt":          "生成、编辑和整理演示文稿",
  "docx":         "生成和编辑 Word 文档",
  "xlsx":         "处理表格、数据和 Excel 文件",
  "code-review":  "检查代码结构、风险和可维护性",
  "summary":      "总结文件、目录或会话内容",
  "pdf":          "读取、提取和生成 PDF 文档",
  "deep-research":"对任意主题进行系统性深度研究",
  "academic-paper":"学术论文写作流水线",
  "ljg-paper":    "把论文讲成一个完整故事",
  "ljg-card":     "将内容铸成视觉化卡片图",
  "ljg-roundtable":"多角色圆桌讨论框架",
  "ljg-think":    "纵向深钻思维工具",
  "ljg-rank":     "降秩分析，找领域背后真正撑着的力",
  "ljg-travel":   "博物馆和古建深度旅行研究",
  "ljg-word":     "追本溯源，掌握一个英文单词",
  "ljg-learn":   "从 8 个维度解构任意概念",
  "ljg-qa":       "把核心观点抽成 Q-A 对",
  "ljg-writes":   "像手术刀剖开一个观点",
  "ljg-plain":    "把复杂内容说成人话",
  "ljg-invest":   "深度投资分析，评估项目是否是一台秩序创造机器",
  "ljg-book":     "以问题为轴心拆解一本书",
  "ljg-present":  "演讲铸造器，Outline 视觉化呈现",
  "ljg-skill-map":"扫描所有已安装技能并生成技能地图",
  "skill-creator":"创建和改进 Agent 技能",
  "prototype":    "快速原型，验证设计方向",
  "test-driven-development":"测试驱动开发，红绿重构循环",
  "tdd":          "测试驱动开发",
  "grill-me":     "打破砂锅问到底的追问面试模式",
  "grill-with-docs":"用项目文档校验计划，挑战设计",
  "brainstorming":"创意发散，在动手前先探索意图和设计",
  "triage":       "Issue 分类工作流",
  "handoff":      "压缩会话为可交接文档",
  "to-issues":    "把计划拆成独立可领取的 Issue",
  "to-prd":       "把当前上下文转成 PRD 并发布到 Issue Tracker",
  "improve-codebase-architecture":"发现代码库深化重构机会",
  "write-a-skill":"从头创建新 Agent 技能",
  "executing-plans":"执行有审查检查点的实施计划",
  "agent-reach":  "在 17 个平台搜索和交互",
  "agent-browser":"浏览器自动化 CLI",
  "ljg-paper-river":"论文倒读法，递归追溯前序论文",
  "ljg-paper-flow":"论文流：读论文 + 做卡片一气呵成",
  "ljg-relationship":"关系结构诊断与精神分析深度分析",
  "ljg-word-flow":"词卡流：单词深度分析 + 信息图一气呵成",
};

/** Agent 定义 */
const AGENTS = [
  {
    id: "claude_code",
    label: "Claude Code",
    model: "claude-3-5-sonnet-20241022",
    effort: "medium",
    // Claude starburst — orange/amber, 4-point burst, on dark background
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5" fill="#DA7756"/>
  <path d="M12 5 L13.4 10.6 L19 12 L13.4 13.4 L12 19 L10.6 13.4 L5 12 L10.6 10.6 Z" fill="#FFFFFF"/>
  <path d="M12 2 L12.6 3.6 L14 4 L12.6 4.4 L12 6 L11.4 4.4 L10 4 L11.4 3.6 Z" fill="#FFFFFF" opacity="0.95"/>
  <path d="M12 18 L12.6 19.6 L14 20 L12.6 20.4 L12 22 L11.4 20.4 L10 20 L11.4 19.6 Z" fill="#FFFFFF" opacity="0.95"/>
  <path d="M2 12 L3.6 11.4 L4 10 L4.4 11.4 L6 12 L4.4 12.6 L4 14 L3.6 12.6 Z" fill="#FFFFFF" opacity="0.95"/>
  <path d="M18 12 L19.6 11.4 L20 10 L20.4 11.4 L22 12 L20.4 12.6 L20 14 L19.6 12.6 Z" fill="#FFFFFF" opacity="0.95"/>
</svg>`,
  },
  {
    id: "codex",
    label: "Codex",
    model: "gpt-4o",
    effort: "medium",
    // Codex — blue cloud with >_ terminal symbol
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="codex-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#A5B4FC"/>
      <stop offset="100%" stop-color="#6366F1"/>
    </linearGradient>
  </defs>
  <path d="M6 14 C 3 14, 2 11, 4 9 C 3 6, 7 4, 10 6 C 11 3, 16 3, 17 6 C 21 5, 22 10, 19 12 C 21 14, 19 17, 16 16 C 14 18, 9 18, 8 16 C 6 17, 4 16, 6 14 Z" fill="url(#codex-grad)"/>
  <path d="M8.5 11 L11.5 13 L8.5 15" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="12.5" y1="15.2" x2="16" y2="15.2" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  },
  {
    id: "qoder",
    label: "Qoder",
    model: "claude-3-5-sonnet-20241022",
    effort: "medium",
    // Qoder — black rounded square + white/green "a" abstract
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5" fill="#0F0F0F"/>
  <circle cx="13" cy="13" r="7" fill="none" stroke="#22C55E" stroke-width="2.6"/>
  <path d="M9 13 C 9 9, 14 8, 16 11 C 17 13, 15 16, 12 16 C 10 16, 9 14, 9 13 Z" fill="#22C55E"/>
  <circle cx="13" cy="13" r="2" fill="#0F0F0F"/>
</svg>`,
  },
  {
    id: "opencode",
    label: "OpenCode",
    model: "claude-3-5-sonnet-20241022",
    effort: "medium",
    // OpenCode — black/white Polaroid frame
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="3" fill="#0A0A0A"/>
  <rect x="5" y="3" width="14" height="14" fill="#FFFFFF"/>
  <rect x="7" y="5" width="10" height="10" fill="#3A3A3A"/>
  <rect x="5" y="17" width="14" height="4" fill="#FFFFFF"/>
  <rect x="6" y="18" width="12" height="2" fill="#0A0A0A"/>
</svg>`,
  },
];

/** 文件类型 SVG 图标（简洁 SVG） */
// Phase UI-A8-2: 彩色多色文件类型图标 (folder 黑色线性 / drive / pdf 红色 / word 蓝色 /
// excel 绿色 / ppt 橙色 / md 灰蓝 / code 黑色 </> / txt 蓝色 / image 紫色 / zip 黄色 / unknown)
const FILE_ICONS = {
  // 黑色线性 folder (ChatGPT/Manus 简洁风)
  folder: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 7 C3 5.9 3.9 5 5 5 H9.5 L11.5 7 H19 C20.1 7 21 7.9 21 9 V18 C21 19.1 20.1 20 19 20 H5 C3.9 20 3 19.1 3 18 V7Z" fill="#FFFFFF" stroke="#1F2328" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M3 10 H21" stroke="#1F2328" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`,

  // Windows 驱动器（disk icon）
  drive: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="5" width="18" height="14" rx="2" fill="#E5E7EB" stroke="#1F2328" stroke-width="1.5"/>
  <rect x="5" y="7" width="14" height="8" rx="1" fill="#FFFFFF" stroke="#1F2328" stroke-width="1.2"/>
  <rect x="5" y="16" width="3" height="1.5" rx="0.5" fill="#1F2328"/>
  <rect x="9" y="16" width="3" height="1.5" rx="0.5" fill="#1F2328"/>
</svg>`,

  // PDF · 红色
  pdf: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 L14 2Z" fill="#FEE2E2" stroke="#DC2626" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 2 V8 H20" fill="#FECACA" stroke="#DC2626" stroke-width="1.5" stroke-linejoin="round"/>
  <text x="12" y="17" text-anchor="middle" font-family="Arial, sans-serif" font-size="5.5" font-weight="bold" fill="#DC2626">PDF</text>
</svg>`,

  // Word · 蓝色
  word: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 L14 2Z" fill="#DBEAFE" stroke="#2563EB" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 2 V8 H20" fill="#BFDBFE" stroke="#2563EB" stroke-width="1.5" stroke-linejoin="round"/>
  <text x="12" y="17" text-anchor="middle" font-family="Arial, sans-serif" font-size="5.5" font-weight="bold" fill="#2563EB">DOC</text>
</svg>`,

  // Excel · 绿色
  excel: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 L14 2Z" fill="#DCFCE7" stroke="#16A34A" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 2 V8 H20" fill="#BBF7D0" stroke="#16A34A" stroke-width="1.5" stroke-linejoin="round"/>
  <text x="12" y="17" text-anchor="middle" font-family="Arial, sans-serif" font-size="5.5" font-weight="bold" fill="#16A34A">XLS</text>
</svg>`,

  // PPT · 橙色
  ppt: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 L14 2Z" fill="#FFEDD5" stroke="#EA580C" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 2 V8 H20" fill="#FED7AA" stroke="#EA580C" stroke-width="1.5" stroke-linejoin="round"/>
  <text x="12" y="17" text-anchor="middle" font-family="Arial, sans-serif" font-size="5.5" font-weight="bold" fill="#EA580C">PPT</text>
</svg>`,

  // Markdown · 灰蓝 MD
  md: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="5" width="20" height="14" rx="2" fill="#F1F5F9" stroke="#475569" stroke-width="1.5"/>
  <text x="6" y="15" font-family="Arial, sans-serif" font-size="6" font-weight="bold" fill="#475569">M</text>
  <path d="M9 11 L9 15 M9 13 L11 11 L11 15 M12 11 L12 15" stroke="#475569" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M14 11 L16 13 L18 11 M16 13 L16 15" stroke="#475569" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`,

  // Code · 黑色 <>
  code: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="4" width="20" height="16" rx="2" fill="#1F2328" stroke="#1F2328" stroke-width="1.5"/>
  <path d="M9 9 L6 12 L9 15" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M15 9 L18 12 L15 15" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M13.5 8 L10.5 16" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round"/>
</svg>`,

  // HTML · 橙色 <>
  html: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="4" width="20" height="16" rx="2" fill="#FEF3C7" stroke="#F97316" stroke-width="1.5"/>
  <path d="M8 9 L5 12 L8 15" stroke="#EA580C" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M16 9 L19 12 L16 15" stroke="#EA580C" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M13.5 8 L10.5 16" stroke="#EA580C" stroke-width="1.4" stroke-linecap="round"/>
</svg>`,

  // Txt · 蓝色文本
  txt: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 L14 2Z" fill="#FFFFFF" stroke="#1F2328" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 2 V8 H20" fill="#F1F5F9" stroke="#1F2328" stroke-width="1.5" stroke-linejoin="round"/>
  <line x1="7" y1="13" x2="17" y2="13" stroke="#2563EB" stroke-width="1.4" stroke-linecap="round"/>
  <line x1="7" y1="16" x2="14" y2="16" stroke="#2563EB" stroke-width="1.4" stroke-linecap="round"/>
  <line x1="7" y1="19" x2="11" y2="19" stroke="#2563EB" stroke-width="1.4" stroke-linecap="round"/>
</svg>`,

  // Image · 紫色
  image: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="18" height="18" rx="2" fill="#EDE9FE" stroke="#7C3AED" stroke-width="1.5"/>
  <circle cx="8.5" cy="8.5" r="1.6" fill="#7C3AED"/>
  <path d="M3 17 L8.5 12 L13 16 L17 13 L21 17 V19 C21 20.1 20.1 21 19 21 H5 C3.9 21 3 20.1 3 19 V17Z" fill="#C4B5FD" stroke="#7C3AED" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`,

  // Zip · 黄色
  zip: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 L14 2Z" fill="#FEF9C3" stroke="#CA8A04" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 2 V8 H20" fill="#FDE68A" stroke="#CA8A04" stroke-width="1.5" stroke-linejoin="round"/>
  <rect x="11" y="10" width="2" height="2" fill="#CA8A04"/>
  <rect x="11" y="13" width="2" height="2" fill="#CA8A04"/>
  <rect x="11" y="16" width="2" height="2" fill="#CA8A04"/>
  <circle cx="12" cy="6" r="1" fill="#1F2328"/>
</svg>`,

  // Unknown · 普通文件
  unknown: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 L14 2Z" fill="#F1F5F9" stroke="#64748B" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 2 V8 H20" fill="#E2E8F0" stroke="#64748B" stroke-width="1.5" stroke-linejoin="round"/>
  <line x1="7" y1="13" x2="17" y2="13" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="7" y1="16" x2="17" y2="16" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="7" y1="19" x2="13" y2="19" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round"/>
</svg>`,
};

/** 统一入口：根据 item 返回类型 + 图标 */
function fileTypeFor(item) {
  if (item && item.isDir) return 'folder';
  if (item && item.kind === 'dir') return 'folder';
  if (item && item.kind === 'drive') return 'drive';
  return getFileType(item && item.name ? item.name : '');
}

function fileIconFor(item) {
  return FILE_ICONS[fileTypeFor(item)] || FILE_ICONS.unknown;
}

/** 旧别名（保留以防 UI 层未迁移） */
function fileKindFor(item) { return fileTypeFor(item); }

/** 侧边栏导航图标 */
const NAV_ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 L12 2 L21 9 V20 C21 20.5 20.5 21 20 21 H4 C3.5 21 3 20.5 3 20 V9Z"/><polyline points="9 21 9 12 15 12 15 21"/></svg>`,
  files: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7 C3 5.9 3.9 5 5 5 H9 L11 7 H19 C20.1 7 21 7.9 21 9 V18 C21 19.1 20.1 20 19 20 H5 C3.9 20 3 19.1 3 18 V7Z"/></svg>`,
  skills: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2 L4 13 H7 L6 20 L13 11 H10 L11 2Z"/></svg>`,
  project: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7 C3 5.9 3.9 5 5 5 H9 L11 7 H19 C20.1 7 21 7.9 21 9 V18 C21 19.1 20.1 20 19 20 H5 C3.9 20 3 19.1 3 18 V7Z"/><line x1="3" y1="11" x2="21" y2="11"/></svg>`,
  sessions: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7 L3 21 V5 C3 3.9 3.9 3 5 3 H19 C20.1 3 21 3.9 21 5 V15Z"/></svg>`,
};

/** Chip icons */
const CHIP_ICONS = {
  app: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>`,
  web: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  slide: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/><polyline points="12 8 12 16"/></svg>`,
  img: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  audio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  table: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>`,
  bug: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 L8 6"/><path d="M16 2 L16 6"/><path d="M5 12 H19 C20.1 12 21 12.9 21 14 V16 C21 17.1 20.1 18 19 18 H5 C3.9 18 3 17.1 3 16 V14 C3 12.9 3.9 12 5 12 Z"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/><line x1="9" y1="12" x2="15" y2="12"/></svg>`,
  review: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 Z"/><polyline points="14 2 14 8 20 8"/></svg>`,
};

/* =========================================================
   State
   ========================================================= */
const S = {
  token:       null,
  deviceName:  null,
  currentAgent: "claude_code",
  currentTab:  "home",
  cwd:         null,
  cwdLabel:    null,    // Phase UI-A8-4: 友好名（folder basename）
  sidebarOpen: false,
  messages:    [],   // current session messages
  sessionId:   null,
  files:       [],   // current directory listing
  fileHistory:  [],   // navigation stack for back button
  skills:      [],
  skillState:  {},    // Phase UI-A8-4: mobile 端 skills enabled/disabled map
  allSessions: [],
  allProjects: [],          // Phase UI-A8-3: sessions 聚合后的 projects
  currentProject: null,     // Phase UI-A8-3: 当前 Project Detail
  currentProjectSessions: null, // Phase UI-A8-3: 当前 Project 下所有 sessions
  running:     false,
  currentSkill: null,
  filesPreview: null,
  _streamAbort: null,  // Phase UI-A8-6: AbortController for current stream
  _streamSeq:   0,
};

/** 映射 UI agent id → 后端 agent id（mobile-sessions 期望短名）
 *  Phase UI-A8-5-P0：claude_code → claude，open_code → opencode，其他原样。
 *  这是唯一允许把 UI id 转成后端 runner 短名的地方。
 */
function mapAgentId (id) {
  if (!id) return 'claude';
  if (id === 'claude_code') return 'claude';
  if (id === 'open_code')   return 'opencode';
  if (id === 'claude' || id === 'codex' || id === 'qoder' || id === 'opencode') return id;
  return 'claude';
}

/** 后端短名 → UI 显示名 */
function agentIdForDisplay (backendId) {
  if (!backendId) return 'Agent';
  if (backendId === 'claude')   return 'Claude Code';
  if (backendId === 'codex')    return 'Codex';
  if (backendId === 'qoder')    return 'Qoder';
  if (backendId === 'opencode') return 'OpenCode';
  if (backendId === 'fanbox')   return 'FanBox';
  return String(backendId);
}

/** 后端短名 → 发送时使用的 UI id（用于显示在前端） */
function agentIdForBackend (uiId) {
  return mapAgentId(uiId);
}

/** 后端短名 → UI agent id */
function agentIdForUi (backendId) {
  if (backendId === 'claude' || backendId === 'claude_code') return 'claude_code';
  if (backendId === 'opencode' || backendId === 'open_code') return 'opencode';
  if (backendId === 'codex' || backendId === 'qoder') return backendId;
  return 'claude_code';
}

/** 把 send 失败归一成友好中文（绝不暴露 raw JSON / stdout / token / path） */
function friendlySendError (agentId, code) {
  const name = agentIdForDisplay(agentId);
  switch (code) {
    case 'session_not_found':
    case 'session_busy':
    case 'session_waiting_approval':
      return '当前 session 状态不允许发送，请稍后再试或新建对话。';
    case 'invalid_agent':
      return '当前 Agent 不被允许，请从下拉里选择 Claude Code / Codex / Qoder / OpenCode。';
    case 'missing_cwd':
    case 'path_not_allowed':
    case 'forbidden_path':
      return '当前路径不可访问，请从 Files 或 Project 页面重新选择一个工作区。';
    case 'no_workspace':
      return '请先选择一个工作区（Files 或 Project 页面），再和 Agent 对话。';
    case 'text_too_long':
    case 'message_too_long':
      return '消息过长，请缩短后再试。';
    case 'empty_text':
    case 'empty_message':
      return '消息为空，请输入内容后发送。';
    case 'runner_unavailable':
    case 'agent_not_allowed':
      return `当前电脑没有检测到 ${name}，请先在电脑端安装并加入 PATH 后再试，或切换 Agent。`;
    case 'timeout':
    case 'session_timeout':
      return `${name} 响应超时，请稍后再试。`;
    default:
      return `${name} 暂不可用，请确认电脑端已安装并登录，或切换到其他 Agent。`;
  }
}

/** 把 fetch 阶段抛出的 raw 错误（带 "405: {...}" / "401: ..."）转成友好中文 */
function friendlyFetchError (e) {
  const raw = (e && e.message) ? String(e.message) : String(e || '');
  if (/^401\b/.test(raw)) return '登录已失效，请在桌面端重新配对。';
  if (/^403\b/.test(raw)) return '当前路径或接口无访问权限，请切换到已授权的工作区。';
  if (/^404\b/.test(raw)) return '当前服务版本不支持该功能，请重启 FanBox 桌面端。';
  if (/^405\b/.test(raw)) return '移动端发送接口暂不可用，请重启 FanBox 桌面端或切换 Agent。';
  if (/^5\d\d\b/.test(raw)) return '桌面端服务暂时不可用，请稍后再试。';
  return '当前 Agent 暂不可用，请确认电脑端已安装并登录，或切换到其他 Agent。';
}

/* =========================================================
   Utilities
   ========================================================= */
function $ (id) { return document.getElementById(id); }
function el (tag, cls, inner) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (inner) e.innerHTML = inner;
  return e;
}
function qsa (sel) { return [...document.querySelectorAll(sel)]; }

async function api (path, opts = {}) {
  // Phase 0A：拒绝任何非 GET/POST 的 HTTP method
  const m = (opts.method || "GET").toUpperCase();
  if (m !== "GET" && m !== "POST") {
    throw new Error(`method ${m} not allowed`);
  }
  const r = await fetch(path, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${S.token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (r.status === 401) {
    clearToken();
    showPair("登录已失效，请重新配对");
    return null;
  }
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`${r.status}: ${err}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

function clearToken () {
  S.token = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(DEVICE_KEY);
}

function fmtSize (bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function timeAgo (ms) {
  if (!ms) return "—";
  const d = Date.now() - ms;
  if (d < 60000) return "刚刚";
  if (d < 3600000) return `${Math.floor(d / 60000)} 分钟前`;
  if (d < 86400000) return `${Math.floor(d / 3600000)} 小时前`;
  return `${Math.floor(d / 86400000)} 天前`;
}

function truncate (s, n = 40) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function htmlEscape (s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 自动扩展 textarea 高度 */
function autoResize (ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
}

/** 根据扩展名获取文件类型 */
function getFileType (name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["pdf"].includes(ext)) return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (["md", "markdown"].includes(ext)) return "md";
  if (["js", "ts", "json", "py", "rs", "go", "java", "c", "cpp", "h", "hpp", "sh", "bash", "zsh", "ps1", "bat", "rb", "php", "swift", "kt", "scala", "sql", "yaml", "yml", "toml", "xml", "css", "scss", "less", "vue", "jsx", "tsx"].includes(ext)) return "code";
  if (["html", "htm", "svelte"].includes(ext)) return "html";
  if (["txt", "log", "env", "gitignore", "dockerignore", "editorconfig"].includes(ext)) return "txt";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "tiff"].includes(ext)) return "image";
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) return "zip";
  return "unknown";
}

/** 获取 Agent SVG */
function getAgentSvg (agentId) {
  const a = AGENTS.find(a => a.id === agentId);
  return a ? a.svg : AGENTS[0].svg;
}

/** 获取当前 Agent */
function getCurrentAgent () {
  return AGENTS.find(a => a.id === S.currentAgent) || AGENTS[0];
}

/* =========================================================
   Init
   ========================================================= */
function init () {
  // restore token
  S.token = localStorage.getItem(TOKEN_KEY);
  S.deviceName = localStorage.getItem(DEVICE_KEY) || "";
  S.currentAgent = localStorage.getItem(AGENT_KEY) || "claude_code";
  S.cwd = localStorage.getItem(CWD_KEY) || null;
  S.sessionId = localStorage.getItem(SESSION_KEY) || null;

  // wire events
  wirePairing();
  wireSidebar();
  wireHome();
  wireAgentDropdown();
  wireFiles();
  wireSkills();
  // Phase UI-A8-4: 技能库 refresh 按钮
  const skillsRefresh = $("skills-refresh");
  if (skillsRefresh) skillsRefresh.addEventListener("click", loadSkills);
  const projectRefresh = $("project-refresh");
  if (projectRefresh) projectRefresh.addEventListener("click", loadAllProjects);
  wireProject();
  wireTopbar();

  // inject nav icons into sidebar
  qsa(".sidebar-item-icon[data-i]").forEach(iconEl => {
    const key = iconEl.getAttribute("data-i");
    if (NAV_ICONS[key]) iconEl.innerHTML = NAV_ICONS[key];
  });

  // decide which screen to show
  if (S.token) {
    restoreToken();
  } else {
    showPair();
  }
}

function wireTopbar () {
  const refresh = $("app-refresh");
  if (refresh) refresh.addEventListener("click", () => {
    if (S.currentTab === "files") loadFiles();
    else if (S.currentTab === "skills") loadSkills();
    else if (S.currentTab === "project") loadAllProjects();
    else if (S.currentTab === "sessions") loadAllSessions();  // legacy alias
  });
}

/* =========================================================
   Pairing
   ========================================================= */
function wirePairing () {
  $("pair-btn").addEventListener("click", doPair);
  $("pair-code").addEventListener("keydown", e => {
    if (e.key === "Enter") doPair();
  });
  if (S.deviceName) $("pair-device").value = S.deviceName;
}

async function restoreToken () {
  try {
    const data = await api("/api/mobile/info");
    if (!data) { return; }
    localStorage.setItem(DEVICE_KEY, data.deviceName || "");
    S.deviceName = data.deviceName || "";
    showApp();
  } catch (e) {
    showPair();
  }
}

async function doPair () {
  const device = $("pair-device").value.trim();
  const code    = $("pair-code").value.trim();
  const btn     = $("pair-btn");
  const msg     = $("pair-msg");

  if (!device) { msg.className = "msg msg-err"; msg.textContent = "请输入设备名"; return; }
  if (!code || code.length !== 6) { msg.className = "msg msg-err"; msg.textContent = "请输入 6 位配对码"; return; }

  btn.disabled = true;
  btn.textContent = "配对中…";
  msg.className = "msg";
  msg.textContent = "";

  try {
    const data = await api("/api/mobile/pair/confirm", {
      method: "POST",
      body: JSON.stringify({ deviceName: device, pairCode: code }),
    });
    if (!data) { throw new Error("No response"); }
    S.token = data.token;
    S.deviceName = device;
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(DEVICE_KEY, device);
    showApp();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "配对";
    msg.className = "msg msg-err";
    msg.textContent = "配对失败，请检查配对码是否正确";
  }
}

function showPair (notice) {
  $("pair-screen").hidden = false;
  $("app").hidden = true;
  // clear any stale token
  S.token = null;
  // show 401 / re-pair notice
  const noticeEl = $("pair-notice");
  if (noticeEl) {
    if (notice) {
      noticeEl.hidden = false;
      noticeEl.textContent = notice;
      noticeEl.className = "pair-notice pair-notice-warn";
    } else {
      noticeEl.hidden = true;
      noticeEl.textContent = "";
    }
  }
  // try to fetch LAN URL from public info endpoint
  fetch("/api/mobile/info").then(r => r.ok ? r.json() : null).then(d => {
    const lanEl = $("pair-lan");
    const urlEl = $("pair-lan-url");
    if (d && d.server && d.server.primaryLanUrl && lanEl && urlEl) {
      urlEl.textContent = d.server.primaryLanUrl;
      lanEl.hidden = false;
    } else if (lanEl) {
      lanEl.hidden = true;
    }
  }).catch(() => {
    const lanEl = $("pair-lan");
    if (lanEl) lanEl.hidden = true;
  });
}

/* =========================================================
   App Shell
   ========================================================= */
function showApp () {
  $("pair-screen").hidden = true;
  $("app").hidden = false;

  buildAgentDropdownMenu();
  updateAgentDropdownDisplay();
  updateTopbarCwd();
  renderTaskChips();
  showTab("home");
  loadRecentSessions();

  // set current agent label
  const label = getCurrentAgent().label;
  if ($("home-skill-button-label")) $("home-skill-button-label").textContent = "Skill";
}

/* =========================================================
   Tab Navigation
   ========================================================= */
function showTab (tab) {
  S.currentTab = tab;

  // hide all views
  qsa(".view").forEach(v => { v.hidden = true; v.classList.remove("is-active"); });

  // show target
  const view = $(`view-${tab}`) || document.querySelector(`[data-view="${tab}"]`);
  if (view) { view.hidden = false; view.classList.add("is-active"); }

  // update sidebar active
  qsa(".sidebar-item").forEach(btn => {
    btn.classList.toggle("is-active", btn.getAttribute("data-go") === tab);
  });

  // close sidebar on mobile after nav
  if (window.innerWidth < 1024) closeSidebar();

  // lazy load
  if (tab === "files") loadFiles();
  if (tab === "skills") loadSkills();
  if (tab === "sessions") loadAllSessions();

  // home chat: scroll to bottom if messages exist
  if (tab === "home" && S.messages.length > 0) {
    scrollMessages();
  }
}

/* =========================================================
   Sidebar
   ========================================================= */
function wireSidebar () {
  $("app-menu").addEventListener("click", toggleSidebar);
  $("sidebar-close").addEventListener("click", closeSidebar);
  $("sidebar-scrim").addEventListener("click", closeSidebar);
  $("sidebar-new-chat").addEventListener("click", newChat);

  qsa(".sidebar-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-go");
      if (tab) showTab(tab);
    });
  });
}

function toggleSidebar () { S.sidebarOpen ? closeSidebar() : openSidebar(); }
function openSidebar () {
  S.sidebarOpen = true;
  $("app-sidebar").classList.add("is-open");
  $("sidebar-scrim").classList.add("is-open");
}
function closeSidebar () {
  S.sidebarOpen = false;
  $("app-sidebar").classList.remove("is-open");
  $("sidebar-scrim").classList.remove("is-open");
}

/* =========================================================
   Agent Dropdown
   ========================================================= */
function wireAgentDropdown () {
  $("agent-dropdown-trigger").addEventListener("click", toggleAgentMenu);

  // close on outside click
  document.addEventListener("click", e => {
    if (!$("agent-dropdown").contains(e.target)) {
      closeAgentMenu();
    }
  });
}

function buildAgentDropdownMenu () {
  const menu = $("agent-dropdown-menu");
  menu.innerHTML = "";
  AGENTS.forEach(agent => {
    const item = el("button", "agent-dropdown-item" + (agent.id === S.currentAgent ? " is-active" : ""));
    item.setAttribute("role", "menuitem");
    item.innerHTML =
      `<span class="agent-dropdown-item-icon">${agent.svg}</span>` +
      `<span class="agent-dropdown-item-label">${agent.label}</span>` +
      (agent.id === S.currentAgent ? `<svg class="agent-dropdown-item-check" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 6 8 14 4 10"/></svg>` : "");
    item.addEventListener("click", () => switchAgent(agent.id));
    menu.appendChild(item);
  });
}

function toggleAgentMenu () {
  const menu = $("agent-dropdown-menu");
  const trigger = $("agent-dropdown-trigger");
  const expanded = trigger.getAttribute("aria-expanded") === "true";
  if (expanded) {
    closeAgentMenu();
  } else {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  }
}

function closeAgentMenu () {
  $("agent-dropdown-menu").hidden = true;
  $("agent-dropdown-trigger").setAttribute("aria-expanded", "false");
}

function switchAgent (id) {
  if (id !== S.currentAgent) {
    // Phase UI-A8-6: abort current stream
    if (S._streamAbort) {
      try { S._streamAbort.abort(); } catch (_) {}
      S._streamAbort = null;
    }
    S.messages = [];
    S.sessionId = "";
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    exitChatState();
    renderMessages();
    const input = $("home-input");
    if (input) {
      input.value = "";
      autoResize(input);
    }
  }
  S.currentAgent = id;
  localStorage.setItem(AGENT_KEY, id);
  closeAgentMenu();
  updateAgentDropdownDisplay();
  buildAgentDropdownMenu();
  // if on home chat, update agent avatar
  updateHomeAgentAvatar();
}

function updateAgentDropdownDisplay () {
  const agent = getCurrentAgent();
  $("agent-dropdown-label").textContent = agent.label;
  $("agent-dropdown-icon").innerHTML = agent.svg;
}

function updateHomeAgentAvatar () {
  const agent = getCurrentAgent();
  qsa(".chat-avatar.agent").forEach(av => { av.innerHTML = agent.svg; });
}

/* =========================================================
   Topbar
   ========================================================= */
function updateTopbarCwd () {
  $("topbar-cwd").textContent = S.cwd ? truncate(S.cwd, 20) : "—";
  $("topbar-cwd").title = S.cwd || "";
  // Phase UI-A8-4: 同步更新 Home 当前工作区显示
  updateWorkspaceDisplay();
}

/* =========================================================
   Phase UI-A8-4 · Home current workspace display
   ========================================================= */
function updateWorkspaceDisplay () {
  const cwd = S.cwd || "";
  const cwdLabel = S.cwdLabel || "";
  const hasWorkspace = !!cwd;

  // Derive display name: cwdLabel > basename(cwd) > "未选择工作区"
  let displayName;
  if (cwdLabel) {
    displayName = cwdLabel;
  } else if (cwd) {
    displayName = cwd.split(/[/\\]/).filter(Boolean).pop() || cwd;
  } else {
    displayName = "未选择工作区";
  }

  // Short cwd for display
  const shortCwd = cwd ? (cwd.length > 50 ? "…" + cwd.slice(-50) : cwd) : "";

  // Hero workspace button
  const heroBtn = $("home-workspace");
  const heroName = $("home-workspace-name");
  const heroCwd = $("home-workspace-cwd");
  if (heroName) heroName.textContent = displayName;
  if (heroCwd) {
    heroCwd.textContent = shortCwd;
    heroCwd.title = cwd;
  }
  if (heroBtn) {
    heroBtn.classList.toggle("is-empty", !hasWorkspace);
    heroBtn.title = cwd ? "打开 Project: " + displayName : "打开 Project";
  }

  // Chat-bar workspace button
  const barBtn = $("home-workspace-bar-btn");
  const barName = $("home-workspace-bar-name");
  if (barName) barName.textContent = displayName;
  if (barBtn) {
    barBtn.classList.toggle("is-empty", !hasWorkspace);
    barBtn.title = cwd ? "打开 Project: " + displayName : "打开 Project";
  }
}

/** Phase UI-A8-4 · 点击当前工作区 → 进入 Project 页面 */
function goToProjectFromWorkspace () {
  closeSidebar();
  showTab("project");
  // 触发一次刷新
  if (typeof loadAllProjects === "function") loadAllProjects();
}

/* =========================================================
   Home View
   ========================================================= */
function wireHome () {
  // Phase UI-A8-1: DOM 中只有一个 textarea (#home-input)
  const input  = $("home-input");
  const sendBtn = $("home-send");

  function updateSend () {
    sendBtn.disabled = !input.value.trim() || S.running;
  }

  input.addEventListener("input", () => {
    autoResize(input);
    updateSend();
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input.value.trim() || S.running) return;
      doSend(input.value.trim());
      input.value = "";
      autoResize(input);
      updateSend();
    }
  });

  sendBtn.addEventListener("click", () => {
    const v = input.value.trim();
    if (!v || S.running) return;
    doSend(v);
    input.value = "";
    autoResize(input);
    updateSend();
  });

  // skill button
  $("home-skill-button").addEventListener("click", openSkillPicker);

  // Phase UI-A8-4: 点击当前工作区 → 打开 Project
  const wsBtn = $("home-workspace");
  if (wsBtn) wsBtn.addEventListener("click", goToProjectFromWorkspace);
  const wsBarBtn = $("home-workspace-bar-btn");
  if (wsBarBtn) wsBarBtn.addEventListener("click", goToProjectFromWorkspace);
}

function renderTaskChips () {
  const container = $("home-task-chips");
  container.innerHTML = "";
  TASK_CHIPS.forEach(chip => {
    const btn = el("button", "home-chip");
    const icon = CHIP_ICONS[chip.icon] || CHIP_ICONS.file;
    btn.innerHTML = `${icon}<span>${chip.label}</span>`;
    btn.addEventListener("click", () => {
      // Phase UI-A8-1: DOM 中只有一个 #home-input
      const input = $("home-input");
      input.value = chip.label;
      autoResize(input);
      $("home-send").disabled = false;
      input.focus();
    });
    container.appendChild(btn);
  });
}

/* =========================================================
   Send message — Phase UI-A8-6: Stream-first, fallback to /agent/send
   ========================================================= */
async function doSend (prompt) {
  // Switch to chat state
  enterChatState();

  // add user message
  S.messages.push({ role: "user", content: prompt });
  const selectedSkill = S.currentSkill || null;

  // Create assistant bubble with transient realtime transcript state.
  const pendingAssistant = {
    role: "assistant",
    status: "running",
    content: "",
    _streamId: "stream-" + (++S._streamSeq) + "-" + Date.now(),
    _streamStartedAt: Date.now(),
    _streamStatus: "正在处理…",
    _streamText: "",
    _streamCommands: [],
    _commandCount: 0,
    _finalText: ""
  };
  if (selectedSkill && selectedSkill.title) {
    pendingAssistant._streamSkill = selectedSkill.title;
  }
  S.messages.push(pendingAssistant);
  renderMessages();
  scrollMessages();

  // set running
  setRunning(true, prompt);
  $("home-status-pill").textContent = "思考中…";

  // Abort any previous stream
  if (S._streamAbort) {
    try { S._streamAbort.abort(); } catch (_) {}
    S._streamAbort = null;
  }

  // Try streaming first, fallback to /agent/send
  try {
    await doSendStream(prompt, pendingAssistant, selectedSkill);
  } catch (e) {
    // If stream fails, try fallback
    if (e && e.name === 'AbortError') {
      // User aborted — mark as stopped
      pendingAssistant.status = "stopped";
      pendingAssistant.content = pendingAssistant._streamText || "已停止";
      pendingAssistant._streamStatus = "已停止";
      markRunningCommands(pendingAssistant, "canceled");
      setRunning(false);
      $("home-status-pill").textContent = "已停止";
      $("home-status-pill").className = "home-status-pill is-failed";
      updateStreamTranscriptDom(pendingAssistant);
      scrollMessages();
      return;
    }
    // Stream failed — try fallback via /agent/send
    try {
      await doSendFallback(prompt, pendingAssistant, selectedSkill);
    } catch (e2) {
      setRunning(false);
      const last = S.messages[S.messages.length - 1];
      if (last && last.role === "assistant" && last.status === "running") {
        last.status = "failed";
        last.content = friendlyFetchError(e2);
        last._streamStatus = "失败";
        markRunningCommands(last, "failed");
      }
      $("home-status-pill").textContent = "失败";
      $("home-status-pill").className = "home-status-pill is-failed";
      renderMessages();
      scrollMessages();
    }
  }
}

/** Phase UI-A8-6: Stream via POST /api/mobile/agent/stream (SSE) */
async function doSendStream (prompt, pendingAssistant, selectedSkill) {
  const agent = getCurrentAgent();
  const abortController = new AbortController();
  S._streamAbort = abortController;

  const payload = {
    agentId: mapAgentId(S.currentAgent),
    cwd: S.cwd || undefined,
    sessionId: S.sessionId || undefined,
    message: prompt,
    skillId: selectedSkill ? selectedSkill.id : undefined,
    skillName: selectedSkill ? selectedSkill.title : undefined,
    model: agent && agent.model,
    effort: agent && agent.effort
  };

  const res = await fetch('/api/mobile/agent/stream', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + S.token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: abortController.signal
  });

  // Handle non-200 responses
  if (res.status === 401) {
    clearToken();
    showPair();
    return;
  }
  if (res.status === 403) {
    throw new Error('403: forbidden_path');
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(res.status + ': ' + errText);
  }

  // Parse SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (abortController.signal.aborted) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';  // keep incomplete chunk

    for (const part of parts) {
      if (!part.trim()) continue;
      const event = parseSSEEvent(part);
      if (!event) continue;
      handleStreamEvent(event, pendingAssistant);
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    const event = parseSSEEvent(buffer);
    if (event) handleStreamEvent(event, pendingAssistant);
  }

  // If still running after stream ends, mark as done
  if (pendingAssistant.status === "running") {
    pendingAssistant.status = "done";
    pendingAssistant.content = pendingAssistant._finalText || pendingAssistant._streamText || pendingAssistant.content || "";
    pendingAssistant._streamStatus = "已完成";
    markRunningCommands(pendingAssistant, "success");
  }

  setRunning(false);
  const pill = $("home-status-pill");
  if (pill) {
    pill.textContent = "完成";
    pill.className = "home-status-pill is-ready";
  }
  updateStreamTranscriptDom(pendingAssistant);
  scrollMessages();
  S._streamAbort = null;
}

/** Parse a single SSE event block (event: xxx\ndata: xxx) */
function parseSSEEvent (block) {
  let eventType = 'message';
  let dataStr = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      dataStr = line.slice(6);
    } else if (line.startsWith('data:')) {
      dataStr = line.slice(5).trim();
    }
  }
  if (!dataStr) return null;
  try {
    return { type: eventType, data: JSON.parse(dataStr) };
  } catch (_) {
    return null;
  }
}

function ensureStreamState (msg) {
  if (!msg._streamId) msg._streamId = "stream-" + (++S._streamSeq) + "-" + Date.now();
  if (!msg._streamStartedAt) msg._streamStartedAt = Date.now();
  if (!Array.isArray(msg._streamCommands)) msg._streamCommands = [];
  if (typeof msg._streamText !== "string") msg._streamText = msg._streamDelta || msg.content || "";
  if (typeof msg._commandCount !== "number") msg._commandCount = msg._streamCommands.length;
  if (!msg._streamStatus) msg._streamStatus = msg.status === "running" ? "正在处理…" : streamStatusLabel(msg.status);
  return msg;
}

function streamStatusLabel (status) {
  if (status === "failed") return "失败";
  if (status === "stopped") return "已停止";
  if (status === "done") return "已完成";
  return "正在处理…";
}

function streamElapsedText (msg) {
  const started = Number(msg && msg._streamStartedAt) || Date.now();
  const sec = Math.max(0, Math.round((Date.now() - started) / 1000));
  return sec > 0 ? sec + "s" : "";
}

function findStreamCommand (msg, id) {
  ensureStreamState(msg);
  return msg._streamCommands.find((x) => x.id === id);
}

function upsertStreamCommand (msg, data, fallbackStatus) {
  ensureStreamState(msg);
  const id = String((data && data.id) || ("cmd-" + (msg._streamCommands.length + 1)));
  let command = findStreamCommand(msg, id);
  if (!command) {
    command = { id, label: id, status: "running" };
    msg._streamCommands.push(command);
  }
  command.label = String((data && (data.label || data.name)) || command.label || id).slice(0, 160);
  command.status = String((data && (data.status || data.state)) || fallbackStatus || command.status || "running");
  if (data && data.cwd) command.cwd = String(data.cwd).slice(0, 180);
  if (data && data.text) command.text = String(data.text).slice(0, 180);
  msg._commandCount = Math.max(Number(msg._commandCount) || 0, msg._streamCommands.length);
  return command;
}

function markRunningCommands (msg, status) {
  ensureStreamState(msg);
  msg._streamCommands.forEach((cmd) => {
    if (cmd.status === "running") cmd.status = status || "success";
  });
}

/** Handle a single stream event, update pendingAssistant in place */
function handleStreamEvent (event, pendingAssistant) {
  const d = event.data;
  ensureStreamState(pendingAssistant);
  switch (event.type) {
    case 'start':
      pendingAssistant._streamStatus = "正在处理…";
      if (d && d.startedAt) pendingAssistant._streamStartedAt = Number(d.startedAt) || pendingAssistant._streamStartedAt;
      updateStreamTranscriptDom(pendingAssistant);
      break;

    case 'meta':
      pendingAssistant._streamMeta = Object.assign({}, pendingAssistant._streamMeta || {}, d || {});
      if (d && (d.skillName || d.skillId)) pendingAssistant._streamSkill = d.skillName || d.skillId;
      updateStreamTranscriptDom(pendingAssistant);
      break;

    case 'session':
      // Update sessionId
      if (d && d.sessionId && d.sessionId !== S.sessionId) {
        S.sessionId = d.sessionId;
        try { localStorage.setItem(SESSION_KEY, d.sessionId); } catch (_) {}
      }
      break;

    case 'status':
      pendingAssistant._streamStatus = (d && (d.text || d.label || d.status)) ? String(d.text || d.label || d.status) : streamStatusLabel(pendingAssistant.status);
      updateStreamTranscriptDom(pendingAssistant);
      scrollMessages();
      break;

    case 'step':
      if (d && d.label) {
        upsertStreamCommand(pendingAssistant, { id: d.id || d.label, label: d.label, status: d.status || d.state || "running", text: d.text }, d.status || d.state);
      }
      updateStreamTranscriptDom(pendingAssistant);
      scrollMessages();
      break;

    case 'thought':
      if (d && d.text) {
        pendingAssistant._streamText = (pendingAssistant._streamText || "") + d.text + (/\s$/.test(d.text) ? "" : "\n\n");
        pendingAssistant.content = pendingAssistant._streamText;
        updateStreamTranscriptDom(pendingAssistant);
        scrollMessages();
      }
      break;

    case 'skill':
      if (d && d.skillId) {
        pendingAssistant._streamSkill = d.skillName || d.skillId;
        updateStreamTranscriptDom(pendingAssistant);
        scrollMessages();
      }
      break;

    case 'tool':
      if (d && d.id) {
        upsertStreamCommand(pendingAssistant, d, d.status || "running");
        updateStreamTranscriptDom(pendingAssistant);
        scrollMessages();
      }
      break;

    case 'command_start':
      upsertStreamCommand(pendingAssistant, d, "running");
      updateStreamTranscriptDom(pendingAssistant);
      scrollMessages();
      break;

    case 'command_update':
      upsertStreamCommand(pendingAssistant, d, d && d.status ? d.status : "running");
      updateStreamTranscriptDom(pendingAssistant);
      scrollMessages();
      break;

    case 'command_end':
      upsertStreamCommand(pendingAssistant, d, d && d.status ? d.status : "success");
      updateStreamTranscriptDom(pendingAssistant);
      scrollMessages();
      break;

    case 'command_count':
      pendingAssistant._commandCount = Math.max(0, Number(d && d.count) || pendingAssistant._streamCommands.length);
      updateStreamTranscriptDom(pendingAssistant);
      scrollMessages();
      break;

    case 'command_output':
      if (d && d.id) {
        upsertStreamCommand(pendingAssistant, d, d.status || "success");
        updateStreamTranscriptDom(pendingAssistant);
        scrollMessages();
      }
      break;

    case 'message_delta':
    case 'delta':
      if (d && d.text) {
        pendingAssistant._streamText = (pendingAssistant._streamText || '') + d.text;
        pendingAssistant._streamDelta = pendingAssistant._streamText;
        pendingAssistant.content = pendingAssistant._streamText;
        updateStreamTranscriptDom(pendingAssistant);
        scrollMessages();
      }
      break;

    case 'final':
      if (d && (d.text || d.content)) {
        pendingAssistant._finalText = String(d.text || d.content);
        pendingAssistant.content = pendingAssistant._finalText;
        updateStreamTranscriptDom(pendingAssistant);
        scrollMessages();
      }
      break;

    case 'done':
      if (d && d.message && d.message.content) {
        pendingAssistant._streamText = d.message.content;
        pendingAssistant._streamDelta = d.message.content;
        pendingAssistant._finalText = d.message.content;
        pendingAssistant.content = d.message.content;
      }
      pendingAssistant.status = "done";
      pendingAssistant._streamStatus = "已完成";
      markRunningCommands(pendingAssistant, "success");
      if (d && d.status === 'failed') {
        pendingAssistant.status = "failed";
        pendingAssistant._streamStatus = "失败";
      }
      loadRecentSessions();
      loadAllProjects();
      updateStreamTranscriptDom(pendingAssistant);
      scrollMessages();
      break;

    case 'error':
      pendingAssistant.status = "failed";
      const errMsg = (d && d.message) ? d.message :
                     (d && d.error) ? friendlySendError(mapAgentId(S.currentAgent), d.error) :
                     'Agent 暂不可用，请稍后再试。';
      pendingAssistant.content = errMsg;
      pendingAssistant._streamText = errMsg;
      pendingAssistant._streamStatus = "失败";
      markRunningCommands(pendingAssistant, "failed");
      updateStreamTranscriptDom(pendingAssistant);
      scrollMessages();
      break;

    default:
      break;
  }
}

/** Phase UI-A8-6: Fallback — POST /api/mobile/agent/send (non-streaming) */
async function doSendFallback (prompt, pendingAssistant, selectedSkill) {
  const agent = getCurrentAgent();
  const data = await api("/api/mobile/agent/send", {
    method: "POST",
    body: JSON.stringify({
      agentId: mapAgentId(S.currentAgent),
      cwd: S.cwd || undefined,
      sessionId: S.sessionId || undefined,
      message: prompt,
      skillId: selectedSkill ? selectedSkill.id : undefined,
      skillName: selectedSkill ? selectedSkill.title : undefined,
      model: agent && agent.model,
      effort: agent && agent.effort
    }),
  });

  setRunning(false);

  if (!data) return; // 401

  if (data.ok === false) {
    const friendly = (data.message && data.message.content)
      ? data.message.content
      : friendlySendError(data.agentId, data.error);
    pendingAssistant.status = "failed";
    pendingAssistant.content = friendly;
    pendingAssistant._streamText = friendly;
    pendingAssistant._streamStatus = "失败";
    markRunningCommands(pendingAssistant, "failed");
    $("home-status-pill").textContent = "失败";
    $("home-status-pill").className = "home-status-pill is-failed";
  } else {
    const text = (data.message && data.message.content) || data.reply || data.text || "";
    pendingAssistant.status = "done";
    pendingAssistant.content = text;
    pendingAssistant._streamText = text;
    pendingAssistant._streamDelta = text;
    pendingAssistant._finalText = text;
    pendingAssistant._streamStatus = "已完成";
    markRunningCommands(pendingAssistant, "success");
    if (data.sessionId && data.sessionId !== S.sessionId) {
      S.sessionId = data.sessionId;
      try { localStorage.setItem(SESSION_KEY, data.sessionId); } catch (_) {}
    }
    if (data.cwd && data.cwd !== S.cwd) {
      S.cwd = data.cwd;
      S.cwdLabel = (data.cwd || "").split(/[/\\]/).filter(Boolean).pop() || null;
      localStorage.setItem(CWD_KEY, S.cwd || "");
      updateTopbarCwd();
    }
    const status = data.status || "done";
    const pill = $("home-status-pill");
    if (pill) {
      pill.textContent = status === "done" ? "完成" : (status === "failed" ? "失败" : (status === "timeout" ? "超时" : status));
      pill.className = "home-status-pill " + (status === "done" ? "is-ready" : (status === "failed" ? "is-failed" : "is-running"));
    }
  }

  updateStreamTranscriptDom(pendingAssistant);
  scrollMessages();
}

function setRunning (running, prompt) {
  S.running = running;
  $("home-send").disabled = running;
  if (running) {
    $("home-status-pill").className = "home-status-pill is-running";
  } else {
    $("home-status-pill").className = "home-status-pill";
  }
}

function enterChatState () {
  // Phase UI-A8-1: 同一个 textarea 切到 chat 态（sticky 底部）
  const shell = $("home-shell");
  if (shell) shell.classList.add("is-chat");
  $("home-hero").hidden = true;
  $("home-task-chips").hidden = true;
  // Phase UI-A8-4: 显示 chat 态顶部工作区条带
  const bar = $("home-workspace-bar");
  if (bar) bar.hidden = false;
  updateWorkspaceDisplay();
}

function exitChatState () {
  // Phase UI-A8-1: 退到 hero 态
  const shell = $("home-shell");
  if (shell) shell.classList.remove("is-chat");
  $("home-hero").hidden = false;
  $("home-task-chips").hidden = false;
  // Phase UI-A8-4: 隐藏 chat 态顶部工作区条带
  const bar = $("home-workspace-bar");
  if (bar) bar.hidden = true;
  updateWorkspaceDisplay();
}

/* noop - phase UI-A7 removed approval polling; kept as noop for backward compat */
function startApprovalPolling () { /* noop */ }
function stopApprovalPolling  () { /* noop */ }

/* =========================================================
   Render Messages
   ========================================================= */
function renderMessages () {
  const container = $("home-messages");
  if (!container) return;
  container.innerHTML = "";

  if (S.messages.length === 0) {
    container.innerHTML = `<div class="empty"><div class="empty-strong">可以开始了</div>输入你的问题或指令</div>`;
    return;
  }

  S.messages.forEach(msg => {
    const row = el("div", "chat-row" + (msg.role === "user" ? " chat-row-user" : " chat-row-agent"));
    const avatar = el("span", "chat-avatar" + (msg.role === "user" ? " user" : " agent"));
    avatar.innerHTML = msg.role === "user"
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
      : getAgentSvg(S.currentAgent);

    const bubble = el("div", "chat-bubble" +
      (msg.role === "user" ? " chat-bubble-user" : msg.role === "system" ? " chat-bubble-system" : " chat-bubble-agent"));
    if (msg.status === "running") bubble.classList.add("chat-bubble-running");

    if (msg.role !== "user") {
      bubble.appendChild(renderStreamTranscript(msg));
    } else {
      const contentEl = el("div", "chat-user-text");
      contentEl.innerHTML = escapeHtmlForDisplay(msg.content || "");
      bubble.appendChild(contentEl);
    }

    row.appendChild(avatar);
    row.appendChild(bubble);
    container.appendChild(row);
  });
}

function streamCommandStatusText (status) {
  if (status === "failed") return "失败";
  if (status === "canceled" || status === "cancelled") return "已停止";
  if (status === "success" || status === "done") return "成功";
  return "进行中";
}

function streamCommandStatusClass (status) {
  if (status === "failed") return "failed";
  if (status === "canceled" || status === "cancelled") return "canceled";
  if (status === "success" || status === "done") return "success";
  return "running";
}

function streamDisplayText (msg) {
  ensureStreamState(msg);
  if (msg.status === "running") return msg._streamText || msg.content || "";
  return msg.content || msg._finalText || msg._streamText || "";
}

function renderStreamCommandsHtml (msg) {
  ensureStreamState(msg);
  return msg._streamCommands.map((cmd) => {
    const status = streamCommandStatusClass(cmd.status);
    return '<div class="stream-command is-' + status + '" data-command-id="' + htmlEscape(cmd.id || '') + '">' +
      '<div class="stream-command-title">' + htmlEscape(cmd.label || cmd.id || '运行命令') + '</div>' +
      '<div class="stream-command-meta">' + streamCommandStatusText(cmd.status) +
        (cmd.cwd ? ' · ' + htmlEscape(cmd.cwd) : '') +
        (cmd.text ? ' · ' + htmlEscape(cmd.text) : '') +
      '</div>' +
    '</div>';
  }).join("");
}

function renderStreamTranscript (msg) {
  ensureStreamState(msg);
  const box = el("div", "stream-transcript" + (msg.status === "running" ? " is-streaming" : ""));
  box.setAttribute("data-stream-id", msg._streamId);

  const head = el("div", "stream-head");
  const status = el("span", "stream-status");
  status.textContent = msg.status === "running" ? (msg._streamStatus || "正在处理…") : (msg.status === "stopped" ? "已停止" : "已处理");
  const elapsed = el("span", "stream-elapsed");
  elapsed.textContent = streamElapsedText(msg);
  head.appendChild(status);
  head.appendChild(elapsed);
  box.appendChild(head);

  if (msg._streamSkill) {
    const skill = el("div", "stream-skill-inline");
    skill.textContent = "使用 skill：" + msg._streamSkill;
    box.appendChild(skill);
  }

  const body = el("div", "stream-body");
  const prose = el("div", "stream-prose");
  const text = streamDisplayText(msg);
  prose.innerHTML = msg.status === "running"
    ? escapeHtmlForDisplay(text || "正在处理…") + '<span class="stream-cursor">▌</span>'
    : renderMarkdownSafe(text);
  body.appendChild(prose);

  const count = Number(msg._commandCount) || (msg._streamCommands ? msg._streamCommands.length : 0);
  const summary = el("div", "stream-command-summary");
  summary.textContent = count > 0 ? "已运行 " + count + " 条命令" : "";
  summary.hidden = count <= 0;
  body.appendChild(summary);

  const commands = el("div", "stream-commands");
  commands.innerHTML = renderStreamCommandsHtml(msg);
  body.appendChild(commands);
  box.appendChild(body);
  return box;
}

function updateStreamTranscriptDom (msg) {
  ensureStreamState(msg);
  const root = document.querySelector('[data-stream-id="' + msg._streamId + '"]');
  if (!root) {
    renderMessages();
    return;
  }
  root.classList.toggle("is-streaming", msg.status === "running");
  const status = root.querySelector(".stream-status");
  if (status) status.textContent = msg.status === "running" ? (msg._streamStatus || "正在处理…") : (msg.status === "stopped" ? "已停止" : "已处理");
  const elapsed = root.querySelector(".stream-elapsed");
  if (elapsed) elapsed.textContent = streamElapsedText(msg);

  let skill = root.querySelector(".stream-skill-inline");
  if (msg._streamSkill) {
    if (!skill) {
      skill = el("div", "stream-skill-inline");
      const body = root.querySelector(".stream-body");
      root.insertBefore(skill, body || null);
    }
    skill.textContent = "使用 skill：" + msg._streamSkill;
  } else if (skill) {
    skill.remove();
  }

  const prose = root.querySelector(".stream-prose");
  const text = streamDisplayText(msg);
  if (prose) {
    prose.innerHTML = msg.status === "running"
      ? escapeHtmlForDisplay(text || "正在处理…") + '<span class="stream-cursor">▌</span>'
      : renderMarkdownSafe(text);
  }

  const count = Number(msg._commandCount) || (msg._streamCommands ? msg._streamCommands.length : 0);
  const summary = root.querySelector(".stream-command-summary");
  if (summary) {
    summary.textContent = count > 0 ? "已运行 " + count + " 条命令" : "";
    summary.hidden = count <= 0;
  }
  const commands = root.querySelector(".stream-commands");
  if (commands) commands.innerHTML = renderStreamCommandsHtml(msg);
}

function renderAgentTrace (trace) {
  const box = el("div", "agent-trace");
  (trace || []).slice(0, 8).forEach(item => {
    const row = el("div", "tool-call tool-call-" + (item.state || "pending"));
    row.innerHTML = `<span class="tool-call-dot"></span><span>${htmlEscape(item.label || "调用工具")}</span>`;
    box.appendChild(row);
  });
  return box;
}

/** Phase UI-A8-6: Render stream steps with proper CSS classes */
function renderStreamSteps (trace) {
  const box = el("div", "stream-steps");
  (trace || []).slice(0, 10).forEach(item => {
    const state = item.state || "pending";
    const row = el("div", "stream-step is-" + state);
    let icon = '';
    if (state === 'done') icon = '<span class="stream-step-icon">&#10003;</span>';
    else if (state === 'running') icon = '<span class="stream-step-icon stream-step-spinner"></span>';
    else if (state === 'failed') icon = '<span class="stream-step-icon is-failed">&#10007;</span>';
    else icon = '<span class="stream-step-icon"></span>';
    let labelHtml = htmlEscape(item.label || "步骤");
    if (item.text) labelHtml += '<span class="stream-step-text">' + htmlEscape(item.text) + '</span>';
    row.innerHTML = icon + '<span class="stream-step-label">' + labelHtml + '</span>';
    box.appendChild(row);
  });
  return box;
}

function escapeHtmlForDisplay (text) {
  if (!text) return "";
  return htmlEscape(text)
    .replace(/\n/g, "<br>");
}

function renderInlineMarkdownSafe (text) {
  return htmlEscape(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderMarkdownTableSafe (lines) {
  if (lines.length < 2 || !/^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[1])) return null;
  const split = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim());
  const head = split(lines[0]);
  const rows = lines.slice(2).filter((line) => /\|/.test(line)).map(split);
  if (!head.length || !rows.length) return null;
  return "<table><thead><tr>" + head.map((c) => "<th>" + renderInlineMarkdownSafe(c) + "</th>").join("") +
    "</tr></thead><tbody>" + rows.map((row) => "<tr>" + head.map((_, i) => "<td>" + renderInlineMarkdownSafe(row[i] || "") + "</td>").join("") + "</tr>").join("") +
    "</tbody></table>";
}

function renderMarkdownSafe (text) {
  const src = String(text || "");
  const out = [];
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let inCode = false;
  let code = [];
  let list = [];

  function flushList () {
    if (!list.length) return;
    out.push("<ul>" + list.map((x) => "<li>" + renderInlineMarkdownSafe(x) + "</li>").join("") + "</ul>");
    list = [];
  }
  function flushCode () {
    if (!code.length) return;
    out.push("<pre><code>" + htmlEscape(code.join("\n")) + "</code></pre>");
    code = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length) {
      const tableLines = [];
      let j = i;
      while (j < lines.length && lines[j].includes("|")) {
        tableLines.push(lines[j]);
        j++;
      }
      const tableHtml = renderMarkdownTableSafe(tableLines);
      if (tableHtml) {
        flushList();
        out.push(tableHtml);
        i = j - 1;
        continue;
      }
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length + 2;
      out.push("<h" + level + ">" + renderInlineMarkdownSafe(heading[2]) + "</h" + level + ">");
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();
    if (!line.trim()) {
      out.push("");
    } else {
      out.push("<p>" + renderInlineMarkdownSafe(line) + "</p>");
    }
  }
  flushCode();
  flushList();
  return out.filter((x, idx, arr) => x || (arr[idx - 1] && arr[idx + 1])).join("");
}

function scrollMessages () {
  const el = $("home-messages");
  if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

/* =========================================================
   New Chat
   ========================================================= */
function newChat () {
  // Phase UI-A8-6: abort current stream
  if (S._streamAbort) {
    try { S._streamAbort.abort(); } catch (_) {}
    S._streamAbort = null;
  }
  S.messages = [];
  S.sessionId = null;
  S.currentSkill = null;
  exitChatState();
  renderMessages();
  $("home-input").value = "";
  autoResize($("home-input"));
  $("home-send").disabled = true;
  $("home-status-pill").textContent = "";
  $("home-status-pill").className = "home-status-pill";
  closeSidebar();
  showTab("home");
}

/* =========================================================
   Skill Picker
   ========================================================= */
function openSkillPicker () {
  showTab("skills");
  if (!S.skills || S.skills.length === 0) loadSkills();
}

/* =========================================================
   Files View · Phase UI-A8-2 (真实数据：roots 优先，items 渲染，Ask AI 联动)
   ========================================================= */
function wireFiles () {
  $("files-back").addEventListener("click", () => filesNavigateBack());
  $("files-refresh").addEventListener("click", () => loadFiles(S.cwd || undefined));
  $("files-open-agent").addEventListener("click", openAgentInCurrentFolder);
  $("files-q").addEventListener("input", debounce(filterFiles, 200));
  $("files-preview-close").addEventListener("click", closeFilesPreview);
  // dblclick on desktop (touchstart + click for mobile)
  $("files-list").addEventListener("dblclick", ev => {
    const row = ev.target.closest(".file-row");
    if (!row) return;
    const idx = Number(row.getAttribute("data-idx"));
    if (Number.isFinite(idx) && S.files[idx]) handleFileClick(S.files[idx]);
  });
}

/** 进入 Files 视图：
 *  - 没有 cwd → 拉 roots / drives / 常用目录
 *  - 有 cwd   → 拉 /api/mobile/files?path=cwd
 *  接受可选 path 形参（点击文件夹 / 根目录） */
async function loadFiles (path) {
  const titleEl = $("files-title");
  const listEl  = $("files-list");
  const cwdLabel = $("files-cwd-label");
  const openBtn = $("files-open-agent");
  if (!listEl) return;
  // 关闭 preview
  const pv = $("files-preview"); if (pv) pv.hidden = true;
  // 状态：skeleton
  titleEl.textContent = "Files";
  listEl.innerHTML = `<div class="skeleton" style="height:64px;margin-bottom:6px"></div><div class="skeleton" style="height:64px;margin-bottom:6px"></div><div class="skeleton" style="height:64px"></div>`;
  if (cwdLabel) cwdLabel.textContent = S.cwd || "未选择";
  if (openBtn) openBtn.disabled = !S.cwd;

  // 1) 没传 path 且没有 cwd → 拉 roots
  if (!path && !S.cwd) {
    return loadFilesRoots();
  }

  // 2) 拉取具体目录
  const target = path || S.cwd;
  try {
    const data = await api("/api/mobile/files?path=" + encodeURIComponent(target));
    if (!data) return;
    // 后端返回 { ok, path, items: [{name, path, isDir, kind, size, mtime}] }
    S.files = normalizeFiles(data.items || data.files || []);
    // 导航栈：仅当用户显式进入新目录时压栈
    if (path && path !== S.cwd) {
      S.fileHistory.push(S.cwd);
      S.cwd = path;
      S.cwdLabel = (path || "").split(/[/\\]/).filter(Boolean).pop() || null;
      localStorage.setItem(CWD_KEY, path);
      updateTopbarCwd();
    } else if (!S.cwd && target) {
      S.cwd = target;
      S.cwdLabel = (target || "").split(/[/\\]/).filter(Boolean).pop() || null;
      localStorage.setItem(CWD_KEY, target);
      updateTopbarCwd();
    }
    // UI
    const last = (S.cwd || target).split(/[/\\]/).filter(Boolean).pop() || "Files";
    titleEl.textContent = truncate(last, 24);
    if (cwdLabel) cwdLabel.textContent = S.cwd || "未选择";
    if (openBtn)  openBtn.disabled  = !S.cwd;
    renderFiles(S.files);
  } catch (e) {
    listEl.innerHTML = renderFilesError(e);
  }
}

/** 拉取并渲染 roots / drives / 常用目录（Phase UI-A8-2） */
async function loadFilesRoots () {
  const titleEl = $("files-title");
  const listEl  = $("files-list");
  const cwdLabel = $("files-cwd-label");
  const openBtn = $("files-open-agent");
  titleEl.textContent = "Files";
  if (cwdLabel) cwdLabel.textContent = "未选择";
  if (openBtn)  openBtn.disabled = true;
  listEl.innerHTML = `<div class="skeleton" style="height:64px;margin-bottom:6px"></div><div class="skeleton" style="height:64px;margin-bottom:6px"></div>`;
  try {
    const data = await api("/api/mobile/roots");
    if (!data) return;
    const raw = data.items || data.roots || data.drives || data.list || [];
    const items = raw.map(r => ({
      type: r.type || (r.drive ? "drive" : "folder"),
      name: r.name,
      path: r.path,
      isDir: true,
      kind: r.type === "this-pc" ? "this-pc" : (r.type === "drive" || r.drive ? "drive" : "folder"),
      size: 0,
      mtime: 0,
    }));
    S.files = items;
    renderFiles(items, { isRoots: true });
  } catch (e) {
    listEl.innerHTML = renderFilesError(e);
  }
}

/** 把后端 items 归一化为前端需要的字段：isDir / kind / size / mtime / name / path */
function normalizeFiles (arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(it => {
    const isDir = !!(it.isDir || it.isFolder || it.is_directory || it.kind === 'dir' || it.kind === 'drive' || it.kind === 'folder' || it.kind === 'this-pc');
    return {
      name: it.name || '',
      path: it.path || '',
      isDir,
      type: it.type || '',
      kind: isDir ? (it.kind || it.type || 'folder') : (it.kind || 'file'),
      size: Number.isFinite(it.size) ? it.size : 0,
      mtime: Number.isFinite(it.mtime) ? it.mtime : 0,
    };
  }).filter(it => it.name);
}

/** 渲染错误态（401/403/500/网络） */
function renderFilesError (err) {
  const msg = (err && err.message) ? String(err.message) : '加载失败';
  let hint = msg;
  let title = "加载失败";
  // 401 → 已被 api() 拦截 clearToken + showPair，此分支实际不会触发
  if (/403/.test(msg) || /path_not_allowed|forbidden_path/.test(msg)) {
    title = "无法访问";
    hint = "该文件或目录不在可访问范围内，出于安全考虑已被限制";
  } else if (/404|not_found/.test(msg)) {
    title = "路径不存在";
    hint = "该文件或目录可能已被移动或删除";
  } else if (/network|fetch|ECONNREFUSED/.test(msg)) {
    title = "网络错误";
    hint = "无法连接到电脑端，请检查局域网连接";
  }
  return `<div class="files-empty"><div class="files-empty-strong">${htmlEscape(title)}</div><div class="files-empty-hint">${htmlEscape(hint)}</div></div>`;
}

/** 渲染文件列表。
 *  opts.isRoots=true 时所有行都按 folder/drive 渲染 */
function renderFiles (files, opts = {}) {
  const listEl = $("files-list");
  listEl.innerHTML = "";
  if (!Array.isArray(files) || files.length === 0) {
    listEl.innerHTML = `<div class="files-empty"><div class="files-empty-strong">空文件夹</div>这个目录没有文件</div>`;
    return;
  }
  // 排序：dir 优先 + 名称
  const sorted = files.slice().sort((a, b) => {
    const aDir = !!(a.isDir || a.kind === 'dir' || a.kind === 'drive' || a.kind === 'folder' || a.kind === 'this-pc');
    const bDir = !!(b.isDir || b.kind === 'dir' || b.kind === 'drive' || b.kind === 'folder' || b.kind === 'this-pc');
    if (aDir !== bDir) return aDir ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  sorted.forEach((item, idx) => {
    const isFolder = !!(item.isDir || item.kind === 'dir' || item.kind === 'drive' || item.kind === 'folder' || item.kind === 'this-pc' || opts.isRoots);
    const type = item.kind === 'drive' ? 'drive' : (isFolder ? 'folder' : fileTypeFor(item));
    const icon = FILE_ICONS[type] || FILE_ICONS.unknown;
    const meta = isFolder
      ? (item.kind === 'drive' ? '磁盘' : (item.kind === 'this-pc' ? '电脑上的磁盘和常用目录' : '文件夹'))
      : (item.size > 0 ? fmtSize(item.size) : "文件") + (item.mtime ? " · " + timeAgo(item.mtime) : "");

    const row = el("button", "file-row" + (isFolder ? " is-folder" : " is-file"));
    row.setAttribute("role", "listitem");
    row.setAttribute("data-idx", String(idx));
    row.innerHTML =
      `<span class="file-icon file-icon-${type}">${icon}</span>` +
      `<span class="file-body">` +
        `<span class="file-name">${htmlEscape(item.name)}</span>` +
        `<span class="file-meta">${htmlEscape(meta)}</span>` +
      `</span>` +
      `<span class="file-extra" aria-hidden="true">` +
        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>` +
      `</span>`;

    row.addEventListener("click", () => handleFileClick(item, opts));
    listEl.appendChild(row);
  });
}

/** 点击/双击：folder 进去，file 预览 */
function handleFileClick (item, opts = {}) {
  if (item && (item.kind === 'this-pc' || item.path === '__fanbox_this_pc__')) {
    S.cwd = null;
    S.cwdLabel = null;
    S.fileHistory = [];
    try { localStorage.setItem(CWD_KEY, ""); } catch (_) {}
    updateTopbarCwd();
    loadFilesRoots();
    return;
  }
  const isFolder = !!(item.isDir || item.kind === 'dir' || item.kind === 'drive' || item.kind === 'folder' || opts.isRoots);
  if (isFolder) {
    const next = item.path || (S.cwd ? S.cwd + "/" + item.name : item.name);
    loadFiles(next);
  } else {
    openFilePreview(item);
  }
}

/** 搜索：
 *  - cwd 为空时：提示"先选择一个文件夹"
 *  - cwd 非空时：调用 /api/mobile/search?q=...&path=... （Phase UI-A8-2） */
async function filterFiles () {
  const qEl = $("files-q");
  const q = (qEl.value || "").trim();
  if (!S.cwd) {
    if (!q) { loadFilesRoots(); return; }
    $("files-list").innerHTML = `<div class="files-empty"><div class="files-empty-strong">先选择一个文件夹</div>请先在列表中点击进入一个文件夹，再搜索</div>`;
    return;
  }
  if (!q) { renderFiles(S.files); return; }
  // 本地快捷过滤（≤ 2 字符）
  if (q.length <= 2) {
    const filtered = S.files.filter(f => (f.name || "").toLowerCase().includes(q.toLowerCase()));
    if (filtered.length === 0) {
      $("files-list").innerHTML = `<div class="files-empty"><div class="files-empty-strong">没有匹配的文件</div>试试别的关键词</div>`;
    } else {
      renderFiles(filtered);
    }
    return;
  }
  // 3 字符以上 → 调用 server-side search（递归）
  const listEl = $("files-list");
  listEl.innerHTML = `<div class="skeleton" style="height:48px;margin-bottom:6px"></div><div class="skeleton" style="height:48px;margin-bottom:6px"></div>`;
  try {
    const data = await api("/api/mobile/search?q=" + encodeURIComponent(q) + "&path=" + encodeURIComponent(S.cwd));
    if (!data) return;
    const items = normalizeFiles(data.items || data.files || []);
    if (items.length === 0) {
      listEl.innerHTML = `<div class="files-empty"><div class="files-empty-strong">没有匹配的文件</div>试试别的关键词</div>`;
    } else {
      S.files = items;
      renderFiles(items);
    }
  } catch (e) {
    listEl.innerHTML = renderFilesError(e);
  }
}

/** 返回上级（面包屑 / 顶部返回） */
function filesNavigateBack () {
  // 优先用 history 栈
  if (S.fileHistory && S.fileHistory.length > 0) {
    const prev = S.fileHistory.pop();
    loadFiles(prev);
    return;
  }
  if (!S.cwd) { loadFilesRoots(); return; }
  // 上溯父目录（兼容 Windows + POSIX）
  const hasBackslash = S.cwd.indexOf("\\") !== -1;
  const sep = hasBackslash ? "\\" : "/";
  const segs = S.cwd.split(/[/\\]/).filter(Boolean);
  const isWindowsUserHome = segs.length <= 3 && /^[A-Z]:$/i.test(segs[0] || '') && /^users$/i.test(segs[1] || '');
  if (isWindowsUserHome) {
    S.cwd = null;
    S.cwdLabel = null;
    localStorage.setItem(CWD_KEY, "");
    updateTopbarCwd();
    S.fileHistory = [];
    loadFilesRoots();
    return;
  }
  if (segs.length <= 1) {
    // 已经到根了：清 cwd，回 roots
    S.cwd = null;
    localStorage.setItem(CWD_KEY, "");
    updateTopbarCwd();
    S.fileHistory = [];
    loadFilesRoots();
    return;
  }
  segs.pop();
  let parent = segs.join(sep);
  // Windows: 形如 "C:" 的盘符应拼一个 "\"
  if (/^[A-Z]:$/.test(parent)) parent = parent + sep;
  S.fileHistory = [];
  loadFiles(parent);
}

/** 预览：调用 /api/mobile/file?path=... 拿 metadata + 文本 */
async function openFilePreview (item) {
  const type = fileTypeFor(item);
  $("files-preview-name").textContent = item.name;
  $("files-preview-sub").textContent = fmtSize(item.size || 0) + (item.mtime ? " · " + timeAgo(item.mtime) : "");
  $("files-preview").hidden = false;
  const body = $("files-preview-body");
  body.innerHTML = `<div class="preview-empty">加载中…</div>`;
  try {
    const data = await api("/api/mobile/file?path=" + encodeURIComponent(item.path));
    if (!data) { body.innerHTML = `<div class="preview-empty">读取失败</div>`; return; }
    if (data.previewTooLarge) {
      body.innerHTML = `<div class="preview-too-large"><strong>文件过大 (${fmtSize(data.size)})</strong>仅显示前 ${fmtSize(data.max)} 字符</div>` +
        `<div class="preview-empty">请在电脑端打开完整文件</div>`;
      return;
    }
    if (type === "image") {
      const img = data.thumbUrl
        ? `<img src="${htmlEscape(data.thumbUrl)}" alt="${htmlEscape(item.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=preview-empty>图片加载失败</div>'">`
        : `<div class="preview-empty">无缩略图</div>`;
      body.innerHTML = img;
    } else if (data.text && (type === "md" || type === "txt" || type === "code" || type === "html" || type === "unknown")) {
      const text = data.text;
      if (text.length > 50000) {
        body.innerHTML = `<div class="preview-too-large"><strong>文件过大 (${fmtSize(text.length)})</strong>仅显示前 50,000 字符</div><pre>${htmlEscape(text.slice(0, 50000))}</pre>`;
      } else {
        body.innerHTML = `<pre>${htmlEscape(text)}</pre>`;
      }
    } else if (data.kind === "pdf") {
      body.innerHTML = `<div class="preview-empty">PDF 暂不支持直接预览<br>${htmlEscape(data.name)} · ${fmtSize(data.size)}</div>`;
    } else {
      body.innerHTML = `<div class="preview-empty">暂不支持预览此文件类型<br>${htmlEscape(data.name)} · ${fmtSize(data.size || 0)}</div>`;
    }
  } catch (e) {
    body.innerHTML = `<div class="preview-empty">读取失败: ${htmlEscape(e.message || String(e))}</div>`;
  }
}

function closeFilesPreview () {
  $("files-preview").hidden = true;
}

/** Ask AI in this folder：更新 server 端 current.cwd + 切回 Home */
async function openAgentInCurrentFolder () {
  if (!S.cwd) return;
  // 调用 /api/mobile/context/cwd 写回 server preferences（不启动 agent）
  try {
    await api("/api/mobile/context/cwd", {
      method: "POST",
      body: JSON.stringify({ cwd: S.cwd })
    });
  } catch (e) {
    // 不阻塞 UI 切换；用户至少能在 Home 看到当前 cwd
  }
  localStorage.setItem(CWD_KEY, S.cwd);
  updateTopbarCwd();
  closeSidebar();
  showTab("home");
  // 切回 Home 后，给用户一个 toast 提示
  toast("已切换到当前文件夹：AI 现在会以这个目录作为工作区");
}

/** 简单 toast */
function toast (msg) {
  let t = $("app-toast");
  if (!t) {
    t = el("div", "app-toast");
    t.id = "app-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("is-visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("is-visible"), 2400);
}

/* =========================================================
   Phase UI-A8-4 · Skills Library
   - 真实技能库 (normalizeSkill / skillAgentScope / skillCategory / skillChineseDescription)
   - 顶部搜索 + Agent / Status / Type 三组 filter
   - 卡片显示 name / cnDescription / agentScope / category / source / toggle
   - toggle 调 POST /api/mobile/skills-state; 失败回滚
   - Use in chat 切回 Home 并填入 prompt (不发送)
   ========================================================= */

/** Skill category → 中文 label + icon key */
const SKILL_CATEGORIES = {
  Document:   { label: "文档",   icon: "document" },
  Code:       { label: "代码",   icon: "code" },
  Research:   { label: "研究",   icon: "research" },
  File:       { label: "文件",   icon: "file" },
  Agent:      { label: "智能体", icon: "agent" },
  Automation: { label: "自动化", icon: "automation" },
  Media:      { label: "媒体",   icon: "media" },
  Other:      { label: "其他",   icon: "other" },
};

/** Skill agent scope → 中文 label */
const SKILL_AGENT_LABELS = {
  "all":      "All agents",
  "claude":   "Claude Code",
  "codex":    "Codex",
  "qoder":    "Qoder",
  "opencode": "OpenCode",
  "fanbox":   "FanBox",
};

/** skill id/key → 中文简介（spec §5.2 表） */
const SKILL_CN_DESCRIPTIONS = {
  "ppt":                    "生成、编辑和整理演示文稿，适合制作汇报、路演和课程展示。",
  "docx":                   "生成和编辑 Word 文档，适合简历、报告、方案和正式材料。",
  "xlsx":                   "处理 Excel 表格、数据清洗、统计分析和结构化表格生成。",
  "pdf":                    "阅读、整理和分析 PDF 文件内容，提取关键信息。",
  "markdown":               "生成和整理 Markdown 文档，适合计划、笔记和项目文档。",
  "md":                     "生成和整理 Markdown 文档，适合计划、笔记和项目文档。",
  "code-review":            "检查代码结构、潜在风险、可维护性和实现逻辑。",
  "summary":                "总结文件、目录、会话或长文本内容，提炼重点。",
  "research":               "围绕一个主题进行资料整理、问题拆解和研究计划生成。",
  "file-manager":           "查看和理解当前文件夹内容，辅助在指定目录中工作。",
  "wechat":                 "辅助处理微信相关内容、会话整理和自动化连接规划。",
  "slides":                 "生成演示文稿大纲、页面结构和内容草稿。",
  "spreadsheet":            "处理表格、CSV、数据统计和格式化输出。",
  "document":               "生成、润色和整理正式文档。",
  "image":                  "分析图片内容或辅助生成图像相关提示。",
  "agent":                  "调用或协同指定智能体完成任务。",
  "terminal":               "理解命令行输出和开发环境状态，但不直接暴露裸 shell。",
  "git":                    "分析 Git 状态、提交记录、diff 和代码变更风险。",
};

/** name/title 显示优化（spec §5.1） */
const SKILL_TITLE_MAP = {
  "ppt":      "PPT",
  "docx":     "Word Document",
  "xlsx":     "Excel Spreadsheet",
  "pdf":      "PDF",
  "markdown": "Markdown",
  "md":       "Markdown",
};

/** 标准化一个 skill（spec §五） */
function normalizeSkill (raw) {
  if (!raw || typeof raw !== "object") return null;
  const idRaw = (raw.id || raw.name || raw.skillId || "").toString();
  if (!idRaw) return null;
  const id = idRaw.toLowerCase();
  const name = id;
  const titleRaw = raw.title || raw.name || id;
  const title = SKILL_TITLE_MAP[id] || SKILL_TITLE_MAP[name] || titleRaw;
  const description = raw.description || raw.desc || "";
  const enabled = raw.enabled === true;
  const usageCount = (typeof raw.usageCount === "number") ? raw.usageCount : null;
  const lastUsedAt = raw.lastUsedAt || raw.lastUsed || null;
  const source = raw.source || (raw.agent ? raw.agent : "Built-in");
  const agentScope = skillAgentScope(raw);
  const category = skillCategory(raw);
  const cnDescription = skillChineseDescription(raw);

  return {
    id,
    name,
    title,
    description,
    cnDescription,
    agentScope,
    category,
    source: String(source),
    enabled,
    usageCount,
    lastUsedAt,
  };
}

/** 推断所属智能体 (spec §5.3) */
function skillAgentScope (raw) {
  if (!raw || typeof raw !== "object") return "fanbox";
  if (raw.agent && typeof raw.agent === "string") {
    const a = raw.agent.toLowerCase();
    if (a === "all" || a === "all-agents" || a === "all_agents") return "all";
    if (a === "claude" || a === "claude_code") return "claude";
    if (a === "codex")  return "codex";
    if (a === "qoder")  return "qoder";
    if (a === "opencode" || a === "open-code" || a === "open_code") return "opencode";
  }
  const blob = ((raw.id || "") + " " + (raw.name || "") + " " + (raw.path || "") + " " + (raw.source || "")).toLowerCase();
  if (/claude|claude_code/.test(blob))  return "claude";
  if (/\bcodex\b/.test(blob))           return "codex";
  if (/\bqoder\b/.test(blob))           return "qoder";
  if (/opencode|open.code|open_code/.test(blob)) return "opencode";
  // 通用类型 → All agents
  if (/\b(ppt|docx|xlsx|pdf|markdown|md|summary|spreadsheet|document|file|files|file-manager)\b/.test(blob)) return "all";
  return "fanbox";
}

/** 推断分类 (spec §5.4) */
function skillCategory (raw) {
  if (!raw || typeof raw !== "object") return "Other";
  if (raw.category && typeof raw.category === "string") {
    const c = raw.category;
    if (SKILL_CATEGORIES[c]) return c;
    const low = c.toLowerCase();
    if (low === "doc" || low === "document") return "Document";
    if (low === "code" || low === "coding")  return "Code";
    if (low === "research" || low === "search") return "Research";
    if (low === "file" || low === "files")    return "File";
    if (low === "agent")                      return "Agent";
    if (low === "automation" || low === "bridge" || low === "mobile") return "Automation";
    if (low === "media" || low === "image")   return "Media";
  }
  const blob = ((raw.id || "") + " " + (raw.name || "") + " " + (raw.description || "")).toLowerCase();
  if (/\b(ppt|docx|pdf|markdown|\bmd\b|xlsx|spreadsheet|slides|document)\b/.test(blob)) return "Document";
  if (/\b(code|code-review|\bgit\b|test|debug|tdd|prototype|review)\b/.test(blob))     return "Code";
  if (/\b(research|search|paper|academic|literature|investigation)\b/.test(blob))      return "Research";
  if (/\b(file|files|folder|path|fs)\b/.test(blob))                                    return "File";
  if (/\b(agent|claude|codex|qoder|opencode)\b/.test(blob))                            return "Agent";
  if (/\b(wechat|bridge|mobile|automation|workflow)\b/.test(blob))                     return "Automation";
  if (/\b(image|audio|video|media)\b/.test(blob))                                      return "Media";
  return "Other";
}

/** 中文简介 (spec §5.2) */
function skillChineseDescription (raw) {
  if (!raw) return "暂无简介";
  const id = (raw.id || raw.name || "").toString().toLowerCase();
  // 1) 内置中文映射
  if (SKILL_CN_DESCRIPTIONS[id]) return SKILL_CN_DESCRIPTIONS[id];
  // 2) 已有 SKILL_CN 映射 (向前兼容)
  if (SKILL_CN[id]) return SKILL_CN[id];
  // 3) 原始 description
  if (raw.description && raw.description.trim()) return raw.description.trim();
  return "暂无简介";
}

/** Inline SVG icons for category (spec §七) */
function skillCategoryIcon (cat) {
  const meta = SKILL_CATEGORIES[cat] || SKILL_CATEGORIES.Other;
  const map = {
    document:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    code:       '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    research:   '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    file:       '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
    agent:      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    automation: '<polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    media:      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    other:      '<circle cx="12" cy="12" r="9"/>',
  };
  const d = map[meta.icon] || map.other;
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

function wireSkills () {
  // search
  $("skills-q").addEventListener("input", debounce(filterSkills, 200));
  // agent filter
  qsa(".skills-filter-agent").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".skills-filter-agent").forEach(b => { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      filterSkills();
    });
  });
  // status filter
  qsa(".skills-filter-status").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".skills-filter-status").forEach(b => { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      filterSkills();
    });
  });
  // type filter
  qsa(".skills-filter-type").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".skills-filter-type").forEach(b => { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      filterSkills();
    });
  });
}

async function loadSkills () {
  const listEl = $("skills-list");
  listEl.innerHTML = `<div class="skeleton" style="height:84px;margin-bottom:8px"></div><div class="skeleton" style="height:84px;margin-bottom:8px"></div>`;

  // 1) 拉 skills (后端返回 { ok:true, items: [...] })
  let rawSkills = [];
  let scannedRoots = [];
  try {
    const data = await api("/api/mobile/skills");
    if (Array.isArray(data)) rawSkills = data;
    else if (data && Array.isArray(data.items)) rawSkills = data.items;
    else if (data && Array.isArray(data.skills)) rawSkills = data.skills;
    else if (data && Array.isArray(data.list)) rawSkills = data.list;
    if (data && Array.isArray(data.scannedRoots)) scannedRoots = data.scannedRoots;
  } catch (e) {
    listEl.innerHTML = `<div class="skills-empty"><div class="skills-empty-strong">加载失败</div>${htmlEscape(e.message || String(e))}</div>`;
    return;
  }
  S.skillsScannedRoots = scannedRoots;

  // 2) 拉 skills-state (mobile 端 enabled/disabled)
  let skillState = {};
  try {
    const st = await api("/api/mobile/skills-state");
    if (st && typeof st === "object") {
      if (st.skills && typeof st.skills === "object") skillState = st.skills;
      else if (st.state && typeof st.state === "object") skillState = st.state;
      else skillState = st;
    }
  } catch (e) {
    // 失败时使用空 state (默认 disabled 走 skill.enabled)
  }
  S.skillState = skillState;

  // 3) normalize + 合并 state
  const normalized = rawSkills
    .map(s => {
      const n = normalizeSkill(s);
      if (!n) return null;
      // 用 mobile state 覆盖 enabled
      if (Object.prototype.hasOwnProperty.call(skillState, n.id)) {
        n.enabled = !!skillState[n.id];
      } else if (Object.prototype.hasOwnProperty.call(skillState, n.name)) {
        n.enabled = !!skillState[n.name];
      }
      return n;
    })
    .filter(Boolean);

  S.skills = normalized;
  renderSkills(normalized);
}

function renderSkills (skills) {
  const listEl = $("skills-list");
  listEl.innerHTML = "";

  if (!skills || skills.length === 0) {
    const scannedRoots = S.skillsScannedRoots || [];
    const diag = scannedRoots.length
      ? `<div class="skills-empty-roots">${scannedRoots.map(r => `<span>${htmlEscape(r.label || 'root')} · ${r.exists ? htmlEscape(String(r.count || 0)) : 'missing'}</span>`).join("")}</div>`
      : "";
    listEl.innerHTML = `<div class="skills-empty"><div class="skills-empty-strong">没有找到匹配的技能</div>${diag || "请尝试其他关键词或筛选"}</div>`;
    return;
  }

  skills.forEach(skill => {
    const card = el("div", "skill-card" + (skill.enabled ? " is-enabled" : " is-disabled"));
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("data-skill-id", skill.id);
    card.setAttribute("data-agent", skill.agentScope);
    card.setAttribute("data-category", skill.category);
    card.setAttribute("data-enabled", skill.enabled ? "1" : "0");

    const catLabel = (SKILL_CATEGORIES[skill.category] || SKILL_CATEGORIES.Other).label;
    const agentLabel = SKILL_AGENT_LABELS[skill.agentScope] || "FanBox";
    const isEmptyDesc = !skill.cnDescription || skill.cnDescription === "暂无简介";

    card.innerHTML =
      `<div class="skill-card-icon">${skillCategoryIcon(skill.category)}</div>` +
      `<div class="skill-card-body">` +
        `<div class="skill-card-head">` +
          `<div class="skill-card-title">${htmlEscape(skill.title)}</div>` +
          `<button class="skill-toggle ${skill.enabled ? "is-on" : "is-off"}" data-skill-id="${htmlEscape(skill.id)}" type="button" role="switch" aria-checked="${skill.enabled ? "true" : "false"}" aria-label="Toggle ${htmlEscape(skill.title)}">` +
            `<span class="skill-toggle-knob"></span>` +
          `</button>` +
        `</div>` +
        `<p class="skill-card-desc ${isEmptyDesc ? "is-empty" : ""}">${htmlEscape(skill.cnDescription)}</p>` +
        `<div class="skill-card-meta">` +
          `<span class="skill-badge skill-badge-agent" data-agent="${skill.agentScope}">${htmlEscape(agentLabel)}</span>` +
          `<span class="skill-badge skill-badge-cat" data-cat="${skill.category}">${htmlEscape(catLabel)}</span>` +
          `<span class="skill-source">${htmlEscape(skill.source)}</span>` +
          `<button class="skill-use-btn" data-skill-id="${htmlEscape(skill.id)}" data-skill-title="${htmlEscape(skill.title)}" type="button">Use in chat</button>` +
        `</div>` +
      `</div>`;

    // toggle handler
    card.addEventListener("click", () => {
      useSkillInChat(skill);
    });
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        useSkillInChat(skill);
      }
    });
    card.querySelector(".skill-toggle").addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggleSkill(skill);
    });
    // use in chat handler
    card.querySelector(".skill-use-btn").addEventListener("click", (ev) => {
      ev.stopPropagation();
      useSkillInChat(skill);
    });

    listEl.appendChild(card);
  });
}

function filterSkills () {
  const q = ($("skills-q").value || "").toLowerCase().trim();
  const agent = (qsa(".skills-filter-agent.is-active")[0]?.getAttribute("data-agent") || "all").toLowerCase();
  const status = (qsa(".skills-filter-status.is-active")[0]?.getAttribute("data-status") || "all").toLowerCase();
  const type = (qsa(".skills-filter-type.is-active")[0]?.getAttribute("data-type") || "all").toLowerCase();

  const filtered = (S.skills || []).filter(s => {
    if (agent !== "all" && s.agentScope !== agent) return false;
    if (status === "enabled"  && !s.enabled) return false;
    if (status === "disabled" &&  s.enabled) return false;
    if (type !== "all" && s.category !== type) return false;
    if (!q) return true;
    const hay = [
      s.title || "",
      s.name || "",
      s.cnDescription || "",
      (SKILL_AGENT_LABELS[s.agentScope] || ""),
      (SKILL_CATEGORIES[s.category] || SKILL_CATEGORIES.Other).label,
      s.source || ""
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  renderSkills(filtered);
}

/** 切换 enabled 状态 (调 POST /api/mobile/skills-state, 失败回滚) */
async function toggleSkill (skill) {
  if (!skill || !skill.id) return;
  const prevEnabled = skill.enabled;
  const newEnabled = !prevEnabled;
  // 乐观更新
  skill.enabled = newEnabled;
  if (S.skillState) S.skillState[skill.id] = newEnabled;
  // 重渲染当前列表
  filterSkills();
  try {
    const res = await api("/api/mobile/skills-state", {
      method: "POST",
      body: JSON.stringify({ skillId: skill.id, enabled: newEnabled })
    });
    if (!res || res.ok === false) {
      throw new Error((res && res.error) || "toggle failed");
    }
  } catch (e) {
    // 回滚
    skill.enabled = prevEnabled;
    if (S.skillState) S.skillState[skill.id] = prevEnabled;
    filterSkills();
    toast("状态更新失败: " + (e.message || e));
  }
}

/** Use in chat → 切回 Home + 填入 prompt (不发送) */
function useSkillInChat (skill) {
  if (!skill) return;
  const title = skill.title || skill.name;
  S.currentSkill = {
    id: skill.id,
    title: title || skill.id
  };
  const skillBtn = $("home-skill-button");
  const skillLabel = $("home-skill-button-label");
  if (skillBtn) skillBtn.classList.add("is-active");
  if (skillLabel) skillLabel.textContent = title ? truncate(title, 24) : "Skill";
  closeSidebar();
  showTab("home");
  const input = $("home-input");
  if (input) {
    input.value = "使用「" + title + "」帮我……";
    autoResize(input);
    const send = $("home-send");
    if (send) send.disabled = !input.value.trim() || S.running;
  }
  setTimeout(() => { if (input) input.focus(); }, 60);
}

/* =========================================================
   Project View · Phase UI-A8-3 (以 Project 为主菜单聚合 sessions)
   ========================================================= */
function wireProject () {
  $("project-refresh").addEventListener("click", loadAllProjects);
  $("project-q").addEventListener("input", debounce(filterProjects, 200));
  $("project-back").addEventListener("click", () => {
    S.currentProject = null;
    S.currentProjectSessions = null;
    showProjectList();
  });
  $("project-detail-resume").addEventListener("click", () => {
    if (S.currentProject && S.currentProject.lastSession) continueSession(S.currentProject.lastSession);
  });
}

/** 把路径归一化做 projectKey：统一 \ → /，去尾斜杠（保留大小写，盘符区分） */
function normalizePathForKey (p) {
  if (!p) return "";
  let s = String(p).replace(/\\/g, "/");
  s = s.replace(/\/+$/, "");
  return s;
}

/** 聚合 sessions -> projects (Phase UI-A8-3)
 *  projectKey = normalizePathForKey(cwd || cwdLabel || 'unknown')
 *  排序：lastActiveAt desc
 *  status summary: running / failed / done counts
 */
function groupSessionsByProject (sessions) {
  if (!Array.isArray(sessions)) return [];
  const map = new Map();
  for (const s of sessions) {
    const cwd = (s && typeof s.cwd === 'string') ? s.cwd : '';
    const cwdLabel = (s && typeof s.cwdLabel === 'string') ? s.cwdLabel : '';
    const key = normalizePathForKey(cwd || cwdLabel || 'unknown') || 'unknown';
    let p = map.get(key);
    if (!p) {
      p = {
        projectId: key,
        cwd: cwd || cwdLabel || '',
        cwdLabel: cwdLabel || (cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() : '未知项目'),
        lastActiveAt: 0,
        sessionCount: 0,
        runningCount: 0,
        failedCount: 0,
        doneCount: 0,
        lastSession: null,
        lastAgent: null,
        sources: new Set(),
        sessions: []
      };
      map.set(key, p);
    }
    p.sessionCount += 1;
    p.sessions.push(s);
    p.sources.add(s.source || 'unknown');
    const st = (s.status || '').toLowerCase();
    if (st === 'running' || st === 'in_progress' || st === 'active') p.runningCount += 1;
    else if (st === 'failed' || st === 'error') p.failedCount += 1;
    else if (st === 'done' || st === 'completed' || st === 'succeeded') p.doneCount += 1;
    const last = Number(s.lastActiveAt) || Number(s.updatedAt) || Number(s.createdAt) || 0;
    if (last > p.lastActiveAt) {
      p.lastActiveAt = last;
      p.lastSession = s;
      p.lastAgent = s.agentId || null;
    }
  }
  const list = Array.from(map.values());
  list.sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
  for (const p of list) p.sources = Array.from(p.sources);
  return list;
}

/** 按时间分组：last7Days / last30Days / older */
function groupProjectsByTime (projects, now) {
  const ref = Number.isFinite(now) ? now : Date.now();
  const day7 = 7 * 24 * 60 * 60 * 1000;
  const day30 = 30 * 24 * 60 * 60 * 1000;
  const out = { last7Days: [], last30Days: [], older: [] };
  if (!Array.isArray(projects)) return out;
  for (const p of projects) {
    const t = Number(p.lastActiveAt) || 0;
    if (t >= ref - day7) out.last7Days.push(p);
    else if (t >= ref - day30) out.last30Days.push(p);
    else out.older.push(p);
  }
  return out;
}

/** 从 projects 中挑出指定 projectId */
function pickProject (projectId, projects) {
  if (!projectId) return null;
  for (const p of (projects || [])) {
    if (p.projectId === projectId) return p;
  }
  return null;
}

/** 从 sessions 列表筛出属于某 project 的所有 session */
function sessionsForProject (projectId, sessions) {
  if (!projectId || !Array.isArray(sessions)) return [];
  const key = normalizePathForKey(projectId);
  return sessions.filter(s => {
    const cwd = (s && typeof s.cwd === 'string') ? s.cwd : '';
    const cwdLabel = (s && typeof s.cwdLabel === 'string') ? s.cwdLabel : '';
    const k = normalizePathForKey(cwd || cwdLabel || 'unknown') || 'unknown';
    return k === key;
  });
}

/** 按时间分组的 sessions（sidebar Recent Sessions 用） */
function groupSessionsByTime (sessions, now) {
  const ref = Number.isFinite(now) ? now : Date.now();
  const day7 = 7 * 24 * 60 * 60 * 1000;
  const day30 = 30 * 24 * 60 * 60 * 1000;
  const out = { last7Days: [], last30Days: [], older: [] };
  if (!Array.isArray(sessions)) return out;
  for (const s of sessions) {
    const t = Number(s.lastActiveAt) || Number(s.updatedAt) || Number(s.createdAt) || 0;
    if (t >= ref - day7) out.last7Days.push(s);
    else if (t >= ref - day30) out.last30Days.push(s);
    else out.older.push(s);
  }
  return out;
}

async function loadAllProjects () {
  const listEl = $("project-list");
  const detailEl = $("project-detail");
  if (detailEl) detailEl.hidden = true;
  if (listEl) listEl.hidden = false;
  listEl.innerHTML = `<div class="skeleton" style="height:80px;margin-bottom:12px"></div><div class="skeleton" style="height:80px;margin-bottom:12px"></div>`;
  $("project-title").textContent = "Project";
  try {
    // Phase UI-A8-7 P0: 优先使用 /api/mobile/projects (含电脑端真实项目 + fallback roots)
    const data = await api("/api/mobile/projects");
    if (data && data.ok && Array.isArray(data.items)) {
      S.allProjects = data.items;
      // 同时保留 sessions 用于 project 详情
      const sessData = await api("/api/mobile/sessions?limit=200");
      S.allSessions = sessData ? (sessData.items || sessData.sessions || []) : [];
      renderProjectList(data.items, { groups: data.groups });
    } else {
      // fallback: 旧逻辑
      const sessData = await api("/api/mobile/sessions?limit=200");
      if (!sessData) return;
      const items = sessData.items || sessData.sessions || [];
      S.allSessions = items;
      const projects = groupSessionsByProject(items);
      S.allProjects = projects;
      renderProjectList(projects);
    }
  } catch (e) {
    listEl.innerHTML = `<div class="project-empty"><div class="project-empty-strong">加载失败</div>${htmlEscape(e.message)}</div>`;
  }
}

function renderProjectList (projects, opts) {
  opts = opts || {};
  const listEl = $("project-list");
  listEl.innerHTML = "";
  const q = (opts.q || "").toLowerCase().trim();
  let list = projects;
  if (q) {
    list = list.filter(p =>
      (p.cwdLabel || p.name || "").toLowerCase().includes(q) ||
      (p.cwd || "").toLowerCase().includes(q) ||
      ((p.agents || []).join(" ") || "").toLowerCase().includes(q)
    );
  }
  if (!list || list.length === 0) {
    listEl.innerHTML = `<div class="project-empty"><div class="project-empty-strong">${q ? "没有匹配的项目" : "暂无项目"}</div>${q ? "试试别的关键词" : "通过 Files 进入一个文件夹，然后点击 Ask AI in this folder"}</div>`;
    return;
  }
  // Phase UI-A8-7: 如果后端返回了 groups，直接用；否则前端分组
  let sections;
  if (opts.groups && (opts.groups.recent7d || opts.groups.recent30d)) {
    const g = opts.groups;
    sections = [
      { key: "recent7d",  label: "最近 7 天", items: (g.recent7d || []) },
      { key: "recent30d", label: "最近 30 天", items: (g.recent30d || []) }
    ];
    // 添加没有在 groups 里的项目（如 root fallback）
    const groupedIds = new Set([...(g.recent7d || []), ...(g.recent30d || [])].map(p => p.id || p.projectId));
    const ungrouped = list.filter(p => !groupedIds.has(p.id || p.projectId));
    if (ungrouped.length > 0) {
      sections.push({ key: "roots", label: "常用工作区", items: ungrouped });
    }
  } else {
    const groups = groupProjectsByTime(list);
    sections = [
      { key: "last7Days",  label: "最近 7 天", items: groups.last7Days },
      { key: "last30Days", label: "最近 30 天", items: groups.last30Days },
      { key: "older",      label: "更早", items: groups.older }
    ];
  }
  for (const sec of sections) {
    const arr = sec.items;
    if (!arr || arr.length === 0) continue;
    const head = el("div", "project-group-head");
    head.textContent = sec.label;
    listEl.appendChild(head);
    for (const p of arr) {
      listEl.appendChild(renderProjectCard(p));
    }
  }
}

function renderProjectCard (p) {
  const card = el("div", "project-card");
  card.setAttribute("role", "listitem");
  card.setAttribute("data-project-id", p.id || p.projectId);
  const agentLabels = (p.agents || []).map(a => agentLabelById(a)).filter(Boolean);
  const agentStr = agentLabels.join(" / ") || "";
  const summary = [];
  if (p.sessionCount) summary.push(`${p.sessionCount} sessions`);
  if (p.statusSummary) {
    if (p.statusSummary.running) summary.push(`${p.statusSummary.running} running`);
    if (p.statusSummary.failed) summary.push(`${p.statusSummary.failed} failed`);
  }
  if (p.lastActiveAt) summary.push(`Last active ${timeAgo(p.lastActiveAt)}`);
  const sourceLabel = (p.source === "root") ? "常用工作区" : (p.source === "desktop-project" ? "Desktop" : "");
  const hasSession = p.latestSessionId || p.sessionCount > 0;
  card.innerHTML =
    `<div class="project-card-head">` +
      `<span class="project-card-icon">${FILE_ICONS.folder}</span>` +
      `<span class="project-card-body">` +
        `<span class="project-card-title">${htmlEscape(p.cwdLabel || p.name || "未知项目")}</span>` +
        `<span class="project-card-cwd">${htmlEscape(p.cwd || "")}</span>` +
        `<span class="project-card-meta">${htmlEscape(summary.join(" · "))}${sourceLabel ? " · " + htmlEscape(sourceLabel) : ""}${agentStr ? " · " + htmlEscape(agentStr) : ""}</span>` +
      `</span>` +
    `</div>` +
    `<div class="project-card-actions">` +
      `<button class="project-card-btn project-card-btn-open" type="button">Open in chat</button>` +
      (hasSession ? `<button class="project-card-btn project-card-btn-continue" type="button">Continue last session</button>` : "") +
    `</div>`;
  // Open in chat: 设置 cwd 并回 Home
  card.querySelector(".project-card-btn-open").addEventListener("click", ev => {
    ev.stopPropagation();
    openProjectInChat(p);
  });
  const continueBtn = card.querySelector(".project-card-btn-continue");
  if (continueBtn) {
    continueBtn.addEventListener("click", ev => {
      ev.stopPropagation();
      continueProjectSession(p);
    });
  }
  // 点击卡片本身进入详情
  card.addEventListener("click", () => openProjectDetail(p));
  return card;
}

/** Phase UI-A8-7 P0: Open project in chat (设置 cwd, 回 Home) */
function openProjectInChat (project) {
  if (project.cwd) {
    S.cwd = project.cwd;
    S.cwdLabel = project.cwdLabel || project.name || (project.cwd || "").split(/[/\\]/).filter(Boolean).pop() || null;
    localStorage.setItem(CWD_KEY, S.cwd);
    updateTopbarCwd();
  }
  // 清空当前聊天，但不创建新 session
  S.messages = [];
  S.sessionId = "";
  try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  exitChatState();
  closeSidebar();
  showTab("home");
  renderMessages();
}

/** Phase UI-A8-7 P0: Continue last session in project */
function continueProjectSession (project) {
  if (project.cwd) {
    S.cwd = project.cwd;
    S.cwdLabel = project.cwdLabel || project.name || (project.cwd || "").split(/[/\\]/).filter(Boolean).pop() || null;
    localStorage.setItem(CWD_KEY, S.cwd);
    updateTopbarCwd();
  }
  if (project.latestSessionId) {
    continueSession({ sessionId: project.latestSessionId, agentId: (project.agents || [])[0] || "claude", cwd: project.cwd, cwdLabel: project.cwdLabel });
  } else {
    // 没有 session，走 openProjectInChat
    openProjectInChat(project);
  }
}

function openProjectDetail (project) {
  S.currentProject = project;
  const projectId = project.id || project.projectId;
  const sessions = sessionsForProject(projectId, S.allSessions || []);
  S.currentProjectSessions = sessions;
  showProjectDetail(project, sessions);
}

function showProjectDetail (project, sessions) {
  $("project-list").hidden = true;
  const detailEl = $("project-detail");
  detailEl.hidden = false;
  $("project-title").textContent = "Project";
  $("project-detail-name").textContent = project.cwdLabel || "未知项目";
  $("project-detail-cwd").textContent = project.cwd || "";
  const summary = `${project.sessionCount} sessions · Last active ${project.lastActiveAt ? timeAgo(project.lastActiveAt) : "—"}`;
  $("project-detail-meta").textContent = summary;
  const list = $("project-detail-list");
  list.innerHTML = "";
  if (!sessions || sessions.length === 0) {
    list.innerHTML = `<div class="project-empty"><div class="project-empty-strong">暂无会话</div>从 Files 进入此文件夹然后点 Ask AI in this folder 即可创建会话</div>`;
    return;
  }
  const sorted = sessions.slice().sort((a, b) => (Number(b.lastActiveAt) || 0) - (Number(a.lastActiveAt) || 0));
  for (const s of sorted) {
    list.appendChild(renderProjectSessionItem(s));
  }
}

function renderProjectSessionItem (s) {
  const row = el("div", "project-session");
  const agentLabel = agentLabelById(s.agentId);
  const status = s.status || "unknown";
  const preview = (s.summary && s.summary.lastMessagePreview) || s.title || "";
  const source = s.source || "unknown";
  const sourceLabel = source.charAt(0).toUpperCase() + source.slice(1);
  row.innerHTML =
    `<div class="project-session-head">` +
      `<span class="project-session-title">${htmlEscape(s.title || "未命名会话")}</span>` +
      `<span class="project-session-source is-${source}">${htmlEscape(sourceLabel)}</span>` +
    `</div>` +
    `<p class="project-session-preview">${htmlEscape(truncate(preview, 100))}</p>` +
    `<div class="project-session-foot">` +
      `<span class="project-session-meta-row">` +
        `<span class="project-session-agent">${htmlEscape(agentLabel)}</span>` +
        `<span class="project-session-status is-${status}">${htmlEscape(status)}</span>` +
        (s.lastActiveAt ? `<span class="project-session-time">${htmlEscape(timeAgo(s.lastActiveAt))}</span>` : "") +
      `</span>` +
      `<button class="project-session-continue" type="button">Continue</button>` +
    `</div>`;
  row.addEventListener("click", ev => {
    continueSession(s);
  });
  const btn = row.querySelector(".project-session-continue");
  if (btn) btn.addEventListener("click", ev => { ev.stopPropagation(); continueSession(s); });
  return row;
}

function showProjectList () {
  $("project-detail").hidden = true;
  $("project-list").hidden = false;
  $("project-title").textContent = "Project";
}

function filterProjects () {
  renderProjectList(S.allProjects || [], { q: $("project-q").value || "" });
}

/** agent id -> label（从 AGENTS 数组找） */
function agentLabelById (id) {
  if (!id) return "Unknown";
  for (const a of AGENTS) {
    if (a.id === id) return a.label;
  }
  return id;
}

/** 继续某个历史 session：恢复 sessionId / agentId / cwd，加载 messages，切到 Home Chat Workspace */
async function continueSession (session) {
  if (!session) return;
  const sid = session.sessionId || session.id;
  if (!sid) return;
  // 1) 设置 agent / cwd / sessionId
  if (session.agentId) {
    const uiAgentId = agentIdForUi(session.agentId);
    const found = AGENTS.find(a => a.id === uiAgentId);
    if (found) {
      S.currentAgent = found.id;
      localStorage.setItem(AGENT_KEY, found.id);
      updateAgentDropdownLabel();
    }
  }
  if (session.cwd) {
    S.cwd = session.cwd;
    S.cwdLabel = (session.cwd || "").split(/[/\\]/).filter(Boolean).pop() || null;
    localStorage.setItem(CWD_KEY, session.cwd);
    updateTopbarCwd();
  }
  S.sessionId = sid;
  try { localStorage.setItem(SESSION_KEY, sid); } catch (_) {}
  // 2) 关闭侧边栏 + 切到 Home
  closeSidebar();
  showTab("home");
  // 3) 加载 messages
  S.messages = [];
  renderMessages();
  try {
    const data = await api("/api/mobile/sessions/" + encodeURIComponent(sid) + "/messages?limit=200");
    if (!data) return;
    const msgs = Array.isArray(data) ? data : (data.messages || []);
    S.messages = msgs.map(m => ({
      role: m.role === "user" ? "user" : (m.role === "system" ? "system" : "assistant"),
      content: m.text || m.content || ""
    }));
  } catch (e) {
    S.messages.push({ role: "system", content: "无法加载历史消息: " + (e.message || e) });
  }
  enterChatState();
  renderMessages();
  scrollMessages();
  // 4) 重新加载 sidebar recent sessions
  renderSidebarRecentSessions(S.allSessions || []);
}

/** 加载并渲染 Recent Sessions（分 7/30 天） */
async function loadRecentSessions () {
  try {
    const data = await api("/api/mobile/sessions?limit=200");
    if (!data) return;
    const sessions = data.items || data.sessions || [];
    S.allSessions = sessions;
    renderSidebarRecentSessions(sessions);
  } catch (e) {
    // silently fail
  }
}

function renderSidebarRecentSessions (sessions) {
  const el = $("sidebar-sessions");
  if (!el) return;
  el.innerHTML = "";
  if (!sessions || sessions.length === 0) {
    el.innerHTML = `<div class="sidebar-empty">No recent sessions</div>`;
    return;
  }
  // 排序按 lastActiveAt desc
  const sorted = sessions.slice().sort((a, b) => (Number(b.lastActiveAt) || 0) - (Number(a.lastActiveAt) || 0));
  const groups = groupSessionsByTime(sorted);
  const sections = [
    { key: "last7Days",  label: "最近 7 天" },
    { key: "last30Days", label: "最近 30 天" }
  ];
  let added = 0;
  for (const sec of sections) {
    const arr = groups[sec.key];
    if (!arr || arr.length === 0) continue;
    const head = el("div", "sidebar-section-head");
    head.textContent = sec.label;
    el.appendChild(head);
    for (const s of arr.slice(0, 10)) {
      el.appendChild(renderSidebarSessionItem(s));
      added++;
    }
  }
  if (added === 0) {
    el.innerHTML = `<div class="sidebar-empty">No recent sessions</div>`;
  }
}

function renderSidebarSessionItem (s) {
  const wrap = el("button", "sidebar-session" + (S.sessionId === s.sessionId ? " is-active" : ""));
  wrap.setAttribute("role", "listitem");
  const status = s.status || "done";
  const title = s.title || s.cwdLabel || "未命名会话";
  const agentLabel = agentLabelById(s.agentId);
  const time = s.lastActiveAt || s.updatedAt || s.createdAt || 0;
  wrap.innerHTML =
    `<span class="sidebar-session-icon">${NAV_ICONS.chat}</span>` +
    `<span class="sidebar-session-body">` +
      `<span class="sidebar-session-title">${htmlEscape(title)}</span>` +
      `<span class="sidebar-session-meta">${htmlEscape(agentLabel)} · ${htmlEscape(timeAgo(time))}</span>` +
    `</span>` +
    `<span class="sidebar-session-status is-${status}"></span>`;
  wrap.addEventListener("click", () => continueSession(s));
  return wrap;
}

/* =========================================================
   Utilities
   ========================================================= */
function debounce (fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/* =========================================================
   Boot
   ========================================================= */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* =========================================================
   UI1A: Contract-Based Mobile Home + Agent/Session Detail
   ========================================================= */
const UI1A = (() => {
  const USE_CONTRACT_HOME = true;

  const CS = {
    token: null,
    deviceId: null,
    appState: null,
    dashboard: null,
    projects: null,
    selected: null,
    selectedProject: null,
    expandedProjects: new Set(),
    selectedNewChatAgent: null,
    timelines: new Map(),
    loading: {},
    errors: {},
    newTask: { projectId: null, projectCwd: null, agentId: "claude", title: "", initialMessage: "" },
    pollTimer: null,
    detailPollTimer: null,
  };

  const $c = id => document.getElementById(id);

  function el (tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) e.setAttribute(k, v);
    }
    for (const c of (Array.isArray(children) ? children : [children])) {
      if (c == null) continue;
      if (typeof c === "string") e.appendChild(document.createTextNode(c));
      else if (c instanceof Node) e.appendChild(c);
      else if (c && typeof c.text === "string") e.appendChild(document.createTextNode(c.text));
      else e.appendChild(c);
    }
    return e;
  }

  function escapeHtml (s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function relTime (ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function shortTime (ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  async function cApi (path, opts = {}) {
    const r = await fetch(path, {
      ...opts,
      headers: {
        "Authorization": `Bearer ${CS.token || S.token}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
    if (r.status === 401) {
      clearToken();
      showPair("登录已失效，请重新配对");
      throw new Error("unauthorized");
    }
    if (!r.ok) {
      let msg = `${r.status}`;
      try { const j = await r.json(); msg = j.error || msg; } catch { try { msg = await r.text() } catch {} }
      throw new Error(msg);
    }
    if (r.status === 204) return null;
    const data = await r.json();
    if (data && data.ok === false) throw new Error(data.error || "request failed");
    return data;
  }

  async function loadAppState () {
    try {
      CS.appState = await cApi("/api/mobile/app-state");
      CS.errors.appState = null;
    } catch (e) {
      CS.errors.appState = e.message;
    }
  }

  async function loadDashboard () {
    try {
      CS.dashboard = await cApi("/api/mobile/dashboard");
      CS.errors.dashboard = null;
    } catch (e) {
      CS.errors.dashboard = e.message;
    }
  }

  async function loadProjects () {
    try {
      const d = await cApi("/api/mobile/projects");
      CS.projects = d.items || [];
    } catch (e) { /* non-fatal */ }
  }

  /* ---- UI1B: Safety page data loaders ---- */
  async function loadSafetyDevices () {
    try {
      const d = await cApi("/api/mobile/devices");
      CS.safetyDevices = d.items || [];
      CS.safetyCurrentDeviceId = d.currentDeviceId || null;
      CS.errors.safetyDevices = null;
    } catch (e) { CS.errors.safetyDevices = e.message; }
  }

  async function loadSafetyAudit () {
    try {
      const d = await cApi("/api/mobile/audit?limit=30");
      CS.safetyAudit = d.items || [];
      CS.errors.safetyAudit = null;
    } catch (e) { CS.errors.safetyAudit = e.message; }
  }

  async function loadSafetyPairStatus () {
    try {
      const d = await cApi("/api/mobile/pair/status");
      CS.safetyPairStatus = d;
      CS.errors.safetyPairStatus = null;
    } catch (e) { CS.errors.safetyPairStatus = e.message; }
  }

  async function loadSafetyInfo () {
    try {
      const d = await cApi("/api/mobile/info");
      CS.safetyInfo = d;
      CS.errors.safetyInfo = null;
    } catch (e) { CS.errors.safetyInfo = e.message; }
  }

  /* ---- UI1B: Safety page renderer ---- */
  function renderSafety () {
    const st = CS.appState || {};
    const auth = st.auth || {};
    const scopes = auth.scopes || [];
    const server = st.server || {};
    const conn = st.connection || {};

    // Current device
    const curEl = $c("safety-current-device");
    if (curEl) {
      const cur = (CS.safetyDevices || []).find(d => d.isCurrent) || (CS.safetyDevices || [])[0];
      if (cur) {
        curEl.innerHTML = "";
        curEl.appendChild(el("div", { class: "safety-row" }, [
          el("span", { class: "safety-row-label" }, { text: "设备名" }),
          el("span", { class: "safety-row-val" }, { text: cur.deviceName || "—" }),
        ]));
        curEl.appendChild(el("div", { class: "safety-row" }, [
          el("span", { class: "safety-row-label" }, { text: "设备 ID" }),
          el("span", { class: "safety-row-val safety-mono" }, { text: (cur.deviceId || "").substring(0, 12) + "…" }),
        ]));
        curEl.appendChild(el("div", { class: "safety-row" }, [
          el("span", { class: "safety-row-label" }, { text: "最后活跃" }),
          el("span", { class: "safety-row-val" }, { text: cur.lastActiveAt ? shortTime(cur.lastActiveAt) : "—" }),
        ]));
        curEl.appendChild(el("div", { class: "safety-row" }, [
          el("span", { class: "safety-row-label" }, { text: "IP" }),
          el("span", { class: "safety-row-val safety-mono" }, { text: cur.lastIp || "—" }),
        ]));
      } else {
        curEl.innerHTML = `<div class="safety-empty">无设备信息</div>`;
      }
    }

    // Scopes
    const scopesEl = $c("safety-scopes");
    if (scopesEl) {
      scopesEl.innerHTML = "";
      const allScopes = [
        { id: "read:status", label: "查看状态", desc: "查看首页和电脑状态" },
        { id: "read:files", label: "查看文件", desc: "浏览电脑上的文件" },
        { id: "desktop_control", label: "继续输入", desc: "允许手机继续给电脑端 Agent 发消息" },
        { id: "session:start", label: "启动任务", desc: "允许手机启动新的 Agent 任务" },
      ];
      for (const sc of allScopes) {
        const has = scopes.includes(sc.id);
        const pill = el("div", { class: "scope-pill" + (has ? " scope-pill-on" : " scope-pill-off") }, [
          el("span", { class: "scope-pill-dot" }),
          el("span", { class: "scope-pill-label" }, { text: sc.label }),
          el("span", { class: "scope-pill-desc" }, { text: has ? "已授权" : "未授权 · " + sc.desc }),
        ]);
        scopesEl.appendChild(pill);
      }
      if (!scopes.includes("desktop_control")) {
        scopesEl.appendChild(el("div", { class: "safety-warn" }, { text: "⚠ 没有「继续输入」权限，无法给电脑端 Agent 发消息" }));
      }
      if (!scopes.includes("session:start")) {
        scopesEl.appendChild(el("div", { class: "safety-warn" }, { text: "⚠ 没有「启动任务」权限，无法启动新任务" }));
      }
    }

    // Pairing + LAN URL
    const pairEl = $c("safety-pairing");
    if (pairEl) {
      pairEl.innerHTML = "";
      const ps = CS.safetyPairStatus || {};
      const info = CS.safetyInfo || {};
      const sInfo = info.server || {};
      pairEl.appendChild(el("div", { class: "safety-row" }, [
        el("span", { class: "safety-row-label" }, { text: "配对码状态" }),
        el("span", { class: "safety-row-val" + (ps.pairing ? " safety-ok" : " safety-muted") }, { text: ps.pairing ? "配对中（可接受新设备）" : "未开放配对" }),
      ]));
      const lanUrl = sInfo.hostname ? `http://${sInfo.hostname}:4580` : "";
      const lanRow = el("div", { class: "safety-row" }, [
        el("span", { class: "safety-row-label" }, { text: "局域网地址" }),
        el("span", { class: "safety-row-val safety-mono" }, { text: lanUrl || "—" }),
      ]);
      if (lanUrl) {
        const copyBtn = el("button", { class: "safety-copy-btn", type: "button", "aria-label": "复制地址", onclick: () => {
          try { navigator.clipboard.writeText(lanUrl); } catch (_) {}
        } }, { text: "复制" });
        lanRow.appendChild(copyBtn);
      }
      pairEl.appendChild(lanRow);
      pairEl.appendChild(el("div", { class: "safety-row" }, [
        el("span", { class: "safety-row-label" }, { text: "连接方式" }),
        el("span", { class: "safety-row-val" }, { text: "局域网直连" }),
      ]));
      pairEl.appendChild(el("div", { class: "safety-row" }, [
        el("span", { class: "safety-row-label" }, { text: "运行时长" }),
        el("span", { class: "safety-row-val" }, { text: sInfo.uptime ? Math.floor(sInfo.uptime / 60) + " 分钟" : "—" }),
      ]));
    }

    // Paired devices list
    const devEl = $c("safety-devices");
    if (devEl) {
      devEl.innerHTML = "";
      const devs = CS.safetyDevices || [];
      if (devs.length === 0) {
        devEl.innerHTML = `<div class="safety-empty">暂无配对设备</div>`;
      } else {
        const scopeLabels = {
          "read:status": "查看状态",
          "read:files": "查看文件",
          "desktop_control": "继续输入",
          "session:start": "启动任务",
        };
        for (const d of devs) {
          const scopeText = (d.scopes || []).map(s => scopeLabels[s] || s).join("、") || "—";
          const card = el("div", { class: "safety-device-card" + (d.isCurrent ? " is-current" : ""), role: "listitem" }, [
            el("div", { class: "safety-device-head" }, [
              el("span", { class: "safety-device-name" }, { text: d.deviceName || "未知设备" }),
              d.isCurrent ? el("span", { class: "safety-device-tag" }, { text: "当前" }) : null,
              d.revoked ? el("span", { class: "safety-device-tag safety-device-tag-off" }, { text: "已撤销" }) : null,
            ]),
            el("div", { class: "safety-device-meta" }, [
              el("span", {}, { text: "配对于 " + (d.pairedAt ? shortTime(d.pairedAt) : "—") }),
              el("span", {}, { text: " · 最后活跃 " + (d.lastActiveAt ? shortTime(d.lastActiveAt) : "—") }),
            ]),
            el("div", { class: "safety-device-scopes" }, [
              el("span", { class: "safety-device-scopes-label" }, { text: "权限：" }),
              el("span", {}, { text: scopeText }),
            ]),
          ]);
          devEl.appendChild(card);
        }
      }
    }

    // Audit log
    const audEl = $c("safety-audit");
    if (audEl) {
      audEl.innerHTML = "";
      const items = CS.safetyAudit || [];
      if (items.length === 0) {
        audEl.innerHTML = `<div class="safety-empty">暂无审计记录</div>`;
      } else {
        const actionLabels = {
          "desktop_agent.input.accepted": "发送输入",
          "desktop_agent.input.rate_limited": "输入被限流",
          "mobile_session.draft.created": "创建草稿",
          "mobile_session.start.accepted": "启动任务",
          "mobile_session.start.completed": "任务完成",
          "mobile_session.start.rejected": "启动被拒",
          "pair.confirmed": "设备配对",
        };
        for (const a of items) {
          const actionLabel = actionLabels[a.action] || a.action || "操作";
          const row = el("div", { class: "audit-row", role: "listitem" }, [
            el("div", { class: "audit-row-head" }, [
              el("span", { class: "audit-row-action" }, { text: actionLabel }),
              el("span", { class: "audit-row-time" }, { text: a.timestamp ? shortTime(a.timestamp) : "—" }),
            ]),
            el("div", { class: "audit-row-meta" }, { text: auditMetaSummary(a) }),
          ]);
          audEl.appendChild(row);
        }
      }
    }
  }

  function auditMetaSummary (a) {
    const parts = [];
    if (a.deviceName) parts.push("设备：" + a.deviceName);
    else if (a.deviceId) parts.push("设备：" + String(a.deviceId).substring(0, 8));
    if (a.agentId) parts.push("Agent：" + a.agentId);
    if (a.cwdLabel) parts.push("目录：" + a.cwdLabel);
    if (a.inputLen != null) parts.push("输入 " + a.inputLen + " 字符");
    if (a.initialMessageLength != null) parts.push("消息 " + a.initialMessageLength + " 字符");
    return parts.join(" · ") || "（无附加信息）";
  }

  /* ---- UI1B: Projects page renderer ---- */
  function renderContractProjects () {
    const listEl = $c("projects-list");
    if (!listEl) return;
    listEl.innerHTML = "";
    const projects = CS.projects || [];
    if (projects.length === 0) {
      listEl.innerHTML = `<div class="projects-empty"><div class="projects-empty-strong">暂无项目</div><div class="projects-empty-p">在电脑端用 Claude/Codex 打开一个项目文件夹，或通过 Files 进入一个文件夹</div></div>`;
      return;
    }
    for (const p of projects) {
      listEl.appendChild(renderContractProjectCard(p));
    }
  }

  function riskFlagLabel (r) {
    const map = {
      "cwd_outside_roots": "目录不在允许范围",
      "cwd_forbidden": "目录被禁止访问",
      "agent_unavailable": "Agent 不可用",
      "cwd_not_allowed": "目录不可访问",
    };
    return map[r] || r;
  }

  function sourceLabel (s) {
    const map = {
      "desktop-terminal": "桌面终端",
      "mobile-draft": "手机创建",
      "manual": "手动添加",
    };
    return map[s] || s || "—";
  }

  function renderContractProjectCard (p) {
    const canStart = p.canCreateSession === true;
    const risks = Array.isArray(p.riskFlags) ? p.riskFlags : [];
    const agents = Array.isArray(p.agentIds) ? p.agentIds : [];
    const agentLabels = agents.map(a => agentLabelById(a)).filter(Boolean);
    const summary = [];
    if (typeof p.sessionCount === "number") summary.push(`${p.sessionCount} 个会话`);
    if (p.lastActiveAt) summary.push("最近 " + shortTime(p.lastActiveAt));
    if (p.latestSessionTitle) summary.push(p.latestSessionTitle);

    const card = el("div", { class: "proj-card" + (canStart ? "" : " proj-card-locked"), role: "listitem", "data-project-id": p.id || p.cwd }, [
      el("div", { class: "proj-card-head" }, [
        el("span", { class: "proj-card-icon" }, { text: "📁" }),
        el("span", { class: "proj-card-body" }, [
          el("span", { class: "proj-card-title" }, { text: p.cwdLabel || p.name || "未知项目" }),
          el("span", { class: "proj-card-cwd safety-mono" }, { text: p.cwd || "" }),
          el("span", { class: "proj-card-meta" }, { text: summary.join(" · ") }),
        ]),
      ]),
      el("div", { class: "proj-card-tags" }, [
        el("span", { class: "proj-tag proj-tag-source" }, { text: sourceLabel(p.source) }),
        canStart
          ? el("span", { class: "proj-tag proj-tag-ok" }, { text: "可创建会话" })
          : el("span", { class: "proj-tag proj-tag-off" }, { text: "不可创建" }),
        ...risks.map(r => el("span", { class: "proj-tag proj-tag-risk" }, { text: riskFlagLabel(r) })),
        ...agentLabels.map(l => el("span", { class: "proj-tag proj-tag-agent" }, { text: l })),
      ]),
      el("div", { class: "proj-card-actions" }, [
        canStart
          ? el("button", { class: "proj-card-btn proj-card-btn-new", type: "button", onclick: () => createDraftFromProject(p) }, { text: "新建任务" })
          : el("span", { class: "proj-card-btn proj-card-btn-disabled" }, { text: p.reason === "cwd_not_allowed" ? "该目录不在可访问范围" : (p.reason || "无法创建会话") }),
      ]),
    ]);
    return card;
  }

  async function createDraftFromProject (project) {
    try {
      const agentId = (project.agentIds && project.agentIds[0]) || "claude";
      const d = await cApi("/api/mobile/sessions/draft", {
        method: "POST",
        body: JSON.stringify({ cwd: project.cwd, agentId }),
      });
      if (d && d.session && d.session.id) {
        openMobileSession(d.session.id);
      }
    } catch (e) {
      alert("创建任务失败: " + e.message);
    }
  }

  async function refreshSafety () {
    await Promise.all([
      loadAppState(),
      loadSafetyDevices(),
      loadSafetyAudit(),
      loadSafetyPairStatus(),
      loadSafetyInfo(),
    ]);
    renderSafety();
  }

  async function refreshProjects () {
    await loadProjects();
    renderContractProjects();
  }

  async function loadDesktopTimeline (agentId) {
    try {
      const d = await cApi(`/api/mobile/desktop-agents/${encodeURIComponent(agentId)}/timeline`);
      CS.timelines.set(`desktop:${agentId}`, d);
      CS.errors[`timeline:desktop:${agentId}`] = null;
      return d;
    } catch (e) {
      CS.errors[`timeline:desktop:${agentId}`] = e.message;
      return null;
    }
  }

  async function loadMobileTimeline (sessionId) {
    try {
      const d = await cApi(`/api/mobile/sessions/${encodeURIComponent(sessionId)}/timeline`);
      CS.timelines.set(`mobile:${sessionId}`, d);
      CS.errors[`timeline:mobile:${sessionId}`] = null;
      return d;
    } catch (e) {
      CS.errors[`timeline:mobile:${sessionId}`] = e.message;
      return null;
    }
  }

  async function sendDesktopInput (agentId, message) {
    await cApi(`/api/mobile/desktop-agents/${encodeURIComponent(agentId)}/input`, {
      method: "POST",
      body: JSON.stringify({ text: message }),
    });
    return loadDesktopTimeline(agentId);
  }

  async function startMobileSession (sessionId) {
    await cApi(`/api/mobile/sessions/${encodeURIComponent(sessionId)}/start`, {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
    return loadMobileTimeline(sessionId);
  }

  async function createDraftSession (data) {
    const res = await cApi("/api/mobile/sessions/draft", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return res.session;
  }

  /* ---- RENDER: Status Pill ---- */
  function statusPill (status) {
    const s = (status || "unknown").toLowerCase();
    return el("span", { class: `status-pill is-${s}` }, { text: status || "unknown" });
  }

  /* ---- RENDER: Connection Bar ---- */
  function renderConnection () {
    const box = $c("c-connection");
    if (!box) return;
    box.innerHTML = "";
    const st = CS.appState;
    let connClass = "is-offline", connText = "离线", serverName = "";
    if (st) {
      connClass = "is-online";
      connText = "已连接";
      serverName = (st.server && st.server.hostname) || "";
    } else if (CS.errors.appState) {
      connClass = "is-offline";
      connText = "连接断开";
    } else {
      connClass = "is-connecting";
      connText = "连接中...";
    }
    box.appendChild(el("span", { class: `cockpit-status-dot ${connClass}` }));
    box.appendChild(el("span", { class: "cockpit-status-text", text: connText }));
    if (serverName) {
      box.appendChild(el("span", { class: "cockpit-server-name", text: serverName }));
    }
    // render scopes summary
    renderScopesSummary();
  }

  /* ---- RENDER: Scopes Summary (Home top bar) ---- */
  function renderScopesSummary () {
    const box = $c("c-scopes-summary");
    const chips = $c("c-scopes-chips");
    if (!box || !chips) return;
    const st = CS.appState || {};
    const scopes = (st.auth && st.auth.scopes) || [];
    if (scopes.length === 0) { box.hidden = true; return; }
    box.hidden = false;
    chips.innerHTML = "";
    const scopeMap = {
      "read:status": { label: "查看状态", cls: "scope-chip-on" },
      "read:files": { label: "查看文件", cls: "scope-chip-on" },
      "desktop_control": { label: "继续输入", cls: "scope-chip-on" },
      "session:start": { label: "启动任务", cls: "scope-chip-on" },
    };
    for (const sc of ["read:status", "read:files", "desktop_control", "session:start"]) {
      const has = scopes.includes(sc);
      const info = scopeMap[sc] || { label: sc, cls: "" };
      const chip = el("span", { class: "scope-chip " + (has ? "scope-chip-on" : "scope-chip-off") }, { text: info.label });
      chips.appendChild(chip);
    }
  }

  /* ---- RENDER: Desktop Agents Section ---- */
  function getFollowupBlockedReason (a) {
    if (a.canSendFollowup) return "";
    const scopes = (CS.appState && CS.appState.auth && CS.appState.auth.scopes) || [];
    if (!scopes.includes("desktop_control")) return "需要桌面控制权限";
    if (!a.canOpen) return "工作目录不可访问";
    if (a.status === "exited") return "进程已退出";
    return a.reason || "当前不可用";
  }

  function renderDesktopAgents () {
    const box = $c("c-desktop-list");
    const count = $c("c-desktop-count");
    if (!box) return;
    box.innerHTML = "";

    const agents = (CS.dashboard && CS.dashboard.desktopContinuableAgents) || [];
    if (count) count.textContent = agents.length;

    if (agents.length === 0) {
      box.appendChild(el("div", { class: "cockpit-empty", style: "width:100%;margin:0;" }, { text: "暂无桌面端 Agent · 在电脑端启动 Claude/Codex 终端即可看到" }));
      return;
    }

    agents.forEach(a => {
      const card = el("div", { class: "desk-card", onclick: () => openDesktopAgent(a.id) });
      const head = el("div", { class: "desk-card-head" });
      head.appendChild(el("div", { class: "desk-card-icon", text: "💻" }));
      head.appendChild(el("div", { class: "desk-card-label", text: a.label || a.agentId }));
      head.appendChild(statusPill(a.status));
      card.appendChild(head);
      card.appendChild(el("div", { class: "desk-card-project", text: a.projectName || a.cwd || "" }));
      if (a.outputTail) {
        const preview = a.outputTail.length > 80 ? a.outputTail.slice(-80) + "…" : a.outputTail;
        card.appendChild(el("div", { class: "desk-card-output", text: preview }));
      }
      const blockedReason = getFollowupBlockedReason(a);
      const followup = a.canSendFollowup
        ? el("div", { class: "desk-card-followup is-yes", text: "✓ 可继续输入" })
        : el("div", { class: "desk-card-followup is-no", text: blockedReason || "无继续输入权限" });
      card.appendChild(followup);
      box.appendChild(card);
    });
  }

  /* ---- RENDER: Mobile Sessions Section ---- */
  function renderMobileSessions () {
    const box = $c("c-mobile-list");
    const count = $c("c-mobile-count");
    if (!box) return;
    box.innerHTML = "";

    const sessions = (CS.dashboard && CS.dashboard.mobileSessions) || [];
    if (count) count.textContent = sessions.length;

    if (sessions.length === 0) {
      box.appendChild(el("div", { class: "cockpit-empty" }, { text: "暂无手机任务 · 从下方「新建任务」开始" }));
      return;
    }

    sessions.forEach(s => {
      const card = el("div", { class: "mobi-card" });
      card.appendChild(el("div", { class: "mobi-card-info", onclick: () => openMobileSession(s.sessionId) }, [
        el("div", { class: "mobi-card-title", text: s.title || s.name || s.sessionId.slice(0, 8) }),
        el("div", { class: "mobi-card-meta", text: `${s.agentId || "claude"} · ${relTime(s.createdAt || s.updatedAt || s.lastActiveAt)}` }),
      ]));
      card.appendChild(el("div", { class: "mobi-card-status" }, [statusPill(s.status)]));
      const scopes = (CS.appState && CS.appState.auth && CS.appState.auth.scopes) || [];
      if (s.status === "draft" && scopes.includes("session:start")) {
        card.appendChild(el("button", {
          class: "mobi-card-start",
          onclick: async (ev) => {
            ev.stopPropagation();
            if (!confirm("启动此 Agent 任务？")) return;
            await startMobileSession(s.sessionId);
            await refreshAll();
          },
          text: "启动",
        }));
      }
      box.appendChild(card);
    });
  }

  /* ---- RENDER: New Task Form ---- */
  function renderNewTask () {
    const projSel = $c("nt-project");
    const agentsBox = $c("nt-agents");
    if (!projSel) return;

    if (CS.projects) {
      const curVal = CS.newTask.projectId || "";
      projSel.innerHTML = "";
      projSel.appendChild(el("option", { value: "" }, { text: "选择项目（可选）" }));
      CS.projects.forEach(p => {
        const opt = el("option", { value: p.id, "data-cwd": p.cwd || "" }, { text: p.name || p.cwdLabel || p.id });
        if (p.id === curVal) opt.selected = true;
        projSel.appendChild(opt);
      });
    }

    if (agentsBox) {
      agentsBox.innerHTML = "";
      const agents = (CS.appState && CS.appState.availableAgents) || [
        { id: "claude", label: "Claude Code" },
        { id: "codex", label: "Codex" },
        { id: "opencode", label: "OpenCode" },
        { id: "qoder", label: "Qoder" }
      ];
      agents.forEach(a => {
        const chip = el("button", {
          class: `nt-agent-chip ${CS.newTask.agentId === a.id ? "is-selected" : ""}`,
          onclick: () => { CS.newTask.agentId = a.id; renderNewTask(); },
          text: a.label || a.id,
        });
        agentsBox.appendChild(chip);
      });
    }
  }

  function wireNewTaskForm () {
    const projSel = $c("nt-project");
    const titleIn = $c("nt-title");
    const msgIn = $c("nt-message");
    const submit = $c("nt-create");

    if (projSel) projSel.addEventListener("change", () => {
      CS.newTask.projectId = projSel.value;
      const selectedOpt = projSel.options[projSel.selectedIndex];
      CS.newTask.projectCwd = selectedOpt ? (selectedOpt.getAttribute("data-cwd") || "") : "";
    });
    if (titleIn) titleIn.addEventListener("input", () => { CS.newTask.title = titleIn.value; });
    if (msgIn) msgIn.addEventListener("input", () => { CS.newTask.initialMessage = msgIn.value; });

    if (submit) submit.addEventListener("click", async () => {
      const title = (titleIn ? titleIn.value : "").trim() || "New Task";
      const message = (msgIn ? msgIn.value : "").trim();
      if (!message) { alert("请输入任务消息"); return; }
      const cwd = CS.newTask.projectCwd || (CS.appState && CS.appState.currentContext && CS.appState.currentContext.cwd) || process_cwd_fallback();
      if (!cwd) { alert("请先选择一个项目目录"); return; }
      submit.disabled = true;
      submit.textContent = "创建中...";
      try {
        const session = await createDraftSession({
          cwd,
          agentId: CS.newTask.agentId || "claude",
          title,
          initialMessage: message,
        });
        CS.newTask.title = "";
        CS.newTask.initialMessage = "";
        if (titleIn) titleIn.value = "";
        if (msgIn) msgIn.value = "";
        await refreshAll();
        openMobileSession(session.id);
      } catch (e) {
        alert("创建失败: " + e.message);
      } finally {
        submit.disabled = false;
        submit.textContent = "Create Draft";
      }
    });
  }

  function process_cwd_fallback () {
    const m = document.querySelector && document.querySelector('meta[name="fanbox-cwd"]');
    return m ? m.getAttribute("content") : "";
  }

  /* ---- RENDER: Recent Files ---- */
  function renderRecentFiles () {
    const box = $c("c-recent-files");
    if (!box) return;
    box.innerHTML = "";
    const files = (CS.dashboard && CS.dashboard.recentFiles) || [];
    if (files.length === 0) {
      box.appendChild(el("div", { class: "cockpit-empty" }, { text: "暂无最近文件" }));
      return;
    }
    files.slice(0, 3).forEach(f => {
      const row = el("div", { class: "file-row", onclick: () => {
        localStorage.setItem(CWD_KEY, f.cwd || "");
        S.cwd = f.cwd || "";
        updateTopbarCwd();
        showTab("files");
        setTimeout(loadFiles, 50);
      }});
      row.appendChild(el("div", { class: "file-row-icon", html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' }));
      const body = el("div", { class: "file-row-body" });
      body.appendChild(el("div", { class: "file-row-name", text: f.name }));
      if (f.cwd) body.appendChild(el("div", { class: "file-row-path", text: f.cwd }));
      row.appendChild(body);
      box.appendChild(row);
    });
  }

  /* ---- RENDER: Approvals ---- */
  function renderApprovals () {
    const box = $c("c-approvals-list");
    const wrap = $c("c-section-approvals");
    const count = $c("c-approvals-count");
    if (!box || !wrap) return;
    box.innerHTML = "";
    const approvals = (CS.dashboard && CS.dashboard.pendingApprovals) || [];
    if (count) count.textContent = approvals.length;
    if (count) count.classList.toggle("badge-warn", approvals.length > 0);
    wrap.hidden = approvals.length === 0;
    approvals.forEach(a => {
      box.appendChild(el("div", { class: "approval-row", text: a.title || a.command || "待审批事项" }));
    });
  }

  /* ---- RENDER: Usage ---- */
  function renderUsage () {
    const box = $c("c-usage");
    if (!box) return;
    box.innerHTML = "";
    const u = (CS.dashboard && CS.dashboard.usageSummary) || {};
    const stats = [
      { val: (u.sessionsStarted || 0), label: "任务数" },
      { val: (u.commandsRun || 0), label: "命令数" },
      { val: (u.totalDurationMin || 0) + "分", label: "总时长" },
    ];
    stats.forEach(s => {
      const d = el("div", { class: "usage-stat" });
      d.appendChild(el("div", { class: "usage-stat-val", text: s.val }));
      d.appendChild(el("div", { class: "usage-stat-label", text: s.label }));
      box.appendChild(d);
    });
  }

  /* ---- RENDER: Sidebar (UX-Reframe) ---- */
  function renderSidebarConnected () {
    const name = (CS.appState && CS.appState.server && (CS.appState.server.name || CS.appState.server.hostname)) || "—";
    const el2 = $c("sb-computer-name");
    if (el2) el2.textContent = name;
  }

  function renderSidebarRunningAgents () {
    const list = $c("sb-running-list");
    if (!list) return;
    const agents = (CS.dashboard && CS.dashboard.desktopContinuableAgents) || [];
    list.innerHTML = "";
    if (agents.length === 0) {
      list.appendChild(el("div", { class: "sidebar-empty", text: "无运行中的 Agent" }));
      return;
    }
    for (const a of agents) {
      const row = el("button", { class: "sidebar-running-row", onclick: () => openDesktopAgent(a.id) });
      row.appendChild(el("span", { class: "sidebar-running-icon", text: "🖥️" }));
      row.appendChild(el("span", { class: "sidebar-running-name", text: a.proc || a.id || "agent" }));
      const st = a.busy ? "running" : "idle";
      row.appendChild(el("span", { class: `sidebar-running-status is-${st}`, text: st }));
      list.appendChild(row);
    }
  }

  function renderSidebarProjects () {
    const list = $c("sb-projects-list");
    if (!list) return;
    const projects = CS.projects || [];
    list.innerHTML = "";
    if (projects.length === 0) {
      list.appendChild(el("div", { class: "sidebar-empty", text: "暂无项目" }));
      return;
    }
    for (const p of projects) {
      const item = el("div", { class: "sidebar-project" });
      const isExpanded = CS.expandedProjects.has(p.id);
      const header = el("button", { class: "sidebar-project-header", onclick: () => toggleProjectExpanded(p.id) });
      header.appendChild(el("span", { class: `sidebar-project-caret ${isExpanded ? "is-expanded" : ""}`, text: "▸" }));
      header.appendChild(el("span", { class: "sidebar-project-name", text: p.name || p.cwdLabel || p.cwd }));
      if (p.sessionCount > 0) {
        header.appendChild(el("span", { class: "sidebar-project-count", text: String(p.sessionCount) }));
      }
      item.appendChild(header);
      if (isExpanded) {
        const sessions = el("div", { class: "sidebar-project-sessions", id: `sb-sessions-${p.id}` });
        sessions.appendChild(el("div", { class: "sidebar-empty", text: "加载中..." }));
        item.appendChild(sessions);
        loadProjectSessions(p.id, p.cwd);
      }
      list.appendChild(item);
    }
  }

  async function loadProjectSessions (projectId, cwd) {
    try {
      const data = await cApi(`/api/mobile/sessions/by-cwd?cwd=${encodeURIComponent(cwd)}`);
      const sessions = (data && data.items) || [];
      const container = $c(`sb-sessions-${projectId}`);
      if (!container) return;
      container.innerHTML = "";
      if (sessions.length === 0) {
        container.appendChild(el("div", { class: "sidebar-empty", text: "暂无 session" }));
        return;
      }
      for (const s of sessions) {
        const row = el("button", { class: "sidebar-session-row", onclick: () => openMobileSession(s.id) });
        row.appendChild(el("span", { class: "sidebar-session-icon", text: agentIcon(s.agentId) }));
        row.appendChild(el("span", { class: "sidebar-session-title", text: s.title || s.agentId || "session" }));
        row.appendChild(el("span", { class: `sidebar-session-status is-${s.status}`, text: sessionStatusLabel(s.status) }));
        container.appendChild(row);
      }
    } catch (e) {
      const container = $c(`sb-sessions-${projectId}`);
      if (container) container.innerHTML = '<div class="sidebar-empty">加载失败</div>';
    }
  }

  function toggleProjectExpanded (projectId) {
    if (CS.expandedProjects.has(projectId)) {
      CS.expandedProjects.delete(projectId);
    } else {
      CS.expandedProjects.add(projectId);
    }
    renderSidebarProjects();
  }

  function agentIcon (agentId) {
    const id = (agentId || "").toLowerCase();
    if (id.includes("claude")) return "🤖";
    if (id.includes("codex")) return "⚡";
    if (id.includes("qoder")) return "🎯";
    if (id.includes("opencode")) return "📂";
    return "💬";
  }

  function sessionStatusLabel (status) {
    const labels = { running: "running", draft: "draft", done: "done", failed: "failed", idle: "idle" };
    return labels[status] || status || "—";
  }

  /* ---- RENDER: Home projects list ---- */
  function renderHomeProjectsList () {
    const list = $c("c-projects-list");
    if (!list) return;
    const projects = CS.projects || [];
    list.innerHTML = "";
    if (projects.length === 0) {
      list.appendChild(el("div", { class: "cockpit-empty", text: "暂无项目，请在电脑端打开 FanBox 创建项目" }));
      return;
    }
    for (const p of projects.slice(0, 8)) {
      const card = el("button", { class: "cockpit-project-card", onclick: () => openProjectOverview(p.id) });
      card.appendChild(el("div", { class: "cockpit-project-name", text: p.name || p.cwdLabel || p.cwd }));
      card.appendChild(el("div", { class: "cockpit-project-meta" }, [
        el("span", { text: `${p.sessionCount || 0} session` }),
        p.lastActiveAt ? el("span", { text: " · " + relTime(p.lastActiveAt) }) : null,
      ].filter(Boolean)));
      list.appendChild(card);
    }
  }

  /* ---- RENDER: Project Overview ---- */
  function openProjectOverview (projectId) {
    const project = (CS.projects || []).find(p => p.id === projectId);
    if (!project) return;
    CS.selectedProject = project;
    CS.selected = { type: "project", id: projectId };
    stopHomePoll();
    stopDetailPoll();
    switchContractView("project-overview");
    renderProjectOverview(project);
    loadProjectOverviewSessions(project.cwd);
  }

  function renderProjectOverview (project) {
    const titleEl = $c("po-title");
    const cwdEl = $c("po-cwd");
    if (titleEl) titleEl.textContent = project.name || project.cwdLabel || project.cwd;
    if (cwdEl) cwdEl.textContent = project.cwd;
  }

  async function loadProjectOverviewSessions (cwd) {
    const container = $c("po-sessions");
    if (!container) return;
    container.innerHTML = "";
    container.appendChild(el("div", { class: "sidebar-empty", text: "加载中..." }));
    try {
      const data = await cApi(`/api/mobile/sessions/by-cwd?cwd=${encodeURIComponent(cwd)}`);
      const sessions = (data && data.items) || [];
      container.innerHTML = "";
      if (sessions.length === 0) {
        container.appendChild(el("div", { class: "sidebar-empty", text: "暂无 session" }));
        return;
      }
      for (const s of sessions) {
        const row = el("button", { class: "po-session-row", onclick: () => openMobileSession(s.id) });
        row.appendChild(el("span", { class: "sidebar-session-icon", text: agentIcon(s.agentId) }));
        row.appendChild(el("span", { class: "po-session-title", text: s.title || s.agentId || "session" }));
        row.appendChild(el("span", { class: `sidebar-session-status is-${s.status}`, text: sessionStatusLabel(s.status) }));
        if (s.updatedAt) row.appendChild(el("span", { class: "po-session-time", text: relTime(s.updatedAt) }));
        container.appendChild(row);
      }
    } catch (e) {
      container.innerHTML = "";
      container.appendChild(el("div", { class: "sidebar-empty", text: "加载失败" }));
    }
  }

  /* ---- New Chat Modal ---- */
  function openNewChatModal () {
    const modal = $c("newchat-modal");
    if (!modal) return;
    const projectEl = $c("newchat-project-name");
    if (projectEl) {
      projectEl.textContent = CS.selectedProject ? (CS.selectedProject.name || CS.selectedProject.cwdLabel || CS.selectedProject.cwd) : "未选择项目";
    }
    renderNewChatAgents();
    const msgEl = $c("newchat-msg");
    if (msgEl) { msgEl.textContent = ""; msgEl.className = "msg"; }
    modal.hidden = false;
  }

  function closeNewChatModal () {
    const modal = $c("newchat-modal");
    if (!modal) return;
    modal.hidden = true;
    const msgEl = $c("newchat-msg");
    if (msgEl) msgEl.textContent = "";
    const titleEl = $c("newchat-title");
    if (titleEl) titleEl.value = "";
    const msgInput = $c("newchat-message");
    if (msgInput) msgInput.value = "";
  }

  function renderNewChatAgents () {
    const container = $c("newchat-agents");
    if (!container) return;
    const agents = (CS.appState && CS.appState.availableAgents) || [];
    container.innerHTML = "";
    if (agents.length === 0) {
      container.appendChild(el("div", { class: "sidebar-empty", text: "无可用 Agent" }));
      return;
    }
    if (!CS.selectedNewChatAgent) CS.selectedNewChatAgent = agents[0].id;
    for (const a of agents) {
      const chip = el("button", {
        class: `nt-agent-chip ${CS.selectedNewChatAgent === a.id ? "is-active" : ""}`,
        onclick: () => { CS.selectedNewChatAgent = a.id; renderNewChatAgents(); },
      });
      chip.appendChild(el("span", { class: "nt-agent-chip-icon", text: agentIcon(a.id) }));
      chip.appendChild(el("span", { text: a.name || a.id }));
      container.appendChild(chip);
    }
  }

  async function submitNewChat () {
    const msgEl = $c("newchat-msg");
    if (!CS.selectedProject) {
      if (msgEl) { msgEl.textContent = "请先在左侧选择一个项目"; msgEl.className = "msg msg-err"; }
      return;
    }
    const agentId = CS.selectedNewChatAgent || (CS.appState && CS.appState.availableAgents && CS.appState.availableAgents[0] && CS.appState.availableAgents[0].id);
    if (!agentId) {
      if (msgEl) { msgEl.textContent = "请选择 Agent"; msgEl.className = "msg msg-err"; }
      return;
    }
    const message = ($c("newchat-message") || {}).value || "";
    if (!message.trim()) {
      if (msgEl) { msgEl.textContent = "请输入任务描述"; msgEl.className = "msg msg-err"; }
      return;
    }
    const title = ($c("newchat-title") || {}).value || "";
    const submitBtn = $c("newchat-submit");
    if (submitBtn) submitBtn.disabled = true;
    try {
      const result = await createDraftSession({
        cwd: CS.selectedProject.cwd,
        agentId,
        title: title.trim() || undefined,
        initialMessage: message.trim(),
      });
      if (result && result.session) {
        closeNewChatModal();
        openMobileSession(result.session.id);
      } else {
        if (msgEl) { msgEl.textContent = "创建失败"; msgEl.className = "msg msg-err"; }
      }
    } catch (e) {
      if (msgEl) { msgEl.textContent = "创建失败: " + e.message; msgEl.className = "msg msg-err"; }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  /* ---- Right Files Drawer ---- */
  function openFilesDrawer () {
    const drawer = $c("files-drawer");
    const scrim = $c("files-drawer-scrim");
    if (!drawer) return;
    const cwd = (CS.selectedProject && CS.selectedProject.cwd) ||
                (CS.selected && CS.selected.cwd) ||
                (CS.appState && CS.appState.currentContext && CS.appState.currentContext.cwd);
    if (!cwd) {
      const cwdEl = $c("files-drawer-cwd");
      if (cwdEl) cwdEl.textContent = "请先选择项目";
      drawer.hidden = false;
      if (scrim) scrim.hidden = false;
      return;
    }
    drawer.hidden = false;
    if (scrim) scrim.hidden = false;
    loadFilesDrawerList(cwd);
  }

  function closeFilesDrawer () {
    const drawer = $c("files-drawer");
    const scrim = $c("files-drawer-scrim");
    const preview = $c("files-drawer-preview");
    if (drawer) drawer.hidden = true;
    if (scrim) scrim.hidden = true;
    if (preview) preview.hidden = true;
  }

  async function loadFilesDrawerList (cwd) {
    const cwdEl = $c("files-drawer-cwd");
    const listEl = $c("files-drawer-list");
    if (cwdEl) cwdEl.textContent = cwd;
    if (!listEl) return;
    listEl.innerHTML = "";
    listEl.appendChild(el("div", { class: "sidebar-empty", text: "加载中..." }));
    try {
      const data = await cApi(`/api/mobile/files?path=${encodeURIComponent(cwd)}`);
      const items = (data && data.items) || [];
      listEl.innerHTML = "";
      if (items.length === 0) {
        listEl.appendChild(el("div", { class: "sidebar-empty", text: "空文件夹" }));
        return;
      }
      for (const item of items) {
        const row = el("button", { class: `file-row ${item.kind === "directory" ? "is-folder" : "is-file"}`, "data-path": item.path || "" });
        row.appendChild(el("span", { class: "file-row-icon", text: fileTypeIcon(item) }));
        row.appendChild(el("span", { class: "file-row-name", text: item.name || item.path || "" }));
        if (item.size != null && item.kind !== "directory") {
          row.appendChild(el("span", { class: "file-row-meta", text: formatSize(item.size) }));
        }
        row.addEventListener("click", () => {
          if (item.kind === "directory") {
            loadFilesDrawerList(item.path);
          } else {
            openFilePreviewInDrawer(item);
          }
        });
        listEl.appendChild(row);
      }
    } catch (e) {
      listEl.innerHTML = "";
      listEl.appendChild(el("div", { class: "sidebar-empty", text: "加载失败: " + e.message }));
    }
  }

  function fileTypeIcon (item) {
    if (item.kind === "directory") return "📁";
    const name = (item.name || "").toLowerCase();
    if (name.endsWith(".pdf")) return "📕";
    if (/\.(docx?|)$/.test(name)) return "📘";
    if (/\.(xlsx?|csv)$/.test(name)) return "📗";
    if (/\.(pptx?)$/.test(name)) return "📙";
    if (/\.(md|markdown)$/.test(name)) return "📝";
    if (/\.(js|ts|py|go|rs|java|c|cpp|h|css|html|json|xml|sh|bat|ps1)$/.test(name)) return "⚙️";
    if (/\.(txt|log)$/.test(name)) return "📄";
    if (/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/.test(name)) return "🖼️";
    if (/\.(zip|rar|7z|tar|gz)$/.test(name)) return "🗜️";
    return "📄";
  }

  function formatSize (bytes) {
    if (bytes < 1024) return bytes + "B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + "KB";
    return (bytes / 1048576).toFixed(1) + "MB";
  }

  async function openFilePreviewInDrawer (item) {
    const preview = $c("files-drawer-preview");
    const nameEl = $c("files-drawer-preview-name");
    const subEl = $c("files-drawer-preview-sub");
    const bodyEl = $c("files-drawer-preview-body");
    if (!preview || !bodyEl) return;
    preview.hidden = false;
    if (nameEl) nameEl.textContent = item.name || item.path || "";
    if (subEl) subEl.textContent = item.size ? formatSize(item.size) : "";
    bodyEl.innerHTML = "加载中...";
    try {
      const data = await cApi(`/api/mobile/file?path=${encodeURIComponent(item.path)}`);
      bodyEl.innerHTML = "";
      const content = data && (data.content || data.text);
      if (data && data.fileType === "image" && data.thumbUrl) {
        bodyEl.appendChild(el("img", { src: data.thumbUrl, style: "max-width:100%;height:auto;border-radius:8px;" }));
      } else if (content) {
        const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
        const truncated = text.length > 50000 ? text.slice(0, 50000) + "\n\n... (已截断)" : text;
        bodyEl.appendChild(el("pre", { style: "white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;font-size:12px;margin:0;" }, { text: truncated }));
      } else {
        bodyEl.appendChild(el("div", { class: "sidebar-empty", text: "无法预览此文件类型" }));
      }
    } catch (e) {
      bodyEl.innerHTML = "";
      bodyEl.appendChild(el("div", { class: "sidebar-empty", text: "加载失败: " + e.message }));
    }
  }

  /* ---- Wire More/Debug toggle ---- */
  function wireSidebarMore () {
    const toggle = $c("sb-more-toggle");
    const nav = $c("sb-more-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      nav.hidden = !nav.hidden;
      toggle.classList.toggle("is-expanded", !nav.hidden);
    });
  }

  /* ---- Wire New Chat modal ---- */
  function wireNewChatModal () {
    const newChatBtn = $c("sidebar-new-chat");
    if (newChatBtn) newChatBtn.addEventListener("click", openNewChatModal);
    const closeBtn = $c("newchat-close");
    if (closeBtn) closeBtn.addEventListener("click", closeNewChatModal);
    const cancelBtn = $c("newchat-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", closeNewChatModal);
    const submitBtn = $c("newchat-submit");
    if (submitBtn) submitBtn.addEventListener("click", submitNewChat);
    const poNewTask = $c("po-new-task");
    if (poNewTask) poNewTask.addEventListener("click", openNewChatModal);
  }

  /* ---- Wire files drawer ---- */
  function wireFilesDrawer () {
    const openBtn = $c("app-files-drawer");
    if (openBtn) openBtn.addEventListener("click", openFilesDrawer);
    const closeBtn = $c("files-drawer-close");
    if (closeBtn) closeBtn.addEventListener("click", closeFilesDrawer);
    const scrim = $c("files-drawer-scrim");
    if (scrim) scrim.addEventListener("click", closeFilesDrawer);
    const previewClose = $c("files-drawer-preview-close");
    if (previewClose) previewClose.addEventListener("click", () => {
      const preview = $c("files-drawer-preview");
      if (preview) preview.hidden = true;
    });
    const searchInput = $c("files-drawer-q");
    if (searchInput) {
      let searchTimer = null;
      searchInput.addEventListener("input", () => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          const q = searchInput.value.trim();
          if (q.length < 2) return;
          const cwd = ($c("files-drawer-cwd") || {}).textContent || "";
          if (!cwd || cwd === "—") return;
          try {
            const data = await cApi(`/api/mobile/search?q=${encodeURIComponent(q)}&path=${encodeURIComponent(cwd)}`);
            const items = (data && data.items) || [];
            const listEl = $c("files-drawer-list");
            if (!listEl) return;
            listEl.innerHTML = "";
            if (items.length === 0) {
              listEl.appendChild(el("div", { class: "sidebar-empty", text: "无匹配文件" }));
              return;
            }
            for (const item of items) {
              const row = el("button", { class: `file-row ${item.kind === "directory" ? "is-folder" : "is-file"}`, "data-path": item.path || "" });
              row.appendChild(el("span", { class: "file-row-icon", text: fileTypeIcon(item) }));
              row.appendChild(el("span", { class: "file-row-name", text: item.name || item.path || "" }));
              row.addEventListener("click", () => {
                if (item.kind === "directory") {
                  loadFilesDrawerList(item.path);
                } else {
                  openFilePreviewInDrawer(item);
                }
              });
              listEl.appendChild(row);
            }
          } catch (e) { /* ignore */ }
        }, 300);
      });
    }
  }

  /* ---- RENDER: Contract Home ---- */
  function renderContractHome () {
    renderConnection();
    renderScopesSummary();
    renderSidebarConnected();
    renderSidebarRunningAgents();
    renderSidebarProjects();
    renderHomeProjectsList();
  }

  /* ---- RENDER: Timeline Events ---- */
  function renderTimelineEvents (container, events, isDesktop) {
    container.innerHTML = "";
    if (!events || events.length === 0) {
      container.appendChild(el("div", { class: "tl-empty" }, { text: "暂无事件" }));
      return;
    }

    events.forEach(ev => {
      if (ev.redacted) {
        const e = el("div", { class: "tl-event is-system" });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: shortTime(ev.timestamp) || "" }),
        ]));
        e.appendChild(el("div", { class: "tl-event-body tl-redacted", text: "🔒 此事件内容已安全裁剪 · 仅保留时间戳" }));
        container.appendChild(e);
        return;
      }

      const type = ev.type || "";

      if (type === "message" || type === "user" || type === "assistant") {
        const role = ev.role || (type === "user" ? "user" : type === "assistant" ? "assistant" : (ev.fromUser ? "user" : "assistant"));
        if (role === "user") {
          const bubble = el("div", { class: "tl-event-msg-user", text: ev.content || ev.text || "" });
          if (ev.draftPending) bubble.classList.add("is-draft-pending");
          container.appendChild(bubble);
        } else {
          const wrap = el("div", { class: "tl-event-msg-agent" });
          wrap.appendChild(el("div", { class: "tl-event-msg-agent-icon", text: "🤖" }));
          wrap.appendChild(el("div", { class: "tl-event-msg-agent-bubble", text: ev.content || ev.text || "" }));
          container.appendChild(wrap);
        }
        return;
      }

      if (type === "input_sent") {
        const e = el("div", { class: "tl-event is-user" });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: "📱 你从手机发送了 follow-up · " + shortTime(ev.timestamp) }),
        ]));
        const len = (ev.meta && ev.meta.inputLength) || 0;
        e.appendChild(el("div", { class: "tl-event-body", text: len > 0 ? `（${len} 字符）` : "已送达" }));
        container.appendChild(e);
        return;
      }

      if (type === "status_snapshot" || type === "status_change") {
        const statCls = ev.status === "running" ? "is-running" : ev.status === "exited" ? "is-success" : ev.status === "waiting_input" ? "is-status" : "is-status";
        const label = type === "status_change" ? `状态: ${ev.from || "?"} → ${ev.to || ev.status}` : `状态: ${ev.status}`;
        const e = el("div", { class: `tl-event ${statCls}` });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: label + " · " + shortTime(ev.timestamp) }),
        ]));
        if (ev.text) {
          const preview = ev.text.length > 200 ? ev.text.slice(-200) + "…" : ev.text;
          e.appendChild(el("div", { class: "tl-event-body", style: "white-space:pre-wrap;font-family:monospace;font-size:11px;max-height:120px;overflow-y:auto;opacity:0.8;" }, { text: preview }));
        }
        container.appendChild(e);
        return;
      }

      if (type === "output_tail") {
        const e = el("div", { class: "tl-event is-running" });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: "Output · " + shortTime(ev.timestamp) }),
        ]));
        const body = el("div", { class: "tl-event-body" });
        const out = el("div", { class: "tl-output", text: ev.text || "" });
        body.appendChild(out);
        if (ev.meta && ev.meta.redactionCount > 0) {
          body.appendChild(el("div", { class: "tl-output-redacted", text: `🔒 ${ev.meta.redactionCount} 条敏感行已裁剪` }));
        }
        e.appendChild(body);
        container.appendChild(e);
        return;
      }

      if (type === "process_exit") {
        const exitCode = (ev.meta && ev.meta.exitCode) || 0;
        const statCls = exitCode === 0 ? "is-success" : "is-error";
        const e = el("div", { class: `tl-event ${statCls}` });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: `进程退出 · code ${exitCode} · ${shortTime(ev.timestamp)}` }),
        ]));
        container.appendChild(e);
        return;
      }

      if (type === "error") {
        const e = el("div", { class: "tl-event is-error" });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: "Error · " + shortTime(ev.timestamp) }),
        ]));
        if (ev.text) e.appendChild(el("div", { class: "tl-event-body", text: ev.text }));
        container.appendChild(e);
        return;
      }

      if (type === "waiting_input") {
        const e = el("div", { class: "tl-event is-status" });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: "等待输入 · " + shortTime(ev.timestamp) }),
        ]));
        container.appendChild(e);
        return;
      }

      if (type === "recent_files") {
        const e = el("div", { class: "tl-event is-status" });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: "最近文件 · " + shortTime(ev.timestamp) }),
        ]));
        const body = el("div", { class: "tl-event-body" });
        const files = (ev.meta && ev.meta.files) || ev.files || [];
        if (files.length > 0) {
          const chips = el("div", { class: "tl-files" });
          files.forEach(f => {
            chips.appendChild(el("span", { class: "tl-file-chip", text: f.name || f.path || f }));
          });
          body.appendChild(chips);
        }
        e.appendChild(body);
        container.appendChild(e);
        return;
      }

      if (type === "session_created") {
        const e = el("div", { class: "tl-event is-draft" });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: "📝 草稿已创建 · " + shortTime(ev.timestamp) }),
        ]));
        e.appendChild(el("div", { class: "tl-event-body", text: "任务草稿已保存，点击下方「启动 Agent」开始执行" }));
        container.appendChild(e);
        return;
      }

      if (type === "draft_ready") {
        const e = el("div", { class: "tl-event is-draft" });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: "✓ 草稿就绪 · " + shortTime(ev.timestamp) }),
        ]));
        e.appendChild(el("div", { class: "tl-event-body", text: "可以启动 Agent 了" }));
        container.appendChild(e);
        return;
      }

      if (type === "agent_start_requested") {
        const e = el("div", { class: "tl-event is-running" });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: "⏳ 启动请求已发送 · " + shortTime(ev.timestamp) }),
        ]));
        container.appendChild(e);
        return;
      }

      if (type === "agent_started") {
        const e = el("div", { class: "tl-event is-running" });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: "▶️ Agent 已启动 · " + shortTime(ev.timestamp) }),
        ]));
        container.appendChild(e);
        return;
      }

      if (type === "agent_completed") {
        const exitCode = (ev.meta && ev.meta.exitCode) || 0;
        const statCls = exitCode === 0 ? "is-success" : "is-error";
        const e = el("div", { class: `tl-event ${statCls}` });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: (exitCode === 0 ? "✅ " : "⚠️ ") + "Agent 已完成 · " + shortTime(ev.timestamp) }),
        ]));
        if (exitCode !== 0 && exitCode !== null && exitCode !== undefined) {
          e.appendChild(el("div", { class: "tl-event-body", text: `退出码: ${exitCode}` }));
        }
        container.appendChild(e);
        return;
      }

      if (type === "agent_start_failed") {
        const e = el("div", { class: "tl-event is-error" });
        e.appendChild(el("div", { class: "tl-event-meta" }, [
          el("span", { class: "tl-event-dot" }),
          el("span", { text: "❌ 启动失败 · " + shortTime(ev.timestamp) }),
        ]));
        e.appendChild(el("div", { class: "tl-event-body", text: ev.reason || ev.error || "未知错误" }));
        container.appendChild(e);
        return;
      }

      // Fallback for unknown event types
      const e = el("div", { class: "tl-event is-system" });
      e.appendChild(el("div", { class: "tl-event-meta" }, [
        el("span", { class: "tl-event-dot" }),
        el("span", { text: (type || "event") + " · " + shortTime(ev.timestamp) }),
      ]));
      container.appendChild(e);
    });
  }

  /* ---- RENDER: Desktop Agent Detail ---- */
  function renderDesktopDetail (agentId) {
    const data = CS.timelines.get(`desktop:${agentId}`);
    const titleEl = $c("d-title");
    const subEl = $c("d-sub");
    const statusEl = $c("d-status-pill");
    const iconEl = $c("d-icon");
    const timeline = $c("d-timeline");
    const composer = $c("d-composer");
    const startZone = $c("d-start-zone");

    if (!titleEl) return;

    startZone.hidden = true;

    if (!data) {
      titleEl.textContent = "Loading...";
      subEl.textContent = agentId;
      if (statusEl) statusEl.innerHTML = "";
      if (iconEl) iconEl.textContent = "💻";
      if (timeline) timeline.innerHTML = '<div class="tl-empty">加载中...</div>';
      composer.hidden = true;
      return;
    }

    const info = data || {};
    titleEl.textContent = info.label || agentId;
    subEl.textContent = info.projectName || info.cwdLabel || info.cwd || "";
    if (iconEl) iconEl.textContent = "💻";

    if (statusEl) {
      statusEl.innerHTML = "";
      statusEl.appendChild(statusPill(info.status));
    }

    renderTimelineEvents(timeline, data.events || [], true);

    // Composer / follow-up
    const canSend = !!info.canSendFollowup;
    composer.hidden = false;
    const input = $c("d-input");
    const sendBtn = $c("d-send");
    const hint = $c("d-composer-hint");
    if (input) {
      input.disabled = !canSend;
      input.placeholder = canSend ? "输入 follow-up 消息..." : (info.followupBlockedReason || "无继续输入权限");
    }
    if (sendBtn) sendBtn.disabled = !canSend;
    if (hint) hint.textContent = canSend ? "消息将发送到电脑端 Agent" : (info.followupBlockedReason || getFollowupBlockedReason(info) || "当前设备未开启「继续输入」权限");
  }

  /* ---- RENDER: Mobile Session Detail ---- */
  function renderMobileDetail (sessionId) {
    const data = CS.timelines.get(`mobile:${sessionId}`);
    const titleEl = $c("d-title");
    const subEl = $c("d-sub");
    const statusEl = $c("d-status-pill");
    const iconEl = $c("d-icon");
    const timeline = $c("d-timeline");
    const composer = $c("d-composer");
    const startZone = $c("d-start-zone");

    if (!titleEl) return;

    composer.hidden = true;

    if (!data) {
      titleEl.textContent = "Loading...";
      subEl.textContent = sessionId;
      if (statusEl) statusEl.innerHTML = "";
      if (iconEl) iconEl.textContent = "📱";
      if (timeline) timeline.innerHTML = '<div class="tl-empty">加载中...</div>';
      startZone.hidden = true;
      return;
    }

    const s = data || {};
    titleEl.textContent = s.title || s.name || sessionId.slice(0, 8);
    subEl.textContent = `${s.agentId || "claude"}${s.cwdLabel ? " · " + s.cwdLabel : (s.cwd ? " · " + s.cwd : "")}`;
    if (iconEl) iconEl.textContent = "📱";

    if (statusEl) {
      statusEl.innerHTML = "";
      statusEl.appendChild(statusPill(s.status));
    }

    renderTimelineEvents(timeline, data.events || [], false);

    // Start zone
    const scopes = (CS.appState && CS.appState.auth && CS.appState.auth.scopes) || [];
    const hasStartScope = scopes.includes("session:start");
    const isDraft = s.status === "draft";
    const isFailed = s.status === "failed" || s.status === "agent_start_failed";
    const canStart = (isDraft || isFailed) && hasStartScope;

    startZone.hidden = !isDraft && !isFailed;
    const startBtn = $c("d-start");
    const startHint = $c("d-start-hint");

    if (startBtn) {
      startBtn.disabled = !canStart;
      startBtn.textContent = isFailed ? "重试启动" : "启动 Agent";
      startBtn.onclick = async () => {
        if (!confirm("确认启动 Agent？")) return;
        startBtn.disabled = true;
        startBtn.textContent = "启动中...";
        try {
          await startMobileSession(sessionId);
          await loadMobileTimeline(sessionId);
          await loadDashboard();
          renderMobileDetail(sessionId);
        } catch (e) {
          alert("启动失败: " + e.message);
          startBtn.disabled = false;
          startBtn.textContent = isFailed ? "重试启动" : "启动 Agent";
        }
      };
    }
    if (startHint) {
      if (isDraft && !hasStartScope) {
        startHint.textContent = "当前设备没有「启动任务」权限，请在电脑端授权 session:start";
      } else if (isFailed) {
        startHint.textContent = "上次启动失败，可以重试";
      } else if (isDraft) {
        startHint.textContent = "点击启动后，Agent 将在电脑端执行任务";
      } else {
        startHint.textContent = "";
      }
    }
  }

  /* ---- Navigation ---- */
  function setTopbarElements(viewName) {
    const dd = $c("agent-dropdown");
    const cwd = $c("topbar-cwd");
    const isContract = viewName === "home-cockpit" || viewName === "agent-detail" || viewName === "project-overview" || viewName === "safety" || viewName === "projects" || viewName === "files";
    if (dd) dd.style.display = isContract ? "none" : "";
    if (cwd) cwd.style.display = isContract ? "none" : "";
  }

  function switchContractView (viewName) {
    S.currentTab = viewName;
    qsa(".view").forEach(v => { v.hidden = true; v.classList.remove("is-active"); });
    const view = document.querySelector(`[data-view="${viewName}"]`);
    if (view) { view.hidden = false; view.classList.add("is-active"); }
    qsa(".sidebar-item").forEach(btn => {
      btn.classList.toggle("is-active", btn.getAttribute("data-go") === viewName);
    });
    const backBtn = $c("app-back");
    if (backBtn) backBtn.hidden = viewName === "home-cockpit";
    const titleEl = $c("app-topbar-title");
    if (titleEl) {
      if (viewName === "home-cockpit") titleEl.textContent = "FanBox Mobile";
      else if (viewName === "project-overview") titleEl.textContent = (CS.selectedProject && CS.selectedProject.name) || "Project";
      else if (viewName === "agent-detail") titleEl.textContent = "Detail";
      else if (viewName === "safety") titleEl.textContent = "Safety";
      else if (viewName === "projects") titleEl.textContent = "Projects";
      else if (viewName === "files") titleEl.textContent = "Files";
    }
    setTopbarElements(viewName);
    if (window.innerWidth < 1024) closeSidebar();
  }

  function openHome () {
    stopDetailPoll();
    switchContractView("home-cockpit");
    refreshAll();
    startHomePoll();
  }

  function openSafety () {
    stopHomePoll();
    stopDetailPoll();
    switchContractView("safety");
    refreshSafety();
  }

  function openProjects () {
    stopHomePoll();
    stopDetailPoll();
    switchContractView("projects");
    refreshProjects();
  }

  function openFiles () {
    stopHomePoll();
    stopDetailPoll();
    switchContractView("files");
    if (typeof loadFiles === "function") loadFiles();
    loadRecentFiles();
  }

  async function loadRecentFiles () {
    const box = $c("files-recent");
    const listEl = $c("files-recent-list");
    if (!box || !listEl) return;
    try {
      const d = await cApi("/api/mobile/files/recent?limit=15");
      const items = (d && d.items) || [];
      if (items.length === 0) {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      listEl.innerHTML = "";
      for (const f of items) {
        const row = el("div", { class: "files-recent-item", role: "listitem", "data-path": f.path || "" }, [
          el("span", { class: "files-recent-icon" }, { text: f.kind === "directory" ? "📁" : "📄" }),
          el("span", { class: "files-recent-name" }, { text: f.name || f.path || "" }),
          el("span", { class: "files-recent-source" }, { text: f.source || "" }),
        ]);
        if (f.path) {
          row.addEventListener("click", () => {
            if (typeof loadFiles === "function") loadFiles(f.path);
          });
        }
        listEl.appendChild(row);
      }
    } catch (e) {
      box.hidden = true;
    }
  }

  function openDesktopAgent (agentId) {
    CS.selected = { type: "desktop-agent", id: agentId };
    stopHomePoll();
    switchContractView("agent-detail");
    loadDesktopTimeline(agentId).then(() => renderDesktopDetail(agentId));
    startDetailPoll(agentId, "desktop");
  }

  function openMobileSession (sessionId) {
    CS.selected = { type: "mobile-session", id: sessionId };
    stopHomePoll();
    switchContractView("agent-detail");
    loadMobileTimeline(sessionId).then(() => renderMobileDetail(sessionId));
    startDetailPoll(sessionId, "mobile");
  }

  function goBack () {
    if (S.currentTab === "agent-detail" && CS.selectedProject) {
      openProjectOverview(CS.selectedProject.id);
    } else {
      openHome();
    }
  }

  /* ---- Polling ---- */
  function startHomePoll () {
    stopHomePoll();
    CS.pollTimer = setInterval(() => {
      if (S.currentTab === "home-cockpit") refreshAll();
    }, 5000);
  }
  function stopHomePoll () {
    if (CS.pollTimer) { clearInterval(CS.pollTimer); CS.pollTimer = null; }
  }
  function startDetailPoll (id, type) {
    stopDetailPoll();
    CS.detailPollTimer = setInterval(() => {
      if (S.currentTab !== "agent-detail" || !CS.selected) return;
      if (type === "desktop") {
        loadDesktopTimeline(id).then(() => renderDesktopDetail(id));
      } else {
        loadMobileTimeline(id).then(() => renderMobileDetail(id));
      }
    }, 3000);
  }
  function stopDetailPoll () {
    if (CS.detailPollTimer) { clearInterval(CS.detailPollTimer); CS.detailPollTimer = null; }
  }

  /* ---- Refresh all home data ---- */
  async function refreshAll () {
    try {
      await Promise.all([loadAppState(), loadDashboard()]);
    } catch (e) { /* errors stored in CS.errors */ }
    renderContractHome();
  }

  /* ---- Wire up detail composer send ---- */
  function wireDetailComposer () {
    const input = $c("d-input");
    const sendBtn = $c("d-send");

    async function doSend () {
      if (!CS.selected || CS.selected.type !== "desktop-agent") return;
      const msg = input.value.trim();
      if (!msg) return;
      sendBtn.disabled = true;
      input.disabled = true;
      try {
        await sendDesktopInput(CS.selected.id, msg);
        input.value = "";
        renderDesktopDetail(CS.selected.id);
      } catch (e) {
        alert("发送失败: " + e.message);
      } finally {
        sendBtn.disabled = false;
        const data = CS.timelines.get(`desktop:${CS.selected.id}`);
        input.disabled = !(data && data.canSendFollowup);
      }
    }

    if (sendBtn) sendBtn.addEventListener("click", doSend);
    if (input) input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
  }

  /* ---- Wire back button ---- */
  function wireBackButton () {
    const backBtn = $c("app-back");
    if (backBtn) backBtn.addEventListener("click", goBack);
  }

  /* ---- Wire refresh for contract views ---- */
  function wireRefresh () {
    const refresh = $c("app-refresh");
    if (!refresh) return;
    refresh.addEventListener("click", () => {
      if (S.currentTab === "home-cockpit") refreshAll();
      else if (S.currentTab === "agent-detail" && CS.selected) {
        if (CS.selected.type === "desktop-agent") {
          loadDesktopTimeline(CS.selected.id).then(() => renderDesktopDetail(CS.selected.id));
        } else {
          loadMobileTimeline(CS.selected.id).then(() => renderMobileDetail(CS.selected.id));
        }
      } else if (S.currentTab === "project-overview" && CS.selectedProject) {
        loadProjectOverviewSessions(CS.selectedProject.cwd);
      } else if (S.currentTab === "safety") refreshSafety();
      else if (S.currentTab === "projects") refreshProjects();
      else if (S.currentTab === "files" && typeof loadFiles === "function") loadFiles();
    });
    const safetyRefresh = $c("safety-refresh");
    if (safetyRefresh) safetyRefresh.addEventListener("click", refreshSafety);
    const projectsRefresh = $c("projects-refresh");
    if (projectsRefresh) projectsRefresh.addEventListener("click", refreshProjects);
  }

  /* ---- Wire all legacy sidebar tabs to stop polls ---- */
  function wireLegacySidebarTabs () {
    const contractTabs = ["home-cockpit", "safety", "projects", "files"];
    qsa(".sidebar-item").forEach(btn => {
      const tab = btn.getAttribute("data-go");
      if (tab && !contractTabs.includes(tab)) {
        btn.addEventListener("click", () => {
          stopHomePoll();
          stopDetailPoll();
          const titleEl = $c("app-topbar-title");
          if (titleEl) titleEl.textContent = "FanBox";
          setTopbarElements(tab);
        });
      }
    });
  }

  /* ---- Override sidebar for contract views ---- */
  function wireContractSidebar () {
    qsa(".sidebar-item").forEach(btn => {
      const tab = btn.getAttribute("data-go");
      if (tab === "home-cockpit") {
        btn.addEventListener("click", (e) => {
          e.stopImmediatePropagation();
          openHome();
        });
      } else if (tab === "safety") {
        btn.addEventListener("click", (e) => {
          e.stopImmediatePropagation();
          openSafety();
        });
      } else if (tab === "projects") {
        btn.addEventListener("click", (e) => {
          e.stopImmediatePropagation();
          openProjects();
        });
      } else if (tab === "files") {
        btn.addEventListener("click", (e) => {
          e.stopImmediatePropagation();
          openFiles();
        });
      }
    });
  }

  /* ---- Init after pairing ---- */
  async function startContractMode () {
    if (!USE_CONTRACT_HOME) return;
    CS.token = S.token;
    wireNewTaskForm();
    wireDetailComposer();
    wireBackButton();
    wireRefresh();
    wireContractSidebar();
    wireLegacySidebarTabs();
    wireSidebarMore();
    wireNewChatModal();
    wireFilesDrawer();
    await loadProjects();
    openHome();
  }

  /* ---- Hook into existing showApp ---- */
  const _origShowApp = showApp;
  showApp = function () {
    $c("pair-screen").hidden = true;
    $c("app").hidden = false;
    buildAgentDropdownMenu();
    updateAgentDropdownDisplay();
    updateTopbarCwd();
    renderTaskChips();
    if (USE_CONTRACT_HOME) {
      startContractMode();
    } else {
      _origShowApp();
    }
  };

  /* ---- Expose minimal API ---- */
  return { start: startContractMode, openHome, openDesktopAgent, openMobileSession, openSafety, openProjects, openFiles };
})();
