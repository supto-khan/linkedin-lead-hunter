/**
 * dashboard.js
 * Full-featured local CRM and Radar Settings controller for LeadHunter.
 */

import {
  getLeads,
  getSettings,
  saveSettings,
  updateLeadStatus,
  deleteLead,
  clearAllLeads,
  exportLeadsToCsv,
  exportLeadsToJson
} from "../core/storage.js";
import { formatLeadStructuredText, generateEmailDraft, getGmailComposeUrl } from "../core/extractor.js";
import { DEFAULT_SETTINGS } from "../config/defaults.js";
import { ICONS } from "../ui/icons.js";

// Global CRM State
let leadsData = [];
let appSettings = { ...DEFAULT_SETTINGS };
let currentTab = "leadsTab";
let currentStatusFilter = "all";
let currentSearchQuery = "";
let filterHasEmail = false;
let filterHasUrl = false;
let filterHotOnly = false;
let currentSort = "scoreDesc";
let selectedLead = null;
let outreachTargetLead = null;

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

// ── INITIALIZATION ──────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupEventListeners();
  await loadData();
  renderSettings();
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

    const gmailUrl = getGmailComposeUrl(to, subject, body);
    window.open(gmailUrl, "_blank");

    if (outreachTargetLead) {
      await updateLeadStatus(outreachTargetLead.id, "contacted");
      outreachTargetLead.status = "contacted";
      updateStats();
      renderLeads();
    }

    outreachModal.style.display = "none";
    showToast("Opened Gmail with pre-filled pitch! (MailSuite tracking ready)");
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

  saveSettingsBtn.addEventListener("click", async () => {
    appSettings.minScoreThreshold = Number(minScoreSlider.value);
    appSettings.strictRoleMatch = strictRoleToggle.checked;
    appSettings.autoSaveLeads = autoSaveToggle.checked;
    appSettings.highlightHotPosts = highlightToggle.checked;

    appSettings.userProfile = {
      name: profileNameInput.value.trim() || "Supto",
      email: profileEmailInput.value.trim() || "suptokhan24@gmail.com",
      phone: profilePhoneInput.value.trim() || "+8801620531802"
    };

    appSettings.emailTemplate = {
      subject: templateSubjectInput.value.trim() || "Application for {role} Position",
      body: templateBodyInput.value.trim() || `Hi,\n\nI'm making an application for the job of {role}. Please find my CV attached as stated in the job description.\n\nI describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.\n\nYou can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).\n\nRegards,\n{user_name}`
    };

    await saveSettings(appSettings);
    showToast("Settings & Email Pitch Template Saved!");
  });

  resetDefaultsBtn.addEventListener("click", async () => {
    if (confirm("Reset all radar configurations to default?")) {
      appSettings = { ...DEFAULT_SETTINGS };
      await saveSettings(appSettings);
      renderSettings();
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

  totalLeadsStat.textContent = String(total);
  hotLeadsStat.textContent = String(hot);
  emailsStat.textContent = String(emails);
  outreachStat.textContent = String(outreach);

  // Update status counts on pills
  document.getElementById("countAll").textContent = String(total);
  document.getElementById("countNew").textContent = String(leadsData.filter(l => l.status === "new").length);
  document.getElementById("countReviewed").textContent = String(leadsData.filter(l => l.status === "reviewed").length);
  document.getElementById("countContacted").textContent = String(leadsData.filter(l => l.status === "contacted").length);
  document.getElementById("countApplied").textContent = String(leadsData.filter(l => l.status === "applied").length);
  document.getElementById("countReplied").textContent = String(leadsData.filter(l => l.status === "replied").length);
  document.getElementById("countInterview").textContent = String(leadsData.filter(l => l.status === "interview").length);
  document.getElementById("countRejected").textContent = String(leadsData.filter(l => l.status === "rejected").length);
}

// ── LEADS RENDERING & PIPELINE ──────────────────────────────────────

function renderLeads() {
  let list = [...leadsData];

  // Status Filter
  if (currentStatusFilter !== "all") {
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

  return `
    <div class="lead-card ${isHot ? "hot-lead" : ""}" data-id="${lead.id}">
      <div class="lead-card-header">
        <div>
          <h3 class="lead-card-title">${lead.detectedRole}</h3>
          <p class="lead-company-badge">${lead.company || lead.authorHeadline || "LinkedIn Posting"}</p>
        </div>
        <span class="score-badge ${scoreClass}">${scoreIcon}<span>${scoreLabel}</span></span>
      </div>

      <div class="contact-strip">
        ${contactHtml}
      </div>

      ${techHtml ? `<div class="tech-tags">${techHtml}</div>` : ""}

      <div class="lead-snippet">"${(lead.textSnippet || "").slice(0, 160)}..."</div>

      <div class="recruiter-meta">
        <span>By: ${lead.authorProfile ? `<a href="${lead.authorProfile}" target="_blank" class="recruiter-link">${lead.authorName}</a>` : lead.authorName}</span>
        <span>${new Date(lead.detectedAt).toLocaleDateString()}</span>
      </div>

      <div class="lead-card-actions">
        <select class="status-dropdown" data-id="${lead.id}">
          <option value="new" ${lead.status === "new" ? "selected" : ""}>New</option>
          <option value="reviewed" ${lead.status === "reviewed" ? "selected" : ""}>Reviewed</option>
          <option value="contacted" ${lead.status === "contacted" ? "selected" : ""}>Contacted</option>
          <option value="applied" ${lead.status === "applied" ? "selected" : ""}>Applied</option>
          <option value="replied" ${lead.status === "replied" ? "selected" : ""}>Replied</option>
          <option value="interview" ${lead.status === "interview" ? "selected" : ""}>Interview</option>
          <option value="rejected" ${lead.status === "rejected" ? "selected" : ""}>Rejected</option>
        </select>

        <div class="card-btns">
          ${hasEmail ? `
            <button class="btn btn-primary send-outreach-btn" data-id="${lead.id}" title="Send Email (Pre-filled Gmail with MailSuite)">
              ${ICONS.send}
              <span>Send Email</span>
            </button>
          ` : ""}
          ${hasUrl ? `
            <a href="${lead.applicationUrls[0]}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary apply-url-card-btn" title="Open Application Link">
              ${ICONS.externalLink}
              <span>Open Link</span>
            </a>
          ` : ""}
          <button class="btn btn-outline quick-copy-btn" data-id="${lead.id}" title="Copy Structured Lead">
            ${ICONS.copy}
            <span>Copy</span>
          </button>
          <button class="btn btn-outline details-btn" data-id="${lead.id}" title="View Details & Notes">
            ${ICONS.eye}
          </button>
          <button class="btn btn-danger-outline delete-btn" data-id="${lead.id}" title="Delete Lead">
            ${ICONS.trash}
          </button>
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

  const profile = appSettings.userProfile || { name: "Supto", email: "suptokhan24@gmail.com", phone: "+8801620531802" };
  profileNameInput.value = profile.name || "Supto";
  profileEmailInput.value = profile.email || "suptokhan24@gmail.com";
  profilePhoneInput.value = profile.phone || "+8801620531802";

  const template = appSettings.emailTemplate || {
    subject: "Application for {role} Position",
    body: `Hi,\n\nI'm making an application for the job of {role}. Please find my CV attached as stated in the job description.\n\nI describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.\n\nYou can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).\n\nRegards,\n{user_name}`
  };
  templateSubjectInput.value = template.subject || "Application for {role} Position";
  templateBodyInput.value = template.body || "";

  renderSettingsTags();
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
