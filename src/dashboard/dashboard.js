/**
 * dashboard.js
 * Full-featured local CRM and Radar Settings controller for LeadHunter.
 */

import {
  getLeads,
  getLeadCounts,
  saveLead,
  getSettings,
  saveSettings,
  updateLeadStatus,
  updateBulkLeadStatus,
  deleteLead,
  clearAllLeads,
  removeDmLeadsFromStorage,
  exportLeadsToCsv,
  exportLeadsToJson
} from "../core/storage.js";
import {
  formatLeadStructuredText,
  generateEmailDraft,
  generateEmailHtml,
  getGmailComposeUrl,
  getOutlookComposeUrl,
  classifyLeadCvType,
  cleanText,
  extractEmails,
  extractApplicationUrls
} from "../core/extractor.js";
import { scorePost } from "../core/scoring.js";
import {
  checkScheduleWindow,
  getNextAvailableSender,
  incrementSenderQuota,
  getOutreachEngineStats,
  resetDailyQuotasIfNeeded,
  checkBridgeStatus,
  sendSilentEmailViaBridge
} from "../core/outreachEngine.js";
import { DEFAULT_SETTINGS, TELEGRAM_CHANNELS, getAllTelegramChannels } from "../config/defaults.js";
import { ICONS } from "../ui/icons.js";

// Global CRM State
let leadsData = [];
let appSettings = { ...DEFAULT_SETTINGS };
let currentTab = "leadsTab";
let currentStatusFilter = "new";
let currentSearchQuery = "";
let filterHasEmail = false;
let filterHasUrl = false;
let filterHotOnly = false;
let currentSort = "scoreDesc";
let selectedLead = null;
let outreachTargetLead = null;
let isAutoOutreachRunning = false;

// Telegram Multi-Channel Sync State
let currentTelegramPreset = "priority";
let selectedTelegramChannels = new Set(
  TELEGRAM_CHANNELS.priority.map(c => c.username)
);
let isTelegramSyncRunning = false;
let abortTelegramSync = false;

// ── DASHBOARD BACKGROUND KEEP-ALIVE SYSTEM ─────────────────────
// Keeps the dashboard tab alive and exempt from Chrome's 1-minute background timer throttling
// and tab discarding while Auto-Outreach is actively running.
let dashboardKeepAliveAudioCtx = null;
let dashboardKeepAlivePort = null;
let dashboardKeepAliveHeartbeatTimer = null;
let dashboardHasSetupGesture = false;

function initDashboardSilentAudio() {
  if (dashboardKeepAliveAudioCtx && dashboardKeepAliveAudioCtx.state === "running") return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!dashboardKeepAliveAudioCtx) {
      dashboardKeepAliveAudioCtx = new AudioCtx();
      const osc = dashboardKeepAliveAudioCtx.createOscillator();
      const gain = dashboardKeepAliveAudioCtx.createGain();
      gain.gain.value = 0.00001; // Inaudible, completely silent
      osc.connect(gain);
      gain.connect(dashboardKeepAliveAudioCtx.destination);
      osc.start();
    }
    if (dashboardKeepAliveAudioCtx.state === "suspended") {
      dashboardKeepAliveAudioCtx.resume().catch(() => {});
    }
  } catch (e) {}
}

function startDashboardKeepAlive() {
  if (typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive) {
    initDashboardSilentAudio();
  } else if (!dashboardHasSetupGesture) {
    dashboardHasSetupGesture = true;
    const onGesture = () => {
      initDashboardSilentAudio();
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("click", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    };
    window.addEventListener("pointerdown", onGesture, { capture: true, once: true });
    window.addEventListener("click", onGesture, { capture: true, once: true });
    window.addEventListener("keydown", onGesture, { capture: true, once: true });
  }

  try {
    if (!dashboardKeepAlivePort && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.connect) {
      dashboardKeepAlivePort = chrome.runtime.connect({ name: "leadhunter-keepalive" });
      dashboardKeepAlivePort.onDisconnect.addListener(() => {
        dashboardKeepAlivePort = null;
      });
    }
    if (!dashboardKeepAliveHeartbeatTimer) {
      dashboardKeepAliveHeartbeatTimer = setInterval(() => {
        if (dashboardKeepAlivePort) {
          try { dashboardKeepAlivePort.postMessage({ type: "PING" }); } catch (e) {}
        }
      }, 20000);
    }
  } catch (e) {}
}

function stopDashboardKeepAlive() {
  if (dashboardKeepAliveAudioCtx) {
    try { dashboardKeepAliveAudioCtx.close(); } catch (e) {}
    dashboardKeepAliveAudioCtx = null;
  }
  if (dashboardKeepAliveHeartbeatTimer) {
    clearInterval(dashboardKeepAliveHeartbeatTimer);
    dashboardKeepAliveHeartbeatTimer = null;
  }
  if (dashboardKeepAlivePort) {
    try { dashboardKeepAlivePort.disconnect(); } catch (e) {}
    dashboardKeepAlivePort = null;
  }
}

// Storage Listener for live synchronization across LinkedIn scrapper & dashboard
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.leads) {
        leadsData = changes.leads.newValue || [];
        updateStats();
        renderLeads();
        updateOutreachBanner();
      }
      if (changes.settings) {
        appSettings = changes.settings.newValue || appSettings;
        updateOutreachBanner();
      }
    }
  });
}

// DOM Elements
const totalLeadsStat = document.getElementById("totalLeadsStat");
const hotLeadsStat = document.getElementById("hotLeadsStat");
const emailsStat = document.getElementById("emailsStat");
const outreachStat = document.getElementById("outreachStat");

const leadsGrid = document.getElementById("leadsGrid");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");

const filterEmailCb = document.getElementById("filterHasEmail");
const filterUrlCb = document.getElementById("filterHasUrl");
const filterHotCb = document.getElementById("filterHotOnly");

const exportCsvBtn = document.getElementById("exportCsvBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const revertToNewBtn = document.getElementById("revertToNewBtn");
const purgeDmLeadsBtn = document.getElementById("purgeDmLeadsBtn");

// Auto-Outreach Banner Elements
const autoOutreachBanner = document.getElementById("autoOutreachBanner");
const outreachPulseDot = document.getElementById("outreachPulseDot");
const outreachScheduleStatus = document.getElementById("outreachScheduleStatus");
const outreachWindowTag = document.getElementById("outreachWindowTag");
const outreachSentCount = document.getElementById("outreachSentCount");
const outreachTargetCount = document.getElementById("outreachTargetCount");
const outreachProgressFill = document.getElementById("outreachProgressFill");
const activeSenderBadge = document.getElementById("activeSenderBadge");
const toggleAutoOutreachBtn = document.getElementById("toggleAutoOutreachBtn");

// Lead Details Modal Elements
const leadModal = document.getElementById("leadModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalScore = document.getElementById("modalScore");
const modalRole = document.getElementById("modalRole");
const modalCompany = document.getElementById("modalCompany");
const modalSignals = document.getElementById("modalSignals");
const modalContactInfo = document.getElementById("modalContactInfo");
const modalSnippet = document.getElementById("modalSnippet");
const modalNotesInput = document.getElementById("modalNotesInput");
const modalSaveNotesBtn = document.getElementById("modalSaveNotesBtn");
const modalCopyLeadBtn = document.getElementById("modalCopyLeadBtn");
const modalSendEmailBtn = document.getElementById("modalSendEmailBtn");
const modalPostLink = document.getElementById("modalPostLink");

// Outreach Composer Modal Elements
const outreachModal = document.getElementById("outreachModal");
const closeOutreachModalBtn = document.getElementById("closeOutreachModalBtn");
const outreachModalTitle = document.getElementById("outreachModalTitle");
const outreachRecipientInput = document.getElementById("outreachRecipientInput");
const outreachSubjectInput = document.getElementById("outreachSubjectInput");
const outreachBodyInput = document.getElementById("outreachBodyInput");
const launchGmailBtn = document.getElementById("launchGmailBtn");
const launchMailtoBtn = document.getElementById("launchMailtoBtn");
const copyPitchBtn = document.getElementById("copyPitchBtn");

// Telegram Sync Modal Elements
const extractTelegramBtn = document.getElementById("extractTelegramBtn");
const telegramModal = document.getElementById("telegramModal");
const closeTelegramModalBtn = document.getElementById("closeTelegramModalBtn");
const cancelTelegramModalBtn = document.getElementById("cancelTelegramModalBtn");
const runTelegramSyncBtn = document.getElementById("runTelegramSyncBtn");
const telegramChannelInput = document.getElementById("telegramChannelInput");
const telegramSyncProgress = document.getElementById("telegramSyncProgress");
const telegramSyncProgressText = document.getElementById("telegramSyncProgressText");

// Settings Elements
const targetRolesCloud = document.getElementById("targetRolesCloud");
const techStackCloud = document.getElementById("techStackCloud");
const exclusionsCloud = document.getElementById("exclusionsCloud");
const newRoleInput = document.getElementById("newRoleInput");
const newTechInput = document.getElementById("newTechInput");
const newExclusionInput = document.getElementById("newExclusionInput");
const addRoleBtn = document.getElementById("addRoleBtn");
const addTechBtn = document.getElementById("addTechBtn");
const addExclusionBtn = document.getElementById("addExclusionBtn");
const profileNameInput = document.getElementById("profileNameInput");
const profileEmailInput = document.getElementById("profileEmailInput");
const profilePhoneInput = document.getElementById("profilePhoneInput");
const templateSubjectInput = document.getElementById("templateSubjectInput");
const templateBodyInput = document.getElementById("templateBodyInput");
const minScoreSlider = document.getElementById("minScoreSlider");
const minScoreVal = document.getElementById("minScoreVal");
const strictRoleToggle = document.getElementById("strictRoleToggle");
const emailOnlyToggle = document.getElementById("emailOnlyToggle");
const autoSaveToggle = document.getElementById("autoSaveToggle");
const highlightToggle = document.getElementById("highlightToggle");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const resetDefaultsBtn = document.getElementById("resetDefaultsBtn");

// 3-CV and Multi-Account Elements
const cvAngularInput = document.getElementById("cvAngularInput");
const cvFrontendInput = document.getElementById("cvFrontendInput");
const cvFullstackInput = document.getElementById("cvFullstackInput");
const replyToInput = document.getElementById("replyToInput");
const senderAccountsList = document.getElementById("senderAccountsList");
const newSenderEmailInput = document.getElementById("newSenderEmailInput");
const newSenderQuotaInput = document.getElementById("newSenderQuotaInput");
const addSenderBtn = document.getElementById("addSenderBtn");

// ── INITIALIZATION ──────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupEventListeners();
  await loadData();
  renderSettings();
  updateOutreachBanner();
});

