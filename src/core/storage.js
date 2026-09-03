/**
 * storage.js
 * High-level storage wrapper for chrome.storage.local.
 * Manages leads, status transitions, settings, and statistics.
 */

import { DEFAULT_SETTINGS, INITIAL_STORAGE_STATE } from "../config/defaults.js";
import { normalizeRole } from "./scoring.js";

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

  // Ensure senderAccounts and schedule exist
  if (!merged.senderAccounts || merged.senderAccounts.length === 0) {
    merged.senderAccounts = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.senderAccounts));
  }
  if (!merged.cvLinks) {
    merged.cvLinks = { ...DEFAULT_SETTINGS.cvLinks };
  }
  if (!merged.autoOutreachSchedule) {
    merged.autoOutreachSchedule = { ...DEFAULT_SETTINGS.autoOutreachSchedule };
  } else {
    if (!merged.autoOutreachSchedule.smtpBridgeUrl || merged.autoOutreachSchedule.smtpBridgeUrl === "http://localhost:3000") {
      merged.autoOutreachSchedule.smtpBridgeUrl = "https://mailer.nexidant.com";
    }
    if (!merged.autoOutreachSchedule.minIntervalSec || merged.autoOutreachSchedule.minIntervalSec < 180) {
      merged.autoOutreachSchedule.minIntervalSec = 180;
    }
    if (!merged.autoOutreachSchedule.maxIntervalSec || merged.autoOutreachSchedule.maxIntervalSec < 300) {
      merged.autoOutreachSchedule.maxIntervalSec = 300;
    }
  }
  if (!merged.replyToEmail) {
    merged.replyToEmail = DEFAULT_SETTINGS.replyToEmail || "suptokhan24@gmail.com";
  }

  // Migrate legacy template strings if present
  if (merged.emailTemplate) {
    if (merged.emailTemplate.subject && merged.emailTemplate.subject.includes("{user_name}")) {
      merged.emailTemplate.subject = "Application for {role} Position - {user_name}";
    }
    if (merged.emailTemplate.body && merged.emailTemplate.body.includes("{recruiter}")) {
      merged.emailTemplate.body = merged.emailTemplate.body.replace(/Hi\s*\{recruiter\},?/i, "Hi,");
    }
    if (merged.emailTemplate.body && !merged.emailTemplate.body.includes("{cv_link}")) {
      if (/Please find my CV attached( as stated in the job description)?\.?/i.test(merged.emailTemplate.body)) {
        merged.emailTemplate.body = merged.emailTemplate.body.replace(
          /Please find my CV attached( as stated in the job description)?\.?/i,
          "Please find my {cv_type} via Google Drive here:\n{cv_link}"
        );
      } else {
        merged.emailTemplate.body = merged.emailTemplate.body.trim() + "\n\nPlease find my {cv_type} via Google Drive here:\n{cv_link}";
      }
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
 * Normalizes text content to create a robust structural fingerprint for duplicate comparison.
 * Removes URLs, emails, special characters, and excess whitespace.
 */
export function normalizeTextFingerprint(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, "")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 200);
}

/**
 * Extracts numeric activity ID from any string, URN, or URL
 */
export function extractActivityId(str) {
  if (!str || typeof str !== "string") return null;
  const match = str.match(/activity:(\d+)/i) ||
                str.match(/ugcPost:(\d+)/i) ||
                str.match(/share:(\d+)/i) ||
                str.match(/(\d{16,22})/);
  return match ? match[1] : null;
}

/**
 * Normalizes author profile URLs for reliable matching
 */
export function normalizeProfileUrl(url) {
  if (!url || typeof url !== "string") return "";
  return url.toLowerCase().split("?")[0].replace(/\/+$/, "").trim();
}

/**
 * Multi-level duplicate detector across all lead types (especially DM leads).
 */
