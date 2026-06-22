/**
 * FanBox Mobile · Phase UI-A7
 * Manus-like Home + ChatGPT-like Agent + Mobile File Manager
 * Complete rewrite of mobile.js
 */
"use strict";

/* =========================================================
   Constants & Config
   ========================================================= */
const TOKEN_KEY = "fanbox_mobile_token";
const DEVICE_KEY = "fanbox_mobile_device";
const AGENT_KEY  = "fanbox_mobile_agent";
const CWD_KEY    = "fanbox_mobile_cwd";

const TASK_CHIPS = [
  { label: "Develop app", icon: "app" },
  { label: "Website", icon: "web" },
  { label: "Slides", icon: "slide" },
  { label: "Image", icon: "img" },
  { label: "Audio", icon: "audio" },
  { label: "Video", icon: "video" },
  { label: "Wide Research", icon: "search" },
  { label: "Spreadsheet", icon: "table" },
  { label: "Explain project", icon: "info" },
  { label: "Fix bug", icon: "bug" },
  { label: "Code review", icon: "review" },
  { label: "Summarize files", icon: "file" },
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
const FILE_ICONS = {
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7 C3 5.9 3.9 5 5 5 H9 L11 7 H19 C20.1 7 21 7.9 21 9 V18 C21 19.1 20.1 20 19 20 H5 C3.9 20 3 19.1 3 18 V7Z"/></svg>`,

  pdf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 Z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,

  word: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 Z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,

  excel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 Z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="13" width="8" height="5" rx="1"/><line x1="8" y1="16.5" x2="16" y2="16.5"/><line x1="12" y1="13" x2="12" y2="18"/></svg>`,

  ppt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/><polyline points="12 8 12 16"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><line x1="8" y1="16" x2="16" y2="16"/></svg>`,

  md: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="7 8 5 12 7 16"/><polyline points="17 8 19 12 17 16"/><line x1="11" y1="8" x2="13" y2="16"/></svg>`,

  code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,

  txt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 Z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,

  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,

  zip: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="8 4 8 10"/><polyline points="16 4 16 10"/><polyline points="8 14 8 20"/><polyline points="16 14 16 20"/></svg>`,

  html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,

  unknown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6 C4.9 2 4 2.9 4 4 V20 C4 21.1 4.9 22 6 22 H18 C19.1 22 20 21.1 20 20 V8 Z"/><polyline points="14 2 14 8 20 8"/></svg>`,
};

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
  sidebarOpen: false,
  messages:    [],   // current session messages
  sessionId:   null,
  files:       [],   // current directory listing
  fileHistory:  [],   // navigation stack for back button
  skills:      [],
  allSessions: [],
  running:     false,
  currentSkill: null,
  filesPreview: null,
};

/** 映射 UI agent id → 后端 agent id（mobile-sessions 期望短名） */
function mapAgentId (id) {
  if (id === 'claude_code') return 'claude';
  return id || 'claude';
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

  // wire events
  wirePairing();
  wireSidebar();
  wireHome();
  wireAgentDropdown();
  wireFiles();
  wireSkills();
  wireSessions();
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
    else if (S.currentTab === "sessions") loadAllSessions();
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
   Send message
   ========================================================= */
async function doSend (prompt) {
  // Switch to chat state
  enterChatState();

  // add user message
  S.messages.push({ role: "user", content: prompt });
  renderMessages();

  // scroll
  scrollMessages();

  // set running
  setRunning(true, prompt);
  $("home-status-pill").textContent = "思考中…";

  try {
    const agent = getCurrentAgent();
    const data = await api("/api/mobile/send", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        model: agent.model,
        agent: mapAgentId(S.currentAgent),
        cwd: S.cwd || undefined,
        skill: S.currentSkill || undefined,
        sessionId: S.sessionId || undefined,
      }),
    });

    setRunning(false);
    $("home-status-pill").textContent = "";

    if (!data) return; // 401

    if (data.error) {
      S.messages.push({ role: "assistant", content: `错误: ${data.error}` });
      $("home-status-pill").textContent = "失败";
      $("home-status-pill").className = "home-status-pill is-failed";
    } else {
      // data.reply / data.text
      const text = data.reply || data.text || data.content || "";
      const role = data.isError ? "system" : "assistant";
      S.messages.push({ role, content: text });
      if (S.cwd !== data.cwd) {
        S.cwd = data.cwd || S.cwd;
        localStorage.setItem(CWD_KEY, S.cwd || "");
        updateTopbarCwd();
      }
    }

    renderMessages();
    scrollMessages();

  } catch (e) {
    setRunning(false);
    S.messages.push({ role: "assistant", content: `请求失败: ${e.message}` });
    $("home-status-pill").textContent = "失败";
    $("home-status-pill").className = "home-status-pill is-failed";
    renderMessages();
    scrollMessages();
  }
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
}