let renderedBatchCount = 40;

async function loadData() {
  appSettings = await getSettings();

  if (appSettings.telegramActiveChannels && Array.isArray(appSettings.telegramActiveChannels) && appSettings.telegramActiveChannels.length > 0) {
    selectedTelegramChannels = new Set(appSettings.telegramActiveChannels);
  } else {
    selectedTelegramChannels = new Set(TELEGRAM_CHANNELS.priority.map(c => c.username));
  }

  // 1. Immediately calculate and render live counts for all badge pills and dashboard stats (under 2ms)
  await updateStats();

  // 2. Lazy load ONLY active pipeline leads (default: 'new')
  // Already applied, contacted, and rejected leads remain safely stored in chrome.storage for reference & deduplication!
  await loadLeadsForCurrentStatus();

  renderedBatchCount = 40;
  renderLeads(true);
}

/**
 * Loads leads on-demand matching the active status filter.
 * Applied/Contacted/Rejected leads are only retrieved if the user explicitly opens their tab!
 */
async function loadLeadsForCurrentStatus() {
  if (currentStatusFilter === "applied") {
    leadsData = await getLeads({ status: "applied" });
  } else if (currentStatusFilter === "contacted") {
    leadsData = await getLeads({ status: "contacted" });
  } else if (currentStatusFilter === "reviewed") {
    leadsData = await getLeads({ status: "reviewed" });
  } else if (currentStatusFilter === "rejected") {
    leadsData = await getLeads({ status: "rejected" });
  } else if (currentStatusFilter === "replied") {
    leadsData = await getLeads({ status: "replied" });
  } else if (currentStatusFilter === "interview") {
    leadsData = await getLeads({ status: "interview" });
  } else if (currentStatusFilter === "all") {
    leadsData = await getLeads({ status: "all" });
  } else {
    // "new" and "queued" only load fresh new leads!
    leadsData = await getLeads({ status: "new" });
  }
}

// ── NAVIGATION & TABS ───────────────────────────────────────────────

function setupNavigation() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.tab;

      document.querySelectorAll(".tab-content").forEach(content => {
        content.classList.remove("active");
      });
      document.getElementById(currentTab).classList.add("active");
    });
  });
}

// ── EVENT LISTENERS ─────────────────────────────────────────────────

