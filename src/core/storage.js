/**
 * storage.js
 * High-level storage wrapper for chrome.storage.local.
 * Manages leads, status transitions, settings, and statistics.
 */

import { DEFAULT_SETTINGS, INITIAL_STORAGE_STATE } from "../config/defaults.js";

// In-memory store fallback for unit testing / Node environment
const memoryStore = {};

/**
 * Safe chrome.storage.local getter with fallback for non-extension environments (e.g. unit tests)
 */
export async function getFromStorage(keys) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (res) => resolve(res || {}));
    });
  }
  if (typeof localStorage !== "undefined") {
    const result = {};
    const keyList = Array.isArray(keys) ? keys : (typeof keys === "string" ? [keys] : Object.keys(keys || {}));
    for (const k of keyList) {
      const val = localStorage.getItem(`lh_${k}`);
      if (val) {
        try { result[k] = JSON.parse(val); } catch { result[k] = val; }
      }
    }
    return result;
  }
  // Node / memory store fallback
  const result = {};
  const keyList = Array.isArray(keys) ? keys : (typeof keys === "string" ? [keys] : Object.keys(keys || {}));
  for (const k of keyList) {
    if (k in memoryStore) {
      result[k] = JSON.parse(JSON.stringify(memoryStore[k]));
    }
  }
  return result;
}

/**
 * Safe chrome.storage.local setter with fallback
 */
export async function setToStorage(data) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => resolve(true));
    });
  }
  if (typeof localStorage !== "undefined") {
    for (const [k, v] of Object.entries(data)) {
      localStorage.setItem(`lh_${k}`, JSON.stringify(v));
    }
    return true;
  }
  // Node / memory store fallback
  for (const [k, v] of Object.entries(data)) {
    memoryStore[k] = JSON.parse(JSON.stringify(v));
  }
  return true;
}

/**
 * Initialize storage state if fresh installation
 */
export async function initStorage() {
  const current = await getFromStorage(["settings", "leads", "radarActive", "stats"]);
  const updates = {};

  if (!current.settings) updates.settings = DEFAULT_SETTINGS;
  if (!current.leads) updates.leads = [];
  if (current.radarActive === undefined) updates.radarActive = true;
  if (!current.stats) updates.stats = INITIAL_STORAGE_STATE.stats;

  if (Object.keys(updates).length > 0) {
    await setToStorage(updates);
  }
  return { ...INITIAL_STORAGE_STATE, ...current, ...updates };
}

/**
 * Get current settings
 */
export async function getSettings() {
  const { settings } = await getFromStorage("settings");
  const merged = settings ? { ...DEFAULT_SETTINGS, ...settings } : { ...DEFAULT_SETTINGS };

  // Migrate legacy template strings if present
  if (merged.emailTemplate) {
    if (merged.emailTemplate.subject && merged.emailTemplate.subject.includes("{user_name}")) {
      merged.emailTemplate.subject = "Application for {role} Position";
    }
    if (merged.emailTemplate.body && merged.emailTemplate.body.includes("{recruiter}")) {
      merged.emailTemplate.body = merged.emailTemplate.body.replace(/Hi\s*\{recruiter\},?/i, "Hi,");
    }
  }

  return merged;
}

/**
 * Save updated settings
 */
export async function saveSettings(newSettings) {
  const current = await getSettings();
  const merged = { ...current, ...newSettings };
  await setToStorage({ settings: merged });
  return merged;
}

/**
 * Get all stored leads with optional filtering and sorting
 */