function exitChatState () {
  // Phase UI-A8-1: 退到 hero 态
  const shell = $("home-shell");
  if (shell) shell.classList.remove("is-chat");
  $("home-hero").hidden = false;
  $("home-task-chips").hidden = false;
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
    bubble.innerHTML = escapeHtmlForDisplay(msg.content);

    row.appendChild(avatar);
    row.appendChild(bubble);
    container.appendChild(row);
  });
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
  // Simple inline skill picker using prompt
  const names = S.skills.length > 0
    ? S.skills.map(s => s.name).join(", ")
    : "ppt, docx, xlsx, summary, code-review, deep-research, academic-paper";
  const pick = window.prompt(`输入技能名（可选）\n\n可用: ${names}\n\n直接回车跳过`);
  if (pick === null) return; // cancelled
  if (!pick.trim()) {
    S.currentSkill = null;
    $("home-skill-button").classList.remove("is-active");
    return;
  }
  S.currentSkill = pick.trim();
  $("home-skill-button").classList.add("is-active");
}

/* =========================================================
   Files View
   ========================================================= */
function wireFiles () {
  $("files-back").addEventListener("click", () => filesNavigateBack());
  $("files-refresh").addEventListener("click", loadFiles);
  $("files-open-agent").addEventListener("click", openAgentInCurrentFolder);
  $("files-q").addEventListener("input", debounce(filterFiles, 200));
  $("files-preview-close").addEventListener("click", closeFilesPreview);
}

async function loadFiles (path) {
  const titleEl = $("files-title");
  const listEl  = $("files-list");
  titleEl.textContent = "Files";
  listEl.innerHTML = `<div class="skeleton" style="height:56px;margin-bottom:4px"></div><div class="skeleton" style="height:56px;margin-bottom:4px"></div><div class="skeleton" style="height:56px"></div>`;

  try {
    // if path provided or use cwd
    const target = path || S.cwd;
    const data = await api("/api/mobile/files" + (target ? `?path=${encodeURIComponent(target)}` : ""));
    if (!data) return;

    S.files = (data.files || []).sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "");
    });

    // track navigation
    if (path && path !== S.cwd) {
      S.fileHistory.push(S.cwd);
    }
    if (path) {
      S.cwd = path;
      localStorage.setItem(CWD_KEY, path);
      updateTopbarCwd();
    }

    titleEl.textContent = path ? truncate(path.split(/[/\\]/).pop() || "Files", 20) : "Files";
    $("files-cwd-label").textContent = S.cwd || "未选择";
    $("files-open-agent").disabled = !S.cwd;

    renderFiles(S.files);
    $("files-preview").hidden = true;
  } catch (e) {
    listEl.innerHTML = `<div class="files-empty"><div class="files-empty-strong">加载失败</div>${htmlEscape(e.message)}</div>`;
  }
}