function setupEventListeners() {
  // Search
  searchInput.addEventListener("input", (e) => {
    currentSearchQuery = e.target.value;
    renderedBatchCount = 40;
    renderLeads(true);
  });

  // Sort
  sortSelect.addEventListener("change", (e) => {
    currentSort = e.target.value;
    renderedBatchCount = 40;
    renderLeads(true);
  });

  // Secondary filter checkboxes
  filterEmailCb.addEventListener("change", (e) => {
    filterHasEmail = e.target.checked;
    renderedBatchCount = 40;
    renderLeads(true);
  });
  filterUrlCb.addEventListener("change", (e) => {
    filterHasUrl = e.target.checked;
    renderedBatchCount = 40;
    renderLeads(true);
  });
  filterHotCb.addEventListener("change", (e) => {
    filterHotOnly = e.target.checked;
    renderedBatchCount = 40;
    renderLeads(true);
  });

  // Status Filter Pills with On-Demand Lazy Loading (Applied/Contacted/Rejected loaded only when clicked!)
  document.querySelectorAll(".filter-pill").forEach(pill => {
    pill.addEventListener("click", async () => {
      document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      currentStatusFilter = pill.dataset.status;
      await loadLeadsForCurrentStatus();
      renderedBatchCount = 40;
      renderLeads(true);
    });
  });

  // Banner Quick Filters for Queued and Sent
  const outreachQueuedPill = document.getElementById("outreachQueuedPill");
  if (outreachQueuedPill) {
    outreachQueuedPill.addEventListener("click", async () => {
      document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
      const pill = document.querySelector('.filter-pill[data-status="queued"]');
      if (pill) pill.classList.add("active");
      currentStatusFilter = "queued";
      await loadLeadsForCurrentStatus();
      renderedBatchCount = 40;
      renderLeads(true);
      showToast("Filtered by: ⚡ Queued Mails (Ready to Send)");
    });
  }

  const outreachSentPill = document.getElementById("outreachSentPill");
  if (outreachSentPill) {
    outreachSentPill.addEventListener("click", async () => {
      document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
      const pill = document.querySelector('.filter-pill[data-status="contacted"]');
      if (pill) pill.classList.add("active");
      currentStatusFilter = "contacted";
      await loadLeadsForCurrentStatus();
      renderedBatchCount = 40;
      renderLeads(true);
      showToast("Filtered by: 📬 Sent Outreach Mails");
    });
  }

  // Delegated Event Handling on leadsGrid (O(1) constant time, replaces thousands of per-card event listeners!)
  if (leadsGrid) {
    leadsGrid.addEventListener("click", async (e) => {
      // 0. Load More Button
      const loadMoreBtn = e.target.closest("#loadMoreLeadsBtn");
      if (loadMoreBtn) {
        renderedBatchCount += 40;
        renderLeads(false);
        return;
      }

      // 1. Send Email Button / Contact Pill Email click
      const emailBtn = e.target.closest(".send-outreach-btn, .contact-pill-email-btn");
      if (emailBtn) {
        e.stopPropagation();
        e.preventDefault();
        const id = emailBtn.dataset.id;
        const lead = leadsData.find(l => l.id === id);
        if (lead) openOutreachModal(lead);
        return;
      }

      // 2. Quick Copy Pitch Button
      const copyBtn = e.target.closest(".quick-copy-btn");
      if (copyBtn) {
        e.stopPropagation();
        const id = copyBtn.dataset.id;
        const lead = leadsData.find(l => l.id === id);
        if (lead) {
          const text = formatLeadStructuredText(lead);
          navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied "${lead.detectedRole}" lead to clipboard!`);
          });
        }
        return;
      }

      // 3. Open Details Modal
      const detailsBtn = e.target.closest(".details-btn");
      if (detailsBtn) {
        e.stopPropagation();
        const id = detailsBtn.dataset.id;
        const lead = leadsData.find(l => l.id === id);
        if (lead) openLeadModal(lead);
        return;
      }

      // 4. Delete Lead Button
      const deleteBtn = e.target.closest(".delete-btn");
      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        if (confirm("Delete this lead?")) {
          await deleteLead(id);
          leadsData = leadsData.filter(l => l.id !== id);
          await updateStats();
          renderLeads(false);
          showToast("Lead deleted from CRM");
        }
        return;
      }
    });

    // Delegated status dropdown change listener
    leadsGrid.addEventListener("change", async (e) => {
      const select = e.target.closest(".status-dropdown");
      if (select) {
        const id = select.dataset.id;
        const newStatus = select.value;
        const lead = leadsData.find(l => l.id === id);
        if (lead) lead.status = newStatus;
        await updateLeadStatus(id, newStatus);
        await updateStats();
        // If current filter is active and status was changed, remove from current view
        if (currentStatusFilter !== "all") {
          leadsData = leadsData.filter(l => l.id !== id);
        }
        renderLeads(false);
        showToast(`Updated status to "${newStatus.toUpperCase()}"`);
      }
    });
  }

  // Export Buttons
  exportCsvBtn.addEventListener("click", () => {
    if (leadsData.length === 0) return showToast("No leads to export.");
    const csvContent = exportLeadsToCsv(leadsData);
    downloadFile(csvContent, `leadhunter_leads_${Date.now()}.csv`, "text/csv");
    showToast("📁 Exported leads to CSV");
  });

  exportJsonBtn.addEventListener("click", () => {
    if (leadsData.length === 0) return showToast("No leads to export.");
    const jsonContent = exportLeadsToJson(leadsData);
    downloadFile(jsonContent, `leadhunter_leads_${Date.now()}.json`, "application/json");
    showToast("📁 Exported leads to JSON");
  });

  clearAllBtn.addEventListener("click", async () => {
    if (confirm("Are you sure you want to clear all leads from your CRM?")) {
      await clearAllLeads();
      leadsData = [];
      updateStats();
      renderLeads();
      showToast("🗑️ All leads cleared");
    }
  });

  // Bulk Actions (Revert to New / Accept All / Reject All)
  if (revertToNewBtn) {
    revertToNewBtn.addEventListener("click", async () => {
      const visibleReviewed = getFilteredLeads().filter(l => l.status === "reviewed");
      const allReviewed = leadsData.filter(l => l.status === "reviewed");
      const listToRevert = visibleReviewed.length > 0 ? visibleReviewed : allReviewed;

      if (listToRevert.length === 0) {
        return showToast("No leads with 'Reviewed' status found to revert.");
      }

      if (!confirm(`Revert ${listToRevert.length} lead(s) back to "New" status so they are queued for outreach?`)) {
        return;
      }

      const ids = listToRevert.map(l => l.id);
      await updateBulkLeadStatus(ids, "new");
      leadsData.forEach(l => {
        if (ids.includes(l.id)) l.status = "new";
      });
      updateStats();
      renderLeads();
      updateOutreachBanner();
      showToast(`🔄 Reverted ${ids.length} lead(s) back to "NEW"! Ready for outreach.`);
    });
  }

  // Purge DM & Non-Email Leads
  if (purgeDmLeadsBtn) {
    purgeDmLeadsBtn.addEventListener("click", async () => {
      const dmCount = leadsData.filter(l => l.requiresDm || !l.emails || l.emails.length === 0).length;
      if (dmCount === 0) {
        return showToast("No DM or non-email leads found in local storage.");
      }
      if (confirm(`Remove all ${dmCount} DM post and non-email leads from local storage?`)) {
        const { removedCount } = await removeDmLeadsFromStorage();
        await loadLeadsForCurrentStatus();
        await updateStats();
        renderLeads();
        await updateOutreachBanner();
        showToast(`🗑️ Removed ${removedCount} DM post lead(s) from local storage!`);
      }
    });
  }

  // Lead Modal Controls
  closeModalBtn.addEventListener("click", () => {
    leadModal.style.display = "none";
  });

  modalSendEmailBtn.addEventListener("click", () => {
    if (selectedLead) {
      leadModal.style.display = "none";
      openOutreachModal(selectedLead);
    }
  });

  modalSaveNotesBtn.addEventListener("click", async () => {
    if (selectedLead) {
      const notes = modalNotesInput.value;
      await updateLeadStatus(selectedLead.id, selectedLead.status, notes);
      selectedLead.notes = notes;
      const idx = leadsData.findIndex(l => l.id === selectedLead.id);
      if (idx >= 0) leadsData[idx].notes = notes;
      leadModal.style.display = "none";
      showToast("Notes saved");
      renderLeads();
    }
  });

  modalCopyLeadBtn.addEventListener("click", () => {
    if (selectedLead) {
      const text = formatLeadStructuredText(selectedLead);
      navigator.clipboard.writeText(text).then(() => {
        showToast("Structured lead copied to clipboard!");
      });
    }
  });

  // Outreach Composer Modal Controls
  closeOutreachModalBtn.addEventListener("click", () => {
    outreachModal.style.display = "none";
  });

  launchGmailBtn.addEventListener("click", async () => {
    const to = outreachRecipientInput.value.trim();
    const subject = outreachSubjectInput.value.trim();
    const body = outreachBodyInput.value.trim();

    // Determine matched CV routing & Drive link
    const lead = outreachTargetLead;
    const cvRouting = lead ? classifyLeadCvType(lead) : { type: "frontend", label: "Frontend Developer CV" };
    const cvLinks = appSettings.cvLinks || {};
    const cvLink = cvLinks[cvRouting.type] || cvLinks.frontend || cvLinks.angular || cvLinks.fullstack || "https://drive.google.com";

    const draftHtml = generateEmailHtml({
      body,
      cvLink,
      cvLabel: cvRouting.label
    });

    // 1. Copy rich HTML to clipboard so pasting directly preserves clickable links
    try {
      if (typeof ClipboardItem !== "undefined") {
        const textBlob = new Blob([body], { type: "text/plain" });
        const htmlBlob = new Blob([draftHtml], { type: "text/html" });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": textBlob,
            "text/html": htmlBlob
          })
        ]);
      } else {
        await navigator.clipboard.writeText(body);
      }
    } catch (e) {
      try { await navigator.clipboard.writeText(body); } catch (_) {}
    }

    // 2. Set pending Gmail draft in chrome.storage so gmailContent script automatically enhances the compose box
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({
        leadhunterPendingGmailDraft: {
          to,
          subject,
          body,
          html: draftHtml,
          cvLink,
          cvLabel: cvRouting.label,
          timestamp: Date.now()
        }
      });
    }

    const gmailUrl = getGmailComposeUrl(to, subject, body, { replyTo: appSettings.replyToEmail || "" });
    window.open(gmailUrl, "_blank");

    if (outreachTargetLead) {
      await updateLeadStatus(outreachTargetLead.id, "contacted");
      outreachTargetLead.status = "contacted";
      
      updateStats();
      renderLeads();
    }

    outreachModal.style.display = "none";
    showToast("Opened Gmail! CV link automatically attached as clickable link.");
  });

  const launchOutlookBtn = document.getElementById("launchOutlookBtn");
  if (launchOutlookBtn) {
    launchOutlookBtn.addEventListener("click", async () => {
      const to = outreachRecipientInput.value.trim();
      const subject = outreachSubjectInput.value.trim();
      let body = outreachBodyInput.value.trim();

      const cvType = (outreachCvSelect && outreachCvSelect.value) || "frontend";
      const cvLabels = {
        angular: "Angular Developer CV",
        frontend: "Frontend Developer CV",
        fullstack: "Full Stack Developer CV"
      };
      const cvLinks = appSettings.cvLinks || {};
      const cvLink = cvLinks[cvType] || "https://drive.google.com";

      if (cvLink && !body.includes(cvLink)) {
        body += `\n\nGoogle Drive CV (${cvLabels[cvType] || "Developer CV"}):\n${cvLink}`;
      }

      try {
        await navigator.clipboard.writeText(body);
      } catch (_) {}

      const outlookUrl = getOutlookComposeUrl(to, subject, body);
      window.open(outlookUrl, "_blank");

      if (outreachTargetLead) {
        await updateLeadStatus(outreachTargetLead.id, "contacted");
        outreachTargetLead.status = "contacted";
        updateStats();
        renderLeads();
      }

      outreachModal.style.display = "none";
      showToast("Opened Outlook / Hotmail! CV link attached.");
    });
  }

  launchMailtoBtn.addEventListener("click", async () => {
    const to = outreachRecipientInput.value.trim();
    const subject = outreachSubjectInput.value.trim();
    const body = outreachBodyInput.value.trim();

    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;

    if (outreachTargetLead) {
      await updateLeadStatus(outreachTargetLead.id, "contacted");
      outreachTargetLead.status = "contacted";
      
      updateStats();
      renderLeads();
    }

    outreachModal.style.display = "none";
    showToast("Opened default mail client");
  });

  copyPitchBtn.addEventListener("click", async () => {
    const body = outreachBodyInput.value;
    const lead = outreachTargetLead;
    const cvRouting = lead ? classifyLeadCvType(lead) : { type: "frontend", label: "Frontend Developer CV" };
    const cvLinks = appSettings.cvLinks || {};
    const cvLink = cvLinks[cvRouting.type] || cvLinks.frontend || cvLinks.angular || cvLinks.fullstack || "https://drive.google.com";

    const draftHtml = generateEmailHtml({
      body,
      cvLink,
      cvLabel: cvRouting.label
    });

    try {
      if (typeof ClipboardItem !== "undefined") {
        const textBlob = new Blob([body], { type: "text/plain" });
        const htmlBlob = new Blob([draftHtml], { type: "text/html" });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": textBlob,
            "text/html": htmlBlob
          })
        ]);
        showToast("📋 Rich pitch copied with clickable CV link! Ready to paste.");
      } else {
        await navigator.clipboard.writeText(body);
        showToast("Outreach pitch copied to clipboard!");
      }
    } catch (e) {
      navigator.clipboard.writeText(body).then(() => {
        showToast("Outreach pitch copied to clipboard!");
      });
    }
  });

  // Telegram Channel Sync Modal Controls
  if (extractTelegramBtn) {
    extractTelegramBtn.addEventListener("click", () => {
      telegramModal.style.display = "flex";
      renderTelegramChannelChips();
    });
  }

  if (closeTelegramModalBtn) {
    closeTelegramModalBtn.addEventListener("click", () => {
      telegramModal.style.display = "none";
    });
  }

  if (cancelTelegramModalBtn) {
    cancelTelegramModalBtn.addEventListener("click", () => {
      telegramModal.style.display = "none";
    });
  }

  // Telegram Preset Buttons
  document.querySelectorAll(".telegram-preset-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const preset = e.currentTarget.dataset.preset;
      selectTelegramPreset(preset);
    });
  });

  // Select All & Clear All
  const telegramSelectAllBtn = document.getElementById("telegramSelectAllBtn");
  if (telegramSelectAllBtn) {
    telegramSelectAllBtn.addEventListener("click", () => {
      selectedTelegramChannels = new Set(getAllTelegramChannels().map(c => c.username));
      renderTelegramChannelChips();
    });
  }

  const telegramClearAllBtn = document.getElementById("telegramClearAllBtn");
  if (telegramClearAllBtn) {
    telegramClearAllBtn.addEventListener("click", () => {
      selectedTelegramChannels.clear();
      renderTelegramChannelChips();
    });
  }

  // Stop Sync Button
  const stopTelegramSyncBtn = document.getElementById("stopTelegramSyncBtn");
  if (stopTelegramSyncBtn) {
    stopTelegramSyncBtn.addEventListener("click", () => {
      abortTelegramSync = true;
      stopTelegramSyncBtn.textContent = "Stopping...";
      stopTelegramSyncBtn.disabled = true;
    });
  }

  if (runTelegramSyncBtn) {
    runTelegramSyncBtn.addEventListener("click", async () => {
      let channelsToSync = [];
      const customInputRow = document.getElementById("telegramCustomInputRow");
      const isCustomVisible = customInputRow && customInputRow.style.display !== "none";
      const customVal = telegramChannelInput ? telegramChannelInput.value.trim() : "";

      if (isCustomVisible && customVal) {
        channelsToSync = customVal.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
      } else if (selectedTelegramChannels.size > 0) {
        channelsToSync = Array.from(selectedTelegramChannels);
      } else if (customVal) {
        channelsToSync = customVal.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
      }

      if (channelsToSync.length === 0) {
        showToast("Please select at least one channel to sync.");
        return;
      }

      const limitSelect = document.getElementById("telegramLimitSelect");
      const limit = limitSelect ? parseInt(limitSelect.value, 10) : 20;
      await syncTelegramLeads(channelsToSync, limit);
    });
  }

  // Settings Controls
  minScoreSlider.addEventListener("input", (e) => {
    minScoreVal.textContent = `${e.target.value}%`;
  });

  addRoleBtn.addEventListener("click", () => {
    const val = newRoleInput.value.trim();
    if (val && !appSettings.targetRoles.includes(val)) {
      appSettings.targetRoles.push(val);
      newRoleInput.value = "";
      renderSettingsTags();
    }
  });

  addTechBtn.addEventListener("click", () => {
    const val = newTechInput.value.trim();
    if (val && !appSettings.techStack.includes(val)) {
      appSettings.techStack.push(val);
      newTechInput.value = "";
      renderSettingsTags();
    }
  });

  addExclusionBtn.addEventListener("click", () => {
    const val = newExclusionInput.value.trim();
    if (val && !appSettings.exclusions.includes(val)) {
      appSettings.exclusions.push(val);
      newExclusionInput.value = "";
      renderSettingsTags();
    }
  });

  // Add Sender Account
  const newSenderProviderSelect = document.getElementById("newSenderProviderSelect");
  const hotmailNotice = document.getElementById("hotmailNotice");
  const checkHotmailNotice = () => {
    if (!hotmailNotice) return;
    const provider = newSenderProviderSelect ? newSenderProviderSelect.value : "";
    const email = newSenderEmailInput ? newSenderEmailInput.value.toLowerCase() : "";
    if (provider === "outlook" || email.includes("hotmail") || email.includes("outlook")) {
      hotmailNotice.style.display = "block";
    } else {
      hotmailNotice.style.display = "none";
    }
  };
  if (newSenderProviderSelect) {
    newSenderProviderSelect.addEventListener("change", checkHotmailNotice);
  }
  if (newSenderEmailInput) {
    newSenderEmailInput.addEventListener("input", checkHotmailNotice);
  }

  addSenderBtn.addEventListener("click", () => {
    const email = newSenderEmailInput.value.trim().toLowerCase();
    const quota = parseInt(newSenderQuotaInput.value, 10) || 120;
    const provider = (document.getElementById("newSenderProviderSelect") ? document.getElementById("newSenderProviderSelect").value : (email.includes("hotmail") || email.includes("outlook") ? "outlook" : "gmail"));
    const appPassword = (document.getElementById("newSenderPasswordInput") ? document.getElementById("newSenderPasswordInput").value.trim() : "");

    if (email && email.includes("@")) {
      if (!appSettings.senderAccounts) appSettings.senderAccounts = [];
      const exists = appSettings.senderAccounts.some(a => a.email.toLowerCase() === email);
      if (!exists) {
        appSettings.senderAccounts.push({
          email,
          provider,
          appPassword,
          dailyQuota: quota,
          sentToday: 0,
          enabled: true,
          isFallback: false
        });
        newSenderEmailInput.value = "";
        if (document.getElementById("newSenderPasswordInput")) {
          document.getElementById("newSenderPasswordInput").value = "";
        }
        checkHotmailNotice();
        renderSenderAccounts();
        updateOutreachBanner();
        showToast(`Added ${email} (${provider.toUpperCase()}, Quota: ${quota}/day)`);
      } else {
        showToast("This email is already in the sender pool");
      }
    } else {
      showToast("Please enter a valid email address");
    }
  });

  // Auto-Save & Manual Save for 3-CV Drive Links
  const autoSaveCvLinks = async (showNotification = true) => {
    if (!appSettings.cvLinks) appSettings.cvLinks = {};
    appSettings.cvLinks.angular = cvAngularInput.value.trim();
    appSettings.cvLinks.frontend = cvFrontendInput.value.trim();
    appSettings.cvLinks.fullstack = cvFullstackInput.value.trim();
    appSettings = await saveSettings(appSettings);
    if (showNotification) {
      showToast("💾 3-CV Google Drive Links Saved!");
    }
  };

  const saveCvLinksBtn = document.getElementById("saveCvLinksBtn");
  if (saveCvLinksBtn) {
    saveCvLinksBtn.addEventListener("click", () => autoSaveCvLinks(true));
  }

  [cvAngularInput, cvFrontendInput, cvFullstackInput].forEach(input => {
    if (input) {
      input.addEventListener("change", () => autoSaveCvLinks(true));
      input.addEventListener("blur", () => autoSaveCvLinks(false));
    }
  });

  // CV Drive Link Preview Test Buttons
  const attachCvPreview = (btnId, inputEl, label) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener("click", async () => {
        const url = inputEl.value.trim();
        await autoSaveCvLinks(false);
        if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
          window.open(url, "_blank");
        } else {
          showToast(`Please enter a valid Google Drive URL for ${label}`);
        }
      });
    }
  };

  attachCvPreview("previewAngularCvBtn", cvAngularInput, "Angular CV");
  attachCvPreview("previewFrontendCvBtn", cvFrontendInput, "Frontend CV");
  attachCvPreview("previewFullstackCvBtn", cvFullstackInput, "Full Stack CV");

  // Instant Test Email Dispatcher Button Trigger
  const sendTestEmailBtn = document.getElementById("sendTestEmailBtn");
  if (sendTestEmailBtn) {
    sendTestEmailBtn.addEventListener("click", async () => {
      const to = (document.getElementById("testEmailRecipient").value || "").trim();
      const sender = (document.getElementById("testSenderSelect") ? document.getElementById("testSenderSelect").value : "");
      const cvType = (document.getElementById("testCvSelect") ? document.getElementById("testCvSelect").value : "frontend");
      const subject = document.getElementById("testCustomSubject").value.trim();
      let body = document.getElementById("testCustomMessage").value;

      const cvLabels = {
        angular: "Angular Developer CV",
        frontend: "Frontend Developer CV",
        fullstack: "Full Stack Developer CV"
      };
      const cvLinks = appSettings.cvLinks || {};
      const cvLink = cvLinks[cvType] || "https://drive.google.com";

      body = body.replace(/\{cv_type\}/g, cvLabels[cvType] || "Developer CV");
      body = body.replace(/\{cv_link\}/g, cvLink);

      const senderObj = (appSettings.senderAccounts || []).find(a => a.email.toLowerCase() === sender.toLowerCase());
      const isOutlookSender = senderObj && (senderObj.provider === "outlook" || senderObj.email.includes("hotmail") || senderObj.email.includes("outlook"));

      if (!senderObj || !senderObj.appPassword || senderObj.appPassword.trim().length < 8) {
        if (isOutlookSender) {
          const outlookUrl = getOutlookComposeUrl(to, subject, body);
          window.open(outlookUrl, "_blank");
          showToast(`🚀 Opened Outlook / Hotmail Compose with pre-filled message.`);
        } else {
          const gmailUrl = getGmailComposeUrl(to, subject, body, { replyTo: appSettings.replyToEmail || "" });
          window.open(gmailUrl, "_blank");
          showToast(`🚀 Opened Gmail Compose. Paste your 16-char App Password above for 100% silent sending.`);
        }
        return;
      }

      const bridgeUrlInput = document.getElementById("smtpBridgeUrlInput");
      const liveBridgeUrl = (bridgeUrlInput && bridgeUrlInput.value.trim()) || (appSettings.autoOutreachSchedule && appSettings.autoOutreachSchedule.smtpBridgeUrl) || "http://localhost:3000";

      const htmlBody = generateEmailHtml({
        body,
        cvLink,
        cvLabel: cvLabels[cvType] || "Developer CV"
      });

      const res = await sendSilentEmailViaBridge({
        senderAccount: senderObj,
        to,
        replyTo: appSettings.replyToEmail || "",
        subject,
        body,
        html: htmlBody,
        bridgeUrl: liveBridgeUrl
      });

      if (res.success) {
        showToast(`✅ Real email delivered to ${to} via ${sender}! Check your inbox.`);
      } else if (res.isOffline) {
        if (isOutlookSender) {
          const outlookUrl = getOutlookComposeUrl(to, subject, body);
          window.open(outlookUrl, "_blank");
          showToast(`⚠️ SMTP Server unreachable at ${liveBridgeUrl}. Opened Outlook / Hotmail as fallback.`);
        } else {
          const gmailUrl = getGmailComposeUrl(to, subject, body, { replyTo: appSettings.replyToEmail || "" });
          window.open(gmailUrl, "_blank");
          showToast(`⚠️ SMTP Server unreachable at ${liveBridgeUrl}. Opened Gmail as fallback.`);
        }
      } else {
        if (isOutlookSender && (res.error && (res.error.includes("deprecated") || res.error.includes("535") || res.error.includes("Authentication")))) {
          const outlookUrl = getOutlookComposeUrl(to, subject, body);
          window.open(outlookUrl, "_blank");
          showToast(`ℹ️ Microsoft retired SMTP App Passwords for Hotmail. Opened pre-filled Outlook Web Compose!`);
        } else {
          showToast(`❌ SMTP Error: ${res.error || "Authentication failed. Check your App Password."}`);
        }
      }
    });
  }

  // Auto-Outreach Banner Button Trigger
  toggleAutoOutreachBtn.addEventListener("click", async () => {
    await startAutoOutreachBatch();
  });

  saveSettingsBtn.addEventListener("click", async () => {
    appSettings.minScoreThreshold = Number(minScoreSlider.value);
    appSettings.strictRoleMatch = strictRoleToggle.checked;
    appSettings.emailOnlyLeads = emailOnlyToggle ? emailOnlyToggle.checked : true;
    appSettings.autoSaveLeads = autoSaveToggle.checked;
    appSettings.highlightHotPosts = highlightToggle.checked;

    appSettings.userProfile = {
      name: profileNameInput.value.trim() || "Applicant",
      email: profileEmailInput.value.trim() || "",
      phone: profilePhoneInput.value.trim() || ""
    };

    appSettings.cvLinks = {
      angular: cvAngularInput.value.trim(),
      frontend: cvFrontendInput.value.trim(),
      fullstack: cvFullstackInput.value.trim()
    };

    appSettings.replyToEmail = replyToInput.value.trim();

    const bridgeUrlInput = document.getElementById("smtpBridgeUrlInput");
    if (bridgeUrlInput) {
      if (!appSettings.autoOutreachSchedule) appSettings.autoOutreachSchedule = {};
      appSettings.autoOutreachSchedule.smtpBridgeUrl = bridgeUrlInput.value.trim() || "http://localhost:3000";
    }

    let bodyText = templateBodyInput.value.trim() || `Hi,\n\nI'm making an application for the job of {role}. Please find my {cv_type} via Google Drive here:\n{cv_link}\n\nI describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.\n\nYou can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).\n\nRegards,\n{user_name}`;
    if (!bodyText.includes("{cv_link}")) {
      if (/Please find my CV attached( as stated in the job description)?\.?/i.test(bodyText)) {
        bodyText = bodyText.replace(
          /Please find my CV attached( as stated in the job description)?\.?/i,
          "Please find my {cv_type} via Google Drive here:\n{cv_link}"
        );
      } else {
        bodyText = bodyText.trim() + "\n\nPlease find my {cv_type} via Google Drive here:\n{cv_link}";
      }
      templateBodyInput.value = bodyText;
    }

    appSettings.emailTemplate = {
      subject: templateSubjectInput.value.trim() || "Application for {role} Position - {user_name}",
      body: bodyText
    };

    appSettings = await saveSettings(appSettings);
    updateOutreachBanner();
    showToast("✅ Settings, 3-CV Links & Multi-Account Pool Saved!");
  });

  const resetTemplateBtn = document.getElementById("resetTemplateBtn");
  if (resetTemplateBtn) {
    resetTemplateBtn.addEventListener("click", () => {
      templateSubjectInput.value = "Application for {role} Position - {user_name}";
      templateBodyInput.value = `Hi,\n\nI'm making an application for the job of {role}. Please find my {cv_type} via Google Drive here:\n{cv_link}\n\nI describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.\n\nYou can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).\n\nRegards,\n{user_name}`;
      showToast("✨ Reset to recommended template with Google Drive CV link!");
    });
  }

  resetDefaultsBtn.addEventListener("click", async () => {
    if (confirm("Reset all radar configurations to default?")) {
      appSettings = { ...DEFAULT_SETTINGS };
      await saveSettings(appSettings);
      renderSettings();
      updateOutreachBanner();
      showToast("Reset to default settings");
    }
  });
}

// ── STATS COMPUTATION ───────────────────────────────────────────────

async function updateStats() {
  const counts = await getLeadCounts();

  totalLeadsStat.textContent = String(counts.total);
  hotLeadsStat.textContent = String(counts.hot);
  emailsStat.textContent = String(counts.emails);
  outreachStat.textContent = String(counts.outreach);

  // Update status counts on pills
  const countAllEl = document.getElementById("countAll");
  if (countAllEl) countAllEl.textContent = String(counts.total);
  const countNewEl = document.getElementById("countNew");
  if (countNewEl) countNewEl.textContent = String(counts.new);
  const countQueuedEl = document.getElementById("countQueued");
  if (countQueuedEl) countQueuedEl.textContent = String(counts.queued);
  const countReviewedEl = document.getElementById("countReviewed");
  if (countReviewedEl) countReviewedEl.textContent = String(counts.reviewed);
  const countContactedEl = document.getElementById("countContacted");
  if (countContactedEl) countContactedEl.textContent = String(counts.contacted);
  const countAppliedEl = document.getElementById("countApplied");
  if (countAppliedEl) countAppliedEl.textContent = String(counts.applied);
  const countRepliedEl = document.getElementById("countReplied");
  if (countRepliedEl) countRepliedEl.textContent = String(counts.replied);
  const countInterviewEl = document.getElementById("countInterview");
  if (countInterviewEl) countInterviewEl.textContent = String(counts.interview);
  const countRejectedEl = document.getElementById("countRejected");
  if (countRejectedEl) countRejectedEl.textContent = String(counts.rejected);
}

// ── LEADS RENDERING & PIPELINE ──────────────────────────────────────

function getFilteredLeads() {
  let list = [...leadsData];

  // Status Filter
  if (currentStatusFilter === "queued") {
    list = list.filter(l => l.status === "new" && l.emails && l.emails.length > 0);
  } else if (currentStatusFilter !== "all") {
    list = list.filter(l => l.status === currentStatusFilter);
  }

  // Search Filter
  if (currentSearchQuery.trim()) {
    const q = currentSearchQuery.toLowerCase().trim();
    list = list.filter(l =>
      (l.detectedRole && l.detectedRole.toLowerCase().includes(q)) ||
      (l.company && l.company.toLowerCase().includes(q)) ||
      (l.authorName && l.authorName.toLowerCase().includes(q)) ||
      (l.textSnippet && l.textSnippet.toLowerCase().includes(q)) ||
      (l.emails && l.emails.some(e => e.toLowerCase().includes(q))) ||
      (l.techMatches && l.techMatches.some(t => t.toLowerCase().includes(q)))
    );
  }

  // Checkbox filters
  if (filterHasEmail) {
    list = list.filter(l => l.emails && l.emails.length > 0);
  }
  if (filterHasUrl) {
    list = list.filter(l => l.applicationUrls && l.applicationUrls.length > 0);
  }
  if (filterHotOnly) {
    list = list.filter(l => l.score >= 80);
  }

  // Sort
  if (currentSort === "scoreDesc") {
    list.sort((a, b) => b.score - a.score || b.detectedAt - a.detectedAt);
  } else if (currentSort === "newest") {
    list.sort((a, b) => b.detectedAt - a.detectedAt);
  } else if (currentSort === "oldest") {
    list.sort((a, b) => a.detectedAt - b.detectedAt);
  }

  return list;
}

function renderLeads(reset = false) {
  if (reset) {
    renderedBatchCount = 40;
  }
  const list = getFilteredLeads();

  // Render HTML
  if (list.length === 0) {
    leadsGrid.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";
  const visible = list.slice(0, renderedBatchCount);
  let html = visible.map(lead => createLeadCardHtml(lead)).join("");

  if (renderedBatchCount < list.length) {
    const remaining = list.length - renderedBatchCount;
    html += `
      <div class="load-more-container" style="grid-column: 1 / -1; text-align: center; padding: 24px 0;">
        <button class="btn btn-outline" id="loadMoreLeadsBtn" style="padding: 10px 24px; font-weight: 600; font-size: 14px; border-color: rgba(0, 168, 120, 0.4);">
          Showing ${visible.length} of ${list.length} Leads — Click to Load Next ${Math.min(40, remaining)}
        </button>
      </div>
    `;
  }

  leadsGrid.innerHTML = html;
}

function attachCardEvents() {
  // Maintained for backward compatibility; actual events are handled via high-performance event delegation on leadsGrid
}

function createLeadCardHtml(lead) {
  const isHot = lead.score >= 80;
  const scoreClass = isHot ? "hot" : "relevant";
  const scoreIcon = isHot ? ICONS.flame : ICONS.target;
  const scoreLabel = isHot ? `${lead.score}% HOT` : `${lead.score}% MATCH`;

  // Tech tags
  const techHtml = (lead.techMatches || []).slice(0, 5).map(t =>
    `<span class="tech-tag">${t}</span>`
  ).join("");

  // Contact pills
  let contactHtml = "";
  if (lead.emails && lead.emails.length > 0) {
    contactHtml += `
      <button class="contact-pill email contact-pill-email-btn" data-id="${lead.id}" title="Click to Compose Email via Gmail (MailSuite Ready)">
        ${ICONS.mail}
        <span>${lead.emails[0]}</span>
      </button>
    `;
  }
  if (lead.applicationUrls && lead.applicationUrls.length > 0) {
    contactHtml += `
      <a href="${lead.applicationUrls[0]}" target="_blank" rel="noopener noreferrer" class="contact-pill apply-url" title="Open Job Application Link">
        ${ICONS.externalLink}
        <span>Apply Link</span>
      </a>
    `;
  }
  if (lead.requiresDm) {
    contactHtml += `
      <a href="${lead.authorProfile || lead.postUrl || '#'}" target="_blank" rel="noopener noreferrer" class="contact-pill dm" title="Send Direct Message to Poster">
        ${ICONS.message}
        <span>DM Poster</span>
      </a>
    `;
  }

  const hasEmail = lead.emails && lead.emails.length > 0;
  const hasUrl = lead.applicationUrls && lead.applicationUrls.length > 0;

  // Primary Action
  let primaryActionHtml = "";
  if (hasEmail) {
    primaryActionHtml = `
      <button class="btn btn-primary send-outreach-btn" data-id="${lead.id}" title="Send Email (Pre-filled Gmail with MailSuite)">
        ${ICONS.send}
        <span>Send Email</span>
      </button>
    `;
  } else if (hasUrl) {
    primaryActionHtml = `
      <a href="${lead.applicationUrls[0]}" target="_blank" rel="noopener noreferrer" class="btn btn-primary apply-url-card-btn" title="Open Application Link">
        ${ICONS.externalLink}
        <span>Apply Link</span>
      </a>
    `;
  } else if (lead.requiresDm) {
    primaryActionHtml = `
      <a href="${lead.authorProfile || lead.postUrl || '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-primary dm-card-btn" title="Send Direct Message">
        ${ICONS.message}
        <span>DM Poster</span>
      </a>
    `;
  }

  // Secondary/Utility Actions
  let secondaryActionsHtml = "";
  if (hasEmail && hasUrl) {
    secondaryActionsHtml += `
      <a href="${lead.applicationUrls[0]}" target="_blank" rel="noopener noreferrer" class="btn-icon" title="Open Application Link">
        ${ICONS.externalLink}
      </a>
    `;
  }

  secondaryActionsHtml += `
    <button class="btn-icon quick-copy-btn" data-id="${lead.id}" title="Copy Structured Lead">
      ${ICONS.copy}
    </button>
    <button class="btn-icon details-btn" data-id="${lead.id}" title="View Details & Notes">
      ${ICONS.eye}
    </button>
    <button class="btn-icon btn-icon-danger delete-btn" data-id="${lead.id}" title="Delete Lead">
      ${ICONS.trash}
    </button>
  `;

  // Format snippet & date cleanly
  const rawSnippet = (lead.textSnippet || "").replace(/\s+/g, " ").trim();
  const displaySnippet = rawSnippet ? `"${rawSnippet.slice(0, 160)}..."` : "No snippet preview available.";

  let formattedDate = "";
  try {
    formattedDate = lead.detectedAt ? new Date(lead.detectedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  } catch (e) {
    formattedDate = "";
  }

  // Queue & Sent Status Tag
  let queueStatusHtml = "";
  if (lead.status === "contacted" || lead.status === "applied") {
    queueStatusHtml = `<span class="lead-mail-badge sent" title="Cold outreach email dispatched">📬 Sent</span>`;
  } else if (lead.status === "new" && lead.emails && lead.emails.length > 0) {
    queueStatusHtml = `<span class="lead-mail-badge queued" title="Lead with verified email ready in auto-outreach queue">⚡ In Queue</span>`;
  }

  return `
    <div class="lead-card ${isHot ? "hot-lead" : ""}" data-id="${lead.id}">
      <div class="lead-card-header">
        <div class="lead-title-area">
          <h3 class="lead-card-title">${lead.detectedRole || "Prospective Opportunity"}</h3>
          <p class="lead-company-badge">${lead.company || lead.authorHeadline || "LinkedIn Opportunity"}</p>
        </div>
        <div class="header-badges">
          ${queueStatusHtml}
          <span class="score-badge ${scoreClass}">${scoreIcon}<span>${scoreLabel}</span></span>
        </div>
      </div>

      ${contactHtml ? `<div class="contact-strip">${contactHtml}</div>` : ""}

      ${techHtml ? `<div class="tech-tags">${techHtml}</div>` : ""}

      <div class="lead-snippet">${displaySnippet}</div>

      <div class="recruiter-meta">
        <span>By: ${lead.authorProfile ? `<a href="${lead.authorProfile}" target="_blank" rel="noopener noreferrer" class="recruiter-link">${lead.authorName || "LinkedIn Poster"}</a>` : (lead.authorName || "LinkedIn Poster")}</span>
        ${formattedDate ? `<span>${formattedDate}</span>` : ""}
      </div>

      <div class="lead-card-actions">
        <div class="status-dropdown-wrapper">
          <select class="status-dropdown" data-id="${lead.id}">
            <option value="new" ${lead.status === "new" ? "selected" : ""}>New</option>
            <option value="reviewed" ${lead.status === "reviewed" ? "selected" : ""}>Reviewed</option>
            <option value="contacted" ${lead.status === "contacted" ? "selected" : ""}>Contacted</option>
            <option value="applied" ${lead.status === "applied" ? "selected" : ""}>Applied</option>
            <option value="replied" ${lead.status === "replied" ? "selected" : ""}>Replied</option>
            <option value="interview" ${lead.status === "interview" ? "selected" : ""}>Interview</option>
            <option value="rejected" ${lead.status === "rejected" ? "selected" : ""}>Rejected</option>
          </select>
        </div>

        <div class="card-btns">
          ${primaryActionHtml}
          ${secondaryActionsHtml}
        </div>
      </div>
    </div>
  `;
}

function openLeadModal(lead) {
  selectedLead = lead;
  modalScore.textContent = `${lead.score}% ${lead.label.toUpperCase()}`;
  modalRole.textContent = lead.detectedRole;
  modalCompany.textContent = `${lead.company || lead.authorHeadline || ""} • Posted by ${lead.authorName}`;

  // Signals
  modalSignals.innerHTML = (lead.matchedSignals || []).map(s => `<li>${s}</li>`).join("");

  // Contact info
  let contactHtml = "";
  if (lead.emails && lead.emails.length > 0) {
    contactHtml += `<p><strong>Emails:</strong> ${lead.emails.join(", ")}</p>`;
  }
  if (lead.applicationUrls && lead.applicationUrls.length > 0) {
    contactHtml += `<p><strong>Apply Link:</strong> <a href="${lead.applicationUrls[0]}" target="_blank">${lead.applicationUrls[0]}</a></p>`;
  }
  if (lead.requiresDm) {
    contactHtml += `<p><strong>Action Required:</strong> Send a Direct Message on LinkedIn</p>`;
  }
  modalContactInfo.innerHTML = contactHtml || "<p>No direct emails found. Contact via LinkedIn profile.</p>";

  // Snippet
  modalSnippet.textContent = lead.textSnippet || "No snippet available.";

  // Notes
  modalNotesInput.value = lead.notes || "";

  // Post Link
  if (lead.postUrl) {
    modalPostLink.href = lead.postUrl;
    modalPostLink.style.display = "inline-flex";
  } else {
    modalPostLink.style.display = "none";
  }

  // Send Email button visibility in details modal
  if (lead.emails && lead.emails.length > 0) {
    modalSendEmailBtn.style.display = "inline-flex";
  } else {
    modalSendEmailBtn.style.display = "none";
  }

  leadModal.style.display = "flex";
}

function openOutreachModal(lead) {
  outreachTargetLead = lead;
  const draft = generateEmailDraft(lead, appSettings);

  outreachModalTitle.textContent = `Apply for ${lead.detectedRole}`;
  outreachRecipientInput.value = draft.to || (lead.emails ? lead.emails[0] : "");
  outreachSubjectInput.value = draft.subject;
  outreachBodyInput.value = draft.body;

  outreachModal.style.display = "flex";
}

// ── SETTINGS MANAGEMENT ─────────────────────────────────────────────

function renderSettings() {
  minScoreSlider.value = appSettings.minScoreThreshold || 60;
  minScoreVal.textContent = `${minScoreSlider.value}%`;
  strictRoleToggle.checked = appSettings.strictRoleMatch !== false;
  if (emailOnlyToggle) emailOnlyToggle.checked = appSettings.emailOnlyLeads !== false;
  autoSaveToggle.checked = appSettings.autoSaveLeads !== false;
  highlightToggle.checked = appSettings.highlightHotPosts !== false;

  const profile = appSettings.userProfile || { name: "", email: "", phone: "" };
  profileNameInput.value = profile.name || "";
  profileEmailInput.value = profile.email || "";
  profilePhoneInput.value = profile.phone || "";

  // 3-CV Google Drive Links
  const cvs = appSettings.cvLinks || {};
  cvAngularInput.value = cvs.angular || "";
  cvFrontendInput.value = cvs.frontend || "";
  cvFullstackInput.value = cvs.fullstack || "";

  // Reply-To and Sender Pool
  replyToInput.value = appSettings.replyToEmail || "";

  const bridgeUrlInput = document.getElementById("smtpBridgeUrlInput");
  if (bridgeUrlInput) {
    const schedule = appSettings.autoOutreachSchedule || {};
    bridgeUrlInput.value = schedule.smtpBridgeUrl || "http://localhost:3000";
  }

  const template = appSettings.emailTemplate || {
    subject: "Application for {role} Position - {user_name}",
    body: `Hi,\n\nI'm making an application for the job of {role}. Please find my {cv_type} via Google Drive here:\n{cv_link}\n\nI describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.\n\nYou can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).\n\nRegards,\n{user_name}`
  };
  let bodyValue = template.body || `Hi,\n\nI'm making an application for the job of {role}. Please find my {cv_type} via Google Drive here:\n{cv_link}\n\nI describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.\n\nYou can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).\n\nRegards,\n{user_name}`;
  if (!bodyValue.includes("{cv_link}")) {
    if (/Please find my CV attached( as stated in the job description)?\.?/i.test(bodyValue)) {
      bodyValue = bodyValue.replace(
        /Please find my CV attached( as stated in the job description)?\.?/i,
        "Please find my {cv_type} via Google Drive here:\n{cv_link}"
      );
    } else {
      bodyValue = (bodyValue.trim() + "\n\nPlease find my {cv_type} via Google Drive here:\n{cv_link}").trim();
    }
  }
  templateSubjectInput.value = template.subject || "Application for {role} Position - {user_name}";
  templateBodyInput.value = bodyValue;

  renderSettingsTags();
  renderSenderAccounts();
}

function renderSenderAccounts() {
  const accounts = appSettings.senderAccounts || [];
  if (!senderAccountsList) return;

  if (accounts.length === 0) {
    senderAccountsList.innerHTML = `<p class="help-text">No sender accounts configured.</p>`;
    return;
  }

  senderAccountsList.innerHTML = accounts.map((acc, idx) => {
    const isOutlook = acc.provider === "outlook" || acc.email.includes("hotmail") || acc.email.includes("outlook");
    const providerLabel = isOutlook ? "Hotmail / Outlook" : "Gmail";
    const providerClass = isOutlook ? "outlook" : "gmail";
    const isReady = !!(acc.appPassword && acc.appPassword.trim().length >= 8);

    return `
      <div class="sender-account-card">
        <div class="sender-card-top">
          <div class="sender-account-meta">
            <span class="provider-pill ${providerClass}">${providerLabel}</span>
            <strong>${acc.email}</strong>
            ${acc.isFallback ? `<span class="fallback-badge">Fallback (${acc.dailyQuota}/day)</span>` : ""}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="sender-quota-pill">${acc.sentToday || 0} / ${acc.dailyQuota || 120} Sent Today</span>
            ${!acc.isFallback ? `<button class="btn-icon btn-icon-danger remove-sender-btn" data-idx="${idx}" title="Remove Sender">${ICONS.trash}</button>` : ""}
          </div>
        </div>
        <div class="app-password-row">
          <div class="app-pwd-input-wrap">
            <span class="app-pwd-icon">${ICONS.key}</span>
            <input type="password" class="app-password-input" data-idx="${idx}" placeholder="Paste 16-character App Password..." value="${acc.appPassword || ""}">
            <button type="button" class="btn-toggle-pwd" data-idx="${idx}" title="Toggle Password Visibility">${ICONS.eye}</button>
          </div>
          <span class="silent-status-indicator ${isOutlook ? "active" : (isReady ? "active" : "pending")}">
            ${isOutlook ? `${ICONS.checkCircle}<span>1-Click Compose Ready</span>` : (isReady ? `${ICONS.checkCircle}<span>Silent Ready</span>` : `${ICONS.alertCircle}<span>Needs App Password</span>`)}
          </span>
        </div>
        ${isOutlook ? `<div style="font-size: 0.76rem; color: #93c5fd; margin-top: 6px; display: flex; align-items: center; gap: 4px;">ℹ️ Microsoft disabled SMTP app passwords for personal Hotmail accounts. 1-Click Compose will open pre-filled Outlook tabs automatically!</div>` : ""}
      </div>
    `;
  }).join("");

  // Populate Test Dispatcher Sender Select
  const testSenderSelect = document.getElementById("testSenderSelect");
  if (testSenderSelect) {
    testSenderSelect.innerHTML = accounts.map(a => `
      <option value="${a.email}">${a.email} ${a.isFallback ? '(Fallback)' : ''}</option>
    `).join("");
  }

  // App Password Auto-Save Listeners
  document.querySelectorAll(".app-password-input").forEach(input => {
    input.addEventListener("input", async (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      const val = e.target.value.trim();
      if (!isNaN(idx) && appSettings.senderAccounts[idx]) {
        appSettings.senderAccounts[idx].appPassword = val;
        await saveSettings(appSettings);
        const indicator = e.target.closest(".app-password-row").querySelector(".silent-status-indicator");
        if (indicator) {
          if (val.length >= 8) {
            indicator.className = "silent-status-indicator active";
            indicator.innerHTML = `${ICONS.checkCircle}<span>Silent Ready</span>`;
          } else {
            indicator.className = "silent-status-indicator pending";
            indicator.innerHTML = `${ICONS.alertCircle}<span>Needs App Password</span>`;
          }
        }
      }
    });
  });

  // Password Show / Hide Toggle
  document.querySelectorAll(".btn-toggle-pwd").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = e.currentTarget.dataset.idx;
      const input = document.querySelector(`.app-password-input[data-idx="${idx}"]`);
      if (input) {
        if (input.type === "password") {
          input.type = "text";
          e.currentTarget.innerHTML = ICONS.eyeOff;
        } else {
          input.type = "password";
          e.currentTarget.innerHTML = ICONS.eye;
        }
      }
    });
  });

  document.querySelectorAll(".remove-sender-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      if (!isNaN(idx)) {
        appSettings.senderAccounts.splice(idx, 1);
        await saveSettings(appSettings);
        renderSenderAccounts();
        updateOutreachBanner();
        showToast("Sender account removed");
      }
    });
  });
}