export async function getLeads(filters = {}) {
  const { leads = [] } = await getFromStorage("leads");
  let filtered = [...leads];

  // Filter by status (e.g. 'new', 'contacted', 'applied', etc.)
  if (filters.status && filters.status !== "all") {
    filtered = filtered.filter(l => l.status === filters.status);
  }

  // Filter by score band / minScore
  if (filters.minScore !== undefined) {
    filtered = filtered.filter(l => l.score >= filters.minScore);
  }

  // Filter by search query (text, role, company, email)
  if (filters.query && filters.query.trim()) {
    const q = filters.query.toLowerCase().trim();
    filtered = filtered.filter(l =>
      (l.detectedRole && l.detectedRole.toLowerCase().includes(q)) ||
      (l.company && l.company.toLowerCase().includes(q)) ||
      (l.authorName && l.authorName.toLowerCase().includes(q)) ||
      (l.textSnippet && l.textSnippet.toLowerCase().includes(q)) ||
      (l.emails && l.emails.some(e => e.toLowerCase().includes(q)))
    );
  }

  // Filter by has email
  if (filters.hasEmail) {
    filtered = filtered.filter(l => l.emails && l.emails.length > 0);
  }

  // Filter by has URL
  if (filters.hasUrl) {
    filtered = filtered.filter(l => l.applicationUrls && l.applicationUrls.length > 0);
  }

  // Sort leads (default: highest score, newest first)
  const sortBy = filters.sortBy || "scoreDesc";
  if (sortBy === "scoreDesc") {
    filtered.sort((a, b) => b.score - a.score || b.detectedAt - a.detectedAt);
  } else if (sortBy === "newest") {
    filtered.sort((a, b) => b.detectedAt - a.detectedAt);
  } else if (sortBy === "oldest") {
    filtered.sort((a, b) => a.detectedAt - b.detectedAt);
  }

  return filtered;
}

/**
 * Save or update a detected lead with smart multi-level deduplication
 * (checks URN, exact emails, and application URLs).
 */