function renderFiles (files) {
  const listEl = $("files-list");
  listEl.innerHTML = "";

  if (files.length === 0) {
    listEl.innerHTML = `<div class="files-empty"><div class="files-empty-strong">空文件夹</div>这个目录没有文件</div>`;
    return;
  }

  files.forEach(item => {
    const type = item.isFolder ? "folder" : getFileType(item.name);
    const icon = FILE_ICONS[type] || FILE_ICONS.unknown;
    const extClass = type;

    const row = el("button", "file-row" + (item.isFolder ? " is-folder" : ""));
    row.setAttribute("role", "listitem");
    row.innerHTML =
      `<span class="file-icon ${extClass}">${icon}</span>` +
      `<span class="file-body">` +
        `<span class="file-name">${htmlEscape(item.name)}</span>` +
        `<span class="file-meta">${item.isFolder ? "文件夹" : fmtSize(item.size || 0)}</span>` +
      `</span>` +
      `<span class="file-extra">` +
        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>` +
      `</span>`;

    row.addEventListener("click", () => {
      if (item.isFolder) {
        loadFiles(item.path || (S.cwd ? S.cwd + "/" + item.name : item.name));
      } else {
        openFilePreview(item);
      }
    });

    listEl.appendChild(row);
  });
}

function filterFiles () {
  const q = $("files-q").value.toLowerCase().trim();
  if (!q) { renderFiles(S.files); return; }
  renderFiles(S.files.filter(f => f.name.toLowerCase().includes(q)));
}

function filesNavigateBack () {
  if (S.fileHistory.length > 0) {
    const prev = S.fileHistory.pop();
    loadFiles(prev);
  } else if (S.cwd) {
    // go to parent
    const parent = S.cwd.split(/[/\\]/).slice(0, -1).join("/") || null;
    S.cwd = parent;
    localStorage.setItem(CWD_KEY, parent || "");
    updateTopbarCwd();
    loadFiles(parent);
  }
}

function openFilePreview (item) {
  const type = getFileType(item.name);
  $("files-preview-name").textContent = item.name;
  $("files-preview-sub").textContent = fmtSize(item.size || 0) + (item.modified ? " · " + timeAgo(item.modified) : "");
  $("files-preview").hidden = false;

  const body = $("files-preview-body");
  body.innerHTML = `<div class="preview-empty">加载中…</div>`;

  // preview text files
  if (["md", "txt", "code", "html", "unknown"].includes(type)) {
    api(`/api/mobile/files/read?path=${encodeURIComponent(item.path || item.name)}`)
      .then(data => {
        if (!data) { body.innerHTML = `<div class="preview-empty">读取失败</div>`; return; }
        const text = data.content || data.text || "";
        if (text.length > 50000) {
          body.innerHTML = `<div class="preview-too-large"><strong>文件过大 (${fmtSize(text.length)})</strong>仅显示前 50,000 字符</div><pre>${htmlEscape(text.slice(0, 50000))}</pre>`;
        } else {
          body.innerHTML = `<pre>${htmlEscape(text)}</pre>`;
        }
      })
      .catch(() => { body.innerHTML = `<div class="preview-empty">读取失败</div>`; });
  } else if (type === "image") {
    body.innerHTML = `<img src="/api/mobile/files/preview?path=${encodeURIComponent(item.path || item.name)}" alt="${htmlEscape(item.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=preview-empty>图片加载失败</div>'">`;
  } else {
    body.innerHTML = `<div class="preview-empty">暂不支持预览此文件类型</div>`;
  }
}

function closeFilesPreview () {
  $("files-preview").hidden = true;
}

function openAgentInCurrentFolder () {
  if (!S.cwd) return;
  localStorage.setItem(CWD_KEY, S.cwd);
  updateTopbarCwd();
  closeSidebar();
  showTab("home");
}

/* =========================================================
   Skills View
   ========================================================= */
function wireSkills () {
  $("skills-q").addEventListener("input", debounce(filterSkills, 200));
  qsa(".skills-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".skills-filter-btn").forEach(b => {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      filterSkills();
    });
  });
}

async function loadSkills () {
  const listEl = $("skills-list");
  listEl.innerHTML = `<div class="skeleton" style="height:80px;margin-bottom:8px"></div><div class="skeleton" style="height:80px;margin-bottom:8px"></div>`;

  try {
    const data = await api("/api/mobile/skills");
    S.skills = Array.isArray(data) ? data : (data?.skills || []);
    renderSkills(S.skills);
  } catch (e) {
    listEl.innerHTML = `<div class="skills-empty"><div class="skills-empty-strong">加载失败</div>${htmlEscape(e.message)}</div>`;
  }
}

function renderSkills (skills) {
  const listEl = $("skills-list");
  listEl.innerHTML = "";

  if (skills.length === 0) {
    listEl.innerHTML = `<div class="skills-empty"><div class="skills-empty-strong">暂无技能</div>请在电脑端启用技能</div>`;
    return;
  }

  skills.forEach(skill => {
    const cnDesc = SKILL_CN[skill.name] || null;
    const desc = cnDesc || skill.description || skill.desc || "暂无简介";
    const isEmpty = !skill.description && !cnDesc;

    const card = el("div", "skill-card");
    card.innerHTML =
      `<div class="skill-head">` +
        `<span class="skill-name">${htmlEscape(skill.name)}</span>` +
        `<span class="skill-source">${htmlEscape(skill.source || "local")}</span>` +
      `</div>` +
      `<p class="skill-desc${isEmpty ? " is-empty" : ""}">${htmlEscape(desc)}</p>` +
      `<div class="skill-foot">` +
        `<span class="skill-stats">` +
          (skill.usageCount != null ? `<span>使用 ${skill.usageCount} 次</span>` : "") +
          (skill.lastUsed ? `<span>${timeAgo(skill.lastUsed)}</span>` : "") +
        `</span>` +
        `<button class="skill-toggle${skill.enabled ? " is-enabled" : ""}" data-skill="${htmlEscape(skill.name)}" type="button">${skill.enabled ? "Enabled" : "Disabled"}</button>` +
      `</div>`;

    card.querySelector(".skill-toggle").addEventListener("click", function () {
      const isEnabled = this.classList.toggle("is-enabled");
      this.textContent = isEnabled ? "Enabled" : "Disabled";
    });

    listEl.appendChild(card);
  });
}

function filterSkills () {
  const q = $("skills-q").value.toLowerCase().trim();
  const filter = qsa(".skills-filter-btn.is-active")[0]?.getAttribute("data-filter") || "all";

  const filtered = S.skills.filter(s => {
    const matchQ = !q || (s.name || "").toLowerCase().includes(q) ||
      (SKILL_CN[s.name] || "").toLowerCase().includes(q) ||
      (s.description || "").toLowerCase().includes(q);
    const matchFilter = filter === "all" ||
      (filter === "enabled" && s.enabled) ||
      (filter === "disabled" && !s.enabled);
    return matchQ && matchFilter;
  });

  renderSkills(filtered);
}

/* =========================================================
   Sessions View
   ========================================================= */
function wireSessions () {
  $("sessions-refresh").addEventListener("click", loadAllSessions);
}

async function loadRecentSessions () {
  try {
    const data = await api("/api/mobile/sessions");
    if (!data) return;
    const sessions = Array.isArray(data) ? data : (data.sessions || []);
    S.allSessions = sessions;
    renderSidebarSessions(sessions.slice(0, 8));
  } catch (e) {
    // silently fail
  }
}

async function loadAllSessions () {
  const listEl = $("sessions-list");
  listEl.innerHTML = `<div class="skeleton" style="height:64px;margin-bottom:8px"></div><div class="skeleton" style="height:64px;margin-bottom:8px"></div>`;

  try {
    const data = await api("/api/mobile/sessions");
    if (!data) return;
    const sessions = Array.isArray(data) ? data : (data.sessions || []);
    S.allSessions = sessions;
    renderSessionsList(sessions);
  } catch (e) {
    listEl.innerHTML = `<div class="session-empty"><div class="session-empty-strong">加载失败</div>${htmlEscape(e.message)}</div>`;
  }
}

function renderSidebarSessions (sessions) {
  const el = $("sidebar-sessions");
  el.innerHTML = "";
  if (!sessions.length) {
    el.innerHTML = `<div class="sidebar-empty">暂无会话</div>`;
    return;
  }
  sessions.forEach(s => {
    const btn = el("button", "sidebar-session" + (S.sessionId === s.id ? " is-active" : ""));
    btn.setAttribute("role", "listitem");
    const status = s.status || "done";
    const preview = truncate(s.lastMessage || s.title || "会话", 30);
    const agentLabel = AGENTS.find(a => a.id === s.agent)?.label || s.agent || "";
    btn.innerHTML =
      `<span class="sidebar-session-icon">${NAV_ICONS.chat}</span>` +
      `<span class="sidebar-session-body">` +
        `<span class="sidebar-session-title">${htmlEscape(s.title || "未命名会话")}</span>` +
        `<span class="sidebar-session-meta">${agentLabel} · ${timeAgo(s.updatedAt || s.updated)}</span>` +
      `</span>` +
      `<span class="sidebar-session-status is-${status}"></span>`;
    btn.addEventListener("click", () => resumeSession(s));
    el.appendChild(btn);
  });
}

function renderSessionsList (sessions) {
  const listEl = $("sessions-list");
  listEl.innerHTML = "";
  if (!sessions.length) {
    listEl.innerHTML = `<div class="session-empty"><div class="session-empty-strong">暂无会话</div>开始一个新对话</div>`;
    return;
  }
  sessions.forEach(s => {
    const status = s.status || "done";
    const preview = s.lastMessage || s.title || "";
    const agentLabel = AGENTS.find(a => a.id === s.agent)?.label || s.agent || "";
    const sourceClass = s.source === "mobile" ? "is-mobile" : "is-desktop";
    const card = el("button", "session-card" + (S.sessionId === s.id ? " is-active" : ""));
    card.innerHTML =
      `<div class="session-head">` +
        `<span class="session-title">${htmlEscape(s.title || "未命名会话")}</span>` +
        `<span class="session-source ${sourceClass}">${s.source === "mobile" ? "Mobile" : "Desktop"}</span>` +
      `</div>` +
      `<p class="session-preview">${htmlEscape(truncate(preview, 100))}</p>` +
      `<div class="session-foot">` +
        `<span class="session-meta-row">` +
          `<span>${htmlEscape(agentLabel)}</span>` +
          (s.cwd ? `<span>· ${htmlEscape(truncate(s.cwd, 20))}</span>` : "") +
        `</span>` +
        `<span class="session-status is-${status}">${status.replace("_", " ")}</span>` +
      `</div>`;
    card.addEventListener("click", () => resumeSession(s));
    listEl.appendChild(card);
  });
}

async function resumeSession (session) {
  closeSidebar();
  S.sessionId = session.id;
  S.cwd = session.cwd || null;
  if (S.cwd) localStorage.setItem(CWD_KEY, S.cwd);
  updateTopbarCwd();

  // load messages
  try {
    const data = await api(`/api/mobile/sessions/${session.id}/messages`);
    if (data) {
      S.messages = Array.isArray(data) ? data : (data.messages || []);
      if (S.messages.length > 0) {
        enterChatState();
        renderMessages();
        scrollMessages();
      }
    }
  } catch (e) {
    // fallback: just switch to home
  }

  // update sidebar sessions
  renderSidebarSessions(S.allSessions.slice(0, 8));
  showTab("home");
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