async function updateOutreachBanner() {
  if (!autoOutreachBanner) return;

  appSettings = resetDailyQuotasIfNeeded(appSettings);
  const stats = getOutreachEngineStats(appSettings);
  const schedule = appSettings.autoOutreachSchedule || {};
  const windowStatus = checkScheduleWindow(schedule);

  const counts = await getLeadCounts();
  const queuedCount = counts.queued || 0;
  const contactedTotal = (counts.contacted || 0) + (counts.applied || 0) + (counts.interview || 0) + (counts.replied || 0);

  const outreachQueuedCountEl = document.getElementById("outreachQueuedCount");
  if (outreachQueuedCountEl) outreachQueuedCountEl.textContent = String(queuedCount);

  const outreachSentTodayCountEl = document.getElementById("outreachSentTodayCount");
  if (outreachSentTodayCountEl) outreachSentTodayCountEl.textContent = String(stats.totalSentToday);

  const outreachTotalContactedEl = document.getElementById("outreachTotalContacted");
  if (outreachTotalContactedEl) outreachTotalContactedEl.textContent = String(contactedTotal);

  outreachSentCount.textContent = String(stats.totalSentToday);
  outreachTargetCount.textContent = String(stats.dailyGoal);
  outreachProgressFill.style.width = `${stats.percentComplete}%`;

  if (windowStatus.isWithin) {
    outreachPulseDot.classList.remove("paused");
    outreachWindowTag.textContent = "🟢 Active (6 AM - 2 PM)";
    outreachWindowTag.style.borderColor = "rgba(0, 200, 150, 0.4)";
    outreachWindowTag.style.color = "#00875A";
  } else {
    outreachPulseDot.classList.add("paused");
    outreachWindowTag.textContent = `🌙 ${windowStatus.message}`;
    outreachWindowTag.style.borderColor = "rgba(148, 163, 184, 0.4)";
    outreachWindowTag.style.color = "#64748B";
  }

  const accounts = appSettings.senderAccounts || [];
  if (accounts.length === 0) {
    activeSenderBadge.textContent = "No accounts configured";
  } else {
    const nextSender = getNextAvailableSender(accounts);
    if (nextSender) {
      activeSenderBadge.textContent = `${nextSender.email} (${nextSender.remaining} left)`;
    } else {
      activeSenderBadge.textContent = "Daily quota reached";
    }
  }
}