export function findDuplicateLeadIndex(leads, newLead) {
  if (!leads || leads.length === 0 || !newLead) return { index: -1, reason: null };

  const newId = newLead.id || "";
  const newUrn = newLead.urn || "";
  const newActId = extractActivityId(newUrn) || extractActivityId(newId) || extractActivityId(newLead.postUrl);
  const newEmails = (newLead.emails || []).map(e => e.toLowerCase().trim()).filter(Boolean);
  const newUrls = (newLead.applicationUrls || []).map(u => u.toLowerCase().trim()).filter(Boolean);
  const newProfile = normalizeProfileUrl(newLead.authorProfile);
  const newFingerprint = normalizeTextFingerprint(newLead.textSnippet);
  const newAuthorName = (newLead.authorName || "").toLowerCase().trim();
  const isGenericAuthor = !newAuthorName || newAuthorName.includes("linkedin") || newAuthorName.includes("user") || newAuthorName.includes("poster");

  for (let i = 0; i < leads.length; i++) {
    const existing = leads[i];
    const exId = existing.id || "";
    const exUrn = existing.urn || "";
    const exActId = extractActivityId(exUrn) || extractActivityId(exId) || extractActivityId(existing.postUrl);
    const exProfile = normalizeProfileUrl(existing.authorProfile);
    const exFingerprint = normalizeTextFingerprint(existing.textSnippet);
    const exAuthorName = (existing.authorName || "").toLowerCase().trim();

    // 1. Direct ID / URN match
    if ((exId && (exId === newId || exId === newUrn)) ||
        (exUrn && (exUrn === newUrn || exUrn === newId))) {
      return { index: i, reason: "id_urn" };
    }

    // 2. Numeric Activity ID match (e.g. activity:723456789)
    if (newActId && exActId && newActId === exActId) {
      return { index: i, reason: "activity_id" };
    }

    // 3. Exact valid Post URL match
    if (newLead.postUrl && existing.postUrl &&
        newLead.postUrl.includes("/feed/update/") &&
        existing.postUrl.includes("/feed/update/") &&
        newLead.postUrl.split("?")[0] === existing.postUrl.split("?")[0]) {
      return { index: i, reason: "post_url" };
    }

    // 4. Email match (if both have emails)
    if (newEmails.length > 0 && existing.emails && existing.emails.length > 0) {
      const exEmails = existing.emails.map(e => e.toLowerCase().trim());
      if (newEmails.some(e => exEmails.includes(e))) {
        return { index: i, reason: "email" };
      }
    }

    // 5. Application URL match
    if (newUrls.length > 0 && existing.applicationUrls && existing.applicationUrls.length > 0) {
      const exUrls = existing.applicationUrls.map(u => u.toLowerCase().trim());
      if (newUrls.some(u => exUrls.includes(u))) {
        return { index: i, reason: "application_url" };
      }
    }

    // 6. DM Lead Deduplication: Author Profile + Text Fingerprint or Role
    if (newProfile && exProfile && newProfile === exProfile) {
      // Same author profile with matching text fingerprint (min 20 chars)
      if (newFingerprint && exFingerprint &&
          (newFingerprint === exFingerprint ||
           newFingerprint.startsWith(exFingerprint.slice(0, 60)) ||
           exFingerprint.startsWith(newFingerprint.slice(0, 60)))) {
        return { index: i, reason: "author_text_dm" };
      }

      // Same author profile with same detected role posted within 14 days
      const timeDiff = Math.abs((newLead.detectedAt || Date.now()) - (existing.detectedAt || Date.now()));
      if (existing.detectedRole && newLead.detectedRole &&
          existing.detectedRole === newLead.detectedRole &&
          timeDiff < 14 * 24 * 3600 * 1000) {
        return { index: i, reason: "author_role_dm" };
      }
    }

    // 7. Author Name (non-generic) + Text Fingerprint
    if (!isGenericAuthor && exAuthorName && exAuthorName === newAuthorName) {
      if (newFingerprint && exFingerprint &&
          (newFingerprint === exFingerprint ||
           (newFingerprint.length > 30 && exFingerprint.length > 30 &&
            (newFingerprint.includes(exFingerprint.slice(0, 40)) || exFingerprint.includes(newFingerprint.slice(0, 40)))))) {
        return { index: i, reason: "author_name_text" };
      }
    }

    // 8. Text Fingerprint Match (Identical or prefix/substring match of 25+ chars)
    if (newFingerprint && exFingerprint && newFingerprint.length >= 25 && exFingerprint.length >= 25) {
      if (newFingerprint === exFingerprint ||
          newFingerprint.startsWith(exFingerprint.slice(0, 40)) ||
          exFingerprint.startsWith(newFingerprint.slice(0, 40)) ||
          newFingerprint.includes(exFingerprint.slice(0, 35)) ||
          exFingerprint.includes(newFingerprint.slice(0, 35))) {
        return { index: i, reason: "text_fingerprint" };
      }
    }
  }

  return { index: -1, reason: null };
}

/**
 * Deduplicate and consolidate an array of leads
 */
