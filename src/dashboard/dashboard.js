/**
 * dashboard.js
 * Full-featured local CRM and Radar Settings controller for LeadHunter.
 */

import {
  getLeads,
  getSettings,
  saveSettings,
  updateLeadStatus,
  updateBulkLeadStatus,
  deleteLead,
  clearAllLeads,
  exportLeadsToCsv,
  exportLeadsToJson
} from "../core/storage.js";
import { formatLeadStructuredText, generateEmailDraft, getGmailComposeUrl, classifyLeadCvType } from "../core/extractor.js";
import {
  checkScheduleWindow,
  getNextAvailableSender,
  incrementSenderQuota,
  getOutreachEngineStats,
  resetDailyQuotasIfNeeded,
  checkBridgeStatus,
  sendSilentEmailViaBridge
} from "../core/outreachEngine.js";
import { DEFAULT_SETTINGS } from "../config/defaults.js";
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
const acceptAllBtn = document.getElementById("acceptAllBtn");
const rejectAllBtn = document.getElementById("rejectAllBtn");

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

async function loadData() {
  appSettings = await getSettings();
  leadsData = await getLeads();
  updateStats();
  renderLeads();
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
    renderLeads();
  });

  // Sort
  sortSelect.addEventListener("change", (e) => {
    currentSort = e.target.value;
    renderLeads();
  });

  // Secondary filter checkboxes
  filterEmailCb.addEventListener("change", (e) => {
    filterHasEmail = e.target.checked;
    renderLeads();
  });
  filterUrlCb.addEventListener("change", (e) => {
    filterHasUrl = e.target.checked;
    renderLeads();
  });
  filterHotCb.addEventListener("change", (e) => {
    filterHotOnly = e.target.checked;
    renderLeads();
  });

  // Status Filter Pills
  document.querySelectorAll(".filter-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      currentStatusFilter = pill.dataset.status;
      renderLeads();
    });
  });

  // Banner Quick Filters for Queued and Sent
  const outreachQueuedPill = document.getElementById("outreachQueuedPill");
  if (outreachQueuedPill) {
    outreachQueuedPill.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
      const pill = document.querySelector('.filter-pill[data-status="queued"]');
      if (pill) pill.classList.add("active");
      currentStatusFilter = "queued";
      renderLeads();
      showToast("Filtered by: ⚡ Queued Mails (Ready to Send)");
    });
  }

  const outreachSentPill = document.getElementById("outreachSentPill");
  if (outreachSentPill) {
    outreachSentPill.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
      const pill = document.querySelector('.filter-pill[data-status="contacted"]');
      if (pill) pill.classList.add("active");
      currentStatusFilter = "contacted";
      renderLeads();
      showToast("Filtered by: 📬 Sent Outreach Mails");
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

  // Bulk Actions (Accept All / Reject All currently visible leads)
  if (acceptAllBtn) {
    acceptAllBtn.addEventListener("click", async () => {
      const visibleLeads = getFilteredLeads();
      if (visibleLeads.length === 0) {
        return showToast("No leads currently displayed to accept.");
      }
      if (!confirm(`Mark all ${visibleLeads.length} visible lead(s) as Reviewed/Accepted?`)) {
        return;
      }
      const ids = visibleLeads.map(l => l.id);
      await updateBulkLeadStatus(ids, "reviewed");
      leadsData.forEach(l => {
        if (ids.includes(l.id)) l.status = "reviewed";
      });
      updateStats();
      renderLeads();
      updateOutreachBanner();
      showToast(`✅ Accepted ${ids.length} lead(s) as Reviewed`);
    });
  }

  if (rejectAllBtn) {
    rejectAllBtn.addEventListener("click", async () => {
      const visibleLeads = getFilteredLeads();
      if (visibleLeads.length === 0) {
        return showToast("No leads currently displayed to reject.");
      }
      if (!confirm(`Mark all ${visibleLeads.length} visible lead(s) as Rejected? (Skips automated email outreach)`)) {
        return;
      }
      const ids = visibleLeads.map(l => l.id);
      await updateBulkLeadStatus(ids, "rejected");
      leadsData.forEach(l => {
        if (ids.includes(l.id)) l.status = "rejected";
      });
      updateStats();
      renderLeads();
      updateOutreachBanner();
      showToast(`🚫 Rejected ${ids.length} lead(s)`);
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

    const gmailUrl = getGmailComposeUrl(to, subject, body, { replyTo: appSettings.replyToEmail || "suptokhan24@gmail.com" });
    window.open(gmailUrl, "_blank");

    if (outreachTargetLead) {
      await updateLeadStatus(outreachTargetLead.id, "contacted");
      outreachTargetLead.status = "contacted";
      
      updateStats();
      renderLeads();
    }

    outreachModal.style.display = "none";
    showToast("Opened Gmail with pre-filled pitch & matched CV link!");
  });

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

  copyPitchBtn.addEventListener("click", () => {
    const body = outreachBodyInput.value;
    navigator.clipboard.writeText(body).then(() => {
      showToast("Outreach pitch copied to clipboard!");
    });
  });

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
  addSenderBtn.addEventListener("click", () => {
    const email = newSenderEmailInput.value.trim().toLowerCase();
    const quota = parseInt(newSenderQuotaInput.value, 10) || 60;
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
      const to = (document.getElementById("testEmailRecipient").value || "suptokhan24@gmail.com").trim();
      const sender = (document.getElementById("testSenderSelect") ? document.getElementById("testSenderSelect").value : "suptokhan25@gmail.com");
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
      
      if (!senderObj || !senderObj.appPassword || senderObj.appPassword.trim().length < 8) {
        const gmailUrl = getGmailComposeUrl(to, subject, body, { replyTo: appSettings.replyToEmail || "suptokhan24@gmail.com" });
        window.open(gmailUrl, "_blank");
        showToast(`🚀 Opened Gmail Compose. Paste your 16-char App Password above for 100% silent sending.`);
        return;
      }

      const bridgeUrlInput = document.getElementById("smtpBridgeUrlInput");
      const liveBridgeUrl = (bridgeUrlInput && bridgeUrlInput.value.trim()) || (appSettings.autoOutreachSchedule && appSettings.autoOutreachSchedule.smtpBridgeUrl) || "https://mailer.nexidant.com";

      const res = await sendSilentEmailViaBridge({
        senderAccount: senderObj,
        to,
        replyTo: appSettings.replyToEmail || "suptokhan24@gmail.com",
        subject,
        body,
        bridgeUrl: liveBridgeUrl
      });

      if (res.success) {
        showToast(`✅ Real email delivered to ${to} via ${sender}! Check your inbox.`);
      } else if (res.isOffline) {
        const gmailUrl = getGmailComposeUrl(to, subject, body, { replyTo: appSettings.replyToEmail || "suptokhan24@gmail.com" });
        window.open(gmailUrl, "_blank");
        showToast(`⚠️ SMTP Server unreachable at ${liveBridgeUrl}. Opened Gmail as fallback.`);
      } else {
        showToast(`❌ SMTP Error: ${res.error || "Authentication failed. Check your App Password."}`);
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
    appSettings.autoSaveLeads = autoSaveToggle.checked;
    appSettings.highlightHotPosts = highlightToggle.checked;

    appSettings.userProfile = {
      name: profileNameInput.value.trim() || "Supto Khan",
      email: profileEmailInput.value.trim() || "suptokhan24@gmail.com",
      phone: profilePhoneInput.value.trim() || "+8801620531802"
    };

    appSettings.cvLinks = {
      angular: cvAngularInput.value.trim(),
      frontend: cvFrontendInput.value.trim(),
      fullstack: cvFullstackInput.value.trim()
    };

    appSettings.replyToEmail = replyToInput.value.trim() || "suptokhan24@gmail.com";

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

function updateStats() {
  const total = leadsData.length;
  const hot = leadsData.filter(l => l.score >= 80).length;
  const emails = leadsData.reduce((acc, l) => acc + (l.emails ? l.emails.length : 0), 0);
  const outreach = leadsData.filter(l => ["contacted", "applied", "interview"].includes(l.status)).length;
  const queued = leadsData.filter(l => l.status === "new" && l.emails && l.emails.length > 0).length;

  totalLeadsStat.textContent = String(total);
  hotLeadsStat.textContent = String(hot);
  emailsStat.textContent = String(emails);
  outreachStat.textContent = String(outreach);

  // Update status counts on pills
  document.getElementById("countAll").textContent = String(total);
  document.getElementById("countNew").textContent = String(leadsData.filter(l => l.status === "new").length);
  const countQueuedEl = document.getElementById("countQueued");
  if (countQueuedEl) countQueuedEl.textContent = String(queued);
  document.getElementById("countReviewed").textContent = String(leadsData.filter(l => l.status === "reviewed").length);
  document.getElementById("countContacted").textContent = String(leadsData.filter(l => l.status === "contacted").length);
  document.getElementById("countApplied").textContent = String(leadsData.filter(l => l.status === "applied").length);
  document.getElementById("countReplied").textContent = String(leadsData.filter(l => l.status === "replied").length);
  document.getElementById("countInterview").textContent = String(leadsData.filter(l => l.status === "interview").length);
  document.getElementById("countRejected").textContent = String(leadsData.filter(l => l.status === "rejected").length);
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

function renderLeads() {
  const list = getFilteredLeads();

  // Render HTML
  if (list.length === 0) {
    leadsGrid.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";
  leadsGrid.innerHTML = list.map(lead => createLeadCardHtml(lead)).join("");

  // Attach card event listeners
  attachCardEvents();
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

function attachCardEvents() {
  // Status dropdown change
  document.querySelectorAll(".status-dropdown").forEach(select => {
    select.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const newStatus = e.target.value;
      const lead = leadsData.find(l => l.id === id);
      if (lead) lead.status = newStatus;
      await updateLeadStatus(id, newStatus);
      updateStats();
      renderLeads();
      showToast(`Updated status to "${newStatus.toUpperCase()}"`);
    });
  });

  // Send Email Button & Contact Pill Email click
  document.querySelectorAll(".send-outreach-btn, .contact-pill-email-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = e.currentTarget.dataset.id;
      const lead = leadsData.find(l => l.id === id);
      if (lead) openOutreachModal(lead);
    });
  });

  // 1-Click Quick Copy
  document.querySelectorAll(".quick-copy-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.dataset.id;
      const lead = leadsData.find(l => l.id === id);
      if (lead) {
        const text = formatLeadStructuredText(lead);
        navigator.clipboard.writeText(text).then(() => {
          showToast(`Copied "${lead.detectedRole}" lead to clipboard!`);
        });
      }
    });
  });

  // Open Details Modal
  document.querySelectorAll(".details-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.dataset.id;
      const lead = leadsData.find(l => l.id === id);
      if (lead) openLeadModal(lead);
    });
  });

  // Delete Lead
  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm("Delete this lead?")) {
        await deleteLead(id);
        leadsData = leadsData.filter(l => l.id !== id);
        updateStats();
        renderLeads();
        showToast("Lead deleted from CRM");
      }
    });
  });
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
  autoSaveToggle.checked = appSettings.autoSaveLeads !== false;
  highlightToggle.checked = appSettings.highlightHotPosts !== false;

  const profile = appSettings.userProfile || { name: "Supto Khan", email: "suptokhan24@gmail.com", phone: "+8801620531802" };
  profileNameInput.value = profile.name || "Supto Khan";
  profileEmailInput.value = profile.email || "suptokhan24@gmail.com";
  profilePhoneInput.value = profile.phone || "+8801620531802";

  // 3-CV Google Drive Links
  const cvs = appSettings.cvLinks || {};
  cvAngularInput.value = cvs.angular || "";
  cvFrontendInput.value = cvs.frontend || "";
  cvFullstackInput.value = cvs.fullstack || "";

  // Reply-To and Sender Pool
  replyToInput.value = appSettings.replyToEmail || "suptokhan24@gmail.com";

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
            <span class="sender-quota-pill">${acc.sentToday || 0} / ${acc.dailyQuota || 60} Sent Today</span>
            ${!acc.isFallback ? `<button class="btn-icon btn-icon-danger remove-sender-btn" data-idx="${idx}" title="Remove Sender">${ICONS.trash}</button>` : ""}
          </div>
        </div>
        <div class="app-password-row">
          <div class="app-pwd-input-wrap">
            <span class="app-pwd-icon">${ICONS.key}</span>
            <input type="password" class="app-password-input" data-idx="${idx}" placeholder="Paste 16-character App Password..." value="${acc.appPassword || ""}">
            <button type="button" class="btn-toggle-pwd" data-idx="${idx}" title="Toggle Password Visibility">${ICONS.eye}</button>
          </div>
          <span class="silent-status-indicator ${isReady ? "active" : "pending"}">
            ${isReady ? `${ICONS.checkCircle}<span>Silent Ready</span>` : `${ICONS.alertCircle}<span>Needs App Password</span>`}
          </span>
        </div>
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

