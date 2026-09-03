/**
 * queueManager.js
 * Manages the multi-keyword search queue, state persistence,
 * URL construction with 24h filters, and preset query matrices.
 */

// Preset Query Matrices
const ANGULAR_QUERIES = [
  '"Angular Developer"',
  '"Angular Developer" remote',
  '"Angular Developer" "we\'re hiring"',
  '"Angular Developer" "we are hiring"',
  '"Angular Developer" "looking for"',
  '"Angular Developer" "immediate joiner"',
  '"Angular Developer" "send resume"',
  '"Angular Developer" "apply now"',
  '"Angular Frontend Developer" "we\'re hiring"',
  '"Angular Frontend Developer" "looking for"',
  '"Angular Engineer" "we\'re hiring"',
  '"Frontend Engineer (Angular)" hiring',
  '"Frontend Developer (Angular)" hiring',
  '"Senior Angular Developer" "we\'re hiring"',
  '"Lead Angular Developer" hiring',
  '"Angular" "TypeScript" "hiring"',
  '"Angular" "RxJS" "hiring"',
  '"Angular" "NgRx" "hiring"',
  '"Angular" "SCSS" "hiring"',
  '"Angular Engineer" remote',
  '"Angular" "100% Remote Europe"',
  '"Angular Developer" "USA" hiring',
  '"Angular Developer" "UK" hiring',
  '"Angular Developer" "Germany" hiring',
  '"Angular Developer" "Canada" hiring',
  '"Angular Developer" "India" hiring',
  '"Angular Developer" "Bangladesh" hiring',
  '"Angular Developer" "Austria" hiring',
  '"Angular Developer" "Australia" hiring',
  '"Angular Developer" "New Zealand" hiring',
  '"Angular Developer" "United Kingdom" hiring',
];

const FRONTEND_QUERIES = [
  '"Frontend Developer"',
  '"Frontend Developer" remote',
  '"Frontend Developer" "we\'re hiring"',
  '"Frontend Developer" "looking for"',
  '"Frontend Developer" "immediate joiner"',
  '"Frontend Developer" "send resume"',
  '"Frontend Engineer" "we\'re hiring"',
  '"Frontend Engineer" "looking for"',
  '"UI Developer" "we\'re hiring"',
  '"UI Developer" "looking for"',
  '"Frontend Engineer" remote',
  '"Senior Frontend Developer" "we\'re hiring"',
  '"Lead Frontend Engineer" hiring'
];

const TECH_STACK_QUERIES = [
  '"Angular" "TypeScript" "we\'re hiring"',
  '"Angular" "RxJS" "we\'re hiring"',
  '"Angular" "NgRx" "looking for"',
  '"Angular" "frontend" "immediate joiner"',
  '"Angular" "frontend" "send your CV"',
  '"Angular" "web development" "hiring"',
  '"Angular" "UI" "recruitment"'
];

export const PRESET_MATRICES = {
  ALL_24H: Array.from(new Set([...ANGULAR_QUERIES, ...FRONTEND_QUERIES, ...TECH_STACK_QUERIES])),
  ANGULAR_24H: ANGULAR_QUERIES,
  FRONTEND_24H: FRONTEND_QUERIES,
  TECH_STACK_RECOVERY_24H: TECH_STACK_QUERIES
};

export const SAFETY_MODES = {
  STEALTH_HUMAN: {
    id: "STEALTH_HUMAN",
    label: "Stealth Human (5 - 10 min rest)",
    minCooldownSec: 300,
    maxCooldownSec: 600,
    maxScrolls: 20
  },
  SAFE_PACED: {
    id: "SAFE_PACED",
    label: "Safe Paced (2 - 4 min rest)",
    minCooldownSec: 120,
    maxCooldownSec: 240,
    maxScrolls: 20
  },
  QUICK_SCAN: {
    id: "QUICK_SCAN",
    label: "Quick Scan (30 - 60 sec rest)",
    minCooldownSec: 30,
    maxCooldownSec: 60,
    maxScrolls: 20
  }
};

export const DEFAULT_QUEUE_STATE = {
  isRunning: false,
  isPaused: false,
  isCoolingDown: false,
  keywords: [],
  currentIndex: 0,
  currentKeyword: "",
  targetTabId: null,
  cooldownSecondsLeft: 0,
  cooldownTotalSeconds: 0,
  leadsFoundInSession: 0,
  startedAt: null,
  config: {
    dateFilter: "past-24h", // "past-24h" | "past-week" | "past-month" | "all"
    sortBy: "date_posted", // "date_posted" | "relevance"
    safetyMode: "STEALTH_HUMAN",
    minCooldownSec: 300, // 5 min
    maxCooldownSec: 600, // 10 min
    maxScrollsPerKeyword: 20, // max 20 scrolls per keyword
    scrollDelaySec: 2.5
  }
};

/**
 * Format remaining seconds into clean mm:ss string
 */
export function formatCooldownTime(totalSeconds) {
  const secs = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Generate LinkedIn Content/Post Search URL with 24h filter and date_posted sorting
 */
export function buildSearchUrl(keyword, options = {}) {
  const dateFilter = options.dateFilter || "past-24h";
  const sortBy = options.sortBy || "date_posted";

  let url = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}&origin=FACETED_SEARCH`;

  if (dateFilter === "past-24h") {
    url += `&datePosted=%5B%22past-24h%22%5D`;
  } else if (dateFilter === "past-week") {
    url += `&datePosted=%5B%22past-week%22%5D`;
  } else if (dateFilter === "past-month") {
    url += `&datePosted=%5B%22past-month%22%5D`;
  }

  if (sortBy === "date_posted") {
    url += `&sortBy=%22date_posted%22`;
  }

  return url;
}

/**
 * Load queue state from chrome.storage.local
 */
export async function getQueueState() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    return { ...DEFAULT_QUEUE_STATE };
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(["leadHunterQueueState"], (res) => {
      resolve(res.leadHunterQueueState || { ...DEFAULT_QUEUE_STATE });
    });
  });
}

/**
 * Save queue state to chrome.storage.local
 */
export async function saveQueueState(state) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    return state;
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ leadHunterQueueState: state }, () => {
      resolve(state);
    });
  });
}

/**
 * Parse raw multi-line keyword string into clean, deduplicated array
 */
export function parseKeywords(rawText) {
  if (!rawText || typeof rawText !== "string") return [];
  return rawText
    .split(/\r?\n/)
    .map(k => k.trim())
    .filter(k => k.length > 0 && !k.startsWith("#comment") && !k.startsWith("//"));
}