export async function saveLead(leadData) {
  const { leads = [] } = await getFromStorage("leads");
  const stats = await getStats();

  const id = leadData.urn || leadData.id || `lead-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const leadEmails = (leadData.emails || []).map(e => e.toLowerCase().trim());
  const leadUrls = (leadData.applicationUrls || []).map(u => u.toLowerCase().trim());

  // Multi-level duplicate check:
  // 1. By LinkedIn URN / ID
  // 2. By matching email address
  // 3. By matching exact application URL
  let existingIndex = leads.findIndex(l => (l.urn && l.urn === leadData.urn) || l.id === id);

  let duplicateReason = null;
  if (existingIndex === -1 && leadEmails.length > 0) {
    existingIndex = leads.findIndex(l =>
      l.emails && l.emails.some(e => leadEmails.includes(e.toLowerCase().trim()))
    );
    if (existingIndex !== -1) duplicateReason = "email";
  }

  if (existingIndex === -1 && leadUrls.length > 0) {
    existingIndex = leads.findIndex(l =>
      l.applicationUrls && l.applicationUrls.some(u => leadUrls.includes(u.toLowerCase().trim()))
    );
    if (existingIndex !== -1) duplicateReason = "url";
  }

  const newLead = {
    id,
    urn: leadData.urn || id,
    detectedRole: leadData.detectedRole || "Developer Opportunity",
    company: leadData.company || leadData.authorHeadline || "LinkedIn Posting",
    authorName: leadData.authorName || "LinkedIn User",
    authorHeadline: leadData.authorHeadline || "",
    authorProfile: leadData.authorProfile || "",
    postUrl: leadData.postUrl || "",
    score: leadData.score || 0,
    label: leadData.label || "maybe",
    matchedSignals: leadData.matchedSignals || [],
    techMatches: leadData.techMatches || [],
    emails: leadData.emails || [],
    applicationUrls: leadData.applicationUrls || [],
    requiresDm: Boolean(leadData.requiresDm),
    textSnippet: leadData.textSnippet || "",
    status: leadData.status || "new",
    notes: leadData.notes || "",
    detectedAt: leadData.detectedAt || Date.now(),
    updatedAt: Date.now(),
    repostCount: 0
  };

  let isNew = false;
  if (existingIndex >= 0) {
    // Preserve existing status, user notes, and original detection date
    const existing = leads[existingIndex];
    newLead.id = existing.id; // Retain original ID
    newLead.urn = existing.urn;
    newLead.status = existing.status || newLead.status;
    newLead.notes = existing.notes || newLead.notes;
    newLead.detectedAt = existing.detectedAt;
    newLead.repostCount = (existing.repostCount || 0) + 1;
    
    // Merge any newly discovered emails or URLs without duplicates
    newLead.emails = [...new Set([...(existing.emails || []), ...(newLead.emails || [])])];
    newLead.applicationUrls = [...new Set([...(existing.applicationUrls || []), ...(newLead.applicationUrls || [])])];
    newLead.score = Math.max(existing.score || 0, newLead.score); // Keep highest score

    leads[existingIndex] = newLead;
  } else {
    leads.unshift(newLead);
    isNew = true;
    stats.leadsFound += 1;
    if (newLead.score >= 80) stats.hotLeadsFound += 1;
    if (newLead.emails.length > 0) stats.emailsFound += newLead.emails.length;
    if (newLead.applicationUrls.length > 0) stats.urlsFound += newLead.applicationUrls.length;
  }

  await setToStorage({ leads, stats });
  return { lead: newLead, isNew, duplicateReason };
}

/**
 * Update the pipeline status and notes of a lead
 */
export async function updateLeadStatus(leadId, newStatus, notes = null) {
  const { leads = [] } = await getFromStorage("leads");
  const index = leads.findIndex(l => l.id === leadId || l.urn === leadId);

  if (index >= 0) {
    leads[index].status = newStatus;
    if (notes !== null) leads[index].notes = notes;
    leads[index].updatedAt = Date.now();
    await setToStorage({ leads });
    return leads[index];
  }
  return null;
}

/**
 * Delete a specific lead
 */
export async function deleteLead(leadId) {
  const { leads = [] } = await getFromStorage("leads");
  const filtered = leads.filter(l => l.id !== leadId && l.urn !== leadId);
  await setToStorage({ leads: filtered });
  return true;
}

/**
 * Clear all leads from CRM
 */
export async function clearAllLeads() {
  await setToStorage({ leads: [] });
  return true;
}

/**
 * Get radar operational statistics
 */
export async function getStats() {
  const { stats } = await getFromStorage("stats");
  return stats || { ...INITIAL_STORAGE_STATE.stats };
}

/**
 * Record a post scan event
 */
export async function recordPostScan() {
  const stats = await getStats();
  stats.scannedCount = (stats.scannedCount || 0) + 1;
  stats.lastActive = Date.now();
  await setToStorage({ stats });
  return stats;
}

/**
 * Set Radar active/inactive state
 */
export async function setRadarActive(isActive) {
  await setToStorage({ radarActive: Boolean(isActive) });
  return Boolean(isActive);
}

/**
 * Get Radar active status
 */
export async function isRadarActive() {
  const { radarActive } = await getFromStorage("radarActive");
  return radarActive !== false;
}

/**
 * Convert leads array to CSV string
 */
export function exportLeadsToCsv(leads) {
  const headers = ["ID", "Score", "Role", "Company", "Author", "Emails", "Apply URLs", "Status", "Post URL", "Date", "Notes"];
  const rows = leads.map(l => [
    `"${l.id}"`,
    l.score,
    `"${(l.detectedRole || "").replace(/"/g, '""')}"`,
    `"${(l.company || "").replace(/"/g, '""')}"`,
    `"${(l.authorName || "").replace(/"/g, '""')}"`,
    `"${(l.emails || []).join("; ")}"`,
    `"${(l.applicationUrls || []).join("; ")}"`,
    `"${l.status}"`,
    `"${l.postUrl || ""}"`,
    `"${new Date(l.detectedAt).toISOString()}"`,
    `"${(l.notes || "").replace(/"/g, '""')}"`
  ]);

  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

/**
 * Convert leads array to JSON format
 */
export function exportLeadsToJson(leads) {
  return JSON.stringify(leads, null, 2);
}