function updateOutreachBanner() {
  if (!autoOutreachBanner) return;

  appSettings = resetDailyQuotasIfNeeded(appSettings);
  const stats = getOutreachEngineStats(appSettings);
  const schedule = appSettings.autoOutreachSchedule || {};
  const windowStatus = checkScheduleWindow(schedule);

  const queuedCount = leadsData.filter(l => l.status === "new" && l.emails && l.emails.length > 0).length;
  const contactedTotal = leadsData.filter(l => ["contacted", "applied", "interview", "replied"].includes(l.status)).length;

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
      activeSenderBadge.textContent = "Daily quota reached (200/200)";
    }
  }
}

async function startAutoOutreachBatch() {
  if (isAutoOutreachRunning) {
    isAutoOutreachRunning = false;
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

  const initialNewLeads = leadsData.filter(l => l.status === "new" && l.emails && l.emails.length > 0);
  if (initialNewLeads.length === 0) {
    showToast("No new leads with emails ready for outreach! Scroll LinkedIn to catch more.");
    return;
  }

  const initialSender = getNextAvailableSender(appSettings.senderAccounts || []);
  if (!initialSender) {
    showToast("All sender account quotas reached for today (200/200). Quotas reset at midnight!");
    return;
  }

  isAutoOutreachRunning = true;
  toggleAutoOutreachBtn.classList.remove("btn-primary");
  toggleAutoOutreachBtn.classList.add("btn-danger");
  toggleAutoOutreachBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="16" height="16" x="4" y="4" rx="2"></rect></svg>
    <span>Stop Auto-Outreach</span>
  `;

  let processedCount = 0;

  try {
    while (isAutoOutreachRunning) {
      const newLeadsWithEmail = leadsData.filter(l => l.status === "new" && l.emails && l.emails.length > 0);
      if (newLeadsWithEmail.length === 0) {
        showToast(processedCount > 0 ? `🎉 Auto-Outreach completed! Reached ${processedCount} leads.` : "No new leads ready for outreach.");
        break;
      }

      const nextSender = getNextAvailableSender(appSettings.senderAccounts || []);
      if (!nextSender) {
        showToast("All sender account quotas have been reached for today (200/200). Quotas reset at midnight!");
        break;
      }

      const lead = newLeadsWithEmail[0];
      const draft = generateEmailDraft(lead, appSettings);
      const hasAppPassword = !!(nextSender.appPassword && nextSender.appPassword.trim().length >= 8);

      if (hasAppPassword) {
        const bridgeUrl = (appSettings.autoOutreachSchedule && appSettings.autoOutreachSchedule.smtpBridgeUrl) || "https://mailer.nexidant.com";
        const res = await sendSilentEmailViaBridge({
          senderAccount: nextSender,
          to: draft.to,
          replyTo: appSettings.replyToEmail || "suptokhan24@gmail.com",
          subject: draft.subject,
          body: draft.body,
          bridgeUrl
        });

        if (res.success) {
          await updateLeadStatus(lead.id, "contacted");
          lead.status = "contacted";
          appSettings = await incrementSenderQuota(nextSender.email, appSettings);
          updateStats();
          renderLeads();
          updateOutreachBanner();
          processedCount++;
          showToast(`✅ [${processedCount}] Delivered to ${draft.to} via ${nextSender.email} (${draft.cvLabel}). Next in ~3-5m.`);
        } else {
          const gmailUrl = getGmailComposeUrl(draft.to, draft.subject, draft.body, { replyTo: appSettings.replyToEmail || "suptokhan24@gmail.com" });
          window.open(gmailUrl, "_blank");
          await updateLeadStatus(lead.id, "contacted");
          lead.status = "contacted";
          appSettings = await incrementSenderQuota(nextSender.email, appSettings);
          updateStats();
          renderLeads();
          updateOutreachBanner();
          processedCount++;
          showToast(`⚠️ Bridge offline. Opened compose tab for ${draft.to}. Next in ~3-5m.`);
        }
      } else {
        const gmailUrl = getGmailComposeUrl(draft.to, draft.subject, draft.body, { replyTo: appSettings.replyToEmail || "suptokhan24@gmail.com" });
        window.open(gmailUrl, "_blank");
        await updateLeadStatus(lead.id, "contacted");
        lead.status = "contacted";
        appSettings = await incrementSenderQuota(nextSender.email, appSettings);
        updateStats();
        renderLeads();
        updateOutreachBanner();
        processedCount++;
        showToast(`🚀 Opened Gmail Compose for ${draft.to} via ${nextSender.email}. Next in ~3-5m.`);
      }

      // If more leads remain and user hasn't pressed stop, apply human randomized interval (3 - 5 minutes)
      const remaining = leadsData.filter(l => l.status === "new" && l.emails && l.emails.length > 0);
      if (remaining.length > 0 && isAutoOutreachRunning) {
        const schedule = appSettings.autoOutreachSchedule || {};
        const minSec = Math.max(180, schedule.minIntervalSec || 180); // 3 minutes (180s)
        const maxSec = Math.max(minSec, schedule.maxIntervalSec || 300); // 5 minutes (300s)
        const delaySec = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;

        let secondsLeft = delaySec;
        while (secondsLeft > 0 && isAutoOutreachRunning) {
          const mins = Math.floor(secondsLeft / 60);
          const secs = secondsLeft % 60;
          const timeStr = `${mins}m ${secs < 10 ? "0" : ""}${secs}s`;
          toggleAutoOutreachBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="16" height="16" x="4" y="4" rx="2"></rect></svg>
            <span>Stop Outreach (Next in ${timeStr})</span>
          `;
          await new Promise(r => setTimeout(r, 1000));
          secondsLeft--;
        }

        if (isAutoOutreachRunning) {
          toggleAutoOutreachBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
            <span>Sending Next Email...</span>
          `;
        }
      }
    }
  } finally {
    isAutoOutreachRunning = false;
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