// ── TELEGRAM MULTI-CHANNEL INGESTION SYSTEM ─────────────────────────

export function renderTelegramChannelChips() {
  const chipsContainer = document.getElementById("telegramChannelChips");
  if (!chipsContainer) return;

  const allChannels = getAllTelegramChannels();
  const selectedCountEl = document.getElementById("telegramSelectedCount");
  const runSyncCountBadge = document.getElementById("runSyncCountBadge");

  chipsContainer.innerHTML = allChannels.map(ch => {
    const isSelected = selectedTelegramChannels.has(ch.username);
    return `
      <div class="telegram-channel-chip ${isSelected ? "selected" : ""}" data-channel="${ch.username}" title="${ch.name} (${ch.category}) — Focus: ${ch.focus}">
        <span class="chip-check">${isSelected ? "✓" : "○"}</span>
        <span class="chip-name">@${ch.username}</span>
        <span class="chip-sub">${ch.subscribers}</span>
      </div>
    `;
  }).join("");

  if (selectedCountEl) selectedCountEl.textContent = String(selectedTelegramChannels.size);
  if (runSyncCountBadge) runSyncCountBadge.textContent = `${selectedTelegramChannels.size} Channel${selectedTelegramChannels.size === 1 ? "" : "s"}`;

  // Attach click listener for interactive chip toggling
  chipsContainer.querySelectorAll(".telegram-channel-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const chName = chip.dataset.channel;
      if (selectedTelegramChannels.has(chName)) {
        selectedTelegramChannels.delete(chName);
      } else {
        selectedTelegramChannels.add(chName);
      }
      renderTelegramChannelChips();
    });
  });
}

