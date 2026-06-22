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
    showPair();
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
    if (!data) { showPair(); return; }
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

function showPair () {
  $("pair-screen").hidden = false;
  $("app").hidden = true;
  // clear any stale token
  S.token = null;
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

  // Create assistant bubble with initial trace
  const pendingAssistant = {
    role: "assistant",
    status: "running",
    content: "",
    trace: [
      { label: "准备工作区上下文", state: "done" }
    ],
    _streamDelta: ""  // Phase UI-A8-6: accumulated delta text
  };
  if (selectedSkill && selectedSkill.title) {
    pendingAssistant.trace.push({ label: "使用 Skill: " + selectedSkill.title, state: "done" });
  }
  pendingAssistant.trace.push({ label: "调用 " + agentIdForDisplay(mapAgentId(S.currentAgent)), state: "running" });
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
      pendingAssistant.content = pendingAssistant._streamDelta || "已停止";
      pendingAssistant.trace = (pendingAssistant.trace || []).map(t =>
        t.state === "running" ? Object.assign({}, t, { state: "failed" }) : t
      );
      setRunning(false);
      $("home-status-pill").textContent = "已停止";
      $("home-status-pill").className = "home-status-pill is-failed";
      renderMessages();
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
        last.trace = (last.trace || []).map(t => t.state === "running" ? Object.assign({}, t, { state: "failed" }) : t);
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
    pendingAssistant.content = pendingAssistant._streamDelta || pendingAssistant.content || "";
    pendingAssistant.trace = (pendingAssistant.trace || []).map(t =>
      t.state === "running" ? Object.assign({}, t, { state: "done" }) : t
    );
  }

  setRunning(false);
  const pill = $("home-status-pill");
  if (pill) {
    pill.textContent = "完成";
    pill.className = "home-status-pill is-ready";
  }
  renderMessages();
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

