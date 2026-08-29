/**
 * popup.js
 * Controls the extension popup menu, metrics, and radar status toggle.
 */

import { getStats, getLeads, isRadarActive, setRadarActive } from "../core/storage.js";

document.addEventListener("DOMContentLoaded", async () => {
  const statLeads = document.getElementById("statLeads");
  const statHot = document.getElementById("statHot");
  const statEmails = document.getElementById("statEmails");
  const statScanned = document.getElementById("statScanned");
  const newLeadsCount = document.getElementById("newLeadsCount");
  const recentLeadsList = document.getElementById("recentLeadsList");
  const radarToggle = document.getElementById("radarToggle");
  const radarPulse = document.getElementById("radarPulse");
  const openDashboardBtn = document.getElementById("openDashboardBtn");

  // Load and populate stats
  async function refreshUI() {
    const stats = await getStats();
    const leads = await getLeads();
    const active = await isRadarActive();

    const newCount = leads.filter(l => l.status === "new").length;
    const hotCount = leads.filter(l => l.score >= 80).length;
    const emailCount = leads.reduce((acc, l) => acc + (l.emails ? l.emails.length : 0), 0);

    statLeads.textContent = String(leads.length);
    statHot.textContent = String(hotCount);
    statEmails.textContent = String(emailCount);
    statScanned.textContent = String(stats.scannedCount || 0);
    newLeadsCount.textContent = `${newCount} new`;

    radarToggle.checked = active;
    if (active) {
      radarPulse.classList.remove("paused");
    } else {
      radarPulse.classList.add("paused");
    }

    renderRecentLeads(leads.slice(0, 4));
  }

  function renderRecentLeads(leads) {
    if (!leads || leads.length === 0) {
      recentLeadsList.innerHTML = `
        <div class="empty-state">
          <p>No leads detected yet.</p>
          <small>Scroll your LinkedIn feed to start catching leads automatically!</small>
        </div>
      `;
      return;
    }

    const mailIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`;
    const dmIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path></svg>`;

    recentLeadsList.innerHTML = leads.map(lead => `
      <div class="lead-item" data-id="${lead.id}">
        <div class="lead-item-top">
          <span class="lead-role" title="${lead.detectedRole}">${lead.detectedRole}</span>
          <span class="lead-score">${lead.score}%</span>
        </div>
        <div class="lead-item-bottom">
          <span>${lead.company || lead.authorName}</span>
          ${lead.emails && lead.emails.length > 0 ? `<span class="lead-email-tag">${mailIcon}<span>${lead.emails[0]}</span></span>` : (lead.requiresDm ? `<span class="lead-email-tag">${dmIcon}<span>DM Poster</span></span>` : '')}
        </div>
      </div>
    `).join("");

    // Click to open lead in dashboard
    recentLeadsList.querySelectorAll(".lead-item").forEach(item => {
      item.addEventListener("click", () => {
        openDashboard();
      });
    });
  }

  // Toggle Radar switch
  radarToggle.addEventListener("change", async () => {
    const active = radarToggle.checked;
    await setRadarActive(active);
    if (active) {
      radarPulse.classList.remove("paused");
    } else {
      radarPulse.classList.add("paused");
    }
  });

  // Open Full Dashboard CRM
  function openDashboard() {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    } else {
      window.open("../dashboard/dashboard.html", "_blank");
    }
  }

  openDashboardBtn.addEventListener("click", openDashboard);

  // Initial load
  await refreshUI();
});