export function selectTelegramPreset(preset) {
  currentTelegramPreset = preset;
  const customInputRow = document.getElementById("telegramCustomInputRow");
  const chipsSection = document.getElementById("telegramChipsSection");

  document.querySelectorAll(".telegram-preset-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.preset === preset);
  });

  if (preset === "priority") {
    selectedTelegramChannels = new Set(TELEGRAM_CHANNELS.priority.map(c => c.username));
    if (customInputRow) customInputRow.style.display = "none";
    if (chipsSection) chipsSection.style.display = "block";
  } else if (preset === "dev") {
    // Frontend & Fullstack: Category C + Category D channels
    const devChannels = [
      ...TELEGRAM_CHANNELS.categoryC.map(c => c.username),
      ...TELEGRAM_CHANNELS.categoryD.map(c => c.username)
    ];
    selectedTelegramChannels = new Set(devChannels);
    if (customInputRow) customInputRow.style.display = "none";
    if (chipsSection) chipsSection.style.display = "block";
  } else if (preset === "all") {
    selectedTelegramChannels = new Set(getAllTelegramChannels().map(c => c.username));
    if (customInputRow) customInputRow.style.display = "none";
    if (chipsSection) chipsSection.style.display = "block";
  } else if (preset === "custom") {
    if (customInputRow) customInputRow.style.display = "block";
    if (telegramChannelInput) telegramChannelInput.focus();
  }

  renderTelegramChannelChips();
}