/** Handle a single stream event, update pendingAssistant in place */
function handleStreamEvent (event, pendingAssistant) {
  const d = event.data;
  switch (event.type) {
    case 'start':
      // Initial event — nothing special to do
      break;

    case 'session':
      // Update sessionId
      if (d && d.sessionId && d.sessionId !== S.sessionId) {
        S.sessionId = d.sessionId;
        try { localStorage.setItem(SESSION_KEY, d.sessionId); } catch (_) {}
      }
      break;

    case 'step':
      // Update trace steps
      if (d && d.label) {
        const trace = pendingAssistant.trace || [];
        const existing = trace.find(t => t.label === d.label);
        if (existing) {
          existing.state = d.status || d.state || 'running';
          if (d.text) existing.text = d.text;
        } else {
          trace.push({ label: d.label, state: d.status || d.state || 'running', text: d.text || '' });
        }
        pendingAssistant.trace = trace;
      }
      renderMessages();
      scrollMessages();
      break;

    case 'thought':
      // Phase UI-A8-7 P2: Natural language reasoning
      if (d && d.text) {
        pendingAssistant._thought = (pendingAssistant._thought || '') + d.text;
        renderMessages();
        scrollMessages();
      }
      break;

    case 'skill':
      // Phase UI-A8-7 P2: Skill card
      if (d && d.skillId) {
        pendingAssistant._skill = { skillId: d.skillId, skillName: d.skillName || d.skillId, description: d.description || '' };
        renderMessages();
        scrollMessages();
      }
      break;

    case 'tool':
      // Phase UI-A8-7 P2: Tool/command step
      if (d && d.id) {
        const tools = pendingAssistant._tools || [];
        const existing = tools.find(t => t.id === d.id);
        if (existing) {
          existing.status = d.status || existing.status;
          if (d.label) existing.label = d.label;
        } else {
          tools.push({ id: d.id, label: d.label || d.id, status: d.status || 'running', safe: !!d.safe });
        }
        pendingAssistant._tools = tools;
        renderMessages();
        scrollMessages();
      }
      break;

    case 'command_output':
      // Phase UI-A8-7 P2: Tool/command output
      if (d && d.id) {
        const tools = pendingAssistant._tools || [];
        const tool = tools.find(t => t.id === d.id);
        if (tool) {
          tool.status = d.status || 'done';
          if (d.output) tool.output = d.output;
        }
        pendingAssistant._tools = tools;
        renderMessages();
        scrollMessages();
      }
      break;

    case 'delta':
      // Append incremental text
      if (d && d.text) {
        pendingAssistant._streamDelta = (pendingAssistant._streamDelta || '') + d.text;
        pendingAssistant.content = pendingAssistant._streamDelta;
        renderMessages();
        scrollMessages();
      }
      break;

    case 'done':
      // Final event
      if (d && d.message && d.message.content) {
        pendingAssistant._streamDelta = d.message.content;
        pendingAssistant.content = d.message.content;
      }
      pendingAssistant.status = "done";
      pendingAssistant.trace = (pendingAssistant.trace || []).map(t =>
        t.state === "running" ? Object.assign({}, t, { state: "done" }) : t
      );
      // Mark all tools as done
      if (pendingAssistant._tools) {
        pendingAssistant._tools.forEach(t => { if (t.status === 'running') t.status = 'done'; });
      }
      if (d && d.status === 'failed') {
        pendingAssistant.status = "failed";
      }
      renderMessages();
      scrollMessages();
      break;

    case 'error':
      // Error event — show friendly message
      pendingAssistant.status = "failed";
      const errMsg = (d && d.message) ? d.message :
                     (d && d.error) ? friendlySendError(mapAgentId(S.currentAgent), d.error) :
                     'Agent 暂不可用，请稍后再试。';
      pendingAssistant.content = errMsg;
      pendingAssistant.trace = (pendingAssistant.trace || []).map(t =>
        t.state === "running" ? Object.assign({}, t, { state: "failed" }) : t
      );
      if (pendingAssistant._tools) {
        pendingAssistant._tools.forEach(t => { if (t.status === 'running') t.status = 'failed'; });
      }
      renderMessages();
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
    pendingAssistant.trace = (pendingAssistant.trace || []).map(t => t.state === "running" ? Object.assign({}, t, { state: "failed" }) : t);
    $("home-status-pill").textContent = "失败";
    $("home-status-pill").className = "home-status-pill is-failed";
  } else {
    const text = (data.message && data.message.content) || data.reply || data.text || "";
    pendingAssistant.status = "done";
    pendingAssistant.content = text;
    pendingAssistant._streamDelta = text;
    pendingAssistant.trace = data.trace || (pendingAssistant.trace || []).map(t => t.state === "running" ? Object.assign({}, t, { state: "done" }) : t);
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

  renderMessages();
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

    // Phase UI-A8-7 P2: Codex-like Run Timeline
    if (msg.role !== "user") {
      // Thought (natural language reasoning)
      if (msg._thought) {
        const thoughtEl = el("div", "run-thinking");
        thoughtEl.innerHTML = '<span class="run-thinking-label">正在思考</span><p class="run-thinking-text">' + htmlEscape(msg._thought) + '</p>';
        bubble.appendChild(thoughtEl);
      }
      // Skill card
      if (msg._skill) {
        const skillEl = el("div", "run-skill");
        skillEl.innerHTML =
          '<span class="run-skill-label">使用 Skill</span>' +
          '<div class="run-skill-card">' +
            '<span class="run-skill-name">' + htmlEscape(msg._skill.skillName || msg._skill.skillId) + '</span>' +
            (msg._skill.description ? '<span class="run-skill-desc">' + htmlEscape(msg._skill.description) + '</span>' : '') +
          '</div>';
        bubble.appendChild(skillEl);
      }
      // Tools/commands
      if (msg._tools && msg._tools.length) {
        const toolsEl = el("div", "run-tools");
        toolsEl.innerHTML = '<span class="run-tools-label">工具 / 命令</span>';
        for (const tool of msg._tools) {
          const toolEl = el("div", "run-command is-" + (tool.status || 'running'));
          const statusIcon = tool.status === 'done' ? '&#10003;' : (tool.status === 'failed' ? '&#10007;' : '<span class="run-command-spinner"></span>');
          toolEl.innerHTML =
            '<div class="run-command-head">' +
              '<span class="run-command-icon">' + statusIcon + '</span>' +
              '<span class="run-command-label">$ ' + htmlEscape(tool.label || tool.id) + '</span>' +
            '</div>';
          if (tool.output) {
            const outputEl = el("div", "run-command-output");
            const truncated = tool.output.length > 200 ? tool.output.slice(0, 200) + '…' : tool.output;
            outputEl.innerHTML = '<code>' + htmlEscape(truncated) + '</code>';
            if (tool.output.length > 200) {
              outputEl.classList.add('is-collapsed');
              const toggle = el("button", "run-command-toggle");
              toggle.textContent = "展开";
              toggle.addEventListener("click", function () {
                const c = outputEl.classList.contains('is-collapsed');
                outputEl.classList.toggle('is-collapsed');
                toggle.textContent = c ? "收起" : "展开";
                if (c) {
                  outputEl.innerHTML = '<code>' + htmlEscape(tool.output) + '</code>';
                } else {
                  outputEl.innerHTML = '<code>' + htmlEscape(truncated) + '</code>';
                }
              });
              toolEl.appendChild(outputEl);
              toolEl.appendChild(toggle);
            } else {
              toolEl.appendChild(outputEl);
            }
          }
          toolsEl.appendChild(toolEl);
        }
        bubble.appendChild(toolsEl);
      }
      // Legacy trace steps (backward compat)
      if (msg.trace && msg.trace.length && !msg._tools && !msg._thought) {
        bubble.appendChild(renderStreamSteps(msg.trace));
      }
    }

    // Content area (final text)
    const contentEl = el("div", "run-final");
    const displayText = msg.status === "running" && !msg.content && !(msg._streamDelta) && !msg._thought ? "思考中…" : (msg.content || msg._streamDelta || "");
    if (displayText) {
      contentEl.innerHTML = escapeHtmlForDisplay(displayText);
      bubble.appendChild(contentEl);
    }

    row.appendChild(avatar);
    row.appendChild(bubble);
    container.appendChild(row);
  });
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
    const items = (data.roots || []).map(r => ({
      name: r.name,
      path: r.path,
      isDir: true,
      kind: 'drive',
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
    const isDir = !!(it.isDir || it.isFolder || it.is_directory || it.kind === 'dir');
    return {
      name: it.name || '',
      path: it.path || '',
      isDir,
      kind: isDir ? 'folder' : (it.kind || 'file'),
      size: Number.isFinite(it.size) ? it.size : 0,
      mtime: Number.isFinite(it.mtime) ? it.mtime : 0,
    };
  }).filter(it => it.name);
}