export function deduplicateStoredLeads(leads) {
  if (!Array.isArray(leads) || leads.length <= 1) return leads || [];

  const consolidated = [];
  for (const lead of leads) {
    const { index } = findDuplicateLeadIndex(consolidated, lead);
    if (index >= 0) {
      const existing = consolidated[index];
      existing.emails = [...new Set([...(existing.emails || []), ...(lead.emails || [])])];
      existing.applicationUrls = [...new Set([...(existing.applicationUrls || []), ...(lead.applicationUrls || [])])];
      existing.score = Math.max(existing.score || 0, lead.score || 0);
      if (!existing.notes && lead.notes) existing.notes = lead.notes;
      if (existing.status === "new" && lead.status && lead.status !== "new") existing.status = lead.status;
      if (existing.authorName && (!lead.authorName || lead.authorName.includes("LinkedIn"))) {
        // preserve non-generic author
      } else if (lead.authorName && !lead.authorName.includes("LinkedIn")) {
        existing.authorName = lead.authorName;
      }
      if (!existing.authorProfile && lead.authorProfile) existing.authorProfile = lead.authorProfile;
      existing.repostCount = (existing.repostCount || 0) + (lead.repostCount || 1);
      existing.updatedAt = Date.now();
    } else {
      consolidated.push({
        ...lead,
        detectedRole: normalizeRole(lead.detectedRole, lead.techMatches)
      });
    }
  }
  return consolidated;
}

/**
 * Get all stored leads with automatic deduplication, filtering, and sorting
 */
export async function getLeads(filters = {}) {
  const { leads = [] } = await getFromStorage("leads");
  
  let sourceLeads = leads;
  if (!filters.skipDeduplication) {
    // Consolidate any duplicates on full retrieval
    const deduplicated = deduplicateStoredLeads(leads);
    if (deduplicated.length !== leads.length) {
      // Silently persist cleaned list back to storage
      await setToStorage({ leads: deduplicated });
    }
    sourceLeads = deduplicated;
  }

  let filtered = sourceLeads.map(l => ({
    ...l,
    detectedRole: normalizeRole(l.detectedRole, l.techMatches)
  }));

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
 * (checks URN, Activity ID, Post URL, Email, Apply URL, and Author Profile + Text Fingerprint for DM leads).
 */
export async function saveLead(leadData) {
  const { leads = [] } = await getFromStorage("leads");
  const stats = await getStats();

  const id = leadData.urn || leadData.id || `lead-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

  const newLead = {
    id,
    urn: leadData.urn || id,
    detectedRole: normalizeRole(leadData.detectedRole, leadData.techMatches),
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

  // Run comprehensive multi-level duplicate check
  const { index: existingIndex, reason: duplicateReason } = findDuplicateLeadIndex(leads, newLead);

  let isNew = false;
  if (existingIndex >= 0) {
    // Preserve existing status, user notes, original detection date, and rich author details
    const existing = leads[existingIndex];
    newLead.id = existing.id; // Retain original ID
    newLead.urn = existing.urn;
    newLead.status = existing.status || newLead.status;
    newLead.notes = existing.notes || newLead.notes;
    newLead.detectedAt = existing.detectedAt;
    newLead.repostCount = (existing.repostCount || 0) + 1;
    
    if (existing.authorName && (!newLead.authorName || newLead.authorName.includes("LinkedIn"))) {
      newLead.authorName = existing.authorName;
    }
    if (existing.authorProfile && !newLead.authorProfile) {
      newLead.authorProfile = existing.authorProfile;
    }
    if (existing.authorHeadline && !newLead.authorHeadline) {
      newLead.authorHeadline = existing.authorHeadline;
    }
    if (existing.company && !newLead.company) {
      newLead.company = existing.company;
    }
    if (existing.textSnippet && existing.textSnippet.length > (newLead.textSnippet || "").length) {
      newLead.textSnippet = existing.textSnippet;
    }

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
 * Update pipeline status for multiple leads in a single atomic storage write
 */
export async function updateBulkLeadStatus(leadIds, newStatus) {
  const { leads = [] } = await getFromStorage("leads");
  const idSet = new Set(leadIds);
  let updatedCount = 0;
  for (const l of leads) {
    if (idSet.has(l.id) || idSet.has(l.urn)) {
      l.status = newStatus;
      l.updatedAt = Date.now();
      updatedCount++;
    }
  }
  if (updatedCount > 0) {
    await setToStorage({ leads });
  }
  return updatedCount;
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