/**
 * Multi-Channel Telegram Ingestion & Radar Lead Extractor.
 * Ingests live job postings across single or multiple selected Telegram channels with 1 click.
 * Qualified leads are scored, deduplicated, and saved with status: "new", ready for Auto-Outreach!
 */
export async function syncTelegramLeads(channelInput, maxMessages = 20) {
  let channelList = [];
  if (Array.isArray(channelInput)) {
    channelList = channelInput;
  } else if (typeof channelInput === "string" && channelInput.trim()) {
    channelList = channelInput.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  } else if (selectedTelegramChannels.size > 0) {
    channelList = Array.from(selectedTelegramChannels);
  }

  channelList = channelList.map(ch => 
    ch.replace(/^https?:\/\/t\.me\/(s\/)?/i, "")
      .replace(/^@/, "")
      .replace(/\/.*$/, "")
      .trim()
  ).filter(Boolean);

  // Deduplicate target channels
  channelList = Array.from(new Set(channelList));

  if (channelList.length === 0) {
    showToast("Please select or enter at least one Telegram channel.");
    return null;
  }

  // Persist user selection
  appSettings.telegramActiveChannels = channelList;
  appSettings.telegramChannel = channelList[0];
  saveSettings({
    telegramActiveChannels: channelList,
    telegramChannel: channelList[0]
  }).catch(() => {});

  isTelegramSyncRunning = true;
  abortTelegramSync = false;

  const progressEl = document.getElementById("telegramSyncProgress");
  const progressText = document.getElementById("telegramSyncProgressText");
  const progressCurrent = document.getElementById("telegramProgressCurrent");
  const progressTotal = document.getElementById("telegramProgressTotal");
  const progressBarFill = document.getElementById("telegramProgressBarFill");
  const liveStatsEl = document.getElementById("telegramSyncLiveStats");
  const stopSyncBtn = document.getElementById("stopTelegramSyncBtn");

  if (progressEl) progressEl.style.display = "block";
  if (runTelegramSyncBtn) runTelegramSyncBtn.disabled = true;
  if (stopSyncBtn) {
    stopSyncBtn.disabled = false;
    stopSyncBtn.textContent = "⏹️ Stop Sync";
  }

  if (progressTotal) progressTotal.textContent = String(channelList.length);
  if (progressBarFill) progressBarFill.style.width = "0%";

  let totalScanned = 0;
  let totalQualified = 0;
  let totalNewAdded = 0;
  let scannedChannelsCount = 0;
  const channelResults = [];

  try {
    for (let i = 0; i < channelList.length; i++) {
      if (abortTelegramSync) {
        showToast("⏹️ Telegram Sync stopped by user.");
        break;
      }

      const cleanChannel = channelList[i];
      if (progressCurrent) progressCurrent.textContent = String(i + 1);
      const percent = Math.round(((i) / channelList.length) * 100);
      if (progressBarFill) progressBarFill.style.width = `${percent}%`;

      if (progressText) {
        progressText.textContent = `Connecting to @${cleanChannel}...`;
      }

      try {
        const targetCount = Number(maxMessages) || 20;
        const maxPages = Math.min(5, Math.ceil(targetCount / 20));
        let beforeId = null;
        const channelMessages = [];
        const seenPostIds = new Set();

        for (let page = 0; page < maxPages; page++) {
          if (abortTelegramSync) break;

          let url = `https://t.me/s/${cleanChannel}`;
          if (beforeId) {
            url += `?before=${beforeId}`;
          }

          if (progressText) {
            progressText.textContent = `Scanning @${cleanChannel} (page ${page + 1}, ${channelMessages.length} loaded)...`;
          }

          const response = await fetch(url, {
            headers: {
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
          });

          if (!response.ok) {
            console.warn(`[TelegramSync] Channel @${cleanChannel} returned HTTP ${response.status}`);
            break;
          }

          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const messageWraps = doc.querySelectorAll(".tgme_widget_message_wrap");
          if (messageWraps.length === 0) break;

          const pageMessages = [];
          for (const node of messageWraps) {
            const messageEl = node.querySelector(".tgme_widget_message");
            if (!messageEl) continue;

            const dataPost = messageEl.getAttribute("data-post") || "";
            if (dataPost && seenPostIds.has(dataPost)) continue;
            if (dataPost) seenPostIds.add(dataPost);

            const textEl = messageEl.querySelector(".tgme_widget_message_text");
            const text = textEl ? cleanText(textEl.textContent) : "";
            if (!text || text.length < 20) continue;

            const timeEl = messageEl.querySelector("time");
            const authorEl = messageEl.querySelector(".tgme_widget_message_owner_name");
            const authorName = authorEl ? authorEl.textContent.trim() : `@${cleanChannel}`;
            const postUrl = dataPost ? `https://t.me/${dataPost}` : `https://t.me/s/${cleanChannel}`;

            pageMessages.push({
              id: dataPost || `tg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              dataPost,
              text,
              authorName,
              postUrl,
              datetime: timeEl && timeEl.getAttribute("datetime") ? timeEl.getAttribute("datetime") : null
            });
          }

          if (pageMessages.length === 0) break;
          channelMessages.push(...pageMessages);

          // Find oldest message ID on this page to paginate backwards
          const oldestDataPost = pageMessages[0].dataPost;
          if (oldestDataPost && oldestDataPost.includes("/")) {
            const numId = oldestDataPost.split("/")[1];
            if (numId) {
              beforeId = numId;
            } else {
              break;
            }
          } else {
            break;
          }

          if (channelMessages.length >= targetCount) break;
        }

        totalScanned += channelMessages.length;
        scannedChannelsCount++;

        let chQualified = 0;
        let chNewAdded = 0;

        for (const msg of channelMessages) {
          const scoreResult = scorePost(msg.text, appSettings);
          const emails = extractEmails(msg.text);
          const appUrls = extractApplicationUrls(msg.text);

          if (scoreResult.score >= (appSettings.minScoreThreshold || 40) && emails.length > 0) {
            chQualified++;
            totalQualified++;

            const leadData = {
              id: msg.id,
              urn: msg.dataPost ? `telegram:${msg.dataPost}` : `telegram:${cleanChannel}:${Date.now()}`,
              detectedRole: scoreResult.detectedRole || "Software Engineer",
              company: msg.authorName || "Telegram Job Posting",
              authorName: msg.authorName,
              authorHeadline: `Telegram Channel (@${cleanChannel})`,
              authorProfile: `https://t.me/${cleanChannel}`,
              postUrl: msg.postUrl,
              score: scoreResult.score,
              label: scoreResult.label,
              matchedSignals: scoreResult.matchedSignals || [],
              techMatches: scoreResult.techMatches || [],
              emails: emails,
              applicationUrls: appUrls,
              requiresDm: false,
              textSnippet: msg.text,
              status: "new",
              source: `telegram:@${cleanChannel}`,
              detectedAt: msg.datetime ? new Date(msg.datetime).getTime() : Date.now()
            };

            const saveResult = await saveLead(leadData);
            if (saveResult && saveResult.isNew) {
              chNewAdded++;
              totalNewAdded++;
            }
          }
        }

        channelResults.push({
          channel: cleanChannel,
          scanned: channelMessages.length,
          qualified: chQualified,
          newAdded: chNewAdded
        });

        if (liveStatsEl) {
          liveStatsEl.textContent = `Found: ${totalQualified} leads (${totalNewAdded} new)`;
        }

        // Friendly brief delay between channels (350ms)
        if (i < channelList.length - 1 && !abortTelegramSync) {
          await new Promise(r => setTimeout(r, 350));
        }
      } catch (chErr) {
        console.error(`Error scanning channel @${cleanChannel}:`, chErr);
      }
    }

    if (progressBarFill) progressBarFill.style.width = "100%";

    // Instant CRM UI update with status-isolated lazy loading
    await loadLeadsForCurrentStatus();
    await updateStats();
    renderLeads();
    await updateOutreachBanner();

    if (telegramModal) telegramModal.style.display = "none";
    showToast(`🎉 Telegram Sync Complete! Scanned ${scannedChannelsCount} channel(s) (${totalScanned} msgs). Found ${totalQualified} qualified job leads (${totalNewAdded} brand new). Ready for Auto-Outreach!`);
    return {
      scannedChannels: scannedChannelsCount,
      totalScanned,
      totalQualified,
      totalNewAdded,
      details: channelResults
    };
  } catch (err) {
    showToast(`❌ Telegram Extraction Failed: ${err.message}`);
    return null;
  } finally {
    isTelegramSyncRunning = false;
    if (progressEl) progressEl.style.display = "none";
    if (runTelegramSyncBtn) runTelegramSyncBtn.disabled = false;
  }
}

async function startAutoOutreachBatch() {
  if (isAutoOutreachRunning) {
    isAutoOutreachRunning = false;
    stopDashboardKeepAlive();
    toggleAutoOutreachBtn.classList.remove("btn-danger");
    toggleAutoOutreachBtn.classList.add("btn-primary");
    toggleAutoOutreachBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      <span>Auto-Outreach New Leads</span>
    `;
    showToast("⏹️ Auto-Outreach stopped.");
    return;
  }

  const schedule = appSettings.autoOutreachSchedule || {};
  const windowStatus = checkScheduleWindow(schedule);

  if (!windowStatus.isWithin) {
    showToast(`⚠️ Operating window is 6:00 AM - 2:00 PM (${windowStatus.message})`);
  }

  const newLeads = await getLeads({ status: "new" });
  let initialNewLeads = newLeads.filter(l => l.emails && l.emails.length > 0);
  if (initialNewLeads.length === 0) {
    const reviewedLeads = await getLeads({ status: "reviewed" });
    const reviewedLeadsWithEmail = reviewedLeads.filter(l => l.emails && l.emails.length > 0);
    if (reviewedLeadsWithEmail.length > 0) {
      if (confirm(`You have 0 "New" leads, but ${reviewedLeadsWithEmail.length} "Reviewed" lead(s) with verified emails.\n\nRevert them to "New" and start Auto-Outreach now?`)) {
        const ids = reviewedLeadsWithEmail.map(l => l.id);
        await updateBulkLeadStatus(ids, "new");
        await loadLeadsForCurrentStatus();
        await updateStats();
        renderLeads();
        await updateOutreachBanner();
        initialNewLeads = (await getLeads({ status: "new" })).filter(l => l.emails && l.emails.length > 0);
      }
    }
  }

  const initialSender = getNextAvailableSender(appSettings.senderAccounts || []);
  if (!initialSender) {
    showToast("All sender account quotas reached for today. Quotas reset at midnight!");
    return;
  }

  isAutoOutreachRunning = true;
  startDashboardKeepAlive();

  toggleAutoOutreachBtn.classList.remove("btn-primary");
  toggleAutoOutreachBtn.classList.add("btn-danger");
  toggleAutoOutreachBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="16" height="16" x="4" y="4" rx="2"></rect></svg>
    <span>Stop Auto-Outreach</span>
  `;

  if (initialNewLeads.length === 0) {
    showToast("📡 Auto-Outreach active & listening! Will dispatch as new leads are captured by radar.");
  }

  let processedCount = 0;

  try {
    while (isAutoOutreachRunning) {
      // Re-fetch only fresh new leads from storage (keeps performance instant even with 1300+ total leads)
      const freshNewLeads = await getLeads({ status: "new" });
      const newLeadsWithEmail = freshNewLeads.filter(l => l.emails && l.emails.length > 0);

      if (newLeadsWithEmail.length === 0) {
        // DO NOT QUIT! Enter Standby / Listening mode and wait for the scrapper to find more leads!
        toggleAutoOutreachBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
          <span>Listening for Leads (Radar Active)...</span>
        `;
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      const nextSender = getNextAvailableSender(appSettings.senderAccounts || []);
      if (!nextSender) {
        showToast("All sender account quotas have been reached for today. Quotas reset at midnight!");
        break;
      }

      const lead = newLeadsWithEmail[0];
      const draft = generateEmailDraft(lead, appSettings);
      const hasAppPassword = !!(nextSender.appPassword && nextSender.appPassword.trim().length >= 8);

      if (hasAppPassword) {
        const bridgeUrl = (appSettings.autoOutreachSchedule && appSettings.autoOutreachSchedule.smtpBridgeUrl) || "http://localhost:3000";
        const res = await sendSilentEmailViaBridge({
          senderAccount: nextSender,
          to: draft.to,
          replyTo: appSettings.replyToEmail || "",
          subject: draft.subject,
          body: draft.body,
          html: draft.html,
          bridgeUrl
        });

        if (res.success) {
          await updateLeadStatus(lead.id, "contacted");
          lead.status = "contacted";
          appSettings = await incrementSenderQuota(nextSender.email, appSettings);
          await loadLeadsForCurrentStatus();
          await updateStats();
          renderLeads();
          await updateOutreachBanner();
          processedCount++;
          showToast(`✅ [${processedCount}] Delivered to ${draft.to} via ${nextSender.email} (${draft.cvLabel}). Next in ~45-90s.`);
        } else {
          const isOutlookSender = nextSender.provider === "outlook" || nextSender.email.includes("hotmail") || nextSender.email.includes("outlook");
          const webUrl = isOutlookSender
            ? getOutlookComposeUrl(draft.to, draft.subject, draft.body)
            : getGmailComposeUrl(draft.to, draft.subject, draft.body, { replyTo: appSettings.replyToEmail || "" });
          window.open(webUrl, "_blank");
          await updateLeadStatus(lead.id, "contacted");
          lead.status = "contacted";
          appSettings = await incrementSenderQuota(nextSender.email, appSettings);
          await loadLeadsForCurrentStatus();
          await updateStats();
          renderLeads();
          await updateOutreachBanner();
          processedCount++;
          showToast(`⚠️ Bridge offline. Opened ${isOutlookSender ? "Outlook" : "Gmail"} compose tab for ${draft.to}. Next in ~45-90s.`);
        }
      } else {
        const isOutlookSender = nextSender.provider === "outlook" || nextSender.email.includes("hotmail") || nextSender.email.includes("outlook");
        const webUrl = isOutlookSender
          ? getOutlookComposeUrl(draft.to, draft.subject, draft.body)
          : getGmailComposeUrl(draft.to, draft.subject, draft.body, { replyTo: appSettings.replyToEmail || "" });
        window.open(webUrl, "_blank");
        await updateLeadStatus(lead.id, "contacted");
        lead.status = "contacted";
        appSettings = await incrementSenderQuota(nextSender.email, appSettings);
        await loadLeadsForCurrentStatus();
        await updateStats();
        renderLeads();
        await updateOutreachBanner();
        processedCount++;
        showToast(`🚀 Opened ${isOutlookSender ? "Outlook" : "Gmail"} Compose for ${draft.to} via ${nextSender.email}. Next in ~45-90s.`);
      }

      // If more leads remain or in continuous run, apply balanced human interval (45 - 90 seconds) using wall-clock timing
      if (isAutoOutreachRunning) {
        const schedule = appSettings.autoOutreachSchedule || {};
        const minSec = schedule.minIntervalSec || 45;
        const maxSec = schedule.maxIntervalSec || 90;
        const delaySec = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
        const targetEndTime = Date.now() + (delaySec * 1000);

        while (Date.now() < targetEndTime && isAutoOutreachRunning) {
          const secondsLeft = Math.max(0, Math.ceil((targetEndTime - Date.now()) / 1000));
          const mins = Math.floor(secondsLeft / 60);
          const secs = secondsLeft % 60;
          const timeStr = mins > 0 ? `${mins}m ${secs < 10 ? "0" : ""}${secs}s` : `${secs}s`;
          toggleAutoOutreachBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="16" height="16" x="4" y="4" rx="2"></rect></svg>
            <span>Stop Outreach (Next in ${timeStr})</span>
          `;
          await new Promise(r => setTimeout(r, 1000));
        }

        if (isAutoOutreachRunning) {
          toggleAutoOutreachBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
            <span>Checking Next Lead...</span>
          `;
        }
      }
    }
  } finally {
    isAutoOutreachRunning = false;
    stopDashboardKeepAlive();
    toggleAutoOutreachBtn.classList.remove("btn-danger");
    toggleAutoOutreachBtn.classList.add("btn-primary");
    toggleAutoOutreachBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      <span>Auto-Outreach New Leads</span>
    `;
  }
}

function renderSettingsTags() {
  // Roles
  targetRolesCloud.innerHTML = (appSettings.targetRoles || []).map(role => `
    <span class="settings-tag">
      ${role}
      <span class="tag-remove" data-type="role" data-val="${role}">&times;</span>
    </span>
  `).join("");

  // Tech
  techStackCloud.innerHTML = (appSettings.techStack || []).map(tech => `
    <span class="settings-tag">
      ${tech}
      <span class="tag-remove" data-type="tech" data-val="${tech}">&times;</span>
    </span>
  `).join("");

  // Exclusions
  exclusionsCloud.innerHTML = (appSettings.exclusions || []).map(ex => `
    <span class="settings-tag">
      ${ex}
      <span class="tag-remove" data-type="exclusion" data-val="${ex}">&times;</span>
    </span>
  `).join("");

  // Remove tag listeners
  document.querySelectorAll(".tag-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const type = e.target.dataset.type;
      const val = e.target.dataset.val;
      if (type === "role") {
        appSettings.targetRoles = appSettings.targetRoles.filter(r => r !== val);
      } else if (type === "tech") {
        appSettings.techStack = appSettings.techStack.filter(t => t !== val);
      } else if (type === "exclusion") {
        appSettings.exclusions = appSettings.exclusions.filter(x => x !== val);
      }
      renderSettingsTags();
    });
  });
}

// ── UTILITIES ───────────────────────────────────────────────────────

function showToast(message) {
  const container = document.getElementById("toast");
  const msgEl = document.createElement("div");
  msgEl.className = "toast-msg";
  msgEl.textContent = message;
  container.appendChild(msgEl);

  setTimeout(() => {
    msgEl.remove();
  }, 3000);
}

function downloadFile(content, fileName, contentType) {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}