/** 渲染错误态（401/403/500/网络） */
function renderFilesError (err) {
  const msg = (err && err.message) ? String(err.message) : '加载失败';
  let hint = msg;
  // 401 → 已被 api() 拦截 clearToken + showPair，此分支实际不会触发
  if (/403/.test(msg) || /path_not_allowed|forbidden_path/.test(msg)) {
    hint = "无权限访问该路径";
  } else if (/404|not_found/.test(msg)) {
    hint = "路径不存在";
  }
  return `<div class="files-empty"><div class="files-empty-strong">加载失败</div><div class="files-empty-hint">${htmlEscape(hint)}</div></div>`;
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
    const aDir = !!(a.isDir || a.kind === 'dir' || a.kind === 'drive');
    const bDir = !!(b.isDir || b.kind === 'dir' || b.kind === 'drive');
    if (aDir !== bDir) return aDir ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  sorted.forEach((item, idx) => {
    const isFolder = !!(item.isDir || item.kind === 'dir' || item.kind === 'drive' || opts.isRoots);
    const type = isFolder ? 'folder' : fileTypeFor(item);
    const icon = FILE_ICONS[type] || FILE_ICONS.unknown;
    const meta = isFolder
      ? "文件夹"
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
  const isFolder = !!(item.isDir || item.kind === 'dir' || item.kind === 'drive' || opts.isRoots);
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
  try {
    const data = await api("/api/mobile/skills");
    if (Array.isArray(data)) rawSkills = data;
    else if (data && Array.isArray(data.items)) rawSkills = data.items;
    else if (data && Array.isArray(data.skills)) rawSkills = data.skills;
  } catch (e) {
    listEl.innerHTML = `<div class="skills-empty"><div class="skills-empty-strong">加载失败</div>${htmlEscape(e.message || String(e))}</div>`;
    return;
  }

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
    listEl.innerHTML = `<div class="skills-empty"><div class="skills-empty-strong">没有找到匹配的技能</div>请尝试其他关键词或筛选</div>`;
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
